# 34. FE Wiring: orang tua dashboard → real APIs

## Description
Ticket #11 built the Orang Tua dashboard against mock data for child summary, SPP status, and announcements. This ticket wires it to the real absensi API (#14) and rapor API (#18) for the child attendance/grade summary, and the real SPP API (#23) for payment status, scoped to the parent's linked children. It also adds loading, error, and empty states triggered by real network conditions and real backend responses (e.g. a child with no bills yet).

## Reference
- PRD feature(s): Role-based Dashboard
- PRD sub-feature(s): Parent & TU Operational Widgets (parent portion)
- PRD path: `docs/PRD.md` lines 307-347

## Behavioural Reference
When wiring real APIs, preserve these interactions from `prototype-promax/pages/orang-tua-dashboard.html` + `assets/app.js`:
- Sibling picker switches real per-child API data, not just mock fixtures
- Payment-status sidebar and per-subject grade bars stay live-data-driven with the same visual shape

## Sub-feature: API Integration
Replace the orang tua dashboard's mock widgets with real calls to absensi (#14) and rapor (#18) for child summary data, and SPP (#23) for payment status, scoped to the parent's linked student(s).

## Sub-feature: Loading/Error/Empty States
Add skeleton loaders, network-error handling, and real empty states (e.g. no bills generated yet, no announcements) to the orang tua dashboard widgets.

## Positive Acceptance Criteria

### API Integration
- [ ] "Child attendance/grade summary" widget calls the real absensi API (#14) and rapor API (#18), scoped to each student linked to the logged-in parent.
- [ ] "SPP status" widget calls the real SPP API (#23) and correctly shows unpaid/paid/overdue status for the linked child's most recent bill(s).
- [ ] A parent linked to multiple children sees the summary/SPP widgets correctly segmented per child, matching the parent-student links established by master data (#7).
- [ ] All requests carry the parent's Authorization bearer JWT, scoped server-side to only the `student_id`s linked to that parent account.
- [ ] When a payment is recorded against a child's bill (via #23/#38), the SPP status widget reflects the updated status on next load.

### Loading/Error/Empty States
- [ ] Each widget shows a skeleton while its request is in flight.
- [ ] A child with no bills generated yet shows an explicit "no bills yet" empty state rather than a blank or error.
- [ ] A child with a perfect attendance/no-grades-yet record shows an accurate, non-alarming empty/summary state rather than implying missing data is an error.
- [ ] Widgets for multiple children load independently so a slow request for one child does not block the others.

## Negative Acceptance Criteria

### API Integration
- [ ] A request with a missing/expired JWT is rejected client-side and redirects to login instead of rendering partial data.
- [ ] A parent cannot retrieve attendance, rapor, or SPP data for a student not linked to their account, even via manipulated requests.
- [ ] Malformed/unexpected API payloads cause the affected widget to show an error state rather than render undefined/incorrect values.

### Loading/Error/Empty States
- [ ] A 500 or timeout on the absensi, rapor, or SPP endpoint shows a retryable, widget-scoped error state without breaking the rest of the dashboard.
- [ ] An empty dataset never renders as a stuck loading skeleton.
- [ ] Rapid repeated dashboard reloads do not create duplicate in-flight requests or a flash of stale-then-fresh values.

## Tasks
1. Remove mock-data fixtures/hooks from ticket #11's orang tua dashboard widgets.
2. Wire child attendance/grade summary widget to the real absensi (#14) and rapor (#18) APIs, iterating per linked child.
3. Wire SPP status widget to the real SPP API (#23), scoped per linked child.
4. Add skeleton loading states per widget.
5. Add error (retryable) and empty states per widget based on real backend responses.
6. Add/adjust tests covering loading, success, empty, error, and multi-child scenarios.

## Out of Scope
- Dashboard visual/layout design (ticket #11, already built).
- SPP page wiring (ticket #38, separate).

## Labels
`FE Wiring`, `dashboard`

## Estimate
S
