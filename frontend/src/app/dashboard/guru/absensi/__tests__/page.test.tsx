import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { API } from "@/test/handlers";
import type { AttendanceRow, StudentRecord } from "@/lib/endpoints";
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

function envelope<T>(items: T[], total = items.length) {
  return { items, total, page: 1, size: items.length };
}

function makeStudents(count: number, prefix = "Murid"): StudentRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    user_id: 100 + index,
    school_id: 1,
    class_id: 1,
    nis: `2026${String(index + 1).padStart(3, "0")}`,
    full_name: `${prefix} ${index + 1}`,
    email: null,
    birth_date: null,
    enrollment_status: "active",
  }));
}

function rosterRows(
  students: StudentRecord[],
  statuses: Record<number, string> = {}
): AttendanceRow[] {
  return students.map((student) => ({
    id: statuses[student.id] ? student.id : 0,
    student_id: student.id,
    class_id: 1,
    date: "2026-01-15",
    status: (statuses[student.id] ?? "hadir") as AttendanceRow["status"],
    recorded_by: 2,
    note: null,
    student: { id: student.id, full_name: student.full_name, nis: student.nis },
  }));
}

function rosterHandler(students: StudentRecord[], statuses: Record<number, string> = {}) {
  return http.get(`${API}/api/attendances`, ({ request }) => {
    const url = new URL(request.url);
    if (url.searchParams.has("class_id")) {
      const rows = rosterRows(students, statuses);
      return HttpResponse.json(envelope(rows, rows.length));
    }
    return HttpResponse.json(envelope([], 0));
  });
}

function studentsHandler(students: StudentRecord[]) {
  return http.get(`${API}/api/students`, () => HttpResponse.json(envelope(students)));
}

function rowGroup(name: string) {
  return screen.getByRole("radiogroup", { name: `Status ${name}` });
}

function saveButton() {
  return screen.getByRole("button", { name: "Simpan Absensi" });
}

describe("AbsensiPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("test_roster_loads_with_default_hadir", async () => {
    const students = makeStudents(30);
    server.use(studentsHandler(students), rosterHandler(students));

    render(<AbsensiPage />);

    expect(await screen.findByText("Murid 1")).toBeInTheDocument();
    expect(screen.getByText("30 siswa")).toBeInTheDocument();
    // 30 body rows + 1 header row.
    expect(screen.getAllByRole("row")).toHaveLength(31);
    expect(within(rowGroup("Murid 30")).getByRole("radio", { name: "Hadir" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("test_save_sends_single_bulk_call", async () => {
    const students = makeStudents(3);
    const bulkBodies: { entries: { student_id: number }[] }[] = [];
    let patchCount = 0;
    server.use(
      studentsHandler(students),
      rosterHandler(students),
      http.post(`${API}/api/attendances/bulk`, async ({ request }) => {
        const body = (await request.json()) as {
          class_id: number;
          date: string;
          entries: unknown[];
        };
        bulkBodies.push(body as { entries: { student_id: number }[] });
        return HttpResponse.json({
          class_id: body.class_id,
          date: body.date,
          created: body.entries.length,
        });
      }),
      http.patch(`${API}/api/attendances/:id`, () => {
        patchCount += 1;
        return HttpResponse.json({});
      })
    );

    const user = userEvent.setup();
    render(<AbsensiPage />);

    await screen.findByText("Murid 1");
    await user.click(within(rowGroup("Murid 1")).getByRole("radio", { name: "Izin" }));
    await user.click(within(rowGroup("Murid 2")).getByRole("radio", { name: "Sakit" }));
    await user.click(within(rowGroup("Murid 3")).getByRole("radio", { name: "Alpa" }));
    await user.click(saveButton());

    await waitFor(() => expect(bulkBodies).toHaveLength(1));
    expect(bulkBodies[0].entries).toHaveLength(3);
    expect(bulkBodies[0].entries.map((entry) => entry.student_id).sort()).toEqual([1, 2, 3]);
    expect(patchCount).toBe(0);
  });

  it("test_after_save_refetch_from_be", async () => {
    let rosterCall = 0;
    server.use(
      studentsHandler([]),
      http.get(`${API}/api/attendances`, ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.has("class_id")) {
          rosterCall += 1;
          const name = rosterCall === 1 ? "Murid Lama" : "Murid Baru";
          const rows: AttendanceRow[] = [
            {
              id: rosterCall,
              student_id: 1,
              class_id: 1,
              date: "2026-01-15",
              status: "hadir",
              recorded_by: 2,
              note: null,
              student: { id: 1, full_name: name, nis: "2026001" },
            },
          ];
          return HttpResponse.json(envelope(rows, rows.length));
        }
        return HttpResponse.json(envelope([], 0));
      }),
      http.post(`${API}/api/attendances/bulk`, () =>
        HttpResponse.json({ class_id: 1, date: "2026-01-15", created: 1 })
      )
    );

    const user = userEvent.setup();
    render(<AbsensiPage />);

    expect(await screen.findByText("Murid Lama")).toBeInTheDocument();
    await user.click(within(rowGroup("Murid Lama")).getByRole("radio", { name: "Alpa" }));
    await user.click(saveButton());

    expect(await screen.findByText("Murid Baru")).toBeInTheDocument();
    expect(screen.queryByText("Murid Lama")).not.toBeInTheDocument();
  });

  it("test_double_save_does_not_409", async () => {
    const students = makeStudents(1, "Murid Satu");
    let bulkCount = 0;
    server.use(
      studentsHandler(students),
      rosterHandler(students),
      http.post(`${API}/api/attendances/bulk`, () => {
        bulkCount += 1;
        return HttpResponse.json({ class_id: 1, date: "2026-01-15", created: 1 });
      })
    );

    const user = userEvent.setup();
    render(<AbsensiPage />);

    await screen.findByText("Murid Satu 1");
    await user.click(within(rowGroup("Murid Satu 1")).getByRole("radio", { name: "Alpa" }));
    await user.click(saveButton());
    await waitFor(() => expect(bulkCount).toBe(1));
    await waitFor(() =>
      expect(within(rowGroup("Murid Satu 1")).getByRole("radio", { name: "Alpa" })).toHaveAttribute(
        "aria-checked",
        "false"
      )
    );

    await user.click(within(rowGroup("Murid Satu 1")).getByRole("radio", { name: "Izin" }));
    await user.click(saveButton());
    await waitFor(() => expect(bulkCount).toBe(2));
    await waitFor(() =>
      expect(within(rowGroup("Murid Satu 1")).getByRole("radio", { name: "Izin" })).toHaveAttribute(
        "aria-checked",
        "false"
      )
    );

    expect(bulkCount).toBe(2);
    expect(screen.queryByText(/conflict|sudah tercatat/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Gagal menyimpan/i)).not.toBeInTheDocument();
  });

  it("test_edit_window_shows_inline_notice", async () => {
    const students = makeStudents(1);
    server.use(
      studentsHandler(students),
      rosterHandler(students),
      http.post(`${API}/api/attendances/bulk`, () =>
        HttpResponse.json({ detail: "edits only allowed within 24 hours" }, { status: 403 })
      )
    );

    const user = userEvent.setup();
    render(<AbsensiPage />);

    await screen.findByText("Murid 1");
    await user.click(within(rowGroup("Murid 1")).getByRole("radio", { name: "Alpa" }));
    await user.click(saveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "edits only allowed within 24 hours"
    );
    expect(saveButton()).toBeDisabled();
  });

  it("surfaces an API error when the bulk save fails", async () => {
    const students = makeStudents(1);
    server.use(
      studentsHandler(students),
      rosterHandler(students),
      http.post(`${API}/api/attendances/bulk`, () =>
        HttpResponse.json({ detail: "Gagal menyimpan absensi." }, { status: 500 })
      )
    );
    const user = userEvent.setup();
    render(<AbsensiPage />);

    await screen.findByText("Murid 1");
    await user.click(within(rowGroup("Murid 1")).getByRole("radio", { name: "Alpa" }));
    await user.click(saveButton());

    expect(await screen.findByText("Gagal menyimpan absensi.")).toBeInTheDocument();
  });

  it("shows an empty state when the class has no students", async () => {
    server.use(studentsHandler([]), rosterHandler([]));
    render(<AbsensiPage />);

    await screen.findByText("Tidak ada siswa di kelas ini");
    expect(screen.getByText("Tidak ada siswa di kelas ini")).toBeInTheDocument();
  });
});
