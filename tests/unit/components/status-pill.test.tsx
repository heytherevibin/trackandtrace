import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusPill } from "@/components/ui/status-pill";

describe("StatusPill", () => {
  it("renders text for every status alongside the lamp", () => {
    render(
      <>
        <StatusPill status="CNF" />
        <StatusPill status="RAC" position={12} />
        <StatusPill status="WL" position={34} />
        <StatusPill status="CANCELLED" />
        <StatusPill status="NOT_FOUND" />
      </>,
    );
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
    expect(screen.getByText("RAC 12")).toBeInTheDocument();
    expect(screen.getByText("WL 34")).toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByText("Not found")).toBeInTheDocument();
  });
  it("announces when live", () => {
    render(<StatusPill status="CNF" live />);
    expect(screen.getByRole("status")).toHaveTextContent("Confirmed");
  });
  it("carries a plain-language description for assistive tech", () => {
    render(<StatusPill status="WL" position={3} />);
    expect(screen.getByText(/waitlisted/i)).toHaveClass("sr-only");
  });
});
