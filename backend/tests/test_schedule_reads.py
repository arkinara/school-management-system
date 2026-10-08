"""Role-scoped schedule read tests (ticket #57)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token
from app.db.models import Class


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _token(user_id: int, tenant_id: int | None, school_id: int | None, role: str) -> str:
    return create_access_token(user_id, tenant_id, school_id, role)


ADMIN = _token(2, 1, 1, "admin")
PRINCIPAL = _token(3, 1, 1, "principal")
TEACHER4 = _token(4, 1, 1, "teacher")
TEACHER5 = _token(5, 1, 1, "teacher")
STUDENT6 = _token(6, 1, 1, "student")
PARENT10 = _token(10, 1, 1, "parent")


def _link_child(client: TestClient, student_id: int, parent_id: int) -> None:
    response = client.post(
        f"/api/students/{student_id}/parents",
        headers=_auth(PRINCIPAL),
        json={"parent_user_id": parent_id, "relationship": "orang_tua"},
    )
    assert response.status_code == 201, response.text


def test_unfiltered_list_403_for_guru(
    client: TestClient, db_session: Session
) -> None:
    response = client.get("/api/schedules", headers=_auth(TEACHER4))
    assert response.status_code == 403, response.text


def test_unfiltered_list_200_for_admin(
    client: TestClient, db_session: Session
) -> None:
    response = client.get("/api/schedules", headers=_auth(ADMIN))
    assert response.status_code == 200, response.text
    assert response.json()["total"] >= 1


def test_guru_reads_own_schedule(client: TestClient, db_session: Session) -> None:
    response = client.get("/api/schedules?teacher_id=4", headers=_auth(TEACHER4))
    assert response.status_code == 200, response.text
    assert all(item["teacher_id"] == 4 for item in response.json()["items"])


def test_guru_reads_other_teacher_schedule_403(
    client: TestClient, db_session: Session
) -> None:
    response = client.get("/api/schedules?teacher_id=5", headers=_auth(TEACHER4))
    assert response.status_code == 403, response.text


def test_siswa_reads_another_class_403(
    client: TestClient, db_session: Session
) -> None:
    # Student 6 belongs to class 1; class 2 is another class in the same school.
    response = client.get("/api/schedules?class_id=2", headers=_auth(STUDENT6))
    assert response.status_code == 403, response.text


def test_siswa_reads_own_class_200(
    client: TestClient, db_session: Session
) -> None:
    response = client.get("/api/schedules?class_id=1", headers=_auth(STUDENT6))
    assert response.status_code == 200, response.text
    assert all(item["class_id"] == 1 for item in response.json()["items"])


def test_parent_reads_linked_child_class_200(
    client: TestClient, db_session: Session
) -> None:
    _link_child(client, student_id=1, parent_id=10)
    response = client.get("/api/schedules/by-class/1", headers=_auth(PARENT10))
    assert response.status_code == 200, response.text
    assert all(item["class_id"] == 1 for item in response.json())


def test_parent_reads_unlinked_class_403(
    client: TestClient, db_session: Session
) -> None:
    _link_child(client, student_id=1, parent_id=10)
    response = client.get("/api/schedules/by-class/2", headers=_auth(PARENT10))
    assert response.status_code == 403, response.text


def test_teacher_reads_taught_class_200(
    client: TestClient, db_session: Session
) -> None:
    # Teacher 4 is timetabled across the seeded classes.
    response = client.get("/api/schedules/by-class/2", headers=_auth(TEACHER4))
    assert response.status_code == 200, response.text


def test_teacher_reads_unassigned_class_403(
    client: TestClient, db_session: Session
) -> None:
    db_session.add(
        Class(id=91, school_id=1, name="5C", grade_level=5, academic_year="2026/2027")
    )
    db_session.commit()
    response = client.get("/api/schedules/by-class/91", headers=_auth(TEACHER5))
    assert response.status_code == 403, response.text
