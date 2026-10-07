"""School Management System API entrypoint."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, inspect, select
from sqlalchemy.orm import Session

from app.auth.cleanup import cleanup_expired_tokens
from app.auth.deps import get_current_user
from app.db import models  # noqa: F401  (registers all models on Base.metadata)
from app.db.models import Class, Student, Tenant, User, UserRole
from app.db.seed import main as seed_main
from app.db.session import SessionLocal, create_all, engine, get_db
from app.middleware.scope import TenantScopeMiddleware
from app.routers import (
    academic,
    announcements,
    attendances,
    audit,
    auth,
    classes,
    grades,
    messages,
    parents,
    report_cards,
    schedules,
    schools,
    spp,
    students,
    subjects,
    tenants,
    users,
)

logger = logging.getLogger("app.main")


def _auto_seed_enabled() -> bool:
    return os.getenv("SCHOOL_MS_AUTO_SEED", "1") != "0"


def validate_config() -> None:
    """Fail fast when a production deployment is missing its JWT secret."""
    if os.getenv("ENVIRONMENT") not in ("dev", "test") and not os.getenv("JWT_SECRET"):
        raise RuntimeError("JWT_SECRET required in non-dev environment")


def _cleanup_tokens_on_startup() -> None:
    """Best-effort purge of expired denylist rows once the table exists."""
    try:
        if "token_denylist" not in inspect(engine).get_table_names():
            return
        db = SessionLocal()
        try:
            cleanup_expired_tokens(db)
        finally:
            db.close()
    except Exception:  # noqa: BLE001 - cleanup must never block startup
        logger.exception("startup token cleanup failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Bootstrap the dev DB with schema + seed data when empty."""
    validate_config()
    if _auto_seed_enabled():
        create_all()
        db = SessionLocal()
        try:
            existing = db.scalar(select(func.count()).select_from(User)) or 0
        finally:
            db.close()
        if existing == 0:
            seed_main()
    _cleanup_tokens_on_startup()
    yield


app = FastAPI(
    title="School Management System API",
    version="0.1.0",
    lifespan=lifespan,
)

_origins = os.getenv(
    "CORS_ORIGINS", "http://localhost:3000,http://localhost:3001"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(TenantScopeMiddleware)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(academic.router, prefix="/api/academic", tags=["academic"])
app.include_router(tenants.router, prefix="/api/tenants", tags=["tenants"])
app.include_router(schools.router, prefix="/api/schools", tags=["schools"])
# Public, unauthenticated picker data for sign-in/sign-up/onboarding (#45).
app.include_router(tenants.public_router, tags=["public"])
app.include_router(schools.public_router, tags=["public"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(classes.router, prefix="/api/classes", tags=["classes"])
app.include_router(subjects.router, prefix="/api/subjects", tags=["subjects"])
app.include_router(students.router, prefix="/api/students", tags=["students"])
app.include_router(parents.router, prefix="/api/parents", tags=["parents"])
app.include_router(attendances.router, prefix="/api/attendances", tags=["attendances"])
app.include_router(grades.router, prefix="/api/grades", tags=["grades"])
app.include_router(
    report_cards.router, prefix="/api/report-cards", tags=["report-cards"]
)
app.include_router(schedules.router, prefix="/api/schedules", tags=["schedules"])
app.include_router(spp.router, prefix="/api/spp", tags=["spp"])
app.include_router(
    announcements.router, prefix="/api/announcements", tags=["announcements"]
)
app.include_router(
    messages.router, prefix="/api/message-threads", tags=["message-threads"]
)
app.include_router(audit.router, prefix="/api/audit-log", tags=["audit-log"])


@app.get("/")
def root() -> dict[str, str]:
    """Service identity probe."""
    # scope: public
    return {"name": "School Management System API", "version": "0.1.0"}


@app.get("/api/health")
def health() -> dict[str, str]:
    """Liveness probe used by CI and load balancers."""
    # scope: public
    return {"status": "ok"}


@app.get("/api/db-info")
def db_info(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, int]:
    """Return table and seed row counts so QA can verify the seed ran.

    Debug-only: restricted to ``super_admin`` and non-production environments.
    """
    # scope: super_admin
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="super_admin only")
    if os.environ.get("ENVIRONMENT", "dev") not in ("dev", "test"):
        raise HTTPException(status_code=403, detail="dev only")
    tables = len(models.Base.metadata.tables)
    users = db.scalar(select(func.count()).select_from(User)) or 0
    students = db.scalar(select(func.count()).select_from(Student)) or 0
    tenants = db.scalar(select(func.count()).select_from(Tenant)) or 0
    classes = db.scalar(select(func.count()).select_from(Class)) or 0
    return {
        "tables": tables,
        "users": users,
        "students": students,
        "tenants": tenants,
        "classes": classes,
    }
