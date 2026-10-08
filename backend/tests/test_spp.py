"""Integration tests for /api/spp (ticket #23)."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from passlib.hash import bcrypt
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token
from app.db.models import (
    AuditLog,
    Class,
    JenjangType,
    School,
    SppBill,
    SppBillStatus,
    SppPayment,
    Student,
    Tenant,
    User,
    UserRole,
)
from app.db.seed import SEED_PASSWORD

FUTURE = (date.today() + timedelta(days=30)).isoformat()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _token(user_id: int, tenant_id: int | None, school_id: int | None, role: str) -> str:
    return create_access_token(user_id, tenant_id, school_id, role)


SUPER = _token(1, 1, None, "super_admin")
ADMIN = _token(2, 1, 1, "admin")
PRINCIPAL = _token(3, 1, 1, "principal")
TEACHER4 = _token(4, 1, 1, "teacher")
PARENT10 = _token(10, 1, 1, "parent")


def _add_other_tenant(db_session: Session) -> None:
    db_session.add_all(
        [
            Tenant(id=2, name="SMP Lain", jenjang_type=JenjangType.SMP, kurikulum_version="K13"),
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
    db_session.add_all(
        [
            User(
                id=200,
                tenant_id=2,
                school_id=2,
                email="p2@other.sch.id",
                hashed_auth_ref=bcrypt.hash(SEED_PASSWORD),
                role=UserRole.ADMIN,
                full_name="Admin Other",
            ),
            User(
                id=201,
                tenant_id=2,
                school_id=2,
                email="s2@other.sch.id",
                hashed_auth_ref=bcrypt.hash(SEED_PASSWORD),
                role=UserRole.STUDENT,
                full_name="Student Other",
            ),
        ]
    )
    db_session.flush()
    db_session.add(Class(id=10, school_id=2, name="7A", grade_level=7, academic_year="2024/2025"))
    db_session.add(Student(id=20, user_id=201, school_id=2, class_id=10, nis="OTHER001"))
    db_session.flush()
    db_session.add(
        SppBill(
            id=50,
            student_id=20,
            period="2024-08",
            amount=500000.0,
            due_date=date.today() + timedelta(days=10),
            status=SppBillStatus.UNPAID,
            created_by=200,
        )
    )
    db_session.commit()


def _link_parent(client: TestClient, student_id: int, parent_id: int) -> None:
    response = client.post(
        f"/api/students/{student_id}/parents",
        headers=_auth(PRINCIPAL),
        json={"parent_user_id": parent_id, "is_primary": True},
    )
    assert response.status_code == 201, response.text


def test_bulk_create_bills_for_class(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/spp/bills/bulk",
        headers=_auth(ADMIN),
        json={
            "class_id": 1,
            "period": "2024-08",
            "amount": 400000,
            "due_date": FUTURE,
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["created"] == 2
    assert body["skipped"] == []


def test_bulk_create_is_idempotent(client: TestClient, db_session: Session) -> None:
    payload = {"class_id": 1, "period": "2024-09", "amount": 400000, "due_date": FUTURE}
    first = client.post("/api/spp/bills/bulk", headers=_auth(ADMIN), json=payload)
    assert first.json()["created"] == 2
    second = client.post("/api/spp/bills/bulk", headers=_auth(ADMIN), json=payload)
    assert second.status_code == 201
    assert second.json()["created"] == 0
    assert sorted(second.json()["skipped"]) == [1, 2]


def test_bulk_zero_students(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/spp/bills/bulk",
        headers=_auth(ADMIN),
        json={"class_id": 4, "period": "2024-08", "amount": 400000, "due_date": FUTURE},
    )
    assert response.status_code == 201, response.text
    assert response.json()["created"] == 0


def test_duplicate_single_bill_is_409(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/spp/bills",
        headers=_auth(ADMIN),
        json={
            "student_id": 1,
            "period": "2024-07",
            "amount": 350000,
            "due_date": FUTURE,
        },
    )
    assert response.status_code == 409


def test_payment_marks_paid_then_rejects_second(
    client: TestClient, db_session: Session
) -> None:
    created = client.post(
        "/api/spp/bills",
        headers=_auth(ADMIN),
        json={"student_id": 2, "period": "2024-10", "amount": 300000, "due_date": FUTURE},
    )
    assert created.status_code == 201, created.text
    bill_id = created.json()["id"]

    paid = client.post(
        "/api/spp/payments",
        headers=_auth(ADMIN),
        json={
            "bill_id": bill_id,
            "method": "transfer",
            "amount": 300000,
            "receipt_no": "RCPT-TEST-1",
        },
    )
    assert paid.status_code == 201, paid.text

    bill = client.get(f"/api/spp/bills/{bill_id}", headers=_auth(ADMIN))
    assert bill.json()["status"] == "paid"
    assert bill.json()["balance"] == 0

    again = client.post(
        "/api/spp/payments",
        headers=_auth(ADMIN),
        json={
            "bill_id": bill_id,
            "method": "cash",
            "amount": 1000,
            "receipt_no": "RCPT-TEST-2",
        },
    )
    assert again.status_code == 409


def test_partial_payment_keeps_unpaid_and_rejects_overpay(
    client: TestClient, db_session: Session
) -> None:
    created = client.post(
        "/api/spp/bills",
        headers=_auth(ADMIN),
        json={"student_id": 2, "period": "2024-11", "amount": 100000, "due_date": FUTURE},
    )
    bill_id = created.json()["id"]

    partial = client.post(
        "/api/spp/payments",
        headers=_auth(ADMIN),
        json={
            "bill_id": bill_id,
            "method": "cash",
            "amount": 40000,
            "receipt_no": "RCPT-PART-1",
        },
    )
    assert partial.status_code == 201, partial.text

    bill = client.get(f"/api/spp/bills/{bill_id}", headers=_auth(ADMIN)).json()
    assert bill["status"] == "partially_paid"
    assert bill["balance"] == 60000

    over = client.post(
        "/api/spp/payments",
        headers=_auth(ADMIN),
        json={
            "bill_id": bill_id,
            "method": "cash",
            "amount": 70000,
            "receipt_no": "RCPT-PART-2",
        },
    )
    assert over.status_code == 422


def test_payment_nonexistent_bill_404(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/spp/payments",
        headers=_auth(ADMIN),
        json={
            "bill_id": 999,
            "method": "cash",
            "amount": 1000,
            "receipt_no": "RCPT-X",
        },
    )
    assert response.status_code == 404


def test_parent_lists_only_own_children(client: TestClient, db_session: Session) -> None:
    _link_parent(client, 1, 10)
    response = client.get("/api/spp/bills", headers=_auth(PARENT10))
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert items
    assert all(item["student_id"] == 1 for item in items)

    other = client.get("/api/spp/bills/2", headers=_auth(PARENT10))
    assert other.status_code == 403


def test_summary_aggregates(client: TestClient, db_session: Session) -> None:
    response = client.get("/api/spp/summary", headers=_auth(ADMIN))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["bill_count"] >= 4
    assert body["total_billed"] > 0
    assert body["total_collected"] > 0
    assert 0 <= body["collection_rate"] <= 100


def test_overdue_detection_and_flip(client: TestClient, db_session: Session) -> None:
    db_session.add(
        SppBill(
            id=90,
            student_id=2,
            period="2025-01",
            amount=200000.0,
            due_date=date.today() - timedelta(days=3),
            status=SppBillStatus.UNPAID,
            created_by=2,
        )
    )
    db_session.commit()

    summary = client.get("/api/spp/summary", headers=_auth(ADMIN)).json()
    assert summary["overdue_count"] >= 1

    flipped = client.post("/api/spp/bills/mark-overdue", headers=_auth(ADMIN))
    assert flipped.status_code == 200, flipped.text
    assert flipped.json()["updated"] >= 1
    db_session.expire_all()
    assert db_session.get(SppBill, 90).status == SppBillStatus.OVERDUE

    second = client.post("/api/spp/bills/mark-overdue", headers=_auth(ADMIN))
    assert second.json()["updated"] == 0


def test_delete_only_unpaid(client: TestClient, db_session: Session) -> None:
    created = client.post(
        "/api/spp/bills",
        headers=_auth(ADMIN),
        json={"student_id": 3, "period": "2024-12", "amount": 150000, "due_date": FUTURE},
    )
    bill_id = created.json()["id"]

    paid_delete = client.delete("/api/spp/bills/1", headers=_auth(ADMIN))
    assert paid_delete.status_code == 409

    assert client.delete(f"/api/spp/bills/{bill_id}", headers=_auth(ADMIN)).status_code == 204
    db_session.expire_all()
    assert db_session.get(SppBill, bill_id) is None


def test_payments_list_scoped(client: TestClient, db_session: Session) -> None:
    _link_parent(client, 1, 10)
    response = client.get("/api/spp/payments?student_id=1", headers=_auth(PARENT10))
    assert response.status_code == 200, response.text
    assert all(item["bill_id"] == 1 for item in response.json()["items"])

    blocked = client.get("/api/spp/payments?student_id=3", headers=_auth(PARENT10))
    assert blocked.status_code == 403


def test_tenant_boundary_enforced(client: TestClient, db_session: Session) -> None:
    _add_other_tenant(db_session)
    assert client.get("/api/spp/bills?student_id=20", headers=_auth(ADMIN)).status_code == 403
    assert client.get("/api/spp/bills/50", headers=_auth(ADMIN)).status_code == 403
    assert client.get("/api/spp/bills/50", headers=_auth(SUPER)).status_code == 200

    forbidden = client.post(
        "/api/spp/bills/bulk",
        headers=_auth(ADMIN),
        json={"class_id": 10, "period": "2024-09", "amount": 100000, "due_date": FUTURE},
    )
    assert forbidden.status_code == 403


def test_teacher_forbidden_from_managing(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/spp/bills/bulk",
        headers=_auth(TEACHER4),
        json={"class_id": 1, "period": "2024-08", "amount": 100000, "due_date": FUTURE},
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Ticket #59: bill-scoped payment, partially_paid, receipts, void, uniqueness
# ---------------------------------------------------------------------------

ADMIN3 = _token(300, 1, 3, "admin")


def _add_school3(db_session: Session) -> None:
    """A second school in the same tenant, with its own admin + student."""
    db_session.add_all(
        [
            School(
                id=3,
                tenant_id=1,
                name="SDN Menteng 03",
                address="Jl. Baru",
                kurikulum_version="Merdeka 2024",
            ),
            User(
                id=300,
                tenant_id=1,
                school_id=3,
                email="admin3@menteng.sch.id",
                hashed_auth_ref=bcrypt.hash(SEED_PASSWORD),
                role=UserRole.ADMIN,
                full_name="Admin Tiga",
            ),
            User(
                id=301,
                tenant_id=1,
                school_id=3,
                email="student3@menteng.sch.id",
                hashed_auth_ref=bcrypt.hash(SEED_PASSWORD),
                role=UserRole.STUDENT,
                full_name="Student Tiga",
            ),
        ]
    )
    db_session.flush()
    db_session.add(Class(id=11, school_id=3, name="1C", grade_level=1, academic_year="2026/2027"))
    db_session.add(Student(id=21, user_id=301, school_id=3, class_id=11, nis="S3001"))
    db_session.commit()


def _new_bill(
    client: TestClient, headers: dict[str, str], student_id: int, period: str, amount: float
) -> int:
    created = client.post(
        "/api/spp/bills",
        headers=headers,
        json={"student_id": student_id, "period": period, "amount": amount, "due_date": FUTURE},
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]


def test_payment_returns_updated_bill(client: TestClient, db_session: Session) -> None:
    bill_id = _new_bill(client, _auth(ADMIN), 2, "2031-01", 100000)
    response = client.post(
        f"/api/spp/bills/{bill_id}/payments",
        headers=_auth(ADMIN),
        json={"amount": 40000, "method": "cash"},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["payment"]["amount"] == 40000
    assert body["bill"]["paid_amount"] == 40000
    assert body["bill"]["balance"] == 60000


def test_partially_paid_status(client: TestClient, db_session: Session) -> None:
    bill_id = _new_bill(client, _auth(ADMIN), 2, "2031-02", 100000)
    client.post(
        f"/api/spp/bills/{bill_id}/payments",
        headers=_auth(ADMIN),
        json={"amount": 25000, "method": "cash"},
    )
    bill = client.get(f"/api/spp/bills/{bill_id}", headers=_auth(ADMIN)).json()
    assert bill["status"] == "partially_paid"
    assert bill["paid_amount"] == 25000
    assert bill["balance"] == 75000


def test_full_payment_status(client: TestClient, db_session: Session) -> None:
    bill_id = _new_bill(client, _auth(ADMIN), 2, "2031-03", 100000)
    body = client.post(
        f"/api/spp/bills/{bill_id}/payments",
        headers=_auth(ADMIN),
        json={"amount": 100000, "method": "transfer"},
    ).json()
    assert body["bill"]["status"] == "paid"
    assert body["bill"]["balance"] == 0


def test_receipt_no_increments_per_school(client: TestClient, db_session: Session) -> None:
    _add_school3(db_session)
    bill_id = _new_bill(client, _auth(ADMIN3), 21, "2031-04", 100000)
    first = client.post(
        f"/api/spp/bills/{bill_id}/payments",
        headers=_auth(ADMIN3),
        json={"amount": 40000, "method": "cash"},
    )
    second = client.post(
        f"/api/spp/bills/{bill_id}/payments",
        headers=_auth(ADMIN3),
        json={"amount": 30000, "method": "cash"},
    )
    assert first.json()["payment"]["receipt_no"] == 1
    assert second.json()["payment"]["receipt_no"] == 2


def test_receipt_no_per_school_independent(client: TestClient, db_session: Session) -> None:
    _add_school3(db_session)
    bill3 = _new_bill(client, _auth(ADMIN3), 21, "2031-05", 100000)
    pay3 = client.post(
        f"/api/spp/bills/{bill3}/payments",
        headers=_auth(ADMIN3),
        json={"amount": 10000, "method": "cash"},
    )
    # School 3 starts its own sequence at 1, regardless of school 1's receipts.
    assert pay3.json()["payment"]["receipt_no"] == 1

    bill1 = _new_bill(client, _auth(ADMIN), 2, "2031-06", 100000)
    pay1 = client.post(
        f"/api/spp/bills/{bill1}/payments",
        headers=_auth(ADMIN),
        json={"amount": 10000, "method": "cash"},
    )
    assert pay1.json()["payment"]["receipt_no"] == 2


def test_unique_constraint_blocks_duplicate_bill(
    client: TestClient, db_session: Session
) -> None:
    db_session.add(
        SppBill(
            student_id=2,
            period="2099-01",
            amount=100000.0,
            due_date=date.today() + timedelta(days=10),
            status=SppBillStatus.UNPAID,
            created_by=2,
        )
    )
    db_session.commit()

    db_session.add(
        SppBill(
            student_id=2,
            period="2099-01",
            amount=100000.0,
            due_date=date.today() + timedelta(days=10),
            status=SppBillStatus.UNPAID,
            created_by=2,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_void_payment_by_non_admin_403(client: TestClient, db_session: Session) -> None:
    response = client.request(
        "DELETE",
        "/api/spp/payments/1",
        headers=_auth(TEACHER4),
        json={"reason": "nope"},
    )
    assert response.status_code == 403


def test_void_payment_reduces_paid_amount(client: TestClient, db_session: Session) -> None:
    bill_id = _new_bill(client, _auth(PRINCIPAL), 3, "2031-07", 100000)
    payment = client.post(
        f"/api/spp/bills/{bill_id}/payments",
        headers=_auth(PRINCIPAL),
        json={"amount": 60000, "method": "cash"},
    ).json()["payment"]

    voided = client.request(
        "DELETE",
        f"/api/spp/payments/{payment['id']}",
        headers=_auth(PRINCIPAL),
        json={"reason": "salah input"},
    )
    assert voided.status_code == 204, voided.text

    bill = client.get(f"/api/spp/bills/{bill_id}", headers=_auth(PRINCIPAL)).json()
    assert bill["paid_amount"] == 0
    assert bill["balance"] == 100000
    assert bill["status"] == "unpaid"

    db_session.expire_all()
    assert db_session.get(SppPayment, payment["id"]).voided is True


def test_void_payment_audit_logged(client: TestClient, db_session: Session) -> None:
    bill_id = _new_bill(client, _auth(PRINCIPAL), 3, "2031-08", 100000)
    payment = client.post(
        f"/api/spp/bills/{bill_id}/payments",
        headers=_auth(PRINCIPAL),
        json={"amount": 60000, "method": "cash"},
    ).json()["payment"]

    client.request(
        "DELETE",
        f"/api/spp/payments/{payment['id']}",
        headers=_auth(PRINCIPAL),
        json={"reason": "audit check"},
    )
    db_session.expire_all()
    row = (
        db_session.query(AuditLog)
        .filter(AuditLog.action == "void_payment", AuditLog.actor_id == 3)
        .order_by(AuditLog.id.desc())
        .first()
    )
    assert row is not None
    assert "audit check" in (row.reason or "")
