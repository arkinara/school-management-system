import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Table, type Column } from "../Table";

interface Row {
  id: number;
  name: string;
  count: number;
  note: string;
}

const columns: Column<Row>[] = [
  { key: "name", header: "Nama", sortable: true },
  { key: "count", header: "Jumlah", sortable: true },
  { key: "note", header: "Catatan" },
];

const rows: Row[] = [
  { id: 1, name: "Alfa", count: 3, note: "primer" },
  { id: 2, name: "Beta", count: 1, note: "sekunder" },
];

function renderTable(sort?: { key: string; direction: "asc" | "desc" }) {
  const onSort = vi.fn();
  render(
    <Table
      columns={columns}
      rows={rows}
      rowKey={(row) => String(row.id)}
      sort={sort}
      onSort={onSort}
    />
  );
  return { onSort };
}

describe("Table accessibility", () => {
  it("test_table_aria_sort_all_columns gives every sortable column an aria-sort value", () => {
    renderTable();

    const nameHeader = screen.getByRole("columnheader", { name: /Nama/ });
    const countHeader = screen.getByRole("columnheader", { name: /Jumlah/ });
    const noteHeader = screen.getByRole("columnheader", { name: /Catatan/ });

    expect(nameHeader).toHaveAttribute("aria-sort", "none");
    expect(countHeader).toHaveAttribute("aria-sort", "none");
    expect(noteHeader).not.toHaveAttribute("aria-sort");
  });

  it("test_table_aria_sort_reflects_active_direction reflects the active sort direction", () => {
    renderTable({ key: "count", direction: "desc" });

    expect(screen.getByRole("columnheader", { name: /Jumlah/ })).toHaveAttribute(
      "aria-sort",
      "descending"
    );
    expect(screen.getByRole("columnheader", { name: /Nama/ })).toHaveAttribute("aria-sort", "none");
  });

  it("test_table_data_value_on_cells sets data-value on every body cell", () => {
    renderTable();

    const bodyRows = screen.getAllByRole("row").slice(1);
    for (const row of bodyRows) {
      const cells = Array.from(row.querySelectorAll("td"));
      expect(cells).toHaveLength(columns.length);
      for (const cell of cells) {
        expect(cell).toHaveAttribute("data-value");
      }
    }

    expect(bodyRows[0].querySelectorAll("td")[0]).toHaveAttribute("data-value", "Alfa");
    expect(bodyRows[0].querySelectorAll("td")[1]).toHaveAttribute("data-value", "3");
  });

  it("test_table_sort_button_invokes_onSort calls onSort with the column key", async () => {
    const user = userEvent.setup();
    const { onSort } = renderTable();

    await user.click(screen.getByRole("button", { name: /Jumlah/ }));
    expect(onSort).toHaveBeenCalledWith("count");
  });
});
