import { NextResponse, type NextRequest } from "next/server";
import { TOKEN_COOKIE_NAME } from "@/lib/api";

const AUTH_ROUTES = ["/sign-in", "/sign-up"];

interface TokenClaims {
  role?: string;
  school_id?: number | null;
}

/**
 * Decode a JWT payload without verifying the signature. The edge only needs
 * the `role`/`school_id` claims to make a cheap pre-render routing decision;
 * the backend still verifies every request it receives.
 */
function decodeClaims(token: string): TokenClaims | null {
  try {
    const segment = token.split(".")[1];
    if (!segment) return null;
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const parsed: unknown = JSON.parse(atob(padded));
    return typeof parsed === "object" && parsed !== null ? (parsed as TokenClaims) : null;
  } catch {
    return null;
  }
}

function signInUrl(request: NextRequest): URL {
  const url = new URL("/sign-in", request.url);
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return url;
}

/**
 * Route gating for the MVP.
 *
 * The access token is mirrored into a non-sensitive cookie by `lib/api.ts` so
 * the edge can make a cheap before-render decision: signed-in users skip the
 * auth screens, unknown visitors are bounced off protected routes, and a
 * signed-in user who has not finished onboarding (no `school_id`) is held on
 * `/onboarding` before reaching any `/dashboard/*` page.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(TOKEN_COOKIE_NAME)?.value;
  const hasToken = Boolean(token);

  const isAuthRoute = AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
  const isDashboard = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isOnboarding = pathname === "/onboarding" || pathname.startsWith("/onboarding/");
  const isProtected = isDashboard || isOnboarding;

  const claims = hasToken ? decodeClaims(token as string) : null;
  const needsOnboarding = Boolean(
    claims && claims.role !== "super_admin" && claims.school_id == null
  );

  if (isAuthRoute && hasToken) {
    return NextResponse.redirect(
      new URL(needsOnboarding ? "/onboarding" : "/dashboard", request.url)
    );
  }
  if (isProtected && !hasToken) {
    return NextResponse.redirect(signInUrl(request));
  }
  if (isDashboard && hasToken && needsOnboarding) {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }
  if (isOnboarding && hasToken && !needsOnboarding) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/sign-in", "/sign-up", "/dashboard/:path*", "/onboarding/:path*"],
};
