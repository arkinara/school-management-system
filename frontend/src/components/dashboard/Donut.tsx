import * as React from "react";
import { cn } from "@/components/ui/cn";
import type { ChipTone } from "@/components/ui/StatusChip";

const STROKE: Record<ChipTone, string> = {
  success: "stroke-success",
  warning: "stroke-warning",
  info: "stroke-info",
  danger: "stroke-destructive",
  neutral: "stroke-outline",
  primary: "stroke-primary",
};

const DOT: Record<ChipTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
  danger: "bg-destructive",
  neutral: "bg-outline",
  primary: "bg-primary",
};

export interface DonutSegment {
  label: string;
  value: number;
  tone: ChipTone;
}

export interface DonutProps {
  segments: DonutSegment[];
  centerValue: string | number;
  centerLabel: string;
  ariaLabel: string;
  size?: number;
  className?: string;
}

/**
 * Hand-rolled donut ring (inline SVG, no chart library). Values are also
 * printed in the legend below so the chart never relies on colour alone.
 */
export function Donut({
  segments,
  centerValue,
  centerLabel,
  ariaLabel,
  size = 132,
  className,
}: DonutProps) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className={cn("flex flex-wrap items-center gap-4", className)}>
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox="0 0 128 128"
        width={size}
        height={size}
        className="shrink-0"
      >
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          strokeWidth="16"
          className="stroke-surface-3"
        />
        {total > 0 &&
          segments.map((segment) => {
            const length = (segment.value / total) * circumference;
            const dashOffset = -offset;
            offset += length;
            return (
              <circle
                key={segment.label}
                cx="64"
                cy="64"
                r={radius}
                fill="none"
                strokeWidth="16"
                className={STROKE[segment.tone]}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={dashOffset}
                transform="rotate(-90 64 64)"
              />
            );
          })}
        <text
          x="64"
          y="60"
          textAnchor="middle"
          className="fill-foreground font-mono text-xl font-semibold tabular-nums"
        >
          {centerValue}
        </text>
        <text
          x="64"
          y="78"
          textAnchor="middle"
          className="fill-muted-foreground text-[9px] uppercase tracking-wide"
        >
          {centerLabel}
        </text>
      </svg>

      <ul className="flex min-w-0 flex-col gap-1.5 text-sm">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center gap-2">
            <span
              className={cn("h-2.5 w-2.5 shrink-0 rounded-full", DOT[segment.tone])}
              aria-hidden
            />
            <span className="text-muted-foreground">{segment.label}</span>
            <span className="ml-auto font-mono font-medium tabular-nums text-foreground">
              {segment.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
