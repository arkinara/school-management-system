import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import GuruDashboardPage from "../page";

const { MOCK_ME } = vi.hoisted(() => ({
  MOCK_ME: {
    user: {
      id: 2,
      tenant_id: 1,
      school_id: 1,
      email: "guru@menteng.sch.id",
      role: "teacher",
      full_name: "Guru Kelas",
      created_at: "2026-01-01",
    },
    tenant_id: 1,
    school_id: 1,
    role: "teacher",
  },
}));

vi.mock("@/components/dashboard/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: (me: unknown) => unknown }) => children(MOCK_ME),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/guru",
}));

describe("GuruDashboardPage", () => {
  it("test_widget_on_guru_dashboard renders the AnnouncementWidget", async () => {
    render(<GuruDashboardPage />);

    expect(await screen.findByText("Pengumuman")).toBeInTheDocument();
    expect(await screen.findByText("Libur Semester")).toBeInTheDocument();
  });
});
