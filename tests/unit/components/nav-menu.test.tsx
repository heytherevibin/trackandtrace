import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const { NavMenu } = await import("@/components/shell/nav-menu");

describe("NavMenu", () => {
  it("is one square hamburger button that opens the menu sheet", async () => {
    render(<NavMenu pathname="/watchlist" />);
    const trigger = screen.getByRole("button", { name: "Open menu" });
    expect(trigger).toHaveClass("size-9");
    expect(trigger.querySelector("svg")).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(trigger);
    const sheet = await screen.findByRole("dialog", { name: "Menu" });
    const nav = within(sheet).getByRole("navigation", { name: "Menu" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Check a PNR", "Watchlist", "Pre-booking", "Accuracy"]);
    for (const link of links) expect(link.querySelector("svg"), link.textContent ?? "").not.toBeNull();
    const current = within(nav).getByRole("link", { name: "Watchlist" });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current).toHaveClass("border-accent");
    expect(within(nav).getByRole("link", { name: "Check a PNR" })).toHaveAttribute("href", "/");
    expect(within(sheet).getByRole("button", { name: "Close menu" })).toBeInTheDocument();
  });

  it("closes when a page is chosen", async () => {
    render(<NavMenu pathname="/watchlist" />);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const sheet = await screen.findByRole("dialog", { name: "Menu" });
    fireEvent.click(within(sheet).getByRole("link", { name: "Accuracy" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("on the landing, Check a PNR is current and points at the check plate", async () => {
    render(<NavMenu pathname="/" />);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const sheet = await screen.findByRole("dialog", { name: "Menu" });
    const check = within(sheet).getByRole("link", { name: "Check a PNR" });
    expect(check).toHaveAttribute("href", "#terminal");
    expect(check).toHaveAttribute("aria-current", "page");
  });
});
