"""JWT create/decode/verify and current-user dependency tests."""

from __future__ import annotations

import os
import subprocess
import sys
import uuid
from datetime import timedelta
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy.orm import Session, sessionmaker

from app.auth.deps import get_current_user
from app.auth.jwt import (
    JWT_ALGORITHM,
    TokenExpiredError,
    create_access_token,
    decode_access_token,
    decode_access_token_strict,
)
from app.db.models import User
from app.db.session import get_db


def test_create_and_decode_happy_path() -> None:
    token = create_access_token(3, 1, 1, "principal")
    payload = decode_access_token(token)
    assert payload is not None
    assert payload["user_id"] == 3
    assert payload["tenant_id"] == 1
    assert payload["school_id"] == 1
    assert payload["role"] == "principal"


def test_super_admin_null_school_accepted() -> None:
    token = create_access_token(1, 1, None, "super_admin")
    payload = decode_access_token(token)
    assert payload is not None
    assert payload["school_id"] is None


def test_expired_token_rejected() -> None:
    token = create_access_token(3, 1, 1, "principal", expires_delta=timedelta(seconds=-30))
    assert decode_access_token(token) is None
    try:
        decode_access_token_strict(token)
    except TokenExpiredError:
        pass
    else:
        raise AssertionError("expected TokenExpiredError")


def test_malformed_token_rejected() -> None:
    assert decode_access_token("not-a-real-token") is None


def test_wrong_secret_rejected() -> None:
    token = jwt.encode(
        {"user_id": 3, "role": "principal", "tenant_id": 1, "school_id": 1},
        "some-other-secret",
        algorithm=JWT_ALGORITHM,
    )
    assert decode_access_token(token) is None


def _build_app(session_factory: sessionmaker) -> FastAPI:
    test_app = FastAPI()

    def override_get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    @test_app.get("/me")
    def me(user: User = Depends(get_current_user)) -> dict[str, int | str]:
        return {"id": user.id, "role": str(user.role), "tenant_id": user.tenant_id}

    test_app.dependency_overrides[get_db] = override_get_db
    return test_app


def test_get_current_user_ok(db_session: Session, session_factory: sessionmaker) -> None:
    client = TestClient(_build_app(session_factory))
    token = create_access_token(3, 1, 1, "principal")
    response = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json() == {"id": 3, "role": "principal", "tenant_id": 1}


def test_get_current_user_missing_header(session_factory: sessionmaker) -> None:
    client = TestClient(_build_app(session_factory))
    response = client.get("/me")
    assert response.status_code == 401


def test_get_current_user_expired(db_session: Session, session_factory: sessionmaker) -> None:
    client = TestClient(_build_app(session_factory))
    token = create_access_token(3, 1, 1, "principal", expires_delta=timedelta(seconds=-30))
    response = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.json()["detail"] == "token expired"


def test_token_has_jti() -> None:
    token = create_access_token(3, 1, 1, "principal")
    payload = decode_access_token(token)
    assert payload is not None
    jti = payload.get("jti")
    assert isinstance(jti, str)
    # A UUID4 keeps the jti unique and unguessable.
    uuid.UUID(jti)


def test_jwt_secret_required_outside_dev() -> None:
    """Importing the jwt module in prod without JWT_SECRET must raise."""
    backend_dir = Path(__file__).resolve().parents[1]
    env = dict(os.environ)
    env.pop("JWT_SECRET", None)
    env.pop("JWT_REFRESH_SECRET", None)
    env["ENVIRONMENT"] = "prod"
    env["PYTHONPATH"] = str(backend_dir)

    result = subprocess.run(
        [sys.executable, "-c", "import app.auth.jwt"],
        cwd=str(backend_dir),
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
    assert "JWT_SECRET" in (result.stderr + result.stdout)
