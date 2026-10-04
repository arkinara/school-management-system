"""Pydantic v2 request/response schemas, split per domain."""

from app.schemas.auth import (
    AuthResponse,
    ChangePasswordRequest,
    Token,
    TokenPayload,
    UserLogin,
    UserMe,
    UserRegister,
)
from app.schemas.classes import ClassCreate, ClassOut
from app.schemas.school import SchoolCreate, SchoolOut
from app.schemas.stubs import (
    AnnouncementOut,
    AttendanceOut,
    GradeOut,
    MessageOut,
    MessageThreadOut,
    ReportCardOut,
    ScheduleOut,
    SppBillOut,
    SppPaymentOut,
)
from app.schemas.student import StudentCreate, StudentOut
from app.schemas.subject import SubjectCreate, SubjectOut
from app.schemas.tenant import TenantCreate, TenantOut
from app.schemas.user import UserCreate, UserOut, UserUpdate

__all__ = [
    "AnnouncementOut",
    "AttendanceOut",
    "AuthResponse",
    "ChangePasswordRequest",
    "ClassCreate",
    "ClassOut",
    "GradeOut",
    "MessageOut",
    "MessageThreadOut",
    "ReportCardOut",
    "ScheduleOut",
    "SchoolCreate",
    "SchoolOut",
    "SppBillOut",
    "SppPaymentOut",
    "StudentCreate",
    "StudentOut",
    "SubjectCreate",
    "SubjectOut",
    "TenantCreate",
    "TenantOut",
    "Token",
    "TokenPayload",
    "UserCreate",
    "UserLogin",
    "UserMe",
    "UserOut",
    "UserRegister",
    "UserUpdate",
]
