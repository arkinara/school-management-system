"use client";

import * as React from "react";
import { GraduationCap, Users, Wallet, CalendarCheck, Plus } from "lucide-react";
import { AppBar } from "@/components/ui/AppBar";
import { BottomNav } from "@/components/ui/BottomNav";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusChip, statusTone, type ChipTone } from "@/components/ui/StatusChip";
import { navByRole } from "@/components/ui/nav-items";

const metrics = [
  { key: "siswa", label: "Total Siswa", value: 482, icon: Users, delta: { value: "+12", direction: "up" as const }, hint: "Tahun ajaran 2024/2025" },
  { key: "hadir", label: "Kehadiran Hari Ini", value: "96.2%", icon: CalendarCheck, delta: { value: "+1.4", direction: "up" as const }, hint: "Target 95%" },
  { key: "spp", label: "SPP Terkumpul", value: "91%", icon: Wallet, delta: { value: "-2.1", direction: "down" as const }, hint: "43 tunggakan" },
];

const statuses: Array<{ label: string; tone: ChipTone }> = [
  { label: "hadir", tone: statusTone.hadir },
  { label: "izin", tone: statusTone.izin },
  { label: "alpa", tone: statusTone.alpa },
  { label: "published", tone: statusTone.published },
  { label: "overdue", tone: statusTone.overdue },
];

export default function PreviewPage() {
  const [active, setActive] = React.useState("home");

  return (
    <div className="min-h-dvh bg-background pb-20">
      <AppBar
        title="SDN Menteng 01"
        subtitle="Kepala Sekolah · Budi Santoso"
        user={{ name: "Budi Santoso" }}
        notifications={3}
      />

      <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" aria-hidden />
            <h1 className="text-lg font-semibold text-foreground">Beranda Kepala Sekolah</h1>
          </div>
          <Button icon={Plus}>Input Absensi</Button>
        </div>

        <section className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map((m) => (
            <MetricCard
              key={m.key}
              label={m.label}
              value={m.value}
              icon={m.icon}
              delta={m.delta}
              hint={m.hint}
            />
          ))}
        </section>

        <Card interactive>
          <CardHeader>
            <CardTitle>Status Terkini</CardTitle>
            <Button variant="text">Lihat semua</Button>
          </CardHeader>
          <CardBody>
            <div className="flex flex-wrap gap-2">
              {statuses.map((s) => (
                <StatusChip key={s.label} tone={s.tone} dot>
                  {s.label}
                </StatusChip>
              ))}
            </div>
          </CardBody>
        </Card>
      </main>

      <BottomNav items={navByRole.principal} active={active} onNavigate={(item) => setActive(item.key)} />
    </div>
  );
}
