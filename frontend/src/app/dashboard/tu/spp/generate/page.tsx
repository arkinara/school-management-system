"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, CheckCircle2, Receipt, RotateCcw, Users } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FormField, inputClass } from "@/components/ui/FormField";
import { StatusChip } from "@/components/ui/StatusChip";
import { Toast, ToastViewport } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import {
  bulkGenerateBills,
  fetchBillList,
  fetchClasses,
  fetchStudents,
  type ClassRecord,
  type SppBulkGenerateResult,
} from "@/lib/endpoints";
import { ApiError } from "@/lib/api";
import { currentPeriod, endOfMonth, todayIso } from "@/lib/dates";

type Scope = "class" | "school";

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function SppGenerateContent({ schoolId }: { schoolId: number | null }) {
  const [classes, setClasses] = React.useState<ClassRecord[]>([]);
  const [scope, setScope] = React.useState<Scope>("class");
  const [classId, setClassId] = React.useState("");
  const [period, setPeriod] = React.useState(currentPeriod());
  const [amount, setAmount] = React.useState("350000");
  const [dueDate, setDueDate] = React.useState(endOfMonth(currentPeriod()));
  const [studentCount, setStudentCount] = React.useState<number | null>(null);
  const [existingCount, setExistingCount] = React.useState<number | null>(null);
  const [loadingPreview, setLoadingPreview] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [errors, setErrors] = React.useState<{
    classId?: string;
    period?: string;
    amount?: string;
    dueDate?: string;
  }>({});
  const [result, setResult] = React.useState<SppBulkGenerateResult | null>(null);
  const [zeroInfo, setZeroInfo] = React.useState(false);
  const [toast, setToast] = React.useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);
  const classRef = React.useRef<HTMLSelectElement>(null);
  const periodRef = React.useRef<HTMLInputElement>(null);
  const amountRef = React.useRef<HTMLInputElement>(null);
  const dueRef = React.useRef<HTMLInputElement>(null);
  const today = todayIso();

  React.useEffect(() => {
    let active = true;
    fetchClasses({ size: 100 })
      .then((page) => {
        if (!active) return;
        setClasses(page.items);
        if (page.items[0]) setClassId(String(page.items[0].id));
      })
      .catch(() => {
        if (active) setToast({ message: "Gagal memuat daftar kelas.", tone: "error" });
      });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (!period || (scope === "class" && !classId)) return;
    let active = true;
    setLoadingPreview(true);
    const studentQuery =
      scope === "class"
        ? { class_id: Number(classId), size: 1 }
        : { school_id: schoolId ?? undefined, size: 1 };
    const billQuery =
      scope === "class" ? { class_id: Number(classId), period, size: 1 } : { period, size: 1 };
    Promise.all([fetchStudents(studentQuery), fetchBillList(billQuery)])
      .then(([students, bills]) => {
        if (!active) return;
        setStudentCount(students.total);
        setExistingCount(bills.total);
      })
      .catch(() => {
        if (active) {
          setStudentCount(null);
          setExistingCount(null);
        }
      })
      .finally(() => {
        if (active) setLoadingPreview(false);
      });
    return () => {
      active = false;
    };
  }, [scope, classId, period, schoolId]);

  function onPeriodChange(value: string) {
    setPeriod(value);
    if (/^\d{4}-\d{2}$/.test(value)) setDueDate(endOfMonth(value));
    setErrors((current) => ({ ...current, period: undefined }));
  }

  function validate(): boolean {
    const nextErrors: typeof errors = {};
    const numericAmount = Number(amount);
    if (scope === "class" && !classId) nextErrors.classId = "Kelas wajib dipilih.";
    if (scope === "school" && schoolId === null)
      nextErrors.classId = "Sekolah tidak diketahui untuk akun ini.";
    if (!period) nextErrors.period = "Periode wajib diisi.";
    if (!Number.isFinite(numericAmount) || numericAmount <= 0)
      nextErrors.amount = "Nominal harus lebih dari 0.";
    if (!dueDate) nextErrors.dueDate = "Tanggal jatuh tempo wajib diisi.";
    else if (dueDate < today) nextErrors.dueDate = "Jatuh tempo tidak boleh di masa lalu.";
    setErrors(nextErrors);
    const firstInvalid = (Object.keys(nextErrors) as (keyof typeof errors)[])[0];
    if (firstInvalid === "classId") classRef.current?.focus();
    else if (firstInvalid === "period") periodRef.current?.focus();
    else if (firstInvalid === "amount") amountRef.current?.focus();
    else if (firstInvalid === "dueDate") dueRef.current?.focus();
    return Object.keys(nextErrors).length === 0;
  }

  function openConfirm() {
    if (!validate()) return;
    setConfirmOpen(true);
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const created = await bulkGenerateBills({
        period,
        amount: Number(amount),
        due_date: dueDate,
        ...(scope === "class"
          ? { class_id: Number(classId) }
          : { school_id: schoolId ?? undefined }),
      });
      setConfirmOpen(false);
      if (created.created === 0 && created.skipped === 0) {
        setZeroInfo(true);
        setResult(null);
      } else {
        setZeroInfo(false);
        setResult(created);
        setToast({
          message: `${created.created} tagihan dibuat, ${created.skipped} dilewati`,
          tone: "success",
        });
      }
    } catch (err) {
      setConfirmOpen(false);
      if (err instanceof ApiError && err.status === 404) {
        setZeroInfo(true);
        setResult(null);
      } else {
        const detail = err instanceof ApiError ? err.detail : "Gagal membuat tagihan.";
        setToast({ message: detail, tone: "error" });
      }
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setResult(null);
    setExistingCount(null);
    setZeroInfo(false);
  }

  const selectedClass = classes.find((klass) => String(klass.id) === classId);
  const scopeLabel = scope === "class" ? (selectedClass?.name ?? "kelas") : "seluruh sekolah";

  if (result) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Card>
          <CardHeader className="border-b border-outline-variant pb-4">
            <CardTitle>Tagihan Dibuat</CardTitle>
            <StatusChip tone="success">selesai</StatusChip>
          </CardHeader>
          <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success-container text-success-container-foreground">
              <CheckCircle2 className="h-8 w-8" aria-hidden />
            </span>
            <div>
              <p className="text-base font-semibold text-foreground">
                {result.created} tagihan berhasil dibuat
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Periode {period} ·{" "}
                {result.skipped > 0
                  ? `${result.skipped} siswa dilewati (tagihan sudah ada)`
                  : "tidak ada siswa yang dilewati"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outlined" icon={RotateCcw} onClick={reset}>
                Buat untuk scope lain
              </Button>
              <Link
                href="/dashboard/tu/spp/payments"
                className="inline-flex min-h-[48px] items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Catat Pembayaran
              </Link>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Generate Tagihan SPP
          </h1>
          <p className="text-xs text-muted-foreground">
            Tata Usaha · buat tagihan bulanan per kelas atau seluruh sekolah
          </p>
        </div>
        <Link
          href="/dashboard/tu/spp/payments"
          className="flex min-h-10 items-center rounded-full border border-outline px-4 text-xs font-medium text-primary hover:bg-surface-container-high"
        >
          Catat Pembayaran
        </Link>
      </div>

      {zeroInfo && (
        <div
          role="status"
          className="rounded-md border border-warning/50 bg-warning-container p-3 text-sm text-warning-container-foreground"
        >
          Tidak ada siswa di scope ini. Pilih kelas atau sekolah yang memiliki siswa aktif.
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="border-b border-outline-variant pb-4">
            <CardTitle>Data Tagihan</CardTitle>
          </CardHeader>
          <form
            className="flex flex-col gap-4 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              openConfirm();
            }}
          >
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-foreground">Scope</legend>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="scope"
                  value="class"
                  checked={scope === "class"}
                  onChange={() => setScope("class")}
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                Satu kelas
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="scope"
                  value="school"
                  checked={scope === "school"}
                  onChange={() => setScope("school")}
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                Satu sekolah (semua siswa)
              </label>
            </fieldset>

            {scope === "class" ? (
              <FormField label="Kelas" htmlFor="spp-class" required error={errors.classId}>
                <select
                  id="spp-class"
                  ref={classRef}
                  value={classId}
                  onChange={(event) => {
                    setClassId(event.target.value);
                    setErrors((current) => ({ ...current, classId: undefined }));
                  }}
                  aria-invalid={Boolean(errors.classId)}
                  className={inputClass}
                >
                  <option value="">Pilih kelas…</option>
                  {classes.map((klass) => (
                    <option key={klass.id} value={klass.id}>
                      {klass.name} · {klass.academic_year}
                    </option>
                  ))}
                </select>
              </FormField>
            ) : (
              <div className="rounded-md bg-surface-container-low p-3 text-2xs text-muted-foreground">
                Generate tagihan untuk semua siswa aktif di sekolah ini.
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Periode" htmlFor="spp-period" required error={errors.period}>
                <input
                  id="spp-period"
                  ref={periodRef}
                  type="month"
                  value={period}
                  onChange={(event) => onPeriodChange(event.target.value)}
                  aria-invalid={Boolean(errors.period)}
                  className={inputClass}
                />
              </FormField>
              <FormField label="Jatuh Tempo" htmlFor="spp-due" required error={errors.dueDate}>
                <input
                  id="spp-due"
                  ref={dueRef}
                  type="date"
                  value={dueDate}
                  min={today}
                  onChange={(event) => {
                    setDueDate(event.target.value);
                    setErrors((current) => ({ ...current, dueDate: undefined }));
                  }}
                  aria-invalid={Boolean(errors.dueDate)}
                  className={inputClass}
                />
              </FormField>
            </div>

            <FormField
              label="Nominal (Rupiah)"
              htmlFor="spp-amount"
              required
              error={errors.amount}
              helper={Number(amount) > 0 ? formatRupiah(Number(amount)) : "Contoh: 350000"}
            >
              <input
                id="spp-amount"
                ref={amountRef}
                type="number"
                min={0}
                step={1000}
                inputMode="numeric"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setErrors((current) => ({ ...current, amount: undefined }));
                }}
                aria-invalid={Boolean(errors.amount)}
                className={cn(inputClass, "font-mono tabular-nums")}
              />
            </FormField>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outlined"
                type="button"
                icon={RotateCcw}
                onClick={() => {
                  setPeriod(currentPeriod());
                  setAmount("350000");
                  setDueDate(endOfMonth(currentPeriod()));
                  setErrors({});
                }}
              >
                Reset
              </Button>
              <Button type="submit" icon={Receipt} disabled={!amount || !period}>
                Tinjau & Buat
              </Button>
            </div>
          </form>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="items-center border-b border-outline-variant pb-3">
            <CardTitle>Pratinjau</CardTitle>
          </CardHeader>
          <div className="flex flex-col gap-3 p-5 text-sm">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="text-muted-foreground">Siswa aktif</span>
              <span className="ml-auto font-mono text-base font-semibold tabular-nums text-foreground">
                {loadingPreview ? "…" : (studentCount ?? "—")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Scope</span>
              <span className="ml-auto font-medium text-foreground">{scopeLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Nominal</span>
              <span className="ml-auto font-mono tabular-nums text-foreground">
                {Number(amount) > 0 ? formatRupiah(Number(amount)) : "—"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Total tagihan</span>
              <span className="ml-auto font-mono tabular-nums text-foreground">
                {studentCount !== null && Number(amount) > 0
                  ? formatRupiah(studentCount * Number(amount))
                  : "—"}
              </span>
            </div>

            {existingCount !== null && existingCount > 0 && (
              <div
                role="alert"
                className="mt-2 flex items-start gap-2 rounded-md border border-warning/50 bg-warning-container p-3 text-warning-container-foreground"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p className="text-2xs">
                  {existingCount} tagihan untuk periode ini sudah ada. Proses bersifat idempoten —
                  siswa tersebut akan dilewati.
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Buat tagihan sekarang?"
        description={`${studentCount ?? 0} siswa di ${scopeLabel} akan menerima tagihan ${formatRupiah(
          Number(amount)
        )} untuk periode ${period}.`}
        actions={
          <>
            <Button variant="outlined" onClick={() => setConfirmOpen(false)}>
              Batal
            </Button>
            <Button icon={Receipt} onClick={submit} loading={submitting}>
              Konfirmasi
            </Button>
          </>
        }
      >
        {existingCount !== null && existingCount > 0 && (
          <p className="flex items-center gap-2 text-xs text-warning">
            <AlertCircle className="h-4 w-4" aria-hidden />
            {existingCount} tagihan periode ini akan dilewati.
          </p>
        )}
      </Dialog>

      <ToastViewport>
        {toast && (
          <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />
        )}
      </ToastViewport>
    </div>
  );
}

export default function SppGeneratePage() {
  return (
    <DashboardShell role="admin" allow={["principal"]} title="Generate Tagihan SPP">
      {(me) => <SppGenerateContent schoolId={me.school_id ?? null} />}
    </DashboardShell>
  );
}
