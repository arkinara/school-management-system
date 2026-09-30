# 30. BE: audit log + cross-cutting observability — auth events, data mutations, tenant-boundary attempts

## Description
Implements a shared backend audit-logging facility hooked into the auth middleware so every domain router can record login/logout events, role-escalation attempts, data mutations, and tenant-boundary violations with actor, timestamp, and action detail. Satisfies the PRD's audit requirements for admin assignment, role-based access control, and tenant/school data scoping, and provides the hook points other domain tickets (#5-#26) are expected to call into.

## Reference
- PRD feature(s): Auth & Multi-tenancy Boundaries
- PRD sub-feature(s): Role-based Access Control (audit portion: role escalation attempts logged); Tenant/School Data Scoping (audit portion: super_admin bypass explicit and audit-logged)
- PRD path: `docs/PRD.md` lines 591-635

## Sub-feature: Auth & Mutation Audit Events
Records login/logout, role-escalation attempts, and data mutations across all domains with actor, timestamp, and action, via a shared, reusable logging facility.

## Sub-feature: Tenant-boundary Violation Logging
Explicitly logs cross-tenant access attempts by non-super_admin roles and every super_admin cross-tenant bypass, so tenant-boundary crossings are never silent.

## Positive Acceptance Criteria

### Auth & Mutation Audit Events
- [ ] A shared `AuditLog` model/table records `actor_id`, `actor_role`, `action`, `resource_type`, `resource_id`, `tenant_id`, `school_id`, and `timestamp` for each logged event.
- [ ] Successful and failed login attempts are recorded via the audit facility, including the attempted email/identifier and outcome.
- [ ] A request from a role without permission for an endpoint (403 role check) is recorded as a role-escalation-attempt audit event, including the endpoint and required vs. actual role.
- [ ] Domain routers (e.g. admin assignment per ticket #2/#3, and future domain mutations) can call a single shared function/dependency (e.g. `log_audit_event(...)`) to record a mutation without duplicating logging logic.
- [ ] Audit log entries are queryable by super_admin filtered by actor, action type, date range, and tenant/school.

### Tenant-boundary Violation Logging
- [ ] A request from a non-super_admin role attempting to access a resource outside their own `tenant_id`/`school_id` is recorded as a tenant-boundary-violation audit event before the 403/empty response is returned.
- [ ] Every instance of a super_admin using the cross-tenant bypass path (e.g. viewing another school's data) is recorded as an explicit audit event distinct from a normal same-tenant read.
- [ ] Audit events for tenant-boundary violations include the resource's actual `tenant_id`/`school_id` versus the requester's claimed `tenant_id`/`school_id`.
- [ ] Admin reassignment/removal (per ticket #2/#3's Admin Assignment sub-feature) produces an audit record capturing who reassigned/removed which admin and when.

## Negative Acceptance Criteria

### Auth & Mutation Audit Events
- [ ] If the audit-logging call itself fails (e.g. DB write error), the underlying business request does not silently fail or roll back due to the audit failure — audit logging failures are captured/alerted separately, not allowed to block core functionality, unless the event is a security-critical one explicitly configured to fail closed.
- [ ] A read-only (GET) request that does not mutate data and is within the requester's own scope does NOT generate a mutation audit event (avoiding log noise).
- [ ] Querying audit logs as a non-super_admin role is rejected with 403; audit logs are not exposed to principal/TU/guru/parent/student roles.
- [ ] Querying audit logs for a date range/actor with no matching events returns an empty list (200), not an error.

### Tenant-boundary Violation Logging
- [ ] A same-tenant, same-school request that is fully within scope does NOT generate a false-positive tenant-boundary-violation log entry.
- [ ] A cross-tenant read attempt by a non-super_admin still returns 403/empty result to the caller even though it is logged — the logging must not accidentally grant access.
- [ ] Audit log entries cannot be edited or deleted via any exposed API endpoint (append-only); an attempt to modify or delete a log entry is rejected with 403/404.
- [ ] Missing or malformed `tenant_id`/`school_id` claims on a request do not crash the audit facility; such requests are logged as anomalous/invalid-claim events and still rejected by the auth middleware per ticket #2/#3.

## Tasks
1. Define SQLAlchemy model and Alembic migration for an append-only `audit_logs` table (actor_id, actor_role, action, resource_type, resource_id, tenant_id, school_id, metadata/detail JSON, timestamp).
2. Implement a shared `log_audit_event(...)` helper/dependency that domain routers and the auth middleware can call.
3. Hook the helper into the JWT/auth middleware (#2, #3) to record login/logout and role-check-failure (403) events automatically.
4. Hook the helper into the tenant/school scoping query layer (#2, #3) to record tenant-boundary-violation attempts and super_admin cross-tenant bypass usage.
5. Wire the admin assignment/reassignment/removal flow (#2/#3) to emit audit events for those specific actions per PRD's explicit requirement.
6. Build a super_admin-only audit-log query endpoint with filters (actor, action type, date range, tenant/school) and pagination.
7. Enforce append-only behavior: no update/delete endpoints exposed for audit_logs; add a DB-level or API-level guard against modification.
8. Decide and implement the failure-mode policy (log-write failure does not block business logic, except for explicitly security-critical events) and add monitoring/alerting hook for audit-write failures.
9. Write unit/integration tests covering all positive and negative acceptance criteria above.

## Out of Scope
- Any FE audit-log viewer UI (not in this wave plan — deferred/future)
- Domain-specific business logic itself (tickets #5-#26 — this ticket only provides the logging facility and hooks, not what each domain does)

## Labels
`BE`, `auth`

## Estimate
M
