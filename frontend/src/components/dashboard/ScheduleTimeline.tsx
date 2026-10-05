"use client";

import * as React from "react";
import {
  AlertCircle,
  CalendarDays,
  LogIn,
  RotateCcw,
} from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedButton } from "@/components/ui/SegmentedButton";
import { SkeletonList } from "@/components/ui/Skeleton";
import { StatusChip } from "@/components/ui/StatusChip";
import { Toast, ToastViewport } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import {
  fetchClasses,
  fetchStudents,
  fetchSubjects,
  fetchUsers,
  getSchedule,
  getTeacherSchedule,
  indonesianDayName,
  type ScheduleRecord,
} from "@/lib/endpoints";
import type { UserMe } from "@/lib/auth";

type LoadStatus = "loading" | "ready" | "error";
type View = "today" | "week";

const DAY_ORDER = ["senin", "selasa", "rabu", "kamis", "jumat", "sabtu", "minggu"];
const DAY_LABEL: Record<string, string> = {
  senin: "Senin",
  selasa: "Selasa",
  rabu: "Rabu",
  kamis: "Kamis",
  jumat: "Jumat",
  sabtu: "Sabtu",
  minggu: "Minggu",
};

function timeRange(record: ScheduleRecord): string {
  return `${record.start_time.slice(0, 5)}–${record.end_time.slice(0, 5)}`;
}

function sortSessions(records: ScheduleRecord[]): ScheduleRecord[] {
  return [...records].sort((a, b) => {
    const dayDiff =
      DAY_ORDER.indexOf(a.day_of_week.toLowerCase()) -
      DAY_ORDER.indexOf(b.day_of_week.toLowerCase());
    if (dayDiff !== 0) return dayDiff;
    return a.period_number - b.period_number;
  });
}

export interface ScheduleTimelineProps {
  me: UserMe;
  audience: "teacher" | "student";
}

export function ScheduleTimeline({ me, audience }: ScheduleTimelineProps) {
  const [view, setView] = React.useState<View>("today");
  const [sessions, setSessions] = React.useState<ScheduleRecord[]>([]);
  const [subjectNames, setSubjectNames] = React.useState<Record<number, string>>({});
  const [classNames, setClassNames] = React.useState<Record<number, string>>({});
  const [teacherNames, setTeacherNames] = React.useState<Record<number, string>>({});
  const [className, setClassName] = React.useState<string>("");
  const [status, setStatus] = React.useState<LoadStatus>("loading");
  const [reloadKey, setReloadKey] = React.useState(0);
  const [toast, setToast] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    setStatus("loading");

    const lookups = Promise.all([
      fetchSubjects({ size: 200 }).catch(() => ({ items: [] })),
      fetchClasses({ size: 100 }).catch(() => ({ items: [] })),
      fetchUsers({ role: "teacher", size: 200 }).catch(() => ({ items: [] })),
    ]);

    const schedulePromise: Promise<{
      records: ScheduleRecord[];
      label: string;
    }> =
      audience === "teacher"
        ? getTeacherSchedule(me.user.id).then((records) => ({
            records,
            label: "",
          }))
        : fetchStudents({ size: 1 }).then((page) => {
            const own = page.items[0];
            const classId = own?.class_id ?? null;
            if (classId === null) {
              return { records: [] as ScheduleRecord[], label: "" };
            }
            return fetchClasses({ size: 100 }).then((classes) => {
              const klass = classes.items.find((item) => item.id === classId);
              return getSchedule(classId).then((records) => ({
                records,
                label: klass?.name ?? `Kelas ${classId}`,
              }));
            });
          });

    Promise.all([lookups, schedulePromise])
      .then(([lookupResult, scheduleResult]) => {
        if (!active) return;
        const [subjectPage, classPage, userPage] = lookupResult;
        setSubjectNames(
          Object.fromEntries(subjectPage.items.map((s) => [s.id, s.name]))
        );
        setClassNames(
          Object.fromEntries(classPage.items.map((c) => [c.id, c.name]))
        );
        setTeacherNames(
          Object.fromEntries(userPage.items.map((u) => [u.id, u.full_name]))
        );
        setSessions(sortSessions(scheduleResult.records));
        setClassName(scheduleResult.label);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });

    return () => {
      active = false;
    };
  }, [audience, me.user.id, reloadKey]);

  const todayName = indonesianDayName(new Date());
  const todaySessions = sessions.filter(
    (record) => record.day_of_week.toLowerCase() === todayName
  );

  const grouped = React.useMemo(() => {
    const groups = new Map<string, ScheduleRecord[]>();
    for (const record of sessions) {
      const day = record.day_of_week.toLowerCase();
      const list = groups.get(day) ?? [];
      list.push(record);
      groups.set(day, list);
    }
    return DAY_ORDER.filter((day) => groups.has(day)).map((day) => ({
      day,
      records: groups.get(day) ?? [],
    }));
  }, [sessions]);

  function renderRow(record: ScheduleRecord, index: number) {
    return (
      <li
        key={record.id}
        className="flex flex-wrap items-center gap-3 px-5 py-3"
      >
        <span className="w-20 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {timeRange(record)}
        </span>
        <span
          className={cn(
            "h-9 w-1 shrink-0 rounded-full",
            index % 2 === 0 ? "bg-primary" : "bg-accent"
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {subjectNames[record.subject_id] ?? `Mapel #${record.subject_id}`}
          </p>
          <p className="truncate text-2xs text-muted-foreground">
            {audience === "teacher"
              ? classNames[record.class_id] ?? `Kelas #${record.class_id}`
              : teacherNames[record.teacher_id] ??
                `Guru #${record.teacher_id}`}
            {" · "}
            jam ke-{record.period_number}
          </p>
        </div>
        <Button
          variant="outlined"
          icon={LogIn}
          type="button"
          onClick={() =>
            setToast("Fitur masuk kelas akan tersedia pada rilis berikutnya.")
          }
        >
          Masuk Kelas
        </Button>
      </li>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Jadwal
          </h1>
          <p className="text-xs text-muted-foreground">
            {audience === "teacher" ? "Guru" : "Siswa"}
            {className ? ` · ${className}` : ""}
          </p>
        </div>
        <SegmentedButton
          aria-label="Rentang jadwal"
          options={[
            { value: "today", label: "Hari Ini" },
            { value: "week", label: "Pekan Ini" },
          ]}
          value={view}
          onChange={(value) => setView(value)}
        />
      </div>

      {status === "loading" ? (
        <Card>
          <CardHeader className="border-b border-outline-variant pb-3">
            <CardTitle>Memuat jadwal…</CardTitle>
          </CardHeader>
          <CardBody>
            <SkeletonList rows={5} />
          </CardBody>
        </Card>
      ) : status === "error" ? (
        <EmptyState
          icon={AlertCircle}
          title="Gagal memuat jadwal"
          description="Tidak dapat mengambil data jadwal. Periksa koneksi lalu coba lagi."
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
      ) : view === "today" ? (
        <Card>
          <CardHeader className="items-center border-b border-outline-variant pb-3">
            <CardTitle>Jadwal Hari Ini</CardTitle>
            <span className="font-mono text-2xs tabular-nums text-muted-foreground">
              {todaySessions.length} sesi
            </span>
          </CardHeader>
          {todaySessions.length === 0 ? (
            <CardBody>
              <EmptyState
                icon={CalendarDays}
                title="Tidak ada kelas hari ini"
                description={
                  audience === "teacher"
                    ? "Anda tidak memiliki sesi mengajar hari ini."
                    : "Tidak ada jadwal pelajaran untuk kelas Anda hari ini."
                }
              />
            </CardBody>
          ) : (
            <ol className="divide-y divide-outline-variant">
              {todaySessions.map(renderRow)}
            </ol>
          )}
        </Card>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Belum ada jadwal"
          description="Jadwal pekan ini belum disusun oleh tata usaha."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {grouped.map((group) => (
            <Card key={group.day}>
              <CardHeader className="items-center border-b border-outline-variant pb-3">
                <CardTitle>{DAY_LABEL[group.day] ?? group.day}</CardTitle>
                {group.day === todayName ? (
                  <StatusChip tone="primary">hari ini</StatusChip>
                ) : (
                  <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                    {group.records.length} sesi
                  </span>
                )}
              </CardHeader>
              <ol className="divide-y divide-outline-variant">
                {group.records.map(renderRow)}
              </ol>
            </Card>
          ))}
        </div>
      )}

      <ToastViewport>
        {toast && <Toast message={toast} tone="info" onDismiss={() => setToast(null)} />}
      </ToastViewport>
    </div>
  );
}
