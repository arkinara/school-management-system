import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { API } from "@/test/handlers";
import JadwalConfigPage from "../page";
import type { ScheduleRecord } from "@/lib/endpoints";

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

function slot(overrides: Partial<ScheduleRecord> = {}): ScheduleRecord {
  return {
    id: 1,
    class_id: 1,
    subject_id: 1,
    teacher_id: 2,
    day_of_week: 1,
    period_number: 1,
    start_time: "07:00:00",
    end_time: "07:40:00",
    ...overrides,
  };
}

async function enterGrid(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("option", { name: /Kelas 5A/ });
  await user.click(screen.getByRole("button", { name: /Susun Waktu/ }));
}

describe("JadwalConfigPage (#58)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("save calls bulk-replace once with the two changed cells", async () => {
    let posted: ScheduleRecord[] | null = null;
    let postCount = 0;
    server.use(
      http.get(`${API}/api/schedules/class/1`, () => HttpResponse.json([])),
      http.post(`${API}/api/schedules/bulk-replace/1`, async ({ request }) => {
        postCount += 1;
        posted = (await request.json()) as ScheduleRecord[];
        return HttpResponse.json(posted, { status: 201 });
      })
    );

    const user = userEvent.setup();
    render(<JadwalConfigPage />);
    await enterGrid(user);

    // Fill two cells through the slot dialog.
    await user.click(await screen.findByRole("button", { name: "Senin jam ke-1" }));
    await user.selectOptions(screen.getByLabelText(/Mata Pelajaran/), "1");
    await user.selectOptions(screen.getByLabelText(/^Guru\*?$/), "2");
    await user.click(screen.getByRole("button", { name: "Simpan Slot" }));

    await user.click(screen.getByRole("button", { name: "Selasa jam ke-2" }));
    await user.selectOptions(screen.getByLabelText(/Mata Pelajaran/), "1");
    await user.selectOptions(screen.getByLabelText(/^Guru\*?$/), "2");
    await user.click(screen.getByRole("button", { name: "Simpan Slot" }));

    await user.click(screen.getByRole("button", { name: "Simpan Jadwal" }));

    await waitFor(() => expect(posted).not.toBeNull());
    expect(postCount).toBe(1);
    expect(posted as unknown as ScheduleRecord[]).toHaveLength(2);
    expect(await screen.findByText("2 slot jadwal tersimpan")).toBeInTheDocument();
  }, 15000);

  it("saving an unchanged grid sends no request", async () => {
    let postCount = 0;
    server.use(
      http.get(`${API}/api/schedules/class/1`, () => HttpResponse.json([slot()])),
      http.post(`${API}/api/schedules/bulk-replace/1`, () => {
        postCount += 1;
        return HttpResponse.json([], { status: 201 });
      })
    );

    const user = userEvent.setup();
    render(<JadwalConfigPage />);
    await enterGrid(user);

    await screen.findByText("Matematika");
    await user.click(screen.getByRole("button", { name: "Simpan Jadwal" }));

    expect(await screen.findByText("Tidak ada perubahan jadwal.")).toBeInTheDocument();
    expect(postCount).toBe(0);
  });

  it("renders existing entries returned by the API", async () => {
    server.use(
      http.get(`${API}/api/schedules/class/1`, () =>
        HttpResponse.json([
          slot({ id: 1, day_of_week: 1, period_number: 1 }),
          slot({ id: 2, day_of_week: 2, period_number: 2 }),
          slot({ id: 3, day_of_week: 3, period_number: 3 }),
        ])
      )
    );

    const user = userEvent.setup();
    render(<JadwalConfigPage />);
    await enterGrid(user);

    const table = await screen.findByRole("table");
    await waitFor(() => expect(within(table).getAllByText("Matematika")).toHaveLength(3));
  });

  it("highlights conflicting cells from a 409 detail.conflicts response", async () => {
    server.use(
      http.get(`${API}/api/schedules/class/1`, () => HttpResponse.json([])),
      http.post(`${API}/api/schedules/bulk-replace/1`, () =>
        HttpResponse.json(
          {
            detail: {
              message: "schedule conflicts",
              conflicts: [
                {
                  type: "teacher",
                  schedule_id: 9,
                  id: 9,
                  class_id: 2,
                  subject_id: 1,
                  teacher_id: 2,
                  day_of_week: 1,
                  period_number: 1,
                  start_time: "07:00:00",
                  end_time: "07:40:00",
                },
              ],
            },
          },
          { status: 409 }
        )
      )
    );

    const user = userEvent.setup();
    render(<JadwalConfigPage />);
    await enterGrid(user);

    await user.click(await screen.findByRole("button", { name: "Senin jam ke-1" }));
    await user.selectOptions(screen.getByLabelText(/Mata Pelajaran/), "1");
    await user.selectOptions(screen.getByLabelText(/^Guru\*?$/), "2");
    await user.click(screen.getByRole("button", { name: "Simpan Slot" }));

    await user.click(screen.getByRole("button", { name: "Simpan Jadwal" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Senin jam ke-1" })).toHaveAttribute(
        "data-conflict",
        "true"
      )
    );
    expect(await screen.findByText("1 jadwal bentrok")).toBeInTheDocument();
  });

  it("shows an error alert with retry when the schedule load fails", async () => {
    server.use(
      http.get(`${API}/api/schedules/class/1`, () =>
        HttpResponse.json({ detail: "boom" }, { status: 500 })
      )
    );

    const user = userEvent.setup();
    render(<JadwalConfigPage />);
    await enterGrid(user);

    expect(await screen.findByText("Gagal memuat jadwal. Coba lagi.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Coba lagi" })).toBeInTheDocument();
  });
});
