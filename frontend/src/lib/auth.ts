/**
 * Auth client for the MVP.
 *
 * Direct-fetch wrapper over the backend `/api/auth/*` endpoints built in
 * ticket #3 — no Better Auth client yet (deferred). Tokens are persisted in
 * localStorage (see `lib/api.ts`) and replayed as a Bearer header.
 *
 * This module is intentionally pure TypeScript (no JSX) so it can be imported
 * from client components and, where safe, server code.
 */

import {
  apiFetch,
  clearToken,
  getToken,
  setToken,
  UnauthorizedError,
} from "./api";

export { getToken, setToken, clearToken };

export type UserRole =
  | "principal"
  | "teacher"
  | "student"
  | "parent"
  | "admin"
  | "super_admin";

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

export interface SchoolOption {
  id: number;
  name: string;
  tenantId: number;
  jenjang: string;
}

export interface TenantOption {
  id: number;
  name: string;
  jenjang: string;
}

/**
 * Seeded schools for sign-up and the super_admin onboarding picker.
 * Ticket #5 will replace these with a real `/api/schools` endpoint.
 */
export const SEED_SCHOOLS: SchoolOption[] = [
  { id: 1, name: "SDN Menteng 01", tenantId: 1, jenjang: "SD" },
];

export const SEED_TENANTS: TenantOption[] = [
  { id: 1, name: "TK Menteng Ceria", jenjang: "SD" },
];

const ONBOARDED_SCHOOL_KEY = "sms_onboarded_school_id";

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
export async function login({
  email,
  password,
  tenantId,
}: LoginInput): Promise<AuthResponse> {
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

/** POST /api/auth/logout — records the audit event, then clears the token. */
export async function logout(): Promise<void> {
  try {
    await apiFetch<void>("/api/auth/logout", { method: "POST" });
  } catch (err) {
    if (!(err instanceof UnauthorizedError)) {
      // Network hiccups must not trap the user in a signed-in UI.
    }
  } finally {
    clearToken();
    clearOnboardedSchoolId();
  }
}

/** GET /api/auth/me — returns the profile, or null when the token is invalid. */
export async function getMe(): Promise<UserMe | null> {
  try {
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

/** Persist the token returned by login/register. */
export function persistAuth(res: AuthResponse): void {
  setToken(res.access_token);
}

/** The school/tenant chosen during onboarding, persisted for this device. */
export function getOnboardedSchoolId(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ONBOARDED_SCHOOL_KEY);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function setOnboardedSchoolId(schoolId: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ONBOARDED_SCHOOL_KEY, String(schoolId));
  } catch {
    // Ignore storage failures.
  }
}

export function clearOnboardedSchoolId(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ONBOARDED_SCHOOL_KEY);
  } catch {
    // Ignore.
  }
}

/**
 * A user still needs onboarding when the backend profile has no resolved
 * school_id and this device has not yet recorded a pick. The local flag keeps
 * the v1 flow from bouncing until a follow-up PATCH `/auth/me/school` lands.
 */
export function needsOnboarding(
  me: Pick<UserMe, "school_id"> | null
): boolean {
  if (me === null) return false;
  if (me.school_id !== null) return false;
  return getOnboardedSchoolId() === null;
}

/** All role dashboards are a single placeholder route for v1. */
export function dashboardPath(): string {
  return "/dashboard";
}

/** Where to send a freshly authenticated user. */
export function routeAfterAuth(user: Pick<User, "school_id">): string {
  if (user.school_id === null && getOnboardedSchoolId() === null) {
    return "/onboarding";
  }
  return dashboardPath();
}
