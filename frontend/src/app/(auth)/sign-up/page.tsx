"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField, inputClass } from "@/components/ui/FormField";
import { SegmentedButton, type Segment } from "@/components/ui/SegmentedButton";
import { cn } from "@/components/ui/cn";
import { ApiError } from "@/lib/api";
import {
  persistAuth,
  register,
  SEED_SCHOOLS,
  type UserRole,
} from "@/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLE_OPTIONS: Segment<UserRole>[] = [
  { value: "principal", label: "Kepala Sekolah" },
  { value: "teacher", label: "Guru" },
  { value: "student", label: "Siswa" },
  { value: "parent", label: "Orang Tua" },
  { value: "admin", label: "Tata Usaha" },
];

const SCHOOL_REQUIRED_ROLES: UserRole[] = [
  "teacher",
  "student",
  "parent",
  "admin",
];

type FieldErrors = {
  fullName?: string;
  email?: string;
  password?: string;
  school?: string;
};

function passwordStrength(password: string): {
  score: number;
  label: string;
  tone: string;
} {
  if (password.length === 0) return { score: 0, label: "", tone: "" };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Za-z]/.test(password) && /[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (score <= 1) return { score, label: "Lemah", tone: "text-destructive" };
  if (score <= 3) return { score, label: "Sedang", tone: "text-warning" };
  return { score, label: "Kuat", tone: "text-success" };
}

export default function SignUpPage() {
  const router = useRouter();

  const nameRef = React.useRef<HTMLInputElement>(null);
  const emailRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);
  const schoolRef = React.useRef<HTMLSelectElement>(null);

  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState<UserRole>("teacher");
  const [schoolId, setSchoolId] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);

  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const strength = passwordStrength(password);

  React.useEffect(() => {
    nameRef.current?.focus();
  }, []);

  function validate(): boolean {
    const next: FieldErrors = {};
    if (fullName.trim().length < 1) next.fullName = "Nama lengkap wajib diisi.";
    if (!EMAIL_RE.test(email.trim())) {
      next.email = "Format email tidak valid. Contoh: budi@sekolah.sch.id";
    }
    if (password.length < 8) {
      next.password = "Kata sandi minimal 8 karakter.";
    }
    if (SCHOOL_REQUIRED_ROLES.includes(role) && schoolId === "") {
      next.school = "Sekolah wajib dipilih untuk peran ini.";
    }
    setErrors(next);
    if (next.fullName) {
      nameRef.current?.focus();
      return false;
    }
    if (next.email) {
      emailRef.current?.focus();
      return false;
    }
    if (next.password) {
      passwordRef.current?.focus();
      return false;
    }
    if (next.school) {
      schoolRef.current?.focus();
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
      const res = await register({
        email: email.trim(),
        password,
        fullName: fullName.trim(),
        role,
        schoolId: schoolId ? Number(schoolId) : undefined,
      });
      persistAuth(res);
      router.replace("/onboarding");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setErrors({ email: "Email ini sudah terdaftar. Silakan masuk." });
          emailRef.current?.focus();
        } else if (err.fieldErrors) {
          setErrors({
            email: err.fieldErrors.email,
            password: err.fieldErrors.password,
            fullName: err.fieldErrors.full_name,
            school: err.fieldErrors.school_id,
          });
          if (err.fieldErrors.full_name) nameRef.current?.focus();
          else if (err.fieldErrors.email) emailRef.current?.focus();
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
          Buat Akun
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Daftarkan diri Anda untuk mengakses sistem sekolah
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        noValidate
        className="rounded-2xl border border-outline-variant bg-surface-1 p-8 shadow-e2"
      >
        <FormField
          label="Nama Lengkap"
          htmlFor="full_name"
          required
          error={errors.fullName}
          className="mb-4"
        >
          <input
            ref={nameRef}
            id="full_name"
            name="full_name"
            type="text"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            aria-invalid={errors.fullName ? true : undefined}
            aria-describedby={errors.fullName ? "full_name-error" : undefined}
            className={cn(inputClass, errors.fullName && "border-destructive")}
          />
        </FormField>

        <FormField
          label="Email"
          htmlFor="email"
          required
          error={errors.email}
          helper="Gunakan email aktif yang bisa dihubungi sekolah."
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
            className={cn(inputClass, errors.email && "border-destructive")}
          />
        </FormField>

        <FormField
          label="Kata Sandi"
          htmlFor="password"
          required
          error={errors.password}
          helper="Minimal 8 karakter. Gabungkan huruf dan angka."
          className="mb-4"
        >
          <div className="relative">
            <input
              ref={passwordRef}
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? "password-error" : "password-helper"}
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
          </div>
          {!errors.password && strength.label && (
            <p className="mt-1 text-xs text-muted-foreground">
              Kekuatan sandi:{" "}
              <span className={cn("font-medium", strength.tone)}>
                {strength.label}
              </span>
            </p>
          )}
        </FormField>

        <div className="mb-4">
          <span className="mb-1.5 block text-sm font-medium text-foreground">
            Peran
          </span>
          <SegmentedButton
            options={ROLE_OPTIONS}
            value={role}
            onChange={setRole}
            aria-label="Pilih peran"
          />
        </div>

        <FormField
          label="Sekolah"
          htmlFor="school"
          required={SCHOOL_REQUIRED_ROLES.includes(role)}
          error={errors.school}
          helper={
            role === "principal"
              ? "Opsional untuk kepala sekolah; jenjang ditetapkan yayasan."
              : "Pilih sekolah tempat Anda bertugas atau terdaftar."
          }
          className="mb-4"
        >
          <select
            ref={schoolRef}
            id="school"
            name="school"
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
            aria-invalid={errors.school ? true : undefined}
            aria-describedby={errors.school ? "school-error" : "school-helper"}
            className={cn(
              inputClass,
              "appearance-none",
              errors.school && "border-destructive"
            )}
          >
            <option value="">Pilih sekolah</option>
            {SEED_SCHOOLS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.jenjang})
              </option>
            ))}
          </select>
        </FormField>

        {formError && (
          <div
            role="alert"
            className="mb-4 rounded-sm border border-destructive/40 bg-destructive-container px-3 py-2 text-sm text-destructive-container-foreground"
          >
            {formError}
          </div>
        )}

        <Button type="submit" loading={loading} className="w-full">
          {loading ? "Mendaftarkan..." : "Daftar"}
        </Button>
      </form>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Sudah punya akun?{" "}
        <Link href="/sign-in" className="font-medium text-primary hover:underline">
          Masuk di sini
        </Link>
      </p>
    </div>
  );
}
