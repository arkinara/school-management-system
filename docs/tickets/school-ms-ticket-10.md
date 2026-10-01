# 10. FE: siswa dashboard — today's schedule, assignments, rapor summary

## Description
This ticket builds the Siswa (student) home screen: a today-focused schedule/assignments widget and a rapor summary widget showing recent grades and published-rapor status. It covers the student portion of the PRD's Role-based Dashboard feature, specifically the "Teacher & Student Daily Widgets" sub-feature. The siswa role is the sole consumer of this screen.

## Reference
- PRD feature(s): `## Feature: Role-based Dashboard`
- PRD sub-feature(s): `## Sub-feature: Teacher & Student Daily Widgets` (student portion only)
- PRD path: `docs/PRD.md` lines 307-348

## Design Baseline
- Visual: `prototype-promax/pages/siswa-dashboard.html` at Desktop 1440 (screenshot at `docs/screenshots-promax/siswa-dashboard.png`)
- Design tokens: `prototype-promax/assets/theme.css` — HSL channels for primary/accent/semantic; resolve via Tailwind tokens in `frontend/tailwind.config.ts` and `frontend/src/app/globals.css`
- Typography: Fira Sans (UI) + Fira Code (tabular numerals, `font-variant-numeric: tabular-nums`); both via Google Fonts CDN. Replace Inter everywhere.
- Density: 8/10 — 40px table rows, 13px table text, 4/8px spacing rhythm
- Behavioural:
- Today's schedule rendered as the today-schedule list pattern
- Rapor summary card uses the same bullet-bar grade visualization as parent/principal views
- Attendance trend shown as inline SVG sparkline

## Sub-feature: Today's Schedule & Assignments Widget
Covers rendering the student's today-filtered class schedule (subject, teacher, period/time) and any assignment-like items surfaced for the day, built entirely against typed mock data.

## Sub-feature: Rapor Summary Widget
Covers a summary card showing the student's most recent grades and a published/not-yet-published rapor status indicator for the current semester, built against typed mock data.

## Positive Acceptance Criteria

### Today's Schedule & Assignments Widget
- [ ] On dashboard load, widget renders today's class sessions in chronological order (subject, teacher name, start/end time) from mock data.
- [ ] Widget correctly labels the current day of week and date at the top of the schedule card.
- [ ] When mock data includes more sessions than fit the visible card height, a "view full schedule" affordance links toward the jadwal view page.

### Rapor Summary Widget
- [ ] Widget shows the 3-5 most recent graded entries (subject, score or narrative snippet, category) from mock data.
- [ ] Widget shows a clear "Published" indicator when the mock semester rapor status is published, including a link/button toward the rapor page.
- [ ] Widget shows a clear "Not yet published" indicator when mock rapor status is draft, without exposing a link to view rapor content.

## Negative Acceptance Criteria

### Today's Schedule & Assignments Widget
- [ ] When mock data has zero sessions for today (e.g. weekend/holiday), widget renders an explicit empty state ("No classes today") instead of a blank card.
- [ ] Malformed or missing time fields in a mock session entry do not crash the widget; the entry is skipped or shown with a "time TBD" fallback.
- [ ] Widget shows a loading skeleton state while dashboard data is being prepared, never an unstyled flash of empty content.

### Rapor Summary Widget
- [ ] When mock grade data is empty, widget shows an explicit "No grades recorded yet" message rather than an empty list.
- [ ] Rapor status indicator never renders in an ambiguous/blank state — it always resolves to either "Published" or "Not yet published" even if mock status field is missing (defaults to not-yet-published).
- [ ] Widget shows a loading skeleton state while data is being prepared.

## Tasks
1. Define TypeScript types/interfaces for mock schedule entries and mock rapor/grade summary data.
2. Build static mock data fixtures covering populated, empty, and partial data scenarios.
3. Implement Siswa dashboard route/layout shell (role-gated to siswa).
4. Build Today's Schedule & Assignments widget component consuming the mock data types.
5. Build Rapor Summary widget component consuming the mock data types.
6. Implement loading skeleton and empty states for both widgets.
7. Wire both widgets into the Siswa dashboard page layout with responsive styling per M3 tokens.
8. Add component-level tests for populated, empty, and malformed-data scenarios.

## Out of Scope
- Live API integration for schedule/grades/rapor data — this ticket uses mock data only; wiring to real backend endpoints is deferred to ticket #33 (FE Wiring: siswa).
- The full rapor detail/view page with per-subject breakdown — covered by ticket #19.
- The full jadwal (schedule) view page with weekly toggle — covered by ticket #22.

## Labels
`FE`, `dashboard`

## Estimate
M
