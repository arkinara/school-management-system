"""Integration tests for /api/notifications (ticket #51)."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token
from app.db.models import Notification, SppBill, SppBillStatus


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _token(user_id: int, tenant_id: int | None, school_id: int | None, role: str) -> str:
    return create_access_token(user_id, tenant_id, school_id, role)


SUPER = _token(1, 1, None, "super_admin")
ADMIN = _token(2, 1, 1, "admin")
PRINCIPAL = _token(3, 1, 1, "principal")
TEACHER4 = _token(4, 1, 1, "teacher")
PARENT10 = _token(10, 1, 1, "parent")
PARENT11 = _token(11, 1, 1, "parent")


def _add_notification(
    db_session: Session,
    *,
    user_id: int = 10,
    tenant_id: int = 1,
    type: str = "announcement",
    title: str = "Info",
    body: str = "Pesan",
    is_read: bool = False,
) -> Notification:
    notification = Notification(
        user_id=user_id,
        tenant_id=tenant_id,
        type=type,
        title=title,
        body=body,
        is_read=is_read,
        created_at=datetime.now(timezone.utc),
    )
    db_session.add(notification)
    db_session.commit()
    db_session.refresh(notification)
    return notification


def _link_parent(client: TestClient, student_id: int, parent_id: int) -> None:
    response = client.post(
        f"/api/students/{student_id}/parents",
        headers=_auth(PRINCIPAL),
        json={"parent_user_id": parent_id, "is_primary": True},
    )
    assert response.status_code == 201, response.text


def test_list_notifications(client: TestClient, db_session: Session) -> None:
    _add_notification(db_session, title="Pengumuman", body="Rapat Sabtu")
    response = client.get("/api/notifications", headers=_auth(PARENT10))
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body) == 1
    assert body[0]["title"] == "Pengumuman"


def test_mark_notification_read(client: TestClient, db_session: Session) -> None:
    notification = _add_notification(db_session)
    response = client.post(
        f"/api/notifications/{notification.id}/read", headers=_auth(PARENT10)
    )
    assert response.status_code == 204, response.text

    db_session.expire_all()
    refreshed = db_session.get(Notification, notification.id)
    assert refreshed is not None
    assert refreshed.is_read is True
    assert refreshed.read_at is not None


def test_mark_other_users_notification_returns_404(
    client: TestClient, db_session: Session
) -> None:
    notification = _add_notification(db_session, user_id=11)
    response = client.post(
        f"/api/notifications/{notification.id}/read", headers=_auth(PARENT10)
    )
    assert response.status_code == 404


def test_mark_all_read(client: TestClient, db_session: Session) -> None:
    _add_notification(db_session, body="A")
    _add_notification(db_session, body="B")
    response = client.post("/api/notifications/mark-all-read", headers=_auth(PARENT10))
    assert response.status_code == 204, response.text
    listing = client.get(
        "/api/notifications?unread_only=true", headers=_auth(PARENT10)
    )
    assert listing.json() == []


def test_unread_count(client: TestClient, db_session: Session) -> None:
    _add_notification(db_session, body="A")
    _add_notification(db_session, body="B")
    _add_notification(db_session, body="C", is_read=True)
    response = client.get("/api/notifications/unread-count", headers=_auth(PARENT10))
    assert response.status_code == 200, response.text
    assert response.json()["count"] == 2


def test_absence_alpa_triggers_guardian_notification(
    client: TestClient, db_session: Session
) -> None:
    _link_parent(client, 1, 10)
    created = client.post(
        "/api/attendances",
        headers=_auth(TEACHER4),
        json={
            "student_id": 1,
            "class_id": 1,
            "date": "2024-09-20",
            "status": "alpa",
        },
    )
    assert created.status_code == 201, created.text

    listing = client.get("/api/notifications", headers=_auth(PARENT10))
    assert listing.status_code == 200, listing.text
    items = listing.json()
    assert any(item["type"] == "attendance_alert" for item in items)


def test_attendance_resubmit_does_not_duplicate_notification(
    client: TestClient, db_session: Session
) -> None:
    _link_parent(client, 1, 10)
    payload = {
        "student_id": 1,
        "class_id": 1,
        "date": "2024-09-21",
        "status": "alpa",
    }
    assert client.post("/api/attendances", headers=_auth(TEACHER4), json=payload).status_code == 201
    assert client.post("/api/attendances", headers=_auth(TEACHER4), json=payload).status_code == 201

    items = client.get("/api/notifications", headers=_auth(PARENT10)).json()
    alerts = [item for item in items if item["type"] == "attendance_alert"]
    assert len(alerts) == 1


def test_spp_overdue_triggers_notification(
    client: TestClient, db_session: Session
) -> None:
    _link_parent(client, 2, 10)
    db_session.add(
        SppBill(
            id=91,
            student_id=2,
            period="2025-02",
            amount=200000.0,
            due_date=date.today() - timedelta(days=5),
            status=SppBillStatus.UNPAID,
            created_by=2,
        )
    )
    db_session.commit()

    flipped = client.post("/api/spp/bills/mark-overdue", headers=_auth(ADMIN))
    assert flipped.status_code == 200, flipped.text

    items = client.get("/api/notifications", headers=_auth(PARENT10)).json()
    assert any(item["type"] == "spp_overdue" for item in items)


def test_scheduler_endpoint(client: TestClient, db_session: Session) -> None:
    db_session.add(
        SppBill(
            id=92,
            student_id=3,
            period="2025-03",
            amount=150000.0,
            due_date=date.today() - timedelta(days=10),
            status=SppBillStatus.UNPAID,
            created_by=2,
        )
    )
    db_session.commit()

    response = client.post("/api/notifications/run-scheduler", headers=_auth(SUPER))
    assert response.status_code == 204, response.text

    db_session.expire_all()
    assert db_session.get(SppBill, 92).status == SppBillStatus.OVERDUE


def test_scheduler_requires_super_admin(
    client: TestClient, db_session: Session
) -> None:
    response = client.post("/api/notifications/run-scheduler", headers=_auth(ADMIN))
    assert response.status_code == 403


def test_notification_tenant_scoped(client: TestClient, db_session: Session) -> None:
    _add_notification(db_session, tenant_id=1, body="visible")
    _add_notification(db_session, tenant_id=2, body="hidden-tenants")
    response = client.get("/api/notifications", headers=_auth(PARENT10))
    assert response.status_code == 200, response.text
    bodies = {item["body"] for item in response.json()}
    assert bodies == {"visible"}
