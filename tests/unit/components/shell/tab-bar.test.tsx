import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The phone tab bar (v4 nav.tabbar, below 640px): Check, Watchlist (with its count), Pre-booking and Menu, fixed to
// the foot of the window; the current tab is yellow. Menu opens the drawer (v4 nav[aria-label=Menu]): the four product
// keys at 48px, then the sign-in key, the Day/Night switch and the disclaimer.

const nav = vi.hoisted(() => ({ pathname: "/watchlist" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/session/session-provider", () => ({ useUser: () => null }));
const count = vi.hoisted(() => ({ value: 3 }));
vi.mock("@/components/shell/use-watch-count", () => ({ useWatchCount: () => count.value }));

const { TabBar } = await import("@/components/shell/tab-bar");

describe("TabBar", () => {
  beforeEach(() => {
    nav.pathname = "/watchlist";
  });

  it("is the Sections navigation, shown below 640px only", () => {
    render(<TabBar />);
    const bar = screen.getByRole("navigation", { name: "Sections" });
    expect(bar).toHaveClass("sm:hidden", "fixed", "bottom-0");
  });

  it("holds Check, Watchlist and Pre-booking, then the Menu button", () => {
    render(<TabBar />);
    const bar = screen.getByRole("navigation", { name: "Sections" });
    expect(within(bar).getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual(["/", "/watchlist", "/pre-booking"]);
    expect(within(bar).getByRole("button", { name: "Menu" })).toBeInTheDocument();
  });

  it("marks the current tab, in yellow", () => {
    render(<TabBar />);
    const current = within(screen.getByRole("navigation", { name: "Sections" })).getByRole("link", { name: "Watchlist" });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current).toHaveClass("bg-accent");
  });

  it("carries the saved count on Watchlist", () => {
    render(<TabBar />);
    expect(within(screen.getByRole("navigation", { name: "Sections" })).getByRole("link", { name: "Watchlist" })).toHaveTextContent("3");
  });

  it("opens the menu drawer with the product keys, sign in, the theme switch and the disclaimer", async () => {
    render(<TabBar />);
    await userEvent.click(screen.getByRole("button", { name: "Menu" }));
    const drawer = await screen.findByRole("dialog", { name: "Menu" });
    const menu = within(drawer).getByRole("navigation", { name: "Menu" });
    expect(within(menu).getAllByRole("link").map((l) => l.textContent)).toEqual(["Check a PNR", "Watchlist3", "Pre-booking", "Accuracy"]);
    expect(within(menu).getByRole("link", { name: "Watchlist" })).toHaveAttribute("aria-current", "page");
    expect(within(drawer).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(within(drawer).getByRole("button", { name: /^Theme · / })).toBeInTheDocument();
    expect(within(drawer).getByText("Not affiliated with IRCTC or Indian Railways.")).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "Close menu" })).toBeInTheDocument();
  });
});
