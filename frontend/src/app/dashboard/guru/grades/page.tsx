"use client";

import * as React from "react";
import { AlertCircle, ClipboardList, RotateCcw, Save, Upload } from "lucide-react";
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
  fetchClasses,
  fetchGrades,
  fetchStudents,
  fetchSubjects,
  type ClassRecord,
  type GradeCategory,
  type StudentRecord,
  type SubjectRecord,
} from "@/lib/endpoints";
import { fetchActiveSemester, semesterLabel, semesterOptions, type Semester } from "@/lib/academic";
import type { UserMe } from "@/lib/auth";
import { ApiError } from "@/lib/api";

type LoadStatus = "idle" | "loading" | "ready" | "error";

type ScoreMap = Record<number, Partial<Record<GradeCategory, string>>>;

interface Aggregate {
  count: number;
  average: number;
  min: number;
  max: number;
}

function isValidScore(raw: string): boolean {
  if (raw.trim() === "") return true;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function GradesContent({ me }: { me: UserMe }) {
  void me;
  const [classes, setClasses] = React.useState<ClassRecord[]>([]);
  const [subjects, setSubjects] = React.useState<SubjectRecord[]>([]);
  const [classId, setClassId] = React.useState("");
  const [subjectId, setSubjectId] = React.useState("");
  const [semester, setSemester] = React.useState<string>("");
  const [activeSemester, setActiveSemester] = React.useState<Semester | null>(null);
  const [roster, setRoster] = React.useState<StudentRecord[]>([]);
  const [scores, setScores] = React.useState<ScoreMap>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [status, setStatus] = React.useState<LoadStatus>("idle");
  const [saving, setSaving] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [toast, setToast] = React.useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);
  const inputRefs = React.useRef<Record<string, HTMLInputElement | null>>({});

  React.useEffect(() => {
    let active = true;
    Promise.all([
      fetchClasses({ size: 100 }),
      fetchAll((p) => fetchSubjects(p)),
      fetchActiveSemester().catch(() => "2026/2027-ganjil" as Semester),
    ])
      .then(([classPage, subjectList, activeSem]) => {
        if (!active) return;
        setClasses(classPage.items);
        setSubjects(subjectList);
        if (classPage.items[0]) setClassId(String(classPage.items[0].id));
        if (subjectList[0]) setSubjectId(String(subjectList[0].id));
        setActiveSemester(activeSem);
        setSemester(activeSem);
      })
      .catch(() => {
        if (active) setToast({ message: "Gagal memuat kelas/mapel.", tone: "error" });
      });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (!classId || !subjectId || !semester) return;
    let active = true;
    setStatus("loading");
    Promise.all([
      fetchAll((p) => fetchStudents({ class_id: Number(classId), ...p })),
      fetchAll((p) => fetchGrades({ subject_id: Number(subjectId), semester, ...p })),
    ])
      .then(([students, grades]) => {
        if (!active) return;
        setRoster(students);
        const next: ScoreMap = {};
        for (const student of students) next[student.id] = {};
        for (const grade of grades) {
          const bucket = next[grade.student_id];
          if (!bucket) continue;
          bucket[grade.category] = String(grade.score);
        }
        setScores(next);
        setErrors({});
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [classId, subjectId, semester, reloadKey]);

  const semesterChoices = activeSemester ? semesterOptions(activeSemester) : [];

  const aggregate: Aggregate = React.useMemo(() => {
    const values: number[] = [];
    for (const row of Object.values(scores)) {
      for (const category of GRADE_CATEGORIES) {
        const raw = row[category.value];
        if (raw === undefined || raw.trim() === "") continue;
        const value = Number(raw);
        if (Number.isFinite(value) && value >= 0 && value <= 100) values.push(value);
      }
    }
    if (values.length === 0) return { count: 0, average: 0, min: 0, max: 0 };
    return {
      count: values.length,
      average: values.reduce((sum, v) => sum + v, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }, [scores]);

  function setScore(studentId: number, category: GradeCategory, raw: string) {
    setScores((current) => ({
      ...current,
      [studentId]: { ...current[studentId], [category]: raw },
    }));
    if (!isValidScore(raw)) {
      setErrors((current) => ({
        ...current,
        [`${studentId}:${category}`]: "Nilai harus 0–100.",
      }));
    } else {
      setErrors((current) => {
        const key = `${studentId}:${category}`;
        if (!(key in current)) return current;
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }

  async function save() {
    if (saving) return;
    const nextErrors: Record<string, string> = {};
    for (const student of roster) {
      for (const category of GRADE_CATEGORIES) {
        const raw = scores[student.id]?.[category.value] ?? "";
        if (raw.trim() !== "" && !isValidScore(raw)) {
          nextErrors[`${student.id}:${category.value}`] = "Nilai harus 0–100.";
        }
      }
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      const firstKey = Object.keys(nextErrors)[0];
      inputRefs.current[firstKey]?.focus();
      setToast({ message: "Perbaiki nilai yang tidak valid.", tone: "error" });
      return;
    }

    setSaving(true);
    try {
      let created = 0;
      for (const category of GRADE_CATEGORIES) {
        const entries = roster
          .map((student) => {
            const raw = scores[student.id]?.[category.value] ?? "";
            if (raw.trim() === "") return null;
            return { student_id: student.id, score: Number(raw) };
          })
          .filter((entry): entry is { student_id: number; score: number } => entry !== null);
        if (entries.length === 0) continue;
        const result = await bulkSaveGrades({
          class_id: Number(classId),
          subject_id: Number(subjectId),
          semester,
          category: category.value,
          entries,
        });
        created += result.created;
      }
      setToast({
        message: created > 0 ? `${created} nilai tersimpan` : "Tidak ada nilai baru untuk disimpan",
        tone: "success",
      });
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : "Gagal menyimpan nilai.";
      setToast({ message: detail, tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  const subjectName = subjects.find((s) => String(s.id) === subjectId)?.name ?? "Mata pelajaran";
  const className = classes.find((c) => String(c.id) === classId)?.name ?? "Kelas";

  const columns: Column<StudentRecord>[] = [
    {
      key: "name",
      header: "Siswa",
      cell: (student) => (
        <div>
          <p className="text-sm font-medium text-foreground">
            {student.full_name ?? `Siswa #${student.id}`}
          </p>
          <p className="font-mono text-2xs tabular-nums text-muted-foreground">{student.nis}</p>
        </div>
      ),
    },
    ...GRADE_CATEGORIES.map((category) => ({
      key: category.value,
      header: category.label,
      cell: (student: StudentRecord) => {
        const key = `${student.id}:${category.value}`;
        const invalid = Boolean(errors[key]);
        return (
          <div className="flex flex-col gap-0.5">
            <input
              ref={(node) => {
                inputRefs.current[key] = node;
              }}
              type="number"
              min={0}
              max={100}
              inputMode="decimal"
              value={scores[student.id]?.[category.value] ?? ""}
              onChange={(event) => setScore(student.id, category.value, event.target.value)}
              aria-label={`${category.label} ${student.full_name ?? student.nis}`}
              aria-invalid={invalid}
              placeholder="—"
              className={cn(
                inputClass,
                "min-h-[32px] w-20 px-2 text-center font-mono tabular-nums",
                invalid && "border-destructive"
              )}
            />
            {invalid && (
              <span role="alert" className="text-2xs text-destructive">
                {errors[key]}
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
            disabled={status !== "ready" || roster.length === 0}
          >
            Simpan Nilai
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-wrap items-end gap-3 border-b border-outline-variant pb-4">
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
              Rata-rata {aggregate.count ? aggregate.average.toFixed(1) : "—"}
            </StatusChip>
            <StatusChip tone="info">Min {aggregate.count ? aggregate.min : "—"}</StatusChip>
            <StatusChip tone="success">Max {aggregate.count ? aggregate.max : "—"}</StatusChip>
            <span className="font-mono text-2xs tabular-nums text-muted-foreground">
              {aggregate.count} nilai
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
        ) : roster.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={ClipboardList}
              title="Tidak ada siswa di kelas ini"
              description="Belum ada siswa terdaftar pada kelas yang dipilih."
            />
          </div>
        ) : (
          <Table columns={columns} rows={roster} rowKey={(student) => String(student.id)} />
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
