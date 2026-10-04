"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  Check,
  ClipboardList,
  Users,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusChip } from "@/components/ui/StatusChip";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { fetchClasses, fetchStudents } from "@/lib/endpoints";
import type { UserMe } from "@/lib/auth";
import { guruMock, safePendingCount } from "@/components/dashboard/mock-data";

const BAR_TONE: Record<string, string> = {
  danger: "bg-destructive",
  warning: "bg-warning",
  success: "bg-success",
  info: "bg-info",
  neutral: "bg-outline",
  primary: "bg-primary",
};

function GuruContent({ me }: { me: UserMe }) {
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [counts, setCounts] = React.useState({
    classCount: guruMock.classCount,
    studentCount: guruMock.studentCount,
  });
  const [today, setToday] = React.useState("");

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
    fetchClasses({ size: 100 })
      .then((res) => {
        const mine = res.items.filter(
          (klass) => klass.wali_kelas_id === me.user.id
        );
        const classIds = new Set(mine.map((klass) => klass.id));
        return fetchStudents({ size: 100 }).then((students) => {
          const total = students.items.filter(
            (student) =>
              student.class_id !== null && classIds.has(student.class_id)
          ).length;
          if (!active) return;
          setCounts({ classCount: mine.length, studentCount: total });
          setStatus("ready");
        });
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [me.user.id]);

  const sessions = guruMock.todaySessions;
  const gradeQueue = guruMock.gradeQueue;
  const attendanceQueue = guruMock.attendanceQueue;
  const pendingCount = safePendingCount(guruMock.pendingGrades);
  const kpiHint =
    status === "error" ? "Perkiraan — gagal memuat data langsung" : undefined;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Selamat pagi, {me.user.full_name.split(" ")[0]}
          </h1>
          <p className="text-xs text-muted-foreground">
            Guru · {today}
          </p>
        </div>
        <Link
          href="/dashboard/guru/attendance"
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
        {status === "loading" ? (
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
              value={counts.classCount}
              icon={BookOpen}
              hint={kpiHint ?? "Wali kelas"}
            />
            <MetricCard
              label="Siswa Aktif"
              value={counts.studentCount}
              icon={Users}
              hint={kpiHint ?? "Di kelas yang diampu"}
            />
            <MetricCard
              label="Nilai Belum Diinput"
              value={pendingCount}
              icon={ClipboardList}
              hint="Terdekat jatuh tempo 2 Okt"
            />
            <MetricCard
              label="Kehadiran Hari Ini"
              value={`${guruMock.attendanceRate}%`}
              icon={CalendarCheck}
              delta={{ value: "+1%", direction: "up" }}
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
              {sessions.length} sesi
            </span>
          </CardHeader>
          {sessions.length === 0 ? (
            <CardBody>
              <EmptyState
                icon={CalendarCheck}
                title="Tidak ada kelas hari ini"
                description="Jadwal mengajar akan tampil di sini pada hari sekolah."
              />
            </CardBody>
          ) : (
            <ol className="divide-y divide-outline-variant">
              {sessions.map((session) => (
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
                      {session.room} · {session.startTime}–{session.endTime}
                    </p>
                  </div>
                  {session.status === "done" ? (
                    <Check className="h-4 w-4 shrink-0 text-success" aria-hidden />
                  ) : session.status === "now" ? (
                    <StatusChip tone="primary">sekarang</StatusChip>
                  ) : (
                    <Link
                      href={`/dashboard/guru/attendance/${session.id}`}
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
                <StatusChip tone="warning">
                  {attendanceQueue.length} tertunda
                </StatusChip>
              ) : (
                <StatusChip tone="success">selesai</StatusChip>
              )}
            </CardHeader>
            {attendanceQueue.length === 0 ? (
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
                  <li
                    key={item.id}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        Kelas {item.className} · {item.subject}
                      </p>
                      <p className="font-mono text-2xs tabular-nums text-muted-foreground">
                        {item.time} · {item.studentCount} siswa
                      </p>
                    </div>
                    <Link
                      href={`/dashboard/guru/attendance/${item.classId}`}
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
            {gradeQueue.length === 0 ? (
              <CardBody>
                <EmptyState
                  icon={ClipboardList}
                  title="Semua nilai sudah diinput"
                  description="Antrean penilaian kosong untuk saat ini."
                />
              </CardBody>
            ) : (
              <ul className="divide-y divide-outline-variant">
                {gradeQueue.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <span
                      className={cn(
                        "h-9 w-1 shrink-0 rounded-full",
                        BAR_TONE[item.urgency] ?? "bg-outline"
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {item.subject} · {item.className}
                      </p>
                      <p className="text-2xs text-muted-foreground">
                        Entri terakhir {item.lastEntry} · {item.due}
                      </p>
                    </div>
                    <Link
                      href={`/dashboard/guru/grades/${item.classId}/${item.subjectId}`}
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
              <CardTitle>Pengumuman Terbaru</CardTitle>
              <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
            </CardHeader>
            <ul className="divide-y divide-outline-variant">
              {guruMock.announcements.map((item) => (
                <li key={item.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {item.title}
                    </p>
                    <span className="shrink-0 text-2xs text-muted-foreground">
                      {item.time}
                    </span>
                  </div>
                  <p className="mt-0.5 text-2xs text-muted-foreground">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function GuruDashboardPage() {
  return (
    <DashboardShell role="teacher">
      {(me) => <GuruContent me={me} />}
    </DashboardShell>
  );
}
