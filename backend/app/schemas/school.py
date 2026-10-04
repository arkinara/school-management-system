"""School schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SchoolCreate(BaseModel):
    tenant_id: int
    name: str
    address: str
    principal_id: int | None = None


class SchoolUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    principal_id: int | None = None


class SchoolOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    name: str
    address: str | None = None
    principal_id: int | None = None
    created_at: datetime


class SchoolListResponse(BaseModel):
    items: list[SchoolOut]
    total: int
    page: int
    size: int
