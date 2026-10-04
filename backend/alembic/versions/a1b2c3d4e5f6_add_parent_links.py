"""add parent_links association table

Revision ID: a1b2c3d4e5f6
Revises: 92402c314542
Create Date: 2026-10-04 00:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "92402c314542"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "parent_links",
        sa.Column("parent_id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("relationship", sa.String(length=20), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["parent_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("parent_id", "student_id"),
    )
    with op.batch_alter_table("parent_links", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_parent_links_student_id"), ["student_id"], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table("parent_links", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_parent_links_student_id"))
    op.drop_table("parent_links")
