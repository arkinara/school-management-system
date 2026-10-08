"use client";

import * as React from "react";
import { AlertCircle, Check, ClipboardList, RotateCcw, Save, Upload } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, inputClass } from "@/components/ui/FormField";
import { StatusChip } from "@/components/ui/StatusChip";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { Table, type Column } from "@/components/ui/Table";
import { Toast, ToastViewport } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import {
  GRADE_CATEGORIES,
  bulkSaveGrades,
  fetchAll,
  fetchClassGradeAggregate,
  fetchClasses,
  fetchSubjects,
  fetchTeacherAssignments,
  type ClassAggregateCategory,
  type ClassGradeAggregate,
  type ClassRecord,
  type GradeCategory,
  type SubjectRecord,
} from "@/lib/endpoints";
import { fetchActiveSemester, semesterLabel, semesterOptions, type Semester } from "@/lib/academic";
import { fetchTenants as fetchPublicTenants, type UserMe } from "@/lib/auth";
import { ApiError } from "@/lib/api";

type LoadStatus = "idle" | "loading" | "ready" | "error";

interface GradeRow {
  student_id: number;
  student_name: string;
  subject_id: number;
  subject_name: string;
  categories: Record<string, ClassAggregateCategory>;
}

interface GradeEdit {
  score: string;
  description: string;
}

interface CellStatus {
  status: "saved" | "error";
  error: string | null;
}

interface Aggregate {
  count: number;
  average: number;
  min: number;
  max: number;
}

function cellKey(studentId: number, subjectId: number, category: string): string {
  return `${studentId}:${subjectId}:${category}`;
}

function isValidRaw(raw: string): boolean {
  if (raw.trim() === "") return false;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function GradesContent({ me }: { me: UserMe }) {
  const [classes, setClasses] = React.useState<ClassRecord[]>([]);
  const [subjects, setSubjects] = React.useState<SubjectRecord[]>([]);
  const [classId, setClassId] = React.useState("");
  const [subjectId, setSubjectId] = React.useState("");
  const [semester, setSemester] = React.useState<string>("");
  const [activeSemester, setActiveSemester] = React.useState<Semester | null>(null);
  const [aggregate, setAggregate] = React.useState<ClassGradeAggregate | null>(null);
  const [edits, setEdits] = React.useState<Record<string, GradeEdit>>({});
  const [rowStatus, setRowStatus] = React.useState<Record<string, CellStatus>>({});
  const [jenjang, setJenjang] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<LoadStatus>("idle");
  const [saving, setSaving] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [toast, setToast] = React.useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);
  const cellRefs = React.useRef<Record<string, HTMLInputElement | null>>({});

  const descriptionRequired = jenjang === "TK" || jenjang === "SD";

  React.useEffect(() => {
    let active = true;
    Promise.all([
      fetchAll((p) => fetchClasses(p)),
      fetchAll((p) => fetchSubjects(p)),
      fetchActiveSemester().catch(() => "2026/2027-ganjil" as Semester),
      fetchTeacherAssignments(me.user.id).catch(() => []),
      fetchPublicTenants().catch(() => []),
    ])
      .then(([classList, subjectList, activeSem, assignments, tenants]) => {
        if (!active) return;
        const myClassIds = new Set(assignments.map((row) => row.class_id));
        const available =
          myClassIds.size > 0 ? classList.filter((c) => myClassIds.has(c.id)) : classList;
        setClasses(available);
        setSubjects(subjectList);
        setActiveSemester(activeSem);
        setSemester(activeSem);
        const myTenant = tenants.find((tenant) => tenant.id === me.tenant_id);
        setJenjang(myTenant?.jenjang_type ?? null);
        if (available[0]) setClassId(String(available[0].id));
        if (subjectList[0]) setSubjectId(String(subjectList[0].id));
      })
      .catch(() => {
        if (active) setToast({ message: "Gagal memuat kelas/mapel.", tone: "error" });
      });
    return () => {
      active = false;
    };
  }, [me.user.id, me.tenant_id]);

  React.useEffect(() => {
    if (!classId || !semester) return;
    let active = true;
    setStatus("loading");
    fetchClassGradeAggregate({ class_id: Number(classId), semester })
      .then((data) => {
        if (!active) return;
        setAggregate(data);
        setEdits({});
        setRowStatus({});
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [classId, semester, reloadKey]);

  const semesterChoices = activeSemester ? semesterOptions(activeSemester) : [];

  const rows = React.useMemo<GradeRow[]>(() => {
    const subject = aggregate?.subjects.find((s) => String(s.subject_id) === subjectId);
    if (!subject) return [];
    return subject.students.map((student) => ({
      student_id: student.student_id,
      student_name: student.student_name,
      subject_id: subject.subject_id,
      subject_name: subject.subject_name,
      categories: student.categories,
    }));
  }, [aggregate, subjectId]);

  function baseScore(studentId: number, category: string): number | undefined {
    const row = rows.find((item) => item.student_id === studentId);
    const first = row?.categories[category]?.scores?.[0];
    return typeof first === "number" ? first : undefined;
  }

  function displayedScore(studentId: number, subjectIdValue: number, category: string): string {
    const key = cellKey(studentId, subjectIdValue, category);
    const edit = edits[key];
    if (edit !== undefined) return edit.score;
    const base = baseScore(studentId, category);
    return base !== undefined ? String(base) : "";
  }

  function onCellChange(
    studentId: number,
    subjectIdValue: number,
    category: GradeCategory,
    score: string,
    description: string
  ) {
    const key = cellKey(studentId, subjectIdValue, category);
    const base = baseScore(studentId, category);
    const baseStr = base !== undefined ? String(base) : "";
    setEdits((prev) => {
      if (score === baseStr && description === "") {
        const { [key]: _drop, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: { score, description } };
    });
    setRowStatus((prev) => {
      if (!(key in prev)) return prev;
      const { [key]: _drop, ...rest } = prev;
      return rest;
    });
  }

  async function refetch() {
    if (!classId || !semester) return;
    const data = await fetchClassGradeAggregate({ class_id: Number(classId), semester });
    setAggregate(data);
  }

  async function save() {
    if (saving) return;
    const keys = Object.keys(edits);
    if (keys.length === 0) return;
    if (!classId || !semester) return;

    const invalid: Record<string, string> = {};
    for (const key of keys) {
      const edit = edits[key];
      if (edit.score.trim() === "") continue;
      if (!isValidRaw(edit.score)) {
        invalid[key] = "Nilai harus 0–100.";
      } else if (descriptionRequired && edit.description.trim() === "") {
        invalid[key] = `Deskripsi wajib diisi untuk jenjang ${jenjang}.`;
      }
    }
    if (Object.keys(invalid).length > 0) {
      setRowStatus((prev) => {
        const next = { ...prev };
        for (const [key, message] of Object.entries(invalid)) {
          next[key] = { status: "error", error: message };
        }
        return next;
      });
      cellRefs.current[Object.keys(invalid)[0]]?.focus();
      setToast({ message: "Perbaiki nilai yang tidak valid.", tone: "error" });
      return;
    }

    interface SaveGroup {
      subject_id: number;
      category: GradeCategory;
      entries: { student_id: number; score: number; description: string | null }[];
    }
    const groups = new Map<string, SaveGroup>();
    for (const key of keys) {
      const [studentRaw, subjectRaw, category] = key.split(":");
      const edit = edits[key];
      if (edit.score.trim() === "") continue;
      const groupKey = `${subjectRaw}:${category}`;
      let group = groups.get(groupKey);
      if (group === undefined) {
        group = {
          subject_id: Number(subjectRaw),
          category: category as GradeCategory,
          entries: [],
        };
        groups.set(groupKey, group);
      }
      group.entries.push({
        student_id: Number(studentRaw),
        score: Number(edit.score),
        description: edit.description.trim() ? edit.description : null,
      });
    }
    if (groups.size === 0) return;

    setSaving(true);
    const nextStatus: Record<string, CellStatus> = {};
    let savedCount = 0;
    try {
      await Promise.all(
        [...groups.entries()].map(async ([, group]) => {
          try {
            await bulkSaveGrades({
              class_id: Number(classId),
              subject_id: group.subject_id,
              semester,
              category: group.category,
              entries: group.entries,
            });
            for (const entry of group.entries) {
              nextStatus[cellKey(entry.student_id, group.subject_id, group.category)] = {
                status: "saved",
                error: null,
              };
              savedCount += 1;
            }
          } catch (err) {
            const detail = err instanceof ApiError ? err.detail : "Gagal menyimpan nilai.";
            for (const entry of group.entries) {
              nextStatus[cellKey(entry.student_id, group.subject_id, group.category)] = {
                status: "error",
                error: detail,
              };
            }
          }
        })
      );
      setRowStatus((prev) => ({ ...prev, ...nextStatus }));
      const failed = Object.values(nextStatus).some((item) => item.status === "error");
      if (failed) {
        setEdits((prev) => {
          const next = { ...prev };
          for (const [key, cell] of Object.entries(nextStatus)) {
            if (cell.status === "saved") delete next[key];
          }
          return next;
        });
        setToast({ message: "Sebagian nilai gagal disimpan.", tone: "error" });
      } else {
        setEdits({});
        await refetch();
        setToast({ message: `${savedCount} nilai tersimpan`, tone: "success" });
      }
    } finally {
      setSaving(false);
    }
  }

  const subjectName = subjects.find((s) => String(s.id) === subjectId)?.name ?? "Mata pelajaran";
  const className = classes.find((c) => String(c.id) === classId)?.name ?? "Kelas";

  const stats: Aggregate = React.useMemo(() => {
    const values: number[] = [];
    for (const row of rows) {
      for (const category of GRADE_CATEGORIES) {
        const raw = displayedScore(row.student_id, row.subject_id, category.value);
        if (!isValidRaw(raw)) continue;
        values.push(Number(raw));
      }
    }
    if (values.length === 0) return { count: 0, average: 0, min: 0, max: 0 };
    return {
      count: values.length,
      average: values.reduce((sum, value) => sum + value, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, edits]);

  const columns: Column<GradeRow>[] = [
    {
      key: "name",
      header: "Siswa",
      cell: (row) => (
        <div>
          <p className="text-sm font-medium text-foreground">{row.student_name}</p>
          <p className="font-mono text-2xs tabular-nums text-muted-foreground">
            {row.subject_name}
          </p>
        </div>
      ),
    },
    ...GRADE_CATEGORIES.map((category) => ({
      key: category.value,
      header: category.label,
      cell: (row: GradeRow) => {
        const key = cellKey(row.student_id, row.subject_id, category.value);
        const score = displayedScore(row.student_id, row.subject_id, category.value);
        const description = edits[key]?.description ?? "";
        const cellStatus = rowStatus[key];
        const invalid = cellStatus?.status === "error";
        return (
          <div className="flex flex-col gap-0.5">
            <input
              ref={(node) => {
                cellRefs.current[key] = node;
              }}
              type="number"
              min={0}
              max={100}
              inputMode="decimal"
              value={score}
              onChange={(event) =>
                onCellChange(
                  row.student_id,
                  row.subject_id,
                  category.value,
                  event.target.value,
                  description
                )
              }
              aria-label={`${category.label} ${row.student_name}`}
              aria-invalid={invalid}
              placeholder="—"
              className={cn(
                inputClass,
                "min-h-[32px] w-20 px-2 text-center font-mono tabular-nums",
                invalid && "border-destructive"
              )}
            />
            <input
              type="text"
              value={description}
              onChange={(event) =>
                onCellChange(
                  row.student_id,
                  row.subject_id,
                  category.value,
                  score,
                  event.target.value
                )
              }
              aria-label={`Deskripsi ${category.label} ${row.student_name}`}
              required={descriptionRequired}
              aria-invalid={invalid}
              placeholder={descriptionRequired ? "Wajib" : "Opsional"}
              className={cn(inputClass, "min-h-[28px] w-32 px-2 text-2xs")}
            />
            {cellStatus?.status === "error" && (
              <span role="alert" className="max-w-[9rem] text-2xs text-destructive">
                {cellStatus.error}
              </span>
            )}
            {cellStatus?.status === "saved" && (
              <span className="inline-flex items-center gap-0.5 text-2xs text-success">
                <Check className="h-3 w-3" aria-hidden />
                Tersimpan
              </span>
            )}
          </div>
        );
      },
      align: "center" as const,
    })),
  ];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Input Nilai</h1>
          <p className="text-xs text-muted-foreground">
            Guru · nilai per kelas, mata pelajaran, dan kategori
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outlined"
            icon={RotateCcw}
            type="button"
            onClick={() => setReloadKey((current) => current + 1)}
            disabled={status !== "ready"}
          >
            Muat ulang
          </Button>
          <Button
            variant="outlined"
            icon={Upload}
            type="button"
            disabled
            title="Impor CSV akan tersedia pada rilis berikutnya"
          >
            Impor Massal
          </Button>
          <Button
            icon={Save}
            type="button"
            onClick={save}
            loading={saving}
            disabled={status !== "ready" || rows.length === 0}
          >
            Simpan Nilai
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-wrap items-end gap-3 border-b border-outline-variant pb-4">
          <CardTitle className="sr-only">Pilih kelas</CardTitle>
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Kelas" htmlFor="grade-class" required>
              <select
                id="grade-class"
                value={classId}
                onChange={(event) => setClassId(event.target.value)}
                className={inputClass}
              >
                <option value="">Pilih kelas…</option>
                {classes.map((klass) => (
                  <option key={klass.id} value={klass.id}>
                    {klass.name} · {klass.academic_year}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Mata Pelajaran" htmlFor="grade-subject" required>
              <select
                id="grade-subject"
                value={subjectId}
                onChange={(event) => setSubjectId(event.target.value)}
                className={inputClass}
              >
                <option value="">Pilih mapel…</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Semester" htmlFor="grade-semester" required>
              <select
                id="grade-semester"
                value={semester}
                onChange={(event) => setSemester(event.target.value)}
                className={inputClass}
              >
                {semesterChoices.map((value) => (
                  <option key={value} value={value}>
                    {semesterLabel(value)}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
        </CardHeader>

        <div className="flex flex-wrap items-center gap-3 border-b border-outline-variant px-5 py-2.5">
          <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="text-2xs text-muted-foreground">
            {className} · {subjectName} · {semesterLabel(semester)}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <StatusChip tone="neutral">
              Rata-rata {stats.count ? stats.average.toFixed(1) : "—"}
            </StatusChip>
            <StatusChip tone="info">Min {stats.count ? stats.min : "—"}</StatusChip>
            <StatusChip tone="success">Max {stats.count ? stats.max : "—"}</StatusChip>
            <span className="font-mono text-2xs tabular-nums text-muted-foreground">
              {stats.count} nilai
            </span>
          </div>
        </div>

        {status === "loading" ? (
          <div className="p-4">
            <SkeletonTable rows={6} cols={6} />
          </div>
        ) : status === "error" ? (
          <div className="p-4">
            <EmptyState
              icon={AlertCircle}
              title="Gagal memuat nilai"
              description="Tidak dapat mengambil data nilai. Periksa koneksi lalu coba lagi."
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
          </div>
        ) : !classId || !subjectId ? (
          <div className="p-4">
            <EmptyState
              icon={ClipboardList}
              title="Pilih kelas dan mata pelajaran"
              description="Nilai siswa akan tampil setelah kelas dan mapel dipilih."
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={ClipboardList}
              title="Tidak ada siswa di kelas ini"
              description="Belum ada siswa terdaftar pada kelas yang dipilih."
            />
          </div>
        ) : (
          <Table columns={columns} rows={rows} rowKey={(row) => String(row.student_id)} />
        )}
      </Card>

      <ToastViewport>
        {toast && (
          <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />
        )}
      </ToastViewport>
    </div>
  );
}

export default function GradesPage() {
  return (
    <DashboardShell role="teacher" title="Nilai">
      {(me) => <GradesContent me={me} />}
    </DashboardShell>
  );
}
