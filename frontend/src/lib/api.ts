/**
 * Thin fetch wrapper for the FastAPI backend.
 *
 * The MVP uses the backend's own JWT auth (`/api/auth/*`) rather than the
 * Better Auth library, so the token is persisted client-side and attached as a
 * Bearer header on every request. The token is mirrored into a non-sensitive
 * cookie so `middleware.ts` can gate routes before React mounts.
 *
 * Ticket #40: the short-lived access token (15m) is paired with a long-lived
 * refresh token (7d). `apiFetch` transparently refreshes once on a 401 and
 * retries the request; it never loops.
 *
 * Ticket #45: if the retry still 401s, the session is expired — tokens are
 * cleared and the browser is sent to `/sign-in?next=<current path>` so the user
 * lands back where they were after signing in. Better Auth was removed (see
 * `docs/adr/001-better-auth-decision.md`); both tokens live in localStorage (a
 * known limitation).
 */

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const TOKEN_STORAGE_KEY = "sms_auth_token";
const REFRESH_TOKEN_STORAGE_KEY = "sms_refresh_token";
export const TOKEN_COOKIE_NAME = "sms_auth_token";
export const REFRESH_TOKEN_COOKIE_NAME = "sms_refresh_token";
const TOKEN_MAX_AGE_SECONDS = 60 * 15;
const REFRESH_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/**
 * Endpoints where a 401 means "wrong credentials", not "session expired".
 * A failed sign-in/register must surface to the form instead of bouncing the
 * user to `/sign-in` mid-submit.
 */
const AUTH_SUBMIT_PATHS = ["/api/auth/login", "/api/auth/register", "/api/auth/refresh"];

function isAuthSubmitPath(path: string): boolean {
  return AUTH_SUBMIT_PATHS.some((prefix) => path.startsWith(prefix));
}

/**
 * Build a same-origin `/sign-in?next=` URL. `next` is only honored when it is
 * an absolute path on this origin (rejects protocol-relative `//evil.com`).
 */
export function buildSignInUrl(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/sign-in";
  }
  return `/sign-in?next=${encodeURIComponent(next)}`;
}

/** Clear local auth and hard-navigate to sign-in (once). */
function redirectToSignIn(): void {
  if (typeof window === "undefined") return;
  if (window.location.pathname.startsWith("/sign-in")) return;
  const next = window.location.pathname + window.location.search;
  window.location.href = buildSignInUrl(next);
}

/** Thrown when the backend answers 401; callers usually reset to sign-in. */
export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Any other non-2xx backend response, with the parsed FastAPI `detail`. */
export class ApiError extends Error {
  status: number;
  detail: string;
  fieldErrors?: Record<string, string>;

  constructor(status: number, detail: string, fieldErrors?: Record<string, string>) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.fieldErrors = fieldErrors;
  }
}

function parseFieldErrors(detail: unknown): Record<string, string> | undefined {
  if (!Array.isArray(detail)) return undefined;
  const fields: Record<string, string> = {};
  for (const item of detail) {
    if (typeof item !== "object" || item === null) continue;
    const loc = (item as { loc?: unknown[] }).loc;
    const msg = (item as { msg?: unknown }).msg;
    if (!Array.isArray(loc) || loc.length === 0) continue;
    const key = String(loc[loc.length - 1]);
    if (typeof msg === "string") fields[key] = msg;
  }
  return Object.keys(fields).length > 0 ? fields : undefined;
}

function parseDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) =>
        typeof item === "object" && item !== null ? (item as { msg?: unknown }).msg : undefined
      )
      .filter((msg): msg is string => typeof msg === "string");
    if (messages.length > 0) return messages.join(", ");
  }
  return "Terjadi kesalahan pada server.";
}

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable (private mode); the cookie still carries it.
  }
}

function removeStorage(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof window === "undefined") return;
  try {
    document.cookie = `${name}=${value}; path=/; max-age=${maxAgeSeconds}; samesite=lax`;
  } catch {
    // Ignore cookie write failures.
  }
}

function clearCookie(name: string): void {
  if (typeof window === "undefined") return;
  try {
    document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
  } catch {
    // Ignore.
  }
}

export function getToken(): string | null {
  return readStorage(TOKEN_STORAGE_KEY);
}

export function setToken(token: string): void {
  writeStorage(TOKEN_STORAGE_KEY, token);
  writeCookie(TOKEN_COOKIE_NAME, token, TOKEN_MAX_AGE_SECONDS);
}

export function getRefreshToken(): string | null {
  return readStorage(REFRESH_TOKEN_STORAGE_KEY);
}

export function setRefreshToken(token: string): void {
  writeStorage(REFRESH_TOKEN_STORAGE_KEY, token);
  writeCookie(REFRESH_TOKEN_COOKIE_NAME, token, REFRESH_MAX_AGE_SECONDS);
}

export function hasRefreshToken(): boolean {
  return getRefreshToken() !== null;
}

export function clearToken(): void {
  removeStorage(TOKEN_STORAGE_KEY);
  removeStorage(REFRESH_TOKEN_STORAGE_KEY);
  clearCookie(TOKEN_COOKIE_NAME);
  clearCookie(REFRESH_TOKEN_COOKIE_NAME);
}

export interface RefreshedTokens {
  access_token: string;
  refresh_token: string | null;
}

/**
 * Exchange the stored refresh token for a fresh token pair.
 *
 * Uses a bare `fetch` (not `apiFetch`) so a failed refresh can never recurse.
 * On any failure the stored tokens are cleared and `UnauthorizedError` is
 * thrown, letting callers redirect to sign-in.
 */
export async function refreshTokens(): Promise<RefreshedTokens> {
  const current = getRefreshToken();
  if (!current) throw new UnauthorizedError("No refresh token");

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(current),
    });
  } catch {
    throw new ApiError(0, "Tidak dapat menghubungi server. Coba lagi.");
  }

  if (!res.ok) {
    clearToken();
    throw new UnauthorizedError();
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string | null;
  };
  setToken(data.access_token);
  const nextRefresh = data.refresh_token ?? null;
  if (nextRefresh) setRefreshToken(nextRefresh);
  return { access_token: data.access_token, refresh_token: nextRefresh };
}

/**
 * Fetch a backend path with JSON handling and auth.
 *
 * Prepends the API base URL, attaches the Bearer token when present, and on a
 * 401 with a stored refresh token refreshes once and retries exactly once.
 * A still-failing request clears the tokens, redirects to `/sign-in?next=...`
 * and throws `UnauthorizedError`. Login/register 401s are surfaced as errors
 * instead (they mean bad credentials, not an expired session).
 * `204 No Content` resolves to `undefined`.
 */
export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const doFetch = async (): Promise<Response> => {
    const headers = new Headers(opts.headers);
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (opts.body !== undefined && !(opts.body instanceof FormData)) {
      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
    }
    try {
      return await fetch(`${API_BASE_URL}${path}`, { ...opts, headers });
    } catch {
      throw new ApiError(0, "Tidak dapat menghubungi server. Coba lagi.");
    }
  };

  let res = await doFetch();

  const isAuthSubmit = isAuthSubmitPath(path);

  if (res.status === 401 && hasRefreshToken() && !isAuthSubmit) {
    try {
      // Refresh exactly once; a still-401 response falls through to the
      // shared session-expired handling below (never loops).
      await refreshTokens();
      res = await doFetch();
    } catch {
      // Refresh failed: clear + redirect via the shared 401 branch.
    }
  }

  if (res.status === 401) {
    clearToken();
    // Credential endpoints surface the 401 to their form; everything else
    // treats it as an expired session and bounces to sign-in exactly once.
    if (!isAuthSubmit) redirectToSignIn();
    throw new UnauthorizedError("session expired");
  }

  if (!res.ok) {
    let payload: unknown = undefined;
    try {
      payload = await res.json();
    } catch {
      payload = undefined;
    }
    const detail =
      typeof payload === "object" && payload !== null && "detail" in payload
        ? (payload as { detail: unknown }).detail
        : undefined;
    throw new ApiError(res.status, parseDetail(detail), parseFieldErrors(detail));
  }

  if (res.status === 204) return undefined as T;

  try {
    return (await res.json()) as T;
  } catch {
    return undefined as T;
  }
}
