# 21. FE: jadwal config page — TU/admin UI for weekly schedule grid

## Description
Builds the TU/admin-facing weekly-timetable configuration UI: a grid for creating and editing schedule entries (class, subject, teacher, day, period, start/end time), wired directly against the real #20 schedules API since that backend is built in the same wave. Surfaces conflict-detection errors from the API inline so TU cannot silently double-book a teacher or class.

## Reference
- PRD feature(s): Jadwal Pelajaran
- PRD sub-feature(s): Schedule Configuration (FE portion)
- PRD path: `docs/PRD.md` lines 470-505

## Design Baseline
- Visual: `prototype-promax/pages/form-patterns.html` at Desktop 1440 (screenshot at `docs/screenshots-promax/form-patterns.png`)
- Design tokens: `prototype-promax/assets/theme.css` — HSL channels for primary/accent/semantic; resolve via Tailwind tokens in `frontend/tailwind.config.ts` and `frontend/src/app/globals.css`
- Typography: Fira Sans (UI) + Fira Code (tabular numerals, `font-variant-numeric: tabular-nums`); both via Google Fonts CDN. Replace Inter everywhere.
- Density: 8/10 — 40px table rows, 13px table text, 4/8px spacing rhythm
- Behavioural:
- Multi-step wizard pattern from `form-patterns.html` drives the weekly schedule grid setup flow
- Conflict detection errors use `role="alert"` and focus the first invalid field
- Schedule context cross-checked against the timeline on `principal-dashboard.html`

## Sub-feature: Weekly Schedule Grid Builder
Lets TU/admin create and edit schedule entries in a day-by-period grid layout backed by live API calls.

## Sub-feature: Conflict Feedback UI
Surfaces the #20 conflict-detection error inline on the offending cell/form when TU attempts a double-booking.

## Positive Acceptance Criteria

### Weekly Schedule Grid Builder
- [ ] TU can select a class and view its full week grid populated with existing schedule entries fetched from GET /schedules.
- [ ] TU can create a new entry via a form (class, subject, teacher, day, period, start_time, end_time) that calls POST /schedules and inserts the new entry into the grid on success.
- [ ] TU can edit an existing entry's time/teacher/subject and save, updating the grid in place after the API call succeeds.
- [ ] Grid can be filtered/switched by teacher to show that teacher's full-week assignments.

### Conflict Feedback UI
- [ ] Submitting a form that triggers a 409 conflict from the API displays an inline error naming the conflicting class/teacher and the clashing time slot.
- [ ] The conflicting cell in the grid is visually highlighted when a conflict error is returned.
- [ ] After resolving the conflict (e.g. changing the period) and resubmitting successfully, the inline error clears and the grid updates.

## Negative Acceptance Criteria

### Weekly Schedule Grid Builder
- [ ] Submitting the create form with a required field empty (e.g. no teacher selected) is blocked client-side with a validation message before any API call is made.
- [ ] If GET /schedules fails (network/server error), the grid shows an error state with a retry action instead of rendering a blank or broken grid.
- [ ] Loading state is shown while the initial schedule fetch is in flight, not a blank grid.

### Conflict Feedback UI
- [ ] A non-conflict API error (e.g. 500) displays a generic error message and does not misreport it as a scheduling conflict.
- [ ] Dismissing a conflict error without changing the form and resubmitting re-triggers the same conflict error rather than silently succeeding.
- [ ] Two rapid duplicate submissions of the same conflicting entry do not create a duplicate schedule row or duplicate error toasts.

## Tasks
1. Build the weekly grid layout component (days x periods) with per-class and per-teacher view modes.
2. Build the create/edit schedule entry form with class/subject/teacher/day/period/time fields.
3. Wire form submission to POST/PATCH /schedules from #20, including loading and success states.
4. Implement 409 conflict-response handling: parse conflict payload and render inline error plus cell highlight.
5. Wire GET /schedules for initial grid population with loading/error/empty states.
6. Add client-side validation for required fields prior to submission.

## Out of Scope
- BE conflict detection logic itself (ticket #20, already built — this ticket only surfaces its errors)
- Personalized per-role schedule views (ticket #22)
- Substitute-teacher live-propagation display logic beyond standard edit/save (covered by #20's data model; this ticket just re-renders on change)

## Labels
`FE`, `jadwal`

## Estimate
M
