"""Integration tests for /api/message-threads (ticket #26, extended #61)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from passlib.hash import bcrypt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token
from app.db.models import (
    AuditLog,
    JenjangType,
    MessageThreadRead,
    School,
    Tenant,
    User,
    UserRole,
    parent_links,
)
from app.db.seed import SEED_PASSWORD


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _token(user_id: int, tenant_id: int | None, school_id: int | None, role: str) -> str:
    return create_access_token(user_id, tenant_id, school_id, role)


PRINCIPAL3 = _token(3, 1, 1, "principal")
TEACHER4 = _token(4, 1, 1, "teacher")
TEACHER5 = _token(5, 1, 1, "teacher")
STUDENT6 = _token(6, 1, 1, "student")
PARENT10 = _token(10, 1, 1, "parent")


def _link_parent(db_session: Session, parent_id: int, student_id: int) -> None:
    db_session.execute(
        parent_links.insert().values(
            parent_id=parent_id,
            student_id=student_id,
            relationship="orang_tua",
            is_primary=True,
        )
    )
    db_session.commit()


def _add_other_tenant(db_session: Session) -> None:
    db_session.add_all(
        [
            Tenant(
                id=2, name="SMP Lain", jenjang_type=JenjangType.SMP, kurikulum_version="K13"
            ),
            School(
                id=2,
                tenant_id=2,
                name="SMP Lain 02",
                address="Jl. Lain",
                kurikulum_version="K13",
            ),
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
    _link_parent(db_session, 10, 1)
    created = client.post(
        "/api/message-threads",
        headers=_auth(TEACHER4),
        json={"student_id": 1, "participant_ids": [10], "subject": "Perkembangan anak"},
    )
    assert created.status_code == 201, created.text
    thread = created.json()
    assert thread["participant_ids"] == [4, 10]
    assert thread["student_id"] == 1
    assert thread["created_by"] == 4
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


def test_thread_requires_student_id(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/message-threads",
        headers=_auth(TEACHER4),
        json={"participant_ids": [10], "subject": "Tanpa siswa"},
    )
    assert response.status_code == 422


def test_thread_validates_participants(client: TestClient, db_session: Session) -> None:
    # parent 11 exists but is not linked to student 1
    response = client.post(
        "/api/message-threads",
        headers=_auth(TEACHER4),
        json={"student_id": 1, "participant_ids": [11], "subject": "Tidak valid"},
    )
    assert response.status_code == 422


def test_cross_tenant_participant_blocked(client: TestClient, db_session: Session) -> None:
    _add_other_tenant(db_session)
    response = client.post(
        "/api/message-threads",
        headers=_auth(TEACHER4),
        json={"student_id": 1, "participant_ids": [200], "subject": "Lintas tenant"},
    )
    assert response.status_code == 403


def test_non_participant_cannot_view(client: TestClient, db_session: Session) -> None:
    _link_parent(db_session, 10, 1)
    thread_id = client.post(
        "/api/message-threads",
        headers=_auth(TEACHER4),
        json={"student_id": 1, "participant_ids": [10], "subject": "Privat"},
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


def test_students_cannot_create_thread(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/message-threads",
        headers=_auth(STUDENT6),
        json={"student_id": 1, "participant_ids": [4], "subject": "Nekat"},
    )
    assert response.status_code == 403


def test_add_and_remove_participant(client: TestClient, db_session: Session) -> None:
    _link_parent(db_session, 10, 1)
    thread_id = client.post(
        "/api/message-threads",
        headers=_auth(TEACHER4),
        json={"student_id": 1, "participant_ids": [10], "subject": "Tambah"},
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


def test_only_creator_can_remove_participants(
    client: TestClient, db_session: Session
) -> None:
    _link_parent(db_session, 10, 1)
    thread_id = client.post(
        "/api/message-threads",
        headers=_auth(TEACHER4),
        json={"student_id": 1, "participant_ids": [10], "subject": "Hapus"},
    ).json()["id"]

    blocked = client.delete(
        f"/api/message-threads/{thread_id}/participants/10", headers=_auth(TEACHER5)
    )
    assert blocked.status_code == 403


def test_moderator_can_remove_participants(
    client: TestClient, db_session: Session
) -> None:
    _link_parent(db_session, 10, 1)
    thread_id = client.post(
        "/api/message-threads",
        headers=_auth(TEACHER4),
        json={"student_id": 1, "participant_ids": [10], "subject": "Moderasi"},
    ).json()["id"]

    removed = client.delete(
        f"/api/message-threads/{thread_id}/participants/10", headers=_auth(PRINCIPAL3)
    )
    assert removed.status_code == 204


def test_explicit_mark_read_is_idempotent(
    client: TestClient, db_session: Session
) -> None:
    _link_parent(db_session, 10, 1)
    thread_id = client.post(
        "/api/message-threads",
        headers=_auth(TEACHER4),
        json={"student_id": 1, "participant_ids": [10], "subject": "Baca"},
    ).json()["id"]
    client.post(
        f"/api/message-threads/{thread_id}/messages",
        headers=_auth(TEACHER4),
        json={"body": "Mohon dibaca."},
    )

    # GET must NOT create a read marker (no side effect).
    client.get(f"/api/message-threads/{thread_id}/messages", headers=_auth(PARENT10))
    assert (
        db_session.scalar(
            select(MessageThreadRead).where(
                MessageThreadRead.thread_id == thread_id,
                MessageThreadRead.user_id == 10,
            )
        )
        is None
    )

    first = client.post(f"/api/message-threads/{thread_id}/read", headers=_auth(PARENT10))
    assert first.status_code == 204
    second = client.post(f"/api/message-threads/{thread_id}/read", headers=_auth(PARENT10))
    assert second.status_code == 204

    marker = db_session.scalar(
        select(MessageThreadRead).where(
            MessageThreadRead.thread_id == thread_id,
            MessageThreadRead.user_id == 10,
        )
    )
    assert marker is not None
    assert marker.read_at is not None


def test_moderator_can_read_thread(client: TestClient, db_session: Session) -> None:
    _link_parent(db_session, 10, 1)
    thread_id = client.post(
        "/api/message-threads",
        headers=_auth(TEACHER4),
        json={"student_id": 1, "participant_ids": [10], "subject": "Audit"},
    ).json()["id"]
    client.post(
        f"/api/message-threads/{thread_id}/messages",
        headers=_auth(TEACHER4),
        json={"body": "Isi pesan."},
    )

    response = client.get(
        f"/api/message-threads/{thread_id}/moderator-view", headers=_auth(PRINCIPAL3)
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["thread"]["id"] == thread_id
    assert body["messages"][0]["body"] == "Isi pesan."

    audited = db_session.scalar(
        select(AuditLog).where(AuditLog.action == "moderator_view_thread")
    )
    assert audited is not None


def test_teacher_cannot_moderator_view(client: TestClient, db_session: Session) -> None:
    _link_parent(db_session, 10, 1)
    thread_id = client.post(
        "/api/message-threads",
        headers=_auth(TEACHER4),
        json={"student_id": 1, "participant_ids": [10], "subject": "Guru"},
    ).json()["id"]

    response = client.get(
        f"/api/message-threads/{thread_id}/moderator-view", headers=_auth(TEACHER4)
    )
    assert response.status_code == 403


def test_empty_thread_list_returns_200(client: TestClient, db_session: Session) -> None:
    response = client.get("/api/message-threads", headers=_auth(TEACHER5))
    assert response.status_code == 200
    assert isinstance(response.json()["items"], list)
