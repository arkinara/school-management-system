"""add enum + numeric CHECK constraints

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-10-06 00:30:00.000000

Ticket #46: the ``Enum(..., native_enum=False)`` columns from the initial
schema did not carry a CHECK constraint, so raw SQL could store invalid values
(e.g. ``status='bogus'``). This migration first deletes any pre-existing invalid
rows, then adds explicit named CHECK constraints to every enum column plus the
numeric range guards for grades / SPP amounts.

SQLite cannot ``ALTER TABLE ... ADD CONSTRAINT``; ``batch_alter_table`` makes
Alembic recreate the table with the constraint in place, and the matching
``drop_constraint`` in :func:`downgrade` keeps the migration reversible.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d4e5f6a7b8c9"
down_revision: str | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# Invalid rows must be removed before the constraint is enforced.
_CLEANUP = [
    "DELETE FROM attendances WHERE status NOT IN ('hadir','izin','sakit','alpa')",
    "DELETE FROM grades WHERE category NOT IN ('formatif','sumatif','PR','tugas')",
    "DELETE FROM report_cards WHERE status NOT IN ('draft','published')",
    "DELETE FROM spp_bills WHERE status NOT IN ('unpaid','paid','overdue','partially_paid')",
    "DELETE FROM announcements WHERE audience NOT IN ('all','class','jenjang')",
    "DELETE FROM users WHERE role NOT IN "
    "('principal','teacher','student','parent','admin','super_admin')",
    "DELETE FROM tenants WHERE jenjang_type NOT IN ('TK','SD','SMP','SMA')",
]

# table -> [(constraint_name, condition), ...]
_CHECKS: dict[str, list[tuple[str, str]]] = {
    "attendances": [
        ("ck_attendances_status", "status IN ('hadir','izin','sakit','alpa')"),
    ],
    "grades": [
        ("ck_grades_category", "category IN ('formatif','sumatif','PR','tugas')"),
        ("ck_grades_score", "score >= 0 AND score <= 100"),
    ],
    "report_cards": [
        ("ck_report_cards_status", "status IN ('draft','published')"),
    ],
    "spp_bills": [
        ("ck_spp_bills_status", "status IN ('unpaid','paid','overdue','partially_paid')"),
        ("ck_spp_bills_amount", "amount >= 0"),
    ],
    "spp_payments": [
        ("ck_spp_payments_amount", "amount >= 0"),
    ],
    "announcements": [
        ("ck_announcements_audience", "audience IN ('all','class','jenjang')"),
    ],
    "users": [
        ("ck_users_role", "role IN "
         "('principal','teacher','student','parent','admin','super_admin')"),
    ],
    "tenants": [
        ("ck_tenants_jenjang", "jenjang_type IN ('TK','SD','SMP','SMA')"),
    ],
}


def upgrade() -> None:
    for statement in _CLEANUP:
        op.execute(statement)

    for table, checks in _CHECKS.items():
        with op.batch_alter_table(table, schema=None) as batch_op:
            for name, condition in checks:
                batch_op.create_check_constraint(name, condition)


def downgrade() -> None:
    for table, checks in _CHECKS.items():
        with op.batch_alter_table(table, schema=None) as batch_op:
            for name, _condition in checks:
                batch_op.drop_constraint(name, type_="check")
