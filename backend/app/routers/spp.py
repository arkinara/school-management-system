"""SPP router (ticket #23): bill generation, payments, overdue, summary."""

from __future__ import annotations

from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.audit import log_audit_event
from app.auth.deps import get_current_user, require_role
from app.db.models import (
    Class,
    School,
    SppBill,
    SppBillStatus,
    SppPayment,
    Student,
    User,
    UserRole,
    utcnow,
)
from app.db.session import get_db
from app.notifications.triggers import (
    safe_trigger,
    trigger_spp_overdue_notification,
)
from app.pagination import PageParams
from app.schemas.spp import (
    SppBillBulkCreate,
    SppBillBulkResult,
    SppBillCreate,
    SppBillListResponse,
    SppBillOut,
    SppBillUpdate,
    SppPaymentCreate,
    SppPaymentListResponse,
    SppPaymentOut,
    SppSummary,
)
from app.scoping import visible_student_ids

router = APIRouter()

_MANAGER_ROLES = (UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.SUPER_ADMIN)
_manage = require_role(*_MANAGER_ROLES)

_PAID = SppBillStatus.PAID
_OVERDUE = SppBillStatus.OVERDUE
_UNPAID = SppBillStatus.UNPAID


def _can_manage_school(user: User, school: School | None) -> bool:
    if school is None:
        return False
    if user.role == UserRole.SUPER_ADMIN:
        return True
    return (
        user.role in {UserRole.ADMIN, UserRole.PRINCIPAL}
        and user.tenant_id == school.tenant_id
        and user.school_id == school.id
    )


def _load_class(db: Session, class_id: int) -> Class:
    klass = db.get(Class, class_id)
    if klass is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="class not found")
    return klass


def _authorize_class(db: Session, user: User, klass: Class) -> School:
    school = db.get(School, klass.school_id)
    if not _can_manage_school(user, school):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    return school


def _student_or_404(db: Session, student_id: int) -> Student:
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="student not found")
    return student


def _bill_or_404(db: Session, bill_id: int) -> SppBill:
    bill = db.get(SppBill, bill_id)
    if bill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="bill not found")
    return bill


def _authorize_bill(db: Session, user: User, bill: SppBill) -> School:
    student = db.get(Student, bill.student_id)
    school = db.get(School, student.school_id) if student is not None else None
    if not _can_manage_school(user, school):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    return school


def _paid_total(db: Session, bill_id: int) -> float:
    return float(
        db.scalar(
            select(func.coalesce(func.sum(SppPayment.amount), 0.0)).where(
                SppPayment.bill_id == bill_id
            )
        )
        or 0.0
    )


def _bill_out(db: Session, bill: SppBill) -> SppBillOut:
    paid = _paid_total(db, bill.id)
    student = db.get(Student, bill.student_id)
    return SppBillOut(
        id=bill.id,
        student_id=bill.student_id,
        class_id=student.class_id if student is not None else None,
        period=bill.period,
        amount=bill.amount,
        due_date=bill.due_date,
        status=bill.status,
        created_by=bill.created_by,
        paid_amount=round(paid, 2),
        balance=round(max(bill.amount - paid, 0.0), 2),
    )


def _scope_student_condition(user: User, db: Session):
    """Sub-condition limiting SppBill rows to what ``user`` may read."""
    allowed = visible_student_ids(db, user)
    if allowed is None:
        return None
    return SppBill.student_id.in_(allowed)


@router.post(
    "/bills/bulk", status_code=status.HTTP_201_CREATED, response_model=SppBillBulkResult
)
def create_bills_bulk(
    payload: SppBillBulkCreate,
    user: User = Depends(_manage),
    db: Session = Depends(get_db),
) -> SppBillBulkResult:
    """Generate one bill per active student in a class; skip existing periods."""
    klass = _load_class(db, payload.class_id)
    _authorize_class(db, user, klass)
    if payload.due_date < date_type.today():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="due_date must not be in the past",
        )

    students = db.scalars(
        select(Student)
        .where(Student.class_id == klass.id, Student.enrollment_status == "active")
        .order_by(Student.id)
    ).all()
    existing = set(
        db.scalars(
            select(SppBill.student_id).where(
                SppBill.period == payload.period,
                SppBill.student_id.in_([s.id for s in students] or [0]),
            )
        ).all()
    )

    created = 0
    skipped: list[int] = []
    for student in students:
        if student.id in existing:
            skipped.append(student.id)
            continue
        db.add(
            SppBill(
                student_id=student.id,
                period=payload.period,
                amount=payload.amount,
                due_date=payload.due_date,
                status=_UNPAID,
                created_by=user.id,
            )
        )
        created += 1

    db.commit()
    return SppBillBulkResult(
        class_id=klass.id,
        period=payload.period,
        created=created,
        skipped=skipped,
    )


@router.post("/bills", status_code=status.HTTP_201_CREATED, response_model=SppBillOut)
def create_bill(
    payload: SppBillCreate,
    user: User = Depends(_manage),
    db: Session = Depends(get_db),
) -> SppBillOut:
    """Create a single bill; duplicate student/period is a 409."""
    student = _student_or_404(db, payload.student_id)
    if student.class_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="student is not assigned to a class",
        )
    _authorize_class(db, user, _load_class(db, student.class_id))
    if payload.due_date < date_type.today():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="due_date must not be in the past",
        )
    duplicate = db.scalar(
        select(SppBill).where(
            SppBill.student_id == student.id, SppBill.period == payload.period
        )
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="bill already exists for this period"
        )

    bill = SppBill(
        student_id=student.id,
        period=payload.period,
        amount=payload.amount,
        due_date=payload.due_date,
        status=_UNPAID,
        created_by=user.id,
    )
    db.add(bill)
    db.commit()
    db.refresh(bill)
    return _bill_out(db, bill)


@router.get("/bills", response_model=SppBillListResponse)
def list_bills(
    student_id: int | None = Query(None),
    class_id: int | None = Query(None),
    period: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    page: PageParams = Depends(PageParams),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SppBillListResponse:
    """List bills within the caller's scope (parents: own children only)."""
    # scope: school
    conditions = []
    scope = _scope_student_condition(user, db)
    if scope is not None:
        conditions.append(scope)
    if student_id is not None:
        allowed = visible_student_ids(db, user)
        if allowed is not None and student_id not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
        conditions.append(SppBill.student_id == student_id)
    if class_id is not None:
        conditions.append(
            SppBill.student_id.in_(
                select(Student.id).where(Student.class_id == class_id)
            )
        )
    if period is not None:
        conditions.append(SppBill.period == period)
    if status_filter is not None:
        conditions.append(SppBill.status == status_filter)

    total = db.scalar(select(func.count()).select_from(SppBill).where(*conditions)) or 0
    rows = db.scalars(
        select(SppBill)
        .where(*conditions)
        .order_by(SppBill.student_id, SppBill.period, SppBill.id)
        .offset(page.offset)
        .limit(page.size)
    ).all()
    return SppBillListResponse(
        items=[_bill_out(db, row) for row in rows],
        total=total,
        page=page.page,
        size=page.size,
    )


@router.get("/bills/overdue", response_model=SppBillListResponse)
def list_overdue_bills(
    class_id: int | None = Query(None),
    page: PageParams = Depends(PageParams),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SppBillListResponse:
    """Bills that are overdue or unpaid past their due date (TU follow-up)."""
    # scope: school
    today = date_type.today()
    conditions = [
        or_(
            SppBill.status == _OVERDUE,
            (SppBill.status == _UNPAID) & (SppBill.due_date < today),
        )
    ]
    scope = _scope_student_condition(user, db)
    if scope is not None:
        conditions.append(scope)
    if class_id is not None:
        conditions.append(
            SppBill.student_id.in_(
                select(Student.id).where(Student.class_id == class_id)
            )
        )

    total = db.scalar(select(func.count()).select_from(SppBill).where(*conditions)) or 0
    rows = db.scalars(
        select(SppBill)
        .where(*conditions)
        .order_by(SppBill.due_date, SppBill.id)
        .offset(page.offset)
        .limit(page.size)
    ).all()
    return SppBillListResponse(
        items=[_bill_out(db, row) for row in rows],
        total=total,
        page=page.page,
        size=page.size,
    )


@router.get("/bills/{bill_id}", response_model=SppBillOut)
def get_bill(
    bill_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SppBillOut:
    """Read one bill inside the caller's scope."""
    # scope: school
    bill = _bill_or_404(db, bill_id)
    student = db.get(Student, bill.student_id)
    allowed = visible_student_ids(db, user)
    if student is None or (allowed is not None and student.id not in allowed):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    return _bill_out(db, bill)


@router.patch("/bills/{bill_id}", response_model=SppBillOut)
def update_bill(
    bill_id: int,
    payload: SppBillUpdate,
    user: User = Depends(_manage),
    db: Session = Depends(get_db),
) -> SppBillOut:
    """Update a bill (extend due date, adjust amount, override status)."""
    bill = _bill_or_404(db, bill_id)
    _authorize_bill(db, user, bill)

    data = payload.model_dump(exclude_unset=True)
    new_amount = data.get("amount", bill.amount)
    paid = _paid_total(db, bill.id)
    if new_amount < paid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="amount cannot be less than the amount already paid",
        )
    for field, value in data.items():
        setattr(bill, field, value)
    db.commit()
    db.refresh(bill)
    return _bill_out(db, bill)


@router.delete("/bills/{bill_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bill(
    bill_id: int,
    user: User = Depends(_manage),
    db: Session = Depends(get_db),
) -> Response:
    """Delete an unpaid, payment-free bill (admin only)."""
    bill = _bill_or_404(db, bill_id)
    _authorize_bill(db, user, bill)
    if bill.status != _UNPAID or _paid_total(db, bill.id) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="cannot delete a bill that is paid or has payments",
        )
    db.delete(bill)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/bills/mark-overdue", response_model=dict[str, int]
)
def mark_overdue_bills(
    user: User = Depends(_manage),
    db: Session = Depends(get_db),
) -> dict[str, int]:
    """Flip unpaid bills past due_date to overdue (scheduled-job entrypoint)."""
    today = date_type.today()
    conditions = [SppBill.status == _UNPAID, SppBill.due_date < today]
    if user.role != UserRole.SUPER_ADMIN:
        conditions.append(
            SppBill.student_id.in_(
                select(Student.id)
                .join(School, School.id == Student.school_id)
                .where(School.tenant_id == user.tenant_id)
            )
        )
    rows = list(db.scalars(select(SppBill).where(*conditions)).all())
    for bill in rows:
        bill.status = _OVERDUE
    db.commit()
    for bill in rows:
        safe_trigger(trigger_spp_overdue_notification, db, bill)
    return {"updated": len(rows)}


@router.post(
    "/payments", status_code=status.HTTP_201_CREATED, response_model=SppPaymentOut
)
def create_payment(
    payload: SppPaymentCreate,
    request: Request,
    user: User = Depends(_manage),
    db: Session = Depends(get_db),
) -> SppPaymentOut:
    """Record a payment; marks the bill paid once fully covered."""
    bill = _bill_or_404(db, payload.bill_id)
    school = _authorize_bill(db, user, bill)
    if bill.status == _PAID:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="bill is already paid"
        )

    outstanding = round(bill.amount - _paid_total(db, bill.id), 2)
    if payload.amount > outstanding:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="payment exceeds the outstanding balance",
        )

    payment = SppPayment(
        bill_id=bill.id,
        paid_at=payload.paid_at or utcnow(),
        method=payload.method,
        amount=payload.amount,
        receipt_no=payload.receipt_no,
        recorded_by=user.id,
    )
    db.add(payment)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="receipt_no already used"
        ) from exc

    if round(_paid_total(db, bill.id), 2) >= round(bill.amount, 2):
        bill.status = _PAID
    db.commit()
    db.refresh(payment)
    log_audit_event(
        db,
        user=user,
        action="payment",
        entity_type="spp_payment",
        entity_id=payment.id,
        tenant_id=school.tenant_id if school is not None else None,
        school_id=school.id if school is not None else None,
        request=request,
    )
    return SppPaymentOut.model_validate(payment)


@router.get("/payments", response_model=SppPaymentListResponse)
def list_payments(
    bill_id: int | None = Query(None),
    student_id: int | None = Query(None),
    page: PageParams = Depends(PageParams),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SppPaymentListResponse:
    """List payments within the caller's scope."""
    # scope: school
    conditions = []
    scope = _scope_student_condition(user, db)
    if scope is not None:
        conditions.append(scope)
    if bill_id is not None:
        bill = _bill_or_404(db, bill_id)
        student = db.get(Student, bill.student_id)
        allowed = visible_student_ids(db, user)
        if student is None or (allowed is not None and student.id not in allowed):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
        conditions.append(SppPayment.bill_id == bill_id)
    if student_id is not None:
        allowed = visible_student_ids(db, user)
        if allowed is not None and student_id not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
        conditions.append(
            SppPayment.bill_id.in_(
                select(SppBill.id).where(SppBill.student_id == student_id)
            )
        )

    total = (
        db.scalar(
            select(func.count())
            .select_from(SppPayment)
            .join(SppBill, SppBill.id == SppPayment.bill_id)
            .where(*conditions)
        )
        or 0
    )
    rows = db.scalars(
        select(SppPayment)
        .join(SppBill, SppBill.id == SppPayment.bill_id)
        .where(*conditions)
        .order_by(SppPayment.id)
        .offset(page.offset)
        .limit(page.size)
    ).all()
    return SppPaymentListResponse(
        items=[SppPaymentOut.model_validate(row) for row in rows],
        total=total,
        page=page.page,
        size=page.size,
    )


@router.get("/summary", response_model=SppSummary)
def spp_summary(
    class_id: int | None = Query(None),
    period: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SppSummary:
    """Collection rate, totals and overdue count for the caller's scope."""
    # scope: school
    today = date_type.today()
    conditions = []
    scope = _scope_student_condition(user, db)
    if scope is not None:
        conditions.append(scope)
    if class_id is not None:
        conditions.append(
            SppBill.student_id.in_(
                select(Student.id).where(Student.class_id == class_id)
            )
        )
    if period is not None:
        conditions.append(SppBill.period == period)

    bill_count = db.scalar(select(func.count()).select_from(SppBill).where(*conditions)) or 0
    total_billed = float(
        db.scalar(select(func.coalesce(func.sum(SppBill.amount), 0.0)).where(*conditions))
        or 0.0
    )
    total_collected = float(
        db.scalar(
            select(func.coalesce(func.sum(SppPayment.amount), 0.0))
            .join(SppBill, SppBill.id == SppPayment.bill_id)
            .where(*conditions)
        )
        or 0.0
    )
    overdue_count = (
        db.scalar(
            select(func.count())
            .select_from(SppBill)
            .where(
                *conditions,
                or_(
                    SppBill.status == _OVERDUE,
                    (SppBill.status == _UNPAID) & (SppBill.due_date < today),
                ),
            )
        )
        or 0
    )
    rate = round(total_collected / total_billed * 100, 2) if total_billed else 0.0
    return SppSummary(
        bill_count=bill_count,
        total_billed=round(total_billed, 2),
        total_collected=round(total_collected, 2),
        total_outstanding=round(max(total_billed - total_collected, 0.0), 2),
        collection_rate=rate,
        overdue_count=overdue_count,
    )
