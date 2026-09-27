import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BerthPlan } from "@/components/landing/journey/berth-plan";

const SEATS = { cls: "3A", coach: "B1", berth: "12 LB", status: "CNF", waiting: [{ index: 2, label: "RAC 4" }, { index: 3, label: "WL 9" }] } as const;

describe("BerthPlan", () => {
  it("names the coach, marks itself sample data, and says in words which berth is lit", () => {
    render(<BerthPlan seats={SEATS} />);
    expect(screen.getByText("Coach B1 · 3A · plan")).toBeInTheDocument();
    expect(screen.getByText("Sample data")).toBeInTheDocument();
    expect(screen.getByRole("figure")).toHaveTextContent("Passenger 1 · CNF · berth B1 · 12 LB, lit. Passengers 2 and 3 (RAC 4, WL 9) have no berth allotted yet.");
  });

  it("lights one berth stack and tags it with the berth", () => {
    const { container } = render(<BerthPlan seats={SEATS} />);
    expect(container.querySelectorAll(".plan-berth.is-lit")).toHaveLength(1);
    expect(container.querySelector(".plan-tag.is-lit")).toHaveTextContent("12 LB");
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("draws nothing when the specimen has no berth to show", () => {
    const { container } = render(<BerthPlan seats={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
