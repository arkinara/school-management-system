"""Class router: class/roster CRUD scoped to the acting user's school."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.db.models import Class, JenjangType, School, Student, Tenant, User, UserRole
from app.db.scoping import (
    can_user_read_class,
    log_scope_denial,
    visible_school_ids,
)
from app.db.session import get_db
from app.pagination import PageParams
from app.schemas.classes import ClassCreate, ClassListResponse, ClassOut, ClassUpdate

router = APIRouter()

_ADMIN_ROLES = {UserRole.ADMIN, UserRole.PRINCIPAL}


def _can_manage_school(user: User, school: School) -> bool:
    if user.role == UserRole.SUPER_ADMIN:
        return True
    return (
        user.role in _ADMIN_ROLES
        and user.tenant_id == school.tenant_id
        and user.school_id == school.id
    )


def _validate_jurusan(db: Session, school: School, jurusan: str | None) -> None:
    if not jurusan:
        return
    tenant = db.get(Tenant, school.tenant_id)
    if tenant is None or tenant.jenjang_type != JenjangType.SMA:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="jurusan is only valid for SMA tenants",
        )


def _validate_wali_kelas(db: Session, school: School, wali_kelas_id: int | None) -> None:
    if wali_kelas_id is None:
        return
    wali = db.get(User, wali_kelas_id)
    if wali is None or wali.school_id != school.id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="wali_kelas_id must reference a user in the same school",
        )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ClassOut)
def create_class(
    payload: ClassCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClassOut:
    """Create a class in the caller's school (principal/admin) or any (super_admin)."""
    school = db.get(School, payload.school_id)
    if school is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="school not found")
    if not _can_manage_school(user, school):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    _validate_jurusan(db, school, payload.jurusan)
    _validate_wali_kelas(db, school, payload.wali_kelas_id)

    klass = Class(
        school_id=school.id,
        name=payload.name,
        grade_level=payload.grade_level,
        jurusan=payload.jurusan,
        wali_kelas_id=payload.wali_kelas_id,
        academic_year=payload.academic_year,
    )
    db.add(klass)
    db.commit()
    db.refresh(klass)
    return ClassOut.model_validate(klass)


@router.get("", response_model=ClassListResponse)
def list_classes(
    school_id: int | None = Query(None),
    grade_level: int | None = Query(None),
    page: PageParams = Depends(PageParams),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClassListResponse:
    """List classes in the caller's school, optionally filtered by school/grade."""
    # scope: school
    conditions = []
    if user.role != UserRole.SUPER_ADMIN:
        conditions.append(School.tenant_id == user.tenant_id)
        conditions.append(Class.school_id.in_(visible_school_ids(db, user)))
    if school_id is not None:
        conditions.append(Class.school_id == school_id)
    if grade_level is not None:
        conditions.append(Class.grade_level == grade_level)

    total = (
        db.scalar(
            select(func.count())
            .select_from(Class)
            .join(School, Class.school_id == School.id)
            .where(*conditions)
        )
        or 0
    )
    rows = db.scalars(
        select(Class)
        .join(School, Class.school_id == School.id)
        .where(*conditions)
        .order_by(Class.id)
        .offset(page.offset)
        .limit(page.size)
    ).all()
    return ClassListResponse(
        items=[ClassOut.model_validate(row) for row in rows],
        total=total,
        page=page.page,
        size=page.size,
    )


@router.get("/{class_id}", response_model=ClassOut)
def get_class(
    class_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClassOut:
    """Read one class; cross-tenant/cross-school access by non-super_admin is blocked."""
    # scope: school
    klass = db.get(Class, class_id)
    if klass is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="class not found")
    school = db.get(School, klass.school_id)
    if user.role != UserRole.SUPER_ADMIN and (school is None or school.tenant_id != user.tenant_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    if user.role != UserRole.SUPER_ADMIN and not can_user_read_class(db, user, class_id):
        log_scope_denial(
            db,
            user,
            resource="class",
            resource_id=class_id,
            reason="cross-school read blocked",
        )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="class not found")
    return ClassOut.model_validate(klass)


@router.patch("/{class_id}", response_model=ClassOut)
def update_class(
    class_id: int,
    payload: ClassUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClassOut:
    """Update a class (principal/admin of that school or super_admin)."""
    klass = db.get(Class, class_id)
    if klass is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="class not found")
    school = db.get(School, klass.school_id)
    if school is None or not _can_manage_school(user, school):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    data = payload.model_dump(exclude_unset=True)
    if "jurusan" in data:
        _validate_jurusan(db, school, data["jurusan"])
    if "wali_kelas_id" in data:
        _validate_wali_kelas(db, school, data["wali_kelas_id"])

    for field, value in data.items():
        setattr(klass, field, value)
    db.commit()
    db.refresh(klass)
    return ClassOut.model_validate(klass)


@router.delete("/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_class(
    class_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Delete a class; blocked while students are enrolled."""
    klass = db.get(Class, class_id)
    if klass is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="class not found")
    school = db.get(School, klass.school_id)
    if school is None or not _can_manage_school(user, school):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    enrolled = (
        db.scalar(
            select(func.count()).select_from(Student).where(Student.class_id == klass.id)
        )
        or 0
    )
    if enrolled > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="class still has enrolled students",
        )
    db.delete(klass)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
