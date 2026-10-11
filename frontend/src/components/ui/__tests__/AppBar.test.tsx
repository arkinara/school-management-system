import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { API } from "@/test/handlers";
import { AppBar } from "../AppBar";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/dashboard",
}));

function renderAppBar() {
  return render(<AppBar title="Sistem Sekolah" user={{ name: "Budi Santoso" }} />);
}

describe("AppBar notification bell", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("test_unread_badge_count shows the backend unread count", async () => {
    renderAppBar();

    const bell = await screen.findByRole("button", { name: /2 notifikasi belum dibaca/i });
    expect(bell).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
  });

  it("test_bell_dropdown_shows_latest_5 opens a preview of five items + Lihat semua", async () => {
    const user = userEvent.setup();
    renderAppBar();

    const bell = await screen.findByRole("button", { name: /notifikasi/i });
    await user.click(bell);

    const menu = await screen.findByRole("menu", { name: "Pratinjau notifikasi" });
    expect(menu).toBeInTheDocument();
    expect(screen.getByText("Kehadiran Ahmad")).toBeInTheDocument();
    expect(screen.getByText("SPP Ahmad Jatuh Tempo")).toBeInTheDocument();
    expect(screen.getByText("Libur Semester")).toBeInTheDocument();
    expect(screen.getByText("Perkembangan Ahmad")).toBeInTheDocument();
    expect(screen.getByText("Kehadiran Siti")).toBeInTheDocument();
    expect(screen.queryByText("SPP Siti Jatuh Tempo")).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Lihat semua/i })).toBeInTheDocument();
  });

  it("test_mark_read_uses_be POSTs to the backend and never writes localStorage", async () => {
    const user = userEvent.setup();
    const readCalls: string[] = [];
    server.use(
      http.post(`${API}/api/notifications/:id/read`, ({ params }) => {
        readCalls.push(String(params.id));
        return new HttpResponse(null, { status: 204 });
      })
    );

    renderAppBar();
    const bell = await screen.findByRole("button", { name: /notifikasi/i });
    await user.click(bell);
    await user.click(await screen.findByRole("menuitem", { name: /Kehadiran Ahmad/i }));

    await waitFor(() => expect(readCalls).toContain("1"));
    expect(window.localStorage.length).toBe(0);
  });
});
