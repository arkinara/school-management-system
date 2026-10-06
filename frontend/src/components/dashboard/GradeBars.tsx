import * as React from "react";
import { cn } from "@/components/ui/cn";

export interface GradeBarItem {
  subject: string;
  score: number;
}

export interface GradeBarsProps {
  items: GradeBarItem[];
  ariaLabel: string;
  max?: number;
  className?: string;
}

/** Score → bullet tone per the PRD grading thresholds (pass ≥ 60). */
export function gradeTone(score: number): string {
  if (score >= 80) return "bg-success";
  if (score >= 60) return "bg-warning";
  return "bg-destructive";
}

/**
 * Per-subject bullet bars — inline, no chart library. The numeric score is
 * printed beside every bar so the value is readable without relying on colour.
 */
export function GradeBars({ items, ariaLabel, max = 100, className }: GradeBarsProps) {
  return (
    <ul className={cn("flex flex-col gap-3", className)} aria-label={ariaLabel}>
      {items.map((item) => {
        const pct = Math.max(0, Math.min(100, (item.score / max) * 100));
        return (
          <li key={item.subject}>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-muted-foreground">{item.subject}</span>
              <span className="shrink-0 font-mono font-medium tabular-nums text-foreground">
                {item.score}
              </span>
            </div>
            <div
              className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-3"
              role="img"
              aria-label={`${item.subject}: ${item.score} dari ${max}`}
            >
              <div
                className={cn("h-full rounded-full", gradeTone(item.score))}
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
