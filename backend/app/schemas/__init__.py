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
from app.schemas.classes import ClassCreate, ClassListResponse, ClassOut, ClassUpdate
from app.schemas.school import (
    SchoolCreate,
    SchoolListResponse,
    SchoolOut,
    SchoolUpdate,
)
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
from app.schemas.subject import (
    SubjectCreate,
    SubjectListResponse,
    SubjectOut,
    SubjectUpdate,
)
from app.schemas.tenant import TenantCreate, TenantOut, TenantUpdate
from app.schemas.user import UserCreate, UserListResponse, UserOut, UserUpdate

__all__ = [
    "AnnouncementOut",
    "AttendanceOut",
    "AuthResponse",
    "ChangePasswordRequest",
    "ClassCreate",
    "ClassListResponse",
    "ClassOut",
    "ClassUpdate",
    "GradeOut",
    "MessageOut",
    "MessageThreadOut",
    "ReportCardOut",
    "ScheduleOut",
    "SchoolCreate",
    "SchoolListResponse",
    "SchoolOut",
    "SchoolUpdate",
    "SppBillOut",
    "SppPaymentOut",
    "StudentCreate",
    "StudentOut",
    "SubjectCreate",
    "SubjectListResponse",
    "SubjectOut",
    "SubjectUpdate",
    "TenantCreate",
    "TenantOut",
    "TenantUpdate",
    "Token",
    "TokenPayload",
    "UserCreate",
    "UserListResponse",
    "UserLogin",
    "UserMe",
    "UserOut",
    "UserRegister",
    "UserUpdate",
]
