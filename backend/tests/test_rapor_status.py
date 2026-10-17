"""Status-only rapor metadata tests (ticket #75)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _token(user_id: int, role: str) -> str:
    return create_access_token(user_id, 1, 1, role)


PRINCIPAL = _token(3, "principal")
TEACHER4 = _token(4, "teacher")
PARENT10 = _token(10, "parent")
PARENT11 = _token(11, "parent")
STUDENT6 = _token(6, "student")


def _compile(
    client: TestClient,
    token: str = TEACHER4,
    student_id: int = 1,
    semester: str = "2026/2027-ganjil",
):
    return client.post(
        "/api/report-cards/compile",
        headers=_auth(token),
        json={"student_id": student_id, "semester": semester},
    )


def _link_parent(client: TestClient, student_id: int, parent_id: int) -> None:
    response = client.post(
        f"/api/students/{student_id}/parents",
        headers=_auth(PRINCIPAL),
        json={"parent_user_id": parent_id, "is_primary": True},
    )
    assert response.status_code == 201, response.text


def _publish_workflow(client: TestClient, card_id: int) -> None:
    finalized = client.post(
        f"/api/report-cards/{card_id}/finalize",
        headers=_auth(TEACHER4),
        json={"gap_override_reason": "guru mapel belum input"},
    )
    assert finalized.status_code == 200, finalized.text
    published = client.post(
        f"/api/report-cards/{card_id}/publish", headers=_auth(PRINCIPAL)
    )
    assert published.status_code == 200, published.text


def test_parent_sees_draft_status_without_compiled_data(
    client: TestClient, db_session: Session
) -> None:
    _link_parent(client, 1, 10)
    _compile(client)

    response = client.get("/api/report-cards/status", headers=_auth(PARENT10))
    assert response.status_code == 200, response.text
    rows = response.json()
    assert len(rows) == 1
    row = rows[0]
    assert row["status"] == "draft"
    assert row["semester"] == "2026/2027-ganjil"
    assert row["version"] == 1
    for forbidden in ("compiled_data", "body", "grades_snapshot", "attendance_summary"):
        assert forbidden not in row


def test_student_sees_own_draft_status(client: TestClient, db_session: Session) -> None:
    _compile(client)
    response = client.get("/api/report-cards/status", headers=_auth(STUDENT6))
    assert response.status_code == 200, response.text
    assert [row["student_id"] for row in response.json()] == [1]


def test_status_excludes_superseded(client: TestClient, db_session: Session) -> None:
    _link_parent(client, 1, 10)
    _compile(client)
    _publish_workflow(client, 1)

    corrected = client.post(
        "/api/report-cards/1/correct", headers=_auth(PRINCIPAL), json={}
    )
    assert corrected.status_code == 201, corrected.text
    new_id = corrected.json()["id"]

    response = client.get("/api/report-cards/status", headers=_auth(PARENT10))
    assert response.status_code == 200, response.text
    ids = [row["id"] for row in response.json()]
    assert new_id in ids
    assert 1 not in ids
    assert all(row["status"] != "superseded" for row in response.json())


def test_parent_cannot_read_other_child_status(
    client: TestClient, db_session: Session
) -> None:
    _link_parent(client, 1, 10)
    response = client.get(
        "/api/report-cards/status?student_id=2", headers=_auth(PARENT11)
    )
    assert response.status_code == 403, response.text


def test_status_filters_by_semester(
    client: TestClient, db_session: Session
) -> None:
    _link_parent(client, 1, 10)
    _compile(client, semester="2026/2027-ganjil")
    response = client.get(
        "/api/report-cards/status?semester=2026/2027-genap", headers=_auth(PARENT10)
    )
    assert response.status_code == 200, response.text
    assert response.json() == []
