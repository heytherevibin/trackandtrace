import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SourceNotFound } from "@/components/pnr/source-not-found";

const AT = new Date("2026-09-17T06:30:00.000Z");

describe("SourceNotFound", () => {
  it("reads as the terminal's not-found record: tag row, capital heading, detail, provenance", () => {
    render(<SourceNotFound pnr="2345678900" source="fixture" retrievedAt={AT} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Current reservation status")).toBeInTheDocument();
    expect(screen.getByText("Not found")).toBeInTheDocument();
    expect(screen.getByText("Sample data")).toBeInTheDocument();
    expect(screen.getByText("PNR 234 567 8900")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "No record for this PNR" })).toBeInTheDocument();
    expect(screen.getByText("Retrieved 12:00 IST from the development fixture")).toBeInTheDocument();
  });

  it("drops the sample tag and names the railway source for live answers", () => {
    render(<SourceNotFound pnr="2345678900" source="live" retrievedAt={AT} />);
    expect(screen.queryByText("Sample data")).toBeNull();
    expect(screen.getByText("Retrieved 12:00 IST from the railway source")).toBeInTheDocument();
  });

  it("wears the Third-party tag and names RailKit for its answers", () => {
    render(<SourceNotFound pnr="5827194603" source="railkit" retrievedAt={AT} />);
    expect(screen.getByText("Third-party")).toHaveAttribute("title", expect.stringMatching(/RailKit/));
    expect(screen.getByText("Retrieved 12:00 IST from RailKit (third-party)")).toBeInTheDocument();
  });

  it("wears the Third-party tag and names RapidAPI for its answers", () => {
    render(<SourceNotFound pnr="4949608635" source="rapidapi" retrievedAt={AT} />);
    expect(screen.getByText("Third-party")).toBeInTheDocument();
    expect(screen.getByText("Retrieved 12:00 IST from RapidAPI · IRCTC (third-party)")).toBeInTheDocument();
  });
});
