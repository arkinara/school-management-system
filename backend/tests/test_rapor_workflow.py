"""Integration tests for the rapor workflow (ticket #55).

Covers gap detection, wali kelas finalization, principal approval, and the
versioned correction flow, plus semester-scoped attendance in the compiled
payload.
"""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token
from app.db.models import (
    Attendance,
    AttendanceStatus,
    ReportCard,
    ReportCardStatus,
)


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _token(user_id: int, role: str) -> str:
    return create_access_token(user_id, 1, 1, role)


ADMIN = _token(2, "admin")
PRINCIPAL = _token(3, "principal")
TEACHER4 = _token(4, "teacher")  # wali kelas of class 1
PARENT10 = _token(10, "parent")


def _compile(
    client: TestClient,
    token: str,
    student_id: int = 1,
    semester: str = "2026/2027-ganjil",
):
    return client.post(
        "/api/report-cards/compile",
        headers=_auth(token),
        json={
            "student_id": student_id,
            "semester": semester,
            "kurikulum_version": "Merdeka 2024",
        },
    )


def _link_parent(client: TestClient, student_id: int, parent_id: int) -> None:
    response = client.post(
        f"/api/students/{student_id}/parents",
        headers=_auth(PRINCIPAL),
        json={"parent_user_id": parent_id, "is_primary": True},
    )
    assert response.status_code == 201, response.text


def _finalize(client: TestClient, token: str, card_id: int, **body):
    return client.post(
        f"/api/report-cards/{card_id}/finalize", headers=_auth(token), json=body
    )


def _publish(client: TestClient, token: str, card_id: int):
    return client.post(f"/api/report-cards/{card_id}/publish", headers=_auth(token))


def _publish_workflow(client: TestClient, card_id: int) -> None:
    """Finalize as wali, then publish as principal."""
    finalized = _finalize(client, TEACHER4, card_id, gap_override_reason="guru mapel belum input")
    assert finalized.status_code == 200, finalized.text
    published = _publish(client, PRINCIPAL, card_id)
    assert published.status_code == 200, published.text


def test_compile_returns_gaps(client: TestClient, db_session: Session) -> None:
    response = _compile(client, TEACHER4)
    assert response.status_code == 201, response.text
    body = response.json()
    assert isinstance(body["gaps"], list)
    assert body["gaps"]
    assert {"student_id", "subject_id", "category"} <= set(body["gaps"][0])


def test_finalize_blocked_by_gaps_without_override(
    client: TestClient, db_session: Session
) -> None:
    card_id = _compile(client, TEACHER4).json()["id"]
    response = _finalize(client, TEACHER4, card_id)
    assert response.status_code == 409, response.text
    assert response.json()["gaps"]


def test_finalize_with_gap_override_succeeds(
    client: TestClient, db_session: Session
) -> None:
    card_id = _compile(client, TEACHER4).json()["id"]
    response = _finalize(client, TEACHER4, card_id, gap_override_reason="deadline terlewat")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "finalized"
    assert body["finalized_by"] == 4
    assert body["finalized_at"] is not None
    assert body["gap_override_reason"] == "deadline terlewat"


def test_only_wali_kelas_can_finalize(client: TestClient, db_session: Session) -> None:
    card_id = _compile(client, TEACHER4).json()["id"]
    response = _finalize(client, PRINCIPAL, card_id, gap_override_reason="x")
    assert response.status_code == 403, response.text


def test_only_principal_can_publish(client: TestClient, db_session: Session) -> None:
    card_id = _compile(client, TEACHER4).json()["id"]
    assert _finalize(client, TEACHER4, card_id, gap_override_reason="x").status_code == 200
    response = _publish(client, TEACHER4, card_id)
    assert response.status_code == 403, response.text


def test_publish_blocked_from_draft(client: TestClient, db_session: Session) -> None:
    card_id = _compile(client, TEACHER4).json()["id"]
    response = _publish(client, PRINCIPAL, card_id)
    assert response.status_code == 409, response.text


def test_correction_creates_new_version(client: TestClient, db_session: Session) -> None:
    card_id = _compile(client, TEACHER4).json()["id"]
    _publish_workflow(client, card_id)

    corrected = client.post(
        f"/api/report-cards/{card_id}/correct", headers=_auth(PRINCIPAL), json={}
    )
    assert corrected.status_code == 201, corrected.text
    new_body = corrected.json()
    assert new_body["status"] == "draft"
    assert new_body["version"] == 2
    assert new_body["id"] != card_id

    db_session.expire_all()
    old = db_session.get(ReportCard, card_id)
    assert old is not None
    assert str(old.status) == "superseded"
    assert old.superseded_by == new_body["id"]


def test_superseded_old_version(client: TestClient, db_session: Session) -> None:
    card_id = _compile(client, TEACHER4).json()["id"]
    _publish_workflow(client, card_id)
    client.post(f"/api/report-cards/{card_id}/correct", headers=_auth(PRINCIPAL), json={})

    db_session.expire_all()
    old = db_session.get(ReportCard, card_id)
    assert old.status == ReportCardStatus.SUPERSEDED


def test_parents_only_see_published(client: TestClient, db_session: Session) -> None:
    _link_parent(client, 1, 10)
    card_id = _compile(client, TEACHER4).json()["id"]

    draft_listing = client.get("/api/report-cards", headers=_auth(PARENT10))
    assert draft_listing.status_code == 200
    assert draft_listing.json()["total"] == 0

    _publish_workflow(client, card_id)
    published_listing = client.get("/api/report-cards", headers=_auth(PARENT10))
    assert published_listing.json()["total"] == 1
    assert published_listing.json()["items"][0]["status"] == "published"

    client.post(f"/api/report-cards/{card_id}/correct", headers=_auth(PRINCIPAL), json={})
    after_correction = client.get("/api/report-cards", headers=_auth(PARENT10))
    assert after_correction.json()["total"] == 0


def test_attendance_recap_within_semester_range(
    client: TestClient, db_session: Session
) -> None:
    extra = [
        Attendance(
            id=5001,
            student_id=1,
            class_id=1,
            date=date(2026, 8, 15),
            status=AttendanceStatus.HADIR,
            recorded_by=4,
        ),
        Attendance(
            id=5002,
            student_id=1,
            class_id=1,
            date=date(2026, 11, 20),
            status=AttendanceStatus.HADIR,
            recorded_by=4,
        ),
        Attendance(
            id=5003,
            student_id=1,
            class_id=1,
            date=date(2026, 2, 10),
            status=AttendanceStatus.HADIR,
            recorded_by=4,
        ),
        Attendance(
            id=5004,
            student_id=1,
            class_id=1,
            date=date(2027, 3, 10),
            status=AttendanceStatus.HADIR,
            recorded_by=4,
        ),
    ]
    db_session.add_all(extra)
    db_session.commit()

    def expected(start: date, end: date) -> int:
        return db_session.scalar(
            select(func.count())
            .select_from(Attendance)
            .where(
                Attendance.student_id == 1,
                Attendance.date >= start,
                Attendance.date <= end,
                Attendance.status == AttendanceStatus.HADIR,
            )
        ) or 0

    ganjil = _compile(client, TEACHER4, semester="2026/2027-ganjil").json()
    assert ganjil["compiled_data"]["kehadiran"]["hadir"] == expected(
        date(2026, 7, 1), date(2026, 12, 31)
    )

    genap = _compile(client, TEACHER4, semester="2026/2027-genap").json()
    assert genap["compiled_data"]["kehadiran"]["hadir"] == expected(
        date(2027, 1, 1), date(2027, 6, 30)
    )
