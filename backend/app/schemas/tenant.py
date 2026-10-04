"""Tenant schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.db.models import JenjangType


class TenantCreate(BaseModel):
    name: str
    jenjang_type: JenjangType
    kurikulum_version: str
    config: dict | None = None


class TenantUpdate(BaseModel):
    name: str | None = None
    jenjang_type: JenjangType | None = None
    kurikulum_version: str | None = None
    config: dict | None = None


class TenantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    jenjang_type: JenjangType
    kurikulum_version: str
    config: dict | None = None
    created_at: datetime
    school_count: int = 0
