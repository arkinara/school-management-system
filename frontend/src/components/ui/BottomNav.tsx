import * as React from "react";
import { type NavItem } from "./nav-items";
import { cn } from "./cn";

export interface BottomNavProps {
  items: NavItem[];
  active: string;
  onNavigate?: (item: NavItem) => void;
  className?: string;
}

/**
 * Mobile bottom navigation. Renders at most 5 items (M3 bottom-nav-limit).
 * Hidden on md+ where NavRail takes over.
 */
export function BottomNav({ items, active, onNavigate, className }: BottomNavProps) {
  const shown = items.slice(0, 5);
  return (
    <nav
      aria-label="Navigasi utama"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex border-t border-outline-variant bg-surface-container-low pb-[env(safe-area-inset-bottom)] md:hidden",
        className
      )}
    >
      {shown.map((item) => {
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
            className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5"
          >
            <span
              className={cn(
                "flex h-8 w-16 items-center justify-center rounded-full transition-colors duration-short ease-standard",
                isActive
                  ? "bg-secondary-container text-secondary-container-foreground"
                  : "text-muted-foreground"
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
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
