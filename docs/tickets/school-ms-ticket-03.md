# 03. BE: auth domain — POST /auth/register, POST /auth/login, POST /auth/logout, GET /auth/me, role guards

## Description
This ticket implements the concrete authentication HTTP surface — register, login, logout, and me endpoints — on top of the JWT verification and tenant-scoping middleware built in ticket #2, plus a reusable role-guard dependency used by every other domain router to enforce per-endpoint role permissions. All six roles (Kepala Sekolah, Guru, Siswa, Orang Tua, Tata Usaha, Yayasan) authenticate through these endpoints.

## Reference
- PRD feature(s): Auth & Multi-tenancy Boundaries
- PRD sub-feature(s): Role-based Access Control; ticket-scoped sub-feature "Credential Auth Endpoints" for the concrete HTTP surface
- PRD path: `docs/PRD.md` lines 591-635

## Sub-feature: Credential Auth Endpoints
Covers the concrete `/auth/register`, `/auth/login`, `/auth/logout`, and `/auth/me` HTTP endpoints, including request validation and JWT issuance/response shape.

## Sub-feature: Role-based Access Control
Covers the reusable role-guard dependency/decorator that every domain router uses to declare allowed roles, returning 403 for disallowed roles and logging escalation attempts.

## Positive Acceptance Criteria

### Credential Auth Endpoints
- [ ] `POST /auth/register` creates a user scoped to a tenant_id (and school_id where applicable) and returns a 201 with the created user's id and role.
- [ ] `POST /auth/login` with correct credentials returns a JWT containing role, tenant_id, and school_id claims matching the user's record.
- [ ] `POST /auth/logout` invalidates the current session/token such that a subsequent `GET /auth/me` with the same token returns 401.
- [ ] `GET /auth/me` with a valid token returns the authenticated user's profile (id, full_name, role, tenant_id, school_id) with a 200.

### Role-based Access Control
- [ ] A role-guard dependency (e.g. `require_role("teacher", "principal")`) can be attached to any router and allows requests from listed roles through to the handler.
- [ ] A request from a role not in the endpoint's allowed list receives 403 with a machine-readable error body (e.g. `{"detail": "forbidden"}`).
- [ ] Every write endpoint defined in this ticket (register admin-created users) has an explicit role-guard test verifying only intended roles succeed.

## Negative Acceptance Criteria

### Credential Auth Endpoints
- [ ] `POST /auth/register` with a duplicate email within the same tenant is rejected with 409/422, not a silent overwrite.
- [ ] `POST /auth/login` with an incorrect password returns 401 without revealing whether the email exists.
- [ ] `GET /auth/me` called with no Authorization header returns 401, and called with an expired token also returns 401 (delegating to ticket #2's middleware).

### Role-based Access Control
- [ ] A student-role token calling a guarded endpoint restricted to teacher/principal returns 403, not 200 or 500.
- [ ] A role-escalation attempt (e.g. a token with tampered/unexpected role claim, or a disallowed role repeatedly hitting a guarded endpoint) is written to an audit/log record.
- [ ] Omitting the role-guard on a newly added endpoint is caught by a test that enumerates all registered routes and fails if any lack a declared role requirement.

## Tasks
1. Implement `POST /auth/register` with Pydantic v2 request/response schemas, hashing/storing `hashed_auth_ref` per the users table.
2. Implement `POST /auth/login` issuing a JWT via the same signing mechanism/secret verified by ticket #2's middleware.
3. Implement `POST /auth/logout` (session/token invalidation, e.g. denylist or short-lived token strategy).
4. Implement `GET /auth/me` returning the authenticated user's profile from verified JWT claims.
5. Build the `require_role(...)` FastAPI dependency and apply it to the endpoints in this ticket as the reference implementation.
6. Add escalation-attempt logging (disallowed-role requests) to a persisted log/table.
7. Write integration tests covering all positive and negative acceptance criteria above.

## Out of Scope
- SQLAlchemy models, Alembic migrations, and the JWT/tenant-scoping middleware internals (already covered by ticket #2).
- Frontend sign-in/sign-up UI and Better Auth client wiring (ticket #4 covers this).
- Tenant/school CRUD endpoints for creating tenants, schools, and assigning admins (ticket #5 covers this).

## Labels
`BE`, `auth`

## Estimate
M
