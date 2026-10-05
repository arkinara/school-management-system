"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  ClipboardList,
  FileText,
  RotateCcw,
  TrendingUp,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ProgressBars, type ProgressItem } from "@/components/dashboard/ProgressBars";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusChip } from "@/components/ui/StatusChip";
import { SkeletonCard, SkeletonList } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import {
  fetchAnnouncements,
  fetchAttendances,
  fetchClasses,
  fetchReportCards,
  fetchStudents,
  fetchSubjects,
  fetchUsers,
  getTodaySchedule,
  currentSemester,
  type AnnouncementRecord,
  type AttendanceRecord,
  type ClassRecord,
  type ReportCardRecord,
  type ScheduleRecord,
  type StudentRecord,
  type SubjectRecord,
  type UserRecord,
} from "@/lib/endpoints";
import type { UserMe } from "@/lib/auth";

type LoadStatus = "loading" | "ready" | "error";
type SessionStatus = "done" | "now" | "upcoming";

interface SessionItem {
  id: string;
  startTime: string | null;
  endTime: string | null;
  subject: string;
  teacher: string;
  status: SessionStatus;
}

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function formatTime(time: string | null): string {
  return time ? time.slice(0, 5).replace(":", ".") : "";
}

function WidgetError({
  title,
  onRetry,
}: {
  title: string;
  onRetry: () => void;
}) {
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

function SiswaContent({ me }: { me: UserMe }) {
  const [today, setToday] = React.useState("");
  const [profile, setProfile] = React.useState<{
    status: LoadStatus;
    student: StudentRecord | null;
    classes: Map<number, ClassRecord>;
    subjects: Map<number, SubjectRecord>;
    teachers: Map<number, UserRecord>;
  }>({
    status: "loading",
    student: null,
    classes: new Map(),
    subjects: new Map(),
    teachers: new Map(),
  });
  const [profileKey, setProfileKey] = React.useState(0);

  const [schedule, setSchedule] = React.useState<{
    status: LoadStatus;
    sessions: SessionItem[];
  }>({ status: "loading", sessions: [] });
  const [scheduleKey, setScheduleKey] = React.useState(0);

  const [attendance, setAttendance] = React.useState<{
    status: LoadStatus;
    rate: number;
  }>({ status: "loading", rate: 0 });
  const [attendanceKey, setAttendanceKey] = React.useState(0);

  const [rapor, setRapor] = React.useState<{
    status: LoadStatus;
    record: ReportCardRecord | null;
  }>({ status: "loading", record: null });
  const [raporKey, setRaporKey] = React.useState(0);

  const [announcements, setAnnouncements] = React.useState<{
    status: LoadStatus;
    items: AnnouncementRecord[];
  }>({ status: "loading", items: [] });
  const [announcementKey, setAnnouncementKey] = React.useState(0);

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
    setProfile((current) => ({ ...current, status: "loading" }));
    Promise.all([
      fetchStudents({ size: 100 }),
      fetchClasses({ size: 100 }),
      fetchSubjects({ size: 100 }),
      fetchUsers({ role: "teacher", size: 100 }),
    ])
      .then(([students, classes, subjects, teachers]) => {
        if (!active) return;
        const student =
          students.items.find((item) => item.user_id === me.user.id) ?? null;
        setProfile({
          status: "ready",
          student,
          classes: new Map(classes.items.map((k) => [k.id, k])),
          subjects: new Map(subjects.items.map((s) => [s.id, s])),
          teachers: new Map(teachers.items.map((t) => [t.id, t])),
        });
      })
      .catch(() => {
        if (active) setProfile((current) => ({ ...current, status: "error" }));
      });
    return () => {
      active = false;
    };
  }, [me.user.id, profileKey]);

  React.useEffect(() => {
    const student = profile.student;
    if (profile.status !== "ready" || student === null || student.class_id === null) {
      return;
    }
    let active = true;
    setSchedule({ status: "loading", sessions: [] });
    getTodaySchedule({ classId: student.class_id })
      .then((rows) => {
        if (!active) return;
        const now = new Date().getHours() * 60 + new Date().getMinutes();
        const sessions = rows
          .slice()
          .sort((a, b) => a.period_number - b.period_number)
          .map((row: ScheduleRecord) => {
            const start = minutesOf(row.start_time);
            const end = minutesOf(row.end_time);
            const status: SessionStatus =
              end < now ? "done" : start <= now && now <= end ? "now" : "upcoming";
            return {
              id: String(row.id),
              startTime: row.start_time,
              endTime: row.end_time,
              subject:
                profile.subjects.get(row.subject_id)?.name ??
                `Mapel ${row.subject_id}`,
              teacher:
                profile.teachers.get(row.teacher_id)?.full_name ?? "Guru",
              status,
            };
          });
        setSchedule({ status: "ready", sessions });
      })
      .catch(() => {
        if (active) setSchedule({ status: "error", sessions: [] });
      });
    return () => {
      active = false;
    };
  }, [profile, scheduleKey]);

  React.useEffect(() => {
    const student = profile.student;
    if (profile.status !== "ready" || student === null) return;
    let active = true;
    setAttendance({ status: "loading", rate: 0 });
    fetchAttendances({ student_id: student.id, size: 100 })
      .then((page) => {
        if (!active) return;
        const total = page.total;
        const hadir = page.items.filter(
          (row: AttendanceRecord) => row.status === "hadir"
        ).length;
        setAttendance({
          status: "ready",
          rate: total > 0 ? Math.round((hadir / total) * 100) : 0,
        });
      })
      .catch(() => {
        if (active) setAttendance({ status: "error", rate: 0 });
      });
    return () => {
      active = false;
    };
  }, [profile, attendanceKey]);

  React.useEffect(() => {
    const student = profile.student;
    if (profile.status !== "ready" || student === null) return;
    let active = true;
    setRapor({ status: "loading", record: null });
    fetchReportCards({
      student_id: student.id,
      semester: currentSemester(),
      size: 1,
    })
      .then((page) => {
        if (active) setRapor({ status: "ready", record: page.items[0] ?? null });
      })
      .catch(() => {
        if (active) setRapor({ status: "error", record: null });
      });
    return () => {
      active = false;
    };
  }, [profile, raporKey]);

  React.useEffect(() => {
    let active = true;
    setAnnouncements({ status: "loading", items: [] });
    fetchAnnouncements({ status: "published", size: 5 })
      .then((page) => {
        if (active) setAnnouncements({ status: "ready", items: page.items });
      })
      .catch(() => {
        if (active) setAnnouncements({ status: "error", items: [] });
      });
    return () => {
      active = false;
    };
  }, [announcementKey]);

  const raporGrades: ProgressItem[] =
    rapor.record?.compiled_data?.nilai?.map((entry) => ({
      label: entry.subject,
      value: entry.score,
      display: String(entry.score),
    })) ?? [];
  const average =
    raporGrades.length > 0
      ? (
          raporGrades.reduce((sum, item) => sum + item.value, 0) /
          raporGrades.length
        )
          .toFixed(1)
          .replace(".", ",")
      : "—";
  const raporStatus =
    rapor.status === "ready" && rapor.record !== null ? "published" : "draft";

  if (profile.status === "error") {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <WidgetError
          title="Gagal memuat profil siswa"
          onRetry={() => setProfileKey((k) => k + 1)}
        />
      </div>
    );
  }

  if (profile.status === "ready" && profile.student === null) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <EmptyState
          icon={ClipboardList}
          title="Data siswa belum tertaut"
          description="Akun ini belum terhubung ke data siswa. Hubungi tata usaha sekolah."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Halo, {me.user.full_name.split(" ")[0]}
          </h1>
          <p className="text-xs text-muted-foreground">Siswa · {today}</p>
        </div>
        <Link
          href="/dashboard/siswa/today"
          className="flex min-h-10 items-center gap-1.5 rounded-full border border-outline px-4 text-xs font-medium text-primary hover:bg-surface-container-high"
        >
          <CalendarDays className="h-4 w-4" aria-hidden />
          Jadwal lengkap
        </Link>
      </div>

      <section
        aria-label="Ringkasan saya"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {profile.status === "loading" ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <MetricCard
              label="Rata-rata Nilai"
              value={average}
              icon={TrendingUp}
              hint={raporStatus === "published" ? "Dari rapor terbit" : "Belum ada rapor"}
            />
            <MetricCard
              label="Kehadiran"
              value={`${attendance.rate}%`}
              icon={CalendarDays}
              hint={attendance.status === "error" ? "Gagal memuat data" : "Semester ini"}
            />
            <MetricCard
              label="Status Rapor"
              value={raporStatus === "published" ? "Terbit" : "Draft"}
              icon={ClipboardList}
              hint={currentSemester()}
            />
          </>
        )}
      </section>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="items-center border-b border-outline-variant pb-3">
            <CardTitle>Jadwal Hari Ini</CardTitle>
            <span className="font-mono text-2xs tabular-nums text-muted-foreground">
              {schedule.sessions.length} mata pelajaran
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
                icon={CalendarDays}
                title="Tidak ada kelas hari ini"
                description="Selamat beristirahat — jadwal berikutnya akan muncul di sini."
              />
            </CardBody>
          ) : (
            <>
              <ol className="divide-y divide-outline-variant">
                {schedule.sessions.map((session) => (
                  <li
                    key={session.id}
                    className={cn(
                      "flex items-center gap-3 px-5 py-2.5",
                      session.status === "done" && "opacity-60",
                      session.status === "now" && "bg-primary-container/40"
                    )}
                  >
                    <span className="w-16 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                      {formatTime(session.startTime) || "--.--"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {session.subject}
                      </p>
                      <p className="truncate text-2xs text-muted-foreground">
                        {session.teacher} ·{" "}
                        {formatTime(session.startTime) || "--.--"}–
                        {formatTime(session.endTime) || "--.--"}
                      </p>
                    </div>
                    {session.status === "now" && (
                      <StatusChip tone="primary">sekarang</StatusChip>
                    )}
                  </li>
                ))}
              </ol>
              <div className="border-t border-outline-variant px-5 py-3">
                <Link
                  href="/dashboard/siswa/today"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Lihat jadwal lengkap
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>
            </>
          )}
        </Card>

        <Card>
          <CardHeader className="items-center border-b border-outline-variant pb-3">
            <CardTitle>Tugas & PR</CardTitle>
          </CardHeader>
          <CardBody>
            <EmptyState
              icon={ClipboardList}
              title="Belum tersedia"
              description="Fitur tugas dan PR akan hadir pada rilis berikutnya."
            />
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="items-center border-b border-outline-variant pb-3">
            <CardTitle>Rapor Singkat</CardTitle>
            <div className="flex items-center gap-2">
              <StatusChip tone={raporStatus === "published" ? "success" : "neutral"}>
                {raporStatus === "published" ? "published" : "draft"}
              </StatusChip>
              {raporStatus === "published" && (
                <Link
                  href="/dashboard/siswa/rapor"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Lihat rapor
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              )}
            </div>
          </CardHeader>
          <CardBody>
            {rapor.status === "loading" ? (
              <SkeletonList rows={4} />
            ) : rapor.status === "error" ? (
              <WidgetError
                title="Gagal memuat rapor"
                onRetry={() => setRaporKey((k) => k + 1)}
              />
            ) : (
              <>
                <p className="mb-3 text-2xs text-muted-foreground">
                  {rapor.record?.semester ?? currentSemester()}
                </p>
                {raporGrades.length === 0 ? (
                  <EmptyState
                    icon={FileText}
                    title="Belum ada nilai"
                    description="Nilai rapor akan tampil setelah guru menerbitkannya."
                  />
                ) : (
                  <>
                    <ProgressBars
                      items={raporGrades}
                      ariaLabel="Nilai per mata pelajaran"
                    />
                    <p className="mt-3 border-t border-outline-variant pt-2 text-2xs text-muted-foreground">
                      Rapor sudah diterbitkan dan dapat dilihat pada halaman rapor.
                    </p>
                  </>
                )}
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="items-center border-b border-outline-variant pb-3">
            <CardTitle>Pengumuman</CardTitle>
            <span className="font-mono text-2xs tabular-nums text-muted-foreground">
              {announcements.items.length} baru
            </span>
          </CardHeader>
          {announcements.status === "loading" ? (
            <CardBody>
              <SkeletonList rows={3} />
            </CardBody>
          ) : announcements.status === "error" ? (
            <CardBody>
              <WidgetError
                title="Gagal memuat pengumuman"
                onRetry={() => setAnnouncementKey((k) => k + 1)}
              />
            </CardBody>
          ) : announcements.items.length === 0 ? (
            <CardBody>
              <EmptyState
                icon={FileText}
                title="Belum ada pengumuman"
                description="Pengumuman dari sekolah akan tampil di sini."
              />
            </CardBody>
          ) : (
            <ul className="divide-y divide-outline-variant">
              {announcements.items.map((item) => (
                <li key={item.id} className="px-5 py-3">
                  <p className="text-sm font-medium text-foreground">
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-2xs text-muted-foreground">
                    {item.body}
                  </p>
                  <p className="mt-1 text-2xs text-muted-foreground">
                    {item.published_at
                      ? new Date(item.published_at).toLocaleDateString("id-ID")
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function SiswaDashboardPage() {
  return (
    <DashboardShell role="student">
      {(me) => <SiswaContent me={me} />}
    </DashboardShell>
  );
}
