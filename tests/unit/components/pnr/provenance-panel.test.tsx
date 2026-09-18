import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProvenancePanel } from "@/components/pnr/provenance-panel";

describe("ProvenancePanel", () => {
  it("draws the lifecycle with all four stops done and their details", () => {
    render(<ProvenancePanel pnr="2345678901" source="fixture" checkedAt="2026-09-17T06:30:00.000Z" latencyMs={12} />);
    const region = screen.getByRole("region", { name: "How this result was assembled" });
    const steps = within(region).getAllByRole("listitem");
    expect(steps.map((li) => li.getAttribute("data-state"))).toEqual(["done", "done", "done", "done"]);
    expect(steps.map((li) => li.textContent)).toEqual([
      "Input receivedPNR 234 567 8901",
      "Request validatedTen digits",
      "Source answeredDevelopment fixture · 12 ms",
      "Result presentedRetrieved 12:00 IST",
    ]);
  });

  it("names the live source and closes on the data-policy note", () => {
    render(<ProvenancePanel pnr="2345678901" source="live" checkedAt="2026-09-17T06:30:00.000Z" latencyMs={240} />);
    expect(screen.getByText("Railway source · 240 ms")).toBeInTheDocument();
    expect(screen.getByText("Only fields returned by the source are shown. Prediction fields are never displayed.")).toBeInTheDocument();
  });
});
