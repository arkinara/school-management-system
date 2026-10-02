"""Reusable tenant/school scoping query helper.

Domain routers must build reads through :func:`scoped_query` so that every
tenant-scoped model is filtered by the authenticated user's ``tenant_id``
(and ``school_id`` where the model exposes one). ``super_admin`` is the only
role allowed to bypass the tenant filter, and only when an explicit audit
reason is supplied — the bypass is recorded in ``audit_logs``.
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import AuditLog, User, UserRole

logger = logging.getLogger("app.db.scoping")


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
