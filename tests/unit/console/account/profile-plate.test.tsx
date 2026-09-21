import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProfilePlate } from "@/console/account/profile-plate";
import type { MyKeysProfile } from "@/console/account/my-keys";

// Split out from KeysPlate (task-6-addendum.md §2): its own small, testable component rather than
// logic folded into the page itself, which reads next/headers and so cannot be rendered here (the
// same reason console-frame.tsx and unavailable.tsx carry no component test of their own).
const OWNER: MyKeysProfile = { name: "Asha Rao", email: "asha@trakline.in", role: "owner", createdAt: "2026-09-02T09:00:00Z" };
const SUPPORT: MyKeysProfile = { name: "Devi Menon", email: "devi@trakline.in", role: "support", createdAt: "2026-09-10T09:00:00Z" };

describe("ProfilePlate", () => {
  it("shows the member's name, email, role and join date", () => {
    render(<ProfilePlate member={OWNER} />);
    expect(screen.getByRole("heading", { name: "Profile" })).toBeInTheDocument();
    expect(screen.getByText("Asha Rao")).toBeInTheDocument();
    expect(screen.getByText("asha@trakline.in")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("02 Sept 2026")).toBeInTheDocument();
  });

  it("shows the lost-keys note to an Owner, word for word", () => {
    render(<ProfilePlate member={OWNER} />);
    expect(screen.getByRole("heading", { name: "If you lose your keys" })).toBeInTheDocument();
    expect(
      screen.getByText("Another Owner can reset them. If you're the only Owner, they're reset in the Supabase dashboard, so keep your keys in different places."),
    ).toBeInTheDocument();
  });

  it("hides the lost-keys note from anyone but an Owner", () => {
    render(<ProfilePlate member={SUPPORT} />);
    expect(screen.queryByRole("heading", { name: "If you lose your keys" })).not.toBeInTheDocument();
    expect(screen.getByText("Support")).toBeInTheDocument();
  });
});
