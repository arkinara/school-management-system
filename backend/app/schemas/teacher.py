"""Teacher assignment schemas (ticket #48)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


class TeacherAssignmentCreate(BaseModel):
    teacher_id: int
    subject_id: int
    class_id: int
    academic_year: str


class TeacherAssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    teacher_id: int
    subject_id: int
    class_id: int
    academic_year: str
    created_at: datetime


class TeacherProfileOut(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    school_id: int | None = None
    assignments: list[TeacherAssignmentOut]
