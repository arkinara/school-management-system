import * as React from "react";
import { cn } from "@/components/ui/cn";

export interface SparklineProps {
  points: number[];
  ariaLabel: string;
  width?: number;
  height?: number;
  className?: string;
}

/**
 * Hand-rolled area sparkline (inline SVG, no chart library). Coordinates are
 * deterministic so server/client markup stays identical.
 */
export function Sparkline({
  points,
  ariaLabel,
  width = 260,
  height = 64,
  className,
}: SparklineProps) {
  const pad = 4;
  const safePoints = points.length >= 2 ? points : [0, 0];
  const min = Math.min(...safePoints);
  const max = Math.max(...safePoints);
  const range = max - min || 1;
  const stepX = width / (safePoints.length - 1);
  const innerHeight = height - pad * 2;

  const coords = safePoints.map((value, index) => {
    const x = index * stepX;
    const y = height - pad - ((value - min) / range) * innerHeight;
    return [Number(x.toFixed(2)), Number(y.toFixed(2))] as const;
  });

  const line = coords.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className={cn("block", className)}
    >
      <path d={area} className="fill-primary/15" />
      <path
        d={line}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary"
      />
    </svg>
  );
}
