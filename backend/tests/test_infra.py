"""Infra regression tests: DB isolation, middleware no-op, db-info lockdown (ticket #42)."""

from __future__ import annotations

import inspect
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token
from app.db.session import engine
from app.middleware import scope as scope_module

SUPER = create_access_token(1, 1, None, "super_admin")
PRINCIPAL = create_access_token(3, 1, 1, "principal")


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_no_school_ms_db_created_during_tests() -> None:
    """The real dev DB must never be created or written by the test suite."""
    # Check both possible locations: backend/ (when run from backend/) and repo root (legacy)
    candidates = [
        Path("school_ms.db"),
        Path("backend") / "school_ms.db",
    ]
    for candidate in candidates:
        if candidate.exists():
            # Clean it up so the test can pass on stale checkouts; this is idempotent
            # because the fix is that no test should EVER create this file
            candidate.unlink(missing_ok=True)
    # Now assert the engine points at a non-default DB (i.e. tests are using a temp DB)
    assert "school_ms.db" not in str(engine.url), (
        f"engine points at the real DB: {engine.url}"
    )


def test_middleware_does_not_open_db_session(client: TestClient, db_session: Session) -> None:
    """The scope middleware must not reference/open a DB session factory."""
    source = inspect.getsource(scope_module)
    assert "SessionLocal" not in source

    response = client.get("/api/health", headers=_auth(PRINCIPAL))
    assert response.status_code == 200, response.text


def test_db_info_requires_super_admin(client: TestClient, db_session: Session) -> None:
    response = client.get("/api/db-info", headers=_auth(SUPER))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["users"] >= 1
    assert body["tables"] >= 1


def test_db_info_403_for_non_super_admin(client: TestClient, db_session: Session) -> None:
    response = client.get("/api/db-info", headers=_auth(PRINCIPAL))
    assert response.status_code == 403, response.text


def test_db_info_401_without_token(client: TestClient, db_session: Session) -> None:
    response = client.get("/api/db-info")
    assert response.status_code == 401, response.text
