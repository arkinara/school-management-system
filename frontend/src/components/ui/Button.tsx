import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "./cn";

type Variant = "filled" | "tonal" | "outlined" | "text" | "destructive";

const variantMap: Record<Variant, string> = {
  filled: "bg-primary text-primary-foreground hover:shadow-sm active:scale-[0.98]",
  tonal: "bg-secondary-container text-secondary-container-foreground hover:shadow-sm",
  outlined: "border border-outline bg-transparent text-primary hover:bg-surface-container-high",
  text: "bg-transparent text-primary hover:bg-surface-container-high",
  destructive: "bg-destructive text-destructive-foreground hover:shadow-sm active:scale-[0.98]",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: LucideIcon;
  loading?: boolean;
}

/** M3 button with all interactive states (hover/focus/pressed/disabled). */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "filled", icon: Icon, loading, className, children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition-all duration-short ease-standard focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40",
        variantMap[variant],
        className
      )}
      {...props}
    >
      {loading && (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      )}
      {!loading && Icon && <Icon className="h-4.5 w-4.5" aria-hidden />}
      {children}
    </button>
  );
});
