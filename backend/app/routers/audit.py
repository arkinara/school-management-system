"""Audit-log router (ticket #30): append-only, super_admin/admin scoped reads."""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

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


def _audit_conditions(
    user: User,
    *,
    user_id: int | None,
    action: str | None,
    entity_type: str | None,
    entity_id: int | None,
    from_date: date | None,
    to_date: date | None,
) -> list:
    conditions = []
    if user.role == UserRole.SUPER_ADMIN:
        pass
    elif user.role == UserRole.ADMIN:
        conditions.append(AuditLog.tenant_id == user.tenant_id)
        if user.school_id is not None:
            conditions.append(AuditLog.school_id == user.school_id)
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    if user_id is not None:
        conditions.append(AuditLog.actor_id == user_id)
    if action is not None:
        conditions.append(AuditLog.action == action)
    if entity_type is not None:
        conditions.append(AuditLog.reason.like(f"%entity={entity_type}:%"))
    if entity_id is not None:
        conditions.append(AuditLog.reason.like(f"%entity=%:{entity_id}%"))
    if from_date is not None:
        conditions.append(func.date(AuditLog.created_at) >= from_date.isoformat())
    if to_date is not None:
        conditions.append(func.date(AuditLog.created_at) <= to_date.isoformat())
    return conditions


@router.get("", response_model=AuditLogListResponse)
def list_audit_log(
    user_id: int | None = Query(None),
    entity_type: str | None = Query(None),
    entity_id: int | None = Query(None),
    action: str | None = Query(None),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    page: PageParams = Depends(PageParams),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuditLogListResponse:
    """Paginated audit trail (super_admin: all; admin: own school)."""
    # scope: audit
    conditions = _audit_conditions(
        user,
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        from_date=from_date,
        to_date=to_date,
    )
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
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    conditions = [AuditLog.reason.like(f"%entity={entity_type}:{entity_id}%")]
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


@router.get("/summary", response_model=AuditLogSummary)
def audit_summary(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuditLogSummary:
    """Aggregate event counts by action over the trailing window (super_admin)."""
    # scope: audit
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

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
