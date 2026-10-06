"""add token_denylist table

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-10-06 00:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "token_denylist",
        sa.Column("jti", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("jti"),
    )
    with op.batch_alter_table("token_denylist", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_token_denylist_expires_at"), ["expires_at"], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table("token_denylist", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_token_denylist_expires_at"))
    op.drop_table("token_denylist")
