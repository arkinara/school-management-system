import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { API } from "@/test/handlers";
import PrincipalDashboardPage from "../page";

const { MOCK_ME } = vi.hoisted(() => ({
  MOCK_ME: {
    user: {
      id: 3,
      tenant_id: 1,
      school_id: 1,
      email: "budi@menteng.sch.id",
      role: "principal",
      full_name: "Budi Santoso",
      created_at: "2026-01-01",
    },
    tenant_id: 1,
    school_id: 1,
    role: "principal",
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
  usePathname: () => "/dashboard/principal",
}));

describe("PrincipalDashboardPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows loading placeholders before the widgets resolve", () => {
    render(<PrincipalDashboardPage />);

    expect(document.querySelector("[aria-busy]")).not.toBeNull();
    expect(screen.queryByText("Total Siswa")).not.toBeInTheDocument();
  });

  it("renders the KPI widgets and announcements once loaded", async () => {
    render(<PrincipalDashboardPage />);

    expect(await screen.findByText("Total Siswa")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("8/10 siswa hadir")).toBeInTheDocument();
    expect(screen.getByText("Rp 3jt")).toBeInTheDocument();
    expect(await screen.findByText("Libur Semester")).toBeInTheDocument();
  });

  it("renders empty states when no attendance or announcements exist", async () => {
    server.use(
      http.get(`${API}/api/attendances/today`, () =>
        HttpResponse.json({ date: "2026-01-15", total: 0, counts: {}, items: [] })
      ),
      http.get(`${API}/api/announcements`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, size: 0 })
      )
    );

    render(<PrincipalDashboardPage />);

    expect(await screen.findByText("Belum ada data kehadiran")).toBeInTheDocument();
    expect(await screen.findByText("Belum ada pengumuman")).toBeInTheDocument();
  });

  it("renders error states when widgets fail", async () => {
    server.use(
      http.get(`${API}/api/attendances/today`, () =>
        HttpResponse.json({ detail: "boom" }, { status: 500 })
      ),
      http.get(`${API}/api/announcements`, () =>
        HttpResponse.json({ detail: "boom" }, { status: 500 })
      )
    );

    render(<PrincipalDashboardPage />);

    expect(await screen.findByText("Gagal memuat kehadiran")).toBeInTheDocument();
    expect(await screen.findByText("Gagal memuat pengumuman")).toBeInTheDocument();
  });
});
