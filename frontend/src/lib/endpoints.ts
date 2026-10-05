/**
 * Typed API client for the domain endpoints built in tickets #5-#7.
 *
 * Thin wrappers over `apiFetch` (which owns auth + error handling) so
 * dashboard widgets can consume backend data without re-deriving URLs or
 * response shapes. Every list endpoint returns the shared paginated envelope.
 */

import { apiFetch } from "./api";
import type { UserMe } from "./auth";

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
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

export const ATTENDANCE_STATUSES: AttendanceStatus[] = [
  "hadir",
  "izin",
  "sakit",
  "alpa",
];

export interface AttendanceRecord {
  id: number;
  student_id: number;
  class_id: number;
  date: string;
  status: AttendanceStatus;
  recorded_by: number;
  note: string | null;
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
  return apiFetch<Paginated<AttendanceRecord>>(
    `/api/attendances${toQuery(params)}`
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
  day_of_week: string;
  period_number: number;
  start_time: string;
  end_time: string;
}

export interface ScheduleInput {
  subject_id: number;
  teacher_id: number;
  day_of_week: string;
  period_number: number;
  start_time: string;
  end_time: string;
}

/** GET /api/schedules/class/{classId} — full weekly timetable for a class. */
export function getSchedule(classId: number): Promise<ScheduleRecord[]> {
  return apiFetch<ScheduleRecord[]>(`/api/schedules/class/${classId}`);
}

/** GET /api/schedules/teacher/{teacherId} — a teacher's weekly timetable. */
export function getTeacherSchedule(teacherId: number): Promise<ScheduleRecord[]> {
  return apiFetch<ScheduleRecord[]>(`/api/schedules/teacher/${teacherId}`);
}

/** GET /api/schedules/today — today's entries, optionally filtered by role. */
export function getTodaySchedule(
  params: { classId?: number; teacherId?: number } = {}
): Promise<ScheduleRecord[]> {
  const day = indonesianDayName(new Date());
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
    day_of_week?: string;
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

/** Monday-first Indonesian weekday name, lowercased to match the API. */
export function indonesianDayName(date: Date): string {
  const days = ["minggu", "senin", "selasa", "rabu", "kamis", "jumat", "sabtu"];
  return days[date.getDay()];
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

export type ReportCardStatus = "draft" | "published";

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

export type SppBillStatus = "unpaid" | "paid" | "overdue";

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
  bill_id: number;
  paid_at: string;
  method: string;
  amount: number;
  receipt_no: string;
  recorded_by: number;
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

/** POST /api/spp/payments — record a payment against a bill. */
export function recordPayment(input: {
  bill_id: number;
  method: string;
  amount: number;
  receipt_no: string;
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
