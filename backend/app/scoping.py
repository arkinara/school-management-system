"""Shared tenant/school/role scoping for the academic-records domains.

Attendance (#14), grades (#16) and report cards (#18) all resolve visibility and
write permission from the same relationships (parent links, class rosters,
schedule assignments). Centralising the rules here keeps the tenant boundary a
single, auditable gate rather than three divergent copies.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import (
    Class,
    Schedule,
    School,
    Student,
    User,
    UserRole,
    parent_links,
)

_STAFF_ADMIN_ROLES = {UserRole.ADMIN, UserRole.PRINCIPAL}


def is_super_admin(user: User) -> bool:
    """True when ``user`` bypasses every tenant/school boundary."""
    return user.role == UserRole.SUPER_ADMIN


def teacher_class_ids(db: Session, user: User) -> set[int]:
    """Classes a teacher is responsible for (homeroom and/or timetabled)."""
    wali = set(db.scalars(select(Class.id).where(Class.wali_kelas_id == user.id)).all())
    scheduled = set(
        db.scalars(select(Schedule.class_id).where(Schedule.teacher_id == user.id)).all()
    )
    return wali | scheduled


def can_manage_class(db: Session, user: User, klass: Class) -> bool:
    """True when ``user`` may record/modify academic records for ``klass``."""
    if is_super_admin(user):
        return True
    school = db.get(School, klass.school_id)
    if school is None or school.tenant_id != user.tenant_id:
        return False
    if user.role == UserRole.TEACHER:
        return klass.id in teacher_class_ids(db, user)
    return user.role in _STAFF_ADMIN_ROLES


def can_write_student(db: Session, user: User, student: Student) -> bool:
    """True when ``user`` may create/modify records for ``student``."""
    if is_super_admin(user):
        return True
    school = db.get(School, student.school_id)
    if school is None or school.tenant_id != user.tenant_id:
        return False
    if user.role == UserRole.TEACHER:
        return student.class_id is not None and student.class_id in teacher_class_ids(db, user)
    return user.role in _STAFF_ADMIN_ROLES


def visible_student_ids(db: Session, user: User) -> set[int] | None:
    """Student ids ``user`` may read; ``None`` means unrestricted (super_admin)."""
    if is_super_admin(user):
        return None
    if user.role == UserRole.PARENT:
        return set(
            db.scalars(
                select(parent_links.c.student_id).where(parent_links.c.parent_id == user.id)
            ).all()
        )
    if user.role == UserRole.STUDENT:
        own = db.scalar(select(Student.id).where(Student.user_id == user.id))
        return {own} if own is not None else set()
    if user.role == UserRole.TEACHER:
        class_ids = teacher_class_ids(db, user)
        if not class_ids:
            return set()
        return set(
            db.scalars(select(Student.id).where(Student.class_id.in_(class_ids))).all()
        )
    stmt = (
        select(Student.id)
        .join(School, Student.school_id == School.id)
        .where(School.tenant_id == user.tenant_id)
    )
    if user.school_id is not None:
        stmt = stmt.where(Student.school_id == user.school_id)
    return set(db.scalars(stmt).all())


def visible_class_ids(db: Session, user: User) -> set[int] | None:
    """Class ids ``user`` may read; ``None`` means unrestricted (super_admin)."""
    if is_super_admin(user):
        return None
    if user.role == UserRole.PARENT:
        ids = visible_student_ids(db, user)
        if not ids:
            return set()
        return set(
            db.scalars(
                select(Student.class_id).where(
                    Student.id.in_(ids), Student.class_id.isnot(None)
                )
            ).all()
        )
    if user.role == UserRole.STUDENT:
        own = db.scalar(select(Student).where(Student.user_id == user.id))
        return {own.class_id} if own is not None and own.class_id else set()
    if user.role == UserRole.TEACHER:
        return teacher_class_ids(db, user)
    stmt = (
        select(Class.id)
        .join(School, Class.school_id == School.id)
        .where(School.tenant_id == user.tenant_id)
    )
    if user.school_id is not None:
        stmt = stmt.where(Class.school_id == user.school_id)
    return set(db.scalars(stmt).all())


def student_visible(db: Session, user: User, student: Student) -> bool:
    """True when ``student`` falls inside ``user``'s readable scope."""
    ids = visible_student_ids(db, user)
    return ids is None or student.id in ids
