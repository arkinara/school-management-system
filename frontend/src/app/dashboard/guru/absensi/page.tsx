"use client";

import * as React from "react";
import { AlertCircle, CalendarCheck, Check, RotateCcw, Save, Users } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, inputClass } from "@/components/ui/FormField";
import { SegmentedButton } from "@/components/ui/SegmentedButton";
import { StatusChip } from "@/components/ui/StatusChip";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { Table, type Column } from "@/components/ui/Table";
import { Toast, ToastViewport } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import {
  ATTENDANCE_STATUSES,
  bulkSaveAttendances,
  fetchAll,
  fetchAttendances,
  fetchClasses,
  fetchStudents,
  getTeacherSchedule,
  updateAttendance,
  type AttendanceRecord,
  type AttendanceStatus,
  type ClassRecord,
  type StudentRecord,
} from "@/lib/endpoints";
import type { UserMe } from "@/lib/auth";
import { ApiError } from "@/lib/api";

type LoadStatus = "idle" | "loading" | "ready" | "error";

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  hadir: "Hadir",
  izin: "Izin",
  sakit: "Sakit",
  alpa: "Alpa",
};

const KEY_TO_STATUS: Record<string, AttendanceStatus> = {
  h: "hadir",
  i: "izin",
  s: "sakit",
  a: "alpa",
};

const STATUS_OPTIONS = ATTENDANCE_STATUSES.map((value) => ({
  value,
  label: STATUS_LABEL[value],
}));

function todayIso(): string {
  const now = new Date();
  const tz = now.getTimezoneOffset();
  return new Date(now.getTime() - tz * 60_000).toISOString().slice(0, 10);
}

function AbsensiContent({ me }: { me: UserMe }) {
  const today = React.useMemo(todayIso, []);
  const [classes, setClasses] = React.useState<ClassRecord[]>([]);
  const [classId, setClassId] = React.useState("");
  const [date, setDate] = React.useState(today);
  const [roster, setRoster] = React.useState<StudentRecord[]>([]);
  const [statusMap, setStatusMap] = React.useState<Record<number, AttendanceStatus>>({});
  const [noteMap, setNoteMap] = React.useState<Record<number, string>>({});
  const [existing, setExisting] = React.useState<Record<number, AttendanceRecord>>({});
  const [status, setStatus] = React.useState<LoadStatus>("idle");
  const [reloadKey, setReloadKey] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<{ classId?: string; date?: string }>({});
  const [toast, setToast] = React.useState<{
    message: string;
    tone: "success" | "error";
    undo?: () => void;
  } | null>(null);
  const rowRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const classSelectRef = React.useRef<HTMLSelectElement>(null);
  const savedSnapshot = React.useRef<{
    statusMap: Record<number, AttendanceStatus>;
    noteMap: Record<number, string>;
  } | null>(null);

  React.useEffect(() => {
    let active = true;
    Promise.all([
      fetchClasses({ size: 100 }),
      me.role === "teacher" ? getTeacherSchedule(me.user.id).catch(() => []) : Promise.resolve([]),
    ])
      .then(([res, schedule]) => {
        if (!active) return;
        const taught = new Set(schedule.map((row) => row.class_id));
        const list =
          me.role === "teacher"
            ? res.items.filter(
                (klass) => klass.wali_kelas_id === me.user.id || taught.has(klass.id)
              )
            : res.items;
        setClasses(list);
        if (list.length > 0) setClassId(String(list[0].id));
      })
      .catch(() => {
        if (active) setToast({ message: "Gagal memuat daftar kelas.", tone: "error" });
      });
    return () => {
      active = false;
    };
  }, [me.role, me.user.id]);

  React.useEffect(() => {
    if (!classId) return;
    let active = true;
    setStatus("loading");
    const numericClass = Number(classId);
    Promise.all([
      fetchAll((p) => fetchStudents({ class_id: numericClass, ...p })),
      fetchAll((p) => fetchAttendances({ class_id: numericClass, date, ...p })),
    ])
      .then(([students, records]) => {
        if (!active) return;
        setRoster(students);
        const nextStatus: Record<number, AttendanceStatus> = {};
        const nextNote: Record<number, string> = {};
        const byStudent: Record<number, AttendanceRecord> = {};
        for (const student of students) {
          nextStatus[student.id] = "hadir";
          nextNote[student.id] = "";
        }
        for (const record of records) {
          byStudent[record.student_id] = record;
          nextStatus[record.student_id] = record.status;
          nextNote[record.student_id] = record.note ?? "";
        }
        setStatusMap(nextStatus);
        setNoteMap(nextNote);
        setExisting(byStudent);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [classId, date, reloadKey]);

  function setStudentStatus(studentId: number, next: AttendanceStatus) {
    setStatusMap((current) => ({ ...current, [studentId]: next }));
  }

  function handleRowKeyDown(index: number, event: React.KeyboardEvent) {
    const mapped = KEY_TO_STATUS[event.key.toLowerCase()];
    if (!mapped) return;
    event.preventDefault();
    const student = roster[index];
    if (!student) return;
    setStudentStatus(student.id, mapped);
    const nextRow = rowRefs.current[index + 1];
    nextRow?.focus();
  }

  function markAllPresent() {
    const next: Record<number, AttendanceStatus> = {};
    for (const student of roster) next[student.id] = "hadir";
    setStatusMap(next);
  }

  function resetForm() {
    setStatusMap((current) => {
      const next = { ...current };
      for (const student of roster) next[student.id] = "hadir";
      return next;
    });
    setNoteMap({});
  }

  async function save() {
    const nextErrors: { classId?: string; date?: string } = {};
    if (!classId) nextErrors.classId = "Pilih kelas terlebih dahulu.";
    if (!date) nextErrors.date = "Tanggal wajib diisi.";
    setErrors(nextErrors);
    if (nextErrors.classId) {
      classRefFocus();
      return;
    }
    if (nextErrors.date || saving) return;

    setSaving(true);
    savedSnapshot.current = { statusMap, noteMap };
    const entries = roster.map((student) => ({
      student_id: student.id,
      status: statusMap[student.id] ?? "hadir",
      note: noteMap[student.id]?.trim() ? noteMap[student.id] : null,
    }));
    try {
      if (Object.keys(existing).length > 0) {
        const changed = roster.filter((student) => {
          const record = existing[student.id];
          if (!record) return true;
          return (
            record.status !== (statusMap[student.id] ?? "hadir") ||
            (record.note ?? "") !== (noteMap[student.id] ?? "")
          );
        });
        const known = changed.filter((student) => existing[student.id]);
        const missing = changed.filter((student) => !existing[student.id]);
        await Promise.all([
          ...known.map((student) =>
            updateAttendance(existing[student.id].id, {
              status: statusMap[student.id] ?? "hadir",
              note: noteMap[student.id]?.trim() ? noteMap[student.id] : null,
            })
          ),
          ...(missing.length > 0
            ? [
                bulkSaveAttendances({
                  class_id: Number(classId),
                  date,
                  entries: missing.map((student) => ({
                    student_id: student.id,
                    status: statusMap[student.id] ?? "hadir",
                    note: noteMap[student.id]?.trim() ? noteMap[student.id] : null,
                  })),
                }),
              ]
            : []),
        ]);
      } else {
        await bulkSaveAttendances({ class_id: Number(classId), date, entries });
      }
      const count = roster.length;
      setToast({
        message: `Absensi ${count} siswa disimpan`,
        tone: "success",
        undo: undoLastSave,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setToast({
          message: "Sebagian absensi sudah tercatat. Muat ulang kelas lalu ulangi koreksi.",
          tone: "error",
        });
      } else {
        const detail = err instanceof ApiError ? err.detail : "Gagal menyimpan absensi.";
        setToast({ message: detail, tone: "error" });
      }
    } finally {
      setSaving(false);
    }
  }

  function undoLastSave() {
    const snapshot = savedSnapshot.current;
    if (snapshot) {
      setStatusMap(snapshot.statusMap);
      setNoteMap(snapshot.noteMap);
    }
    setToast({ message: "Perubahan dibatalkan", tone: "success" });
  }

  function classRefFocus() {
    classSelectRef.current?.focus();
  }

  const editedAfterSubmissionDay = React.useMemo(() => {
    const records = Object.values(existing);
    return records.length > 0 && records.some((record) => record.date !== today);
  }, [existing, today]);

  const columns: Column<StudentRecord>[] = [
    {
      key: "full_name",
      header: "Nama Siswa",
      cell: (student) => {
        const index = roster.indexOf(student);
        return (
          <div
            ref={(node) => {
              rowRefs.current[index] = node;
            }}
            tabIndex={0}
            onKeyDown={(event) => handleRowKeyDown(index, event)}
            role="button"
            aria-label={`${student.full_name ?? "Siswa"}, fokus dan tekan H/I/S/A`}
            className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <p className="text-sm font-medium text-foreground">
              {student.full_name ?? `Siswa #${student.id}`}
            </p>
            <p className="font-mono text-2xs tabular-nums text-muted-foreground">{student.nis}</p>
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (student) => (
        <SegmentedButton
          aria-label={`Status ${student.full_name ?? student.nis}`}
          options={STATUS_OPTIONS}
          value={statusMap[student.id] ?? "hadir"}
          onChange={(value) => setStudentStatus(student.id, value)}
          showCheck={false}
          className="[&>button]:min-h-[32px] [&>button]:px-3 [&>button]:text-xs"
        />
      ),
    },
    {
      key: "note",
      header: "Catatan",
      cell: (student) => (
        <input
          type="text"
          value={noteMap[student.id] ?? ""}
          onChange={(event) =>
            setNoteMap((current) => ({
              ...current,
              [student.id]: event.target.value,
            }))
          }
          placeholder={(statusMap[student.id] ?? "hadir") === "hadir" ? "—" : "Keterangan opsional"}
          aria-label={`Catatan ${student.full_name ?? student.nis}`}
          className={cn(inputClass, "min-h-[32px] w-full min-w-[12rem] px-2 text-xs")}
        />
      ),
    },
    {
      key: "flag",
      header: "",
      align: "right",
      cell: (student) =>
        editedAfterSubmissionDay && existing[student.id] ? (
          <StatusChip tone="warning">diedit setelah hari H</StatusChip>
        ) : null,
    },
  ];

  const presentCount = ATTENDANCE_STATUSES.map((value) => ({
    value,
    count: Object.values(statusMap).filter((s) => s === value).length,
  }));

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Input Absensi</h1>
          <p className="text-xs text-muted-foreground">
            Guru · tandai kehadiran per kelas dan tanggal
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outlined"
            icon={RotateCcw}
            type="button"
            onClick={resetForm}
            disabled={status !== "ready" || roster.length === 0}
          >
            Reset
          </Button>
          <Button
            icon={Save}
            type="button"
            onClick={save}
            loading={saving}
            disabled={status !== "ready" || roster.length === 0}
          >
            Simpan Absensi
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-wrap items-end gap-3 border-b border-outline-variant pb-4">
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:w-auto lg:grid-cols-2">
            <FormField label="Kelas" htmlFor="absensi-class" required error={errors.classId}>
              <select
                id="absensi-class"
                ref={classSelectRef}
                value={classId}
                onChange={(event) => {
                  setClassId(event.target.value);
                  setErrors((current) => ({ ...current, classId: undefined }));
                }}
                aria-invalid={Boolean(errors.classId)}
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
            <FormField label="Tanggal" htmlFor="absensi-date" required error={errors.date}>
              <input
                id="absensi-date"
                type="date"
                value={date}
                max={today}
                onChange={(event) => {
                  setDate(event.target.value);
                  setErrors((current) => ({ ...current, date: undefined }));
                }}
                aria-invalid={Boolean(errors.date)}
                className={inputClass}
              />
            </FormField>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="tonal"
              icon={Check}
              type="button"
              onClick={markAllPresent}
              disabled={roster.length === 0}
            >
              Hadir Semua
            </Button>
          </div>
        </CardHeader>

        <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant px-5 py-2.5">
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="font-mono text-2xs tabular-nums text-muted-foreground">
            {roster.length} siswa
          </span>
          {presentCount.map((item) => (
            <StatusChip
              key={item.value}
              tone={
                item.value === "hadir"
                  ? "success"
                  : item.value === "izin"
                    ? "info"
                    : item.value === "sakit"
                      ? "warning"
                      : "danger"
              }
            >
              {STATUS_LABEL[item.value]} {item.count}
            </StatusChip>
          ))}
          {editedAfterSubmissionDay && (
            <StatusChip tone="warning">mode koreksi · edit setelah hari H</StatusChip>
          )}
          <span className="ml-auto hidden text-2xs text-muted-foreground sm:block">
            Fokus baris lalu tekan{" "}
            <kbd className="rounded-xs border border-outline px-1 font-mono">H</kbd>{" "}
            <kbd className="rounded-xs border border-outline px-1 font-mono">I</kbd>{" "}
            <kbd className="rounded-xs border border-outline px-1 font-mono">S</kbd>{" "}
            <kbd className="rounded-xs border border-outline px-1 font-mono">A</kbd>
          </span>
        </div>

        {status === "loading" ? (
          <div className="p-4">
            <SkeletonTable rows={6} cols={4} />
          </div>
        ) : status === "error" ? (
          <div className="p-4">
            <EmptyState
              icon={AlertCircle}
              title="Gagal memuat absensi"
              description="Tidak dapat mengambil data kelas. Periksa koneksi lalu coba lagi."
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
        ) : !classId ? (
          <div className="p-4">
            <EmptyState
              icon={CalendarCheck}
              title="Pilih kelas untuk mulai"
              description="Pilih kelas dan tanggal untuk memuat daftar siswa."
            />
          </div>
        ) : roster.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Users}
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
          <Toast
            message={toast.message}
            tone={toast.tone}
            action={toast.undo ? { label: "Undo", onClick: toast.undo } : undefined}
            onDismiss={() => setToast(null)}
          />
        )}
      </ToastViewport>
    </div>
  );
}

export default function AbsensiPage() {
  return (
    <DashboardShell role="teacher" title="Absensi">
      {(me) => <AbsensiContent me={me} />}
    </DashboardShell>
  );
}
