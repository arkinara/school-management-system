"""Integration tests for /api/audit-log and audit writes (ticket #30)."""

from __future__ import annotations

from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token
from app.db.models import AuditLog
from app.db.seed import SEED_PASSWORD


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _token(user_id: int, tenant_id: int | None, school_id: int | None, role: str) -> str:
    return create_access_token(user_id, tenant_id, school_id, role)


SUPER = _token(1, 1, None, "super_admin")
ADMIN = _token(2, 1, 1, "admin")
PRINCIPAL = _token(3, 1, 1, "principal")
PARENT10 = _token(10, 1, 1, "parent")


def test_login_writes_audit_entry(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/auth/login", json={"email": "siti@menteng.sch.id", "password": SEED_PASSWORD}
    )
    assert response.status_code == 200, response.text

    rows = db_session.scalars(
        select(AuditLog).where(AuditLog.action == "login")
    ).all()
    assert rows
    assert any(row.actor_id == 4 for row in rows)


def test_failed_login_writes_audit_entry(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/auth/login",
        json={"email": "siti@menteng.sch.id", "password": "wrong-password"},
    )
    assert response.status_code == 401

    rows = db_session.scalars(
        select(AuditLog).where(AuditLog.action == "login_failed")
    ).all()
    assert rows


def test_announcement_publish_writes_audit_entry(
    client: TestClient, db_session: Session
) -> None:
    created = client.post(
        "/api/announcements",
        headers=_auth(PRINCIPAL),
        json={"title": "Audit", "body": "Isi", "audience": "all"},
    )
    announcement_id = created.json()["id"]
    client.post(f"/api/announcements/{announcement_id}/publish", headers=_auth(PRINCIPAL))

    listing = client.get(
        "/api/audit-log",
        headers=_auth(SUPER),
        params={"action": "publish_announcement"},
    )
    assert listing.status_code == 200, listing.text
    assert listing.json()["total"] >= 1


def test_spp_payment_writes_audit_entry(client: TestClient, db_session: Session) -> None:
    payment = client.post(
        "/api/spp/payments",
        headers=_auth(ADMIN),
        json={
            "bill_id": 2,
            "method": "transfer",
            "amount": 350000.0,
            "receipt_no": "RCPT-AUDIT-1",
        },
    )
    assert payment.status_code == 201, payment.text

    listing = client.get(
        "/api/audit-log", headers=_auth(SUPER), params={"action": "payment"}
    )
    assert listing.status_code == 200
    assert listing.json()["total"] >= 1


def test_audit_log_requires_privileged_role(
    client: TestClient, db_session: Session
) -> None:
    assert client.get("/api/audit-log", headers=_auth(PARENT10)).status_code == 403
    assert client.get("/api/audit-log", headers=_auth(SUPER)).status_code == 200
    assert client.get("/api/audit-log", headers=_auth(ADMIN)).status_code == 200


def test_audit_log_filters(client: TestClient, db_session: Session) -> None:
    client.post(
        "/api/auth/login", json={"email": "siti@menteng.sch.id", "password": SEED_PASSWORD}
    )
    listing = client.get(
        "/api/audit-log",
        headers=_auth(SUPER),
        params={"user_id": 4, "action": "login"},
    )
    assert listing.status_code == 200
    assert all(item["actor_id"] == 4 for item in listing.json()["items"])

    empty = client.get(
        "/api/audit-log",
        headers=_auth(SUPER),
        params={"from_date": (date.today() + timedelta(days=1)).isoformat()},
    )
    assert empty.status_code == 200
    assert empty.json()["items"] == []


def test_audit_entity_endpoint_super_admin_only(
    client: TestClient, db_session: Session
) -> None:
    created = client.post(
        "/api/announcements",
        headers=_auth(PRINCIPAL),
        json={"title": "Entity", "body": "Isi", "audience": "all"},
    )
    announcement_id = created.json()["id"]

    response = client.get(
        f"/api/audit-log/entity/announcement/{announcement_id}", headers=_auth(SUPER)
    )
    assert response.status_code == 200, response.text
    assert response.json()["total"] >= 1

    assert (
        client.get(
            f"/api/audit-log/entity/announcement/{announcement_id}", headers=_auth(ADMIN)
        ).status_code
        == 403
    )


def test_audit_summary_returns_aggregates(
    client: TestClient, db_session: Session
) -> None:
    client.post(
        "/api/auth/login", json={"email": "siti@menteng.sch.id", "password": SEED_PASSWORD}
    )
    response = client.get("/api/audit-log/summary", headers=_auth(SUPER))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total_events"] >= 1
    assert any(entry["action"] == "login" for entry in body["by_action"])

    assert client.get("/api/audit-log/summary", headers=_auth(ADMIN)).status_code == 403


def test_audit_log_has_no_mutation_routes(client: TestClient, db_session: Session) -> None:
    assert client.patch("/api/audit-log/1", headers=_auth(SUPER)).status_code in {404, 405}
    assert client.delete("/api/audit-log/1", headers=_auth(SUPER)).status_code in {404, 405}
