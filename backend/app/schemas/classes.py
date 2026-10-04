"""Class schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class ClassCreate(BaseModel):
    school_id: int
    name: str
    grade_level: int
    jurusan: str | None = None
    wali_kelas_id: int | None = None
    academic_year: str


class ClassUpdate(BaseModel):
    name: str | None = None
    grade_level: int | None = None
    jurusan: str | None = None
    wali_kelas_id: int | None = None
    academic_year: str | None = None


class ClassOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    school_id: int
    name: str
    grade_level: int
    jurusan: str | None = None
    wali_kelas_id: int | None = None
    academic_year: str


class ClassListResponse(BaseModel):
    items: list[ClassOut]
    total: int
    page: int
    size: int
