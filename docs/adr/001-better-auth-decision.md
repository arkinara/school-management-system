# ADR-001: Drop Better Auth in favor of direct JWT auth

## Status

Accepted — ticket #45.

## Context

Ticket #4 installed `better-auth` as a frontend dependency but never wired it up.
Ticket #40 added a direct JWT + refresh flow (`lib/api.ts` + `lib/auth.ts`) built
on plain `fetch`. Both patterns existed in the codebase, which made the session
story ambiguous for anyone reading it.

## Decision

**Remove `better-auth` from frontend dependencies.** Use the direct-fetch + JWT
pattern from ticket #40 exclusively. The public tenant/school pickers and
server-side onboarding added in #45 continue to target the backend's own
`/api/auth/*` endpoints.

## Consequences

- Smaller dependency tree (one less SaaS-shaped library).
- Simpler mental model: the FE holds tokens and `apiFetch` attaches the Bearer
  header; a 401 refreshes once, then redirects to sign-in.
- If Better Auth is needed in the future (SSO, magic links, etc.), it can be
  re-adopted behind the `lib/auth.ts` interface without touching consumers.

## Alternatives considered

- **Adopt Better Auth now:** would require migrating login/register/logout/
  refresh/me endpoints to the library's conventions, plus DB schema additions for
  sessions. Deferred until a concrete need (SSO, magic links) is identified.
