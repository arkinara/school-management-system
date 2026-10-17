import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SchoolPicker } from "../SchoolPicker";

describe("SchoolPicker tenant labels", () => {
  it("test_school_picker_shows_tenant_names uses real tenant names, not ids", async () => {
    render(
      <SchoolPicker
        schools={[{ id: 1, name: "SDN Menteng 01", tenant_id: 1 }]}
        value={1}
        onChange={vi.fn()}
      />
    );

    expect(await screen.findByRole("group", { name: "SDN Menteng 01" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /Tenant 1/i })).not.toBeInTheDocument();
  });
});
