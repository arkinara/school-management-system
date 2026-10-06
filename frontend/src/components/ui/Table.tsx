"use client";
import * as React from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "./cn";

export interface Column<Row> {
  key: string;
  header: string;
  /** Renders the cell for a row. Defaults to Row[key]. */
  cell?: (row: Row) => React.ReactNode;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  className?: string;
}

export interface TableProps<Row> {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** Renders per-row action buttons in a trailing column. */
  rowActions?: (row: Row) => React.ReactNode;
  sort?: { key: string; direction: "asc" | "desc" };
  onSort?: (key: string) => void;
  /** Compact reduces row height for dense data. */
  density?: "comfortable" | "compact";
  onDensityChange?: (density: "comfortable" | "compact") => void;
  className?: string;
}

/** Data table with sticky header, sort indicators, row actions, density toggle. */
export function Table<Row>({
  columns,
  rows,
  rowKey,
  rowActions,
  sort,
  onSort,
  density = "comfortable",
  onDensityChange,
  className,
}: TableProps<Row>) {
  const pad = density === "compact" ? "px-3 py-1.5" : "px-4 py-3";
  const alignClass = { left: "text-left", right: "text-right", center: "text-center" };

  return (
    <div className={cn("overflow-hidden rounded-lg border border-outline-variant", className)}>
      {onDensityChange && (
        <div className="flex justify-end border-b border-outline-variant bg-surface-container-low px-3 py-2">
          <button
            type="button"
            onClick={() => onDensityChange(density === "compact" ? "comfortable" : "compact")}
            className="min-h-[48px] rounded-full px-3 text-xs font-medium text-primary hover:bg-surface-container"
          >
            {density === "compact" ? "Kepadatan: Renggang" : "Kepadatan: Rapat"}
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-surface-container">
            <tr>
              {columns.map((col) => {
                const active = sort?.key === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={
                      active ? (sort!.direction === "asc" ? "ascending" : "descending") : undefined
                    }
                    className={cn(
                      "border-b border-outline-variant font-semibold text-muted-foreground",
                      pad,
                      alignClass[col.align ?? "left"],
                      col.className
                    )}
                  >
                    {col.sortable && onSort ? (
                      <button
                        type="button"
                        onClick={() => onSort(col.key)}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {col.header}
                        {active ? (
                          sort!.direction === "asc" ? (
                            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" aria-hidden />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
              {rowActions && (
                <th scope="col" className={cn("border-b border-outline-variant", pad)}>
                  <span className="sr-only">Aksi</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-b border-outline-variant last:border-0 transition-colors duration-short hover:bg-surface-container-low"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(pad, alignClass[col.align ?? "left"], col.className)}
                  >
                    {col.cell ? col.cell(row) : (row as Record<string, React.ReactNode>)[col.key]}
                  </td>
                ))}
                {rowActions && (
                  <td className={cn(pad, "text-right")}>
                    <div className="flex justify-end gap-1">{rowActions(row)}</div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
