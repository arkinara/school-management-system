"""Parent router: tenant-scoped parent reads and parent-side child linking."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.db.models import School, Student, User, UserRole
from app.db.scoping import log_scope_denial, visible_school_ids
from app.db.session import get_db
from app.linking import (
    add_link,
    build_children_summaries,
    link_exists,
    remove_link,
)
from app.pagination import PageParams
from app.schemas.parent import (
    ChildLinkCreate,
    ChildSummary,
    ParentListResponse,
    ParentOut,
)

router = APIRouter()

_ADMIN_ROLES = {UserRole.ADMIN, UserRole.PRINCIPAL}


def _can_manage_school(user: User, school: School | None) -> bool:
    if school is None:
        return False
    if user.role == UserRole.SUPER_ADMIN:
        return True
    return (
        user.role in _ADMIN_ROLES
        and user.tenant_id == school.tenant_id
        and user.school_id == school.id
    )


def _parent_out(db: Session, parent: User) -> ParentOut:
    return ParentOut(
        id=parent.id,
        tenant_id=parent.tenant_id,
        school_id=parent.school_id,
        full_name=parent.full_name,
        email=parent.email,
        children=build_children_summaries(db, parent.id),
    )


def _get_parent_or_404(db: Session, parent_id: int) -> User:
    parent = db.get(User, parent_id)
    if parent is None or parent.role != UserRole.PARENT:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="parent not found")
    return parent


def _require_same_tenant(user: User, parent: User) -> None:
    if user.role == UserRole.SUPER_ADMIN:
        return
    if parent.tenant_id != user.tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")


def _can_read_parent(user: User, parent: User) -> bool:
    """Read gate for a specific parent: self, super_admin, or same-school admin."""
    if user.role == UserRole.SUPER_ADMIN:
        return parent.tenant_id == user.tenant_id
    if user.id == parent.id:
        return True
    if user.role in _ADMIN_ROLES:
        return parent.tenant_id == user.tenant_id and parent.school_id == user.school_id
    return False


def _require_readable_parent(db: Session, user: User, parent: User) -> None:
    if not _can_read_parent(user, parent):
        log_scope_denial(
            db,
            user,
            resource="parent",
            resource_id=parent.id,
            reason="cross-school/relationship read blocked",
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")


@router.get("", response_model=ParentListResponse)
def list_parents(
    page: PageParams = Depends(PageParams),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ParentListResponse:
    """List parent users in the caller's school (super_admin sees all)."""
    # scope: school
    conditions = [User.role == UserRole.PARENT]
    if user.role != UserRole.SUPER_ADMIN:
        conditions.append(User.tenant_id == user.tenant_id)
        conditions.append(User.school_id.in_(visible_school_ids(db, user)))

    total = db.scalar(select(func.count()).select_from(User).where(*conditions)) or 0
    rows = db.scalars(
        select(User)
        .where(*conditions)
        .order_by(User.id)
        .offset(page.offset)
        .limit(page.size)
    ).all()
    return ParentListResponse(
        items=[_parent_out(db, row) for row in rows],
        total=total,
        page=page.page,
        size=page.size,
    )


@router.get("/{parent_id}", response_model=ParentOut)
def get_parent(
    parent_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ParentOut:
    """Read a parent and their linked children (self, same-school admin, super_admin)."""
    # scope: school
    parent = _get_parent_or_404(db, parent_id)
    _require_readable_parent(db, user, parent)
    return _parent_out(db, parent)


@router.get("/{parent_id}/children", response_model=list[ChildSummary])
def list_parent_children(
    parent_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ChildSummary]:
    """Sibling lookup: all students linked to a parent the caller may read."""
    # scope: school
    parent = _get_parent_or_404(db, parent_id)
    _require_readable_parent(db, user, parent)
    return build_children_summaries(db, parent.id)


@router.post(
    "/{parent_id}/children",
    status_code=status.HTTP_201_CREATED,
    response_model=ChildSummary,
)
def link_parent_child(
    parent_id: int,
    payload: ChildLinkCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChildSummary:
    """Link a student to a parent (parent-side equivalent of the student link)."""
    parent = _get_parent_or_404(db, parent_id)
    _require_same_tenant(user, parent)

    student = db.get(Student, payload.student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="student not found")
    school = db.get(School, student.school_id)
    if not _can_manage_school(user, school):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    if parent.tenant_id != school.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="cannot link a parent from another tenant",
        )
    if link_exists(db, parent.id, student.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="parent already linked"
        )
    add_link(db, parent.id, student.id, payload.relationship, payload.is_primary)
    db.commit()
    return next(
        summary
        for summary in build_children_summaries(db, parent.id)
        if summary.id == student.id
    )


@router.delete(
    "/{parent_id}/children/{student_id}", status_code=status.HTTP_204_NO_CONTENT
)
def unlink_parent_child(
    parent_id: int,
    student_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Unlink a student from a parent without touching the student's other links."""
    parent = _get_parent_or_404(db, parent_id)
    _require_same_tenant(user, parent)
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="student not found")
    school = db.get(School, student.school_id)
    if not _can_manage_school(user, school):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    if not link_exists(db, parent.id, student.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="link not found")
    remove_link(db, parent.id, student.id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
