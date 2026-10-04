"""Integration tests for /api/parents (ticket #7)."""

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
PRINCIPAL = _token(3, 1, 1, "principal")
TEACHER = _token(4, 1, 1, "teacher")
PARENT10 = _token(10, 1, 1, "parent")


def _add_other_tenant_parent(db_session: Session) -> None:
    db_session.add(
        Tenant(id=2, name="SMP Lain", jenjang_type=JenjangType.SMP, kurikulum_version="K13")
    )
    db_session.flush()
    db_session.add(
        User(
            id=201,
            tenant_id=2,
            school_id=None,
            email="parent2@other.sch.id",
            hashed_auth_ref=bcrypt.hash(SEED_PASSWORD),
            role=UserRole.PARENT,
            full_name="Parent Other",
        )
    )
    db_session.commit()


def test_list_parents_scoped_to_tenant(client: TestClient, db_session: Session) -> None:
    response = client.get("/api/parents", headers=_auth(PRINCIPAL))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 2
    assert all(item["tenant_id"] == 1 for item in body["items"])


def test_super_admin_sees_all_parents(client: TestClient, db_session: Session) -> None:
    _add_other_tenant_parent(db_session)
    response = client.get("/api/parents", headers=_auth(SUPER))
    assert response.status_code == 200, response.text
    assert response.json()["total"] == 3


def test_get_parent_returns_children(client: TestClient, db_session: Session) -> None:
    linked = client.post(
        "/api/students/1/parents",
        headers=_auth(PRINCIPAL),
        json={"parent_user_id": 10, "relationship": "orang_tua", "is_primary": True},
    )
    assert linked.status_code == 201, linked.text

    response = client.get("/api/parents/10", headers=_auth(PRINCIPAL))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["id"] == 10
    assert [child["id"] for child in body["children"]] == [1]
    assert body["children"][0]["relationship"] == "orang_tua"


def test_get_parent_cross_tenant_forbidden(client: TestClient, db_session: Session) -> None:
    _add_other_tenant_parent(db_session)
    assert client.get("/api/parents/201", headers=_auth(PRINCIPAL)).status_code == 403


def test_parent_children_empty_returns_list(client: TestClient, db_session: Session) -> None:
    response = client.get("/api/parents/11/children", headers=_auth(PRINCIPAL))
    assert response.status_code == 200, response.text
    assert response.json() == []


def test_parent_side_link_and_unlink(client: TestClient, db_session: Session) -> None:
    created = client.post(
        "/api/parents/11/children",
        headers=_auth(PRINCIPAL),
        json={"student_id": 2, "relationship": "wali", "is_primary": False},
    )
    assert created.status_code == 201, created.text
    assert created.json()["id"] == 2
    assert created.json()["relationship"] == "wali"

    children = client.get("/api/parents/11/children", headers=_auth(PRINCIPAL)).json()
    assert [child["id"] for child in children] == [2]

    removed = client.delete("/api/parents/11/children/2", headers=_auth(PRINCIPAL))
    assert removed.status_code == 204
    assert client.get("/api/parents/11/children", headers=_auth(PRINCIPAL)).json() == []


def test_parent_own_tenant_sees_self_children(client: TestClient, db_session: Session) -> None:
    client.post(
        "/api/students/1/parents",
        headers=_auth(PRINCIPAL),
        json={"parent_user_id": 10},
    )
    response = client.get("/api/parents/10/children", headers=_auth(PARENT10))
    assert response.status_code == 200, response.text
    assert [child["id"] for child in response.json()] == [1]


def test_non_parent_id_is_404(client: TestClient, db_session: Session) -> None:
    assert client.get("/api/parents/4", headers=_auth(PRINCIPAL)).status_code == 404
    assert (
        client.get("/api/parents/4/children", headers=_auth(TEACHER)).status_code == 404
    )
