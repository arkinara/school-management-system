"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Bell,
  BellOff,
  CalendarCheck,
  CheckCheck,
  Megaphone,
  MessageSquare,
  RotateCcw,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip, type ChipTone } from "@/components/ui/StatusChip";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { useNotifications } from "@/lib/notifications";
import type { AppNotification, NotificationSource } from "@/lib/endpoints";

type FilterKey = "all" | NotificationSource;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "absensi", label: "Absensi" },
  { key: "spp", label: "SPP" },
  { key: "komunikasi", label: "Komunikasi" },
];

const TYPE_ICON: Record<AppNotification["type"], LucideIcon> = {
  announcement: Megaphone,
  message: MessageSquare,
  payment: Wallet,
  attendance: CalendarCheck,
};

const SOURCE_LABEL: Record<NotificationSource, string> = {
  absensi: "Absensi",
  spp: "SPP",
  komunikasi: "Komunikasi",
};

const SOURCE_TONE: Record<NotificationSource, ChipTone> = {
  absensi: "info",
  spp: "warning",
  komunikasi: "primary",
};

function relativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "Baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} hari lalu`;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function NotificationsContent() {
  const router = useRouter();
  const { notifications, unreadCount, status, refresh, markRead, markAllRead } = useNotifications();
  const [filter, setFilter] = React.useState<FilterKey>("all");

  const visible = React.useMemo(
    () =>
      filter === "all" ? notifications : notifications.filter((item) => item.source === filter),
    [notifications, filter]
  );

  function open(item: AppNotification) {
    markRead(item.id);
    router.push(item.href);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Notifikasi</h1>
          <p className="text-xs text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} item belum dibaca` : "Semua notifikasi sudah dibaca"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outlined" icon={RotateCcw} type="button" onClick={refresh}>
            Muat ulang
          </Button>
          <Button
            icon={CheckCheck}
            type="button"
            disabled={unreadCount === 0}
            onClick={markAllRead}
          >
            Tandai semua sudah dibaca
          </Button>
        </div>
      </div>

      <div role="tablist" aria-label="Saringan notifikasi" className="flex flex-wrap gap-2">
        {FILTERS.map((option) => {
          const active = filter === option.key;
          return (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(option.key)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors duration-short ease-standard",
                active
                  ? "border-primary bg-secondary-container text-secondary-container-foreground"
                  : "border-outline-variant bg-surface-container-low text-muted-foreground hover:bg-surface-container-high"
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader className="items-center border-b border-outline-variant pb-3">
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" aria-hidden />
            Terbaru
            <span className="rounded-full bg-surface-container-high px-1.5 py-0.5 font-mono text-2xs font-semibold tabular-nums text-muted-foreground">
              {visible.length}
            </span>
          </CardTitle>
        </CardHeader>

        {status === "loading" ? (
          <div className="flex flex-col gap-4 px-5 py-4" aria-busy>
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="flex items-start gap-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-3.5 w-1/2" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : status === "error" ? (
          <div className="p-4">
            <EmptyState
              icon={AlertCircle}
              title="Gagal memuat notifikasi"
              description="Sebagian sumber data mungkin tidak tersedia. Periksa koneksi lalu coba lagi."
              action={
                <Button variant="tonal" icon={RotateCcw} onClick={refresh}>
                  Coba lagi
                </Button>
              }
            />
          </div>
        ) : visible.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={BellOff}
              title="Tidak ada notifikasi baru"
              description="Aktivitas absensi, SPP, pengumuman, dan pesan akan muncul di sini."
            />
          </div>
        ) : (
          <ul className="divide-y divide-outline-variant">
            {visible.map((item) => {
              const Icon = TYPE_ICON[item.type];
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => open(item)}
                    className={cn(
                      "flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors duration-short ease-standard hover:bg-surface-container-low",
                      !item.read && "bg-secondary-container/20"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                        item.read
                          ? "bg-surface-container-high text-muted-foreground"
                          : "bg-primary-container text-primary-container-foreground"
                      )}
                    >
                      <Icon className="h-4.5 w-4.5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "truncate text-sm",
                            item.read
                              ? "font-medium text-foreground"
                              : "font-semibold text-foreground"
                          )}
                        >
                          {item.title}
                        </span>
                        <StatusChip tone={SOURCE_TONE[item.source]}>
                          {SOURCE_LABEL[item.source]}
                        </StatusChip>
                      </span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">
                        {item.body}
                      </span>
                      <span className="mt-1 block font-mono text-2xs tabular-nums text-muted-foreground">
                        {relativeTime(item.timestamp)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "mt-2 h-2.5 w-2.5 shrink-0 rounded-full",
                        item.read ? "border border-outline-variant bg-transparent" : "bg-primary"
                      )}
                      aria-label={item.read ? "Sudah dibaca" : "Belum dibaca"}
                      title={item.read ? "Sudah dibaca" : "Belum dibaca"}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <DashboardShell
      role="teacher"
      allow={["principal", "student", "parent", "admin", "super_admin"]}
      title="Notifikasi"
    >
      {() => <NotificationsContent />}
    </DashboardShell>
  );
}
