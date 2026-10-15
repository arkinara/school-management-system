"use client";

import * as React from "react";
import { AlertCircle, Building2, GraduationCap, RotateCcw, School, Users } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { AnnouncementWidget } from "@/components/widgets/AnnouncementWidget";
import { SchoolComparisonWidget } from "@/components/widgets/SchoolComparisonWidget";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusChip, type ChipTone } from "@/components/ui/StatusChip";
import { SkeletonCard, SkeletonTable } from "@/components/ui/Skeleton";
import { Table, type Column } from "@/components/ui/Table";
import {
  fetchYayasanOverview,
  type YayasanOverview,
  type YayasanTenantSummary,
} from "@/lib/endpoints";
import type { UserMe } from "@/lib/auth";

type LoadStatus = "loading" | "ready" | "error";

const JENJANG_TONE: Record<string, ChipTone> = {
  TK: "primary",
  SD: "info",
  SMP: "warning",
  SMA: "success",
};

const ROLE_COLUMNS: { key: string; label: string }[] = [
  { key: "super_admin", label: "Super Admin" },
  { key: "principal", label: "Kepala Sekolah" },
  { key: "teacher", label: "Guru" },
  { key: "student", label: "Siswa" },
  { key: "parent", label: "Orang Tua" },
  { key: "admin", label: "TU" },
];

function sumRoles(roles: Record<string, number>): number {
  return Object.values(roles).reduce((total, count) => total + count, 0);
}

function YayasanContent({ me }: { me: UserMe }) {
  const [status, setStatus] = React.useState<LoadStatus>("loading");
  const [data, setData] = React.useState<YayasanOverview | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    setStatus("loading");
    fetchYayasanOverview()
      .then((overview) => {
        if (!active) return;
        setData(overview);
        setStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setData(null);
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [reloadKey, me.user.id]);

  const tenantColumns = React.useMemo<Column<YayasanTenantSummary>[]>(
    () => [
      {
        key: "name",
        header: "Tenant",
        cell: (row) => <span className="font-medium text-foreground">{row.name}</span>,
      },
      {
        key: "jenjang_type",
        header: "Jenjang",
        cell: (row) => (
          <StatusChip tone={JENJANG_TONE[row.jenjang_type ?? ""] ?? "neutral"}>
            {row.jenjang_type ?? "—"}
          </StatusChip>
        ),
      },
      {
        key: "school_count",
        header: "Sekolah",
        align: "right",
        cell: (row) => <span className="font-mono tabular-nums">{row.school_count}</span>,
      },
      {
        key: "enrollment",
        header: "Siswa",
        align: "right",
        cell: (row) => <span className="font-mono tabular-nums">{row.enrollment}</span>,
      },
      {
        key: "attendance_rate",
        header: "Kehadiran %",
        align: "right",
        cell: (row) => <span className="font-mono tabular-nums">{row.attendance_rate}%</span>,
      },
      {
        key: "spp_collection_rate",
        header: "SPP %",
        align: "right",
        cell: (row) => <span className="font-mono tabular-nums">{row.spp_collection_rate}%</span>,
      },
    ],
    []
  );

  const loading = status === "loading";
  const isEmpty = status === "ready" && (data === null || data.total_tenants === 0);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Multi-tenant Overview
          </h1>
          <p className="text-xs text-muted-foreground">
            Ringkasan lintas tenant dari data langsung backend
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
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1 text-sm">Gagal memuat data yayasan.</p>
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

      {loading && (
        <section
          aria-label="Indikator lintas tenant"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </section>
      )}

      {isEmpty && (
        <div role="status" className="rounded-lg bg-surface-container-low p-4">
          <EmptyState
            icon={School}
            title="Belum ada tenant"
            description="Belum ada tenant. Buat tenant pertama Anda di halaman settings."
          />
        </div>
      )}

      {status === "ready" && data && data.total_tenants > 0 && (
        <>
          <section
            aria-label="Indikator lintas tenant"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            <MetricCard label="Total Tenant" value={data.total_tenants} icon={Building2} />
            <MetricCard label="Total Sekolah" value={data.total_schools} icon={School} />
            <MetricCard label="Total Siswa" value={data.total_enrollment} icon={GraduationCap} />
            <MetricCard
              label="Total Pengguna"
              value={sumRoles(data.total_users_by_role)}
              icon={Users}
            />
          </section>

          <Card>
            <CardHeader className="items-center border-b border-outline-variant pb-3">
              <CardTitle>Perbandingan Antar Tenant</CardTitle>
              <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                {data.total_tenants} tenant
              </span>
            </CardHeader>
            <CardBody className="pt-4">
              <Table columns={tenantColumns} rows={data.tenants} rowKey={(row) => String(row.id)} />
            </CardBody>
          </Card>

          <SchoolComparisonWidget tenants={data.tenants} />

          <UsersByRoleWidget totals={data.total_users_by_role} perTenant={data.tenants} />
        </>
      )}

      {loading && (
        <Card>
          <CardBody className="pt-4">
            <SkeletonTable rows={4} cols={6} />
          </CardBody>
        </Card>
      )}

      <AnnouncementWidget />
    </div>
  );
}

function UsersByRoleWidget({
  totals,
  perTenant,
}: {
  totals: Record<string, number>;
  perTenant: YayasanTenantSummary[];
}) {
  const rows = React.useMemo(() => {
    return perTenant.map((tenant) => {
      const row: Record<string, number | string> = { id: tenant.id, name: tenant.name };
      for (const role of ROLE_COLUMNS) {
        row[role.key] = tenant.users_by_role[role.key] ?? 0;
      }
      row.total = sumRoles(tenant.users_by_role);
      return row;
    });
  }, [perTenant]);

  const columns = React.useMemo<Column<Record<string, number | string>>[]>(
    () => [
      {
        key: "name",
        header: "Tenant",
        cell: (row) => <span className="font-medium text-foreground">{String(row.name)}</span>,
      },
      ...ROLE_COLUMNS.map((role) => ({
        key: role.key,
        header: role.label,
        align: "right" as const,
        cell: (row: Record<string, number | string>) => (
          <span className="font-mono tabular-nums">{Number(row[role.key] ?? 0)}</span>
        ),
      })),
      {
        key: "total",
        header: "Total",
        align: "right",
        cell: (row) => (
          <span className="font-mono font-semibold tabular-nums text-foreground">
            {Number(row.total ?? 0)}
          </span>
        ),
      },
    ],
    []
  );

  return (
    <Card>
      <CardHeader className="items-center border-b border-outline-variant pb-3">
        <CardTitle>Pengguna per Role</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-3 pt-4">
        <Table columns={columns} rows={rows} rowKey={(row) => String(row.id)} />
        <p className="text-2xs text-muted-foreground">
          Total: super_admin={totals.super_admin ?? 0}, principal={totals.principal ?? 0}, teacher=
          {totals.teacher ?? 0}, student={totals.student ?? 0}, parent=
          {totals.parent ?? 0}, admin={totals.admin ?? 0}
        </p>
      </CardBody>
    </Card>
  );
}

export default function YayasanDashboardPage() {
  return <DashboardShell role="super_admin">{(me) => <YayasanContent me={me} />}</DashboardShell>;
}
