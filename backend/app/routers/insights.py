from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user, require_roles
from ..models import AuditLog, Category, ChatMessage, Complaint, ComplaintStatus, Role, User
from ..schemas import AnalyzeImageIn, ChatIn, ChatOut, OCRIn
from ..services import (audit, chatbot_reply, clip_classify, load_photo_for_user, ocr_image,
                        severity_for)

router = APIRouter(tags=["Insights and public data"])


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


@router.post("/assistant/chat", response_model=ChatOut)
async def chat(payload: ChatIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    response, source = await chatbot_reply(payload.message, session_key=user.id)
    db.add(ChatMessage(user_id=user.id, prompt=payload.message, response=response))
    audit(db, user.id, "assistant.chat", "complaint" if payload.complaint_id else "assistant",
          payload.complaint_id)
    db.commit()
    return ChatOut(response=response, source=source)


@router.post("/ai/ocr")
def ocr(payload: OCRIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    photo = load_photo_for_user(db, payload.photo_id, user)
    result, engine = ocr_image(photo.data)
    audit(db, user.id, "ai.ocr", "photo", photo.id)
    db.commit()
    return {"photo_id": photo.id, "text": result, "engine": engine}


@router.post("/ai/classify-image")
def classify_image(payload: AnalyzeImageIn, user: User = Depends(current_user),
                   db: Session = Depends(get_db)):
    photo = load_photo_for_user(db, payload.photo_id, user)
    labels = payload.category_names or list(db.scalars(
        select(Category.name).where(Category.is_active.is_(True))
    ).all())
    result = clip_classify(photo.data, labels)
    audit(db, user.id, "ai.clip_classify", "photo", photo.id)
    db.commit()
    return {"photo_id": photo.id, **result}


@router.post("/ai/severity")
def analyze_severity(payload: ChatIn, _: User = Depends(current_user)):
    severity, score = severity_for(payload.message)
    return {"severity": severity, "score": score, "method": "rules"}


@router.get("/public/markers")
def public_markers(status: ComplaintStatus | None = None, category_id: str | None = None,
                   limit: int = Query(500, ge=1, le=1000), db: Session = Depends(get_db)):
    query = select(Complaint).where(Complaint.status != ComplaintStatus.rejected)
    if status:
        query = query.where(Complaint.status == status)
    if category_id:
        query = query.where(Complaint.category_id == category_id)
    rows = db.scalars(query.order_by(Complaint.created_at.desc()).limit(limit)).all()
    return [{
        "id": item.id,
        "category_id": item.category_id,
        "title": item.title,
        "latitude": item.latitude,
        "longitude": item.longitude,
        "status": item.status.value,
        "severity": item.severity,
        "me_too_count": item.me_too_count,
        "created_at": item.created_at,
    } for item in rows]


@router.get("/public/hotspots")
def public_hotspots(category_id: str | None = None, db: Session = Depends(get_db)):
    lat_bucket = func.round(Complaint.latitude, 3)
    lng_bucket = func.round(Complaint.longitude, 3)
    query = select(
        lat_bucket.label("latitude"),
        lng_bucket.label("longitude"),
        func.count(Complaint.id).label("complaints"),
        func.sum(Complaint.me_too_count).label("supporters"),
        func.max(Complaint.severity_score).label("max_severity"),
    ).where(Complaint.status.notin_([ComplaintStatus.closed, ComplaintStatus.rejected]))
    if category_id:
        query = query.where(Complaint.category_id == category_id)
    rows = db.execute(query.group_by(lat_bucket, lng_bucket).order_by(
        func.count(Complaint.id).desc()
    ).limit(100)).mappings()
    return [dict(row) for row in rows]


@router.get("/public/reports")
def public_reports(db: Session = Depends(get_db)):
    total = db.scalar(select(func.count(Complaint.id))) or 0
    closed = db.scalar(select(func.count(Complaint.id)).where(
        Complaint.status == ComplaintStatus.closed
    )) or 0
    status_rows = db.execute(select(Complaint.status, func.count(Complaint.id)).group_by(
        Complaint.status
    )).all()
    category_rows = db.execute(select(Category.name, func.count(Complaint.id)).outerjoin(
        Complaint, Complaint.category_id == Category.id
    ).group_by(Category.id, Category.name)).all()
    response_rows = db.execute(select(Complaint.created_at, Complaint.first_response_at).where(
        Complaint.first_response_at.is_not(None)
    )).all()
    resolution_rows = db.execute(select(Complaint.created_at, Complaint.resolved_at).where(
        Complaint.resolved_at.is_not(None)
    )).all()
    response_hours = [(_as_utc(end) - _as_utc(start)).total_seconds() / 3600 for start, end in response_rows]
    resolution_hours = [(_as_utc(end) - _as_utc(start)).total_seconds() / 3600 for start, end in resolution_rows]
    return {
        "total_complaints": total,
        "closed_complaints": closed,
        "resolution_rate": round(closed / total * 100, 2) if total else 0,
        "average_first_response_hours": round(sum(response_hours) / len(response_hours), 2) if response_hours else None,
        "average_resolution_hours": round(sum(resolution_hours) / len(resolution_hours), 2) if resolution_hours else None,
        "by_status": {status.value: count for status, count in status_rows},
        "by_category": [{"category": name, "count": count} for name, count in category_rows],
        "generated_at": datetime.now(timezone.utc),
    }


@router.get("/dashboard")
def dashboard(_: User = Depends(require_roles(Role.official, Role.admin)),
              db: Session = Depends(get_db)):
    total = db.scalar(select(func.count(Complaint.id))) or 0
    active = db.scalar(select(func.count(Complaint.id)).where(
        Complaint.status.notin_([ComplaintStatus.closed, ComplaintStatus.rejected])
    )) or 0
    closed = db.scalar(select(func.count(Complaint.id)).where(
        Complaint.status == ComplaintStatus.closed
    )) or 0
    breached = db.scalar(select(func.count(Complaint.id)).where(
        Complaint.sla_deadline < datetime.now(timezone.utc),
        Complaint.status.notin_([ComplaintStatus.closed, ComplaintStatus.rejected]),
    )) or 0
    status_rows = db.execute(select(Complaint.status, func.count(Complaint.id)).group_by(
        Complaint.status
    )).all()
    category_rows = db.execute(select(Category.name, func.count(Complaint.id)).outerjoin(
        Complaint, Complaint.category_id == Category.id
    ).group_by(Category.id, Category.name)).all()
    resolved_rows = db.execute(select(Complaint.created_at, Complaint.resolved_at).where(
        Complaint.resolved_at.is_not(None)
    )).all()
    hours = [(_as_utc(resolved) - _as_utc(created)).total_seconds() / 3600
             for created, resolved in resolved_rows]
    response_rows = db.execute(select(Complaint.created_at, Complaint.first_response_at).where(
        Complaint.first_response_at.is_not(None)
    )).all()
    response_hours = [(_as_utc(responded) - _as_utc(created)).total_seconds() / 3600
                      for created, responded in response_rows]
    return {
        "totals": {"all": total, "active": active, "closed": closed},
        "by_status": {status.value: count for status, count in status_rows},
        "by_category": [{"category": name, "count": count} for name, count in category_rows],
        "average_resolution_hours": round(sum(hours) / len(hours), 2) if hours else None,
        "average_first_response_hours": round(sum(response_hours) / len(response_hours), 2) if response_hours else None,
        "sla_breached": breached,
    }


@router.get("/admin/audit-logs")
def audit_logs(action: str | None = None, actor_id: str | None = None,
               entity_type: str | None = None, skip: int = Query(0, ge=0),
               limit: int = Query(100, ge=1, le=200),
               _: User = Depends(require_roles(Role.admin)), db: Session = Depends(get_db)):
    query = select(AuditLog)
    if action:
        query = query.where(AuditLog.action == action)
    if actor_id:
        query = query.where(AuditLog.actor_id == actor_id)
    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)
    rows = db.scalars(query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit)).all()
    return [{
        "id": row.id,
        "actor_id": row.actor_id,
        "action": row.action,
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "details": row.details,
        "ip_address": row.ip_address,
        "created_at": row.created_at,
    } for row in rows]
