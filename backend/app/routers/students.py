"""Student router: student CRUD + parent/guardian linking, tenant-scoped."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from passlib.hash import bcrypt
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.db.models import Class, School, Student, User, UserRole, parent_links
from app.db.scoping import (
    can_user_read_student,
    log_scope_denial,
    visible_school_ids,
)
from app.db.session import get_db
from app.linking import (
    add_link,
    build_parent_summaries,
    link_exists,
    remove_link,
)
from app.pagination import PageParams
from app.schemas.parent import ParentLinkCreate, ParentSummary
from app.schemas.student import (
    StudentCreate,
    StudentListResponse,
    StudentOut,
    StudentUpdate,
)

router = APIRouter()

_ADMIN_ROLES = {UserRole.ADMIN, UserRole.PRINCIPAL}


def _can_manage_school(user: User, school: School | None) -> bool:
    """True if ``user`` may administer ``school`` (super_admin always)."""
    if school is None:
        return False
    if user.role == UserRole.SUPER_ADMIN:
        return True
    return (
        user.role in _ADMIN_ROLES
        and user.tenant_id == school.tenant_id
        and user.school_id == school.id
    )


def _student_out(db: Session, student: Student) -> StudentOut:
    """Serialize a student with its user identity and linked parents."""
    out = StudentOut.model_validate(student)
    student_user = db.get(User, student.user_id)
    if student_user is not None:
        out.full_name = student_user.full_name
        out.email = student_user.email
    out.parents = build_parent_summaries(db, student.id)
    return out


def _validate_class(db: Session, school: School, class_id: int | None) -> None:
    if class_id is None:
        return
    klass = db.get(Class, class_id)
    if klass is None or klass.school_id != school.id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="class_id must reference a class in the same school",
        )


def _validate_parent(db: Session, parent_id: int, tenant_id: int, school_id: int) -> User:
    parent = db.get(User, parent_id)
    if parent is None or parent.role != UserRole.PARENT:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="parent must reference a user with role=parent",
        )
    if parent.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="cannot link a parent from another tenant",
        )
    if parent.school_id is not None and parent.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="cannot link a parent from another school",
        )
    return parent


def _can_view_student(db: Session, user: User, student: Student) -> bool:
    return can_user_read_student(db, user, student.id)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=StudentOut)
def create_student(
    payload: StudentCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StudentOut:
    """Create a student (and its user account) plus parent links atomically."""
    school = db.get(School, payload.school_id)
    if school is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="school not found")
    if not _can_manage_school(user, school):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    _validate_class(db, school, payload.class_id)

    duplicate_nis = db.scalar(select(Student).where(Student.nis == payload.nis))
    if duplicate_nis is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="nis already exists"
        )

    if payload.user_id is not None:
        student_user = db.get(User, payload.user_id)
        if student_user is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="user not found"
            )
        if student_user.role != UserRole.STUDENT:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="user must have role=student",
            )
        if student_user.tenant_id != school.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="cannot attach a user from another tenant",
            )
        if db.scalar(select(Student).where(Student.user_id == student_user.id)) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="user already has a student profile",
            )
    else:
        if not payload.full_name or not payload.email or not payload.password:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="full_name, email and password are required when user_id is omitted",
            )
        if db.scalar(select(User).where(User.email == str(payload.email))) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="email already registered"
            )
        student_user = User(
            tenant_id=school.tenant_id,
            school_id=school.id,
            email=str(payload.email),
            hashed_auth_ref=bcrypt.hash(payload.password),
            role=UserRole.STUDENT,
            full_name=payload.full_name,
        )
        db.add(student_user)
        db.flush()

    student = Student(
        user_id=student_user.id,
        school_id=school.id,
        class_id=payload.class_id,
        nis=payload.nis,
        birth_date=payload.birth_date,
        enrollment_status=payload.enrollment_status,
    )
    db.add(student)
    db.flush()

    for parent_id in dict.fromkeys(payload.parent_ids or []):
        _validate_parent(db, parent_id, school.tenant_id, school.id)
        add_link(db, parent_id, student.id, "orang_tua", False)

    db.commit()
    db.refresh(student)
    return _student_out(db, student)


@router.get("", response_model=StudentListResponse)
def list_students(
    class_id: int | None = Query(None),
    school_id: int | None = Query(None),
    include_inactive: bool = Query(False),
    page: PageParams = Depends(PageParams),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StudentListResponse:
    """List students scoped by role: self, linked children, own school, or tenant."""
    # scope: school
    conditions = []
    if user.role == UserRole.SUPER_ADMIN:
        pass
    elif user.role == UserRole.STUDENT:
        conditions.append(Student.user_id == user.id)
    elif user.role == UserRole.PARENT:
        conditions.append(
            Student.id.in_(
                select(parent_links.c.student_id).where(parent_links.c.parent_id == user.id)
            )
        )
        conditions.append(School.tenant_id == user.tenant_id)
    else:
        conditions.append(School.tenant_id == user.tenant_id)
        conditions.append(Student.school_id.in_(visible_school_ids(db, user)))

    if school_id is not None:
        conditions.append(Student.school_id == school_id)
    if class_id is not None:
        conditions.append(Student.class_id == class_id)
    if not include_inactive:
        conditions.append(Student.enrollment_status == "active")

    total = (
        db.scalar(
            select(func.count())
            .select_from(Student)
            .join(School, Student.school_id == School.id)
            .where(*conditions)
        )
        or 0
    )
    rows = db.scalars(
        select(Student)
        .join(School, Student.school_id == School.id)
        .where(*conditions)
        .order_by(Student.id)
        .offset(page.offset)
        .limit(page.size)
    ).all()
    return StudentListResponse(
        items=[_student_out(db, row) for row in rows],
        total=total,
        page=page.page,
        size=page.size,
    )


@router.get("/{student_id}", response_model=StudentOut)
def get_student(
    student_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StudentOut:
    """Read one student: same-school staff, linked parent, self, or super_admin."""
    # scope: school
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="student not found")
    if not _can_view_student(db, user, student):
        log_scope_denial(
            db,
            user,
            resource="student",
            resource_id=student_id,
            reason="relationship/school scope blocked",
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    return _student_out(db, student)


@router.patch("/{student_id}", response_model=StudentOut)
def update_student(
    student_id: int,
    payload: StudentUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StudentOut:
    """Update a student (class transfer, nis, birth_date, enrollment_status)."""
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="student not found")
    school = db.get(School, student.school_id)
    if not _can_manage_school(user, school):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    data = payload.model_dump(exclude_unset=True)
    if "class_id" in data:
        _validate_class(db, school, data["class_id"])
    if "nis" in data and data["nis"] != student.nis:
        duplicate = db.scalar(
            select(Student).where(Student.nis == data["nis"], Student.id != student.id)
        )
        if duplicate is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="nis already exists"
            )
    if "full_name" in data:
        student_user = db.get(User, student.user_id)
        if student_user is not None:
            student_user.full_name = data.pop("full_name")

    for field, value in data.items():
        setattr(student, field, value)
    db.commit()
    db.refresh(student)
    return _student_out(db, student)


@router.delete("/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_student(
    student_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Soft-delete a student (super_admin only) via enrollment_status=inactive."""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="student not found")
    student.enrollment_status = "inactive"
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{student_id}/parents", response_model=list[ParentSummary])
def list_student_parents(
    student_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ParentSummary]:
    """List a student's linked guardians."""
    # scope: school
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="student not found")
    if not _can_view_student(db, user, student):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    return build_parent_summaries(db, student.id)


@router.post(
    "/{student_id}/parents",
    status_code=status.HTTP_201_CREATED,
    response_model=ParentSummary,
)
def link_student_parent(
    student_id: int,
    payload: ParentLinkCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ParentSummary:
    """Link an existing role=parent user to a student."""
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="student not found")
    school = db.get(School, student.school_id)
    if not _can_manage_school(user, school):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    _validate_parent(db, payload.parent_user_id, school.tenant_id, school.id)
    if link_exists(db, payload.parent_user_id, student.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="parent already linked"
        )
    add_link(
        db,
        payload.parent_user_id,
        student.id,
        payload.relationship,
        payload.is_primary,
    )
    db.commit()
    return next(
        summary
        for summary in build_parent_summaries(db, student.id)
        if summary.id == payload.parent_user_id
    )


@router.delete(
    "/{student_id}/parents/{parent_user_id}", status_code=status.HTTP_204_NO_CONTENT
)
def unlink_student_parent(
    student_id: int,
    parent_user_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Unlink one guardian from a student without touching other links."""
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="student not found")
    school = db.get(School, student.school_id)
    if not _can_manage_school(user, school):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    if not link_exists(db, parent_user_id, student.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="link not found")
    remove_link(db, parent_user_id, student.id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
