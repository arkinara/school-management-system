# 22. FE: jadwal view page — per-role today's classes/schedule

## Description
Builds the read-only personalized schedule view consumed by guru, siswa, and orang tua dashboards, wired directly against the real #20 schedules API since that backend is built in the same wave. Defaults to showing today's sessions with a toggle to see the full week, filtered to only the sessions relevant to the logged-in user's role.

## Reference
- PRD feature(s): Jadwal Pelajaran
- PRD sub-feature(s): Personalized Schedule Views
- PRD path: `docs/PRD.md` lines 470-505

## Design Baseline
- Visual: `prototype-promax/pages/guru-dashboard.html` at Desktop 1440 (screenshot at `docs/screenshots-promax/guru-dashboard.png`)
- Design tokens: `prototype-promax/assets/theme.css` — HSL channels for primary/accent/semantic; resolve via Tailwind tokens in `frontend/tailwind.config.ts` and `frontend/src/app/globals.css`
- Typography: Fira Sans (UI) + Fira Code (tabular numerals, `font-variant-numeric: tabular-nums`); both via Google Fonts CDN. Replace Inter everywhere.
- Density: 8/10 — 40px table rows, 13px table text, 4/8px spacing rhythm
- Behavioural:
- Per-role today's classes/schedule reuses the today-timeline (`guru-dashboard.html`) and today-schedule (`siswa-dashboard.html`) patterns
- Deep linking via URL hash (`#page=jadwal&vp=<role>`)

## Sub-feature: Teacher Today/Week View
Shows a guru only the sessions where they are the assigned teacher, defaulting to today with a toggle to the full week.

## Sub-feature: Student/Parent Today/Week View
Shows siswa/orang tua only the sessions for the student's own class, defaulting to today with a toggle to the full week.

## Positive Acceptance Criteria

### Teacher Today/Week View
- [ ] On load, a logged-in guru sees only today's sessions where they are the assigned teacher, fetched via GET /schedules?teacher_id=<self>.
- [ ] Toggling to "full week" shows all of that teacher's sessions across all days, grouped by day.
- [ ] If a schedule entry is updated in #20 (e.g. substitute teacher reassigned), refreshing the view reflects the change immediately.

### Student/Parent Today/Week View
- [ ] On load, a logged-in siswa or orang tua sees only today's sessions for the student's class, fetched via GET /schedules?class_id=<student's class>.
- [ ] Toggling to "full week" shows all sessions for that class across all days, grouped by day.
- [ ] An orang tua with multiple children sees a class/child selector that switches which class's schedule is displayed.

## Negative Acceptance Criteria

### Teacher Today/Week View
- [ ] A guru with no sessions assigned today sees an explicit "no classes today" empty state, not a blank screen.
- [ ] If GET /schedules fails, the view shows an error state with retry rather than an empty or stale list.
- [ ] A guru cannot see another teacher's sessions even by manipulating query parameters client-side (view is scoped to the authenticated user's teacher_id server-side).

### Student/Parent Today/Week View
- [ ] A siswa/orang tua with no sessions today (e.g. holiday/weekend) sees an explicit empty state, not a blank screen.
- [ ] If GET /schedules fails, the view shows an error state with retry rather than an empty or stale list.
- [ ] A siswa/orang tua cannot view another class's schedule by manipulating query parameters (server enforces class scoping to the student's own class).

## Tasks
1. Build the "today" schedule view component shared by guru and siswa/orang tua, parameterized by role-based filter (teacher_id vs class_id).
2. Build the full-week toggle view grouping sessions by day.
3. Wire GET /schedules with the appropriate role-based filter derived from the authenticated user's session/profile.
4. Implement empty state, loading state, and error/retry state for both roles.
5. Implement child/class selector for orang tua accounts with multiple children.
6. Verify server-side scoping prevents cross-role/cross-class data leakage via query manipulation.

## Out of Scope
- Schedule configuration/editing (ticket #21, TU/admin only)
- BE schedule domain logic itself (ticket #20, already built)
- Substitute-teacher assignment editing (a #21 concern; this ticket only displays the result)

## Labels
`FE`, `jadwal`

## Estimate
M
