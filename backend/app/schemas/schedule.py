"""Schedule schemas (ticket #20)."""

from __future__ import annotations

from datetime import time
from enum import IntEnum

from pydantic import BaseModel, ConfigDict, Field, model_validator


class DayOfWeekEnum(IntEnum):
    """ISO weekday: Monday = 1 … Sunday = 7."""

    MONDAY = 1
    TUESDAY = 2
    WEDNESDAY = 3
    THURSDAY = 4
    FRIDAY = 5
    SATURDAY = 6
    SUNDAY = 7


class ScheduleBase(BaseModel):
    """Shared fields for a weekly timetable slot."""

    subject_id: int
    teacher_id: int
    day_of_week: DayOfWeekEnum
    period_number: int = Field(ge=1)
    start_time: time
    end_time: time

    @model_validator(mode="after")
    def _check_time_order(self) -> ScheduleBase:
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class ScheduleCreate(ScheduleBase):
    """Create one schedule entry for a class."""

    class_id: int


class ScheduleBulkEntry(ScheduleBase):
    """One slot inside a bulk submission (class_id comes from the parent)."""


class ScheduleBulkCreate(BaseModel):
    """Create many slots for a single class in one transaction."""

    class_id: int
    schedules: list[ScheduleBulkEntry]


class ScheduleUpdate(BaseModel):
    """Editable fields of an existing schedule entry."""

    subject_id: int | None = None
    teacher_id: int | None = None
    day_of_week: DayOfWeekEnum | None = None
    period_number: int | None = Field(default=None, ge=1)
    start_time: time | None = None
    end_time: time | None = None


class ScheduleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    class_id: int
    subject_id: int
    teacher_id: int
    day_of_week: DayOfWeekEnum
    period_number: int
    start_time: time
    end_time: time


class ScheduleListResponse(BaseModel):
    items: list[ScheduleOut]
    total: int
    page: int
    size: int


class ScheduleBulkResult(BaseModel):
    """Result of a bulk schedule submission."""

    class_id: int
    created: int
