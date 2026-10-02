"""Auth token schemas."""

from __future__ import annotations

from pydantic import BaseModel


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: str | None = None
    user_id: int | None = None
    tenant_id: int | None = None
    school_id: int | None = None
    role: str | None = None
    exp: int | None = None
