"""Integration tests for /api/schedules (ticket #20)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from passlib.hash import bcrypt
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token
from app.db.models import (
    Class,
    JenjangType,
    Schedule,
    School,
    Student,
    Subject,
    Tenant,
    User,
    UserRole,
)
from app.db.seed import SEED_PASSWORD


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _token(user_id: int, tenant_id: int | None, school_id: int | None, role: str) -> str:
    return create_access_token(user_id, tenant_id, school_id, role)


SUPER = _token(1, 1, None, "super_admin")
ADMIN = _token(2, 1, 1, "admin")
PRINCIPAL = _token(3, 1, 1, "principal")
TEACHER4 = _token(4, 1, 1, "teacher")


def _add_other_tenant(db_session: Session) -> None:
    db_session.add_all(
        [
            Tenant(id=2, name="SMP Lain", jenjang_type=JenjangType.SMP, kurikulum_version="K13"),
            School(id=2, tenant_id=2, name="SMP Lain 02", address="Jl. Lain"),
        ]
    )
    db_session.flush()
    db_session.add_all(
        [
            User(
                id=200,
                tenant_id=2,
                school_id=2,
                email="p2@other.sch.id",
                hashed_auth_ref=bcrypt.hash(SEED_PASSWORD),
                role=UserRole.PRINCIPAL,
                full_name="Principal Other",
            ),
            User(
                id=201,
                tenant_id=2,
                school_id=2,
                email="t2@other.sch.id",
                hashed_auth_ref=bcrypt.hash(SEED_PASSWORD),
                role=UserRole.TEACHER,
                full_name="Teacher Other",
            ),
        ]
    )
    db_session.flush()
    db_session.add(Class(id=10, school_id=2, name="7A", grade_level=7, academic_year="2024/2025"))
    db_session.add(Subject(id=20, tenant_id=2, name="Fisika", category="formal"))
    db_session.add(Student(id=20, user_id=201, school_id=2, class_id=10, nis="OTHER001"))
    db_session.commit()


def test_principal_creates_schedule(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/schedules",
        headers=_auth(PRINCIPAL),
        json={
            "class_id": 1,
            "subject_id": 1,
            "teacher_id": 4,
            "day_of_week": "Senin",
            "period_number": 5,
            "start_time": "10:00:00",
            "end_time": "10:45:00",
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["class_id"] == 1
    assert body["teacher_id"] == 4


def test_teacher_cannot_create_schedule(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/schedules",
        headers=_auth(TEACHER4),
        json={
            "class_id": 1,
            "subject_id": 1,
            "teacher_id": 4,
            "day_of_week": "Senin",
            "period_number": 6,
            "start_time": "11:00:00",
            "end_time": "11:45:00",
        },
    )
    assert response.status_code == 403


def test_class_slot_conflict_returns_409(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/schedules",
        headers=_auth(PRINCIPAL),
        json={
            "class_id": 1,
            "subject_id": 1,
            "teacher_id": 4,
            "day_of_week": "Rabu",
            "period_number": 1,
            "start_time": "07:00:00",
            "end_time": "07:45:00",
        },
    )
    assert response.status_code == 409, response.text
    assert "conflict" in response.json()["detail"]


def test_teacher_double_booking_returns_409(
    client: TestClient, db_session: Session
) -> None:
    response = client.post(
        "/api/schedules",
        headers=_auth(PRINCIPAL),
        json={
            "class_id": 3,
            "subject_id": 1,
            "teacher_id": 4,
            "day_of_week": "Kamis",
            "period_number": 5,
            "start_time": "08:00:00",
            "end_time": "08:45:00",
        },
    )
    assert response.status_code == 409, response.text


def test_adjacent_periods_do_not_conflict(
    client: TestClient, db_session: Session
) -> None:
    response = client.post(
        "/api/schedules",
        headers=_auth(PRINCIPAL),
        json={
            "class_id": 1,
            "subject_id": 1,
            "teacher_id": 4,
            "day_of_week": "Rabu",
            "period_number": 4,
            "start_time": "07:45:00",
            "end_time": "08:30:00",
        },
    )
    assert response.status_code == 201, response.text


def test_missing_field_is_422(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/schedules",
        headers=_auth(PRINCIPAL),
        json={
            "class_id": 1,
            "subject_id": 1,
            "day_of_week": "Senin",
            "period_number": 9,
            "start_time": "14:00:00",
            "end_time": "14:45:00",
        },
    )
    assert response.status_code == 422


def test_nonexistent_class_is_404(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/schedules",
        headers=_auth(PRINCIPAL),
        json={
            "class_id": 999,
            "subject_id": 1,
            "teacher_id": 4,
            "day_of_week": "Senin",
            "period_number": 1,
            "start_time": "06:00:00",
            "end_time": "06:45:00",
        },
    )
    assert response.status_code == 404


def test_bulk_create_and_rollback(client: TestClient, db_session: Session) -> None:
    ok = client.post(
        "/api/schedules/bulk",
        headers=_auth(PRINCIPAL),
        json={
            "class_id": 1,
            "schedules": [
                {
                    "subject_id": 1,
                    "teacher_id": 4,
                    "day_of_week": "Sabtu",
                    "period_number": 5,
                    "start_time": "10:00:00",
                    "end_time": "10:45:00",
                },
                {
                    "subject_id": 2,
                    "teacher_id": 5,
                    "day_of_week": "Sabtu",
                    "period_number": 6,
                    "start_time": "10:45:00",
                    "end_time": "11:30:00",
                },
            ],
        },
    )
    assert ok.status_code == 201, ok.text
    assert ok.json()["created"] == 2

    before = db_session.scalar(
        select(func.count()).select_from(Schedule).where(Schedule.day_of_week == "Minggu")
    )
    bad = client.post(
        "/api/schedules/bulk",
        headers=_auth(PRINCIPAL),
        json={
            "class_id": 1,
            "schedules": [
                {
                    "subject_id": 1,
                    "teacher_id": 4,
                    "day_of_week": "Minggu",
                    "period_number": 5,
                    "start_time": "10:00:00",
                    "end_time": "10:45:00",
                },
                {
                    "subject_id": 2,
                    "teacher_id": 5,
                    "day_of_week": "Minggu",
                    "period_number": 5,
                    "start_time": "10:00:00",
                    "end_time": "10:45:00",
                },
            ],
        },
    )
    assert bad.status_code == 409
    db_session.expire_all()
    after = db_session.scalar(
        select(func.count()).select_from(Schedule).where(Schedule.day_of_week == "Minggu")
    )
    assert after == before


def test_teacher_endpoint_returns_week(client: TestClient, db_session: Session) -> None:
    response = client.get("/api/schedules/teacher/4", headers=_auth(TEACHER4))
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body) >= 1
    assert all(item["teacher_id"] == 4 for item in body)


def test_class_endpoint_returns_week(client: TestClient, db_session: Session) -> None:
    response = client.get("/api/schedules/class/1", headers=_auth(PRINCIPAL))
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body) >= 3
    assert all(item["class_id"] == 1 for item in body)


def test_list_filter_and_pagination(client: TestClient, db_session: Session) -> None:
    response = client.get(
        "/api/schedules?class_id=1&page=1&size=2", headers=_auth(PRINCIPAL)
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] >= 3
    assert len(body["items"]) == 2
    assert all(item["class_id"] == 1 for item in body["items"])


def test_update_rechecks_conflict(client: TestClient, db_session: Session) -> None:
    created = client.post(
        "/api/schedules",
        headers=_auth(PRINCIPAL),
        json={
            "class_id": 1,
            "subject_id": 1,
            "teacher_id": 4,
            "day_of_week": "Minggu",
            "period_number": 5,
            "start_time": "10:00:00",
            "end_time": "10:45:00",
        },
    )
    assert created.status_code == 201, created.text
    schedule_id = created.json()["id"]

    conflict = client.patch(
        f"/api/schedules/{schedule_id}",
        headers=_auth(PRINCIPAL),
        json={"day_of_week": "Rabu", "period_number": 1},
    )
    assert conflict.status_code == 409

    moved = client.patch(
        f"/api/schedules/{schedule_id}",
        headers=_auth(PRINCIPAL),
        json={"day_of_week": "Sabtu", "period_number": 8},
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["day_of_week"] == "Sabtu"


def test_delete_requires_management(client: TestClient, db_session: Session) -> None:
    created = client.post(
        "/api/schedules",
        headers=_auth(PRINCIPAL),
        json={
            "class_id": 1,
            "subject_id": 1,
            "teacher_id": 4,
            "day_of_week": "Minggu",
            "period_number": 6,
            "start_time": "11:00:00",
            "end_time": "11:45:00",
        },
    )
    schedule_id = created.json()["id"]
    denied = client.delete(f"/api/schedules/{schedule_id}", headers=_auth(TEACHER4))
    assert denied.status_code == 403
    assert client.delete(f"/api/schedules/{schedule_id}", headers=_auth(ADMIN)).status_code == 204
    db_session.expire_all()
    assert db_session.get(Schedule, schedule_id) is None


def test_tenant_boundary_enforced(client: TestClient, db_session: Session) -> None:
    _add_other_tenant(db_session)
    create = client.post(
        "/api/schedules",
        headers=_auth(PRINCIPAL),
        json={
            "class_id": 10,
            "subject_id": 20,
            "teacher_id": 201,
            "day_of_week": "Senin",
            "period_number": 1,
            "start_time": "06:00:00",
            "end_time": "06:45:00",
        },
    )
    assert create.status_code == 403

    assert client.get("/api/schedules/class/10", headers=_auth(PRINCIPAL)).status_code == 403
    assert client.get("/api/schedules?class_id=10", headers=_auth(PRINCIPAL)).status_code == 403
    assert client.get("/api/schedules/class/10", headers=_auth(SUPER)).status_code == 200
