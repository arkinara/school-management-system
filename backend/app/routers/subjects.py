"""Subject router: jenjang-scoped subject/aspek CRUD per tenant."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.db.models import Grade, Subject, Tenant, User, UserRole
from app.db.session import get_db
from app.pagination import PageParams
from app.schemas.subject import (
    SubjectCreate,
    SubjectListResponse,
    SubjectOut,
    SubjectUpdate,
)

router = APIRouter()

_ADMIN_ROLES = {UserRole.ADMIN, UserRole.PRINCIPAL}


def _can_manage_tenant(user: User, tenant_id: int) -> bool:
    if user.role == UserRole.SUPER_ADMIN:
        return True
    return user.role in _ADMIN_ROLES and user.tenant_id == tenant_id


@router.post("", status_code=status.HTTP_201_CREATED, response_model=SubjectOut)
def create_subject(
    payload: SubjectCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SubjectOut:
    """Create a subject/aspek under a tenant."""
    tenant = db.get(Tenant, payload.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="tenant not found")
    if not _can_manage_tenant(user, tenant.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    subject = Subject(
        tenant_id=tenant.id,
        name=payload.name,
        category=payload.category,
        applicable_grade_levels=payload.applicable_grade_levels,
    )
    db.add(subject)
    db.commit()
    db.refresh(subject)
    return SubjectOut.model_validate(subject)


@router.get("", response_model=SubjectListResponse)
def list_subjects(
    grade_level: int | None = Query(None),
    category: str | None = Query(None),
    page: PageParams = Depends(PageParams),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SubjectListResponse:
    """List subjects in the caller's tenant, optionally filtered by grade/category."""
    conditions = []
    if user.role != UserRole.SUPER_ADMIN:
        conditions.append(Subject.tenant_id == user.tenant_id)
    if category is not None:
        conditions.append(Subject.category == category)

    rows = list(
        db.scalars(select(Subject).where(*conditions).order_by(Subject.id)).all()
    )
    if grade_level is not None:
        rows = [
            row
            for row in rows
            if row.applicable_grade_levels and grade_level in row.applicable_grade_levels
        ]

    total = len(rows)
    start = page.offset
    window = rows[start : start + page.size]
    return SubjectListResponse(
        items=[SubjectOut.model_validate(row) for row in window],
        total=total,
        page=page.page,
        size=page.size,
    )


@router.get("/{subject_id}", response_model=SubjectOut)
def get_subject(
    subject_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SubjectOut:
    """Read one subject; cross-tenant access by non-super_admin is 403."""
    subject = db.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="subject not found")
    if user.role != UserRole.SUPER_ADMIN and subject.tenant_id != user.tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    return SubjectOut.model_validate(subject)


@router.patch("/{subject_id}", response_model=SubjectOut)
def update_subject(
    subject_id: int,
    payload: SubjectUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SubjectOut:
    """Update a subject (principal/admin of its tenant or super_admin)."""
    subject = db.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="subject not found")
    if not _can_manage_tenant(user, subject.tenant_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(subject, field, value)
    db.commit()
    db.refresh(subject)
    return SubjectOut.model_validate(subject)


@router.delete("/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subject(
    subject_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Delete a subject; blocked while grades still reference it."""
    subject = db.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="subject not found")
    if not _can_manage_tenant(user, subject.tenant_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    graded = (
        db.scalar(
            select(func.count()).select_from(Grade).where(Grade.subject_id == subject.id)
        )
        or 0
    )
    if graded > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="subject still referenced by grades",
        )
    db.delete(subject)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
