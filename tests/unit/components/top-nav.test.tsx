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

  it("draws every nav item as its own box, the current one tinted steel", () => {
    nav.pathname = "/pre-booking";
    render(<TopNav />);
    const links = within(screen.getByRole("navigation", { name: "Primary" })).getAllByRole("link");
    expect(links).toHaveLength(4);
    for (const link of links) expect(link).toHaveClass("border", "h-9", "text-label");
    const current = within(screen.getByRole("navigation", { name: "Primary" })).getByRole("link", { name: "Pre-booking" });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current).toHaveClass("border-accent");
  });

  it("marks Watchlist with the eye icon", async () => {
    const { PRIMARY_NAV } = await import("@/components/shell/nav-config");
    const { EyeFilled } = await import("@/components/icons");
    expect(PRIMARY_NAV.find((item) => item.href === "/watchlist")?.Icon).toBe(EyeFilled);
  });

  it("keeps the one theme button in the masthead, the same height and type as the nav boxes", () => {
    nav.pathname = "/watchlist";
    render(<TopNav />);
    const theme = screen.getAllByRole("button", { name: /^Theme:/ });
    expect(theme).toHaveLength(1);
    expect(theme[0]).toHaveClass("h-9", "text-label");
    expect(screen.getByTestId("sign-in")).toHaveClass("h-9", "text-label");
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
