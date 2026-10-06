"""School router: schools under a tenant, tenant-scoped reads."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.db.models import Class, School, Tenant, User, UserRole
from app.db.scoping import (
    can_user_read_school,
    log_scope_denial,
    visible_school_ids,
)
from app.db.session import get_db
from app.pagination import PageParams
from app.schemas.school import (
    SchoolCreate,
    SchoolListResponse,
    SchoolOut,
    SchoolUpdate,
)

router = APIRouter()

_ADMIN_ROLES = {UserRole.ADMIN, UserRole.PRINCIPAL}


def _is_tenant_admin(user: User, tenant_id: int) -> bool:
    return user.role in _ADMIN_ROLES and user.tenant_id == tenant_id


@router.post("", status_code=status.HTTP_201_CREATED, response_model=SchoolOut)
def create_school(
    payload: SchoolCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SchoolOut:
    """Create a school under an existing tenant."""
    tenant = db.get(Tenant, payload.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="tenant not found")
    if user.role != UserRole.SUPER_ADMIN and not _is_tenant_admin(user, tenant.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    school = School(
        tenant_id=tenant.id,
        name=payload.name,
        address=payload.address,
        principal_id=payload.principal_id,
    )
    db.add(school)
    db.commit()
    db.refresh(school)
    return SchoolOut.model_validate(school)


@router.get("", response_model=SchoolListResponse)
def list_schools(
    tenant_id: int | None = Query(None),
    page: PageParams = Depends(PageParams),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SchoolListResponse:
    """List schools in the caller's tenant (super_admin may filter any tenant)."""
    # scope: school
    conditions = []
    if user.role != UserRole.SUPER_ADMIN:
        if tenant_id is not None and tenant_id != user.tenant_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
        conditions.append(School.tenant_id == user.tenant_id)
        conditions.append(School.id.in_(visible_school_ids(db, user)))
    elif tenant_id is not None:
        conditions.append(School.tenant_id == tenant_id)

    total = db.scalar(select(func.count()).select_from(School).where(*conditions)) or 0
    rows = db.scalars(
        select(School)
        .where(*conditions)
        .order_by(School.id)
        .offset(page.offset)
        .limit(page.size)
    ).all()
    return SchoolListResponse(
        items=[SchoolOut.model_validate(row) for row in rows],
        total=total,
        page=page.page,
        size=page.size,
    )


@router.get("/{school_id}", response_model=SchoolOut)
def get_school(
    school_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SchoolOut:
    """Read one school; 404 for cross-tenant/cross-school access by non-super_admin."""
    # scope: school
    school = db.get(School, school_id)
    if school is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="school not found")
    if not can_user_read_school(db, user, school_id):
        log_scope_denial(
            db,
            user,
            resource="school",
            resource_id=school_id,
            reason="cross-school read blocked",
        )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="school not found")
    return SchoolOut.model_validate(school)


@router.patch("/{school_id}", response_model=SchoolOut)
def update_school(
    school_id: int,
    payload: SchoolUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SchoolOut:
    """Update a school (principal/admin of that school or super_admin)."""
    school = db.get(School, school_id)
    if school is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="school not found")
    permitted = user.role == UserRole.SUPER_ADMIN or (
        user.role in _ADMIN_ROLES and user.school_id == school.id
    )
    if not permitted:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(school, field, value)
    db.commit()
    db.refresh(school)
    return SchoolOut.model_validate(school)


@router.delete("/{school_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_school(
    school_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Delete a school (super_admin only); blocked while classes remain."""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    school = db.get(School, school_id)
    if school is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="school not found")
    class_count = (
        db.scalar(select(func.count()).select_from(Class).where(Class.school_id == school.id)) or 0
    )
    if class_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="school still has classes",
        )
    db.delete(school)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
