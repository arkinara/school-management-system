"""Integration tests for /api/announcements (ticket #26)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from passlib.hash import bcrypt
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token
from app.db.models import (
    Announcement,
    AnnouncementAudience,
    JenjangType,
    School,
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


def _add_other_school(db_session: Session) -> None:
    db_session.add_all(
        [
            Tenant(
                id=2, name="SMP Lain", jenjang_type=JenjangType.SMP, kurikulum_version="K13"
            ),
            School(id=2, tenant_id=2, name="SMP Lain 02", address="Jl. Lain"),
        ]
    )
    db_session.flush()
    db_session.add(
        User(
            id=200,
            tenant_id=2,
            school_id=2,
            email="admin2@other.sch.id",
            hashed_auth_ref=bcrypt.hash(SEED_PASSWORD),
            role=UserRole.ADMIN,
            full_name="Admin Other",
        )
    )
    db_session.commit()


def test_announcement_draft_publish_unpublish_flow(
    client: TestClient, db_session: Session
) -> None:
    created = client.post(
        "/api/announcements",
        headers=_auth(PRINCIPAL),
        json={"title": "Libur", "body": "Sekolah libur besok.", "audience": "all"},
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["status"] == "draft"
    assert body["published_at"] is None
    announcement_id = body["id"]

    published = client.post(
        f"/api/announcements/{announcement_id}/publish", headers=_auth(PRINCIPAL)
    )
    assert published.status_code == 200, published.text
    assert published.json()["status"] == "published"
    assert published.json()["published_at"] is not None

    retracted = client.post(
        f"/api/announcements/{announcement_id}/unpublish", headers=_auth(ADMIN)
    )
    assert retracted.status_code == 200, retracted.text
    assert retracted.json()["status"] == "draft"

    deleted = client.delete(
        f"/api/announcements/{announcement_id}", headers=_auth(ADMIN)
    )
    assert deleted.status_code == 204


def test_cross_school_publish_blocked(client: TestClient, db_session: Session) -> None:
    _add_other_school(db_session)
    other = _token(200, 2, 2, "admin")

    created = client.post(
        "/api/announcements",
        headers=_auth(other),
        json={"title": "Lain", "body": "Dari sekolah lain.", "audience": "all"},
    )
    assert created.status_code == 201, created.text
    announcement_id = created.json()["id"]

    blocked = client.post(
        f"/api/announcements/{announcement_id}/publish", headers=_auth(PRINCIPAL)
    )
    assert blocked.status_code == 403


def test_parents_see_only_published(client: TestClient, db_session: Session) -> None:
    draft = client.post(
        "/api/announcements",
        headers=_auth(PRINCIPAL),
        json={"title": "Draft", "body": "Belum terbit.", "audience": "all"},
    )
    draft_id = draft.json()["id"]
    published = client.post(
        "/api/announcements",
        headers=_auth(PRINCIPAL),
        json={"title": "Terbit", "body": "Sudah terbit.", "audience": "all"},
    )
    published_id = published.json()["id"]
    client.post(f"/api/announcements/{published_id}/publish", headers=_auth(PRINCIPAL))

    listing = client.get("/api/announcements", headers=_auth(PARENT10))
    assert listing.status_code == 200
    ids = {item["id"] for item in listing.json()["items"]}
    assert published_id in ids
    assert draft_id not in ids

    blocked = client.get(f"/api/announcements/{draft_id}", headers=_auth(PARENT10))
    assert blocked.status_code == 403


def test_author_can_edit_admin_can_publish(client: TestClient, db_session: Session) -> None:
    created = client.post(
        "/api/announcements",
        headers=_auth(TEACHER4),
        json={"title": "Awal", "body": "Isi awal.", "audience": "all"},
    )
    assert created.status_code == 201, created.text
    announcement_id = created.json()["id"]

    edited = client.patch(
        f"/api/announcements/{announcement_id}",
        headers=_auth(TEACHER4),
        json={"title": "Revisi"},
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["title"] == "Revisi"

    published = client.post(
        f"/api/announcements/{announcement_id}/publish", headers=_auth(ADMIN)
    )
    assert published.status_code == 200, published.text
    assert published.json()["status"] == "published"

    other_teacher = client.patch(
        f"/api/announcements/{announcement_id}",
        headers=_auth(TEACHER5),
        json={"title": "Bukan punyaku"},
    )
    assert other_teacher.status_code == 403


def test_students_and_parents_cannot_post(client: TestClient, db_session: Session) -> None:
    payload = {"title": "Halo", "body": "Isi", "audience": "all"}
    assert client.post(
        "/api/announcements", headers=_auth(STUDENT6), json=payload
    ).status_code == 403
    assert client.post(
        "/api/announcements", headers=_auth(PARENT10), json=payload
    ).status_code == 403


def test_class_audience_requires_target(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/announcements",
        headers=_auth(TEACHER4),
        json={"title": "Kelas", "body": "Isi", "audience": "class"},
    )
    assert response.status_code == 422


def test_invalid_audience_rejected(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/announcements",
        headers=_auth(TEACHER4),
        json={"title": "X", "body": "Y", "audience": "galaxy"},
    )
    assert response.status_code == 422
    assert (
        db_session.query(Announcement)
        .filter(Announcement.title == "X")
        .count()
        == 0
    )


def test_jenjang_target_required(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/announcements",
        headers=_auth(PRINCIPAL),
        json={"title": "Jenjang", "body": "Isi", "audience": "jenjang"},
    )
    assert response.status_code == 422


def test_empty_listing_returns_200(client: TestClient, db_session: Session) -> None:
    response = client.get(
        "/api/announcements",
        headers=_auth(SUPER),
        params={"school_id": 9999},
    )
    assert response.status_code == 200
    assert response.json()["items"] == []


def test_seed_class_announcement_persisted(db_session: Session) -> None:
    rows = (
        db_session.query(Announcement)
        .filter(Announcement.audience == AnnouncementAudience.CLASS)
        .all()
    )
    assert rows
