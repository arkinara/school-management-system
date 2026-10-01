# 11. FE: orang tua dashboard — child summary, payment status, recent announcements

## Description
This ticket builds the Orang Tua (parent) home screen: a child attendance/grade summary widget and an SPP status plus recent announcements widget. It covers the parent portion of the PRD's Role-based Dashboard feature, specifically the "Parent & TU Operational Widgets" sub-feature. The orang tua role is the sole consumer of this screen, viewing data about their linked child(ren).

## Reference
- PRD feature(s): `## Feature: Role-based Dashboard`
- PRD sub-feature(s): `## Sub-feature: Parent & TU Operational Widgets` (parent portion only)
- PRD path: `docs/PRD.md` lines 307-348

## Design Baseline
- Visual: `prototype-promax/pages/orang-tua-dashboard.html` at Desktop 1440 (screenshot at `docs/screenshots-promax/orang-tua-dashboard.png`)
- Design tokens: `prototype-promax/assets/theme.css` — HSL channels for primary/accent/semantic; resolve via Tailwind tokens in `frontend/tailwind.config.ts` and `frontend/src/app/globals.css`
- Typography: Fira Sans (UI) + Fira Code (tabular numerals, `font-variant-numeric: tabular-nums`); both via Google Fonts CDN. Replace Inter everywhere.
- Density: 8/10 — 40px table rows, 13px table text, 4/8px spacing rhythm
- Behavioural:
- Sibling picker switches the whole dashboard's active-child context
- Payment status sidebar surfaces overdue/paid state at a glance
- Per-subject grades rendered as bullet bars, not raw numbers

## Sub-feature: Child Attendance/Grade Summary Widget
Covers a per-child card summarizing recent attendance status counts and recent grade highlights, built against typed mock data, with support for a parent having multiple linked children.

## Sub-feature: SPP Status & Announcements Widget
Covers a widget showing the child's current SPP bill status (unpaid/paid/overdue) and a feed of the most recent school announcements relevant to the parent, built against typed mock data.

## Positive Acceptance Criteria

### Child Attendance/Grade Summary Widget
- [ ] When mock data includes a single linked child, widget renders that child's attendance status counts (hadir/izin/sakit/alpa) for the current month and 3-5 recent grade highlights.
- [ ] When mock data includes multiple linked children, widget renders a selectable/tabbed view so the parent can switch between children without leaving the dashboard.
- [ ] Attendance counts visually distinguish non-hadir statuses (izin/sakit/alpa) from hadir, e.g. via color/badge per PRD's attendance status enum.

### SPP Status & Announcements Widget
- [ ] Widget displays the current bill status (unpaid/paid/overdue) with a distinct visual treatment for "overdue" per mock data.
- [ ] Widget lists the 3-5 most recent announcements (title, audience scope, published date) from mock data, sorted newest first.
- [ ] Announcement scoped to the parent's child's class or jenjang is shown; widget clearly labels announcement audience (e.g. "All schools", "Class 5B").

## Negative Acceptance Criteria

### Child Attendance/Grade Summary Widget
- [ ] When mock data has no linked children, widget shows an explicit "No students linked to your account" message instead of an empty/broken card.
- [ ] When a selected child has zero grade entries in mock data, widget shows "No grades recorded yet" for that child rather than a blank section.
- [ ] Widget shows a loading skeleton state while dashboard data is being prepared, never an unstyled flash of empty content.

### SPP Status & Announcements Widget
- [ ] When mock bill data is absent/null, widget shows an explicit "No bill on record" state rather than defaulting silently to "paid".
- [ ] When mock announcement list is empty, widget shows an explicit "No announcements yet" message.
- [ ] Widget shows a loading skeleton state while data is being prepared.

## Tasks
1. Define TypeScript types/interfaces for mock child summary, attendance counts, grade highlights, SPP bill status, and announcement entries.
2. Build static mock data fixtures covering single-child, multi-child, no-child, and empty-sub-data scenarios.
3. Implement Orang Tua dashboard route/layout shell (role-gated to orang tua).
4. Build Child Attendance/Grade Summary widget with child-switcher for multi-child accounts.
5. Build SPP Status & Announcements widget consuming mock data types.
6. Implement loading skeleton and empty states for both widgets.
7. Wire both widgets into the Orang Tua dashboard page layout with responsive styling per M3 tokens.
8. Add component-level tests for single-child, multi-child, and empty-data scenarios.

## Out of Scope
- Live API integration for child/attendance/grade/SPP/announcement data — this ticket uses mock data only; wiring to real backend endpoints is deferred to ticket #34 (FE Wiring: orang tua).
- SPP payment pages (viewing full bill history, making/recording payment) — covered by tickets #24 and #25.
- Direct message thread UI for parent-teacher 1-1 conversations — covered by ticket #28.

## Labels
`FE`, `dashboard`

## Estimate
M
