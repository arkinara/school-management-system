"""Database engine, session factory and FastAPI dependency."""

from __future__ import annotations

import os
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.models import Base

DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./school_ms.db")

_connect_args: dict[str, object] = {}
if DATABASE_URL.startswith("sqlite"):
    _connect_args["check_same_thread"] = False

engine = create_engine(DATABASE_URL, echo=False, connect_args=_connect_args, future=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db() -> Iterator[Session]:
    """Yield a scoped session and always close it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_all() -> None:
    """Dev/simple bootstrap: create every table registered on Base."""
    Base.metadata.create_all(bind=engine)


def drop_all() -> None:
    """Dev helper used by tests and verification to reset state."""
    Base.metadata.drop_all(bind=engine)
