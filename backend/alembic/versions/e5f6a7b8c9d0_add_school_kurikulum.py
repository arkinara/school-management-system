"""add schools.kurikulum_version (inherited from tenant)

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-10-07 00:00:00.000000

Ticket #47: schools gain their own ``kurikulum_version`` so they can override the
tenant default. Existing rows are backfilled from the parent tenant, then the
column is made non-nullable.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e5f6a7b8c9d0"
down_revision: str | None = "d4e5f6a7b8c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("schools", sa.Column("kurikulum_version", sa.String(length=64), nullable=True))
    op.execute(
        "UPDATE schools SET kurikulum_version = "
        "(SELECT kurikulum_version FROM tenants WHERE tenants.id = schools.tenant_id)"
    )
    with op.batch_alter_table("schools", schema=None) as batch_op:
        batch_op.alter_column(
            "kurikulum_version",
            existing_type=sa.String(length=64),
            existing_nullable=True,
            nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("schools", schema=None) as batch_op:
        batch_op.drop_column("kurikulum_version")
