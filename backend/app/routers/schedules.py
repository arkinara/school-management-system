"""Schedule router (ticket #20): CRUD, bulk, conflict detection, filtered views."""

from __future__ import annotations

from datetime import time

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.audit import log_audit_event
from app.auth.deps import get_current_user, require_role
from app.db.models import (
    Class,
    Schedule,
    School,
    Subject,
    TeacherAssignment,
    User,
    UserRole,
)
from app.db.scoping import (
    can_user_read_class,
    log_scope_denial,
    visible_school_ids,
)
from app.db.session import get_db
from app.pagination import PageParams
from app.schemas.schedule import (
    ScheduleBulkCreate,
    ScheduleBulkEntry,
    ScheduleBulkResult,
    ScheduleCreate,
    ScheduleListResponse,
    ScheduleOut,
    ScheduleUpdate,
)
from app.scoping import teacher_class_ids, visible_class_ids

router = APIRouter()

_MANAGER_ROLES = (UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.SUPER_ADMIN)
_manage = require_role(*_MANAGER_ROLES)


def _day_rank():
    """Column used to order weeks Senin→Minggu (ISO int, 1-7)."""
    return Schedule.day_of_week


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
    day_of_week: int,
    period_number: int,
    start_time: time,
    end_time: time,
    school_id: int,
    exclude_id: int | None = None,
) -> Schedule | None:
    """Return the first entry clashing on the class or teacher dimension.

    Conflicts are only considered within ``school_id`` so a hidden schedule in
    another school of the same tenant can never surface (or be inferred) here.
    """
    overlap = (Schedule.start_time < end_time) & (Schedule.end_time > start_time)
    conditions = [Schedule.day_of_week == day_of_week, Class.school_id == school_id]
    if exclude_id is not None:
        conditions.append(Schedule.id != exclude_id)

    class_conflict = or_(Schedule.period_number == period_number, overlap)
    row = db.scalar(
        select(Schedule)
        .join(Class, Class.id == Schedule.class_id)
        .where(*conditions, Schedule.class_id == class_id, class_conflict)
        .order_by(Schedule.id)
    )
    if row is not None:
        return row
    return db.scalar(
        select(Schedule)
        .join(Class, Class.id == Schedule.class_id)
        .where(*conditions, Schedule.teacher_id == teacher_id, overlap)
        .order_by(Schedule.id)
    )


def _describe_conflict(row: Schedule, kind: str) -> dict:
    """Detailed conflict entry consumed by the FE config page (#58)."""
    return {"type": kind, "schedule_id": row.id, **_describe(row)}


def _conflict_error(row: Schedule, kind: str = "schedule") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "message": (
                "schedule conflict: class or teacher already booked in "
                "this day/period"
            ),
            # ``conflict`` kept for backwards compatibility; ``conflicts`` is the
            # list form the FE (#58) reads.
            "conflict": _describe(row),
            "conflicts": [_describe_conflict(row, kind)],
        },
    )


def _conflicts_error(conflicts: list[dict], message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "message": message,
            "conflict": conflicts[0] if conflicts else None,
            "conflicts": conflicts,
        },
    )


def _check_conflicts(
    db: Session,
    *,
    teacher_id: int,
    class_id: int,
    day_of_week: int,
    start_time: time,
    end_time: time,
    school_id: int,
    exclude_schedule_id: int | None = None,
) -> list[dict]:
    """All clashes for the same teacher OR same class on an overlapping day slot.

    ``day_of_week`` is the canonical ISO integer (1=Mon … 7=Sun) enforced by
    ticket #44, so no string normalisation is required.
    """
    overlap = (Schedule.start_time < end_time) & (Schedule.end_time > start_time)
    conditions = [
        Schedule.day_of_week == day_of_week,
        Class.school_id == school_id,
        overlap,
    ]
    if exclude_schedule_id is not None:
        conditions.append(Schedule.id != exclude_schedule_id)

    teacher_rows = db.scalars(
        select(Schedule)
        .join(Class, Class.id == Schedule.class_id)
        .where(*conditions, Schedule.teacher_id == teacher_id)
        .order_by(Schedule.id)
    ).all()
    class_rows = db.scalars(
        select(Schedule)
        .join(Class, Class.id == Schedule.class_id)
        .where(*conditions, Schedule.class_id == class_id)
        .order_by(Schedule.id)
    ).all()

    conflicts = [_describe_conflict(row, "teacher") for row in teacher_rows]
    conflicts.extend(_describe_conflict(row, "class") for row in class_rows)
    return conflicts


def _teacher_teaches_class(db: Session, user: User, class_id: int) -> bool:
    """True when a guru is the homeroom teacher or timetabled for ``class_id``."""
    if class_id in teacher_class_ids(db, user):
        return True
    return (
        db.scalar(
            select(TeacherAssignment.id).where(
                TeacherAssignment.teacher_id == user.id,
                TeacherAssignment.class_id == class_id,
            )
        )
        is not None
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
        day_of_week=int(payload.day_of_week),
        period_number=payload.period_number,
        start_time=payload.start_time,
        end_time=payload.end_time,
        school_id=school.id,
    )
    if conflict is not None:
        raise _conflict_error(conflict)

    entry = Schedule(
        class_id=klass.id,
        subject_id=payload.subject_id,
        teacher_id=payload.teacher_id,
        day_of_week=int(payload.day_of_week),
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
            day_of_week=int(slot.day_of_week),
            period_number=slot.period_number,
            start_time=slot.start_time,
            end_time=slot.end_time,
            school_id=school.id,
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
                day_of_week=int(slot.day_of_week),
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


@router.post(
    "/bulk-replace/{class_id}",
    response_model=list[ScheduleOut],
)
def bulk_replace_class_schedules(
    class_id: int,
    payload: list[ScheduleBulkEntry],
    user: User = Depends(_manage),
    db: Session = Depends(get_db),
) -> list[ScheduleOut]:
    """Atomically replace ALL schedules for a class (FE config page, #58).

    Existing rows for the class are removed and the submitted set inserted in a
    single transaction: any conflict or integrity error rolls the whole change
    back, so the timetable is never left half-applied.
    """
    klass = _load_class(db, class_id)
    school = _authorize_class(db, user, klass)

    for item in payload:
        _resolve_subject(db, item.subject_id, school.tenant_id)
        _resolve_teacher(db, item.teacher_id, school.tenant_id)

    # Drop the class's current slots before checking so a full replacement can
    # never conflict with the schedule it is replacing.
    db.query(Schedule).filter(Schedule.class_id == klass.id).delete(
        synchronize_session=False
    )
    db.flush()

    conflicts: list[dict] = []
    staged: list[Schedule] = []
    for item in payload:
        day = int(item.day_of_week)
        conflicts.extend(
            _check_conflicts(
                db,
                teacher_id=item.teacher_id,
                class_id=klass.id,
                day_of_week=day,
                start_time=item.start_time,
                end_time=item.end_time,
                school_id=school.id,
            )
        )
        for other in staged:
            if int(other.day_of_week) != day:
                continue
            overlaps = (
                other.start_time < item.end_time and other.end_time > item.start_time
            )
            if overlaps and (
                other.class_id == klass.id or other.teacher_id == item.teacher_id
            ):
                conflicts.append(_describe_conflict(other, "batch"))
        staged.append(
            Schedule(
                class_id=klass.id,
                subject_id=item.subject_id,
                teacher_id=item.teacher_id,
                day_of_week=day,
                period_number=item.period_number,
                start_time=item.start_time,
                end_time=item.end_time,
            )
        )

    if conflicts:
        db.rollback()
        raise _conflicts_error(conflicts, "schedule conflicts")

    db.add_all(staged)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="schedule slot already taken for this class/day/period",
        ) from exc
    for entry in staged:
        db.refresh(entry)
    return [ScheduleOut.model_validate(entry) for entry in staged]


@router.get("", response_model=ScheduleListResponse)
def list_schedules(
    class_id: int | None = Query(None),
    teacher_id: int | None = Query(None),
    day_of_week: int | None = Query(None, ge=1, le=7),
    page: PageParams = Depends(PageParams),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ScheduleListResponse:
    """List schedule entries within the caller's visible scope, paginated.

    Reads are server-driven: the unfiltered list is manager-only, a guru may
    only filter by their own ``teacher_id``, and ``class_id`` must fall inside
    the caller's readable classes (own class for student, linked children for
    parent, taught classes for guru).
    """
    # scope: school
    conditions = []
    if class_id is None and teacher_id is None and user.role not in _MANAGER_ROLES:
        log_scope_denial(
            db,
            user,
            resource="schedule_list",
            resource_id=0,
            reason="unfiltered list restricted to admin/principal/super_admin",
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="unfiltered list restricted to admin/principal",
        )
    if user.role != UserRole.SUPER_ADMIN:
        conditions.append(School.tenant_id == user.tenant_id)
        conditions.append(School.id.in_(visible_school_ids(db, user)))
    if class_id is not None:
        _load_class(db, class_id)
        allowed_classes = visible_class_ids(db, user)
        if allowed_classes is not None and class_id not in allowed_classes:
            log_scope_denial(
                db,
                user,
                resource="schedule_list",
                resource_id=class_id,
                reason="class outside caller's readable scope",
            )
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
        conditions.append(Schedule.class_id == class_id)
    if teacher_id is not None:
        teacher = db.get(User, teacher_id)
        if teacher is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="teacher not found"
            )
        if user.role not in _MANAGER_ROLES and user.id != teacher_id:
            log_scope_denial(
                db,
                user,
                resource="schedule_list",
                resource_id=teacher_id,
                reason="only managers may filter by another teacher",
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="teachers can only read their own schedule",
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
    """A teacher's full weekly timetable (self, or admin/principal, or super_admin)."""
    # scope: school
    teacher = db.get(User, teacher_id)
    if teacher is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="teacher not found")
    if user.role != UserRole.SUPER_ADMIN and teacher.tenant_id != user.tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    if user.role not in (UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PRINCIPAL) and (
        user.id != teacher_id or user.school_id != teacher.school_id
    ):
        log_scope_denial(
            db,
            user,
            resource="teacher_schedule",
            resource_id=teacher_id,
            reason="teacher may only read own schedule",
        )
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
    """A class's full weekly timetable (visible school only; ordered day then period)."""
    # scope: school
    klass = _load_class(db, class_id)
    if user.role != UserRole.SUPER_ADMIN:
        school = _school_or_404(db, klass.school_id)
        if school.tenant_id != user.tenant_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    if user.role != UserRole.SUPER_ADMIN and not can_user_read_class(db, user, class_id):
        log_scope_denial(
            db,
            user,
            resource="class_schedule",
            resource_id=class_id,
            reason="cross-school read blocked",
        )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="class not found")
    if user.role in (UserRole.STUDENT, UserRole.PARENT):
        allowed_classes = visible_class_ids(db, user)
        if allowed_classes is not None and class_id not in allowed_classes:
            log_scope_denial(
                db,
                user,
                resource="class_schedule",
                resource_id=class_id,
                reason="class outside caller's readable scope",
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="forbidden",
            )
    rows = db.scalars(
        select(Schedule)
        .where(Schedule.class_id == class_id)
        .order_by(_day_rank(), Schedule.period_number, Schedule.id)
    ).all()
    return [ScheduleOut.model_validate(row) for row in rows]


@router.get("/by-class/{class_id}", response_model=list[ScheduleOut])
def class_schedule_for_parent(
    class_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ScheduleOut]:
    """Read a class timetable with relationship-aware access.

    Parents may read a linked child's class; a guru may read a class they are
    assigned to; students only their own class; managers keep school scope.
    """
    # scope: role + class visibility
    klass = _load_class(db, class_id)
    if user.role != UserRole.SUPER_ADMIN:
        school = _school_or_404(db, klass.school_id)
        if school.tenant_id != user.tenant_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="class not found")

    if user.role == UserRole.PARENT:
        if class_id not in (visible_class_ids(db, user) or set()):
            log_scope_denial(
                db,
                user,
                resource="class_schedule",
                resource_id=class_id,
                reason="no linked child in this class",
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="no linked child in this class",
            )
    elif user.role == UserRole.STUDENT:
        if class_id not in (visible_class_ids(db, user) or set()):
            log_scope_denial(
                db,
                user,
                resource="class_schedule",
                resource_id=class_id,
                reason="student may only read own class",
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="student may only read own class",
            )
    elif user.role == UserRole.TEACHER:
        if not _teacher_teaches_class(db, user, class_id):
            log_scope_denial(
                db,
                user,
                resource="class_schedule",
                resource_id=class_id,
                reason="teacher does not teach this class",
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="teacher does not teach this class",
            )
    elif user.role not in (UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PRINCIPAL):
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
    day_of_week = int(data.get("day_of_week", entry.day_of_week))
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
        school_id=school.id,
        exclude_id=entry.id,
    )
    if conflict is not None:
        raise _conflict_error(conflict)

    before = _describe(entry)
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
    log_audit_event(
        db,
        actor=user,
        action="update_schedule",
        entity_type="schedule",
        entity_id=entry.id,
        before=before,
        after=_describe(entry),
    )
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
    before = _describe(entry)
    db.delete(entry)
    db.commit()
    log_audit_event(
        db,
        actor=user,
        action="delete_schedule",
        entity_type="schedule",
        entity_id=schedule_id,
        before=before,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
