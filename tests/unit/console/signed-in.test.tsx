import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

import { SignedIn } from "@/app/console/signed-in";

describe("the signed-in seat", () => {
  it("says who is signed in, and offers the way out", () => {
    render(<SignedIn name="Asha Rao" role="owner" />);
    expect(screen.getByText("Asha Rao")).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
  });
});
