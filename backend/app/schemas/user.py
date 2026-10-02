"""User schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from app.db.models import UserRole


class UserCreate(BaseModel):
    tenant_id: int
    school_id: int | None = None
    email: EmailStr
    password: str
    role: UserRole
    full_name: str


class UserUpdate(BaseModel):
    school_id: int | None = None
    email: EmailStr | None = None
    full_name: str | None = None
    role: UserRole | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    school_id: int | None = None
    email: EmailStr
    role: UserRole
    full_name: str
    created_at: datetime
