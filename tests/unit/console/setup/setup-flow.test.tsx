import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AddKeyOutcome } from "@/console/keys/client";

// vi.mock's factory is hoisted above a plain top-level const, and this one reads addKey/keysUsable
// directly in the object it returns rather than inside a nested closure, so it needs vi.hoisted
// (same trap as tests/integration/console/setup.test.ts's startConsoleSession mock).
const { addKey, keysUsable } = vi.hoisted(() => ({ addKey: vi.fn(), keysUsable: vi.fn(() => true) }));
vi.mock("@/console/keys/client", () => ({ addKey, keysUsable, tapToSignIn: vi.fn() }));
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));

import { SetupFlow } from "@/app/console/setup/setup-flow";

beforeEach(() => {
  vi.clearAllMocks();
  addKey.mockResolvedValue({ kind: "done", keyCount: 1, activated: false });
  keysUsable.mockReturnValue(true);
});

describe("Setup", () => {
  it("opens on step 1 with the sheet's own words", () => {
    render(<SetupFlow keyCount={0} />);
    expect(screen.getByText("Step 1 of 3")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Add your first key" })).toBeVisible();
    expect(screen.getByText("A security key, or a passkey on this device. You'll add a second next, so losing one never locks you out.")).toBeVisible();
    expect(screen.getByLabelText("Name this key")).toBeVisible();
  });

  it("moves to step 2 once the first key is added", async () => {
    render(<SetupFlow keyCount={0} />);
    await userEvent.type(screen.getByLabelText("Name this key"), "YubiKey 5C");
    await userEvent.click(screen.getByRole("button", { name: "Add key" }));
    expect(await screen.findByRole("heading", { name: "Add a second key" })).toBeVisible();
    expect(screen.getByText("Step 2 of 3")).toBeVisible();
    expect(screen.getByText("Use a different key, or a passkey on another device.")).toBeVisible();
  });

  it("opens on step 2 for a member who already has one key", () => {
    render(<SetupFlow keyCount={1} />);
    expect(screen.getByRole("heading", { name: "Add a second key" })).toBeVisible();
  });

  it("reaches step 3 and offers the console", async () => {
    addKey.mockResolvedValue({ kind: "done", keyCount: 2, activated: true });
    render(<SetupFlow keyCount={1} />);
    await userEvent.type(screen.getByLabelText("Name this key"), "iPhone");
    await userEvent.click(screen.getByRole("button", { name: "Add key" }));
    expect(await screen.findByRole("heading", { name: "You're set up" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Open the console" })).toBeEnabled();
  });

  it("refuses to add a key with no name", async () => {
    render(<SetupFlow keyCount={0} />);
    await userEvent.click(screen.getByRole("button", { name: "Add key" }));
    expect(addKey).not.toHaveBeenCalled();
  });

  it("shows the same-key refusal where the sheet shows it", async () => {
    addKey.mockResolvedValue({ kind: "failed", message: "That key is already added. Use a different one." });
    render(<SetupFlow keyCount={1} />);
    await userEvent.type(screen.getByLabelText("Name this key"), "YubiKey 5C");
    await userEvent.click(screen.getByRole("button", { name: "Add key" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That key is already added. Use a different one.");
  });

  it("says nothing new when the member dismisses the prompt themselves, and does not advance", async () => {
    addKey.mockResolvedValue({ kind: "cancelled" });
    render(<SetupFlow keyCount={0} />);
    await userEvent.type(screen.getByLabelText("Name this key"), "YubiKey 5C");
    await userEvent.click(screen.getByRole("button", { name: "Add key" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("heading", { name: "Add your first key" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add key" })).toBeEnabled();
  });

  it("reads Touch your key… while a ceremony is running, and disables the button", async () => {
    let resolveAdd: ((outcome: AddKeyOutcome) => void) | undefined;
    addKey.mockImplementation(() => new Promise<AddKeyOutcome>((resolve) => (resolveAdd = resolve)));
    render(<SetupFlow keyCount={0} />);
    await userEvent.type(screen.getByLabelText("Name this key"), "YubiKey 5C");
    await userEvent.click(screen.getByRole("button", { name: "Add key" }));
    expect(await screen.findByRole("button", { name: "Touch your key…" })).toBeDisabled();
    resolveAdd?.({ kind: "done", keyCount: 1, activated: false });
    await screen.findByRole("heading", { name: "Add a second key" });
  });

  it("says so when the browser cannot use keys at all, and disables Add key", () => {
    keysUsable.mockReturnValue(false);
    render(<SetupFlow keyCount={0} />);
    expect(screen.getByRole("alert")).toHaveTextContent("This browser can't use security keys. Try a current Chrome, Safari, Edge or Firefox.");
    expect(screen.getByRole("button", { name: "Add key" })).toBeDisabled();
  });

  it("stays off step 3 on keyCount alone -- only activation means key-verified", async () => {
    addKey.mockResolvedValue({ kind: "done", keyCount: 2, activated: false });
    render(<SetupFlow keyCount={1} />);
    await userEvent.type(screen.getByLabelText("Name this key"), "iPhone");
    await userEvent.click(screen.getByRole("button", { name: "Add key" }));
    expect(await screen.findByText("iPhone")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Add a second key" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "You're set up" })).not.toBeInTheDocument();
  });
});
