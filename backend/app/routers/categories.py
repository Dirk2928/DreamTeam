from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user, require_roles
from ..models import Category, Role, User
from ..schemas import CategoryIn, CategoryOut
from ..services import audit

router = APIRouter(prefix="/categories", tags=["Categories"])


@router.get("", response_model=list[CategoryOut])
def list_categories(include_inactive: bool = False, db: Session = Depends(get_db)):
    query = select(Category).order_by(Category.name)
    if not include_inactive:
        query = query.where(Category.is_active.is_(True))
    return db.scalars(query).all()


@router.post("", response_model=CategoryOut, status_code=201)
def create_category(payload: CategoryIn, admin: User = Depends(require_roles(Role.admin)), db: Session = Depends(get_db)):
    name = payload.name.strip()
    if db.scalar(select(Category).where(Category.name == name)):
        raise HTTPException(status_code=409, detail="Category name already exists")
    values = payload.model_dump()
    values["name"] = name
    category = Category(**values)
    try:
        db.add(category)
        db.flush()
        audit(db, admin.id, "category.create", "category", category.id)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Category name already exists") from exc
    return category


@router.put("/{category_id}", response_model=CategoryOut)
def update_category(category_id: str, payload: CategoryIn, admin: User = Depends(require_roles(Role.admin)), db: Session = Depends(get_db)):
    category = db.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    name = payload.name.strip()
    duplicate = db.scalar(select(Category).where(Category.name == name, Category.id != category_id))
    if duplicate:
        raise HTTPException(status_code=409, detail="Category name already exists")
    values = payload.model_dump()
    values["name"] = name
    for key, value in values.items():
        setattr(category, key, value)
    audit(db, admin.id, "category.update", "category", category.id)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Category name already exists") from exc
    return category


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: str, admin: User = Depends(require_roles(Role.admin)), db: Session = Depends(get_db)):
    category = db.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    category.is_active = False
    audit(db, admin.id, "category.deactivate", "category", category.id)
    db.commit()
