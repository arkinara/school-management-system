import * as React from "react";
import { cn } from "./cn";

/** Base shimmer block. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-sm bg-surface-container-highest", className)}
      {...props}
    />
  );
}

/** Content-shape placeholder for a vertical list. */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Placeholder matching the Table shape. */
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-busy>
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-7 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Placeholder matching the Card shape. */
export function SkeletonCard() {
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-low p-5" aria-busy>
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="mt-4 h-8 w-1/3" />
      <Skeleton className="mt-3 h-3 w-2/3" />
    </div>
  );
}
