"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { AppBar } from "@/components/ui/AppBar";
import { BottomNav } from "@/components/ui/BottomNav";
import { NavRail } from "@/components/ui/NavRail";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import { navByRole, roleLabel, type Role } from "@/components/ui/nav-items";
import {
  getMe,
  needsOnboarding,
  type UserMe,
  type UserRole,
} from "@/lib/auth";

/** Backend auth roles → the navigation-rail role vocabulary. */
const NAV_ROLE: Record<UserRole, Role> = {
  principal: "principal",
  teacher: "guru",
  student: "siswa",
  parent: "orang_tua",
  admin: "tu",
  super_admin: "yayasan",
};

export interface DashboardShellProps {
  /** Role that owns this dashboard. */
  role: UserRole;
  /** Additional roles allowed to preview (e.g. super_admin). */
  allow?: UserRole[];
  /** App-bar title; defaults to a neutral product name. */
  title?: string;
  /** Optional app-bar action slot rendered with the resolved user. */
  actions?: (me: UserMe) => React.ReactNode;
  children: (me: UserMe) => React.ReactNode;
}

/**
 * Shared dashboard chrome: auth gate, role check, AppBar + NavRail (desktop)
 * and BottomNav (mobile). Renders a skeleton while the profile resolves and a
 * 403 panel when the signed-in role may not view this dashboard.
 */
export function DashboardShell({
  role,
  allow = [],
  title = "Sistem Sekolah",
  actions,
  children,
}: DashboardShellProps) {
  const router = useRouter();
  const [me, setMe] = React.useState<UserMe | null>(null);
  const [status, setStatus] = React.useState<"loading" | "ready" | "denied" | "error">(
    "loading"
  );
  // Join to a primitive so a freshly-created `allow` array does not re-trigger
  // the profile fetch on every render.
  const allowKey = allow.join(",");

  React.useEffect(() => {
    let active = true;
    getMe()
      .then((profile) => {
        if (!active) return;
        if (profile === null) {
          router.replace("/sign-in");
          return;
        }
        if (needsOnboarding(profile)) {
          router.replace("/onboarding");
          return;
        }
        const permitted =
          profile.role === role || allowKey.split(",").includes(profile.role);
        setMe(profile);
        setStatus(permitted ? "ready" : "denied");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [allowKey, role, router]);

  const navRole = NAV_ROLE[role];
  const go = React.useCallback(
    (item: { href: string }) => router.push(item.href),
    [router]
  );

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <header className="flex h-16 items-center gap-3 border-b border-outline-variant bg-surface-container-low px-4 sm:px-6">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="ml-auto h-9 w-9 rounded-full" />
        </header>
        <div className="flex flex-1">
          <NavRail items={navByRole[navRole]} active="home" className="hidden md:flex" />
          <main className="grid min-w-0 flex-1 grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </main>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-6">
        <EmptyState
          icon={ShieldAlert}
          title="Gagal memuat profil"
          description="Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi."
          action={
            <Button variant="tonal" onClick={() => window.location.reload()}>
              Muat ulang
            </Button>
          }
        />
      </div>
    );
  }

  if (status === "denied" || me === null) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-6">
        <EmptyState
          icon={ShieldAlert}
          title="Akses ditolak"
          description="Peran akun Anda tidak memiliki akses ke dasbor ini."
          action={
            <Button variant="tonal" onClick={() => router.replace("/dashboard")}>
              Kembali ke beranda
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <AppBar
        title={title}
        subtitle={`${roleLabel[navRole]} · ${me.user.full_name}`}
        user={{ name: me.user.full_name }}
        actions={actions?.(me)}
        notifications={3}
      />
      <div className="flex flex-1">
        <NavRail
          items={navByRole[navRole]}
          active="home"
          onNavigate={go}
          className="hidden md:flex"
        />
        <main className="min-w-0 flex-1 px-3 pb-24 pt-4 sm:px-5 md:pb-8">
          {children(me)}
        </main>
      </div>
      <BottomNav items={navByRole[navRole]} active="home" onNavigate={go} />
    </div>
  );
}
