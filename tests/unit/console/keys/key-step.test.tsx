import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Same hoisting trap as client.test.ts: vi.mock's factory runs before a plain top-level const would
// be initialized, so the mocks it closes over come from vi.hoisted instead.
const { tapToSignIn, keysUsable } = vi.hoisted(() => ({
  tapToSignIn: vi.fn(),
  keysUsable: vi.fn(() => true),
}));
vi.mock("@/console/keys/client", () => ({ tapToSignIn, keysUsable, addKey: vi.fn() }));

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));

import { KeyStep } from "@/app/console/keys/key-step";

beforeEach(() => {
  tapToSignIn.mockReset().mockResolvedValue({ kind: "done" });
  replace.mockReset();
  keysUsable.mockReturnValue(true);
});

describe("the key step", () => {
  it("asks for the tap in the sheet's words", () => {
    render(<KeyStep />);
    expect(screen.getByRole("button", { name: "Tap your key" })).toBeEnabled();
    expect(screen.getByText("Touch your security key or approve on your device")).toBeVisible();
  });

  it("moves to the console once the tap verifies", async () => {
    render(<KeyStep />);
    await userEvent.click(screen.getByRole("button", { name: "Tap your key" }));
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("shows the failure and lets the member try again", async () => {
    tapToSignIn.mockResolvedValue({ kind: "failed", message: "That key didn't answer. Try again." });
    render(<KeyStep />);
    await userEvent.click(screen.getByRole("button", { name: "Tap your key" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That key didn't answer. Try again.");
    expect(screen.getByRole("button", { name: "Tap your key" })).toBeEnabled();
  });

  it("says nothing new when the member dismisses the prompt themselves", async () => {
    tapToSignIn.mockResolvedValue({ kind: "cancelled" });
    render(<KeyStep />);
    await userEvent.click(screen.getByRole("button", { name: "Tap your key" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says so when the browser cannot use keys at all", () => {
    keysUsable.mockReturnValue(false);
    render(<KeyStep />);
    expect(screen.getByRole("alert")).toHaveTextContent("This browser can't use security keys. Try a current Chrome, Safari, Edge or Firefox.");
    expect(screen.getByRole("button", { name: "Tap your key" })).toBeDisabled();
  });
});
