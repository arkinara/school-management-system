"use client";

import * as React from "react";
import { AlertCircle, GitCompare, RotateCcw, School as SchoolIcon } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  fetchYayasanCompare,
  type YayasanCompareSchool,
  type YayasanTenantSummary,
} from "@/lib/endpoints";

const MIN_SCHOOLS = 2;
const MAX_SCHOOLS = 3;

type CompareStatus = "idle" | "loading" | "ready" | "error";

/**
 * Super_admin tool: pick 2-3 schools (across tenants) and compare their active
 * enrollment and per-class headcount side-by-side.
 *
 * Every state is real — the widget never fabricates a comparison. Fewer than two
 * selections show a prompt, a failed request shows an auditable error state, and
 * a tenant set with no schools shows an empty state.
 */
export function SchoolComparisonWidget({ tenants }: { tenants: YayasanTenantSummary[] }) {
  const [selected, setSelected] = React.useState<number[]>([]);
  const [status, setStatus] = React.useState<CompareStatus>("idle");
  const [schools, setSchools] = React.useState<YayasanCompareSchool[]>([]);
  const [reloadKey, setReloadKey] = React.useState(0);

  const enabled = selected.length >= MIN_SCHOOLS && selected.length <= MAX_SCHOOLS;
  const selectionKey = enabled ? [...selected].sort((a, b) => a - b).join(",") : "";

  React.useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      setSchools([]);
      return;
    }
    let active = true;
    setStatus("loading");
    fetchYayasanCompare([...selected].sort((a, b) => a - b))
      .then((result) => {
        if (!active) return;
        setSchools(result.schools);
        setStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setSchools([]);
        setStatus("error");
      });
    return () => {
      active = false;
    };
    // `selectionKey` captures the sorted selection; `reloadKey` forces a retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey, reloadKey]);

  function toggle(id: number) {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= MAX_SCHOOLS) return current;
      return [...current, id];
    });
  }

  const totalSchools = tenants.reduce((sum, tenant) => sum + tenant.schools.length, 0);

  return (
    <Card>
      <CardHeader className="items-center border-b border-outline-variant pb-3">
        <CardTitle className="flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-primary" aria-hidden />
          Bandingkan Sekolah
        </CardTitle>
        <span className="font-mono text-2xs tabular-nums text-muted-foreground">
          {selected.length}/{MAX_SCHOOLS}
        </span>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        {totalSchools === 0 ? (
          <EmptyState
            icon={SchoolIcon}
            title="Belum ada sekolah"
            description="Belum ada sekolah yang terdaftar untuk dibandingkan."
          />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Pilih {MIN_SCHOOLS}–{MAX_SCHOOLS} sekolah untuk membandingkan (maks {MAX_SCHOOLS}).
            </p>
            <div className="flex flex-col gap-3">
              {tenants
                .filter((tenant) => tenant.schools.length > 0)
                .map((tenant) => (
                  <fieldset
                    key={tenant.id}
                    className="rounded-lg border border-outline-variant p-3"
                  >
                    <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {tenant.name}
                    </legend>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {tenant.schools.map((school) => {
                        const checked = selected.includes(school.id);
                        return (
                          <label
                            key={school.id}
                            className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={checked}
                              disabled={!checked && selected.length >= MAX_SCHOOLS}
                              onChange={() => toggle(school.id)}
                            />
                            {school.name}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
            </div>
          </>
        )}

        {status === "loading" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy>
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {status === "error" && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/50 bg-destructive-container px-4 py-3 text-destructive-container-foreground"
          >
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1 text-sm">Gagal memuat perbandingan sekolah.</p>
            <Button
              variant="outlined"
              icon={RotateCcw}
              className="min-h-10 px-3 text-xs"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              Coba lagi
            </Button>
          </div>
        )}

        {status === "ready" && schools.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {schools.map((school) => (
              <div
                key={school.id}
                className="rounded-lg border border-outline-variant bg-surface-container-low p-3"
              >
                <h4 className="text-sm font-semibold text-foreground">{school.name}</h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  {school.jenjang ? `${school.jenjang} · ` : ""}Siswa aktif:{" "}
                  <span className="font-mono tabular-nums text-foreground">
                    {school.enrollment}
                  </span>
                </p>
                <h5 className="mt-3 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Kelas
                </h5>
                {school.classes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Belum ada kelas.</p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {school.classes.map((klass) => (
                      <li
                        key={klass.id}
                        className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
                      >
                        <span>{klass.name}</span>
                        <span className="font-mono tabular-nums text-foreground">
                          {klass.enrollment}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
