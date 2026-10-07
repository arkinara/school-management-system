import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { API } from "@/test/handlers";
import { setToken } from "@/lib/api";
import OnboardingPage from "../page";

const { replace, push, router } = vi.hoisted(() => {
  const replace = vi.fn();
  const push = vi.fn();
  return {
    replace,
    push,
    router: {
      replace,
      push,
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/onboarding",
}));

describe("OnboardingPage", () => {
  beforeEach(() => {
    replace.mockClear();
    push.mockClear();
    window.localStorage.clear();
    setToken("mock-access-token");

    // A freshly registered user with no school yet.
    server.use(
      http.get(`${API}/api/auth/me`, () =>
        HttpResponse.json({
          user: {
            id: 4,
            tenant_id: 1,
            school_id: null,
            email: "guru@menteng.sch.id",
            role: "teacher",
            full_name: "Guru Kelas",
            created_at: "2026-01-01",
          },
          tenant_id: 1,
          school_id: null,
          role: "teacher",
        })
      )
    );
  });

  it("lets the user pick a school and redirects to the dashboard", async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);

    const option = await screen.findByRole("radio", { name: /SDN Menteng 01/ });
    await user.click(option);
    await user.click(screen.getByRole("button", { name: "Lanjutkan" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
  });

  it("shows no options when the tenant has no schools", async () => {
    server.use(http.get(`${API}/api/public/schools`, () => HttpResponse.json([])));

    render(<OnboardingPage />);

    expect(await screen.findByText("Belum ada pilihan tersedia")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
