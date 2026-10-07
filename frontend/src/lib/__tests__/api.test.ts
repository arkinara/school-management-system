import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { API } from "@/test/handlers";
import {
  apiFetch,
  buildSignInUrl,
  getToken,
  setRefreshToken,
  setToken,
  UnauthorizedError,
} from "../api";

describe("apiFetch", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes through with a valid token", async () => {
    setToken("good-token");

    const res = await apiFetch<{ user: { email: string } }>("/api/auth/me");

    expect(res.user.email).toBe("budi@menteng.sch.id");
  });

  it("refreshes once and retries after a 401", async () => {
    setToken("expired-token");
    setRefreshToken("refresh-good");
    let meCalls = 0;

    server.use(
      http.get(`${API}/api/auth/me`, () => {
        meCalls += 1;
        if (meCalls === 1) {
          return HttpResponse.json({ detail: "token expired" }, { status: 401 });
        }
        return HttpResponse.json({ user: { email: "budi@menteng.sch.id" } });
      }),
      http.post(`${API}/api/auth/refresh`, () =>
        HttpResponse.json({ access_token: "fresh-token", refresh_token: "refresh-good" })
      )
    );

    const res = await apiFetch<{ user: { email: string } }>("/api/auth/me");

    expect(res.user.email).toBe("budi@menteng.sch.id");
    expect(meCalls).toBe(2);
    expect(getToken()).toBe("fresh-token");
  });

  it("clears tokens and redirects to sign-in?next when refresh also 401s", async () => {
    setToken("expired-token");
    setRefreshToken("refresh-bad");
    const location = { pathname: "/dashboard/guru", search: "?tab=1", href: "" };
    vi.stubGlobal("location", location);

    server.use(
      http.get(`${API}/api/auth/me`, () =>
        HttpResponse.json({ detail: "token expired" }, { status: 401 })
      ),
      http.post(`${API}/api/auth/refresh`, () =>
        HttpResponse.json({ detail: "invalid refresh token" }, { status: 401 })
      )
    );

    await expect(apiFetch("/api/auth/me")).rejects.toBeInstanceOf(UnauthorizedError);
    expect(getToken()).toBeNull();
    expect(location.href).toBe(`/sign-in?next=${encodeURIComponent("/dashboard/guru?tab=1")}`);
  });

  it("does not redirect on a failed login (bad credentials)", async () => {
    const location = { pathname: "/sign-in", search: "", href: "" };
    vi.stubGlobal("location", location);

    server.use(
      http.post(`${API}/api/auth/login`, () =>
        HttpResponse.json({ detail: "invalid" }, { status: 401 })
      )
    );

    await expect(
      apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({}) })
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(location.href).toBe("");
  });
});

describe("buildSignInUrl", () => {
  it("only honors same-origin paths for next", () => {
    expect(buildSignInUrl("/dashboard/guru")).toBe(
      `/sign-in?next=${encodeURIComponent("/dashboard/guru")}`
    );
    expect(buildSignInUrl("//evil.com")).toBe("/sign-in");
    expect(buildSignInUrl("https://evil.com")).toBe("/sign-in");
    expect(buildSignInUrl(null)).toBe("/sign-in");
  });
});
