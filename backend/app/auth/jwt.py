"""JWT creation and verification (HS256, Better Auth compatible claims)."""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import ExpiredSignatureError, JWTError, jwt

_DEV_SECRET: str = "dev-insecure-secret-change-me"

JWT_SECRET: str | None = os.getenv("JWT_SECRET") or (
    _DEV_SECRET if os.getenv("ENVIRONMENT") in ("dev", "test") else None
)

if JWT_SECRET is None:
    raise RuntimeError("JWT_SECRET environment variable is required outside dev/test")

JWT_ALGORITHM: str = "HS256"
DEFAULT_EXPIRES_MINUTES: int = 15
DEFAULT_REFRESH_DAYS: int = 7

# Refresh tokens may live on their own secret; fall back to the access secret.
REFRESH_SECRET: str = os.getenv("JWT_REFRESH_SECRET") or JWT_SECRET


class TokenError(Exception):
    """Base error for token verification failures."""


class TokenExpiredError(TokenError):
    """Raised when a decoded token is past its ``exp`` claim."""


def create_access_token(
    user_id: int,
    tenant_id: int | None,
    school_id: int | None,
    role: str,
    expires_delta: timedelta | None = None,
) -> str:
    """Create a signed HS256 access token carrying scope + role claims."""
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=DEFAULT_EXPIRES_MINUTES))
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "user_id": user_id,
        "tenant_id": tenant_id,
        "school_id": school_id,
        "role": role,
        "type": "access",
        "jti": str(uuid.uuid4()),
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any] | None:
    """Decode a token, returning ``None`` for any verification failure."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        return None


def decode_access_token_strict(token: str) -> dict[str, Any]:
    """Decode a token, raising typed errors so callers can distinguish causes."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except ExpiredSignatureError as exc:
        raise TokenExpiredError("token has expired") from exc
    except JWTError as exc:
        raise TokenError("token signature or format is invalid") from exc


def create_refresh_token(
    user_id: int,
    jti: str,
    expires_delta: timedelta | None = None,
) -> str:
    """Create a long-lived refresh token on the (possibly separate) secret."""
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(days=DEFAULT_REFRESH_DAYS))
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "type": "refresh",
        "jti": jti,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, REFRESH_SECRET, algorithm=JWT_ALGORITHM)


def decode_refresh_token(token: str) -> dict[str, Any] | None:
    """Decode a refresh token, rejecting access tokens or invalid signatures."""
    try:
        payload = jwt.decode(token, REFRESH_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        return None
    if payload.get("type") != "refresh":
        return None
    return payload
