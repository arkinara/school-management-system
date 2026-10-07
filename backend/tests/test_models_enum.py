"""Schema integrity tests (ticket #46).

Verifies CHECK constraints on enum columns reject invalid values at
the database level. Uses the alembic migration chain (not
create_all) so the CHECK constraints are actually present.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError
from alembic.config import Config
from alembic import command


def _run_alembic(db_path: str) -> None:
    """Run alembic upgrade head against a fresh DB."""
    backend_dir = Path(__file__).resolve().parent.parent
    cfg = Config(str(backend_dir / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")
    previous = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"
    try:
        command.upgrade(cfg, "head")
    finally:
        if previous is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous


def _insert_attendance(db_path: str, status: str) -> bool:
    engine = create_engine(f"sqlite:///{db_path}")
    try:
        with engine.begin() as conn:
            try:
                conn.execute(
                    text(
                        "INSERT INTO attendances (student_id, class_id, date, status, recorded_by) "
                        "VALUES (1, 1, '2026-10-01', :s, 1)"
                    ),
                    {"s": status},
                )
                return True
            except IntegrityError:
                return False
    finally:
        engine.dispose()


def _try_insert(db_path: str, sql: str) -> bool:
    """Try an INSERT, return True if succeeded, False if IntegrityError."""
    engine = create_engine(f"sqlite:///{db_path}")
    try:
        with engine.begin() as conn:
            try:
                conn.execute(text(sql))
                return True
            except IntegrityError:
                return False
    finally:
        engine.dispose()


@pytest.fixture
def db_with_constraints(tmp_path):
    """Return path to a fresh DB with the full schema (including CHECK constraints)."""
    db_path = str(tmp_path / "test.db")
    _run_alembic(db_path)
    return db_path


def test_attendance_invalid_status_rejected(db_with_constraints):
    assert _insert_attendance(db_with_constraints, "bogus") is False


def test_attendance_valid_status_accepted(db_with_constraints):
    # Note: this test only verifies that the CHECK constraint accepts valid
    # status values. Foreign key constraints on student_id/class_id/recorded_by
    # are exercised in test_attendances.py; we use a transaction that rolls back
    # so we don't pollute the schema.
    engine = create_engine(f"sqlite:///{db_with_constraints}")
    try:
        with engine.begin() as conn:
            # Insert a minimal user/school/class to satisfy FKs
            conn.execute(text("INSERT INTO tenants (id, name, jenjang_type, kurikulum_version, created_at) VALUES (1, 'T', 'TK', 'K', '2026-10-01 00:00:00')"))
            conn.execute(text("INSERT INTO schools (id, tenant_id, name, address, created_at) VALUES (1, 1, 'S', 'A', '2026-10-01 00:00:00')"))
            conn.execute(text("INSERT INTO users (id, tenant_id, school_id, email, hashed_auth_ref, role, full_name, created_at) VALUES (1, 1, 1, 'u@x', 'h', 'admin', 'U', '2026-10-01 00:00:00')"))
            for i, s in enumerate(("hadir", "izin", "sakit", "alpa")):
                try:
                    conn.execute(
                        text(
                            "INSERT INTO attendances (student_id, class_id, date, status, recorded_by) "
                            "VALUES (1, 1, :d, :s, 1)"
                        ),
                        {"d": f"2026-10-0{i+1}", "s": s},
                    )
                except Exception as e:
                    # FK on student_id is expected to fail (no student row)
                    # We're only checking the CHECK constraint on status
                    if "FOREIGN KEY" not in str(e):
                        raise
        # We don't assert here — the point is just that the CHECK doesn't reject
        # valid status. (FK failures are expected because we didn't seed a student.)
    finally:
        engine.dispose()


def test_grade_score_above_100_rejected(db_with_constraints):
    assert _try_insert(
        db_with_constraints,
        "INSERT INTO grades (student_id, subject_id, semester, category, score, recorded_by) "
        "VALUES (1, 1, '2026/2027-ganjil', 'formatif', 150, 1)",
    ) is False


def test_grade_score_negative_rejected(db_with_constraints):
    assert _try_insert(
        db_with_constraints,
        "INSERT INTO grades (student_id, subject_id, semester, category, score, recorded_by) "
        "VALUES (1, 1, '2026/2027-ganjil', 'formatif', -1, 1)",
    ) is False


def test_spp_bill_negative_amount_rejected(db_with_constraints):
    assert _try_insert(
        db_with_constraints,
        "INSERT INTO spp_bills (student_id, period, amount, due_date, status, created_by) "
        "VALUES (1, '2026-10', -100, '2026-10-15', 'unpaid', 1)",
    ) is False


def test_spp_bill_invalid_status_rejected(db_with_constraints):
    assert _try_insert(
        db_with_constraints,
        "INSERT INTO spp_bills (student_id, period, amount, due_date, status, created_by) "
        "VALUES (1, '2026-10', 100000, '2026-10-15', 'bogus', 1)",
    ) is False


def test_user_role_invalid_rejected(db_with_constraints):
    assert _try_insert(
        db_with_constraints,
        "INSERT INTO users (tenant_id, school_id, email, hashed_auth_ref, role, full_name) "
        "VALUES (1, 1, 'bad@x.com', 'hash', 'bogus_role', 'Bad')",
    ) is False


def test_tenant_jenjang_invalid_rejected(db_with_constraints):
    assert _try_insert(
        db_with_constraints,
        "INSERT INTO tenants (name, jenjang_type, kurikulum_version) "
        "VALUES ('Bad', 'UNIVERSITY', 'K')",
    ) is False


def test_jenjang_type_no_university_in_enum():
    """Per ticket #46: JenjangType should not include UNIVERSITY."""
    from app.db.models import JenjangType
    assert JenjangType.TK.value == "TK"
    assert JenjangType.SD.value == "SD"
    assert JenjangType.SMP.value == "SMP"
    assert JenjangType.SMA.value == "SMA"
    # No University
    assert not hasattr(JenjangType, "UNIVERSITY")
    assert len(JenjangType) == 4
