"""School Management System API entrypoint."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import models  # noqa: F401  (registers all models on Base.metadata)
from app.db.models import Class, Student, Tenant, User
from app.db.seed import main as seed_main
from app.db.session import SessionLocal, create_all, get_db
from app.middleware.scope import TenantScopeMiddleware
from app.routers import (
    attendances,
    auth,
    classes,
    grades,
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


def _auto_seed_enabled() -> bool:
    return os.getenv("SCHOOL_MS_AUTO_SEED", "1") != "0"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Bootstrap the dev DB with schema + seed data when empty."""
    if _auto_seed_enabled():
        create_all()
        db = SessionLocal()
        try:
            existing = db.scalar(select(func.count()).select_from(User)) or 0
        finally:
            db.close()
        if existing == 0:
            seed_main()
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
app.include_router(tenants.router, prefix="/api/tenants", tags=["tenants"])
app.include_router(schools.router, prefix="/api/schools", tags=["schools"])
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


@app.get("/")
def root() -> dict[str, str]:
    """Service identity probe."""
    return {"name": "School Management System API", "version": "0.1.0"}


@app.get("/api/health")
def health() -> dict[str, str]:
    """Liveness probe used by CI and load balancers."""
    return {"status": "ok"}


@app.get("/api/db-info")
def db_info(db: Session = Depends(get_db)) -> dict[str, int]:
    """Return table and seed row counts so QA can verify the seed ran."""
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
