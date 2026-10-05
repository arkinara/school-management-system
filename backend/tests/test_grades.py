"""Integration tests for /api/grades (ticket #16)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from passlib.hash import bcrypt
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token
from app.db.models import (
    Class,
    Grade,
    JenjangType,
    School,
    Student,
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
TEACHER5 = _token(5, 1, 1, "teacher")
PARENT10 = _token(10, 1, 1, "parent")
STUDENT6 = _token(6, 1, 1, "student")


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
                email="student2@other.sch.id",
                hashed_auth_ref=bcrypt.hash(SEED_PASSWORD),
                role=UserRole.STUDENT,
                full_name="Student Other",
            ),
        ]
    )
    db_session.flush()
    db_session.add(Class(id=10, school_id=2, name="7A", grade_level=7, academic_year="2024/2025"))
    db_session.add(Student(id=20, user_id=201, school_id=2, class_id=10, nis="OTHER001"))
    db_session.commit()


def _link_parent(client: TestClient, student_id: int, parent_id: int) -> None:
    response = client.post(
        f"/api/students/{student_id}/parents",
        headers=_auth(PRINCIPAL),
        json={"parent_user_id": parent_id, "is_primary": True},
    )
    assert response.status_code == 201, response.text


def test_teacher_creates_grade(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/grades",
        headers=_auth(TEACHER4),
        json={
            "student_id": 1,
            "subject_id": 1,
            "semester": "ganjil",
            "category": "sumatif",
            "score": 88,
            "description": "Sangat baik",
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["score"] == 88
    assert body["recorded_by"] == 4


def test_bulk_grade_entry(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/grades/bulk",
        headers=_auth(TEACHER4),
        json={
            "class_id": 1,
            "subject_id": 2,
            "semester": "ganjil",
            "category": "tugas",
            "entries": [
                {"student_id": 1, "score": 80},
                {"student_id": 2, "score": 90, "description": "rajin"},
            ],
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["created"] == 2


def test_bulk_rejects_student_from_other_class(
    client: TestClient, db_session: Session
) -> None:
    response = client.post(
        "/api/grades/bulk",
        headers=_auth(TEACHER4),
        json={
            "class_id": 1,
            "subject_id": 2,
            "semester": "ganjil",
            "category": "tugas",
            "entries": [{"student_id": 3, "score": 80}],
        },
    )
    assert response.status_code == 422


def test_score_range_validation(client: TestClient, db_session: Session) -> None:
    for score in (101, -1):
        response = client.post(
            "/api/grades",
            headers=_auth(TEACHER4),
            json={
                "student_id": 1,
                "subject_id": 1,
                "semester": "ganjil",
                "category": "formatif",
                "score": score,
            },
        )
        assert response.status_code == 422, response.text


def test_category_validation(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/grades",
        headers=_auth(TEACHER4),
        json={
            "student_id": 1,
            "subject_id": 1,
            "semester": "ganjil",
            "category": "ujian",
            "score": 80,
        },
    )
    assert response.status_code == 422


def test_aggregate_returns_per_subject_and_overall(
    client: TestClient, db_session: Session
) -> None:
    response = client.get(
        "/api/grades/aggregate?student_id=1&semester=ganjil", headers=_auth(TEACHER4)
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 3
    assert len(body["per_subject"]) == 3
    assert body["overall_average"] is not None


def test_aggregate_empty_semester_returns_empty(
    client: TestClient, db_session: Session
) -> None:
    response = client.get(
        "/api/grades/aggregate?student_id=1&semester=genap", headers=_auth(TEACHER4)
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 0
    assert body["per_subject"] == []
    assert body["overall_average"] is None


def test_parent_sees_only_own_children(client: TestClient, db_session: Session) -> None:
    _link_parent(client, 1, 10)
    own = client.get("/api/grades?student_id=1", headers=_auth(PARENT10))
    assert own.status_code == 200, own.text
    assert all(item["student_id"] == 1 for item in own.json()["items"])

    other = client.get("/api/grades?student_id=3", headers=_auth(PARENT10))
    assert other.status_code == 403


def test_student_can_read_own_grades(client: TestClient, db_session: Session) -> None:
    own = client.get("/api/grades/student/1", headers=_auth(STUDENT6))
    assert own.status_code == 200, own.text
    other = client.get("/api/grades/student/2", headers=_auth(STUDENT6))
    assert other.status_code == 403


def test_teacher_can_only_modify_own_grades(
    client: TestClient, db_session: Session
) -> None:
    forbidden = client.patch(
        "/api/grades/1", headers=_auth(TEACHER5), json={"score": 50}
    )
    assert forbidden.status_code == 403

    allowed = client.patch(
        "/api/grades/1", headers=_auth(TEACHER4), json={"score": 91}
    )
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["score"] == 91


def test_delete_requires_admin(client: TestClient, db_session: Session) -> None:
    assert client.delete("/api/grades/1", headers=_auth(TEACHER4)).status_code == 403
    assert client.delete("/api/grades/1", headers=_auth(ADMIN)).status_code == 204
    db_session.expire_all()
    assert db_session.get(Grade, 1) is None


def test_cross_tenant_blocked(client: TestClient, db_session: Session) -> None:
    _add_other_tenant(db_session)
    assert (
        client.get("/api/grades?student_id=20", headers=_auth(PRINCIPAL)).status_code == 403
    )
    assert (
        client.get("/api/grades/student/20", headers=_auth(PRINCIPAL)).status_code == 403
    )


def test_super_admin_sees_all_tenants(client: TestClient, db_session: Session) -> None:
    _add_other_tenant(db_session)
    response = client.get("/api/grades?student_id=20", headers=_auth(SUPER))
    assert response.status_code == 200
    assert response.json()["total"] == 0
