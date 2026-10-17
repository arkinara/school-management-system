import * as React from "react";
import { Sparkline as BaseSparkline } from "@/components/Sparkline";

export interface SparklineProps {
  points: number[];
  ariaLabel: string;
  width?: number;
  height?: number;
  className?: string;
}

/**
 * Backwards-compatible dashboard wrapper around the shared `<Sparkline>`.
 * Callers that still use the `points` prop keep working while new code can use
 * `@/components/Sparkline` directly with `data`.
 */
export function Sparkline({
  points,
  ariaLabel,
  width = 260,
  height = 64,
  className,
}: SparklineProps) {
  return (
    <BaseSparkline
      data={points}
      ariaLabel={ariaLabel}
      width={width}
      height={height}
      className={className}
    />
  );
}
