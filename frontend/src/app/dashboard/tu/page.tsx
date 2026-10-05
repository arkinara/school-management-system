"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ClipboardList,
  Megaphone,
  MessageSquareWarning,
  Receipt,
  Send,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusChip } from "@/components/ui/StatusChip";
import { SkeletonCard, SkeletonTable } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { fetchStudents, fetchUsers } from "@/lib/endpoints";
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
  id: string;
  nis: string;
  name: string;
  className: string;
  amount: number;
  dueDays: number;
  status: "overdue" | "pending";
}

interface UrgentAnnouncement {
  id: string;
  title: string;
  audience: string;
}

const TASKS: QueueTask[] = [
  {
    id: "t1",
    time: "08.00",
    label: "Generate SPP bulan ini",
    detail: "18 rombel · 648 siswa aktif",
    group: "Tagihan",
    icon: Receipt,
  },
  {
    id: "t2",
    time: "09.30",
    label: "Cek absensi pagi",
    detail: "Tandai kelas yang belum mengisi",
    group: "Master data",
    icon: CalendarCheck,
  },
  {
    id: "t3",
    time: "11.00",
    label: "Approve pendaftaran siswa",
    detail: "6 pendaftar menunggu verifikasi",
    group: "Master data",
    icon: UserCheck,
  },
  {
    id: "t4",
    time: "14.00",
    label: "Reminder orang tua menunggak",
    detail: "86 siswa dengan tunggakan aktif",
    group: "Pembayaran",
    icon: MessageSquareWarning,
  },
];

const GROUP_ORDER: TaskGroup[] = ["Tagihan", "Pembayaran", "Master data"];

const OVERDUE_ROWS: OverdueRow[] = [
  { id: "s1", nis: "2021001", name: "Rizky Maulana", className: "XI-IPA-2", amount: 350_000, dueDays: 20, status: "overdue" },
  { id: "s2", nis: "2021014", name: "Salsabila Putri", className: "X-IPS-1", amount: 350_000, dueDays: 20, status: "overdue" },
  { id: "s3", nis: "2020012", name: "Fajar Nugraha", className: "XII-IPA-1", amount: 700_000, dueDays: 51, status: "overdue" },
  { id: "s4", nis: "2021033", name: "Nabila Rahma", className: "X-IPA-3", amount: 350_000, dueDays: 12, status: "pending" },
  { id: "s5", nis: "2021050", name: "Dimas Aryo", className: "XI-IPS-1", amount: 350_000, dueDays: 8, status: "pending" },
  { id: "s6", nis: "2020061", name: "Ayu Lestari", className: "XII-IPS-2", amount: 350_000, dueDays: 0, status: "pending" },
  { id: "s7", nis: "2021078", name: "Bagas Prakoso", className: "X-IPA-1", amount: 350_000, dueDays: 0, status: "pending" },
  { id: "s8", nis: "2020090", name: "Citra Amelia", className: "XII-IPA-2", amount: 700_000, dueDays: 51, status: "overdue" },
  { id: "s9", nis: "2021102", name: "Eka Saputra", className: "X-IPS-2", amount: 350_000, dueDays: 4, status: "pending" },
  { id: "s10", nis: "2020110", name: "Gita Permata", className: "XII-IPS-1", amount: 350_000, dueDays: 0, status: "pending" },
];

const URGENT_ANNOUNCEMENTS: UrgentAnnouncement[] = [
  { id: "u1", title: "Perubahan jam pulang 7 Oktober", audience: "Semua kelas" },
  { id: "u2", title: "Pendaftaran ekskul semester genap", audience: "Kelas X & XI" },
];

type SortKey = "nis" | "name" | "className" | "amount" | "status" | "dueDays";

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function TuContent({ me }: { me: UserMe }) {
  const [status, setStatus] = React.useState<LoadStatus>("loading");
  const [counts, setCounts] = React.useState<{
    students: number | null;
    teachers: number | null;
  }>({ students: null, teachers: null });
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [reminded, setReminded] = React.useState(0);
  const [sort, setSort] = React.useState<{ key: SortKey; direction: "asc" | "desc" }>(
    { key: "dueDays", direction: "desc" }
  );
  const [urgent, setUrgent] = React.useState(URGENT_ANNOUNCEMENTS);
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

  React.useEffect(() => {
    let active = true;
    const scope = me.school_id === null ? {} : { school_id: me.school_id };
    setStatus("loading");
    Promise.all([
      fetchStudents({ ...scope, size: 1 }),
      fetchUsers({ ...scope, role: "teacher", size: 1 }),
    ])
      .then(([students, teachers]) => {
        if (!active) return;
        setCounts({ students: students.total, teachers: teachers.total });
        setStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setCounts({ students: null, teachers: null });
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [me.school_id]);

  const rows = React.useMemo(() => {
    const copy = [...OVERDUE_ROWS];
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
  }, [sort]);

  React.useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        selected.size > 0 && selected.size < rows.length;
    }
  }, [selected, rows.length]);

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  }

  function toggleRow(id: string) {
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

  function resolveUrgent(id: string) {
    setUrgent((current) => current.filter((item) => item.id !== id));
  }

  const kpiHint =
    status === "error" ? "Perkiraan — gagal memuat data langsung" : undefined;
  const totalOverdue = OVERDUE_ROWS.filter((row) => row.status === "overdue").length;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Operasional Hari Ini
          </h1>
          <p className="text-xs text-muted-foreground">
            Tata Usaha{today ? ` · ${today}` : ""}
          </p>
        </div>
        <Link
          href="/dashboard/tu/spp"
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
              label="Tagihan Aktif"
              value={86}
              icon={Wallet}
              hint={`${totalOverdue} menunggak hari ini`}
            />
            <MetricCard
              label="Siswa Aktif"
              value={counts.students ?? 648}
              icon={Users}
              hint={kpiHint ?? "Terdaftar di sekolah Anda"}
            />
            <MetricCard
              label="Total Guru"
              value={counts.teachers ?? 34}
              icon={UserCheck}
              hint={kpiHint ?? "Guru aktif"}
            />
            <MetricCard
              label="Pengumuman Aktif"
              value={urgent.length + 5}
              icon={Megaphone}
              hint={`${urgent.length} menunggu persetujuan`}
            />
          </>
        )}
      </section>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="items-center border-b border-outline-variant pb-3">
            <CardTitle>Antrean Hari Ini</CardTitle>
            <span className="font-mono text-2xs tabular-nums text-muted-foreground">
              {TASKS.length} tugas
            </span>
          </CardHeader>
          {TASKS.length === 0 ? (
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
                const groupTasks = TASKS.filter((task) => task.group === group);
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
                          <li
                            key={task.id}
                            className="flex flex-wrap items-center gap-3 px-5 py-3"
                          >
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
                              href={`/dashboard/tu/tasks/${task.id}`}
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
            <CardTitle>Pengumuman Mendesak</CardTitle>
            <span className="rounded-full bg-accent-container px-1.5 py-0.5 font-mono text-2xs font-semibold tabular-nums text-accent-container-foreground">
              {urgent.length}
            </span>
          </CardHeader>
          {urgent.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={Megaphone}
                title="Tidak ada pengumuman mendesak"
                description="Pengajuan pengumuman baru akan muncul di sini untuk disetujui."
              />
            </div>
          ) : (
            <ul className="divide-y divide-outline-variant">
              {urgent.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {item.title}
                    </p>
                    <p className="truncate text-2xs text-muted-foreground">
                      {item.audience}
                    </p>
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

        {status === "loading" ? (
          <div className="p-4">
            <SkeletonTable rows={6} cols={6} />
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
                          <ChevronsUpDown
                            className="h-3.5 w-3.5 opacity-50"
                            aria-hidden
                          />
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
                    <td className="px-4 py-2.5 font-medium text-foreground">
                      {row.name}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {row.className}
                    </td>
                    <td
                      data-value={row.amount}
                      className="px-4 py-2.5 text-right font-mono tabular-nums text-foreground"
                    >
                      {formatRupiah(row.amount)}
                    </td>
                    <td
                      data-value={row.status === "overdue" ? 1 : 0}
                      className="px-4 py-2.5"
                    >
                      <StatusChip
                        tone={row.status === "overdue" ? "danger" : "warning"}
                      >
                        {row.status === "overdue"
                          ? `${row.dueDays} hari lewat`
                          : "sebagian"}
                      </StatusChip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="border-t border-outline-variant px-5 py-2 text-2xs text-muted-foreground">
          Menampilkan <span className="font-mono tabular-nums">{rows.length}</span>{" "}
          dari <span className="font-mono tabular-nums">86</span> tunggakan. Klik
          judul kolom untuk mengurutkan.
        </p>
      </Card>
    </div>
  );
}

export default function TuDashboardPage() {
  return (
    <DashboardShell role="admin">
      {(me) => <TuContent me={me} />}
    </DashboardShell>
  );
}
