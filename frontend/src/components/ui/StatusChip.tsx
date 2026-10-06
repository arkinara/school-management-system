import * as React from "react";
import { cn } from "./cn";

/**
 * Color-coded status pill. Tone is chosen by semantic role, not raw color,
 * so the same component serves absensi, rapor, and SPP domains.
 */
export type ChipTone = "success" | "warning" | "info" | "danger" | "neutral" | "primary";

const toneMap: Record<ChipTone, string> = {
  success: "bg-success-container text-success",
  warning: "bg-warning-container text-warning",
  info: "bg-info-container text-info",
  danger: "bg-destructive-container text-destructive-container-foreground",
  neutral: "bg-surface-container-high text-muted-foreground",
  primary: "bg-primary-container text-primary-container-foreground",
};

/** Maps common domain statuses to a tone. Falls back to neutral. */
export const statusTone: Record<string, ChipTone> = {
  // absensi
  hadir: "success",
  izin: "warning",
  sakit: "info",
  alpa: "danger",
  // rapor
  published: "success",
  draft: "neutral",
  // SPP
  paid: "success",
  unpaid: "warning",
  overdue: "danger",
};

export interface StatusChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone;
  /** Optional leading dot indicator. */
  dot?: boolean;
  children: React.ReactNode;
}

export function StatusChip({
  tone = "neutral",
  dot,
  className,
  children,
  ...props
}: StatusChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium capitalize",
        toneMap[tone],
        className
      )}
      {...props}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
