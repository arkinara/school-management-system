"use client";

import * as React from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";

export interface WidgetProps<T> {
  /** Stable cache key. Changing it refetches, like a query key. */
  queryKey: readonly unknown[];
  queryFn: () => Promise<T>;
  render: (data: T) => React.ReactNode;
  /** Optional predicate: true renders the empty state instead of `render`. */
  emptyCheck?: (data: T) => boolean;
}

type WidgetState<T> =
  | { status: "loading"; data: null; error: null }
  | { status: "ready"; data: T; error: null }
  | { status: "error"; data: null; error: unknown };

const keyOf = (key: readonly unknown[]): string => JSON.stringify(key);

/**
 * Independent async widget with its own loading, empty and error states.
 *
 * This is a small, dependency-free equivalent of a React Query wrapper: each
 * widget owns its request, so one failed fetch never blanks the rest of the
 * dashboard. Errors expose a retry button instead of falling through to an
 * "all done" or "no data" state.
 */
export function Widget<T>({ queryKey, queryFn, render, emptyCheck }: WidgetProps<T>) {
  const [state, setState] = React.useState<WidgetState<T>>({
    status: "loading",
    data: null,
    error: null,
  });
  const [retryKey, setRetryKey] = React.useState(0);
  const queryFnRef = React.useRef(queryFn);
  queryFnRef.current = queryFn;
  const key = keyOf(queryKey);

  React.useEffect(() => {
    let active = true;
    setState({ status: "loading", data: null, error: null });
    queryFnRef
      .current()
      .then((data) => {
        if (active) setState({ status: "ready", data, error: null });
      })
      .catch((error: unknown) => {
        if (active) setState({ status: "error", data: null, error });
      });
    return () => {
      active = false;
    };
  }, [key, retryKey]);

  if (state.status === "loading") return <Skeleton className="h-20 w-full rounded-lg" />;

  if (state.status === "error") {
    return (
      <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3">
        <p className="text-sm text-rose-900">Gagal memuat data</p>
        <button
          type="button"
          onClick={() => setRetryKey((value) => value + 1)}
          className="mt-1 inline-flex items-center gap-1 text-xs text-rose-700 underline"
        >
          <RotateCcw className="h-3 w-3" aria-hidden />
          Coba lagi
        </button>
      </div>
    );
  }

  if (state.data == null) {
    return <p className="text-sm text-stone-500">Tidak ada data</p>;
  }
  if (emptyCheck && emptyCheck(state.data)) {
    return <p className="text-sm text-stone-500">Tidak ada data</p>;
  }

  return <>{render(state.data)}</>;
}

/** Inline error used by pages that keep their own request state. */
export function WidgetError({
  title = "Gagal memuat data",
  onRetry,
}: {
  title?: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3">
      <p className="text-sm text-rose-900">{title}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex items-center gap-1 text-xs text-rose-700 underline"
        >
          <AlertCircle className="h-3 w-3" aria-hidden />
          Coba lagi
        </button>
      )}
    </div>
  );
}
