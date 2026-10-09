import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { API, bills } from "@/test/handlers";
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
    vi.restoreAllMocks();
  });

  it("loads and renders bill rows (no infinite skeleton)", async () => {
    render(<SppPaymentsPage />);
    expect(await screen.findByText("Ahmad Fauzi")).toBeInTheDocument();
    expect(screen.getByText("Siti Aminah")).toBeInTheDocument();
    expect(screen.queryByText(/Skeleton/i)).not.toBeInTheDocument();
  });

  it("filters the list by student search", async () => {
    const user = userEvent.setup();
    render(<SppPaymentsPage />);
    await screen.findByText("Ahmad Fauzi");

    await user.type(screen.getByLabelText("Cari siswa"), "Siti");

    await waitFor(() => expect(screen.queryByText("Ahmad Fauzi")).not.toBeInTheDocument());
    expect(screen.getByText("Siti Aminah")).toBeInTheDocument();
  });

  it("records a payment and shows the server receipt number", async () => {
    const user = userEvent.setup();
    render(<SppPaymentsPage />);

    await screen.findByText("Ahmad Fauzi");
    await user.click(screen.getByRole("checkbox", { name: "Pilih tagihan Ahmad Fauzi" }));
    await user.click(screen.getByRole("button", { name: /Catat Pembayaran \(1\)/ }));
    await user.click(screen.getByRole("button", { name: "Simpan Pembayaran" }));

    expect(await screen.findByText("Payment recorded: receipt #42")).toBeInTheDocument();
  });

  it("surfaces a per-row error when recording a payment fails", async () => {
    server.use(
      http.post(`${API}/api/spp/bills/:billId/payments`, () =>
        HttpResponse.json({ detail: "Gagal mencatat pembayaran." }, { status: 500 })
      )
    );
    const user = userEvent.setup();
    render(<SppPaymentsPage />);

    await screen.findByText("Ahmad Fauzi");
    await user.click(screen.getByRole("checkbox", { name: "Pilih tagihan Ahmad Fauzi" }));
    await user.click(screen.getByRole("button", { name: /Catat Pembayaran \(1\)/ }));
    await user.click(screen.getByRole("button", { name: "Simpan Pembayaran" }));

    expect((await screen.findAllByText("Gagal mencatat pembayaran.")).length).toBeGreaterThan(0);
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

  it("shows paid_amount / balance for a partially paid bill", async () => {
    render(<SppPaymentsPage />);
    await screen.findByText("Siti Aminah");
    expect(screen.getByText("sebagian")).toBeInTheDocument();
    expect(screen.getByText(/100\.000 \/ Rp.?500\.000/)).toBeInTheDocument();
  });

  it("voids a payment via the real DELETE endpoint", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const payment = {
      id: 77,
      school_id: 1,
      bill_id: 1,
      paid_at: "2026-01-15T09:00:00Z",
      method: "cash",
      amount: 100_000,
      receipt_no: 7,
      recorded_by: 3,
      voided: false,
    };
    let deleted = false;
    server.use(
      http.get(`${API}/api/spp/payments`, () =>
        HttpResponse.json({ items: [payment], total: 1, page: 1, size: 100 })
      ),
      http.delete(`${API}/api/spp/payments/:paymentId`, ({ params }) => {
        deleted = Number(params.paymentId) === 77;
        return new HttpResponse(null, { status: 204 });
      })
    );
    const user = userEvent.setup();
    render(<SppPaymentsPage />);

    await user.click(await screen.findByRole("button", { name: "Void pembayaran Ahmad Fauzi" }));

    expect(await screen.findByText("Payment voided")).toBeInTheDocument();
    expect(deleted).toBe(true);
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

  it("shows a retry action when the bill fetch fails", async () => {
    server.use(
      http.get(`${API}/api/spp/bills`, () => HttpResponse.json({ detail: "boom" }, { status: 500 }))
    );
    render(<SppPaymentsPage />);

    expect(await screen.findByText("Gagal memuat data SPP")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Coba lagi/ })).toBeInTheDocument();
  });

  it("renders the server-assigned receipt number for a paid bill", async () => {
    const payment = {
      id: 5,
      school_id: 1,
      bill_id: 2,
      paid_at: "2026-01-15T09:00:00Z",
      method: "cash",
      amount: 100_000,
      receipt_no: 123,
      recorded_by: 3,
      voided: false,
    };
    server.use(
      http.get(`${API}/api/spp/payments`, () =>
        HttpResponse.json({ items: [payment], total: 1, page: 1, size: 100 })
      )
    );
    render(<SppPaymentsPage />);

    await screen.findByText("Siti Aminah");
    expect(screen.getByText("123")).toBeInTheDocument();
    // sanity: bills fixture is the default set
    expect(bills.length).toBe(2);
  });
});
