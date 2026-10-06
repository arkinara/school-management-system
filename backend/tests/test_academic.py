"""Academic-period contract tests (ticket #44): canonical semester validation."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.academic import (
    ACTIVE_SEMESTER,
    make_semester,
    parse_semester,
    validate_semester,
)
from app.auth.jwt import create_access_token


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


TEACHER4 = create_access_token(4, 1, 1, "teacher")
PRINCIPAL = create_access_token(3, 1, 1, "principal")


def test_semester_helpers_round_trip() -> None:
    assert parse_semester("2026/2027-ganjil") == (2026, "ganjil")
    assert make_semester(2026, "genap") == "2026/2027-genap"
    assert validate_semester("2026/2027-ganjil") == "2026/2027-ganjil"


@pytest.mark.parametrize("bad", ["Fall 2026", "ganjil", "2026-2027-ganjil", "2026/2027-summer"])
def test_semester_validation_rejects_non_canonical_values(bad: str) -> None:
    with pytest.raises(ValueError):
        validate_semester(bad)


def test_semester_validation_rejects_non_canonical(
    client: TestClient, db_session: Session
) -> None:
    response = client.post(
        "/api/grades",
        headers=_auth(TEACHER4),
        json={
            "student_id": 1,
            "subject_id": 1,
            "semester": "Fall 2026",
            "category": "formatif",
            "score": 80,
        },
    )
    assert response.status_code == 422, response.text


def test_semester_accepts_canonical(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/grades",
        headers=_auth(TEACHER4),
        json={
            "student_id": 1,
            "subject_id": 1,
            "semester": "2026/2027-ganjil",
            "category": "formatif",
            "score": 80,
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["semester"] == "2026/2027-ganjil"


def test_report_card_rejects_non_canonical(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/report-cards/compile",
        headers=_auth(PRINCIPAL),
        json={
            "student_id": 1,
            "semester": "Ganjil 2026",
            "kurikulum_version": "Merdeka 2024",
        },
    )
    assert response.status_code == 422, response.text


def test_active_semester_endpoint(client: TestClient) -> None:
    response = client.get("/api/academic/active-semester")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["semester"] == ACTIVE_SEMESTER == "2026/2027-ganjil"
    assert body["academic_year"] == "2026/2027"
    assert body["term"] == "ganjil"


def test_seed_semester_is_canonical(db_session: Session) -> None:
    from sqlalchemy import select

    from app.db.models import Grade, ReportCard

    assert db_session.scalar(select(Grade.semester).limit(1)) == ACTIVE_SEMESTER
    assert db_session.scalar(select(ReportCard.semester).limit(1)) == ACTIVE_SEMESTER
