"""Notification triggers for domain events (ticket #51).

Triggers are best-effort: :func:`safe_trigger` swallows and logs any failure so
the originating business request is never rolled back because a notification
could not be written. Deduplication is by ``(user, type, body)`` so re-running a
trigger for the same event never creates a second notification.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, TypeVar

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import (
    Attendance,
    Notification,
    School,
    SppBill,
    Student,
    User,
    parent_links,
)

logger = logging.getLogger("app.notifications.triggers")

T = TypeVar("T")

_NON_HADIR = {"alpa", "izin", "sakit"}


def create_notification(
    db: Session,
    *,
    user_id: int,
    tenant_id: int,
    type: str,
    title: str,
    body: str,
    link: str | None = None,
) -> Notification:
    """Persist one notification for ``user_id`` and return it."""
    notification = Notification(
        user_id=user_id,
        tenant_id=tenant_id,
        type=type,
        title=title,
        body=body,
        link=link,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return notification


def safe_trigger(fn: Callable[..., T], *args: Any) -> T | list:
    """Run ``fn`` swallowing any exception so the caller's request survives."""
    try:
        return fn(*args)
    except Exception:  # noqa: BLE001 - notification failure must not propagate
        logger.exception("notification trigger failed: %s", getattr(fn, "__name__", fn))
        try:
            args[0].rollback()
        except Exception:  # noqa: BLE001
            logger.exception("notification trigger rollback failed")
        return []


def _linked_parent_ids(db: Session, student_id: int) -> list[int]:
    return [
        row[0]
        for row in db.execute(
            select(parent_links.c.parent_id).where(
                parent_links.c.student_id == student_id
            )
        ).all()
    ]


def _student_tenant_id(db: Session, student: Student) -> int | None:
    school = db.get(School, student.school_id)
    return school.tenant_id if school is not None else None


def _student_name(db: Session, student: Student) -> str:
    student_user = db.get(User, student.user_id)
    if student_user is not None:
        return student_user.full_name
    return f"Siswa {student.id}"


def _already_notified(db: Session, user_id: int, type: str, body: str) -> bool:
    return (
        db.scalar(
            select(Notification.id).where(
                Notification.user_id == user_id,
                Notification.type == type,
                Notification.body == body,
            )
        )
        is not None
    )


def trigger_absence_guardian_notification(
    db: Session, attendance: Attendance
) -> list[Notification]:
    """Notify every linked guardian when a student is marked non-hadir."""
    if str(attendance.status) not in _NON_HADIR:
        return []
    student = db.get(Student, attendance.student_id)
    if student is None:
        return []
    tenant_id = _student_tenant_id(db, student)
    if tenant_id is None:
        return []

    name = _student_name(db, student)
    title = f"Kehadiran {name}"
    body = f"{name} ditandai {attendance.status} pada {attendance.date}"
    link = f"/dashboard/orang-tua/attendance/{student.id}"

    notifications: list[Notification] = []
    for parent_id in _linked_parent_ids(db, student.id):
        if _already_notified(db, parent_id, "attendance_alert", body):
            continue
        notifications.append(
            create_notification(
                db,
                user_id=parent_id,
                tenant_id=tenant_id,
                type="attendance_alert",
                title=title,
                body=body,
                link=link,
            )
        )
    return notifications


def trigger_spp_overdue_notification(
    db: Session, bill: SppBill
) -> list[Notification]:
    """Notify every linked guardian once when a bill becomes overdue."""
    if str(bill.status) != "overdue":
        return []
    student = db.get(Student, bill.student_id)
    if student is None:
        return []
    tenant_id = _student_tenant_id(db, student)
    if tenant_id is None:
        return []

    name = _student_name(db, student)
    title = f"SPP {name} Telah Jatuh Tempo"
    body = f"Tagihan SPP untuk {name} periode {bill.period} telah jatuh tempo."
    link = "/dashboard/orang-tua/spp"

    notifications: list[Notification] = []
    for parent_id in _linked_parent_ids(db, student.id):
        if _already_notified(db, parent_id, "spp_overdue", body):
            continue
        notifications.append(
            create_notification(
                db,
                user_id=parent_id,
                tenant_id=tenant_id,
                type="spp_overdue",
                title=title,
                body=body,
                link=link,
            )
        )
    return notifications
