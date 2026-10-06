"""User router: tenant-scoped user reads and role-aware updates."""

from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.audit import log_audit_event
from app.auth.deps import get_current_user
from app.db.models import School, User, UserRole
from app.db.session import get_db
from app.pagination import PageParams
from app.schemas.user import UserListResponse, UserOut, UserUpdate

router = APIRouter()

_ADMIN_ROLES = {UserRole.ADMIN, UserRole.PRINCIPAL}
_SELF_FIELDS = {"full_name"}
_ADMIN_FIELDS = {"full_name", "email", "role", "school_id"}

# Hierarchy: super_admin > principal > admin > teacher > parent > student.
# An actor can only assign roles at or below their own rank.
ROLE_HIERARCHY = {
    UserRole.SUPER_ADMIN: 6,
    UserRole.PRINCIPAL: 5,
    UserRole.ADMIN: 4,
    UserRole.TEACHER: 3,
    UserRole.PARENT: 2,
    UserRole.STUDENT: 1,
}

# Roles an admin/principal can assign (never super_admin, never principal).
ADMIN_ASSIGNABLE_ROLES = {
    UserRole.TEACHER,
    UserRole.STUDENT,
    UserRole.PARENT,
    UserRole.ADMIN,
}


def _super_admin_creation_allowed(request: Request) -> bool:
    """super_admin creation is gated by env flag or an explicit confirm header."""
    env_flag = os.getenv("ALLOW_SUPER_ADMIN_CREATION", "false").strip().lower() == "true"
    header_ok = request.headers.get("x-confirm-super-admin", "").strip().lower() == "true"
    return env_flag or header_ok



def _same_school_admin(user: User, target: User) -> bool:
    return (
        user.role in _ADMIN_ROLES
        and user.school_id is not None
        and target.school_id == user.school_id
        and target.tenant_id == user.tenant_id
    )


@router.get("", response_model=UserListResponse)
def list_users(
    role: str | None = Query(None),
    school_id: int | None = Query(None),
    page: PageParams = Depends(PageParams),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserListResponse:
    """List users in the caller's tenant (super_admin sees every tenant)."""
    # scope: school
    conditions = []
    if user.role != UserRole.SUPER_ADMIN:
        conditions.append(User.tenant_id == user.tenant_id)
    if school_id is not None:
        conditions.append(User.school_id == school_id)
    if role is not None:
        try:
            role_enum = UserRole(role)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="invalid role filter",
            ) from exc
        conditions.append(User.role == role_enum)

    total = db.scalar(select(func.count()).select_from(User).where(*conditions)) or 0
    rows = db.scalars(
        select(User)
        .where(*conditions)
        .order_by(User.id)
        .offset(page.offset)
        .limit(page.size)
    ).all()
    return UserListResponse(
        items=[UserOut.model_validate(row) for row in rows],
        total=total,
        page=page.page,
        size=page.size,
    )


@router.get("/{user_id}", response_model=UserOut)
def get_user(
    user_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    """Read a user: self, same-school admin/principal, or super_admin."""
    # scope: school
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")
    permitted = (
        user.role == UserRole.SUPER_ADMIN
        or user.id == target.id
        or _same_school_admin(user, target)
    )
    if not permitted:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    return UserOut.model_validate(target)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    """Update a user: self (full_name only), same-school admin, or super_admin."""
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")

    data = payload.model_dump(exclude_unset=True)
    if data.get("role") is None:
        data.pop("role", None)

    if user.role == UserRole.SUPER_ADMIN:
        allowed = _ADMIN_FIELDS
    elif user.id == target.id:
        allowed = _SELF_FIELDS
    elif _same_school_admin(user, target):
        allowed = _ADMIN_FIELDS
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    if user.id == target.id and "role" in data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="cannot change own role",
        )

    if not set(data).issubset(allowed):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="field not permitted for this role",
        )

    old_role = target.role
    old_school_id = target.school_id
    new_role = data.get("role")

    if new_role is not None and new_role != old_role:
        if user.role == UserRole.SUPER_ADMIN:
            if new_role == UserRole.SUPER_ADMIN and not _super_admin_creation_allowed(request):
                log_audit_event(
                    db,
                    actor=user,
                    action="role_escalation_attempt",
                    entity_type="user",
                    entity_id=target.id,
                    before={"role": str(old_role)},
                    after={"role": str(new_role)},
                    request=request,
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="creating super_admin requires explicit confirmation",
                )
        elif user.role in _ADMIN_ROLES:
            if new_role not in ADMIN_ASSIGNABLE_ROLES:
                log_audit_event(
                    db,
                    actor=user,
                    action="role_escalation_attempt",
                    entity_type="user",
                    entity_id=target.id,
                    before={"role": str(old_role)},
                    after={"role": str(new_role)},
                    request=request,
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="role assignment not permitted",
                )
        else:
            log_audit_event(
                db,
                actor=user,
                action="role_escalation_attempt",
                entity_type="user",
                entity_id=target.id,
                before={"role": str(old_role)},
                after={"role": str(new_role)},
                request=request,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="role assignment not permitted",
            )

    if "email" in data and data["email"] != target.email:
        duplicate = db.scalar(select(User).where(User.email == data["email"], User.id != target.id))
        if duplicate is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="email already registered",
            )

    if "school_id" in data and data["school_id"] is not None:
        school = db.get(School, data["school_id"])
        if school is None or school.tenant_id != target.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="invalid school assignment",
            )

    for field, value in data.items():
        setattr(target, field, value)
    db.commit()
    db.refresh(target)

    if new_role is not None and new_role != old_role:
        log_audit_event(
            db,
            actor=user,
            action="role_change",
            entity_type="user",
            entity_id=target.id,
            before={"role": str(old_role)},
            after={"role": str(new_role)},
            request=request,
        )

    if "school_id" in data and data["school_id"] != old_school_id:
        log_audit_event(
            db,
            actor=user,
            action="role_change",
            entity_type="user",
            entity_id=target.id,
            before={"school_id": old_school_id},
            after={"school_id": data["school_id"]},
            request=request,
        )

    return UserOut.model_validate(target)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Delete a user (same-school admin/principal or super_admin)."""
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")
    permitted = user.role == UserRole.SUPER_ADMIN or _same_school_admin(user, target)
    if not permitted:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    db.delete(target)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
