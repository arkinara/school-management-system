"""Grade schemas (ticket #16)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.academic import SemesterStr
from app.db.models import GradeCategory


class GradeCreate(BaseModel):
    """A single graded assessment for a student in a subject."""

    student_id: int
    subject_id: int
    semester: SemesterStr
    category: GradeCategory
    assessment_no: int = Field(default=1, ge=1)
    score: float = Field(ge=0, le=100)
    description: str | None = None


class GradeEntry(BaseModel):
    """One student's score inside a bulk submission."""

    student_id: int
    score: float = Field(ge=0, le=100)
    description: str | None = None


class GradeBulkCreate(BaseModel):
    """Bulk grade entry for a class/subject/category/semester."""

    class_id: int
    subject_id: int
    semester: SemesterStr
    category: GradeCategory
    assessment_no: int = Field(default=1, ge=1)
    entries: list[GradeEntry]


class GradeUpdate(BaseModel):
    """Editable fields of an existing grade."""

    score: float | None = Field(default=None, ge=0, le=100)
    category: GradeCategory | None = None
    description: str | None = None


class GradeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    subject_id: int
    semester: str
    category: GradeCategory
    assessment_no: int = 1
    score: float
    description: str | None = None
    kurikulum_version: str | None = None
    recorded_by: int


class GradeListResponse(BaseModel):
    items: list[GradeOut]
    total: int
    page: int
    size: int


class GradeBulkResult(BaseModel):
    """Result of a bulk grade submission."""

    class_id: int
    subject_id: int
    semester: str
    category: GradeCategory
    created: int
    updated: int = 0


class SubjectAggregate(BaseModel):
    """Per-subject rollup of a student's grades."""

    subject_id: int
    subject_name: str | None = None
    average: float
    count: int


class GradeAggregate(BaseModel):
    """Per-subject and overall averages for one student/semester."""

    student_id: int
    semester: str
    total: int
    per_subject: list[SubjectAggregate]
    overall_average: float | None = None
