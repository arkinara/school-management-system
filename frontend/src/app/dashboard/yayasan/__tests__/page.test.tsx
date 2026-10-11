import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

describe("YayasanDashboardPage", () => {
  it("test_widget_on_yayasan_dashboard renders the AnnouncementWidget", async () => {
    render(<YayasanDashboardPage />);

    expect(await screen.findByText("Pengumuman")).toBeInTheDocument();
    expect(await screen.findByText("Libur Semester")).toBeInTheDocument();
  });
});
