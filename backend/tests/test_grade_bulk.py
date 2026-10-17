"""Per-row bulk grade results (ticket #76)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token
from app.db.models import TeacherAssignment

SEMESTER = "2026/2027-ganjil"
TEACHER4 = create_access_token(4, 1, 1, "teacher")


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _assign(db_session: Session, teacher_id: int = 4) -> None:
    db_session.add(
        TeacherAssignment(
            teacher_id=teacher_id,
            subject_id=1,
            class_id=1,
            academic_year="2026/2027",
        )
    )
    db_session.commit()


def _item(assessment_no: int, score: float | None) -> dict:
    return {
        "student_id": 1,
        "subject_id": 1,
        "semester": SEMESTER,
        "category": "formatif",
        "assessment_no": assessment_no,
        "score": score,
        "description": "catatan",
    }


def test_bulk_per_row_results_one_invalid(
    client: TestClient, db_session: Session
) -> None:
    _assign(db_session)
    items = [_item(no, 80 + (no % 10)) for no in range(1, 31)]
    items[7]["score"] = 101

    response = client.post(
        "/api/grades/bulk", headers=_auth(TEACHER4), json={"items": items}
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert len(body["saved"]) == 29
    assert len(body["errors"]) == 1
    assert body["errors"][0]["status"] == "error"
    assert "score must be 0-100" in body["errors"][0]["detail"]


def test_bulk_no_integrity_500(client: TestClient, db_session: Session) -> None:
    _assign(db_session)
    duplicate = _item(1, 85)
    response = client.post(
        "/api/grades/bulk",
        headers=_auth(TEACHER4),
        json={"items": [duplicate, dict(duplicate)]},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert len(body["saved"]) == 1
    assert len(body["errors"]) == 1
    assert body["errors"][0]["status_code"] == 409
    assert "duplicate" in body["errors"][0]["detail"]


def test_bulk_requires_current_assignment(
    client: TestClient, db_session: Session
) -> None:
    response = client.post(
        "/api/grades/bulk",
        headers=_auth(TEACHER4),
        json={"items": [_item(1, 85)]},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["saved"] == []
    assert body["errors"][0]["status_code"] == 403
