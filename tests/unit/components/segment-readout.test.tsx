import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SegmentReadout } from "@/components/ui/segment-readout";

describe("SegmentReadout", () => {
  it("carries its accessible name and renders one slot per character", () => {
    const { container } = render(<SegmentReadout value="1 8" label="PNR readout showing 18" />);
    expect(screen.getByRole("img", { name: "PNR readout showing 18" })).toBeInTheDocument();
    expect(container.querySelectorAll("[data-char]")).toHaveLength(3);
  });
  it("renders dashes as dim placeholder slots", () => {
    const { container } = render(<SegmentReadout value="- - -" label="PNR readout, empty" />);
    expect(container.querySelectorAll('[data-char="-"]')).toHaveLength(3);
    expect(container.querySelector('[data-char="-"]')?.textContent).toBe("·");
  });
});
