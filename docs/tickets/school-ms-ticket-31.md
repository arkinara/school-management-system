# 31. FE Wiring: principal dashboard → real APIs

## Description
Ticket #8 built the Kepala Sekolah dashboard against mock data for attendance rate, grade-entry completion, and SPP collection rate widgets. This ticket wires that dashboard to the real tenants/schools API (#5), users/classes API (#6), and students API (#7) so the KPIs reflect live, tenant/school-scoped data instead of fixtures. It also adds the loading, error, and empty states that only show up once real network calls and real (possibly zero) data are involved.

## Reference
- PRD feature(s): Role-based Dashboard
- PRD sub-feature(s): Principal & Yayasan Overview Widgets (principal portion)
- PRD path: `docs/PRD.md` lines 307-330

## Sub-feature: API Integration
Replace the principal dashboard's mock KPI data with real calls to the tenants/schools, users/classes, and students APIs, scoped to the logged-in principal's school.

## Sub-feature: Loading/Error/Empty States
Add skeleton loaders, network-error fallbacks, and real backend empty states (e.g. no attendance recorded yet, no bills generated yet) to the KPI widgets.

## Positive Acceptance Criteria

### API Integration
- [ ] On dashboard load, attendance rate widget fetches from the real attendance/attendances-derived endpoint scoped to the principal's `school_id`, replacing the mock percentage.
- [ ] Grade-entry completion widget calls the real classes/users endpoints to compute completion by teacher for the current semester, matching the shape defined by #6.
- [ ] SPP collection rate widget calls the real SPP-scoped read from #7/students data and renders the current month's collection percentage.
- [ ] All requests include the Authorization bearer JWT and rely on the token's `tenant_id`/`school_id` claims rather than any client-supplied ID.
- [ ] Switching between two principal accounts (different schools) shows each principal only their own school's KPI values.

### Loading/Error/Empty States
- [ ] Each KPI widget shows a skeleton/placeholder while its request is in flight, matching the widget's final layout dimensions.
- [ ] If a school has zero classes or zero students, the widgets render an explicit "no data yet" message instead of a blank card or a 0% that looks like an error.
- [ ] A slow network (>3s) does not block the rest of the dashboard from rendering; each widget loads independently.
- [ ] Refreshing the dashboard re-fetches all three KPIs and updates the widgets without a full page reload.

## Negative Acceptance Criteria

### API Integration
- [ ] A request missing or with an expired JWT is rejected client-side before firing, and the user is redirected to login rather than shown a broken widget.
- [ ] A principal account cannot retrieve KPI data for a school other than their assigned `school_id`, even by tampering with client-side query params.
- [ ] If the backend returns a malformed/unexpected payload shape, the widget fails closed (shows an error state) rather than rendering `NaN`/`undefined`.

### Loading/Error/Empty States
- [ ] A 500 or network-timeout response on any KPI endpoint shows a retry-capable error state on that specific widget without crashing the other widgets.
- [ ] An empty dataset never renders as an infinite loading skeleton — the empty state must resolve within the request's normal timeout.
- [ ] Rapid repeated dashboard reloads (e.g. double-click refresh) do not trigger duplicate overlapping requests or a flash of stale-then-fresh data.

## Tasks
1. Identify and remove all mock-data fixtures/hooks used by ticket #8's principal dashboard widgets.
2. Implement real fetch calls (or server actions) to the tenants/schools (#5), users/classes (#6), and students (#7) APIs with correct auth headers and tenant/school scoping.
3. Map backend response shapes to the widget's existing props/UI contract, adjusting types as needed.
4. Add skeleton loading states per widget.
5. Add error states (retry action) and empty states per widget, backed by real zero-record backend responses.
6. Write/adjust integration tests covering loading, success, empty, and error paths for each widget.

## Out of Scope
- The dashboard's visual/layout design (ticket #8, already built).
- Yayasan's own dashboard wiring (not planned as a separate ticket — ticket #13 was built already wired directly to real APIs).

## Labels
`FE Wiring`, `dashboard`

## Estimate
S
