# 23. BE: SPP domain — bills CRUD, payments, overdue alerts

## Description
Implements the full backend tuition-billing (SPP) domain: bill generation (single and bulk) with duplicate prevention, payment recording and reconciliation including partial payments, and scheduled overdue detection with notifications. Used by TU (generate bills, record payments) and orang tua (view bills, receive overdue alerts).

## Reference
- PRD feature(s): SPP / Tuition Billing
- PRD sub-feature(s): Bill Generation, Payment Recording, Overdue Tracking & Alerts (all BE portions)
- PRD path: `docs/PRD.md` lines 507-552

## Sub-feature: Bill Generation
API for creating a single SPP bill or bulk-generating bills across a class/school for a billing period, preventing duplicate bills per student/period.

## Sub-feature: Payment Recording
API for recording a payment (method, amount, receipt_no, paid_at) against a bill, including partial-payment handling.

## Sub-feature: Overdue Tracking & Alerts
Scheduled process that flips unpaid bills past due_date to overdue and triggers a notification.

## Positive Acceptance Criteria

### Bill Generation
- [ ] POST /spp/bills creates a single bill for a student with period, amount, and due_date, returning 201 with the created bill.
- [ ] POST /spp/bills/bulk generates a bill for every student in a given class (or the whole school) for a given period in one request, returning a summary of created/skipped counts.
- [ ] Bulk generation for a class where some students already have a bill for that period creates bills only for students without one and reports those as skipped.

### Payment Recording
- [ ] POST /spp/bills/{id}/payments records a payment with method, amount, receipt_no, and paid_at, and returns the updated bill with new status.
- [ ] A payment whose amount equals the outstanding balance transitions the bill status to paid.
- [ ] A payment whose amount is less than the outstanding balance is recorded and the bill is flagged partially-paid with the remaining balance calculated correctly.

### Overdue Tracking & Alerts
- [ ] A scheduled job run flips any bill with status unpaid/partially-paid whose due_date has passed to overdue.
- [ ] When a bill transitions to overdue, a notification record/event is created for the associated orang tua.
- [ ] TU can query a list of all overdue bills across the school for follow-up.

## Negative Acceptance Criteria

### Bill Generation
- [ ] Creating a single bill for a student/period that already has a bill returns a 409 (duplicate) and does not create a second bill.
- [ ] POST /spp/bills with a missing or non-positive amount, or a due_date in the past, returns a 422 validation error.
- [ ] Bulk generation for a class with zero enrolled students returns a 200 with zero created and a clear message, not an error.

### Payment Recording
- [ ] Recording a payment amount greater than the outstanding balance is rejected (or flagged for TU review per configured policy) rather than silently overpaying the bill.
- [ ] Recording a payment against a non-existent bill_id returns 404 and creates no payment record.
- [ ] Recording a payment with a missing method or receipt_no returns a 422 validation error and no partial state change.

### Overdue Tracking & Alerts
- [ ] A bill already fully paid before its due_date is never flipped to overdue by the scheduled job.
- [ ] If the notification dispatch fails after the status flip, the bill's overdue status still persists (status update and notification are not coupled such that a notify failure rolls back the status).
- [ ] Running the overdue job twice in a row does not create duplicate notifications for the same overdue bill.

## Tasks
1. Design and migrate `spp_bills` and `spp_payments` tables, building on student/parent data from #7.
2. Implement POST /spp/bills and POST /spp/bills/bulk with duplicate-prevention checks per student/period.
3. Implement POST /spp/bills/{id}/payments with balance calculation and partial/full payment status transitions.
4. Implement overpayment rejection/flagging policy.
5. Implement scheduled job to flip unpaid+past-due bills to overdue and emit notification events.
6. Implement GET endpoint(s) for TU's overdue bill list and orang tua's own bill list/status.
7. Write tests covering duplicate generation, partial payment math, overdue transition idempotency.

## Out of Scope
- FE bill generation page (ticket #24)
- FE payment recording page (ticket #25)
- Student/parent master data itself (ticket #7, already built — this ticket only references it)

## Labels
`BE`, `spp`

## Estimate
L
