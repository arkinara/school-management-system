"""spp fixes: partially_paid, bill totals, per-school receipt sequence, void

Revision ID: c59a1b2c3d4e
Revises: b55a1c2d3e4f
Create Date: 2026-10-08 00:00:00.000000

Ticket #59. Adds denormalised ``paid_amount``/``balance`` to ``spp_bills``, makes
the SPP bill ``(student_id, period)`` pair unique, introduces a per-school receipt
number sequence (``school_receipt_counters``) with server-assigned integer
``spp_payments.receipt_no``, and adds soft-void columns to payments.

The status CHECK already permits ``partially_paid`` (ticket #46), so no enum
constraint change is needed. Uniqueness is enforced through explicit unique
indexes (rather than named constraints) so the migration round-trips cleanly on
SQLite.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c59a1b2c3d4e"
down_revision: str | None = "b55a1c2d3e4f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "school_receipt_counters",
        sa.Column("school_id", sa.Integer(), nullable=False),
        sa.Column("next_receipt_no", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"]),
        sa.PrimaryKeyConstraint("school_id"),
    )

    op.add_column(
        "spp_bills",
        sa.Column("paid_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
    )
    op.add_column(
        "spp_bills",
        sa.Column("balance", sa.Numeric(12, 2), nullable=False, server_default="0"),
    )

    op.add_column("spp_payments", sa.Column("school_id", sa.Integer(), nullable=True))
    op.add_column(
        "spp_payments",
        sa.Column("voided", sa.Boolean(), nullable=False, server_default="0"),
    )
    op.add_column("spp_payments", sa.Column("voided_at", sa.DateTime(), nullable=True))
    op.add_column("spp_payments", sa.Column("voided_by", sa.Integer(), nullable=True))
    op.add_column("spp_payments", sa.Column("void_reason", sa.Text(), nullable=True))

    # Derive each payment's school from its bill's student.
    op.execute(
        "UPDATE spp_payments SET school_id = ("
        "SELECT students.school_id FROM spp_bills "
        "JOIN students ON students.id = spp_bills.student_id "
        "WHERE spp_bills.id = spp_payments.bill_id)"
    )
    op.execute(
        "UPDATE spp_payments SET school_id = "
        "(SELECT school_id FROM schools ORDER BY id LIMIT 1) WHERE school_id IS NULL"
    )

    # Re-number legacy (string) receipts into per-school integers.
    op.add_column("spp_payments", sa.Column("receipt_seq", sa.Integer(), nullable=True))
    op.execute(
        "UPDATE spp_payments SET receipt_seq = ("
        "SELECT COUNT(*) FROM spp_payments p2 "
        "WHERE p2.school_id = spp_payments.school_id AND p2.id <= spp_payments.id)"
    )
    with op.batch_alter_table("spp_payments", schema=None) as batch_op:
        batch_op.drop_column("receipt_no")
        batch_op.alter_column(
            "receipt_seq",
            new_column_name="receipt_no",
            existing_type=sa.Integer(),
            nullable=False,
        )
        batch_op.alter_column("school_id", existing_type=sa.Integer(), nullable=False)

    op.create_index("ix_spp_payments_school_id", "spp_payments", ["school_id"])
    op.create_index(
        "uq_spp_payment_school_receipt",
        "spp_payments",
        ["school_id", "receipt_no"],
        unique=True,
    )

    # Seed counters so the next allocation follows existing receipts.
    op.execute(
        "INSERT INTO school_receipt_counters (school_id, next_receipt_no) "
        "SELECT school_id, MAX(receipt_no) + 1 FROM spp_payments GROUP BY school_id"
    )

    # Backfill bill totals from non-voided payments.
    op.execute(
        "UPDATE spp_bills SET paid_amount = COALESCE(("
        "SELECT SUM(amount) FROM spp_payments "
        "WHERE bill_id = spp_bills.id AND voided = 0), 0)"
    )
    op.execute("UPDATE spp_bills SET balance = amount - paid_amount")

    op.create_index(
        "uq_spp_bill_student_period",
        "spp_bills",
        ["student_id", "period"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_spp_bill_student_period", table_name="spp_bills")

    with op.batch_alter_table("spp_bills", schema=None) as batch_op:
        batch_op.drop_column("balance")
        batch_op.drop_column("paid_amount")

    op.drop_index("ix_spp_payments_school_id", table_name="spp_payments")
    op.drop_index("uq_spp_payment_school_receipt", table_name="spp_payments")

    op.add_column(
        "spp_payments", sa.Column("receipt_old", sa.String(length=64), nullable=True)
    )
    op.execute(
        "UPDATE spp_payments SET receipt_old = "
        "CAST(school_id AS TEXT) || '-' || CAST(receipt_no AS TEXT)"
    )
    with op.batch_alter_table("spp_payments", schema=None) as batch_op:
        batch_op.drop_column("receipt_no")
        batch_op.alter_column(
            "receipt_old",
            new_column_name="receipt_no",
            existing_type=sa.String(length=64),
            nullable=False,
        )
        batch_op.drop_column("school_id")
        batch_op.drop_column("voided")
        batch_op.drop_column("voided_at")
        batch_op.drop_column("voided_by")
        batch_op.drop_column("void_reason")

    op.create_index(
        "uq_spp_payments_receipt_no", "spp_payments", ["receipt_no"], unique=True
    )
    op.drop_table("school_receipt_counters")
