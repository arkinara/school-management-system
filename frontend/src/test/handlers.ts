import { http, HttpResponse } from "msw";
import type {
  AnnouncementRecord,
  AttendanceBulkResult,
  AttendanceRecord,
  AttendanceTodaySummary,
  ClassRecord,
  GradeBulkResult,
  GradeRecord,
  Paginated,
  ScheduleRecord,
  SchoolRecord,
  SppBill,
  SppPayment,
  SppSummary,
  StudentRecord,
  SubjectRecord,
  UserRecord,
} from "@/lib/endpoints";
import type { AuthResponse, UserMe } from "@/lib/auth";

export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function page<T>(items: T[], total = items.length, size?: number): Paginated<T> {
  return { items, total, page: 1, size: size ?? items.length };
}

const TEACHER_ID = 2;

const principalUser: UserMe = {
  user: {
    id: 3,
    tenant_id: 1,
    school_id: 1,
    email: "budi@menteng.sch.id",
    role: "principal",
    full_name: "Budi Santoso",
    created_at: "2026-01-01",
  },
  tenant_id: 1,
  school_id: 1,
  role: "principal",
};

const teacherUser: UserRecord = {
  id: TEACHER_ID,
  tenant_id: 1,
  school_id: 1,
  email: "guru@menteng.sch.id",
  role: "teacher",
  full_name: "Guru Kelas",
  created_at: "2026-01-01",
  is_active: true,
};

export const classes: ClassRecord[] = [
  {
    id: 1,
    school_id: 1,
    name: "Kelas 5A",
    grade_level: 5,
    jurusan: null,
    wali_kelas_id: TEACHER_ID,
    academic_year: "2025/2026",
  },
  {
    id: 2,
    school_id: 1,
    name: "Kelas 5B",
    grade_level: 5,
    jurusan: null,
    wali_kelas_id: null,
    academic_year: "2025/2026",
  },
];

export const students: StudentRecord[] = [
  {
    id: 1,
    user_id: 10,
    school_id: 1,
    class_id: 1,
    nis: "2026001",
    full_name: "Ahmad Fauzi",
    email: "ahmad@menteng.sch.id",
    birth_date: "2015-05-12",
    enrollment_status: "active",
  },
  {
    id: 2,
    user_id: 11,
    school_id: 1,
    class_id: 1,
    nis: "2026002",
    full_name: "Siti Aminah",
    email: "siti@menteng.sch.id",
    birth_date: "2015-08-22",
    enrollment_status: "active",
  },
];

export const subjects: SubjectRecord[] = [
  { id: 1, tenant_id: 1, name: "Matematika", category: "umum", applicable_grade_levels: [5] },
];

export const schedules: ScheduleRecord[] = [];

export const attendanceSummary: AttendanceTodaySummary = {
  date: "2026-01-15",
  total: 10,
  counts: { hadir: 8, izin: 1, sakit: 0, alpa: 1 },
  items: [],
};

export const sppSummary: SppSummary = {
  bill_count: 10,
  total_billed: 5_000_000,
  total_collected: 3_250_000,
  total_outstanding: 1_750_000,
  collection_rate: 65,
  overdue_count: 2,
};

export const bills: SppBill[] = [
  {
    id: 1,
    student_id: 1,
    class_id: 1,
    period: "2026-01",
    amount: 500_000,
    due_date: "2026-01-10",
    status: "unpaid",
    created_by: 3,
    paid_amount: 0,
    balance: 500_000,
  },
  {
    id: 2,
    student_id: 2,
    class_id: 1,
    period: "2026-01",
    amount: 500_000,
    due_date: "2026-01-10",
    status: "overdue",
    created_by: 3,
    paid_amount: 100_000,
    balance: 400_000,
  },
];

export const announcements: AnnouncementRecord[] = [
  {
    id: 12,
    tenant_id: 1,
    school_id: 1,
    author_id: 3,
    audience: "all",
    title: "Libur Semester",
    body: "Sekolah libur mulai 20 Januari.",
    published_at: "2026-01-12T08:00:00Z",
    status: "published",
    target_class_id: null,
    target_tenant_id: null,
  },
];

/** GET /api/attendances/today is aggregated; return a fresh summary each call. */
export const handlers = [
  http.post(`${API}/api/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    if (body.email === "budi@menteng.sch.id" && body.password === "password123") {
      const response: AuthResponse = {
        user: principalUser.user,
        access_token: "mock-access-token",
        refresh_token: "mock-refresh-token",
        token_type: "bearer",
      };
      return HttpResponse.json(response);
    }
    return HttpResponse.json({ detail: "Invalid email or password" }, { status: 401 });
  }),

  http.get(`${API}/api/auth/me`, ({ request }) => {
    const auth = request.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return HttpResponse.json({ detail: "missing bearer token" }, { status: 401 });
    }
    return HttpResponse.json(principalUser);
  }),

  http.get(`${API}/api/classes`, () => HttpResponse.json(page(classes, classes.length))),

  http.get(`${API}/api/subjects`, () => HttpResponse.json(page(subjects, subjects.length))),

  http.get(`${API}/api/schools`, () => {
    const schools: SchoolRecord[] = [
      {
        id: 1,
        tenant_id: 1,
        name: "SDN Menteng 01",
        address: "Jl. Menteng",
        principal_id: 3,
        created_at: "2026-01-01",
      },
    ];
    return HttpResponse.json(page(schools, schools.length));
  }),

  http.get(`${API}/api/users`, () => HttpResponse.json(page([teacherUser], 5, 1))),

  http.get(`${API}/api/students`, ({ request }) => {
    const url = new URL(request.url);
    const size = Number(url.searchParams.get("size") ?? students.length);
    if (size <= 1) return HttpResponse.json(page(students.slice(0, 1), 12, size));
    return HttpResponse.json(page(students, students.length, size));
  }),

  http.get(`${API}/api/schedules/teacher/:teacherId`, () => HttpResponse.json(schedules)),

  http.get(`${API}/api/schedules`, () => HttpResponse.json(page(schedules, 0))),

  http.get(`${API}/api/attendances/today`, () => HttpResponse.json(attendanceSummary)),

  http.get(`${API}/api/attendances`, ({ request }) => {
    const url = new URL(request.url);
    if (url.searchParams.has("class_id")) {
      return HttpResponse.json(
        page<AttendanceRecord>([], 0, Number(url.searchParams.get("size") ?? 200))
      );
    }
    const rows: AttendanceRecord[] = Array.from({ length: 10 }, (_, index) => ({
      id: index + 1,
      student_id: (index % 2) + 1,
      class_id: 1,
      date: url.searchParams.get("date") ?? "2026-01-15",
      status: index < 8 ? "hadir" : "alpa",
      recorded_by: TEACHER_ID,
      note: null,
    }));
    return HttpResponse.json(page(rows, rows.length));
  }),

  http.post(`${API}/api/attendances/bulk`, async ({ request }) => {
    const body = (await request.json()) as { class_id: number; date: string; entries: unknown[] };
    const result: AttendanceBulkResult = {
      class_id: body.class_id,
      date: body.date,
      created: body.entries.length,
    };
    return HttpResponse.json(result);
  }),

  http.patch(`${API}/api/attendances/:id`, async ({ request, params }) => {
    const body = (await request.json()) as { status?: AttendanceRecord["status"] };
    const record: AttendanceRecord = {
      id: Number(params.id),
      student_id: 1,
      class_id: 1,
      date: "2026-01-15",
      status: body.status ?? "hadir",
      recorded_by: TEACHER_ID,
      note: null,
    };
    return HttpResponse.json(record);
  }),

  http.get(`${API}/api/grades`, () => HttpResponse.json(page<GradeRecord>([], 0))),

  http.post(`${API}/api/grades/bulk`, async ({ request }) => {
    const body = (await request.json()) as {
      class_id: number;
      subject_id: number;
      semester: string;
      category: GradeRecord["category"];
      entries: unknown[];
    };
    const result: GradeBulkResult = {
      class_id: body.class_id,
      subject_id: body.subject_id,
      semester: body.semester,
      category: body.category,
      created: body.entries.length,
    };
    return HttpResponse.json(result);
  }),

  http.get(`${API}/api/spp/bills`, () => HttpResponse.json(page(bills, bills.length))),

  http.post(`${API}/api/spp/payments`, async ({ request }) => {
    const body = (await request.json()) as {
      bill_id: number;
      method: string;
      amount: number;
      receipt_no: string;
    };
    const payment: SppPayment = {
      id: 99,
      bill_id: body.bill_id,
      paid_at: "2026-01-15T09:00:00Z",
      method: body.method,
      amount: body.amount,
      receipt_no: body.receipt_no,
      recorded_by: 3,
    };
    return HttpResponse.json(payment);
  }),

  http.get(`${API}/api/spp/summary`, () => HttpResponse.json(sppSummary)),

  http.get(`${API}/api/announcements`, () =>
    HttpResponse.json(page(announcements, announcements.length))
  ),
];
