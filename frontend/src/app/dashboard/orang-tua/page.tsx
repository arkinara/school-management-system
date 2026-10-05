"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CalendarCheck,
  ClipboardList,
  Megaphone,
  TrendingUp,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { GradeBars, type GradeBarItem } from "@/components/dashboard/GradeBars";
import { ProgressBars } from "@/components/dashboard/ProgressBars";
import { Avatar } from "@/components/ui/Avatar";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusChip } from "@/components/ui/StatusChip";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { fetchParentChildren, type ChildSummary } from "@/lib/endpoints";
import type { UserMe } from "@/lib/auth";

type LoadStatus = "loading" | "ready" | "error";

interface AttendanceBreakdown {
  hadir: number;
  izin: number;
  sakit: number;
  alpa: number;
}

interface ChildProfile {
  key: string;
  name: string;
  className: string;
  nis: string;
  average: number;
  attendanceRate: number;
  rank: number;
  classSize: number;
  grades: GradeBarItem[];
  attendance: AttendanceBreakdown;
}

interface BillItem {
  id: string;
  label: string;
  amount: number;
  status: "paid" | "overdue";
}

interface ParentAnnouncement {
  id: string;
  title: string;
  body: string;
  audience: string;
  time: string;
}

const CHILD_MOCKS: ChildProfile[] = [
  {
    key: "andi",
    name: "Andi Wijaya",
    className: "6A",
    nis: "2019001",
    average: 85.7,
    attendanceRate: 96,
    rank: 4,
    classSize: 32,
    grades: [
      { subject: "Matematika", score: 88 },
      { subject: "Bahasa Indonesia", score: 85 },
      { subject: "IPA", score: 90 },
      { subject: "IPS", score: 78 },
      { subject: "Bahasa Inggris", score: 82 },
      { subject: "PJOK", score: 91 },
    ],
    attendance: { hadir: 23, izin: 1, sakit: 0, alpa: 0 },
  },
  {
    key: "dinda",
    name: "Dinda Wijaya",
    className: "3B",
    nis: "2022008",
    average: 86.5,
    attendanceRate: 98,
    rank: 2,
    classSize: 30,
    grades: [
      { subject: "Matematika", score: 81 },
      { subject: "Bahasa Indonesia", score: 92 },
      { subject: "IPA", score: 86 },
      { subject: "IPS", score: 84 },
      { subject: "Bahasa Inggris", score: 79 },
      { subject: "PJOK", score: 90 },
    ],
    attendance: { hadir: 24, izin: 0, sakit: 1, alpa: 0 },
  },
];

const BILLS: BillItem[] = [
  { id: "sep", label: "SPP September", amount: 350_000, status: "overdue" },
  { id: "agu", label: "SPP Agustus", amount: 350_000, status: "paid" },
  { id: "jul", label: "SPP Juli", amount: 350_000, status: "paid" },
  { id: "ser", label: "Seragam & Buku", amount: 780_000, status: "paid" },
];

const ANNOUNCEMENTS: ParentAnnouncement[] = [
  {
    id: "n1",
    title: "Libur Maulid Nabi — 7 Oktober",
    body: "Kegiatan belajar diliburkan. Pembelajaran kembali normal 8 Oktober.",
    audience: "Semua sekolah",
    time: "2 jam lalu",
  },
  {
    id: "n2",
    title: "Jadwal Ujian Tengah Semester",
    body: "UTS 14–18 Oktober. Kisi-kisi dibagikan wali kelas minggu depan.",
    audience: "Kelas 6A",
    time: "5 jam lalu",
  },
  {
    id: "n3",
    title: "Pembagian Rapor Tengah Semester",
    body: "Orang tua diunduh hadir 25 Oktober pukul 08.00 di ruang kelas.",
    audience: "Kelas 6A",
    time: "2 hari lalu",
  },
];

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function resolveChild(child: ChildSummary, index: number): ChildProfile {
  const base =
    CHILD_MOCKS.find((mock) => mock.name === child.full_name) ??
    CHILD_MOCKS[index % CHILD_MOCKS.length];
  return {
    ...base,
    key: `child-${child.id}`,
    name: child.full_name,
    nis: child.nis,
    className: child.class_id ? `Kelas ${child.class_id}` : base.className,
    grades: [],
  };
}

function AttendanceBreakdownList({
  attendance,
}: {
  attendance: AttendanceBreakdown;
}) {
  const rows: { label: string; value: number; tone: string }[] = [
    { label: "Hadir", value: attendance.hadir, tone: "bg-success" },
    { label: "Izin", value: attendance.izin, tone: "bg-info" },
    { label: "Sakit", value: attendance.sakit, tone: "bg-warning" },
    { label: "Alpa", value: attendance.alpa, tone: "bg-destructive" },
  ];
  return (
    <dl
      className="mt-3 grid grid-cols-4 gap-2 border-t border-outline-variant pt-3 text-center"
      aria-label="Rincian kehadiran bulan ini"
    >
      {rows.map((row) => (
        <div key={row.label} className="flex flex-col items-center gap-1">
          <dt className="flex items-center gap-1.5 text-2xs text-muted-foreground">
            <span className={cn("h-2 w-2 rounded-full", row.tone)} aria-hidden />
            {row.label}
          </dt>
          <dd className="font-mono text-base font-semibold tabular-nums text-foreground">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function OrangTuaContent({ me }: { me: UserMe }) {
  const [status, setStatus] = React.useState<LoadStatus>("loading");
  const [children, setChildren] = React.useState<ChildProfile[]>([]);
  const [selectedKey, setSelectedKey] = React.useState<string>("");
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
    let active = true;
    fetchParentChildren(me.user.id)
      .then((kids) => {
        if (!active) return;
        if (kids.length === 0) {
          setChildren([]);
          setStatus("ready");
          return;
        }
        const resolved = kids.map(resolveChild);
        setChildren(resolved);
        setSelectedKey(resolved[0].key);
        setStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setChildren(CHILD_MOCKS);
        setSelectedKey(CHILD_MOCKS[0].key);
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [me.user.id]);

  const child = children.find((item) => item.key === selectedKey) ?? children[0];
  const overdue = BILLS.find((bill) => bill.status === "overdue");
  const paidCount = BILLS.filter((bill) => bill.status === "paid").length;
  const paidPct = Math.round((paidCount / BILLS.length) * 100);
  const kpiHint =
    status === "error" ? "Perkiraan — gagal memuat data langsung" : undefined;

  if (status === "loading") {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <div>
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-2 h-3 w-32" />
        </div>
        <Skeleton className="h-10 w-full max-w-md rounded-full" />
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </section>
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <SkeletonCard />
          </div>
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Selamat pagi, {me.user.full_name.split(" ")[0]}
          </h1>
          <p className="text-xs text-muted-foreground">Orang Tua{today ? ` · ${today}` : ""}</p>
        </div>
        <EmptyState
          icon={ClipboardList}
          title="Belum ada data anak yang terhubung"
          description="Akun Anda belum terhubung ke data siswa. Hubungi tata usaha sekolah untuk menautkan anak Anda."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Selamat pagi, {me.user.full_name.split(" ")[0]}
          </h1>
          <p className="text-xs text-muted-foreground">
            Orang Tua · {children.length} anak{today ? ` · ${today}` : ""}
          </p>
        </div>
        <Link
          href="/dashboard/orang-tua/rapor"
          className="flex min-h-10 items-center gap-1.5 rounded-full border border-outline px-4 text-xs font-medium text-primary hover:bg-surface-container-high"
        >
          Rapor lengkap
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      <section aria-label="Pilih anak" className="flex flex-wrap items-center gap-2">
        <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          Pilih anak
        </span>
        {children.length === 1 ? (
          <div className="flex min-h-10 items-center gap-2 rounded-full border border-primary bg-primary-container px-3 py-1 text-xs font-semibold text-primary-container-foreground">
            <Avatar name={child.name} size="sm" />
            {child.name} · {child.className}
          </div>
        ) : (
          children.map((item) => {
            const on = item.key === selectedKey;
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={on}
                onClick={() => setSelectedKey(item.key)}
                className={cn(
                  "flex min-h-10 items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors",
                  on
                    ? "border-primary bg-primary-container font-semibold text-primary-container-foreground"
                    : "border-outline-variant font-medium text-muted-foreground hover:bg-surface-3"
                )}
              >
                <Avatar name={item.name} size="sm" />
                {item.name} · {item.className}
              </button>
            );
          })
        )}
      </section>

      {overdue && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/50 bg-destructive-container px-4 py-3 text-destructive-container-foreground"
        >
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{overdue.label} belum dibayar</p>
            <p className="text-2xs">
              Nominal{" "}
              <span className="font-mono font-semibold tabular-nums">
                {formatRupiah(overdue.amount)}
              </span>{" "}
              · mohon segera diselesaikan.
            </p>
          </div>
          <Link
            href="/dashboard/orang-tua/spp"
            className="flex min-h-10 shrink-0 items-center rounded-full bg-destructive px-4 text-xs font-semibold text-destructive-foreground hover:opacity-90"
          >
            Bayar
          </Link>
        </div>
      )}

      <section
        aria-label="Ringkasan anak"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        <MetricCard
          label="Rata-rata"
          value={child.average.toFixed(1).replace(".", ",")}
          icon={TrendingUp}
          hint={kpiHint ?? `Semester ini · ${child.name}`}
        />
        <MetricCard
          label="Kehadiran"
          value={`${child.attendanceRate}%`}
          icon={CalendarCheck}
          hint="Semester ini"
        />
        <MetricCard
          label="Peringkat Kelas"
          value={`${child.rank}/${child.classSize}`}
          icon={ClipboardList}
          hint="Dari jumlah siswa sekelas"
        />
      </section>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="items-center border-b border-outline-variant pb-3">
            <CardTitle>Perkembangan Nilai · {child.name}</CardTitle>
            <Link
              href="/dashboard/orang-tua/rapor"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-surface-container-high"
            >
              Rapor lengkap
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </CardHeader>
          <CardBody>
            {child.grades.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="Belum ada nilai tercatat"
                description={`Nilai ${child.name} akan tampil setelah guru menerbitkannya.`}
              />
            ) : (
              <>
                <GradeBars
                  items={child.grades}
                  ariaLabel={`Nilai mata pelajaran ${child.name}`}
                />
                <AttendanceBreakdownList attendance={child.attendance} />
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="items-center border-b border-outline-variant pb-3">
            <CardTitle>Status Pembayaran</CardTitle>
            {overdue ? (
              <StatusChip tone="danger">1 menunggak</StatusChip>
            ) : (
              <StatusChip tone="success">lunas</StatusChip>
            )}
          </CardHeader>
          {BILLS.length === 0 ? (
            <CardBody>
              <EmptyState
                icon={Megaphone}
                title="Belum ada tagihan"
                description="Tidak ada tagihan pada periode ini."
              />
            </CardBody>
          ) : (
            <>
              <ul className="divide-y divide-outline-variant">
                {BILLS.map((bill) => (
                  <li
                    key={bill.id}
                    className="flex items-center justify-between gap-2 px-5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {bill.label}
                      </p>
                      <p className="font-mono text-2xs tabular-nums text-muted-foreground">
                        {formatRupiah(bill.amount)}
                      </p>
                    </div>
                    <StatusChip
                      tone={bill.status === "paid" ? "success" : "danger"}
                    >
                      {bill.status === "paid" ? "lunas" : "menunggak"}
                    </StatusChip>
                  </li>
                ))}
              </ul>
              <div className="border-t border-outline-variant px-5 py-3">
                <ProgressBars
                  items={[
                    {
                      label: "Tagihan lunas",
                      value: paidPct,
                      display: `${paidCount}/${BILLS.length}`,
                    },
                  ]}
                  ariaLabel="Rasio tagihan lunas"
                />
                <Link
                  href="/dashboard/orang-tua/spp"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Lihat semua
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>
            </>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader className="items-center border-b border-outline-variant pb-3">
          <CardTitle>Pengumuman Terbaru</CardTitle>
          <span className="font-mono text-2xs tabular-nums text-muted-foreground">
            {ANNOUNCEMENTS.length} baru
          </span>
        </CardHeader>
        {ANNOUNCEMENTS.length === 0 ? (
          <CardBody>
            <EmptyState
              icon={Megaphone}
              title="Belum ada pengumuman"
              description="Pengumuman dari sekolah akan tampil di sini."
            />
          </CardBody>
        ) : (
          <ul className="divide-y divide-outline-variant">
            {ANNOUNCEMENTS.map((item) => (
              <li key={item.id} className="flex gap-3 px-5 py-3">
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-2xs text-muted-foreground">
                    {item.body}
                  </p>
                  <p className="mt-1 text-2xs text-muted-foreground">
                    {item.audience}
                  </p>
                </div>
                <span className="shrink-0 text-2xs text-muted-foreground">
                  {item.time}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function OrangTuaDashboardPage() {
  return (
    <DashboardShell role="parent">
      {(me) => <OrangTuaContent me={me} />}
    </DashboardShell>
  );
}
