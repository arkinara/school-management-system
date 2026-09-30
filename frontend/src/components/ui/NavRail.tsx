import * as React from "react";
import { type NavItem } from "./nav-items";
import { cn } from "./cn";

export interface NavRailProps {
  items: NavItem[];
  /** key of the active item. */
  active: string;
  onNavigate?: (item: NavItem) => void;
  className?: string;
}

/** Desktop left-side navigation rail (icon + label per M3 nav-rail). */
export function NavRail({ items, active, onNavigate, className }: NavRailProps) {
  return (
    <nav
      aria-label="Navigasi utama"
      className={cn(
        "flex h-full w-20 flex-col items-center gap-1 border-r border-outline-variant bg-surface-container-low py-4",
        className
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = item.key === active;
        return (
          <a
            key={item.key}
            href={item.href}
            onClick={(e) => {
              if (onNavigate) {
                e.preventDefault();
                onNavigate(item);
              }
            }}
            aria-current={isActive ? "page" : undefined}
            className="group flex w-full flex-col items-center gap-1 px-2 py-1.5"
          >
            <span
              className={cn(
                "flex h-8 min-h-0 w-14 items-center justify-center rounded-full transition-colors duration-short ease-standard",
                isActive
                  ? "bg-secondary-container text-secondary-container-foreground"
                  : "text-muted-foreground group-hover:bg-surface-container-high"
              )}
            >
              <Icon className="h-6 w-6" aria-hidden />
            </span>
            <span
              className={cn(
                "text-[11px] font-medium",
                isActive ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {item.label}
            </span>
          </a>
        );
      })}
    </nav>
  );
}
