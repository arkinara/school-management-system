"""Shared audit-logging facility (ticket #30).

Every domain router records security-relevant mutations through
:func:`log_audit_event`. Audit writes are best-effort: a failure to persist an
entry is logged and swallowed so the underlying business request is never
rolled back because of the audit trail (per ticket #30's failure-mode policy).
"""

from __future__ import annotations

import logging

from fastapi import Request
from sqlalchemy.orm import Session

from app.db.models import AuditLog, User

logger = logging.getLogger("app.audit")


def _entity_reason(entity_type: str | None, entity_id: int | None) -> str | None:
    if entity_type is None and entity_id is None:
        return None
    return f"entity={entity_type or ''}:{entity_id if entity_id is not None else ''}"


def log_audit_event(
    db: Session,
    *,
    action: str,
    user: User | None = None,
    actor_id: int | None = None,
    actor_role: str | None = None,
    tenant_id: int | None = None,
    school_id: int | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
    detail: str | None = None,
    bypassed: bool = False,
    request: Request | None = None,
) -> None:
    """Append one immutable audit entry, never raising into the caller."""
    if user is not None:
        actor_id = user.id
        actor_role = str(user.role)
        if tenant_id is None:
            tenant_id = user.tenant_id
        if school_id is None:
            school_id = user.school_id

    reason_parts: list[str] = []
    entity = _entity_reason(entity_type, entity_id)
    if entity:
        reason_parts.append(entity)
    if detail:
        reason_parts.append(detail)
    if request is not None:
        client = request.client
        if client is not None:
            reason_parts.append(f"ip={client.host}")
        user_agent = request.headers.get("user-agent")
        if user_agent:
            reason_parts.append(f"ua={user_agent}")
    reason = "; ".join(reason_parts) or None

    try:
        db.add(
            AuditLog(
                actor_id=actor_id,
                actor_role=actor_role,
                action=action,
                tenant_id=tenant_id,
                school_id=school_id,
                reason=reason,
                bypassed=bypassed,
            )
        )
        db.commit()
    except Exception:  # noqa: BLE001 - audit must never block business logic
        logger.exception("audit write failed: action=%s actor=%s", action, actor_id)
        try:
            db.rollback()
        except Exception:  # noqa: BLE001
            logger.exception("audit rollback failed: action=%s", action)


# Backwards-friendly alias for callers that prefer the imperative name.
write_audit = log_audit_event
