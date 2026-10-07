"""Class-scoped grade aggregation + rollup tests (ticket #53)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from passlib.hash import bcrypt
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token
from app.db.models import Student, User, UserRole
from app.db.seed import SEED_PASSWORD

SEMESTER = "2026/2027-ganjil"
TEACHER4 = create_access_token(4, 1, 1, "teacher")


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _post(
    client: TestClient, student_id: int, subject_id: int, category: str, score: float
) -> None:
    response = client.post(
        "/api/grades",
        headers=_auth(TEACHER4),
        json={
            "student_id": student_id,
            "subject_id": subject_id,
            "semester": SEMESTER,
            "category": category,
            "score": score,
            "description": "catatan",
        },
    )
    assert response.status_code == 201, response.text


def _add_class1_students(db_session: Session) -> None:
    for offset, sid in enumerate((5, 6, 7), start=1):
        user_id = 70 + offset
        db_session.add(
            User(
                id=user_id,
                tenant_id=1,
                school_id=1,
                email=f"extra{sid}@menteng.sch.id",
                hashed_auth_ref=bcrypt.hash(SEED_PASSWORD),
                role=UserRole.STUDENT,
                full_name=f"Extra {sid}",
            )
        )
        db_session.flush()
        db_session.add(Student(id=sid, user_id=user_id, school_id=1, class_id=1, nis=f"EXTRA{sid}"))
    db_session.commit()


def test_aggregate_grouped_by_category(client: TestClient, db_session: Session) -> None:
    response = client.get(
        f"/api/grades/aggregate?class_id=1&semester={SEMESTER}", headers=_auth(TEACHER4)
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["class_id"] == 1
    assert body["semester"] == SEMESTER
    assert body["subjects"], "expected subjects"
    subject = body["subjects"][0]
    assert {"subject_id", "subject_name", "students"} <= set(subject)
    student = subject["students"][0]
    assert {"student_id", "student_name", "categories", "total_avg"} <= set(student)
    for cat in ("formatif", "sumatif", "PR", "tugas"):
        assert cat in student["categories"]
        assert {"scores", "avg", "complete", "missing"} <= set(student["categories"][cat])


def test_aggregate_complete_flag(client: TestClient, db_session: Session) -> None:
    for category, score in (("sumatif", 88), ("PR", 80), ("tugas", 95)):
        _post(client, 1, 1, category, score)

    response = client.get(
        f"/api/grades/aggregate?class_id=1&semester={SEMESTER}", headers=_auth(TEACHER4)
    )
    assert response.status_code == 200, response.text
    body = response.json()
    subject = next(s for s in body["subjects"] if s["subject_id"] == 1)
    student = next(s for s in subject["students"] if s["student_id"] == 1)
    for cat in ("formatif", "sumatif", "PR", "tugas"):
        assert student["categories"][cat]["complete"] is True
        assert student["categories"][cat]["missing"] == []
    assert student["total_avg"] is not None


def test_aggregate_missing_flag(client: TestClient, db_session: Session) -> None:
    response = client.get(
        f"/api/grades/aggregate?class_id=1&semester={SEMESTER}", headers=_auth(TEACHER4)
    )
    assert response.status_code == 200, response.text
    body = response.json()
    subject = next(s for s in body["subjects"] if s["subject_id"] == 4)
    student = next(s for s in subject["students"] if s["student_id"] == 1)
    assert student["categories"]["formatif"]["complete"] is False
    assert student["categories"]["formatif"]["missing"] == ["assessment_1"]


def test_class_rollup_ranking(client: TestClient, db_session: Session) -> None:
    _add_class1_students(db_session)
    for student_id, score in ((1, 60), (2, 70), (5, 80), (6, 90), (7, 100)):
        _post(client, student_id, 5, "formatif", score)

    response = client.get(
        f"/api/grades/class-rollup?class_id=1&semester={SEMESTER}", headers=_auth(TEACHER4)
    )
    assert response.status_code == 200, response.text
    body = response.json()
    students = body["students"]
    assert len(students) == 5
    assert [row["rank"] for row in students] == [1, 2, 3, 4, 5]
    averages = [row["overall_avg"] for row in students]
    assert averages == sorted(averages, reverse=True)
