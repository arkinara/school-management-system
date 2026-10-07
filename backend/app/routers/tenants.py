"""Tenant router: top of the tenant hierarchy (super_admin only writes)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.db.models import School, Tenant, User, UserRole
from app.db.session import get_db
from app.schemas.tenant import TenantCreate, TenantOut, TenantUpdate

router = APIRouter()
public_router = APIRouter()

_READ_ROLES = {UserRole.ADMIN, UserRole.PRINCIPAL}


def _require_super_admin(user: User) -> None:
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="forbidden"
        )


def _school_count(db: Session, tenant_id: int) -> int:
    return (
        db.scalar(
            select(func.count()).select_from(School).where(School.tenant_id == tenant_id)
        )
        or 0
    )


def _to_out(db: Session, tenant: Tenant) -> TenantOut:
    out = TenantOut.model_validate(tenant)
    out.school_count = _school_count(db, tenant.id)
    return out


@public_router.get("/api/public/tenants")
def list_public_tenants(db: Session = Depends(get_db)) -> list[dict]:
    """Public, unauthenticated — used by the sign-in/sign-up tenant picker.

    Returns only ``id`` + ``name`` + ``jenjang_type`` (no config, no counts) so
    unauthenticated clients learn nothing beyond the picker labels.
    """
    # scope: public
    return [
        {"id": t.id, "name": t.name, "jenjang_type": t.jenjang_type}
        for t in db.scalars(
            select(Tenant).order_by(Tenant.jenjang_type, Tenant.name)
        ).all()
    ]


@router.post("", status_code=status.HTTP_201_CREATED, response_model=TenantOut)
def create_tenant(
    payload: TenantCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TenantOut:
    """Create a jenjang tenant; duplicate (name, jenjang_type) returns 409."""
    _require_super_admin(user)
    duplicate = db.scalar(
        select(Tenant).where(
            Tenant.name == payload.name,
            Tenant.jenjang_type == payload.jenjang_type,
        )
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="tenant name already exists for this jenjang_type",
        )
    tenant = Tenant(
        name=payload.name,
        jenjang_type=payload.jenjang_type,
        kurikulum_version=payload.kurikulum_version,
        config=payload.config,
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return _to_out(db, tenant)


@router.get("", response_model=list[TenantOut])
def list_tenants(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[TenantOut]:
    """List every tenant across the system (super_admin only)."""
    # scope: tenant
    _require_super_admin(user)
    tenants = db.scalars(select(Tenant).order_by(Tenant.id)).all()
    return [_to_out(db, tenant) for tenant in tenants]


@router.get("/{tenant_id}", response_model=TenantOut)
def get_tenant(
    tenant_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TenantOut:
    """Read one tenant: super_admin, or an admin/principal of that tenant."""
    # scope: tenant
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="tenant not found")
    if user.role != UserRole.SUPER_ADMIN:
        if user.role not in _READ_ROLES or user.tenant_id != tenant.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    return _to_out(db, tenant)


@router.patch("/{tenant_id}", response_model=TenantOut)
def update_tenant(
    tenant_id: int,
    payload: TenantUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TenantOut:
    """Update a tenant (super_admin only)."""
    _require_super_admin(user)
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="tenant not found")

    data = payload.model_dump(exclude_unset=True)
    new_name = data.get("name", tenant.name)
    new_jenjang = data.get("jenjang_type", tenant.jenjang_type)
    if new_name != tenant.name or new_jenjang != tenant.jenjang_type:
        duplicate = db.scalar(
            select(Tenant).where(
                Tenant.name == new_name,
                Tenant.jenjang_type == new_jenjang,
                Tenant.id != tenant.id,
            )
        )
        if duplicate is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="tenant name already exists for this jenjang_type",
            )

    for field, value in data.items():
        setattr(tenant, field, value)
    db.commit()
    db.refresh(tenant)
    return _to_out(db, tenant)


@router.delete("/{tenant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tenant(
    tenant_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Delete a tenant (super_admin only); blocked while schools remain."""
    _require_super_admin(user)
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="tenant not found")
    if _school_count(db, tenant.id) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="tenant still has schools",
        )
    db.delete(tenant)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
