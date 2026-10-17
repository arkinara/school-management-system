"""Grade router (ticket #16): entry, bulk entry, scoped reads, aggregation.

Ticket #53 adds an upsert-on-natural-key write path, a jenjang-aware note rule
(TK/SD require a description), audit rows for every mutation, and class-scoped
aggregation/rollup views for wali kelas.
"""

from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.academic import ACTIVE_SEMESTER
from app.auth.audit import log_audit_event
from app.auth.deps import get_current_user
from app.db.models import (
    Class,
    Grade,
    GradeCategory,
    School,
    Student,
    Subject,
    TeacherAssignment,
    Tenant,
    User,
    UserRole,
    utcnow,
)
from app.db.session import get_db
from app.pagination import PageParams
from app.schemas.grade import (
    BulkGradeRowResult,
    GradeBulkCreate,
    GradeBulkResult,
    GradeCreate,
    GradeListResponse,
    GradeOut,
    GradeUpdate,
    SubjectAggregate,
)
from app.scoping import (
    can_manage_class,
    can_write_student,
    is_super_admin,
    student_visible,
    visible_class_ids,
    visible_student_ids,
)

router = APIRouter()

_STAFF_ADMIN_ROLES = {UserRole.ADMIN, UserRole.PRINCIPAL}

_CATEGORIES = [c.value for c in GradeCategory]

# Jenjang whose grades must carry a descriptive note (PRD Penilaian #16).
_NOTE_REQUIRED_JENJANG = {"TK", "SD"}


def _class_or_404(db: Session, class_id: int) -> Class:
    klass = db.get(Class, class_id)
    if klass is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="class not found")
    return klass


def _subject_or_404(db: Session, subject_id: int) -> Subject:
    subject = db.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="subject not found")
    return subject


def _assert_subject_tenant(subject: Subject, user: User) -> None:
    """Reject a subject owned by another tenant (always checked, class or not)."""
    if is_super_admin(user):
        return
    if subject.tenant_id != user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="subject does not belong to this tenant",
        )


def _student_jenjang(db: Session, student: Student) -> str:
    """Jenjang of the student's school (via its tenant); defaults to SMP."""
    school = db.get(School, student.school_id)
    if school is None:
        return "SMP"
    tenant = db.get(Tenant, school.tenant_id)
    return str(tenant.jenjang_type) if tenant is not None else "SMP"


def _enforce_note_rule(jenjang: str, description: str | None) -> None:
    """TK/SD grades require a non-blank descriptive note."""
    if jenjang in _NOTE_REQUIRED_JENJANG and not (description and description.strip()):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"description required for {jenjang} grades",
        )


def _apply_upsert(
    db: Session,
    user: User,
    student: Student,
    subject: Subject,
    semester: str,
    category: GradeCategory,
    assessment_no: int,
    score: float,
    description: str | None,
) -> tuple[Grade, dict | None]:
    """Insert or update a grade on its natural key.

    Returns ``(grade, before)``; ``before`` is ``None`` for a fresh insert so the
    caller can pick the right audit action.
    """
    existing = db.scalar(
        select(Grade).where(
            Grade.student_id == student.id,
            Grade.subject_id == subject.id,
            Grade.category == category,
            Grade.semester == semester,
            Grade.assessment_no == assessment_no,
        )
    )
    if existing is not None:
        before = {"score": existing.score, "description": existing.description}
        existing.score = score
        existing.description = description
        existing.recorded_by = user.id
        existing.updated_at = utcnow()
        db.flush()
        return existing, before

    school = db.get(School, student.school_id)
    grade = Grade(
        student_id=student.id,
        subject_id=subject.id,
        semester=semester,
        category=category,
        assessment_no=assessment_no,
        score=score,
        description=description,
        kurikulum_version=school.kurikulum_version if school is not None else None,
        recorded_by=user.id,
    )
    db.add(grade)
    db.flush()
    return grade, None


def _audit_grade(db: Session, user: User, grade: Grade, before: dict | None) -> None:
    if before is None:
        log_audit_event(
            db,
            actor=user,
            action="create_grade",
            entity_type="grade",
            entity_id=grade.id,
            after={"score": grade.score, "description": grade.description},
        )
    else:
        log_audit_event(
            db,
            actor=user,
            action="update_grade",
            entity_type="grade",
            entity_id=grade.id,
            before=before,
            after={"score": grade.score, "description": grade.description},
        )


def _teacher_has_assignment(
    db: Session, teacher_id: int, class_id: int | None, subject_id: int
) -> bool:
    """True when the teacher holds a current assignment for class+subject."""
    if class_id is None:
        return False
    return (
        db.scalar(
            select(TeacherAssignment.id).where(
                TeacherAssignment.teacher_id == teacher_id,
                TeacherAssignment.class_id == class_id,
                TeacherAssignment.subject_id == subject_id,
            )
        )
        is not None
    )


def _can_edit_grade(db: Session, user: User, grade: Grade) -> bool:
    """Mutation gate for PATCH/DELETE.

    Teachers must hold a TeacherAssignment for the grade's class+subject;
    admin/principal may edit inside their tenant; super_admin bypasses.
    """
    if is_super_admin(user):
        return True
    student = db.get(Student, grade.student_id)
    if student is None:
        return False
    school = db.get(School, student.school_id)
    if user.role in _STAFF_ADMIN_ROLES:
        return school is not None and school.tenant_id == user.tenant_id
    if user.role == UserRole.TEACHER:
        return _teacher_has_assignment(db, user.id, student.class_id, grade.subject_id)
    return False


def _audit_denied_grade_edit(db: Session, user: User, grade: Grade) -> None:
    log_audit_event(
        db,
        actor=user,
        action="grade_edit_denied",
        entity_type="grade",
        entity_id=grade.id,
        outcome="denied",
        reason_code="no_teacher_assignment",
    )


def _grade_category_block(
    rows: list[Grade], *, include_ids: bool = False
) -> dict:
    """Per-category scores/descriptions/average + completeness flags."""
    block: dict = {
        "scores": [float(g.score) for g in rows],
        "descriptions": [g.description for g in rows if g.description],
        "avg": (sum(float(g.score) for g in rows) / len(rows)) if rows else None,
        "complete": bool(rows),
        "missing": [] if rows else ["assessment_1"],
    }
    if include_ids:
        block["ids"] = [g.id for g in rows]
    return block


def _total_avg(categories: dict) -> float | None:
    avgs = [v["avg"] for v in categories.values() if v["avg"] is not None]
    return sum(avgs) / len(avgs) if avgs else None


def _subjects_for_student(db: Session, student: Student) -> list[Subject]:
    """All subjects in the student's tenant (so empty ones list as missing)."""
    school = db.get(School, student.school_id)
    tenant_id = school.tenant_id if school is not None else None
    if tenant_id is None:
        return []
    stmt = select(Subject).where(Subject.tenant_id == tenant_id).order_by(Subject.name)
    return list(db.scalars(stmt).all())


@router.post("", status_code=status.HTTP_201_CREATED, response_model=GradeOut)
def create_grade(
    payload: GradeCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GradeOut:
    """Record one score, upserting on (student, subject, category, semester, no)."""
    student = db.get(Student, payload.student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="student not found")
    if not can_write_student(db, user, student):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    subject = _subject_or_404(db, payload.subject_id)
    _assert_subject_tenant(subject, user)
    _enforce_note_rule(_student_jenjang(db, student), payload.description)

    grade, before = _apply_upsert(
        db,
        user,
        student,
        subject,
        payload.semester,
        payload.category,
        payload.assessment_no,
        payload.score,
        payload.description,
    )
    db.commit()
    db.refresh(grade)
    _audit_grade(db, user, grade, before)
    return GradeOut.model_validate(grade)


def _bulk_error(
    index: int,
    detail: str,
    *,
    status_code: int = status.HTTP_422_UNPROCESSABLE_ENTITY,
    student_id: int | None = None,
    subject_id: int | None = None,
    category: str | None = None,
    assessment_no: int | None = None,
) -> BulkGradeRowResult:
    return BulkGradeRowResult(
        index=index,
        student_id=student_id,
        subject_id=subject_id,
        category=category,
        assessment_no=assessment_no,
        status="error",
        status_code=status_code,
        detail=detail,
    )


def _bulk_by_items(
    db: Session, user: User, payload: GradeBulkCreate
) -> GradeBulkResult:
    """Process heterogeneous per-row items, collecting errors instead of aborting."""
    saved_grades: list[Grade] = []
    created = 0
    updated = 0
    errors: list[BulkGradeRowResult] = []
    seen: set[tuple] = set()

    for index, item in enumerate(payload.items):
        semester = item.semester or payload.semester
        category = item.category or payload.category
        if semester is None:
            errors.append(
                _bulk_error(
                    index,
                    "semester is required",
                    student_id=item.student_id,
                    subject_id=item.subject_id,
                )
            )
            continue
        if category is None:
            errors.append(
                _bulk_error(
                    index,
                    "category is required",
                    student_id=item.student_id,
                    subject_id=item.subject_id,
                )
            )
            continue
        if item.score is None:
            errors.append(
                _bulk_error(
                    index,
                    "score is required",
                    student_id=item.student_id,
                    subject_id=item.subject_id,
                    category=str(category),
                    assessment_no=item.assessment_no,
                )
            )
            continue
        if item.score < 0 or item.score > 100:
            errors.append(
                _bulk_error(
                    index,
                    f"score must be 0-100, got {item.score}",
                    student_id=item.student_id,
                    subject_id=item.subject_id,
                    category=str(category),
                    assessment_no=item.assessment_no,
                )
            )
            continue

        key = (
            item.student_id,
            item.subject_id,
            str(category),
            semester,
            item.assessment_no,
        )
        if key in seen:
            errors.append(
                _bulk_error(
                    index,
                    "duplicate grade in bulk payload "
                    "(student, subject, category, semester, assessment)",
                    status_code=status.HTTP_409_CONFLICT,
                    student_id=item.student_id,
                    subject_id=item.subject_id,
                    category=str(category),
                    assessment_no=item.assessment_no,
                )
            )
            continue

        student = db.get(Student, item.student_id)
        if student is None:
            errors.append(
                _bulk_error(
                    index,
                    "student not found",
                    student_id=item.student_id,
                    subject_id=item.subject_id,
                )
            )
            continue
        if not can_write_student(db, user, student):
            errors.append(
                _bulk_error(
                    index,
                    "forbidden",
                    status_code=status.HTTP_403_FORBIDDEN,
                    student_id=item.student_id,
                    subject_id=item.subject_id,
                )
            )
            continue
        subject = db.get(Subject, item.subject_id)
        if subject is None or (
            not is_super_admin(user) and subject.tenant_id != user.tenant_id
        ):
            errors.append(
                _bulk_error(
                    index,
                    "subject invalid",
                    student_id=item.student_id,
                    subject_id=item.subject_id,
                )
            )
            continue
        if user.role == UserRole.TEACHER and not _teacher_has_assignment(
            db, user.id, student.class_id, subject.id
        ):
            errors.append(
                _bulk_error(
                    index,
                    "no current teacher assignment",
                    status_code=status.HTTP_403_FORBIDDEN,
                    student_id=item.student_id,
                    subject_id=item.subject_id,
                )
            )
            continue
        try:
            _enforce_note_rule(_student_jenjang(db, student), item.description)
        except HTTPException as exc:
            errors.append(
                _bulk_error(
                    index,
                    str(exc.detail),
                    student_id=item.student_id,
                    subject_id=item.subject_id,
                    category=str(category),
                    assessment_no=item.assessment_no,
                )
            )
            continue

        existing = db.scalar(
            select(Grade).where(
                Grade.student_id == item.student_id,
                Grade.subject_id == item.subject_id,
                Grade.category == category,
                Grade.semester == semester,
                Grade.assessment_no == item.assessment_no,
            )
        )
        if existing is not None:
            log_audit_event(
                db,
                actor=user,
                action="update_grade",
                entity_type="grade",
                entity_id=existing.id,
                before={"score": existing.score, "description": existing.description},
                after={"score": item.score, "description": item.description},
            )
            existing.score = item.score
            existing.description = item.description
            existing.recorded_by = user.id
            existing.updated_at = utcnow()
            db.flush()
            saved_grades.append(existing)
            updated += 1
        else:
            school = db.get(School, student.school_id)
            grade = Grade(
                student_id=student.id,
                subject_id=subject.id,
                semester=semester,
                category=category,
                assessment_no=item.assessment_no,
                score=item.score,
                description=item.description,
                kurikulum_version=school.kurikulum_version if school is not None else None,
                recorded_by=user.id,
            )
            try:
                with db.begin_nested():
                    db.add(grade)
                    db.flush()
            except IntegrityError as exc:
                errors.append(
                    _bulk_error(
                        index,
                        f"integrity conflict: {exc.orig}",
                        status_code=status.HTTP_409_CONFLICT,
                        student_id=item.student_id,
                        subject_id=item.subject_id,
                        category=str(category),
                        assessment_no=item.assessment_no,
                    )
                )
                continue
            log_audit_event(
                db,
                actor=user,
                action="create_grade",
                entity_type="grade",
                entity_id=grade.id,
                after={"score": grade.score, "description": grade.description},
            )
            saved_grades.append(grade)
            created += 1
        seen.add(key)

    db.commit()
    for grade in saved_grades:
        db.refresh(grade)
    return GradeBulkResult(
        class_id=payload.class_id,
        subject_id=payload.subject_id,
        semester=payload.semester,
        category=payload.category,
        created=created,
        updated=updated,
        saved=[GradeOut.model_validate(g) for g in saved_grades],
        errors=errors,
    )


@router.post("/bulk", status_code=status.HTTP_201_CREATED, response_model=GradeBulkResult)
def create_grade_bulk(
    payload: GradeBulkCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GradeBulkResult:
    """Upsert grades, returning per-row results.

    Invalid rows are collected into ``errors`` instead of aborting the batch.
    Supports both the class-scoped ``entries`` shape and per-row ``items``.
    """
    if user.role not in (
        UserRole.SUPER_ADMIN,
        UserRole.PRINCIPAL,
        UserRole.ADMIN,
        UserRole.TEACHER,
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    if payload.items:
        return _bulk_by_items(db, user, payload)

    if (
        payload.class_id is None
        or payload.subject_id is None
        or payload.category is None
        or payload.semester is None
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="class_id, subject_id, semester and category are required",
        )

    klass = _class_or_404(db, payload.class_id)
    if not can_manage_class(db, user, klass):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    subject = _subject_or_404(db, payload.subject_id)
    _assert_subject_tenant(subject, user)

    entries = list({entry.student_id: entry for entry in payload.entries}.values())
    written: list[tuple[Grade, dict | None]] = []
    errors: list[BulkGradeRowResult] = []
    for index, entry in enumerate(entries):
        if entry.score is None:
            errors.append(
                _bulk_error(
                    index,
                    "score is required",
                    student_id=entry.student_id,
                    subject_id=subject.id,
                    category=str(payload.category),
                    assessment_no=payload.assessment_no,
                )
            )
            continue
        if entry.score < 0 or entry.score > 100:
            errors.append(
                _bulk_error(
                    index,
                    f"score must be 0-100, got {entry.score}",
                    student_id=entry.student_id,
                    subject_id=subject.id,
                    category=str(payload.category),
                    assessment_no=payload.assessment_no,
                )
            )
            continue
        student = db.get(Student, entry.student_id)
        if student is None:
            errors.append(
                _bulk_error(
                    index,
                    f"student {entry.student_id} not found",
                    student_id=entry.student_id,
                    subject_id=subject.id,
                    category=str(payload.category),
                    assessment_no=payload.assessment_no,
                )
            )
            continue
        if student.class_id != klass.id:
            errors.append(
                _bulk_error(
                    index,
                    f"student {entry.student_id} does not belong to this class",
                    student_id=entry.student_id,
                    subject_id=subject.id,
                    category=str(payload.category),
                    assessment_no=payload.assessment_no,
                )
            )
            continue
        try:
            _enforce_note_rule(_student_jenjang(db, student), entry.description)
        except HTTPException as exc:
            errors.append(
                _bulk_error(
                    index,
                    str(exc.detail),
                    student_id=entry.student_id,
                    subject_id=subject.id,
                    category=str(payload.category),
                    assessment_no=payload.assessment_no,
                )
            )
            continue
        written.append(
            _apply_upsert(
                db,
                user,
                student,
                subject,
                payload.semester,
                payload.category,
                payload.assessment_no,
                entry.score,
                entry.description,
            )
        )

    if not written and errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[error.model_dump() for error in errors],
        )

    db.commit()
    created = 0
    for grade, before in written:
        if before is None:
            created += 1
        _audit_grade(db, user, grade, before)
    return GradeBulkResult(
        class_id=klass.id,
        subject_id=subject.id,
        semester=payload.semester,
        category=payload.category,
        created=created,
        updated=len(written) - created,
        saved=[GradeOut.model_validate(grade) for grade, _ in written],
        errors=errors,
    )


@router.get("", response_model=GradeListResponse)
def list_grades(
    student_id: int | None = Query(None),
    subject_id: int | None = Query(None),
    semester: str | None = Query(None),
    category: str | None = Query(None),
    page: PageParams = Depends(PageParams),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GradeListResponse:
    """List grades inside the caller's scope with optional filters."""
    # scope: school
    allowed_students = visible_student_ids(db, user)
    conditions = []
    if allowed_students is not None:
        conditions.append(Grade.student_id.in_(allowed_students))

    if student_id is not None:
        if allowed_students is not None and student_id not in allowed_students:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
        conditions.append(Grade.student_id == student_id)
    if subject_id is not None:
        conditions.append(Grade.subject_id == subject_id)
    if semester is not None:
        conditions.append(Grade.semester == semester)
    if category is not None:
        conditions.append(Grade.category == category)

    total = db.scalar(select(func.count()).select_from(Grade).where(*conditions)) or 0
    rows = db.scalars(
        select(Grade)
        .where(*conditions)
        .order_by(Grade.student_id, Grade.subject_id, Grade.id)
        .offset(page.offset)
        .limit(page.size)
    ).all()
    return GradeListResponse(
        items=[GradeOut.model_validate(row) for row in rows],
        total=total,
        page=page.page,
        size=page.size,
    )


def _student_aggregate(
    db: Session, user: User, student_id: int, semester: str
) -> dict:
    """Subject × category view for one student plus legacy aggregate keys.

    Categories with no rows are still present so callers can surface
    ``complete=False`` and ``missing=['assessment_1']`` for an empty semester.
    """
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="student not found")
    if not student_visible(db, user, student):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="student not found")

    subjects = _subjects_for_student(db, student)
    grades = list(
        db.scalars(
            select(Grade).where(
                Grade.student_id == student.id,
                Grade.semester == semester,
                Grade.subject_id.in_([s.id for s in subjects]) if subjects else False,
            )
        ).all()
    )
    by_key: dict[tuple[int, str], list[Grade]] = defaultdict(list)
    for grade in grades:
        by_key[(grade.subject_id, str(grade.category))].append(grade)

    out_subjects = []
    per_subject: list[SubjectAggregate] = []
    for subject in subjects:
        categories = {}
        subject_count = 0
        for cat in _CATEGORIES:
            rows = by_key.get((subject.id, cat), [])
            subject_count += len(rows)
            categories[cat] = _grade_category_block(rows, include_ids=True)
        if subject_count:
            subject_total = sum(
                float(g.score) for g in grades if g.subject_id == subject.id
            )
            subject_avg = subject_total / subject_count
            per_subject.append(
                SubjectAggregate(
                    subject_id=subject.id,
                    subject_name=subject.name,
                    average=round(subject_avg, 2),
                    count=subject_count,
                )
            )
        out_subjects.append(
            {
                "subject_id": subject.id,
                "subject_name": subject.name,
                "categories": categories,
                "total_avg": _total_avg(categories),
            }
        )

    total = sum(item.count for item in per_subject)
    overall = (
        round(sum(item.average * item.count for item in per_subject) / total, 2)
        if total
        else None
    )
    return {
        "student_id": student.id,
        "class_id": student.class_id,
        "semester": semester,
        "subjects": out_subjects,
        "total": total,
        "per_subject": [item.model_dump() for item in per_subject],
        "overall_average": overall,
    }


def _class_aggregate(db: Session, user: User, class_id: int, semester: str) -> dict:
    """Per-student, per-subject, per-category aggregation with completeness flags."""
    # scope: school
    allowed_classes = visible_class_ids(db, user)
    if allowed_classes is not None and class_id not in allowed_classes:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    klass = _class_or_404(db, class_id)

    students = list(
        db.scalars(
            select(Student).where(Student.class_id == class_id).order_by(Student.id)
        ).all()
    )
    allowed_students = visible_student_ids(db, user)
    if allowed_students is not None:
        students = [s for s in students if s.id in allowed_students]

    school = db.get(School, klass.school_id)
    tenant_id = school.tenant_id if school is not None else user.tenant_id
    subjects = list(
        db.scalars(
            select(Subject).where(Subject.tenant_id == tenant_id).order_by(Subject.name)
        ).all()
    )

    student_ids = [s.id for s in students]
    subject_ids = [s.id for s in subjects]
    grades: list[Grade] = []
    if student_ids and subject_ids:
        grades = list(
            db.scalars(
                select(Grade).where(
                    Grade.student_id.in_(student_ids),
                    Grade.subject_id.in_(subject_ids),
                    Grade.semester == semester,
                )
            ).all()
        )

    grouped: dict[tuple[int, int, str], list[Grade]] = defaultdict(list)
    for grade in grades:
        grouped[(grade.student_id, grade.subject_id, str(grade.category))].append(grade)

    def _subject_rows(student: Student, subject: Subject) -> dict:
        categories = {}
        for cat in _CATEGORIES:
            rows = grouped.get((student.id, subject.id, cat), [])
            categories[cat] = _grade_category_block(rows)
        return {
            "subject_id": subject.id,
            "subject_name": subject.name,
            "categories": categories,
            "total_avg": _total_avg(categories),
        }

    out_subjects = []
    for subject in subjects:
        out_students = []
        for student in students:
            data = _subject_rows(student, subject)
            name = student.user.full_name if student.user is not None else f"Student {student.id}"
            out_students.append(
                {
                    "student_id": student.id,
                    "student_name": name,
                    "categories": data["categories"],
                    "total_avg": data["total_avg"],
                }
            )
        out_subjects.append(
            {
                "subject_id": subject.id,
                "subject_name": subject.name,
                "students": out_students,
            }
        )

    by_student = []
    for student in students:
        name = student.user.full_name if student.user is not None else f"Student {student.id}"
        by_student.append(
            {
                "student_id": student.id,
                "student_name": name,
                "subjects": [_subject_rows(student, subject) for subject in subjects],
            }
        )

    return {
        "class_id": class_id,
        "semester": semester,
        "subjects": out_subjects,
        "students": by_student,
    }


@router.get("/aggregate", response_model=None)
def aggregate_grades(
    student_id: int | None = Query(None),
    class_id: int | None = Query(None),
    semester: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Aggregate grades.

    With ``student_id`` → per-subject × category with completeness flags, plus
    the legacy flat per-subject keys. With ``class_id`` → per-student,
    per-subject, per-category completeness view (ticket #53/#76).
    """
    # scope: school
    if class_id is None and student_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="student_id or class_id is required",
        )
    if semester is None:
        semester = ACTIVE_SEMESTER
    if class_id is not None:
        return _class_aggregate(db, user, class_id, semester)
    assert student_id is not None
    return _student_aggregate(db, user, student_id, semester)


@router.get("/class-rollup")
def class_rollup(
    class_id: int = Query(...),
    semester: str = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Class-wide rollup for wali kelas: per-student average + rank."""
    # scope: school
    agg = _class_aggregate(db, user, class_id, semester)
    by_student: dict[int, dict] = {}
    for subject in agg["subjects"]:
        for student in subject["students"]:
            entry = by_student.setdefault(
                student["student_id"],
                {
                    "student_id": student["student_id"],
                    "student_name": student["student_name"],
                    "subjects": [],
                },
            )
            entry["subjects"].append(
                {"subject_id": subject["subject_id"], "avg": student["total_avg"]}
            )

    out = []
    for data in by_student.values():
        avgs = [s["avg"] for s in data["subjects"] if s["avg"] is not None]
        data["overall_avg"] = sum(avgs) / len(avgs) if avgs else None
        out.append(data)
    out.sort(key=lambda row: -(row["overall_avg"] or 0))
    for index, row in enumerate(out, start=1):
        row["rank"] = index

    return {"class_id": class_id, "semester": semester, "students": out}


@router.get("/student/{student_id}", response_model=GradeListResponse)
def list_student_grades(
    student_id: int,
    page: PageParams = Depends(PageParams),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GradeListResponse:
    """Paginated grades for one student inside the caller's scope."""
    # scope: school
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="student not found")
    if not student_visible(db, user, student):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    conditions = [Grade.student_id == student.id]
    total = db.scalar(select(func.count()).select_from(Grade).where(*conditions)) or 0
    rows = db.scalars(
        select(Grade)
        .where(*conditions)
        .order_by(Grade.subject_id, Grade.id)
        .offset(page.offset)
        .limit(page.size)
    ).all()
    return GradeListResponse(
        items=[GradeOut.model_validate(row) for row in rows],
        total=total,
        page=page.page,
        size=page.size,
    )


@router.patch("/{grade_id}", response_model=GradeOut)
def update_grade(
    grade_id: int,
    payload: GradeUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GradeOut:
    """Update a grade inside the caller's current assignment scope."""
    grade = db.get(Grade, grade_id)
    if grade is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="grade not found")

    if not _can_edit_grade(db, user, grade):
        if user.role == UserRole.TEACHER:
            _audit_denied_grade_edit(db, user, grade)
            db.commit()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    if "score" in payload.model_fields_set and payload.score is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="score cannot be null; use DELETE to remove the grade",
        )
    if payload.category is not None and payload.category != grade.category:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="category cannot be changed; delete and recreate the grade",
        )

    before = {
        "score": grade.score,
        "description": grade.description,
        "category": str(grade.category),
    }
    if payload.score is not None:
        if payload.score < 0 or payload.score > 100:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"score must be 0-100, got {payload.score}",
            )
        grade.score = payload.score
    if "description" in payload.model_fields_set:
        grade.description = payload.description

    student = db.get(Student, grade.student_id)
    if student is not None:
        _enforce_note_rule(_student_jenjang(db, student), grade.description)

    grade.updated_at = utcnow()
    db.commit()
    db.refresh(grade)
    _audit_grade(db, user, grade, before)
    return GradeOut.model_validate(grade)


@router.delete("/{grade_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_grade(
    grade_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Delete a grade: assigned teacher, admin/principal, or super_admin."""
    grade = db.get(Grade, grade_id)
    if grade is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="grade not found")
    if not _can_edit_grade(db, user, grade):
        if user.role == UserRole.TEACHER:
            _audit_denied_grade_edit(db, user, grade)
            db.commit()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    log_audit_event(
        db,
        actor=user,
        action="delete_grade",
        entity_type="grade",
        entity_id=grade.id,
        before={
            "score": grade.score,
            "category": str(grade.category),
            "subject_id": grade.subject_id,
            "student_id": grade.student_id,
            "semester": grade.semester,
        },
    )
    db.delete(grade)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
