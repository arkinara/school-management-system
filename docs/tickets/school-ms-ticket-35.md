# 35. FE Wiring: TU dashboard → real APIs

## Description
Ticket #12 built the Tata Usaha dashboard against mock data for the operational queue (bills to generate, payments to record, pending master-data tasks). This ticket wires the billing-related widgets to the real SPP API (#23) so TU staff see their actual overdue bills and billing task counts instead of fixtures. It also adds loading, error, and empty states surfaced by real network conditions and real backend data (e.g. zero overdue bills).

## Reference
- PRD feature(s): Role-based Dashboard
- PRD sub-feature(s): Parent & TU Operational Widgets (TU portion)
- PRD path: `docs/PRD.md` lines 307-347

## Behavioural Reference
When wiring real APIs, preserve these interactions from `prototype-promax/pages/tu-dashboard.html` + `assets/app.js`:
- Bulk-select + indeterminate checkbox state on the overdue-SPP table works against real rows
- Bulk actions (e.g. mark-reminded) surface an undo toast instead of a confirm dialog

## Sub-feature: API Integration
Replace the TU dashboard's mock billing widgets with real calls to the SPP API (#23) for overdue bills and billing task counts, scoped to the TU's assigned school.

## Sub-feature: Loading/Error/Empty States
Add skeleton loaders, network-error handling, and real empty states (e.g. no overdue bills, no bills pending generation) to the TU dashboard's billing widgets.

## Positive Acceptance Criteria

### API Integration
- [ ] "Overdue bills" widget calls the real SPP API (#23) and lists bills with `status = overdue` scoped to the TU's `school_id`.
- [ ] "Billing task counts" widget calls the real SPP API (#23) to compute counts of bills pending generation and payments pending recording for the current billing period.
- [ ] All requests carry the TU's Authorization bearer JWT and are scoped server-side by `tenant_id`/`school_id` from the token claims, not client-supplied filters.
- [ ] After a bill is generated or a payment is recorded (via #23/#38), the TU dashboard's counts reflect the change on next load.
- [ ] The overdue bills widget correctly reflects the automatic overdue-flagging logic (bills past `due_date` and still unpaid) defined in #23.

### Loading/Error/Empty States
- [ ] Each billing widget shows a skeleton while its request is in flight.
- [ ] A school with zero overdue bills shows an explicit "no overdue bills" empty/positive state rather than a blank card.
- [ ] A school with zero pending billing tasks shows an explicit "all caught up" empty state.
- [ ] The billing widgets load independently of any non-billing widgets on the same dashboard.

## Negative Acceptance Criteria

### API Integration
- [ ] A request with a missing/expired JWT is rejected client-side and redirects to login instead of showing stale/partial data.
- [ ] A TU account cannot retrieve overdue bills or task counts for a school other than their assigned `school_id`.
- [ ] Malformed/unexpected API response shapes cause the widget to show an error state rather than rendering undefined/NaN counts.

### Loading/Error/Empty States
- [ ] A 500 or timeout from the SPP endpoint shows a retryable, widget-scoped error state without breaking the rest of the dashboard.
- [ ] An empty result set never renders as a stuck/infinite loading skeleton.
- [ ] Rapid repeated dashboard reloads do not create duplicate overlapping requests or flicker between stale and fresh counts.

## Tasks
1. Remove mock-data fixtures/hooks from ticket #12's TU dashboard billing widgets.
2. Wire "overdue bills" widget to the real SPP API (#23) with correct auth/school scoping.
3. Wire "billing task counts" widget to the real SPP API (#23) with correct auth/school scoping.
4. Add skeleton loading states per widget.
5. Add error (retryable) and empty states per widget based on real backend responses.
6. Add/adjust tests covering loading, success, empty, and error paths.

## Out of Scope
- Dashboard visual/layout design (ticket #12, already built).
- SPP bill/payment page wiring (ticket #38, separate).

## Labels
`FE Wiring`, `dashboard`

## Estimate
S
