"""Announcement moderation tests (ticket #61): audience, publish, retract, history."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token
from app.db.models import AnnouncementRevision


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _token(user_id: int, tenant_id: int | None, school_id: int | None, role: str) -> str:
    return create_access_token(user_id, tenant_id, school_id, role)


ADMIN2 = _token(2, 1, 1, "admin")
PRINCIPAL3 = _token(3, 1, 1, "principal")
TEACHER4 = _token(4, 1, 1, "teacher")
TEACHER5 = _token(5, 1, 1, "teacher")


def test_announcement_target_class_filter(client: TestClient, db_session: Session) -> None:
    created = client.post(
        "/api/announcements",
        headers=_auth(ADMIN2),
        json={
            "title": "Kelas 1A",
            "body": "Untuk kelas 1A saja.",
            "audience": "class",
            "target_class_id": 1,
            "publish": True,
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["target_class_id"] == 1
    assert created.json()["published_at"] is not None

    listing = client.get(
        "/api/announcements",
        headers=_auth(TEACHER4),
        params={"target_class_id": 1},
    )
    assert listing.status_code == 200
    assert created.json()["id"] in {item["id"] for item in listing.json()["items"]}


def test_announcement_school_wide(client: TestClient, db_session: Session) -> None:
    created = client.post(
        "/api/announcements",
        headers=_auth(ADMIN2),
        json={"title": "Sekolah", "body": "Untuk semua.", "publish": True},
    )
    assert created.status_code == 201, created.text
    assert created.json()["target_class_id"] is None

    # school-wide announcements are visible through a class filter too
    listing = client.get(
        "/api/announcements",
        headers=_auth(TEACHER4),
        params={"target_class_id": 1},
    )
    assert created.json()["id"] in {item["id"] for item in listing.json()["items"]}


def test_publish_on_create(client: TestClient, db_session: Session) -> None:
    created = client.post(
        "/api/announcements",
        headers=_auth(PRINCIPAL3),
        json={"title": "Langsung", "body": "Terbit langsung.", "publish": True},
    )
    assert created.status_code == 201, created.text
    assert created.json()["published_at"] is not None
    assert created.json()["status"] == "published"


def test_guru_draft_only(client: TestClient, db_session: Session) -> None:
    created = client.post(
        "/api/announcements",
        headers=_auth(TEACHER4),
        json={"title": "Draft guru", "body": "Belum terbit."},
    )
    assert created.status_code == 201, created.text
    assert created.json()["published_at"] is None
    assert created.json()["status"] == "draft"


def test_guru_publish_immediately_403(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/announcements",
        headers=_auth(TEACHER4),
        json={"title": "Nekat", "body": "Isi", "publish": True},
    )
    assert response.status_code == 403


def test_retract_soft_hide(client: TestClient, db_session: Session) -> None:
    announcement_id = client.post(
        "/api/announcements",
        headers=_auth(TEACHER4),
        json={"title": "Dicabut", "body": "Akan dicabut."},
    ).json()["id"]
    assert (
        client.post(
            f"/api/announcements/{announcement_id}/publish", headers=_auth(ADMIN2)
        ).status_code
        == 200
    )

    retracted = client.post(
        f"/api/announcements/{announcement_id}/retract",
        headers=_auth(TEACHER4),
        json={"reason": "informasi salah"},
    )
    assert retracted.status_code == 200, retracted.text
    assert retracted.json()["retracted_at"] is not None
    assert retracted.json()["retract_reason"] == "informasi salah"

    # non-author no longer sees it
    other = client.get("/api/announcements", headers=_auth(TEACHER5))
    assert announcement_id not in {item["id"] for item in other.json()["items"]}

    # author still sees their own retracted announcement
    mine = client.get("/api/announcements", headers=_auth(TEACHER4))
    assert announcement_id in {item["id"] for item in mine.json()["items"]}


def test_author_sees_own_drafts(client: TestClient, db_session: Session) -> None:
    draft_id = client.post(
        "/api/announcements",
        headers=_auth(TEACHER4),
        json={"title": "Draft pribadi", "body": "Isi"},
    ).json()["id"]

    default = client.get("/api/announcements", headers=_auth(TEACHER4))
    assert draft_id not in {item["id"] for item in default.json()["items"]}

    with_drafts = client.get(
        "/api/announcements", headers=_auth(TEACHER4), params={"include_drafts": "true"}
    )
    assert draft_id in {item["id"] for item in with_drafts.json()["items"]}

    other = client.get(
        "/api/announcements", headers=_auth(TEACHER5), params={"include_drafts": "true"}
    )
    assert draft_id not in {item["id"] for item in other.json()["items"]}


def test_edit_creates_revision(client: TestClient, db_session: Session) -> None:
    announcement_id = client.post(
        "/api/announcements",
        headers=_auth(TEACHER4),
        json={"title": "Awal", "body": "Isi awal."},
    ).json()["id"]

    edited = client.patch(
        f"/api/announcements/{announcement_id}",
        headers=_auth(TEACHER4),
        json={"body": "Isi revisi.", "change_note": "perbaikan"},
    )
    assert edited.status_code == 200, edited.text

    revisions = list(
        db_session.scalars(
            select(AnnouncementRevision)
            .where(AnnouncementRevision.announcement_id == announcement_id)
            .order_by(AnnouncementRevision.version)
        ).all()
    )
    assert [r.version for r in revisions] == [1, 2]
    assert revisions[1].body == "Isi revisi."
    assert revisions[1].change_note == "perbaikan"


def test_get_history_returns_revisions(client: TestClient, db_session: Session) -> None:
    announcement_id = client.post(
        "/api/announcements",
        headers=_auth(TEACHER4),
        json={"title": "Versi", "body": "v1"},
    ).json()["id"]
    client.patch(
        f"/api/announcements/{announcement_id}",
        headers=_auth(TEACHER4),
        json={"body": "v2"},
    )
    client.patch(
        f"/api/announcements/{announcement_id}",
        headers=_auth(TEACHER4),
        json={"body": "v3"},
    )

    history = client.get(
        f"/api/announcements/{announcement_id}/history", headers=_auth(TEACHER4)
    )
    assert history.status_code == 200, history.text
    versions = [item["version"] for item in history.json()]
    assert versions == [1, 2, 3]
    assert history.json()[-1]["body"] == "v3"
