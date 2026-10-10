"""Announcement schemas (ticket #26)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.db.models import AnnouncementAudience


class AnnouncementCreate(BaseModel):
    """Create an announcement scoped to an audience.

    ``publish=True`` publishes immediately and is reserved for admin roles;
    teachers create drafts (``publish=True`` is rejected with 403).
    """

    title: str = Field(min_length=1, max_length=255)
    body: str = Field(min_length=1)
    audience: AnnouncementAudience = AnnouncementAudience.ALL
    school_id: int | None = None
    target_class_id: int | None = None
    target_tenant_id: int | None = None
    publish: bool = False


class AnnouncementUpdate(BaseModel):
    """Edit an announcement's mutable fields."""

    title: str | None = Field(default=None, min_length=1, max_length=255)
    body: str | None = Field(default=None, min_length=1)
    audience: AnnouncementAudience | None = None
    school_id: int | None = None
    target_class_id: int | None = None
    target_tenant_id: int | None = None
    change_note: str | None = None


class RetractRequest(BaseModel):
    """Optional reason supplied when soft-retracting an announcement."""

    reason: str | None = None


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
    retracted_at: datetime | None = None
    retracted_by: int | None = None
    retract_reason: str | None = None


class AnnouncementRevisionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    announcement_id: int
    version: int
    title: str
    body: str
    edited_by: int
    edited_at: datetime
    change_note: str | None = None


class AnnouncementListResponse(BaseModel):
    items: list[AnnouncementOut]
    total: int
    page: int
    size: int
