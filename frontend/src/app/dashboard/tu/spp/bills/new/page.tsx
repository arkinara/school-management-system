"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Receipt } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FormField, inputClass } from "@/components/ui/FormField";
import { Toast, ToastViewport } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import { createBill, fetchAll, fetchStudents, type StudentRecord } from "@/lib/endpoints";
import { ApiError } from "@/lib/api";
import { currentPeriod, endOfMonth, todayIso } from "@/lib/dates";

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function SingleBillContent() {
  const [students, setStudents] = React.useState<StudentRecord[]>([]);
  const [studentId, setStudentId] = React.useState("");
  const [period, setPeriod] = React.useState(currentPeriod());
  const [amount, setAmount] = React.useState("350000");
  const [dueDate, setDueDate] = React.useState(endOfMonth(currentPeriod()));
  const [submitting, setSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<{
    studentId?: string;
    period?: string;
    amount?: string;
    dueDate?: string;
  }>({});
  const [toast, setToast] = React.useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);
  const today = todayIso();

  React.useEffect(() => {
    let active = true;
    fetchAll((p) => fetchStudents(p))
      .then((list) => {
        if (active) setStudents(list);
      })
      .catch(() => {
        if (active) setToast({ message: "Gagal memuat daftar siswa.", tone: "error" });
      });
    return () => {
      active = false;
    };
  }, []);

  function onPeriodChange(value: string) {
    setPeriod(value);
    if (/^\d{4}-\d{2}$/.test(value)) setDueDate(endOfMonth(value));
    setErrors((current) => ({ ...current, period: undefined }));
  }

  function validate(): boolean {
    const next: typeof errors = {};
    const numericAmount = Number(amount);
    if (!studentId) next.studentId = "Siswa wajib dipilih.";
    if (!period) next.period = "Periode wajib diisi.";
    if (!Number.isFinite(numericAmount) || numericAmount <= 0)
      next.amount = "Nominal harus lebih dari 0.";
    if (!dueDate) next.dueDate = "Tanggal jatuh tempo wajib diisi.";
    else if (dueDate < today) next.dueDate = "Jatuh tempo tidak boleh di masa lalu.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!validate()) return;
    setSubmitting(true);
    try {
      const bill = await createBill({
        student_id: Number(studentId),
        period,
        amount: Number(amount),
        due_date: dueDate,
      });
      setToast({ message: `Bill ${bill.period} created`, tone: "success" });
      setErrors({});
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setErrors({ period: `Siswa sudah punya tagihan untuk ${period}` });
      } else {
        setToast({
          message: err instanceof ApiError ? err.detail : "Gagal membuat tagihan.",
          tone: "error",
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Buat Tagihan Tunggal
          </h1>
          <p className="text-xs text-muted-foreground">
            Tata Usaha · tagihan untuk satu siswa dan satu periode
          </p>
        </div>
        <Link
          href="/dashboard/tu/spp/payments"
          className="flex min-h-10 items-center gap-2 rounded-full border border-outline px-4 text-xs font-medium text-primary hover:bg-surface-container-high"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Catat Pembayaran
        </Link>
      </div>

      <Card>
        <CardHeader className="border-b border-outline-variant pb-4">
          <CardTitle>Data Tagihan</CardTitle>
        </CardHeader>
        <form className="flex flex-col gap-4 p-5" onSubmit={submit}>
          <FormField label="Siswa" htmlFor="bill-student" required error={errors.studentId}>
            <select
              id="bill-student"
              value={studentId}
              onChange={(event) => {
                setStudentId(event.target.value);
                setErrors((current) => ({ ...current, studentId: undefined }));
              }}
              aria-invalid={Boolean(errors.studentId)}
              className={inputClass}
            >
              <option value="">Pilih siswa…</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.full_name ?? student.nis} · {student.nis}
                </option>
              ))}
            </select>
          </FormField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Periode" htmlFor="bill-period" required error={errors.period}>
              <input
                id="bill-period"
                type="month"
                value={period}
                onChange={(event) => onPeriodChange(event.target.value)}
                aria-invalid={Boolean(errors.period)}
                className={inputClass}
              />
            </FormField>
            <FormField label="Jatuh Tempo" htmlFor="bill-due" required error={errors.dueDate}>
              <input
                id="bill-due"
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
            htmlFor="bill-amount"
            required
            error={errors.amount}
            helper={Number(amount) > 0 ? formatRupiah(Number(amount)) : "Contoh: 350000"}
          >
            <input
              id="bill-amount"
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
              onClick={() => {
                setStudentId("");
                setPeriod(currentPeriod());
                setAmount("350000");
                setDueDate(endOfMonth(currentPeriod()));
                setErrors({});
              }}
            >
              Reset
            </Button>
            <Button type="submit" icon={Receipt} loading={submitting}>
              Buat Tagihan
            </Button>
          </div>
        </form>
      </Card>

      <ToastViewport>
        {toast && (
          <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />
        )}
      </ToastViewport>
    </div>
  );
}

export default function SppSingleBillPage() {
  return (
    <DashboardShell role="admin" allow={["principal"]} title="Buat Tagihan Tunggal">
      {() => <SingleBillContent />}
    </DashboardShell>
  );
}
