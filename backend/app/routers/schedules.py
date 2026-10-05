"""Schedule router (ticket #20): CRUD, bulk, conflict detection, filtered views."""

from __future__ import annotations

from datetime import time

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, require_role
from app.db.models import Class, Schedule, School, Subject, User, UserRole
from app.db.session import get_db
from app.pagination import PageParams
from app.schemas.schedule import (
    ScheduleBulkCreate,
    ScheduleBulkResult,
    ScheduleCreate,
    ScheduleListResponse,
    ScheduleOut,
    ScheduleUpdate,
)

router = APIRouter()

_MANAGER_ROLES = (UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.SUPER_ADMIN)
_manage = require_role(*_MANAGER_ROLES)

_DAY_ORDER = {
    "senin": 0,
    "selasa": 1,
    "rabu": 2,
    "kamis": 3,
    "jumat": 4,
    "sabtu": 5,
    "minggu": 6,
    "sen": 0,
    "sel": 1,
    "rab": 2,
    "kam": 3,
    "jum": 4,
    "sab": 5,
    "min": 6,
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}


def _day_rank():
    """SQL CASE ranking a day label so weeks order Senin→Minggu."""
    return case(_DAY_ORDER, value=func.lower(Schedule.day_of_week), else_=99)


def _can_manage_school(user: User, school: School | None) -> bool:
    """True if ``user`` may administer ``school`` (super_admin always)."""
    if school is None:
        return False
    if user.role == UserRole.SUPER_ADMIN:
        return True
    return (
        user.role in {UserRole.ADMIN, UserRole.PRINCIPAL}
        and user.tenant_id == school.tenant_id
        and user.school_id == school.id
    )


def _load_class(db: Session, class_id: int) -> Class:
    klass = db.get(Class, class_id)
    if klass is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="class not found")
    return klass


def _school_or_404(db: Session, school_id: int) -> School:
    school = db.get(School, school_id)
    if school is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="school not found")
    return school


def _resolve_subject(db: Session, subject_id: int, tenant_id: int) -> Subject:
    subject = db.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="subject not found")
    if subject.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="subject does not belong to the class tenant",
        )
    return subject


def _resolve_teacher(db: Session, teacher_id: int, tenant_id: int) -> User:
    teacher = db.get(User, teacher_id)
    if teacher is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="teacher not found")
    if teacher.role != UserRole.TEACHER:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="teacher_id must reference a user with role=teacher",
        )
    if teacher.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="teacher does not belong to the class tenant",
        )
    return teacher


def _describe(row: Schedule) -> dict:
    return {
        "id": row.id,
        "class_id": row.class_id,
        "subject_id": row.subject_id,
        "teacher_id": row.teacher_id,
        "day_of_week": row.day_of_week,
        "period_number": row.period_number,
        "start_time": row.start_time.isoformat(),
        "end_time": row.end_time.isoformat(),
    }


def _find_conflict(
    db: Session,
    *,
    class_id: int,
    teacher_id: int,
    day_of_week: str,
    period_number: int,
    start_time: time,
    end_time: time,
    exclude_id: int | None = None,
) -> Schedule | None:
    """Return the first entry clashing on the class or teacher dimension."""
    overlap = (Schedule.start_time < end_time) & (Schedule.end_time > start_time)
    conditions = [Schedule.day_of_week == day_of_week]
    if exclude_id is not None:
        conditions.append(Schedule.id != exclude_id)

    class_conflict = or_(Schedule.period_number == period_number, overlap)
    row = db.scalar(
        select(Schedule)
        .where(*conditions, Schedule.class_id == class_id, class_conflict)
        .order_by(Schedule.id)
    )
    if row is not None:
        return row
    return db.scalar(
        select(Schedule)
        .where(*conditions, Schedule.teacher_id == teacher_id, overlap)
        .order_by(Schedule.id)
    )


def _conflict_error(row: Schedule) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "message": (
                "schedule conflict: class or teacher already booked in "
                "this day/period"
            ),
            "conflict": _describe(row),
        },
    )


def _authorize_class(db: Session, user: User, klass: Class) -> School:
    school = _school_or_404(db, klass.school_id)
    if not _can_manage_school(user, school):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    return school


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ScheduleOut)
def create_schedule(
    payload: ScheduleCreate,
    user: User = Depends(_manage),
    db: Session = Depends(get_db),
) -> ScheduleOut:
    """Create one schedule entry after class/teacher conflict detection."""
    klass = _load_class(db, payload.class_id)
    school = _authorize_class(db, user, klass)
    _resolve_subject(db, payload.subject_id, school.tenant_id)
    _resolve_teacher(db, payload.teacher_id, school.tenant_id)

    conflict = _find_conflict(
        db,
        class_id=klass.id,
        teacher_id=payload.teacher_id,
        day_of_week=payload.day_of_week,
        period_number=payload.period_number,
        start_time=payload.start_time,
        end_time=payload.end_time,
    )
    if conflict is not None:
        raise _conflict_error(conflict)

    entry = Schedule(
        class_id=klass.id,
        subject_id=payload.subject_id,
        teacher_id=payload.teacher_id,
        day_of_week=payload.day_of_week,
        period_number=payload.period_number,
        start_time=payload.start_time,
        end_time=payload.end_time,
    )
    db.add(entry)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="schedule slot already taken for this class/day/period",
        ) from exc
    db.refresh(entry)
    return ScheduleOut.model_validate(entry)


@router.post(
    "/bulk", status_code=status.HTTP_201_CREATED, response_model=ScheduleBulkResult
)
def create_schedule_bulk(
    payload: ScheduleBulkCreate,
    user: User = Depends(_manage),
    db: Session = Depends(get_db),
) -> ScheduleBulkResult:
    """Create every slot for a class in one transaction; rollback on conflict."""
    klass = _load_class(db, payload.class_id)
    school = _authorize_class(db, user, klass)

    staged: list[Schedule] = []
    for slot in payload.schedules:
        _resolve_subject(db, slot.subject_id, school.tenant_id)
        _resolve_teacher(db, slot.teacher_id, school.tenant_id)
        conflict = _find_conflict(
            db,
            class_id=klass.id,
            teacher_id=slot.teacher_id,
            day_of_week=slot.day_of_week,
            period_number=slot.period_number,
            start_time=slot.start_time,
            end_time=slot.end_time,
        )
        if conflict is not None:
            raise _conflict_error(conflict)
        for other in staged:
            if other.day_of_week != slot.day_of_week:
                continue
            same_class = (
                other.period_number == slot.period_number
                or (other.start_time < slot.end_time and other.end_time > slot.start_time)
            )
            same_teacher = (
                other.teacher_id == slot.teacher_id
                and other.start_time < slot.end_time
                and other.end_time > slot.start_time
            )
            if same_class or same_teacher:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "message": "schedule conflict within submitted batch",
                        "conflict": _describe(other),
                    },
                )
        staged.append(
            Schedule(
                class_id=klass.id,
                subject_id=slot.subject_id,
                teacher_id=slot.teacher_id,
                day_of_week=slot.day_of_week,
                period_number=slot.period_number,
                start_time=slot.start_time,
                end_time=slot.end_time,
            )
        )

    db.add_all(staged)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="schedule slot already taken for this class/day/period",
        ) from exc
    return ScheduleBulkResult(class_id=klass.id, created=len(staged))


@router.get("", response_model=ScheduleListResponse)
def list_schedules(
    class_id: int | None = Query(None),
    teacher_id: int | None = Query(None),
    day_of_week: str | None = Query(None),
    page: PageParams = Depends(PageParams),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ScheduleListResponse:
    """List schedule entries within the caller's tenant, paginated."""
    conditions = []
    if user.role != UserRole.SUPER_ADMIN:
        conditions.append(School.tenant_id == user.tenant_id)
    if class_id is not None:
        klass = _load_class(db, class_id)
        if user.role != UserRole.SUPER_ADMIN:
            school = _school_or_404(db, klass.school_id)
            if school.tenant_id != user.tenant_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
        conditions.append(Schedule.class_id == class_id)
    if teacher_id is not None:
        teacher = db.get(User, teacher_id)
        if teacher is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="teacher not found"
            )
        if user.role != UserRole.SUPER_ADMIN and teacher.tenant_id != user.tenant_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
        conditions.append(Schedule.teacher_id == teacher_id)
    if day_of_week is not None:
        conditions.append(Schedule.day_of_week == day_of_week)

    base = (
        select(Schedule)
        .join(Class, Class.id == Schedule.class_id)
        .join(School, School.id == Class.school_id)
        .where(*conditions)
    )
    total = (
        db.scalar(
            select(func.count())
            .select_from(Schedule)
            .join(Class, Class.id == Schedule.class_id)
            .join(School, School.id == Class.school_id)
            .where(*conditions)
        )
        or 0
    )
    rows = db.scalars(
        base.order_by(_day_rank(), Schedule.period_number, Schedule.id)
        .offset(page.offset)
        .limit(page.size)
    ).all()
    return ScheduleListResponse(
        items=[ScheduleOut.model_validate(row) for row in rows],
        total=total,
        page=page.page,
        size=page.size,
    )


@router.get("/teacher/{teacher_id}", response_model=list[ScheduleOut])
def teacher_schedule(
    teacher_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ScheduleOut]:
    """A teacher's full weekly timetable (ordered day then period)."""
    teacher = db.get(User, teacher_id)
    if teacher is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="teacher not found")
    if user.role != UserRole.SUPER_ADMIN and teacher.tenant_id != user.tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    rows = db.scalars(
        select(Schedule)
        .where(Schedule.teacher_id == teacher_id)
        .order_by(_day_rank(), Schedule.period_number, Schedule.id)
    ).all()
    return [ScheduleOut.model_validate(row) for row in rows]


@router.get("/class/{class_id}", response_model=list[ScheduleOut])
def class_schedule(
    class_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ScheduleOut]:
    """A class's full weekly timetable (ordered day then period)."""
    klass = _load_class(db, class_id)
    if user.role != UserRole.SUPER_ADMIN:
        school = _school_or_404(db, klass.school_id)
        if school.tenant_id != user.tenant_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    rows = db.scalars(
        select(Schedule)
        .where(Schedule.class_id == class_id)
        .order_by(_day_rank(), Schedule.period_number, Schedule.id)
    ).all()
    return [ScheduleOut.model_validate(row) for row in rows]


@router.patch("/{schedule_id}", response_model=ScheduleOut)
def update_schedule(
    schedule_id: int,
    payload: ScheduleUpdate,
    user: User = Depends(_manage),
    db: Session = Depends(get_db),
) -> ScheduleOut:
    """Partially update a schedule entry, re-running conflict detection."""
    entry = db.get(Schedule, schedule_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="schedule not found")
    klass = _load_class(db, entry.class_id)
    school = _authorize_class(db, user, klass)

    data = payload.model_dump(exclude_unset=True)
    subject_id = data.get("subject_id", entry.subject_id)
    teacher_id = data.get("teacher_id", entry.teacher_id)
    day_of_week = data.get("day_of_week", entry.day_of_week)
    period_number = data.get("period_number", entry.period_number)
    start_time = data.get("start_time", entry.start_time)
    end_time = data.get("end_time", entry.end_time)

    if end_time <= start_time:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="end_time must be after start_time",
        )
    if "subject_id" in data:
        _resolve_subject(db, subject_id, school.tenant_id)
    if "teacher_id" in data:
        _resolve_teacher(db, teacher_id, school.tenant_id)

    conflict = _find_conflict(
        db,
        class_id=klass.id,
        teacher_id=teacher_id,
        day_of_week=day_of_week,
        period_number=period_number,
        start_time=start_time,
        end_time=end_time,
        exclude_id=entry.id,
    )
    if conflict is not None:
        raise _conflict_error(conflict)

    entry.subject_id = subject_id
    entry.teacher_id = teacher_id
    entry.day_of_week = day_of_week
    entry.period_number = period_number
    entry.start_time = start_time
    entry.end_time = end_time
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="schedule slot already taken for this class/day/period",
        ) from exc
    db.refresh(entry)
    return ScheduleOut.model_validate(entry)


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_schedule(
    schedule_id: int,
    user: User = Depends(_manage),
    db: Session = Depends(get_db),
) -> Response:
    """Delete a schedule entry (principal/admin of its school or super_admin)."""
    entry = db.get(Schedule, schedule_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="schedule not found")
    klass = _load_class(db, entry.class_id)
    _authorize_class(db, user, klass)
    db.delete(entry)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
