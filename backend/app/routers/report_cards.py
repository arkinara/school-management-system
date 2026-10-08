"""Report card router (ticket #18): compile, scoped read, publish workflow."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.academic import parse_semester
from app.audit import log_audit_event
from app.auth.audit import log_audit_event as log_workflow_audit
from app.auth.deps import get_current_user
from app.db.models import (
    Attendance,
    AttendanceStatus,
    Class,
    Grade,
    GradeCategory,
    JenjangType,
    ReportCard,
    ReportCardStatus,
    School,
    Student,
    Subject,
    Tenant,
    User,
    UserRole,
    utcnow,
)
from app.db.scoping import can_user_read_student
from app.db.session import get_db
from app.pagination import PageParams
from app.schemas.report_card import (
    FinalizePayload,
    ReportCardCompile,
    ReportCardCorrect,
    ReportCardGap,
    ReportCardListResponse,
    ReportCardOut,
)
from app.scoping import (
    can_write_student,
    student_visible,
    visible_student_ids,
)

router = APIRouter()

_READ_ONLY_VIEWERS = {UserRole.PARENT, UserRole.STUDENT}
_ALL_STATUSES = [s.value for s in AttendanceStatus]


def _default_fase(grade_level: int | None) -> str:
    """Fallback Kurikulum Merdeka fase when the tenant config omits one."""
    if grade_level is None:
        return "A"
    if grade_level <= 2:
        return "A"
    if grade_level <= 4:
        return "B"
    if grade_level <= 6:
        return "C"
    if grade_level <= 9:
        return "D"
    return "E"


def _semester_date_range(semester: str) -> tuple[date, date]:
    """Return the inclusive (start, end) calendar dates a semester covers.

    Ganji runs July–December of the first year; genap January–June of the
    second. This is the same range the attendance recap (#50) reports on, so a
    rapor's ``kehadiran`` matches the recap exactly.
    """
    year, term = parse_semester(semester)
    if term == "genap":
        return date(year + 1, 1, 1), date(year + 1, 6, 30)
    return date(year, 7, 1), date(year, 12, 31)


def _attendance_counts(db: Session, student_id: int, semester: str) -> dict[str, int]:
    """Count a student's attendance per status across the semester's date range."""
    start, end = _semester_date_range(semester)
    rows = db.scalars(
        select(Attendance).where(
            Attendance.student_id == student_id,
            Attendance.date >= start,
            Attendance.date <= end,
        )
    ).all()
    counts = {name: 0 for name in _ALL_STATUSES}
    for row in rows:
        counts[str(row.status)] = counts.get(str(row.status), 0) + 1
    return counts


def _detect_gaps(db: Session, student: Student, semester: str) -> list[dict]:
    """List (student, subject, category) grade combinations that are missing.

    Mirrors the grade-aggregation completeness rule (#53): every subject offered
    by the student's tenant should have at least one score in each category.
    """
    school = db.get(School, student.school_id)
    tenant_id = school.tenant_id if school is not None else None
    if tenant_id is None:
        return []
    subjects = list(
        db.scalars(
            select(Subject).where(Subject.tenant_id == tenant_id).order_by(Subject.id)
        ).all()
    )
    if not subjects:
        return []

    recorded = {
        (row[0], str(row[1]))
        for row in db.execute(
            select(Grade.subject_id, Grade.category).where(
                Grade.student_id == student.id,
                Grade.semester == semester,
            )
        ).all()
    }
    gaps: list[dict] = []
    for subject in subjects:
        for category in GradeCategory:
            if (subject.id, category.value) not in recorded:
                gaps.append(
                    {
                        "student_id": student.id,
                        "subject_id": subject.id,
                        "subject": subject.name,
                        "category": category.value,
                    }
                )
    return gaps


def _grade_rollups(
    db: Session, student_id: int, semester: str
) -> list[tuple[Subject, list[Grade]]]:
    """Group a student's semester grades by subject, ordered by subject id."""
    rows = db.execute(
        select(Grade)
        .join(Subject, Subject.id == Grade.subject_id)
        .where(Grade.student_id == student_id, Grade.semester == semester)
        .order_by(Grade.subject_id, Grade.id)
    ).scalars().all()
    grouped: dict[int, list[Grade]] = {}
    subjects: dict[int, Subject] = {}
    for grade in rows:
        grouped.setdefault(grade.subject_id, []).append(grade)
        subjects[grade.subject_id] = db.get(Subject, grade.subject_id)
    return [(subjects[sid], grouped[sid]) for sid in sorted(grouped)]


def _narrative(grades: list[Grade]) -> str:
    notes = [grade.description for grade in grades if grade.description]
    if notes:
        return "; ".join(notes)
    return "Belum ada catatan deskriptif."


def _build_compiled(
    db: Session, student: Student, semester: str, tenant: Tenant
) -> dict:
    """Build the fase-appropriate compiled payload for a student/semester."""
    config = tenant.config or {}
    fase = config.get("fase")
    if not fase:
        klass = student.klass
        fase = _default_fase(klass.grade_level if klass is not None else None)

    rollups = _grade_rollups(db, student.id, semester)
    if tenant.jenjang_type == JenjangType.TK:
        key = "tumbuh_kembang"
        entries = [
            {"aspek": subject.name, "deskripsi": _narrative(grades)}
            for subject, grades in rollups
        ]
    elif tenant.jenjang_type == JenjangType.SD:
        key = "capaian_pembelajaran"
        entries = [
            {"aspek": subject.name, "deskripsi": _narrative(grades)}
            for subject, grades in rollups
        ]
    else:
        key = "nilai"
        entries = []
        for subject, grades in rollups:
            average = sum(g.score for g in grades) / len(grades)
            entries.append(
                {
                    "subject_id": subject.id,
                    "subject": subject.name,
                    "score": round(average, 2),
                    "deskripsi": _narrative(grades),
                }
            )

    school = db.get(School, student.school_id)
    kurikulum_version = (
        school.kurikulum_version
        if school is not None and school.kurikulum_version
        else tenant.kurikulum_version
    )

    return {
        "student_id": student.id,
        "semester": semester,
        "jenjang": tenant.jenjang_type.value,
        "fase": fase,
        "kurikulum_version": kurikulum_version,
        key: entries,
        "kehadiran": _attendance_counts(db, student.id, semester),
    }


@router.post(
    "/compile", status_code=status.HTTP_201_CREATED, response_model=ReportCardOut
)
def compile_report_card(
    payload: ReportCardCompile,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReportCardOut:
    """Compile (or recompile) a draft rapor from attendance + grade records."""
    student = db.get(Student, payload.student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="student not found")
    if not can_write_student(db, user, student):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    school = db.get(School, student.school_id)
    tenant = db.get(Tenant, school.tenant_id) if school is not None else None
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="tenant not found")

    existing = db.scalar(
        select(ReportCard)
        .where(
            ReportCard.student_id == student.id,
            ReportCard.semester == payload.semester,
            ReportCard.status != ReportCardStatus.SUPERSEDED,
        )
        .order_by(ReportCard.version.desc())
    )
    if existing is not None and existing.status == ReportCardStatus.PUBLISHED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="report card already published; use the correction flow to create a new version",
        )

    compiled = _build_compiled(db, student, payload.semester, tenant)
    report_card = existing or ReportCard(student_id=student.id, semester=payload.semester)
    report_card.status = ReportCardStatus.DRAFT
    report_card.kurikulum_version = compiled["kurikulum_version"]
    report_card.compiled_data = compiled
    report_card.published_at = None
    if existing is None:
        db.add(report_card)
    db.commit()
    db.refresh(report_card)

    out = ReportCardOut.model_validate(report_card)
    out.gaps = [ReportCardGap(**gap) for gap in _detect_gaps(db, student, payload.semester)]
    return out


@router.get("", response_model=ReportCardListResponse)
def list_report_cards(
    student_id: int | None = Query(None),
    semester: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    page: PageParams = Depends(PageParams),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReportCardListResponse:
    """List rapors in scope; parents/students only ever see published ones."""
    # scope: school
    allowed_students = visible_student_ids(db, user)
    conditions = []
    if allowed_students is not None:
        conditions.append(ReportCard.student_id.in_(allowed_students))

    if student_id is not None:
        if allowed_students is not None and student_id not in allowed_students:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
        conditions.append(ReportCard.student_id == student_id)
    if semester is not None:
        conditions.append(ReportCard.semester == semester)
    if user.role in _READ_ONLY_VIEWERS:
        conditions.append(ReportCard.status == ReportCardStatus.PUBLISHED)
    elif status_filter is not None:
        conditions.append(ReportCard.status == status_filter)

    total = (
        db.scalar(select(func.count()).select_from(ReportCard).where(*conditions)) or 0
    )
    rows = db.scalars(
        select(ReportCard)
        .where(*conditions)
        .order_by(ReportCard.id)
        .offset(page.offset)
        .limit(page.size)
    ).all()
    return ReportCardListResponse(
        items=[ReportCardOut.model_validate(row) for row in rows],
        total=total,
        page=page.page,
        size=page.size,
    )


@router.get("/{report_card_id}", response_model=ReportCardOut)
def get_report_card(
    report_card_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReportCardOut:
    """Read one rapor; drafts are invisible to parents/students."""
    # scope: school
    report_card = db.get(ReportCard, report_card_id)
    if report_card is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="report card not found")
    student = db.get(Student, report_card.student_id)
    if student is None or not student_visible(db, user, student):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    if (
        user.role in _READ_ONLY_VIEWERS
        and report_card.status != ReportCardStatus.PUBLISHED
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    return ReportCardOut.model_validate(report_card)


@router.post("/{report_card_id}/finalize", response_model=ReportCardOut)
def finalize_report_card(
    report_card_id: int,
    payload: FinalizePayload | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReportCardOut:
    """Wali kelas signs off a draft rapor, overriding detected gaps with a reason."""
    report_card = db.get(ReportCard, report_card_id)
    if report_card is None or not can_user_read_student(db, user, report_card.student_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="report card not found")

    student = db.get(Student, report_card.student_id)
    klass = db.get(Class, student.class_id) if student is not None else None
    if user.role != UserRole.SUPER_ADMIN:
        if klass is None or klass.wali_kelas_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="only wali kelas can finalize"
            )

    if report_card.status != ReportCardStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"cannot finalize from status {report_card.status}",
        )

    gap_override_reason = payload.gap_override_reason if payload is not None else None
    deadline = payload.deadline if payload is not None else None

    gaps = _detect_gaps(db, student, report_card.semester)
    if gaps and not gap_override_reason:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "detail": "gaps exist; provide gap_override_reason to proceed",
                "gaps": gaps,
            },
        )

    report_card.status = ReportCardStatus.FINALIZED
    report_card.finalized_by = user.id
    report_card.finalized_at = utcnow()
    if deadline is not None:
        report_card.deadline = deadline
    if gap_override_reason:
        report_card.gap_override_reason = gap_override_reason

    log_workflow_audit(
        db,
        actor=user,
        action="finalize_rapor",
        entity_type="report_card",
        entity_id=report_card.id,
        before={"status": "draft"},
        after={"status": "finalized", "gap_override": gap_override_reason},
    )
    db.commit()
    db.refresh(report_card)
    return ReportCardOut.model_validate(report_card)


@router.post("/{report_card_id}/publish", response_model=ReportCardOut)
def publish_finalized_report_card(
    report_card_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReportCardOut:
    """Principal approves a finalized rapor, making it visible to parents."""
    report_card = db.get(ReportCard, report_card_id)
    if report_card is None or not can_user_read_student(db, user, report_card.student_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="report card not found")

    if user.role not in (UserRole.PRINCIPAL, UserRole.SUPER_ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="only principal can publish"
        )

    if report_card.status != ReportCardStatus.FINALIZED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"cannot publish from status {report_card.status}; finalize first",
        )

    report_card.status = ReportCardStatus.PUBLISHED
    report_card.published_by = user.id
    report_card.published_at = utcnow()
    log_workflow_audit(
        db,
        actor=user,
        action="publish_rapor",
        entity_type="report_card",
        entity_id=report_card.id,
        before={"status": "finalized"},
        after={"status": "published"},
    )
    db.commit()
    db.refresh(report_card)
    return ReportCardOut.model_validate(report_card)


@router.post(
    "/{report_card_id}/correct",
    response_model=ReportCardOut,
    status_code=status.HTTP_201_CREATED,
)
def correct_report_card(
    report_card_id: int,
    payload: ReportCardCorrect | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReportCardOut:
    """Create a corrected version; the previous version is retained as superseded."""
    old = db.get(ReportCard, report_card_id)
    student = db.get(Student, old.student_id) if old is not None else None
    if old is None or student is None or not can_write_student(db, user, student):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="report card not found")

    if old.status != ReportCardStatus.PUBLISHED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="only published rapors can be corrected",
        )

    # Supersede first so the partial unique index never sees two active rows.
    old.status = ReportCardStatus.SUPERSEDED
    db.flush()

    corrected_data = (
        payload.compiled_data
        if payload and payload.compiled_data
        else old.compiled_data
    )
    corrected_deadline = payload.deadline if payload and payload.deadline else old.deadline

    new = ReportCard(
        student_id=old.student_id,
        semester=old.semester,
        status=ReportCardStatus.DRAFT,
        version=old.version + 1,
        kurikulum_version=old.kurikulum_version,
        compiled_data=corrected_data,
        deadline=corrected_deadline,
    )
    db.add(new)
    db.flush()
    old.superseded_by = new.id

    log_workflow_audit(
        db,
        actor=user,
        action="correct_rapor",
        entity_type="report_card",
        entity_id=old.id,
        before={"status": "published"},
        after={"status": "superseded", "new_version": new.id},
    )
    db.commit()
    db.refresh(new)
    return ReportCardOut.model_validate(new)


@router.patch("/{report_card_id}/publish", response_model=ReportCardOut)
def publish_report_card(
    report_card_id: int,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReportCardOut:
    """Approve a draft and make it visible to parents/students."""
    report_card = db.get(ReportCard, report_card_id)
    if report_card is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="report card not found")
    student = db.get(Student, report_card.student_id)
    if student is None or not can_write_student(db, user, student):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    report_card.status = ReportCardStatus.PUBLISHED
    report_card.published_at = utcnow()
    db.commit()
    db.refresh(report_card)
    log_audit_event(
        db,
        user=user,
        action="publish_rapor",
        entity_type="report_card",
        entity_id=report_card.id,
        request=request,
    )
    return ReportCardOut.model_validate(report_card)


@router.patch("/{report_card_id}/unpublish", response_model=ReportCardOut)
def unpublish_report_card(
    report_card_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReportCardOut:
    """Return a published rapor to draft (admin/super_admin only)."""
    report_card = db.get(ReportCard, report_card_id)
    if report_card is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="report card not found")
    student = db.get(Student, report_card.student_id)
    if user.role != UserRole.SUPER_ADMIN:
        if user.role != UserRole.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
        school = db.get(School, student.school_id) if student is not None else None
        if school is None or school.tenant_id != user.tenant_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    report_card.status = ReportCardStatus.DRAFT
    report_card.published_at = None
    db.commit()
    db.refresh(report_card)
    return ReportCardOut.model_validate(report_card)


@router.delete("/{report_card_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_report_card(
    report_card_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Delete a rapor (admin/super_admin only)."""
    report_card = db.get(ReportCard, report_card_id)
    if report_card is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="report card not found")
    if user.role != UserRole.SUPER_ADMIN:
        if user.role != UserRole.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
        student = db.get(Student, report_card.student_id)
        school = db.get(School, student.school_id) if student is not None else None
        if school is None or school.tenant_id != user.tenant_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    db.delete(report_card)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
