"""Integration tests for /api/tenants (ticket #5)."""

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


def _add_other_tenant(db_session: Session) -> None:
    other = Tenant(
        id=2,
        name="SMP Lain",
        jenjang_type=JenjangType.SMP,
        kurikulum_version="K13",
        config=None,
    )
    principal = User(
        id=200,
        tenant_id=2,
        school_id=None,
        email="p2@other.sch.id",
        hashed_auth_ref=bcrypt.hash(SEED_PASSWORD),
        role=UserRole.PRINCIPAL,
        full_name="Principal Other",
    )
    db_session.add_all([other, principal])
    db_session.commit()


def test_super_admin_creates_tenant(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/tenants",
        headers=_auth(SUPER),
        json={
            "name": "SMA Baru",
            "jenjang_type": "SMA",
            "kurikulum_version": "Merdeka 2024",
            "config": {"fase": "E"},
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["name"] == "SMA Baru"
    assert body["jenjang_type"] == "SMA"
    assert body["school_count"] == 0


def test_non_super_admin_cannot_create_tenant(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/tenants",
        headers=_auth(PRINCIPAL),
        json={"name": "Nope", "jenjang_type": "SD", "kurikulum_version": "K13"},
    )
    assert response.status_code == 403


def test_duplicate_tenant_name_same_jenjang_rejected(
    client: TestClient, db_session: Session
) -> None:
    response = client.post(
        "/api/tenants",
        headers=_auth(SUPER),
        json={
            "name": "TK Menteng Ceria",
            "jenjang_type": "SD",
            "kurikulum_version": "K13",
        },
    )
    assert response.status_code == 409


def test_same_name_different_jenjang_allowed(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/tenants",
        headers=_auth(SUPER),
        json={
            "name": "TK Menteng Ceria",
            "jenjang_type": "TK",
            "kurikulum_version": "Merdeka 2024",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["jenjang_type"] == "TK"


def test_invalid_jenjang_returns_422(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/tenants",
        headers=_auth(SUPER),
        json={"name": "Weird", "jenjang_type": "XX", "kurikulum_version": "K13"},
    )
    assert response.status_code == 422


def test_super_admin_lists_tenants_with_school_counts(
    client: TestClient, db_session: Session
) -> None:
    response = client.get("/api/tenants", headers=_auth(SUPER))
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == 1
    assert body[0]["school_count"] == 1


def test_non_super_admin_cannot_list_tenants(client: TestClient, db_session: Session) -> None:
    assert client.get("/api/tenants", headers=_auth(PRINCIPAL)).status_code == 403


def test_tenant_admin_can_read_own_tenant(client: TestClient, db_session: Session) -> None:
    response = client.get("/api/tenants/1", headers=_auth(PRINCIPAL))
    assert response.status_code == 200, response.text
    assert response.json()["id"] == 1


def test_get_tenant_cross_tenant_blocked(client: TestClient, db_session: Session) -> None:
    _add_other_tenant(db_session)
    response = client.get("/api/tenants/2", headers=_auth(PRINCIPAL))
    assert response.status_code == 403


def test_patch_tenant_super_admin(client: TestClient, db_session: Session) -> None:
    response = client.patch(
        "/api/tenants/1",
        headers=_auth(SUPER),
        json={"kurikulum_version": "Merdeka 2025"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["kurikulum_version"] == "Merdeka 2025"
    follow = client.get("/api/tenants/1", headers=_auth(SUPER))
    assert follow.json()["kurikulum_version"] == "Merdeka 2025"


def test_delete_tenant_blocked_when_schools_exist(
    client: TestClient, db_session: Session
) -> None:
    response = client.delete("/api/tenants/1", headers=_auth(SUPER))
    assert response.status_code == 409


def test_delete_empty_tenant_super_admin(client: TestClient, db_session: Session) -> None:
    created = client.post(
        "/api/tenants",
        headers=_auth(SUPER),
        json={"name": "Sekolah Kosong", "jenjang_type": "SMP", "kurikulum_version": "K13"},
    )
    tenant_id = created.json()["id"]
    response = client.delete(f"/api/tenants/{tenant_id}", headers=_auth(SUPER))
    assert response.status_code == 204
    assert client.get(f"/api/tenants/{tenant_id}", headers=_auth(SUPER)).status_code == 404


def test_delete_tenant_forbidden_for_non_super_admin(
    client: TestClient, db_session: Session
) -> None:
    assert client.delete("/api/tenants/1", headers=_auth(TEACHER)).status_code == 403


# ---------------------------------------------------------------------------
# nested schools listing + kurikulum inheritance (ticket #47)
# ---------------------------------------------------------------------------


def test_get_tenant_schools(client: TestClient, db_session: Session) -> None:
    response = client.get("/api/tenants/1/schools", headers=_auth(PRINCIPAL))
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == 1
    assert body[0]["tenant_id"] == 1


def test_get_tenant_schools_cross_tenant_blocked(
    client: TestClient, db_session: Session
) -> None:
    _add_other_tenant(db_session)
    response = client.get("/api/tenants/2/schools", headers=_auth(PRINCIPAL))
    assert response.status_code == 404


def test_create_school_inherits_kurikulum(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/schools",
        headers=_auth(SUPER),
        json={"tenant_id": 1, "name": "SDN Warisan", "address": "Jl. Warisan"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["kurikulum_version"] == "Merdeka 2024"


def test_create_school_with_explicit_kurikulum(
    client: TestClient, db_session: Session
) -> None:
    response = client.post(
        "/api/schools",
        headers=_auth(SUPER),
        json={
            "tenant_id": 1,
            "name": "SDN Override",
            "address": "Jl. Override",
            "kurikulum_version": "K13",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["kurikulum_version"] == "K13"


def test_admin_cannot_create_school(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/schools",
        headers=_auth(ADMIN),
        json={"tenant_id": 1, "name": "SDN Admin", "address": "Jl. Admin"},
    )
    assert response.status_code == 403


def test_principal_cannot_create_school(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/schools",
        headers=_auth(PRINCIPAL),
        json={"tenant_id": 1, "name": "SDN Principal", "address": "Jl. Principal"},
    )
    assert response.status_code == 403
