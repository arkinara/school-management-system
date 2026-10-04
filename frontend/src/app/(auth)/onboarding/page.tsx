"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, GraduationCap, School } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/components/ui/cn";
import {
  getMe,
  setOnboardedSchoolId,
  SEED_SCHOOLS,
  SEED_TENANTS,
  type UserMe,
} from "@/lib/auth";

export default function OnboardingPage() {
  const router = useRouter();

  const [me, setMe] = React.useState<UserMe | null>(null);
  const [selected, setSelected] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
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
        if (profile.school_id !== null) {
          router.replace("/dashboard");
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

  const isSuperAdmin = me?.role === "super_admin";
  const options = isSuperAdmin ? SEED_TENANTS : SEED_SCHOOLS;

  function onConfirm() {
    if (selected === null) {
      setError("Pilih salah satu opsi terlebih dahulu.");
      return;
    }
    setSubmitting(true);
    // v1: persist locally so the picker is skipped on the next visit. A future
    // ticket adds PATCH /api/auth/me/school to persist server-side.
    setOnboardedSchoolId(selected);
    router.replace("/dashboard");
  }

  return (
    <div className="w-full max-w-lg">
      <div className="mb-6 flex flex-col items-center text-center">
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-e2">
          <GraduationCap className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Lengkapi Profil Anda
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isSuperAdmin
            ? "Pilih tenant yayasan yang ingin Anda kelola."
            : "Pilih sekolah tempat Anda bertugas atau terdaftar."}
        </p>
      </div>

      <div className="rounded-2xl border border-outline-variant bg-surface-1 p-8 shadow-e2">
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-8" role="status" aria-live="polite">
            <span
              className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"
              aria-hidden
            />
            <p className="text-sm text-muted-foreground">Memuat data...</p>
          </div>
        ) : options.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Belum ada pilihan tersedia"
            description="Hubungi Tata Usaha atau admin yayasan untuk menetapkan sekolah Anda."
          />
        ) : (
          <>
            <div
              role="radiogroup"
              aria-label={isSuperAdmin ? "Pilih tenant" : "Pilih sekolah"}
              className="flex flex-col gap-2"
            >
              {options.map((option) => {
                const active = selected === option.id;
                const Icon = isSuperAdmin ? Building2 : School;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      setSelected(option.id);
                      setError(null);
                    }}
                    className={cn(
                      "flex min-h-[56px] items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors duration-short ease-standard",
                      active
                        ? "border-primary bg-primary-container text-primary-container-foreground"
                        : "border-outline-variant bg-background text-foreground hover:bg-surface-2"
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden />
                    <span className="flex-1">
                      <span className="block text-sm font-medium">{option.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        Jenjang {option.jenjang}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {error && (
              <p role="alert" className="mt-3 text-xs text-destructive">
                {error}
              </p>
            )}

            <Button
              type="button"
              onClick={onConfirm}
              loading={submitting}
              className="mt-5 w-full"
            >
              Lanjutkan
            </Button>

            <p className="mt-3 text-center text-xs text-muted-foreground">
              Belum melihat sekolah Anda? Hubungi admin untuk menetapkannya.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
