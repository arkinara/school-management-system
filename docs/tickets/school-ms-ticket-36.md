# 36. FE Wiring: absensi page → real APIs

## Description
Ticket #15 built the daily attendance-entry page against mock data, including a mocked class roster and a mocked submit action. This ticket wires that page to the real attendances API (#14) — real class roster fetch, bulk submit of hadir/izin/sakit/alpa statuses, and enforcement of the same-day edit window — so teachers are recording and correcting real attendance data. It also adds loading, error, and empty states triggered by real network conditions and real backend rules.

## Reference
- PRD feature(s): Absensi / Attendance
- PRD sub-feature(s): Daily Attendance Entry (wiring portion)
- PRD path: `docs/PRD.md` lines 351-374

## Behavioural Reference
When wiring real APIs, preserve these interactions from `prototype-promax/pages/absensi-input.html` + `assets/app.js`:
- Keyboard attendance entry (`H`/`I`/`S`/`A` on a focused roster row) submits to the real attendance endpoint
- Submission corrections surface via undo toast (polite live region), never a confirm dialog

## Sub-feature: API Integration
Replace the absensi page's mock roster and mock submit with real calls to the attendances API (#14) for roster fetch, bulk submit, and same-day edit-window enforcement.

## Sub-feature: Loading/Error/Empty States
Add skeleton loaders, network-error handling, and real empty states (e.g. class with no enrolled students, already-submitted session) to the absensi page.

## Positive Acceptance Criteria

### API Integration
- [ ] Selecting a class session fetches the real class roster from the attendances/classes API (#14), pre-loaded with default `hadir` status per the existing UI contract.
- [ ] Submitting attendance sends a single bulk-submit request to the real API with each student's chosen status, teacher's `recorded_by`, and session date.
- [ ] Editing an already-submitted session on the same day calls the real update endpoint and succeeds, matching the same-day edit window rule from #14.
- [ ] Attempting to edit a session from a prior day is either blocked in the UI (matching #14's audit-logged-edit rule) or routed through the flagged/audit-logged correction path.
- [ ] All requests carry the teacher's Authorization bearer JWT, scoped server-side by `tenant_id`/`school_id`/`teacher_id`, and the teacher can only submit for classes they teach.

### Loading/Error/Empty States
- [ ] The roster area shows a skeleton while the class roster request is in flight.
- [ ] Submitting shows a pending/in-progress state on the submit action until the bulk-submit request resolves.
- [ ] A class with zero enrolled students shows an explicit empty-roster message instead of an empty, actionable submit form.
- [ ] Reopening a session that was already submitted today pre-fills the real, previously-submitted statuses rather than resetting to default `hadir`.

## Negative Acceptance Criteria

### API Integration
- [ ] A request with a missing/expired JWT is rejected client-side and redirects to login instead of allowing a submit attempt.
- [ ] A teacher cannot fetch or submit attendance for a class they do not teach, even via manipulated requests.
- [ ] Submitting with an incomplete roster (missing status for one or more students) is rejected client-side and server-side with a clear validation message, matching #14's per-student status requirement.

### Loading/Error/Empty States
- [ ] A network failure during bulk submit shows a retryable error state and does not silently drop the teacher's already-entered selections.
- [ ] A 409/conflict response for editing outside the same-day window shows a clear, specific error message distinct from a generic network error.
- [ ] Rapid double-submission of the same session does not create duplicate attendance records for the same class/date.

## Tasks
1. Remove mock roster/mock submit logic from ticket #15's absensi input page.
2. Wire class roster fetch to the real attendances API (#14) with correct auth/teacher/class scoping.
3. Wire bulk submit action to the real attendances API (#14), including per-student status payload shape.
4. Implement same-day edit window handling: allow same-day edits, route later edits through the flagged/audit-logged path per #14.
5. Add skeleton loading and in-progress submit states.
6. Add error (retryable) and empty-roster states based on real backend responses.
7. Add/adjust tests covering roster fetch, bulk submit, same-day edit, late edit, and error paths.

## Out of Scope
- Absensi page visual/layout design (ticket #15, already built).
- BE absensi domain logic itself (ticket #14, already built).

## Labels
`FE Wiring`, `absensi`

## Estimate
S
