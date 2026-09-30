import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "./cn";

export interface SearchBarProps {
  placeholder?: string;
  defaultValue?: string;
  /** Fired after the debounce window (default 300ms). */
  onSearch: (value: string) => void;
  debounceMs?: number;
  className?: string;
  "aria-label"?: string;
}

/** Search input with debounce and a clear button. */
export function SearchBar({
  placeholder = "Cari…",
  defaultValue = "",
  onSearch,
  debounceMs = 300,
  className,
  ...props
}: SearchBarProps) {
  const [value, setValue] = React.useState(defaultValue);
  const timer = React.useRef<ReturnType<typeof setTimeout>>();

  const emit = React.useCallback(
    (next: string) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => onSearch(next), debounceMs);
    },
    [onSearch, debounceMs]
  );

  React.useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div
      className={cn(
        "flex min-h-[48px] items-center gap-2 rounded-full border border-outline bg-surface-container px-4 transition-colors duration-short focus-within:border-primary focus-within:ring-2 focus-within:ring-ring",
        className
      )}
    >
      <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
      <input
        type="search"
        aria-label={props["aria-label"] ?? placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          emit(e.target.value);
        }}
        className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          aria-label="Bersihkan pencarian"
          onClick={() => {
            setValue("");
            onSearch("");
          }}
          className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-container-highest"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
