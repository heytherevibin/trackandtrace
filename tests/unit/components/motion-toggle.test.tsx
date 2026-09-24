import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MotionToggle } from "@/components/shell/motion-toggle";

function deviceReducesMotion(): void {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}

describe("MotionToggle", () => {
  beforeEach(() => {
    document.documentElement.setAttribute("data-motion", "on");
  });

  it("is a switch named Motion, on while the page moves", () => {
    render(<MotionToggle />);
    expect(screen.getByRole("switch", { name: "Motion" })).toBeChecked();
  });

  it("switched off: remembered, and the page is still", async () => {
    render(<MotionToggle />);
    await userEvent.click(screen.getByRole("switch", { name: "Motion" }));
    expect(screen.getByRole("switch", { name: "Motion" })).not.toBeChecked();
    expect(document.documentElement).toHaveAttribute("data-motion", "off");
    expect(window.localStorage.getItem("tt.motion")).toBe("off");
  });

  it("switched back on: the choice is forgotten", async () => {
    render(<MotionToggle />);
    await userEvent.click(screen.getByRole("switch", { name: "Motion" }));
    await userEvent.click(screen.getByRole("switch", { name: "Motion" }));
    expect(screen.getByRole("switch", { name: "Motion" })).toBeChecked();
    expect(window.localStorage.getItem("tt.motion")).toBeNull();
  });

  it("under the device's reduced motion: off, disabled, and it says why", () => {
    deviceReducesMotion();
    document.documentElement.setAttribute("data-motion", "off");
    render(<MotionToggle />);
    const toggle = screen.getByRole("switch", { name: "Motion" });
    expect(toggle).not.toBeChecked();
    expect(toggle).toHaveAttribute("aria-disabled", "true");
    expect(toggle).toHaveAccessibleDescription("Your device asks for reduced motion");
  });

  it("labels itself in the footer bar's legend voice", () => {
    render(<MotionToggle />);
    expect(screen.getByText("Motion")).toHaveClass("font-display", "uppercase", "tracking-caps");
  });
});
