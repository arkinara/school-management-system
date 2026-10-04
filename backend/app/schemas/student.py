"""Student schemas."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, EmailStr

from app.schemas.parent import ParentSummary


class StudentCreate(BaseModel):
    """Create a student profile, optionally creating its user in the same txn.

    Pass ``user_id`` to attach an existing role=student account, or supply
    ``full_name``/``email``/``password`` so a new student user is created.
    """

    user_id: int | None = None
    school_id: int
    class_id: int | None = None
    nis: str
    full_name: str | None = None
    email: EmailStr | None = None
    password: str | None = None
    birth_date: date | None = None
    enrollment_status: str = "active"
    parent_ids: list[int] = []


class StudentUpdate(BaseModel):
    class_id: int | None = None
    nis: str | None = None
    birth_date: date | None = None
    enrollment_status: str | None = None
    full_name: str | None = None


class ParentLink(BaseModel):
    """Body for linking an existing parent user to a student."""

    parent_id: int
    relationship: str = "orang_tua"
    is_primary: bool = False


class StudentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    school_id: int
    class_id: int | None = None
    nis: str
    full_name: str | None = None
    email: EmailStr | None = None
    birth_date: date | None = None
    enrollment_status: str
    parents: list[ParentSummary] = []


class StudentListResponse(BaseModel):
    items: list[StudentOut]
    total: int
    page: int
    size: int
