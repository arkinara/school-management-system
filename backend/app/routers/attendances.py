"""Attendance router (ticket #14): record, bulk, recap/list, today, edit, delete."""

from __future__ import annotations

from calendar import monthrange
from datetime import date as date_type
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.audit import log_audit_event
from app.auth.deps import get_current_user
from app.config import EDIT_WINDOW_HOURS
from app.db.models import (
    Attendance,
    AttendanceStatus,
    Class,
    School,
    Student,
    User,
    UserRole,
    utcnow,
)
from app.db.scoping import scoped_query
from app.db.session import get_db
from app.notifications.triggers import (
    safe_trigger,
    trigger_absence_guardian_notification,
)
from app.pagination import PageParams
from app.schemas.attendance import (
    AttendanceBulkCreate,
    AttendanceBulkResult,
    AttendanceCreate,
    AttendanceListResponse,
    AttendanceOut,
    AttendanceTodaySummary,
    AttendanceUpdate,
)
from app.scoping import (
    can_manage_class,
    student_visible,
    visible_class_ids,
    visible_student_ids,
)

router = APIRouter()

_ALL_STATUSES = [s.value for s in AttendanceStatus]


def _get_class_or_404(db: Session, class_id: int) -> Class:
    klass = db.get(Class, class_id)
    if klass is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="class not found")
    return klass


def _within_edit_window(recorded_at: datetime | None) -> bool:
    """True when a record may still be corrected under the edit-window rule.

    SQLite stores naive datetimes, so a naive value is assumed to be UTC before
    comparing against an aware "now"; ``recorded_at`` is never None in practice
    but an unstamped row (legacy insert) is treated as editable.
    """
    if recorded_at is None:
        return True
    if recorded_at.tzinfo is None:
        recorded_at = recorded_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - recorded_at <= timedelta(hours=EDIT_WINDOW_HOURS)


def _edit_window_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"edits only allowed within {EDIT_WINDOW_HOURS} hours",
    )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=AttendanceOut)
def create_attendance(
    payload: AttendanceCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AttendanceOut:
    """Record one attendance row; teachers may only write their own classes."""
    klass = _get_class_or_404(db, payload.class_id)
    if not can_manage_class(db, user, klass):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    student = db.get(Student, payload.student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="student not found")
    if student.class_id != klass.id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="student does not belong to this class",
        )

    existing = db.scalar(
        select(Attendance).where(
            Attendance.student_id == student.id, Attendance.date == payload.date
        )
    )
    if existing is not None:
        # Same-day edit: enforce the edit window and audit old -> new.
        if not _within_edit_window(existing.recorded_at):
            raise _edit_window_error()
        before = {"status": str(existing.status), "note": existing.note}
        existing.status = payload.status
        existing.note = payload.note
        existing.recorded_by = user.id
        existing.recorded_at = utcnow()
        db.commit()
        db.refresh(existing)
        log_audit_event(
            db,
            actor=user,
            action="update_attendance",
            entity_type="attendance",
            entity_id=existing.id,
            before=before,
            after={"status": str(payload.status), "note": payload.note},
        )
        safe_trigger(trigger_absence_guardian_notification, db, existing)
        return AttendanceOut.model_validate(existing)

    record = Attendance(
        student_id=student.id,
        class_id=klass.id,
        date=payload.date,
        status=payload.status,
        recorded_by=user.id,
        note=payload.note,
        recorded_at=utcnow(),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    safe_trigger(trigger_absence_guardian_notification, db, record)
    return AttendanceOut.model_validate(record)


@router.post(
    "/bulk", status_code=status.HTTP_201_CREATED, response_model=AttendanceBulkResult
)
def create_attendance_bulk(
    payload: AttendanceBulkCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AttendanceBulkResult:
    """Create every entry for a class/date in a single transaction."""
    klass = _get_class_or_404(db, payload.class_id)
    if not can_manage_class(db, user, klass):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    entries = list({entry.student_id: entry for entry in payload.entries}.values())
    records: list[Attendance] = []
    audits: list[tuple[int, dict, dict]] = []
    for entry in entries:
        student = db.get(Student, entry.student_id)
        if student is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"student {entry.student_id} not found",
            )
        if student.class_id != klass.id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"student {entry.student_id} does not belong to this class",
            )
        existing = db.scalar(
            select(Attendance).where(
                Attendance.student_id == student.id, Attendance.date == payload.date
            )
        )
        if existing is not None:
            if not _within_edit_window(existing.recorded_at):
                raise _edit_window_error()
            before = {"status": str(existing.status), "note": existing.note}
            existing.status = entry.status
            existing.note = entry.note
            existing.recorded_by = user.id
            existing.recorded_at = utcnow()
            db.flush()
            audits.append((existing.id, before, {"status": str(entry.status), "note": entry.note}))
            records.append(existing)
            continue
        records.append(
            Attendance(
                student_id=student.id,
                class_id=klass.id,
                date=payload.date,
                status=entry.status,
                recorded_by=user.id,
                note=entry.note,
                recorded_at=utcnow(),
            )
        )

    db.add_all([r for r in records if r.id is None])
    db.commit()
    for entity_id, before, after in audits:
        log_audit_event(
            db,
            actor=user,
            action="update_attendance",
            entity_type="attendance",
            entity_id=entity_id,
            before=before,
            after=after,
        )
    for record in records:
        safe_trigger(trigger_absence_guardian_notification, db, record)
    return AttendanceBulkResult(class_id=klass.id, date=payload.date, created=len(records))


@router.get("", response_model=AttendanceListResponse)
def list_attendances(
    class_id: int | None = Query(None),
    date: date_type | None = Query(None),
    student_id: int | None = Query(None),
    page: PageParams = Depends(PageParams),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AttendanceListResponse:
    """List attendance within the caller's scope, with optional filters."""
    # scope: school
    allowed_classes = visible_class_ids(db, user)
    allowed_students = visible_student_ids(db, user)

    conditions = []
    if allowed_classes is not None:
        conditions.append(Attendance.class_id.in_(allowed_classes))
    if allowed_students is not None:
        conditions.append(Attendance.student_id.in_(allowed_students))

    if student_id is not None:
        if allowed_students is not None and student_id not in allowed_students:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
        conditions.append(Attendance.student_id == student_id)
    if class_id is not None:
        if allowed_classes is not None and class_id not in allowed_classes:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
        conditions.append(Attendance.class_id == class_id)
    if date is not None:
        conditions.append(Attendance.date == date)

    total = (
        db.scalar(select(func.count()).select_from(Attendance).where(*conditions)) or 0
    )
    rows = list(
        db.scalars(
            select(Attendance)
            .where(*conditions)
            .order_by(Attendance.date.desc(), Attendance.id)
            .offset(page.offset)
            .limit(page.size)
        ).all()
    )

    # Roster defaults: with a class + date, return every active student,
    # synthesising a default hadir row for anyone not yet recorded.
    if class_id is not None and date is not None:
        existing_keys = {(row.student_id, row.date) for row in rows}
        roster = list(
            db.scalars(
                scoped_query(Student, user, db).where(Student.class_id == class_id)
            ).all()
        )
        for student in roster:
            if (student.id, date) not in existing_keys:
                rows.append(
                    Attendance(
                        id=0,
                        student_id=student.id,
                        class_id=class_id,
                        date=date,
                        status=AttendanceStatus.HADIR,
                        note=None,
                        recorded_by=user.id,
                        recorded_at=datetime.now(timezone.utc),
                    )
                )
        total = len(rows)

    return AttendanceListResponse(
        items=[AttendanceOut.model_validate(row) for row in rows],
        total=total,
        page=page.page,
        size=page.size,
    )


@router.get("/recap")
def attendance_recap(
    class_id: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    year: int = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Monthly attendance recap for rapor: per-student counts and rate."""
    # scope: school
    allowed_classes = visible_class_ids(db, user)
    if allowed_classes is not None and class_id not in allowed_classes:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    _, last_day = monthrange(year, month)
    start = date_type(year, month, 1)
    end = date_type(year, month, last_day)
    students = list(
        db.scalars(
            scoped_query(Student, user, db).where(Student.class_id == class_id)
        ).all()
    )
    recaps = []
    for student in students:
        rows = list(
            db.scalars(
                select(Attendance).where(
                    Attendance.student_id == student.id,
                    Attendance.date >= start,
                    Attendance.date <= end,
                )
            ).all()
        )
        hadir = sum(1 for row in rows if str(row.status) == "hadir")
        recaps.append(
            {
                "student_id": student.id,
                "hadir": hadir,
                "izin": sum(1 for row in rows if str(row.status) == "izin"),
                "sakit": sum(1 for row in rows if str(row.status) == "sakit"),
                "alpa": sum(1 for row in rows if str(row.status) == "alpa"),
                "total": len(rows),
                "rate": (hadir / max(len(rows), 1)) * 100,
            }
        )
    return {
        "class_id": class_id,
        "month": month,
        "year": year,
        "partial": end > date_type.today(),
        "students": recaps,
    }


@router.get("/today", response_model=AttendanceTodaySummary)
def today_summary(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AttendanceTodaySummary:
    """Today's attendance plus per-status counts, scoped to the caller."""
    # scope: school
    today = date_type.today()
    allowed_classes = visible_class_ids(db, user)
    allowed_students = visible_student_ids(db, user)
    conditions = [Attendance.date == today]
    if allowed_classes is not None:
        conditions.append(Attendance.class_id.in_(allowed_classes))
    if allowed_students is not None:
        conditions.append(Attendance.student_id.in_(allowed_students))

    rows = db.scalars(
        select(Attendance).where(*conditions).order_by(Attendance.id)
    ).all()
    counts = {name: 0 for name in _ALL_STATUSES}
    for row in rows:
        counts[str(row.status)] = counts.get(str(row.status), 0) + 1
    return AttendanceTodaySummary(
        date=today,
        total=len(rows),
        counts=counts,
        items=[AttendanceOut.model_validate(row) for row in rows],
    )


@router.get("/student/{student_id}", response_model=AttendanceListResponse)
def list_student_attendances(
    student_id: int,
    page: PageParams = Depends(PageParams),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AttendanceListResponse:
    """Paginated attendance for one student inside the caller's scope."""
    # scope: school
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="student not found")
    if not student_visible(db, user, student):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    conditions = [Attendance.student_id == student.id]
    total = (
        db.scalar(select(func.count()).select_from(Attendance).where(*conditions)) or 0
    )
    rows = db.scalars(
        select(Attendance)
        .where(*conditions)
        .order_by(Attendance.date.desc(), Attendance.id)
        .offset(page.offset)
        .limit(page.size)
    ).all()
    return AttendanceListResponse(
        items=[AttendanceOut.model_validate(row) for row in rows],
        total=total,
        page=page.page,
        size=page.size,
    )


@router.patch("/{attendance_id}", response_model=AttendanceOut)
def update_attendance(
    attendance_id: int,
    payload: AttendanceUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AttendanceOut:
    """Correct status/note on an attendance row (teacher of the class or admin)."""
    record = db.get(Attendance, attendance_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="attendance not found")
    klass = db.get(Class, record.class_id)
    if klass is None or not can_manage_class(db, user, klass):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    if not _within_edit_window(record.recorded_at):
        raise _edit_window_error()

    data = payload.model_dump(exclude_unset=True)
    before = {"status": str(record.status), "note": record.note}
    if data.get("status") is not None:
        record.status = data["status"]
    if "note" in data:
        record.note = data["note"]
    record.recorded_by = user.id
    record.recorded_at = utcnow()
    db.commit()
    db.refresh(record)
    log_audit_event(
        db,
        actor=user,
        action="update_attendance",
        entity_type="attendance",
        entity_id=record.id,
        before=before,
        after={"status": str(record.status), "note": record.note},
    )
    safe_trigger(trigger_absence_guardian_notification, db, record)
    return AttendanceOut.model_validate(record)


@router.delete("/{attendance_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attendance(
    attendance_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Delete an attendance row (admin/super_admin only)."""
    record = db.get(Attendance, attendance_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="attendance not found")
    klass = db.get(Class, record.class_id)
    if user.role != UserRole.SUPER_ADMIN:
        if user.role != UserRole.ADMIN or klass is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
        school = db.get(School, klass.school_id)
        if school is None or school.tenant_id != user.tenant_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    db.delete(record)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
