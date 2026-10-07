"""Integration tests for teacher assignments + teacher management (ticket #48)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from passlib.hash import bcrypt
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token
from app.db.models import Class, School, User, UserRole
from app.db.seed import SEED_PASSWORD


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _token(user_id: int, tenant_id: int | None, school_id: int | None, role: str) -> str:
    return create_access_token(user_id, tenant_id, school_id, role)


SUPER = _token(1, 1, None, "super_admin")
ADMIN = _token(2, 1, 1, "admin")
PRINCIPAL = _token(3, 1, 1, "principal")
TEACHER = _token(4, 1, 1, "teacher")


def _payload(**overrides) -> dict:
    body = {
        "teacher_id": 4,
        "subject_id": 1,
        "class_id": 1,
        "academic_year": "2026/2027",
    }
    body.update(overrides)
    return body


def _add_second_school_with_class_and_teacher(db_session: Session) -> None:
    db_session.add(
        School(
            id=2,
            tenant_id=1,
            name="SDN Menteng 02",
            address="Jl. Dua",
            kurikulum_version="Merdeka 2024",
        )
    )
    db_session.flush()
    db_session.add(
        User(
            id=201,
            tenant_id=1,
            school_id=2,
            email="teacher.b@menteng.sch.id",
            hashed_auth_ref=bcrypt.hash(SEED_PASSWORD),
            role=UserRole.TEACHER,
            full_name="Teacher B",
        )
    )
    db_session.flush()
    db_session.add(
        Class(id=10, school_id=2, name="1B", grade_level=1, academic_year="2026/2027")
    )
    db_session.commit()


def test_create_teacher_assignment(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/teacher-assignments", headers=_auth(PRINCIPAL), json=_payload()
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["teacher_id"] == 4
    assert body["subject_id"] == 1
    assert body["class_id"] == 1
    assert body["academic_year"] == "2026/2027"


def test_create_assignment_requires_teacher_role(
    client: TestClient, db_session: Session
) -> None:
    response = client.post(
        "/api/teacher-assignments",
        headers=_auth(PRINCIPAL),
        json=_payload(teacher_id=2),
    )
    assert response.status_code == 422, response.text


def test_create_assignment_cross_school_teacher_rejected(
    client: TestClient, db_session: Session
) -> None:
    _add_second_school_with_class_and_teacher(db_session)
    response = client.post(
        "/api/teacher-assignments",
        headers=_auth(PRINCIPAL),
        json=_payload(teacher_id=201),
    )
    assert response.status_code == 422, response.text


def test_create_assignment_non_admin_forbidden(
    client: TestClient, db_session: Session
) -> None:
    response = client.post(
        "/api/teacher-assignments", headers=_auth(TEACHER), json=_payload()
    )
    assert response.status_code == 403, response.text


def test_list_assignments_scoped_and_filtered(
    client: TestClient, db_session: Session
) -> None:
    client.post("/api/teacher-assignments", headers=_auth(PRINCIPAL), json=_payload())
    client.post(
        "/api/teacher-assignments",
        headers=_auth(PRINCIPAL),
        json=_payload(teacher_id=5, class_id=2),
    )
    response = client.get(
        "/api/teacher-assignments?teacher_id=4", headers=_auth(PRINCIPAL)
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body) == 1
    assert body[0]["teacher_id"] == 4


def test_get_teacher_returns_assignments(client: TestClient, db_session: Session) -> None:
    client.post("/api/teacher-assignments", headers=_auth(PRINCIPAL), json=_payload())
    response = client.get("/api/teachers/4", headers=_auth(PRINCIPAL))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["id"] == 4
    assert len(body["assignments"]) == 1
    assert body["assignments"][0]["class_id"] == 1


def test_get_teacher_cross_school_blocked(client: TestClient, db_session: Session) -> None:
    _add_second_school_with_class_and_teacher(db_session)
    response = client.get("/api/teachers/201", headers=_auth(PRINCIPAL))
    assert response.status_code == 404
