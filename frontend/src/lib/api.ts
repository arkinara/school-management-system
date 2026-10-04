/**
 * Thin fetch wrapper for the FastAPI backend.
 *
 * The MVP uses the backend's own JWT auth (`/api/auth/*`) rather than the
 * Better Auth library, so the token is persisted client-side and attached as a
 * Bearer header on every request. The token is mirrored into a non-sensitive
 * cookie so `middleware.ts` can gate routes before React mounts.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const TOKEN_STORAGE_KEY = "sms_auth_token";
export const TOKEN_COOKIE_NAME = "sms_auth_token";
const TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

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

  constructor(
    status: number,
    detail: string,
    fieldErrors?: Record<string, string>
  ) {
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
        typeof item === "object" && item !== null
          ? (item as { msg?: unknown }).msg
          : undefined
      )
      .filter((msg): msg is string => typeof msg === "string");
    if (messages.length > 0) return messages.join(", ");
  }
  return "Terjadi kesalahan pada server.";
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // Storage may be unavailable (private mode); the cookie still carries it.
  }
  try {
    document.cookie = `${TOKEN_COOKIE_NAME}=${token}; path=/; max-age=${TOKEN_MAX_AGE_SECONDS}; samesite=lax`;
  } catch {
    // Ignore cookie write failures.
  }
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Ignore.
  }
  try {
    document.cookie = `${TOKEN_COOKIE_NAME}=; path=/; max-age=0; samesite=lax`;
  } catch {
    // Ignore.
  }
}

/**
 * Fetch a backend path with JSON handling and auth.
 *
 * Prepends the API base URL, attaches the Bearer token when present, clears the
 * token and throws `UnauthorizedError` on 401, and throws `ApiError` on any
 * other non-2xx response. `204 No Content` resolves to `undefined`.
 */
export async function apiFetch<T>(
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  const headers = new Headers(opts.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (opts.body !== undefined && !(opts.body instanceof FormData)) {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...opts, headers });
  } catch {
    throw new ApiError(0, "Tidak dapat menghubungi server. Coba lagi.");
  }

  if (res.status === 401) {
    clearToken();
    throw new UnauthorizedError();
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
    throw new ApiError(
      res.status,
      parseDetail(detail),
      parseFieldErrors(detail)
    );
  }

  if (res.status === 204) return undefined as T;

  try {
    return (await res.json()) as T;
  } catch {
    return undefined as T;
  }
}
