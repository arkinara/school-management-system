import * as React from "react";
import { type LucideIcon, Inbox } from "lucide-react";
import { cn } from "./cn";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Primary call-to-action button. */
  action?: React.ReactNode;
  className?: string;
}

/** Friendly empty state: illustration + heading + description + CTA. */
export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-outline-variant bg-surface-container-low px-6 py-12 text-center",
        className
      )}
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-container text-primary-container-foreground">
        <Icon className="h-8 w-8" aria-hidden />
      </span>
      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
