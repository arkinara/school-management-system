/**
 * Typed API client for the domain endpoints built in tickets #5-#7.
 *
 * Thin wrappers over `apiFetch` (which owns auth + error handling) so
 * dashboard widgets can consume backend data without re-deriving URLs or
 * response shapes. Every list endpoint returns the shared paginated envelope.
 */

import { ApiError, apiFetch } from "./api";
import type { UserMe } from "./auth";
import { todayDayOfWeek } from "./days";

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

/**
 * Page through a list endpoint until every row is fetched (or `maxItems`).
 *
 * The BE caps a single page at 100, so full-list consumers (roster pickers,
 * rate/KPI calculations) must use this instead of requesting `size > 100`.
 */
export async function fetchAll<T>(
  fetcher: (params: { page: number; size: number }) => Promise<Paginated<T>>,
  options: { maxItems?: number; size?: number } = {}
): Promise<T[]> {
  const size = options.size ?? 100;
  const max = options.maxItems ?? Infinity;
  const all: T[] = [];
  let page = 1;
  while (all.length < max) {
    const res = await fetcher({ page, size });
    all.push(...res.items);
    if (res.items.length < size || all.length >= res.total) break;
    page++;
  }
  return all.slice(0, max);
}

export interface StudentRecord {
  id: number;
  user_id: number;
  school_id: number;
  class_id: number | null;
  nis: string;
  full_name: string | null;
  email: string | null;
  birth_date: string | null;
  enrollment_status: string;
}

export interface UserRecord {
  id: number;
  tenant_id: number;
  school_id: number | null;
  email: string;
  role: string;
  full_name: string;
  created_at: string;
  is_active: boolean;
}

export interface ClassRecord {
  id: number;
  school_id: number;
  name: string;
  grade_level: number;
  jurusan: string | null;
  wali_kelas_id: number | null;
  academic_year: string;
}

export interface SchoolRecord {
  id: number;
  tenant_id: number;
  name: string;
  address: string | null;
  principal_id: number | null;
  created_at: string;
}

export interface ChildSummary {
  id: number;
  user_id: number;
  nis: string;
  full_name: string;
  class_id: number | null;
  enrollment_status: string;
  relationship: string;
  is_primary: boolean;
}

export interface ParentRecord {
  id: number;
  tenant_id: number;
  school_id: number | null;
  full_name: string;
  email: string;
  children: ChildSummary[];
}

export interface TenantRecord {
  id: number;
  name: string;
  jenjang_type: string;
  kurikulum_version: string;
  config: Record<string, unknown> | null;
  created_at: string;
  school_count: number;
}

type QueryValue = string | number | boolean | undefined | null;

function toQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/** GET /api/students — tenant/school-scoped roster. */
export function fetchStudents(
  params: { school_id?: number; class_id?: number; page?: number; size?: number } = {}
): Promise<Paginated<StudentRecord>> {
  return apiFetch<Paginated<StudentRecord>>(`/api/students${toQuery(params)}`);
}

/** GET /api/users — tenant-scoped user list, filterable by role/school. */
export function fetchUsers(
  params: { role?: string; school_id?: number; page?: number; size?: number } = {}
): Promise<Paginated<UserRecord>> {
  return apiFetch<Paginated<UserRecord>>(`/api/users${toQuery(params)}`);
}

/** GET /api/classes — tenant-scoped classes, filterable by school/grade. */
export function fetchClasses(
  params: { school_id?: number; grade_level?: number; page?: number; size?: number } = {}
): Promise<Paginated<ClassRecord>> {
  return apiFetch<Paginated<ClassRecord>>(`/api/classes${toQuery(params)}`);
}

/** GET /api/schools — schools in the caller's tenant (or any for super_admin). */
export function fetchSchools(
  params: { tenant_id?: number; page?: number; size?: number } = {}
): Promise<Paginated<SchoolRecord>> {
  return apiFetch<Paginated<SchoolRecord>>(`/api/schools${toQuery(params)}`);
}

/** GET /api/parents — tenant-scoped parent users (super_admin sees all). */
export function fetchParents(
  params: { page?: number; size?: number } = {}
): Promise<Paginated<ParentRecord>> {
  return apiFetch<Paginated<ParentRecord>>(`/api/parents${toQuery(params)}`);
}

/** GET /api/parents/{id}/children — sibling lookup for a parent user. */
export function fetchParentChildren(parentId: number): Promise<ChildSummary[]> {
  return apiFetch<ChildSummary[]>(`/api/parents/${parentId}/children`);
}

/** GET /api/tenants — every jenjang tenant (super_admin only). */
export function fetchTenants(): Promise<TenantRecord[]> {
  return apiFetch<TenantRecord[]>("/api/tenants");
}

/** GET /api/auth/me — current profile (throws on 401 instead of nulling). */
export function fetchMe(): Promise<UserMe> {
  return apiFetch<UserMe>("/api/auth/me");
}

/* ==========================================================================
   Absensi (#14) — daily attendance entry
   ========================================================================== */

export type AttendanceStatus = "hadir" | "izin" | "sakit" | "alpa";

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ["hadir", "izin", "sakit", "alpa"];

export interface AttendanceRecord {
  id: number;
  student_id: number;
  class_id: number;
  date: string;
  status: AttendanceStatus;
  recorded_by: number;
  note: string | null;
}

export interface AttendanceStudentSummary {
  id: number;
  full_name: string | null;
  nis: string;
}

/**
 * A roster row from `GET /api/attendances?class_id=&date=`.
 *
 * The backend returns every active student in the class, synthesising a
 * default `hadir` row (id 0) for anyone not yet recorded. Some backends also
 * embed the student summary; `student` is optional because it may need to be
 * joined locally from the students endpoint.
 */
export interface AttendanceRow extends AttendanceRecord {
  recorded_at?: string;
  student?: AttendanceStudentSummary;
}

export interface AttendanceEntryInput {
  student_id: number;
  status: AttendanceStatus;
  note?: string | null;
}

export interface AttendanceBulkResult {
  class_id: number;
  date: string;
  created: number;
}

/** GET /api/attendances — scoped list with optional class/date filters. */
export function fetchAttendances(
  params: {
    class_id?: number;
    date?: string;
    student_id?: number;
    page?: number;
    size?: number;
  } = {}
): Promise<Paginated<AttendanceRecord>> {
  return apiFetch<Paginated<AttendanceRecord>>(`/api/attendances${toQuery(params)}`);
}

/**
 * GET /api/attendances?class_id=&date= — the full class roster for one date.
 *
 * Returns all students in the class with a default `hadir` status for rows
 * that have not been recorded yet (id 0), so the page never needs an
 * oversized paginated fetch.
 */
export function fetchAttendanceRoster(params: {
  class_id: number;
  date: string;
}): Promise<AttendanceRow[]> {
  return apiFetch<Paginated<AttendanceRow>>(`/api/attendances${toQuery(params)}`).then(
    (page) => page.items
  );
}

/** POST /api/attendances/bulk — one row per student for a class/date. */
export function bulkSaveAttendances(input: {
  class_id: number;
  date: string;
  entries: AttendanceEntryInput[];
}): Promise<AttendanceBulkResult> {
  return apiFetch<AttendanceBulkResult>("/api/attendances/bulk", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** PATCH /api/attendances/{id} — correct an already-saved row. */
export function updateAttendance(
  id: number,
  input: { status?: AttendanceStatus; note?: string | null }
): Promise<AttendanceRecord> {
  return apiFetch<AttendanceRecord>(`/api/attendances/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/* ==========================================================================
   Penilaian (#16) — categories, roster scores, subjects
   ========================================================================== */

export type GradeCategory = "formatif" | "sumatif" | "PR" | "tugas";

export const GRADE_CATEGORIES: { value: GradeCategory; label: string }[] = [
  { value: "formatif", label: "Formatif" },
  { value: "sumatif", label: "Sumatif" },
  { value: "PR", label: "PR" },
  { value: "tugas", label: "Tugas" },
];

export interface GradeRecord {
  id: number;
  student_id: number;
  subject_id: number;
  semester: string;
  category: GradeCategory;
  score: number;
  description: string | null;
  recorded_by: number;
}

export interface GradeBulkResult {
  class_id: number;
  subject_id: number;
  semester: string;
  category: GradeCategory;
  created: number;
}

export interface SubjectRecord {
  id: number;
  tenant_id: number;
  name: string;
  category: string;
  applicable_grade_levels: number[] | null;
}

/** GET /api/grades — scoped grade list with optional filters. */
export function fetchGrades(
  params: {
    student_id?: number;
    subject_id?: number;
    semester?: string;
    category?: string;
    page?: number;
    size?: number;
  } = {}
): Promise<Paginated<GradeRecord>> {
  return apiFetch<Paginated<GradeRecord>>(`/api/grades${toQuery(params)}`);
}

/** POST /api/grades/bulk — one category across a class roster. */
export function bulkSaveGrades(input: {
  class_id: number;
  subject_id: number;
  semester: string;
  category: GradeCategory;
  entries: { student_id: number; score: number; description?: string | null }[];
}): Promise<GradeBulkResult> {
  return apiFetch<GradeBulkResult>("/api/grades/bulk", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** GET /api/subjects — tenant-scoped subject/aspek list. */
export function fetchSubjects(
  params: { grade_level?: number; category?: string; page?: number; size?: number } = {}
): Promise<Paginated<SubjectRecord>> {
  return apiFetch<Paginated<SubjectRecord>>(`/api/subjects${toQuery(params)}`);
}

/* ==========================================================================
   Jadwal (#20) — weekly schedule
   ========================================================================== */

export interface ScheduleRecord {
  id: number;
  class_id: number;
  subject_id: number;
  teacher_id: number;
  day_of_week: number;
  period_number: number;
  start_time: string;
  end_time: string;
}

export interface ScheduleInput {
  subject_id: number;
  teacher_id: number;
  day_of_week: number;
  period_number: number;
  start_time: string;
  end_time: string;
}

/** One slot inside a bulk-replace payload (class_id comes from the path). */
export interface ScheduleBulkEntry {
  subject_id: number;
  teacher_id: number;
  day_of_week: number;
  period_number: number;
  start_time: string;
  end_time: string;
}

/**
 * A conflict entry returned in a 409 `detail.conflicts` list (#57/#58).
 *
 * Carries both the canonical `day_of_week`/`start_time`/`end_time` fields and
 * `type` (`teacher` | `class` | `batch`) so the FE can highlight the offending
 * grid cell.
 */
export interface ScheduleConflict {
  type: string;
  schedule_id: number;
  id: number;
  class_id: number;
  subject_id: number;
  teacher_id: number;
  day_of_week: number;
  period_number: number;
  start_time: string;
  end_time: string;
}

/** GET /api/schedules/class/{classId} — full weekly timetable for a class. */
export function getSchedule(classId: number): Promise<ScheduleRecord[]> {
  return apiFetch<ScheduleRecord[]>(`/api/schedules/class/${classId}`);
}

/**
 * GET /api/schedules/by-class/{classId} — relationship-aware class timetable.
 *
 * Unlike `getSchedule`, this variant also authorises parents/students via their
 * linked child's class, so the orang tua view can use it (#58).
 */
export function getClassScheduleByRelationship(classId: number): Promise<ScheduleRecord[]> {
  return apiFetch<ScheduleRecord[]>(`/api/schedules/by-class/${classId}`);
}

/**
 * POST /api/schedules/bulk-replace/{classId} — atomically replace a class's
 * whole timetable (#57). Returns the persisted, canonical slot list.
 */
export function bulkReplaceSchedules(
  classId: number,
  entries: ScheduleBulkEntry[]
): Promise<ScheduleRecord[]> {
  return apiFetch<ScheduleRecord[]>(`/api/schedules/bulk-replace/${classId}`, {
    method: "POST",
    body: JSON.stringify(entries),
  });
}

/** GET /api/schedules/teacher/{teacherId} — a teacher's weekly timetable. */
export function getTeacherSchedule(teacherId: number): Promise<ScheduleRecord[]> {
  return apiFetch<ScheduleRecord[]>(`/api/schedules/teacher/${teacherId}`);
}

/** GET /api/schedules/today — today's entries, optionally filtered by role. */
export function getTodaySchedule(
  params: { classId?: number; teacherId?: number } = {}
): Promise<ScheduleRecord[]> {
  const day = todayDayOfWeek();
  return apiFetch<Paginated<ScheduleRecord>>(
    `/api/schedules${toQuery({
      class_id: params.classId,
      teacher_id: params.teacherId,
      day_of_week: day,
      size: 100,
    })}`
  ).then((page) => page.items);
}

/** GET /api/schedules — paginated list with optional filters. */
export function fetchSchedules(
  params: {
    class_id?: number;
    teacher_id?: number;
    day_of_week?: number;
    page?: number;
    size?: number;
  } = {}
): Promise<Paginated<ScheduleRecord>> {
  return apiFetch<Paginated<ScheduleRecord>>(`/api/schedules${toQuery(params)}`);
}

/** POST /api/schedules/bulk — create every slot for one class. */
export function bulkSaveSchedules(input: {
  class_id: number;
  schedules: ScheduleInput[];
}): Promise<{ class_id: number; created: number }> {
  return apiFetch<{ class_id: number; created: number }>("/api/schedules/bulk", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** A teacher/user display name lookup record. */
export interface TeacherOption {
  id: number;
  full_name: string;
  email: string;
}

/* ==========================================================================
   Rapor (#18) — compiled report cards
   ========================================================================== */

export type ReportCardStatus = "draft" | "finalized" | "published" | "superseded";

export interface NarrativeRaporEntry {
  aspek: string;
  deskripsi: string;
}

export interface NumericRaporEntry {
  subject_id: number;
  subject: string;
  score: number;
  deskripsi: string;
}

export interface RaporCompiledData {
  student_id: number;
  semester: string;
  jenjang: string;
  fase: string;
  kurikulum_version: string;
  tumbuh_kembang?: NarrativeRaporEntry[];
  capaian_pembelajaran?: NarrativeRaporEntry[];
  nilai?: NumericRaporEntry[];
  kehadiran?: Record<string, number>;
}

export interface ReportCardRecord {
  id: number;
  student_id: number;
  semester: string;
  status: ReportCardStatus;
  kurikulum_version: string;
  compiled_data: RaporCompiledData | null;
  finalized_by: number | null;
  published_at: string | null;
}

/** GET /api/report-cards — first rapor for a student/semester (or null). */
export function getRapor(params: {
  studentId: number;
  semester?: string;
}): Promise<ReportCardRecord | null> {
  return apiFetch<Paginated<ReportCardRecord>>(
    `/api/report-cards${toQuery({
      student_id: params.studentId,
      semester: params.semester,
      size: 1,
    })}`
  ).then((page) => page.items[0] ?? null);
}

/* ==========================================================================
   SPP (#23) — bills and payments
   ========================================================================== */

export type SppBillStatus = "unpaid" | "paid" | "overdue" | "partially_paid";

export interface SppBill {
  id: number;
  student_id: number;
  class_id: number | null;
  period: string;
  amount: number;
  due_date: string;
  status: SppBillStatus;
  created_by: number;
  paid_amount: number;
  balance: number;
}

export interface SppBillBulkResult {
  class_id: number;
  period: string;
  created: number;
  skipped: number[];
}

export interface SppPayment {
  id: number;
  school_id: number;
  bill_id: number;
  paid_at: string;
  method: string;
  amount: number;
  /** Server-assigned sequential receipt number (#59). */
  receipt_no: number;
  recorded_by: number;
  voided?: boolean;
}

/** Result of a class/school wide bill generation run (#59). */
export interface SppBulkGenerateResult {
  created: number;
  skipped: number;
  no_students: number;
  message: string;
}

export interface BulkGenerateRequest {
  period: string;
  amount: number;
  due_date: string;
  class_id?: number;
  school_id?: number;
}

/** `{ bill, payment }` returned by the bill-scoped payment route (#59). */
export interface BillWithPayment {
  bill: SppBill;
  payment: SppPayment;
}

export const SPP_PAYMENT_METHODS = [
  { value: "cash", label: "Tunai" },
  { value: "transfer", label: "Transfer" },
  { value: "qris", label: "QRIS" },
] as const;

/** GET /api/spp/bills — scoped bill list with optional filters. */
export function getBills(
  params: {
    student_id?: number;
    class_id?: number;
    period?: string;
    status?: SppBillStatus;
    page?: number;
    size?: number;
  } = {}
): Promise<Paginated<SppBill>> {
  return apiFetch<Paginated<SppBill>>(`/api/spp/bills${toQuery(params)}`);
}

/** POST /api/spp/bills/bulk — generate bills for a class/period (idempotent). */
export function bulkCreateBills(input: {
  class_id: number;
  period: string;
  amount: number;
  due_date: string;
}): Promise<SppBillBulkResult> {
  return apiFetch<SppBillBulkResult>("/api/spp/bills/bulk", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** POST /api/spp/bills — create a single bill. */
export function createBill(input: {
  student_id: number;
  period: string;
  amount: number;
  due_date: string;
}): Promise<SppBill> {
  return apiFetch<SppBill>("/api/spp/bills", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * POST /api/spp/bills/bulk-generate — generate bills for a class or a whole
 * school (#59). Zero students in scope answers 404.
 */
export function bulkGenerateBills(input: BulkGenerateRequest): Promise<SppBulkGenerateResult> {
  return apiFetch<SppBulkGenerateResult>("/api/spp/bills/bulk-generate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * POST /api/spp/bills/{id}/payments — record a payment against one bill (#59).
 * The server assigns `receipt_no`; the response carries the updated bill too.
 */
export function recordBillPayment(
  billId: number,
  input: { amount: number; method: string; note?: string | null }
): Promise<BillWithPayment> {
  return apiFetch<BillWithPayment>(`/api/spp/bills/${billId}/payments`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * DELETE /api/spp/payments/{id} — void (soft-delete) a payment (#59).
 * Admin/principal only; the bill's totals + status are recomputed server-side.
 */
export function voidPayment(paymentId: number, reason?: string): Promise<void> {
  return apiFetch<void>(`/api/spp/payments/${paymentId}`, {
    method: "DELETE",
    body: JSON.stringify({ reason: reason ?? null }),
  });
}

/** @deprecated Legacy POST /api/spp/payments alias; prefer `recordBillPayment`. */
export function recordPayment(input: {
  bill_id: number;
  method: string;
  amount: number;
  receipt_no?: string;
  paid_at?: string;
}): Promise<SppPayment> {
  return apiFetch<SppPayment>("/api/spp/payments", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** GET /api/spp/payments — scoped payment list. */
export function fetchPayments(
  params: { bill_id?: number; student_id?: number; page?: number; size?: number } = {}
): Promise<Paginated<SppPayment>> {
  return apiFetch<Paginated<SppPayment>>(`/api/spp/payments${toQuery(params)}`);
}

/* ==========================================================================
   Dashboard aggregation helpers (#31-#35 wiring)
   ========================================================================== */

/** Attendance today summary returned by GET /api/attendances/today. */
export interface AttendanceTodaySummary {
  date: string;
  total: number;
  counts: Record<string, number>;
  items: AttendanceRecord[];
}

/** GET /api/attendances/today — per-status counts scoped to the caller. */
export function fetchAttendanceToday(): Promise<AttendanceTodaySummary> {
  return apiFetch<AttendanceTodaySummary>("/api/attendances/today");
}

/** Per-subject rollup returned inside a grade aggregate. */
export interface SubjectAggregate {
  subject_id: number;
  subject_name: string | null;
  average: number;
  count: number;
}

/** GET /api/grades/aggregate response for one student/semester. */
export interface GradeAggregate {
  student_id: number;
  semester: string;
  total: number;
  per_subject: SubjectAggregate[];
  overall_average: number | null;
}

/** GET /api/grades/aggregate — per-subject + overall averages. */
export function fetchGradeAggregate(params: {
  student_id: number;
  semester: string;
}): Promise<GradeAggregate> {
  return apiFetch<GradeAggregate>(`/api/grades/aggregate${toQuery(params)}`);
}

/** Per-category rollup inside a class-grade aggregate (ticket #53). */
export interface ClassAggregateCategory {
  scores: number[];
  avg: number | null;
  complete: boolean;
  missing: string[];
}

/** One student's row inside a class-grade aggregate. */
export interface ClassAggregateStudent {
  student_id: number;
  student_name: string;
  categories: Record<string, ClassAggregateCategory>;
  total_avg: number | null;
}

/** One subject's block inside a class-grade aggregate. */
export interface ClassAggregateSubject {
  subject_id: number;
  subject_name: string;
  students: ClassAggregateStudent[];
}

/** GET /api/grades/aggregate?class_id=&semester= — full class grid state. */
export interface ClassGradeAggregate {
  class_id: number;
  semester: string;
  subjects: ClassAggregateSubject[];
}

/** GET /api/grades/aggregate — per-student, per-subject, per-category grid. */
export function fetchClassGradeAggregate(params: {
  class_id: number;
  semester: string;
}): Promise<ClassGradeAggregate> {
  return apiFetch<ClassGradeAggregate>(`/api/grades/aggregate${toQuery(params)}`);
}

/** A teacher–subject–class assignment row (ticket #48). */
export interface TeacherAssignmentRecord {
  id: number;
  teacher_id: number;
  subject_id: number;
  class_id: number;
  academic_year: string;
  created_at: string;
}

/** GET /api/teacher-assignments — list assignments, filterable by teacher. */
export function fetchTeacherAssignments(teacherId?: number): Promise<TeacherAssignmentRecord[]> {
  return apiFetch<TeacherAssignmentRecord[]>(
    `/api/teacher-assignments${toQuery({ teacher_id: teacherId })}`
  );
}

/** Aggregate billing figures returned by GET /api/spp/summary. */
export interface SppSummary {
  bill_count: number;
  total_billed: number;
  total_collected: number;
  total_outstanding: number;
  collection_rate: number;
  overdue_count: number;
}

/** GET /api/spp/summary — collection rate/totals for the caller's scope. */
export function fetchSppSummary(
  params: { class_id?: number; period?: string } = {}
): Promise<SppSummary> {
  return apiFetch<SppSummary>(`/api/spp/summary${toQuery(params)}`);
}

/** GET /api/report-cards — paginated rapors, published-only for read-only roles. */
export function fetchReportCards(
  params: {
    student_id?: number;
    semester?: string;
    status?: ReportCardStatus;
    page?: number;
    size?: number;
  } = {}
): Promise<Paginated<ReportCardRecord>> {
  return apiFetch<Paginated<ReportCardRecord>>(`/api/report-cards${toQuery(params)}`);
}

/** GET /api/report-cards/{id} — a single rapor (drafts hidden from parents). */
export function fetchRaporById(id: number): Promise<ReportCardRecord> {
  return apiFetch<ReportCardRecord>(`/api/report-cards/${id}`);
}

/** Convenience list wrapper scoped to one student. */
export function fetchRaporList(
  studentId: number,
  params: { semester?: string; page?: number; size?: number } = {}
): Promise<Paginated<ReportCardRecord>> {
  return fetchReportCards({ ...params, student_id: studentId });
}

/** Alias matching the shared wiring contract for the SPP bill list. */
export const fetchBillList = getBills;

/** Alias matching the shared wiring contract for bulk bill generation. */
export const createBillBulk = bulkCreateBills;

/** GET /api/spp/bills/overdue — overdue or unpaid-past-due bills. */
export function fetchOverdueBills(
  params: { class_id?: number; page?: number; size?: number } = {}
): Promise<Paginated<SppBill>> {
  return apiFetch<Paginated<SppBill>>(`/api/spp/bills/overdue${toQuery(params)}`);
}

/** Aggregated counts used by the principal/TU KPI rows. */
export interface DashboardCounts {
  students: number;
  teachers: number;
  classes: number;
}

/** Fetch the student/teacher/class totals for a school in one round-trip set. */
export function fetchDashboardCounts(
  params: { school_id?: number } = {}
): Promise<DashboardCounts> {
  return Promise.all([
    fetchStudents({ ...params, size: 1 }),
    fetchUsers({ ...params, role: "teacher", size: 1 }),
    fetchClasses({ ...params, size: 1 }),
  ]).then(([students, teachers, classes]) => ({
    students: students.total,
    teachers: teachers.total,
    classes: classes.total,
  }));
}

/* ==========================================================================
   Komunikasi (#26) — announcements + message threads
   ========================================================================== */

export type AnnouncementAudience = "all" | "class" | "jenjang";
export type AnnouncementStatus = "draft" | "published";

/** Canonical jenjang enum shared by every filter/composer picker. */
export const JENJANG_VALUES = ["TK", "SD", "SMP", "SMA"] as const;
export type Jenjang = (typeof JENJANG_VALUES)[number];

export interface AnnouncementRecord {
  id: number;
  tenant_id: number;
  school_id: number | null;
  author_id: number;
  audience: AnnouncementAudience;
  title: string;
  body: string;
  published_at: string | null;
  status: AnnouncementStatus | string;
  target_class_id: number | null;
  target_tenant_id: number | null;
}

export interface AnnouncementInput {
  title: string;
  body: string;
  audience?: AnnouncementAudience;
  school_id?: number | null;
  target_class_id?: number | null;
  target_tenant_id?: number | null;
}

/** GET /api/announcements — audience/school-scoped feed. */
export function fetchAnnouncements(
  params: {
    school_id?: number;
    audience?: AnnouncementAudience;
    status?: AnnouncementStatus;
    class_id?: number;
    page?: number;
    size?: number;
  } = {}
): Promise<Paginated<AnnouncementRecord>> {
  return apiFetch<Paginated<AnnouncementRecord>>(`/api/announcements${toQuery(params)}`);
}

/** POST /api/announcements — create a draft announcement (staff only). */
export function createAnnouncement(input: AnnouncementInput): Promise<AnnouncementRecord> {
  return apiFetch<AnnouncementRecord>("/api/announcements", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** PATCH /api/announcements/{id} — edit an announcement. */
export function updateAnnouncement(
  id: number,
  input: Partial<AnnouncementInput>
): Promise<AnnouncementRecord> {
  return apiFetch<AnnouncementRecord>(`/api/announcements/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** POST /api/announcements/{id}/publish — flip a draft to published. */
export function publishAnnouncement(id: number): Promise<AnnouncementRecord> {
  return apiFetch<AnnouncementRecord>(`/api/announcements/${id}/publish`, {
    method: "POST",
  });
}

/** POST /api/announcements/{id}/unpublish — retract a published item. */
export function unpublishAnnouncement(id: number): Promise<AnnouncementRecord> {
  return apiFetch<AnnouncementRecord>(`/api/announcements/${id}/unpublish`, {
    method: "POST",
  });
}

/** DELETE /api/announcements/{id} — admin-only removal. */
export function deleteAnnouncement(id: number): Promise<void> {
  return apiFetch<void>(`/api/announcements/${id}`, { method: "DELETE" });
}

/**
 * POST /api/announcements/{id}/reject — deny a draft without deleting the row.
 *
 * When the dedicated reject route is unavailable (older backends), fall back to
 * the soft-retract route so denying never deletes + recreates an announcement.
 */
export function rejectAnnouncement(id: number, reason?: string): Promise<AnnouncementRecord> {
  const body = JSON.stringify({ reason: reason ?? null });
  return apiFetch<AnnouncementRecord>(`/api/announcements/${id}/reject`, {
    method: "POST",
    body,
  }).catch((err: unknown) => {
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
      return apiFetch<AnnouncementRecord>(`/api/announcements/${id}/retract`, {
        method: "POST",
        body,
      });
    }
    throw err;
  });
}

/** POST /api/announcements/{id}/retract — soft-retract (never deletes). */
export function retractAnnouncement(id: number, reason?: string): Promise<AnnouncementRecord> {
  return apiFetch<AnnouncementRecord>(`/api/announcements/${id}/retract`, {
    method: "POST",
    body: JSON.stringify({ reason: reason ?? null }),
  });
}

/* --------------------------------------------------------------------------
   Direct message threads (#26)
   -------------------------------------------------------------------------- */

export interface MessageRecord {
  id: number;
  thread_id: number;
  sender_id: number;
  body: string;
  sent_at: string;
  read_at: string | null;
}

export interface MessageThreadRecord {
  id: number;
  tenant_id: number;
  school_id: number | null;
  student_id?: number | null;
  created_by?: number | null;
  participant_ids: number[];
  subject: string;
  created_at: string;
  last_message: MessageRecord | null;
}

export interface MessageThreadInput {
  /** Every message thread is about one student (#61). */
  student_id: number;
  participant_ids: number[];
  subject: string;
  school_id?: number | null;
}

/** Read-only moderator payload from GET /api/message-threads/{id}/moderator-view. */
export interface MessageThreadModeration {
  thread: MessageThreadRecord;
  messages: MessageRecord[];
}

/** GET /api/message-threads — threads the caller participates in. */
export function fetchThreads(
  params: { page?: number; size?: number } = {}
): Promise<Paginated<MessageThreadRecord>> {
  return apiFetch<Paginated<MessageThreadRecord>>(`/api/message-threads${toQuery(params)}`);
}

/** POST /api/message-threads — open a new thread (caller auto-added). */
export function createMessageThread(input: MessageThreadInput): Promise<MessageThreadRecord> {
  return apiFetch<MessageThreadRecord>("/api/message-threads", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** GET /api/message-threads/{threadId}/messages — chronological history. */
export function fetchMessages(
  threadId: number,
  params: { page?: number; size?: number } = {}
): Promise<Paginated<MessageRecord>> {
  return apiFetch<Paginated<MessageRecord>>(
    `/api/message-threads/${threadId}/messages${toQuery(params)}`
  );
}

/** POST /api/message-threads/{threadId}/messages — append a reply. */
export function sendMessage(threadId: number, body: string): Promise<MessageRecord> {
  return apiFetch<MessageRecord>(`/api/message-threads/${threadId}/messages`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

/** POST /api/message-threads/{threadId}/participants — add a member. */
export function addThreadParticipant(
  threadId: number,
  userId: number
): Promise<MessageThreadRecord> {
  return apiFetch<MessageThreadRecord>(`/api/message-threads/${threadId}/participants`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
}

/** DELETE /api/message-threads/{threadId}/participants/{userId} — leave. */
export function removeThreadParticipant(threadId: number, userId: number): Promise<void> {
  return apiFetch<void>(`/api/message-threads/${threadId}/participants/${userId}`, {
    method: "DELETE",
  });
}

/** POST /api/message-threads/{threadId}/read — explicit, idempotent read call. */
export function markThreadRead(threadId: number): Promise<void> {
  return apiFetch<void>(`/api/message-threads/${threadId}/read`, { method: "POST" });
}

/** GET /api/message-threads/{threadId}/moderator-view — audited read-only view. */
export function fetchModerationView(threadId: number): Promise<MessageThreadModeration> {
  return apiFetch<MessageThreadModeration>(`/api/message-threads/${threadId}/moderator-view`);
}

/* ==========================================================================
   Notifikasi (#29/#51) — per-user, server-driven feed
   ========================================================================== */

export type NotificationSource = "absensi" | "spp" | "komunikasi";
export type NotificationType = "attendance" | "payment" | "announcement" | "message";

/** Raw row from `GET /api/notifications` (ticket #51). */
export interface ServerNotification {
  id: number;
  user_id: number;
  type: string;
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
}

export interface AppNotification {
  /** Server notification id, stringified for list keys. */
  id: string;
  type: NotificationType;
  source: NotificationSource;
  title: string;
  body: string;
  timestamp: string;
  href: string;
  read: boolean;
}

const NOTIFICATION_TYPE_MAP: Record<
  string,
  { type: NotificationType; source: NotificationSource }
> = {
  attendance_alert: { type: "attendance", source: "absensi" },
  spp_overdue: { type: "payment", source: "spp" },
  announcement: { type: "announcement", source: "komunikasi" },
  message: { type: "message", source: "komunikasi" },
};

/** Map a server row to the view-model used by the bell + feed. */
export function toAppNotification(row: ServerNotification): AppNotification {
  const mapped = NOTIFICATION_TYPE_MAP[row.type] ?? {
    type: "announcement",
    source: "komunikasi",
  };
  return {
    id: String(row.id),
    type: mapped.type,
    source: mapped.source,
    title: row.title,
    body: row.body,
    timestamp: row.created_at,
    href: row.link ?? "/dashboard/notifications",
    read: row.is_read,
  };
}

/** GET /api/notifications — the caller's own per-user feed, newest first. */
export async function fetchNotifications(
  params: { limit?: number; unreadOnly?: boolean } = {}
): Promise<AppNotification[]> {
  const rows = await apiFetch<ServerNotification[]>(
    `/api/notifications${toQuery({
      limit: params.limit,
      unread_only: params.unreadOnly ? true : undefined,
    })}`
  );
  return rows.map(toAppNotification);
}

/** GET /api/notifications/unread-count — authoritative badge count. */
export async function fetchUnreadCount(): Promise<number> {
  const res = await apiFetch<{ count: number }>("/api/notifications/unread-count");
  return res.count;
}

/** POST /api/notifications/{id}/read — server-driven read state. */
export function markNotificationRead(id: number): Promise<void> {
  return apiFetch<void>(`/api/notifications/${id}/read`, { method: "POST" });
}

/** POST /api/notifications/mark-all-read — clear every unread for the caller. */
export function markAllNotificationsRead(): Promise<void> {
  return apiFetch<void>("/api/notifications/mark-all-read", { method: "POST" });
}

/* ==========================================================================
   Yayasan (#64) — super_admin multi-tenant roll-ups
   ========================================================================== */

/** One school inside a tenant roll-up (no class breakdown). */
export interface YayasanSchoolSummary {
  id: number;
  name: string;
  jenjang: string | null;
  enrollment: number;
}

/** Per-tenant aggregate returned by `GET /api/yayasan/overview`. */
export interface YayasanTenantSummary {
  id: number;
  name: string;
  jenjang_type: string;
  school_count: number;
  enrollment: number;
  users_by_role: Record<string, number>;
  attendance_rate: number;
  spp_collection_rate: number;
  schools: YayasanSchoolSummary[];
}

/** Payload of `GET /api/yayasan/overview`. */
export interface YayasanOverview {
  tenants: YayasanTenantSummary[];
  total_tenants: number;
  total_schools: number;
  total_enrollment: number;
  total_users_by_role: Record<string, number>;
}

/** One class inside a compared school. */
export interface YayasanCompareClass {
  id: number;
  name: string;
  enrollment: number;
}

/** One school inside a comparison payload. */
export interface YayasanCompareSchool {
  id: number;
  name: string;
  jenjang: string | null;
  enrollment: number;
  classes: YayasanCompareClass[];
}

/** Payload of `GET /api/yayasan/compare`. */
export interface YayasanCompare {
  schools: YayasanCompareSchool[];
}

/** Canonical role order used by the yayasan users-by-role table. */
export const YAYASAN_ROLE_KEYS = [
  "super_admin",
  "principal",
  "teacher",
  "student",
  "parent",
  "admin",
] as const;

/** GET /api/yayasan/overview — per-tenant stats for the yayasan dashboard. */
export function fetchYayasanOverview(): Promise<YayasanOverview> {
  return apiFetch<YayasanOverview>("/api/yayasan/overview");
}

/**
 * GET /api/yayasan/compare?school_ids=… — side-by-side 2–3 schools.
 *
 * FastAPI parses `list[int]` query params from repeated keys, so each id is
 * emitted as its own `school_ids=` pair (a comma-joined value would 422).
 */
export function fetchYayasanCompare(schoolIds: number[]): Promise<YayasanCompare> {
  const search = schoolIds.map((id) => `school_ids=${encodeURIComponent(id)}`).join("&");
  return apiFetch<YayasanCompare>(`/api/yayasan/compare?${search}`);
}
