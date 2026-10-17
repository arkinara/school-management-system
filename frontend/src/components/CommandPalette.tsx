"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

const ROUTES = [
  { label: "Dashboard", path: "/dashboard" },
  { label: "Dashboard principal", path: "/dashboard/principal" },
  { label: "Dashboard guru", path: "/dashboard/guru" },
  { label: "Absensi (guru)", path: "/dashboard/guru/absensi" },
  { label: "Nilai (guru)", path: "/dashboard/guru/grades" },
  { label: "Jadwal (guru)", path: "/dashboard/guru/jadwal" },
  { label: "Dashboard siswa", path: "/dashboard/siswa" },
  { label: "Rapor (siswa)", path: "/dashboard/siswa/rapor" },
  { label: "Jadwal (siswa)", path: "/dashboard/siswa/today" },
  { label: "Dashboard orang tua", path: "/dashboard/orang-tua" },
  { label: "Rapor (ortu)", path: "/dashboard/orang-tua/rapor" },
  { label: "Jadwal (ortu)", path: "/dashboard/orang-tua/jadwal" },
  { label: "SPP pembayaran (TU)", path: "/dashboard/tu/spp/payments" },
  { label: "SPP generate (TU)", path: "/dashboard/tu/spp/generate" },
  { label: "Pengumuman (TU)", path: "/dashboard/tu/announcements" },
  { label: "Dashboard yayasan", path: "/dashboard/yayasan" },
] as const;

/**
 * Global navigation palette. Ctrl/Cmd+K toggles, Escape closes, and choosing a
 * result routes to the target page without a full reload.
 */
export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const router = useRouter();

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filtered = ROUTES.filter((route) =>
    route.label.toLowerCase().includes(query.trim().toLowerCase())
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Palet perintah"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-32"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-lg bg-surface-container-low shadow-xl">
        <div className="flex items-center gap-2 border-b border-outline-variant px-3">
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ketik untuk navigasi…"
            aria-label="Cari halaman"
            className="w-full bg-transparent p-3 text-sm text-foreground outline-none"
          />
        </div>
        <ul className="max-h-80 overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="p-3 text-sm text-muted-foreground">Tidak ada hasil</li>
          ) : (
            filtered.map((route) => (
              <li key={route.path}>
                <button
                  type="button"
                  onClick={() => {
                    router.push(route.path);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-surface-container-high"
                >
                  <span className="font-medium text-foreground">{route.label}</span>
                  <small className="font-mono text-2xs text-muted-foreground">{route.path}</small>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
