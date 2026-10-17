import * as React from "react";
import { cn } from "@/components/ui/cn";

export interface SparklineProps {
  /** Numeric series. Fewer than two points renders nothing. */
  data: number[];
  width?: number;
  height?: number;
  ariaLabel?: string;
  className?: string;
}

/**
 * Small dependency-free sparkline. Renders a single `<polyline>` so it is easy
 * to assert in tests and inherits the surrounding text colour.
 */
export function Sparkline({
  data,
  width = 80,
  height = 24,
  ariaLabel = "Tren data",
  className,
}: SparklineProps) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data
    .map((value, index) => {
      const x = index * stepX;
      const y = height - ((value - min) / range) * height;
      return `${Number(x.toFixed(2))},${Number(y.toFixed(2))}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      className={cn("block", className)}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-primary"
      />
    </svg>
  );
}
