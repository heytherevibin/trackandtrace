import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/services/auth-client", () => ({ signOutEverywhere: vi.fn(async () => undefined) }));

const { AccountView } = await import("@/app/account/account-view");
const auth = await import("@/services/auth-client");

const USER = { id: "u1", email: "asha@example.com", name: "Asha Rao", avatarUrl: null } as const;

describe("AccountView", () => {
  it("signed out: says there is nothing to sync and offers both ways on", () => {
    render(<AccountView user={null} savedCount={0} />);
    expect(screen.getByRole("heading", { level: 1, name: "Account" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Nothing to sync yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Open the device watchlist" })).toHaveAttribute("href", "/watchlist");
  });

  it("signed in: draws the profile, watchlist, preferences, and data plates", () => {
    render(<AccountView user={USER} savedCount={3} />);
    for (const name of ["Profile", "Watchlist", "Preferences", "Your data"]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
    }
    expect(screen.getByText("Asha Rao", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("asha@example.com")).toBeInTheDocument();
    expect(screen.getByText("3 PNRs saved to this account")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open watchlist" })).toHaveAttribute("href", "/watchlist");
    expect(screen.getByRole("group", { name: "Theme" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export JSON" })).toBeInTheDocument();
  });

  it("signs out everywhere", () => {
    render(<AccountView user={USER} savedCount={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(auth.signOutEverywhere).toHaveBeenCalled();
  });

  it("asks for an acknowledged confirmation before deleting the account", async () => {
    render(<AccountView user={USER} savedCount={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    expect(await screen.findByRole("alertdialog", { name: "Delete this account?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete my account" })).toBeDisabled();
  });
});
