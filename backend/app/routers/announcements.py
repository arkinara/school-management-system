"""Announcement router (ticket #26): draft/publish feed scoped by audience."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.audit import log_audit_event
from app.auth.deps import get_current_user
from app.db.models import (
    Announcement,
    AnnouncementAudience,
    AnnouncementRevision,
    Class,
    School,
    Tenant,
    User,
    UserRole,
    utcnow,
)
from app.db.session import get_db
from app.pagination import PageParams
from app.schemas.announcement import (
    AnnouncementCreate,
    AnnouncementListResponse,
    AnnouncementOut,
    AnnouncementRevisionOut,
    AnnouncementUpdate,
    RetractRequest,
)

router = APIRouter()

# principal / TU (admin) / guru may author; super_admin bypasses tenant scope.
_WRITE_ROLES = {
    UserRole.PRINCIPAL,
    UserRole.ADMIN,
    UserRole.TEACHER,
    UserRole.SUPER_ADMIN,
}
_ADMIN_ROLES = {UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.SUPER_ADMIN}
_READ_ONLY_ROLES = {UserRole.PARENT, UserRole.STUDENT, UserRole.TEACHER}
_VIEWER_ROLES = {UserRole.PARENT, UserRole.STUDENT}


def _out(announcement: Announcement) -> AnnouncementOut:
    out = AnnouncementOut.model_validate(announcement)
    out.status = "published" if announcement.published_at is not None else "draft"
    if announcement.audience == AnnouncementAudience.JENJANG:
        out.target_tenant_id = announcement.tenant_id
    return out


def _same_school(user: User, announcement: Announcement) -> bool:
    if user.role == UserRole.SUPER_ADMIN:
        return True
    if user.tenant_id != announcement.tenant_id:
        return False
    if user.school_id is not None and announcement.school_id is not None:
        return user.school_id == announcement.school_id
    return user.school_id is None


def _is_admin_of(user: User, announcement: Announcement) -> bool:
    return user.role in _ADMIN_ROLES and _same_school(user, announcement)


def _resolve_scope(
    db: Session, user: User, payload: AnnouncementCreate | AnnouncementUpdate
) -> tuple[int, int | None]:
    """Validate the requested audience target and return ``(tenant_id, school_id)``."""
    audience = payload.audience or AnnouncementAudience.ALL

    def _review_school(school_id: int | None) -> School | None:
        if school_id is None:
            return None
        school = db.get(School, school_id)
        if school is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="school_id does not exist",
            )
        if user.role != UserRole.SUPER_ADMIN:
            if school.tenant_id != user.tenant_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="cannot target another tenant's school",
                )
            if user.school_id is not None and school.id != user.school_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="cannot target another school",
                )
        return school

    if audience == AnnouncementAudience.CLASS:
        if payload.target_class_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="target_class_id is required when audience=class",
            )
        klass = db.get(Class, payload.target_class_id)
        if klass is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="target_class_id does not exist",
            )
        school = db.get(School, klass.school_id)
        if school is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="class has no school",
            )
        if user.role != UserRole.SUPER_ADMIN:
            if school.tenant_id != user.tenant_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="cannot target another tenant's class",
                )
            if user.school_id is not None and school.id != user.school_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="cannot target another school's class",
                )
        return school.tenant_id, school.id

    if audience == AnnouncementAudience.JENJANG:
        if payload.target_tenant_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="target_tenant_id is required when audience=jenjang",
            )
        if user.role != UserRole.SUPER_ADMIN and payload.target_tenant_id != user.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="cannot target another tenant",
            )
        if db.get(Tenant, payload.target_tenant_id) is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="target_tenant_id does not exist",
            )
        targeted_school_id = (
            payload.school_id if payload.school_id is not None else user.school_id
        )
        school = _review_school(targeted_school_id)
        return payload.target_tenant_id, (school.id if school is not None else None)

    school = _review_school(payload.school_id if payload.school_id is not None else user.school_id)
    return user.tenant_id, (school.id if school is not None else None)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=AnnouncementOut)
def create_announcement(
    payload: AnnouncementCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnnouncementOut:
    """Create an announcement (principal/TU/guru/super_admin only).

    ``publish=True`` publishes immediately and is reserved for admin roles;
    teachers create drafts (``publish=True`` is rejected with 403).
    """
    if user.role not in _WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    publish = bool(payload.publish)
    if publish and user.role not in _ADMIN_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="only admin can publish immediately; use draft + request publish",
        )

    tenant_id, school_id = _resolve_scope(db, user, payload)
    target_class_id = (
        payload.target_class_id
        if payload.audience == AnnouncementAudience.CLASS
        else None
    )
    announcement = Announcement(
        tenant_id=tenant_id,
        school_id=school_id,
        author_id=user.id,
        audience=payload.audience,
        title=payload.title,
        body=payload.body,
        published_at=utcnow() if publish else None,
        target_class_id=target_class_id,
    )
    db.add(announcement)
    db.flush()

    db.add(
        AnnouncementRevision(
            announcement_id=announcement.id,
            version=1,
            title=announcement.title,
            body=announcement.body,
            edited_by=user.id,
            change_note="initial",
        )
    )
    db.commit()
    db.refresh(announcement)

    log_audit_event(
        db,
        user=user,
        action="create_announcement",
        entity_type="announcement",
        entity_id=announcement.id,
        tenant_id=tenant_id,
        school_id=school_id,
        detail=f"publish={publish}; target_class_id={target_class_id}",
    )
    return _out(announcement)


@router.get("", response_model=AnnouncementListResponse)
def list_announcements(
    school_id: int | None = Query(None),
    audience: AnnouncementAudience | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    class_id: int | None = Query(None),
    target_class_id: int | None = Query(None),
    include_drafts: bool = Query(False),
    include_retracted: bool = Query(False),
    page: PageParams = Depends(PageParams),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnnouncementListResponse:
    """List announcements visible to the caller's tenant/school/role."""
    # scope: school
    conditions = []
    if user.role == UserRole.SUPER_ADMIN:
        pass
    else:
        conditions.append(Announcement.tenant_id == user.tenant_id)
        if user.school_id is not None:
            conditions.append(
                or_(
                    Announcement.school_id == user.school_id,
                    Announcement.school_id.is_(None),
                )
            )

    # Parents/students only ever see published, unretracted announcements.
    if user.role in _VIEWER_ROLES:
        conditions.append(Announcement.published_at.isnot(None))
        conditions.append(Announcement.retracted_at.is_(None))
    else:
        if not include_drafts:
            conditions.append(Announcement.published_at.isnot(None))
        elif user.role not in _ADMIN_ROLES:
            conditions.append(
                or_(
                    Announcement.published_at.isnot(None),
                    Announcement.author_id == user.id,
                )
            )
        if not include_retracted:
            conditions.append(
                or_(
                    Announcement.retracted_at.is_(None),
                    Announcement.author_id == user.id,
                )
            )

    if school_id is not None:
        conditions.append(Announcement.school_id == school_id)
    if audience is not None:
        conditions.append(Announcement.audience == audience)
    if status_filter is not None:
        if status_filter == "published":
            conditions.append(Announcement.published_at.isnot(None))
        elif status_filter == "draft":
            conditions.append(Announcement.published_at.is_(None))
    if class_id is not None:
        klass = db.get(Class, class_id)
        if klass is not None:
            conditions.append(Announcement.audience == AnnouncementAudience.CLASS)
            conditions.append(Announcement.school_id == klass.school_id)
    if target_class_id is not None:
        conditions.append(
            or_(
                Announcement.target_class_id == target_class_id,
                Announcement.target_class_id.is_(None),
            )
        )

    total = db.scalar(select(func.count()).select_from(Announcement).where(*conditions)) or 0
    rows = db.scalars(
        select(Announcement)
        .where(*conditions)
        .order_by(Announcement.id.desc())
        .offset(page.offset)
        .limit(page.size)
    ).all()
    return AnnouncementListResponse(
        items=[_out(row) for row in rows],
        total=total,
        page=page.page,
        size=page.size,
    )


@router.get("/{announcement_id}", response_model=AnnouncementOut)
def get_announcement(
    announcement_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnnouncementOut:
    """Read one announcement; drafts are author/admin only."""
    # scope: school
    announcement = db.get(Announcement, announcement_id)
    if announcement is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="announcement not found"
        )
    if user.role != UserRole.SUPER_ADMIN and not _same_school(user, announcement):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    if announcement.published_at is None:
        if user.role in _READ_ONLY_ROLES and announcement.author_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    return _out(announcement)


@router.patch("/{announcement_id}", response_model=AnnouncementOut)
def update_announcement(
    announcement_id: int,
    payload: AnnouncementUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnnouncementOut:
    """Edit an announcement (author or same-school admin)."""
    announcement = db.get(Announcement, announcement_id)
    if announcement is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="announcement not found"
        )
    if user.role != UserRole.SUPER_ADMIN and not _is_admin_of(user, announcement):
        if announcement.author_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    data = payload.model_dump(exclude_unset=True)
    if any(k in data for k in ("audience", "target_class_id", "target_tenant_id", "school_id")):
        merged = AnnouncementCreate(
            title=data.get("title", announcement.title),
            body=data.get("body", announcement.body),
            audience=data.get("audience", announcement.audience),
            school_id=data.get("school_id", announcement.school_id),
            target_class_id=data.get("target_class_id"),
            target_tenant_id=data.get("target_tenant_id"),
        )
        tenant_id, school_id = _resolve_scope(db, user, merged)
        announcement.tenant_id = tenant_id
        announcement.school_id = school_id
        if announcement.audience == AnnouncementAudience.CLASS:
            announcement.target_class_id = merged.target_class_id
        else:
            announcement.target_class_id = None

    for field in ("title", "body", "audience"):
        if field in data and data[field] is not None:
            setattr(announcement, field, data[field])

    latest = db.scalar(
        select(AnnouncementRevision)
        .where(AnnouncementRevision.announcement_id == announcement.id)
        .order_by(AnnouncementRevision.version.desc())
    )
    next_version = (latest.version + 1) if latest is not None else 2
    db.add(
        AnnouncementRevision(
            announcement_id=announcement.id,
            version=next_version,
            title=announcement.title,
            body=announcement.body,
            edited_by=user.id,
            change_note=payload.change_note,
        )
    )
    db.commit()
    db.refresh(announcement)
    log_audit_event(
        db,
        user=user,
        action="update_announcement",
        entity_type="announcement",
        entity_id=announcement.id,
        detail=f"version={next_version}",
    )
    return _out(announcement)


@router.post("/{announcement_id}/publish", response_model=AnnouncementOut)
def publish_announcement(
    announcement_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnnouncementOut:
    """Publish a draft (same-school admin only)."""
    announcement = db.get(Announcement, announcement_id)
    if announcement is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="announcement not found"
        )
    if announcement.retracted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="announcement has been retracted",
        )
    if not _is_admin_of(user, announcement):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    announcement.published_at = utcnow()
    db.commit()
    db.refresh(announcement)
    log_audit_event(
        db,
        user=user,
        action="publish_announcement",
        entity_type="announcement",
        entity_id=announcement.id,
    )
    return _out(announcement)


@router.post("/{announcement_id}/retract", response_model=AnnouncementOut)
def retract_announcement(
    announcement_id: int,
    payload: RetractRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnnouncementOut:
    """Soft-retract an announcement (author or same-school admin).

    Retraction never deletes: ``retracted_at`` hides the announcement from
    non-author viewers, who can still see it via ``include_retracted``.
    """
    announcement = db.get(Announcement, announcement_id)
    if announcement is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="announcement not found"
        )
    if announcement.author_id != user.id and not _is_admin_of(user, announcement):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    announcement.retracted_at = utcnow()
    announcement.retracted_by = user.id
    announcement.retract_reason = payload.reason
    db.commit()
    db.refresh(announcement)
    log_audit_event(
        db,
        user=user,
        action="retract_announcement",
        entity_type="announcement",
        entity_id=announcement.id,
        detail=f"reason={payload.reason}",
    )
    return _out(announcement)


@router.get(
    "/{announcement_id}/history", response_model=list[AnnouncementRevisionOut]
)
def get_announcement_history(
    announcement_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AnnouncementRevision]:
    """Return the full edit history, oldest first (author/admin/published)."""
    # scope: author/admin, else same-school published announcement
    announcement = db.get(Announcement, announcement_id)
    if announcement is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="announcement not found"
        )
    is_privileged = announcement.author_id == user.id or _is_admin_of(user, announcement)
    if not is_privileged:
        if announcement.published_at is None or announcement.retracted_at is not None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
        if not _same_school(user, announcement):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    return list(
        db.scalars(
            select(AnnouncementRevision)
            .where(AnnouncementRevision.announcement_id == announcement.id)
            .order_by(AnnouncementRevision.version)
        ).all()
    )


@router.post("/{announcement_id}/unpublish", response_model=AnnouncementOut)
def unpublish_announcement(
    announcement_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnnouncementOut:
    """Retract a published announcement (admin/super_admin only)."""
    announcement = db.get(Announcement, announcement_id)
    if announcement is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="announcement not found"
        )
    if not _is_admin_of(user, announcement):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    announcement.published_at = None
    db.commit()
    db.refresh(announcement)
    log_audit_event(
        db,
        user=user,
        action="unpublish_announcement",
        entity_type="announcement",
        entity_id=announcement.id,
    )
    return _out(announcement)


@router.delete("/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_announcement(
    announcement_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Delete an announcement (admin/super_admin only)."""
    announcement = db.get(Announcement, announcement_id)
    if announcement is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="announcement not found"
        )
    if not _is_admin_of(user, announcement):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    entity_id = announcement.id
    db.delete(announcement)
    db.commit()
    log_audit_event(
        db,
        user=user,
        action="delete_announcement",
        entity_type="announcement",
        entity_id=entity_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
