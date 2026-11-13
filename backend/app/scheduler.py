from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import select

from .config import get_settings
from .database import SessionLocal
from .models import Complaint, ComplaintStatus, Role, User
from .services import OPEN_STATUSES, audit, notify

scheduler: BackgroundScheduler | None = None


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def process_sla() -> None:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        verification_items = db.scalars(select(Complaint).where(
            Complaint.status == ComplaintStatus.pending_verification
        )).all()
        for complaint in verification_items:
            if now - _as_utc(complaint.updated_at) < timedelta(hours=settings.auto_close_hours):
                continue
            complaint.status = ComplaintStatus.closed
            complaint.closed_at = now
            notify(db, complaint.citizen_id, "Complaint auto-closed",
                   "The verification window elapsed.", complaint.id)
            audit(db, None, "complaint.auto_closed", "complaint", complaint.id)

        active = db.scalars(select(Complaint).where(Complaint.status.in_(OPEN_STATUSES))).all()
        admins = db.scalars(select(User).where(
            User.role == Role.admin, User.is_active.is_(True)
        )).all()
        for complaint in active:
            remaining = _as_utc(complaint.sla_deadline) - now
            if remaining.total_seconds() < 0 and complaint.escalation_level < 2:
                complaint.escalation_level = 2
                for admin in admins:
                    notify(db, admin.id, "SLA breached", complaint.title, complaint.id)
                notify(db, complaint.citizen_id, "Complaint escalated",
                       "The SLA deadline passed and staff were notified.", complaint.id)
                audit(db, None, "sla.breached", "complaint", complaint.id)
            elif (remaining <= timedelta(hours=settings.sla_warning_hours)
                  and complaint.escalation_level == 0):
                complaint.escalation_level = 1
                for admin in admins:
                    notify(db, admin.id, "SLA deadline approaching", complaint.title, complaint.id)
                audit(db, None, "sla.warning", "complaint", complaint.id)
        db.commit()


def start_scheduler() -> None:
    global scheduler
    if not get_settings().scheduler_enabled:
        return
    if scheduler is None:
        scheduler = BackgroundScheduler(timezone="UTC")
    if not scheduler.running:
        scheduler.add_job(process_sla, "interval", minutes=5, id="sla-monitor",
                          replace_existing=True, max_instances=1, coalesce=True)
        scheduler.start()


def stop_scheduler() -> None:
    global scheduler
    if scheduler is not None and scheduler.running:
        scheduler.shutdown(wait=False)
    scheduler = None
