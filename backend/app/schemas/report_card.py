"""Report card schemas (ticket #18)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.db.models import ReportCardStatus


class ReportCardCompile(BaseModel):
    """Request to (re)compile a student's rapor for a semester."""

    student_id: int
    semester: str
    kurikulum_version: str


class ReportCardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    semester: str
    status: ReportCardStatus
    kurikulum_version: str
    compiled_data: dict | None = None
    finalized_by: int | None = None
    published_at: datetime | None = None


class ReportCardListResponse(BaseModel):
    items: list[ReportCardOut]
    total: int
    page: int
    size: int
