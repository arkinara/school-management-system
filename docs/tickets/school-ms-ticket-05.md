# 5. BE: tenants + schools domain — CRUD scoped to Yayasan/super_admin

## Description
This ticket implements the Yayasan/super_admin-only CRUD for the top of the tenant hierarchy (tenants -> schools) that every other domain (users, students, absensi, penilaian, jadwal, SPP) depends on for scoping. It covers creating jenjang tenants (TK/SD/SMP/SMA) with their kurikulum configuration and registering schools under those tenants, per the "Multi-tenant School Setup" PRD feature. Only the Yayasan/super_admin role interacts with these endpoints directly.

## Reference
- PRD feature(s): `## Feature: Multi-tenant School Setup`
- PRD sub-feature(s): `## Sub-feature: Tenant Creation`, `## Sub-feature: School Registration`
- PRD path: `docs/PRD.md` lines 213-257

## Sub-feature: Tenant Creation
Create a jenjang tenant with name, jenjang_type, and kurikulum_version, rejecting duplicate tenant names within the same jenjang_type.

## Sub-feature: School Registration
Create a school under an existing tenant, inheriting the tenant's kurikulum_version, and list schools grouped by tenant for the Yayasan overview.

## Positive Acceptance Criteria

### Tenant Creation
- [ ] Super_admin can POST a new tenant with name, jenjang_type (TK/SD/SMP/SMA), and kurikulum_version, receiving a 201 with the created tenant record.
- [ ] Super_admin can GET a list of all tenants across the system, and GET a single tenant by id.
- [ ] Super_admin can update a tenant's kurikulum_version and config fields via PATCH, with the change reflected on subsequent GET.
- [ ] Creating a second tenant with a different jenjang_type but the same name succeeds (uniqueness is scoped per jenjang_type, not global).

### School Registration
- [ ] Super_admin can POST a new school with name, address, and tenant_id, receiving a 201 with the created school record including the inherited kurikulum_version.
- [ ] GET /tenants/{id}/schools returns all schools registered under that tenant.
- [ ] A newly created school's kurikulum_version defaults to its parent tenant's kurikulum_version and is not independently settable at creation.
- [ ] GET schools list (unscoped, super_admin only) returns schools grouped/filterable by tenant_id for the Yayasan overview.

## Negative Acceptance Criteria

### Tenant Creation
- [ ] Creating a tenant with a name that already exists within the same jenjang_type returns 409/422 and no duplicate row is created.
- [ ] Creating a tenant with a missing or invalid jenjang_type (not one of TK/SD/SMP/SMA) returns 422.
- [ ] A non-super_admin role (principal, TU, teacher, parent, student) calling the tenant create/update/delete endpoints receives 403.

### School Registration
- [ ] Creating a school referencing a non-existent tenant_id returns 404/422 and no school is created.
- [ ] Creating a school with a missing required field (name or address) returns 422 with a field-level error.
- [ ] A non-super_admin role calling the school create/update endpoints receives 403, and a principal/TU scoped to a different school cannot read another school's record (403/empty result).

## Tasks
1. Add/confirm SQLAlchemy models for `tenants` and `schools` per the PRD schema (fields: id, name, jenjang_type, kurikulum_version, config, created_at / id, tenant_id, name, address, principal_id, created_at).
2. Write Alembic migration for `tenants` and `schools` tables including the unique constraint on (name, jenjang_type) for tenants.
3. Implement Pydantic v2 schemas for tenant create/update/read and school create/update/read.
4. Implement tenant router: POST, GET list, GET by id, PATCH, restricted to super_admin role via the shared RBAC dependency.
5. Implement school router: POST (validates tenant_id exists, inherits kurikulum_version), GET list (with tenant grouping/filter), GET by id, PATCH.
6. Enforce tenant/school scoping middleware pass-through so non-super_admin roles are correctly restricted or 403'd.
7. Write unit/integration tests covering all positive and negative AC above.

## Out of Scope
- Assigning principal/TU admins to a school (ticket #6 — users domain, "Admin Assignment" sub-feature).
- Student/parent records under a school (ticket #7).
- Yayasan dashboard UI consuming this data (ticket #13, wired directly since this BE is ready by wave 3).

## Labels
`BE`, `master-data`

## Estimate
M
