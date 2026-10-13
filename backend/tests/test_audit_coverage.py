"""Ticket #63 audit-log coverage: super_admin-only reads, structured resource
columns, exact ``resource_id`` filtering, and auditing of 403 / tenant-boundary
denials, JWT failures, and user role/deactivation changes."""

from __future__ import annotations

from datetime import datetime

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token
from app.db.models import AuditLog, JenjangType, School, Tenant
from app.db.seed import SEED_PASSWORD


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _token(user_id: int, tenant_id: int | None, school_id: int | None, role: str) -> str:
    return create_access_token(user_id, tenant_id, school_id, role)


SUPER = _token(1, 1, None, "super_admin")
ADMIN = _token(2, 1, 1, "admin")
PRINCIPAL = _token(3, 1, 1, "principal")
TEACHER4 = _token(4, 1, 1, "teacher")
PARENT10 = _token(10, 1, 1, "parent")


def _add(client: TestClient, db: Session, **kwargs) -> AuditLog:
    row = AuditLog(**kwargs)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# schema
# ---------------------------------------------------------------------------


def test_audit_log_new_columns(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/auth/login",
        json={"email": "siti@menteng.sch.id", "password": SEED_PASSWORD},
    )
    assert response.status_code == 200, response.text

    row = db_session.scalars(
        select(AuditLog).where(AuditLog.action == "login").order_by(AuditLog.id.desc())
    ).first()
    assert row is not None
    assert row.outcome == "success"
    assert row.resource_type is None
    assert row.resource_id is None
    assert row.reason_code is None
    assert row.ip_address is not None
    assert row.user_agent is not None

    listed = client.get("/api/audit-log", headers=_auth(SUPER))
    assert listed.status_code == 200
    item = listed.json()["items"][0]
    for field in ("resource_type", "resource_id", "outcome", "reason_code", "ip_address"):
        assert field in item


# ---------------------------------------------------------------------------
# super_admin-only
# ---------------------------------------------------------------------------


def test_audit_get_super_admin_only_403_for_admin(
    client: TestClient, db_session: Session
) -> None:
    response = client.get("/api/audit-log", headers=_auth(ADMIN))
    assert response.status_code == 403
    assert db_session.scalars(
        select(AuditLog).where(AuditLog.action == "audit_log_access_denied")
    ).first() is not None


def test_audit_get_403_for_principal(client: TestClient, db_session: Session) -> None:
    assert client.get("/api/audit-log", headers=_auth(PRINCIPAL)).status_code == 403


def test_audit_plural_alias_super_admin_only(client: TestClient, db_session: Session) -> None:
    assert client.get("/api/audit-logs", headers=_auth(SUPER)).status_code == 200
    assert client.get("/api/audit-logs", headers=_auth(ADMIN)).status_code == 403


# ---------------------------------------------------------------------------
# filtering
# ---------------------------------------------------------------------------


def test_audit_filter_resource_id_exact(client: TestClient, db_session: Session) -> None:
    _add(
        client,
        db_session,
        actor_id=1,
        action="t",
        resource_type="school",
        resource_id=1,
        outcome="success",
    )
    _add(
        client,
        db_session,
        actor_id=1,
        action="t",
        resource_type="school",
        resource_id=12,
        outcome="success",
    )

    response = client.get(
        "/api/audit-log", headers=_auth(SUPER), params={"resource_id": 1}
    )
    assert response.status_code == 200, response.text
    ids = [item["resource_id"] for item in response.json()["items"]]
    assert ids and set(ids) == {1}
    assert 12 not in ids


def test_audit_filter_actor_action_combined(
    client: TestClient, db_session: Session
) -> None:
    _add(client, db_session, actor_id=7, action="alpha")
    _add(client, db_session, actor_id=7, action="beta")
    _add(client, db_session, actor_id=8, action="alpha")

    response = client.get(
        "/api/audit-log",
        headers=_auth(SUPER),
        params={"actor_id": 7, "action": "alpha"},
    )
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert items
    assert all(i["actor_id"] == 7 and i["action"] == "alpha" for i in items)


def test_audit_filter_tenant_school(client: TestClient, db_session: Session) -> None:
    _add(client, db_session, actor_id=1, action="t", tenant_id=9, school_id=9)
    _add(client, db_session, actor_id=1, action="t", tenant_id=9, school_id=8)

    response = client.get(
        "/api/audit-log",
        headers=_auth(SUPER),
        params={"tenant_id": 9, "school_id": 9},
    )
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert items
    assert all(i["tenant_id"] == 9 and i["school_id"] == 9 for i in items)


def test_audit_filter_date_range(client: TestClient, db_session: Session) -> None:
    _add(
        client,
        db_session,
        actor_id=1,
        action="old_event",
        created_at=datetime(2020, 1, 1),
    )
    _add(
        client,
        db_session,
        actor_id=1,
        action="new_event",
        created_at=datetime(2030, 1, 1),
    )

    response = client.get(
        "/api/audit-log",
        headers=_auth(SUPER),
        params={"date_from": "2025-01-01T00:00:00", "date_to": "2035-01-01T00:00:00"},
    )
    assert response.status_code == 200, response.text
    actions = [item["action"] for item in response.json()["items"]]
    assert "new_event" in actions
    assert "old_event" not in actions


# ---------------------------------------------------------------------------
# denial auditing
# ---------------------------------------------------------------------------


def test_audit_role_check_403_audited(client: TestClient, db_session: Session) -> None:
    response = client.post("/api/auth/cleanup-tokens", headers=_auth(TEACHER4))
    assert response.status_code == 403

    row = db_session.scalars(
        select(AuditLog).where(AuditLog.action == "role_check_failed")
    ).first()
    assert row is not None
    assert row.outcome == "denied"
    assert row.reason_code is not None and row.reason_code.startswith("required_")


def test_audit_tenant_boundary_audited(client: TestClient, db_session: Session) -> None:
    db_session.add(
        Tenant(
            id=2,
            name="SMP Lain",
            jenjang_type=JenjangType.SMP,
            kurikulum_version="K13",
        )
    )
    db_session.flush()
    db_session.add(
        School(id=2, tenant_id=2, name="SMP Lain 02", kurikulum_version="K13")
    )
    db_session.commit()

    response = client.get("/api/schools/2", headers=_auth(ADMIN))
    assert response.status_code == 404

    row = db_session.scalars(
        select(AuditLog).where(AuditLog.action == "scope_access_denied")
    ).first()
    assert row is not None
    assert row.resource_id == 2
    assert row.outcome == "denied"
    assert row.reason_code == "tenant_boundary_violation"


def test_audit_jwt_invalid_audited(client: TestClient, db_session: Session) -> None:
    for _ in range(10):
        response = client.get("/api/users", headers=_auth("not-a-real-token"))
        assert response.status_code == 401

    row = db_session.scalars(
        select(AuditLog).where(AuditLog.action == "auth_jwt_invalid")
    ).first()
    assert row is not None
    assert row.outcome == "denied"


# ---------------------------------------------------------------------------
# user mutations
# ---------------------------------------------------------------------------


def test_audit_user_role_change(client: TestClient, db_session: Session) -> None:
    response = client.patch(
        "/api/users/5", headers=_auth(SUPER), json={"role": "parent"}
    )
    assert response.status_code == 200, response.text

    row = db_session.scalars(
        select(AuditLog)
        .where(AuditLog.action == "update_user", AuditLog.resource_id == 5)
        .order_by(AuditLog.id.desc())
    ).first()
    assert row is not None
    assert row.before["role"] == "teacher"
    assert row.after["role"] == "parent"
    assert row.resource_type == "user"


def test_audit_user_deactivation(client: TestClient, db_session: Session) -> None:
    response = client.delete("/api/users/4", headers=_auth(PRINCIPAL))
    assert response.status_code == 204

    row = db_session.scalars(
        select(AuditLog).where(AuditLog.action == "deactivate_user")
    ).first()
    assert row is not None
    assert row.resource_id == 4
    assert row.after == {"is_active": False}


# ---------------------------------------------------------------------------
# existing domain audits still fire
# ---------------------------------------------------------------------------


def test_audit_payment_void_audited(client: TestClient, db_session: Session) -> None:
    payment = client.post(
        "/api/spp/payments",
        headers=_auth(ADMIN),
        json={"bill_id": 2, "method": "transfer", "amount": 350000.0},
    )
    assert payment.status_code == 201, payment.text
    payment_id = payment.json()["id"]

    voided = client.request(
        "DELETE",
        f"/api/spp/payments/{payment_id}",
        headers=_auth(PRINCIPAL),
        json={"reason": "audit-check"},
    )
    assert voided.status_code == 204, voided.text

    row = db_session.scalars(
        select(AuditLog).where(AuditLog.action == "void_payment")
    ).first()
    assert row is not None
    assert row.resource_type == "spp_payment"


def test_audit_grade_edit_audited(client: TestClient, db_session: Session) -> None:
    payload = {
        "class_id": 1,
        "subject_id": 2,
        "semester": "2026/2027-ganjil",
        "category": "tugas",
        "entries": [{"student_id": 1, "score": 80, "description": "baik"}],
    }
    created = client.post("/api/grades/bulk", headers=_auth(TEACHER4), json=payload)
    assert created.status_code == 201, created.text
    payload["entries"][0]["score"] = 90
    updated = client.post("/api/grades/bulk", headers=_auth(TEACHER4), json=payload)
    assert updated.status_code == 201, updated.text

    row = db_session.scalars(
        select(AuditLog).where(AuditLog.action == "update_grade")
    ).first()
    assert row is not None
    assert row.resource_type == "grade"


def test_audit_attendance_edit_audited(client: TestClient, db_session: Session) -> None:
    created = client.post(
        "/api/attendances",
        headers=_auth(TEACHER4),
        json={
            "student_id": 1,
            "class_id": 1,
            "date": "2024-09-05",
            "status": "sakit",
            "note": "demam",
        },
    )
    assert created.status_code == 201, created.text
    attendance_id = created.json()["id"]

    edited = client.patch(
        f"/api/attendances/{attendance_id}",
        headers=_auth(TEACHER4),
        json={"status": "izin"},
    )
    assert edited.status_code == 200, edited.text

    row = db_session.scalars(
        select(AuditLog).where(AuditLog.action == "update_attendance")
    ).first()
    assert row is not None
    assert row.resource_type == "attendance"


# ---------------------------------------------------------------------------
# best-effort
# ---------------------------------------------------------------------------


def test_audit_failure_doesnt_fail_business(
    client: TestClient, db_session: Session, monkeypatch
) -> None:
    class _BrokenAuditLog:
        def __init__(self, *args, **kwargs) -> None:
            raise RuntimeError("audit backend down")

    monkeypatch.setattr("app.audit.AuditLog", _BrokenAuditLog)

    response = client.post(
        "/api/auth/login",
        json={"email": "siti@menteng.sch.id", "password": SEED_PASSWORD},
    )
    assert response.status_code == 200, response.text
