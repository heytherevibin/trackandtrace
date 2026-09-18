import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ theme: "system" as "system" | "light" | "dark", setTheme: vi.fn() }));
vi.mock("@/components/theme/use-theme", () => ({ useTheme: () => ({ theme: state.theme, resolvedTheme: "light", setTheme: state.setTheme }) }));

const { ThemeToggle } = await import("@/components/theme/theme-toggle");

describe("ThemeToggle", () => {
  beforeEach(() => {
    state.setTheme.mockReset();
  });

  it("is one square icon button: the active mode's icon, its name only for assistive tech and the tooltip", () => {
    state.theme = "system";
    render(<ThemeToggle />);
    const button = screen.getByRole("button", { name: "Theme: System. Switch to Day" });
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(button).toHaveAttribute("title", "Theme: System. Switch to Day");
    expect(button).toHaveClass("size-9");
    // The turning icons are painted inside the box in every engine, whatever it composites.
    expect(button).toHaveClass("overflow-hidden");
    expect(button.textContent).toBe("");
    expect(button.querySelectorAll("svg")).toHaveLength(1);
  });

  it("marks the document as switching for two frames so colours land at once while the press still eases", () => {
    state.theme = "system";
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: /^Theme:/ }));
    expect(document.documentElement).toHaveAttribute("data-theme-switching");
    frames.shift()?.(0);
    expect(document.documentElement).toHaveAttribute("data-theme-switching");
    frames.shift()?.(0);
    expect(document.documentElement).not.toHaveAttribute("data-theme-switching");
  });

  it.each([
    ["system", "light"],
    ["light", "dark"],
    ["dark", "system"],
  ] as const)("cycles %s to %s on a click", (from, to) => {
    state.theme = from;
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: /^Theme:/ }));
    expect(state.setTheme).toHaveBeenCalledWith(to);
  });
});
