"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, Bell, ChevronDown } from "lucide-react";
import { Avatar } from "./Avatar";
import { cn } from "./cn";
import { useNotificationCount } from "@/lib/notifications";

export interface AppBarProps {
  title: string;
  /** e.g. "Kepala Sekolah · SDN Menteng 01" */
  subtitle?: string;
  user: { name: string; src?: string };
  /** Role-aware action slot (e.g. school picker for Yayasan). */
  actions?: React.ReactNode;
  /**
   * Static unread count override (stories/demos). When omitted the bell polls
   * the aggregated feed every 30s via `useNotificationCount`.
   */
  notifications?: number;
  /** Override the bell click; defaults to navigating to the feed page. */
  onNotificationsClick?: () => void;
  /** Destination for the default bell action. */
  notificationsHref?: string;
  onUserMenu?: () => void;
  className?: string;
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
  const router = useRouter();
  const liveCount = useNotificationCount();
  const count = notifications ?? liveCount;

  function handleNotifications() {
    if (onNotificationsClick) {
      onNotificationsClick();
      return;
    }
    router.push(notificationsHref);
  }

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
        <button
          type="button"
          onClick={handleNotifications}
          aria-label={count > 0 ? `${count} notifikasi belum dibaca` : "Notifikasi"}
          className="relative flex h-12 w-12 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-container-high"
        >
          <Bell className="h-5 w-5" aria-hidden />
          {count > 0 && (
            <span className="absolute right-2.5 top-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 font-mono text-[10px] font-semibold tabular-nums text-destructive-foreground">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </button>
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
