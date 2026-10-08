"""rapor workflow: status enum, versioning, actors

Revision ID: b55a1c2d3e4f
Revises: a7b8c9d0e1f2
Create Date: 2026-10-08 00:00:00.000000

Ticket #55: introduces the draft → finalized → published → superseded rapor
workflow. Extends the status CHECK with ``finalized``/``superseded``, adds the
versioning and actor columns, and adds a partial unique index so at most one
non-superseded row exists per ``(student_id, semester)``. Existing published
rows are stamped so ``published_by``/``finalized_at`` are populated.

SQLite cannot ``ALTER TABLE ... ADD CONSTRAINT``; ``batch_alter_table`` recreates
the table with the new constraints, and :func:`downgrade` reverses it.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b55a1c2d3e4f"
down_revision: str | None = "a7b8c9d0e1f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ACTIVE = "status IN ('draft', 'finalized', 'published')"


def upgrade() -> None:
    with op.batch_alter_table("report_cards", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1"))
        )
        batch_op.add_column(sa.Column("superseded_by", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("finalized_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("published_by", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("deadline", sa.Date(), nullable=True))
        batch_op.add_column(sa.Column("gap_override_reason", sa.Text(), nullable=True))
        batch_op.drop_constraint("ck_report_cards_status", type_="check")
        batch_op.create_check_constraint(
            "ck_report_cards_status",
            "status IN ('draft', 'finalized', 'published', 'superseded')",
        )
        batch_op.create_foreign_key(
            "fk_report_cards_superseded_by", "report_cards", ["superseded_by"], ["id"]
        )
        batch_op.create_foreign_key(
            "fk_report_cards_published_by", "users", ["published_by"], ["id"]
        )

    # At most one active (non-superseded) version per student/semester.
    op.execute(
        "CREATE UNIQUE INDEX uq_report_card_active "
        "ON report_cards (student_id, semester) "
        f"WHERE {_ACTIVE}"
    )

    # Backfill actors for rows that were published before this workflow existed.
    op.execute(
        "UPDATE report_cards SET published_by = finalized_by WHERE status = 'published'"
    )
    op.execute(
        "UPDATE report_cards SET finalized_at = published_at WHERE status = 'published'"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_report_card_active")

    # Collapse workflow-only states so the old two-value CHECK stays satisfiable.
    op.execute(
        "UPDATE report_cards SET status = 'draft' "
        "WHERE status IN ('finalized', 'superseded')"
    )

    with op.batch_alter_table("report_cards", schema=None) as batch_op:
        batch_op.drop_constraint("fk_report_cards_published_by", type_="foreignkey")
        batch_op.drop_constraint("fk_report_cards_superseded_by", type_="foreignkey")
        batch_op.drop_constraint("ck_report_cards_status", type_="check")
        batch_op.create_check_constraint(
            "ck_report_cards_status", "status IN ('draft', 'published')"
        )
        batch_op.drop_column("gap_override_reason")
        batch_op.drop_column("deadline")
        batch_op.drop_column("published_by")
        batch_op.drop_column("finalized_at")
        batch_op.drop_column("superseded_by")
        batch_op.drop_column("version")
