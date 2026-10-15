import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { API } from "@/test/handlers";
import type { YayasanCompareSchool, YayasanTenantSummary } from "@/lib/endpoints";
import { SchoolComparisonWidget } from "../SchoolComparisonWidget";

function tenant(
  id: number,
  name: string,
  schools: { id: number; name: string }[]
): YayasanTenantSummary {
  return {
    id,
    name,
    jenjang_type: "SD",
    school_count: schools.length,
    enrollment: 0,
    users_by_role: {},
    attendance_rate: 0,
    spp_collection_rate: 0,
    schools: schools.map((school) => ({ ...school, jenjang: "SD", enrollment: 0 })),
  };
}

const tenants: YayasanTenantSummary[] = [
  tenant(1, "Yayasan A", [
    { id: 1, name: "SDN A1" },
    { id: 2, name: "SDN A2" },
    { id: 3, name: "SDN A3" },
  ]),
  tenant(2, "Yayasan B", [
    { id: 4, name: "SDN B1" },
    { id: 5, name: "SDN B2" },
  ]),
];

function compareHandler(onRequest?: (ids: number[]) => void) {
  return http.get(`${API}/api/yayasan/compare`, ({ request }) => {
    const ids = new URL(request.url).searchParams.getAll("school_ids").map(Number);
    onRequest?.(ids);
    const schools: YayasanCompareSchool[] = ids.map((id) => ({
      id,
      name: `Sekolah ${id}`,
      jenjang: "SD",
      enrollment: id * 10,
      classes: [{ id: id * 100, name: `Kelas ${id}`, enrollment: id }],
    }));
    return HttpResponse.json({ schools });
  });
}

describe("SchoolComparisonWidget", () => {
  it("test_school_comparison_selects_2_3 fetches a comparison once 2-3 schools are picked", async () => {
    const user = userEvent.setup();
    const seen: number[][] = [];
    server.use(compareHandler((ids) => seen.push(ids)));

    render(<SchoolComparisonWidget tenants={tenants} />);

    await user.click(screen.getByRole("checkbox", { name: "SDN A1" }));
    await user.click(screen.getByRole("checkbox", { name: "SDN A2" }));

    await waitFor(() => expect(seen).toContainEqual([1, 2]));
    expect(await screen.findByText("Sekolah 1")).toBeInTheDocument();
    expect(await screen.findByText("Sekolah 2")).toBeInTheDocument();
    expect(screen.queryByText("Sekolah 3")).not.toBeInTheDocument();
  });

  it("test_school_comparison_disabled_at_4 disables the fourth checkbox once three are chosen", async () => {
    const user = userEvent.setup();
    server.use(compareHandler());

    render(<SchoolComparisonWidget tenants={tenants} />);

    await user.click(screen.getByRole("checkbox", { name: "SDN A1" }));
    await user.click(screen.getByRole("checkbox", { name: "SDN A2" }));
    await user.click(screen.getByRole("checkbox", { name: "SDN A3" }));

    expect(screen.getByRole("checkbox", { name: "SDN B1" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "SDN B2" })).toBeDisabled();
  });

  it("test_school_comparison_error_state shows an error state when the request fails", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`${API}/api/yayasan/compare`, () =>
        HttpResponse.json({ detail: "boom" }, { status: 500 })
      )
    );

    render(<SchoolComparisonWidget tenants={tenants} />);

    await user.click(screen.getByRole("checkbox", { name: "SDN A1" }));
    await user.click(screen.getByRole("checkbox", { name: "SDN A2" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Gagal memuat perbandingan sekolah."
    );
  });

  it("test_school_comparison_empty shows an empty state when there are no schools", () => {
    render(<SchoolComparisonWidget tenants={[tenant(1, "Kosong", [])]} />);
    expect(screen.getByText("Belum ada sekolah")).toBeInTheDocument();
  });
});
