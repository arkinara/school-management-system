# 33. FE Wiring: siswa dashboard → real APIs

## Description
Ticket #10 built the Siswa dashboard against mock data for today's schedule, recent grades, and rapor publish status. This ticket wires it to the real jadwal API (#20) for today's schedule, the real grades API (#16) for recent grades, and the real rapor API (#18) for the publish-status indicator, scoped to the logged-in student. It also adds loading, error, and empty states surfaced by real network conditions and real backend data (e.g. no rapor published yet this semester).

## Reference
- PRD feature(s): Role-based Dashboard
- PRD sub-feature(s): Teacher & Student Daily Widgets (student portion)
- PRD path: `docs/PRD.md` lines 307-338

## Sub-feature: API Integration
Replace the siswa dashboard's mock widgets with real calls to jadwal (#20) for today's schedule, grades (#16) for recent grades, and rapor (#18) for publish-status, scoped to the logged-in student.

## Sub-feature: Loading/Error/Empty States
Add skeleton loaders, network-error handling, and real empty states (e.g. no classes today, no grades yet, rapor still in draft) to the siswa dashboard widgets.

## Positive Acceptance Criteria

### API Integration
- [ ] "Today's schedule" widget calls the real jadwal API (#20) filtered to the student's class and today's date.
- [ ] "Recent grades" widget calls the real grades API (#16), scoped to the logged-in student, and displays the most recent entries across subjects.
- [ ] "Rapor publish status" widget calls the real rapor API (#18) and correctly reflects draft vs. published state for the current semester.
- [ ] All requests carry the student's Authorization bearer JWT, scoped server-side by `tenant_id`/`school_id`/`student_id` derived from the token, not client input.
- [ ] When a teacher publishes a rapor for the student (via #18/#37), the dashboard's rapor status widget reflects "published" on next load.

### Loading/Error/Empty States
- [ ] Each widget shows a skeleton while its request is in flight.
- [ ] A student with no classes scheduled today (e.g. holiday) sees an explicit empty-schedule message.
- [ ] A student with no grades recorded yet this semester sees an explicit "no grades yet" empty state, not an empty list with no explanation.
- [ ] A student whose rapor is still in draft sees a clear "not yet published" indicator, distinct from an error state.

## Negative Acceptance Criteria

### API Integration
- [ ] A request with a missing/expired JWT is rejected client-side and redirects to login rather than showing partial widget data.
- [ ] A student cannot retrieve another student's schedule, grades, or rapor status via manipulated requests.
- [ ] Malformed or unexpected API payload shapes cause the affected widget to show an error state rather than rendering incorrect/undefined values.

### Loading/Error/Empty States
- [ ] A 500 or network timeout on any of the three endpoints shows a retryable error state scoped to that widget only, leaving the others functional.
- [ ] An empty result (zero schedule entries, zero grades) never renders as a stuck loading skeleton.
- [ ] Fast repeated dashboard reloads do not create duplicate overlapping requests or visible flicker between stale and fresh data.

## Tasks
1. Remove mock-data fixtures/hooks from ticket #10's siswa dashboard widgets.
2. Wire "today's schedule" widget to the real jadwal API (#20) with correct auth/tenant/class scoping.
3. Wire "recent grades" widget to the real grades API (#16) with correct auth/student scoping.
4. Wire "rapor publish status" widget to the real rapor API (#18) with correct auth/student scoping.
5. Add skeleton loading states per widget.
6. Add error (retryable) and empty states per widget based on real backend responses.
7. Add/adjust tests covering loading, success, empty, and error paths.

## Out of Scope
- Dashboard visual/layout design (ticket #10, already built).
- The full rapor view page wiring (ticket #37, separate).

## Labels
`FE Wiring`, `dashboard`

## Estimate
S
