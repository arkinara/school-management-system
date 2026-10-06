import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "./cn";

export interface Segment<T extends string = string> {
  value: T;
  label: string;
}

export interface SegmentedButtonProps<T extends string = string> {
  options: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Show a check icon on the selected segment (M3 default). */
  showCheck?: boolean;
  className?: string;
  "aria-label"?: string;
}

/** M3 segmented button group for mutually-exclusive filters. */
export function SegmentedButton<T extends string = string>({
  options,
  value,
  onChange,
  showCheck = true,
  className,
  ...props
}: SegmentedButtonProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={props["aria-label"]}
      className={cn("inline-flex overflow-hidden rounded-full border border-outline", className)}
    >
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex min-h-[48px] items-center justify-center gap-1.5 px-4 text-sm font-medium transition-colors duration-short ease-standard",
              i > 0 && "border-l border-outline",
              selected
                ? "bg-secondary-container text-secondary-container-foreground"
                : "bg-transparent text-foreground hover:bg-surface-container-high"
            )}
          >
            {selected && showCheck && <Check className="h-4 w-4" aria-hidden />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
