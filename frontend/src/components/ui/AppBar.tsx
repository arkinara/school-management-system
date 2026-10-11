"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, Bell, ChevronDown } from "lucide-react";
import { Avatar } from "./Avatar";
import { cn } from "./cn";
import { useNotifications } from "@/lib/notifications";

export interface AppBarProps {
  title: string;
  /** e.g. "Kepala Sekolah · SDN Menteng 01" */
  subtitle?: string;
  user: { name: string; src?: string };
  /** Role-aware action slot (e.g. school picker for Yayasan). */
  actions?: React.ReactNode;
  /**
   * Static unread count override (stories/demos). When omitted the bell reads
   * the per-user unread count from the backend via `useNotifications`.
   */
  notifications?: number;
  /** Override the bell click; defaults to opening the in-place dropdown. */
  onNotificationsClick?: () => void;
  /** Destination for the "Lihat semua" link and default navigation. */
  notificationsHref?: string;
  onUserMenu?: () => void;
  className?: string;
}

interface NotificationBellProps {
  countOverride?: number;
  href: string;
}

/**
 * Bell with a per-user, backend-driven unread badge and a dropdown preview of
 * the latest five notifications. Selecting one marks it read server-side and
 * navigates to its role-correct deep link.
 */
function NotificationBell({ countOverride, href }: NotificationBellProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, markRead } = useNotifications();
  const count = countOverride ?? unreadCount;

  React.useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openItem(id: string, link: string) {
    markRead(id);
    setOpen(false);
    router.push(link);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={count > 0 ? `${count} notifikasi belum dibaca` : "Notifikasi"}
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative flex h-12 w-12 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-container-high"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {count > 0 && (
          <span className="absolute right-2.5 top-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 font-mono text-[10px] font-semibold tabular-nums text-destructive-foreground">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Pratinjau notifikasi"
          className="absolute right-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-md border border-outline-variant bg-surface-container-high py-1 shadow-md"
        >
          {notifications.length === 0 ? (
            <p className="px-4 py-4 text-center text-xs text-muted-foreground">
              Belum ada notifikasi.
            </p>
          ) : (
            notifications.slice(0, 5).map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={() => openItem(item.id, item.href)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left transition-colors hover:bg-surface-container-highest",
                  !item.read && "bg-secondary-container/30"
                )}
              >
                <span
                  className={cn(
                    "truncate text-sm",
                    item.read ? "font-medium text-foreground" : "font-semibold text-foreground"
                  )}
                >
                  {item.title}
                </span>
                <span className="line-clamp-2 text-2xs text-muted-foreground">{item.body}</span>
              </button>
            ))
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              router.push(href);
            }}
            className="mt-1 flex w-full items-center justify-center border-t border-outline-variant px-4 py-2 text-xs font-semibold text-primary hover:bg-surface-container-highest"
          >
            Lihat semua
          </button>
        </div>
      )}
    </div>
  );
}

/** Top app bar: logo, title, role-aware actions, notifications, user menu. */
export function AppBar({
  title,
  subtitle,
  user,
  actions,
  notifications,
  onNotificationsClick,
  notificationsHref = "/dashboard/notifications",
  onUserMenu,
  className,
}: AppBarProps) {
  return (
    <header
      className={cn(
        "flex h-16 items-center gap-3 border-b border-outline-variant bg-surface-container-low px-4 sm:px-6",
        className
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <GraduationCap className="h-5 w-5" aria-hidden />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        {actions}
        {onNotificationsClick ? (
          <button
            type="button"
            onClick={onNotificationsClick}
            aria-label="Notifikasi"
            className="relative flex h-12 w-12 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-container-high"
          >
            <Bell className="h-5 w-5" aria-hidden />
          </button>
        ) : (
          <NotificationBell countOverride={notifications} href={notificationsHref} />
        )}
        <button
          type="button"
          onClick={onUserMenu}
          className="flex min-h-[48px] items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-surface-container-high"
        >
          <Avatar name={user.name} src={user.src} size="sm" />
          <span className="hidden text-sm font-medium text-foreground sm:inline">{user.name}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
        </button>
      </div>
    </header>
  );
}
