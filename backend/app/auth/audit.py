"""Security-event audit helper for the auth layer.

Thin adapter over :func:`app.audit.log_audit_event` exposing the richer
``entity``/``before``/``after`` vocabulary used by the auth hardening work
(ticket #39). The persisted ``audit_logs`` schema stores a single ``reason``
string, so entity and diff details are folded into it — the callers get a
stable signature without requiring a schema migration.
"""

from __future__ import annotations

from fastapi import Request
from sqlalchemy.orm import Session

from app.audit import log_audit_event as _write_audit
from app.db.models import User


def log_audit_event(
    db: Session,
    *,
    actor: User,
    action: str,
    entity_type: str,
    entity_id: int,
    before: dict | None = None,
    after: dict | None = None,
    request: Request | None = None,
) -> None:
    """Best-effort write to audit_logs. Used for security-relevant events."""
    parts: list[str] = []
    if before:
        parts.append(f"before={before}")
    if after:
        parts.append(f"after={after}")
    _write_audit(
        db,
        user=actor,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        detail="; ".join(parts) or None,
        request=request,
    )
