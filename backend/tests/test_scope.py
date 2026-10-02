"""Tenant/school scoping tests: dependency gate + query helper."""

from __future__ import annotations

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.auth.deps import require_tenant_access
from app.auth.jwt import create_access_token
from app.db.models import Announcement, User, UserRole
from app.db.scoping import (
    BypassReasonRequiredError,
    MissingTenantContextError,
    scoped_query,
)
from app.db.session import get_db


def _build_app(session_factory: sessionmaker) -> FastAPI:
    test_app = FastAPI()

    def override_get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    @test_app.get("/t/{tenant_id}")
    def read_tenant(
        tenant_id: int, user: User = Depends(require_tenant_access())
    ) -> dict[str, int]:
        return {"tenant_id": tenant_id, "user_id": user.id}

    @test_app.get("/s/{tenant_id}/{school_id}")
    def read_school(
        tenant_id: int,
        school_id: int,
        user: User = Depends(require_tenant_access(school_id_param="school_id")),
    ) -> dict[str, int]:
        return {"tenant_id": tenant_id, "school_id": school_id, "user_id": user.id}

    test_app.dependency_overrides[get_db] = override_get_db
    return test_app


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_non_super_admin_cross_tenant_blocked(
    db_session: Session, session_factory: sessionmaker
) -> None:
    client = TestClient(_build_app(session_factory))
    token = create_access_token(3, 1, 1, "principal")
    assert client.get("/t/1", headers=_auth(token)).status_code == 200
    assert client.get("/t/2", headers=_auth(token)).status_code == 403


def test_super_admin_cross_tenant_allowed(
    db_session: Session, session_factory: sessionmaker
) -> None:
    client = TestClient(_build_app(session_factory))
    token = create_access_token(1, 1, None, "super_admin")
    assert client.get("/t/2", headers=_auth(token)).status_code == 200


def test_school_scope_blocked(db_session: Session, session_factory: sessionmaker) -> None:
    client = TestClient(_build_app(session_factory))
    token = create_access_token(3, 1, 1, "principal")
    assert client.get("/s/1/1", headers=_auth(token)).status_code == 200
    assert client.get("/s/1/2", headers=_auth(token)).status_code == 403


def test_scoped_query_filters_by_tenant(db_session: Session) -> None:
    teacher = db_session.get(User, 4)
    assert teacher is not None
    stmt = scoped_query(Announcement, teacher, db_session)
    rows = db_session.scalars(stmt).all()
    assert rows
    assert all(row.tenant_id == teacher.tenant_id for row in rows)


def test_scoped_query_missing_tenant_context_raises(db_session: Session) -> None:
    orphan = User(
        tenant_id=None,
        school_id=None,
        email="orphan@example.com",
        hashed_auth_ref="x",
        role=UserRole.TEACHER,
        full_name="Orphan",
    )
    with pytest.raises(MissingTenantContextError):
        scoped_query(Announcement, orphan, db_session)


def test_super_admin_bypass_requires_reason(db_session: Session) -> None:
    admin = db_session.get(User, 1)
    assert admin is not None and admin.role == UserRole.SUPER_ADMIN
    with pytest.raises(BypassReasonRequiredError):
        scoped_query(Announcement, admin, db_session)

    stmt = scoped_query(Announcement, admin, db_session, bypass_reason="quarterly audit")
    assert db_session.scalars(stmt).all() is not None
