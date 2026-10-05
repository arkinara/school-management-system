import * as React from "react";
import { cn } from "@/components/ui/cn";

export interface BarListItem {
  label: string;
  value: number;
  /** Overrides the default `${value}` right-aligned figure. */
  display?: string;
  /** Tailwind background utility for the fill; defaults to the primary token. */
  toneClass?: string;
}

export interface BarListProps {
  items: BarListItem[];
  max?: number;
  ariaLabel: string;
  className?: string;
}

/**
 * Horizontal bullet bar list — inline, no chart library. The value is printed
 * beside every bar so the comparison is readable as text, not colour alone.
 */
export function BarList({
  items,
  max,
  ariaLabel,
  className,
}: BarListProps) {
  const domain =
    max ?? Math.max(1, ...items.map((item) => Math.max(0, item.value)));
  return (
    <ul className={cn("flex flex-col gap-3", className)} aria-label={ariaLabel}>
      {items.map((item) => {
        const pct = Math.max(0, Math.min(100, (item.value / domain) * 100));
        return (
          <li key={item.label}>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-muted-foreground">{item.label}</span>
              <span className="shrink-0 font-mono font-medium tabular-nums text-foreground">
                {item.display ?? item.value}
              </span>
            </div>
            <div
              className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-3"
              role="img"
              aria-label={`${item.label}: ${item.value}`}
            >
              <div
                className={cn(
                  "h-full rounded-full",
                  item.toneClass ?? "bg-primary"
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
