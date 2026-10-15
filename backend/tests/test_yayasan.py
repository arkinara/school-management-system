"""Integration tests for the yayasan aggregate router (ticket #64)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.auth.jwt import create_access_token
from app.db.models import School, User, UserRole
from app.db.seed import clear_all
from app.main import app


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _token(user_id: int, tenant_id: int | None, school_id: int | None, role: str) -> str:
    return create_access_token(user_id, tenant_id, school_id, role)


SUPER = _token(1, 1, None, "super_admin")
ADMIN = _token(2, 1, 1, "admin")


def _add_second_school(db_session: Session) -> None:
    db_session.add(
        School(
            id=99,
            tenant_id=1,
            name="SDN Menteng 02",
            address=None,
            principal_id=None,
            kurikulum_version="Merdeka 2024",
        )
    )
    db_session.commit()


def test_yayasan_overview_403_for_admin(client: TestClient, db_session: Session) -> None:
    response = client.get("/api/yayasan/overview", headers=_auth(ADMIN))
    assert response.status_code == 403, response.text


def test_yayasan_overview_200_for_super_admin(
    client: TestClient, db_session: Session
) -> None:
    response = client.get("/api/yayasan/overview", headers=_auth(SUPER))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total_tenants"] == 1
    tenant = body["tenants"][0]
    assert tenant["name"] == "TK Menteng Ceria"
    assert tenant["school_count"] == 1
    assert tenant["enrollment"] == 4
    assert isinstance(tenant["attendance_rate"], (int, float))
    assert isinstance(tenant["spp_collection_rate"], (int, float))
    assert [school["name"] for school in tenant["schools"]] == ["SDN Menteng 01"]


def test_yayasan_overview_zero_tenants(client: TestClient, db_session: Session) -> None:
    clear_all(db_session)
    db_session.commit()

    # No tenants means no persisted super_admin can authenticate; inject a
    # synthetic one so the empty-aggregate path is still exercised via the API.
    fake_super = User(
        id=999,
        tenant_id=0,
        school_id=None,
        email="yayasan@example.com",
        hashed_auth_ref="x",
        role=UserRole.SUPER_ADMIN,
        full_name="Yayasan",
    )
    app.dependency_overrides[get_current_user] = lambda: fake_super
    try:
        response = client.get("/api/yayasan/overview", headers=_auth(SUPER))
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["tenants"] == []
    assert body["total_tenants"] == 0
    assert body["total_schools"] == 0
    assert body["total_enrollment"] == 0


def test_yayasan_overview_per_tenant_school_count(
    client: TestClient, db_session: Session
) -> None:
    _add_second_school(db_session)
    response = client.get("/api/yayasan/overview", headers=_auth(SUPER))
    body = response.json()
    assert body["total_schools"] == 2
    assert body["tenants"][0]["school_count"] == 2


def test_yayasan_overview_users_by_role(client: TestClient, db_session: Session) -> None:
    response = client.get("/api/yayasan/overview", headers=_auth(SUPER))
    body = response.json()
    tenant_roles = body["tenants"][0]["users_by_role"]
    assert tenant_roles == {
        "principal": 1,
        "teacher": 2,
        "student": 4,
        "parent": 2,
        "admin": 1,
        "super_admin": 1,
    }
    assert body["total_users_by_role"] == tenant_roles


def test_yayasan_compare_422_for_one_school(
    client: TestClient, db_session: Session
) -> None:
    response = client.get("/api/yayasan/compare?school_ids=1", headers=_auth(SUPER))
    assert response.status_code == 422, response.text


def test_yayasan_compare_422_for_four_schools(
    client: TestClient, db_session: Session
) -> None:
    response = client.get(
        "/api/yayasan/compare?school_ids=1&school_ids=2&school_ids=3&school_ids=4",
        headers=_auth(SUPER),
    )
    assert response.status_code == 422, response.text


def test_yayasan_compare_2_schools(client: TestClient, db_session: Session) -> None:
    _add_second_school(db_session)
    response = client.get(
        "/api/yayasan/compare?school_ids=1&school_ids=99", headers=_auth(SUPER)
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert [school["name"] for school in body["schools"]] == [
        "SDN Menteng 01",
        "SDN Menteng 02",
    ]
    assert body["schools"][0]["jenjang"] == "SD"
    assert body["schools"][0]["enrollment"] == 4
    assert body["schools"][0]["classes"][0]["name"] == "1A"
