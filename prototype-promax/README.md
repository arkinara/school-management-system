# Prototype Pro Max

A revamp of `prototype/` for the Indonesia K-12 School Management System. Same eleven screens, same roles, same domain language — rebuilt around a **data-dense dashboard** system instead of a spacious card layout.

Open `index.html` in a browser. No build step, no server, no package install.

```
prototype-promax/
  index.html              viewer shell (role tabs, viewport switcher, deep links)
  assets/theme.css        design tokens, density scale, table/skeleton/toast styles
  assets/tw-config.js     Tailwind Play CDN config — maps every colour to a token
  assets/app.js           runtime: icons, app shell, charts, toasts, command palette
  pages/*.html            11 screens
```

## Design system

Resolved with `ui-ux-pro-max --design-system --variance 6 --motion 5 --density 8`.

| Dimension | Choice |
|---|---|
| Pattern | Real-time / operations dashboard |
| Style | Data-Dense Dashboard |
| Primary | `#0D9488` teal — unchanged from the existing prototype, so the brand carries over |
| Accent | `#D97706` amber for CTAs and "needs attention" |
| Typography | Fira Sans (UI) + Fira Code (all figures, tabular) |
| Density | 8/10 — 40px table rows, 13px table text, 4/8px spacing rhythm |
| Motion | 5/10 — 180–260ms, 40ms stagger, transform/opacity only |

Every colour in markup resolves to a semantic token (`bg-surface-1`, `text-warning`). No raw hex appears in a component.

## What changed from `prototype/`

**Information density.** Row height dropped from comfortable to 40px, body text to 13px in tables, spacing rhythm to 4/8px. Roughly 60% more rows fit the same viewport.

**Real data visualisation.** Hand-rolled inline SVG — sparklines, donuts, ranked bars, and bullet charts — with no chart library and no external request. The bullet chart (value, target marker, qualitative bands) replaces bare percentages wherever a number has a target: attendance vs 95%, SPP collection vs 90%, grades vs KKM. Every chart prints its numbers as text and carries an `aria-label`, so none of them depend on reading a shape.

**Tabular figures.** All numerals render in Fira Code with `font-variant-numeric: tabular-nums`, so currency and percentage columns align and don't jitter when values change.

**Sortable tables.** `aria-sort` stays in sync with the visual state; sorting is numeric where a `data-value` is present, locale-aware (`id`) otherwise. Headers stick on scroll.

**Bulk actions.** The TU arrears table has select-all / indeterminate / per-row selection feeding one "send reminder" action — 86 arrears is not a per-row workflow.

**Command palette.** Ctrl/Cmd+K from any screen. Focus is trapped while open, Esc exits, focus returns to the trigger.

**Adaptive navigation.** Bottom bar below 768px (max 5 destinations), icon rail 768–1279px, icon + label rail from 1280px. Icon and text at every size — an icon-only nav costs discoverability.

**Deep linking.** The viewer encodes state as `#page=<id>&vp=<id>&theme=dark`, so any screen at any viewport is a shareable URL.

**State coverage.** `form-patterns.html` now carries loading skeletons, empty states with an action, error states naming both cause and recovery, offline notice, every input state, and the full status-chip vocabulary.

**Keyboard attendance entry.** Focus a roster row and press `H` / `I` / `S` / `A`. Faster than four taps per student across a roster of 32.

**Undo.** Approve, reject, mark-all-present, and bulk reminders all route through a toast with an undo path rather than a confirmation dialog.

## Accessibility

- Skip link on every page; focus rings never removed.
- Touch targets ≥ 44px with ≥ 8px separation.
- Status is never colour alone — every chip pairs a tone with an icon and a word.
- `success` and `warning` tokens are darkened in light mode specifically so they clear 4.5:1 as small text.
- Toasts announce through a polite live region and never steal focus; form errors use `role="alert"` and move focus to the first invalid field.
- `prefers-reduced-motion` disables animation; `print` styles strip chrome so rapor prints cleanly.
- Both themes defined independently — dark mode is a separate tonal palette, not an inversion.

## Not verified

The pages have been syntax-checked, not opened in a browser from this session (no headless browser available here). Visual regression against the old prototype, and the 375 / 768 / 1440 breakpoint pass, still need a real render.
