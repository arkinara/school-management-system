# 15. FE: absensi input page — teacher UI per class per day

## Description
Builds the teacher-facing attendance-taking UI for marking a full class roster hadir/izin/sakit/alpa on a given day. The page is built against mock/typed placeholder data for this ticket — the class roster, default statuses, and submit action are wired to a local fixture/mock service, not the live `/absensi` API. Real API wiring is deferred to the paired FE Wiring ticket (#36) so the FE and BE dev streams stay decoupled while BE absensi (#14) is being built in parallel.

## Reference
- PRD feature(s): Absensi / Attendance
- PRD sub-feature(s): Daily Attendance Entry (FE portion)
- PRD path: `docs/PRD.md` lines 351-395

## Sub-feature: Class Roster Attendance Entry UI
Renders the full class roster pre-loaded with default hadir status and lets the teacher toggle exceptions (izin/sakit/alpa) before bulk-submitting the whole class in one action.

## Sub-feature: Same-day Edit Window & Audit Flag
Allows the teacher to re-open and edit an already-submitted day's attendance while still within the same calendar day, and visibly flags any edit made after that window as an audit-logged correction.

## Positive Acceptance Criteria

### Class Roster Attendance Entry UI
- [ ] Selecting a class and date loads the full roster with every student pre-set to hadir.
- [ ] Teacher can toggle any individual student to izin/sakit/alpa without affecting other rows.
- [ ] "Submit" action commits status for the entire roster in a single click/action, showing a success toast on completion.
- [ ] Roster row displays student name and an optional free-text note field for izin/sakit entries.

### Same-day Edit Window & Audit Flag
- [ ] Re-opening today's already-submitted attendance loads the previously saved per-student statuses (from mock store) for editing.
- [ ] Saving an edit made on the same day as the original submission updates the record with no special flag shown.
- [ ] Saving an edit made on a later day shows a visible "edited after submission day" badge/flag on the affected row(s) and records an audit note (editor placeholder, timestamp) in the mock data layer.

## Negative Acceptance Criteria

### Class Roster Attendance Entry UI
- [ ] Submitting with no class or date selected is blocked with an inline validation message; no submit call is dispatched.
- [ ] Roster with zero enrolled students renders an explicit empty state ("no students in this class") instead of a blank table.
- [ ] Attempting to submit a second time while a submission is in flight is disabled/ignored to prevent duplicate bulk-submit actions.

### Same-day Edit Window & Audit Flag
- [ ] Attempting to edit a date further in the past than the mock "same-day" boundary still allows the edit but always renders the audit flag, never silently overwrites without it.
- [ ] Loading state is shown while roster/attendance data is being fetched from the mock service, with no flash of empty/incorrect data.
- [ ] A simulated mock-fetch failure renders an error state with a retry action rather than a blank or crashed page.

## Tasks
1. Scaffold the attendance entry route/page under the teacher dashboard section.
2. Build the class + date picker and mock data fixtures for rosters and existing attendance records.
3. Build the roster table component with per-row status toggle (hadir/izin/sakit/alpa) and note field.
4. Implement bulk submit action against the mock service, including loading/disabled/duplicate-submit guarding.
5. Implement same-day vs. post-same-day edit detection and the audit-flag badge/UI.
6. Add empty-state, loading-state, and error-state handling for roster fetch and submit.
7. Write component tests covering toggle behavior, bulk submit, and audit-flag rendering.

## Out of Scope
- Live API integration against the real `/absensi` endpoints (mocked here; wiring is ticket #36)
- BE absensi domain logic itself (ticket #14, already built)
- Grade entry page (ticket #17)

## Labels
`FE`, `absensi`

## Estimate
M
