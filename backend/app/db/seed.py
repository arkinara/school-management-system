"""Deterministic, idempotent seed data for local development and tests.

Seeds a single tenant (TK Menteng Ceria / SDN Menteng 01) with users covering
every role, classes, subjects, schedules, attendance, grades, report cards and
SPP bills. IDs are explicit integers so counts are reproducible.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from passlib.hash import bcrypt
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.db.models import (
    Announcement,
    AnnouncementAudience,
    Attendance,
    AttendanceStatus,
    AuditLog,
    Base,
    Class,
    Grade,
    GradeCategory,
    JenjangType,
    Message,
    MessageThread,
    ReportCard,
    ReportCardStatus,
    Schedule,
    School,
    SppBill,
    SppBillStatus,
    SppPayment,
    Student,
    Subject,
    Tenant,
    User,
    UserRole,
    utcnow,
)
from app.db.session import SessionLocal, create_all

SEED_PASSWORD = "password123"
ACADEMIC_YEAR = "2024/2025"
SEMESTER = "ganjil"


def _hash(password: str) -> str:
    return bcrypt.hash(password)


def clear_all(session: Session) -> None:
    """Remove every row in FK-safe order so seeding is idempotent."""
    delete_order = [
        Message,
        SppPayment,
        Attendance,
        Grade,
        Schedule,
        ReportCard,
        MessageThread,
        Announcement,
        SppBill,
        Student,
        Class,
        Subject,
        AuditLog,
        User,
        School,
        Tenant,
    ]
    for model in delete_order:
        session.execute(delete(model))
    session.commit()


def seed(session: Session) -> None:
    """Populate the dev database with deterministic seed rows."""
    clear_all(session)

    # --- tenant + school ---------------------------------------------------
    tenant = Tenant(
        id=1,
        name="TK Menteng Ceria",
        jenjang_type=JenjangType.SD,
        kurikulum_version="Merdeka 2024",
        config={"fase": "A", "grade_scale": "0-100", "week_start": "Senin"},
    )
    session.add(tenant)
    session.flush()

    # --- users (all 6 roles) ----------------------------------------------
    users = [
        User(
            id=1,
            tenant_id=1,
            school_id=None,
            email="superadmin@menteng.sch.id",
            hashed_auth_ref=_hash(SEED_PASSWORD),
            role=UserRole.SUPER_ADMIN,
            full_name="Yayasan Menteng",
        ),
        User(
            id=2,
            tenant_id=1,
            school_id=1,
            email="tatausaha@menteng.sch.id",
            hashed_auth_ref=_hash(SEED_PASSWORD),
            role=UserRole.ADMIN,
            full_name="Rina Kartika",
        ),
        User(
            id=3,
            tenant_id=1,
            school_id=1,
            email="budi@menteng.sch.id",
            hashed_auth_ref=_hash(SEED_PASSWORD),
            role=UserRole.PRINCIPAL,
            full_name="Budi Santoso",
        ),
        User(
            id=4,
            tenant_id=1,
            school_id=1,
            email="siti@menteng.sch.id",
            hashed_auth_ref=_hash(SEED_PASSWORD),
            role=UserRole.TEACHER,
            full_name="Siti Aminah",
        ),
        User(
            id=5,
            tenant_id=1,
            school_id=1,
            email="andi@menteng.sch.id",
            hashed_auth_ref=_hash(SEED_PASSWORD),
            role=UserRole.TEACHER,
            full_name="Andi Wijaya",
        ),
        User(
            id=6,
            tenant_id=1,
            school_id=1,
            email="dewi@menteng.sch.id",
            hashed_auth_ref=_hash(SEED_PASSWORD),
            role=UserRole.STUDENT,
            full_name="Dewi Lestari",
        ),
        User(
            id=7,
            tenant_id=1,
            school_id=1,
            email="rian@menteng.sch.id",
            hashed_auth_ref=_hash(SEED_PASSWORD),
            role=UserRole.STUDENT,
            full_name="Rian Pratama",
        ),
        User(
            id=8,
            tenant_id=1,
            school_id=1,
            email="putri@menteng.sch.id",
            hashed_auth_ref=_hash(SEED_PASSWORD),
            role=UserRole.STUDENT,
            full_name="Putri Anggraini",
        ),
        User(
            id=9,
            tenant_id=1,
            school_id=1,
            email="bayu@menteng.sch.id",
            hashed_auth_ref=_hash(SEED_PASSWORD),
            role=UserRole.STUDENT,
            full_name="Bayu Nugroho",
        ),
        User(
            id=10,
            tenant_id=1,
            school_id=1,
            email="hendra@menteng.sch.id",
            hashed_auth_ref=_hash(SEED_PASSWORD),
            role=UserRole.PARENT,
            full_name="Hendra Lestari",
        ),
        User(
            id=11,
            tenant_id=1,
            school_id=1,
            email="maya@menteng.sch.id",
            hashed_auth_ref=_hash(SEED_PASSWORD),
            role=UserRole.PARENT,
            full_name="Maya Pratama",
        ),
    ]
    session.add_all(users)
    session.flush()

    school = School(
        id=1,
        tenant_id=1,
        name="SDN Menteng 01",
        address="Jl. Menteng Raya No. 1, Jakarta Pusat",
        principal_id=3,
    )
    session.add(school)
    session.flush()

    # --- classes -----------------------------------------------------------
    classes = [
        Class(
            id=1,
            school_id=1,
            name="1A",
            grade_level=1,
            wali_kelas_id=4,
            academic_year=ACADEMIC_YEAR,
        ),
        Class(
            id=2,
            school_id=1,
            name="2B",
            grade_level=2,
            wali_kelas_id=5,
            academic_year=ACADEMIC_YEAR,
        ),
        Class(id=3, school_id=1, name="3A", grade_level=3, academic_year=ACADEMIC_YEAR),
        Class(id=4, school_id=1, name="4B", grade_level=4, academic_year=ACADEMIC_YEAR),
    ]
    session.add_all(classes)
    session.flush()

    # --- students (linked to student users) --------------------------------
    students = [
        Student(
            id=1,
            user_id=6,
            school_id=1,
            class_id=1,
            nis="2024001",
            birth_date=date(2017, 3, 14),
            enrollment_status="active",
        ),
        Student(
            id=2,
            user_id=7,
            school_id=1,
            class_id=1,
            nis="2024002",
            birth_date=date(2017, 7, 2),
            enrollment_status="active",
        ),
        Student(
            id=3,
            user_id=8,
            school_id=1,
            class_id=2,
            nis="2023003",
            birth_date=date(2016, 1, 25),
            enrollment_status="active",
        ),
        Student(
            id=4,
            user_id=9,
            school_id=1,
            class_id=3,
            nis="2022004",
            birth_date=date(2015, 11, 9),
            enrollment_status="active",
        ),
    ]
    session.add_all(students)
    session.flush()

    # --- subjects ----------------------------------------------------------
    subjects = [
        Subject(
            id=1,
            tenant_id=1,
            name="Matematika",
            category="formal",
            applicable_grade_levels=[1, 2, 3, 4],
        ),
        Subject(
            id=2,
            tenant_id=1,
            name="Bahasa Indonesia",
            category="formal",
            applicable_grade_levels=[1, 2, 3, 4],
        ),
        Subject(
            id=3,
            tenant_id=1,
            name="IPA",
            category="formal",
            applicable_grade_levels=[3, 4],
        ),
        Subject(
            id=4,
            tenant_id=1,
            name="IPS",
            category="formal",
            applicable_grade_levels=[3, 4],
        ),
        Subject(
            id=5,
            tenant_id=1,
            name="Bahasa Inggris",
            category="formal",
            applicable_grade_levels=[1, 2, 3, 4],
        ),
        Subject(
            id=6,
            tenant_id=1,
            name="PJOK",
            category="formal",
            applicable_grade_levels=[1, 2, 3, 4],
        ),
    ]
    session.add_all(subjects)
    session.flush()

    # --- schedules (3-5 per class) ----------------------------------------
    days = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"]
    schedules: list[Schedule] = []
    schedule_id = 1
    teachers = [4, 5]
    for klass in classes:
        for period in range(1, 4):
            subject_id = ((klass.id + period) % len(subjects)) + 1
            start_hour = 6 + period
            schedules.append(
                Schedule(
                    id=schedule_id,
                    class_id=klass.id,
                    subject_id=subject_id,
                    teacher_id=teachers[period % 2],
                    day_of_week=days[(klass.id + period) % len(days)],
                    period_number=period,
                    start_time=time(start_hour, 0),
                    end_time=time(start_hour, 45),
                )
            )
            schedule_id += 1
    session.add_all(schedules)

    # --- attendance for today ---------------------------------------------
    today = date.today()
    statuses = [
        AttendanceStatus.HADIR,
        AttendanceStatus.HADIR,
        AttendanceStatus.IZIN,
        AttendanceStatus.SAKIT,
    ]
    for idx, student in enumerate(students, start=1):
        session.add(
            Attendance(
                id=idx,
                student_id=student.id,
                class_id=student.class_id or 1,
                date=today,
                status=statuses[idx - 1],
                recorded_by=4,
                note=None,
            )
        )

    # --- grades ------------------------------------------------------------
    grade_id = 1
    for student in students:
        for subject in subjects[:3]:
            session.add(
                Grade(
                    id=grade_id,
                    student_id=student.id,
                    subject_id=subject.id,
                    semester=SEMESTER,
                    category=GradeCategory.FORMATIF,
                    score=75.0 + (grade_id % 20),
                    description="Capaian baik",
                    recorded_by=4,
                )
            )
            grade_id += 1

    # --- report cards ------------------------------------------------------
    for student in students:
        session.add(
            ReportCard(
                id=student.id,
                student_id=student.id,
                semester=SEMESTER,
                status=ReportCardStatus.DRAFT,
                kurikulum_version="Merdeka 2024",
                compiled_data={"fase": "A", "subjects": {"Matematika": 85}},
            )
        )

    # --- SPP bills + one payment ------------------------------------------
    for idx, student in enumerate(students, start=1):
        session.add(
            SppBill(
                id=idx,
                student_id=student.id,
                period="2024-07",
                amount=350000.0,
                due_date=today + timedelta(days=10),
                status=SppBillStatus.PAID if idx == 1 else SppBillStatus.UNPAID,
                created_by=2,
            )
        )
    session.flush()
    session.add(
        SppPayment(
            id=1,
            bill_id=1,
            paid_at=utcnow(),
            method="transfer",
            amount=350000.0,
            receipt_no="RCPT-2024-0001",
            recorded_by=2,
        )
    )

    # --- announcements -----------------------------------------------------
    session.add_all(
        [
            Announcement(
                id=1,
                tenant_id=1,
                school_id=1,
                author_id=3,
                audience=AnnouncementAudience.ALL,
                title="Rapat Orang Tua",
                body="Rapat orang tua akan dilaksanakan hari Sabtu pukul 09.00.",
                published_at=utcnow(),
            ),
            Announcement(
                id=2,
                tenant_id=1,
                school_id=1,
                author_id=4,
                audience=AnnouncementAudience.CLASS,
                title="PR Matematika 1A",
                body="Kerjakan halaman 12-13 untuk besok.",
                published_at=utcnow(),
            ),
        ]
    )

    # --- message thread ----------------------------------------------------
    thread = MessageThread(
        id=1,
        tenant_id=1,
        school_id=1,
        participant_ids=[4, 10],
        subject="Perkembangan Dewi",
        created_at=utcnow(),
    )
    session.add(thread)
    session.flush()
    session.add(
        Message(
            id=1,
            thread_id=1,
            sender_id=4,
            body="Dewi menunjukkan kemajuan baik di Matematika.",
            sent_at=datetime.now(timezone.utc),
        )
    )

    session.commit()


def counts(session: Session) -> dict[str, int]:
    """Return row counts used by the CLI report and /api/db-info."""
    return {
        "tables": len(Base.metadata.tables),
        "tenants": session.scalar(select(func.count()).select_from(Tenant)) or 0,
        "users": session.scalar(select(func.count()).select_from(User)) or 0,
        "students": session.scalar(select(func.count()).select_from(Student)) or 0,
        "classes": session.scalar(select(func.count()).select_from(Class)) or 0,
        "subjects": session.scalar(select(func.count()).select_from(Subject)) or 0,
    }


def main() -> dict[str, int]:
    """Create tables (dev) and seed, returning resulting counts."""
    create_all()
    session = SessionLocal()
    try:
        seed(session)
        result = counts(session)
    finally:
        session.close()
    print(f"seed complete: {result}")
    return result


if __name__ == "__main__":
    main()
