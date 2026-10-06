import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { API } from "@/test/handlers";
import AbsensiPage from "../page";

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

describe("AbsensiPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("saves the class roster and shows a success toast", async () => {
    const user = userEvent.setup();
    render(<AbsensiPage />);

    expect(await screen.findByText("Ahmad Fauzi")).toBeInTheDocument();
    expect(await screen.findByText("Siti Aminah")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Simpan Absensi" }));

    expect(await screen.findByText("Absensi 2 siswa disimpan")).toBeInTheDocument();
  });

  it("surfaces an API error when the bulk save fails", async () => {
    server.use(
      http.post(`${API}/api/attendances/bulk`, () =>
        HttpResponse.json({ detail: "Gagal menyimpan absensi." }, { status: 500 })
      )
    );
    const user = userEvent.setup();
    render(<AbsensiPage />);

    await screen.findByText("Ahmad Fauzi");
    await user.click(screen.getByRole("button", { name: "Simpan Absensi" }));

    expect(await screen.findByText("Gagal menyimpan absensi.")).toBeInTheDocument();
  });

  it("explains a 409 conflict when part of the roster was already recorded", async () => {
    server.use(
      http.post(`${API}/api/attendances/bulk`, () =>
        HttpResponse.json({ detail: "conflict" }, { status: 409 })
      )
    );
    const user = userEvent.setup();
    render(<AbsensiPage />);

    await screen.findByText("Ahmad Fauzi");
    await user.click(screen.getByRole("button", { name: "Simpan Absensi" }));

    expect(
      await screen.findByText(
        "Sebagian absensi sudah tercatat. Muat ulang kelas lalu ulangi koreksi."
      )
    ).toBeInTheDocument();
  });

  it("shows an empty state when the class has no students", async () => {
    server.use(
      http.get(`${API}/api/students`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, size: 100 })
      )
    );
    render(<AbsensiPage />);

    await screen.findByText("Tidak ada siswa di kelas ini");
    expect(screen.getByText("Tidak ada siswa di kelas ini")).toBeInTheDocument();
  });
});
