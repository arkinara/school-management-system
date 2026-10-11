import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { API } from "@/test/handlers";
import type { AnnouncementRecord } from "@/lib/endpoints";
import AnnouncementsPage from "../page";

const { MOCK_ME } = vi.hoisted(() => ({
  MOCK_ME: {
    user: {
      id: 3,
      tenant_id: 1,
      school_id: 1,
      email: "budi@menteng.sch.id",
      role: "admin",
      full_name: "Budi Santoso",
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
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/announcements",
}));

const draft: AnnouncementRecord = {
  id: 21,
  tenant_id: 1,
  school_id: 1,
  author_id: 2,
  audience: "all",
  title: "Draft Ujian Akhir",
  body: "Jadwal ujian akhir semester genap.",
  published_at: null,
  status: "draft",
  target_class_id: null,
  target_tenant_id: null,
};

describe("AnnouncementsPage", () => {
  beforeEach(() => {
    MOCK_ME.role = "admin";
    MOCK_ME.user.role = "admin";
  });

  it("test_announcement_uses_real_jenjang renders canonical TK/SD/SMP/SMA options", async () => {
    MOCK_ME.role = "super_admin";
    MOCK_ME.user.role = "super_admin";

    render(<AnnouncementsPage />);

    await screen.findByLabelText("Saring jenjang");
    expect(screen.getByRole("option", { name: "TK" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "SD" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "SMP" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "SMA" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Semua jenjang" })).toBeInTheDocument();
  });

  it("test_deny_does_not_recreate rejects via POST and never deletes", async () => {
    const user = userEvent.setup();
    const rejectCalls: string[] = [];
    let deleteCalls = 0;
    let createCalls = 0;

    server.use(
      http.get(`${API}/api/announcements`, () =>
        HttpResponse.json({ items: [draft], total: 1, page: 1, size: 1 })
      ),
      http.post(`${API}/api/announcements/:id/reject`, ({ params }) => {
        rejectCalls.push(String(params.id));
        return HttpResponse.json({ ...draft, status: "denied" });
      }),
      http.delete(`${API}/api/announcements/:id`, () => {
        deleteCalls += 1;
        return HttpResponse.json({}, { status: 204 });
      }),
      http.post(`${API}/api/announcements`, () => {
        createCalls += 1;
        return HttpResponse.json(draft, { status: 201 });
      })
    );

    render(<AnnouncementsPage />);
    await screen.findByText("Draft Ujian Akhir");

    await user.click(screen.getByRole("button", { name: "Tolak" }));

    await waitFor(() => expect(rejectCalls).toContain("21"));
    expect(deleteCalls).toBe(0);
    expect(createCalls).toBe(0);
  });
});
