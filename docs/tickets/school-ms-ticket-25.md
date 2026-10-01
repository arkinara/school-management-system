# 25. FE: SPP payment recording page — TU records payments against bills

## Description
Builds the TU-facing payment-recording UI: a form to record a payment (method, amount, receipt_no, paid_at) against a specific bill, plus a viewable/printable receipt afterward. Built against mock/typed placeholder data; live wiring to the real #23 SPP API is deferred to ticket #38 per the mock-vs-wired convention for this wave.

## Reference
- PRD feature(s): SPP / Tuition Billing
- PRD sub-feature(s): Payment Recording (FE portion)
- PRD path: `docs/PRD.md` lines 507-552

## Design Baseline
- Visual: `prototype-promax/pages/spp-bills.html` at Desktop 1440 (screenshot at `docs/screenshots-promax/spp-bills.png`)
- Design tokens: `prototype-promax/assets/theme.css` — HSL channels for primary/accent/semantic; resolve via Tailwind tokens in `frontend/tailwind.config.ts` and `frontend/src/app/globals.css`
- Typography: Fira Sans (UI) + Fira Code (tabular numerals, `font-variant-numeric: tabular-nums`); both via Google Fonts CDN. Replace Inter everywhere.
- Density: 8/10 — 40px table rows, 13px table text, 4/8px spacing rhythm
- Behavioural:
- Payment table supports bulk-select with indeterminate header checkbox state
- Sortable columns use `aria-sort` + `data-value` (numeric vs locale-aware string sort)
- Recording/reversing a payment surfaces an undo toast (polite live region) instead of a confirm dialog

## Sub-feature: Payment Recording Form
Form for TU to record method/amount/receipt_no/paid_at against a selected bill, with partial-payment flagging for TU review, against mock data.

## Sub-feature: Receipt View/Print
Viewable and printable receipt rendered after a payment is recorded, using the mocked payment response.

## Positive Acceptance Criteria

### Payment Recording Form
- [ ] TU can search/select an outstanding bill and open a payment form pre-populated with the bill's outstanding balance.
- [ ] TU can submit method, amount, receipt_no, and paid_at, and the mock bill list reflects the updated status (paid/partially-paid) after submission.
- [ ] Submitted payment data shape matches the typed contract expected by the real #23 POST /spp/bills/{id}/payments endpoint (field names/types match).

### Receipt View/Print
- [ ] After a successful mock payment submission, a receipt view renders showing student, period, amount paid, method, receipt_no, and paid_at.
- [ ] Receipt view includes a print action that opens a print-friendly layout of the same receipt data.
- [ ] TU can navigate back from the receipt view to the bill list without losing the recorded (mock) payment state.

## Negative Acceptance Criteria

### Payment Recording Form
- [ ] Submitting with a missing method or receipt_no is blocked client-side with a validation message before mock submission.
- [ ] Entering a payment amount greater than the outstanding balance is flagged inline as an overpayment warning/error before submission, per the partial/over-payment review convention.
- [ ] A simulated failure response (mocked 500 or 404 for missing bill) shows an error state and does not display a receipt.

### Receipt View/Print
- [ ] Attempting to view a receipt for a payment that failed to record shows an appropriate empty/error state rather than a blank or fabricated receipt.
- [ ] Print action is disabled or hidden while the mock payment submission is still loading.
- [ ] Receipt view does not display a "paid in full" indicator for a mocked partial-payment result.

## Tasks
1. Build the bill search/selection component for choosing which bill to record a payment against.
2. Build the payment recording form (method, amount, receipt_no, paid_at) with outstanding-balance pre-fill and client-side validation.
3. Implement overpayment inline warning/blocking logic on the amount field.
4. Build the receipt view component and a print-friendly layout variant.
5. Define typed mock data/fixtures matching the expected #23 payment request/response contract, including partial-payment and error cases.
6. Implement loading, error, and empty states across the form and receipt view.

## Out of Scope
- Live API integration (mocked here; wiring is ticket #38)
- BE payment logic itself (ticket #23, already built)
- Bill generation UI (ticket #24)

## Labels
`FE`, `spp`

## Estimate
M
