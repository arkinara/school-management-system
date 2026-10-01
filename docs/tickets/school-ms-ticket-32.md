# 32. FE Wiring: guru dashboard → real APIs

## Description
Ticket #9 built the Guru dashboard against mock data for today's classes, attendance-taken status, and pending grade entries. This ticket wires that dashboard to the real absensi API (#14) for attendance-taken status and the real grades API (#16) for pending grade-entry counts, so a teacher sees their actual daily state instead of fixture data. It also adds the loading, error, and empty states that only surface with real backend responses.

## Reference
- PRD feature(s): Role-based Dashboard
- PRD sub-feature(s): Teacher & Student Daily Widgets (teacher portion)
- PRD path: `docs/PRD.md` lines 307-338

## Behavioural Reference
When wiring real APIs, preserve these interactions from `prototype-promax/pages/guru-dashboard.html` + `assets/app.js`:
- Today-timeline and pending grade-entry queue keep their sortable `aria-sort` behavior with real data
- Real mutations (e.g. marking a grade entry done) surface an undo toast, not a confirm dialog

## Sub-feature: API Integration
Replace the guru dashboard's mock widgets with real calls to the absensi API (#14) for attendance-taken status and the grades API (#16) for pending grade-entry counts, scoped to the logged-in teacher.

## Sub-feature: Loading/Error/Empty States
Add skeleton loaders, network-error handling, and real empty states (e.g. no classes scheduled today, no pending grades) to the guru dashboard widgets.

## Positive Acceptance Criteria

### API Integration
- [ ] "Today's classes" widget fetches the teacher's actual teaching sessions for today from the schedule-backed data feeding #14/#16, not a static mock list.
- [ ] "Attendance-taken status" widget calls the real absensi API and correctly shows per-class taken/not-taken state for today's sessions.
- [ ] "Pending grade entries" widget calls the real grades API (#16) and shows an accurate count scoped to the teacher's assigned subjects/classes for the current semester.
- [ ] All requests carry the teacher's Authorization bearer JWT and are scoped server-side by `tenant_id`/`school_id`/`teacher_id` from the token claims.
- [ ] Marking attendance for a class (via ticket #36's flow) and returning to the dashboard reflects the updated taken status without requiring a hard refresh.

### Loading/Error/Empty States
- [ ] Each widget shows a skeleton while its underlying request is in flight.
- [ ] A teacher with no classes scheduled today sees an explicit "no classes today" empty state rather than a blank widget.
- [ ] A teacher with zero pending grade entries sees a positive "all caught up" empty state rather than an error or blank.
- [ ] Widgets load independently so a slow absensi call does not block the grade-entry widget from rendering.

## Negative Acceptance Criteria

### API Integration
- [ ] A request with a missing/expired JWT is rejected before firing and redirects to login instead of showing a broken widget.
- [ ] A teacher cannot see another teacher's attendance-taken status or pending grade counts, even via manipulated client requests.
- [ ] Malformed/unexpected API response shapes cause the widget to show an error state, not render undefined/NaN values.

### Loading/Error/Empty States
- [ ] A 500 or timeout from the absensi or grades endpoint shows a retryable error state scoped to that widget only.
- [ ] An empty result set never renders as a stuck/infinite skeleton.
- [ ] Repeated fast dashboard reloads do not produce duplicate in-flight requests or flickering between stale and fresh values.

## Tasks
1. Remove mock-data fixtures/hooks from ticket #9's guru dashboard widgets.
2. Wire "today's classes" and "attendance-taken status" widgets to the real absensi API (#14) with correct auth/tenant scoping.
3. Wire "pending grade entries" widget to the real grades API (#16) with correct auth/tenant scoping.
4. Add skeleton loading states per widget.
5. Add error (retryable) and empty states per widget based on real backend responses.
6. Add/adjust tests covering loading, success, empty, and error paths.

## Out of Scope
- Dashboard visual/layout design (ticket #9, already built).
- The attendance input page wiring (ticket #36, separate).

## Labels
`FE Wiring`, `dashboard`

## Estimate
S
