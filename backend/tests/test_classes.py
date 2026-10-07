"""Integration tests for /api/classes (ticket #6)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from passlib.hash import bcrypt
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token
from app.db.models import Class, JenjangType, School, Tenant, User, UserRole
from app.db.seed import SEED_PASSWORD


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _token(user_id: int, tenant_id: int | None, school_id: int | None, role: str) -> str:
    return create_access_token(user_id, tenant_id, school_id, role)


SUPER = _token(1, 1, None, "super_admin")
ADMIN = _token(2, 1, 1, "admin")
PRINCIPAL = _token(3, 1, 1, "principal")
TEACHER = _token(4, 1, 1, "teacher")


def _add_other_tenant_with_class(db_session: Session) -> None:
    db_session.add_all(
        [
            Tenant(id=2, name="SMP Lain", jenjang_type=JenjangType.SMP, kurikulum_version="K13"),
            School(
                id=2,
                tenant_id=2,
                name="SMP Lain 02",
                address="Jl. Lain",
                kurikulum_version="K13",
            ),
        ]
    )
    db_session.add(
        User(
            id=200,
            tenant_id=2,
            school_id=2,
            email="p2@other.sch.id",
            hashed_auth_ref=bcrypt.hash(SEED_PASSWORD),
            role=UserRole.PRINCIPAL,
            full_name="Principal Other",
        )
    )
    db_session.flush()
    db_session.add(
        Class(id=10, school_id=2, name="7A", grade_level=7, academic_year="2024/2025")
    )
    db_session.commit()


def test_principal_creates_class(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/classes",
        headers=_auth(PRINCIPAL),
        json={
            "school_id": 1,
            "name": "5A",
            "grade_level": 5,
            "wali_kelas_id": 4,
            "academic_year": "2024/2025",
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["name"] == "5A"
    assert body["wali_kelas_id"] == 4


def test_admin_creates_class(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/classes",
        headers=_auth(ADMIN),
        json={
            "school_id": 1,
            "name": "5B",
            "grade_level": 5,
            "academic_year": "2024/2025",
        },
    )
    assert response.status_code == 201, response.text


def test_create_class_cross_tenant_blocked(client: TestClient, db_session: Session) -> None:
    _add_other_tenant_with_class(db_session)
    response = client.post(
        "/api/classes",
        headers=_auth(PRINCIPAL),
        json={"school_id": 2, "name": "X", "grade_level": 7, "academic_year": "2024/2025"},
    )
    assert response.status_code == 403


def test_create_class_unknown_school_returns_404(
    client: TestClient, db_session: Session
) -> None:
    response = client.post(
        "/api/classes",
        headers=_auth(PRINCIPAL),
        json={"school_id": 999, "name": "X", "grade_level": 1, "academic_year": "2024/2025"},
    )
    assert response.status_code == 404


def test_jurusan_on_non_sma_tenant_returns_422(
    client: TestClient, db_session: Session
) -> None:
    response = client.post(
        "/api/classes",
        headers=_auth(PRINCIPAL),
        json={
            "school_id": 1,
            "name": "6A",
            "grade_level": 6,
            "jurusan": "IPA",
            "academic_year": "2024/2025",
        },
    )
    assert response.status_code == 422


def test_wali_kelas_must_be_teacher(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/classes",
        headers=_auth(PRINCIPAL),
        json={
            "school_id": 1,
            "name": "6D",
            "grade_level": 6,
            "wali_kelas_id": 2,
            "academic_year": "2024/2025",
        },
    )
    assert response.status_code == 422


def test_patch_wali_kelas_must_be_teacher(client: TestClient, db_session: Session) -> None:
    response = client.patch(
        "/api/classes/3", headers=_auth(PRINCIPAL), json={"wali_kelas_id": 2}
    )
    assert response.status_code == 422


def test_wali_kelas_must_be_same_school(client: TestClient, db_session: Session) -> None:
    _add_other_tenant_with_class(db_session)
    response = client.post(
        "/api/classes",
        headers=_auth(PRINCIPAL),
        json={
            "school_id": 1,
            "name": "6B",
            "grade_level": 6,
            "wali_kelas_id": 200,
            "academic_year": "2024/2025",
        },
    )
    assert response.status_code == 422


def test_list_classes_scoped_to_tenant(client: TestClient, db_session: Session) -> None:
    _add_other_tenant_with_class(db_session)
    response = client.get("/api/classes", headers=_auth(PRINCIPAL))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 4
    assert all(item["school_id"] == 1 for item in body["items"])


def test_list_classes_grade_level_filter(client: TestClient, db_session: Session) -> None:
    response = client.get("/api/classes?grade_level=1", headers=_auth(PRINCIPAL))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["grade_level"] == 1


def test_get_class_cross_tenant_forbidden(client: TestClient, db_session: Session) -> None:
    _add_other_tenant_with_class(db_session)
    assert client.get("/api/classes/10", headers=_auth(PRINCIPAL)).status_code == 403


def test_patch_class_principal(client: TestClient, db_session: Session) -> None:
    response = client.patch(
        "/api/classes/3", headers=_auth(PRINCIPAL), json={"wali_kelas_id": 5}
    )
    assert response.status_code == 200, response.text
    assert response.json()["wali_kelas_id"] == 5


def test_delete_class_blocked_with_students(client: TestClient, db_session: Session) -> None:
    assert client.delete("/api/classes/1", headers=_auth(PRINCIPAL)).status_code == 409


def test_delete_empty_class(client: TestClient, db_session: Session) -> None:
    created = client.post(
        "/api/classes",
        headers=_auth(PRINCIPAL),
        json={"school_id": 1, "name": "6C", "grade_level": 6, "academic_year": "2024/2025"},
    )
    class_id = created.json()["id"]
    assert client.delete(f"/api/classes/{class_id}", headers=_auth(PRINCIPAL)).status_code == 204


def test_delete_class_forbidden_for_teacher(client: TestClient, db_session: Session) -> None:
    assert client.delete("/api/classes/3", headers=_auth(TEACHER)).status_code == 403
