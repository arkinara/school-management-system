import * as React from "react";
import { cn } from "@/components/ui/cn";

export interface ProgressItem {
  label: string;
  value: number;
  /** Optional target marker drawn as a vertical tick. */
  target?: number;
  /** Overrides the default `${value}%` right-aligned figure. */
  display?: string;
}

export interface ProgressBarsProps {
  items: ProgressItem[];
  max?: number;
  ariaLabel: string;
  className?: string;
}

/**
 * CSS bullet/bar list — no chart library. Each row pairs a label with a
 * value and an optional target tick so progress is readable as text too.
 */
export function ProgressBars({
  items,
  max = 100,
  ariaLabel,
  className,
}: ProgressBarsProps) {
  return (
    <ul className={cn("flex flex-col gap-3", className)} aria-label={ariaLabel}>
      {items.map((item) => {
        const pct = Math.max(0, Math.min(100, (item.value / max) * 100));
        const targetPct =
          item.target === undefined
            ? undefined
            : Math.max(0, Math.min(100, (item.target / max) * 100));
        return (
          <li key={item.label}>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-muted-foreground">{item.label}</span>
              <span className="shrink-0 font-mono font-medium tabular-nums text-foreground">
                {item.display ?? `${item.value}%`}
              </span>
            </div>
            <div className="relative mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${pct}%` }}
              />
              {targetPct !== undefined && (
                <span
                  className="absolute top-0 h-full w-0.5 bg-foreground/70"
                  style={{ left: `${targetPct}%` }}
                  aria-hidden
                />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
