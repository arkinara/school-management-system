"""Notification router (ticket #51): read API + scheduler entrypoint."""

from __future__ import annotations

from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.db.models import (
    Notification,
    SppBill,
    SppBillStatus,
    User,
    UserRole,
    utcnow,
)
from app.db.session import get_db
from app.notifications.triggers import (
    safe_trigger,
    trigger_spp_overdue_notification,
)
from app.schemas.notification import NotificationOut

router = APIRouter()


def _own_notifications_query(user: User):
    """Base query limited to the caller's own notifications (+ tenant gate)."""
    conditions = [Notification.user_id == user.id]
    if user.role != UserRole.SUPER_ADMIN:
        conditions.append(Notification.tenant_id == user.tenant_id)
    return conditions


@router.get("", response_model=list[NotificationOut])
# scope: own
def list_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Notification]:
    """List the caller's notifications, newest first."""
    conditions = _own_notifications_query(user)
    if unread_only:
        conditions.append(Notification.is_read.is_(False))
    query = (
        select(Notification)
        .where(*conditions)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(limit)
    )
    return list(db.scalars(query).all())


@router.post("/mark-all-read", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Mark every unread notification of the caller as read."""
    conditions = _own_notifications_query(user)
    conditions.append(Notification.is_read.is_(False))
    rows = list(db.scalars(select(Notification).where(*conditions)).all())
    now = utcnow()
    for notification in rows:
        notification.is_read = True
        notification.read_at = now
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/unread-count")
# scope: own
def unread_count(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, int]:
    """Return the number of unread notifications for the caller."""
    conditions = _own_notifications_query(user)
    conditions.append(Notification.is_read.is_(False))
    count = db.scalar(select(func.count(Notification.id)).where(*conditions)) or 0
    return {"count": count}


@router.post("/run-scheduler", status_code=status.HTTP_204_NO_CONTENT)
def run_scheduler(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Run the notification scheduler (super_admin only; cron-ready).

    Marks unpaid bills past their due date as overdue and triggers one
    (deduplicated) overdue notification per linked guardian.
    """
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="super_admin only")
    today = date_type.today()
    overdue_bills = list(
        db.scalars(
            select(SppBill).where(
                SppBill.status == SppBillStatus.UNPAID, SppBill.due_date < today
            )
        ).all()
    )
    for bill in overdue_bills:
        bill.status = SppBillStatus.OVERDUE
    db.commit()
    for bill in overdue_bills:
        safe_trigger(trigger_spp_overdue_notification, db, bill)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(
    notification_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Mark one of the caller's notifications as read (404 if not theirs)."""
    conditions = _own_notifications_query(user)
    conditions.append(Notification.id == notification_id)
    notification = db.scalar(select(Notification).where(*conditions))
    if notification is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="notification not found"
        )
    if not notification.is_read:
        notification.is_read = True
        notification.read_at = utcnow()
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
