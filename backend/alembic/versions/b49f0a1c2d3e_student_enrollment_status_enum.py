"""students.enrollment_status enum normalisation

Revision ID: b49f0a1c2d3e
Revises: f6a7b8c9d0e1
Create Date: 2026-10-07 01:00:00.000000

Ticket #49: ``students.enrollment_status`` was an unvalidated free-text column.
This migration normalises any legacy value to one of
``active|inactive|graduated|transferred`` and shrinks the column to 20 chars.
SQLite cannot rename/drop columns in place, so ``batch_alter_table`` recreates
the table; the matching ``downgrade`` restores the 32-char free-text column.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b49f0a1c2d3e"
down_revision: str | None = "f6a7b8c9d0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_VALID = "'active','inactive','graduated','transferred'"


def upgrade() -> None:
    with op.batch_alter_table("students", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("enrollment_status_new", sa.String(length=20), nullable=True)
        )
    op.execute(
        "UPDATE students SET enrollment_status_new = "
        f"CASE WHEN enrollment_status IN ({_VALID}) THEN enrollment_status "
        "ELSE 'active' END"
    )
    with op.batch_alter_table("students", schema=None) as batch_op:
        batch_op.drop_column("enrollment_status")
    with op.batch_alter_table("students", schema=None) as batch_op:
        batch_op.alter_column(
            "enrollment_status_new",
            new_column_name="enrollment_status",
            existing_type=sa.String(length=20),
            nullable=False,
            server_default="active",
        )


def downgrade() -> None:
    with op.batch_alter_table("students", schema=None) as batch_op:
        batch_op.alter_column(
            "enrollment_status",
            existing_type=sa.String(length=20),
            type_=sa.String(length=32),
            nullable=False,
            server_default=None,
        )
