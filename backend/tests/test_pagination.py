"""Pagination contract tests (ticket #44): page size is capped at 100."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token

PRINCIPAL = create_access_token(3, 1, 1, "principal")


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.parametrize("size", [101, 200, 500])
def test_pagination_cap(client: TestClient, db_session: Session, size: int) -> None:
    response = client.get(
        f"/api/students?size={size}",
        headers=_auth(PRINCIPAL),
    )
    assert response.status_code == 422, response.text


def test_pagination_accepts_max(client: TestClient, db_session: Session) -> None:
    response = client.get("/api/students?size=100", headers=_auth(PRINCIPAL))
    assert response.status_code == 200, response.text
    assert response.json()["size"] == 100
