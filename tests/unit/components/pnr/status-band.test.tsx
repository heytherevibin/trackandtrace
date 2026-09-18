import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBand } from "@/components/pnr/status-band";
import { asLive, fixtureResult } from "./result-fixtures";

describe("StatusBand", () => {
  it("draws the status plate: header cells, tag row, capital status, description", () => {
    render(<StatusBand result={fixtureResult("2345678901")} cached={false} />);
    expect(screen.getByRole("heading", { level: 2, name: "Current reservation status" })).toBeInTheDocument();
    expect(screen.getByText("Sheet 01")).toBeInTheDocument();
    expect(screen.getByTestId("result-status")).toHaveTextContent(/^Confirmed$/);
    expect(screen.getByText("PNR 234 567 8901")).toBeInTheDocument();
    expect(screen.getByText("Confirmed: a berth is allotted.")).toBeInTheDocument();
  });

  it("reads WL with its position exactly as statusLabel does", () => {
    render(<StatusBand result={fixtureResult("2345678905")} cached={false} />);
    expect(screen.getByTestId("result-status")).toHaveTextContent(/^WL 5$/);
    expect(screen.getByText("Waitlisted: no berth yet. The chart decides.")).toBeInTheDocument();
  });

  it("wears exactly one Sample data tag for fixture results and none for live ones", () => {
    const { unmount } = render(<StatusBand result={fixtureResult("2345678901")} cached={false} />);
    expect(screen.getAllByText("Sample data")).toHaveLength(1);
    expect(screen.getByText("Sample data")).toHaveAttribute("title", "Development fixture. Not a real reservation.");
    unmount();
    render(<StatusBand result={asLive(fixtureResult("2345678901"))} cached={false} />);
    expect(screen.queryByText("Sample data")).toBeNull();
  });

  it("frames the deciding facts: passengers, quota, departure, chart", () => {
    render(<StatusBand result={fixtureResult("2345678909")} cached={false} />);
    const facts = screen.getByText("Passengers").closest("dl");
    expect(facts).toHaveClass("border");
    const grid = within(facts as HTMLElement);
    expect(grid.getByText("Passengers").nextElementSibling).toHaveTextContent("3");
    expect(grid.getByText("Quota").nextElementSibling).toHaveTextContent("GN");
    expect(grid.getByText("Departs").nextElementSibling).toHaveTextContent("19:20 IST");
    expect(grid.getByText("Chart").nextElementSibling).toHaveTextContent(/^15:20 IST/);
  });

  it("states provenance and retrieval time, and says when the read was cached", () => {
    const { unmount } = render(<StatusBand result={fixtureResult("2345678901")} cached={false} />);
    expect(screen.getByText("Retrieved 12:00 IST from the development fixture · every field as returned, none invented")).toBeInTheDocument();
    unmount();
    render(<StatusBand result={asLive(fixtureResult("2345678901"))} cached />);
    expect(screen.getByText("Retrieved 12:00 IST from the railway source · every field as returned, none invented · served from the last minute's read")).toBeInTheDocument();
  });

  it("names RailKit in the Third-party tag's note and the provenance for its results", () => {
    const base = fixtureResult("2345678901");
    render(<StatusBand result={{ ...base, snapshot: { ...base.snapshot, source: "railkit" as const } }} cached={false} />);
    expect(screen.getByText("Third-party")).toHaveAttribute("title", expect.stringMatching(/RailKit.*not affiliated/i));
    expect(screen.getByText(/from RailKit \(third-party\)/)).toBeInTheDocument();
  });

  it("wears a Third-party tag for RapidAPI results, names the source, and never estimates a missing chart", () => {
    const base = fixtureResult("2345678901");
    const result = { ...base, snapshot: { ...base.snapshot, source: "rapidapi" as const, train: { number: "12658", from: { code: "SBC" }, to: { code: "MAS" } }, chartAt: undefined, chartTime: undefined, chartPrepared: false } };
    render(<StatusBand result={result} cached={false} />);
    expect(screen.getByText("Third-party")).toHaveAttribute("title", expect.stringMatching(/not affiliated/i));
    expect(screen.queryByText("Sample data")).toBeNull();
    expect(screen.getByText(/from RapidAPI · IRCTC \(third-party\)/)).toBeInTheDocument();
    const value = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling;
    expect(value("Departs")).toHaveTextContent("Not returned");
    expect(value("Chart")).toHaveTextContent("Not prepared");
  });
});

