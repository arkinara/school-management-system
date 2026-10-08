"""Tests for whole-school / per-class SPP bill bulk generation (ticket #59)."""

from __future__ import annotations

from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token

FUTURE = (date.today() + timedelta(days=30)).isoformat()

ADMIN = create_access_token(2, 1, 1, "admin")


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_bulk_generate_per_class(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/spp/bills/bulk-generate",
        headers=_auth(ADMIN),
        json={"class_id": 1, "period": "2030-01", "amount": 400000, "due_date": FUTURE},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["created"] == 2
    assert body["skipped"] == 0
    assert body["no_students"] == 2


def test_bulk_generate_per_school(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/spp/bills/bulk-generate",
        headers=_auth(ADMIN),
        json={"school_id": 1, "period": "2030-02", "amount": 400000, "due_date": FUTURE},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["created"] == 4
    assert body["no_students"] == 4


def test_bulk_generate_zero_students_returns_404(
    client: TestClient, db_session: Session
) -> None:
    response = client.post(
        "/api/spp/bills/bulk-generate",
        headers=_auth(ADMIN),
        json={"class_id": 4, "period": "2030-03", "amount": 400000, "due_date": FUTURE},
    )
    assert response.status_code == 404


def test_bulk_generate_idempotent(client: TestClient, db_session: Session) -> None:
    payload = {"class_id": 1, "period": "2030-04", "amount": 400000, "due_date": FUTURE}
    first = client.post("/api/spp/bills/bulk-generate", headers=_auth(ADMIN), json=payload)
    assert first.json()["created"] == 2

    second = client.post("/api/spp/bills/bulk-generate", headers=_auth(ADMIN), json=payload)
    assert second.status_code == 201
    assert second.json()["created"] == 0
    assert second.json()["skipped"] == 2


def test_bulk_generate_requires_scope(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/spp/bills/bulk-generate",
        headers=_auth(ADMIN),
        json={"period": "2030-05", "amount": 400000, "due_date": FUTURE},
    )
    assert response.status_code == 422
