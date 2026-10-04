"""Integration tests for /api/schools (ticket #5)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from passlib.hash import bcrypt
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token
from app.db.models import JenjangType, School, Tenant, User, UserRole
from app.db.seed import SEED_PASSWORD


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _token(user_id: int, tenant_id: int | None, school_id: int | None, role: str) -> str:
    return create_access_token(user_id, tenant_id, school_id, role)


SUPER = _token(1, 1, None, "super_admin")
ADMIN = _token(2, 1, 1, "admin")
PRINCIPAL = _token(3, 1, 1, "principal")
TEACHER = _token(4, 1, 1, "teacher")


def _add_other_tenant_with_school(db_session: Session) -> None:
    other = Tenant(id=2, name="SMP Lain", jenjang_type=JenjangType.SMP, kurikulum_version="K13")
    school = School(id=2, tenant_id=2, name="SMP Lain 02", address="Jl. Lain")
    principal = User(
        id=200,
        tenant_id=2,
        school_id=2,
        email="p2@other.sch.id",
        hashed_auth_ref=bcrypt.hash(SEED_PASSWORD),
        role=UserRole.PRINCIPAL,
        full_name="Principal Other",
    )
    db_session.add_all([other, school, principal])
    db_session.commit()


def test_principal_creates_school_in_own_tenant(
    client: TestClient, db_session: Session
) -> None:
    response = client.post(
        "/api/schools",
        headers=_auth(PRINCIPAL),
        json={"tenant_id": 1, "name": "SDN Menteng 02", "address": "Jl. Baru No. 2"},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["tenant_id"] == 1
    assert body["name"] == "SDN Menteng 02"


def test_admin_creates_school_in_own_tenant(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/schools",
        headers=_auth(ADMIN),
        json={"tenant_id": 1, "name": "SDN Menteng 03", "address": "Jl. Tiga"},
    )
    assert response.status_code == 201, response.text


def test_create_school_cross_tenant_blocked(client: TestClient, db_session: Session) -> None:
    _add_other_tenant_with_school(db_session)
    response = client.post(
        "/api/schools",
        headers=_auth(PRINCIPAL),
        json={"tenant_id": 2, "name": "Bad", "address": "Nowhere"},
    )
    assert response.status_code == 403


def test_create_school_unknown_tenant_returns_404(
    client: TestClient, db_session: Session
) -> None:
    response = client.post(
        "/api/schools",
        headers=_auth(SUPER),
        json={"tenant_id": 999, "name": "Ghost", "address": "Nowhere"},
    )
    assert response.status_code == 404


def test_create_school_missing_field_returns_422(
    client: TestClient, db_session: Session
) -> None:
    response = client.post(
        "/api/schools",
        headers=_auth(SUPER),
        json={"tenant_id": 1, "name": "No Address"},
    )
    assert response.status_code == 422


def test_list_schools_scoped_to_tenant(client: TestClient, db_session: Session) -> None:
    _add_other_tenant_with_school(db_session)
    response = client.get("/api/schools", headers=_auth(PRINCIPAL))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 1
    assert all(item["tenant_id"] == 1 for item in body["items"])


def test_super_admin_sees_all_schools(client: TestClient, db_session: Session) -> None:
    _add_other_tenant_with_school(db_session)
    response = client.get("/api/schools", headers=_auth(SUPER))
    assert response.status_code == 200, response.text
    assert response.json()["total"] == 2


def test_list_schools_pagination_respected(client: TestClient, db_session: Session) -> None:
    client.post(
        "/api/schools",
        headers=_auth(PRINCIPAL),
        json={"tenant_id": 1, "name": "SDN Paging 1", "address": "Jl. P1"},
    )
    client.post(
        "/api/schools",
        headers=_auth(PRINCIPAL),
        json={"tenant_id": 1, "name": "SDN Paging 2", "address": "Jl. P2"},
    )
    response = client.get("/api/schools?page=1&size=1", headers=_auth(PRINCIPAL))
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["items"]) == 1
    assert body["total"] == 3
    assert body["size"] == 1


def test_list_schools_size_over_max_returns_422(
    client: TestClient, db_session: Session
) -> None:
    assert client.get("/api/schools?size=101", headers=_auth(PRINCIPAL)).status_code == 422


def test_get_school_cross_tenant_returns_404(client: TestClient, db_session: Session) -> None:
    _add_other_tenant_with_school(db_session)
    response = client.get("/api/schools/2", headers=_auth(PRINCIPAL))
    assert response.status_code == 404


def test_patch_school_by_principal(client: TestClient, db_session: Session) -> None:
    response = client.patch(
        "/api/schools/1",
        headers=_auth(PRINCIPAL),
        json={"name": "SDN Menteng 01 Updated"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["name"] == "SDN Menteng 01 Updated"


def test_delete_school_blocked_when_classes_exist(
    client: TestClient, db_session: Session
) -> None:
    assert client.delete("/api/schools/1", headers=_auth(SUPER)).status_code == 409


def test_delete_school_non_super_admin_forbidden(
    client: TestClient, db_session: Session
) -> None:
    assert client.delete("/api/schools/1", headers=_auth(PRINCIPAL)).status_code == 403


def test_delete_empty_school_super_admin(client: TestClient, db_session: Session) -> None:
    created = client.post(
        "/api/schools",
        headers=_auth(SUPER),
        json={"tenant_id": 1, "name": "Sekolah Kosong", "address": "Jl. Kosong"},
    )
    school_id = created.json()["id"]
    assert client.delete(f"/api/schools/{school_id}", headers=_auth(SUPER)).status_code == 204
