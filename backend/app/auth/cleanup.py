"""Revoked-token cleanup helpers (ticket #40)."""

from __future__ import annotations

from sqlalchemy import delete, func
from sqlalchemy.orm import Session

from app.db.models import TokenDenylist


def cleanup_expired_tokens(db: Session) -> int:
    """Delete denylist entries past their expiry. Returns count deleted.

    Entries are only removed once ``expires_at`` is strictly in the past, so a
    revoked token is always rejected for its entire remaining lifetime.
    """
    result = db.execute(delete(TokenDenylist).where(TokenDenylist.expires_at < func.now()))
    db.commit()
    return result.rowcount or 0
