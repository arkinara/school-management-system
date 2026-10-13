"""audit log fixes: structured resource/outcome columns + backfill

Revision ID: f63a1b2c3d4e
Revises: b61a2c3d4e5f
Create Date: 2026-10-13 00:00:00.000000

Ticket #63. The legacy ``audit_logs`` schema folded the entity reference into a
free-text ``reason`` string (``entity=<type>:<id>``). This migration promotes
that data into first-class ``resource_type``/``resource_id`` columns, adds the
security-outcome columns (``outcome``, ``reason_code``, ``ip_address``,
``user_agent``) plus JSON ``before``/``after`` snapshots, and backfills the new
resource columns from the legacy ``reason`` text. A CHECK constraint pins
``outcome`` to ``success | denied | error``.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f63a1b2c3d4e"
down_revision: str | None = "b61a2c3d4e5f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_NEW_COLUMNS = [
    ("user_agent", sa.String(length=500)),
    ("ip_address", sa.String(length=45)),
    ("reason_code", sa.String(length=50)),
    ("outcome", sa.String(length=20)),
    ("after", sa.JSON()),
    ("before", sa.JSON()),
    ("resource_id", sa.Integer()),
    ("resource_type", sa.String(length=50)),
]

_INDEXES = [
    ("ix_audit_logs_resource_type", "resource_type"),
    ("ix_audit_logs_resource_id", "resource_id"),
    ("ix_audit_logs_reason_code", "reason_code"),
    ("ix_audit_logs_tenant_id", "tenant_id"),
    ("ix_audit_logs_school_id", "school_id"),
]


def _backfill_resources() -> None:
    """Parse legacy ``entity=<type>:<id>`` reasons into structured columns."""
    bind = op.get_bind()
    rows = bind.execute(
        sa.text("SELECT id, reason FROM audit_logs WHERE reason LIKE 'entity=%'")
    ).fetchall()
    for row_id, reason in rows:
        entity_type: str | None = None
        entity_id: int | None = None
        for part in str(reason).split("; "):
            if not part.startswith("entity="):
                continue
            token = part[len("entity=") :]
            head, _, tail = token.partition(":")
            entity_type = head or None
            if tail.strip():
                try:
                    entity_id = int(tail.strip())
                except ValueError:
                    entity_id = None
        if entity_type is None and entity_id is None:
            continue
        bind.execute(
            sa.text(
                "UPDATE audit_logs SET resource_type = :rt, resource_id = :rid "
                "WHERE id = :id"
            ),
            {"rt": entity_type, "rid": entity_id, "id": row_id},
        )


def upgrade() -> None:
    for name, column_type in _NEW_COLUMNS:
        if name == "outcome":
            op.add_column(
                "audit_logs",
                sa.Column(name, column_type, nullable=False, server_default="success"),
            )
        else:
            op.add_column("audit_logs", sa.Column(name, column_type, nullable=True))

    _backfill_resources()

    with op.batch_alter_table("audit_logs", schema=None) as batch_op:
        batch_op.create_check_constraint(
            "ck_audit_log_outcome", "outcome IN ('success', 'denied', 'error')"
        )

    for index_name, column_name in _INDEXES:
        op.create_index(index_name, "audit_logs", [column_name])


def downgrade() -> None:
    for index_name, _column_name in reversed(_INDEXES):
        op.drop_index(index_name, table_name="audit_logs")

    with op.batch_alter_table("audit_logs", schema=None) as batch_op:
        batch_op.drop_constraint("ck_audit_log_outcome", type_="check")

    with op.batch_alter_table("audit_logs", schema=None) as batch_op:
        for name, _column_type in _NEW_COLUMNS:
            batch_op.drop_column(name)
