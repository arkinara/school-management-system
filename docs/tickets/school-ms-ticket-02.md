# 02. BE: shared scaffolding — SQLAlchemy models, Alembic migration, seed data, JWT + Better Auth verification, tenant scoping middleware

## Description
This ticket lays down the full backend data model (all fourteen tables from the PRD's Database Schema) and the two cross-cutting middlewares that every domain module depends on: JWT verification and tenant/school data scoping. It is pure backend foundation work with no end-user-facing role, consumed directly by the auth domain ticket (#3) and every subsequent domain ticket (attendance, grading, rapor, jadwal, SPP, komunikasi).

## Reference
- PRD feature(s): Auth & Multi-tenancy Boundaries
- PRD sub-feature(s): JWT Verification Middleware; Tenant/School Data Scoping
- PRD path: `docs/PRD.md` lines 591-635 (Auth & Multi-tenancy Boundaries), 136-181 (Database Schema)

## Sub-feature: Data Model & Migrations
SQLAlchemy 2.0 models for all fourteen tables (tenants, schools, users, students, classes, subjects, schedules, attendances, grades, report_cards, spp_bills, spp_payments, announcements, message_threads, messages), one initial Alembic migration, and a seed-data script for local dev.

## Sub-feature: JWT Verification Middleware
Backend middleware that validates the JWT on every incoming request and attaches verified claims (role, tenant_id, school_id) to request context, matching Better Auth's issued token format.

## Sub-feature: Tenant/School Scoping Middleware
Query-layer enforcement that automatically filters every DB query by the requester's tenant_id and school_id, with an explicit, audit-logged bypass path for super_admin.

## Positive Acceptance Criteria

### Data Model & Migrations
- [ ] All 14 tables from the PRD Database Schema exist as SQLAlchemy 2.0 models with correct FKs (e.g. `students.class_id -> classes.id`, `spp_payments.bill_id -> spp_bills.id`).
- [ ] `alembic upgrade head` run against a fresh SQLite dev DB creates all tables with no errors.
- [ ] Seed script creates at least one tenant per jenjang_type (TK/SD/SMP/SMA), one school per tenant, and one user per role (principal/teacher/student/parent/admin/super_admin).
- [ ] `report_cards.compiled_data` and `tenants.config` are modeled as JSON-typed columns that accept arbitrary nested JSON without schema changes.

### JWT Verification Middleware
- [ ] A request with a valid, unexpired JWT signed with the shared secret passes middleware and has `request.state.role`, `request.state.tenant_id`, `request.state.school_id` populated from token claims.
- [ ] Middleware correctly parses a token issued by the Better Auth token format (same claim names/structure).
- [ ] A `super_admin` token with `school_id: null` is accepted without middleware raising a missing-field error.

### Tenant/School Scoping Middleware
- [ ] A shared query helper/dependency automatically appends `WHERE tenant_id = :tenant_id` (and `school_id` where applicable) to queries for non-super_admin roles.
- [ ] `super_admin` requests can bypass tenant filtering explicitly via a documented helper (e.g. `scoped_query(bypass=True)`), and each bypass call is written to an audit log table/record.
- [ ] Scoping helper is reusable across at least two different model types (e.g. `students`, `spp_bills`) without duplicating filter logic.

## Negative Acceptance Criteria

### Data Model & Migrations
- [ ] Running the seed script twice does not create duplicate tenants/schools (idempotent or clearly errors on unique constraint).
- [ ] `alembic downgrade base` followed by `alembic upgrade head` succeeds without leaving orphaned tables or constraints.
- [ ] Attempting to insert a `grades.score` outside 0-100 or an invalid `attendances.status` enum value is rejected at the model/DB constraint level.

### JWT Verification Middleware
- [ ] A request with a missing Authorization header is rejected with 401 before reaching any route handler.
- [ ] A request with an expired token is rejected with 401 and a distinguishable error message from "invalid signature."
- [ ] A request with a token signed by a different/wrong secret is rejected with 401, not silently accepted.

### Tenant/School Scoping Middleware
- [ ] A non-super_admin request whose token `tenant_id` does not match the target resource's `tenant_id` returns 403 or an empty result set, never another tenant's row.
- [ ] Calling the scoped query helper without a resolved `tenant_id` in request context raises an explicit error rather than defaulting to an unscoped query.
- [ ] A super_admin bypass call made without providing an audit reason/context fails validation rather than silently proceeding.

## Tasks
1. Define SQLAlchemy 2.0 declarative models for all 14 tables per the PRD Database Schema, including enums (role, attendance status, grade category, bill status, report_card status, announcement audience).
2. Set up Alembic and generate the initial migration from the models against SQLite.
3. Write a seed-data script covering all jenjang types, at least one school per tenant, and one user of each of the 6 roles.
4. Implement JWT verification middleware/dependency compatible with Better Auth's token claim structure (role, tenant_id, school_id).
5. Implement a tenant/school scoping query helper (e.g. SQLAlchemy session-level filter or repository-pattern base class) with an explicit super_admin bypass and audit logging.
6. Write unit tests for both middlewares covering the acceptance criteria above.
7. Document the scoping helper's usage pattern for downstream domain tickets.

## Out of Scope
- Concrete `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/me` HTTP endpoints and role-guard decorators (ticket #3 covers this).
- Frontend sign-in/sign-up pages (ticket #4 covers this).
- Domain-specific CRUD business logic and routers for attendance, grading, rapor, jadwal, SPP, komunikasi (later domain tickets); this ticket only provides models and middleware, not routers.

## Labels
`BE`, `auth`

## Estimate
L
