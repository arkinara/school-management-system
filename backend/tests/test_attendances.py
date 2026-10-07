"""Integration tests for /api/attendances (ticket #14)."""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient
from passlib.hash import bcrypt
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token
from app.db.models import (
    Attendance,
    Class,
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
PARENT10 = _token(10, 1, 1, "parent")
STUDENT6 = _token(6, 1, 1, "student")

UNASSIGNED_TEACHER = _token(50, 1, 1, "teacher")


def _add_unassigned_teacher(db_session: Session) -> None:
    db_session.add(
        User(
            id=50,
            tenant_id=1,
            school_id=1,
            email="unassigned@menteng.sch.id",
            hashed_auth_ref=bcrypt.hash(SEED_PASSWORD),
            role=UserRole.TEACHER,
            full_name="Guru Lepas",
        )
    )
    db_session.commit()


def _add_other_tenant(db_session: Session) -> None:
    db_session.add_all(
        [
            Tenant(id=2, name="SMP Lain", jenjang_type=JenjangType.SMP, kurikulum_version="K13"),
            School(
                id=2,
                tenant_id=2,
                name="SMP Lain 02",
                address="Jl. Lain",
                kurikulum_version="K13",
            ),
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


def test_teacher_creates_single_attendance(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/attendances",
        headers=_auth(TEACHER4),
        json={
            "student_id": 1,
            "class_id": 1,
            "date": "2024-09-01",
            "status": "sakit",
            "note": "demam",
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "sakit"
    assert body["recorded_by"] == 4
    assert body["note"] == "demam"


def test_invalid_status_rejected(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/attendances",
        headers=_auth(TEACHER4),
        json={"student_id": 1, "class_id": 1, "date": "2024-09-03", "status": "bolos"},
    )
    assert response.status_code == 422


def test_bulk_attendance_creates_all(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/attendances/bulk",
        headers=_auth(TEACHER4),
        json={
            "class_id": 1,
            "date": "2024-09-02",
            "entries": [
                {"student_id": 1, "status": "hadir"},
                {"student_id": 2, "status": "izin", "note": "acara keluarga"},
            ],
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["created"] == 2

    listing = client.get(
        "/api/attendances?class_id=1&date=2024-09-02", headers=_auth(TEACHER4)
    )
    assert listing.status_code == 200
    assert listing.json()["total"] == 2


def test_bulk_rejects_student_from_other_class(
    client: TestClient, db_session: Session
) -> None:
    response = client.post(
        "/api/attendances/bulk",
        headers=_auth(TEACHER4),
        json={
            "class_id": 1,
            "date": "2024-09-04",
            "entries": [{"student_id": 3, "status": "hadir"}],
        },
    )
    assert response.status_code == 422


def test_cross_class_write_blocked(client: TestClient, db_session: Session) -> None:
    _add_unassigned_teacher(db_session)
    response = client.post(
        "/api/attendances",
        headers=_auth(UNASSIGNED_TEACHER),
        json={"student_id": 1, "class_id": 1, "date": "2024-09-05", "status": "hadir"},
    )
    assert response.status_code == 403


def test_duplicate_attendance_rejected(client: TestClient, db_session: Session) -> None:
    today = date.today().isoformat()
    response = client.post(
        "/api/attendances",
        headers=_auth(TEACHER4),
        json={"student_id": 1, "class_id": 1, "date": today, "status": "hadir"},
    )
    assert response.status_code == 409


def test_parent_sees_only_own_children(client: TestClient, db_session: Session) -> None:
    _link_parent(client, 1, 10)
    response = client.get("/api/attendances", headers=_auth(PARENT10))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] >= 1
    assert all(item["student_id"] == 1 for item in body["items"])


def test_today_summary_returns_counts(client: TestClient, db_session: Session) -> None:
    response = client.get("/api/attendances/today", headers=_auth(TEACHER4))
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body["counts"]) == {"hadir", "izin", "sakit", "alpa"}
    assert body["total"] == sum(body["counts"].values())


def test_tenant_boundary_on_class_filter(client: TestClient, db_session: Session) -> None:
    _add_other_tenant(db_session)
    response = client.get("/api/attendances?class_id=10", headers=_auth(ADMIN))
    assert response.status_code == 403


def test_student_attendances_cross_tenant_blocked(
    client: TestClient, db_session: Session
) -> None:
    _add_other_tenant(db_session)
    response = client.get("/api/attendances/student/20", headers=_auth(PRINCIPAL))
    assert response.status_code == 403


def test_teacher_updates_attendance(client: TestClient, db_session: Session) -> None:
    response = client.patch(
        "/api/attendances/1", headers=_auth(TEACHER4), json={"status": "izin"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "izin"

    db_session.expire_all()
    record = db_session.get(Attendance, 1)
    assert record is not None
    assert str(record.status) == "izin"


def test_teacher_cannot_update_outside_class(client: TestClient, db_session: Session) -> None:
    _add_unassigned_teacher(db_session)
    response = client.patch(
        "/api/attendances/1", headers=_auth(UNASSIGNED_TEACHER), json={"status": "izin"}
    )
    assert response.status_code == 403


def test_delete_requires_admin(client: TestClient, db_session: Session) -> None:
    assert client.delete("/api/attendances/3", headers=_auth(TEACHER4)).status_code == 403
    assert client.delete("/api/attendances/3", headers=_auth(ADMIN)).status_code == 204


def test_student_can_read_own_attendance(client: TestClient, db_session: Session) -> None:
    own = client.get("/api/attendances/student/1", headers=_auth(STUDENT6))
    assert own.status_code == 200, own.text
    other = client.get("/api/attendances/student/3", headers=_auth(STUDENT6))
    assert other.status_code == 403
