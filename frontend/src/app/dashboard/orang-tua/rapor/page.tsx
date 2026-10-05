"use client";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { RaporPanel } from "@/components/dashboard/RaporPanel";

export default function OrangTuaRaporPage() {
  return (
    <DashboardShell role="parent" title="Rapor">
      {(me) => <RaporPanel me={me} audience="parent" />}
    </DashboardShell>
  );
}
