"use client";

import * as React from "react";
import { AlertCircle, Download, FileText, Printer, RotateCcw } from "lucide-react";
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
  fetchStudents,
  getRapor,
  type ChildSummary,
  type RaporCompiledData,
  type ReportCardRecord,
  type StudentRecord,
} from "@/lib/endpoints";
import type { UserMe } from "@/lib/auth";

type LoadStatus = "loading" | "ready" | "error";

const SEMESTERS = ["Semester Genap 2025/2026", "Semester Ganjil 2025/2026"] as const;

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

export interface RaporPanelProps {
  me: UserMe;
  audience: "parent" | "student";
}

/**
 * Shared rapor viewer for the parent and student dashboards. Parent context
 * adds a child selector; student context is scoped to the signed-in student.
 */
export function RaporPanel({ me, audience }: RaporPanelProps) {
  const [children, setChildren] = React.useState<ChildSummary[]>([]);
  const [studentName, setStudentName] = React.useState(me.user.full_name);
  const [selectedStudentId, setSelectedStudentId] = React.useState<number | null>(null);
  const [semester, setSemester] = React.useState<string>(SEMESTERS[0]);
  const [available, setAvailable] = React.useState<Record<string, boolean>>({});
  const [records, setRecords] = React.useState<Record<string, ReportCardRecord | null>>({});
  const [rapor, setRapor] = React.useState<ReportCardRecord | null>(null);
  const [status, setStatus] = React.useState<LoadStatus>("loading");
  const [reloadKey, setReloadKey] = React.useState(0);
  const initializedFor = React.useRef<number | null>(null);

  React.useEffect(() => {
    let active = true;
    setStatus("loading");
    const loadChildren: Promise<{ id: number; full_name: string }[]> =
      audience === "parent"
        ? fetchParentChildren(me.user.id).then((kids) =>
            kids.map((kid) => ({ id: kid.id, full_name: kid.full_name }))
          )
        : fetchStudents({ size: 100 }).then((page) => {
            const own =
              page.items.find((student: StudentRecord) => student.user_id === me.user.id) ??
              page.items[0];
            return own
              ? [
                  {
                    id: own.id,
                    full_name: own.full_name ?? me.user.full_name,
                  },
                ]
              : [];
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
          setStatus("ready");
        }
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [audience, me.user.full_name, me.user.id, reloadKey]);

  React.useEffect(() => {
    if (selectedStudentId === null) return;
    let active = true;
    setStatus("loading");
    Promise.all(
      SEMESTERS.map((value) =>
        getRapor({ studentId: selectedStudentId, semester: value })
          .then((record) => [value, record] as const)
          .catch(() => [value, null] as const)
      )
    )
      .then((results) => {
        if (!active) return;
        const availability: Record<string, boolean> = {};
        const bySemester: Record<string, ReportCardRecord | null> = {};
        for (const [value, record] of results) {
          availability[value] = record !== null;
          bySemester[value] = record;
        }
        setAvailable(availability);
        setRecords(bySemester);

        if (initializedFor.current !== selectedStudentId) {
          initializedFor.current = selectedStudentId;
          const firstAvailable = SEMESTERS.find((value) => availability[value]);
          if (firstAvailable) {
            setSemester(firstAvailable);
            return;
          }
          setRapor(null);
          setStatus("ready");
          return;
        }

        setRapor(bySemester[semester] ?? null);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [selectedStudentId, semester, reloadKey]);

  const data = rapor?.compiled_data ?? null;
  const hasAnyRecord = SEMESTERS.some((value) => records[value] != null);
  const selectedRecord = records[semester] ?? null;
  const notPublished =
    status === "ready" && selectedRecord !== null && selectedRecord.status !== "published";

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
            disabled={status !== "ready" || rapor === null}
          >
            Cetak
          </Button>
          <Button
            variant="outlined"
            icon={Download}
            type="button"
            disabled
            title="Unduh PDF akan tersedia pada rilis berikutnya"
          >
            Unduh PDF
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
              onChange={(event) => setSemester(event.target.value)}
              className={inputClass}
            >
              {SEMESTERS.map((value) => (
                <option key={value} value={value} disabled={available[value] === false}>
                  {value}
                  {available[value] === false ? " (belum tersedia)" : ""}
                </option>
              ))}
            </select>
          </FormField>
        </CardHeader>
      </Card>

      {status === "loading" ? (
        <Card>
          <CardHeader className="border-b border-outline-variant pb-3">
            <Skeleton className="h-5 w-48" />
          </CardHeader>
          <div className="p-5">
            <SkeletonList rows={5} />
          </div>
        </Card>
      ) : status === "error" ? (
        <EmptyState
          icon={AlertCircle}
          title="Gagal memuat rapor"
          description="Tidak dapat mengambil data rapor. Periksa koneksi lalu coba lagi."
          action={
            <Button
              variant="tonal"
              icon={RotateCcw}
              onClick={() => setReloadKey((current) => current + 1)}
            >
              Coba lagi
            </Button>
          }
        />
      ) : children.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Belum ada data siswa"
          description="Akun ini belum tertaut ke data siswa mana pun."
        />
      ) : notPublished ? (
        <EmptyState
          icon={FileText}
          title="Rapor belum diterbitkan"
          description={`Rapor ${studentName} untuk ${semester} masih berstatus draft dan belum dapat dilihat.`}
        />
      ) : rapor === null || data === null ? (
        hasAnyRecord ? (
          <EmptyState
            icon={FileText}
            title="Rapor belum diterbitkan"
            description={`Rapor ${studentName} untuk ${semester} belum diterbitkan oleh sekolah.`}
          />
        ) : (
          <EmptyState
            icon={FileText}
            title="Belum ada rapor"
            description={`Belum ada catatan rapor untuk ${studentName} pada semester ini. Rapor akan tersedia setelah wali kelas menerbitkannya.`}
          />
        )
      ) : (
        <Card>
          <CardHeader className="flex-wrap items-start gap-3 border-b border-outline-variant pb-4">
            <div className="flex items-center gap-3">
              <Avatar name={studentName} size="md" />
              <div>
                <CardTitle>{studentName}</CardTitle>
                <p className="text-2xs text-muted-foreground">
                  {rapor.semester} · Fase {data.fase} · {data.jenjang}
                </p>
              </div>
            </div>
            <StatusChip tone="success">published</StatusChip>
          </CardHeader>
          <CompiledBody data={data} />
          {data.kehadiran && <AttendanceSummary kehadiran={data.kehadiran} />}
        </Card>
      )}
    </div>
  );
}
