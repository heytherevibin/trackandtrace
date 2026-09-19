import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Plate, PlateHeader } from "@/components/ui/plate";

// The sheets draw two title-block shapes: `.tb.stack` (title takes the first row below sm, meta
// and action cells share the row under it) and plain `.tb` (one row at every width). `stack`
// (default true) chooses between them; false is for objects the sheets never stack, like the
// console sign-in plate.

describe("PlateHeader stacking", () => {
  it("stacks the title and meta cell below sm by default, as .tb.stack draws", () => {
    render(<PlateHeader title="Email link" meta={["Form TC-02"]} />);
    expect(screen.getByText("Email link")).toHaveClass("max-sm:basis-full");
    expect(screen.getByText("Form TC-02")).toHaveClass("max-sm:border-t");
  });

  it("keeps one row when stack is false, as plain .tb draws, but keeps the hairline", () => {
    render(<PlateHeader title="Email link" meta={["Form TC-02"]} stack={false} />);
    expect(screen.getByText("Email link")).not.toHaveClass("max-sm:basis-full");
    const metaCell = screen.getByText("Form TC-02");
    expect(metaCell).not.toHaveClass("max-sm:border-t");
    expect(metaCell).toHaveClass("border-l");
  });
});

describe("Plate", () => {
  it("passes stack through to its header instead of leaking it onto the DOM", () => {
    const { container } = render(<Plate stack={false} title="Email link" meta={["Form TC-02"]} />);
    expect(screen.getByText("Email link")).not.toHaveClass("max-sm:basis-full");
    expect(container.querySelector("section")).not.toHaveAttribute("stack");
  });
});
