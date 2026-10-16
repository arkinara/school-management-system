"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ClipboardList,
  Megaphone,
  MessageSquareWarning,
  Receipt,
  RotateCcw,
  Send,
  UserCheck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusChip } from "@/components/ui/StatusChip";
import { SkeletonCard, SkeletonList, SkeletonTable } from "@/components/ui/Skeleton";
import { Toast, ToastViewport } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import {
  fetchAnnouncements,
  fetchClasses,
  fetchDashboardCounts,
  fetchOverdueBills,
  fetchStudents,
  getBills,
  remindBill,
  unremindBill,
  type AnnouncementRecord,
  type ClassRecord,
  type SppBill,
  type StudentRecord,
} from "@/lib/endpoints";
import { ApiError } from "@/lib/api";
import type { UserMe } from "@/lib/auth";
import { currentPeriod, endOfMonth } from "@/lib/dates";

type LoadStatus = "loading" | "ready" | "error";

type TaskGroup = "Tagihan" | "Pembayaran" | "Master data";

const GROUP_ORDER: TaskGroup[] = ["Tagihan", "Pembayaran", "Master data"];

interface TaskItem {
  id: string;
  title: string;
  detail: string;
  /** ISO due date used for ordering; null sorts last. */
  due: string | null;
  group: TaskGroup;
  href: string;
  icon: LucideIcon;
}

interface OverdueRow {
  id: number;
  studentId: number;
  nis: string;
  name: string;
  className: string;
  amount: number;
  dueDays: number;
  status: "overdue" | "pending";
}

interface UrgentAnnouncement {
  id: number;
  title: string;
  audience: string;
}

type SortKey = "nis" | "name" | "className" | "amount" | "status" | "dueDays";

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatRupiahCompact(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

function formatTaskDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
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

function daysBetween(from: string, to: Date): number {
  const start = new Date(from).getTime();
  const end = new Date(to.toISOString().slice(0, 10)).getTime();
  return Math.floor((end - start) / 86_400_000);
}

function sortTasks(tasks: TaskItem[]): TaskItem[] {
  return [...tasks].sort((a, b) => {
    if (a.due && b.due) return a.due.localeCompare(b.due);
    if (a.due) return -1;
    if (b.due) return 1;
    return a.title.localeCompare(b.title);
  });
}

/** One operations-queue group; empty groups still render a message (#65). */
function TaskGroupSection({ group, tasks }: { group: TaskGroup; tasks: TaskItem[] }) {
  return (
    <div>
      <div className="flex items-center gap-2 bg-surface-container-low px-5 py-2">
        <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          {group}
        </span>
        <span className="rounded-full bg-accent-container px-1.5 py-0.5 font-mono text-2xs font-semibold tabular-nums text-accent-container-foreground">
          {tasks.length}
        </span>
      </div>
      {tasks.length === 0 ? (
        <p className="px-5 py-3 text-sm text-muted-foreground">Tidak ada tugas</p>
      ) : (
        <ul className="divide-y divide-outline-variant">
          {tasks.map((task) => {
            const Icon = task.icon;
            return (
              <li key={task.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-container text-primary-container-foreground">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
                  <p className="truncate text-2xs text-muted-foreground">{task.detail}</p>
                </div>
                {task.due && (
                  <span className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground">
                    {formatTaskDate(task.due)}
                  </span>
                )}
                <Link
                  href={task.href}
                  className="flex min-h-10 shrink-0 items-center rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90"
                >
                  Kerjakan
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TuContent({ me }: { me: UserMe }) {
  const period = React.useMemo(() => currentPeriod(), []);

  const [overview, setOverview] = React.useState<{
    status: LoadStatus;
    students: number | null;
    teachers: number | null;
    unpaidCount: number;
    overdueCount: number;
  }>({
    status: "loading",
    students: null,
    teachers: null,
    unpaidCount: 0,
    overdueCount: 0,
  });
  const [overviewKey, setOverviewKey] = React.useState(0);

  const [bills, setBills] = React.useState<{
    status: LoadStatus;
    rows: OverdueRow[];
  }>({ status: "loading", rows: [] });
  const [billsKey, setBillsKey] = React.useState(0);

  const [urgentStatus, setUrgentStatus] = React.useState<LoadStatus>("loading");
  const [urgent, setUrgent] = React.useState<UrgentAnnouncement[]>([]);
  const [urgentKey, setUrgentKey] = React.useState(0);

  const [planning, setPlanning] = React.useState<{
    status: LoadStatus;
    classes: ClassRecord[];
    billsAll: SppBill[];
  }>({ status: "loading", classes: [], billsAll: [] });
  const [planningKey, setPlanningKey] = React.useState(0);

  const [reminding, setReminding] = React.useState<Set<number>>(new Set());
  const [reminded, setReminded] = React.useState<Set<number>>(new Set());
  const [toast, setToast] = React.useState<{
    message: string;
    tone: "info" | "success" | "error";
  } | null>(null);

  const [sort, setSort] = React.useState<{
    key: SortKey;
    direction: "asc" | "desc";
  }>({ key: "dueDays", direction: "desc" });
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

  const scope = React.useMemo(
    () => (me.school_id === null ? {} : { school_id: me.school_id }),
    [me.school_id]
  );

  React.useEffect(() => {
    let active = true;
    setOverview((current) => ({ ...current, status: "loading" }));
    Promise.all([
      fetchDashboardCounts(scope),
      fetchOverdueBills({ size: 1 }),
      getBills({ status: "unpaid", size: 1 }),
    ])
      .then(([counts, overduePage, unpaidPage]) => {
        if (!active) return;
        setOverview({
          status: "ready",
          students: counts.students,
          teachers: counts.teachers,
          unpaidCount: unpaidPage.total,
          overdueCount: overduePage.total,
        });
      })
      .catch(() => {
        // #65: guard on `active` (was inverted as `!active`, which left the
        // KPIs stuck on a skeleton forever whenever the request actually failed).
        if (active) setOverview((current) => ({ ...current, status: "error" }));
      });
    return () => {
      active = false;
    };
  }, [scope, overviewKey]);

  React.useEffect(() => {
    let active = true;
    setBills({ status: "loading", rows: [] });
    Promise.all([
      fetchOverdueBills({ size: 50 }),
      fetchStudents({ ...scope, size: 100 }),
      fetchClasses({ ...scope, size: 100 }),
    ])
      .then(([billPage, studentPage, classPage]) => {
        if (!active) return;
        const studentMap = new Map<number, StudentRecord>(studentPage.items.map((s) => [s.id, s]));
        const classMap = new Map<number, ClassRecord>(classPage.items.map((k) => [k.id, k]));
        const now = new Date();
        const rows: OverdueRow[] = (billPage.items as SppBill[]).map((bill) => {
          const student = studentMap.get(bill.student_id);
          const days = daysBetween(bill.due_date, now);
          return {
            id: bill.id,
            studentId: bill.student_id,
            nis: student?.nis ?? String(bill.student_id),
            name: student?.full_name ?? `Siswa #${bill.student_id}`,
            className: bill.class_id
              ? (classMap.get(bill.class_id)?.name ?? `Kelas ${bill.class_id}`)
              : "—",
            amount: bill.balance > 0 ? bill.balance : bill.amount,
            dueDays: days,
            status: days > 0 ? "overdue" : "pending",
          };
        });
        setBills({ status: "ready", rows });
      })
      .catch(() => {
        if (active) setBills({ status: "error", rows: [] });
      });
    return () => {
      active = false;
    };
  }, [scope, billsKey]);

  React.useEffect(() => {
    let active = true;
    setUrgentStatus("loading");
    fetchAnnouncements({ ...scope, status: "draft", size: 5 })
      .then((page) => {
        if (!active) return;
        setUrgent(
          page.items.map((item: AnnouncementRecord) => ({
            id: item.id,
            title: item.title,
            audience: item.audience,
          }))
        );
        setUrgentStatus("ready");
      })
      .catch(() => {
        if (active) {
          setUrgent([]);
          setUrgentStatus("error");
        }
      });
    return () => {
      active = false;
    };
  }, [scope, urgentKey]);

  // Real "bills pending generation": classes without bills for the current
  // period, plus the raw bill rows backing the KPI trend series (#65).
  React.useEffect(() => {
    let active = true;
    setPlanning((current) => ({ ...current, status: "loading" }));
    Promise.all([fetchClasses({ ...scope, size: 100 }), getBills({ size: 100 })])
      .then(([classPage, billPage]) => {
        if (!active) return;
        setPlanning({ status: "ready", classes: classPage.items, billsAll: billPage.items });
      })
      .catch(() => {
        if (active) setPlanning({ status: "error", classes: [], billsAll: [] });
      });
    return () => {
      active = false;
    };
  }, [scope, planningKey]);

  const pendingClasses = React.useMemo(() => {
    const withBills = new Set(
      planning.billsAll
        .filter((bill) => bill.period === period && bill.class_id !== null)
        .map((bill) => bill.class_id as number)
    );
    return planning.classes.filter((klass) => !withBills.has(klass.id));
  }, [planning, period]);

  const series = React.useMemo(() => {
    const byPeriod = new Map<string, { collected: number; unpaid: number }>();
    for (const bill of planning.billsAll) {
      const entry = byPeriod.get(bill.period) ?? { collected: 0, unpaid: 0 };
      entry.collected += bill.paid_amount ?? 0;
      if (bill.balance > 0) entry.unpaid += 1;
      byPeriod.set(bill.period, entry);
    }
    const periods = [...byPeriod.keys()].sort();
    return {
      collected: periods.map((p) => Math.round(byPeriod.get(p)?.collected ?? 0)),
      unpaid: periods.map((p) => byPeriod.get(p)?.unpaid ?? 0),
    };
  }, [planning.billsAll]);

  const totalCollected = React.useMemo(
    () => series.collected.reduce((sum, value) => sum + value, 0),
    [series.collected]
  );

  const tasks: TaskItem[] = React.useMemo(() => {
    const list: TaskItem[] = [];
    const generated = planning.classes.length - pendingClasses.length;
    for (const klass of pendingClasses) {
      list.push({
        id: `generate-${klass.id}`,
        title: `Generate SPP ${klass.name}`,
        detail: `${generated} dari ${planning.classes.length} kelas sudah dibuat · periode ${period}`,
        due: endOfMonth(period) || null,
        group: "Tagihan",
        href: `/dashboard/tu/spp/generate?class_id=${klass.id}&period=${period}`,
        icon: Receipt,
      });
    }
    if (overview.overdueCount > 0) {
      list.push({
        id: "overdue-followup",
        title: "Tindak lanjuti tunggakan SPP",
        detail: `${overview.overdueCount} tagihan menunggu pembayaran`,
        due: null,
        group: "Pembayaran",
        href: "/dashboard/tu/spp/payments?status=overdue",
        icon: MessageSquareWarning,
      });
    }
    for (const item of urgent) {
      list.push({
        id: `review-${item.id}`,
        title: `Tinjau pengumuman: ${item.title}`,
        detail: item.audience,
        due: null,
        group: "Master data",
        href: `/dashboard/announcements?review=${item.id}`,
        icon: Megaphone,
      });
    }
    return list;
  }, [pendingClasses, planning.classes.length, overview.overdueCount, urgent, period]);

  const grouped = React.useMemo(
    () =>
      GROUP_ORDER.map((group) => ({
        group,
        tasks: sortTasks(tasks.filter((t) => t.group === group)),
      })),
    [tasks]
  );

  const rows = React.useMemo(() => {
    const copy = [...bills.rows];
    copy.sort((a, b) => {
      const dir = sort.direction === "asc" ? 1 : -1;
      if (sort.key === "amount" || sort.key === "dueDays") {
        return (a[sort.key] - b[sort.key]) * dir;
      }
      if (sort.key === "status") {
        const av = a.status === "overdue" ? 1 : 0;
        const bv = b.status === "overdue" ? 1 : 0;
        return (av - bv) * dir;
      }
      return a[sort.key].localeCompare(b[sort.key]) * dir;
    });
    return copy;
  }, [bills.rows, sort]);

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  }

  // Persists through the backend (#51 notifications + `bill.last_reminded_at`):
  // POST /api/spp/bills/{id}/remind, undone via DELETE. No local-only state —
  // the row only flips after the server confirms.
  async function onMarkReminded(row: OverdueRow) {
    if (reminding.has(row.id)) return;
    setReminding((current) => new Set(current).add(row.id));
    try {
      await remindBill(row.id);
      setReminded((current) => new Set(current).add(row.id));
      setToast({ message: `Pengingat terkirim untuk ${row.name}`, tone: "success" });
      setBillsKey((k) => k + 1);
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : "Gagal mengirim pengingat.";
      setToast({ message: detail, tone: "error" });
    } finally {
      setReminding((current) => {
        const next = new Set(current);
        next.delete(row.id);
        return next;
      });
    }
  }

  async function onUndoRemind(row: OverdueRow) {
    if (reminding.has(row.id)) return;
    setReminding((current) => new Set(current).add(row.id));
    try {
      await unremindBill(row.id);
      setReminded((current) => {
        const next = new Set(current);
        next.delete(row.id);
        return next;
      });
      setToast({ message: "Pengingat dibatalkan", tone: "info" });
      setBillsKey((k) => k + 1);
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : "Gagal membatalkan pengingat.";
      setToast({ message: detail, tone: "error" });
    } finally {
      setReminding((current) => {
        const next = new Set(current);
        next.delete(row.id);
        return next;
      });
    }
  }

  const totalOverdue = rows.filter((row) => row.status === "overdue").length;
  const totalOverdueAmount = rows.reduce((sum, row) => sum + row.amount, 0);
  const kpiHint = overview.status === "error" ? "Gagal memuat data" : undefined;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Operasional Hari Ini
          </h1>
          <p className="text-xs text-muted-foreground">Tata Usaha{today ? ` · ${today}` : ""}</p>
        </div>
        <Link
          href="/dashboard/tu/spp/generate"
          className="flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90"
        >
          <Receipt className="h-4 w-4" aria-hidden />
          Generate Tagihan SPP
        </Link>
      </div>

      <section
        aria-label="Indikator operasional"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {overview.status === "loading" ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : overview.status === "error" ? (
          <div className="col-span-full">
            <WidgetError
              title="Gagal memuat indikator"
              onRetry={() => setOverviewKey((k) => k + 1)}
            />
          </div>
        ) : (
          <>
            <MetricCard
              label="Tagihan Aktif"
              value={overview.unpaidCount}
              icon={Wallet}
              hint={`${overview.overdueCount} menunggak hari ini`}
              sparkline={series.unpaid}
              sparklineLabel="Tren tagihan aktif per periode"
            />
            <MetricCard
              label="SPP Tertagih"
              value={formatRupiahCompact(totalCollected)}
              icon={Receipt}
              hint="Total pembayaran diterima"
              sparkline={series.collected}
              sparklineLabel="Tren SPP tertagih per periode"
            />
            <MetricCard
              label="Siswa Aktif"
              value={overview.students ?? 0}
              icon={Users}
              hint={kpiHint ?? "Terdaftar di sekolah Anda"}
            />
            <MetricCard
              label="Total Guru"
              value={overview.teachers ?? 0}
              icon={UserCheck}
              hint={kpiHint ?? "Guru aktif"}
            />
          </>
        )}
      </section>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="items-center border-b border-outline-variant pb-3">
            <CardTitle>Antrean Hari Ini</CardTitle>
            <span className="font-mono text-2xs tabular-nums text-muted-foreground">
              {tasks.length} tugas
            </span>
          </CardHeader>
          {overview.status === "loading" || planning.status === "loading" ? (
            <div className="p-4">
              <SkeletonList rows={3} />
            </div>
          ) : tasks.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={ClipboardList}
                title="Semua sudah beres"
                description="Tidak ada tugas operasional yang menunggu hari ini."
              />
            </div>
          ) : (
            <div className="divide-y divide-outline-variant">
              {grouped.map(({ group, tasks: groupTasks }) => (
                <TaskGroupSection key={group} group={group} tasks={groupTasks} />
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader className="items-center border-b border-outline-variant pb-3">
            <CardTitle>Pengumuman Menunggu</CardTitle>
            <span className="rounded-full bg-accent-container px-1.5 py-0.5 font-mono text-2xs font-semibold tabular-nums text-accent-container-foreground">
              {urgent.length}
            </span>
          </CardHeader>
          {urgentStatus === "loading" ? (
            <div className="p-4">
              <SkeletonList rows={3} />
            </div>
          ) : urgentStatus === "error" ? (
            <div className="p-4">
              <WidgetError
                title="Gagal memuat pengumuman"
                onRetry={() => setUrgentKey((k) => k + 1)}
              />
            </div>
          ) : urgent.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={Megaphone}
                title="Tidak ada pengumuman menunggu"
                description="Pengajuan pengumuman baru akan muncul di sini untuk disetujui."
              />
            </div>
          ) : (
            <ul className="divide-y divide-outline-variant">
              {urgent.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                    <p className="truncate text-2xs text-muted-foreground">{item.audience}</p>
                  </div>
                  <Link
                    href={`/dashboard/announcements?review=${item.id}`}
                    className="flex min-h-10 shrink-0 items-center rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90"
                  >
                    Tinjau
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-wrap items-center border-b border-outline-variant pb-3">
          <div className="flex items-center gap-2">
            <CardTitle>Siswa Menunggak SPP</CardTitle>
            <StatusChip tone={totalOverdue > 0 ? "danger" : "success"}>
              {totalOverdue} menunggak
            </StatusChip>
            {totalOverdueAmount > 0 && (
              <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                {formatRupiah(totalOverdueAmount)}
              </span>
            )}
          </div>
        </CardHeader>

        {bills.status === "loading" || overview.status === "loading" ? (
          <div className="p-4">
            <SkeletonTable rows={6} cols={6} />
          </div>
        ) : bills.status === "error" ? (
          <div className="p-4">
            <WidgetError title="Gagal memuat tunggakan" onRetry={() => setBillsKey((k) => k + 1)} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Wallet}
              title="Tidak ada tunggakan"
              description="Semua tagihan SPP sudah dibayar. Kerja bagus!"
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-surface-container">
                <tr>
                  {(
                    [
                      ["nis", "NIS", "left"],
                      ["name", "Nama", "left"],
                      ["className", "Kelas", "left"],
                      ["amount", "Sisa Tagihan", "right"],
                      ["status", "Status", "left"],
                    ] as const
                  ).map(([key, header, align]) => (
                    <th
                      key={key}
                      scope="col"
                      aria-sort={
                        sort.key === key
                          ? sort.direction === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                      className={cn(
                        "border-b border-outline-variant px-4 py-2.5 font-semibold text-muted-foreground",
                        align === "right" ? "text-right" : "text-left"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(key)}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {header}
                        {sort.key === key ? (
                          sort.direction === "asc" ? (
                            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" aria-hidden />
                        )}
                      </button>
                    </th>
                  ))}
                  <th
                    scope="col"
                    className="border-b border-outline-variant px-4 py-2.5 text-right font-semibold text-muted-foreground"
                  >
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-container-low">
                    <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-muted-foreground">
                      {row.nis}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-foreground">
                      <Link
                        href={`/dashboard/tu/spp/payments?student_id=${row.studentId}`}
                        className="hover:underline"
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.className}</td>
                    <td
                      data-value={row.amount}
                      className="px-4 py-2.5 text-right font-mono tabular-nums text-foreground"
                    >
                      {formatRupiah(row.amount)}
                    </td>
                    <td data-value={row.status === "overdue" ? 1 : 0} className="px-4 py-2.5">
                      <StatusChip tone={row.status === "overdue" ? "danger" : "warning"}>
                        {row.status === "overdue"
                          ? `${row.dueDays} hari lewat`
                          : "belum jatuh tempo"}
                      </StatusChip>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {reminded.has(row.id) ? (
                        <button
                          type="button"
                          onClick={() => onUndoRemind(row)}
                          disabled={reminding.has(row.id)}
                          className="min-h-10 rounded-full border border-outline px-3 text-xs font-medium text-primary hover:bg-surface-container-high disabled:pointer-events-none disabled:opacity-40"
                        >
                          Batalkan
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onMarkReminded(row)}
                          disabled={reminding.has(row.id)}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
                        >
                          <Send className="h-3.5 w-3.5" aria-hidden />
                          {reminding.has(row.id) ? "Mengirim…" : "Ingatkan"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="border-t border-outline-variant px-5 py-2 text-2xs text-muted-foreground">
          Menampilkan <span className="font-mono tabular-nums">{rows.length}</span> tagihan
          menunggak. Klik judul kolom untuk mengurutkan.
        </p>
      </Card>

      <ToastViewport>
        {toast && (
          <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />
        )}
      </ToastViewport>
    </div>
  );
}

export default function TuDashboardPage() {
  return <DashboardShell role="admin">{(me) => <TuContent me={me} />}</DashboardShell>;
}
