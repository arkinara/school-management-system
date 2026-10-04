"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ClipboardList,
  FileText,
  TrendingUp,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ProgressBars } from "@/components/dashboard/ProgressBars";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusChip } from "@/components/ui/StatusChip";
import { cn } from "@/components/ui/cn";
import type { UserMe } from "@/lib/auth";
import {
  formatSessionTime,
  normalizeRaporStatus,
  siswaMock,
} from "@/components/dashboard/mock-data";

const BAR_TONE: Record<string, string> = {
  danger: "bg-destructive",
  warning: "bg-warning",
  success: "bg-success",
  info: "bg-info",
  neutral: "bg-outline",
  primary: "bg-primary",
};

function SiswaContent({ me }: { me: UserMe }) {
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

  const { sessions, assignments, rapor, announcements } = siswaMock;
  const raporStatus = normalizeRaporStatus(rapor.status);
  const average = siswaMock.average.toFixed(1).replace(".", ",");

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Halo, {me.user.full_name.split(" ")[0]}
          </h1>
          <p className="text-xs text-muted-foreground">
            Siswa · {today}
          </p>
        </div>
        <Link
          href="/dashboard/siswa/jadwal"
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
        <MetricCard
          label="Rata-rata Nilai"
          value={average}
          icon={TrendingUp}
          delta={{ value: "+2,1", direction: "up" }}
          hint="Dari semester lalu"
        />
        <MetricCard
          label="Kehadiran"
          value={`${siswaMock.attendanceRate}%`}
          icon={CalendarDays}
          hint="Semester ini"
        />
        <MetricCard
          label="Peringkat Kelas"
          value={`${siswaMock.rank}/${siswaMock.classSize}`}
          icon={ClipboardList}
          hint="Naik 2 posisi"
        />
      </section>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="items-center border-b border-outline-variant pb-3">
            <CardTitle>Jadwal Hari Ini</CardTitle>
            <span className="font-mono text-2xs tabular-nums text-muted-foreground">
              {sessions.length} mata pelajaran
            </span>
          </CardHeader>
          {sessions.length === 0 ? (
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
                {sessions.map((session) => (
                  <li
                    key={session.id}
                    className={cn(
                      "flex items-center gap-3 px-5 py-2.5",
                      session.status === "done" && "opacity-60",
                      session.status === "now" && "bg-primary-container/40"
                    )}
                  >
                    <span className="w-16 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                      {session.startTime ?? "--.--"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {session.subject}
                      </p>
                      <p className="truncate text-2xs text-muted-foreground">
                        {session.teacher} · {session.room} ·{" "}
                        {formatSessionTime(session.startTime, session.endTime)}
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
                  href="/dashboard/siswa/jadwal"
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
            <span className="rounded-full bg-accent-container px-1.5 py-0.5 font-mono text-2xs font-semibold tabular-nums text-accent-container-foreground">
              {assignments.length}
            </span>
          </CardHeader>
          {assignments.length === 0 ? (
            <CardBody>
              <EmptyState
                icon={ClipboardList}
                title="Tidak ada tugas"
                description="Semua tugas sudah selesai. Kerja bagus!"
              />
            </CardBody>
          ) : (
            <ul className="divide-y divide-outline-variant">
              {assignments.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start gap-3 px-5 py-3"
                >
                  <span
                    className={cn(
                      "mt-0.5 h-9 w-1 shrink-0 rounded-full",
                      BAR_TONE[item.tone] ?? "bg-outline"
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {item.title}
                    </p>
                    <p className="text-2xs text-muted-foreground">
                      {item.subject}
                    </p>
                    <p className="mt-0.5 text-2xs font-semibold text-muted-foreground">
                      Tenggat {item.due}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="items-center border-b border-outline-variant pb-3">
            <CardTitle>Rapor Singkat</CardTitle>
            <div className="flex items-center gap-2">
              <StatusChip
                tone={raporStatus === "published" ? "success" : "neutral"}
              >
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
            <p className="mb-3 text-2xs text-muted-foreground">
              {rapor.semester}
            </p>
            {rapor.grades.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Belum ada nilai"
                description="Nilai rapor akan tampil setelah guru menerbitkannya."
              />
            ) : (
              <>
                <ProgressBars
                  items={rapor.grades.map((grade) => ({
                    label: grade.subject,
                    value: grade.score,
                    display: String(grade.score),
                  }))}
                  ariaLabel="Nilai per mata pelajaran"
                />
                <p className="mt-3 border-t border-outline-variant pt-2 text-2xs text-muted-foreground">
                  {raporStatus === "published"
                    ? "Rapor sudah diterbitkan dan dapat diunduh."
                    : "Rapor belum diterbitkan. Nilai masih dapat berubah."}
                </p>
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="items-center border-b border-outline-variant pb-3">
            <CardTitle>Pengumuman</CardTitle>
            <span className="font-mono text-2xs tabular-nums text-muted-foreground">
              {announcements.length} baru
            </span>
          </CardHeader>
          <ul className="divide-y divide-outline-variant">
            {announcements.map((item) => (
              <li key={item.id} className="px-5 py-3">
                <p className="text-sm font-medium text-foreground">
                  {item.title}
                </p>
                <p className="mt-0.5 text-2xs text-muted-foreground">
                  {item.body}
                </p>
                <p className="mt-1 text-2xs text-muted-foreground">
                  {item.time}
                </p>
              </li>
            ))}
          </ul>
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
