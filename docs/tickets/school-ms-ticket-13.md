# 13. FE: yayasan dashboard — multi-tenant overview, school comparison, user counts

## Description
This ticket builds the Yayasan (foundation/super-admin) home screen: a multi-tenant/school comparison overview and cross-school user and enrollment counts. It covers the yayasan portion of the PRD's Role-based Dashboard feature, specifically the "Principal & Yayasan Overview Widgets" sub-feature. Unlike the siswa/orang tua/TU dashboards, this ticket wires directly against the real tenants/schools APIs (ticket #5) and users APIs (ticket #6), both already available by this wave, so no mock-data convention applies here.

## Reference
- PRD feature(s): `## Feature: Role-based Dashboard`
- PRD sub-feature(s): `## Sub-feature: Principal & Yayasan Overview Widgets` (yayasan portion only)
- PRD path: `docs/PRD.md` lines 307-348

## Sub-feature: Multi-tenant/School Comparison Overview
Covers a widget listing all tenants (jenjang) and their schools with a side-by-side comparison of key health metrics, wired directly to the real tenants/schools API from ticket #5.

## Sub-feature: Cross-school User & Enrollment Counts
Covers a widget summarizing user counts by role and enrollment counts per school/tenant, wired directly to the real users API from ticket #6.

## Positive Acceptance Criteria

### Multi-tenant/School Comparison Overview
- [ ] On load, widget fetches and renders all tenants grouped with their schools via the real tenants/schools API, showing tenant name, jenjang_type, and school count per tenant.
- [ ] Widget supports filtering/selecting a subset of tenants or schools to compare side by side.
- [ ] Widget correctly reflects a newly created tenant or school (per ticket #5 data) without requiring a hard page reload, on next fetch/refresh.

### Cross-school User & Enrollment Counts
- [ ] Widget shows a breakdown of user counts by role (principal/teacher/student/parent/admin) per school, sourced from the real users API.
- [ ] Widget shows total enrollment count aggregated across all schools and per-school subtotals.
- [ ] Counts update correctly when queried after a user record is added/deactivated via ticket #6's API (reflected on next fetch).

## Negative Acceptance Criteria

### Multi-tenant/School Comparison Overview
- [ ] When the tenants/schools API returns zero tenants (fresh install), widget shows an explicit "No tenants yet" empty state instead of a blank comparison table.
- [ ] When the tenants/schools API call fails (network/5xx), widget shows an explicit error state with a retry action, never a silently blank widget.
- [ ] Widget shows a loading skeleton while the tenants/schools fetch is in flight.

### Cross-school User & Enrollment Counts
- [ ] When a school has zero users of a given role, that role's count renders as 0, not omitted or blank.
- [ ] When the users API call fails (network/5xx), widget shows an explicit error state with a retry action, never a silently blank widget or stale zero counts presented as current.
- [ ] Widget shows a loading skeleton while the users fetch is in flight.

## Tasks
1. Define TypeScript client/query hooks for the real tenants/schools API (ticket #5) and users API (ticket #6).
2. Implement Yayasan dashboard route/layout shell (role-gated to super_admin/yayasan).
3. Build Multi-tenant/School Comparison Overview widget with live data fetching, filtering, and comparison view.
4. Build Cross-school User & Enrollment Counts widget with live data fetching and role/school breakdown.
5. Implement loading, empty, and error states (with retry) for both widgets.
6. Add a placeholder/best-effort SPP collection-rate metric slot clearly labeled as not-yet-live (see Out of Scope).
7. Wire both widgets into the Yayasan dashboard page layout with responsive styling per M3 tokens.
8. Add integration tests covering populated, empty, and API-error scenarios against the real endpoints (mocked at the HTTP layer for test determinism).

## Out of Scope
- Principal's own single-school dashboard — covered by ticket #8.
- Tenants/schools CRUD backend itself — covered by ticket #5 (this ticket only consumes its read APIs).
- Live cross-school SPP collection-rate aggregate — no dedicated wiring ticket exists for this dashboard in the current plan, so this metric uses a best-effort/placeholder value at build time until the SPP domain (ticket #23) exists.

## Labels
`FE`, `dashboard`

## Estimate
M
