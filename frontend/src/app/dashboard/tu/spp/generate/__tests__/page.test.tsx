import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { API } from "@/test/handlers";
import SppGeneratePage from "../page";

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

describe("SppGeneratePage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("generates for a whole school with school_id", async () => {
    let captured: Record<string, unknown> | null = null;
    server.use(
      http.post(`${API}/api/spp/bills/bulk-generate`, async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { created: 2, skipped: 0, no_students: 2, message: "ok" },
          { status: 201 }
        );
      })
    );
    const user = userEvent.setup();
    render(<SppGeneratePage />);

    await screen.findByRole("radio", { name: /Satu sekolah/ });
    await user.click(screen.getByRole("radio", { name: /Satu sekolah/ }));
    await user.click(screen.getByRole("button", { name: /Tinjau & Buat/ }));
    await user.click(await screen.findByRole("button", { name: "Konfirmasi" }));

    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured).toMatchObject({ school_id: 1 });
    expect(captured).not.toHaveProperty("class_id");
    expect(await screen.findByText(/2 tagihan berhasil dibuat/)).toBeInTheDocument();
  });

  it("shows an informational state when no students are in scope", async () => {
    server.use(
      http.post(`${API}/api/spp/bills/bulk-generate`, () =>
        HttpResponse.json(
          { created: 0, skipped: 0, no_students: 0, message: "none" },
          { status: 201 }
        )
      )
    );
    const user = userEvent.setup();
    render(<SppGeneratePage />);

    await screen.findByRole("radio", { name: /Satu kelas/ });
    await user.click(screen.getByRole("button", { name: /Tinjau & Buat/ }));
    await user.click(await screen.findByRole("button", { name: "Konfirmasi" }));

    expect(
      await screen.findByText(
        "Tidak ada siswa di scope ini. Pilih kelas atau sekolah yang memiliki siswa aktif."
      )
    ).toBeInTheDocument();
  });
});
