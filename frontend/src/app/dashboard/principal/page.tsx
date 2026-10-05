"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CalendarCheck,
  CircleCheckBig,
  Megaphone,
  RotateCcw,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Donut } from "@/components/dashboard/Donut";
import { ProgressBars, type ProgressItem } from "@/components/dashboard/ProgressBars";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { SchoolPicker } from "@/components/dashboard/SchoolPicker";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusChip } from "@/components/ui/StatusChip";
import { SkeletonCard, SkeletonList } from "@/components/ui/Skeleton";
import {
  fetchAnnouncements,
  fetchAttendanceToday,
  fetchAttendances,
  fetchClasses,
  fetchGrades,
  fetchSchools,
  fetchSppSummary,
  fetchStudents,
  fetchUsers,
  currentSemester,
  type AnnouncementRecord,
  type AttendanceTodaySummary,
  type SchoolRecord,
  type SppSummary,
  type StudentRecord,
} from "@/lib/endpoints";
import type { UserMe } from "@/lib/auth";
import { attendanceSegments, formatRupiahCompact } from "@/components/dashboard/mock-data";

type WidgetStatus = "loading" | "ready" | "error";

function last7Days(): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const tz = d.getTimezoneOffset();
    days.push(new Date(d.getTime() - tz * 60_000).toISOString().slice(0, 10));
  }
  return days;
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

interface AttendanceWidget {
  status: WidgetStatus;
  summary: AttendanceTodaySummary | null;
}

interface SppWidget {
  status: WidgetStatus;
  summary: SppSummary | null;
}

interface CountWidget {
  status: WidgetStatus;
  students: number | null;
  teachers: number | null;
}

function PrincipalContent({ me }: { me: UserMe }) {
  const isSuperAdmin = me.role === "super_admin";
  const [schools, setSchools] = React.useState<SchoolRecord[]>([]);
  const [schoolId, setSchoolId] = React.useState<number | null>(me.school_id);
  const [today, setToday] = React.useState("");

  const [counts, setCounts] = React.useState<CountWidget>({
    status: "loading",
    students: null,
    teachers: null,
  });
  const [countsKey, setCountsKey] = React.useState(0);

  const [attendance, setAttendance] = React.useState<AttendanceWidget>({
    status: "loading",
    summary: null,
  });
  const [attendanceKey, setAttendanceKey] = React.useState(0);

  const [spp, setSpp] = React.useState<SppWidget>({
    status: "loading",
    summary: null,
  });
  const [sppKey, setSppKey] = React.useState(0);

  const [gradeEntry, setGradeEntry] = React.useState<{
    status: WidgetStatus;
    items: ProgressItem[];
  }>({ status: "loading", items: [] });
  const [gradeKey, setGradeKey] = React.useState(0);

  const [trend, setTrend] = React.useState<{
    status: WidgetStatus;
    points: number[];
  }>({ status: "loading", points: [] });
  const [trendKey, setTrendKey] = React.useState(0);

  const [announcements, setAnnouncements] = React.useState<{
    status: WidgetStatus;
    items: AnnouncementRecord[];
  }>({ status: "loading", items: [] });
  const [announcementKey, setAnnouncementKey] = React.useState(0);

  React.useEffect(() => {
    setToday(
      new Intl.DateTimeFormat("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date())
    );
  }, []);

  React.useEffect(() => {
    if (!isSuperAdmin) return;
    let active = true;
    fetchSchools({ size: 100 })
      .then((res) => {
        if (!active) return;
        setSchools(res.items);
        if (res.items.length > 0) {
          setSchoolId((prev) => prev ?? res.items[0].id);
        }
      })
      .catch(() => {
        /* Picker stays empty; widgets still query their default scope. */
      });
    return () => {
      active = false;
    };
  }, [isSuperAdmin]);

  const scope = React.useMemo(
    () => (schoolId === null ? {} : { school_id: schoolId }),
    [schoolId]
  );

  React.useEffect(() => {
    let active = true;
    setCounts((current) => ({ ...current, status: "loading" }));
    Promise.all([
      fetchStudents({ ...scope, size: 1 }),
      fetchUsers({ ...scope, role: "teacher", size: 1 }),
    ])
      .then(([students, teachers]) => {
        if (!active) return;
        setCounts({
          status: "ready",
          students: students.total,
          teachers: teachers.total,
        });
      })
      .catch(() => {
        if (!active) return;
        setCounts({ status: "error", students: null, teachers: null });
      });
    return () => {
      active = false;
    };
  }, [scope, countsKey]);

  React.useEffect(() => {
    let active = true;
    setAttendance({ status: "loading", summary: null });
    fetchAttendanceToday()
      .then((summary) => {
        if (active) setAttendance({ status: "ready", summary });
      })
      .catch(() => {
        if (active) setAttendance({ status: "error", summary: null });
      });
    return () => {
      active = false;
    };
  }, [schoolId, attendanceKey]);

  React.useEffect(() => {
    let active = true;
    setSpp({ status: "loading", summary: null });
    fetchSppSummary()
      .then((summary) => {
        if (active) setSpp({ status: "ready", summary });
      })
      .catch(() => {
        if (active) setSpp({ status: "error", summary: null });
      });
    return () => {
      active = false;
    };
  }, [schoolId, sppKey]);

  React.useEffect(() => {
    let active = true;
    setGradeEntry({ status: "loading", items: [] });
    const semester = currentSemester();
    Promise.all([
      fetchClasses({ ...scope, size: 100 }),
      fetchStudents({ ...scope, size: 100 }),
      fetchGrades({ semester, size: 100 }),
    ])
      .then(([classes, students, grades]) => {
        if (!active) return;
        const byClass = new Map<number, StudentRecord[]>();
        for (const student of students.items) {
          if (student.class_id === null) continue;
          const list = byClass.get(student.class_id) ?? [];
          list.push(student);
          byClass.set(student.class_id, list);
        }
        const graded = new Set(grades.items.map((grade) => grade.student_id));
        const items: ProgressItem[] = [];
        for (const klass of classes.items) {
          const roster = byClass.get(klass.id) ?? [];
          if (roster.length === 0) continue;
          const done = roster.filter((student) => graded.has(student.id)).length;
          items.push({
            label: klass.name,
            value: Math.round((done / roster.length) * 100),
            target: 100,
            display: `${done}/${roster.length}`,
          });
        }
        items.sort((a, b) => a.value - b.value);
        setGradeEntry({ status: "ready", items: items.slice(0, 6) });
      })
      .catch(() => {
        if (active) setGradeEntry({ status: "error", items: [] });
      });
    return () => {
      active = false;
    };
  }, [scope, gradeKey]);

  React.useEffect(() => {
    let active = true;
    setTrend({ status: "loading", points: [] });
    const days = last7Days();
    Promise.all(
      days.map((date) =>
        fetchAttendancesForRate(date).catch(() => null)
      )
    )
      .then((rates) => {
        if (!active) return;
        const points = rates.filter((v): v is number => v !== null);
        if (points.length === 0) {
          setTrend({ status: "error", points: [] });
          return;
        }
        setTrend({ status: "ready", points });
      })
      .catch(() => {
        if (active) setTrend({ status: "error", points: [] });
      });
    return () => {
      active = false;
    };
  }, [schoolId, trendKey]);

  React.useEffect(() => {
    let active = true;
    setAnnouncements({ status: "loading", items: [] });
    fetchAnnouncements({ ...scope, status: "published", size: 5 })
      .then((page) => {
        if (active) setAnnouncements({ status: "ready", items: page.items });
      })
      .catch(() => {
        if (active) setAnnouncements({ status: "error", items: [] });
      });
    return () => {
      active = false;
    };
  }, [scope, announcementKey]);

  const selectedSchool = schools.find((school) => school.id === schoolId);
  const schoolName = selectedSchool?.name ?? "Sekolah Anda";

  const attendanceCounts = attendance.summary?.counts ?? {};
  const hadir = attendanceCounts.hadir ?? 0;
  const attendanceTotal = attendance.summary?.total ?? 0;
  const attendanceRate =
    attendanceTotal > 0 ? Math.round((hadir / attendanceTotal) * 100) : 0;
  const attendanceBreakdown = {
    hadir,
    izin: attendanceCounts.izin ?? 0,
    sakit: attendanceCounts.sakit ?? 0,
    alpa: attendanceCounts.alpa ?? 0,
  };

  const trendAvg =
    trend.points.length > 0
      ? trend.points.reduce((sum, value) => sum + value, 0) / trend.points.length
      : 0;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Selamat pagi, {me.user.full_name.split(" ")[0]}
          </h1>
          <p className="text-xs text-muted-foreground">
            Kepala Sekolah · {schoolName}
            {today ? ` · ${today}` : ""}
          </p>
        </div>
        {isSuperAdmin && (
          <SchoolPicker
            schools={schools}
            value={schoolId}
            onChange={setSchoolId}
          />
        )}
      </div>

      <section
        aria-label="Indikator utama"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {counts.status === "loading" || attendance.status === "loading" ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <MetricCard
              label="Total Siswa"
              value={counts.students ?? 0}
              icon={Users}
              hint={
                counts.status === "error"
                  ? "Gagal memuat data"
                  : "Terdaftar di sekolah Anda"
              }
            />
            <MetricCard
              label="Kehadiran Hari Ini"
              value={`${attendanceRate}%`}
              icon={CalendarCheck}
              hint={
                attendance.status === "error"
                  ? "Gagal memuat data"
                  : attendanceTotal > 0
                    ? `${hadir}/${attendanceTotal} siswa hadir`
                    : "Belum ada absensi hari ini"
              }
            />
            <MetricCard
              label="Guru Aktif"
              value={counts.teachers ?? 0}
              icon={UserCog}
              hint={counts.status === "error" ? "Gagal memuat data" : "Guru aktif"}
            />
            <MetricCard
              label="SPP Terkumpul"
              value={
                spp.summary
                  ? formatRupiahCompact(spp.summary.total_collected)
                  : spp.status === "loading"
                    ? "…"
                    : "—"
              }
              icon={Wallet}
              hint={
                spp.summary
                  ? `${Math.round(spp.summary.collection_rate)}% dari ${formatRupiahCompact(
                      spp.summary.total_billed
                    )}`
                  : spp.status === "error"
                    ? "Gagal memuat data"
                    : "Memuat…"
              }
            />
          </>
        )}
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Rincian Kehadiran</CardTitle>
            <span className="text-2xs text-muted-foreground">
              {attendance.summary?.date ?? "Hari ini"}
            </span>
          </CardHeader>
          <CardBody>
            {attendance.status === "loading" ? (
              <SkeletonList rows={3} />
            ) : attendance.status === "error" ? (
              <WidgetError
                title="Gagal memuat kehadiran"
                onRetry={() => setAttendanceKey((k) => k + 1)}
              />
            ) : attendanceTotal > 0 ? (
              <Donut
                segments={attendanceSegments(attendanceBreakdown)}
                centerValue={attendanceTotal}
                centerLabel="siswa"
                ariaLabel="Rincian kehadiran hari ini"
                size={132}
              />
            ) : (
              <EmptyState
                icon={CalendarCheck}
                title="Belum ada data kehadiran"
                description="Data kehadiran hari ini akan tampil setelah absensi diisi."
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Penginputan Nilai</CardTitle>
            <span className="text-2xs text-muted-foreground">
              {currentSemester()}
            </span>
          </CardHeader>
          <CardBody>
            {gradeEntry.status === "loading" ? (
              <SkeletonList rows={4} />
            ) : gradeEntry.status === "error" ? (
              <WidgetError
                title="Gagal memuat progres nilai"
                onRetry={() => setGradeKey((k) => k + 1)}
              />
            ) : gradeEntry.items.length === 0 ? (
              <EmptyState
                icon={CircleCheckBig}
                title="Belum ada data kelas"
                description="Progres penginputan nilai muncul setelah kelas dan siswa tersedia."
              />
            ) : (
              <ProgressBars
                items={gradeEntry.items}
                ariaLabel="Progres penginputan nilai per kelas"
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tren Kehadiran 7 Hari</CardTitle>
            <StatusChip tone={trend.status === "error" ? "danger" : "success"}>
              {trend.status === "error" ? "tak tersedia" : "stabil"}
            </StatusChip>
          </CardHeader>
          <CardBody>
            {trend.status === "loading" ? (
              <SkeletonList rows={2} />
            ) : trend.status === "error" ? (
              <WidgetError
                title="Gagal memuat tren"
                onRetry={() => setTrendKey((k) => k + 1)}
              />
            ) : (
              <>
                <Sparkline
                  points={trend.points}
                  ariaLabel="Tren kehadiran tujuh hari terakhir"
                  width={260}
                  height={64}
                />
                <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-outline-variant pt-2 text-center">
                  <div>
                    <dt className="text-2xs text-muted-foreground">Rata-rata</dt>
                    <dd className="font-mono text-sm font-semibold tabular-nums text-foreground">
                      {trendAvg.toFixed(1)}%
                    </dd>
                  </div>
                  <div>
                    <dt className="text-2xs text-muted-foreground">Tertinggi</dt>
                    <dd className="font-mono text-sm font-semibold tabular-nums text-foreground">
                      {Math.max(...trend.points)}%
                    </dd>
                  </div>
                  <div>
                    <dt className="text-2xs text-muted-foreground">Terendah</dt>
                    <dd className="font-mono text-sm font-semibold tabular-nums text-foreground">
                      {Math.min(...trend.points)}%
                    </dd>
                  </div>
                </dl>
              </>
            )}
          </CardBody>
        </Card>
      </section>

      <Card>
        <CardHeader className="items-center">
          <CardTitle className="flex items-center gap-2">
            Pengumuman Terbit
            <span className="rounded-full bg-accent-container px-1.5 py-0.5 font-mono text-2xs font-semibold tabular-nums text-accent-container-foreground">
              {announcements.items.length}
            </span>
          </CardTitle>
          <Link
            href="/dashboard/announcements"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-surface-container-high"
          >
            Lihat semua
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </CardHeader>
        {announcements.status === "loading" ? (
          <div className="p-5">
            <SkeletonList rows={3} />
          </div>
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
              icon={Megaphone}
              title="Belum ada pengumuman"
              description="Pengumuman yang diterbitkan akan muncul di sini."
            />
          </CardBody>
        ) : (
          <ul className="divide-y divide-outline-variant">
            {announcements.items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-3 px-5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.title}
                  </p>
                  <p className="truncate text-2xs text-muted-foreground">
                    {item.body}
                  </p>
                </div>
                <span className="shrink-0 text-2xs text-muted-foreground">
                  {item.published_at
                    ? new Date(item.published_at).toLocaleDateString("id-ID")
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** Attendance rate (0-100) for a single date, or null when no data exists. */
async function fetchAttendancesForRate(date: string): Promise<number | null> {
  const page = await fetchAttendances({ date, size: 100 });
  if (page.total === 0) return null;
  const hadir = page.items.filter((row) => row.status === "hadir").length;
  return Math.round((hadir / page.total) * 100);
}

export default function PrincipalDashboardPage() {
  return (
    <DashboardShell role="principal" allow={["super_admin"]}>
      {(me) => <PrincipalContent me={me} />}
    </DashboardShell>
  );
}
