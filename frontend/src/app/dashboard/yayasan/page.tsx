"use client";

import * as React from "react";
import {
  Activity,
  GraduationCap,
  RefreshCw,
  RotateCcw,
  Save,
  School,
  ShieldAlert,
  TrendingUp,
  Users,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { BarList, type BarListItem } from "@/components/dashboard/BarList";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusChip, type ChipTone } from "@/components/ui/StatusChip";
import { SkeletonCard, SkeletonTable } from "@/components/ui/Skeleton";
import { Table, type Column } from "@/components/ui/Table";
import {
  fetchSchools,
  fetchStudents,
  fetchTenants,
  fetchUsers,
  type TenantRecord,
} from "@/lib/endpoints";
import type { UserMe } from "@/lib/auth";

type LoadStatus = "loading" | "ready" | "error";

type SchoolStatus = "sehat" | "perhatian";

interface ComparisonRow {
  id: string;
  name: string;
  jenjang: string;
  students: number;
  attendance: number;
  spp: number;
  status: SchoolStatus;
}

type SortKey = "name" | "jenjang" | "students" | "attendance" | "spp" | "status";

const JENJANG_TONE: Record<string, ChipTone> = {
  TK: "primary",
  SD: "info",
  SMP: "warning",
  SMA: "success",
};

const JENJANG_BAR: Record<string, string> = {
  TK: "bg-primary",
  SD: "bg-info",
  SMP: "bg-warning",
  SMA: "bg-success",
};

const JENJANG_METRICS: Record<
  string,
  { students: number; attendance: number; spp: number }
> = {
  TK: { students: 186, attendance: 97, spp: 94 },
  SD: { students: 482, attendance: 94, spp: 82 },
  SMP: { students: 526, attendance: 95, spp: 88 },
  SMA: { students: 648, attendance: 92, spp: 79 },
  University: { students: 0, attendance: 0, spp: 0 },
};

const MOCK_ROWS: ComparisonRow[] = [
  { id: "tk", name: "TK Menteng Ceria", jenjang: "TK", students: 186, attendance: 97, spp: 94, status: "sehat" },
  { id: "sd", name: "SDN Menteng 01", jenjang: "SD", students: 482, attendance: 94, spp: 82, status: "perhatian" },
  { id: "smp", name: "SMP Nusantara", jenjang: "SMP", students: 526, attendance: 95, spp: 88, status: "sehat" },
  { id: "sma", name: "SMA Bhakti", jenjang: "SMA", students: 648, attendance: 92, spp: 79, status: "perhatian" },
];

const TENANT_USERS: { name: string; jenjang: string; value: number }[] = [
  { name: "SMA Bhakti", jenjang: "SMA", value: 712 },
  { name: "SMP Nusantara", jenjang: "SMP", value: 618 },
  { name: "SDN Menteng 01", jenjang: "SD", value: 531 },
  { name: "TK Menteng Ceria", jenjang: "TK", value: 187 },
];

const FALLBACK_KPI = { schools: 4, students: 1842, staff: 156 };

function jenjangTone(jenjang: string): ChipTone {
  return JENJANG_TONE[jenjang] ?? "neutral";
}

function YayasanContent({ me }: { me: UserMe }) {
  const [status, setStatus] = React.useState<LoadStatus>("loading");
  const [tenants, setTenants] = React.useState<TenantRecord[]>([]);
  const [kpi, setKpi] = React.useState<{
    schools: number | null;
    students: number | null;
    staff: number | null;
  }>({ schools: null, students: null, staff: null });
  const [reloadKey, setReloadKey] = React.useState(0);
  const [sort, setSort] = React.useState<{
    key: SortKey;
    direction: "asc" | "desc";
  }>({ key: "students", direction: "desc" });
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
    setStatus("loading");
    Promise.all([
      fetchTenants(),
      fetchSchools({ size: 1 }),
      fetchStudents({ size: 1 }),
      fetchUsers({ role: "teacher", size: 1 }),
      fetchUsers({ role: "admin", size: 1 }),
      fetchUsers({ role: "principal", size: 1 }),
    ])
      .then(([tenantList, schools, students, teachers, admins, principals]) => {
        if (!active) return;
        setTenants(tenantList);
        setKpi({
          schools: schools.total,
          students: students.total,
          staff: teachers.total + admins.total + principals.total,
        });
        setStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setTenants([]);
        setKpi({ schools: null, students: null, staff: null });
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [reloadKey, me.user.id]);

  const rows = React.useMemo<ComparisonRow[]>(() => {
    if (tenants.length === 0) return MOCK_ROWS;
    return tenants.map((tenant) => {
      const metric = JENJANG_METRICS[tenant.jenjang_type] ?? JENJANG_METRICS.TK;
      return {
        id: `tenant-${tenant.id}`,
        name: tenant.name,
        jenjang: tenant.jenjang_type,
        students: metric.students,
        attendance: metric.attendance,
        spp: metric.spp,
        status:
          metric.attendance >= 93 && metric.spp >= 85 ? "sehat" : "perhatian",
      };
    });
  }, [tenants]);

  const sortedRows = React.useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const dir = sort.direction === "asc" ? 1 : -1;
      if (sort.key === "students" || sort.key === "attendance" || sort.key === "spp") {
        return (a[sort.key] - b[sort.key]) * dir;
      }
      if (sort.key === "status") {
        const av = a.status === "sehat" ? 1 : 0;
        const bv = b.status === "sehat" ? 1 : 0;
        return (av - bv) * dir;
      }
      return a[sort.key].localeCompare(b[sort.key]) * dir;
    });
    return copy;
  }, [rows, sort]);

  const columns = React.useMemo<Column<ComparisonRow>[]>(
    () => [
      {
        key: "name",
        header: "Nama Sekolah",
        sortable: true,
        cell: (row) => (
          <span className="font-medium text-foreground">{row.name}</span>
        ),
      },
      {
        key: "jenjang",
        header: "Jenjang",
        sortable: true,
        cell: (row) => (
          <StatusChip tone={jenjangTone(row.jenjang)}>{row.jenjang}</StatusChip>
        ),
      },
      {
        key: "students",
        header: "Siswa",
        sortable: true,
        align: "right",
        cell: (row) => (
          <span className="font-mono tabular-nums">{row.students}</span>
        ),
      },
      {
        key: "attendance",
        header: "Kehadiran %",
        sortable: true,
        align: "right",
        cell: (row) => (
          <span className="font-mono tabular-nums">{row.attendance}%</span>
        ),
      },
      {
        key: "spp",
        header: "SPP %",
        sortable: true,
        align: "right",
        cell: (row) => (
          <span className="font-mono tabular-nums">{row.spp}%</span>
        ),
      },
      {
        key: "status",
        header: "Status",
        sortable: true,
        cell: (row) => (
          <StatusChip tone={row.status === "sehat" ? "success" : "warning"}>
            {row.status}
          </StatusChip>
        ),
      },
    ],
    []
  );

  function toggleSort(key: string) {
    const next = key as SortKey;
    setSort((current) =>
      current.key === next
        ? { key: next, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key: next, direction: "asc" }
    );
  }

  const barItems: BarListItem[] = TENANT_USERS.map((tenant) => ({
    label: tenant.name,
    value: tenant.value,
    toneClass: JENJANG_BAR[tenant.jenjang] ?? "bg-primary",
  }));

  const jenjangCount = new Set(rows.map((row) => row.jenjang)).size;
  const jenjangList = Array.from(new Set(rows.map((row) => row.jenjang))).join(" · ");
  const kpiHint =
    status === "error" ? "Perkiraan — gagal memuat data langsung" : undefined;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Yayasan Arkinara Nusantara
          </h1>
          <p className="text-xs text-muted-foreground">
            Ringkasan lintas tenant · {jenjangCount} jenjang
            {jenjangList ? ` (${jenjangList})` : ""}
            {today ? ` · ${today}` : ""}
          </p>
        </div>
        <span className="rounded-full bg-primary-container px-3 py-1.5 text-2xs font-semibold text-primary-container-foreground">
          Super Admin
        </span>
      </div>

      {status === "error" && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/50 bg-destructive-container px-4 py-3 text-destructive-container-foreground"
        >
          <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1 text-sm">
            Gagal memuat data tenant. Angka di bawah adalah perkiraan.
          </p>
          <Button
            variant="outlined"
            icon={RotateCcw}
            className="min-h-10 px-3 text-xs"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            Coba lagi
          </Button>
        </div>
      )}

      <section
        aria-label="Indikator lintas tenant"
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
              label="Total Sekolah"
              value={kpi.schools ?? FALLBACK_KPI.schools}
              icon={School}
              hint={kpiHint ?? `${jenjangList || "Semua jenjang"}`}
            />
            <MetricCard
              label="Total Siswa"
              value={kpi.students ?? FALLBACK_KPI.students}
              icon={Users}
              delta={{ value: "+124", direction: "up" }}
              hint={kpiHint ?? "Lintas seluruh sekolah"}
            />
            <MetricCard
              label="Total Guru & Staf"
              value={kpi.staff ?? FALLBACK_KPI.staff}
              icon={GraduationCap}
              hint={kpiHint ?? "Guru, TU, dan kepala sekolah"}
            />
            <MetricCard
              label="Kolektabilitas SPP"
              value="86%"
              icon={TrendingUp}
              hint="Best-effort — belum live"
            />
          </>
        )}
      </section>

      <Card>
        <CardHeader className="flex-wrap items-center border-b border-outline-variant pb-3">
          <CardTitle>Perbandingan Antar Sekolah</CardTitle>
          <p className="text-2xs text-muted-foreground">
            Status sehat jika kehadiran ≥{" "}
            <span className="font-mono tabular-nums">93%</span> dan SPP ≥{" "}
            <span className="font-mono tabular-nums">85%</span>
          </p>
        </CardHeader>
        <CardBody className="pt-4">
          {status === "loading" ? (
            <SkeletonTable rows={4} cols={6} />
          ) : sortedRows.length === 0 ? (
            <EmptyState
              icon={School}
              title="Belum ada tenant"
              description="Belum ada sekolah yang terdaftar. Tambahkan tenant terlebih dahulu."
              action={
                <Button
                  variant="tonal"
                  icon={RotateCcw}
                  onClick={() => setReloadKey((key) => key + 1)}
                >
                  Muat ulang
                </Button>
              }
            />
          ) : (
            <Table
              columns={columns}
              rows={sortedRows}
              rowKey={(row) => row.id}
              sort={{ key: sort.key, direction: sort.direction }}
              onSort={toggleSort}
            />
          )}
        </CardBody>
      </Card>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="items-center border-b border-outline-variant pb-3">
            <CardTitle>Pengguna per Tenant</CardTitle>
            <span className="font-mono text-2xs tabular-nums text-muted-foreground">
              {barItems.length} tenant
            </span>
          </CardHeader>
          <CardBody>
            <BarList
              items={barItems}
              ariaLabel="Jumlah pengguna per tenant"
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="items-center border-b border-outline-variant pb-3">
            <CardTitle>Kesehatan Sistem</CardTitle>
            <StatusChip tone="success">99,9%</StatusChip>
          </CardHeader>
          <ul className="divide-y divide-outline-variant">
            <li className="flex items-center justify-between gap-2 px-5 py-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-success" aria-hidden />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Ketersediaan layanan
                  </p>
                  <p className="text-2xs text-muted-foreground">
                    30 hari terakhir
                  </p>
                </div>
              </div>
              <span className="font-mono text-sm font-semibold tabular-nums text-success">
                99,9%
              </span>
            </li>
            <li className="flex items-center justify-between gap-2 px-5 py-3">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-success" aria-hidden />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Sinkronisasi tenant
                  </p>
                  <p className="text-2xs text-muted-foreground">
                    {jenjangCount} dari {jenjangCount} tenant
                  </p>
                </div>
              </div>
              <StatusChip tone="success">normal</StatusChip>
            </li>
            <li className="flex items-center justify-between gap-2 px-5 py-3">
              <div className="flex items-center gap-2">
                <Save className="h-4 w-4 text-warning" aria-hidden />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Backup terakhir
                  </p>
                  <p className="text-2xs text-muted-foreground">
                    Jadwal: setiap 24 jam
                  </p>
                </div>
              </div>
              <StatusChip tone="warning">26 jam lalu</StatusChip>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

export default function YayasanDashboardPage() {
  return (
    <DashboardShell role="super_admin">
      {(me) => <YayasanContent me={me} />}
    </DashboardShell>
  );
}
