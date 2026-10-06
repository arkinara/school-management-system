/**
 * Typed API client for the domain endpoints built in tickets #5-#7.
 *
 * Thin wrappers over `apiFetch` (which owns auth + error handling) so
 * dashboard widgets can consume backend data without re-deriving URLs or
 * response shapes. Every list endpoint returns the shared paginated envelope.
 */

import { apiFetch } from "./api";
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
  participant_ids: number[];
  subject: string;
  created_at: string;
  last_message: MessageRecord | null;
}

export interface MessageThreadInput {
  participant_ids: number[];
  subject: string;
  school_id?: number | null;
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

/* ==========================================================================
   Notifikasi (#29) — client-side aggregation over existing domains
   ========================================================================== */

export type NotificationSource = "absensi" | "spp" | "komunikasi";
export type NotificationType = "attendance" | "payment" | "announcement" | "message";

export interface AppNotification {
  /** Stable key derived from the underlying event, e.g. `announcement:12`. */
  id: string;
  type: NotificationType;
  source: NotificationSource;
  title: string;
  body: string;
  timestamp: string;
  href: string;
  read: boolean;
}

const NOTIFICATION_READ_KEY = "sms_notification_read_ids";

/** Event ids the user has already read, persisted per device. */
export function getReadNotificationIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_READ_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeReadIds(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NOTIFICATION_READ_KEY, JSON.stringify(ids));
  } catch {
    // Ignore storage failures.
  }
  try {
    window.dispatchEvent(new Event("sms:notifications-changed"));
  } catch {
    // Ignore environments without a global event target.
  }
}

/** Persist a single read marker (fails safe — caller keeps unread on error). */
export async function markNotificationRead(id: string): Promise<void> {
  const ids = getReadNotificationIds();
  if (!ids.includes(id)) writeReadIds([...ids, id]);
}

/** Persist read markers for every supplied event id. */
export async function markAllNotificationsRead(ids: string[]): Promise<void> {
  const existing = new Set(getReadNotificationIds());
  for (const id of ids) existing.add(id);
  writeReadIds([...existing]);
}

function excerpt(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    hadir: "Hadir",
    izin: "Izin",
    sakit: "Sakit",
    alpa: "Alpa",
  };
  return map[status] ?? status;
}

/**
 * GET /api/notifications equivalent for v1: aggregates announcements, message
 * threads, overdue SPP bills and non-hadir attendance. Each source is fetched
 * independently so one failing domain degrades gracefully instead of blanking
 * the whole feed. Read state is layered on from local markers.
 */
export async function fetchNotifications(
  params: {
    currentUserId?: number;
    unreadOnly?: boolean;
  } = {}
): Promise<AppNotification[]> {
  const readIds = new Set(getReadNotificationIds());
  const notifications: AppNotification[] = [];

  const [announcements, threads, bills, attendance] = await Promise.allSettled([
    fetchAnnouncements({ size: 15 }),
    fetchThreads({ size: 20 }),
    getBills({ status: "overdue", size: 20 }),
    fetchAttendances({ size: 20 }),
  ]);

  if (announcements.status === "fulfilled") {
    for (const item of announcements.value.items) {
      if (item.status !== "published" || item.published_at === null) continue;
      const id = `announcement:${item.id}`;
      notifications.push({
        id,
        type: "announcement",
        source: "komunikasi",
        title: item.title,
        body: excerpt(item.body),
        timestamp: item.published_at,
        href: "/dashboard/announcements",
        read: readIds.has(id),
      });
    }
  }

  if (threads.status === "fulfilled") {
    for (const thread of threads.value.items) {
      const last = thread.last_message;
      if (!last) continue;
      const isOwn = params.currentUserId === last.sender_id;
      const id = `message:${last.id}`;
      notifications.push({
        id,
        type: "message",
        source: "komunikasi",
        title: thread.subject,
        body: excerpt(last.body),
        timestamp: last.sent_at,
        href: "/dashboard/messages",
        read: last.read_at !== null || isOwn || readIds.has(id),
      });
    }
  }

  if (bills.status === "fulfilled") {
    for (const bill of bills.value.items) {
      const id = `spp:${bill.id}`;
      notifications.push({
        id,
        type: "payment",
        source: "spp",
        title: `SPP menunggak · ${bill.period}`,
        body: `Sisa tagihan ${formatRupiahPlain(bill.balance)} jatuh tempo ${bill.due_date}.`,
        timestamp: bill.due_date,
        href: "/dashboard/tu/spp/payments",
        read: readIds.has(id),
      });
    }
  }

  if (attendance.status === "fulfilled") {
    for (const record of attendance.value.items) {
      if (record.status === "hadir") continue;
      const id = `attendance:${record.id}`;
      notifications.push({
        id,
        type: "attendance",
        source: "absensi",
        title: `Absensi: ${statusLabel(record.status)}`,
        body: `Pencatatan kehadiran tanggal ${record.date}${record.note ? ` · ${record.note}` : ""}.`,
        timestamp: record.date,
        href: "/dashboard/guru/absensi",
        read: readIds.has(id),
      });
    }
  }

  const sorted = notifications.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  return params.unreadOnly ? sorted.filter((item) => !item.read) : sorted;
}

function formatRupiahPlain(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}
