import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "./cn";

export interface FABProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  /** Optional label turns the FAB into an extended FAB. */
  label?: string;
}

/** M3 floating action button. Regular (icon-only) or extended (icon + label). */
export function FAB({ icon: Icon, label, className, ...props }: FABProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-[56px] items-center justify-center gap-2 rounded-lg bg-primary-container text-primary-container-foreground shadow-sm transition-all duration-short ease-standard hover:shadow-md active:scale-95 disabled:pointer-events-none disabled:opacity-40",
        label ? "px-5" : "w-14",
        className
      )}
      {...props}
    >
      <Icon className="h-6 w-6" aria-hidden />
      {label && <span className="text-sm font-medium">{label}</span>}
    </button>
  );
}
