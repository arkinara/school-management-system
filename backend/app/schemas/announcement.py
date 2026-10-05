"""Announcement schemas (ticket #26)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.db.models import AnnouncementAudience


class AnnouncementCreate(BaseModel):
    """Create a draft announcement scoped to an audience."""

    title: str = Field(min_length=1, max_length=255)
    body: str = Field(min_length=1)
    audience: AnnouncementAudience = AnnouncementAudience.ALL
    school_id: int | None = None
    target_class_id: int | None = None
    target_tenant_id: int | None = None


class AnnouncementUpdate(BaseModel):
    """Edit an announcement's mutable fields."""

    title: str | None = Field(default=None, min_length=1, max_length=255)
    body: str | None = Field(default=None, min_length=1)
    audience: AnnouncementAudience | None = None
    school_id: int | None = None
    target_class_id: int | None = None
    target_tenant_id: int | None = None


class AnnouncementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    school_id: int | None = None
    author_id: int
    audience: AnnouncementAudience
    title: str
    body: str
    published_at: datetime | None = None
    status: str = "draft"
    target_class_id: int | None = None
    target_tenant_id: int | None = None


class AnnouncementListResponse(BaseModel):
    items: list[AnnouncementOut]
    total: int
    page: int
    size: int
