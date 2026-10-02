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


class ClassOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    school_id: int
    name: str
    grade_level: int
    jurusan: str | None = None
    wali_kelas_id: int | None = None
    academic_year: str
