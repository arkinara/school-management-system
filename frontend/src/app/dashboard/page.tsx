"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, LogOut, Construction } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  getMe,
  logout,
  needsOnboarding,
  type UserMe,
  type UserRole,
} from "@/lib/auth";

/** Role → its home dashboard. Roles without an entry get the placeholder. */
const ROLE_HOME: Partial<Record<UserRole, string>> = {
  principal: "/dashboard/principal",
  teacher: "/dashboard/guru",
  student: "/dashboard/siswa",
};

const ROLE_LABEL: Record<UserRole, string> = {
  principal: "Kepala Sekolah",
  teacher: "Guru",
  student: "Siswa",
  parent: "Orang Tua",
  admin: "Tata Usaha",
  super_admin: "Yayasan",
};

/**
 * Role-aware dispatcher. Redirects the three shipped dashboards to their own
 * routes; the remaining role dashboards (tickets #11-#13) render a coming-soon
 * placeholder so auth flows always land somewhere sensible.
 */
export default function DashboardPage() {
  const router = useRouter();
  const [me, setMe] = React.useState<UserMe | null>(null);
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
        const home = ROLE_HOME[profile.role];
        if (home) {
          router.replace(home);
          return;
        }
        setMe(profile);
      })
      .catch(() => {
        if (active) setError("Tidak dapat memuat profil. Coba lagi.");
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
      <div className="w-full max-w-md rounded-2xl border border-outline-variant bg-surface-container-low p-8 shadow-e2">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <GraduationCap className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              {me ? me.user.full_name : "Beranda"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {me ? ROLE_LABEL[me.role] : "Menyiapkan dasbor..."}
            </p>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {me && (
          <div className="flex items-start gap-3 rounded-lg border border-dashed border-outline-variant bg-surface-1 p-4">
            <Construction className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
            <p className="text-sm text-muted-foreground">
              Dasbor {ROLE_LABEL[me.role]} sedang disiapkan dan akan tersedia pada
              rilis berikutnya.
            </p>
          </div>
        )}

        {!error && !me && (
          <p
            className="text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            Memuat dasbor...
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
