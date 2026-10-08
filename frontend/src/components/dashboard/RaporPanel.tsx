"use client";

import * as React from "react";
import { AlertCircle, FileText, Printer, RotateCcw } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, inputClass } from "@/components/ui/FormField";
import { StatusChip } from "@/components/ui/StatusChip";
import { Skeleton, SkeletonList } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import {
  fetchParentChildren,
  fetchRaporList,
  fetchStudents,
  type ChildSummary,
  type RaporCompiledData,
  type ReportCardRecord,
  type StudentRecord,
} from "@/lib/endpoints";
import { fetchActiveSemester, semesterLabel, type Semester } from "@/lib/academic";
import type { UserMe } from "@/lib/auth";

type RaporState =
  | { kind: "loading" }
  | { kind: "error"; message: string; onRetry: () => void }
  | { kind: "no-rapor"; semester: string }
  | { kind: "not-yet-published"; semester: string; status: "draft" | "finalized" }
  | { kind: "published"; rapor: ReportCardRecord };

interface RaporQuery {
  isLoading: boolean;
  isError: boolean;
  data: ReportCardRecord[] | null;
}

/** Exhaustive UI state for the rapor viewer (never collapses errors into empty). */
export function deriveRaporState(
  query: RaporQuery,
  semester: string,
  onRetry: () => void
): RaporState {
  if (query.isLoading) return { kind: "loading" };
  if (query.isError) return { kind: "error", message: "Gagal memuat rapor", onRetry };
  const rows = query.data ?? [];
  const rapor = rows.find((record) => record.semester === semester);
  if (!rapor) return { kind: "no-rapor", semester };
  if (rapor.status === "draft" || rapor.status === "finalized") {
    return { kind: "not-yet-published", semester, status: rapor.status };
  }
  if (rapor.status === "superseded") {
    return { kind: "error", message: "Rapor ini telah diperbarui", onRetry };
  }
  return { kind: "published", rapor };
}

function formatScore(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function NarrativeList({ entries }: { entries: { aspek: string; deskripsi: string }[] }) {
  return (
    <ul className="divide-y divide-outline-variant">
      {entries.map((entry) => (
        <li key={entry.aspek} className="px-5 py-3">
          <p className="text-sm font-semibold text-foreground">{entry.aspek}</p>
          <p className="mt-1 text-sm text-muted-foreground">{entry.deskripsi}</p>
        </li>
      ))}
    </ul>
  );
}

function NumericTable({
  entries,
}: {
  entries: { subject_id: number; subject: string; score: number; deskripsi: string }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-surface-container">
          <tr>
            <th
              scope="col"
              className="border-b border-outline-variant px-4 py-2.5 text-left font-semibold text-muted-foreground"
            >
              Mata Pelajaran
            </th>
            <th
              scope="col"
              className="border-b border-outline-variant px-4 py-2.5 text-right font-semibold text-muted-foreground"
            >
              Nilai
            </th>
            <th
              scope="col"
              className="border-b border-outline-variant px-4 py-2.5 text-left font-semibold text-muted-foreground"
            >
              Deskripsi
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant">
          {entries.map((entry) => (
            <tr key={entry.subject_id} className="hover:bg-surface-container-low">
              <td className="px-4 py-2.5 font-medium text-foreground">{entry.subject}</td>
              <td
                data-value={entry.score}
                className="px-4 py-2.5 text-right font-mono tabular-nums text-foreground"
              >
                {formatScore(entry.score)}
              </td>
              <td className="px-4 py-2.5 text-muted-foreground">{entry.deskripsi || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompiledBody({ data }: { data: RaporCompiledData }) {
  if (data.tumbuh_kembang) {
    return <NarrativeList entries={data.tumbuh_kembang} />;
  }
  if (data.capaian_pembelajaran) {
    return <NarrativeList entries={data.capaian_pembelajaran} />;
  }
  if (data.nilai) {
    return <NumericTable entries={data.nilai} />;
  }
  return (
    <div className="p-4">
      <EmptyState
        icon={FileText}
        title="Belum ada capaian"
        description="Konten rapor belum tersedia untuk semester ini."
      />
    </div>
  );
}

function AttendanceSummary({ kehadiran }: { kehadiran: Record<string, number> }) {
  const rows: { label: string; value: number; tone: string }[] = [
    { label: "Hadir", value: kehadiran.hadir ?? 0, tone: "bg-success" },
    { label: "Izin", value: kehadiran.izin ?? 0, tone: "bg-info" },
    { label: "Sakit", value: kehadiran.sakit ?? 0, tone: "bg-warning" },
    { label: "Alpa", value: kehadiran.alpa ?? 0, tone: "bg-destructive" },
  ];
  return (
    <dl className="grid grid-cols-4 gap-2 border-t border-outline-variant px-5 py-3 text-center">
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

function RaporContent({ rapor, studentName }: { rapor: ReportCardRecord; studentName: string }) {
  const data = rapor.compiled_data;
  if (data === null) {
    return (
      <EmptyState
        icon={FileText}
        title="Konten rapor belum tersedia"
        description="Rapor sudah dipublikasikan tetapi isinya belum dapat dimuat."
      />
    );
  }
  return (
    <Card>
      <CardHeader className="flex-wrap items-start gap-3 border-b border-outline-variant pb-4">
        <div className="flex items-center gap-3">
          <Avatar name={studentName} size="md" />
          <div>
            <CardTitle>{studentName}</CardTitle>
            <p className="text-2xs text-muted-foreground">
              {semesterLabel(rapor.semester)} · Fase {data.fase} · {data.jenjang}
            </p>
          </div>
        </div>
        <StatusChip tone="success">published</StatusChip>
      </CardHeader>
      <CompiledBody data={data} />
      {data.kehadiran && <AttendanceSummary kehadiran={data.kehadiran} />}
    </Card>
  );
}

function RaporStateView({ state, studentName }: { state: RaporState; studentName: string }) {
  switch (state.kind) {
    case "loading":
      return (
        <Card>
          <CardHeader className="border-b border-outline-variant pb-3">
            <Skeleton className="h-5 w-48" />
          </CardHeader>
          <div className="p-5">
            <SkeletonList rows={5} />
          </div>
        </Card>
      );
    case "error":
      return (
        <div role="alert">
          <EmptyState
            icon={AlertCircle}
            title={state.message}
            description="Tidak dapat mengambil data rapor. Periksa koneksi lalu coba lagi."
            action={
              <Button variant="tonal" icon={RotateCcw} onClick={state.onRetry}>
                Coba lagi
              </Button>
            }
          />
        </div>
      );
    case "no-rapor":
      return (
        <EmptyState
          icon={FileText}
          title="Belum ada rapor"
          description={`Belum ada catatan rapor untuk ${studentName} pada ${semesterLabel(state.semester)}.`}
        />
      );
    case "not-yet-published":
      return (
        <div
          role="status"
          className="rounded-lg bg-warning-container p-5 text-warning-container-foreground"
        >
          <p className="text-sm font-semibold">
            Rapor semester {semesterLabel(state.semester)} belum dipublikasikan.
          </p>
          <p className="mt-1 text-sm">
            Status:{" "}
            {state.status === "draft"
              ? "Disusun wali kelas"
              : "Difinalisasi wali kelas, menunggu persetujuan kepala sekolah"}
          </p>
        </div>
      );
    case "published":
      return <RaporContent rapor={state.rapor} studentName={studentName} />;
  }
}

export interface RaporPanelProps {
  me: UserMe;
  audience: "parent" | "student";
}

/**
 * Shared rapor viewer for the parent and student dashboards. Parent context
 * adds a child selector; student context is scoped to the signed-in student.
 *
 * Semester options are derived from the rapors the backend exposes for the
 * student (parents only ever receive published ones), never hardcoded, and the
 * viewer renders an exhaustive state machine so a failed request is never
 * mistaken for "no rapor".
 */
export function RaporPanel({ me, audience }: RaporPanelProps) {
  const [children, setChildren] = React.useState<ChildSummary[]>([]);
  const [studentName, setStudentName] = React.useState(me.user.full_name);
  const [selectedStudentId, setSelectedStudentId] = React.useState<number | null>(null);
  const [activeSemester, setActiveSemester] = React.useState<Semester>("2026/2027-ganjil");
  const [semester, setSemester] = React.useState<string>("");
  const [fetchKey, setFetchKey] = React.useState(0);
  const [childrenKey, setChildrenKey] = React.useState(0);
  const [childrenStatus, setChildrenStatus] = React.useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [query, setQuery] = React.useState<RaporQuery>({
    isLoading: true,
    isError: false,
    data: null,
  });

  React.useEffect(() => {
    let active = true;
    fetchActiveSemester()
      .then((value) => {
        if (active) setActiveSemester(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    let active = true;
    setChildrenStatus("loading");
    const loadChildren: Promise<{ id: number; full_name: string }[]> =
      audience === "parent"
        ? fetchParentChildren(me.user.id).then((kids) =>
            kids.map((kid) => ({ id: kid.id, full_name: kid.full_name }))
          )
        : fetchStudents({ size: 100 }).then((page) => {
            // Identity comes from the authenticated user link, never the first roster row.
            const own = page.items.find((student: StudentRecord) => student.user_id === me.user.id);
            return own ? [{ id: own.id, full_name: own.full_name ?? me.user.full_name }] : [];
          });
    loadChildren
      .then((list) => {
        if (!active) return;
        setChildren(
          list.map((item) => ({
            id: item.id,
            user_id: 0,
            nis: "",
            full_name: item.full_name,
            class_id: null,
            enrollment_status: "active",
            relationship: "anak",
            is_primary: false,
          }))
        );
        if (list[0]) {
          setSelectedStudentId(list[0].id);
          setStudentName(list[0].full_name);
        } else {
          setSelectedStudentId(null);
        }
        setChildrenStatus("ready");
      })
      .catch(() => {
        if (active) setChildrenStatus("error");
      });
    return () => {
      active = false;
    };
  }, [audience, me.user.full_name, me.user.id, childrenKey]);

  const refetch = React.useCallback(() => setFetchKey((current) => current + 1), []);

  React.useEffect(() => {
    if (selectedStudentId === null) {
      setQuery({ isLoading: false, isError: false, data: [] });
      return;
    }
    let active = true;
    setQuery((current) => ({ ...current, isLoading: true, isError: false }));
    fetchRaporList(selectedStudentId, { size: 100 })
      .then((page) => {
        if (!active) return;
        const mine = page.items.filter((record) => record.student_id === selectedStudentId);
        setQuery({ isLoading: false, isError: false, data: mine });
      })
      .catch(() => {
        if (active) setQuery({ isLoading: false, isError: true, data: null });
      });
    return () => {
      active = false;
    };
  }, [selectedStudentId, fetchKey]);

  const availableSemesters = React.useMemo(() => {
    const set = new Set<string>();
    set.add(activeSemester);
    for (const record of query.data ?? []) set.add(record.semester);
    return Array.from(set).sort();
  }, [query.data, activeSemester]);

  React.useEffect(() => {
    if (availableSemesters.length === 0) return;
    setSemester((current) => {
      if (current && availableSemesters.includes(current)) return current;
      if (availableSemesters.includes(activeSemester)) return activeSemester;
      return availableSemesters[availableSemesters.length - 1];
    });
  }, [availableSemesters, activeSemester]);

  const onSemesterChange = (value: string) => {
    setSemester(value);
    // Force a refetch even when the dropdown value is unchanged.
    setFetchKey((current) => current + 1);
  };

  const state: RaporState =
    childrenStatus === "loading"
      ? { kind: "loading" }
      : childrenStatus === "error"
        ? {
            kind: "error",
            message: "Gagal memuat rapor",
            onRetry: () => setChildrenKey((k) => k + 1),
          }
        : selectedStudentId === null
          ? { kind: "no-rapor", semester }
          : deriveRaporState(query, semester, refetch);

  if (childrenStatus === "ready" && children.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <EmptyState
          icon={FileText}
          title="Belum ada data siswa"
          description="Akun ini belum tertaut ke data siswa mana pun."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Rapor</h1>
          <p className="text-xs text-muted-foreground">
            {audience === "parent" ? "Orang Tua" : "Siswa"} · hasil belajar per semester
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outlined"
            icon={Printer}
            type="button"
            onClick={() => window.print()}
            disabled={state.kind !== "published"}
          >
            Cetak / Simpan PDF
          </Button>
        </div>
      </div>

      <Card className="no-print">
        <CardHeader className="flex-wrap items-end gap-3 pb-4">
          {children.length > 1 && (
            <FormField label="Anak" htmlFor="rapor-child" className="min-w-[14rem]">
              <select
                id="rapor-child"
                value={selectedStudentId ?? ""}
                onChange={(event) => {
                  const id = Number(event.target.value);
                  setSelectedStudentId(id);
                  const child = children.find((item) => item.id === id);
                  if (child) setStudentName(child.full_name);
                }}
                className={inputClass}
              >
                {children.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.full_name}
                  </option>
                ))}
              </select>
            </FormField>
          )}
          <FormField label="Semester" htmlFor="rapor-semester" className="min-w-[16rem]">
            <select
              id="rapor-semester"
              value={semester}
              onChange={(event) => onSemesterChange(event.target.value)}
              className={inputClass}
            >
              {availableSemesters.map((value) => (
                <option key={value} value={value}>
                  {semesterLabel(value)}
                </option>
              ))}
            </select>
          </FormField>
        </CardHeader>
      </Card>

      <div className="rapor-print">
        <RaporStateView state={state} studentName={studentName} />
      </div>
    </div>
  );
}
