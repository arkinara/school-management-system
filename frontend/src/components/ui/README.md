# UI Component Library — School Management System

M3-based React/TSX components. Styled with Tailwind tokens (see `tailwind.config.ts` + `globals.css`). **No raw hex in components** — every color goes through a semantic token. Icons: `lucide-react`.

Import from the `ui/` folder, e.g. `import { Card } from "@/components/ui/Card"`.

Demo everything: render `<ComponentGallery />` from `index.stories.tsx`.

---

## Tokens
- Colors: `primary`, `primary-container`, `secondary`, `tertiary`, `destructive`, `success`, `warning`, `info`, `surface-container(-low/high/highest)`, `outline`, `outline-variant`, `border`, `muted`.
- Radii: `xs 4 / sm 8 / md 12 / lg 16 / xl 28 / full`.
- Motion: `duration-short` (200ms) + `ease-standard`.
- Dark mode: `class` strategy — toggle `.dark` on `<html>`.

## Components

### AppBar
Top bar: logo, title/subtitle, role actions, notification bell w/ badge, user menu.
```tsx
<AppBar title="SDN Menteng 01" subtitle="Kepala Sekolah"
  user={{ name: "Budi Santoso" }} notifications={3} actions={<SchoolPicker/>} />
```
Props: `title`, `subtitle?`, `user{name,src?}`, `actions?`, `notifications?`, `onUserMenu?`.
States: bell badge (0 → hidden), hover on menu/bell.

### Button
M3 button. Variants: `filled | tonal | outlined | text | destructive`.
```tsx
<Button variant="tonal" icon={Plus} loading={saving}>Simpan</Button>
```
States: default / hover (shadow) / focus-visible (ring) / pressed (scale) / disabled (opacity) / loading (spinner).

### Card + slots
`Card`, `CardHeader`, `CardTitle`, `CardBody`, `CardActions`.
```tsx
<Card interactive><CardHeader><CardTitle>…</CardTitle></CardHeader><CardBody>…</CardBody></Card>
```
Props: `interactive?` (hover elevation + focusable).

### StatusChip
Color-coded pill. Tones: `success | warning | info | danger | neutral | primary`. Helper `statusTone` maps `hadir/izin/sakit/alpa`, `draft/published`, `paid/unpaid/overdue`.
```tsx
<StatusChip tone={statusTone[s] ?? "neutral"} dot>{s}</StatusChip>
```

### SegmentedButton
Radio-group filter pills. `showCheck` on selected.
```tsx
<SegmentedButton value={v} onChange={setV} options={[{value:"hadir",label:"Hadir"}]} aria-label="Status" />
```
States: selected (secondary-container) / hover / focus. Min 48px targets.

### MetricCard
KPI tile: label + big number + delta + icon.
```tsx
<MetricCard label="Total Siswa" value={482} icon={Users} delta={{value:"+12",direction:"up"}} hint="…" />
```
Delta `up` → success, `down` → destructive. Tabular figures.

### NavRail (desktop) / BottomNav (mobile)
Role-aware. Feed items from `navByRole[role]`. BottomNav auto-slices to 5, hidden `md+`.
```tsx
<NavRail items={navByRole.guru} active="home" onNavigate={go} />
<BottomNav items={navByRole.guru} active="home" onNavigate={go} />
```
States: active (secondary-container pill + `aria-current`) / hover.

### Dialog
Modal + scrim (50%), Esc-to-close, focus-labelled.
```tsx
<Dialog open={o} onClose={close} title="Terbitkan Rapor?" description="…" actions={<>…</>}>body</Dialog>
```

### FAB
Floating action button; add `label` for extended FAB. Min 56px.
```tsx
<FAB icon={Plus} label="Input Absensi" />
```

### Table
Sticky header, sortable columns (`aria-sort`), row actions, density toggle.
```tsx
<Table columns={cols} rows={rows} rowKey={r=>r.id}
  sort={sort} onSort={onSort} density={d} onDensityChange={setD}
  rowActions={r=><Button variant="text">Edit</Button>} />
```
`Column`: `{ key, header, cell?, sortable?, align?, className? }`.

### Avatar
Image or initials fallback. Sizes `sm | md | lg | xl`.
```tsx
<Avatar name="Siti Aminah" src={url} size="md" />
```

### EmptyState
Icon + heading + description + CTA.
```tsx
<EmptyState icon={FileSearch} title="Belum ada rapor" description="…" action={<Button/>} />
```

### Skeleton
`Skeleton` base + `SkeletonList`, `SkeletonTable`, `SkeletonCard` shapes. `aria-busy`.
```tsx
{loading ? <SkeletonTable rows={6} cols={4}/> : <Table .../>}
```

### SearchBar
Debounced (default 300ms), clear button, search icon. Min 48px.
```tsx
<SearchBar placeholder="Cari siswa…" onSearch={q=>setQuery(q)} debounceMs={300} />
```

### FormField
Label + control + helper/error. Export `inputClass` for raw inputs.
```tsx
<FormField label="Email" htmlFor="email" required error={err} helper="…">
  <input id="email" className={inputClass} aria-invalid={!!err} />
</FormField>
```
Error uses `role="alert"`; overrides helper.

### Toast + ToastViewport
Bottom snackbar, `aria-live="polite"` (no focus steal), auto-dismiss (4s), optional undo.
```tsx
<ToastViewport><Toast tone="success" message="Tersimpan." action={{label:"Urungkan",onClick:undo}} onDismiss={close}/></ToastViewport>
```

---

## Invariants honored
- 48px+ touch targets on all interactive elements.
- All M3 states: default / hover / focus / pressed / disabled.
- `prefers-reduced-motion` respected globally (`globals.css`).
- Semantic tokens only — no raw hex.
- lucide-react icons, no emoji as structural icons.
