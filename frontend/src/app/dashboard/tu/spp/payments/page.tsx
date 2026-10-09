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
  Search,
  Trash2,
  Wallet,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, inputClass } from "@/components/ui/FormField";
import { SegmentedButton } from "@/components/ui/SegmentedButton";
import { StatusChip, type ChipTone } from "@/components/ui/StatusChip";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { Toast, ToastViewport } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import {
  SPP_PAYMENT_METHODS,
  fetchAll,
  fetchBillList,
  fetchClasses,
  fetchPayments,
  fetchStudents,
  recordBillPayment,
  voidPayment,
  type ClassRecord,
  type SppBill,
  type SppBillStatus,
  type SppPayment,
  type StudentRecord,
} from "@/lib/endpoints";
import { ApiError } from "@/lib/api";

type LoadStatus = "loading" | "ready" | "error";
type SortKey = "name" | "period" | "amount" | "balance";
type RowState = { status: "saved" | "error"; error?: string; receipt_no?: number };

interface DraftRow {
  amount: string;
  note: string;
}

interface ReceiptEntry {
  billId: number;
  payment: SppPayment;
}

const BILL_STATUS: Record<SppBillStatus, { label: string; tone: ChipTone }> = {
  unpaid: { label: "belum lunas", tone: "warning" },
  overdue: { label: "menunggak", tone: "danger" },
  partially_paid: { label: "sebagian", tone: "info" },
  paid: { label: "lunas", tone: "success" },
};

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
  const [search, setSearch] = React.useState("");
  const [bills, setBills] = React.useState<SppBill[]>([]);
  const [latestPayments, setLatestPayments] = React.useState<Record<number, SppPayment>>({});
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
  const [rowStatus, setRowStatus] = React.useState<Record<number, RowState>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [toast, setToast] = React.useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);
  const [receipt, setReceipt] = React.useState<ReceiptEntry[] | null>(null);
  const [voidingId, setVoidingId] = React.useState<number | null>(null);
  const selectAllRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    let active = true;
    fetchAll((p) => fetchStudents(p))
      .then((studentList) => {
        if (!active) return;
        setStudents(Object.fromEntries(studentList.map((item) => [item.id, item])));
      })
      .catch(() => {
        if (active) setToast({ message: "Gagal memuat data siswa.", tone: "error" });
      });
    fetchClasses({ size: 100 })
      .then((classPage) => {
        if (active) setClasses(classPage.items);
      })
      .catch(() => {
        if (active) setToast({ message: "Gagal memuat data kelas.", tone: "error" });
      });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    let active = true;
    setStatus("loading");
    Promise.all([
      // Server caps a page at 100 (#44); `fetchAll` walks the pages instead of
      // requesting an oversized `size`.
      fetchAll((p) =>
        fetchBillList({
          ...p,
          class_id: classFilter ? Number(classFilter) : undefined,
          period: periodFilter || undefined,
        })
      ),
      fetchAll((p) => fetchPayments(p)),
    ])
      .then(([billRows, paymentRows]) => {
        if (!active) return;
        setBills(billRows.filter((bill) => bill.status !== "paid"));
        const byBill: Record<number, SppPayment> = {};
        for (const payment of paymentRows) {
          if (payment.voided) continue;
          // Rows are ordered by id, so the last write is the newest payment.
          byBill[payment.bill_id] = payment;
        }
        setLatestPayments(byBill);
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
    const query = search.trim().toLowerCase();
    const list = bills.filter((bill) => {
      if (!query) return true;
      const name = students[bill.student_id]?.full_name ?? "";
      return name.toLowerCase().includes(query);
    });
    const dir = sort.direction === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sort.key === "amount") return (a.amount - b.amount) * dir;
      if (sort.key === "balance") return (a.balance - b.balance) * dir;
      if (sort.key === "period") return a.period.localeCompare(b.period) * dir;
      const nameA = students[a.student_id]?.full_name ?? "";
      const nameB = students[b.student_id]?.full_name ?? "";
      return nameA.localeCompare(nameB) * dir;
    });
  }, [bills, search, sort, students]);

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
      next[id] = { amount: String(bill.balance), note: "" };
    }
    setDrafts(next);
    setErrors({});
    setRowStatus({});
    setMethod(SPP_PAYMENT_METHODS[0].value);
    setModalOpen(true);
  }

  function updateDraft(id: number, patch: Partial<DraftRow>) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
    setErrors((current) => {
      const key = `amount:${id}`;
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
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
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function submit() {
    if (submitting) return;
    if (!validate()) return;
    setSubmitting(true);
    const paidIds = [...selected];
    const recorded: ReceiptEntry[] = [];
    const nextStatus: Record<number, RowState> = {};
    let lastReceipt: number | null = null;

    for (const id of paidIds) {
      const draft = drafts[id];
      if (!draft) continue;
      try {
        const result = await recordBillPayment(id, {
          amount: Number(draft.amount),
          method,
          note: draft.note.trim() || null,
        });
        nextStatus[id] = { status: "saved", receipt_no: result.payment.receipt_no };
        recorded.push({ billId: id, payment: result.payment });
        lastReceipt = result.payment.receipt_no;
      } catch (err) {
        const detail = err instanceof ApiError ? err.detail : "Gagal mencatat pembayaran.";
        nextStatus[id] = { status: "error", error: detail };
      }
    }

    setRowStatus(nextStatus);
    setReceipt(recorded);
    const failed = paidIds.filter((id) => nextStatus[id]?.status === "error");
    const succeeded = paidIds.filter((id) => nextStatus[id]?.status === "saved");

    if (succeeded.length > 0) {
      setToast({
        message:
          lastReceipt !== null
            ? `Payment recorded: receipt #${lastReceipt}`
            : `${succeeded.length} pembayaran tercatat`,
        tone: "success",
      });
    } else if (failed.length > 0) {
      setToast({
        message: nextStatus[failed[0]]?.error ?? "Gagal mencatat pembayaran.",
        tone: "error",
      });
    }

    if (failed.length === 0) {
      setSelected(new Set());
      setModalOpen(false);
    } else {
      setSelected(new Set(failed));
    }

    setReloadKey((current) => current + 1);
    setSubmitting(false);
  }

  async function onUndo(payment: SppPayment) {
    if (
      !window.confirm(`Void payment ${payment.receipt_no}? This will update the bill's status.`)
    ) {
      return;
    }
    setVoidingId(payment.id);
    try {
      await voidPayment(payment.id, "user_undo");
      setToast({ message: "Payment voided", tone: "success" });
      setReloadKey((current) => current + 1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setToast({ message: "Only admin can void payments", tone: "error" });
      } else {
        setToast({
          message: err instanceof ApiError ? err.detail : "Gagal membatalkan pembayaran.",
          tone: "error",
        });
      }
    } finally {
      setVoidingId(null);
    }
  }

  function openReceipt(entry: ReceiptEntry) {
    setReceipt([entry]);
  }

  const totalOutstanding = visibleBills.reduce((sum, bill) => sum + bill.balance, 0);

  const columns: {
    key: SortKey | "student" | "status" | "receipt" | "select" | "actions";
    header: string;
    align?: "left" | "right";
  }[] = [
    { key: "select", header: "" },
    { key: "student", header: "Siswa" },
    { key: "period", header: "Periode" },
    { key: "amount", header: "Tagihan", align: "right" },
    { key: "balance", header: "Sisa", align: "right" },
    { key: "status", header: "Status" },
    { key: "receipt", header: "Kwitansi" },
    { key: "actions", header: "" },
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
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/tu/spp/bills/new"
            className="flex min-h-10 items-center rounded-full border border-outline px-4 text-xs font-medium text-primary hover:bg-surface-container-high"
          >
            Buat Tagihan Tunggal
          </Link>
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
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:w-auto lg:grid-cols-3">
            <FormField label="Cari siswa" htmlFor="spp-filter-search">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  id="spp-filter-search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nama siswa…"
                  className={cn(inputClass, "pl-9")}
                />
              </div>
            </FormField>
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
              title="Gagal memuat data SPP"
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
                  const chip = BILL_STATUS[bill.status];
                  const payment = latestPayments[bill.id];
                  const row = rowStatus[bill.id];
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
                        {row?.status === "error" && (
                          <span className="mt-0.5 block text-2xs text-destructive">
                            {row.error ?? "Gagal"}
                          </span>
                        )}
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
                        <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
                        {bill.status === "partially_paid" && (
                          <span className="mt-1 block text-2xs text-muted-foreground">
                            {formatRupiah(bill.paid_amount)} / {formatRupiah(bill.amount)} — sisa{" "}
                            {formatRupiah(bill.balance)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-muted-foreground">
                        {row?.receipt_no ?? payment?.receipt_no ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        {payment && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              aria-label={`Kwitansi ${student?.full_name ?? bill.id}`}
                              onClick={() => openReceipt({ billId: bill.id, payment })}
                              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-container-high hover:text-foreground"
                            >
                              <Printer className="h-4 w-4" aria-hidden />
                            </button>
                            <button
                              type="button"
                              aria-label={`Void pembayaran ${student?.full_name ?? bill.id}`}
                              disabled={voidingId === payment.id}
                              onClick={() => onUndo(payment)}
                              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive-container hover:text-destructive disabled:opacity-40"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </button>
                          </div>
                        )}
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

          <p className="text-2xs text-muted-foreground">
            Nomor kwitansi dibuat otomatis oleh server.
          </p>

          <div className="max-h-80 overflow-y-auto">
            <ul className="flex flex-col gap-3">
              {[...selected].map((id) => {
                const bill = bills.find((item) => item.id === id);
                const student = bill ? students[bill.student_id] : undefined;
                const draft = drafts[id];
                if (!bill || !draft) return null;
                const row = rowStatus[id];
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
                      <FormField label="Catatan" htmlFor={`pay-note-${id}`}>
                        <input
                          id={`pay-note-${id}`}
                          type="text"
                          value={draft.note}
                          onChange={(event) => updateDraft(id, { note: event.target.value })}
                          className={inputClass}
                        />
                      </FormField>
                    </div>
                    {row?.status === "saved" && (
                      <p className="mt-1 text-2xs text-success">
                        Tersimpan · kwitansi #{row.receipt_no}
                      </p>
                    )}
                    {row?.status === "error" && (
                      <p className="mt-1 text-2xs text-destructive">{row.error}</p>
                    )}
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
          <div className="no-print flex gap-2">
            <Button variant="outlined" onClick={() => setReceipt(null)}>
              Tutup
            </Button>
            <Button icon={Printer} onClick={() => window.print()}>
              Cetak
            </Button>
          </div>
        }
      >
        <ul className="spp-receipt flex flex-col gap-3">
          {(receipt ?? []).map(({ billId, payment }) => {
            const bill = bills.find((item) => item.id === billId);
            const student = bill ? students[bill.student_id] : undefined;
            return (
              <li
                key={payment.id}
                className="rounded-md border border-outline-variant bg-surface-container-low p-3"
              >
                <h1 className="text-base font-semibold text-foreground">Kwitansi Pembayaran SPP</h1>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {student?.full_name ?? `Siswa #${bill?.student_id ?? "-"}`}
                  </p>
                  <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                    No: {payment.receipt_no}
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
                    <dt>Jumlah</dt>
                    <dd className="font-mono font-medium tabular-nums text-foreground">
                      {formatRupiah(payment.amount)}
                    </dd>
                  </div>
                  <div>
                    <dt>Tanggal</dt>
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
          <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />
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
