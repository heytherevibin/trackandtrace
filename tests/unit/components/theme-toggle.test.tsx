import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ theme: "system" as "system" | "light" | "dark", setTheme: vi.fn() }));
vi.mock("@/components/theme/use-theme", () => ({ useTheme: () => ({ theme: state.theme, resolvedTheme: "light", setTheme: state.setTheme }) }));

const { ThemeToggle } = await import("@/components/theme/theme-toggle");

describe("ThemeToggle", () => {
  beforeEach(() => {
    state.setTheme.mockReset();
  });

  it("is one button that shows only the active mode, with its icon", () => {
    state.theme = "system";
    render(<ThemeToggle />);
    const button = screen.getByRole("button", { name: "Theme: System. Switch to Day" });
    expect(screen.getAllByRole("button")).toHaveLength(1);
    const visible = (text: string) => screen.queryAllByText(text).filter((el) => !el.classList.contains("invisible"));
    expect(visible("System")).toHaveLength(1);
    expect(visible("Day")).toHaveLength(0);
    expect(visible("Night")).toHaveLength(0);
    expect(button.querySelector("svg")).not.toBeNull();
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
