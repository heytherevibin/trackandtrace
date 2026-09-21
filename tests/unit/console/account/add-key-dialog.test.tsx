import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AddKeyOutcome } from "@/console/keys/client";

// vi.mock's factory is hoisted above a plain top-level const, and this one reads addKey directly in
// the object it returns rather than inside a nested closure, so it needs vi.hoisted (same trap as
// tests/unit/console/setup/setup-flow.test.tsx's own addKey/keysUsable mock).
const { addKey } = vi.hoisted(() => ({ addKey: vi.fn() }));
vi.mock("@/console/keys/client", () => ({ addKey }));

import { AddKeyDialog } from "@/console/account/add-key-dialog";

// A realistic controlled harness -- open lives here, exactly as KeysPlate (the real caller) owns
// it -- so "stays open" and "closes" are assertions about AddKeyDialog's own behaviour, not
// something the test fakes by construction (tests/unit/console/components/confirm-its-you.test.tsx's
// own pattern).
function Harness({ onAdded }: { readonly onAdded: () => void }) {
  const [open, setOpen] = useState(true);
  return <AddKeyDialog open={open} onClose={() => setOpen(false)} onAdded={onAdded} />;
}

beforeEach(() => {
  addKey.mockReset();
  addKey.mockResolvedValue({ kind: "done", keyCount: 2, activated: false });
});

describe("AddKeyDialog", () => {
  it("draws the sheet's own title and field label", () => {
    render(<AddKeyDialog open onClose={vi.fn()} onAdded={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Add a key" })).toBeVisible();
    expect(screen.getByLabelText("Name this key")).toBeVisible();
  });

  it("refuses to add a key with no name", async () => {
    render(<AddKeyDialog open onClose={vi.fn()} onAdded={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Add a key" }));
    expect(addKey).not.toHaveBeenCalled();
  });

  it("shows both progress lines, in order, while a ceremony is running, and disables the button", async () => {
    let resolveAdd: ((outcome: AddKeyOutcome) => void) | undefined;
    addKey.mockImplementation(() => new Promise<AddKeyOutcome>((resolve) => (resolveAdd = resolve)));
    render(<AddKeyDialog open onClose={vi.fn()} onAdded={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Name this key"), "YubiKey 5 NFC");
    await userEvent.click(screen.getByRole("button", { name: "Add a key" }));

    const lines = await screen.findAllByRole("status");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveTextContent("1 · Tap one of your keys: waiting…");
    expect(lines[1]).toHaveTextContent("2 · Then touch the new key");
    expect(screen.getByRole("button", { name: "Waiting for your key…" })).toBeDisabled();

    resolveAdd?.({ kind: "done", keyCount: 2, activated: false });
    await screen.findByRole("button", { name: "Add a key" });
  });

  it("calls onAdded with the trimmed name once addKey succeeds", async () => {
    const onAdded = vi.fn();
    render(<AddKeyDialog open onClose={vi.fn()} onAdded={onAdded} />);
    await userEvent.type(screen.getByLabelText("Name this key"), "  YubiKey 5 NFC  ");
    await userEvent.click(screen.getByRole("button", { name: "Add a key" }));
    await vi.waitFor(() => expect(onAdded).toHaveBeenCalledOnce());
    expect(addKey).toHaveBeenCalledExactlyOnceWith("YubiKey 5 NFC");
  });

  it("says nothing new when the member dismisses the prompt themselves, and does not call onAdded", async () => {
    addKey.mockResolvedValue({ kind: "cancelled" });
    const onAdded = vi.fn();
    render(<AddKeyDialog open onClose={vi.fn()} onAdded={onAdded} />);
    await userEvent.type(screen.getByLabelText("Name this key"), "YubiKey 5 NFC");
    await userEvent.click(screen.getByRole("button", { name: "Add a key" }));
    await screen.findByRole("button", { name: "Add a key" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("shows the same-key refusal where the sheet shows it", async () => {
    addKey.mockResolvedValue({ kind: "failed", message: "That key is already added. Use a different one." });
    render(<AddKeyDialog open onClose={vi.fn()} onAdded={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Name this key"), "YubiKey 5C");
    await userEvent.click(screen.getByRole("button", { name: "Add a key" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That key is already added. Use a different one.");
  });

  it("closes on Cancel without ever calling addKey", async () => {
    const onAdded = vi.fn();
    render(<Harness onAdded={onAdded} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(addKey).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
