import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PassengerTable } from "@/components/pnr/passenger-table";
import { fixtureResult } from "./result-fixtures";

describe("PassengerTable", () => {
  it("is a plate region named Passengers with the booked count in its header", () => {
    render(<PassengerTable pax={fixtureResult("2345678909").snapshot.pax} />);
    const region = screen.getByRole("region", { name: "Passengers" });
    expect(within(region).getByText("3 booked")).toBeInTheDocument();
  });

  it("lays out real cells in the drawn columns, one row per passenger, never a name", () => {
    render(<PassengerTable pax={fixtureResult("2345678909").snapshot.pax} />);
    const table = screen.getByRole("table", { name: "Passengers" });
    expect(within(table).getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["Passenger", "Booked", "Current", "Coach · berth"]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell").map((td) => td.textContent))).toEqual([
      ["Passenger 1", "WL", "CNF", "B1 · 12 LB"],
      ["Passenger 2", "WL", "RAC 4", "Not allocated"],
      ["Passenger 3", "WL", "WL 9", "Not allocated"],
    ]);
    expect(screen.getByRole("cell", { name: "Passenger 3" })).toBeInTheDocument();
  });

  it("sets the current status in the heavier weight and the booked status at 70%", () => {
    render(<PassengerTable pax={fixtureResult("2345678909").snapshot.pax} />);
    expect(screen.getByRole("cell", { name: "RAC 4" })).toHaveClass("font-semibold");
    expect(screen.getAllByRole("cell", { name: "WL" })[0]).toHaveClass("text-ink-1/70");
  });

  it("counts a single passenger in the singular form the header reads", () => {
    render(<PassengerTable pax={fixtureResult("2345678901").snapshot.pax.slice(0, 1)} />);
    expect(screen.getByText("1 booked")).toBeInTheDocument();
  });
});
