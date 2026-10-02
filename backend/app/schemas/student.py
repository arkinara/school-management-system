"""Student schemas."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict


class StudentCreate(BaseModel):
    user_id: int
    school_id: int
    class_id: int | None = None
    nis: str
    birth_date: date | None = None
    enrollment_status: str = "active"


class StudentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    school_id: int
    class_id: int | None = None
    nis: str
    birth_date: date | None = None
    enrollment_status: str
