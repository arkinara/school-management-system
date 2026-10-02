"""Read-only output schemas for downstream domains (ticket stubs)."""

from __future__ import annotations

from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict

from app.db.models import (
    AnnouncementAudience,
    AttendanceStatus,
    GradeCategory,
    ReportCardStatus,
    SppBillStatus,
)


class AttendanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    class_id: int
    date: date
    status: AttendanceStatus
    recorded_by: int
    note: str | None = None


class GradeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    subject_id: int
    semester: str
    category: GradeCategory
    score: float
    description: str | None = None
    recorded_by: int


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


class SppBillOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    period: str
    amount: float
    due_date: date
    status: SppBillStatus
    created_by: int


class SppPaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    bill_id: int
    paid_at: datetime
    method: str
    amount: float
    receipt_no: str
    recorded_by: int


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


class ScheduleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    class_id: int
    subject_id: int
    teacher_id: int
    day_of_week: str
    period_number: int
    start_time: time
    end_time: time


class MessageThreadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    school_id: int | None = None
    participant_ids: list | None = None
    subject: str
    created_at: datetime


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    thread_id: int
    sender_id: int
    body: str
    sent_at: datetime
    read_at: datetime | None = None
