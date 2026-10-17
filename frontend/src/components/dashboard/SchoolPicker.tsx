"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { fetchTenants } from "@/lib/endpoints";

export interface SchoolPickerOption {
  id: number;
  name: string;
  tenant_id: number;
}

export interface SchoolPickerProps {
  schools: SchoolPickerOption[];
  value: number | null;
  onChange: (schoolId: number) => void;
  /** Optional preloaded tenant names, keyed by tenant id. */
  tenantNames?: Record<number, string>;
  /** Optional preloaded tenant list; takes precedence over the fetch. */
  tenants?: { id: number; name: string }[];
  className?: string;
}

/**
 * Yayasan-only school selector for the shared dashboard shell. Groups schools
 * by tenant and shows the real tenant name (falling back to a neutral group
 * label until the tenant list resolves).
 */
export function SchoolPicker({
  schools,
  value,
  onChange,
  tenantNames,
  tenants,
  className,
}: SchoolPickerProps) {
  const [fetchedTenants, setFetchedTenants] = React.useState<{ id: number; name: string }[]>([]);

  React.useEffect(() => {
    if (tenants && tenants.length > 0) return;
    if (tenantNames && Object.keys(tenantNames).length > 0) return;
    let active = true;
    fetchTenants()
      .then((rows) => {
        if (active) setFetchedTenants(rows.map((row) => ({ id: row.id, name: row.name })));
      })
      .catch(() => {
        /* Keep the neutral group label; the school list still works. */
      });
    return () => {
      active = false;
    };
  }, [tenantNames, tenants]);

  if (schools.length === 0) {
    return (
      <span
        className={cn(
          "inline-flex min-h-9 items-center rounded-full border border-outline-variant px-3 text-xs text-muted-foreground",
          className
        )}
      >
        Tidak ada sekolah
      </span>
    );
  }

  const names = new Map<number, string>();
  for (const tenant of tenants ?? fetchedTenants) {
    names.set(tenant.id, tenant.name);
  }
  for (const [id, name] of Object.entries(tenantNames ?? {})) {
    names.set(Number(id), name);
  }

  const groups = new Map<number, SchoolPickerOption[]>();
  for (const school of schools) {
    const bucket = groups.get(school.tenant_id);
    if (bucket) bucket.push(school);
    else groups.set(school.tenant_id, [school]);
  }

  return (
    <label className={cn("relative inline-flex items-center", className)}>
      <span className="sr-only">Pilih sekolah</span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-h-9 appearance-none rounded-full border border-outline-variant bg-surface-container-low py-1 pl-3 pr-8 text-xs font-medium text-foreground"
      >
        {[...groups.entries()].map(([tenantId, tenantSchools]) => (
          <optgroup key={tenantId} label={names.get(tenantId) ?? `Grup ${tenantId}`}>
            {tenantSchools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-muted-foreground"
        aria-hidden
      />
    </label>
  );
}
