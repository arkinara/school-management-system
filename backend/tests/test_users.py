"""Integration tests for /api/users (ticket #6)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from passlib.hash import bcrypt
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token
from app.db.models import JenjangType, Tenant, User, UserRole
from app.db.seed import SEED_PASSWORD


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _token(user_id: int, tenant_id: int | None, school_id: int | None, role: str) -> str:
    return create_access_token(user_id, tenant_id, school_id, role)


SUPER = _token(1, 1, None, "super_admin")
ADMIN = _token(2, 1, 1, "admin")
PRINCIPAL = _token(3, 1, 1, "principal")
TEACHER = _token(4, 1, 1, "teacher")


def _add_user(
    db_session: Session,
    *,
    user_id: int,
    tenant_id: int,
    school_id: int | None,
    email: str,
    role: UserRole,
) -> None:
    db_session.add(
        User(
            id=user_id,
            tenant_id=tenant_id,
            school_id=school_id,
            email=email,
            hashed_auth_ref=bcrypt.hash(SEED_PASSWORD),
            role=role,
            full_name=f"User {user_id}",
        )
    )
    db_session.commit()


def _add_other_tenant(db_session: Session) -> None:
    db_session.add(
        Tenant(id=2, name="SMP Lain", jenjang_type=JenjangType.SMP, kurikulum_version="K13")
    )
    _add_user(
        db_session,
        user_id=200,
        tenant_id=2,
        school_id=None,
        email="p2@other.sch.id",
        role=UserRole.PRINCIPAL,
    )


def test_list_users_scoped_to_tenant(client: TestClient, db_session: Session) -> None:
    response = client.get("/api/users", headers=_auth(PRINCIPAL))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 11
    assert all(item["tenant_id"] == 1 for item in body["items"])


def test_super_admin_sees_all_users(client: TestClient, db_session: Session) -> None:
    _add_other_tenant(db_session)
    response = client.get("/api/users", headers=_auth(SUPER))
    assert response.status_code == 200, response.text
    assert response.json()["total"] == 12


def test_list_users_role_filter(client: TestClient, db_session: Session) -> None:
    response = client.get("/api/users?role=teacher", headers=_auth(PRINCIPAL))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 2
    assert all(item["role"] == "teacher" for item in body["items"])


def test_list_users_invalid_role_filter_returns_422(
    client: TestClient, db_session: Session
) -> None:
    assert client.get("/api/users?role=wizard", headers=_auth(PRINCIPAL)).status_code == 422


def test_list_users_pagination(client: TestClient, db_session: Session) -> None:
    response = client.get("/api/users?page=1&size=3", headers=_auth(PRINCIPAL))
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["items"]) == 3
    assert body["total"] == 11
    assert body["size"] == 3


def test_get_self_returns_profile(client: TestClient, db_session: Session) -> None:
    response = client.get("/api/users/4", headers=_auth(TEACHER))
    assert response.status_code == 200, response.text
    assert response.json()["id"] == 4


def test_get_user_cross_tenant_forbidden(client: TestClient, db_session: Session) -> None:
    _add_other_tenant(db_session)
    assert client.get("/api/users/200", headers=_auth(PRINCIPAL)).status_code == 403


def test_self_update_full_name_allowed(client: TestClient, db_session: Session) -> None:
    response = client.patch(
        "/api/users/4", headers=_auth(TEACHER), json={"full_name": "Siti Baru"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["full_name"] == "Siti Baru"


def test_self_cannot_change_role(client: TestClient, db_session: Session) -> None:
    response = client.patch("/api/users/4", headers=_auth(TEACHER), json={"role": "admin"})
    assert response.status_code == 403


def test_admin_can_update_same_school_user(client: TestClient, db_session: Session) -> None:
    response = client.patch(
        "/api/users/5", headers=_auth(ADMIN), json={"full_name": "Andi Updated"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["full_name"] == "Andi Updated"


def test_admin_cannot_update_cross_school_user(client: TestClient, db_session: Session) -> None:
    _add_user(
        db_session,
        user_id=300,
        tenant_id=1,
        school_id=None,
        email="orphan@menteng.sch.id",
        role=UserRole.TEACHER,
    )
    response = client.patch(
        "/api/users/300", headers=_auth(ADMIN), json={"full_name": "Nope"}
    )
    assert response.status_code == 403


def test_delete_user_removes_record(client: TestClient, db_session: Session) -> None:
    _add_user(
        db_session,
        user_id=400,
        tenant_id=1,
        school_id=1,
        email="temp@menteng.sch.id",
        role=UserRole.TEACHER,
    )
    assert client.delete("/api/users/400", headers=_auth(SUPER)).status_code == 204
    assert client.get("/api/users/400", headers=_auth(SUPER)).status_code == 404


def test_delete_user_cross_tenant_forbidden(client: TestClient, db_session: Session) -> None:
    _add_other_tenant(db_session)
    assert client.delete("/api/users/200", headers=_auth(PRINCIPAL)).status_code == 403
