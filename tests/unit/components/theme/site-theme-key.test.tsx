import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The traveller site's theme key (v4 .mh-theme): two states, a sun by Day and a moon by Night. Until a reader presses
// it the site follows the device; a press picks the other face. (The console keeps its own three-state ThemeToggle.)

const theme = vi.hoisted(() => ({ choice: "system" as "system" | "light" | "dark", resolved: "light" as "light" | "dark", setTheme: vi.fn() }));
vi.mock("@/components/theme/use-theme", () => ({ useTheme: () => ({ theme: theme.choice, resolvedTheme: theme.resolved, setTheme: theme.setTheme }) }));
vi.mock("@/components/theme/night-falls", () => ({ nightFalls: (_el: unknown, run: () => void) => run(), resolvedChoice: (v: string) => v }));

const { SiteThemeKey, SiteThemeRow } = await import("@/components/theme/site-theme-key");

describe("SiteThemeKey", () => {
  beforeEach(() => {
    theme.choice = "system";
    theme.resolved = "light";
    theme.setTheme.mockReset();
  });

  it("names the face it shows and the one it switches to", () => {
    render(<SiteThemeKey />);
    expect(screen.getByRole("button", { name: "Theme: Day. Switch to Night" })).toHaveAttribute("aria-pressed", "false");
  });

  it("switches Day to Night, and Night to Day, never back to System", async () => {
    render(<SiteThemeKey />);
    await userEvent.click(screen.getByRole("button"));
    expect(theme.setTheme).toHaveBeenCalledWith("dark");
    theme.resolved = "dark";
    theme.choice = "dark";
    render(<SiteThemeKey />);
    await userEvent.click(screen.getByRole("button", { name: "Theme: Night. Switch to Day" }));
    expect(theme.setTheme).toHaveBeenLastCalledWith("light");
  });

  it("is a 40px edged key", () => {
    render(<SiteThemeKey />);
    expect(screen.getByRole("button")).toHaveClass("size-10", "border-2", "shadow-control");
  });
});

describe("SiteThemeRow", () => {
  it("is the menu's row: Theme · Day with its switch, pressed by Night", () => {
    theme.resolved = "dark";
    render(<SiteThemeRow />);
    expect(screen.getByRole("button", { name: "Theme · Night" })).toHaveAttribute("aria-pressed", "true");
  });
});
