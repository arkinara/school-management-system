import * as React from "react";
import { cn } from "./cn";

const sizeMap = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-xl",
} as const;

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Full name; used to derive initials when no image is present. */
  name: string;
  src?: string;
  size?: keyof typeof sizeMap;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}

/** Circular avatar with image variant and initials fallback. */
export function Avatar({ name, src, size = "md", className, ...props }: AvatarProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-primary-container font-medium text-primary-container-foreground",
        sizeMap[size],
        className
      )}
      {...props}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden>{initials(name).toUpperCase()}</span>
      )}
    </span>
  );
}
