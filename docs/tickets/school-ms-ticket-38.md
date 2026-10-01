# 38. FE Wiring: SPP pages → real APIs

## Description
Tickets #24 (bill generation) and #25 (payment recording) built their pages against mock data. This ticket wires both to the real SPP API (#23): bill generation gets real single and bulk create endpoints, and payment recording gets real payment endpoints including receipt view/print backed by a real `receipt_no`. It also adds loading, error, and empty states surfaced by real network conditions and real backend rules (e.g. duplicate-bill prevention, partial payment handling).

## Reference
- PRD feature(s): SPP / Tuition Billing
- PRD sub-feature(s): Bill Generation, Payment Recording (wiring portion)
- PRD path: `docs/PRD.md` lines 507-540

## Behavioural Reference
When wiring real APIs, preserve these interactions from `prototype-promax/pages/spp-bills.html` + `assets/app.js`:
- Sortable + bulk-select table behavior is preserved against real bills/payments endpoints
- Void/record-payment actions surface an undo toast instead of a confirm dialog

## Sub-feature: Bill Generation API Integration
Wire ticket #24's bill generation page to the real SPP API (#23) single and bulk bill-generation endpoints.

## Sub-feature: Payment Recording API Integration
Wire ticket #25's payment recording page to the real SPP API (#23) payment endpoints, including receipt view/print with a real `receipt_no`.

## Positive Acceptance Criteria

### Bill Generation API Integration
- [ ] Single-bill creation form submits student, period, amount, and due_date to the real SPP API (#23) and reflects the created bill in the UI on success.
- [ ] Bulk generation across a class or whole school for a given period calls the real bulk-generation endpoint and reports per-student success/failure counts.
- [ ] Attempting to generate a bill for a student/period combination that already has a bill surfaces the real duplicate-bill-prevention response from #23 as a clear inline message.
- [ ] All bill-generation requests carry the TU's Authorization bearer JWT, scoped server-side by `tenant_id`/`school_id`.

### Payment Recording API Integration
- [ ] Recording a payment (method, amount, receipt_no, paid_at) against a specific bill submits to the real SPP API (#23) and updates the bill's status in the UI on success.
- [ ] A partial payment is handled per #23's rule: the bill remains unpaid/partially-paid and is flagged for TU review rather than silently marked paid.
- [ ] After a successful payment, the receipt view/print page renders the real, backend-assigned `receipt_no` and payment details, not a placeholder.
- [ ] All payment-recording requests carry the TU's Authorization bearer JWT, scoped server-side by `tenant_id`/`school_id`.

## Negative Acceptance Criteria

### Bill Generation API Integration
- [ ] A request with a missing/expired JWT is rejected client-side and redirects to login instead of allowing bill creation to proceed.
- [ ] Submitting a bill-generation form with missing/invalid fields (e.g. negative amount, missing due_date) is rejected client-side and server-side with a clear validation message before any API call succeeds.
- [ ] A TU account cannot generate bills for a student outside their assigned `school_id`, even via manipulated requests.

### Payment Recording API Integration
- [ ] A request with a missing/expired JWT is rejected client-side and redirects to login instead of allowing payment submission.
- [ ] Recording a payment against a bill that does not belong to the TU's school is rejected server-side (403/404), and the UI surfaces this rather than showing a false success.
- [ ] A network failure during payment submission does not silently mark the bill as paid in the UI — the UI must reconcile with the real bill status from the server before showing success.

## Tasks
1. Remove mock bill-list/mock-generation logic from ticket #24's page; wire single-bill creation to the real SPP API (#23).
2. Wire bulk bill generation on #24's page to the real bulk-generation endpoint, including per-item success/failure reporting.
3. Surface real duplicate-bill-prevention errors from #23 as inline validation on #24's page.
4. Remove mock payment logic from ticket #25's page; wire payment recording to the real SPP API (#23), including partial-payment handling.
5. Wire the receipt view/print flow to the real `receipt_no` and payment record returned by #23.
6. Add skeleton loading, retryable error, and empty states (e.g. no bills yet, no payments recorded yet) to both pages.
7. Add/adjust tests covering single generation, bulk generation, duplicate prevention, full payment, partial payment, receipt rendering, and error paths.

## Out of Scope
- SPP page visual/layout design (tickets #24, #25, already built).
- BE SPP domain logic itself (ticket #23, already built).

## Labels
`FE Wiring`, `spp`

## Estimate
M
