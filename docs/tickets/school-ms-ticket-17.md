# 17. FE: grade entry page — teacher UI per class per subject per category

## Description
Builds the teacher-facing grade-entry UI for recording scores per class, subject, and category. Unlike tickets #15 and #19, this page is wired directly against the real #16 grades API from the start — there is no separate wiring ticket for it — since the BE grades domain is built in this same wave.

## Reference
- PRD feature(s): Penilaian / Grade Book
- PRD sub-feature(s): Grade Entry by Category (FE portion)
- PRD path: `docs/PRD.md` lines 397-431

## Design Baseline
- Visual: `prototype-promax/pages/principal-dashboard.html` at Desktop 1440 (screenshot at `docs/screenshots-promax/principal-dashboard.png`)
- Design tokens: `prototype-promax/assets/theme.css` — HSL channels for primary/accent/semantic; resolve via Tailwind tokens in `frontend/tailwind.config.ts` and `frontend/src/app/globals.css`
- Typography: Fira Sans (UI) + Fira Code (tabular numerals, `font-variant-numeric: tabular-nums`); both via Google Fonts CDN. Replace Inter everywhere.
- Density: 8/10 — 40px table rows, 13px table text, 4/8px spacing rhythm
- Behavioural:
- Grade-entry table follows the Penginputan Nilai pattern on `principal-dashboard.html` — sortable, `data-value` numeric sort
- Field-level validation uses `role="alert"` + focus-first-invalid, per `form-patterns.html`
- Save corrections surface via undo toast, not a confirm dialog

## Sub-feature: Category-based Grade Entry UI
Provides a score input (0-100) with a category tag selector (formatif/sumatif/PR/tugas) and a descriptive-note field that is required for TK/SD and optional for SMP/SMA, submitting directly to the live grades API.

## Sub-feature: Bulk Entry Across Class Roster
Lets a teacher enter scores for one subject and category across an entire class roster in a single bulk-submit action.

## Positive Acceptance Criteria

### Category-based Grade Entry UI
- [ ] Selecting a class, subject, and category loads the roster and renders a score input per student, calling the live GET /grades endpoint for any existing values.
- [ ] Entering a score 0-100 and submitting for a single student calls POST /grades and shows the persisted value on success.
- [ ] For a TK/SD tenant, the descriptive-note field is marked required and blocks submit until filled; for SMP/SMA it is optional and submit succeeds without it.
- [ ] Category tag selector only offers formatif/sumatif/PR/tugas and passes the selected value through to the API payload unchanged.

### Bulk Entry Across Class Roster
- [ ] Entering scores for multiple students in the roster and triggering "submit all" issues grade entries for every filled row in one bulk action.
- [ ] Rows left blank during a bulk submit are skipped (no POST sent for them) while filled rows still submit successfully.
- [ ] After a successful bulk submit, each row reflects a saved/confirmed state sourced from the API response.

## Negative Acceptance Criteria

### Category-based Grade Entry UI
- [ ] Entering a score outside 0-100 is blocked client-side with an inline error and no API call is made.
- [ ] Submitting a TK/SD entry with the required note left empty is blocked client-side before any API call.
- [ ] A 422 validation error returned from the live API is surfaced as an inline field-level error message, not a silent failure.
- [ ] A roster with zero enrolled students renders an explicit empty state instead of an empty table.

### Bulk Entry Across Class Roster
- [ ] If the bulk submit partially fails (some student POSTs succeed, some return errors from the API), succeeded rows are marked saved and failed rows show a per-row retry affordance rather than the whole batch silently discarding.
- [ ] Triggering bulk submit a second time while the first is still in flight is disabled to prevent duplicate submissions.
- [ ] A network/API failure during bulk submit shows an error state with a retry action rather than losing the entered scores.

## Tasks
1. Scaffold the grade entry route/page under the teacher dashboard section.
2. Build class/subject/category selector and roster fetch against the live GET /grades (ticket #16) endpoint.
3. Build per-row score input with jenjang-aware required/optional note field and client-side 0-100 validation.
4. Wire single-row submit to POST /grades and render saved/error state per row.
5. Implement bulk "submit all" action with per-row success/failure handling and duplicate-submit guarding.
6. Add empty-state, loading-state, and error-state handling for roster fetch and submit.
7. Write component/integration tests covering validation, single and bulk submit paths, and partial-failure handling.

## Out of Scope
- BE grades domain logic (ticket #16, already built — this ticket only consumes it)
- Grade aggregation/rollup view for wali kelas (covered by ticket #16's aggregation endpoint output; this ticket is entry-only, not the rollup view)
- Rapor compilation (ticket #18)

## Labels
`FE`, `penilaian`

## Estimate
M
