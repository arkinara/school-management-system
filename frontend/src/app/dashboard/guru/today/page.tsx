"use client";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ScheduleTimeline } from "@/components/dashboard/ScheduleTimeline";

export default function GuruTodayPage() {
  return (
    <DashboardShell role="teacher" title="Jadwal Hari Ini">
      {(me) => <ScheduleTimeline me={me} audience="teacher" />}
    </DashboardShell>
  );
}
