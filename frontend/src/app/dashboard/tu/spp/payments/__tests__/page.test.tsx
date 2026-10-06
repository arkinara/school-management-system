import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { API } from "@/test/handlers";
import SppPaymentsPage from "../page";

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

describe("SppPaymentsPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("records a payment for the selected bill", async () => {
    const user = userEvent.setup();
    render(<SppPaymentsPage />);

    await screen.findByText("Ahmad Fauzi");

    await user.click(screen.getByRole("checkbox", { name: "Pilih tagihan Ahmad Fauzi" }));
    await user.click(screen.getByRole("button", { name: /Catat Pembayaran \(1\)/ }));
    await user.click(screen.getByRole("button", { name: "Simpan Pembayaran" }));

    expect(await screen.findByText("1 pembayaran tercatat")).toBeInTheDocument();
  });

  it("surfaces an API error when recording a payment fails", async () => {
    server.use(
      http.post(`${API}/api/spp/payments`, () =>
        HttpResponse.json({ detail: "Gagal mencatat pembayaran." }, { status: 500 })
      )
    );
    const user = userEvent.setup();
    render(<SppPaymentsPage />);

    await screen.findByText("Ahmad Fauzi");
    await user.click(screen.getByRole("checkbox", { name: "Pilih tagihan Ahmad Fauzi" }));
    await user.click(screen.getByRole("button", { name: /Catat Pembayaran \(1\)/ }));
    await user.click(screen.getByRole("button", { name: "Simpan Pembayaran" }));

    expect(await screen.findByText("Gagal mencatat pembayaran.")).toBeInTheDocument();
  });

  it("rejects a payment larger than the outstanding balance", async () => {
    const user = userEvent.setup();
    render(<SppPaymentsPage />);

    await screen.findByText("Ahmad Fauzi");
    await user.click(screen.getByRole("checkbox", { name: "Pilih tagihan Ahmad Fauzi" }));
    await user.click(screen.getByRole("button", { name: /Catat Pembayaran \(1\)/ }));

    const amount = screen.getByLabelText("Nominal");
    await user.clear(amount);
    await user.type(amount, "9999999");
    await user.click(screen.getByRole("button", { name: "Simpan Pembayaran" }));

    expect(await screen.findByText(/Melebihi sisa tagihan/)).toBeInTheDocument();
  });

  it("shows an empty state when there are no outstanding bills", async () => {
    server.use(
      http.get(`${API}/api/spp/bills`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, size: 100 })
      )
    );
    render(<SppPaymentsPage />);

    expect(await screen.findByText("Tidak ada tagihan belum lunas")).toBeInTheDocument();
  });
});
