import hashlib
import io
import math
import re
import time
from datetime import datetime, timezone
from urllib.parse import quote

import httpx
from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import bindparam, select, text
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from .config import get_settings
from .models import AuditLog, Complaint, ComplaintStatus, Notification, Photo, PhotoKind, Role, User

settings = get_settings()
OPEN_STATUSES = [
    ComplaintStatus.submitted,
    ComplaintStatus.acknowledged,
    ComplaintStatus.assigned,
    ComplaintStatus.in_progress,
    ComplaintStatus.reopened,
]
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 25_000_000
MAX_IMAGE_DIMENSION = 4096
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
IMAGE_FORMATS = {"JPEG": ("image/jpeg", "JPEG"), "PNG": ("image/png", "PNG"), "WEBP": ("image/webp", "WEBP")}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def audit(db: Session, actor_id: str | None, action: str, entity_type: str, entity_id: str | None,
          details: dict | None = None, ip: str | None = None) -> None:
    db.add(AuditLog(actor_id=actor_id, action=action, entity_type=entity_type,
                    entity_id=entity_id, details=details, ip_address=ip))


def notify(db: Session, user_id: str, title: str, body: str, complaint_id: str | None = None) -> None:
    db.add(Notification(user_id=user_id, complaint_id=complaint_id, title=title, body=body))


def severity_for(text_value: str) -> tuple[str, float]:
    text_value = text_value.lower()
    critical = ("fire", "electrocution", "collapsed", "gas leak", "life threatening", "flood")
    high = ("danger", "injury", "accident", "blocked road", "sewage", "no water")
    if any(word in text_value for word in critical):
        return "critical", 0.95
    if any(word in text_value for word in high):
        return "high", 0.78
    if any(word in text_value for word in ("minor", "cosmetic", "graffiti")):
        return "low", 0.25
    return "medium", 0.5


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def find_duplicates(db: Session, latitude: float, longitude: float, category_id: str,
                    radius_m: int = 100) -> list[dict]:
    status_values = [status.value for status in OPEN_STATUSES]
    if db.bind and db.bind.dialect.name == "mysql":
        sql = text("""
            SELECT id, title, latitude, longitude, status,
              ST_Distance_Sphere(POINT(longitude, latitude), POINT(:lng, :lat)) AS distance_m
            FROM complaints
            WHERE category_id = :category_id AND status IN :statuses
              AND ST_Distance_Sphere(POINT(longitude, latitude), POINT(:lng, :lat)) <= :radius
            ORDER BY distance_m LIMIT 10
        """).bindparams(bindparam("statuses", expanding=True))
        rows = db.execute(sql, {
            "lng": longitude,
            "lat": latitude,
            "category_id": category_id,
            "radius": radius_m,
            "statuses": status_values,
        }).mappings()
        return [dict(row) for row in rows]

    candidates = db.scalars(select(Complaint).where(
        Complaint.category_id == category_id,
        Complaint.status.in_(OPEN_STATUSES),
    )).all()
    matches = []
    for item in candidates:
        distance = haversine_meters(latitude, longitude, item.latitude, item.longitude)
        if distance <= radius_m:
            matches.append({
                "id": item.id,
                "title": item.title,
                "latitude": item.latitude,
                "longitude": item.longitude,
                "status": item.status.value,
                "distance_m": round(distance, 2),
            })
    return sorted(matches, key=lambda row: row["distance_m"])[:10]


ALLOWED_TRANSITIONS = {
    ComplaintStatus.submitted: {ComplaintStatus.acknowledged, ComplaintStatus.rejected},
    ComplaintStatus.acknowledged: {ComplaintStatus.in_progress, ComplaintStatus.rejected},
    ComplaintStatus.assigned: {ComplaintStatus.in_progress, ComplaintStatus.rejected},
    ComplaintStatus.in_progress: {ComplaintStatus.resolved, ComplaintStatus.rejected},
    ComplaintStatus.resolved: {ComplaintStatus.pending_verification},
    ComplaintStatus.pending_verification: set(),
    ComplaintStatus.reopened: {ComplaintStatus.in_progress, ComplaintStatus.resolved, ComplaintStatus.rejected},
    ComplaintStatus.rejected: {ComplaintStatus.reopened},
    ComplaintStatus.closed: set(),
}


def ensure_transition(old: ComplaintStatus, new: ComplaintStatus) -> None:
    if new not in ALLOWED_TRANSITIONS.get(old, set()):
        raise HTTPException(status_code=409, detail=f"Invalid status transition: {old.value} -> {new.value}")


def ensure_complaint_access(complaint: Complaint, user: User) -> None:
    # Complaint details are community-visible to authenticated users. The response schema
    # exposes no name, email, or phone number for the reporting citizen.
    if complaint.status == ComplaintStatus.rejected and user.role == Role.citizen and complaint.citizen_id != user.id:
        raise HTTPException(status_code=403, detail="Rejected complaints are only visible to their reporter and staff")


def load_photo_for_user(db: Session, photo_id: str, user: User) -> Photo:
    photo = db.get(Photo, photo_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    complaint = db.get(Complaint, photo.complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")
    ensure_complaint_access(complaint, user)
    return photo


def _normalize_image(data: bytes) -> tuple[bytes, str, int, int]:
    try:
        with Image.open(io.BytesIO(data)) as source:
            image_format = source.format
            if image_format not in IMAGE_FORMATS:
                raise HTTPException(status_code=415, detail="Only JPEG, PNG, and WebP images are accepted")
            if source.width * source.height > MAX_IMAGE_PIXELS:
                raise HTTPException(status_code=422, detail="Image exceeds the 25 megapixel safety limit")
            if getattr(source, "n_frames", 1) != 1:
                raise HTTPException(status_code=422, detail="Animated images are not supported")
            source.load()
            image = ImageOps.exif_transpose(source)
            if image.width < 1 or image.height < 1:
                raise HTTPException(status_code=422, detail="Image dimensions are invalid")
            if image.width > MAX_IMAGE_DIMENSION or image.height > MAX_IMAGE_DIMENSION:
                image.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION), Image.Resampling.LANCZOS)
            content_type, output_format = IMAGE_FORMATS[image_format]
            output = io.BytesIO()
            if output_format == "JPEG":
                if image.mode not in {"RGB", "L"}:
                    image = image.convert("RGB")
                image.save(output, format="JPEG", quality=85, optimize=True, progressive=True)
            elif output_format == "WEBP":
                image.save(output, format="WEBP", quality=85, method=6)
            else:
                image.save(output, format="PNG", optimize=True, compress_level=9)
            normalized = output.getvalue()
            if len(normalized) > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="Compressed photo exceeds 10 MB")
            return normalized, content_type, image.width, image.height
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise HTTPException(status_code=422, detail="Invalid or unsafe image content") from exc


async def upload_photo(db: Session, complaint: Complaint, uploader: User,
                       kind: PhotoKind, file: UploadFile) -> Photo:
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Only JPEG, PNG, and WebP images are accepted")
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Photo exceeds 10 MB")
    if not data:
        raise HTTPException(status_code=422, detail="Photo is empty")
    normalized, content_type, width, height = await run_in_threadpool(_normalize_image, data)
    photo = Photo(
        complaint_id=complaint.id,
        uploader_id=uploader.id,
        kind=kind,
        data=normalized,
        content_type=content_type,
        size_bytes=len(normalized),
        width=width,
        height=height,
        sha256=hashlib.sha256(normalized).hexdigest(),
    )
    db.add(photo)
    return photo


_lumen_instance_cache: str | None = None
_lumen_sessions: dict[str, tuple[str, str]] = {}


def _lumen_headers() -> dict[str, str]:
    return {
        "lumen-api-key": settings.lumen_api_key or "",
        "lumen-api-secret": settings.lumen_api_secret or "",
    }


def _lumen_base(product: str) -> str:
    origin = (settings.lumen_api_base or "").rstrip("/")
    return origin if origin.endswith(f"/{product}") else f"{origin}/{product}"


def _lumen_error(response: httpx.Response) -> str:
    try:
        body = response.json()
        error = body.get("error", body)
        code = error.get("code") if isinstance(error, dict) else None
        message = error.get("message") if isinstance(error, dict) else None
        return ": ".join(str(v) for v in (code, message) if v) or f"HTTP {response.status_code}"
    except Exception:
        return f"HTTP {response.status_code}"


async def chatbot_reply(message: str, session_key: str | None = None) -> tuple[str, str]:
    """Send a turn through Lumen Suite, reusing one session per authenticated PKonek user."""
    global _lumen_instance_cache
    configured = all((settings.lumen_api_base, settings.lumen_api_key, settings.lumen_api_secret))
    if not configured:
        return (
            "Please describe what happened, the exact location in Pasig, when you noticed it, "
            "and any immediate safety risk. Choose the closest category and add a clear before photo if safe.",
            "built-in",
        )

    base = _lumen_base("ai_chat")
    headers = _lumen_headers()
    try:
        async with httpx.AsyncClient(timeout=35) as client:
            instance_id = settings.lumen_instance_id or _lumen_instance_cache
            if not instance_id:
                response = await client.get(f"{base}/instances", headers=headers)
                if response.is_error:
                    raise HTTPException(502, f"Lumen instance lookup failed: {_lumen_error(response)}")
                instances = response.json().get("Instances", [])
                available = [item for item in instances if str(item.get("Status", "")).upper() not in {"DISABLED", "INACTIVE"}]
                if not available:
                    raise HTTPException(503, "No active Lumen AI Chat instance is configured for this organization")
                instance_id = str(available[0]["InstanceID"])
                _lumen_instance_cache = instance_id

            encoded_instance = quote(instance_id, safe="")
            existing = _lumen_sessions.get(session_key) if session_key else None
            session_id = existing[1] if existing and existing[0] == instance_id else None
            if not session_id:
                response = await client.post(
                    f"{base}/instances/{encoded_instance}/sessions",
                    headers={**headers, "Content-Type": "application/json"},
                    json={"title": "PKonek conversation"},
                )
                if response.is_error:
                    raise HTTPException(502, f"Lumen session creation failed: {_lumen_error(response)}")
                session_id = str(response.json()["Session"]["id"])
                if session_key:
                    _lumen_sessions[session_key] = (instance_id, session_id)

            assistant_prompt = f"""PKONEK ASSISTANT ROLE
You are PKonek AI, a helpful general-purpose assistant inside a Pasig City civic reporting application.
Answer any lawful user question directly and clearly. Do not reject a question merely because it is not about complaints.
Reply in the language used by the user. If you are uncertain, say what is uncertain instead of inventing facts.

PKONEK APPLICATION FACTS
- Citizens submit a written report, select a category, pin a Pasig location, and may upload photos.
- Nearby duplicate reports can be supported with Me Too.
- Officials acknowledge, accept assignments, post progress updates, and mark completed work resolved.
- A resolved report becomes pending verification. The reporting citizen checks the result and either accepts it, which closes the report, or rejects it, which automatically reopens the report for more work.
- Pending verification reports may auto-close after the configured verification window.
- PKonek does not replace emergency services; advise calling 911 for immediate danger.
- Staff AI evidence review is decision support only and cannot prove that a report or photo is authentic.

USER QUESTION
{message}
"""
            response = await client.post(
                f"{base}/instances/{encoded_instance}/sessions/{quote(session_id, safe='')}/messages",
                headers={**headers, "Content-Type": "application/json"},
                json={"message": assistant_prompt},
            )
            if response.is_error:
                raise HTTPException(502, f"Lumen chat failed: {_lumen_error(response)}")
            answer = response.json().get("Answer", {}).get("answer")
            if not answer:
                raise HTTPException(502, "Lumen chat returned no answer")
            return str(answer), "lumen-suite"
    except HTTPException:
        raise
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        raise HTTPException(502, f"Lumen AI Chat is unreachable: {exc.__class__.__name__}") from exc


_clip_cache = None


def get_clip():
    global _clip_cache
    if not settings.enable_clip:
        raise HTTPException(status_code=503, detail="CLIP is disabled")
    if _clip_cache is None:
        try:
            from transformers import CLIPModel, CLIPProcessor
            _clip_cache = (
                CLIPModel.from_pretrained(settings.clip_model),
                CLIPProcessor.from_pretrained(settings.clip_model),
            )
        except Exception as exc:
            raise HTTPException(status_code=503, detail="CLIP dependencies/model are unavailable") from exc
    return _clip_cache


def clip_classify(image_bytes: bytes, labels: list[str]) -> dict:
    labels = [label.strip() for label in labels if label.strip()]
    if not labels:
        raise HTTPException(status_code=422, detail="At least one category name is required")
    model, processor = get_clip()
    with Image.open(io.BytesIO(image_bytes)) as source:
        image = source.convert("RGB")
        inputs = processor(text=labels, images=image, return_tensors="pt", padding=True)
    outputs = model(**inputs)
    probabilities = outputs.logits_per_image.softmax(dim=1)[0].detach().cpu().tolist()
    ranked = sorted(zip(labels, probabilities), key=lambda pair: pair[1], reverse=True)
    return {"best_category": ranked[0][0], "confidence": ranked[0][1], "scores": dict(ranked)}


def clip_similarity(first: bytes, second: bytes) -> float:
    model, processor = get_clip()
    images = []
    for value in (first, second):
        with Image.open(io.BytesIO(value)) as source:
            images.append(source.convert("RGB"))
    inputs = processor(images=images, return_tensors="pt")
    features = model.get_image_features(**inputs)
    features = features / features.norm(dim=-1, keepdim=True)
    return float((features[0] @ features[1]).detach().cpu())


def _ocr_page_text(page: dict) -> str:
    """Read text from either PascalCase or camelCase Lumen page response fields."""
    for key in ("Lines", "lines"):
        lines = page.get(key)
        if isinstance(lines, list):
            values = []
            for line in lines:
                if isinstance(line, str):
                    values.append(line)
                elif isinstance(line, dict):
                    value = line.get("Text") or line.get("text") or line.get("Content") or line.get("content")
                    if value:
                        values.append(str(value))
            if values:
                return "\n".join(values)
    for key in ("Words", "words"):
        words = page.get(key)
        if isinstance(words, list):
            values = []
            for word in words:
                if isinstance(word, str):
                    values.append(word)
                elif isinstance(word, dict):
                    value = word.get("Text") or word.get("text") or word.get("Content") or word.get("content")
                    if value:
                        values.append(str(value))
            if values:
                return " ".join(values)
    return str(page.get("Text") or page.get("text") or page.get("Content") or page.get("content") or "")


def _lumen_ocr(image_bytes: bytes) -> str:
    """Upload raw bytes, poll the asynchronous read, and combine recognized page text."""
    with Image.open(io.BytesIO(image_bytes)) as source:
        content_type, extension = IMAGE_FORMATS.get(source.format, ("image/jpeg", "JPEG"))
    filename = quote(f"pkonek-photo.{extension.lower()}", safe="")
    base = _lumen_base("ocr")
    headers = {**_lumen_headers(), "Content-Type": content_type, "X-Lumen-Document-Name": filename}

    with httpx.Client(timeout=35) as client:
        response = client.post(f"{base}/documents", headers=headers, content=image_bytes)
        if response.is_error:
            raise HTTPException(502, f"Lumen OCR upload failed: {_lumen_error(response)}")
        document_id = response.json().get("data", {}).get("DocumentID")
        if not document_id:
            raise HTTPException(502, "Lumen OCR returned no DocumentID")
        document_url = f"{base}/documents/{quote(str(document_id), safe='')}"

        deadline = time.monotonic() + 45
        status = "PENDING"
        while time.monotonic() < deadline:
            response = client.get(document_url, headers=_lumen_headers())
            if response.is_error:
                raise HTTPException(502, f"Lumen OCR status failed: {_lumen_error(response)}")
            status = str(response.json().get("data", {}).get("Status", "")).upper()
            if status in {"READY", "PARTIAL", "FAILED"}:
                break
            time.sleep(2)
        if status == "FAILED":
            raise HTTPException(502, "Lumen OCR could not read this image")
        if status not in {"READY", "PARTIAL"}:
            raise HTTPException(504, "Lumen OCR did not finish within 45 seconds")

        response = client.get(f"{document_url}/pages", headers=_lumen_headers(), params={"IncludeWords": "true"})
        if response.is_error:
            raise HTTPException(502, f"Lumen OCR pages failed: {_lumen_error(response)}")
        data = response.json().get("data", {})
        pages = data.get("Items") or data.get("Pages") or data.get("items") or data.get("pages") or []
        if isinstance(pages, dict):
            pages = list(pages.values())
        return "\n\n".join(filter(None, (_ocr_page_text(page) for page in pages if isinstance(page, dict)))).strip()


def ocr_image(image_bytes: bytes) -> tuple[str, str]:
    """Extract text with Lumen Suite OCR, falling back to local Tesseract when enabled."""
    if settings.lumen_api_base and settings.lumen_api_key and settings.lumen_api_secret:
        try:
            return _lumen_ocr(image_bytes), "lumen-suite"
        except HTTPException:
            if not settings.enable_ocr:
                raise

    if not settings.enable_ocr:
        raise HTTPException(status_code=503, detail="Lumen OCR credentials are not configured")
    try:
        import pytesseract
        if settings.tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd
        with Image.open(io.BytesIO(image_bytes)) as image:
            return pytesseract.image_to_string(image).strip(), "tesseract"
    except Exception as exc:
        raise HTTPException(status_code=503, detail="OCR engine is unavailable") from exc


# ----- Staff evidence and hotspot assessment -----
RISK_PROMPTS = {
    "low": "a minor cosmetic maintenance issue with no immediate danger",
    "medium": "a civic maintenance issue that should be repaired",
    "high": "a dangerous public hazard that could cause injury",
    "critical": "an emergency scene with immediate threat to life or major damage",
}
RISK_VALUES = {"low": 0.20, "medium": 0.50, "high": 0.78, "critical": 0.95}
STOP_WORDS = {
    "this", "that", "with", "from", "there", "their", "have", "been", "were", "what",
    "when", "where", "near", "pasig", "city", "barangay", "issue", "report", "photo",
}


def severity_level(score: float) -> str:
    if score >= 0.85:
        return "critical"
    if score >= 0.65:
        return "high"
    if score >= 0.35:
        return "medium"
    return "low"


def clip_image_risk(image_bytes: bytes) -> dict:
    """Estimate visual hazard level with the same pretrained CLIP model used for classification."""
    labels = list(RISK_PROMPTS.values())
    classified = clip_classify(image_bytes, labels)
    scores = classified["scores"]
    weighted = sum(float(scores.get(prompt, 0)) * RISK_VALUES[level] for level, prompt in RISK_PROMPTS.items())
    detected_prompt = classified["best_category"]
    detected_level = next((level for level, prompt in RISK_PROMPTS.items() if prompt == detected_prompt), "medium")
    return {
        "available": True,
        "label": detected_level,
        "score": round(weighted, 4),
        "confidence": round(float(classified["confidence"]), 4),
    }


def report_term_match(report_text: str, extracted_text: str) -> dict:
    """Compare meaningful OCR terms to the written report without treating empty OCR as false evidence."""
    report_terms = {
        word for word in re.findall(r"[a-z0-9]+", report_text.lower())
        if len(word) >= 4 and word not in STOP_WORDS
    }
    extracted_terms = set(re.findall(r"[a-z0-9]+", extracted_text.lower()))
    matched = sorted(report_terms & extracted_terms)
    ratio = len(matched) / len(report_terms) if report_terms else 0.0
    return {"score": round(ratio, 4), "matched_terms": matched[:20]}


def nearby_risk_stats(
    db: Session,
    latitude: float,
    longitude: float,
    exclude_complaint_id: str,
    radius_m: int = 250,
) -> dict:
    """Exact open-report density. MySQL uses ST_Distance_Sphere; SQLite uses Haversine."""
    status_values = [status.value for status in OPEN_STATUSES]
    if db.bind and db.bind.dialect.name == "mysql":
        sql = text("""
            SELECT COUNT(*) AS pins,
                   COALESCE(SUM(me_too_count), 0) AS supporters,
                   COALESCE(MAX(severity_score), 0) AS max_severity
            FROM complaints
            WHERE id <> :exclude_id AND status IN :statuses
              AND ST_Distance_Sphere(
                    POINT(longitude, latitude), POINT(:lng, :lat)
                  ) <= :radius
        """).bindparams(bindparam("statuses", expanding=True))
        row = db.execute(sql, {
            "exclude_id": exclude_complaint_id,
            "statuses": status_values,
            "lng": longitude,
            "lat": latitude,
            "radius": radius_m,
        }).mappings().one()
        return {
            "radius_m": radius_m,
            "pins": int(row["pins"] or 0),
            "supporters": int(row["supporters"] or 0),
            "max_severity": round(float(row["max_severity"] or 0), 4),
        }

    candidates = db.scalars(select(Complaint).where(
        Complaint.id != exclude_complaint_id,
        Complaint.status.in_(OPEN_STATUSES),
    )).all()
    nearby = [item for item in candidates if haversine_meters(
        latitude, longitude, item.latitude, item.longitude
    ) <= radius_m]
    return {
        "radius_m": radius_m,
        "pins": len(nearby),
        "supporters": sum(item.me_too_count for item in nearby),
        "max_severity": round(max((item.severity_score for item in nearby), default=0.0), 4),
    }


def combined_risk(text_score: float, image_score: float | None, hotspot: dict) -> dict:
    """Use the strongest evidence, then add a bounded density escalation; density never dilutes danger."""
    strongest = max(text_score, image_score or 0.0, float(hotspot["max_severity"]) * 0.9)
    density = min(1.0, (hotspot["pins"] / 8) + (hotspot["supporters"] / 40))
    final_score = round(min(1.0, strongest + density * 0.12), 4)
    return {
        "severity": severity_level(final_score),
        "score": final_score,
        "components": {
            "written_report": round(text_score, 4),
            "image": round(image_score, 4) if image_score is not None else None,
            "hotspot_density": round(density, 4),
            "nearby_max": hotspot["max_severity"],
        },
    }
