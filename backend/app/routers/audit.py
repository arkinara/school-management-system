"""Audit-log router (tickets #30, #63): append-only, super_admin-only reads."""

from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.audit import log_audit_event
from app.auth.deps import get_current_user
from app.db.models import AuditLog, User, UserRole
from app.db.session import get_db
from app.pagination import PageParams
from app.schemas.audit import (
    AuditActionCount,
    AuditLogListResponse,
    AuditLogOut,
    AuditLogSummary,
)

router = APIRouter()

SUMMARY_WINDOW_DAYS = 30


def _require_super_admin(
    db: Session, user: User, *, resource_id: int | None = None
) -> None:
    """Raise 403 (and audit the denial) unless the caller is super_admin."""
    if user.role == UserRole.SUPER_ADMIN:
        return
    log_audit_event(
        db,
        actor=user,
        action="audit_log_access_denied",
        resource_type="audit_log",
        resource_id=resource_id,
        outcome="denied",
        reason_code="not_super_admin",
    )
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="audit logs are super_admin-only",
    )


@router.get("", response_model=AuditLogListResponse)
def list_audit_log(
    actor_id: int | None = Query(None, description="Filter by acting user id"),
    user_id: int | None = Query(None, description="Legacy alias for actor_id"),
    action: str | None = Query(None),
    resource_type: str | None = Query(None),
    entity_type: str | None = Query(None, description="Legacy alias for resource_type"),
    resource_id: int | None = Query(None, description="Exact match only"),
    entity_id: int | None = Query(None, description="Legacy alias for resource_id"),
    tenant_id: int | None = Query(None),
    school_id: int | None = Query(None),
    outcome: str | None = Query(None),
    reason_code: str | None = Query(None),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    page: PageParams = Depends(PageParams),
    page_size: int | None = Query(None, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuditLogListResponse:
    """Paginated audit trail. SUPER_ADMIN ONLY (ticket #63)."""
    # scope: audit
    _require_super_admin(db, user)

    effective_actor = actor_id if actor_id is not None else user_id
    effective_resource_type = resource_type if resource_type is not None else entity_type
    effective_resource_id = resource_id if resource_id is not None else entity_id

    conditions = []
    if effective_actor is not None:
        conditions.append(AuditLog.actor_id == effective_actor)
    if action is not None:
        conditions.append(AuditLog.action == action)
    if effective_resource_type is not None:
        conditions.append(AuditLog.resource_type == effective_resource_type)
    if effective_resource_id is not None:
        conditions.append(AuditLog.resource_id == effective_resource_id)
    if tenant_id is not None:
        conditions.append(AuditLog.tenant_id == tenant_id)
    if school_id is not None:
        conditions.append(AuditLog.school_id == school_id)
    if outcome is not None:
        conditions.append(AuditLog.outcome == outcome)
    if reason_code is not None:
        conditions.append(AuditLog.reason_code == reason_code)
    if from_date is not None:
        conditions.append(func.date(AuditLog.created_at) >= from_date.isoformat())
    if to_date is not None:
        conditions.append(func.date(AuditLog.created_at) <= to_date.isoformat())
    if date_from is not None:
        conditions.append(AuditLog.created_at >= date_from)
    if date_to is not None:
        conditions.append(AuditLog.created_at <= date_to)

    size = page_size if page_size is not None else page.size
    offset = (page.page - 1) * size

    total = db.scalar(select(func.count()).select_from(AuditLog).where(*conditions)) or 0
    rows = db.scalars(
        select(AuditLog)
        .where(*conditions)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset(offset)
        .limit(size)
    ).all()
    return AuditLogListResponse(
        items=[AuditLogOut.model_validate(row) for row in rows],
        total=total,
        page=page.page,
        size=size,
    )


@router.get("/summary", response_model=AuditLogSummary)
def audit_summary(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuditLogSummary:
    """Aggregate event counts by action over the trailing window (super_admin)."""
    # scope: audit
    _require_super_admin(db, user)

    today = date.today()
    start = today - timedelta(days=SUMMARY_WINDOW_DAYS)
    rows = db.execute(
        select(AuditLog.action, func.count())
        .where(func.date(AuditLog.created_at) >= start.isoformat())
        .group_by(AuditLog.action)
        .order_by(func.count().desc(), AuditLog.action)
    ).all()
    by_action = [AuditActionCount(action=row[0], count=int(row[1])) for row in rows]
    return AuditLogSummary(
        from_date=start,
        to_date=today,
        total_events=sum(item.count for item in by_action),
        by_action=by_action,
    )


@router.get("/entity/{entity_type}/{entity_id}", response_model=AuditLogListResponse)
def list_entity_audit_log(
    entity_type: str,
    entity_id: int,
    page: PageParams = Depends(PageParams),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuditLogListResponse:
    """Every event recorded for one entity (super_admin only)."""
    # scope: audit
    _require_super_admin(db, user)
    conditions = [
        (AuditLog.resource_type == entity_type) & (AuditLog.resource_id == entity_id)
    ]
    total = db.scalar(select(func.count()).select_from(AuditLog).where(*conditions)) or 0
    rows = db.scalars(
        select(AuditLog)
        .where(*conditions)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset(page.offset)
        .limit(page.size)
    ).all()
    return AuditLogListResponse(
        items=[AuditLogOut.model_validate(row) for row in rows],
        total=total,
        page=page.page,
        size=page.size,
    )


@router.get("/{audit_id}", response_model=AuditLogOut)
def get_audit_log(
    audit_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuditLogOut:
    """Fetch a single audit entry (super_admin only)."""
    # scope: audit
    _require_super_admin(db, user, resource_id=audit_id)
    log = db.get(AuditLog, audit_id)
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="audit log not found")
    return AuditLogOut.model_validate(log)
