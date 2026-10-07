"""Integration tests for /api/students (ticket #7)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from passlib.hash import bcrypt
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token
from app.db.models import Class, JenjangType, School, Student, Tenant, User, UserRole
from app.db.seed import SEED_PASSWORD


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _token(user_id: int, tenant_id: int | None, school_id: int | None, role: str) -> str:
    return create_access_token(user_id, tenant_id, school_id, role)


SUPER = _token(1, 1, None, "super_admin")
ADMIN = _token(2, 1, 1, "admin")
PRINCIPAL = _token(3, 1, 1, "principal")
TEACHER = _token(4, 1, 1, "teacher")
PARENT10 = _token(10, 1, 1, "parent")
PARENT11 = _token(11, 1, 1, "parent")


def _add_other_tenant(db_session: Session) -> None:
    """Seed a second tenant with a school, principal, class and student."""
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
    db_session.flush()
    db_session.add_all(
        [
            User(
                id=200,
                tenant_id=2,
                school_id=2,
                email="p2@other.sch.id",
                hashed_auth_ref=bcrypt.hash(SEED_PASSWORD),
                role=UserRole.PRINCIPAL,
                full_name="Principal Other",
            ),
            User(
                id=201,
                tenant_id=2,
                school_id=2,
                email="student2@other.sch.id",
                hashed_auth_ref=bcrypt.hash(SEED_PASSWORD),
                role=UserRole.STUDENT,
                full_name="Student Other",
            ),
        ]
    )
    db_session.flush()
    db_session.add(Class(id=10, school_id=2, name="7A", grade_level=7, academic_year="2024/2025"))
    db_session.add(
        Student(id=20, user_id=201, school_id=2, class_id=10, nis="OTHER001")
    )
    db_session.commit()


def test_create_student_with_parent_links(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/students",
        headers=_auth(PRINCIPAL),
        json={
            "school_id": 1,
            "class_id": 1,
            "nis": "2025900",
            "full_name": "Anak Baru",
            "email": "anak.baru@menteng.sch.id",
            "password": SEED_PASSWORD,
            "birth_date": "2017-01-01",
            "parent_ids": [10, 11],
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["nis"] == "2025900"
    assert body["full_name"] == "Anak Baru"
    assert {p["id"] for p in body["parents"]} == {10, 11}

    detail = client.get(f"/api/students/{body['id']}", headers=_auth(PRINCIPAL))
    assert detail.status_code == 200
    assert len(detail.json()["parents"]) == 2


def test_principal_creates_student(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/students",
        headers=_auth(PRINCIPAL),
        json={
            "school_id": 1,
            "class_id": 2,
            "nis": "2025901",
            "full_name": "Siswa Kedua",
            "email": "siswa.kedua@menteng.sch.id",
            "password": SEED_PASSWORD,
        },
    )
    assert response.status_code == 201, response.text


def test_create_student_cross_tenant_blocked(client: TestClient, db_session: Session) -> None:
    _add_other_tenant(db_session)
    response = client.post(
        "/api/students",
        headers=_auth(PRINCIPAL),
        json={
            "school_id": 2,
            "nis": "X001",
            "full_name": "Nope",
            "email": "nope@other.sch.id",
            "password": SEED_PASSWORD,
        },
    )
    assert response.status_code == 403


def test_create_student_duplicate_nis(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/students",
        headers=_auth(PRINCIPAL),
        json={
            "school_id": 1,
            "nis": "2024001",
            "full_name": "Duplikat",
            "email": "dup@menteng.sch.id",
            "password": SEED_PASSWORD,
        },
    )
    assert response.status_code == 409


def test_create_student_class_in_other_school(client: TestClient, db_session: Session) -> None:
    _add_other_tenant(db_session)
    response = client.post(
        "/api/students",
        headers=_auth(PRINCIPAL),
        json={
            "school_id": 1,
            "class_id": 10,
            "nis": "2025902",
            "full_name": "Salah Kelas",
            "email": "salah.kelas@menteng.sch.id",
            "password": SEED_PASSWORD,
        },
    )
    assert response.status_code == 422


def test_list_students_scoped_to_tenant(client: TestClient, db_session: Session) -> None:
    _add_other_tenant(db_session)
    response = client.get("/api/students", headers=_auth(PRINCIPAL))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 4
    assert all(item["school_id"] == 1 for item in body["items"])


def test_parent_lists_only_own_children(client: TestClient, db_session: Session) -> None:
    linked = client.post(
        "/api/students/1/parents",
        headers=_auth(PRINCIPAL),
        json={"parent_user_id": 10, "relationship": "orang_tua", "is_primary": True},
    )
    assert linked.status_code == 201, linked.text

    own = client.get("/api/students", headers=_auth(PARENT10))
    assert own.status_code == 200, own.text
    body = own.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == 1

    other = client.get("/api/students", headers=_auth(PARENT11))
    assert other.status_code == 200
    assert other.json()["total"] == 0


def test_get_student_cross_tenant_forbidden(client: TestClient, db_session: Session) -> None:
    _add_other_tenant(db_session)
    assert client.get("/api/students/20", headers=_auth(PRINCIPAL)).status_code == 403


def test_class_transfer_within_same_school(client: TestClient, db_session: Session) -> None:
    response = client.patch(
        "/api/students/1", headers=_auth(PRINCIPAL), json={"class_id": 2}
    )
    assert response.status_code == 200, response.text
    assert response.json()["class_id"] == 2


def test_class_transfer_to_other_school_rejected(
    client: TestClient, db_session: Session
) -> None:
    _add_other_tenant(db_session)
    response = client.patch(
        "/api/students/1", headers=_auth(PRINCIPAL), json={"class_id": 10}
    )
    assert response.status_code == 422


def test_link_non_parent_role_rejected(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/students/1/parents",
        headers=_auth(PRINCIPAL),
        json={"parent_user_id": 4, "relationship": "wali"},
    )
    assert response.status_code == 422


def test_link_then_unlink_parent(client: TestClient, db_session: Session) -> None:
    created = client.post(
        "/api/students/2/parents",
        headers=_auth(PRINCIPAL),
        json={"parent_user_id": 11},
    )
    assert created.status_code == 201
    assert created.json()["id"] == 11

    listing = client.get("/api/students/2/parents", headers=_auth(PRINCIPAL))
    assert len(listing.json()) == 1

    removed = client.delete("/api/students/2/parents/11", headers=_auth(PRINCIPAL))
    assert removed.status_code == 204
    assert client.get("/api/students/2/parents", headers=_auth(PRINCIPAL)).json() == []


def test_soft_delete_via_patch_enrollment_status(
    client: TestClient, db_session: Session
) -> None:
    response = client.patch(
        "/api/students/1", headers=_auth(PRINCIPAL), json={"enrollment_status": "inactive"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["enrollment_status"] == "inactive"

    default_list = client.get("/api/students", headers=_auth(PRINCIPAL)).json()
    assert all(item["id"] != 1 for item in default_list["items"])

    with_inactive = client.get(
        "/api/students?include_inactive=true", headers=_auth(PRINCIPAL)
    ).json()
    assert any(item["id"] == 1 for item in with_inactive["items"])


def test_delete_student_super_admin_soft_deletes(
    client: TestClient, db_session: Session
) -> None:
    response = client.delete("/api/students/3", headers=_auth(SUPER))
    assert response.status_code == 204
    db_session.expire_all()
    student = db_session.get(Student, 3)
    assert student is not None
    assert student.enrollment_status == "inactive"


def test_delete_student_forbidden_for_principal(
    client: TestClient, db_session: Session
) -> None:
    assert client.delete("/api/students/4", headers=_auth(PRINCIPAL)).status_code == 403


def test_create_student_with_invalid_enrollment_status_rejected(
    client: TestClient, db_session: Session
) -> None:
    response = client.post(
        "/api/students",
        headers=_auth(PRINCIPAL),
        json={
            "school_id": 1,
            "nis": "2025910",
            "full_name": "Status Bogus",
            "email": "status.bogus@menteng.sch.id",
            "password": SEED_PASSWORD,
            "enrollment_status": "bogus",
        },
    )
    assert response.status_code == 422, response.text


def test_create_student_with_valid_enrollment_status_accepted(
    client: TestClient, db_session: Session
) -> None:
    response = client.post(
        "/api/students",
        headers=_auth(PRINCIPAL),
        json={
            "school_id": 1,
            "nis": "2025911",
            "full_name": "Lulus Sekolah",
            "email": "lulus@menteng.sch.id",
            "password": SEED_PASSWORD,
            "enrollment_status": "graduated",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["enrollment_status"] == "graduated"


def test_patch_student_with_invalid_enrollment_status_rejected(
    client: TestClient, db_session: Session
) -> None:
    response = client.patch(
        "/api/students/1", headers=_auth(PRINCIPAL), json={"enrollment_status": "foo"}
    )
    assert response.status_code == 422, response.text


def test_create_guardian_for_student(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/students/1/create-guardian",
        headers=_auth(PRINCIPAL),
        json={
            "email": "wali.baru@menteng.sch.id",
            "password": SEED_PASSWORD,
            "full_name": "Wali Baru",
            "relationship": "wali",
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["role"] == "parent"
    assert body["full_name"] == "Wali Baru"

    db_session.expire_all()
    created = db_session.get(User, body["id"])
    assert created is not None
    assert created.role == UserRole.PARENT

    linked = client.get("/api/students/1/parents", headers=_auth(PRINCIPAL))
    assert linked.status_code == 200, linked.text
    assert any(item["id"] == body["id"] for item in linked.json())


def test_create_guardian_duplicate_email_rejected(
    client: TestClient, db_session: Session
) -> None:
    response = client.post(
        "/api/students/1/create-guardian",
        headers=_auth(PRINCIPAL),
        json={
            "email": "tatausaha@menteng.sch.id",
            "password": SEED_PASSWORD,
            "full_name": "Duplikat Email",
        },
    )
    assert response.status_code == 409, response.text
