/**
 * Minimal className joiner. Filters falsy values so components can write
 * `cn("base", condition && "variant")` without pulling in clsx.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
