"use client";

import * as React from "react";
import {
  AlertCircle,
  AlertTriangle,
  CalendarCheck,
  Check,
  RotateCcw,
  Save,
  Users,
  X,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Card, CardHeader } from "@/components/ui/Card";
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
  fetchAttendanceRoster,
  fetchClasses,
  fetchStudents,
  getTeacherSchedule,
  type AttendanceRow,
  type AttendanceStatus,
  type ClassRecord,
} from "@/lib/endpoints";
import type { UserMe } from "@/lib/auth";
import { ApiError } from "@/lib/api";

type LoadStatus = "idle" | "loading" | "ready" | "error";

interface Edit {
  status: AttendanceStatus;
  note: string;
}

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

function studentName(row: AttendanceRow): string {
  return row.student?.full_name ?? `Siswa #${row.student_id}`;
}

function AbsensiContent({ me }: { me: UserMe }) {
  const today = React.useMemo(todayIso, []);
  const [classes, setClasses] = React.useState<ClassRecord[]>([]);
  const [classId, setClassId] = React.useState("");
  const [date, setDate] = React.useState(today);
  const [rows, setRows] = React.useState<AttendanceRow[]>([]);
  const [edits, setEdits] = React.useState<Record<number, Edit>>({});
  const [status, setStatus] = React.useState<LoadStatus>("idle");
  const [reloadKey, setReloadKey] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<{ classId?: string; date?: string }>({});
  const [editWindow, setEditWindow] = React.useState<{ editable: boolean; reason?: string }>({
    editable: true,
  });
  const [noticeDismissed, setNoticeDismissed] = React.useState(false);
  const [toast, setToast] = React.useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);
  const rowRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const classSelectRef = React.useRef<HTMLSelectElement>(null);

  function statusOf(row: AttendanceRow): AttendanceStatus {
    return edits[row.student_id]?.status ?? row.status;
  }

  function noteOf(row: AttendanceRow): string {
    return edits[row.student_id]?.note ?? row.note ?? "";
  }

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
      fetchAttendanceRoster({ class_id: numericClass, date }),
    ])
      .then(([students, records]) => {
        if (!active) return;
        const byId = new Map(students.map((student) => [student.id, student]));
        const next: AttendanceRow[] = records.map((record) => {
          const student = record.student ?? byId.get(record.student_id);
          return student
            ? {
                ...record,
                student: {
                  id: student.id,
                  full_name: student.full_name,
                  nis: student.nis,
                },
              }
            : record;
        });
        for (const student of students) {
          if (!next.some((row) => row.student_id === student.id)) {
            next.push({
              id: 0,
              student_id: student.id,
              class_id: numericClass,
              date,
              status: "hadir",
              note: null,
              recorded_by: me.user.id,
              student: { id: student.id, full_name: student.full_name, nis: student.nis },
            });
          }
        }
        setRows(next);
        setEdits({});
        setEditWindow({ editable: true });
        setNoticeDismissed(false);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [classId, date, reloadKey, me.user.id]);

  function applyEdit(studentId: number, next: Partial<Edit>) {
    setEdits((current) => {
      const row = rows.find((item) => item.student_id === studentId);
      if (!row) return current;
      const baseNote = row.note ?? "";
      const draftStatus = next.status ?? current[studentId]?.status ?? row.status;
      const draftNote = next.note ?? current[studentId]?.note ?? baseNote;
      if (draftStatus === row.status && draftNote === baseNote) {
        const { [studentId]: _removed, ...rest } = current;
        return rest;
      }
      return { ...current, [studentId]: { status: draftStatus, note: draftNote } };
    });
  }

  function setStudentStatus(studentId: number, next: AttendanceStatus) {
    applyEdit(studentId, { status: next });
  }

  function setStudentNote(studentId: number, note: string) {
    applyEdit(studentId, { note });
  }

  function handleRowKeyDown(index: number, event: React.KeyboardEvent) {
    const mapped = KEY_TO_STATUS[event.key.toLowerCase()];
    if (!mapped) return;
    event.preventDefault();
    const row = rows[index];
    if (!row) return;
    setStudentStatus(row.student_id, mapped);
    const nextRow = rowRefs.current[index + 1];
    nextRow?.focus();
  }

  function markAllPresent() {
    setEdits((current) => {
      const next = { ...current };
      for (const row of rows) {
        const baseNote = row.note ?? "";
        const draftNote = current[row.student_id]?.note ?? baseNote;
        if (row.status === "hadir" && draftNote === baseNote) {
          delete next[row.student_id];
        } else {
          next[row.student_id] = { status: "hadir", note: draftNote };
        }
      }
      return next;
    });
  }

  function resetForm() {
    setEdits({});
  }

  function classRefFocus() {
    classSelectRef.current?.focus();
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
    if (nextErrors.date || saving || !editWindow.editable) return;

    const entries = Object.entries(edits).map(([studentId, change]) => ({
      student_id: Number(studentId),
      status: change.status,
      note: change.note.trim() ? change.note : null,
    }));
    if (entries.length === 0) return;

    setSaving(true);
    try {
      await bulkSaveAttendances({ class_id: Number(classId), date, entries });
      const fresh = await fetchAttendanceRoster({ class_id: Number(classId), date });
      setRows(fresh);
      setEdits({});
      setToast({ message: `Absensi ${entries.length} siswa disimpan`, tone: "success" });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setEditWindow({ editable: false, reason: err.detail });
        setNoticeDismissed(false);
        return;
      }
      const detail = err instanceof ApiError ? err.detail : "Gagal menyimpan absensi.";
      setToast({ message: detail, tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  const columns: Column<AttendanceRow>[] = [
    {
      key: "full_name",
      header: "Nama Siswa",
      cell: (row) => {
        const index = rows.indexOf(row);
        return (
          <div
            ref={(node) => {
              rowRefs.current[index] = node;
            }}
            tabIndex={0}
            onKeyDown={(event) => handleRowKeyDown(index, event)}
            role="button"
            aria-label={`${studentName(row)}, fokus dan tekan H/I/S/A`}
            className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <p className="text-sm font-medium text-foreground">{studentName(row)}</p>
            <p className="font-mono text-2xs tabular-nums text-muted-foreground">
              {row.student?.nis}
            </p>
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <SegmentedButton
          aria-label={`Status ${studentName(row)}`}
          options={STATUS_OPTIONS}
          value={statusOf(row)}
          onChange={(value) => setStudentStatus(row.student_id, value)}
          showCheck={false}
          className="[&>button]:min-h-[32px] [&>button]:px-3 [&>button]:text-xs"
        />
      ),
    },
    {
      key: "note",
      header: "Catatan",
      cell: (row) => (
        <input
          type="text"
          value={noteOf(row)}
          onChange={(event) => setStudentNote(row.student_id, event.target.value)}
          placeholder={statusOf(row) === "hadir" ? "—" : "Keterangan opsional"}
          aria-label={`Catatan ${studentName(row)}`}
          className={cn(inputClass, "min-h-[32px] w-full min-w-[12rem] px-2 text-xs")}
        />
      ),
    },
  ];

  const presentCount = ATTENDANCE_STATUSES.map((value) => ({
    value,
    count: rows.filter((row) => statusOf(row) === value).length,
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
            disabled={status !== "ready" || rows.length === 0}
          >
            Reset
          </Button>
          <Button
            icon={Save}
            type="button"
            onClick={save}
            loading={saving}
            disabled={status !== "ready" || rows.length === 0 || !editWindow.editable}
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
              disabled={rows.length === 0}
            >
              Hadir Semua
            </Button>
          </div>
        </CardHeader>

        <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant px-5 py-2.5">
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="font-mono text-2xs tabular-nums text-muted-foreground">
            {rows.length} siswa
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
          <span className="ml-auto hidden text-2xs text-muted-foreground sm:block">
            Fokus baris lalu tekan{" "}
            <kbd className="rounded-xs border border-outline px-1 font-mono">H</kbd>{" "}
            <kbd className="rounded-xs border border-outline px-1 font-mono">I</kbd>{" "}
            <kbd className="rounded-xs border border-outline px-1 font-mono">S</kbd>{" "}
            <kbd className="rounded-xs border border-outline px-1 font-mono">A</kbd>
          </span>
        </div>

        {!editWindow.editable && !noticeDismissed && (
          <div
            role="alert"
            className="flex items-start gap-2 border-b border-warning bg-warning-container px-5 py-3 text-sm text-warning"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p className="flex-1">
              {editWindow.reason ?? "Periode koreksi sudah berakhir. Absensi tidak dapat diubah."}
            </p>
            <button
              type="button"
              aria-label="Tutup pemberitahuan"
              onClick={() => setNoticeDismissed(true)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-surface-container-high"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}

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
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Users}
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

export default function AbsensiPage() {
  return (
    <DashboardShell role="teacher" title="Absensi">
      {(me) => <AbsensiContent me={me} />}
    </DashboardShell>
  );
}
