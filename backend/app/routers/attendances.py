"""Attendance router (ticket #14): record, bulk, recap/list, today, edit, delete."""

from __future__ import annotations

from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.db.models import Attendance, AttendanceStatus, Class, School, Student, User, UserRole
from app.db.session import get_db
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

    duplicate = db.scalar(
        select(Attendance).where(
            Attendance.student_id == student.id, Attendance.date == payload.date
        )
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="attendance already recorded for this student and date",
        )

    record = Attendance(
        student_id=student.id,
        class_id=klass.id,
        date=payload.date,
        status=payload.status,
        recorded_by=user.id,
        note=payload.note,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
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
        duplicate = db.scalar(
            select(Attendance).where(
                Attendance.student_id == student.id, Attendance.date == payload.date
            )
        )
        if duplicate is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"attendance already recorded for student {student.id}",
            )
        records.append(
            Attendance(
                student_id=student.id,
                class_id=klass.id,
                date=payload.date,
                status=entry.status,
                recorded_by=user.id,
                note=entry.note,
            )
        )

    db.add_all(records)
    db.commit()
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

    data = payload.model_dump(exclude_unset=True)
    if data.get("status") is not None:
        record.status = data["status"]
    if "note" in data:
        record.note = data["note"]
    db.commit()
    db.refresh(record)
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
