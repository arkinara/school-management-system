"""Audit log schemas (ticket #30)."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    actor_id: int | None = None
    actor_role: str | None = None
    action: str
    tenant_id: int | None = None
    school_id: int | None = None
    reason: str | None = None
    bypassed: bool = False
    created_at: datetime


class AuditLogListResponse(BaseModel):
    items: list[AuditLogOut]
    total: int
    page: int
    size: int


class AuditActionCount(BaseModel):
    action: str
    count: int


class AuditLogSummary(BaseModel):
    """Aggregate event counts over the trailing window."""

    from_date: date
    to_date: date
    total_events: int
    by_action: list[AuditActionCount]
