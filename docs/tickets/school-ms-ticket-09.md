# 9. FE: guru dashboard — today's classes, pending grade entry, attendance queue

## Description
This ticket builds the guru's home screen per PRD Requirements > Dashboard, rendering today's teaching sessions plus attendance-taken status and pending grade-entry flags, against typed mock/placeholder data. It covers the teacher portion of the "Teacher & Student Daily Widgets" sub-feature; live API wiring is deferred to the paired FE-wiring ticket. Role: Guru (teacher, including Wali Kelas).

## Reference
- PRD feature(s): `## Feature: Role-based Dashboard`
- PRD sub-feature(s): `## Sub-feature: Teacher & Student Daily Widgets` (teacher portion only)
- PRD path: `docs/PRD.md` lines 307-348

## Design Baseline
- Visual: `prototype-promax/pages/guru-dashboard.html` at Desktop 1440 (screenshot at `docs/screenshots-promax/guru-dashboard.png`)
- Design tokens: `prototype-promax/assets/theme.css` — HSL channels for primary/accent/semantic; resolve via Tailwind tokens in `frontend/tailwind.config.ts` and `frontend/src/app/globals.css`
- Typography: Fira Sans (UI) + Fira Code (tabular numerals, `font-variant-numeric: tabular-nums`); both via Google Fonts CDN. Replace Inter everywhere.
- Density: 8/10 — 40px table rows, 13px table text, 4/8px spacing rhythm
- Behavioural:
- Today's classes rendered as an inline timeline (see today-timeline block)
- Pending grade-entry queue is a sortable table with `aria-sort` + `data-value` sync
- Notification bell + count badge pattern from `assets/app.js`

## Sub-feature: Today's Classes Widget
Render the list of the logged-in teacher's teaching sessions scheduled for today, sourced from typed mock data.

## Sub-feature: Pending Grade Entry & Attendance Queue Widget
Render per-class-session attendance-taken status and flag subjects/classes with pending (incomplete) grade entries, sourced from typed mock data.

## Positive Acceptance Criteria

### Today's Classes Widget
- [ ] Guru dashboard renders a list of today's teaching sessions (class name, subject, period/time) sorted by period_number, from a typed mock data module.
- [ ] Each session entry shows enough detail (class, subject, start-end time) to match the eventual jadwal API response shape.
- [ ] Widget correctly displays multiple sessions on the same day without visual overlap.
- [ ] Mock data module is structured so a future fetch-call swap (ticket #32) requires no widget-component changes.

### Pending Grade Entry & Attendance Queue Widget
- [ ] Each of today's class sessions shows an attendance-taken indicator (taken/not-taken) sourced from mock attendance-status data.
- [ ] Subjects/classes with incomplete grade entries are visually flagged (e.g. badge/count) distinct from fully-graded ones.
- [ ] Clicking/tapping a pending grade-entry flag surfaces which class/subject/category is incomplete, per the mock dataset.

## Negative Acceptance Criteria

### Today's Classes Widget
- [ ] When the mock dataset has no sessions for today (e.g. weekend), the widget renders an explicit empty state ("No classes scheduled today") rather than a blank area.
- [ ] A simulated loading state (artificial delay in mock data resolution) shows a skeleton/spinner, not a blank screen.
- [ ] A simulated error state (mock data rejection) shows an inline error message without crashing the rest of the dashboard.

### Pending Grade Entry & Attendance Queue Widget
- [ ] When all of today's sessions have attendance already taken, the widget shows a clear "all caught up" state rather than an empty list with no explanation.
- [ ] When mock grade-entry data is malformed/missing for a session, the widget degrades to an "unknown status" indicator rather than throwing a render error.
- [ ] The pending-grade-entry count badge does not display a negative or NaN value when the mock dataset has zero pending entries (shows 0 or is hidden).

## Tasks
1. Define TypeScript types for today's-session and attendance/grade-pending-status response shapes matching the eventual jadwal/absensi/penilaian API contracts.
2. Build a typed mock data module (fixtures) covering multiple sessions, an empty-day case, and mixed attendance/grade-completion states.
3. Build the "Today's Classes" widget component with loading/empty/error states.
4. Build the "Attendance & Pending Grade Entry" widget component with per-session status indicators and pending-grade badges.
5. Build the guru dashboard page/layout assembling both widgets under the role-based dashboard shell.
6. Wire mock data through a swappable data-access function (e.g. a hook/service layer) so ticket #32 can later replace it with real fetches.
7. Add component-level tests for loading/empty/error/all-caught-up states.

## Out of Scope
- Live API integration — mocked data is used here; real backend wiring is ticket #32.
- The actual attendance input page (ticket #15).
- The actual grade entry page (ticket #17).

## Labels
`FE`, `dashboard`

## Estimate
M
