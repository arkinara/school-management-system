"""add users.is_active + teacher_assignments

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-10-07 00:30:00.000000

Ticket #48: users gain a soft-delete ``is_active`` flag (default true), and a
new ``teacher_assignments`` table records teacher–subject–class assignments
scoped by academic year.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f6a7b8c9d0e1"
down_revision: str | None = "e5f6a7b8c9d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
    )

    op.create_table(
        "teacher_assignments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("teacher_id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("class_id", sa.Integer(), nullable=False),
        sa.Column("academic_year", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["teacher_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"]),
        sa.ForeignKeyConstraint(["class_id"], ["classes.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("teacher_assignments", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_teacher_assignments_teacher_id"), ["teacher_id"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_teacher_assignments_subject_id"), ["subject_id"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_teacher_assignments_class_id"), ["class_id"], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table("teacher_assignments", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_teacher_assignments_class_id"))
        batch_op.drop_index(batch_op.f("ix_teacher_assignments_subject_id"))
        batch_op.drop_index(batch_op.f("ix_teacher_assignments_teacher_id"))
    op.drop_table("teacher_assignments")

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("is_active")
