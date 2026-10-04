"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField, inputClass } from "@/components/ui/FormField";
import { cn } from "@/components/ui/cn";
import {
  ApiError,
  UnauthorizedError,
} from "@/lib/api";
import { login, persistAuth, routeAfterAuth, SEED_TENANTS } from "@/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignInPage() {
  const router = useRouter();

  const emailRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [tenantId, setTenantId] = React.useState("");
  const [showTenant, setShowTenant] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);

  const [errors, setErrors] = React.useState<{
    email?: string;
    password?: string;
  }>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    emailRef.current?.focus();
    const params = new URLSearchParams(window.location.search);
    setShowTenant(params.get("tenant") === null);
  }, []);

  function validate(): boolean {
    const next: { email?: string; password?: string } = {};
    if (!EMAIL_RE.test(email.trim())) {
      next.email = "Format email tidak valid. Contoh: budi@sekolah.sch.id";
    }
    if (password.length < 1) {
      next.password = "Kata sandi wajib diisi.";
    }
    setErrors(next);
    if (next.email) {
      emailRef.current?.focus();
      return false;
    }
    if (next.password) {
      passwordRef.current?.focus();
      return false;
    }
    return true;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await login({
        email: email.trim(),
        password,
        tenantId: tenantId ? Number(tenantId) : undefined,
      });
      persistAuth(res);
      router.replace(routeAfterAuth(res.user));
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        setFormError("Email atau kata sandi salah.");
        passwordRef.current?.focus();
      } else if (err instanceof ApiError) {
        if (err.fieldErrors) {
          setErrors({
            email: err.fieldErrors.email,
            password: err.fieldErrors.password,
          });
          if (err.fieldErrors.email) emailRef.current?.focus();
          else passwordRef.current?.focus();
        } else {
          setFormError(err.detail);
        }
      } else {
        setFormError("Terjadi kesalahan tak terduga. Coba lagi.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-6 flex flex-col items-center text-center">
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-e2">
          <GraduationCap className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Selamat Datang Kembali
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Masuk ke akun sekolah Anda
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        noValidate
        className="rounded-2xl border border-outline-variant bg-surface-1 p-8 shadow-e2"
      >
        {showTenant && (
          <FormField
            label="Sekolah / Jenjang"
            htmlFor="tenant"
            helper="Opsional. Isi bila akun terdaftar di lebih dari satu jenjang."
            className="mb-4"
          >
            <select
              id="tenant"
              name="tenant"
              autoComplete="organization"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className={cn(inputClass, "appearance-none")}
            >
              <option value="">Pilih sekolah (opsional)</option>
              {SEED_TENANTS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.jenjang})
                </option>
              ))}
            </select>
          </FormField>
        )}

        <FormField
          label="Email"
          htmlFor="email"
          required
          error={errors.email}
          helper="Gunakan email yang terdaftar di Tata Usaha."
          className="mb-4"
        >
          <input
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "email-error" : "email-helper"}
            placeholder="nama@sekolah.sch.id"
            className={cn(
              inputClass,
              errors.email && "border-destructive"
            )}
          />
        </FormField>

        <div className="mb-2 flex items-baseline justify-between">
          <label htmlFor="password" className="text-sm font-medium text-foreground">
            Kata Sandi
            <span className="ml-0.5 text-destructive" aria-hidden>
              *
            </span>
          </label>
          <Link
            href="/sign-in"
            className="text-xs font-medium text-primary hover:underline"
            aria-disabled
            onClick={(e) => e.preventDefault()}
          >
            Lupa kata sandi?
          </Link>
        </div>
        <div className="relative mb-4">
          <input
            ref={passwordRef}
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? "password-error" : undefined}
            className={cn(inputClass, "pr-12", errors.password && "border-destructive")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            aria-pressed={showPassword}
            className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-3"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" aria-hidden />
            ) : (
              <Eye className="h-4 w-4" aria-hidden />
            )}
          </button>
          {errors.password && (
            <p
              id="password-error"
              role="alert"
              className="mt-1 text-xs text-destructive"
            >
              {errors.password}
            </p>
          )}
        </div>

        {formError && (
          <div
            role="alert"
            className="mb-4 rounded-sm border border-destructive/40 bg-destructive-container px-3 py-2 text-sm text-destructive-container-foreground"
          >
            {formError}
          </div>
        )}

        <Button type="submit" loading={loading} className="w-full">
          {loading ? "Memeriksa..." : "Masuk"}
        </Button>
      </form>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Belum punya akun?{" "}
        <Link href="/sign-up" className="font-medium text-primary hover:underline">
          Daftar di sini
        </Link>
      </p>
    </div>
  );
}
