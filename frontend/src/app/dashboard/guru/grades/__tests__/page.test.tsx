import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { API, classes as defaultClasses } from "@/test/handlers";
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

function tenantHandler(jenjang: "TK" | "SD" | "SMP" | "SMA") {
  return http.get(`${API}/api/public/tenants`, () =>
    HttpResponse.json([{ id: 1, name: `Tenant ${jenjang}`, jenjang_type: jenjang }])
  );
}

function bulkSuccess(body: {
  subject_id: number;
  semester: string;
  category: string;
  entries: unknown[];
}) {
  return HttpResponse.json({
    class_id: 1,
    subject_id: body.subject_id,
    semester: body.semester,
    category: body.category,
    created: body.entries.length,
    updated: 0,
  });
}

describe("GradesPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    server.use(tenantHandler("SMP"));
  });

  it("does not call the API when saving with no changes", async () => {
    const bulkSpy = vi.fn();
    server.use(
      http.post(`${API}/api/grades/bulk`, async ({ request }) => {
        bulkSpy(await request.json());
        return bulkSuccess({
          subject_id: 1,
          semester: "2026/2027-ganjil",
          category: "formatif",
          entries: [],
        });
      })
    );
    const user = userEvent.setup();
    render(<GradesPage />);

    await screen.findByText("Ahmad Fauzi");
    await user.click(screen.getByRole("button", { name: "Simpan Nilai" }));

    expect(bulkSpy).not.toHaveBeenCalled();
  });

  it("sends only dirty rows in a single bulk call", async () => {
    const bulkSpy = vi.fn();
    server.use(
      http.post(`${API}/api/grades/bulk`, async ({ request }) => {
        const body = (await request.json()) as {
          subject_id: number;
          semester: string;
          category: string;
          entries: unknown[];
        };
        bulkSpy(body);
        return bulkSuccess(body);
      })
    );
    const user = userEvent.setup();
    render(<GradesPage />);

    await screen.findByText("Ahmad Fauzi");
    await user.type(screen.getByLabelText("Formatif Ahmad Fauzi"), "80");
    await user.type(screen.getByLabelText("Formatif Siti Aminah"), "90");
    await user.click(screen.getByRole("button", { name: "Simpan Nilai" }));

    expect(await screen.findByText("2 nilai tersimpan")).toBeInTheDocument();
    expect(bulkSpy).toHaveBeenCalledTimes(1);
    expect(bulkSpy.mock.calls[0][0].entries).toHaveLength(2);
    expect(bulkSpy.mock.calls[0][0].category).toBe("formatif");
  });

  it("never duplicates rows when saving twice", async () => {
    const rows = new Map<string, number>();
    let calls = 0;
    server.use(
      http.post(`${API}/api/grades/bulk`, async ({ request }) => {
        calls += 1;
        const body = (await request.json()) as {
          subject_id: number;
          semester: string;
          category: string;
          entries: { student_id: number }[];
        };
        for (const entry of body.entries) {
          const key = `${entry.student_id}:${body.subject_id}:${body.category}`;
          rows.set(key, 1);
        }
        return bulkSuccess(body);
      })
    );
    const user = userEvent.setup();
    render(<GradesPage />);

    await screen.findByText("Ahmad Fauzi");
    await user.type(screen.getByLabelText("Formatif Ahmad Fauzi"), "85");
    await user.click(screen.getByRole("button", { name: "Simpan Nilai" }));
    expect(await screen.findByText("1 nilai tersimpan")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Simpan Nilai" }));

    expect(calls).toBe(1);
    expect(rows.get("1:1:formatif")).toBe(1);
    expect(rows.size).toBe(1);
  });

  it("requires a description for TK/SD tenants and shows an inline error", async () => {
    server.use(tenantHandler("TK"));
    const bulkSpy = vi.fn();
    server.use(
      http.post(`${API}/api/grades/bulk`, async ({ request }) => {
        bulkSpy(await request.json());
        return bulkSuccess({
          subject_id: 1,
          semester: "2026/2027-ganjil",
          category: "formatif",
          entries: [],
        });
      })
    );
    const user = userEvent.setup();
    render(<GradesPage />);

    await screen.findByText("Ahmad Fauzi");
    await user.type(screen.getByLabelText("Formatif Ahmad Fauzi"), "80");
    await user.click(screen.getByRole("button", { name: "Simpan Nilai" }));

    expect(await screen.findByText("Deskripsi wajib diisi untuk jenjang TK.")).toBeInTheDocument();
    expect(screen.getByLabelText("Formatif Ahmad Fauzi")).toHaveAttribute("aria-invalid", "true");
    expect(bulkSpy).not.toHaveBeenCalled();
  });

  it("treats the description as optional for SMP/SMA tenants", async () => {
    server.use(tenantHandler("SMA"));
    const user = userEvent.setup();
    render(<GradesPage />);

    await screen.findByText("Ahmad Fauzi");
    await user.type(screen.getByLabelText("Formatif Ahmad Fauzi"), "88");
    await user.click(screen.getByRole("button", { name: "Simpan Nilai" }));

    expect(await screen.findByText("1 nilai tersimpan")).toBeInTheDocument();
    expect(screen.queryByText(/Deskripsi wajib diisi/)).not.toBeInTheDocument();
  });

  it("shows a 422 inline on the failing row and success on the rest", async () => {
    server.use(
      http.post(`${API}/api/grades/bulk`, async ({ request }) => {
        const body = (await request.json()) as {
          subject_id: number;
          semester: string;
          category: string;
          entries: unknown[];
        };
        if (body.category === "formatif") {
          return HttpResponse.json({ detail: "Nilai ditolak server." }, { status: 422 });
        }
        return bulkSuccess(body);
      })
    );
    const user = userEvent.setup();
    render(<GradesPage />);

    await screen.findByText("Ahmad Fauzi");
    await user.type(screen.getByLabelText("Formatif Ahmad Fauzi"), "80");
    await user.type(screen.getByLabelText("Sumatif Siti Aminah"), "85");
    await user.click(screen.getByRole("button", { name: "Simpan Nilai" }));

    expect(await screen.findByText("Nilai ditolak server.")).toBeInTheDocument();
    expect(await screen.findByText("Tersimpan")).toBeInTheDocument();
  });

  it("filters the class picker to the teacher's assignments", async () => {
    const fiveClasses = Array.from({ length: 5 }, (_, index) => ({
      ...defaultClasses[0],
      id: index + 1,
      name: `Kelas ${index + 1}`,
    }));
    server.use(
      http.get(`${API}/api/classes`, () =>
        HttpResponse.json({
          items: fiveClasses,
          total: fiveClasses.length,
          page: 1,
          size: fiveClasses.length,
        })
      ),
      http.get(`${API}/api/teacher-assignments`, () =>
        HttpResponse.json([
          {
            id: 1,
            teacher_id: 2,
            subject_id: 1,
            class_id: 1,
            academic_year: "2025/2026",
            created_at: "2026-01-01T00:00:00Z",
          },
          {
            id: 2,
            teacher_id: 2,
            subject_id: 1,
            class_id: 3,
            academic_year: "2025/2026",
            created_at: "2026-01-01T00:00:00Z",
          },
        ])
      )
    );
    render(<GradesPage />);

    await screen.findByText("Ahmad Fauzi");
    const select = screen.getByLabelText(/^Kelas/);
    const options = within(select).getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(within(select).getByRole("option", { name: /Kelas 1 ·/ })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: /Kelas 3 ·/ })).toBeInTheDocument();
    await waitFor(() =>
      expect(within(select).queryByRole("option", { name: /Kelas 2 ·/ })).toBeNull()
    );
  });
});
