"""Seed idempotency tests."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import seed as seed_module
from app.db.models import Class, Student, Subject, Tenant, User


def _counts(session: Session) -> dict[str, int]:
    return {
        "tenants": session.scalar(select(func.count()).select_from(Tenant)) or 0,
        "users": session.scalar(select(func.count()).select_from(User)) or 0,
        "students": session.scalar(select(func.count()).select_from(Student)) or 0,
        "classes": session.scalar(select(func.count()).select_from(Class)) or 0,
        "subjects": session.scalar(select(func.count()).select_from(Subject)) or 0,
    }


def test_seed_is_idempotent(db_session: Session) -> None:
    first = _counts(db_session)
    seed_module.seed(db_session)
    second = _counts(db_session)
    assert first == second
    assert second == {
        "tenants": 1,
        "users": 11,
        "students": 4,
        "classes": 4,
        "subjects": 6,
    }


def test_seed_covers_all_roles(db_session: Session) -> None:
    roles = set(db_session.scalars(select(User.role)).all())
    assert {
        "super_admin",
        "admin",
        "principal",
        "teacher",
        "student",
        "parent",
    }.issubset({str(r) for r in roles})
