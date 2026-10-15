"""Yayasan multi-tenant aggregate router (ticket #64).

Read-only roll-ups for the super_admin ("yayasan") dashboard: per-tenant KPIs
across every tenant, and a side-by-side 2–3 school comparison. Every route is
super_admin only; a denied attempt is audited before the 403 is raised.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.audit import log_audit_event
from app.auth.deps import get_current_user
from app.db.models import (
    Attendance,
    AttendanceStatus,
    Class,
    EnrollmentStatus,
    School,
    SppBill,
    Student,
    Tenant,
    User,
    UserRole,
)
from app.db.session import get_db

router = APIRouter()


def _require_super_admin(db: Session, user: User, *, action: str) -> None:
    """Raise 403 (audited) unless the caller is a super_admin."""
    if user.role != UserRole.SUPER_ADMIN:
        log_audit_event(
            db,
            actor=user,
            action=action,
            outcome="denied",
            reason_code="not_super_admin",
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="yayasan overview is super_admin only",
        )


def _jenjang(tenant: Tenant | None) -> str | None:
    """Normalise a tenant's jenjang enum into its string value."""
    if tenant is None:
        return None
    jenjang = tenant.jenjang_type
    return getattr(jenjang, "value", jenjang)


def _active_enrollment(db: Session, school_ids: list[int]) -> int:
    if not school_ids:
        return 0
    return (
        db.scalar(
            select(func.count(Student.id)).where(
                Student.school_id.in_(school_ids),
                Student.enrollment_status == EnrollmentStatus.ACTIVE.value,
            )
        )
        or 0
    )


def _active_enrollment_by_class(db: Session, class_id: int) -> int:
    return (
        db.scalar(
            select(func.count(Student.id)).where(
                Student.class_id == class_id,
                Student.enrollment_status == EnrollmentStatus.ACTIVE.value,
            )
        )
        or 0
    )


def _attendance_counts(db: Session, school_ids: list[int]) -> tuple[int, int]:
    """Return ``(total, present)`` attendance rows for the given schools."""
    if not school_ids:
        return 0, 0
    base = (
        select(func.count(Attendance.id))
        .select_from(Attendance)
        .join(Student, Attendance.student_id == Student.id)
        .where(Student.school_id.in_(school_ids))
    )
    total = db.scalar(base) or 0
    present = db.scalar(base.where(Attendance.status == AttendanceStatus.HADIR)) or 0
    return total, present


def _spp_totals(db: Session, school_ids: list[int]) -> tuple[float, float]:
    """Return ``(billed, collected)`` SPP amounts for the given schools."""
    if not school_ids:
        return 0.0, 0.0
    billed = db.scalar(
        select(func.coalesce(func.sum(SppBill.amount), 0))
        .select_from(SppBill)
        .join(Student, SppBill.student_id == Student.id)
        .where(Student.school_id.in_(school_ids))
    ) or 0
    collected = db.scalar(
        select(func.coalesce(func.sum(SppBill.paid_amount), 0))
        .select_from(SppBill)
        .join(Student, SppBill.student_id == Student.id)
        .where(Student.school_id.in_(school_ids))
    ) or 0
    return float(billed), float(collected)


@router.get("/overview")
def yayasan_overview(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Per-tenant stats + school comparison data. super_admin only."""
    _require_super_admin(db, user, action="yayasan_overview_access_denied")

    tenants = list(
        db.scalars(select(Tenant).order_by(Tenant.jenjang_type, Tenant.name)).all()
    )

    per_tenant: list[dict] = []
    for tenant in tenants:
        schools = list(
            db.scalars(select(School).where(School.tenant_id == tenant.id)).all()
        )
        school_ids = [school.id for school in schools]

        enrollment = _active_enrollment(db, school_ids)

        users_by_role: dict[str, int] = {}
        for role in UserRole:
            users_by_role[role.value] = (
                db.scalar(
                    select(func.count(User.id)).where(
                        User.tenant_id == tenant.id,
                        User.role == role,
                    )
                )
                or 0
            )

        total_attendance, present_attendance = _attendance_counts(db, school_ids)
        attendance_rate = (
            present_attendance / total_attendance * 100 if total_attendance else 0.0
        )

        total_billed, total_collected = _spp_totals(db, school_ids)
        spp_rate = total_collected / total_billed * 100 if total_billed else 0.0

        schools_data = [
            {
                "id": school.id,
                "name": school.name,
                "jenjang": _jenjang(tenant),
                "enrollment": _active_enrollment(db, [school.id]),
            }
            for school in schools
        ]

        per_tenant.append(
            {
                "id": tenant.id,
                "name": tenant.name,
                "jenjang_type": _jenjang(tenant),
                "school_count": len(schools),
                "enrollment": enrollment,
                "users_by_role": users_by_role,
                "attendance_rate": round(attendance_rate, 1),
                "spp_collection_rate": round(spp_rate, 1),
                "schools": schools_data,
            }
        )

    return {
        "tenants": per_tenant,
        "total_tenants": len(tenants),
        "total_schools": sum(tenant["school_count"] for tenant in per_tenant),
        "total_enrollment": sum(tenant["enrollment"] for tenant in per_tenant),
        "total_users_by_role": {
            role.value: sum(
                tenant["users_by_role"].get(role.value, 0) for tenant in per_tenant
            )
            for role in UserRole
        },
    }


@router.get("/compare")
def yayasan_compare(
    school_ids: list[int] = Query(..., description="2-3 school ids to compare"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Side-by-side comparison of 2–3 schools. super_admin only."""
    _require_super_admin(db, user, action="yayasan_compare_access_denied")
    if len(school_ids) < 2 or len(school_ids) > 3:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="compare 2-3 schools",
        )

    schools_data: list[dict] = []
    for school_id in school_ids:
        school = db.get(School, school_id)
        if school is None:
            continue
        classes = list(
            db.scalars(select(Class).where(Class.school_id == school.id)).all()
        )
        tenant = db.get(Tenant, school.tenant_id)
        schools_data.append(
            {
                "id": school.id,
                "name": school.name,
                "jenjang": _jenjang(tenant),
                "enrollment": _active_enrollment(db, [school.id]),
                "classes": [
                    {
                        "id": klass.id,
                        "name": klass.name,
                        "enrollment": _active_enrollment_by_class(db, klass.id),
                    }
                    for klass in classes
                ],
            }
        )

    return {"schools": schools_data}
