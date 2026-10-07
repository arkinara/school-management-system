"""attendances.recorded_at

Revision ID: c50f0a1c2d3e
Revises: b49f0a1c2d3e
Create Date: 2026-10-07 01:30:00.000000

Ticket #50: the attendance edit-window needs to know when a record was written,
so add a non-null ``recorded_at`` defaulting to now. Existing rows are stamped
with the migration time.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c50f0a1c2d3e"
down_revision: str | None = "b49f0a1c2d3e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("attendances", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "recorded_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("attendances", schema=None) as batch_op:
        batch_op.drop_column("recorded_at")
