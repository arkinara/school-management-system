"""Subject schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class SubjectCreate(BaseModel):
    tenant_id: int
    name: str
    category: str
    applicable_grade_levels: list | None = None


class SubjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    name: str
    category: str
    applicable_grade_levels: list | None = None
