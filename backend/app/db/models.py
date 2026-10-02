"""SQLAlchemy 2.0 declarative models for the school management schema.

The 15 tables from PRD §Database Schema are defined here, plus an
``audit_logs`` table used to record explicit super_admin tenant-bypass calls.
``tenant_id`` on every operational table is the hard isolation boundary.
"""

from __future__ import annotations

from datetime import date, datetime, time, timezone
from enum import StrEnum

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    """Timezone-aware UTC timestamp used as a column default."""
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    """Shared declarative base for every ORM model."""


def _str_enum(enum_cls: type[StrEnum], length: int) -> Enum:
    """Enum column storing human-readable ``.value`` strings (not member names)."""
    return Enum(
        enum_cls,
        values_callable=lambda e: [m.value for m in e],
        native_enum=False,
        length=length,
    )


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------


class JenjangType(StrEnum):
    TK = "TK"
    SD = "SD"
    SMP = "SMP"
    SMA = "SMA"
    UNIVERSITY = "University"


class UserRole(StrEnum):
    PRINCIPAL = "principal"
    TEACHER = "teacher"
    STUDENT = "student"
    PARENT = "parent"
    ADMIN = "admin"
    SUPER_ADMIN = "super_admin"


class AttendanceStatus(StrEnum):
    HADIR = "hadir"
    IZIN = "izin"
    SAKIT = "sakit"
    ALPA = "alpa"


class GradeCategory(StrEnum):
    FORMATIF = "formatif"
    SUMATIF = "sumatif"
    PR = "PR"
    TUGAS = "tugas"


class ReportCardStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"


class SppBillStatus(StrEnum):
    UNPAID = "unpaid"
    PAID = "paid"
    OVERDUE = "overdue"


class AnnouncementAudience(StrEnum):
    ALL = "all"
    CLASS = "class"
    JENJANG = "jenjang"


# ---------------------------------------------------------------------------
# Tables
# ---------------------------------------------------------------------------


class Tenant(Base):
    """A jenjang-scoped organisation (TK/SD/SMP/SMA/University)."""

    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    jenjang_type: Mapped[JenjangType] = mapped_column(
        _str_enum(JenjangType, 32), nullable=False
    )
    kurikulum_version: Mapped[str] = mapped_column(String(64), nullable=False)
    config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    schools: Mapped[list[School]] = relationship(back_populates="tenant")
    users: Mapped[list[User]] = relationship(back_populates="tenant")
    subjects: Mapped[list[Subject]] = relationship(back_populates="tenant")

    __table_args__ = (UniqueConstraint("name", "jenjang_type", name="uq_tenant_name_jenjang"),)


class School(Base):
    """A physical school belonging to exactly one tenant."""

    __tablename__ = "schools"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str | None] = mapped_column(String(512), nullable=True)
    principal_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    tenant: Mapped[Tenant] = relationship(back_populates="schools")
    classes: Mapped[list[Class]] = relationship(back_populates="school")


class User(Base):
    """An authenticated identity scoped to a tenant (and optionally a school)."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False, index=True)
    school_id: Mapped[int | None] = mapped_column(
        ForeignKey("schools.id"), nullable=True, index=True
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_auth_ref: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        _str_enum(UserRole, 32), nullable=False
    )
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    tenant: Mapped[Tenant] = relationship(back_populates="users")
    student: Mapped[Student | None] = relationship(back_populates="user", uselist=False)


class Class(Base):
    """A class/roster within a school."""

    __tablename__ = "classes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    grade_level: Mapped[int] = mapped_column(Integer, nullable=False)
    jurusan: Mapped[str | None] = mapped_column(String(128), nullable=True)
    wali_kelas_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    academic_year: Mapped[str] = mapped_column(String(32), nullable=False)

    school: Mapped[School] = relationship(back_populates="classes")
    students: Mapped[list[Student]] = relationship(back_populates="klass")
    schedules: Mapped[list[Schedule]] = relationship(back_populates="klass")


class Student(Base):
    """A student profile linked 1:1 to a user account."""

    __tablename__ = "students"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), unique=True, nullable=False, index=True
    )
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), nullable=False, index=True)
    class_id: Mapped[int | None] = mapped_column(
        ForeignKey("classes.id"), nullable=True, index=True
    )
    nis: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    enrollment_status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)

    user: Mapped[User] = relationship(back_populates="student")
    klass: Mapped[Class | None] = relationship(back_populates="students")
    grades: Mapped[list[Grade]] = relationship(back_populates="student")
    attendances: Mapped[list[Attendance]] = relationship(back_populates="student")
    report_cards: Mapped[list[ReportCard]] = relationship(back_populates="student")
    spp_bills: Mapped[list[SppBill]] = relationship(back_populates="student")


class Subject(Base):
    """A subject (or TK tumbuh-kembang aspect) configured per tenant."""

    __tablename__ = "subjects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(128), nullable=False)
    applicable_grade_levels: Mapped[list | None] = mapped_column(JSON, nullable=True)

    tenant: Mapped[Tenant] = relationship(back_populates="subjects")
    schedules: Mapped[list[Schedule]] = relationship(back_populates="subject")
    grades: Mapped[list[Grade]] = relationship(back_populates="subject")


class Schedule(Base):
    """A recurring timetabled slot for a class."""

    __tablename__ = "schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id"), nullable=False, index=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"), nullable=False, index=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    day_of_week: Mapped[str] = mapped_column(String(16), nullable=False)
    period_number: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)

    klass: Mapped[Class] = relationship(back_populates="schedules")
    subject: Mapped[Subject] = relationship(back_populates="schedules")

    __table_args__ = (
        UniqueConstraint(
            "class_id", "day_of_week", "period_number", name="uq_schedule_class_day_period"
        ),
    )


class Attendance(Base):
    """A daily attendance record for a student."""

    __tablename__ = "attendances"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), nullable=False, index=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[AttendanceStatus] = mapped_column(
        _str_enum(AttendanceStatus, 16), nullable=False
    )
    recorded_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    note: Mapped[str | None] = mapped_column(String(512), nullable=True)

    student: Mapped[Student] = relationship(back_populates="attendances")

    __table_args__ = (
        UniqueConstraint("student_id", "date", name="uq_attendance_student_date"),
    )


class Grade(Base):
    """A single assessment score for a student in a subject."""

    __tablename__ = "grades"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), nullable=False, index=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"), nullable=False, index=True)
    semester: Mapped[str] = mapped_column(String(32), nullable=False)
    category: Mapped[GradeCategory] = mapped_column(
        _str_enum(GradeCategory, 16), nullable=False
    )
    score: Mapped[float] = mapped_column(Float, nullable=False)
    description: Mapped[str | None] = mapped_column(String(512), nullable=True)
    recorded_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    student: Mapped[Student] = relationship(back_populates="grades")
    subject: Mapped[Subject] = relationship(back_populates="grades")

    __table_args__ = (CheckConstraint("score >= 0 AND score <= 100", name="ck_grade_score_range"),)


class ReportCard(Base):
    """A compiled report card, whose shape depends on kurikulum_version."""

    __tablename__ = "report_cards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), nullable=False, index=True)
    semester: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[ReportCardStatus] = mapped_column(
        _str_enum(ReportCardStatus, 16), nullable=False, default=ReportCardStatus.DRAFT
    )
    kurikulum_version: Mapped[str] = mapped_column(String(64), nullable=False)
    compiled_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    finalized_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    student: Mapped[Student] = relationship(back_populates="report_cards")


class SppBill(Base):
    """A tuition bill owed by a student for a billing period."""

    __tablename__ = "spp_bills"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), nullable=False, index=True)
    period: Mapped[str] = mapped_column(String(32), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[SppBillStatus] = mapped_column(
        _str_enum(SppBillStatus, 16), nullable=False, default=SppBillStatus.UNPAID
    )
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    student: Mapped[Student] = relationship(back_populates="spp_bills")
    payments: Mapped[list[SppPayment]] = relationship(back_populates="bill")


class SppPayment(Base):
    """A payment applied against an SPP bill."""

    __tablename__ = "spp_payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bill_id: Mapped[int] = mapped_column(ForeignKey("spp_bills.id"), nullable=False, index=True)
    paid_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    method: Mapped[str] = mapped_column(String(64), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    receipt_no: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    recorded_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    bill: Mapped[SppBill] = relationship(back_populates="payments")


class Announcement(Base):
    """A tenant/school scoped announcement."""

    __tablename__ = "announcements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False, index=True)
    school_id: Mapped[int | None] = mapped_column(
        ForeignKey("schools.id"), nullable=True, index=True
    )
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    audience: Mapped[AnnouncementAudience] = mapped_column(
        _str_enum(AnnouncementAudience, 16), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(String, nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class MessageThread(Base):
    """A parent/teacher conversation thread."""

    __tablename__ = "message_threads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False, index=True)
    school_id: Mapped[int | None] = mapped_column(
        ForeignKey("schools.id"), nullable=True, index=True
    )
    participant_ids: Mapped[list | None] = mapped_column(JSON, nullable=True)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    messages: Mapped[list[Message]] = relationship(back_populates="thread")


class Message(Base):
    """A single message within a thread."""

    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    thread_id: Mapped[int] = mapped_column(
        ForeignKey("message_threads.id"), nullable=False, index=True
    )
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    body: Mapped[str] = mapped_column(String, nullable=False)
    sent_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    thread: Mapped[MessageThread] = relationship(back_populates="messages")


class AuditLog(Base):
    """Audit trail for explicit cross-tenant super_admin bypass calls."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    actor_role: Mapped[str | None] = mapped_column(String(32), nullable=True)
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    tenant_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    school_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reason: Mapped[str | None] = mapped_column(String(512), nullable=True)
    bypassed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
