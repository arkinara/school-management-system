"""SPP schemas (ticket #23)."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.db.models import SppBillStatus


class SppBillCreate(BaseModel):
    """Create a single tuition bill for one student/period."""

    student_id: int
    period: str = Field(min_length=1, max_length=32)
    amount: float = Field(gt=0)
    due_date: date


class SppBillBulkCreate(BaseModel):
    """Bulk-generate bills for every student in a class/period."""

    class_id: int
    period: str = Field(min_length=1, max_length=32)
    amount: float = Field(gt=0)
    due_date: date


class SppBillUpdate(BaseModel):
    """Editable fields of an existing bill (e.g. extend due date)."""

    amount: float | None = Field(default=None, gt=0)
    due_date: date | None = None
    status: SppBillStatus | None = None


class SppBillOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    class_id: int | None = None
    period: str
    amount: float
    due_date: date
    status: SppBillStatus
    created_by: int
    paid_amount: float = 0.0
    balance: float = 0.0


class SppBillBulkResult(BaseModel):
    """Result of a bulk bill generation run."""

    class_id: int
    period: str
    created: int
    skipped: list[int] = []


class SppBillListResponse(BaseModel):
    items: list[SppBillOut]
    total: int
    page: int
    size: int


class SppPaymentCreate(BaseModel):
    """Record a payment against an unpaid bill.

    ``bill_id`` is only used by the legacy collection route; the bill-scoped
    route takes the bill id from the path. ``receipt_no`` is accepted for
    backwards compatibility but ignored — the server assigns it.
    """

    bill_id: int | None = None
    method: str = Field(default="cash", min_length=1, max_length=64)
    amount: float = Field(gt=0)
    receipt_no: str | None = None
    note: str | None = Field(default=None, max_length=512)
    paid_at: datetime | None = None


class SppPaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    school_id: int
    bill_id: int
    paid_at: datetime
    method: str
    amount: float
    receipt_no: int
    recorded_by: int
    voided: bool = False
    voided_at: datetime | None = None
    voided_by: int | None = None
    void_reason: str | None = None


class BillWithPaymentsOut(BaseModel):
    """A bill plus the payment that was just recorded against it."""

    model_config = ConfigDict(from_attributes=True)

    bill: SppBillOut
    payment: SppPaymentOut


class VoidPaymentRequest(BaseModel):
    """Optional payload explaining why a payment is being voided."""

    reason: str | None = Field(default=None, max_length=512)


class SppBulkGenerateRequest(BaseModel):
    """Generate bills for one class or an entire school for a period."""

    class_id: int | None = None
    school_id: int | None = None
    period: str = Field(min_length=1, max_length=32)
    amount: float = Field(gt=0)
    due_date: date


class SppBulkGenerateResult(BaseModel):
    """Counts returned by a bulk bill generation run."""

    created: int
    skipped: int
    no_students: int
    message: str


class SppPaymentListResponse(BaseModel):
    items: list[SppPaymentOut]
    total: int
    page: int
    size: int


class SppSummary(BaseModel):
    """Aggregate billing/collection figures for dashboards."""

    bill_count: int
    total_billed: float
    total_collected: float
    total_outstanding: float
    collection_rate: float
    overdue_count: int
