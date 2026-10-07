"""Teacher management router: teacher–subject–class assignments (ticket #48)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth.audit import log_audit_event
from app.auth.deps import get_current_user
from app.db.models import Class, School, Subject, TeacherAssignment, User, UserRole
from app.db.scoping import scoped_query
from app.db.session import get_db
from app.schemas.teacher import (
    TeacherAssignmentCreate,
    TeacherAssignmentOut,
    TeacherProfileOut,
)

router = APIRouter()

_ADMIN_ROLES = {UserRole.SUPER_ADMIN, UserRole.PRINCIPAL}


@router.get("/teacher-assignments", response_model=list[TeacherAssignmentOut])
def list_assignments(
    teacher_id: int | None = Query(None),
    class_id: int | None = Query(None),
    subject_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TeacherAssignment]:
    """List teacher-subject-class assignments, tenant/school-scoped."""
    # scope: school
    stmt = scoped_query(TeacherAssignment, user, db)
    if teacher_id is not None:
        stmt = stmt.where(TeacherAssignment.teacher_id == teacher_id)
    if class_id is not None:
        stmt = stmt.where(TeacherAssignment.class_id == class_id)
    if subject_id is not None:
        stmt = stmt.where(TeacherAssignment.subject_id == subject_id)
    return list(db.scalars(stmt).all())


@router.post(
    "/teacher-assignments",
    response_model=TeacherAssignmentOut,
    status_code=status.HTTP_201_CREATED,
)
def create_assignment(
    payload: TeacherAssignmentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TeacherAssignment:
    """Create a teacher assignment (super_admin/principal only)."""
    if user.role not in _ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin only")

    teacher = db.get(User, payload.teacher_id)
    if teacher is None or teacher.role != UserRole.TEACHER:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="teacher_id must reference a user with role=teacher",
        )

    klass = db.get(Class, payload.class_id)
    if klass is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="class not found"
        )
    school = db.get(School, klass.school_id)
    if school is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="class has no school"
        )

    subject = db.get(Subject, payload.subject_id)
    if subject is None or subject.tenant_id != school.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="subject must belong to the class's tenant",
        )

    if teacher.school_id != school.id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="teacher must belong to the class's school",
        )

    if user.role != UserRole.SUPER_ADMIN and user.school_id != school.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="cannot assign outside your school",
        )

    assignment = TeacherAssignment(
        teacher_id=teacher.id,
        subject_id=subject.id,
        class_id=klass.id,
        academic_year=payload.academic_year,
    )
    db.add(assignment)
    db.flush()
    log_audit_event(
        db,
        actor=user,
        action="create_teacher_assignment",
        entity_type="teacher_assignment",
        entity_id=assignment.id,
        after={
            "teacher_id": teacher.id,
            "subject_id": subject.id,
            "class_id": klass.id,
            "academic_year": assignment.academic_year,
        },
    )
    db.commit()
    db.refresh(assignment)
    return assignment


@router.get("/teachers/{teacher_id}", response_model=TeacherProfileOut)
def get_teacher(
    teacher_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TeacherProfileOut:
    """Return a teacher's profile plus their (class, subject) assignment pairs."""
    # scope: school
    teacher = db.get(User, teacher_id)
    if teacher is None or teacher.role != UserRole.TEACHER:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="teacher not found")
    if user.role != UserRole.SUPER_ADMIN and user.school_id != teacher.school_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="teacher not found")

    stmt = scoped_query(TeacherAssignment, user, db).where(
        TeacherAssignment.teacher_id == teacher_id
    )
    assignments = list(db.scalars(stmt).all())
    return TeacherProfileOut(
        id=teacher.id,
        full_name=teacher.full_name,
        email=teacher.email,
        school_id=teacher.school_id,
        assignments=[TeacherAssignmentOut.model_validate(a) for a in assignments],
    )
