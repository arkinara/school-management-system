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
    """Record a payment against an unpaid bill."""

    bill_id: int
    method: str = Field(min_length=1, max_length=64)
    amount: float = Field(gt=0)
    receipt_no: str = Field(min_length=1, max_length=64)
    paid_at: datetime | None = None


class SppPaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    bill_id: int
    paid_at: datetime
    method: str
    amount: float
    receipt_no: str
    recorded_by: int


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
