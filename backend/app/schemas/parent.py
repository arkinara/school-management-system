"""Parent schemas and parent/student link summaries."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, EmailStr


class ParentSummary(BaseModel):
    """A parent's identity plus this link's relationship metadata."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: EmailStr
    relationship: str
    is_primary: bool


class ChildSummary(BaseModel):
    """A student's identity plus this link's relationship metadata."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    nis: str
    full_name: str
    class_id: int | None = None
    enrollment_status: str
    relationship: str
    is_primary: bool


class ParentOut(BaseModel):
    id: int
    tenant_id: int
    school_id: int | None = None
    full_name: str
    email: EmailStr
    children: list[ChildSummary] = []


class ParentListResponse(BaseModel):
    items: list[ParentOut]
    total: int
    page: int
    size: int


class ParentLinkCreate(BaseModel):
    """Body for linking an existing parent user to a student."""

    parent_user_id: int
    relationship: str = "orang_tua"
    is_primary: bool = False


class ChildLinkCreate(BaseModel):
    """Body for linking a student to a parent (parent-side endpoint)."""

    student_id: int
    relationship: str = "orang_tua"
    is_primary: bool = False
