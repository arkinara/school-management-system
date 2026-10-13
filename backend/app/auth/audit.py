"""Security-event audit helper for the auth layer.

Thin adapter over :func:`app.audit.log_audit_event` exposing the richer
``entity``/``resource``/``before``/``after`` vocabulary used across the domain
routers. The persisted ``audit_logs`` schema stores structured columns plus a
human-readable ``reason`` string; this wrapper normalises the two so callers get
a stable signature while the storage layer stays flexible.
"""

from __future__ import annotations

from fastapi import Request
from sqlalchemy.orm import Session

from app.audit import log_audit_event as _write_audit
from app.db.models import User


def log_audit_event(
    db: Session,
    *,
    actor: User | None = None,
    action: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
    resource_type: str | None = None,
    resource_id: int | None = None,
    before: dict | None = None,
    after: dict | None = None,
    outcome: str = "success",
    reason_code: str | None = None,
    detail: str | None = None,
    request: Request | None = None,
) -> None:
    """Best-effort write to audit_logs. Used for security-relevant events."""
    _write_audit(
        db,
        user=actor,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        resource_type=resource_type,
        resource_id=resource_id,
        before=before,
        after=after,
        outcome=outcome,
        reason_code=reason_code,
        detail=detail,
        request=request,
    )
