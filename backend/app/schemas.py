from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from .models import ComplaintStatus, PhotoKind, Role


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RegisterIn(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=160)
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class StaffCreate(RegisterIn):
    role: Literal[Role.official, Role.admin] = Role.official


class UserOut(ORMModel):
    id: str
    email: EmailStr
    full_name: str
    role: Role
    is_active: bool
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class CategoryIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str | None = None
    sla_hours: int = Field(default=72, ge=1, le=8760)
    is_active: bool = True


class CategoryOut(ORMModel):
    id: str
    name: str
    description: str | None
    sla_hours: int
    is_active: bool
    created_at: datetime


class ComplaintIn(BaseModel):
    category_id: str
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=5, max_length=5000)
    latitude: float
    longitude: float
    address: str | None = Field(default=None, max_length=500)
    allow_possible_duplicate: bool = False

    @field_validator("latitude")
    @classmethod
    def pasig_latitude(cls, value: float) -> float:
        if not 14.50 <= value <= 14.65:
            raise ValueError("Map pin must be within Pasig City bounds")
        return value

    @field_validator("longitude")
    @classmethod
    def pasig_longitude(cls, value: float) -> float:
        if not 121.04 <= value <= 121.15:
            raise ValueError("Map pin must be within Pasig City bounds")
        return value


class ComplaintOut(ORMModel):
    id: str
    citizen_id: str
    category_id: str
    assigned_to: str | None
    duplicate_of_id: str | None
    title: str
    description: str
    latitude: float
    longitude: float
    address: str | None
    status: ComplaintStatus
    severity: str
    severity_score: float
    me_too_count: int
    escalation_level: int
    sla_deadline: datetime
    first_response_at: datetime | None
    resolved_at: datetime | None
    closed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AssignmentIn(BaseModel):
    official_id: str


class StatusIn(BaseModel):
    status: ComplaintStatus
    message: str = Field(min_length=2, max_length=2000)


class UpdateIn(BaseModel):
    message: str = Field(min_length=2, max_length=2000)


class VerificationIn(BaseModel):
    accepted: bool
    comment: str | None = Field(default=None, max_length=2000)


class NotificationOut(ORMModel):
    id: str
    user_id: str
    complaint_id: str | None
    title: str
    body: str
    is_read: bool
    created_at: datetime


class PhotoOut(ORMModel):
    id: str
    complaint_id: str
    uploader_id: str
    kind: PhotoKind
    url: str
    content_url: str
    content_type: str
    size_bytes: int
    width: int | None
    height: int | None
    sha256: str
    ai_metadata: dict | None
    created_at: datetime


class ChatIn(BaseModel):
    message: str = Field(min_length=2, max_length=4000)
    complaint_id: str | None = None


class ChatOut(BaseModel):
    response: str
    source: str


class OCRIn(BaseModel):
    photo_id: str


class AnalyzeImageIn(BaseModel):
    photo_id: str
    category_names: list[str] = Field(default_factory=list, max_length=50)


class DashboardOut(BaseModel):
    totals: dict[str, int]
    by_status: dict[str, int]
    by_category: list[dict[str, Any]]
    average_resolution_hours: float | None
    average_first_response_hours: float | None
    sla_breached: int
