"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Printer,
  Receipt,
  RotateCcw,
  Wallet,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, inputClass } from "@/components/ui/FormField";
import { SegmentedButton } from "@/components/ui/SegmentedButton";
import { StatusChip } from "@/components/ui/StatusChip";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { Toast, ToastViewport } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import {
  SPP_PAYMENT_METHODS,
  fetchBillList,
  fetchClasses,
  fetchStudents,
  recordPayment,
  type ClassRecord,
  type SppBill,
  type SppPayment,
  type StudentRecord,
} from "@/lib/endpoints";
import { ApiError } from "@/lib/api";

type LoadStatus = "loading" | "ready" | "error";
type SortKey = "name" | "period" | "amount" | "balance";

interface DraftRow {
  amount: string;
  receipt_no: string;
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function PaymentsContent() {
  const [classes, setClasses] = React.useState<ClassRecord[]>([]);
  const [students, setStudents] = React.useState<Record<number, StudentRecord>>({});
  const [classFilter, setClassFilter] = React.useState("");
  const [periodFilter, setPeriodFilter] = React.useState("");
  const [bills, setBills] = React.useState<SppBill[]>([]);
  const [hiddenIds, setHiddenIds] = React.useState<Set<number>>(new Set());
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [sort, setSort] = React.useState<{ key: SortKey; direction: "asc" | "desc" }>({
    key: "period",
    direction: "asc",
  });
  const [status, setStatus] = React.useState<LoadStatus>("loading");
  const [reloadKey, setReloadKey] = React.useState(0);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [method, setMethod] = React.useState<string>(SPP_PAYMENT_METHODS[0].value);
  const [drafts, setDrafts] = React.useState<Record<number, DraftRow>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [toast, setToast] = React.useState<{
    message: string;
    tone: "success" | "error";
    undo?: () => void;
  } | null>(null);
  const [receipt, setReceipt] = React.useState<{ billId: number; payment: SppPayment }[] | null>(
    null
  );
  const selectAllRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    let active = true;
    Promise.all([fetchClasses({ size: 100 }), fetchStudents({ size: 500 })])
      .then(([classPage, studentPage]) => {
        if (!active) return;
        setClasses(classPage.items);
        setStudents(Object.fromEntries(studentPage.items.map((item) => [item.id, item])));
      })
      .catch(() => {
        if (active) setToast({ message: "Gagal memuat data kelas/siswa.", tone: "error" });
      });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    let active = true;
    setStatus("loading");
    fetchBillList({
      size: 200,
      class_id: classFilter ? Number(classFilter) : undefined,
      period: periodFilter || undefined,
    })
      .then((page) => {
        if (!active) return;
        setBills(page.items.filter((bill) => bill.status !== "paid"));
        setSelected(new Set());
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [classFilter, periodFilter, reloadKey]);

  const visibleBills = React.useMemo(() => {
    const list = bills.filter((bill) => !hiddenIds.has(bill.id));
    const dir = sort.direction === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sort.key === "amount") return (a.amount - b.amount) * dir;
      if (sort.key === "balance") return (a.balance - b.balance) * dir;
      if (sort.key === "period") return a.period.localeCompare(b.period) * dir;
      const nameA = students[a.student_id]?.full_name ?? "";
      const nameB = students[b.student_id]?.full_name ?? "";
      return nameA.localeCompare(nameB) * dir;
    });
  }, [bills, hiddenIds, sort, students]);

  React.useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selected.size > 0 && selected.size < visibleBills.length;
    }
  }, [selected, visibleBills.length]);

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  }

  function toggleRow(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((current) =>
      current.size === visibleBills.length
        ? new Set()
        : new Set(visibleBills.map((bill) => bill.id))
    );
  }

  function openModal() {
    const next: Record<number, DraftRow> = {};
    for (const id of selected) {
      const bill = bills.find((item) => item.id === id);
      if (!bill) continue;
      next[id] = {
        amount: String(bill.balance),
        receipt_no: `SPP-${bill.period}-${bill.id}`,
      };
    }
    setDrafts(next);
    setErrors({});
    setMethod(SPP_PAYMENT_METHODS[0].value);
    setModalOpen(true);
  }

  function updateDraft(id: number, patch: Partial<DraftRow>) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
    setErrors((current) => {
      const key = `amount:${id}`;
      const key2 = `receipt:${id}`;
      if (!(key in current) && !(key2 in current)) return current;
      const next = { ...current };
      delete next[key];
      delete next[key2];
      return next;
    });
  }

  function validate(): boolean {
    const nextErrors: Record<string, string> = {};
    for (const id of selected) {
      const bill = bills.find((item) => item.id === id);
      const draft = drafts[id];
      if (!bill || !draft) continue;
      const amount = Number(draft.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        nextErrors[`amount:${id}`] = "Nominal harus lebih dari 0.";
      } else if (amount > bill.balance + 0.001) {
        nextErrors[`amount:${id}`] = `Melebihi sisa tagihan (${formatRupiah(bill.balance)}).`;
      }
      if (!draft.receipt_no.trim()) {
        nextErrors[`receipt:${id}`] = "Nomor kwitansi wajib diisi.";
      }
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function submit() {
    if (submitting) return;
    if (!validate()) return;
    setSubmitting(true);
    const paidIds = [...selected];
    const recorded: { billId: number; payment: SppPayment }[] = [];
    const fullyPaid: number[] = [];
    try {
      for (const id of paidIds) {
        const draft = drafts[id];
        const bill = bills.find((item) => item.id === id);
        if (!draft || !bill) continue;
        const payment = await recordPayment({
          bill_id: id,
          method,
          amount: Number(draft.amount),
          receipt_no: draft.receipt_no.trim(),
        });
        recorded.push({ billId: id, payment });
        if (Number(draft.amount) >= bill.balance - 0.001) fullyPaid.push(id);
      }
      setReceipt(recorded);
      setHiddenIds((current) => new Set([...current, ...fullyPaid]));
      setSelected(new Set());
      setModalOpen(false);
      const partial = recorded.length - fullyPaid.length;
      setToast({
        message:
          partial > 0
            ? `${recorded.length} pembayaran tercatat · ${partial} sebagian, tagihan tetap terbuka`
            : `${recorded.length} pembayaran tercatat`,
        tone: "success",
        undo: () => {
          setHiddenIds((current) => {
            const next = new Set(current);
            for (const id of fullyPaid) next.delete(id);
            return next;
          });
          setToast({ message: "Pembayaran dikembalikan ke daftar", tone: "success" });
        },
      });
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : "Gagal mencatat pembayaran.";
      setToast({ message: detail, tone: "error" });
      setReloadKey((current) => current + 1);
    } finally {
      setSubmitting(false);
    }
  }

  const totalOutstanding = visibleBills.reduce((sum, bill) => sum + bill.balance, 0);

  const columns: {
    key: SortKey | "student" | "status" | "select";
    header: string;
    align?: "left" | "right";
  }[] = [
    { key: "select", header: "" },
    { key: "student", header: "Siswa" },
    { key: "period", header: "Periode" },
    { key: "amount", header: "Tagihan", align: "right" },
    { key: "balance", header: "Sisa", align: "right" },
    { key: "status", header: "Status" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Catat Pembayaran SPP
          </h1>
          <p className="text-xs text-muted-foreground">
            Tata Usaha · rekam pembayaran untuk tagihan belum lunas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outlined"
            icon={RotateCcw}
            type="button"
            onClick={() => setReloadKey((current) => current + 1)}
          >
            Muat ulang
          </Button>
          <Button icon={Receipt} type="button" onClick={openModal} disabled={selected.size === 0}>
            Catat Pembayaran ({selected.size})
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-wrap items-end gap-3 border-b border-outline-variant pb-4">
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:w-auto lg:grid-cols-2">
            <FormField label="Kelas" htmlFor="spp-filter-class">
              <select
                id="spp-filter-class"
                value={classFilter}
                onChange={(event) => setClassFilter(event.target.value)}
                className={inputClass}
              >
                <option value="">Semua kelas</option>
                {classes.map((klass) => (
                  <option key={klass.id} value={klass.id}>
                    {klass.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Periode" htmlFor="spp-filter-period">
              <input
                id="spp-filter-period"
                type="month"
                value={periodFilter}
                onChange={(event) => setPeriodFilter(event.target.value)}
                className={inputClass}
              />
            </FormField>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone="warning">{visibleBills.length} tagihan belum lunas</StatusChip>
            <StatusChip tone="danger">Total {formatRupiah(totalOutstanding)}</StatusChip>
          </div>
        </CardHeader>

        {status === "loading" ? (
          <div className="p-4">
            <SkeletonTable rows={6} cols={6} />
          </div>
        ) : status === "error" ? (
          <div className="p-4">
            <EmptyState
              icon={AlertCircle}
              title="Gagal memuat tagihan"
              description="Tidak dapat mengambil daftar tagihan. Periksa koneksi lalu coba lagi."
              action={
                <Button
                  variant="tonal"
                  icon={RotateCcw}
                  onClick={() => setReloadKey((current) => current + 1)}
                >
                  Coba lagi
                </Button>
              }
            />
          </div>
        ) : visibleBills.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Wallet}
              title="Tidak ada tagihan belum lunas"
              description="Semua tagihan pada filter ini sudah dibayar."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-surface-container">
                <tr>
                  <th scope="col" className="w-12 px-4 py-2.5 text-left">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={selected.size > 0 && selected.size === visibleBills.length}
                      onChange={toggleAll}
                      aria-label="Pilih semua tagihan"
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                    />
                  </th>
                  {columns.slice(1).map((col) => {
                    const sortable = ["student", "period", "amount", "balance"].includes(col.key);
                    const sortKey = col.key === "student" ? "name" : col.key;
                    const active = sort.key === sortKey;
                    return (
                      <th
                        key={col.key}
                        scope="col"
                        aria-sort={
                          active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"
                        }
                        className={cn(
                          "border-b border-outline-variant px-4 py-2.5 font-semibold text-muted-foreground",
                          col.align === "right" ? "text-right" : "text-left"
                        )}
                      >
                        {sortable ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(sortKey as SortKey)}
                            className="inline-flex items-center gap-1 hover:text-foreground"
                          >
                            {col.header}
                            {active ? (
                              sort.direction === "asc" ? (
                                <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                              )
                            ) : (
                              <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" aria-hidden />
                            )}
                          </button>
                        ) : (
                          col.header
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {visibleBills.map((bill) => {
                  const student = students[bill.student_id];
                  return (
                    <tr key={bill.id} className="hover:bg-surface-container-low">
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(bill.id)}
                          onChange={() => toggleRow(bill.id)}
                          aria-label={`Pilih tagihan ${student?.full_name ?? bill.id}`}
                          className="h-4 w-4 accent-[hsl(var(--primary))]"
                        />
                      </td>
                      <td className="px-4 py-2.5 font-medium text-foreground">
                        {student?.full_name ?? `Siswa #${bill.student_id}`}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-muted-foreground">
                        {bill.period}
                      </td>
                      <td
                        data-value={bill.amount}
                        className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground"
                      >
                        {formatRupiah(bill.amount)}
                      </td>
                      <td
                        data-value={bill.balance}
                        className="px-4 py-2.5 text-right font-mono tabular-nums text-foreground"
                      >
                        {formatRupiah(bill.balance)}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusChip tone={bill.status === "overdue" ? "danger" : "warning"}>
                          {bill.status === "overdue" ? "menunggak" : "belum lunas"}
                        </StatusChip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="border-t border-outline-variant px-5 py-2 text-2xs text-muted-foreground">
          {selected.size} dipilih ·{" "}
          <Link href="/dashboard/tu/spp/generate" className="text-primary hover:underline">
            Buat tagihan baru
          </Link>
        </p>
      </Card>

      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={`Catat Pembayaran (${selected.size} tagihan)`}
        className="max-w-2xl"
        actions={
          <>
            <Button variant="outlined" onClick={() => setModalOpen(false)}>
              Batal
            </Button>
            <Button icon={Receipt} onClick={submit} loading={submitting}>
              Simpan Pembayaran
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <FormField label="Metode Pembayaran" htmlFor="payment-method" required>
            <SegmentedButton
              aria-label="Metode pembayaran"
              options={SPP_PAYMENT_METHODS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              value={method}
              onChange={setMethod}
            />
          </FormField>

          <div className="max-h-80 overflow-y-auto">
            <ul className="flex flex-col gap-3">
              {[...selected].map((id) => {
                const bill = bills.find((item) => item.id === id);
                const student = bill ? students[bill.student_id] : undefined;
                const draft = drafts[id];
                if (!bill || !draft) return null;
                return (
                  <li
                    key={id}
                    className="rounded-md border border-outline-variant bg-surface-container-low p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {student?.full_name ?? `Siswa #${bill.student_id}`}
                      </p>
                      <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                        {bill.period} · sisa {formatRupiah(bill.balance)}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <FormField
                        label="Nominal"
                        htmlFor={`pay-amount-${id}`}
                        error={errors[`amount:${id}`]}
                      >
                        <input
                          id={`pay-amount-${id}`}
                          type="number"
                          min={0}
                          step={1000}
                          inputMode="numeric"
                          value={draft.amount}
                          onChange={(event) => updateDraft(id, { amount: event.target.value })}
                          aria-invalid={Boolean(errors[`amount:${id}`])}
                          className={cn(inputClass, "font-mono tabular-nums")}
                        />
                      </FormField>
                      <FormField
                        label="No. Kwitansi"
                        htmlFor={`pay-receipt-${id}`}
                        error={errors[`receipt:${id}`]}
                      >
                        <input
                          id={`pay-receipt-${id}`}
                          type="text"
                          value={draft.receipt_no}
                          onChange={(event) => updateDraft(id, { receipt_no: event.target.value })}
                          aria-invalid={Boolean(errors[`receipt:${id}`])}
                          className={cn(inputClass, "font-mono")}
                        />
                      </FormField>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={receipt !== null}
        onClose={() => setReceipt(null)}
        title="Kwitansi Pembayaran"
        className="max-w-xl"
        actions={
          <>
            <Button variant="outlined" onClick={() => setReceipt(null)}>
              Tutup
            </Button>
            <Button icon={Printer} onClick={() => window.print()}>
              Cetak
            </Button>
          </>
        }
      >
        <ul className="flex flex-col gap-3">
          {(receipt ?? []).map(({ billId, payment }) => {
            const bill = bills.find((item) => item.id === billId);
            const student = bill ? students[bill.student_id] : undefined;
            return (
              <li
                key={payment.id}
                className="rounded-md border border-outline-variant bg-surface-container-low p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {student?.full_name ?? `Siswa #${bill?.student_id ?? "-"}`}
                  </p>
                  <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                    {payment.receipt_no}
                  </span>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-1 text-2xs text-muted-foreground">
                  <div>
                    <dt>Periode</dt>
                    <dd className="font-medium text-foreground">{bill?.period ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>Metode</dt>
                    <dd className="font-medium text-foreground">
                      {SPP_PAYMENT_METHODS.find((m) => m.value === payment.method)?.label ??
                        payment.method}
                    </dd>
                  </div>
                  <div>
                    <dt>Nominal</dt>
                    <dd className="font-mono font-medium tabular-nums text-foreground">
                      {formatRupiah(payment.amount)}
                    </dd>
                  </div>
                  <div>
                    <dt>Waktu</dt>
                    <dd className="font-medium text-foreground">
                      {new Date(payment.paid_at).toLocaleString("id-ID")}
                    </dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      </Dialog>

      <ToastViewport>
        {toast && (
          <Toast
            message={toast.message}
            tone={toast.tone}
            action={toast.undo ? { label: "Undo", onClick: toast.undo } : undefined}
            onDismiss={() => setToast(null)}
          />
        )}
      </ToastViewport>
    </div>
  );
}

export default function SppPaymentsPage() {
  return (
    <DashboardShell role="admin" allow={["principal"]} title="Catat Pembayaran SPP">
      {() => <PaymentsContent />}
    </DashboardShell>
  );
}
