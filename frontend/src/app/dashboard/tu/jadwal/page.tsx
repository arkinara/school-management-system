"use client";

import * as React from "react";
import { AlertCircle, CalendarDays, Check, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, inputClass } from "@/components/ui/FormField";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { StatusChip } from "@/components/ui/StatusChip";
import { Toast, ToastViewport } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import {
  bulkReplaceSchedules,
  fetchAll,
  fetchClasses,
  fetchSubjects,
  fetchUsers,
  getSchedule,
  type ClassRecord,
  type ScheduleBulkEntry,
  type ScheduleConflict,
  type SubjectRecord,
  type UserRecord,
} from "@/lib/endpoints";
import { DAYS_OF_WEEK } from "@/lib/days";
import { ApiError } from "@/lib/api";

type LoadStatus = "loading" | "ready" | "error";

const DAYS = DAYS_OF_WEEK.map((day) => ({ value: day.value as number, label: day.long }));

const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

const DEFAULT_PERIOD_TIMES: Record<number, { start: string; end: string }> = {
  1: { start: "07:00", end: "07:40" },
  2: { start: "07:40", end: "08:20" },
  3: { start: "08:20", end: "09:00" },
  4: { start: "09:20", end: "10:00" },
  5: { start: "10:00", end: "10:40" },
  6: { start: "10:40", end: "11:20" },
  7: { start: "12:30", end: "13:10" },
  8: { start: "13:10", end: "13:50" },
};

interface Slot {
  subjectId: number;
  teacherId: number;
  start: string;
  end: string;
}

interface TeacherOption {
  id: number;
  full_name: string;
}

function overlap(a: { start: string; end: string }, b: { start: string; end: string }): boolean {
  return a.start < b.end && a.end > b.start;
}

/**
 * Stable serialisation of the grid, used to detect whether the user actually
 * changed anything since the server state was loaded. Prevents re-posting an
 * unchanged timetable (negative AC #58: no request, no self-409).
 */
function serializeGrid(grid: Record<string, Slot>): string {
  return Object.keys(grid)
    .sort()
    .map((key) => {
      const slot = grid[key];
      return `${key}|${slot.subjectId}|${slot.teacherId}|${slot.start}|${slot.end}`;
    })
    .join(",");
}

/**
 * Map backend 409 `detail.conflicts[]` to grid cell keys.
 *
 * Conflicts reference pre-existing rows (usually on another class's timetable
 * for the same teacher) plus in-batch duplicates. A submitted cell is flagged
 * when it overlaps the conflict on the same day and shares the teacher or class.
 */
function conflictCellKeys(
  conflicts: ScheduleConflict[],
  grid: Record<string, Slot>,
  classId: number
): Set<string> {
  const flagged = new Set<string>();
  for (const conflict of conflicts) {
    const day = Number(conflict.day_of_week);
    const start = conflict.start_time.slice(0, 5);
    const end = conflict.end_time.slice(0, 5);
    for (const [key, slot] of Object.entries(grid)) {
      const [keyDay] = key.split(":");
      if (Number(keyDay) !== day) continue;
      if (!overlap(slot, { start, end })) continue;
      if (slot.teacherId === conflict.teacher_id || conflict.class_id === classId) {
        flagged.add(key);
      }
    }
  }
  return flagged;
}

function extractConflicts(error: ApiError): ScheduleConflict[] {
  const detail = (error.body as { detail?: { conflicts?: unknown; conflict?: unknown } })?.detail;
  if (detail && Array.isArray(detail.conflicts)) {
    return detail.conflicts as ScheduleConflict[];
  }
  if (detail && detail.conflict) {
    return [detail.conflict as ScheduleConflict];
  }
  return [];
}

function JadwalConfigContent() {
  const [step, setStep] = React.useState(1);
  const [classes, setClasses] = React.useState<ClassRecord[]>([]);
  const [subjects, setSubjects] = React.useState<SubjectRecord[]>([]);
  const [teachers, setTeachers] = React.useState<TeacherOption[]>([]);
  const [classId, setClassId] = React.useState("");
  const [pool, setPool] = React.useState<{ subjectId: number; teacherId: number }[]>([]);
  const [grid, setGrid] = React.useState<Record<string, Slot>>({});
  const [serverSnapshot, setServerSnapshot] = React.useState("");
  const [gridError, setGridError] = React.useState(false);
  const [gridKey, setGridKey] = React.useState(0);
  const [apiConflicts, setApiConflicts] = React.useState<ScheduleConflict[]>([]);
  const [teacherFilter, setTeacherFilter] = React.useState<number | null>(null);
  const [loadStatus, setLoadStatus] = React.useState<LoadStatus>("loading");
  const [gridLoading, setGridLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [cellError, setCellError] = React.useState<string | null>(null);
  const [activeCell, setActiveCell] = React.useState<{ day: number; period: number } | null>(null);
  const [draft, setDraft] = React.useState<{
    subjectId: string;
    teacherId: string;
    start: string;
    end: string;
  }>({ subjectId: "", teacherId: "", start: "", end: "" });
  const [resetOpen, setResetOpen] = React.useState(false);
  const [toast, setToast] = React.useState<{
    message: string;
    tone: "success" | "error" | "warning";
  } | null>(null);

  React.useEffect(() => {
    let active = true;
    Promise.all([
      fetchClasses({ size: 100 }),
      fetchAll((p) => fetchSubjects(p)),
      fetchAll((p) => fetchUsers({ role: "teacher", ...p })),
    ])
      .then(([classPage, subjectList, userList]) => {
        if (!active) return;
        setClasses(classPage.items);
        setSubjects(subjectList);
        setTeachers(
          userList.map((user: UserRecord) => ({
            id: user.id,
            full_name: user.full_name,
          }))
        );
        if (classPage.items[0]) setClassId(String(classPage.items[0].id));
        setLoadStatus("ready");
      })
      .catch(() => {
        if (active) setLoadStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  const loadGrid = React.useCallback(() => {
    if (!classId) return;
    let active = true;
    setGridLoading(true);
    setGridError(false);
    getSchedule(Number(classId))
      .then((records) => {
        if (!active) return;
        const next: Record<string, Slot> = {};
        for (const record of records) {
          next[`${record.day_of_week}:${record.period_number}`] = {
            subjectId: record.subject_id,
            teacherId: record.teacher_id,
            start: record.start_time.slice(0, 5),
            end: record.end_time.slice(0, 5),
          };
        }
        setGrid(next);
        setServerSnapshot(serializeGrid(next));
        setApiConflicts([]);
      })
      .catch(() => {
        if (active) setGridError(true);
      })
      .finally(() => {
        if (active) setGridLoading(false);
      });
    return () => {
      active = false;
    };
  }, [classId]);

  React.useEffect(() => {
    if (step !== 3 || !classId) return;
    const cleanup = loadGrid();
    return cleanup;
  }, [step, classId, gridKey, loadGrid]);

  const localConflicts = React.useMemo(() => {
    const flagged = new Set<string>();
    const entries = Object.entries(grid);
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const [keyA, slotA] = entries[i];
        const [keyB, slotB] = entries[j];
        const dayA = keyA.split(":")[0];
        const dayB = keyB.split(":")[0];
        if (dayA !== dayB) continue;
        if (slotA.teacherId !== slotB.teacherId) continue;
        if (overlap(slotA, slotB)) {
          flagged.add(keyA);
          flagged.add(keyB);
        }
      }
    }
    return flagged;
  }, [grid]);

  const apiConflictKeys = React.useMemo(
    () => conflictCellKeys(apiConflicts, grid, Number(classId) || 0),
    [apiConflicts, grid, classId]
  );

  const conflictCells = React.useMemo(() => {
    const merged = new Set(localConflicts);
    for (const key of apiConflictKeys) merged.add(key);
    return merged;
  }, [localConflicts, apiConflictKeys]);

  function addPoolEntry() {
    setPool((current) => [...current, { subjectId: 0, teacherId: 0 }]);
  }

  function updatePoolEntry(index: number, field: "subjectId" | "teacherId", value: number) {
    setPool((current) =>
      current.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry))
    );
  }

  function removePoolEntry(index: number) {
    setPool((current) => current.filter((_, i) => i !== index));
  }

  function goToStep3() {
    setStep(3);
  }

  function openCell(day: number, period: number) {
    const key = `${day}:${period}`;
    const existing = grid[key];
    const poolDefault = pool[0];
    setDraft({
      subjectId: String(existing?.subjectId ?? poolDefault?.subjectId ?? ""),
      teacherId: String(existing?.teacherId ?? poolDefault?.teacherId ?? teacherFilter ?? ""),
      start: existing?.start ?? DEFAULT_PERIOD_TIMES[period]?.start ?? "07:00",
      end: existing?.end ?? DEFAULT_PERIOD_TIMES[period]?.end ?? "07:40",
    });
    setActiveCell({ day, period });
  }

  function confirmCell() {
    if (!activeCell) return;
    if (!draft.subjectId || !draft.teacherId) {
      setCellError("Mapel dan guru wajib dipilih.");
      return;
    }
    if (draft.end <= draft.start) {
      setCellError("Jam selesai harus setelah jam mulai.");
      return;
    }
    setCellError(null);
    const key = `${activeCell.day}:${activeCell.period}`;
    setGrid((current) => ({
      ...current,
      [key]: {
        subjectId: Number(draft.subjectId),
        teacherId: Number(draft.teacherId),
        start: draft.start,
        end: draft.end,
      },
    }));
    setActiveCell(null);
  }

  function clearCell() {
    if (!activeCell) return;
    const key = `${activeCell.day}:${activeCell.period}`;
    setGrid((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setActiveCell(null);
  }

  async function save() {
    if (!classId) {
      setErrors(["Kelas belum dipilih."]);
      return;
    }
    if (serializeGrid(grid) === serverSnapshot) {
      setToast({ message: "Tidak ada perubahan jadwal.", tone: "warning" });
      return;
    }
    if (saving) return;
    setSaving(true);
    setErrors([]);
    setApiConflicts([]);
    const entries: ScheduleBulkEntry[] = Object.entries(grid).map(([key, slot]) => {
      const [day, period] = key.split(":");
      return {
        subject_id: slot.subjectId,
        teacher_id: slot.teacherId,
        day_of_week: Number(day),
        period_number: Number(period),
        start_time: slot.start,
        end_time: slot.end,
      };
    });
    try {
      const saved = await bulkReplaceSchedules(Number(classId), entries);
      setServerSnapshot(serializeGrid(grid));
      setErrors([]);
      setApiConflicts([]);
      setToast({ message: `${saved.length} slot jadwal tersimpan`, tone: "success" });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setApiConflicts(extractConflicts(err));
        setToast({ message: "Konflik jadwal terdeteksi.", tone: "error" });
      } else {
        const detail = err instanceof ApiError ? err.detail : "Gagal menyimpan jadwal.";
        setToast({ message: detail, tone: "error" });
      }
    } finally {
      setSaving(false);
    }
  }

  function resetGrid() {
    setGrid({});
    setApiConflicts([]);
    setResetOpen(false);
    setErrors([]);
    setToast({ message: "Grid jadwal dikosongkan.", tone: "warning" });
  }

  const subjectName = (id: number) =>
    subjects.find((subject) => subject.id === id)?.name ?? "Mapel";
  const teacherName = (id: number) =>
    teachers.find((teacher) => teacher.id === id)?.full_name ?? "Guru";
  const selectedClass = classes.find((klass) => String(klass.id) === classId);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Konfigurasi Jadwal
          </h1>
          <p className="text-xs text-muted-foreground">
            Tata Usaha · susun jadwal mingguan per kelas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outlined"
            icon={RotateCcw}
            type="button"
            onClick={() => setResetOpen(true)}
            disabled={Object.keys(grid).length === 0}
          >
            Reset
          </Button>
          <Button
            icon={Save}
            type="button"
            onClick={save}
            loading={saving}
            disabled={step !== 3 || gridLoading}
          >
            Simpan Jadwal
          </Button>
        </div>
      </div>

      <ol className="flex flex-wrap items-center gap-2 text-xs">
        {["Pilih Kelas", "Mapel & Guru", "Susun Waktu"].map((label, index) => {
          const value = index + 1;
          const active = step === value;
          const done = step > value;
          return (
            <li key={label} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep(value)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex min-h-10 items-center gap-2 rounded-full border px-3 font-medium",
                  active
                    ? "border-primary bg-primary-container text-primary-container-foreground"
                    : "border-outline-variant text-muted-foreground hover:bg-surface-container"
                )}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-container-highest font-mono text-2xs tabular-nums">
                  {done ? <Check className="h-3 w-3" aria-hidden /> : value}
                </span>
                {label}
              </button>
              {value < 3 && <span className="h-px w-4 bg-outline-variant" aria-hidden />}
            </li>
          );
        })}
      </ol>

      {loadStatus === "error" ? (
        <EmptyState
          icon={AlertCircle}
          title="Gagal memuat data master"
          description="Tidak dapat memuat kelas, mapel, atau guru."
        />
      ) : step === 1 ? (
        <Card>
          <CardHeader className="border-b border-outline-variant pb-4">
            <CardTitle>Pilih Kelas</CardTitle>
          </CardHeader>
          <div className="max-w-md p-5">
            <FormField label="Kelas" htmlFor="jadwal-class" required>
              <select
                id="jadwal-class"
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
            <div className="mt-4 flex justify-end">
              <Button type="button" onClick={() => setStep(2)} disabled={!classId}>
                Lanjut
              </Button>
            </div>
          </div>
        </Card>
      ) : step === 2 ? (
        <Card>
          <CardHeader className="border-b border-outline-variant pb-4">
            <CardTitle>Mata Pelajaran & Guru</CardTitle>
            <Button variant="tonal" icon={Plus} type="button" onClick={addPoolEntry}>
              Tambah
            </Button>
          </CardHeader>
          {pool.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={CalendarDays}
                title="Belum ada mata pelajaran"
                description="Tambahkan kombinasi mapel dan guru untuk disusun pada langkah berikutnya."
                action={
                  <Button variant="tonal" icon={Plus} onClick={addPoolEntry}>
                    Tambah Mata Pelajaran
                  </Button>
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-outline-variant">
              {pool.map((entry, index) => (
                <li
                  key={index}
                  className="grid grid-cols-1 gap-3 px-5 py-3 sm:grid-cols-[1fr_1fr_auto]"
                >
                  <FormField label="Mata Pelajaran" htmlFor={`pool-subject-${index}`}>
                    <select
                      id={`pool-subject-${index}`}
                      value={entry.subjectId || ""}
                      onChange={(event) =>
                        updatePoolEntry(index, "subjectId", Number(event.target.value))
                      }
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
                  <FormField label="Guru" htmlFor={`pool-teacher-${index}`}>
                    <select
                      id={`pool-teacher-${index}`}
                      value={entry.teacherId || ""}
                      onChange={(event) =>
                        updatePoolEntry(index, "teacherId", Number(event.target.value))
                      }
                      className={inputClass}
                    >
                      <option value="">Pilih guru…</option>
                      {teachers.map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>
                          {teacher.full_name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <div className="flex items-end">
                    <Button
                      variant="text"
                      icon={Trash2}
                      type="button"
                      aria-label="Hapus baris"
                      onClick={() => removePoolEntry(index)}
                    >
                      Hapus
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-between border-t border-outline-variant px-5 py-4">
            <Button variant="outlined" type="button" onClick={() => setStep(1)}>
              Kembali
            </Button>
            <Button type="button" onClick={goToStep3}>
              Susun Waktu
            </Button>
          </div>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex-wrap items-center border-b border-outline-variant pb-3">
            <CardTitle>Grid Jadwal · {selectedClass?.name ?? "Kelas"}</CardTitle>
            <div className="flex items-center gap-2">
              {conflictCells.size > 0 && (
                <StatusChip tone="danger">{conflictCells.size} slot bentrok</StatusChip>
              )}
              <label className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                Filter guru
                <select
                  aria-label="Filter guru"
                  value={teacherFilter ?? ""}
                  onChange={(event) =>
                    setTeacherFilter(event.target.value ? Number(event.target.value) : null)
                  }
                  className={cn(inputClass, "min-h-8 py-0 text-2xs")}
                >
                  <option value="">Semua guru</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <span className="text-2xs text-muted-foreground">Klik sel untuk mengisi</span>
            </div>
          </CardHeader>

          {conflictCells.size > 0 && (
            <div
              role="alert"
              data-testid="conflict-banner"
              className="border-b border-destructive/40 bg-destructive-container px-5 py-3 text-xs text-destructive-container-foreground"
            >
              <p className="font-semibold">{conflictCells.size} jadwal bentrok</p>
              {apiConflicts.length > 0 && (
                <ul className="list-disc pl-5 text-2xs">
                  {apiConflicts.map((conflict, index) => (
                    <li key={`${conflict.schedule_id}-${conflict.type}-${index}`}>
                      {conflict.type} ·{" "}
                      {DAYS.find((day) => day.value === conflict.day_of_week)?.label ??
                        conflict.day_of_week}{" "}
                      {conflict.start_time.slice(0, 5)}–{conflict.end_time.slice(0, 5)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {errors.length > 0 && (
            <div
              role="alert"
              className="border-b border-destructive/40 bg-destructive-container px-5 py-2 text-xs text-destructive-container-foreground"
            >
              {errors.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}

          {gridLoading ? (
            <div className="p-4">
              <SkeletonTable rows={6} cols={7} />
            </div>
          ) : gridError ? (
            <div role="alert" className="flex flex-col items-start gap-3 p-5 text-sm">
              <p className="text-destructive">Gagal memuat jadwal. Coba lagi.</p>
              <Button
                variant="tonal"
                icon={RotateCcw}
                type="button"
                onClick={() => setGridKey((current) => current + 1)}
              >
                Coba lagi
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-xs">
                <thead className="bg-surface-container">
                  <tr>
                    <th
                      scope="col"
                      className="border-b border-outline-variant px-2 py-2 text-left font-semibold text-muted-foreground"
                    >
                      Jam
                    </th>
                    {DAYS.map((day) => (
                      <th
                        key={day.value}
                        scope="col"
                        className="border-b border-l border-outline-variant px-2 py-2 text-left font-semibold text-muted-foreground"
                      >
                        {day.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERIODS.map((period) => (
                    <tr key={period} className="border-b border-outline-variant">
                      <th
                        scope="row"
                        className="whitespace-nowrap px-2 py-2 text-left font-mono text-2xs font-medium tabular-nums text-muted-foreground"
                      >
                        {period}. {DEFAULT_PERIOD_TIMES[period]?.start}
                      </th>
                      {DAYS.map((day) => {
                        const key = `${day.value}:${period}`;
                        const slot = grid[key];
                        const conflict = conflictCells.has(key);
                        const dimmed =
                          teacherFilter !== null && slot && slot.teacherId !== teacherFilter;
                        return (
                          <td key={key} className="border-l border-outline-variant p-1 align-top">
                            <button
                              type="button"
                              onClick={() => openCell(day.value, period)}
                              aria-label={`${day.label} jam ke-${period}`}
                              data-conflict={conflict ? "true" : undefined}
                              className={cn(
                                "flex min-h-[52px] w-full flex-col items-start gap-0.5 rounded-sm border px-2 py-1.5 text-left transition-colors",
                                conflict
                                  ? "border-destructive bg-destructive-container text-destructive-container-foreground"
                                  : slot
                                    ? "border-outline-variant bg-primary-container text-primary-container-foreground"
                                    : "border-dashed border-outline-variant text-muted-foreground hover:bg-surface-container",
                                dimmed && "opacity-40"
                              )}
                            >
                              {slot ? (
                                <>
                                  <span className="text-2xs font-semibold">
                                    {subjectName(slot.subjectId)}
                                  </span>
                                  <span className="text-2xs">{teacherName(slot.teacherId)}</span>
                                  <span className="font-mono text-2xs tabular-nums">
                                    {slot.start}–{slot.end}
                                  </span>
                                </>
                              ) : (
                                <span className="text-2xs">+ kosong</span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-between border-t border-outline-variant px-5 py-4">
            <Button variant="outlined" type="button" onClick={() => setStep(2)}>
              Kembali
            </Button>
            <span className="self-center text-2xs text-muted-foreground">
              {Object.keys(grid).length} slot terisi
            </span>
          </div>
        </Card>
      )}

      <Dialog
        open={activeCell !== null}
        onClose={() => setActiveCell(null)}
        title={`Isi Slot · ${activeCell ? DAYS.find((d) => d.value === activeCell.day)?.label : ""} jam ${activeCell?.period ?? ""}`}
        actions={
          <>
            {activeCell && grid[`${activeCell.day}:${activeCell.period}`] && (
              <Button variant="text" type="button" onClick={clearCell}>
                Kosongkan
              </Button>
            )}
            <Button variant="outlined" type="button" onClick={() => setActiveCell(null)}>
              Batal
            </Button>
            <Button type="button" onClick={confirmCell}>
              Simpan Slot
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {cellError && (
            <p role="alert" className="text-xs text-destructive">
              {cellError}
            </p>
          )}
          <FormField label="Mata Pelajaran" htmlFor="cell-subject" required>
            <select
              id="cell-subject"
              value={draft.subjectId}
              onChange={(event) =>
                setDraft((current) => ({ ...current, subjectId: event.target.value }))
              }
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
          <FormField label="Guru" htmlFor="cell-teacher" required>
            <select
              id="cell-teacher"
              value={draft.teacherId}
              onChange={(event) =>
                setDraft((current) => ({ ...current, teacherId: event.target.value }))
              }
              className={inputClass}
            >
              <option value="">Pilih guru…</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.full_name}
                </option>
              ))}
            </select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Mulai" htmlFor="cell-start" required>
              <input
                id="cell-start"
                type="time"
                value={draft.start}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, start: event.target.value }))
                }
                className={inputClass}
              />
            </FormField>
            <FormField label="Selesai" htmlFor="cell-end" required>
              <input
                id="cell-end"
                type="time"
                value={draft.end}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, end: event.target.value }))
                }
                className={inputClass}
              />
            </FormField>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset grid jadwal?"
        description="Semua slot yang belum disimpan akan dihapus dari grid."
        actions={
          <>
            <Button variant="outlined" onClick={() => setResetOpen(false)}>
              Batal
            </Button>
            <Button variant="destructive" onClick={resetGrid}>
              Reset
            </Button>
          </>
        }
      />

      <ToastViewport>
        {toast && (
          <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />
        )}
      </ToastViewport>
    </div>
  );
}

export default function JadwalConfigPage() {
  return (
    <DashboardShell role="admin" allow={["principal"]} title="Konfigurasi Jadwal">
      {() => <JadwalConfigContent />}
    </DashboardShell>
  );
}
