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
    """One student's score inside a class-scoped bulk submission.

    ``score`` is validated per row by the router so one bad entry does not
    reject the whole batch.
    """

    student_id: int
    score: float | None = None
    description: str | None = None


class GradeBulkItem(BaseModel):
    """One per-row grade entry in a heterogeneous bulk submission.

    ``score`` is intentionally not range-constrained here so an out-of-range
    value is reported as a per-row error instead of rejecting the whole batch.
    """

    student_id: int
    subject_id: int
    semester: SemesterStr | None = None
    category: GradeCategory | None = None
    assessment_no: int = Field(default=1, ge=1)
    score: float | None = None
    description: str | None = None


class GradeBulkCreate(BaseModel):
    """Bulk grade entry.

    Two shapes are accepted:

    - class-scoped: ``class_id`` + ``subject_id`` + ``category`` + ``entries``
    - per-row: ``items`` carrying student/subject/category/semester per entry
    """

    class_id: int | None = None
    subject_id: int | None = None
    semester: SemesterStr | None = None
    category: GradeCategory | None = None
    assessment_no: int = Field(default=1, ge=1)
    entries: list[GradeEntry] = Field(default_factory=list)
    items: list[GradeBulkItem] = Field(default_factory=list)


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


class BulkGradeRowResult(BaseModel):
    """Per-row outcome for a bulk grade submission."""

    index: int | None = None
    student_id: int | None = None
    subject_id: int | None = None
    category: str | None = None
    assessment_no: int | None = None
    status: str = "error"
    status_code: int | None = None
    detail: str | None = None


class GradeBulkResult(BaseModel):
    """Result of a bulk grade submission with per-row outcomes."""

    class_id: int | None = None
    subject_id: int | None = None
    semester: str | None = None
    category: GradeCategory | None = None
    created: int = 0
    updated: int = 0
    saved: list[GradeOut] = Field(default_factory=list)
    errors: list[BulkGradeRowResult] = Field(default_factory=list)


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
