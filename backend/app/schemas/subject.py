"""Subject schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class SubjectCreate(BaseModel):
    tenant_id: int
    name: str
    category: str
    applicable_grade_levels: list[int] = []


class SubjectUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    applicable_grade_levels: list[int] | None = None


class SubjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    name: str
    category: str
    applicable_grade_levels: list[int] | None = None


class SubjectListResponse(BaseModel):
    items: list[SubjectOut]
    total: int
    page: int
    size: int
