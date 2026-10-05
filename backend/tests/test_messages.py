"""Integration tests for /api/message-threads (ticket #26)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from passlib.hash import bcrypt
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token
from app.db.models import JenjangType, School, Tenant, User, UserRole
from app.db.seed import SEED_PASSWORD


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _token(user_id: int, tenant_id: int | None, school_id: int | None, role: str) -> str:
    return create_access_token(user_id, tenant_id, school_id, role)


TEACHER4 = _token(4, 1, 1, "teacher")
TEACHER5 = _token(5, 1, 1, "teacher")
PARENT10 = _token(10, 1, 1, "parent")


def _add_other_tenant(db_session: Session) -> None:
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
            email="p2@other.sch.id",
            hashed_auth_ref=bcrypt.hash(SEED_PASSWORD),
            role=UserRole.PARENT,
            full_name="Parent Other",
        )
    )
    db_session.commit()


def test_create_thread_message_and_list(client: TestClient, db_session: Session) -> None:
    created = client.post(
        "/api/message-threads",
        headers=_auth(TEACHER4),
        json={"participant_ids": [10], "subject": "Perkembangan anak"},
    )
    assert created.status_code == 201, created.text
    thread = created.json()
    assert thread["participant_ids"] == [4, 10]
    thread_id = thread["id"]

    message = client.post(
        f"/api/message-threads/{thread_id}/messages",
        headers=_auth(TEACHER4),
        json={"body": "Selamat pagi, Bu."},
    )
    assert message.status_code == 201, message.text
    assert message.json()["sender_id"] == 4

    listing = client.get("/api/message-threads", headers=_auth(TEACHER4))
    assert listing.status_code == 200
    item = next(t for t in listing.json()["items"] if t["id"] == thread_id)
    assert item["last_message"]["body"] == "Selamat pagi, Bu."


def test_cross_tenant_participant_blocked(client: TestClient, db_session: Session) -> None:
    _add_other_tenant(db_session)
    response = client.post(
        "/api/message-threads",
        headers=_auth(TEACHER4),
        json={"participant_ids": [200], "subject": "Lintas tenant"},
    )
    assert response.status_code == 403


def test_non_participant_cannot_view(client: TestClient, db_session: Session) -> None:
    thread_id = client.post(
        "/api/message-threads",
        headers=_auth(TEACHER4),
        json={"participant_ids": [10], "subject": "Privat"},
    ).json()["id"]

    assert (
        client.get(f"/api/message-threads/{thread_id}", headers=_auth(TEACHER5)).status_code
        == 403
    )
    assert (
        client.get(
            f"/api/message-threads/{thread_id}/messages", headers=_auth(TEACHER5)
        ).status_code
        == 403
    )
    reply = client.post(
        f"/api/message-threads/{thread_id}/messages",
        headers=_auth(TEACHER5),
        json={"body": "menyusup"},
    )
    assert reply.status_code == 403


def test_add_and_remove_participant(client: TestClient, db_session: Session) -> None:
    thread_id = client.post(
        "/api/message-threads",
        headers=_auth(TEACHER4),
        json={"participant_ids": [10], "subject": "Tambah"},
    ).json()["id"]

    added = client.post(
        f"/api/message-threads/{thread_id}/participants",
        headers=_auth(TEACHER4),
        json={"user_id": 5},
    )
    assert added.status_code == 201, added.text
    assert 5 in added.json()["participant_ids"]

    removed = client.delete(
        f"/api/message-threads/{thread_id}/participants/5", headers=_auth(TEACHER4)
    )
    assert removed.status_code == 204

    detail = client.get(f"/api/message-threads/{thread_id}", headers=_auth(TEACHER4))
    assert 5 not in detail.json()["participant_ids"]


def test_unread_to_read_transition(client: TestClient, db_session: Session) -> None:
    thread_id = client.post(
        "/api/message-threads",
        headers=_auth(TEACHER4),
        json={"participant_ids": [10], "subject": "Baca"},
    ).json()["id"]
    client.post(
        f"/api/message-threads/{thread_id}/messages",
        headers=_auth(TEACHER4),
        json={"body": "Mohon dibaca."},
    )

    messages = client.get(
        f"/api/message-threads/{thread_id}/messages", headers=_auth(PARENT10)
    )
    assert messages.status_code == 200, messages.text
    assert messages.json()["items"][0]["read_at"] is not None


def test_empty_thread_list_returns_200(client: TestClient, db_session: Session) -> None:
    response = client.get("/api/message-threads", headers=_auth(TEACHER5))
    assert response.status_code == 200
    assert isinstance(response.json()["items"], list)
