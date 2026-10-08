"""Report card schemas (ticket #18, extended by #55)."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.academic import SemesterStr
from app.db.models import ReportCardStatus


class ReportCardCompile(BaseModel):
    """Request to (re)compile a student's rapor for a semester.

    ``kurikulum_version`` is accepted for backwards compatibility but ignored:
    the rapor always inherits the tenant/school version (#47, #55).
    """

    student_id: int
    semester: SemesterStr
    kurikulum_version: str | None = None


class ReportCardCorrect(BaseModel):
    """Optional replacement payload when creating a corrected rapor version."""

    compiled_data: dict | None = None
    deadline: date | None = None


class FinalizePayload(BaseModel):
    """Wali kelas sign-off body: an optional deadline and gap override reason."""

    deadline: date | None = None
    gap_override_reason: str | None = None


class ReportCardGap(BaseModel):
    """One missing (student, subject, category) grade combination."""

    student_id: int
    subject_id: int
    subject: str | None = None
    category: str


class ReportCardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    semester: str
    status: ReportCardStatus
    version: int = 1
    kurikulum_version: str
    compiled_data: dict | None = None
    superseded_by: int | None = None
    finalized_by: int | None = None
    finalized_at: datetime | None = None
    published_by: int | None = None
    published_at: datetime | None = None
    deadline: date | None = None
    gap_override_reason: str | None = None
    gaps: list[ReportCardGap] = Field(default_factory=list)


class ReportCardListResponse(BaseModel):
    items: list[ReportCardOut]
    total: int
    page: int
    size: int
