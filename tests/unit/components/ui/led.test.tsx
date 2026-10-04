import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Lamp } from "@/components/ui/led";

// industry.css draws five lamps: hollow, lit, light (busy), half and ringed. The first three were
// here already; Sending is half and Stopped is ringed (ConsoleAnnouncements.dc.html, the List board).
describe("Lamp", () => {
  it("draws a half lamp as a hollow ring with its left half filled", () => {
    const { container } = render(<Lamp variant="half" />);
    const lamp = container.firstElementChild as HTMLElement;
    expect(lamp.className).toContain("after:w-1/2");
    expect(lamp.className).toContain("after:bg-accent");
    expect(lamp.className).toContain("bg-transparent");
  });

  it("draws a ringed lamp with the alert ink's heavier ring", () => {
    const { container } = render(<Lamp variant="ringed" />);
    const lamp = container.firstElementChild as HTMLElement;
    expect(lamp.className).toContain("border-2");
    expect(lamp.className).toContain("border-ink-alert");
  });

  it("stays decorative unless it is given a label", () => {
    const { container } = render(<Lamp variant="half" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
