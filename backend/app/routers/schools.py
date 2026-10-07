"""School router: schools under a tenant, tenant-scoped reads."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.audit import log_audit_event
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
public_router = APIRouter()


@public_router.get("/api/public/schools")
def list_public_schools(
    tenant_id: int = Query(...),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Public, unauthenticated — schools within a tenant, for the school picker.

    Returns only ``id`` + ``name`` + ``tenant_id``; callers must supply a tenant.
    """
    # scope: public
    return [
        {"id": s.id, "name": s.name, "tenant_id": s.tenant_id}
        for s in db.scalars(
            select(School).where(School.tenant_id == tenant_id).order_by(School.name)
        ).all()
    ]


@router.post("", status_code=status.HTTP_201_CREATED, response_model=SchoolOut)
def create_school(
    payload: SchoolCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SchoolOut:
    """Create a school under an existing tenant (super_admin only)."""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="super_admin only")
    tenant = db.get(Tenant, payload.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="tenant not found")

    kurikulum = payload.kurikulum_version or tenant.kurikulum_version
    school = School(
        tenant_id=tenant.id,
        name=payload.name,
        address=payload.address,
        principal_id=payload.principal_id,
        kurikulum_version=kurikulum,
    )
    db.add(school)
    db.flush()
    log_audit_event(
        db,
        actor=user,
        action="create_school",
        entity_type="school",
        entity_id=school.id,
        after={"name": school.name, "tenant_id": school.tenant_id},
    )
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
    """Update a school (super_admin only)."""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="super_admin only")
    school = db.get(School, school_id)
    if school is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="school not found")
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
