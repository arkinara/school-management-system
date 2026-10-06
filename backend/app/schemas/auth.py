"""Auth request/response schemas."""

from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field

from app.schemas.user import UserOut


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: str | None = None
    user_id: int | None = None
    tenant_id: int | None = None
    school_id: int | None = None
    role: str | None = None
    jti: str | None = None
    exp: int | None = None


class UserRegister(BaseModel):
    """Public self-registration payload.

    ``role`` is a plain string so the endpoint can reject invalid values (and
    ``super_admin``) with a 400 rather than Pydantic's default 422.
    """

    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=1)
    role: str
    school_id: int | None = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str
    tenant_id: int | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class UserMe(BaseModel):
    user: UserOut
    tenant_id: int
    school_id: int | None = None
    role: str


class AuthResponse(BaseModel):
    user: UserOut
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"
