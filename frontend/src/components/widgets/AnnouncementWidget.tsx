"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Megaphone, RotateCcw } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { fetchAnnouncements, type AnnouncementRecord } from "@/lib/endpoints";

type LoadStatus = "loading" | "ready" | "error";

function formatDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** Compact "latest announcements" card shared by the guru/yayasan dashboards. */
export function AnnouncementWidget({ className }: { className?: string }) {
  const [status, setStatus] = React.useState<LoadStatus>("loading");
  const [items, setItems] = React.useState<AnnouncementRecord[]>([]);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    setStatus("loading");
    fetchAnnouncements({ size: 5 })
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  return (
    <Card className={className}>
      <CardHeader className="items-center border-b border-outline-variant pb-3">
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-primary" aria-hidden />
          Pengumuman
        </CardTitle>
        <Link
          href="/dashboard/announcements"
          className="text-xs font-semibold text-primary hover:underline"
        >
          Lihat semua
        </Link>
      </CardHeader>
      {status === "loading" ? (
        <CardBody>
          <SkeletonList rows={3} />
        </CardBody>
      ) : status === "error" ? (
        <CardBody>
          <EmptyState
            icon={AlertCircle}
            title="Gagal memuat pengumuman"
            description="Tidak dapat mengambil pengumuman. Periksa koneksi lalu coba lagi."
            action={
              <Button variant="tonal" icon={RotateCcw} onClick={() => setReloadKey((k) => k + 1)}>
                Coba lagi
              </Button>
            }
          />
        </CardBody>
      ) : items.length === 0 ? (
        <CardBody>
          <EmptyState
            icon={Megaphone}
            title="Belum ada pengumuman"
            description="Pengumuman terbaru akan tampil di sini."
          />
        </CardBody>
      ) : (
        <ul className="divide-y divide-outline-variant">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href="/dashboard/announcements"
                className="flex items-start gap-3 px-5 py-3 hover:bg-surface-container-low"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                  <p className="font-mono text-2xs tabular-nums text-muted-foreground">
                    {formatDate(item.published_at)}
                  </p>
                </div>
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
