"""Grade router (ticket #16): entry, bulk entry, scoped reads, aggregation.

Ticket #53 adds an upsert-on-natural-key write path, a jenjang-aware note rule
(TK/SD require a description), audit rows for every mutation, and class-scoped
aggregation/rollup views for wali kelas.
"""

from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.audit import log_audit_event
from app.auth.deps import get_current_user
from app.db.models import (
    Class,
    Grade,
    GradeCategory,
    School,
    Student,
    Subject,
    Tenant,
    User,
    UserRole,
    utcnow,
)
from app.db.session import get_db
from app.pagination import PageParams
from app.schemas.grade import (
    GradeAggregate,
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


@router.post("/bulk", status_code=status.HTTP_201_CREATED, response_model=GradeBulkResult)
def create_grade_bulk(
    payload: GradeBulkCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GradeBulkResult:
    """Upsert every entry for a class/subject/category in one transaction."""
    klass = _class_or_404(db, payload.class_id)
    if not can_manage_class(db, user, klass):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    subject = _subject_or_404(db, payload.subject_id)
    _assert_subject_tenant(subject, user)

    entries = list({entry.student_id: entry for entry in payload.entries}.values())
    written: list[tuple[Grade, dict | None]] = []
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
        _enforce_note_rule(_student_jenjang(db, student), entry.description)
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
) -> GradeAggregate:
    """Per-subject and overall averages for one student/semester."""
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="student not found")
    if not student_visible(db, user, student):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    rows = db.execute(
        select(
            Grade.subject_id,
            Subject.name,
            func.avg(Grade.score),
            func.count(Grade.id),
        )
        .join(Subject, Subject.id == Grade.subject_id)
        .where(Grade.student_id == student.id, Grade.semester == semester)
        .group_by(Grade.subject_id, Subject.name)
        .order_by(Grade.subject_id)
    ).all()

    per_subject = [
        SubjectAggregate(
            subject_id=row[0],
            subject_name=row[1],
            average=round(float(row[2]), 2),
            count=int(row[3]),
        )
        for row in rows
    ]
    total = sum(item.count for item in per_subject)
    overall = (
        round(sum(item.average * item.count for item in per_subject) / total, 2)
        if total
        else None
    )
    return GradeAggregate(
        student_id=student.id,
        semester=semester,
        total=total,
        per_subject=per_subject,
        overall_average=overall,
    )


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

    grouped: dict[tuple[int, int, str], list[float]] = defaultdict(list)
    for grade in grades:
        grouped[(grade.student_id, grade.subject_id, str(grade.category))].append(
            grade.score
        )

    out_subjects = []
    for subject in subjects:
        out_students = []
        for student in students:
            categories = {}
            for cat in _CATEGORIES:
                scores = grouped.get((student.id, subject.id, cat), [])
                categories[cat] = {
                    "scores": scores,
                    "avg": sum(scores) / len(scores) if scores else None,
                    "complete": bool(scores),
                    "missing": [] if scores else ["assessment_1"],
                }
            avgs = [v["avg"] for v in categories.values() if v["avg"] is not None]
            total_avg = sum(avgs) / len(avgs) if avgs else None
            name = student.user.full_name if student.user is not None else f"Student {student.id}"
            out_students.append(
                {
                    "student_id": student.id,
                    "student_name": name,
                    "categories": categories,
                    "total_avg": total_avg,
                }
            )
        out_subjects.append(
            {
                "subject_id": subject.id,
                "subject_name": subject.name,
                "students": out_students,
            }
        )

    return {"class_id": class_id, "semester": semester, "subjects": out_subjects}


@router.get("/aggregate", response_model=None)
def aggregate_grades(
    student_id: int | None = Query(None),
    class_id: int | None = Query(None),
    semester: str = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Aggregate grades.

    With ``student_id`` → per-subject averages (legacy shape). With ``class_id``
    → per-student, per-subject, per-category completeness view (ticket #53).
    """
    # scope: school
    if class_id is not None:
        return _class_aggregate(db, user, class_id, semester)
    if student_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="student_id or class_id is required",
        )
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
    """Update a grade; teachers may only edit records they created."""
    grade = db.get(Grade, grade_id)
    if grade is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="grade not found")

    permitted = is_super_admin(user) or (
        user.role == UserRole.TEACHER and grade.recorded_by == user.id
    )
    if not permitted and user.role in _STAFF_ADMIN_ROLES:
        student = db.get(Student, grade.student_id)
        school = db.get(School, student.school_id) if student is not None else None
        permitted = school is not None and school.tenant_id == user.tenant_id
    if not permitted:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    data = payload.model_dump(exclude_unset=True)
    before = {
        "score": grade.score,
        "description": grade.description,
        "category": str(grade.category),
    }
    for field, value in data.items():
        setattr(grade, field, value)

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
    """Delete a grade (admin/super_admin only)."""
    grade = db.get(Grade, grade_id)
    if grade is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="grade not found")
    if user.role != UserRole.SUPER_ADMIN:
        if user.role != UserRole.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
        student = db.get(Student, grade.student_id)
        school = db.get(School, student.school_id) if student is not None else None
        if school is None or school.tenant_id != user.tenant_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    db.delete(grade)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
