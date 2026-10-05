"use client";

import * as React from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Megaphone,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, inputClass } from "@/components/ui/FormField";
import { SegmentedButton } from "@/components/ui/SegmentedButton";
import { StatusChip } from "@/components/ui/StatusChip";
import { Skeleton } from "@/components/ui/Skeleton";
import { Toast, ToastViewport } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import { ApiError } from "@/lib/api";
import {
  createAnnouncement,
  deleteAnnouncement,
  fetchAnnouncements,
  fetchClasses,
  fetchTenants,
  fetchUsers,
  publishAnnouncement,
  unpublishAnnouncement,
  updateAnnouncement,
  type AnnouncementAudience,
  type AnnouncementRecord,
  type ClassRecord,
  type TenantRecord,
} from "@/lib/endpoints";
import type { UserMe, UserRole } from "@/lib/auth";

type LoadStatus = "loading" | "ready" | "error";
type FilterKey = "all" | "class" | "jenjang" | "important" | "draft";

interface ToastState {
  message: string;
  tone: "success" | "error";
  undo?: () => void;
}

const COMPOSER_ROLES: UserRole[] = [
  "teacher",
  "admin",
  "principal",
  "super_admin",
];
const MODERATOR_ROLES: UserRole[] = ["admin", "principal", "super_admin"];

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "class", label: "Kelas" },
  { key: "jenjang", label: "Jenjang" },
  { key: "important", label: "Penting" },
  { key: "draft", label: "Draft" },
];

const AUDIENCE_OPTIONS: { value: AnnouncementAudience; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "class", label: "Kelas" },
  { value: "jenjang", label: "Jenjang" },
];

function audienceLabel(audience: AnnouncementAudience): string {
  if (audience === "class") return "Kelas";
  if (audience === "jenjang") return "Jenjang";
  return "Semua";
}

function statusLabel(status: string): string {
  return status === "published" ? "Terbit" : "Draft";
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function excerpt(text: string, max = 180): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/* -------------------------------------------------------------------------- */
/* Composer                                                                   */
/* -------------------------------------------------------------------------- */

interface ComposerProps {
  me: UserMe;
  classes: ClassRecord[];
  tenants: TenantRecord[];
  editing: AnnouncementRecord | null;
  onCreated: (record: AnnouncementRecord) => void;
  onUpdated: (record: AnnouncementRecord) => void;
  onCancel: () => void;
  onToast: (toast: ToastState) => void;
}

function Composer({
  me,
  classes,
  tenants,
  editing,
  onCreated,
  onUpdated,
  onCancel,
  onToast,
}: ComposerProps) {
  const isEdit = editing !== null;
  const [title, setTitle] = React.useState(editing?.title ?? "");
  const [body, setBody] = React.useState(editing?.body ?? "");
  const [audience, setAudience] = React.useState<AnnouncementAudience>(
    editing?.audience ?? "all"
  );
  const [classId, setClassId] = React.useState<string>(
    editing?.target_class_id ? String(editing.target_class_id) : ""
  );
  const [tenantId, setTenantId] = React.useState<string>(() => {
    if (editing?.target_tenant_id) return String(editing.target_tenant_id);
    if (isEdit) return "";
    return me.tenant_id ? String(me.tenant_id) : "";
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState<"draft" | "publish" | null>(
    null
  );

  const titleRef = React.useRef<HTMLInputElement>(null);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);
  const classRef = React.useRef<HTMLSelectElement>(null);
  const tenantRef = React.useRef<HTMLSelectElement>(null);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Judul wajib diisi.";
    if (!body.trim()) next.body = "Isi pengumuman wajib diisi.";
    if (audience === "class" && !classId) next.classId = "Pilih kelas tujuan.";
    if (audience === "jenjang" && !tenantId)
      next.tenantId = "Pilih jenjang tujuan.";
    setErrors(next);

    const first = (["title", "body", "classId", "tenantId"] as const).find(
      (key) => next[key]
    );
    if (first === "title") titleRef.current?.focus();
    else if (first === "body") bodyRef.current?.focus();
    else if (first === "classId") classRef.current?.focus();
    else if (first === "tenantId") tenantRef.current?.focus();
    return Object.keys(next).length === 0;
  }

  async function submit(publish: boolean) {
    if (submitting) return;
    if (!validate()) return;
    setSubmitting(publish ? "publish" : "draft");
    const input = {
      title: title.trim(),
      body: body.trim(),
      audience,
      target_class_id:
        audience === "class" && classId ? Number(classId) : undefined,
      target_tenant_id:
        audience === "jenjang" && tenantId ? Number(tenantId) : undefined,
    };
    try {
      if (isEdit && editing) {
        let record = await updateAnnouncement(editing.id, input);
        if (publish && record.status !== "published") {
          record = await publishAnnouncement(record.id);
        }
        onUpdated(record);
        onToast({
          message: publish
            ? "Pengumuman diperbarui dan diterbitkan."
            : "Perubahan draft disimpan.",
          tone: "success",
        });
      } else {
        let record = await createAnnouncement(input);
        if (publish) record = await publishAnnouncement(record.id);
        onCreated(record);
        onToast({
          message: publish
            ? "Pengumuman diterbitkan."
            : "Draft pengumuman disimpan.",
          tone: "success",
        });
      }
      onCancel();
    } catch (err) {
      onToast({
        message:
          err instanceof ApiError
            ? err.detail
            : "Gagal menyimpan pengumuman.",
        tone: "error",
      });
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Card className="border-primary/40">
      <CardHeader className="border-b border-outline-variant pb-3">
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-primary" aria-hidden />
          {isEdit ? "Ubah Pengumuman" : "Buat Pengumuman"}
        </CardTitle>
        <button
          type="button"
          aria-label="Tutup form"
          onClick={onCancel}
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-container-high"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </CardHeader>
      <div className="flex flex-col gap-4 px-5 py-4">
        <FormField label="Judul" htmlFor="ann-title" required error={errors.title}>
          <input
            id="ann-title"
            ref={titleRef}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-invalid={Boolean(errors.title)}
            className={inputClass}
            placeholder="Contoh: Libur semester ganjil"
          />
        </FormField>
        <FormField
          label="Isi Pengumuman"
          htmlFor="ann-body"
          required
          error={errors.body}
        >
          <textarea
            id="ann-body"
            ref={bodyRef}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            aria-invalid={Boolean(errors.body)}
            rows={5}
            className={cn(inputClass, "min-h-[96px] py-2")}
            placeholder="Tulis isi pengumuman selengkapnya…"
          />
        </FormField>

        <FormField label="Audiens" htmlFor="ann-audience">
          <SegmentedButton
            aria-label="Audiens pengumuman"
            options={AUDIENCE_OPTIONS}
            value={audience}
            onChange={setAudience}
          />
        </FormField>

        {audience === "class" && (
          <FormField
            label="Kelas Tujuan"
            htmlFor="ann-class"
            required
            error={errors.classId}
          >
            <select
              id="ann-class"
              ref={classRef}
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              aria-invalid={Boolean(errors.classId)}
              className={inputClass}
            >
              <option value="">Pilih kelas…</option>
              {classes.map((klass) => (
                <option key={klass.id} value={klass.id}>
                  {klass.name}
                </option>
              ))}
            </select>
          </FormField>
        )}

        {audience === "jenjang" && (
          <FormField
            label="Jenjang Tujuan"
            htmlFor="ann-tenant"
            required
            error={errors.tenantId}
          >
            <select
              id="ann-tenant"
              ref={tenantRef}
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value)}
              aria-invalid={Boolean(errors.tenantId)}
              className={inputClass}
            >
              <option value="">Pilih jenjang…</option>
              {tenants.length > 0 ? (
                tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))
              ) : (
                <option value={me.tenant_id}>Jenjang #{me.tenant_id}</option>
              )}
            </select>
          </FormField>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-outline-variant pt-4">
          <Button variant="outlined" onClick={onCancel} type="button">
            Batal
          </Button>
          <Button
            variant="tonal"
            icon={Check}
            loading={submitting === "draft"}
            disabled={submitting !== null}
            onClick={() => submit(false)}
            type="button"
          >
            Simpan sebagai Draft
          </Button>
          <Button
            icon={Send}
            loading={submitting === "publish"}
            disabled={submitting !== null}
            onClick={() => submit(true)}
            type="button"
          >
            Publikasikan
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Card + detail                                                              */
/* -------------------------------------------------------------------------- */

function AnnouncementCard({
  item,
  authorName,
  selectable,
  selected,
  onToggle,
  onOpen,
  onApprove,
  onDeny,
  busy,
}: {
  item: AnnouncementRecord;
  authorName: string;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onApprove: () => void;
  onDeny: () => void;
  busy: boolean;
}) {
  const isDraft = item.status !== "published";
  return (
    <li className="flex items-start gap-3 px-5 py-4">
      {selectable && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Pilih pengumuman ${item.title}`}
          className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]"
        />
      )}
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold leading-tight text-foreground">
            {item.title}
          </span>
          <StatusChip tone={isDraft ? "neutral" : "success"}>
            {statusLabel(item.status)}
          </StatusChip>
          <StatusChip tone="primary">
            {audienceLabel(item.audience)}
          </StatusChip>
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
          {excerpt(item.body)}
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 text-2xs text-muted-foreground">
          <span>{authorName}</span>
          <span aria-hidden>·</span>
          <span className="font-mono tabular-nums">
            {formatDateTime(item.published_at)}
          </span>
        </p>
      </button>
      {selectable && isDraft && (
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="outlined"
            className="min-h-10 px-3 text-xs"
            disabled={busy}
            onClick={onDeny}
            type="button"
          >
            Tolak
          </Button>
          <Button
            className="min-h-10 px-3 text-xs"
            disabled={busy}
            onClick={onApprove}
            type="button"
          >
            Setujui
          </Button>
        </div>
      )}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Page content                                                               */
/* -------------------------------------------------------------------------- */

function AnnouncementsContent({ me }: { me: UserMe }) {
  const canCompose = COMPOSER_ROLES.includes(me.role);
  const canModerate = MODERATOR_ROLES.includes(me.role);

  const [filter, setFilter] = React.useState<FilterKey>("all");
  const [items, setItems] = React.useState<AnnouncementRecord[]>([]);
  const [authors, setAuthors] = React.useState<Record<number, string>>({});
  const [classes, setClasses] = React.useState<ClassRecord[]>([]);
  const [tenants, setTenants] = React.useState<TenantRecord[]>([]);
  const [status, setStatus] = React.useState<LoadStatus>("loading");
  const [reloadKey, setReloadKey] = React.useState(0);
  const [composerOpen, setComposerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AnnouncementRecord | null>(null);
  const [detail, setDetail] = React.useState<AnnouncementRecord | null>(null);
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [busyIds, setBusyIds] = React.useState<Set<number>>(new Set());
  const [toast, setToast] = React.useState<ToastState | null>(null);
  const silentRef = React.useRef(false);

  const refresh = React.useCallback((silent = false) => {
    silentRef.current = silent;
    setReloadKey((current) => current + 1);
  }, []);

  React.useEffect(() => {
    let active = true;
    Promise.all([fetchUsers({ size: 200 }), fetchClasses({ size: 100 })])
      .then(([users, classPage]) => {
        if (!active) return;
        setAuthors(
          Object.fromEntries(users.items.map((user) => [user.id, user.full_name]))
        );
        setClasses(classPage.items);
      })
      .catch(() => {
        /* Names/classes are best-effort enrichment. */
      });
    if (me.role === "super_admin") {
      fetchTenants()
        .then((list) => active && setTenants(list))
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [me.role]);

  React.useEffect(() => {
    let active = true;
    const query =
      filter === "class"
        ? { audience: "class" as const }
        : filter === "jenjang"
          ? { audience: "jenjang" as const }
          : filter === "draft"
            ? { status: "draft" as const }
            : {};
    if (!silentRef.current) setStatus("loading");
    silentRef.current = false;
    fetchAnnouncements({ ...query, size: 100 })
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [filter, reloadKey]);

  React.useEffect(() => {
    const interval = setInterval(() => refresh(true), 30_000);
    const onFocus = () => refresh(true);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const visible = React.useMemo(() => {
    if (filter === "important") {
      return items.filter(
        (item) => item.audience === "all" && item.status === "published"
      );
    }
    return items;
  }, [filter, items]);

  const draftItems = React.useMemo(
    () => visible.filter((item) => item.status !== "published"),
    [visible]
  );
  const selectable = canModerate && draftItems.length > 0;
  const allSelected =
    selectable && selected.size > 0 && selected.size === draftItems.length;

  function authorName(id: number): string {
    return authors[id] ?? `Staf #${id}`;
  }

  function upsert(record: AnnouncementRecord) {
    setItems((current) => {
      const exists = current.some((item) => item.id === record.id);
      if (exists) {
        return current.map((item) => (item.id === record.id ? record : item));
      }
      return [record, ...current];
    });
  }

  function removeLocal(id: number) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  async function approve(item: AnnouncementRecord) {
    setBusyIds((current) => new Set(current).add(item.id));
    try {
      const record = await publishAnnouncement(item.id);
      upsert(record);
      setSelected((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      setToast({ message: "Pengumuman diterbitkan.", tone: "success" });
    } catch (err) {
      setToast({
        message:
          err instanceof ApiError ? err.detail : "Gagal menerbitkan pengumuman.",
        tone: "error",
      });
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function deny(item: AnnouncementRecord) {
    setBusyIds((current) => new Set(current).add(item.id));
    try {
      await deleteAnnouncement(item.id);
      removeLocal(item.id);
      setToast({
        message: "Pengumuman ditolak dan dihapus.",
        tone: "success",
        undo: async () => {
          try {
            const restored = await createAnnouncement({
              title: item.title,
              body: item.body,
              audience: item.audience,
              target_class_id: item.target_class_id ?? undefined,
              target_tenant_id: item.target_tenant_id ?? undefined,
            });
            upsert(restored);
          } catch {
            setToast({ message: "Gagal memulihkan pengumuman.", tone: "error" });
          }
        },
      });
    } catch (err) {
      setToast({
        message:
          err instanceof ApiError ? err.detail : "Gagal menghapus pengumuman.",
        tone: "error",
      });
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function retract(item: AnnouncementRecord) {
    setBusyIds((current) => new Set(current).add(item.id));
    try {
      const record = await unpublishAnnouncement(item.id);
      upsert(record);
      setDetail(null);
      setToast({
        message: "Pengumuman ditarik kembali.",
        tone: "success",
        undo: async () => {
          try {
            upsert(await publishAnnouncement(record.id));
            setToast({ message: "Pengumuman diterbitkan ulang.", tone: "success" });
          } catch {
            setToast({ message: "Gagal menerbitkan ulang.", tone: "error" });
          }
        },
      });
    } catch (err) {
      setToast({
        message:
          err instanceof ApiError ? err.detail : "Gagal menarik pengumuman.",
        tone: "error",
      });
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function bulkPublish() {
    const ids = [...selected];
    for (const id of ids) {
      const item = items.find((entry) => entry.id === id);
      if (item) await approve(item);
    }
  }

  async function bulkDismiss() {
    const ids = [...selected];
    for (const id of ids) {
      const item = items.find((entry) => entry.id === id);
      if (item) await deny(item);
    }
  }

  const detailIsDraft = detail?.status !== "published";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Pengumuman
          </h1>
          <p className="text-xs text-muted-foreground">
            Papan informasi sekolah · disaring sesuai audiens Anda
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outlined"
            icon={RotateCcw}
            type="button"
            onClick={() => refresh(false)}
          >
            Muat ulang
          </Button>
          {canCompose && (
            <Button
              icon={Plus}
              type="button"
              onClick={() => {
                setEditing(null);
                setComposerOpen(true);
              }}
            >
              Buat Pengumuman
            </Button>
          )}
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Saringan pengumuman"
        className="flex flex-wrap gap-2"
      >
        {FILTERS.map((option) => {
          const active = filter === option.key;
          return (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(option.key)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors duration-short ease-standard",
                active
                  ? "border-primary bg-secondary-container text-secondary-container-foreground"
                  : "border-outline-variant bg-surface-container-low text-muted-foreground hover:bg-surface-container-high"
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {canCompose && composerOpen && (
        <Composer
          me={me}
          classes={classes}
          tenants={tenants}
          editing={editing}
          onCreated={upsert}
          onUpdated={upsert}
          onCancel={() => {
            setComposerOpen(false);
            setEditing(null);
          }}
          onToast={setToast}
        />
      )}

      {selectable && selected.size > 0 && (
        <Card className="flex flex-wrap items-center gap-3 px-5 py-3">
          <span className="text-sm text-foreground">
            {selected.size} draft dipilih
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outlined"
              className="min-h-10 px-3 text-xs"
              onClick={() => setSelected(new Set())}
              type="button"
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              className="min-h-10 px-3 text-xs"
              icon={Trash2}
              onClick={bulkDismiss}
              type="button"
            >
              Hapus
            </Button>
            <Button
              className="min-h-10 px-3 text-xs"
              icon={Send}
              onClick={bulkPublish}
              type="button"
            >
              Publikasikan
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader className="items-center border-b border-outline-variant pb-3">
          <CardTitle className="flex items-center gap-2">
            {FILTERS.find((option) => option.key === filter)?.label ?? "Semua"}
            <span className="rounded-full bg-surface-container-high px-1.5 py-0.5 font-mono text-2xs font-semibold tabular-nums text-muted-foreground">
              {visible.length}
            </span>
          </CardTitle>
          {selectable && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() =>
                  setSelected(
                    allSelected
                      ? new Set()
                      : new Set(draftItems.map((item) => item.id))
                  )
                }
                className="h-4 w-4 accent-[hsl(var(--primary))]"
              />
              Pilih semua draft
            </label>
          )}
        </CardHeader>

        {status === "loading" ? (
          <div className="flex flex-col gap-4 px-5 py-4" aria-busy>
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex flex-col gap-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}
          </div>
        ) : status === "error" ? (
          <div className="p-4">
            <EmptyState
              icon={AlertCircle}
              title="Gagal memuat pengumuman"
              description="Tidak dapat mengambil daftar pengumuman. Periksa koneksi lalu coba lagi."
              action={
                <Button
                  variant="tonal"
                  icon={RotateCcw}
                  onClick={() => refresh(false)}
                >
                  Coba lagi
                </Button>
              }
            />
          </div>
        ) : visible.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Megaphone}
              title="Belum ada pengumuman"
              description="Pengumuman yang relevan untuk Anda akan tampil di sini."
            />
          </div>
        ) : (
          <ul className="divide-y divide-outline-variant">
            {visible.map((item) => (
              <AnnouncementCard
                key={item.id}
                item={item}
                authorName={authorName(item.author_id)}
                selectable={selectable && item.status !== "published"}
                selected={selected.has(item.id)}
                busy={busyIds.has(item.id)}
                onToggle={() =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    return next;
                  })
                }
                onOpen={() => setDetail(item)}
                onApprove={() => approve(item)}
                onDeny={() => deny(item)}
              />
            ))}
          </ul>
        )}
      </Card>

      <Dialog
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail?.title ?? ""}
        className="max-w-2xl"
        actions={
          detail ? (
            <>
              {canCompose && (
                <Button
                  variant="text"
                  icon={Pencil}
                  onClick={() => {
                    setEditing(detail);
                    setComposerOpen(true);
                    setDetail(null);
                  }}
                >
                  Ubah
                </Button>
              )}
              {canModerate && !detailIsDraft && (
                <Button
                  variant="outlined"
                  icon={RotateCcw}
                  disabled={busyIds.has(detail.id)}
                  onClick={() => retract(detail)}
                >
                  Tarik
                </Button>
              )}
              {canModerate && detailIsDraft && (
                <>
                  <Button
                    variant="outlined"
                    disabled={busyIds.has(detail.id)}
                    onClick={() => {
                      deny(detail);
                      setDetail(null);
                    }}
                  >
                    Tolak
                  </Button>
                  <Button
                    icon={Check}
                    disabled={busyIds.has(detail.id)}
                    onClick={() => {
                      approve(detail);
                      setDetail(null);
                    }}
                  >
                    Setujui
                  </Button>
                </>
              )}
              <Button variant="text" onClick={() => setDetail(null)}>
                Tutup
              </Button>
            </>
          ) : null
        }
      >
        {detail && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip tone={detailIsDraft ? "neutral" : "success"}>
                {statusLabel(detail.status)}
              </StatusChip>
              <StatusChip tone="primary">
                {audienceLabel(detail.audience)}
              </StatusChip>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {detail.body}
            </p>
            <div className="flex items-center gap-3 border-t border-outline-variant pt-3">
              <Avatar name={authorName(detail.author_id)} size="sm" />
              <div className="text-xs text-muted-foreground">
                <p className="font-medium text-foreground">
                  {authorName(detail.author_id)}
                </p>
                <p className="font-mono tabular-nums">
                  {detailIsDraft
                    ? "Belum diterbitkan"
                    : `Terbit ${formatDateTime(detail.published_at)}`}
                </p>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" aria-hidden />
            </div>
          </div>
        )}
      </Dialog>

      <ToastViewport>
        {toast && (
          <Toast
            message={toast.message}
            tone={toast.tone}
            action={
              toast.undo
                ? { label: "Urungkan", onClick: toast.undo }
                : undefined
            }
            onDismiss={() => setToast(null)}
          />
        )}
      </ToastViewport>
    </div>
  );
}

export default function AnnouncementsPage() {
  return (
    <DashboardShell
      role="teacher"
      allow={["principal", "student", "parent", "admin", "super_admin"]}
      title="Pengumuman"
    >
      {(me) => <AnnouncementsContent me={me} />}
    </DashboardShell>
  );
}
