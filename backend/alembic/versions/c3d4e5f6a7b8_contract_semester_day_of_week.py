"""contract: canonical semester + integer day_of_week

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-10-06 00:00:00.000000

Normalises legacy semester labels (``ganjil``/``genap``) to the canonical
``YYYY/YYYY-ganjil|genap`` form and converts ``schedules.day_of_week`` from a
free-text weekday name to the ISO integer (1=Mon … 7=Sun).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: str | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_LEGACY_YEAR = "2026/2027"
_DAY_TO_INT = {
    "senin": 1,
    "selasa": 2,
    "rabu": 3,
    "kamis": 4,
    "jumat": 5,
    "sabtu": 6,
    "minggu": 7,
}


def upgrade() -> None:
    # 1. Semester: "ganjil" -> "2026/2027-ganjil"
    op.execute(
        "UPDATE grades SET semester = "
        f"'{_LEGACY_YEAR}-' || semester WHERE semester IN ('ganjil', 'genap')"
    )
    op.execute(
        "UPDATE report_cards SET semester = "
        f"'{_LEGACY_YEAR}-' || semester WHERE semester IN ('ganjil', 'genap')"
    )

    # 2. day_of_week: normalise weekday names to numeric strings first so the
    #    batch type change can copy them into the new INTEGER column.
    case_expr = " ".join(
        f"WHEN '{name}' THEN '{value}'" for name, value in _DAY_TO_INT.items()
    )
    op.execute(
        f"UPDATE schedules SET day_of_week = CASE LOWER(day_of_week) {case_expr} "
        "ELSE day_of_week END"
    )
    with op.batch_alter_table("schedules", schema=None) as batch_op:
        batch_op.alter_column(
            "day_of_week",
            existing_type=sa.String(length=16),
            type_=sa.Integer(),
            existing_nullable=False,
        )


def downgrade() -> None:
    # 1. day_of_week: back to the weekday name string.
    case_expr = " ".join(
        f"WHEN {value} THEN '{name.title()}'" for name, value in _DAY_TO_INT.items()
    )
    with op.batch_alter_table("schedules", schema=None) as batch_op:
        batch_op.alter_column(
            "day_of_week",
            existing_type=sa.Integer(),
            type_=sa.String(length=16),
            existing_nullable=False,
        )
    op.execute(
        f"UPDATE schedules SET day_of_week = CASE CAST(day_of_week AS INTEGER) "
        f"{case_expr} ELSE day_of_week END"
    )

    # 2. Semester: strip the canonical prefix.
    op.execute(
        "UPDATE grades SET semester = REPLACE(semester, "
        f"'{_LEGACY_YEAR}-', '') WHERE semester LIKE '{_LEGACY_YEAR}-%'"
    )
    op.execute(
        "UPDATE report_cards SET semester = REPLACE(semester, "
        f"'{_LEGACY_YEAR}-', '') WHERE semester LIKE '{_LEGACY_YEAR}-%'"
    )
