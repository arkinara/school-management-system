"""Shared pytest fixtures: isolated SQLite DB per test with seed data."""

from __future__ import annotations

import os

os.environ.setdefault("SCHOOL_MS_AUTO_SEED", "0")
os.environ.setdefault("JWT_SECRET", "test-secret")

from collections.abc import Iterator  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.engine import Engine  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402

from app.db import seed as seed_module  # noqa: E402
from app.db.models import Base  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture
def db_engine(tmp_path) -> Iterator[Engine]:
    """A fresh file-backed SQLite DB with the full schema."""
    url = f"sqlite:///{tmp_path / 'test.db'}"
    engine = create_engine(url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def session_factory(db_engine: Engine) -> sessionmaker:
    return sessionmaker(bind=db_engine, autoflush=False, autocommit=False)


@pytest.fixture
def db_session(session_factory: sessionmaker) -> Iterator[Session]:
    """A seeded session for direct model assertions."""
    session = session_factory()
    seed_module.seed(session)
    yield session
    session.close()


@pytest.fixture
def client(session_factory: sessionmaker) -> Iterator[TestClient]:
    """TestClient wired to the tmp DB via a get_db override."""

    def override_get_db() -> Iterator[Session]:
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
