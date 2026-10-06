import * as React from "react";
import { type LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "./cn";

export interface MetricCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  /** Signed delta, e.g. +12% or -3. Positive renders success, negative danger. */
  delta?: { value: string; direction: "up" | "down" };
  icon?: LucideIcon;
  hint?: string;
}

/** KPI tile: label + big number + optional delta + icon. */
export function MetricCard({
  label,
  value,
  delta,
  icon: Icon,
  hint,
  className,
  ...props
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-outline-variant bg-surface-container-low p-5",
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        {Icon && (
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary-container text-primary-container-foreground">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
        )}
      </div>
      <div className="mt-3 flex items-end gap-2">
        <span className="font-mono text-3xl font-semibold leading-none tabular-nums text-foreground">
          {value}
        </span>
        {delta && (
          <span
            className={cn(
              "mb-0.5 inline-flex items-center gap-0.5 text-xs font-medium",
              delta.direction === "up" ? "text-success" : "text-destructive"
            )}
          >
            {delta.direction === "up" ? (
              <TrendingUp className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" aria-hidden />
            )}
            {delta.value}
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
