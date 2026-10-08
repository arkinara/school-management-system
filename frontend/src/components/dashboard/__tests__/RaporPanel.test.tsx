import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { API } from "@/test/handlers";
import type { ReportCardRecord, RaporCompiledData } from "@/lib/endpoints";
import type { UserMe } from "@/lib/auth";
import { RaporPanel } from "../RaporPanel";

const ACTIVE_SEMESTER = "2026/2027-ganjil";

const parentMe: UserMe = {
  user: {
    id: 50,
    tenant_id: 1,
    school_id: 1,
    email: "ortu@menteng.sch.id",
    role: "parent",
    full_name: "Ibu Ani",
    created_at: "2026-01-01",
  },
  tenant_id: 1,
  school_id: 1,
  role: "parent",
};

const studentMe: UserMe = {
  user: {
    id: 11,
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
};

function child(id: number, fullName: string) {
  return {
    id,
    user_id: 10 + id,
    nis: `20260${id}`,
    full_name: fullName,
    class_id: 1,
    enrollment_status: "active",
    relationship: "child",
    is_primary: true,
  };
}

function compiledData(subject: string): RaporCompiledData {
  return {
    student_id: 2,
    semester: ACTIVE_SEMESTER,
    jenjang: "SD",
    fase: "C",
    kurikulum_version: "merdeka",
    capaian_pembelajaran: [{ aspek: subject, deskripsi: "Berkembang baik" }],
    kehadiran: { hadir: 10, izin: 1, sakit: 0, alpa: 0 },
  };
}

function makeRapor(overrides: Partial<ReportCardRecord> = {}): ReportCardRecord {
  return {
    id: 1,
    student_id: 2,
    semester: ACTIVE_SEMESTER,
    status: "published",
    kurikulum_version: "merdeka",
    compiled_data: compiledData("Matematika"),
    finalized_by: null,
    published_at: "2026-01-10T00:00:00Z",
    ...overrides,
  };
}

function mockChildren(children = [child(2, "Siti Aminah")]) {
  server.use(http.get(`${API}/api/parents/:id/children`, () => HttpResponse.json(children)));
}

function mockRaporList(records: ReportCardRecord[], onCall?: () => void) {
  server.use(
    http.get(`${API}/api/report-cards`, () => {
      onCall?.();
      return HttpResponse.json({
        items: records,
        total: records.length,
        page: 1,
        size: records.length,
      });
    })
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("RaporPanel", () => {
  it("test_semester_list_from_be: dropdown options come from the backend rapors + active semester", async () => {
    mockChildren();
    mockRaporList([
      makeRapor({ id: 1, semester: "2025/2026-ganjil" }),
      makeRapor({ id: 2, semester: "2024/2025-genap" }),
    ]);

    render(<RaporPanel me={parentMe} audience="parent" />);

    const select = await screen.findByRole("combobox", { name: "Semester" });
    await waitFor(() => expect(within(select).getAllByRole("option")).toHaveLength(3));

    const values = within(select)
      .getAllByRole("option")
      .map((option) => (option as HTMLOptionElement).value);
    expect(values).toContain("2025/2026-ganjil");
    expect(values).toContain("2024/2025-genap");
    expect(values).toContain(ACTIVE_SEMESTER);
  });

  it("test_loading_state: skeleton is rendered while the rapor request is in flight", async () => {
    mockChildren();
    server.use(
      http.get(`${API}/api/report-cards`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return HttpResponse.json({ items: [], total: 0, page: 1, size: 0 });
      })
    );

    render(<RaporPanel me={parentMe} audience="parent" />);

    expect(document.querySelector("[aria-busy]")).not.toBeNull();
  });

  it("test_error_state_with_retry: 500 shows error with a retry that refetches", async () => {
    mockChildren();
    let calls = 0;
    server.use(
      http.get(`${API}/api/report-cards`, () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json({ detail: "boom" }, { status: 500 });
        }
        return HttpResponse.json({
          items: [makeRapor()],
          total: 1,
          page: 1,
          size: 1,
        });
      })
    );

    const user = userEvent.setup();
    render(<RaporPanel me={parentMe} audience="parent" />);

    expect(await screen.findByText("Gagal memuat rapor")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Coba lagi/i }));

    await waitFor(() => expect(calls).toBe(2));
    expect(await screen.findByText("Matematika")).toBeInTheDocument();
  });

  it("test_no_rapor_state: empty list shows the no-rapor state", async () => {
    mockChildren();
    mockRaporList([]);

    render(<RaporPanel me={parentMe} audience="parent" />);

    expect(await screen.findByText(/Belum ada rapor/i)).toBeInTheDocument();
  });

  it("test_not_yet_published_state: draft rapors show the not-published state", async () => {
    mockChildren();
    mockRaporList([makeRapor({ status: "draft" })]);

    render(<RaporPanel me={parentMe} audience="parent" />);

    expect(await screen.findByText(/belum dipublikasikan/i)).toBeInTheDocument();
    expect(screen.getByText(/Disusun wali kelas/i)).toBeInTheDocument();
  });

  it("test_published_state: published rapors render their content", async () => {
    mockChildren();
    mockRaporList([makeRapor({ status: "published" })]);

    render(<RaporPanel me={parentMe} audience="parent" />);

    expect(await screen.findByText("Matematika")).toBeInTheDocument();
    expect(screen.getByText("published")).toBeInTheDocument();
  });

  it("test_superseded_state_shows_error: superseded rapors surface an error, not content", async () => {
    mockChildren();
    mockRaporList([makeRapor({ status: "superseded" })]);

    render(<RaporPanel me={parentMe} audience="parent" />);

    expect(await screen.findByText(/telah diperbarui/i)).toBeInTheDocument();
  });

  it("test_student_from_auth_me_not_items_zero: only the signed-in student's rapors render", async () => {
    // Default /api/students returns students id 1 (user 10) and id 2 (user 11).
    // Signing in as user 11 must resolve to student 2, never items[0] (student 1).
    mockRaporList([
      makeRapor({ id: 1, student_id: 1, compiled_data: compiledData("Mapel Lain") }),
      makeRapor({ id: 2, student_id: 2, compiled_data: compiledData("Sejarah") }),
    ]);

    render(<RaporPanel me={studentMe} audience="student" />);

    expect(await screen.findByText("Sejarah")).toBeInTheDocument();
    expect(screen.queryByText("Mapel Lain")).not.toBeInTheDocument();
  });

  it("test_semester_change_triggers_refetch: changing the semester dropdown refetches", async () => {
    mockChildren();
    let calls = 0;
    mockRaporList(
      [
        makeRapor({ id: 1, semester: "2025/2026-ganjil" }),
        makeRapor({ id: 2, semester: "2024/2025-genap" }),
      ],
      () => {
        calls += 1;
      }
    );

    const user = userEvent.setup();
    render(<RaporPanel me={parentMe} audience="parent" />);

    const select = await screen.findByRole("combobox", { name: "Semester" });
    await waitFor(() => expect(calls).toBe(1));

    await user.selectOptions(select, "2024/2025-genap");

    await waitFor(() => expect(calls).toBe(2));
  });
});
