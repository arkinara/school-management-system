"""Grade router (ticket #16): entry, bulk entry, scoped reads, aggregation."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.db.models import Class, Grade, School, Student, Subject, User, UserRole
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
    visible_student_ids,
)

router = APIRouter()

_STAFF_ADMIN_ROLES = {UserRole.ADMIN, UserRole.PRINCIPAL}


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


def _assert_subject_in_tenant(db: Session, subject: Subject, klass: Class, user: User) -> None:
    if is_super_admin(user):
        return
    school = db.get(School, klass.school_id)
    if school is None or subject.tenant_id != school.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="subject does not belong to this tenant",
        )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=GradeOut)
def create_grade(
    payload: GradeCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GradeOut:
    """Record one score; teachers may only write students in their classes."""
    student = db.get(Student, payload.student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="student not found")
    if not can_write_student(db, user, student):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    subject = _subject_or_404(db, payload.subject_id)
    if student.class_id is not None:
        _assert_subject_in_tenant(db, subject, _class_or_404(db, student.class_id), user)

    grade = Grade(
        student_id=student.id,
        subject_id=subject.id,
        semester=payload.semester,
        category=payload.category,
        score=payload.score,
        description=payload.description,
        recorded_by=user.id,
    )
    db.add(grade)
    db.commit()
    db.refresh(grade)
    return GradeOut.model_validate(grade)


@router.post("/bulk", status_code=status.HTTP_201_CREATED, response_model=GradeBulkResult)
def create_grade_bulk(
    payload: GradeBulkCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GradeBulkResult:
    """Create every entry for a class/subject/category in one transaction."""
    klass = _class_or_404(db, payload.class_id)
    if not can_manage_class(db, user, klass):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    subject = _subject_or_404(db, payload.subject_id)
    _assert_subject_in_tenant(db, subject, klass, user)

    entries = list({entry.student_id: entry for entry in payload.entries}.values())
    grades: list[Grade] = []
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
        grades.append(
            Grade(
                student_id=student.id,
                subject_id=subject.id,
                semester=payload.semester,
                category=payload.category,
                score=entry.score,
                description=entry.description,
                recorded_by=user.id,
            )
        )

    db.add_all(grades)
    db.commit()
    return GradeBulkResult(
        class_id=klass.id,
        subject_id=subject.id,
        semester=payload.semester,
        category=payload.category,
        created=len(grades),
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


@router.get("/aggregate", response_model=GradeAggregate)
def aggregate_grades(
    student_id: int = Query(...),
    semester: str = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GradeAggregate:
    """Per-subject averages plus an overall average for a student/semester."""
    # scope: school
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
    for field, value in data.items():
        setattr(grade, field, value)
    db.commit()
    db.refresh(grade)
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
