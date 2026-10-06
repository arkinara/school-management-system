"""Integration tests for the /api/auth HTTP surface."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from passlib.hash import bcrypt
from sqlalchemy.orm import Session, sessionmaker

from app.auth.cleanup import cleanup_expired_tokens
from app.auth.deps import get_current_user, require_any_authenticated_user, require_role
from app.auth.jwt import create_access_token, decode_access_token
from app.db.models import JenjangType, Tenant, TokenDenylist, User, UserRole
from app.db.seed import SEED_PASSWORD
from app.db.session import get_db

TEACHER_EMAIL = "siti@menteng.sch.id"
STUDENT_EMAIL = "dewi@menteng.sch.id"
PRINCIPAL_EMAIL = "budi@menteng.sch.id"
SUPER_ADMIN_EMAIL = "superadmin@menteng.sch.id"


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _login(client: TestClient, email: str = TEACHER_EMAIL) -> dict:
    response = client.post(
        "/api/auth/login",
        json={"email": email, "password": SEED_PASSWORD},
    )
    assert response.status_code == 200, response.text
    return response.json()


# ---------------------------------------------------------------------------
# register
# ---------------------------------------------------------------------------


def test_register_success_creates_user_and_token(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/auth/register",
        json={
            "email": "new.student@menteng.sch.id",
            "password": "newpass123",
            "full_name": "New Student",
            "role": "student",
            "school_id": 1,
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == "new.student@menteng.sch.id"
    assert body["user"]["role"] == "student"
    assert body["user"]["school_id"] == 1
    assert body["user"]["tenant_id"] == 1

    claims = decode_access_token(body["access_token"])
    assert claims is not None
    assert claims["role"] == "student"
    assert claims["tenant_id"] == 1
    assert claims["school_id"] == 1

    created = db_session.get(User, body["user"]["id"])
    assert created is not None
    assert created.hashed_auth_ref != "newpass123"
    assert bcrypt.verify("newpass123", created.hashed_auth_ref)


def test_register_duplicate_email_returns_409(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/auth/register",
        json={
            "email": STUDENT_EMAIL,
            "password": "whatever123",
            "full_name": "Dup",
            "role": "student",
            "school_id": 1,
        },
    )
    assert response.status_code == 409


def test_register_weak_password_returns_422(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register",
        json={
            "email": "weak@menteng.sch.id",
            "password": "short",
            "full_name": "Weak",
            "role": "student",
            "school_id": 1,
        },
    )
    assert response.status_code == 422


def test_register_invalid_role_returns_400(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register",
        json={
            "email": "wizard@menteng.sch.id",
            "password": "wand12345",
            "full_name": "Wizard",
            "role": "wizard",
            "school_id": 1,
        },
    )
    assert response.status_code == 400


def test_register_super_admin_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register",
        json={
            "email": "yayasan2@menteng.sch.id",
            "password": "yayasan123",
            "full_name": "Yayasan Two",
            "role": "super_admin",
        },
    )
    assert response.status_code == 400


def test_register_privileged_roles_rejected(client: TestClient) -> None:
    for idx, role in enumerate(("admin", "principal", "teacher"), start=1):
        response = client.post(
            "/api/auth/register",
            json={
                "email": f"priv{idx}.{role}@menteng.sch.id",
                "password": "privpass123",
                "full_name": f"Priv {role}",
                "role": role,
                "school_id": 1,
            },
        )
        assert response.status_code == 400, f"{role}: {response.text}"


def test_register_student_without_school_id_returns_422(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register",
        json={
            "email": "nosc@menteng.sch.id",
            "password": "nosc12345",
            "full_name": "No School",
            "role": "student",
        },
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# login
# ---------------------------------------------------------------------------


def test_login_success_returns_token_and_user(client: TestClient, db_session: Session) -> None:
    body = _login(client)
    assert body["user"]["email"] == TEACHER_EMAIL
    assert body["user"]["role"] == "teacher"
    claims = decode_access_token(body["access_token"])
    assert claims is not None
    assert claims["role"] == "teacher"
    assert claims["tenant_id"] == 1
    assert claims["school_id"] == 1
    assert claims["user_id"] == body["user"]["id"]


def test_login_wrong_password_returns_401(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/auth/login",
        json={"email": TEACHER_EMAIL, "password": "wrong-password"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_login_unknown_email_returns_401(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/auth/login",
        json={"email": "ghost@menteng.sch.id", "password": SEED_PASSWORD},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_login_wrong_tenant_returns_401(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/auth/login",
        json={"email": TEACHER_EMAIL, "password": SEED_PASSWORD, "tenant_id": 99},
    )
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# logout
# ---------------------------------------------------------------------------


def test_logout_requires_auth(client: TestClient) -> None:
    assert client.post("/api/auth/logout").status_code == 401


def test_logout_with_auth_returns_204(client: TestClient, db_session: Session) -> None:
    token = _login(client)["access_token"]
    response = client.post("/api/auth/logout", headers=_auth(token))
    assert response.status_code == 204


# ---------------------------------------------------------------------------
# me
# ---------------------------------------------------------------------------


def test_me_requires_auth(client: TestClient) -> None:
    assert client.get("/api/auth/me").status_code == 401


def test_me_returns_profile(client: TestClient, db_session: Session) -> None:
    login_body = _login(client)
    response = client.get("/api/auth/me", headers=_auth(login_body["access_token"]))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["user"]["email"] == TEACHER_EMAIL
    assert body["role"] == "teacher"
    assert body["tenant_id"] == 1
    assert body["school_id"] == 1
    assert body["user"]["id"] == login_body["user"]["id"]


def test_me_cross_tenant_token_returns_own_profile(
    client: TestClient, db_session: Session
) -> None:
    tenant = Tenant(
        id=2,
        name="Other Tenant",
        jenjang_type=JenjangType.SD,
        kurikulum_version="Merdeka 2024",
    )
    other = User(
        id=100,
        tenant_id=2,
        school_id=None,
        email="other@other.sch.id",
        hashed_auth_ref=bcrypt.hash(SEED_PASSWORD),
        role=UserRole.PRINCIPAL,
        full_name="Other Principal",
    )
    db_session.add_all([tenant, other])
    db_session.commit()

    token = create_access_token(100, 2, None, "principal")
    response = client.get("/api/auth/me", headers=_auth(token))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["user"]["id"] == 100
    assert body["tenant_id"] == 2
    assert body["school_id"] is None


# ---------------------------------------------------------------------------
# change-password
# ---------------------------------------------------------------------------


def test_change_password_success(client: TestClient, db_session: Session) -> None:
    token = _login(client)["access_token"]
    response = client.post(
        "/api/auth/change-password",
        headers=_auth(token),
        json={"current_password": SEED_PASSWORD, "new_password": "brandnew123"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["detail"] == "password updated"

    relogin = client.post(
        "/api/auth/login",
        json={"email": TEACHER_EMAIL, "password": "brandnew123"},
    )
    assert relogin.status_code == 200


def test_change_password_wrong_current_returns_401(client: TestClient, db_session: Session) -> None:
    token = _login(client)["access_token"]
    response = client.post(
        "/api/auth/change-password",
        headers=_auth(token),
        json={"current_password": "not-it", "new_password": "brandnew123"},
    )
    assert response.status_code == 401


def test_change_password_weak_new_returns_422(client: TestClient, db_session: Session) -> None:
    token = _login(client)["access_token"]
    response = client.post(
        "/api/auth/change-password",
        headers=_auth(token),
        json={"current_password": SEED_PASSWORD, "new_password": "short"},
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# role guard
# ---------------------------------------------------------------------------


def test_require_role_allows_and_denies(db_session: Session, session_factory: sessionmaker) -> None:
    test_app = FastAPI()

    def override_get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    @test_app.get("/teacher-only")
    def teacher_only(user: User = Depends(require_role("teacher"))) -> dict[str, int]:
        return {"id": user.id}

    test_app.dependency_overrides[get_db] = override_get_db
    test_client = TestClient(test_app)

    teacher_token = create_access_token(4, 1, 1, "teacher")
    assert test_client.get("/teacher-only", headers=_auth(teacher_token)).status_code == 200

    student_token = create_access_token(6, 1, 1, "student")
    forbidden = test_client.get("/teacher-only", headers=_auth(student_token))
    assert forbidden.status_code == 403
    assert forbidden.json()["detail"] == "forbidden"


def test_require_any_authenticated_user_alias() -> None:
    assert require_any_authenticated_user is get_current_user


# ---------------------------------------------------------------------------
# token revocation (ticket #40)
# ---------------------------------------------------------------------------


def test_logout_denylists_token_and_me_returns_401(
    client: TestClient, db_session: Session
) -> None:
    login_body = _login(client)
    token = login_body["access_token"]

    response = client.post("/api/auth/logout", headers=_auth(token))
    assert response.status_code == 204

    claims = decode_access_token(token)
    assert claims is not None
    entry = db_session.get(TokenDenylist, claims["jti"])
    assert entry is not None
    assert entry.user_id == login_body["user"]["id"]

    after = client.get("/api/auth/me", headers=_auth(token))
    assert after.status_code == 401
    assert after.json()["detail"] == "token revoked"


def test_logout_revokes_access_token(client: TestClient, db_session: Session) -> None:
    token = _login(client)["access_token"]
    assert client.post("/api/auth/logout", headers=_auth(token)).status_code == 204
    assert client.get("/api/auth/me", headers=_auth(token)).status_code == 401


# ---------------------------------------------------------------------------
# refresh (ticket #40)
# ---------------------------------------------------------------------------


def test_login_returns_refresh_token(client: TestClient, db_session: Session) -> None:
    body = _login(client)
    assert body.get("refresh_token")
    assert body["refresh_token"] != body["access_token"]


def test_refresh_returns_new_tokens(client: TestClient, db_session: Session) -> None:
    body = _login(client)
    refresh = body["refresh_token"]

    response = client.post("/api/auth/refresh", json=refresh)
    assert response.status_code == 200, response.text
    new = response.json()
    assert new["access_token"] != body["access_token"]
    assert new["refresh_token"]
    assert new["refresh_token"] != refresh

    me = client.get("/api/auth/me", headers=_auth(new["access_token"]))
    assert me.status_code == 200, me.text


def test_refresh_revoked_token_fails(client: TestClient, db_session: Session) -> None:
    body = _login(client)
    token = body["access_token"]
    refresh = body["refresh_token"]

    # Logout revokes both the access token and the supplied refresh token.
    assert client.post("/api/auth/logout", headers=_auth(token), json=refresh).status_code == 204

    response = client.post("/api/auth/refresh", json=refresh)
    assert response.status_code == 401


def test_refresh_invalid_token_returns_401(client: TestClient) -> None:
    response = client.post("/api/auth/refresh", json="not-a-real-token")
    assert response.status_code == 401


def test_refresh_rejects_access_token(client: TestClient, db_session: Session) -> None:
    access = _login(client)["access_token"]
    response = client.post("/api/auth/refresh", json=access)
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# denylist cleanup (ticket #40)
# ---------------------------------------------------------------------------


def test_cleanup_expired_tokens(db_session: Session) -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    db_session.add(
        TokenDenylist(jti="expired-jti", user_id=None, expires_at=now - timedelta(hours=1))
    )
    db_session.add(
        TokenDenylist(jti="live-jti", user_id=None, expires_at=now + timedelta(hours=1))
    )
    db_session.commit()

    deleted = cleanup_expired_tokens(db_session)
    assert deleted == 1
    assert db_session.get(TokenDenylist, "expired-jti") is None
    assert db_session.get(TokenDenylist, "live-jti") is not None


def test_cleanup_tokens_endpoint_requires_admin(client: TestClient, db_session: Session) -> None:
    token = _login(client)["access_token"]
    response = client.post("/api/auth/cleanup-tokens", headers=_auth(token))
    assert response.status_code == 403


def test_cleanup_tokens_endpoint_allows_super_admin(
    client: TestClient, db_session: Session
) -> None:
    token = _login(client, SUPER_ADMIN_EMAIL)["access_token"]
    response = client.post("/api/auth/cleanup-tokens", headers=_auth(token))
    assert response.status_code == 200
    assert response.json()["deleted"] >= 0
