"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CalendarCheck,
  Check,
  ClipboardList,
  FileText,
  RotateCcw,
  Users,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusChip } from "@/components/ui/StatusChip";
import { SkeletonCard, SkeletonList } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import {
  fetchAll,
  fetchAttendanceToday,
  fetchClasses,
  fetchGrades,
  fetchReportCards,
  fetchStudents,
  fetchSubjects,
  getTeacherSchedule,
  type AttendanceRecord,
  type ClassRecord,
  type GradeRecord,
  type ReportCardRecord,
  type ScheduleRecord,
  type StudentRecord,
  type SubjectRecord,
} from "@/lib/endpoints";
import { fetchActiveSemester } from "@/lib/academic";
import { todayDayOfWeek } from "@/lib/days";
import type { UserMe } from "@/lib/auth";

type LoadStatus = "loading" | "ready" | "error";
type SessionStatus = "done" | "now" | "upcoming";

interface SessionItem {
  id: string;
  startTime: string;
  endTime: string;
  className: string;
  subject: string;
  classId: number;
  subjectId: number;
  status: SessionStatus;
  attendanceTaken: boolean;
}

interface GradeQueueItem {
  id: string;
  className: string;
  subject: string;
  classId: number;
  subjectId: number;
  pendingCount: number;
}

interface AttendanceQueueItem {
  id: string;
  className: string;
  subject: string;
  classId: number;
  time: string;
  studentCount: number;
}

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function prettyTime(time: string): string {
  return time.slice(0, 5).replace(":", ".");
}

function WidgetError({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <EmptyState
      icon={AlertCircle}
      title={title}
      description="Tidak dapat mengambil data. Periksa koneksi lalu coba lagi."
      action={
        <Button variant="tonal" icon={RotateCcw} onClick={onRetry}>
          Coba lagi
        </Button>
      }
    />
  );
}

function GuruContent({ me }: { me: UserMe }) {
  const teacherId = me.user.id;
  const [today, setToday] = React.useState("");

  const [schedule, setSchedule] = React.useState<{
    status: LoadStatus;
    sessions: SessionItem[];
    classCount: number;
    studentCount: number;
    attendanceRate: number;
    takenClassIds: Set<number>;
    studentsByClass: Map<number, StudentRecord[]>;
    classes: Map<number, ClassRecord>;
    subjects: Map<number, SubjectRecord>;
  }>({
    status: "loading",
    sessions: [],
    classCount: 0,
    studentCount: 0,
    attendanceRate: 0,
    takenClassIds: new Set(),
    studentsByClass: new Map(),
    classes: new Map(),
    subjects: new Map(),
  });
  const [scheduleKey, setScheduleKey] = React.useState(0);

  const [gradeQueue, setGradeQueue] = React.useState<{
    status: LoadStatus;
    items: GradeQueueItem[];
  }>({ status: "loading", items: [] });
  const [gradeKey, setGradeKey] = React.useState(0);

  const [drafts, setDrafts] = React.useState<{
    status: LoadStatus;
    items: ReportCardRecord[];
  }>({ status: "loading", items: [] });
  const [draftKey, setDraftKey] = React.useState(0);

  React.useEffect(() => {
    setToday(
      new Intl.DateTimeFormat("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(new Date())
    );
  }, []);

  React.useEffect(() => {
    let active = true;
    setSchedule((current) => ({ ...current, status: "loading" }));
    Promise.all([
      getTeacherSchedule(teacherId),
      fetchClasses({ size: 100 }),
      fetchSubjects({ size: 100 }),
      fetchStudents({ size: 100 }),
      fetchAttendanceToday(),
    ])
      .then(([scheduleRows, classPage, subjectPage, studentPage, attendance]) => {
        if (!active) return;
        const classMap = new Map(classPage.items.map((k) => [k.id, k]));
        const subjectMap = new Map(subjectPage.items.map((s) => [s.id, s]));
        const studentsByClass = new Map<number, StudentRecord[]>();
        for (const student of studentPage.items) {
          if (student.class_id === null) continue;
          const list = studentsByClass.get(student.class_id) ?? [];
          list.push(student);
          studentsByClass.set(student.class_id, list);
        }

        const day = todayDayOfWeek();
        const todayRows = scheduleRows.filter((row) => row.day_of_week === day);
        const takenClassIds = new Set(
          attendance.items.map((row: AttendanceRecord) => row.class_id)
        );
        const now = new Date().getHours() * 60 + new Date().getMinutes();
        const sessions: SessionItem[] = todayRows
          .slice()
          .sort((a, b) => a.period_number - b.period_number)
          .map((row: ScheduleRecord) => {
            const start = minutesOf(row.start_time);
            const end = minutesOf(row.end_time);
            const status: SessionStatus =
              end < now ? "done" : start <= now && now <= end ? "now" : "upcoming";
            return {
              id: String(row.id),
              startTime: prettyTime(row.start_time),
              endTime: prettyTime(row.end_time),
              className: classMap.get(row.class_id)?.name ?? `Kelas ${row.class_id}`,
              subject: subjectMap.get(row.subject_id)?.name ?? `Mapel ${row.subject_id}`,
              classId: row.class_id,
              subjectId: row.subject_id,
              status,
              attendanceTaken: takenClassIds.has(row.class_id),
            };
          });

        const allClassIds = new Set(scheduleRows.map((row) => row.class_id));
        const studentCount = [...studentsByClass.entries()]
          .filter(([classId]) => allClassIds.has(classId))
          .reduce((sum, [, roster]) => sum + roster.length, 0);

        const counts = attendance.counts ?? {};
        const attendanceTotal = attendance.total;
        const attendanceRate =
          attendanceTotal > 0 ? Math.round(((counts.hadir ?? 0) / attendanceTotal) * 100) : 0;

        setSchedule({
          status: "ready",
          sessions,
          classCount: allClassIds.size,
          studentCount,
          attendanceRate,
          takenClassIds,
          studentsByClass,
          classes: classMap,
          subjects: subjectMap,
        });
      })
      .catch(() => {
        if (active) setSchedule((current) => ({ ...current, status: "error" }));
      });
    return () => {
      active = false;
    };
  }, [teacherId, scheduleKey]);

  React.useEffect(() => {
    if (schedule.status !== "ready") return;
    let active = true;
    setGradeQueue({ status: "loading", items: [] });
    Promise.all([
      getTeacherSchedule(teacherId),
      fetchActiveSemester()
        .then((semester) => fetchAll((p) => fetchGrades({ semester, ...p })))
        .catch(() => [] as GradeRecord[]),
    ])
      .then(([scheduleRows, grades]) => {
        if (!active) return;
        const gradedKeys = new Set(
          grades.map((grade: GradeRecord) => `${grade.student_id}:${grade.subject_id}`)
        );
        const seen = new Set<string>();
        const items: GradeQueueItem[] = [];
        for (const row of scheduleRows) {
          const key = `${row.class_id}:${row.subject_id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const roster = schedule.studentsByClass.get(row.class_id) ?? [];
          if (roster.length === 0) continue;
          const pendingCount = roster.filter(
            (student) => !gradedKeys.has(`${student.id}:${row.subject_id}`)
          ).length;
          if (pendingCount === 0) continue;
          items.push({
            id: key,
            className: schedule.classes.get(row.class_id)?.name ?? `Kelas ${row.class_id}`,
            subject: schedule.subjects.get(row.subject_id)?.name ?? `Mapel ${row.subject_id}`,
            classId: row.class_id,
            subjectId: row.subject_id,
            pendingCount,
          });
        }
        setGradeQueue({ status: "ready", items });
      })
      .catch(() => {
        if (active) setGradeQueue({ status: "error", items: [] });
      });
    return () => {
      active = false;
    };
  }, [schedule, teacherId, gradeKey]);

  React.useEffect(() => {
    let active = true;
    setDrafts({ status: "loading", items: [] });
    fetchReportCards({ status: "draft", size: 5 })
      .then((page) => {
        if (active) setDrafts({ status: "ready", items: page.items });
      })
      .catch(() => {
        if (active) setDrafts({ status: "error", items: [] });
      });
    return () => {
      active = false;
    };
  }, [draftKey]);

  const attendanceQueue: AttendanceQueueItem[] = schedule.sessions
    .filter((session) => !session.attendanceTaken)
    .map((session) => ({
      id: session.id,
      className: session.className,
      subject: session.subject,
      classId: session.classId,
      time: session.startTime,
      studentCount: schedule.studentsByClass.get(session.classId)?.length ?? 0,
    }));

  const pendingCount = gradeQueue.items.reduce((sum, item) => sum + item.pendingCount, 0);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Selamat pagi, {me.user.full_name.split(" ")[0]}
          </h1>
          <p className="text-xs text-muted-foreground">Guru · {today}</p>
        </div>
        <Link
          href="/dashboard/guru/absensi"
          className="flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:opacity-90"
        >
          <CalendarCheck className="h-4 w-4" aria-hidden />
          Isi absensi sekarang
        </Link>
      </div>

      <section
        aria-label="Ringkasan tugas"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {schedule.status === "loading" ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <MetricCard
              label="Kelas Diampu"
              value={schedule.classCount}
              icon={BookOpen}
              hint={schedule.status === "error" ? "Gagal memuat data" : "Dari jadwal Anda"}
            />
            <MetricCard
              label="Siswa Aktif"
              value={schedule.studentCount}
              icon={Users}
              hint={schedule.status === "error" ? "Gagal memuat data" : "Di kelas yang diampu"}
            />
            <MetricCard
              label="Nilai Belum Diinput"
              value={pendingCount}
              icon={ClipboardList}
              hint={
                gradeQueue.status === "error"
                  ? "Gagal memuat data"
                  : pendingCount === 0
                    ? "Semua sudah terisi"
                    : "Siswa tanpa nilai semester ini"
              }
            />
            <MetricCard
              label="Kehadiran Hari Ini"
              value={`${schedule.attendanceRate}%`}
              icon={CalendarCheck}
              hint="Untuk kelas yang diampu"
            />
          </>
        )}
      </section>

      <div className="grid gap-3 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader className="items-center border-b border-outline-variant pb-3">
            <CardTitle>Jadwal Mengajar Hari Ini</CardTitle>
            <span className="font-mono text-2xs tabular-nums text-muted-foreground">
              {schedule.sessions.length} sesi
            </span>
          </CardHeader>
          {schedule.status === "loading" ? (
            <CardBody>
              <SkeletonList rows={4} />
            </CardBody>
          ) : schedule.status === "error" ? (
            <CardBody>
              <WidgetError
                title="Gagal memuat jadwal"
                onRetry={() => setScheduleKey((k) => k + 1)}
              />
            </CardBody>
          ) : schedule.sessions.length === 0 ? (
            <CardBody>
              <EmptyState
                icon={CalendarCheck}
                title="Tidak ada kelas hari ini"
                description="Jadwal mengajar akan tampil di sini pada hari sekolah."
              />
            </CardBody>
          ) : (
            <ol className="divide-y divide-outline-variant">
              {schedule.sessions.map((session) => (
                <li
                  key={session.id}
                  className={cn(
                    "flex items-center gap-3 px-5 py-3",
                    session.status === "done" && "opacity-60",
                    session.status === "now" && "bg-primary-container/40"
                  )}
                >
                  <span className="w-16 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {session.startTime}
                  </span>
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      session.status === "now"
                        ? "animate-pulse bg-primary"
                        : session.status === "done"
                          ? "bg-outline"
                          : "bg-outline-variant"
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {session.subject} · {session.className}
                    </p>
                    <p className="truncate text-2xs text-muted-foreground">
                      {session.startTime}–{session.endTime}
                      {session.attendanceTaken ? " · absensi terisi" : ""}
                    </p>
                  </div>
                  {session.status === "done" ? (
                    <Check className="h-4 w-4 shrink-0 text-success" aria-hidden />
                  ) : session.status === "now" ? (
                    <StatusChip tone="primary">sekarang</StatusChip>
                  ) : (
                    <Link
                      href="/dashboard/guru/absensi"
                      className="min-h-9 shrink-0 rounded-full border border-outline px-3 text-xs font-medium leading-9 text-primary hover:bg-surface-container-high"
                    >
                      Mulai
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Card>

        <div className="grid gap-3 xl:col-span-3 xl:grid-cols-2">
          <Card>
            <CardHeader className="items-center border-b border-outline-variant pb-3">
              <CardTitle>Absensi Perlu Diisi</CardTitle>
              {attendanceQueue.length > 0 ? (
                <StatusChip tone="warning">{attendanceQueue.length} tertunda</StatusChip>
              ) : (
                <StatusChip tone="success">selesai</StatusChip>
              )}
            </CardHeader>
            {schedule.status === "loading" ? (
              <CardBody>
                <SkeletonList rows={3} />
              </CardBody>
            ) : attendanceQueue.length === 0 ? (
              <CardBody>
                <EmptyState
                  icon={Check}
                  title="Semua absensi sudah diambil"
                  description="Tidak ada kelas yang menunggu absensi hari ini."
                />
              </CardBody>
            ) : (
              <ul className="divide-y divide-outline-variant">
                {attendanceQueue.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        Kelas {item.className} · {item.subject}
                      </p>
                      <p className="font-mono text-2xs tabular-nums text-muted-foreground">
                        {item.time} · {item.studentCount} siswa
                      </p>
                    </div>
                    <Link
                      href="/dashboard/guru/absensi"
                      className="min-h-9 shrink-0 rounded-full bg-primary px-3 text-xs font-semibold leading-9 text-primary-foreground hover:opacity-90"
                    >
                      Isi
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader className="items-center border-b border-outline-variant pb-3">
              <CardTitle>Nilai Belum Diinput</CardTitle>
              <span className="rounded-full bg-accent-container px-1.5 py-0.5 font-mono text-2xs font-semibold tabular-nums text-accent-container-foreground">
                {pendingCount}
              </span>
            </CardHeader>
            {gradeQueue.status === "loading" ? (
              <CardBody>
                <SkeletonList rows={3} />
              </CardBody>
            ) : gradeQueue.status === "error" ? (
              <CardBody>
                <WidgetError
                  title="Gagal memuat antrean nilai"
                  onRetry={() => setGradeKey((k) => k + 1)}
                />
              </CardBody>
            ) : gradeQueue.items.length === 0 ? (
              <CardBody>
                <EmptyState
                  icon={ClipboardList}
                  title="Semua nilai sudah diinput"
                  description="Antrean penilaian kosong untuk saat ini."
                />
              </CardBody>
            ) : (
              <ul className="divide-y divide-outline-variant">
                {gradeQueue.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="h-9 w-1 shrink-0 rounded-full bg-warning" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {item.subject} · {item.className}
                      </p>
                      <p className="text-2xs text-muted-foreground">
                        {item.pendingCount} siswa belum dinilai
                      </p>
                    </div>
                    <Link
                      href="/dashboard/guru/grades"
                      className="min-h-9 shrink-0 rounded-full border border-outline px-3 text-xs font-medium leading-9 text-primary hover:bg-surface-container-high"
                    >
                      Input
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader className="items-center border-b border-outline-variant pb-3">
              <CardTitle>Draf Rapor</CardTitle>
              <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
            </CardHeader>
            {drafts.status === "loading" ? (
              <CardBody>
                <SkeletonList rows={2} />
              </CardBody>
            ) : drafts.status === "error" ? (
              <CardBody>
                <WidgetError
                  title="Gagal memuat draf rapor"
                  onRetry={() => setDraftKey((k) => k + 1)}
                />
              </CardBody>
            ) : drafts.items.length === 0 ? (
              <CardBody>
                <EmptyState
                  icon={FileText}
                  title="Tidak ada draf rapor"
                  description="Rapor yang belum diterbitkan akan tampil di sini."
                />
              </CardBody>
            ) : (
              <ul className="divide-y divide-outline-variant">
                {drafts.items.map((item) => (
                  <li key={item.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {item.semester}
                      </p>
                      <StatusChip tone="warning">draft</StatusChip>
                    </div>
                    <p className="mt-0.5 text-2xs text-muted-foreground">
                      Siswa #{item.student_id} · {item.kurikulum_version}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function GuruDashboardPage() {
  return <DashboardShell role="teacher">{(me) => <GuruContent me={me} />}</DashboardShell>;
}
