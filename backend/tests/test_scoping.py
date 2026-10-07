"""School-level scoping tests (ticket #41): two schools in one tenant.

Fixtures here build a second school *inside the same tenant* so every negative
test exercises the same-tenant cross-school boundary, not the tenant boundary
that earlier tickets already covered.
"""

from __future__ import annotations

import inspect

import pytest
from fastapi.routing import _IncludedRouter
from fastapi.testclient import TestClient
from passlib.hash import bcrypt
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token
from app.db.models import Class, School, Student, User, UserRole
from app.db.seed import SEED_PASSWORD
from app.main import app

SCHOOL_B = 2
CLASS_B = 20
STUDENT_B = 20
PARENT_B = 303
TEACHER_B = 301
PRINCIPAL_B = 300


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _token(user_id: int, tenant_id: int | None, school_id: int | None, role: str) -> str:
    return create_access_token(user_id, tenant_id, school_id, role)


PRINCIPAL_A = _token(3, 1, 1, "principal")
ADMIN_A = _token(2, 1, 1, "admin")
TEACHER_A = _token(4, 1, 1, "teacher")
STUDENT_A = _token(6, 1, 1, "student")
PARENT_A = _token(10, 1, 1, "parent")


@pytest.fixture
def school_b(db_session: Session) -> dict[str, int]:
    """Add a second school inside tenant 1 with a class, student and parent."""
    db_session.add(
        School(
            id=SCHOOL_B,
            tenant_id=1,
            name="SDN Menteng 02",
            address="Jl. Dua",
            kurikulum_version="Merdeka 2024",
        )
    )
    db_session.flush()
    db_session.add_all(
        [
            User(
                id=PRINCIPAL_B,
                tenant_id=1,
                school_id=SCHOOL_B,
                email="principal.b@menteng.sch.id",
                hashed_auth_ref=bcrypt.hash(SEED_PASSWORD),
                role=UserRole.PRINCIPAL,
                full_name="Principal B",
            ),
            User(
                id=TEACHER_B,
                tenant_id=1,
                school_id=SCHOOL_B,
                email="teacher.b@menteng.sch.id",
                hashed_auth_ref=bcrypt.hash(SEED_PASSWORD),
                role=UserRole.TEACHER,
                full_name="Teacher B",
            ),
            User(
                id=302,
                tenant_id=1,
                school_id=SCHOOL_B,
                email="student.b@menteng.sch.id",
                hashed_auth_ref=bcrypt.hash(SEED_PASSWORD),
                role=UserRole.STUDENT,
                full_name="Student B",
            ),
            User(
                id=PARENT_B,
                tenant_id=1,
                school_id=SCHOOL_B,
                email="parent.b@menteng.sch.id",
                hashed_auth_ref=bcrypt.hash(SEED_PASSWORD),
                role=UserRole.PARENT,
                full_name="Parent B",
            ),
        ]
    )
    db_session.flush()
    db_session.add(
        Class(
            id=CLASS_B,
            school_id=SCHOOL_B,
            name="7B",
            grade_level=7,
            academic_year="2024/2025",
        )
    )
    db_session.flush()
    db_session.add(
        Student(id=STUDENT_B, user_id=302, school_id=SCHOOL_B, class_id=CLASS_B, nis="B0001")
    )
    db_session.commit()
    return {"school": SCHOOL_B, "class": CLASS_B, "student": STUDENT_B, "parent": PARENT_B}


def test_principal_school_a_cannot_read_school_b_school(
    client: TestClient, db_session: Session, school_b: dict[str, int]
) -> None:
    response = client.get(f"/api/schools/{school_b['school']}", headers=_auth(PRINCIPAL_A))
    assert response.status_code == 404


def test_principal_school_a_lists_only_own_school(
    client: TestClient, db_session: Session, school_b: dict[str, int]
) -> None:
    response = client.get("/api/schools", headers=_auth(PRINCIPAL_A))
    assert response.status_code == 200, response.text
    ids = {item["id"] for item in response.json()["items"]}
    assert ids == {1}


def test_teacher_school_a_cannot_read_school_b_class(
    client: TestClient, db_session: Session, school_b: dict[str, int]
) -> None:
    response = client.get(f"/api/classes/{school_b['class']}", headers=_auth(TEACHER_A))
    assert response.status_code == 404


def test_teacher_school_a_list_classes_excludes_school_b(
    client: TestClient, db_session: Session, school_b: dict[str, int]
) -> None:
    response = client.get("/api/classes", headers=_auth(TEACHER_A))
    assert response.status_code == 200, response.text
    assert all(item["school_id"] == 1 for item in response.json()["items"])


def test_teacher_school_a_cannot_read_school_b_student(
    client: TestClient, db_session: Session, school_b: dict[str, int]
) -> None:
    response = client.get(f"/api/students/{school_b['student']}", headers=_auth(TEACHER_A))
    assert response.status_code == 403


def test_student_lists_only_self(client: TestClient, db_session: Session) -> None:
    response = client.get("/api/students", headers=_auth(STUDENT_A))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 1
    item = body["items"][0]
    assert item["user_id"] == 6
    assert item["email"] == "dewi@menteng.sch.id"


def test_student_cannot_read_other_student(client: TestClient, db_session: Session) -> None:
    assert client.get("/api/students/2", headers=_auth(STUDENT_A)).status_code == 403


def test_parent_reads_only_linked_children(client: TestClient, db_session: Session) -> None:
    response = client.get("/api/parents/11", headers=_auth(PARENT_A))
    assert response.status_code == 403


def test_parent_reads_only_own_children(client: TestClient, db_session: Session) -> None:
    linked = client.post(
        "/api/students/1/parents",
        headers=_auth(PRINCIPAL_A),
        json={"parent_user_id": 10, "relationship": "orang_tua"},
    )
    assert linked.status_code == 201, linked.text

    own = client.get("/api/parents/10/children", headers=_auth(PARENT_A))
    assert own.status_code == 200, own.text
    assert [child["id"] for child in own.json()] == [1]

    other = client.get("/api/parents/11/children", headers=_auth(PARENT_A))
    assert other.status_code == 403


def test_teacher_schedules_teacher_only_self(client: TestClient, db_session: Session) -> None:
    assert client.get("/api/schedules/teacher/4", headers=_auth(TEACHER_A)).status_code == 200
    assert client.get("/api/schedules/teacher/5", headers=_auth(TEACHER_A)).status_code == 403


def test_cross_school_parent_link_returns_422(
    client: TestClient, db_session: Session, school_b: dict[str, int]
) -> None:
    response = client.post(
        "/api/students/1/parents",
        headers=_auth(PRINCIPAL_A),
        json={"parent_user_id": school_b["parent"], "relationship": "wali"},
    )
    assert response.status_code == 422


def test_schedule_class_cross_school_blocked(
    client: TestClient, db_session: Session, school_b: dict[str, int]
) -> None:
    response = client.get(f"/api/schedules/class/{school_b['class']}", headers=_auth(PRINCIPAL_A))
    assert response.status_code == 404


def _iter_get_routes(routes):
    for route in routes:
        if isinstance(route, _IncludedRouter):
            yield from _iter_get_routes(route.original_router.routes)
            continue
        methods = getattr(route, "methods", None)
        if methods and "GET" in methods:
            yield route


def test_route_enumeration_test() -> None:
    """Every application GET route must declare its scope in the handler source."""
    checked = 0
    missing: list[str] = []
    for route in _iter_get_routes(app.routes):
        endpoint = getattr(route, "endpoint", None)
        if endpoint is None:
            continue
        if getattr(endpoint, "__module__", "").startswith("fastapi"):
            continue
        checked += 1
        if "# scope:" not in inspect.getsource(endpoint):
            missing.append(getattr(route, "path", "?"))
    assert checked > 30, f"expected many GET routes, checked {checked}"
    assert missing == [], f"GET routes missing '# scope:' declaration: {missing}"
