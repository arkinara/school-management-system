"""Alembic data-migration tests (ticket #44).

Runs the real Alembic chain against a throwaway SQLite file: upgrade to the
previous head, insert legacy rows, upgrade to the new head, and assert the
values were normalised. Downgrade is checked for reversibility.
"""

from __future__ import annotations

import os
from pathlib import Path

from alembic.config import Config
from sqlalchemy import create_engine, text

from alembic import command

OLD_HEAD = "b2c3d4e5f6a7"
NEW_HEAD = "c3d4e5f6a7b8"


def _config(db_path: str) -> Config:
    cfg = Config("alembic.ini")
    cfg.set_main_option("script_location", str(Path("alembic").resolve()))
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")
    return cfg


def _run(db_path: str, direction: str, revision: str) -> None:
    cfg = _config(db_path)
    previous = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"
    try:
        if direction == "upgrade":
            command.upgrade(cfg, revision)
        else:
            command.downgrade(cfg, revision)
    finally:
        if previous is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous


def _seed_legacy(db_path: str) -> None:
    _run(db_path, "upgrade", OLD_HEAD)
    engine = create_engine(f"sqlite:///{db_path}")
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO schedules (id, class_id, subject_id, teacher_id, "
                "day_of_week, period_number, start_time, end_time) VALUES "
                "(1, 1, 1, 1, 'Senin', 1, '07:00:00', '07:45:00')"
            )
        )
        conn.execute(
            text(
                "INSERT INTO grades (id, student_id, subject_id, semester, category, "
                "score, description, recorded_by) VALUES "
                "(1, 1, 1, 'ganjil', 'formatif', 80, NULL, 1)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO report_cards (id, student_id, semester, status, "
                "kurikulum_version, compiled_data, finalized_by, published_at) VALUES "
                "(1, 1, 'genap', 'draft', 'K', NULL, NULL, NULL)"
            )
        )
    engine.dispose()


def test_semester_migration(tmp_path: Path) -> None:
    db_path = str(tmp_path / "semester.db")
    _seed_legacy(db_path)
    _run(db_path, "upgrade", "head")

    engine = create_engine(f"sqlite:///{db_path}")
    with engine.connect() as conn:
        grades = conn.execute(text("SELECT semester FROM grades")).scalars().all()
        report_cards = conn.execute(text("SELECT semester FROM report_cards")).scalars().all()
    engine.dispose()

    assert grades == ["2026/2027-ganjil"]
    assert report_cards == ["2026/2027-genap"]


def test_day_of_week_migration(tmp_path: Path) -> None:
    db_path = str(tmp_path / "day.db")
    _seed_legacy(db_path)
    _run(db_path, "upgrade", "head")

    engine = create_engine(f"sqlite:///{db_path}")
    with engine.connect() as conn:
        days = conn.execute(text("SELECT day_of_week FROM schedules")).scalars().all()
        column_type = conn.execute(text("PRAGMA table_info(schedules)")).all()
    engine.dispose()

    assert days == [1]
    day_info = next(row for row in column_type if row[1] == "day_of_week")
    assert "INT" in str(day_info[2]).upper()


def test_migration_is_reversible(tmp_path: Path) -> None:
    db_path = str(tmp_path / "roundtrip.db")
    _seed_legacy(db_path)
    _run(db_path, "upgrade", "head")
    _run(db_path, "downgrade", OLD_HEAD)

    engine = create_engine(f"sqlite:///{db_path}")
    with engine.connect() as conn:
        days = conn.execute(text("SELECT day_of_week FROM schedules")).scalars().all()
        semesters = conn.execute(text("SELECT semester FROM grades")).scalars().all()
    engine.dispose()

    assert days == ["Senin"]
    assert semesters == ["ganjil"]
