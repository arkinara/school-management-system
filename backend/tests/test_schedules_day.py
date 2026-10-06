"""Day-of-week contract tests (ticket #44): ISO integer enum + conflicts."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token
from app.db.models import Schedule


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


PRINCIPAL = create_access_token(3, 1, 1, "principal")


def test_day_of_week_enum_validation(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/schedules",
        headers=_auth(PRINCIPAL),
        json={
            "class_id": 1,
            "subject_id": 1,
            "teacher_id": 4,
            "day_of_week": "Senin",
            "period_number": 8,
            "start_time": "15:00:00",
            "end_time": "15:45:00",
        },
    )
    assert response.status_code == 422, response.text


def test_day_of_week_accepts_int(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/schedules",
        headers=_auth(PRINCIPAL),
        json={
            "class_id": 1,
            "subject_id": 1,
            "teacher_id": 4,
            "day_of_week": 1,
            "period_number": 8,
            "start_time": "15:00:00",
            "end_time": "15:45:00",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["day_of_week"] == 1


def test_day_of_week_conflict_detection(client: TestClient, db_session: Session) -> None:
    first = client.post(
        "/api/schedules",
        headers=_auth(PRINCIPAL),
        json={
            "class_id": 1,
            "subject_id": 1,
            "teacher_id": 4,
            "day_of_week": 2,
            "period_number": 8,
            "start_time": "15:00:00",
            "end_time": "15:45:00",
        },
    )
    assert first.status_code == 201, first.text

    conflict = client.post(
        "/api/schedules",
        headers=_auth(PRINCIPAL),
        json={
            "class_id": 1,
            "subject_id": 1,
            "teacher_id": 5,
            "day_of_week": 2,
            "period_number": 8,
            "start_time": "15:00:00",
            "end_time": "15:45:00",
        },
    )
    assert conflict.status_code == 409, conflict.text


def test_seed_day_of_week_is_int(db_session: Session) -> None:
    values = set(db_session.scalars(select(Schedule.day_of_week)).all())
    assert values
    assert all(isinstance(value, int) for value in values)
    assert all(1 <= value <= 7 for value in values)


def test_different_day_same_period_does_not_conflict(
    client: TestClient, db_session: Session
) -> None:
    response = client.post(
        "/api/schedules",
        headers=_auth(PRINCIPAL),
        json={
            "class_id": 1,
            "subject_id": 1,
            "teacher_id": 4,
            "day_of_week": 7,
            "period_number": 8,
            "start_time": "15:00:00",
            "end_time": "15:45:00",
        },
    )
    assert response.status_code == 201, response.text
