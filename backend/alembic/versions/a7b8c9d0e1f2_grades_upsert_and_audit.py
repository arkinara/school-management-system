"""grades: assessment_no + kurikulum_version + updated_at + unique natural key

Revision ID: a7b8c9d0e1f2
Revises: d51f0a1c2d3e
Create Date: 2026-10-07 00:00:00.000000

Ticket #53: grade entry re-posted existing scores on every save, duplicating
rows. This migration introduces the natural key
``(student_id, subject_id, category, semester, assessment_no)`` enforced by a
unique index, plus the ``assessment_no`` / ``kurikulum_version`` / ``updated_at``
columns the upsert path stamps. Existing duplicate rows are collapsed (keeping
the highest ``id``) *before* the index is created so the migration never fails
on legacy data.

A unique *index* (not a table constraint) is used deliberately: SQLite cannot
add a table constraint without recreating ``grades``, and a batch table rebuild
would silently drop the ``ck_grades_*`` CHECK constraints added in #46.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7b8c9d0e1f2"
down_revision: str | None = "d51f0a1c2d3e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_INDEX = "uq_grade_student_subject_category_semester_assessment"


def upgrade() -> None:
    op.add_column(
        "grades",
        sa.Column("assessment_no", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column("grades", sa.Column("kurikulum_version", sa.String(length=64), nullable=True))
    op.add_column("grades", sa.Column("updated_at", sa.DateTime(), nullable=True))

    # Backfill kurikulum_version from the student's school (grades have no school
    # column of their own).
    op.execute(
        "UPDATE grades SET kurikulum_version = ("
        "SELECT schools.kurikulum_version FROM schools "
        "JOIN students ON students.school_id = schools.id "
        "WHERE students.id = grades.student_id"
        ") WHERE kurikulum_version IS NULL"
    )
    op.execute("UPDATE grades SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL")

    # Collapse duplicates onto the newest row (highest id) before enforcing the key.
    op.execute(
        "DELETE FROM grades WHERE id NOT IN ("
        "SELECT MAX(id) FROM grades "
        "GROUP BY student_id, subject_id, category, semester, assessment_no"
        ")"
    )

    op.create_index(
        _INDEX,
        "grades",
        ["student_id", "subject_id", "category", "semester", "assessment_no"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(_INDEX, table_name="grades")
    op.drop_column("grades", "updated_at")
    op.drop_column("grades", "kurikulum_version")
    op.drop_column("grades", "assessment_no")
