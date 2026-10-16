import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { API, bills } from "@/test/handlers";
import { currentPeriod } from "@/lib/dates";
import type { ClassRecord, SppBill } from "@/lib/endpoints";
import TuDashboardPage from "../page";

const { MOCK_ME } = vi.hoisted(() => ({
  MOCK_ME: {
    user: {
      id: 1,
      tenant_id: 1,
      school_id: 1,
      email: "tu@menteng.sch.id",
      role: "admin",
      full_name: "Tuti Usaha",
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/dashboard/tu",
}));

function paginated<T>(items: T[]) {
  return { items, total: items.length, page: 1, size: items.length };
}

const CLASSES: ClassRecord[] = [
  {
    id: 1,
    school_id: 1,
    name: "Kelas 5A",
    grade_level: 5,
    jurusan: null,
    wali_kelas_id: 2,
    academic_year: "2025/2026",
  },
  {
    id: 2,
    school_id: 1,
    name: "Kelas 5B",
    grade_level: 5,
    jurusan: null,
    wali_kelas_id: null,
    academic_year: "2025/2026",
  },
];

function billFor(overrides: Partial<SppBill>): SppBill {
  return {
    id: 1,
    student_id: 1,
    class_id: 1,
    period: currentPeriod(),
    amount: 500_000,
    due_date: "2026-01-10",
    status: "unpaid",
    created_by: 3,
    paid_amount: 0,
    balance: 500_000,
    ...overrides,
  };
}

/** Overdue + announcements emptied so only the requested group is populated. */
function silenceSideWidgets() {
  server.use(
    http.get(`${API}/api/spp/bills/overdue`, () => HttpResponse.json(paginated<SppBill>([]))),
    http.get(`${API}/api/announcements`, () => HttpResponse.json(paginated([])))
  );
}

describe("TuDashboardPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("test_overview_error_state_with_retry: shows a retry action, never a permanent skeleton", async () => {
    server.use(
      http.get(`${API}/api/students`, () => HttpResponse.json({ detail: "boom" }, { status: 500 }))
    );

    render(<TuDashboardPage />);

    expect(await screen.findByText("Gagal memuat indikator")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Coba lagi" }).length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText("Gagal memuat tunggakan")).toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelectorAll("[aria-busy]").length).toBe(0);
    });
  });

  it("test_no_inverted_error_handler: success path renders data, not an error", async () => {
    render(<TuDashboardPage />);

    expect(await screen.findByText("Tagihan Aktif")).toBeInTheDocument();
    expect(screen.queryByText("Gagal memuat indikator")).not.toBeInTheDocument();
    expect(screen.queryByText(/Gagal memuat/)).not.toBeInTheDocument();
  });

  it("test_pending_bills_from_be: pending generation derived from classes without current-period bills", async () => {
    server.use(
      http.get(`${API}/api/classes`, () => HttpResponse.json(paginated(CLASSES))),
      // Only class 1 has a bill for the current period → class 2 is pending.
      http.get(`${API}/api/spp/bills`, () =>
        HttpResponse.json(paginated([billFor({ class_id: 1 })]))
      )
    );

    render(<TuDashboardPage />);

    expect(await screen.findByText("Generate SPP Kelas 5B")).toBeInTheDocument();
    expect(screen.queryByText("Generate SPP Kelas 5A")).not.toBeInTheDocument();
  });

  it("test_mark_reminded_calls_be: clicking Ingatkan issues POST /api/spp/bills/{id}/remind", async () => {
    const calls: number[] = [];
    server.use(
      http.post(`${API}/api/spp/bills/:billId/remind`, ({ params }) => {
        calls.push(Number(params.billId));
        return HttpResponse.json({ notified: 1 });
      })
    );

    render(<TuDashboardPage />);

    const buttons = await screen.findAllByRole("button", { name: /Ingatkan/ });
    await userEvent.click(buttons[0]);

    await waitFor(() => expect(calls.length).toBe(1));
    expect(bills.map((b) => b.id)).toContain(calls[0]);
    expect(await screen.findByText(/Pengingat terkirim untuk/)).toBeInTheDocument();
  });

  it("test_empty_group_shows_message: a populated queue still labels empty groups", async () => {
    silenceSideWidgets();

    render(<TuDashboardPage />);

    expect(await screen.findByText("Generate SPP Kelas 5A")).toBeInTheDocument();
    const empties = await screen.findAllByText("Tidak ada tugas");
    expect(empties.length).toBeGreaterThanOrEqual(2);
  });

  it("test_all_done_message: all work done shows Semua sudah beres", async () => {
    silenceSideWidgets();
    server.use(
      http.get(`${API}/api/classes`, () => HttpResponse.json(paginated([CLASSES[0]]))),
      http.get(`${API}/api/spp/bills`, () =>
        HttpResponse.json(paginated([billFor({ class_id: 1, period: currentPeriod() })]))
      )
    );

    render(<TuDashboardPage />);

    expect(await screen.findByText("Semua sudah beres")).toBeInTheDocument();
    expect(screen.queryByText("Tidak ada tugas")).not.toBeInTheDocument();
  });

  it("test_task_links_real: task links point at real routes, not hardcoded ids", async () => {
    render(<TuDashboardPage />);

    await screen.findByText("Tinjau pengumuman: Libur Semester");
    const links = await screen.findAllByRole("link", { name: "Kerjakan" });
    const hrefs = links.map((link) => link.getAttribute("href") ?? "");

    expect(hrefs).toContain(`/dashboard/tu/spp/generate?class_id=1&period=${currentPeriod()}`);
    expect(hrefs).toContain("/dashboard/tu/spp/payments?status=overdue");
    expect(hrefs).toContain("/dashboard/announcements?review=12");
    for (const href of hrefs) {
      expect(href).not.toMatch(/\/tu\/tasks\//);
      expect(href).not.toMatch(/\b(86|648|34)\b/);
    }
  });

  it("test_kpi_sparkline_from_be: sparkline series come from the bills API response", async () => {
    server.use(
      http.get(`${API}/api/spp/bills`, () =>
        HttpResponse.json(
          paginated([
            billFor({ id: 1, period: "2025-12", paid_amount: 250_000, balance: 250_000 }),
            billFor({ id: 2, period: currentPeriod(), paid_amount: 400_000, balance: 100_000 }),
          ])
        )
      )
    );

    render(<TuDashboardPage />);

    const sparkline = await screen.findByRole("img", { name: "Tren SPP tertagih per periode" });
    expect(sparkline).toBeInTheDocument();
    expect(sparkline.getAttribute("viewBox")).toBe("0 0 220 40");
    // 250k + 400k = 650k total collected, derived from the API rows.
    expect(await screen.findByText(/650/)).toBeInTheDocument();
  });
});
