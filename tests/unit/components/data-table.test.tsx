import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataTable } from "@/components/ui/data-table";

const rows = [
  { pnr: "2345678901", label: "one" },
  { pnr: "2345678905", label: "two" },
];

describe("DataTable", () => {
  it("renders a semantic table with caption, scoped headers, and stacking labels", () => {
    render(
      <DataTable
        caption="Saved PNRs"
        rows={rows}
        rowKey={(r) => r.pnr}
        columns={[
          { key: "pnr", header: "PNR", cell: (r) => r.pnr, numeric: true },
          { key: "label", header: "Journey", cell: (r) => r.label },
        ]}
      />,
    );
    expect(screen.getByRole("table", { name: "Saved PNRs" })).toBeInTheDocument();
    for (const th of screen.getAllByRole("columnheader")) expect(th).toHaveAttribute("scope", "col");
    expect(screen.getAllByRole("cell")[0]).toHaveAttribute("data-label", "PNR");
    expect(screen.getByRole("region", { name: "Saved PNRs" })).toHaveAttribute("tabindex", "0");
  });
  it("renders the empty state instead of an empty table", () => {
    render(<DataTable caption="Saved PNRs" rows={[]} rowKey={() => ""} columns={[]} emptyState={<p>Nothing saved yet</p>} />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("Nothing saved yet")).toBeInTheDocument();
  });
});
