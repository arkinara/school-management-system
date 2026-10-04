"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, LogOut } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  getMe,
  logout,
  needsOnboarding,
  type UserMe,
  type UserRole,
} from "@/lib/auth";

const ROLE_LABEL: Record<UserRole, string> = {
  principal: "Kepala Sekolah",
  teacher: "Guru",
  student: "Siswa",
  parent: "Orang Tua",
  admin: "Tata Usaha",
  super_admin: "Yayasan",
};

/**
 * Placeholder destination for post-login redirects. The real per-role
 * dashboards land in tickets #8-#13; this route exists so auth flows have a
 * guarded target and so the tenant-picker can hand off cleanly.
 */
export default function DashboardPage() {
  const router = useRouter();
  const [me, setMe] = React.useState<UserMe | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

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
        setMe(profile);
      })
      .catch(() => {
        if (active) setError("Tidak dapat memuat profil. Coba lagi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  async function onLogout() {
    await logout();
    router.replace("/sign-in");
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-outline-variant bg-surface-1 p-8 shadow-e2">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <GraduationCap className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              {me ? me.user.full_name : "Beranda"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {me ? ROLE_LABEL[me.role] : "Memuat..."}
            </p>
          </div>
        </div>

        {loading && (
          <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
            Memuat dasbor...
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {!loading && me && (
          <p className="text-sm text-muted-foreground">
            Selamat datang. Konten dasbor per peran akan tersedia pada rilis
            berikutnya.
          </p>
        )}

        <Button
          type="button"
          variant="outlined"
          icon={LogOut}
          onClick={onLogout}
          className="mt-6 w-full"
        >
          Keluar
        </Button>
      </div>
    </main>
  );
}
