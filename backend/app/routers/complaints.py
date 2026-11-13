from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user, require_roles
from ..models import (Category, Complaint, ComplaintStatus, ComplaintSupport, ComplaintUpdate,
                      CompletionVerification, Photo, PhotoKind, Role, User)
from ..schemas import (AssignmentIn, ComplaintIn, ComplaintOut, PhotoOut, StatusIn, UpdateIn,
                       VerificationIn)
from ..services import (audit, clip_classify, clip_image_risk, clip_similarity, combined_risk,
                        ensure_complaint_access, ensure_transition, find_duplicates,
                        load_photo_for_user, nearby_risk_stats, notify, ocr_image,
                        report_term_match, severity_for, upload_photo)

router = APIRouter(prefix="/complaints", tags=["Complaints"])
photo_router = APIRouter(prefix="/photos", tags=["Photos"])


def get_complaint_or_404(db: Session, complaint_id: str) -> Complaint:
    complaint = db.get(Complaint, complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return complaint


@router.get("/duplicates")
def detect_duplicates(category_id: str, latitude: float = Query(ge=14.50, le=14.65),
                      longitude: float = Query(ge=121.04, le=121.15),
                      radius_m: int = Query(100, ge=10, le=500),
                      _: User = Depends(current_user), db: Session = Depends(get_db)):
    category = db.get(Category, category_id)
    if not category or not category.is_active:
        raise HTTPException(status_code=422, detail="An active category is required")
    return {"radius_m": radius_m,
            "matches": find_duplicates(db, latitude, longitude, category_id, radius_m)}


@router.post("", response_model=ComplaintOut, status_code=201)
def create_complaint(payload: ComplaintIn, user: User = Depends(require_roles(Role.citizen)),
                     db: Session = Depends(get_db)):
    category = db.get(Category, payload.category_id)
    if not category or not category.is_active:
        raise HTTPException(status_code=422, detail="An active category is required")
    duplicates = find_duplicates(db, payload.latitude, payload.longitude, payload.category_id)
    if duplicates and not payload.allow_possible_duplicate:
        raise HTTPException(status_code=409, detail={
            "message": "Possible duplicate found; use Me Too or confirm creation",
            "matches": duplicates,
        })
    severity, score = severity_for(f"{payload.title} {payload.description}")
    values = payload.model_dump(exclude={"allow_possible_duplicate"})
    complaint = Complaint(
        **values,
        citizen_id=user.id,
        severity=severity,
        severity_score=score,
        duplicate_of_id=duplicates[0]["id"] if duplicates else None,
        sla_deadline=datetime.now(timezone.utc) + timedelta(hours=category.sla_hours),
    )
    db.add(complaint)
    db.flush()
    audit(db, user.id, "complaint.create", "complaint", complaint.id,
          {"possible_duplicate": bool(duplicates)})
    db.commit()
    return complaint


@router.get("", response_model=list[ComplaintOut])
def list_complaints(status: ComplaintStatus | None = None, category_id: str | None = None,
                    assigned_to: str | None = None, severity: str | None = None,
                    mine: bool = False, skip: int = Query(0, ge=0),
                    limit: int = Query(50, ge=1, le=100),
                    user: User = Depends(current_user), db: Session = Depends(get_db)):
    query = select(Complaint)
    if user.role == Role.citizen and mine:
        query = query.where(Complaint.citizen_id == user.id)
    elif user.role == Role.citizen:
        query = query.where(Complaint.status != ComplaintStatus.rejected)
    elif mine:
        query = query.where(Complaint.assigned_to == user.id)
    if status:
        query = query.where(Complaint.status == status)
    if category_id:
        query = query.where(Complaint.category_id == category_id)
    if assigned_to:
        query = query.where(Complaint.assigned_to == assigned_to)
    if severity:
        query = query.where(Complaint.severity == severity)
    return db.scalars(query.order_by(Complaint.created_at.desc()).offset(skip).limit(limit)).all()


@router.get("/{complaint_id}", response_model=ComplaintOut)
def get_complaint(complaint_id: str, user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    complaint = get_complaint_or_404(db, complaint_id)
    ensure_complaint_access(complaint, user)
    return complaint


@router.post("/{complaint_id}/me-too")
def me_too(complaint_id: str, user: User = Depends(require_roles(Role.citizen)),
           db: Session = Depends(get_db)):
    complaint = get_complaint_or_404(db, complaint_id)
    if complaint.citizen_id == user.id:
        raise HTTPException(status_code=409, detail="You cannot support your own complaint")
    if complaint.status not in {
        ComplaintStatus.submitted, ComplaintStatus.acknowledged, ComplaintStatus.assigned,
        ComplaintStatus.in_progress, ComplaintStatus.reopened,
    }:
        raise HTTPException(status_code=409, detail="Complaint is no longer open")
    db.add(ComplaintSupport(complaint_id=complaint.id, user_id=user.id))
    try:
        db.flush()
        db.execute(update(Complaint).where(Complaint.id == complaint.id).values(
            me_too_count=Complaint.me_too_count + 1
        ))
        notify(db, complaint.citizen_id, "New Me Too support",
               "Another citizen supported your complaint.", complaint.id)
        audit(db, user.id, "complaint.me_too", "complaint", complaint.id)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="You already supported this complaint") from exc
    db.refresh(complaint)
    return {"complaint_id": complaint.id, "me_too_count": complaint.me_too_count}


@router.post("/{complaint_id}/assign", response_model=ComplaintOut)
def assign(complaint_id: str, payload: AssignmentIn,
           actor: User = Depends(require_roles(Role.official, Role.admin)),
           db: Session = Depends(get_db)):
    complaint = get_complaint_or_404(db, complaint_id)
    official = db.get(User, payload.official_id)
    if not official or official.role not in {Role.official, Role.admin} or not official.is_active:
        raise HTTPException(status_code=422, detail="Active official not found")
    if complaint.status not in {
        ComplaintStatus.submitted, ComplaintStatus.acknowledged,
        ComplaintStatus.reopened, ComplaintStatus.assigned,
    }:
        raise HTTPException(status_code=409, detail="Complaint cannot be assigned in its current status")
    old = complaint.status
    if complaint.first_response_at is None:
        complaint.first_response_at = datetime.now(timezone.utc)
    complaint.assigned_to = official.id
    complaint.status = ComplaintStatus.assigned
    db.add(ComplaintUpdate(
        complaint_id=complaint.id,
        author_id=actor.id,
        old_status=old.value,
        new_status=complaint.status.value,
        message=f"Assigned to {official.full_name}",
    ))
    notify(db, official.id, "Complaint assigned", complaint.title, complaint.id)
    notify(db, complaint.citizen_id, "Complaint assigned", "An official has been assigned.", complaint.id)
    audit(db, actor.id, "complaint.assign", "complaint", complaint.id,
          {"official_id": official.id})
    db.commit()
    return complaint


@router.post("/{complaint_id}/status", response_model=ComplaintOut)
def change_status(complaint_id: str, payload: StatusIn,
                  actor: User = Depends(require_roles(Role.official, Role.admin)),
                  db: Session = Depends(get_db)):
    complaint = get_complaint_or_404(db, complaint_id)
    if payload.status == ComplaintStatus.assigned:
        raise HTTPException(status_code=422, detail="Use the assignment endpoint to assign a complaint")
    if complaint.status == ComplaintStatus.pending_verification:
        raise HTTPException(status_code=409, detail="Only the reporting citizen may verify completion")
    ensure_transition(complaint.status, payload.status)
    if payload.status in {ComplaintStatus.in_progress, ComplaintStatus.resolved} and not complaint.assigned_to:
        raise HTTPException(status_code=409, detail="Assign an official before progressing the complaint")
    old = complaint.status
    if complaint.first_response_at is None:
        complaint.first_response_at = datetime.now(timezone.utc)
    new = payload.status
    if new == ComplaintStatus.resolved:
        complaint.resolved_at = datetime.now(timezone.utc)
        new = ComplaintStatus.pending_verification
    elif new == ComplaintStatus.reopened:
        complaint.closed_at = None
        complaint.resolved_at = None
    complaint.status = new
    db.add(ComplaintUpdate(
        complaint_id=complaint.id,
        author_id=actor.id,
        old_status=old.value,
        new_status=new.value,
        message=payload.message,
    ))
    notify(db, complaint.citizen_id, f"Complaint {new.value.replace('_', ' ')}",
           payload.message, complaint.id)
    audit(db, actor.id, "complaint.status", "complaint", complaint.id,
          {"from": old.value, "to": new.value})
    db.commit()
    return complaint


@router.post("/{complaint_id}/updates", status_code=201)
def add_update(complaint_id: str, payload: UpdateIn,
               actor: User = Depends(require_roles(Role.official, Role.admin)),
               db: Session = Depends(get_db)):
    complaint = get_complaint_or_404(db, complaint_id)
    if complaint.first_response_at is None:
        complaint.first_response_at = datetime.now(timezone.utc)
    item = ComplaintUpdate(complaint_id=complaint.id, author_id=actor.id,
                           message=payload.message)
    db.add(item)
    notify(db, complaint.citizen_id, "Complaint update", payload.message, complaint.id)
    audit(db, actor.id, "complaint.update", "complaint", complaint.id)
    db.commit()
    return {"id": item.id, "message": item.message, "created_at": item.created_at}


@router.get("/{complaint_id}/updates")
def list_updates(complaint_id: str, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    complaint = get_complaint_or_404(db, complaint_id)
    ensure_complaint_access(complaint, user)
    items = db.scalars(select(ComplaintUpdate).where(
        ComplaintUpdate.complaint_id == complaint_id
    ).order_by(ComplaintUpdate.created_at)).all()
    return [{
        "id": item.id,
        "author_id": item.author_id,
        "old_status": item.old_status,
        "new_status": item.new_status,
        "message": item.message,
        "created_at": item.created_at,
    } for item in items]


@router.post("/{complaint_id}/verify", response_model=ComplaintOut)
def verify_completion(complaint_id: str, payload: VerificationIn,
                      user: User = Depends(require_roles(Role.citizen)),
                      db: Session = Depends(get_db)):
    complaint = get_complaint_or_404(db, complaint_id)
    if complaint.citizen_id != user.id:
        raise HTTPException(status_code=403, detail="Only the reporting citizen may verify completion")
    if complaint.status != ComplaintStatus.pending_verification:
        raise HTTPException(status_code=409, detail="Complaint is not awaiting verification")
    complaint.status = ComplaintStatus.closed if payload.accepted else ComplaintStatus.reopened
    if payload.accepted:
        complaint.closed_at = datetime.now(timezone.utc)
    else:
        complaint.resolved_at = None
        complaint.escalation_level = max(complaint.escalation_level, 1)
    db.add(CompletionVerification(
        complaint_id=complaint.id,
        citizen_id=user.id,
        accepted=payload.accepted,
        comment=payload.comment,
    ))
    db.add(ComplaintUpdate(
        complaint_id=complaint.id,
        author_id=user.id,
        old_status=ComplaintStatus.pending_verification.value,
        new_status=complaint.status.value,
        message=payload.comment or ("Completion accepted" if payload.accepted else "Completion rejected"),
    ))
    if complaint.assigned_to:
        notify(db, complaint.assigned_to, "Citizen verification received",
               complaint.status.value, complaint.id)
    audit(db, user.id, "complaint.verify", "complaint", complaint.id,
          {"accepted": payload.accepted})
    db.commit()
    return complaint


@router.post("/{complaint_id}/photos", response_model=PhotoOut, status_code=201)
async def add_photo(complaint_id: str, kind: PhotoKind, file: UploadFile = File(...),
                    user: User = Depends(current_user), db: Session = Depends(get_db)):
    complaint = get_complaint_or_404(db, complaint_id)
    ensure_complaint_access(complaint, user)
    if kind == PhotoKind.after and user.role == Role.citizen:
        raise HTTPException(status_code=403, detail="Only staff may upload after photos")
    photo = await upload_photo(db, complaint, user, kind, file)
    db.flush()
    audit(db, user.id, "photo.upload", "photo", photo.id, {"kind": kind.value})
    db.commit()
    return photo


@router.get("/{complaint_id}/photos", response_model=list[PhotoOut])
def list_photos(complaint_id: str, user: User = Depends(current_user),
                db: Session = Depends(get_db)):
    complaint = get_complaint_or_404(db, complaint_id)
    ensure_complaint_access(complaint, user)
    return db.scalars(select(Photo).where(
        Photo.complaint_id == complaint_id
    ).order_by(Photo.created_at)).all()


@router.get("/{complaint_id}/photo-similarity")
def photo_similarity(complaint_id: str, before_photo_id: str, after_photo_id: str,
                     user: User = Depends(current_user), db: Session = Depends(get_db)):
    complaint = get_complaint_or_404(db, complaint_id)
    ensure_complaint_access(complaint, user)
    before = db.get(Photo, before_photo_id)
    after = db.get(Photo, after_photo_id)
    if not before or not after or before.complaint_id != complaint_id or after.complaint_id != complaint_id:
        raise HTTPException(status_code=404, detail="Photo not found on complaint")
    if before.kind != PhotoKind.before or after.kind != PhotoKind.after:
        raise HTTPException(status_code=422, detail="Select a before photo and an after photo")
    return {"similarity": clip_similarity(before.data, after.data), "model": "CLIP"}


@photo_router.get("/{photo_id}/content")
def photo_content(photo_id: str, request: Request, user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    photo = load_photo_for_user(db, photo_id, user)
    etag = f'"{photo.sha256}"'
    headers = {
        "Cache-Control": "private, max-age=86400, immutable",
        "ETag": etag,
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": f'inline; filename="{photo.id}"',
    }
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    return Response(content=photo.data, media_type=photo.content_type, headers=headers)


@router.post("/{complaint_id}/evidence-assessment")
def assess_evidence(
    complaint_id: str,
    actor: User = Depends(require_roles(Role.official, Role.admin)),
    db: Session = Depends(get_db),
):
    """Staff-only AI evidence consistency and exact hotspot severity assessment."""
    complaint = get_complaint_or_404(db, complaint_id)
    category = db.get(Category, complaint.category_id)
    photo = db.scalar(select(Photo).where(
        Photo.complaint_id == complaint.id,
        Photo.kind == PhotoKind.before,
    ).order_by(Photo.created_at))
    if not photo:
        raise HTTPException(status_code=422, detail="Upload a before photo before running evidence assessment")

    warnings: list[str] = []
    report_text = f"{complaint.title} {complaint.description}"

    ocr_text = ""
    ocr_engine = None
    try:
        ocr_text, ocr_engine = ocr_image(photo.data)
    except HTTPException as exc:
        warnings.append(f"OCR unavailable: {exc.detail}")
    term_match = report_term_match(report_text, ocr_text)

    expected_category = category.name if category else "Unknown"
    category_labels = list(db.scalars(select(Category.name).where(
        Category.is_active.is_(True),
        Category.name != "Other",
    )).all())
    if expected_category.casefold() == "other":
        first_line = complaint.description.splitlines()[0].removeprefix("Other issue:").strip()
        expected_label = first_line or "other civic issue"
        category_labels.append(expected_label)
    else:
        expected_label = expected_category

    detected_category = None
    category_confidence = None
    category_match = None
    try:
        classification = clip_classify(photo.data, category_labels)
        detected_category = classification["best_category"]
        category_confidence = round(float(classification["confidence"]), 4)
        category_match = detected_category.casefold() == expected_label.casefold()
    except HTTPException as exc:
        warnings.append(f"Image category analysis unavailable: {exc.detail}")

    image_risk = {"available": False, "label": None, "score": None, "confidence": None}
    try:
        image_risk = clip_image_risk(photo.data)
    except HTTPException as exc:
        if not any("CLIP" in warning for warning in warnings):
            warnings.append(f"Image risk analysis unavailable: {exc.detail}")

    hotspot = nearby_risk_stats(
        db, complaint.latitude, complaint.longitude, complaint.id, radius_m=250
    )
    _, text_score = severity_for(report_text)
    combined = combined_risk(text_score, image_risk["score"], hotspot)

    if category_match and (category_confidence or 0) >= 0.35:
        verdict = "consistent"
    elif term_match["score"] >= 0.20:
        verdict = "consistent"
    elif category_match is False and (category_confidence or 0) >= 0.55:
        verdict = "needs_review"
        warnings.append("The strongest visual category differs from the selected report category.")
    else:
        verdict = "inconclusive"
        if not ocr_text:
            warnings.append("No readable text was found; this is normal for many valid civic-issue photos.")

    complaint.severity = combined["severity"]
    complaint.severity_score = combined["score"]
    assessment_summary = {
        "verdict": verdict,
        "severity": combined["severity"],
        "score": combined["score"],
        "report_match": {
            "expected_category": expected_label,
            "detected_category": detected_category,
            "confidence": category_confidence,
            "matches": category_match,
        },
        "image_risk": image_risk,
        "hotspot": hotspot,
        "warnings": warnings,
        "assessed_by": actor.id,
        "assessed_at": datetime.now(timezone.utc).isoformat(),
    }
    photo.ai_metadata = {**(photo.ai_metadata or {}), "evidence_assessment": assessment_summary}
    audit(db, actor.id, "complaint.evidence_assessed", "complaint", complaint.id, {
        "photo_id": photo.id,
        "verdict": verdict,
        "severity": combined["severity"],
        "score": combined["score"],
        "hotspot_pins": hotspot["pins"],
    })
    db.commit()

    return {
        **assessment_summary,
        "complaint_id": complaint.id,
        "photo_id": photo.id,
        "disclaimer": (
            "OCR and image analysis can check consistency and risk, but cannot prove that a report "
            "or photo is authentic. Staff must confirm important findings on site."
        ),
        "ocr": {
            "text": ocr_text,
            "engine": ocr_engine,
            "term_match": term_match["score"],
            "matched_terms": term_match["matched_terms"],
        },
        "components": combined["components"],
    }
