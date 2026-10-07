/**
 * Auth client for the MVP.
 *
 * Direct-fetch wrapper over the backend `/api/auth/*` endpoints built in
 * ticket #3. Better Auth was removed in ticket #45 (see
 * `docs/adr/001-better-auth-decision.md`). Tokens are persisted in localStorage
 * (see `lib/api.ts`) and replayed as a Bearer header.
 *
 * This module is intentionally pure TypeScript (no JSX) so it can be imported
 * from client components and, where safe, server code.
 */

import {
  apiFetch,
  clearToken,
  getRefreshToken,
  getToken,
  hasRefreshToken,
  refreshTokens,
  setRefreshToken,
  setToken,
  UnauthorizedError,
} from "./api";

export { getToken, setToken, clearToken, getRefreshToken, refreshTokens };

export type UserRole = "principal" | "teacher" | "student" | "parent" | "admin" | "super_admin";

export interface User {
  id: number;
  tenant_id: number;
  school_id: number | null;
  email: string;
  role: UserRole;
  full_name: string;
  created_at: string;
}

export interface AuthResponse {
  user: User;
  access_token: string;
  refresh_token?: string | null;
  token_type: "bearer";
}

export interface UserMe {
  user: User;
  tenant_id: number;
  school_id: number | null;
  role: UserRole;
}

export interface LoginInput {
  email: string;
  password: string;
  tenantId?: number;
}

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  schoolId?: number;
}

/** Minimal school row from the public picker endpoint. */
export interface SchoolOption {
  id: number;
  name: string;
  tenant_id: number;
}

/** Minimal tenant row from the public picker endpoint. */
export interface TenantOption {
  id: number;
  name: string;
  jenjang_type: string;
}

/**
 * Public, unauthenticated tenant list for the sign-in/sign-up picker.
 * Comes straight from the backend so removing a tenant updates the UI without
 * a frontend deploy.
 */
export function fetchTenants(): Promise<TenantOption[]> {
  return apiFetch<TenantOption[]>("/api/public/tenants");
}

/** Public, unauthenticated schools for one tenant, for the school picker. */
export function fetchSchoolsForTenant(tenantId: number): Promise<SchoolOption[]> {
  return apiFetch<SchoolOption[]>(`/api/public/schools?tenant_id=${tenantId}`);
}

/**
 * Only allow same-origin absolute paths as a post-auth `next` target. Blocks
 * protocol-relative URLs (`//evil.com`) and anything not rooted at `/`.
 */
export function sanitizeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

interface BackendLogin {
  email: string;
  password: string;
  tenant_id?: number;
}

interface BackendRegister {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
  school_id?: number;
}

/** POST /api/auth/login — authenticates and returns a JWT. */
export async function login({ email, password, tenantId }: LoginInput): Promise<AuthResponse> {
  const body: BackendLogin = { email, password };
  if (tenantId !== undefined) body.tenant_id = tenantId;
  return apiFetch<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** POST /api/auth/register — public self-registration, returns a JWT. */
export async function register({
  email,
  password,
  fullName,
  role,
  schoolId,
}: RegisterInput): Promise<AuthResponse> {
  const body: BackendRegister = {
    email,
    password,
    full_name: fullName,
    role,
  };
  if (schoolId !== undefined) body.school_id = schoolId;
  return apiFetch<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** POST /api/auth/logout — revokes the token server-side, then clears local auth. */
export async function logout(): Promise<void> {
  const refresh = getRefreshToken();
  try {
    await apiFetch<void>("/api/auth/logout", {
      method: "POST",
      // The backend expects a bare JSON string holding the refresh token.
      body: refresh ? JSON.stringify(refresh) : undefined,
    });
  } catch (err) {
    if (!(err instanceof UnauthorizedError)) {
      // Network hiccups must not trap the user in a signed-in UI.
    }
  } finally {
    clearToken();
  }
}

/** GET /api/auth/me — returns the profile, or null when the token is invalid. */
export async function getMe(): Promise<UserMe | null> {
  try {
    if (!getToken() && hasRefreshToken()) {
      await refreshTokens();
    }
    return await apiFetch<UserMe>("/api/auth/me");
  } catch (err) {
    if (err instanceof UnauthorizedError) return null;
    throw err;
  }
}

/** True when a token is present locally (it may still be expired server-side). */
export function isAuthenticated(): boolean {
  return getToken() !== null;
}

/** Persist the token pair returned by login/register/refresh/onboarding. */
export function persistAuth(res: AuthResponse): void {
  setToken(res.access_token);
  if (res.refresh_token) setRefreshToken(res.refresh_token);
}

/**
 * POST /api/auth/complete-onboarding — persist the chosen school server-side.
 *
 * The backend is the source of truth: the response carries a fresh access token
 * whose `school_id` claim reflects the pick, so subsequent logins skip the
 * picker without any client-side state. Idempotent on the server.
 */
export function completeOnboarding(schoolId: number): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/auth/complete-onboarding", {
    method: "POST",
    body: JSON.stringify({ school_id: schoolId }),
  });
}

/** Alias kept for callers that use the ticket's original name. */
export const onboardingChoice = completeOnboarding;

/**
 * A user still needs onboarding when the backend profile has no resolved
 * `school_id`. `super_admin` manages tenants rather than belonging to a school,
 * so it is never forced through school onboarding.
 */
export function needsOnboarding(me: Pick<UserMe, "school_id" | "role"> | null): boolean {
  if (me === null) return false;
  if (me.role === "super_admin") return false;
  return me.school_id === null;
}

/** All role dashboards are a single placeholder route for v1. */
export function dashboardPath(): string {
  return "/dashboard";
}

/** Where to send a freshly authenticated user. */
export function routeAfterAuth(user: Pick<User, "school_id" | "role">): string {
  if (user.role === "super_admin") {
    return dashboardPath();
  }
  if (user.school_id === null) {
    return "/onboarding";
  }
  return dashboardPath();
}
