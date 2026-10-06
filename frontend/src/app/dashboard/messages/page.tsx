"use client";

import * as React from "react";
import {
  AlertCircle,
  CheckCheck,
  MessageSquare,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Send,
  UserPlus,
  X,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, inputClass } from "@/components/ui/FormField";
import { Skeleton, SkeletonList } from "@/components/ui/Skeleton";
import { Toast, ToastViewport } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import { ApiError } from "@/lib/api";
import {
  addThreadParticipant,
  createMessageThread,
  fetchMessages,
  fetchThreads,
  fetchUsers,
  removeThreadParticipant,
  sendMessage,
  type MessageRecord,
  type MessageThreadRecord,
  type UserRecord,
} from "@/lib/endpoints";
import type { UserMe } from "@/lib/auth";

type LoadStatus = "loading" | "ready" | "error";

interface LocalMessage extends MessageRecord {
  local?: boolean;
  failed?: boolean;
}

interface ToastState {
  message: string;
  tone: "success" | "error";
}

const ROLE_LABEL: Record<string, string> = {
  principal: "Kepala Sekolah",
  teacher: "Guru",
  student: "Siswa",
  parent: "Orang Tua",
  admin: "Tata Usaha",
  super_admin: "Yayasan",
};

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function excerpt(text: string, max = 60): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function threadTimestamp(thread: MessageThreadRecord): string {
  return thread.last_message?.sent_at ?? thread.created_at;
}

function isUnread(thread: MessageThreadRecord, meId: number): boolean {
  const last = thread.last_message;
  if (!last) return false;
  return last.sender_id !== meId && last.read_at === null;
}

/* -------------------------------------------------------------------------- */
/* New thread modal                                                           */
/* -------------------------------------------------------------------------- */

function NewThreadDialog({
  open,
  users,
  me,
  onClose,
  onCreated,
  onToast,
}: {
  open: boolean;
  users: UserRecord[];
  me: UserMe;
  onClose: () => void;
  onCreated: (thread: MessageThreadRecord) => void;
  onToast: (toast: ToastState) => void;
}) {
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set());
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const subjectRef = React.useRef<HTMLInputElement>(null);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (!open) {
      setSelectedIds(new Set());
      setSubject("");
      setBody("");
      setErrors({});
      setSearch("");
    }
  }, [open]);

  const candidates = React.useMemo(
    () =>
      users.filter((user) => {
        if (user.id === me.user.id) return false;
        if (!search.trim()) return true;
        const needle = search.toLowerCase();
        return (
          user.full_name.toLowerCase().includes(needle) || user.email.toLowerCase().includes(needle)
        );
      }),
    [users, me.user.id, search]
  );

  function toggle(id: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setErrors((current) => ({ ...current, participants: "" }));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (selectedIds.size === 0) next.participants = "Pilih minimal satu peserta.";
    if (!subject.trim()) next.subject = "Subjek wajib diisi.";
    if (!body.trim()) next.body = "Pesan pertama wajib diisi.";
    setErrors(next);
    if (next.participants) {
      document.getElementById("new-thread-participants")?.focus();
    } else if (next.subject) subjectRef.current?.focus();
    else if (next.body) bodyRef.current?.focus();
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (submitting) return;
    if (!validate()) return;
    setSubmitting(true);
    try {
      const thread = await createMessageThread({
        participant_ids: [...selectedIds],
        subject: subject.trim(),
      });
      await sendMessage(thread.id, body.trim());
      onCreated(thread);
      onToast({ message: "Percakapan baru dibuat.", tone: "success" });
      onClose();
    } catch (err) {
      onToast({
        message: err instanceof ApiError ? err.detail : "Gagal membuat percakapan baru.",
        tone: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Percakapan Baru"
      className="max-w-2xl"
      actions={
        <>
          <Button variant="outlined" onClick={onClose}>
            Batal
          </Button>
          <Button icon={Send} onClick={submit} loading={submitting}>
            Kirim
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div id="new-thread-participants" tabIndex={-1} className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">
            Peserta
            <span className="ml-0.5 text-destructive" aria-hidden>
              *
            </span>
          </span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nama atau email…"
            aria-label="Cari peserta"
            className={inputClass}
          />
          <div className="max-h-52 overflow-y-auto rounded-sm border border-outline">
            {candidates.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                Tidak ada pengguna yang cocok.
              </p>
            ) : (
              <ul className="divide-y divide-outline-variant">
                {candidates.map((user) => {
                  const checked = selectedIds.has(user.id);
                  return (
                    <li key={user.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-container-low">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(user.id)}
                          className="h-4 w-4 accent-[hsl(var(--primary))]"
                        />
                        <Avatar name={user.full_name} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-foreground">
                            {user.full_name}
                          </span>
                          <span className="block truncate text-2xs text-muted-foreground">
                            {ROLE_LABEL[user.role] ?? user.role} · {user.email}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {errors.participants && (
            <p role="alert" className="text-xs text-destructive">
              {errors.participants}
            </p>
          )}
        </div>

        <FormField label="Subjek" htmlFor="new-thread-subject" required error={errors.subject}>
          <input
            id="new-thread-subject"
            ref={subjectRef}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            aria-invalid={Boolean(errors.subject)}
            className={inputClass}
            placeholder="Contoh: Perkembangan belajar Ani"
          />
        </FormField>

        <FormField label="Pesan Pertama" htmlFor="new-thread-body" required error={errors.body}>
          <textarea
            id="new-thread-body"
            ref={bodyRef}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            aria-invalid={Boolean(errors.body)}
            rows={4}
            className={cn(inputClass, "min-h-[96px] py-2")}
            placeholder="Tulis pesan pertama…"
          />
        </FormField>
      </div>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Add participant modal                                                      */
/* -------------------------------------------------------------------------- */

function AddParticipantDialog({
  open,
  users,
  existing,
  meId,
  onClose,
  onAdd,
  onToast,
}: {
  open: boolean;
  users: UserRecord[];
  existing: number[];
  meId: number;
  onClose: () => void;
  onAdd: (user: UserRecord) => void;
  onToast: (toast: ToastState) => void;
}) {
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) setSelectedId(null);
  }, [open]);

  const candidates = users.filter(
    (user) => user.id !== meId && !existing.includes(user.id) && user.role !== "student"
  );

  async function submit() {
    if (selectedId === null) {
      onToast({ message: "Pilih pengguna untuk ditambahkan.", tone: "error" });
      return;
    }
    const user = candidates.find((item) => item.id === selectedId);
    if (!user) return;
    setSubmitting(true);
    try {
      onAdd(user);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Tambah Peserta"
      actions={
        <>
          <Button variant="outlined" onClick={onClose}>
            Batal
          </Button>
          <Button icon={UserPlus} onClick={submit} loading={submitting}>
            Tambah
          </Button>
        </>
      }
    >
      <ul className="max-h-72 divide-y divide-outline-variant overflow-y-auto rounded-sm border border-outline">
        {candidates.length === 0 ? (
          <li className="px-3 py-4 text-center text-xs text-muted-foreground">
            Semua pengguna sudah menjadi peserta.
          </li>
        ) : (
          candidates.map((user) => (
            <li key={user.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-container-low">
                <input
                  type="radio"
                  name="add-participant"
                  checked={selectedId === user.id}
                  onChange={() => setSelectedId(user.id)}
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                <Avatar name={user.full_name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{user.full_name}</span>
                  <span className="block truncate text-2xs text-muted-foreground">
                    {ROLE_LABEL[user.role] ?? user.role} · {user.email}
                  </span>
                </span>
              </label>
            </li>
          ))
        )}
      </ul>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Page content                                                               */
/* -------------------------------------------------------------------------- */

function MessagesContent({ me }: { me: UserMe }) {
  const [users, setUsers] = React.useState<UserRecord[]>([]);
  const [threads, setThreads] = React.useState<MessageThreadRecord[]>([]);
  const [threadStatus, setThreadStatus] = React.useState<LoadStatus>("loading");
  const [activeId, setActiveId] = React.useState<number | null>(null);
  const [messages, setMessages] = React.useState<LocalMessage[]>([]);
  const [messageStatus, setMessageStatus] = React.useState<LoadStatus>("loading");
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [newOpen, setNewOpen] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [leaveOpen, setLeaveOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [toast, setToast] = React.useState<ToastState | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const silentRef = React.useRef(false);

  const usersById = React.useMemo(() => {
    const map: Record<number, UserRecord> = {};
    for (const user of users) map[user.id] = user;
    return map;
  }, [users]);

  function nameFor(id: number): string {
    return usersById[id]?.full_name ?? `Pengguna #${id}`;
  }

  const loadThreads = React.useCallback((silent = false) => {
    silentRef.current = silent;
    if (!silent) setThreadStatus("loading");
    return fetchThreads({ size: 100 })
      .then((page) => {
        setThreads(page.items);
        setThreadStatus("ready");
        return page.items;
      })
      .catch(() => {
        setThreadStatus("error");
        return [] as MessageThreadRecord[];
      });
  }, []);

  React.useEffect(() => {
    let active = true;
    fetchUsers({ size: 200 })
      .then((page) => active && setUsers(page.items))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    void loadThreads(false);
  }, [loadThreads]);

  React.useEffect(() => {
    const interval = setInterval(() => void loadThreads(true), 30_000);
    const onFocus = () => void loadThreads(true);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadThreads]);

  const activeThread = React.useMemo(
    () => threads.find((thread) => thread.id === activeId) ?? null,
    [threads, activeId]
  );

  React.useEffect(() => {
    if (activeId === null) {
      setMessages([]);
      return;
    }
    let active = true;
    setMessageStatus("loading");
    fetchMessages(activeId, { size: 200 })
      .then((page) => {
        if (!active) return;
        setMessages(page.items);
        setMessageStatus("ready");
        void loadThreads(true);
      })
      .catch(() => {
        if (active) setMessageStatus("error");
      });
    return () => {
      active = false;
    };
  }, [activeId, loadThreads]);

  React.useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, activeId]);

  const sortedThreads = React.useMemo(
    () =>
      [...threads].sort(
        (a, b) => new Date(threadTimestamp(b)).getTime() - new Date(threadTimestamp(a)).getTime()
      ),
    [threads]
  );

  function participantNames(thread: MessageThreadRecord): string {
    const others = thread.participant_ids.filter((id) => id !== me.user.id);
    const names = others.map(nameFor);
    return names.length > 0 ? names.join(", ") : "Anda";
  }

  function updateThreadPreview(threadId: number, message: MessageRecord) {
    setThreads((current) =>
      current.map((thread) =>
        thread.id === threadId ? { ...thread, last_message: message } : thread
      )
    );
  }

  async function deliver(threadId: number, tempId: number, text: string) {
    try {
      const record = await sendMessage(threadId, text);
      setMessages((current) =>
        current.map((message) =>
          message.id === tempId ? { ...record, local: false, failed: false } : message
        )
      );
      updateThreadPreview(threadId, record);
    } catch (err) {
      setMessages((current) =>
        current.map((message) => (message.id === tempId ? { ...message, failed: true } : message))
      );
      setToast({
        message: err instanceof ApiError ? err.detail : "Pesan gagal terkirim.",
        tone: "error",
      });
    }
  }

  async function handleSend() {
    const text = draft.trim();
    if (!text || activeId === null || sending) return;
    const tempId = -Date.now();
    const optimistic: LocalMessage = {
      id: tempId,
      thread_id: activeId,
      sender_id: me.user.id,
      body: text,
      sent_at: new Date().toISOString(),
      read_at: null,
      local: true,
    };
    setMessages((current) => [...current, optimistic]);
    setDraft("");
    setSending(true);
    await deliver(activeId, tempId, text);
    setSending(false);
  }

  async function retry(message: LocalMessage) {
    setMessages((current) =>
      current.map((item) => (item.id === message.id ? { ...item, failed: false } : item))
    );
    await deliver(message.thread_id, message.id, message.body);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  async function addParticipant(user: UserRecord) {
    if (activeId === null) return;
    try {
      const updated = await addThreadParticipant(activeId, user.id);
      setThreads((current) =>
        current.map((thread) => (thread.id === updated.id ? updated : thread))
      );
      setToast({ message: `${user.full_name} ditambahkan.`, tone: "success" });
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.detail : "Gagal menambah peserta.",
        tone: "error",
      });
    }
  }

  async function leaveThread() {
    if (activeId === null) return;
    try {
      await removeThreadParticipant(activeId, me.user.id);
      setThreads((current) => current.filter((thread) => thread.id !== activeId));
      setActiveId(null);
      setLeaveOpen(false);
      setToast({ message: "Anda keluar dari percakapan.", tone: "success" });
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.detail : "Gagal keluar dari percakapan.",
        tone: "error",
      });
    }
  }

  function handleCreated(thread: MessageThreadRecord) {
    setThreads((current) => [thread, ...current.filter((t) => t.id !== thread.id)]);
    setActiveId(thread.id);
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Pesan</h1>
          <p className="text-xs text-muted-foreground">
            Komunikasi langsung antara orang tua dan guru
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outlined"
            icon={RotateCcw}
            type="button"
            onClick={() => void loadThreads(false)}
          >
            Muat ulang
          </Button>
          <Button icon={Plus} type="button" onClick={() => setNewOpen(true)}>
            Percakapan Baru
          </Button>
        </div>
      </div>

      <div className="grid min-h-[65vh] grid-cols-1 gap-3 lg:grid-cols-[20rem_1fr]">
        <Card className={cn("flex min-h-0 flex-col", activeId !== null && "hidden lg:flex")}>
          <CardHeader className="items-center border-b border-outline-variant pb-3">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" aria-hidden />
              Percakapan
            </CardTitle>
            <span className="rounded-full bg-surface-container-high px-1.5 py-0.5 font-mono text-2xs font-semibold tabular-nums text-muted-foreground">
              {sortedThreads.length}
            </span>
          </CardHeader>

          {threadStatus === "loading" ? (
            <div className="p-4">
              <SkeletonList rows={5} />
            </div>
          ) : threadStatus === "error" ? (
            <div className="p-4">
              <EmptyState
                icon={AlertCircle}
                title="Gagal memuat percakapan"
                description="Periksa koneksi lalu coba lagi."
                action={
                  <Button variant="tonal" icon={RotateCcw} onClick={() => void loadThreads(false)}>
                    Coba lagi
                  </Button>
                }
              />
            </div>
          ) : sortedThreads.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={MessageSquare}
                title="Belum ada percakapan"
                description="Mulai percakapan baru dengan guru atau orang tua."
              />
            </div>
          ) : (
            <ul className="flex-1 divide-y divide-outline-variant overflow-y-auto">
              {sortedThreads.map((thread) => {
                const unread = isUnread(thread, me.user.id);
                const others = thread.participant_ids.filter((id) => id !== me.user.id);
                return (
                  <li key={thread.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(thread.id)}
                      aria-current={thread.id === activeId ? "true" : undefined}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-short ease-standard hover:bg-surface-container-low",
                        thread.id === activeId && "bg-secondary-container/40"
                      )}
                    >
                      <span className="flex shrink-0 -space-x-2">
                        {(others.length > 0 ? others : [me.user.id]).slice(0, 3).map((id) => (
                          <Avatar
                            key={id}
                            name={nameFor(id)}
                            size="sm"
                            className="ring-2 ring-surface-container-low"
                          />
                        ))}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span
                            className={cn(
                              "truncate text-sm",
                              unread
                                ? "font-semibold text-foreground"
                                : "font-medium text-foreground"
                            )}
                          >
                            {participantNames(thread)}
                          </span>
                          {unread && (
                            <span
                              className="ml-auto h-2 w-2 shrink-0 rounded-full bg-accent"
                              aria-label="Belum dibaca"
                            />
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-2xs text-muted-foreground">
                          {thread.subject}
                        </span>
                        {thread.last_message && (
                          <span className="mt-0.5 block truncate text-2xs text-muted-foreground">
                            {thread.last_message.sender_id === me.user.id ? "Anda: " : ""}
                            {excerpt(thread.last_message.body)}
                          </span>
                        )}
                      </span>
                      {thread.last_message && (
                        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                          {formatTime(threadTimestamp(thread))}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className={cn("flex min-h-0 flex-col", activeId === null && "hidden lg:flex")}>
          {activeThread === null ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState
                icon={MessageSquare}
                title="Pilih percakapan"
                description="Pilih percakapan di daftar untuk melihat pesan, atau mulai percakapan baru."
              />
            </div>
          ) : (
            <>
              <CardHeader className="items-center border-b border-outline-variant pb-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Button
                    variant="text"
                    className="min-h-10 px-2 lg:hidden"
                    onClick={() => setActiveId(null)}
                    aria-label="Kembali ke daftar"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
                  <span className="flex shrink-0 -space-x-2">
                    {activeThread.participant_ids
                      .filter((id) => id !== me.user.id)
                      .slice(0, 3)
                      .map((id) => (
                        <Avatar key={id} name={nameFor(id)} size="sm" />
                      ))}
                  </span>
                  <div className="min-w-0">
                    <CardTitle className="truncate">{participantNames(activeThread)}</CardTitle>
                    <p className="truncate text-2xs text-muted-foreground">
                      {activeThread.subject}
                    </p>
                  </div>
                </div>
                <div className="relative">
                  <button
                    type="button"
                    aria-label="Menu percakapan"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((value) => !value)}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-container-high"
                  >
                    <MoreHorizontal className="h-5 w-5" aria-hidden />
                  </button>
                  {menuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-md border border-outline-variant bg-surface-container-high py-1 shadow-md"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-container-highest"
                        onClick={() => {
                          setMenuOpen(false);
                          setAddOpen(true);
                        }}
                      >
                        <UserPlus className="h-4 w-4" aria-hidden />
                        Tambah peserta
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-surface-container-highest"
                        onClick={() => {
                          setMenuOpen(false);
                          setLeaveOpen(true);
                        }}
                      >
                        <X className="h-4 w-4" aria-hidden />
                        Keluar dari percakapan
                      </button>
                    </div>
                  )}
                </div>
              </CardHeader>

              <div
                ref={listRef}
                className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
                aria-live="polite"
              >
                {messageStatus === "loading" ? (
                  <div className="flex flex-col gap-3" aria-busy>
                    <Skeleton className="h-12 w-2/3" />
                    <Skeleton className="ml-auto h-12 w-1/2" />
                    <Skeleton className="h-12 w-3/5" />
                  </div>
                ) : messageStatus === "error" ? (
                  <EmptyState
                    icon={AlertCircle}
                    title="Akses ditolak"
                    description="Anda tidak memiliki akses ke percakapan ini."
                  />
                ) : messages.length === 0 ? (
                  <EmptyState
                    icon={MessageSquare}
                    title="Belum ada pesan"
                    description="Mulai percakapan dengan mengirim pesan pertama."
                  />
                ) : (
                  messages.map((message) => {
                    const own = message.sender_id === me.user.id;
                    return (
                      <div
                        key={message.id}
                        className={cn(
                          "flex max-w-[80%] flex-col gap-1",
                          own ? "ml-auto items-end" : "items-start"
                        )}
                      >
                        {!own && (
                          <span className="px-1 text-2xs font-medium text-muted-foreground">
                            {nameFor(message.sender_id)}
                          </span>
                        )}
                        <div
                          className={cn(
                            "rounded-lg px-3.5 py-2 text-sm",
                            own
                              ? "bg-primary text-primary-foreground"
                              : "bg-surface-container-high text-foreground",
                            message.failed && "opacity-70"
                          )}
                        >
                          <p className="whitespace-pre-wrap">{message.body}</p>
                        </div>
                        <span className="flex items-center gap-1.5 px-1 text-2xs text-muted-foreground">
                          <span className="font-mono tabular-nums">
                            {formatTime(message.sent_at)}
                          </span>
                          {own && !message.failed && (
                            <span
                              className={cn(
                                message.read_at ? "text-primary" : "text-muted-foreground"
                              )}
                              aria-label={message.read_at ? "Sudah dibaca" : "Terkirim"}
                              title={message.read_at ? "Sudah dibaca" : "Terkirim"}
                            >
                              <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                            </span>
                          )}
                          {own && message.failed && (
                            <button
                              type="button"
                              onClick={() => void retry(message)}
                              className="font-medium text-destructive hover:underline"
                            >
                              Gagal terkirim · Coba lagi
                            </button>
                          )}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="flex items-end gap-2 border-t border-outline-variant px-4 py-3">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder="Tulis pesan… (Enter mengirim, Shift+Enter baris baru)"
                  aria-label="Tulis pesan"
                  className={cn(inputClass, "max-h-32 min-h-[48px] flex-1 resize-y py-2")}
                />
                <Button
                  icon={Send}
                  onClick={() => void handleSend()}
                  loading={sending}
                  disabled={!draft.trim()}
                  aria-label="Kirim pesan"
                  type="button"
                >
                  Kirim
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>

      <NewThreadDialog
        open={newOpen}
        users={users}
        me={me}
        onClose={() => setNewOpen(false)}
        onCreated={handleCreated}
        onToast={setToast}
      />

      <AddParticipantDialog
        open={addOpen}
        users={users}
        existing={activeThread?.participant_ids ?? []}
        meId={me.user.id}
        onClose={() => setAddOpen(false)}
        onAdd={addParticipant}
        onToast={setToast}
      />

      <Dialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title="Keluar dari percakapan?"
        description="Anda tidak akan menerima pesan baru dari percakapan ini."
        actions={
          <>
            <Button variant="outlined" onClick={() => setLeaveOpen(false)}>
              Batal
            </Button>
            <Button variant="destructive" onClick={() => void leaveThread()}>
              Keluar
            </Button>
          </>
        }
      />

      <ToastViewport>
        {toast && (
          <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />
        )}
      </ToastViewport>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <DashboardShell
      role="teacher"
      allow={["parent", "admin", "principal", "super_admin"]}
      title="Pesan"
    >
      {(me) => <MessagesContent me={me} />}
    </DashboardShell>
  );
}
