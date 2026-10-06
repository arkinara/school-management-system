"use client";
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "./cn";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  /** Action buttons rendered in the footer. */
  actions?: React.ReactNode;
  className?: string;
}

/** M3 modal dialog with scrim, header, body, and actions. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  actions,
  className,
}: DialogProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center p-4">
      {/* Scrim: strong enough to isolate foreground (M3 ~50%) */}
      <div
        className="absolute inset-0 bg-foreground/50 transition-opacity duration-short"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className={cn(
          "relative w-full max-w-md rounded-xl bg-surface-container-high p-6 shadow-md",
          className
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="dialog-title" className="text-lg font-semibold text-foreground">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          <button
            type="button"
            aria-label="Tutup dialog"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-container-highest"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {children && <div className="mt-4 text-sm text-foreground">{children}</div>}
        {actions && <div className="mt-6 flex justify-end gap-2">{actions}</div>}
      </div>
    </div>
  );
}
