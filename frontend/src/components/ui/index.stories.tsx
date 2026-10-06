"use client";
/**
 * Storybook-style demo gallery — one entry per component. Not wired to a
 * Storybook runtime; render <ComponentGallery /> on any page to eyeball every
 * component and its states in light/dark mode.
 */
import * as React from "react";
import {
  CalendarCheck,
  Plus,
  Users,
  Wallet,
  FileText,
  ClipboardList,
  FileSearch,
} from "lucide-react";

import { AppBar } from "./AppBar";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { Card, CardHeader, CardTitle, CardBody, CardActions } from "./Card";
import { StatusChip } from "./StatusChip";
import { SegmentedButton } from "./SegmentedButton";
import { MetricCard } from "./MetricCard";
import { NavRail } from "./NavRail";
import { BottomNav } from "./BottomNav";
import { Dialog } from "./Dialog";
import { FAB } from "./FAB";
import { Table, type Column } from "./Table";
import { EmptyState } from "./EmptyState";
import { SkeletonList, SkeletonTable, SkeletonCard } from "./Skeleton";
import { SearchBar } from "./SearchBar";
import { FormField, inputClass } from "./FormField";
import { Toast, ToastViewport } from "./Toast";
import { navByRole } from "./nav-items";

function Story({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-outline-variant py-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {name}
      </h2>
      <div className="flex flex-wrap items-start gap-4">{children}</div>
    </section>
  );
}

interface Siswa {
  id: string;
  nama: string;
  status: string;
}
const siswaRows: Siswa[] = [
  { id: "1", nama: "Budi Santoso", status: "hadir" },
  { id: "2", nama: "Siti Aminah", status: "izin" },
  { id: "3", nama: "Andi Wijaya", status: "sakit" },
  { id: "4", nama: "Dewi Lestari", status: "alpa" },
];

export function ComponentGallery() {
  const [seg, setSeg] = React.useState("hadir");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [density, setDensity] = React.useState<"comfortable" | "compact">("comfortable");
  const [showToast, setShowToast] = React.useState(false);

  const columns: Column<Siswa>[] = [
    { key: "nama", header: "Nama", sortable: true },
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusChip tone="success">{r.status}</StatusChip>,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
      <Story name="AppBar">
        <div className="w-full overflow-hidden rounded-lg border border-outline-variant">
          <AppBar
            title="SDN Menteng 01"
            subtitle="Kepala Sekolah"
            user={{ name: "Budi Santoso" }}
            notifications={3}
          />
        </div>
      </Story>

      <Story name="Button — variants + states">
        <Button>Filled</Button>
        <Button variant="tonal">Tonal</Button>
        <Button variant="outlined">Outlined</Button>
        <Button variant="text">Text</Button>
        <Button variant="destructive">Hapus</Button>
        <Button loading>Menyimpan…</Button>
        <Button disabled>Disabled</Button>
      </Story>

      <Story name="Avatar — sizes + image/initials">
        <Avatar name="Budi Santoso" size="sm" />
        <Avatar name="Siti Aminah" size="md" />
        <Avatar name="Andi Wijaya" size="lg" />
        <Avatar name="Dewi Lestari" size="xl" />
      </Story>

      <Story name="StatusChip — absensi / rapor / SPP">
        <StatusChip tone="success" dot>
          hadir
        </StatusChip>
        <StatusChip tone="warning" dot>
          izin
        </StatusChip>
        <StatusChip tone="info" dot>
          sakit
        </StatusChip>
        <StatusChip tone="danger" dot>
          alpa
        </StatusChip>
        <StatusChip tone="neutral">draft</StatusChip>
        <StatusChip tone="success">published</StatusChip>
        <StatusChip tone="danger">overdue</StatusChip>
      </Story>

      <Story name="SegmentedButton">
        <SegmentedButton
          aria-label="Status kehadiran"
          value={seg}
          onChange={setSeg}
          options={[
            { value: "hadir", label: "Hadir" },
            { value: "izin", label: "Izin" },
            { value: "sakit", label: "Sakit" },
            { value: "alpa", label: "Alpa" },
          ]}
        />
      </Story>

      <Story name="MetricCard">
        <MetricCard
          label="Total Siswa"
          value={482}
          icon={Users}
          delta={{ value: "+12", direction: "up" }}
        />
        <MetricCard
          label="Kehadiran Hari Ini"
          value="94%"
          icon={CalendarCheck}
          delta={{ value: "-2%", direction: "down" }}
        />
        <MetricCard label="SPP Terkumpul" value="Rp 128jt" icon={Wallet} hint="Bulan September" />
      </Story>

      <Story name="Card — header/body/actions">
        <Card className="w-80">
          <CardHeader>
            <CardTitle>Rapor Semester Ganjil</CardTitle>
            <StatusChip tone="neutral">draft</StatusChip>
          </CardHeader>
          <CardBody>Nilai untuk 32 siswa kelas 6A menunggu finalisasi wali kelas.</CardBody>
          <CardActions>
            <Button variant="text">Tinjau</Button>
            <Button variant="tonal">Terbitkan</Button>
          </CardActions>
        </Card>
        <Card interactive className="w-64">
          <CardBody>Kartu interaktif — arahkan kursor untuk elevasi tonal.</CardBody>
        </Card>
      </Story>

      <Story name="NavRail (desktop) + BottomNav (mobile)">
        <div className="h-80 overflow-hidden rounded-lg border border-outline-variant">
          <NavRail items={navByRole.guru} active="home" />
        </div>
        <div className="relative h-20 w-80 overflow-hidden rounded-lg border border-outline-variant">
          <BottomNav items={navByRole.guru} active="absensi" className="!static !md:flex" />
        </div>
      </Story>

      <Story name="Dialog">
        <Button onClick={() => setDialogOpen(true)}>Buka Dialog</Button>
        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title="Terbitkan Rapor?"
          description="Rapor akan terlihat oleh siswa dan orang tua. Tindakan ini tidak dapat dibatalkan."
          actions={
            <>
              <Button variant="text" onClick={() => setDialogOpen(false)}>
                Batal
              </Button>
              <Button onClick={() => setDialogOpen(false)}>Terbitkan</Button>
            </>
          }
        />
      </Story>

      <Story name="FAB">
        <FAB icon={Plus} aria-label="Tambah data" />
        <FAB icon={Plus} label="Input Absensi" />
      </Story>

      <Story name="Table — sort, row actions, density toggle">
        <div className="w-full">
          <Table
            columns={columns}
            rows={siswaRows}
            rowKey={(r) => r.id}
            density={density}
            onDensityChange={setDensity}
            sort={{ key: "nama", direction: "asc" }}
            onSort={() => {}}
            rowActions={() => <Button variant="text">Edit</Button>}
          />
        </div>
      </Story>

      <Story name="EmptyState">
        <EmptyState
          icon={FileSearch}
          title="Belum ada rapor"
          description="Rapor akan muncul di sini setelah wali kelas menerbitkannya."
          action={
            <Button variant="tonal" icon={FileText}>
              Pelajari selengkapnya
            </Button>
          }
        />
      </Story>

      <Story name="Skeleton — list / table / card">
        <div className="w-64">
          <SkeletonList />
        </div>
        <div className="w-80">
          <SkeletonTable />
        </div>
        <div className="w-64">
          <SkeletonCard />
        </div>
      </Story>

      <Story name="SearchBar (debounced)">
        <SearchBar className="w-80" placeholder="Cari siswa…" onSearch={() => {}} />
      </Story>

      <Story name="FormField — default / helper / error">
        <FormField label="Email" htmlFor="s-email" required helper="Gunakan email sekolah">
          <input
            id="s-email"
            type="email"
            className={inputClass}
            placeholder="nama@sekolah.sch.id"
          />
        </FormField>
        <FormField label="NISN" htmlFor="s-nisn" error="NISN harus 10 digit">
          <input id="s-nisn" aria-invalid className={inputClass} defaultValue="123" />
        </FormField>
      </Story>

      <Story name="Toast (with undo)">
        <Button onClick={() => setShowToast(true)} icon={ClipboardList}>
          Simpan absensi
        </Button>
        {showToast && (
          <ToastViewport>
            <Toast
              tone="success"
              message="Absensi kelas 6A tersimpan."
              action={{ label: "Urungkan", onClick: () => setShowToast(false) }}
              onDismiss={() => setShowToast(false)}
            />
          </ToastViewport>
        )}
      </Story>
    </div>
  );
}

export default ComponentGallery;
