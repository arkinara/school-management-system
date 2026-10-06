"""Reusable tenant/school scoping query helper.

Domain routers must build reads through :func:`scoped_query` so that every
tenant-scoped model is filtered by the authenticated user's ``tenant_id``
(and ``school_id`` where the model exposes one). ``super_admin`` is the only
role allowed to bypass the tenant filter, and only when an explicit audit
reason is supplied — the bypass is recorded in ``audit_logs``.
"""

from __future__ import annotations

import logging
from typing import TypeVar

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import log_audit_event
from app.db.models import (
    AuditLog,
    Class,
    Schedule,
    School,
    Student,
    User,
    UserRole,
    parent_links,
)

logger = logging.getLogger("app.db.scoping")

T = TypeVar("T")

# Scope matrix (role -> visible set)
#   super_admin : all schools in the caller's tenant
#   principal   : own school only
#   admin       : own school only
#   teacher     : own school; student PII limited to own classes
#   student     : self only
#   parent      : own linked children only
ROLE_SCOPE = {
    UserRole.SUPER_ADMIN: "tenant",
    UserRole.PRINCIPAL: "school",
    UserRole.ADMIN: "school",
    UserRole.TEACHER: "school_pii_limited",
    UserRole.STUDENT: "self",
    UserRole.PARENT: "children",
}


class MissingTenantContextError(ValueError):
    """Raised when a non-super_admin query has no resolved tenant context."""


class BypassReasonRequiredError(ValueError):
    """Raised when a super_admin bypass is attempted without an audit reason."""


def _record_audit(
    session: Session | None,
    user: User,
    *,
    reason: str,
    model: type,
    bypassed: bool,
) -> None:
    logger.info("audit bypass: user=%s model=%s reason=%s", user.id, model.__name__, reason)
    if session is None:
        return
    session.add(
        AuditLog(
            actor_id=user.id,
            actor_role=str(user.role),
            action=f"scoped_query:{model.__name__}",
            tenant_id=user.tenant_id,
            school_id=user.school_id,
            reason=reason,
            bypassed=bypassed,
        )
    )
    session.commit()


def scoped_query(
    model: type,
    user: User,
    session: Session | None = None,
    *,
    bypass_reason: str | None = None,
):
    """Return a ``select()`` for ``model`` filtered to the user's scope.

    - Non-``super_admin``: always filtered by ``tenant_id`` when the model has
      one; also filtered by ``school_id`` when both the user and model expose it.
    - ``super_admin``: bypasses the tenant filter only when ``bypass_reason`` is
      provided; the bypass is written to ``audit_logs``.
    """
    stmt = select(model)
    has_tenant = hasattr(model, "tenant_id")
    has_school = hasattr(model, "school_id")

    if user.role == UserRole.SUPER_ADMIN:
        if has_tenant:
            if not bypass_reason:
                raise BypassReasonRequiredError(
                    "super_admin cross-tenant query requires an explicit bypass_reason"
                )
            _record_audit(session, user, reason=bypass_reason, model=model, bypassed=True)
        return stmt

    if has_tenant:
        if user.tenant_id is None:
            raise MissingTenantContextError(
                f"cannot scope {model.__name__}: user {user.id} has no tenant_id"
            )
        stmt = stmt.where(model.tenant_id == user.tenant_id)

    if has_school and user.school_id is not None:
        stmt = stmt.where(model.school_id == user.school_id)

    return stmt


def log_scope_denial(
    db: Session, user: User, *, resource: str, resource_id: int, reason: str
) -> None:
    """Best-effort audit record for a blocked cross-school/cross-tenant read."""
    logger.info(
        "scope denied: user=%s role=%s resource=%s:%s reason=%s",
        user.id,
        str(user.role),
        resource,
        resource_id,
        reason,
    )
    try:
        log_audit_event(
            db,
            user=user,
            action="scope_access_denied",
            entity_type=resource,
            entity_id=resource_id,
            detail=reason,
        )
    except Exception:  # noqa: BLE001 - audit must never block the denial path
        logger.exception("failed to audit scope denial user=%s", user.id)


def apply_school_scope(query: T, user: User, school_column) -> T:
    """Filter ``query`` by the caller's school for school-level roles."""
    if user.role == UserRole.SUPER_ADMIN:
        return query
    if user.school_id is None:
        return query.where(False)
    return query.where(school_column == user.school_id)


def apply_tenant_scope(query: T, user: User, tenant_column) -> T:
    """Filter ``query`` by the caller's tenant (the default scope)."""
    if user.role == UserRole.SUPER_ADMIN:
        return query
    return query.where(tenant_column == user.tenant_id)


def visible_school_ids(db: Session, user: User) -> list[int]:
    """Return the school IDs the caller is allowed to read."""
    if user.role == UserRole.SUPER_ADMIN:
        return [
            s.id
            for s in db.scalars(
                select(School).where(School.tenant_id == user.tenant_id)
            ).all()
        ]
    if user.school_id is None:
        return []
    return [user.school_id]


def can_user_read_school(db: Session, user: User, school_id: int) -> bool:
    """Permission check for a specific school."""
    if user.role == UserRole.SUPER_ADMIN:
        school = db.get(School, school_id)
        return school is not None and school.tenant_id == user.tenant_id
    return user.school_id == school_id


def can_user_read_class(db: Session, user: User, class_id: int) -> bool:
    """Permission check for a specific class."""
    cls = db.get(Class, class_id)
    if cls is None:
        return False
    if user.role == UserRole.SUPER_ADMIN:
        school = db.get(School, cls.school_id)
        return school is not None and school.tenant_id == user.tenant_id
    return cls.school_id == user.school_id


def can_user_read_student(db: Session, user: User, student_id: int) -> bool:
    """Relationship-aware permission check for a specific student."""
    student = db.get(Student, student_id)
    if student is None:
        return False
    if user.role == UserRole.SUPER_ADMIN:
        school = db.get(School, student.school_id)
        return school is not None and school.tenant_id == user.tenant_id
    if user.role == UserRole.PARENT:
        row = db.execute(
            select(parent_links.c.parent_id).where(
                parent_links.c.parent_id == user.id,
                parent_links.c.student_id == student_id,
            )
        ).first()
        return row is not None
    if user.role == UserRole.STUDENT:
        return student.user_id == user.id
    if user.role in (UserRole.PRINCIPAL, UserRole.ADMIN):
        return student.school_id == user.school_id
    if user.role == UserRole.TEACHER:
        if student.school_id != user.school_id:
            return False
        if student.class_id is None:
            return False
        cls = db.get(Class, student.class_id)
        if cls is not None and cls.wali_kelas_id == user.id:
            return True
        return (
            db.scalar(
                select(Schedule.id)
                .where(
                    Schedule.class_id == student.class_id,
                    Schedule.teacher_id == user.id,
                )
                .limit(1)
            )
            is not None
        )
    return False
