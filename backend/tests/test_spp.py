"""Integration tests for /api/spp (ticket #23)."""

from __future__ import annotations

from datetime import date, timedelta

from fastapi.testclient import TestClient
from passlib.hash import bcrypt
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token
from app.db.models import (
    Class,
    JenjangType,
    School,
    SppBill,
    SppBillStatus,
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
            School(id=2, tenant_id=2, name="SMP Lain 02", address="Jl. Lain"),
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
    assert bill["status"] == "unpaid"
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
