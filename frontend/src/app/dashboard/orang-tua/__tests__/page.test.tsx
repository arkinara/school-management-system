import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { API } from "@/test/handlers";
import OrangTuaDashboardPage from "../page";

const { MOCK_ME } = vi.hoisted(() => ({
  MOCK_ME: {
    user: {
      id: 20,
      tenant_id: 1,
      school_id: 1,
      email: "ortu@menteng.sch.id",
      role: "parent",
      full_name: "Ibu Sari",
      created_at: "2026-01-01",
    },
    tenant_id: 1,
    school_id: 1,
    role: "parent",
  },
}));

vi.mock("@/components/dashboard/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: (me: unknown) => unknown }) => children(MOCK_ME),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/orang-tua",
}));

describe("OrangTuaDashboardPage attendance", () => {
  it("test_orang_tua_attendance_independent shows attendance when grades are empty", async () => {
    server.use(
      http.get(`${API}/api/parents/:id/children`, () =>
        HttpResponse.json([
          {
            id: 1,
            user_id: 10,
            nis: "2026001",
            full_name: "Ahmad Fauzi",
            class_id: 1,
            enrollment_status: "active",
            relationship: "child",
            is_primary: true,
          },
        ])
      ),
      http.get(`${API}/api/grades/aggregate`, () =>
        HttpResponse.json({
          student_id: 1,
          semester: "2026/2027-ganjil",
          total: 0,
          per_subject: [],
          overall_average: null,
        })
      )
    );

    render(<OrangTuaDashboardPage />);

    const breakdown = await screen.findByLabelText("Rincian kehadiran bulan ini");
    expect(within(breakdown).getByText("Hadir")).toBeInTheDocument();
    expect(within(breakdown).getByText("8")).toBeInTheDocument();
    expect(within(breakdown).getByText("Alpa")).toBeInTheDocument();
    expect(within(breakdown).getByText("2")).toBeInTheDocument();
  });
});
