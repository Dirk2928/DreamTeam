from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import client_ip, current_user, require_roles
from ..models import Role, User
from ..schemas import LoginIn, RegisterIn, StaffCreate, TokenOut, UserOut
from ..security import create_access_token, hash_password, verify_password
from ..services import audit

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=TokenOut, status_code=201)
def register(payload: RegisterIn, request: Request, db: Session = Depends(get_db)):
    email = payload.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(email=email, full_name=payload.full_name.strip(), password_hash=hash_password(payload.password), role=Role.citizen)
    try:
        db.add(user)
        db.flush()
        audit(db, user.id, "auth.register", "user", user.id, ip=client_ip(request))
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered") from exc
    return TokenOut(access_token=create_access_token(user.id, user.role.value), user=user)


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, request: Request, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not verify_password(payload.password, user.password_hash) or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    audit(db, user.id, "auth.login", "user", user.id, ip=client_ip(request))
    db.commit()
    return TokenOut(access_token=create_access_token(user.id, user.role.value), user=user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


@router.post("/staff", response_model=UserOut, status_code=201)
def create_staff(payload: StaffCreate, request: Request, admin: User = Depends(require_roles(Role.admin)), db: Session = Depends(get_db)):
    email = payload.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(email=email, full_name=payload.full_name.strip(), password_hash=hash_password(payload.password), role=payload.role)
    try:
        db.add(user)
        db.flush()
        audit(db, admin.id, "staff.create", "user", user.id, {"role": user.role.value}, client_ip(request))
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered") from exc
    return user


@router.get("/staff", response_model=list[UserOut])
def list_staff(_: User = Depends(require_roles(Role.official, Role.admin)), db: Session = Depends(get_db)):
    return db.scalars(select(User).where(User.role.in_([Role.official, Role.admin])).order_by(User.full_name)).all()


@router.patch("/staff/{user_id}/active", response_model=UserOut)
def set_staff_active(user_id: str, active: bool, admin: User = Depends(require_roles(Role.admin)), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user or user.role == Role.citizen:
        raise HTTPException(status_code=404, detail="Staff user not found")
    if user.id == admin.id and not active:
        raise HTTPException(status_code=409, detail="You cannot deactivate yourself")
    user.is_active = active
    audit(db, admin.id, "staff.active_changed", "user", user.id, {"active": active})
    db.commit()
    return user
