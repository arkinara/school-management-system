"""Integration tests for /api/subjects (ticket #6)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from passlib.hash import bcrypt
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token
from app.db.models import JenjangType, Subject, Tenant, User, UserRole
from app.db.seed import SEED_PASSWORD


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _token(user_id: int, tenant_id: int | None, school_id: int | None, role: str) -> str:
    return create_access_token(user_id, tenant_id, school_id, role)


SUPER = _token(1, 1, None, "super_admin")
ADMIN = _token(2, 1, 1, "admin")
PRINCIPAL = _token(3, 1, 1, "principal")
TEACHER = _token(4, 1, 1, "teacher")


def _add_other_tenant_with_subject(db_session: Session) -> None:
    db_session.add(
        Tenant(id=2, name="SMP Lain", jenjang_type=JenjangType.SMP, kurikulum_version="K13")
    )
    db_session.add(
        User(
            id=200,
            tenant_id=2,
            school_id=None,
            email="p2@other.sch.id",
            hashed_auth_ref=bcrypt.hash(SEED_PASSWORD),
            role=UserRole.PRINCIPAL,
            full_name="Principal Other",
        )
    )
    db_session.flush()
    db_session.add(
        Subject(
            id=10,
            tenant_id=2,
            name="Fisika",
            category="formal",
            applicable_grade_levels=[7, 8],
        )
    )
    db_session.commit()


def test_principal_creates_subject(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/subjects",
        headers=_auth(PRINCIPAL),
        json={
            "tenant_id": 1,
            "name": "Seni Budaya",
            "category": "formal",
            "applicable_grade_levels": [1, 2, 3, 4],
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["name"] == "Seni Budaya"
    assert body["tenant_id"] == 1


def test_super_admin_creates_subject_any_tenant(client: TestClient, db_session: Session) -> None:
    _add_other_tenant_with_subject(db_session)
    response = client.post(
        "/api/subjects",
        headers=_auth(SUPER),
        json={
            "tenant_id": 2,
            "name": "Kimia",
            "category": "formal",
            "applicable_grade_levels": [10],
        },
    )
    assert response.status_code == 201, response.text


def test_create_subject_cross_tenant_blocked(client: TestClient, db_session: Session) -> None:
    _add_other_tenant_with_subject(db_session)
    response = client.post(
        "/api/subjects",
        headers=_auth(PRINCIPAL),
        json={"tenant_id": 2, "name": "Bad", "category": "formal", "applicable_grade_levels": [1]},
    )
    assert response.status_code == 403


def test_create_subject_unknown_tenant_returns_404(
    client: TestClient, db_session: Session
) -> None:
    response = client.post(
        "/api/subjects",
        headers=_auth(SUPER),
        json={
            "tenant_id": 999,
            "name": "Ghost",
            "category": "formal",
            "applicable_grade_levels": [],
        },
    )
    assert response.status_code == 404


def test_list_subjects_scoped_to_tenant(client: TestClient, db_session: Session) -> None:
    _add_other_tenant_with_subject(db_session)
    response = client.get("/api/subjects", headers=_auth(PRINCIPAL))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 6
    assert all(item["tenant_id"] == 1 for item in body["items"])


def test_list_subjects_grade_level_filter(client: TestClient, db_session: Session) -> None:
    response = client.get("/api/subjects?grade_level=1", headers=_auth(PRINCIPAL))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 4
    assert all(1 in item["applicable_grade_levels"] for item in body["items"])


def test_list_subjects_category_filter(client: TestClient, db_session: Session) -> None:
    response = client.get("/api/subjects?category=formal", headers=_auth(PRINCIPAL))
    assert response.status_code == 200, response.text
    assert response.json()["total"] == 6


def test_get_subject_cross_tenant_forbidden(client: TestClient, db_session: Session) -> None:
    _add_other_tenant_with_subject(db_session)
    assert client.get("/api/subjects/10", headers=_auth(PRINCIPAL)).status_code == 403


def test_patch_subject_principal(client: TestClient, db_session: Session) -> None:
    response = client.patch(
        "/api/subjects/1",
        headers=_auth(PRINCIPAL),
        json={"category": "tumbuh_kembang"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["category"] == "tumbuh_kembang"


def test_delete_subject_blocked_when_graded(client: TestClient, db_session: Session) -> None:
    assert client.delete("/api/subjects/1", headers=_auth(PRINCIPAL)).status_code == 409


def test_delete_empty_subject(client: TestClient, db_session: Session) -> None:
    created = client.post(
        "/api/subjects",
        headers=_auth(PRINCIPAL),
        json={
            "tenant_id": 1,
            "name": "Muatan Lokal",
            "category": "formal",
            "applicable_grade_levels": [1, 2],
        },
    )
    subject_id = created.json()["id"]
    assert client.delete(f"/api/subjects/{subject_id}", headers=_auth(PRINCIPAL)).status_code == 204


def test_delete_subject_forbidden_for_teacher(client: TestClient, db_session: Session) -> None:
    assert client.delete("/api/subjects/1", headers=_auth(TEACHER)).status_code == 403
