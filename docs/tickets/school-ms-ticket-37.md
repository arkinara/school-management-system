# 37. FE Wiring: rapor view → real APIs

## Description
Ticket #19 built the rapor view page against mock data, showing a static sample report card regardless of the logged-in user. This ticket wires it to the real rapor API (#18) so it fetches only published rapor for the logged-in parent's or student's linked student(s), correctly handling the case where a rapor is still in draft and not yet visible. It also adds loading, error, and empty states triggered by real network conditions and real publish-state data.

## Reference
- PRD feature(s): Rapor / Report Card
- PRD sub-feature(s): Review & Publish Workflow (wiring portion)
- PRD path: `docs/PRD.md` lines 433-467

## Behavioural Reference
When wiring real APIs, preserve these interactions from `prototype-promax/pages/rapor-view.html` + `assets/app.js`:
- Semester picker and Kurikulum Merdeka fase display drive real published-rapor data
- Print stylesheet (`@media print`) keeps stripping chrome once content is real, not fixture data

## Sub-feature: API Integration
Replace the rapor view page's mock report card with real calls to the rapor API (#18), fetching only published rapor scoped to the logged-in parent's/student's linked student(s).

## Sub-feature: Loading/Error/Empty States
Add skeleton loaders, network-error handling, and a real draft-not-visible-yet empty state to the rapor view page.

## Positive Acceptance Criteria

### API Integration
- [ ] Loading the rapor view for a siswa fetches that student's real published rapor for the selected semester from the rapor API (#18).
- [ ] Loading the rapor view for an orang tua fetches the real published rapor for each of their linked children, matching the parent-student links from master data (#7).
- [ ] The rendered rapor content (narrative for TK/SD, numeric+description for SMP/SMA) reflects the tenant's actual `kurikulum_version`/fase template from the real API response, not a fixed mock format.
- [ ] All requests carry the user's Authorization bearer JWT, scoped server-side to only the student(s) the requester is authorized to view.
- [ ] Once a Wali Kelas/principal publishes a rapor (via #18), it becomes visible in this view on next load without any other client-side change.

### Loading/Error/Empty States
- [ ] The rapor content area shows a skeleton while the fetch is in flight.
- [ ] A student/parent whose rapor for the selected semester is still in draft state sees an explicit "not yet published" empty state, not a blank page or error.
- [ ] A student with no rapor record at all for the selected semester (e.g. new enrollment) sees a distinct, clear empty state.
- [ ] Switching between semesters or between multiple linked children re-fetches and shows the correct loading state per selection.

## Negative Acceptance Criteria

### API Integration
- [ ] A request with a missing/expired JWT is rejected client-side and redirects to login instead of rendering cached/mock content.
- [ ] A draft (unpublished) rapor is never returned to or rendered for orang tua/siswa roles, even if requested directly by ID.
- [ ] A parent cannot fetch rapor data for a student not linked to their account, and a student cannot fetch another student's rapor, even via manipulated requests.

### Loading/Error/Empty States
- [ ] A 500 or network timeout from the rapor endpoint shows a retryable error state distinct from the "not yet published" empty state.
- [ ] The "not yet published" state is never confused with an error state in either visuals or copy.
- [ ] Rapid repeated navigation to the rapor view does not create duplicate overlapping requests or flicker between stale and fresh content.

## Tasks
1. Remove the mock report card data from ticket #19's rapor view page.
2. Wire the page to the real rapor API (#18), fetching only `status = published` records scoped to the authorized student(s).
3. Map the real `compiled_data` response (narrative vs. numeric+description per fase) into the existing rapor view UI contract.
4. Add skeleton loading states for the rapor content area.
5. Add a distinct "not yet published" empty state and a distinct "no record" empty state, backed by real API responses.
6. Add error (retryable) states for network/server failures.
7. Add/adjust tests covering published, draft (blocked), no-record, multi-child, and error scenarios.

## Out of Scope
- Rapor view visual/layout design (ticket #19, already built).
- BE rapor compile/publish workflow itself (ticket #18, already built).

## Labels
`FE Wiring`, `rapor`

## Estimate
S
