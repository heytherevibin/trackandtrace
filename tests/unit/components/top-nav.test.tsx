import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/session/session-provider", () => ({ useUser: () => null }));

const { TopNav } = await import("@/components/shell/top-nav");

describe("TopNav", () => {
  beforeEach(() => {
    nav.pathname = "/";
  });

  it("lists Check a PNR with the product links on the landing, and sets Sign in apart on the right", () => {
    render(<TopNav />);
    const primary = screen.getByRole("navigation", { name: "Primary" });
    for (const name of ["How it works", "The record", "Sources", "Roadmap", "FAQ", "Sign in"]) {
      expect(within(primary).queryByRole("link", { name }), name).toBeNull();
    }
    for (const name of ["Check a PNR", "Watchlist", "Pre-booking", "Accuracy"]) {
      const link = within(primary).getByRole("link", { name });
      expect(link.querySelector("svg"), name).not.toBeNull();
      expect(within(link).getByText(name), name).not.toHaveClass("sr-only");
    }
    const check = within(primary).getByRole("link", { name: "Check a PNR" });
    expect(check).toHaveAttribute("href", "#terminal");
    expect(check).toHaveAttribute("aria-current", "page");
    const signIn = screen.getByTestId("sign-in");
    expect(primary).not.toContainElement(signIn);
    expect(signIn).toHaveClass("uppercase");
  });

  it("keeps the theme cells in the masthead, with icons and labels", () => {
    render(<TopNav />);
    const theme = screen.getByRole("group", { name: "Theme" });
    for (const name of ["Auto", "Day", "Night"]) {
      expect(within(theme).getByRole("button", { name }).querySelector("svg"), name).not.toBeNull();
    }
  });

  it("marks the current app page and sets Sign in in capitals with its icon", () => {
    nav.pathname = "/watchlist";
    render(<TopNav />);
    const primary = screen.getByRole("navigation", { name: "Primary" });
    for (const name of ["Check a PNR", "Watchlist", "Pre-booking", "Accuracy"]) {
      expect(within(primary).getByRole("link", { name }).querySelector("svg"), name).not.toBeNull();
    }
    expect(within(primary).getByRole("link", { name: "Check a PNR" })).toHaveAttribute("href", "/");
    expect(within(primary).getByRole("link", { name: "Watchlist" })).toHaveAttribute("aria-current", "page");
    const signIn = screen.getByTestId("sign-in");
    expect(signIn).toHaveAccessibleName("Sign in");
    expect(signIn).toHaveClass("uppercase");
    expect(signIn.querySelector("svg")).not.toBeNull();
  });

  it("shows only the brand on sign in", () => {
    nav.pathname = "/login";
    render(<TopNav />);
    expect(screen.queryByRole("navigation", { name: "Primary" })).toBeNull();
    expect(screen.queryByTestId("sign-in")).toBeNull();
  });
});
