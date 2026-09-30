# 19. FE: rapor view page — parent + student view of published rapor per semester

## Description
Builds the rapor viewing page consumed from both the orang tua and siswa dashboards, rendering a student's semester rapor (narrative for TK/SD, numeric-plus-description for SMP/SMA). The page is built against mock/typed placeholder data for this ticket — even though the BE rapor domain (#18) exists by this wave, real API wiring is deferred to the paired FE Wiring ticket (#37) to keep FE and BE dev streams decoupled.

## Reference
- PRD feature(s): Rapor / Report Card
- PRD sub-feature(s): ticket-scoped sub-features for the two viewer contexts (parent, student)
- PRD path: `docs/PRD.md` lines 433-467

## Sub-feature: Published Rapor View (Parent)
Lets a parent select a child and semester and view that child's published rapor with narrative/numeric content rendered per fase, plus a download/print action, against mock data.

## Sub-feature: Published Rapor View (Student)
Lets a logged-in student view their own published rapor for a selected semester with the same fase-based rendering rules, against mock data.

## Positive Acceptance Criteria

### Published Rapor View (Parent)
- [ ] Parent dashboard's "Rapor" entry point navigates to the rapor view pre-scoped to a selected child.
- [ ] Selecting a child with multiple linked children and a semester renders that child's mock rapor content, switching correctly when a different child is selected.
- [ ] TK/SD mock rapor data renders as narrative prose per aspek; SMP/SMA mock rapor data renders numeric score plus description per subject.
- [ ] Download/print action produces a printable/exportable view of the currently displayed rapor.

### Published Rapor View (Student)
- [ ] Student dashboard's "Rapor" entry point navigates to the rapor view scoped to the logged-in student, with no child-selector shown.
- [ ] Selecting a past semester from a semester picker renders that semester's mock rapor content.
- [ ] Rendering rules (narrative vs. numeric+description) match the mock tenant's jenjang/fase exactly as they do in the parent view.

## Negative Acceptance Criteria

### Published Rapor View (Parent)
- [ ] A child with no published rapor for the selected semester (per mock data, status still draft) shows an explicit "rapor not yet published" empty state, not blank content or an error.
- [ ] Attempting to select a semester with no mock data available disables/hides that semester in the picker rather than rendering an empty page.
- [ ] A simulated mock-fetch failure renders an error state with a retry action rather than a blank or crashed page.

### Published Rapor View (Student)
- [ ] A student whose current-semester mock rapor is still draft sees the "not yet published" empty state, never draft content.
- [ ] Loading state is shown while mock rapor data is being fetched, with no flash of stale or incorrect semester content.
- [ ] Attempting to trigger download/print with no rapor loaded (empty state) has the action disabled rather than producing an empty document.

## Tasks
1. Scaffold the rapor view route/page reachable from both parent and student dashboards.
2. Build mock/typed fixtures covering TK/SD narrative rapor and SMP/SMA numeric+description rapor, including a draft (unpublished) fixture case.
3. Build the child selector (parent context only) and semester picker shared between both contexts.
4. Build the fase-aware rapor renderer (narrative layout vs. numeric+description layout).
5. Implement download/print action against the rendered mock rapor.
6. Add empty-state (not yet published), loading-state, and error-state handling.
7. Write component tests covering both viewer contexts, fase-based rendering branches, and empty/error states.

## Out of Scope
- Live API integration against the real rapor endpoints (mocked here; wiring is ticket #37)
- Rapor compilation/publish workflow itself (ticket #18, already built)
- Wali kelas/principal review-and-approve UI (not in this ticket's scope — parent/student viewer only)

## Labels
`FE`, `rapor`

## Estimate
M
