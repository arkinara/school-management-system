"use client";

import * as React from "react";
import { CalendarDays, RotateCcw } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, inputClass } from "@/components/ui/FormField";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import {
  fetchParentChildren,
  getClassScheduleByRelationship,
  type ChildSummary,
  type ScheduleRecord,
} from "@/lib/endpoints";
import { DAYS_OF_WEEK } from "@/lib/days";
import type { UserMe } from "@/lib/auth";

type LoadStatus = "loading" | "ready" | "error";

const DAYS = DAYS_OF_WEEK;
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

function timeRange(record: ScheduleRecord): string {
  return `${record.start_time.slice(0, 5)}–${record.end_time.slice(0, 5)}`;
}

function OrangTuaJadwalContent({ me }: { me: UserMe }) {
  const [children, setChildren] = React.useState<ChildSummary[]>([]);
  const [childrenStatus, setChildrenStatus] = React.useState<LoadStatus>("loading");
  const [selectedStudentId, setSelectedStudentId] = React.useState<number | null>(null);
  const [schedules, setSchedules] = React.useState<ScheduleRecord[]>([]);
  const [status, setStatus] = React.useState<LoadStatus>("loading");
  const [reloadKey, setReloadKey] = React.useState(0);
  const initialisedRef = React.useRef(false);

  // Deep link support: ?page=jadwal&student=N (from the dashboard shortcut).
  React.useEffect(() => {
    if (initialisedRef.current) return;
    initialisedRef.current = true;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("page") !== "jadwal") return;
    const raw = params.get("student");
    const studentId = Number(raw ?? 0);
    if (raw && Number.isFinite(studentId) && studentId > 0) {
      setSelectedStudentId(studentId);
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    setChildrenStatus("loading");
    fetchParentChildren(me.user.id)
      .then((kids) => {
        if (!active) return;
        setChildren(kids);
        setSelectedStudentId((prev) => prev ?? kids[0]?.id ?? null);
        setChildrenStatus("ready");
      })
      .catch(() => {
        if (active) setChildrenStatus("error");
      });
    return () => {
      active = false;
    };
  }, [me.user.id]);

  const selectedChild = children.find((child) => child.id === selectedStudentId);
  const classId = selectedChild?.class_id ?? null;

  React.useEffect(() => {
    if (selectedStudentId === null) return;
    if (classId === null) {
      setSchedules([]);
      setStatus("ready");
      return;
    }
    let active = true;
    setStatus("loading");
    getClassScheduleByRelationship(classId)
      .then((records) => {
        if (!active) return;
        setSchedules(records);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [selectedStudentId, classId, reloadKey]);

  const byCell = React.useMemo(() => {
    const map = new Map<string, ScheduleRecord>();
    for (const record of schedules) {
      map.set(`${record.day_of_week}:${record.period_number}`, record);
    }
    return map;
  }, [schedules]);

  if (childrenStatus === "loading") {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
        <SkeletonTable rows={6} cols={7} />
      </div>
    );
  }

  if (childrenStatus === "error") {
    return (
      <div role="alert" className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-4">
        <p className="text-destructive">Gagal memuat data anak. Coba lagi.</p>
        <Button variant="tonal" icon={RotateCcw} onClick={() => window.location.reload()}>
          Coba lagi
        </Button>
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <EmptyState
          icon={CalendarDays}
          title="Belum ada data anak yang terhubung"
          description="Akun Anda belum terhubung ke data siswa. Hubungi tata usaha sekolah untuk menautkan anak Anda."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Jadwal Anak</h1>
        <p className="text-xs text-muted-foreground">Orang Tua · jadwal pelajaran kelas anak</p>
      </div>

      <div className="max-w-sm">
        <FormField label="Pilih anak" htmlFor="orang-tua-anak" required>
          <select
            id="orang-tua-anak"
            aria-label="Pilih anak"
            value={selectedStudentId ?? ""}
            onChange={(event) => setSelectedStudentId(Number(event.target.value) || null)}
            className={inputClass}
          >
            <option value="">Pilih anak…</option>
            {children.map((child) => (
              <option key={child.id} value={child.id}>
                {child.full_name}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      {selectedStudentId === null ? (
        <EmptyState
          icon={CalendarDays}
          title="Pilih anak terlebih dahulu"
          description="Pilih salah satu anak untuk melihat jadwal kelasnya."
        />
      ) : status === "error" ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 bg-destructive-container p-4 text-sm text-destructive-container-foreground"
        >
          <p className="font-medium">Gagal memuat jadwal. Coba lagi.</p>
          <Button
            variant="tonal"
            icon={RotateCcw}
            onClick={() => setReloadKey((current) => current + 1)}
          >
            Coba lagi
          </Button>
        </div>
      ) : status === "loading" ? (
        <Card>
          <CardHeader className="border-b border-outline-variant pb-3">
            <CardTitle>Memuat jadwal…</CardTitle>
          </CardHeader>
          <div className="p-4">
            <SkeletonTable rows={6} cols={7} />
          </div>
        </Card>
      ) : classId === null ? (
        <EmptyState
          icon={CalendarDays}
          title="Kelas belum ditentukan"
          description={`${selectedChild?.full_name ?? "Anak"} belum memiliki kelas pada tahun ajaran ini.`}
        />
      ) : schedules.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Belum ada jadwal"
          description="Jadwal kelas belum disusun oleh tata usaha."
        />
      ) : (
        <Card>
          <CardHeader className="border-b border-outline-variant pb-3">
            <CardTitle>Jadwal Mingguan · {selectedChild?.full_name ?? "Anak"}</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table
              aria-label="Jadwal mingguan anak"
              className="w-full min-w-[860px] border-collapse text-xs"
            >
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
                      {day.long}
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
                      {period}
                    </th>
                    {DAYS.map((day) => {
                      const record = byCell.get(`${day.value}:${period}`);
                      return (
                        <td
                          key={`${day.value}:${period}`}
                          className="border-l border-outline-variant p-1 align-top"
                        >
                          {record ? (
                            <div className="flex min-h-[52px] flex-col items-start gap-0.5 rounded-sm border border-outline-variant bg-primary-container px-2 py-1.5 text-primary-container-foreground">
                              <span className="text-2xs font-semibold">
                                Mapel {record.subject_id}
                              </span>
                              <span className="text-2xs">Guru {record.teacher_id}</span>
                              <span className="font-mono text-2xs tabular-nums">
                                {timeRange(record)}
                              </span>
                            </div>
                          ) : (
                            <div
                              className={cn(
                                "min-h-[52px] rounded-sm border border-dashed border-outline-variant"
                              )}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export default function OrangTuaJadwalPage() {
  return (
    <DashboardShell role="parent" title="Jadwal Anak">
      {(me) => <OrangTuaJadwalContent me={me} />}
    </DashboardShell>
  );
}
