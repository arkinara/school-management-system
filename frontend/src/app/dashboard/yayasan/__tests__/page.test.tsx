import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { API } from "@/test/handlers";
import type { YayasanOverview } from "@/lib/endpoints";
import YayasanDashboardPage from "../page";

const { MOCK_ME } = vi.hoisted(() => ({
  MOCK_ME: {
    user: {
      id: 1,
      tenant_id: 1,
      school_id: null,
      email: "yayasan@menteng.sch.id",
      role: "super_admin",
      full_name: "Yayasan",
      created_at: "2026-01-01",
    },
    tenant_id: 1,
    school_id: null,
    role: "super_admin",
  },
}));

vi.mock("@/components/dashboard/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: (me: unknown) => unknown }) => children(MOCK_ME),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/yayasan",
}));

const overview: YayasanOverview = {
  tenants: [
    {
      id: 1,
      name: "SDN Menteng 01",
      jenjang_type: "SD",
      school_count: 2,
      enrollment: 120,
      users_by_role: {
        super_admin: 1,
        principal: 1,
        teacher: 5,
        student: 120,
        parent: 100,
        admin: 2,
      },
      attendance_rate: 95.5,
      spp_collection_rate: 80,
      schools: [
        { id: 1, name: "SDN Menteng 01", jenjang: "SD", enrollment: 60 },
        { id: 2, name: "SDN Menteng 02", jenjang: "SD", enrollment: 60 },
      ],
    },
  ],
  total_tenants: 1,
  total_schools: 2,
  total_enrollment: 120,
  total_users_by_role: {
    super_admin: 1,
    principal: 1,
    teacher: 5,
    student: 120,
    parent: 100,
    admin: 2,
  },
};

function overviewHandler(body: YayasanOverview) {
  return http.get(`${API}/api/yayasan/overview`, () => HttpResponse.json(body));
}

describe("YayasanDashboardPage", () => {
  beforeEach(() => {
    MOCK_ME.role = "super_admin";
    MOCK_ME.user.role = "super_admin";
    server.use(overviewHandler(overview));
  });

  it("test_widget_on_yayasan_dashboard renders the AnnouncementWidget", async () => {
    render(<YayasanDashboardPage />);

    expect(await screen.findByText("Pengumuman")).toBeInTheDocument();
    expect(await screen.findByText("Libur Semester")).toBeInTheDocument();
  });

  it("test_yayasan_page_no_mocks renders backend data and never the removed mock rows", async () => {
    render(<YayasanDashboardPage />);

    expect(await screen.findAllByText("SDN Menteng 01")).not.toHaveLength(0);
    expect(screen.getByText("Total Tenant")).toBeInTheDocument();
    expect(screen.getByText("Total Sekolah")).toBeInTheDocument();
    expect(screen.getByText("Total Siswa")).toBeInTheDocument();
    expect(screen.getByText("Orang Tua")).toBeInTheDocument();

    expect(screen.queryByText("Yayasan Arkinara Nusantara")).not.toBeInTheDocument();
    expect(screen.queryByText("99,9%")).not.toBeInTheDocument();
  });

  it("test_yayasan_page_zero_tenants shows the empty state when there are no tenants", async () => {
    server.use(
      overviewHandler({
        tenants: [],
        total_tenants: 0,
        total_schools: 0,
        total_enrollment: 0,
        total_users_by_role: {},
      })
    );

    render(<YayasanDashboardPage />);

    expect(await screen.findByText("Belum ada tenant")).toBeInTheDocument();
    expect(screen.queryByText("Gagal memuat data yayasan.")).not.toBeInTheDocument();
  });

  it("test_yayasan_page_error_state shows an error UI with retry that refetches", async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(
      http.get(`${API}/api/yayasan/overview`, () => {
        calls += 1;
        return HttpResponse.json({ detail: "boom" }, { status: 500 });
      })
    );

    render(<YayasanDashboardPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Gagal memuat data yayasan.");
    expect(screen.queryByText("Total Tenant")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Coba lagi/i }));
    await waitFor(() => expect(calls).toBeGreaterThan(1));
  });
});
