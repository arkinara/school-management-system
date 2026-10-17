import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { API } from "@/test/handlers";
import SiswaDashboardPage from "../page";

const { MOCK_ME } = vi.hoisted(() => ({
  MOCK_ME: {
    user: {
      id: 99,
      tenant_id: 1,
      school_id: 1,
      email: "siti@menteng.sch.id",
      role: "student",
      full_name: "Siti Aminah",
      created_at: "2026-01-01",
    },
    tenant_id: 1,
    school_id: 1,
    role: "student",
    student_id: 2,
  },
}));

vi.mock("@/components/dashboard/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: (me: unknown) => unknown }) => children(MOCK_ME),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/siswa",
}));

describe("SiswaDashboardPage", () => {
  it("test_siswa_uses_auth_me resolves the student via me.student_id and the grades API", async () => {
    let detailCalls = 0;
    let listCalls = 0;
    server.use(
      http.get(`${API}/api/students/2`, () => {
        detailCalls += 1;
        return HttpResponse.json({
          id: 2,
          user_id: 99,
          school_id: 1,
          class_id: 1,
          nis: "2026002",
          full_name: "Siti Aminah",
          email: null,
          birth_date: null,
          enrollment_status: "active",
        });
      }),
      http.get(`${API}/api/students`, () => {
        listCalls += 1;
        return HttpResponse.json({ items: [], total: 0, page: 1, size: 100 });
      }),
      http.get(`${API}/api/grades/aggregate`, () =>
        HttpResponse.json({
          class_id: 1,
          semester: "2026/2027-ganjil",
          subjects: [
            {
              subject_id: 1,
              subject_name: "Matematika",
              students: [
                { student_id: 2, student_name: "Siti Aminah", categories: {}, total_avg: 88 },
              ],
            },
          ],
        })
      )
    );

    render(<SiswaDashboardPage />);

    expect(await screen.findByText("Matematika")).toBeInTheDocument();
    expect(screen.getAllByText("88").length).toBeGreaterThan(0);
    expect(detailCalls).toBe(1);
    expect(listCalls).toBe(0);
  });
});
