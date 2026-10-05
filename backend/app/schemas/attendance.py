"""Attendance schemas (ticket #14)."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict

from app.db.models import AttendanceStatus


class AttendanceCreate(BaseModel):
    """Single attendance record for a student on a date."""

    student_id: int
    class_id: int
    date: date
    status: AttendanceStatus
    note: str | None = None


class AttendanceEntry(BaseModel):
    """One student's status inside a bulk submission."""

    student_id: int
    status: AttendanceStatus
    note: str | None = None


class AttendanceBulkCreate(BaseModel):
    """Bulk attendance submission for a class on one date."""

    class_id: int
    date: date
    entries: list[AttendanceEntry]


class AttendanceUpdate(BaseModel):
    """Editable fields of an existing attendance record."""

    status: AttendanceStatus | None = None
    note: str | None = None


class AttendanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    class_id: int
    date: date
    status: AttendanceStatus
    recorded_by: int
    note: str | None = None


class AttendanceListResponse(BaseModel):
    items: list[AttendanceOut]
    total: int
    page: int
    size: int


class AttendanceBulkResult(BaseModel):
    """Result of a bulk submission."""

    class_id: int
    date: date
    created: int


class AttendanceTodaySummary(BaseModel):
    """Today's attendance plus per-status counts for dashboards."""

    date: date
    total: int
    counts: dict[str, int]
    items: list[AttendanceOut]
