"use client";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { RaporPanel } from "@/components/dashboard/RaporPanel";

export default function SiswaRaporPage() {
  return (
    <DashboardShell role="student" title="Rapor">
      {(me) => <RaporPanel me={me} audience="student" />}
    </DashboardShell>
  );
}
