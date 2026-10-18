import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The masthead, as Neubrutal v4 draws it (header.mh): the edged mark and TRAKLINE in Archivo Black; the four nav keys
// (.btn, 40px, the current page the yellow primary, Watchlist carrying its saved count); then the 40px sun/moon theme
// key and the 40px sign-in key. Below 640px the nav keys step aside for the phone tab bar (tab-bar.tsx).

const nav = vi.hoisted(() => ({ pathname: "/", user: null as null | { id: string; email: string; name: string | null; avatarUrl: string | null } }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/session/session-provider", () => ({ useUser: () => nav.user }));
const count = vi.hoisted(() => ({ value: 0 }));
vi.mock("@/components/shell/use-watch-count", () => ({ useWatchCount: () => count.value }));

const { TopNav } = await import("@/components/shell/top-nav");

describe("TopNav", () => {
  beforeEach(() => {
    nav.pathname = "/";
    nav.user = null;
    count.value = 0;
  });

  it("draws the brand as the edged mark and TRAKLINE, linking home", () => {
    render(<TopNav />);
    const brand = screen.getByRole("link", { name: "Trakline, home" });
    expect(brand).toHaveAttribute("href", "/");
    expect(within(brand).getByText("Trakline")).toHaveClass("font-display");
  });

  it("lists the four product keys, the landing's Check a PNR jumping to the check plate", () => {
    render(<TopNav />);
    const primary = screen.getByRole("navigation", { name: "Primary" });
    const links = within(primary).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Check a PNR", "Watchlist", "Pre-booking", "Accuracy"]);
    const check = within(primary).getByRole("link", { name: "Check a PNR" });
    expect(check).toHaveAttribute("href", "#terminal");
    expect(check).toHaveAttribute("aria-current", "page");
  });

  it("draws the current page as the yellow primary key and the rest as secondary keys, 40px high", () => {
    nav.pathname = "/pre-booking";
    render(<TopNav />);
    const primary = screen.getByRole("navigation", { name: "Primary" });
    const current = within(primary).getByRole("link", { name: "Pre-booking" });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current).toHaveClass("bg-accent", "min-h-10");
    const other = within(primary).getByRole("link", { name: "Watchlist" });
    expect(other).not.toHaveAttribute("aria-current");
    expect(other).toHaveClass("bg-paper", "min-h-10");
    expect(within(primary).getByRole("link", { name: "Check a PNR" })).toHaveAttribute("href", "/");
  });

  it("hides the nav keys below 640px, where the tab bar takes over", () => {
    render(<TopNav />);
    expect(screen.getByRole("navigation", { name: "Primary" })).toHaveClass("max-sm:hidden");
  });

  it("shows the saved count on Watchlist without changing its name", () => {
    count.value = 2;
    render(<TopNav />);
    const watch = within(screen.getByRole("navigation", { name: "Primary" })).getByRole("link", { name: "Watchlist" });
    expect(watch).toHaveTextContent("Watchlist2");
  });

  it("keeps the theme key and the sign-in key, both 40px, on the right outside the nav", () => {
    render(<TopNav />);
    const theme = screen.getByRole("button", { name: /^Theme:/ });
    const signIn = screen.getByTestId("sign-in");
    expect(signIn).toHaveAccessibleName("Sign in");
    expect(signIn).toHaveAttribute("href", "/login");
    for (const key of [theme, signIn]) {
      expect(key).toHaveClass("size-10");
      expect(screen.getByRole("navigation", { name: "Primary" })).not.toContainElement(key);
    }
  });

  it("is the full masthead on the sign-in page too, as v4 draws it", () => {
    nav.pathname = "/login";
    render(<TopNav />);
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
  });

  it("signed in, shows the initial in the pink key, which opens the account menu", () => {
    nav.user = { id: "u1", email: "asha@example.in", name: null, avatarUrl: null };
    render(<TopNav />);
    const key = screen.getByTestId("account-menu");
    expect(key).toHaveAccessibleName("Account");
    expect(key).toHaveTextContent("A");
    expect(key).toHaveClass("bg-pink", "size-10");
  });
});
