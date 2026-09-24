import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JourneyDetails } from "@/components/pnr/journey-details";
import { fixtureResult } from "./result-fixtures";

describe("JourneyDetails", () => {
  it("frames the journey facts in a plate headed Journey", () => {
    const result = fixtureResult("2345678909");
    render(<JourneyDetails snapshot={result.snapshot} quota={result.lead.quota} />);
    expect(screen.getByRole("region", { name: "Journey" })).toBeInTheDocument();
    const value = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling;
    expect(value("Train")).toHaveTextContent("12627 · Karnataka Express");
    expect(value("Route")).toHaveTextContent("Bengaluru (SBC) → New Delhi (NDLS)");
    expect(value("Journey")).toHaveTextContent(result.snapshot.journeyDateLabel);
    expect(value("Class")).toHaveTextContent("2S");
    expect(value("Quota")).toHaveTextContent("GN");
    expect(value("Departs")).toHaveTextContent("19:20 IST");
    expect(value("Chart")).toHaveTextContent("15:20 IST");
    expect(value("Distance")).toHaveTextContent("2,444 km");
  });

  it("keeps an even number of cells on a two-column frame so every row closes", () => {
    const result = fixtureResult("2345678901");
    render(<JourneyDetails snapshot={result.snapshot} quota={result.lead.quota} />);
    const grid = screen.getByText("Train", { selector: "dt" }).closest("dl");
    expect(grid).toHaveClass("grid-cols-2");
    expect(grid?.children.length).toBe(8);
  });

  it("says Not returned for journey facts the source did not send", () => {
    const base = fixtureResult("2345678901");
    const snapshot = { ...base.snapshot, source: "railkit" as const, train: { number: "12658", from: { code: "SBC", city: "KSR Bengaluru" }, to: { code: "MAS" } }, chartAt: undefined, chartTime: undefined };
    render(<JourneyDetails snapshot={snapshot} quota="GN" />);
    const value = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling;
    expect(value("Train")).toHaveTextContent(/^12658$/);
    expect(value("Route")).toHaveTextContent("KSR Bengaluru (SBC) → MAS");
    expect(value("Distance")).toHaveTextContent("Not returned");
    expect(value("Departs")).toHaveTextContent("Not returned");
    expect(value("Chart")).toHaveTextContent("Not returned");
  });
});

