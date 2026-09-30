# 12. FE: TU dashboard — today's operations queue, overdue SPP, billing tasks

## Description
This ticket builds the Tata Usaha (TU) home screen: a today's operations queue widget (bills to generate, payments to record, pending master-data tasks) and an overdue SPP/billing tasks widget. It covers the TU portion of the PRD's Role-based Dashboard feature, specifically the "Parent & TU Operational Widgets" sub-feature. The TU role is the sole consumer of this screen.

## Reference
- PRD feature(s): `## Feature: Role-based Dashboard`
- PRD sub-feature(s): `## Sub-feature: Parent & TU Operational Widgets` (TU portion only)
- PRD path: `docs/PRD.md` lines 307-348

## Sub-feature: Today's Operations Queue Widget
Covers a task-list style widget showing bills that need to be generated, payments awaiting recording, and pending master-data tasks (e.g. new student/teacher records to finalize), built against typed mock data.

## Sub-feature: Overdue SPP & Billing Tasks Widget
Covers a widget listing students/bills currently in overdue status and summarizing outstanding billing follow-up work, built against typed mock data.

## Positive Acceptance Criteria

### Today's Operations Queue Widget
- [ ] Widget renders three distinct task groups (bills to generate, payments to record, pending master-data tasks) each with a count badge, from mock data.
- [ ] Each task-group item is clickable/navigable and displays enough context (e.g. class name and period for bill generation) to identify the underlying work item.
- [ ] Widget correctly sorts or prioritizes tasks so the most time-sensitive item (e.g. earliest due date) appears first within its group.

### Overdue SPP & Billing Tasks Widget
- [ ] Widget lists overdue bills (student name, amount, days overdue) sorted by most overdue first, from mock data.
- [ ] Widget shows a total overdue count and aggregate overdue amount summary at the top of the card.
- [ ] Each overdue line item links/navigates toward the relevant billing follow-up action.

## Negative Acceptance Criteria

### Today's Operations Queue Widget
- [ ] When all three mock task groups are empty, widget shows an explicit "All caught up" empty state rather than three blank sections.
- [ ] A task group with zero items (while others have items) renders a "Nothing pending" sub-message instead of an empty gap in the layout.
- [ ] Widget shows a loading skeleton state while dashboard data is being prepared, never an unstyled flash of empty content.

### Overdue SPP & Billing Tasks Widget
- [ ] When mock overdue list is empty, widget shows an explicit "No overdue bills" state instead of a blank list.
- [ ] Malformed or missing amount/due-date fields in a mock bill entry do not crash the widget; the entry is skipped or flagged rather than rendered with garbage values.
- [ ] Widget shows a loading skeleton state while data is being prepared.

## Tasks
1. Define TypeScript types/interfaces for mock operations-queue tasks (bill-generation, payment-recording, master-data) and mock overdue bill entries.
2. Build static mock data fixtures covering populated, empty, and mixed-empty-group scenarios.
3. Implement TU dashboard route/layout shell (role-gated to TU/admin).
4. Build Today's Operations Queue widget with three grouped task sections.
5. Build Overdue SPP & Billing Tasks widget with sorted list and summary header.
6. Implement loading skeleton and empty states for both widgets.
7. Wire both widgets into the TU dashboard page layout with responsive styling per M3 tokens.
8. Add component-level tests for populated, empty, and malformed-data scenarios.

## Out of Scope
- Live API integration for task/bill data — this ticket uses mock data only; wiring to real backend endpoints is deferred to ticket #35 (FE Wiring: TU).
- SPP bill generation and payment-recording pages themselves — covered by tickets #24 and #25.
- Announcement composer UI for TU-authored announcements — covered by ticket #27.

## Labels
`FE`, `dashboard`

## Estimate
M
