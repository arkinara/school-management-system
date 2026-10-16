import { http, HttpResponse } from "msw";
import type {
  AnnouncementRecord,
  AttendanceBulkResult,
  AttendanceRecord,
  AttendanceRow,
  AttendanceTodaySummary,
  ClassRecord,
  GradeBulkResult,
  GradeRecord,
  MessageRecord,
  MessageThreadRecord,
  Paginated,
  ScheduleRecord,
  SchoolRecord,
  ServerNotification,
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
    status: "partially_paid",
    created_by: 3,
    paid_amount: 100_000,
    balance: 400_000,
  },
];

export const payments: SppPayment[] = [];

/** Build an updated bill after applying a payment amount. */
export function applyPaymentToBill(bill: SppBill, amount: number): SppBill {
  const paid = bill.paid_amount + amount;
  const balance = Math.max(bill.amount - paid, 0);
  const status: SppBill["status"] = paid >= bill.amount ? "paid" : "partially_paid";
  return { ...bill, paid_amount: paid, balance, status };
}

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

export const messageThreads: MessageThreadRecord[] = [
  {
    id: 5,
    tenant_id: 1,
    school_id: 1,
    student_id: 1,
    created_by: 3,
    participant_ids: [3, 2],
    subject: "Perkembangan Ahmad",
    created_at: "2026-01-14T08:00:00Z",
    last_message: {
      id: 51,
      thread_id: 5,
      sender_id: 2,
      body: "Ahmad aktif di kelas.",
      sent_at: "2026-01-14T09:00:00Z",
      read_at: null,
    },
  },
];

export const messages: MessageRecord[] = [
  {
    id: 50,
    thread_id: 5,
    sender_id: 3,
    body: "Bagaimana perkembangan Ahmad?",
    sent_at: "2026-01-14T08:30:00Z",
    read_at: "2026-01-14T08:40:00Z",
  },
  {
    id: 51,
    thread_id: 5,
    sender_id: 2,
    body: "Ahmad aktif di kelas.",
    sent_at: "2026-01-14T09:00:00Z",
    read_at: null,
  },
];

export const serverNotifications: ServerNotification[] = [
  {
    id: 1,
    user_id: 3,
    type: "attendance_alert",
    title: "Kehadiran Ahmad",
    body: "Ahmad ditandai alpa pada 2026-01-15",
    link: "/dashboard/orang-tua/attendance/1",
    is_read: false,
    created_at: "2026-01-15T07:00:00Z",
    read_at: null,
  },
  {
    id: 2,
    user_id: 3,
    type: "spp_overdue",
    title: "SPP Ahmad Jatuh Tempo",
    body: "Tagihan SPP periode 2026-01 telah jatuh tempo.",
    link: "/dashboard/orang-tua/spp",
    is_read: false,
    created_at: "2026-01-15T06:00:00Z",
    read_at: null,
  },
  {
    id: 3,
    user_id: 3,
    type: "announcement",
    title: "Libur Semester",
    body: "Sekolah libur mulai 20 Januari.",
    link: "/dashboard/announcements",
    is_read: true,
    created_at: "2026-01-14T05:00:00Z",
    read_at: "2026-01-14T06:00:00Z",
  },
  {
    id: 4,
    user_id: 3,
    type: "message",
    title: "Perkembangan Ahmad",
    body: "Ahmad aktif di kelas.",
    link: "/dashboard/messages?thread=5",
    is_read: true,
    created_at: "2026-01-13T05:00:00Z",
    read_at: "2026-01-13T06:00:00Z",
  },
  {
    id: 5,
    user_id: 3,
    type: "attendance_alert",
    title: "Kehadiran Siti",
    body: "Siti ditandai izin pada 2026-01-12",
    link: "/dashboard/orang-tua/attendance/2",
    is_read: true,
    created_at: "2026-01-12T05:00:00Z",
    read_at: "2026-01-12T06:00:00Z",
  },
  {
    id: 6,
    user_id: 3,
    type: "spp_overdue",
    title: "SPP Siti Jatuh Tempo",
    body: "Tagihan SPP periode 2025-12 telah jatuh tempo.",
    link: "/dashboard/orang-tua/spp",
    is_read: true,
    created_at: "2026-01-11T05:00:00Z",
    read_at: "2026-01-11T06:00:00Z",
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

  http.get(`${API}/api/academic/active-semester`, () =>
    HttpResponse.json({
      semester: "2026/2027-ganjil",
      academic_year: "2026/2027",
      term: "ganjil",
    })
  ),

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

  http.get(`${API}/api/schedules/class/:classId`, () => HttpResponse.json(schedules)),

  http.get(`${API}/api/schedules/by-class/:classId`, () => HttpResponse.json(schedules)),

  http.post(`${API}/api/schedules/bulk-replace/:classId`, () => HttpResponse.json([])),

  http.get(`${API}/api/schedules`, () => HttpResponse.json(page(schedules, 0))),

  http.get(`${API}/api/parents/:id/children`, () => HttpResponse.json([])),

  http.get(`${API}/api/attendances/today`, () => HttpResponse.json(attendanceSummary)),

  http.get(`${API}/api/attendances`, ({ request }) => {
    const url = new URL(request.url);
    if (url.searchParams.has("class_id")) {
      // Roster endpoint: every class student, default hadir when unrecorded.
      const date = url.searchParams.get("date") ?? "2026-01-15";
      const roster: AttendanceRow[] = students.map((student) => ({
        id: 0,
        student_id: student.id,
        class_id: 1,
        date,
        status: "hadir",
        recorded_by: TEACHER_ID,
        note: null,
        student: { id: student.id, full_name: student.full_name, nis: student.nis },
      }));
      return HttpResponse.json(
        page(roster, roster.length, Number(url.searchParams.get("size") ?? 100))
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

  http.get(`${API}/api/report-cards`, () => HttpResponse.json(page([], 0))),

  http.get(`${API}/api/teacher-assignments`, () =>
    HttpResponse.json([
      {
        id: 1,
        teacher_id: TEACHER_ID,
        subject_id: 1,
        class_id: 1,
        academic_year: "2025/2026",
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: 2,
        teacher_id: TEACHER_ID,
        subject_id: 1,
        class_id: 2,
        academic_year: "2025/2026",
        created_at: "2026-01-01T00:00:00Z",
      },
    ])
  ),

  http.get(`${API}/api/grades/aggregate`, ({ request }) => {
    const url = new URL(request.url);
    const classId = Number(url.searchParams.get("class_id") ?? 1);
    const semester = url.searchParams.get("semester") ?? "2026/2027-ganjil";
    const emptyCategory = () => ({
      scores: [],
      avg: null,
      complete: false,
      missing: ["assessment_1"],
    });
    return HttpResponse.json({
      class_id: classId,
      semester,
      subjects: [
        {
          subject_id: 1,
          subject_name: "Matematika",
          students: students
            .filter((student) => student.class_id === classId)
            .map((student) => ({
              student_id: student.id,
              student_name: student.full_name,
              categories: {
                formatif: emptyCategory(),
                sumatif: emptyCategory(),
                PR: emptyCategory(),
                tugas: emptyCategory(),
              },
              total_avg: null,
            })),
        },
      ],
    });
  }),

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

  http.get(`${API}/api/spp/bills/overdue`, () => HttpResponse.json(page(bills, bills.length))),

  http.post(`${API}/api/spp/bills`, async ({ request }) => {
    const body = (await request.json()) as {
      student_id: number;
      period: string;
      amount: number;
      due_date: string;
    };
    const bill: SppBill = {
      id: 500,
      student_id: body.student_id,
      class_id: 1,
      period: body.period,
      amount: body.amount,
      due_date: body.due_date,
      status: "unpaid",
      created_by: 3,
      paid_amount: 0,
      balance: body.amount,
    };
    return HttpResponse.json(bill, { status: 201 });
  }),

  http.post(`${API}/api/spp/bills/bulk-generate`, async ({ request }) => {
    const body = (await request.json()) as { class_id?: number; period: string };
    return HttpResponse.json(
      {
        created: 2,
        skipped: 0,
        no_students: 2,
        message: `2 bill created for ${body.period}`,
      },
      { status: 201 }
    );
  }),

  http.post(`${API}/api/spp/bills/:billId/payments`, async ({ request, params }) => {
    const body = (await request.json()) as {
      amount: number;
      method: string;
      note?: string | null;
    };
    const billId = Number(params.billId);
    const base = bills.find((bill) => bill.id === billId) ?? bills[0];
    const payment: SppPayment = {
      id: 99,
      school_id: 1,
      bill_id: billId,
      paid_at: "2026-01-15T09:00:00Z",
      method: body.method,
      amount: body.amount,
      receipt_no: 42,
      recorded_by: 3,
      voided: false,
    };
    return HttpResponse.json(
      { bill: applyPaymentToBill(base, body.amount), payment },
      { status: 201 }
    );
  }),

  http.delete(`${API}/api/spp/payments/:paymentId`, () => new HttpResponse(null, { status: 204 })),

  http.post(`${API}/api/spp/bills/:billId/remind`, () => HttpResponse.json({ notified: 1 })),

  http.delete(`${API}/api/spp/bills/:billId/remind`, () => new HttpResponse(null, { status: 204 })),

  http.get(`${API}/api/spp/payments`, () => HttpResponse.json(page(payments, payments.length))),

  http.post(`${API}/api/spp/payments`, async ({ request }) => {
    const body = (await request.json()) as {
      bill_id: number;
      method: string;
      amount: number;
    };
    const payment: SppPayment = {
      id: 99,
      school_id: 1,
      bill_id: body.bill_id,
      paid_at: "2026-01-15T09:00:00Z",
      method: body.method,
      amount: body.amount,
      receipt_no: 42,
      recorded_by: 3,
    };
    return HttpResponse.json(payment, { status: 201 });
  }),

  http.get(`${API}/api/spp/summary`, () => HttpResponse.json(sppSummary)),

  http.get(`${API}/api/announcements`, () =>
    HttpResponse.json(page(announcements, announcements.length))
  ),

  http.get(`${API}/api/public/tenants`, () =>
    HttpResponse.json([
      { id: 1, name: "TK Menteng Ceria", jenjang_type: "SD" },
      { id: 2, name: "SMP Menteng", jenjang_type: "SMP" },
    ])
  ),

  http.get(`${API}/api/public/schools`, ({ request }) => {
    const tenantId = Number(new URL(request.url).searchParams.get("tenant_id") ?? 1);
    return HttpResponse.json([
      { id: 1, name: "SDN Menteng 01", tenant_id: tenantId },
      { id: 2, name: "SDN Menteng 02", tenant_id: tenantId },
    ]);
  }),

  http.post(`${API}/api/auth/complete-onboarding`, async ({ request }) => {
    const body = (await request.json()) as { school_id?: number };
    const response: AuthResponse = {
      user: { ...principalUser.user, school_id: body.school_id ?? principalUser.user.school_id },
      access_token: "mock-access-token-onboarded",
      token_type: "bearer",
    };
    return HttpResponse.json(response);
  }),

  http.post(`${API}/api/announcements/:id/reject`, ({ params }) =>
    HttpResponse.json({
      ...announcements[0],
      id: Number(params.id),
      status: "denied",
    })
  ),

  http.get(`${API}/api/tenants`, () =>
    HttpResponse.json([
      {
        id: 1,
        name: "SDN Menteng 01",
        jenjang_type: "SD",
        kurikulum_version: "kurikulum_merdeka",
        config: null,
        created_at: "2026-01-01",
        school_count: 1,
      },
      {
        id: 2,
        name: "SMP Nusantara",
        jenjang_type: "SMP",
        kurikulum_version: "kurikulum_merdeka",
        config: null,
        created_at: "2026-01-01",
        school_count: 1,
      },
    ])
  ),

  http.get(`${API}/api/message-threads`, () =>
    HttpResponse.json(page(messageThreads, messageThreads.length))
  ),

  http.post(`${API}/api/message-threads`, async ({ request }) => {
    const body = (await request.json()) as { student_id: number; subject: string };
    const thread: MessageThreadRecord = {
      id: 90,
      tenant_id: 1,
      school_id: 1,
      student_id: body.student_id,
      created_by: 3,
      participant_ids: [3, 2],
      subject: body.subject,
      created_at: "2026-01-16T08:00:00Z",
      last_message: null,
    };
    return HttpResponse.json(thread, { status: 201 });
  }),

  http.get(`${API}/api/message-threads/:threadId/messages`, ({ params }) =>
    HttpResponse.json(page(messages, messages.length))
  ),

  http.post(`${API}/api/message-threads/:threadId/messages`, async ({ request, params }) => {
    const body = (await request.json()) as { body: string };
    const record: MessageRecord = {
      id: 999,
      thread_id: Number(params.threadId),
      sender_id: 3,
      body: body.body,
      sent_at: "2026-01-16T09:00:00Z",
      read_at: null,
    };
    return HttpResponse.json(record, { status: 201 });
  }),

  http.post(
    `${API}/api/message-threads/:threadId/read`,
    () => new HttpResponse(null, { status: 204 })
  ),

  http.get(`${API}/api/message-threads/:threadId/moderator-view`, ({ params }) =>
    HttpResponse.json({
      thread:
        messageThreads.find((thread) => thread.id === Number(params.threadId)) ?? messageThreads[0],
      messages,
    })
  ),

  http.get(`${API}/api/notifications/unread-count`, () => HttpResponse.json({ count: 2 })),

  http.get(`${API}/api/notifications`, ({ request }) => {
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
    return HttpResponse.json(serverNotifications.slice(0, limit));
  }),

  http.post(
    `${API}/api/notifications/mark-all-read`,
    () => new HttpResponse(null, { status: 204 })
  ),

  http.post(`${API}/api/notifications/:id/read`, () => new HttpResponse(null, { status: 204 })),
];
