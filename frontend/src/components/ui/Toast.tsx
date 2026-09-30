"use client";
import * as React from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "./cn";

export type ToastTone = "info" | "success" | "warning" | "error";

export interface ToastProps {
  message: string;
  tone?: ToastTone;
  /** Optional undo action rendered as a text button. */
  action?: { label: string; onClick: () => void };
  /** Auto-dismiss delay in ms (default 4000). 0 disables auto-dismiss. */
  duration?: number;
  onDismiss?: () => void;
}

const toneIcon: Record<ToastTone, React.ElementType> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertTriangle,
};

const toneColor: Record<ToastTone, string> = {
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  error: "text-destructive",
};

/** Bottom snackbar. Uses aria-live so it never steals focus. */
export function Toast({ message, tone = "info", action, duration = 4000, onDismiss }: ToastProps) {
  const Icon = toneIcon[tone];

  React.useEffect(() => {
    if (!duration || !onDismiss) return;
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [duration, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto flex min-h-[48px] w-full max-w-md items-center gap-3 rounded-md bg-surface-container-highest px-4 py-3 text-sm text-foreground shadow-md"
    >
      <Icon className={cn("h-5 w-5 shrink-0", toneColor[tone])} aria-hidden />
      <span className="flex-1">{message}</span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="shrink-0 rounded-xs px-2 py-1 text-sm font-semibold text-primary hover:bg-surface-container-high"
        >
          {action.label}
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          aria-label="Tutup"
          onClick={onDismiss}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-container-high"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

/** Fixed viewport container for stacking toasts at the bottom. */
export function ToastViewport({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[1000] flex flex-col items-center gap-2 px-4">
      {children}
    </div>
  );
}
