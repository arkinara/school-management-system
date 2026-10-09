import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { API } from "@/test/handlers";
import SppSingleBillPage from "../page";

const { MOCK_ME } = vi.hoisted(() => ({
  MOCK_ME: {
    user: {
      id: 3,
      tenant_id: 1,
      school_id: 1,
      email: "tu@menteng.sch.id",
      role: "admin",
      full_name: "Tata Usaha",
      created_at: "2026-01-01",
    },
    tenant_id: 1,
    school_id: 1,
    role: "admin",
  },
}));

vi.mock("@/components/dashboard/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: (me: unknown) => unknown }) => children(MOCK_ME),
}));

describe("SppSingleBillPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows an inline error when the bill already exists (409)", async () => {
    server.use(
      http.post(`${API}/api/spp/bills`, () =>
        HttpResponse.json({ detail: "bill already exists for this period" }, { status: 409 })
      )
    );
    const user = userEvent.setup();
    render(<SppSingleBillPage />);

    await user.selectOptions(await screen.findByLabelText(/Siswa/), "1");
    await user.click(screen.getByRole("button", { name: /Buat Tagihan/ }));

    expect(await screen.findByText(/Siswa sudah punya tagihan untuk/)).toBeInTheDocument();
  });

  it("creates a bill and shows a success toast", async () => {
    const user = userEvent.setup();
    render(<SppSingleBillPage />);

    await user.selectOptions(await screen.findByLabelText(/Siswa/), "1");
    await user.click(screen.getByRole("button", { name: /Buat Tagihan/ }));

    expect(await screen.findByText(/Bill \d{4}-\d{2} created/)).toBeInTheDocument();
  });
});
