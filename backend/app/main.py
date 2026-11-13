from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select

from .config import get_settings
from .database import Base, SessionLocal, engine
from .models import Category, Role, User
from .routers import auth, categories, complaints, insights, notifications
from .scheduler import start_scheduler, stop_scheduler
from .security import hash_password
from .services import audit

settings = get_settings()


def initialize_database() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        if not db.scalar(select(Category.id).limit(1)):
            db.add_all([
                Category(name="Roads and Traffic", description="Road damage, signs, obstructions, and traffic devices", sla_hours=72),
                Category(name="Waste and Sanitation", description="Garbage collection, dumping, and sanitation", sla_hours=48),
                Category(name="Drainage and Flooding", description="Blocked drainage and flooding", sla_hours=24),
                Category(name="Streetlights and Electrical", description="Public lighting and exposed electrical hazards", sla_hours=48),
                Category(name="Parks and Public Spaces", description="Public facility and park maintenance", sla_hours=120),
            ])
        if not db.scalar(select(Category.id).where(func.lower(Category.name) == "other")):
            db.add(Category(
                name="Other",
                description="Issues that do not match the listed service categories",
                sla_hours=72,
            ))
        if settings.bootstrap_admin_email and settings.bootstrap_admin_password:
            email = settings.bootstrap_admin_email.lower()
            if not db.scalar(select(User).where(User.email == email)):
                admin = User(email=email, full_name="PKonek Administrator", password_hash=hash_password(settings.bootstrap_admin_password), role=Role.admin)
                db.add(admin)
                db.flush()
                audit(db, admin.id, "staff.bootstrap_admin", "user", admin.id)
        db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title=settings.app_name, version="1.0.0", description="PKonek Pasig civic complaint management API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

for api_router in (auth.router, categories.router, complaints.router, complaints.photo_router,
                   notifications.router, insights.router):
    app.include_router(api_router, prefix=settings.api_prefix)


@app.get("/health", include_in_schema=False)
@app.get(f"{settings.api_prefix}/health", tags=["System"])
def health():
    return {"status": "ok", "service": "pkonek-api", "version": "1.0.0"}
