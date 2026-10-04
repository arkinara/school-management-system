"""Parent/student link helpers shared by the student and parent routers.

The link is the ``parent_links`` association table, which carries relationship
metadata (``relationship``, ``is_primary``) alongside the two FKs. Helpers here
keep the routers free of raw ``Table`` SQL while preserving the explicit,
non-ORM link semantics.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Student, User, parent_links
from app.schemas.parent import ChildSummary, ParentSummary


def link_exists(db: Session, parent_id: int, student_id: int) -> bool:
    """Return whether a parent/student link row already exists."""
    row = db.execute(
        select(parent_links.c.parent_id).where(
            parent_links.c.parent_id == parent_id,
            parent_links.c.student_id == student_id,
        )
    ).first()
    return row is not None


def add_link(
    db: Session,
    parent_id: int,
    student_id: int,
    relationship: str = "orang_tua",
    is_primary: bool = False,
) -> None:
    """Insert a parent/student link row (no commit)."""
    db.execute(
        parent_links.insert().values(
            parent_id=parent_id,
            student_id=student_id,
            relationship=relationship,
            is_primary=is_primary,
        )
    )


def remove_link(db: Session, parent_id: int, student_id: int) -> None:
    """Delete a parent/student link row (no commit)."""
    db.execute(
        parent_links.delete().where(
            parent_links.c.parent_id == parent_id,
            parent_links.c.student_id == student_id,
        )
    )


def build_parent_summaries(db: Session, student_id: int) -> list[ParentSummary]:
    """Return every linked parent for a student, primary guardians first."""
    rows = db.execute(
        select(
            parent_links.c.parent_id,
            parent_links.c.relationship,
            parent_links.c.is_primary,
            User.full_name,
            User.email,
        )
        .join(User, User.id == parent_links.c.parent_id)
        .where(parent_links.c.student_id == student_id)
        .order_by(parent_links.c.is_primary.desc(), parent_links.c.parent_id)
    ).all()
    return [
        ParentSummary(
            id=row.parent_id,
            full_name=row.full_name,
            email=row.email,
            relationship=row.relationship,
            is_primary=bool(row.is_primary),
        )
        for row in rows
    ]


def build_children_summaries(db: Session, parent_id: int) -> list[ChildSummary]:
    """Return every linked student for a parent (sibling lookup)."""
    rows = db.execute(
        select(
            parent_links.c.student_id,
            parent_links.c.relationship,
            parent_links.c.is_primary,
            Student.user_id,
            Student.nis,
            Student.class_id,
            Student.enrollment_status,
            User.full_name,
        )
        .join(Student, Student.id == parent_links.c.student_id)
        .join(User, User.id == Student.user_id)
        .where(parent_links.c.parent_id == parent_id)
        .order_by(parent_links.c.is_primary.desc(), parent_links.c.student_id)
    ).all()
    return [
        ChildSummary(
            id=row.student_id,
            user_id=row.user_id,
            nis=row.nis,
            full_name=row.full_name,
            class_id=row.class_id,
            enrollment_status=row.enrollment_status,
            relationship=row.relationship,
            is_primary=bool(row.is_primary),
        )
        for row in rows
    ]
