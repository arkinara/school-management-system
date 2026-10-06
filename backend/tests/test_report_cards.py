"""Integration tests for /api/report-cards (ticket #18)."""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient
from passlib.hash import bcrypt
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token
from app.db.models import (
    Attendance,
    AttendanceStatus,
    Class,
    Grade,
    GradeCategory,
    JenjangType,
    ReportCard,
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


ADMIN = _token(2, 1, 1, "admin")
PRINCIPAL = _token(3, 1, 1, "principal")
TEACHER4 = _token(4, 1, 1, "teacher")
PARENT10 = _token(10, 1, 1, "parent")
STUDENT6 = _token(6, 1, 1, "student")

SMP_TEACHER = _token(201, 2, 2, "teacher")


def _add_smp_tenant(db_session: Session) -> None:
    """Seed a second, SMP tenant with a class, student, subject and grades."""
    db_session.add(
        Tenant(
            id=2,
            name="SMP Lain",
            jenjang_type=JenjangType.SMP,
            kurikulum_version="K13",
            config={"fase": "D"},
        )
    )
    db_session.add(School(id=2, tenant_id=2, name="SMP Lain 02", address="Jl. Lain"))
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
                email="teacher2@other.sch.id",
                hashed_auth_ref=bcrypt.hash(SEED_PASSWORD),
                role=UserRole.TEACHER,
                full_name="Teacher Other",
            ),
            User(
                id=202,
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
    db_session.add(
        Class(
            id=10,
            school_id=2,
            name="7A",
            grade_level=7,
            wali_kelas_id=201,
            academic_year="2024/2025",
        )
    )
    db_session.add(Subject(id=30, tenant_id=2, name="Matematika", category="formal"))
    db_session.add(Student(id=20, user_id=202, school_id=2, class_id=10, nis="OTHER001"))
    db_session.flush()
    db_session.add(
        Grade(
            id=100,
            student_id=20,
            subject_id=30,
            semester="2026/2027-ganjil",
            category=GradeCategory.FORMATIF,
            score=85,
            description="Baik",
            recorded_by=201,
        )
    )
    db_session.add(
        Attendance(
            id=100,
            student_id=20,
            class_id=10,
            date=date.today(),
            status=AttendanceStatus.HADIR,
            recorded_by=201,
        )
    )
    db_session.commit()


def _link_parent(client: TestClient, student_id: int, parent_id: int) -> None:
    response = client.post(
        f"/api/students/{student_id}/parents",
        headers=_auth(PRINCIPAL),
        json={"parent_user_id": parent_id, "is_primary": True},
    )
    assert response.status_code == 201, response.text


def _compile(client: TestClient, token: str, student_id: int, semester: str = "2026/2027-ganjil"):
    return client.post(
        "/api/report-cards/compile",
        headers=_auth(token),
        json={
            "student_id": student_id,
            "semester": semester,
            "kurikulum_version": "Merdeka 2024",
        },
    )


def test_compile_creates_sd_narrative_draft(client: TestClient, db_session: Session) -> None:
    response = _compile(client, TEACHER4, 1)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "draft"
    assert body["id"] == 1
    compiled = body["compiled_data"]
    assert compiled["jenjang"] == "SD"
    assert compiled["fase"] == "A"
    assert len(compiled["capaian_pembelajaran"]) == 3
    assert "kehadiran" in compiled


def test_compile_is_idempotent(client: TestClient, db_session: Session) -> None:
    first = _compile(client, TEACHER4, 1)
    second = _compile(client, TEACHER4, 1)
    assert first.status_code == 201 and second.status_code == 201
    assert first.json()["id"] == second.json()["id"]

    db_session.expire_all()
    count = db_session.scalar(
        select(func.count())
        .select_from(ReportCard)
        .where(ReportCard.student_id == 1, ReportCard.semester == "2026/2027-ganjil")
    )
    assert count == 1


def test_compile_smp_numeric(client: TestClient, db_session: Session) -> None:
    _add_smp_tenant(db_session)
    response = _compile(client, SMP_TEACHER, 20)
    assert response.status_code == 201, response.text
    compiled = response.json()["compiled_data"]
    assert compiled["jenjang"] == "SMP"
    assert compiled["fase"] == "D"
    assert compiled["nilai"][0]["score"] == 85
    assert compiled["kehadiran"]["hadir"] == 1


def test_compile_cross_tenant_blocked(client: TestClient, db_session: Session) -> None:
    _add_smp_tenant(db_session)
    response = _compile(client, TEACHER4, 20)
    assert response.status_code == 403


def test_parent_cannot_see_draft(client: TestClient, db_session: Session) -> None:
    _link_parent(client, 1, 10)
    detail = client.get("/api/report-cards/1", headers=_auth(PARENT10))
    assert detail.status_code == 403
    listing = client.get("/api/report-cards", headers=_auth(PARENT10))
    assert listing.status_code == 200
    assert listing.json()["total"] == 0


def test_publish_makes_visible_to_parent(client: TestClient, db_session: Session) -> None:
    _link_parent(client, 1, 10)
    published = client.patch("/api/report-cards/1/publish", headers=_auth(TEACHER4))
    assert published.status_code == 200, published.text
    assert published.json()["status"] == "published"
    assert published.json()["published_at"] is not None

    detail = client.get("/api/report-cards/1", headers=_auth(PARENT10))
    assert detail.status_code == 200, detail.text
    assert detail.json()["status"] == "published"


def test_unpublish_hides_from_parent(client: TestClient, db_session: Session) -> None:
    _link_parent(client, 1, 10)
    assert (
        client.patch("/api/report-cards/1/publish", headers=_auth(TEACHER4)).status_code
        == 200
    )
    assert (
        client.patch("/api/report-cards/1/unpublish", headers=_auth(ADMIN)).status_code
        == 200
    )
    assert client.get("/api/report-cards/1", headers=_auth(PARENT10)).status_code == 403


def test_publish_forbidden_for_student(client: TestClient, db_session: Session) -> None:
    assert (
        client.patch("/api/report-cards/1/publish", headers=_auth(STUDENT6)).status_code
        == 403
    )


def test_unpublish_requires_admin(client: TestClient, db_session: Session) -> None:
    assert (
        client.patch("/api/report-cards/1/unpublish", headers=_auth(TEACHER4)).status_code
        == 403
    )


def test_cross_tenant_get_blocked(client: TestClient, db_session: Session) -> None:
    _add_smp_tenant(db_session)
    compiled = _compile(client, SMP_TEACHER, 20)
    assert compiled.status_code == 201
    foreign_id = compiled.json()["id"]
    assert (
        client.get(f"/api/report-cards/{foreign_id}", headers=_auth(PRINCIPAL)).status_code
        == 403
    )


def test_delete_requires_admin(client: TestClient, db_session: Session) -> None:
    assert client.delete("/api/report-cards/2", headers=_auth(TEACHER4)).status_code == 403
    assert client.delete("/api/report-cards/2", headers=_auth(ADMIN)).status_code == 204
