"use client";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ScheduleTimeline } from "@/components/dashboard/ScheduleTimeline";

export default function SiswaTodayPage() {
  return (
    <DashboardShell role="student" title="Jadwal Hari Ini">
      {(me) => <ScheduleTimeline me={me} audience="student" />}
    </DashboardShell>
  );
}
