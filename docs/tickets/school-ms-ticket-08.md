# 8. FE: principal dashboard — school-wide KPI widgets + Yayasan school picker

## Description
This ticket builds the principal's home screen per PRD Requirements > Dashboard, rendering school-wide KPI widgets (attendance rate, grade-entry completion, SPP collection rate) against typed mock/placeholder data, and a shared school-picker shell component so a Yayasan-scoped user can switch which school's principal view they are viewing. It covers the principal portion of the "Principal & Yayasan Overview Widgets" sub-feature; live API wiring is deferred to the paired FE-wiring ticket. Roles: Kepala Sekolah (principal), Yayasan (via school picker).

## Reference
- PRD feature(s): `## Feature: Role-based Dashboard`
- PRD sub-feature(s): `## Sub-feature: Principal & Yayasan Overview Widgets` (principal portion only)
- PRD path: `docs/PRD.md` lines 307-348

## Sub-feature: Principal School-wide KPIs
Render attendance rate, grade-entry completion, and SPP collection rate widgets for the principal's own school, against typed mock data matching the eventual API response shape.

## Sub-feature: Yayasan Quick School Picker (Shared Shell)
Build a shared dashboard-shell component that lets a Yayasan-scoped user select which school's principal view to display, reusing the same KPI widgets.

## Positive Acceptance Criteria

### Principal School-wide KPIs
- [ ] Principal dashboard renders an attendance-rate widget, a grade-entry-completion widget, and an SPP-collection-rate widget on page load, sourced from a typed mock data module.
- [ ] Each KPI widget displays a percentage value and a supporting label (e.g. "Attendance today: 92%") matching the field names/shape the future real API is expected to return.
- [ ] Widgets render correctly at desktop and mobile breakpoints without overlap or truncation.
- [ ] Mock data module is structured so swapping in a real fetch call (ticket #31) requires no widget-component changes, only a data-source swap.

### Yayasan Quick School Picker (Shared Shell)
- [ ] A Yayasan-role user sees a school-picker dropdown/selector above the KPI widgets; a principal-role user does not see the picker.
- [ ] Selecting a different school in the picker re-renders the KPI widgets with that school's mock dataset.
- [ ] The picker lists all mock schools available to the Yayasan user, grouped by tenant/jenjang as in the mock dataset.

## Negative Acceptance Criteria

### Principal School-wide KPIs
- [ ] When mock data for a KPI is empty/zero (e.g. no attendance records yet), the widget renders an explicit empty state ("No attendance data yet") rather than a blank or NaN value.
- [ ] A simulated loading state (artificial delay in mock data resolution) shows a skeleton/spinner per widget, not a blank screen.
- [ ] A simulated error state (mock data rejection) shows an inline error message per widget without crashing the rest of the dashboard.

### Yayasan Quick School Picker (Shared Shell)
- [ ] If the mock school list is empty for a Yayasan user, the picker shows a disabled/empty state instead of an unstyled empty dropdown.
- [ ] Attempting to render the picker for a role other than Yayasan (e.g. teacher) does not display it, even if the component is mounted.
- [ ] Switching schools rapidly (multiple clicks before previous render completes) does not leave stale KPI data from the prior school displayed.

## Tasks
1. Define TypeScript types for the principal KPI response shape (attendance_rate, grade_entry_completion, spp_collection_rate) matching the eventual backend contract.
2. Build a typed mock data module (fixtures) for multiple schools' KPI values, including empty/zero and multi-tenant sibling schools for the picker.
3. Build the KPI widget components (attendance, grade completion, SPP collection) with loading/empty/error states.
4. Build the principal dashboard page/layout assembling the KPI widgets under the role-based dashboard shell.
5. Build the Yayasan school-picker component, gated by role, driving which mock dataset the KPI widgets consume.
6. Wire mock data through a swappable data-access function (e.g. a hook/service layer) so ticket #31 can later replace it with a real fetch.
7. Add component-level tests for loading/empty/error states and role-gating of the picker.

## Out of Scope
- Live API integration — mocked/placeholder data is used here; real backend wiring is ticket #31.
- Yayasan's own multi-tenant overview dashboard (ticket #13).
- Guru, siswa, orang-tua, and TU dashboards (tickets #9-#12).

## Labels
`FE`, `dashboard`

## Estimate
M
