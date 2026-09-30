"use client";
import * as React from "react";
import { GraduationCap, Bell, ChevronDown } from "lucide-react";
import { Avatar } from "./Avatar";
import { cn } from "./cn";

export interface AppBarProps {
  title: string;
  /** e.g. "Kepala Sekolah · SDN Menteng 01" */
  subtitle?: string;
  user: { name: string; src?: string };
  /** Role-aware action slot (e.g. school picker for Yayasan). */
  actions?: React.ReactNode;
  /** Unread notification count for the bell badge. */
  notifications?: number;
  onUserMenu?: () => void;
  className?: string;
}

/** Top app bar: logo, title, role-aware actions, notifications, user menu. */
export function AppBar({
  title,
  subtitle,
  user,
  actions,
  notifications = 0,
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
        <button
          type="button"
          aria-label={notifications > 0 ? `${notifications} notifikasi belum dibaca` : "Notifikasi"}
          className="relative flex h-12 w-12 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-container-high"
        >
          <Bell className="h-5 w-5" aria-hidden />
          {notifications > 0 && (
            <span className="absolute right-2.5 top-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {notifications > 9 ? "9+" : notifications}
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
