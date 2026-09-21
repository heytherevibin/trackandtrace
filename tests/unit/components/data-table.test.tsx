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
  // A header is also the row label the stacked phone layout prints, through
  // `content: attr(data-label)` (src/styles/utilities.css). A DOM attribute holds only strings, so
  // a header hidden by wrapping it in an element would reach the attribute as "[object Object]" --
  // silently, with no React warning, and visibly under 768px. hideHeader keeps the header a string
  // and hides it in the cell it is drawn in, which is the only place it should be hidden.
  it("hides a header from sight without turning the phone layout's row label into an object", () => {
    render(
      <DataTable
        caption="My keys"
        rows={[{ id: "k1" }]}
        rowKey={(r) => r.id}
        columns={[
          { key: "name", header: "Name", cell: () => "YubiKey 5C" },
          { key: "actions", header: "Actions", hideHeader: true, cell: () => "Rename" },
        ]}
      />,
    );
    const [, actionsCell] = screen.getAllByRole("cell");
    expect(actionsCell).toHaveAttribute("data-label", "Actions");
    // Still announced -- the header is hidden, not removed.
    expect(screen.getByRole("columnheader", { name: "Actions" })).toBeInTheDocument();
  });

  it("renders the empty state instead of an empty table", () => {
    render(<DataTable caption="Saved PNRs" rows={[]} rowKey={() => ""} columns={[]} emptyState={<p>Nothing saved yet</p>} />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("Nothing saved yet")).toBeInTheDocument();
  });
});
