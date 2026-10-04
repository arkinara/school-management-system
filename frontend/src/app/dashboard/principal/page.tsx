"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  CircleCheckBig,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Donut } from "@/components/dashboard/Donut";
import { ProgressBars } from "@/components/dashboard/ProgressBars";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { SchoolPicker } from "@/components/dashboard/SchoolPicker";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusChip } from "@/components/ui/StatusChip";
import { SkeletonCard } from "@/components/ui/Skeleton";
import {
  fetchSchools,
  fetchStudents,
  fetchUsers,
  type SchoolRecord,
} from "@/lib/endpoints";
import type { UserMe } from "@/lib/auth";
import {
  attendanceSegments,
  formatRupiahCompact,
  principalMock,
} from "@/components/dashboard/mock-data";

type KpiStatus = "loading" | "ready" | "error";

function PrincipalContent({ me }: { me: UserMe }) {
  const isSuperAdmin = me.role === "super_admin";
  const [schools, setSchools] = React.useState<SchoolRecord[]>([]);
  const [schoolId, setSchoolId] = React.useState<number | null>(me.school_id);
  const [kpiStatus, setKpiStatus] = React.useState<KpiStatus>("loading");
  const [totals, setTotals] = React.useState<{
    students: number | null;
    teachers: number | null;
  }>({ students: null, teachers: null });
  const [pending, setPending] = React.useState(principalMock.pendingAnnouncements);
  const [today, setToday] = React.useState("");

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
        /* Picker stays empty; the KPI fetch falls back to mock. */
      });
    return () => {
      active = false;
    };
  }, [isSuperAdmin]);

  React.useEffect(() => {
    let active = true;
    const scope = schoolId === null ? {} : { school_id: schoolId };
    setKpiStatus("loading");
    Promise.all([
      fetchStudents({ ...scope, size: 1 }),
      fetchUsers({ ...scope, role: "teacher", size: 1 }),
    ])
      .then(([students, teachers]) => {
        if (!active) return;
        setTotals({ students: students.total, teachers: teachers.total });
        setKpiStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setTotals({ students: null, teachers: null });
        setKpiStatus("error");
      });
    return () => {
      active = false;
    };
  }, [schoolId]);

  const selectedSchool = schools.find((school) => school.id === schoolId);
  const schoolName = selectedSchool?.name ?? "Sekolah Anda";
  const totalStudents = totals.students ?? principalMock.totalStudents;
  const activeTeachers = totals.teachers ?? principalMock.activeTeachers;
  const attendance = principalMock.attendance;
  const attendanceTotal =
    attendance.hadir + attendance.izin + attendance.sakit + attendance.alpa;
  const trendValues = principalMock.attendanceTrend.map((point) => point.value);
  const trendAvg =
    trendValues.reduce((sum, value) => sum + value, 0) / trendValues.length;
  const kpiHint =
    kpiStatus === "error"
      ? "Perkiraan — gagal memuat data langsung"
      : undefined;

  function resolvePending(id: string) {
    setPending((current) => current.filter((item) => item.id !== id));
  }

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
        {kpiStatus === "loading" ? (
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
              value={totalStudents}
              icon={Users}
              delta={{ value: "+12", direction: "up" }}
              hint={kpiHint ?? "18 rombel aktif"}
            />
            <MetricCard
              label="Kehadiran Hari Ini"
              value={`${principalMock.attendanceRate}%`}
              icon={CalendarCheck}
              delta={{ value: "+1%", direction: "up" }}
              hint={`${attendance.hadir}/${attendanceTotal} siswa · target 95%`}
            />
            <MetricCard
              label="Guru Aktif"
              value={activeTeachers}
              icon={UserCog}
              hint={kpiHint ?? "2 izin hari ini"}
            />
            <MetricCard
              label="SPP Terkumpul"
              value={formatRupiahCompact(principalMock.sppCollected)}
              icon={Wallet}
              hint="82% dari target bulanan"
            />
          </>
        )}
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Rincian Kehadiran</CardTitle>
            <span className="text-2xs text-muted-foreground">30 Sep</span>
          </CardHeader>
          <CardBody>
            {attendanceTotal > 0 ? (
              <Donut
                segments={attendanceSegments(attendance)}
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
              Semester Ganjil 2026/2027
            </span>
          </CardHeader>
          <CardBody>
            <ProgressBars
              items={principalMock.gradeEntry}
              ariaLabel="Progres penginputan nilai per kelas"
            />
            <p className="mt-3 border-t border-outline-variant pt-2 text-2xs text-muted-foreground">
              Kelas 1-3 tertinggal — jatuh tempo input{" "}
              <span className="font-mono font-semibold text-foreground">7 Okt</span>.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tren Kehadiran 7 Hari</CardTitle>
            <StatusChip tone="success">stabil</StatusChip>
          </CardHeader>
          <CardBody>
            <Sparkline
              points={trendValues}
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
                  {Math.max(...trendValues)}%
                </dd>
              </div>
              <div>
                <dt className="text-2xs text-muted-foreground">Terendah</dt>
                <dd className="font-mono text-sm font-semibold tabular-nums text-foreground">
                  {Math.min(...trendValues)}%
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      </section>

      <Card>
        <CardHeader className="items-center">
          <CardTitle className="flex items-center gap-2">
            Pengumuman Menunggu Persetujuan
            <span className="rounded-full bg-accent-container px-1.5 py-0.5 font-mono text-2xs font-semibold tabular-nums text-accent-container-foreground">
              {pending.length}
            </span>
          </CardTitle>
          <Link
            href="/dashboard/principal/announcements"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-surface-container-high"
          >
            Lihat semua
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </CardHeader>
        {pending.length === 0 ? (
          <CardBody>
            <EmptyState
              icon={CircleCheckBig}
              title="Antrean bersih"
              description="Semua pengumuman sudah diproses. Pengajuan baru dari Guru atau TU akan muncul di sini."
            />
          </CardBody>
        ) : (
          <ul className="divide-y divide-outline-variant">
            {pending.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-3 px-5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.title}
                  </p>
                  <p className="truncate text-2xs text-muted-foreground">
                    Diajukan {item.submittedBy} · {item.submittedAt} · target:{" "}
                    {item.audience}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    variant="outlined"
                    className="min-h-10 px-3 text-xs"
                    onClick={() => resolvePending(item.id)}
                  >
                    Tolak
                  </Button>
                  <Button
                    className="min-h-10 px-3 text-xs"
                    onClick={() => resolvePending(item.id)}
                  >
                    Setujui
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function PrincipalDashboardPage() {
  return (
    <DashboardShell role="principal" allow={["super_admin"]}>
      {(me) => <PrincipalContent me={me} />}
    </DashboardShell>
  );
}
