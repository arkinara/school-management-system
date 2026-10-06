import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { API } from "@/test/handlers";
import GradesPage from "../page";

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

describe("GradesPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("saves entered scores and shows a success toast", async () => {
    const user = userEvent.setup();
    render(<GradesPage />);

    expect(await screen.findByText("Ahmad Fauzi")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Formatif Ahmad Fauzi"), "85");
    await user.click(screen.getByRole("button", { name: "Simpan Nilai" }));

    expect(await screen.findByText("1 nilai tersimpan")).toBeInTheDocument();
  });

  it("surfaces an API error when the grade save fails", async () => {
    server.use(
      http.post(`${API}/api/grades/bulk`, () =>
        HttpResponse.json({ detail: "Gagal menyimpan nilai." }, { status: 500 })
      )
    );
    const user = userEvent.setup();
    render(<GradesPage />);

    await screen.findByText("Ahmad Fauzi");
    await user.type(screen.getByLabelText("Formatif Ahmad Fauzi"), "90");
    await user.click(screen.getByRole("button", { name: "Simpan Nilai" }));

    expect(await screen.findByText("Gagal menyimpan nilai.")).toBeInTheDocument();
  });

  it("flags an out-of-range score before saving", async () => {
    const user = userEvent.setup();
    render(<GradesPage />);

    await screen.findByText("Ahmad Fauzi");
    await user.type(screen.getByLabelText("Formatif Ahmad Fauzi"), "150");
    await user.click(screen.getByRole("button", { name: "Simpan Nilai" }));

    expect(await screen.findByText("Nilai harus 0–100.")).toBeInTheDocument();
    expect(screen.getByText("Perbaiki nilai yang tidak valid.")).toBeInTheDocument();
  });
});
