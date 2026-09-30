# 24. FE: SPP bill generation page — TU creates monthly bills per class

## Description
Builds the TU-facing bill-generation UI, covering both single-bill creation and bulk generation across a class or whole school for a billing period. Built against mock/typed placeholder data; live wiring to the real #23 SPP API is deferred to ticket #38 per the mock-vs-wired convention for this wave.

## Reference
- PRD feature(s): SPP / Tuition Billing
- PRD sub-feature(s): Bill Generation (FE portion)
- PRD path: `docs/PRD.md` lines 507-552

## Sub-feature: Single Bill Creation UI
Form for TU to create one bill for a student with period, amount, and due_date, against mock data.

## Sub-feature: Bulk Bill Generation UI
Form/flow for TU to generate bills across a class or the whole school for a given period, with duplicate-prevention feedback rendered from mock responses.

## Positive Acceptance Criteria

### Single Bill Creation UI
- [ ] TU can fill a form with student, period, amount, and due_date and submit to create a single bill, with the new bill appearing in a mock bill list on success.
- [ ] Form pre-fills a sensible default due_date (e.g. end of the selected period's month) that TU can override.
- [ ] Submitted bill data shape matches the typed contract expected by the real #23 POST /spp/bills endpoint (field names/types match).

### Bulk Bill Generation UI
- [ ] TU can select a class (or "whole school") and a period, and trigger bulk generation, seeing a mock summary of created/skipped counts.
- [ ] The bulk-generation summary lists which students were skipped (e.g. duplicate) using mock duplicate data, matching the shape of the real #23 bulk-generation response.
- [ ] TU can review the target class's student count before confirming bulk generation.

## Negative Acceptance Criteria

### Single Bill Creation UI
- [ ] Submitting with a missing student, non-positive amount, or due_date in the past is blocked client-side with a validation message before any mock submission.
- [ ] A simulated duplicate-bill response (mocked 409) displays an inline error identifying the existing bill rather than silently failing.
- [ ] Form shows a loading state during mock submission and disables the submit button to prevent double-submit.

### Bulk Bill Generation UI
- [ ] Attempting bulk generation with no class/school target selected is blocked client-side with a validation message.
- [ ] A mock bulk response with zero eligible students displays a clear "no bills generated" message, not a blank/broken summary.
- [ ] A simulated bulk-generation failure (mocked 500) shows an error state with a retry action, leaving no partial/inconsistent UI state.

## Tasks
1. Build the single bill creation form (student, period, amount, due_date) with client-side validation.
2. Build the bulk generation flow (class/school selector, period selector, confirmation step, results summary).
3. Define typed mock data/fixtures matching the expected #23 API request/response contracts for both single and bulk paths.
4. Implement success, loading, empty, and error UI states for both flows using the mocks.
5. Implement duplicate/skip feedback rendering for both single (409) and bulk (per-student skip list) cases.

## Out of Scope
- Live API integration (mocked here; wiring is ticket #38)
- BE bill-generation logic itself (ticket #23, already built)
- Payment recording UI (ticket #25)

## Labels
`FE`, `spp`

## Estimate
M
