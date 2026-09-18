import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PnrResultSkeleton } from "@/components/pnr/pnr-result-skeleton";

describe("PnrResultSkeleton", () => {
  it("announces the wait once and keeps the result sheet's plates, with no headings to collide with the record", () => {
    const { container } = render(<PnrResultSkeleton />);
    const group = screen.getByRole("status");
    expect(group).toHaveAttribute("aria-busy", "true");
    expect(within(group).getByText("Requesting railway data")).toHaveClass("sr-only");
    for (const title of ["Current reservation status", "Passengers", "Journey", "How this result was assembled"]) {
      expect(within(group).getByText(title).closest(".blueprint")).not.toBeNull();
    }
    expect(screen.queryAllByRole("heading")).toHaveLength(0);
    expect(container.querySelectorAll(".corner")).toHaveLength(16);
  });
});
