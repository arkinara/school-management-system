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
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusChip } from "@/components/ui/StatusChip";
import { SkeletonCard, SkeletonList, SkeletonTable } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import {
  fetchAnnouncements,
  fetchClasses,
  fetchDashboardCounts,
  fetchOverdueBills,
  fetchStudents,
  getBills,
  type AnnouncementRecord,
  type ClassRecord,
  type SppBill,
  type StudentRecord,
} from "@/lib/endpoints";
import type { UserMe } from "@/lib/auth";

type LoadStatus = "loading" | "ready" | "error";

type TaskGroup = "Tagihan" | "Pembayaran" | "Master data";

interface QueueTask {
  id: string;
  time: string;
  label: string;
  detail: string;
  group: TaskGroup;
  icon: typeof Receipt;
}

interface OverdueRow {
  id: number;
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

const GROUP_ORDER: TaskGroup[] = ["Tagihan", "Pembayaran", "Master data"];

type SortKey = "nis" | "name" | "className" | "amount" | "status" | "dueDays";

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
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

function TuContent({ me }: { me: UserMe }) {
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

  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [reminded, setReminded] = React.useState(0);
  const [sort, setSort] = React.useState<{
    key: SortKey;
    direction: "asc" | "desc";
  }>({ key: "dueDays", direction: "desc" });
  const [today, setToday] = React.useState("");
  const selectAllRef = React.useRef<HTMLInputElement>(null);

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
        if (!active) setOverview((current) => ({ ...current, status: "error" }));
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

  React.useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selected.size > 0 && selected.size < rows.length;
    }
  }, [selected, rows.length]);

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  }

  function toggleRow(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setReminded(0);
  }

  function toggleAll() {
    setSelected((current) =>
      current.size === rows.length ? new Set() : new Set(rows.map((row) => row.id))
    );
    setReminded(0);
  }

  function sendReminders() {
    const n = selected.size;
    setSelected(new Set());
    setReminded(n);
  }

  function resolveUrgent(id: number) {
    setUrgent((current) => current.filter((item) => item.id !== id));
  }

  const tasks: QueueTask[] = React.useMemo(() => {
    const list: QueueTask[] = [];
    if (overview.overdueCount > 0) {
      list.push({
        id: "t1",
        time: "08.00",
        label: "Tindak lanjuti tunggakan SPP",
        detail: `${overview.overdueCount} tagihan menunggu pembayaran`,
        group: "Pembayaran",
        icon: MessageSquareWarning,
      });
    }
    if (urgent.length > 0) {
      list.push({
        id: "t2",
        time: "09.30",
        label: "Tinjau pengumuman",
        detail: `${urgent.length} pengumuman menunggu persetujuan`,
        group: "Master data",
        icon: Megaphone,
      });
    }
    list.push({
      id: "t3",
      time: "08.00",
      label: "Generate SPP periode berjalan",
      detail:
        overview.students !== null
          ? `${overview.students} siswa aktif`
          : "Buat tagihan bulanan per kelas",
      group: "Tagihan",
      icon: Receipt,
    });
    return list;
  }, [overview.overdueCount, overview.students, urgent.length]);

  const totalOverdue = rows.filter((row) => row.status === "overdue").length;
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
        ) : (
          <>
            <MetricCard
              label="Tagihan Aktif"
              value={overview.unpaidCount}
              icon={Wallet}
              hint={`${overview.overdueCount} menunggak hari ini`}
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
            <MetricCard
              label="Pengumuman Menunggu"
              value={urgent.length}
              icon={Megaphone}
              hint={urgentStatus === "error" ? "Gagal memuat data" : "Perlu persetujuan"}
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
          {overview.status === "loading" ? (
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
              {GROUP_ORDER.map((group) => {
                const groupTasks = tasks.filter((task) => task.group === group);
                if (groupTasks.length === 0) return null;
                return (
                  <div key={group}>
                    <div className="flex items-center gap-2 bg-surface-container-low px-5 py-2">
                      <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {group}
                      </span>
                      <span className="rounded-full bg-accent-container px-1.5 py-0.5 font-mono text-2xs font-semibold tabular-nums text-accent-container-foreground">
                        {groupTasks.length}
                      </span>
                    </div>
                    <ul className="divide-y divide-outline-variant">
                      {groupTasks.map((task) => {
                        const Icon = task.icon;
                        return (
                          <li key={task.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-container text-primary-container-foreground">
                              <Icon className="h-4 w-4" aria-hidden />
                            </span>
                            <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                              {task.time}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-foreground">
                                {task.label}
                              </p>
                              <p className="truncate text-2xs text-muted-foreground">
                                {task.detail}
                              </p>
                            </div>
                            <Link
                              href="/dashboard/tu/spp/payments"
                              className="flex min-h-10 shrink-0 items-center rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90"
                            >
                              Kerjakan
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
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
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => resolveUrgent(item.id)}
                      className="min-h-10 rounded-full border border-outline px-3 text-xs font-medium text-primary hover:bg-surface-container-high"
                    >
                      Tolak
                    </button>
                    <button
                      type="button"
                      onClick={() => resolveUrgent(item.id)}
                      className="min-h-10 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90"
                    >
                      Setujui
                    </button>
                  </div>
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
          </div>
          <div className="flex items-center gap-2">
            {reminded > 0 && (
              <span className="font-mono text-2xs tabular-nums text-success">
                Pengingat terkirim ke {reminded} orang tua
              </span>
            )}
            <button
              type="button"
              onClick={sendReminders}
              disabled={selected.size === 0}
              className="flex min-h-10 items-center gap-1.5 rounded-full border border-outline px-3 text-xs font-medium text-primary hover:bg-surface-container-high disabled:pointer-events-none disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" aria-hidden />
              Kirim Pengingat ({selected.size})
            </button>
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
                  <th scope="col" className="w-12 px-4 py-2.5 text-left">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={selected.size > 0 && selected.size === rows.length}
                      onChange={toggleAll}
                      aria-label="Pilih semua baris"
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                    />
                  </th>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-container-low">
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggleRow(row.id)}
                        aria-label={`Pilih ${row.name}`}
                        className="h-4 w-4 accent-[hsl(var(--primary))]"
                      />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-muted-foreground">
                      {row.nis}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-foreground">{row.name}</td>
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
    </div>
  );
}

export default function TuDashboardPage() {
  return <DashboardShell role="admin">{(me) => <TuContent me={me} />}</DashboardShell>;
}
