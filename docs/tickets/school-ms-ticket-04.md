# 04. FE: Better Auth wiring — sign-in/sign-up pages + tenant-picker onboarding for first user

## Description
This ticket wires Better Auth on the Next.js frontend against the real backend auth endpoints delivered in ticket #3, builds the sign-in and sign-up forms, and adds a first-run tenant-picker step so a newly authenticated user resolves to the correct tenant/school context before landing on their role dashboard. Since ticket #3 lands in the same wave, this ticket integrates directly against live `/auth/*` APIs with no mock data and no separate wiring ticket. Applies to all six roles at first login.

## Reference
- PRD feature(s): Auth & Multi-tenancy Boundaries
- PRD sub-feature(s): ticket-scoped sub-features "Sign-in / Sign-up Pages" and "Tenant-picker Onboarding" (frontend realization of the PRD's Auth & Multi-tenancy Boundaries feature)
- PRD path: `docs/PRD.md` lines 591-635

## Sub-feature: Sign-in / Sign-up Pages
Covers the Better Auth client configuration, sign-in and sign-up form pages, client-side validation, and session persistence against the real backend from ticket #3.

## Sub-feature: Tenant-picker Onboarding
Covers the first-user-of-a-tenant flow that lets a newly authenticated user pick/confirm their jenjang tenant/school context before being routed onward.

## Positive Acceptance Criteria

### Sign-in / Sign-up Pages
- [ ] Sign-in page submits credentials to the real `POST /auth/login` endpoint and, on success, persists the session/JWT such that a page refresh keeps the user authenticated.
- [ ] Sign-up page submits to the real `POST /auth/register` endpoint and, on success, redirects the user into the tenant-picker/onboarding flow.
- [ ] Client-side validation blocks submission of an empty email or a password under the minimum length before any network call is made.
- [ ] A signed-in user's session is available to `GET /auth/me` calls made from server components/actions without requiring the user to re-enter credentials.

### Tenant-picker Onboarding
- [ ] A user whose token/profile has no resolved school_id (e.g. newly registered admin) is shown a tenant/school picker before reaching any role dashboard.
- [ ] Selecting a tenant/school in the picker persists the choice (e.g. via a follow-up API call or session update) so subsequent logins skip the picker.
- [ ] After completing the tenant-picker step, the user is redirected to the dashboard route matching their role.

## Negative Acceptance Criteria

### Sign-in / Sign-up Pages
- [ ] Submitting sign-in with an incorrect password shows an inline error message and does not persist any session/token.
- [ ] A network/500 error from the backend during login is caught and surfaced as a user-visible error state, not an unhandled crash.
- [ ] Sign-up with an email already registered in the tenant surfaces the backend's 409/422 error as a field-level validation message, not a generic failure.

### Tenant-picker Onboarding
- [ ] A user who already has a resolved tenant/school context is never shown the tenant-picker screen (no redundant onboarding step).
- [ ] Attempting to skip/bypass the tenant-picker via direct URL navigation to a dashboard route redirects back to the picker when context is unresolved.
- [ ] An empty-state is shown (not a blank/broken screen) if the tenant-picker API call returns zero available tenants/schools for the user to choose from.

## Tasks
1. Install and configure Better Auth client in the Next.js app, pointing at the real backend base URL.
2. Build the sign-in page/form with client-side validation and error-state handling.
3. Build the sign-up page/form wired to `POST /auth/register`.
4. Implement session persistence (cookies/localStorage per Better Auth convention) and a `GET /auth/me` hook for server components/actions.
5. Build the tenant-picker onboarding screen, gated on whether the authenticated user's profile has a resolved school_id.
6. Implement redirect logic: unauthenticated to sign-in, authenticated-without-context to tenant-picker, authenticated-with-context to role dashboard.
7. Write component/integration tests covering the positive and negative acceptance criteria above.

## Out of Scope
- Backend auth endpoints and role-guard logic (ticket #3, already built — this ticket only consumes them).
- Backend tenant/school CRUD for creating tenants and schools (ticket #5 covers this).
- The six role dashboards' actual widget content (tickets #8-#13) — this ticket only handles the redirect-after-login, not dashboard widgets.

## Labels
`FE`, `auth`

## Estimate
M
