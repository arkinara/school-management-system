"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CalendarCheck,
  ClipboardList,
  Megaphone,
  RotateCcw,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { GradeBars, type GradeBarItem } from "@/components/dashboard/GradeBars";
import { ProgressBars } from "@/components/dashboard/ProgressBars";
import { Avatar } from "@/components/ui/Avatar";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusChip } from "@/components/ui/StatusChip";
import { Skeleton, SkeletonCard, SkeletonList } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import {
  fetchAnnouncements,
  fetchAttendances,
  fetchClasses,
  fetchGradeAggregate,
  fetchParentChildren,
  fetchReportCards,
  getBills,
  currentSemester,
  type AnnouncementRecord,
  type AttendanceRecord,
  type ChildSummary,
  type ClassRecord,
  type SppBill,
} from "@/lib/endpoints";
import type { UserMe } from "@/lib/auth";

type LoadStatus = "loading" | "ready" | "error";

interface AttendanceBreakdown {
  hadir: number;
  izin: number;
  sakit: number;
  alpa: number;
}

interface BillItem {
  id: number;
  label: string;
  amount: number;
  status: "paid" | "overdue" | "unpaid";
}

interface ChildData {
  status: LoadStatus;
  average: number | null;
  attendanceRate: number;
  rank: null;
  grades: GradeBarItem[];
  attendance: AttendanceBreakdown;
  bills: BillItem[];
}

const EMPTY_CHILD: ChildData = {
  status: "loading",
  average: null,
  attendanceRate: 0,
  rank: null,
  grades: [],
  attendance: { hadir: 0, izin: 0, sakit: 0, alpa: 0 },
  bills: [],
};

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
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
  const [childrenStatus, setChildrenStatus] =
    React.useState<LoadStatus>("loading");
  const [children, setChildren] = React.useState<ChildSummary[]>([]);
  const [classMap, setClassMap] = React.useState<Map<number, ClassRecord>>(
    new Map()
  );
  const [childrenKey, setChildrenKey] = React.useState(0);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [childData, setChildData] = React.useState<ChildData>(EMPTY_CHILD);
  const [childKey, setChildKey] = React.useState(0);
  const [today, setToday] = React.useState("");

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
        year: "numeric",
      }).format(new Date())
    );
  }, []);

  React.useEffect(() => {
    let active = true;
    setChildrenStatus("loading");
    Promise.all([
      fetchParentChildren(me.user.id),
      fetchClasses({ size: 100 }),
    ])
      .then(([kids, classPage]) => {
        if (!active) return;
        setChildren(kids);
        setClassMap(new Map(classPage.items.map((k) => [k.id, k])));
        setSelectedId((prev) => prev ?? kids[0]?.id ?? null);
        setChildrenStatus("ready");
      })
      .catch(() => {
        if (active) setChildrenStatus("error");
      });
    return () => {
      active = false;
    };
  }, [me.user.id, childrenKey]);

  React.useEffect(() => {
    if (selectedId === null) return;
    let active = true;
    setChildData(EMPTY_CHILD);
    const semester = currentSemester();
    Promise.all([
      fetchGradeAggregate({ student_id: selectedId, semester }).catch(
        () => null
      ),
      fetchAttendances({ student_id: selectedId, size: 100 }),
      fetchReportCards({ student_id: selectedId, semester, size: 1 }),
      getBills({ student_id: selectedId, size: 100 }),
    ])
      .then(([aggregate, attendance, rapors, bills]) => {
        if (!active) return;
        const breakdown: AttendanceBreakdown = {
          hadir: 0,
          izin: 0,
          sakit: 0,
          alpa: 0,
        };
        for (const row of attendance.items as AttendanceRecord[]) {
          breakdown[row.status] += 1;
        }
        const totalAttendance = attendance.total;
        const rate =
          totalAttendance > 0
            ? Math.round((breakdown.hadir / totalAttendance) * 100)
            : 0;

        let grades: GradeBarItem[] = [];
        let average: number | null = null;
        if (aggregate && aggregate.per_subject.length > 0) {
          grades = aggregate.per_subject.map((item) => ({
            subject: item.subject_name ?? `Mapel ${item.subject_id}`,
            score: Math.round(item.average),
          }));
          average = aggregate.overall_average;
        } else {
          const nilai = rapors.items[0]?.compiled_data?.nilai ?? [];
          grades = nilai.map((entry) => ({
            subject: entry.subject,
            score: Math.round(entry.score),
          }));
          average =
            grades.length > 0
              ? grades.reduce((sum, item) => sum + item.score, 0) / grades.length
              : null;
        }

        const billItems: BillItem[] = (bills.items as SppBill[]).map((bill) => ({
          id: bill.id,
          label: `SPP ${bill.period}`,
          amount: bill.status === "paid" ? bill.amount : bill.balance,
          status: bill.status,
        }));

        setChildData({
          status: "ready",
          average,
          attendanceRate: rate,
          rank: null,
          grades,
          attendance: breakdown,
          bills: billItems,
        });
      })
      .catch(() => {
        if (active) setChildData({ ...EMPTY_CHILD, status: "error" });
      });
    return () => {
      active = false;
    };
  }, [selectedId, childKey]);

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

  const child = children.find((item) => item.id === selectedId) ?? children[0];
  const overdue = childData.bills.find((bill) => bill.status === "overdue");
  const paidCount = childData.bills.filter((bill) => bill.status === "paid").length;
  const paidPct =
    childData.bills.length > 0
      ? Math.round((paidCount / childData.bills.length) * 100)
      : 0;

  if (childrenStatus === "loading") {
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

  if (childrenStatus === "error") {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <WidgetError
          title="Gagal memuat data anak"
          onRetry={() => setChildrenKey((k) => k + 1)}
        />
      </div>
    );
  }

  if (children.length === 0 || !child) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Selamat pagi, {me.user.full_name.split(" ")[0]}
          </h1>
          <p className="text-xs text-muted-foreground">
            Orang Tua{today ? ` · ${today}` : ""}
          </p>
        </div>
        <EmptyState
          icon={ClipboardList}
          title="Belum ada data anak yang terhubung"
          description="Akun Anda belum terhubung ke data siswa. Hubungi tata usaha sekolah untuk menautkan anak Anda."
        />
      </div>
    );
  }

  const className = child.class_id
    ? classMap.get(child.class_id)?.name ?? `Kelas ${child.class_id}`
    : "—";

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
            <Avatar name={child.full_name} size="sm" />
            {child.full_name} · {className}
          </div>
        ) : (
          children.map((item) => {
            const on = item.id === child.id;
            const itemClass = item.class_id
              ? classMap.get(item.class_id)?.name ?? `Kelas ${item.class_id}`
              : "—";
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={on}
                onClick={() => setSelectedId(item.id)}
                className={cn(
                  "flex min-h-10 items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors",
                  on
                    ? "border-primary bg-primary-container font-semibold text-primary-container-foreground"
                    : "border-outline-variant font-medium text-muted-foreground hover:bg-surface-3"
                )}
              >
                <Avatar name={item.full_name} size="sm" />
                {item.full_name} · {itemClass}
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
            href="/dashboard/orang-tua/rapor"
            className="flex min-h-10 shrink-0 items-center rounded-full bg-destructive px-4 text-xs font-semibold text-destructive-foreground hover:opacity-90"
          >
            Lihat
          </Link>
        </div>
      )}

      <section
        aria-label="Ringkasan anak"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {childData.status === "loading" ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : childData.status === "error" ? (
          <div className="sm:col-span-3">
            <WidgetError
              title="Gagal memuat ringkasan anak"
              onRetry={() => setChildKey((k) => k + 1)}
            />
          </div>
        ) : (
          <>
            <MetricCard
              label="Rata-rata"
              value={
                childData.average !== null
                  ? childData.average.toFixed(1).replace(".", ",")
                  : "—"
              }
              icon={TrendingUp}
              hint={`Semester ini · ${child.full_name}`}
            />
            <MetricCard
              label="Kehadiran"
              value={`${childData.attendanceRate}%`}
              icon={CalendarCheck}
              hint="Dari pencatatan absensi"
            />
            <MetricCard
              label="Tagihan Aktif"
              value={
                overdue
                  ? formatRupiah(overdue.amount)
                  : childData.bills.length > 0
                    ? `${childData.bills.length - paidCount} tagihan`
                    : "—"
              }
              icon={Wallet}
              hint={
                overdue
                  ? "Ada tunggakan"
                  : childData.bills.length > 0
                    ? "Belum lunas"
                    : "Tidak ada tagihan"
              }
            />
          </>
        )}
      </section>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="items-center border-b border-outline-variant pb-3">
            <CardTitle>Perkembangan Nilai · {child.full_name}</CardTitle>
            <Link
              href="/dashboard/orang-tua/rapor"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-surface-container-high"
            >
              Rapor lengkap
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </CardHeader>
          <CardBody>
            {childData.status === "loading" ? (
              <SkeletonList rows={4} />
            ) : childData.grades.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="Belum ada nilai tercatat"
                description={`Nilai ${child.full_name} akan tampil setelah guru menerbitkannya.`}
              />
            ) : (
              <>
                <GradeBars
                  items={childData.grades}
                  ariaLabel={`Nilai mata pelajaran ${child.full_name}`}
                />
                <AttendanceBreakdownList attendance={childData.attendance} />
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
          {childData.status === "loading" ? (
            <CardBody>
              <SkeletonList rows={3} />
            </CardBody>
          ) : childData.bills.length === 0 ? (
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
                {childData.bills.map((bill) => (
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
                      {bill.status === "paid"
                        ? "lunas"
                        : bill.status === "overdue"
                          ? "menunggak"
                          : "belum lunas"}
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
                      display: `${paidCount}/${childData.bills.length}`,
                    },
                  ]}
                  ariaLabel="Rasio tagihan lunas"
                />
                <Link
                  href="/dashboard/orang-tua/rapor"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Lihat rapor
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
              icon={Megaphone}
              title="Belum ada pengumuman"
              description="Pengumuman dari sekolah akan tampil di sini."
            />
          </CardBody>
        ) : (
          <ul className="divide-y divide-outline-variant">
            {announcements.items.map((item) => (
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

export default function OrangTuaDashboardPage() {
  return (
    <DashboardShell role="parent">
      {(me) => <OrangTuaContent me={me} />}
    </DashboardShell>
  );
}
