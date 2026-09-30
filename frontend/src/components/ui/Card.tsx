import * as React from "react";
import { cn } from "./cn";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Raised cards get a subtle tonal lift + shadow on hover. */
  interactive?: boolean;
}

/** M3 tonal card. Compose with CardHeader / CardBody / CardActions slots. */
export function Card({ interactive, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-outline-variant bg-surface-container-low text-foreground",
        interactive &&
          "cursor-pointer transition-shadow duration-short ease-standard hover:bg-surface-container hover:shadow-sm focus-visible:shadow-sm",
        className
      )}
      {...(interactive ? { tabIndex: 0 } : {})}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-5 pt-5", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("text-base font-semibold leading-tight", className)} {...props}>
      {children}
    </h3>
  );
}

export function CardBody({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("px-5 py-4 text-sm text-muted-foreground", className)} {...props}>
      {children}
    </div>
  );
}

export function CardActions({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center justify-end gap-2 px-5 pb-4", className)} {...props}>
      {children}
    </div>
  );
}
