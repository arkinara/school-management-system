import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { API } from "@/test/handlers";
import OrangTuaJadwalPage from "../page";
import type { ChildSummary, ScheduleRecord } from "@/lib/endpoints";

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

function child(overrides: Partial<ChildSummary> = {}): ChildSummary {
  return {
    id: 1,
    user_id: 10,
    nis: "2026001",
    full_name: "Ahmad Fauzi",
    class_id: 1,
    enrollment_status: "active",
    relationship: "ayah",
    is_primary: true,
    ...overrides,
  };
}

const schedule: ScheduleRecord = {
  id: 1,
  class_id: 1,
  subject_id: 1,
  teacher_id: 2,
  day_of_week: 1,
  period_number: 1,
  start_time: "07:00:00",
  end_time: "07:40:00",
};

function stubChildren(children: ChildSummary[]) {
  server.use(http.get(`${API}/api/parents/20/children`, () => HttpResponse.json(children)));
}

describe("OrangTuaJadwalPage (#58)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("loads the selected child's class schedule", async () => {
    stubChildren([child()]);
    server.use(http.get(`${API}/api/schedules/by-class/1`, () => HttpResponse.json([schedule])));

    render(<OrangTuaJadwalPage />);

    const table = await screen.findByRole("table", { name: "Jadwal mingguan anak" });
    expect(await screen.findByText("Mapel 1")).toBeInTheDocument();
    expect(screen.getByText("07:00–07:40")).toBeInTheDocument();
    expect(table).toBeInTheDocument();
  });

  it("surfaces an error instead of 'Mapel #id' when the lookup fails", async () => {
    stubChildren([child()]);
    server.use(
      http.get(`${API}/api/schedules/by-class/1`, () =>
        HttpResponse.json({ detail: "boom" }, { status: 500 })
      )
    );

    render(<OrangTuaJadwalPage />);

    expect(await screen.findByText("Gagal memuat jadwal. Coba lagi.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Coba lagi" })).toBeInTheDocument();
    expect(screen.queryByText(/Mapel #/)).not.toBeInTheDocument();
  });

  it("preselects the student from a ?page=jadwal&student=N deep link", async () => {
    window.history.replaceState({}, "", "/?page=jadwal&student=2");
    stubChildren([
      child(),
      child({ id: 2, user_id: 11, nis: "2026002", full_name: "Siti Aminah", class_id: 2 }),
    ]);
    server.use(http.get(`${API}/api/schedules/by-class/2`, () => HttpResponse.json([])));

    render(<OrangTuaJadwalPage />);

    const select = await screen.findByLabelText("Pilih anak");
    await vi.waitFor(() => expect(select).toHaveValue("2"));
    expect(select).toBeInTheDocument();
  });
});
