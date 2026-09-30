import * as React from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "./cn";

export interface FormFieldProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  /** Persistent helper text below the field. */
  helper?: string;
  /** Error message; when set, overrides helper and marks the field invalid. */
  error?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Wraps a form control with a visible label, helper text, and error slot.
 * Error renders below the field (never placeholder-only labels).
 */
export function FormField({ label, htmlFor, required, helper, error, className, children }: FormFieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
        {required && (
          <span className="ml-0.5 text-destructive" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          className="flex items-center gap-1 text-xs text-destructive"
        >
          <AlertCircle className="h-3.5 w-3.5" aria-hidden />
          {error}
        </p>
      ) : helper ? (
        <p id={`${htmlFor}-helper`} className="text-xs text-muted-foreground">
          {helper}
        </p>
      ) : null}
    </div>
  );
}

/** Shared input style so raw <input> matches FormField. */
export const inputClass =
  "min-h-[48px] w-full rounded-sm border border-outline bg-background px-3 text-sm text-foreground transition-colors duration-short ease-standard placeholder:text-muted-foreground focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 aria-[invalid=true]:border-destructive";
