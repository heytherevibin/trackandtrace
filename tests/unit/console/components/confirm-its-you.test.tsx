import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock's factory is hoisted above a plain top-level const, and this one reads runTap directly
// in the object it returns rather than inside a nested closure, so it needs vi.hoisted (same trap
// as tests/unit/console/setup/setup-flow.test.tsx's addKey/keysUsable mock).
const { runTap } = vi.hoisted(() => ({ runTap: vi.fn() }));
vi.mock("@/console/keys/tap-client", () => ({ runTap }));

import { ConfirmItsYou } from "@/console/components/confirm-its-you";

// The digest fields (TapRequest) and the display props are deliberately different strings
// throughout this file, matching fix-1's own example (docs/superpowers/plans/...:821-827): a real
// caller's `action`/`target`/`value` bind the tap ("Removed a key" / "YubiKey 5 NFC" / "2"), while
// `summary`/`change` are what the sheet draws ("Remove YubiKey 5 NFC" / "Keys: 3 → 2"). If a test
// only ever used matching values, a bug that derived the display text from the digest fields (or
// vice versa) could pass unnoticed.
const ACTION = "Removed a key";
const TARGET = "YubiKey 5 NFC";
const VALUE = "2";
const SUMMARY = "Remove YubiKey 5 NFC";
const CHANGE = { label: "Keys", before: "3", after: "2" };
const CHANGE_TEXT = `${CHANGE.label}: ${CHANGE.before} → ${CHANGE.after}`;
const VALID_REASON = "Left at the old office; replaced.";

// A realistic controlled harness: reason and open both live here, exactly as a real caller would
// own them, so "leaves the dialog open" and "starts nothing" are assertions about ConfirmItsYou's
// own behaviour rather than something the test fakes by construction.
function Harness({ onCancel, onConfirmed }: { readonly onCancel: () => void; readonly onConfirmed: () => void }) {
  const [open, setOpen] = useState(true);
  const [reason, setReason] = useState("");
  return (
    <ConfirmItsYou
      open={open}
      action={ACTION}
      target={TARGET}
      value={VALUE}
      reason={reason}
      summary={SUMMARY}
      change={CHANGE}
      onReasonChange={setReason}
      onCancel={() => {
        setOpen(false);
        onCancel();
      }}
      onConfirmed={() => {
        setOpen(false);
        onConfirmed();
      }}
    />
  );
}

beforeEach(() => {
  runTap.mockReset();
});

describe("ConfirmItsYou", () => {
  it("shows the display summary and change line, never the digest fields", () => {
    render(<Harness onCancel={vi.fn()} onConfirmed={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Confirm it's you" })).toBeVisible();
    expect(screen.getByText("Form TC-01")).toBeVisible();
    expect(screen.getByText(SUMMARY)).toBeVisible();
    expect(screen.getByText("Change")).toBeVisible();
    expect(screen.getByText(CHANGE_TEXT)).toBeVisible();
    // ACTION ("Removed a key") never appears as its own text node -- only SUMMARY does.
    expect(screen.queryByText(ACTION)).toBeNull();
  });

  it("renders the display props and still taps with the digest fields, even though they do not match", async () => {
    runTap.mockResolvedValue({ kind: "done" });
    const onConfirmed = vi.fn();
    render(<Harness onCancel={vi.fn()} onConfirmed={onConfirmed} />);
    expect(screen.getByText(SUMMARY)).toBeVisible();
    expect(screen.getByText(CHANGE_TEXT)).toBeVisible();
    await userEvent.type(screen.getByLabelText("Reason"), VALID_REASON);
    await userEvent.click(screen.getByRole("button", { name: "Tap your key" }));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
    expect(runTap).toHaveBeenCalledWith({ action: ACTION, target: TARGET, value: VALUE, reason: VALID_REASON });
  });

  it("refuses a reason under 10 characters, without starting a ceremony", async () => {
    render(<Harness onCancel={vi.fn()} onConfirmed={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Reason"), "short");
    await userEvent.click(screen.getByRole("button", { name: "Tap your key" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Add a reason of at least 10 characters.");
    expect(runTap).not.toHaveBeenCalled();
  });

  it("calls onConfirmed exactly once when the tap succeeds", async () => {
    runTap.mockResolvedValue({ kind: "done" });
    const onConfirmed = vi.fn();
    render(<Harness onCancel={vi.fn()} onConfirmed={onConfirmed} />);
    await userEvent.type(screen.getByLabelText("Reason"), VALID_REASON);
    await userEvent.click(screen.getByRole("button", { name: "Tap your key" }));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
    expect(runTap).toHaveBeenCalledOnce();
  });

  it("shows the console's own didn't-answer line on a failed tap, and leaves the dialog open", async () => {
    runTap.mockResolvedValue({ kind: "failed", message: "That key didn't answer. Try again." });
    const onCancel = vi.fn();
    const onConfirmed = vi.fn();
    render(<Harness onCancel={onCancel} onConfirmed={onConfirmed} />);
    await userEvent.type(screen.getByLabelText("Reason"), VALID_REASON);
    await userEvent.click(screen.getByRole("button", { name: "Tap your key" }));
    expect(await screen.findByRole("status")).toHaveTextContent("That key didn't answer. Try again.");
    expect(screen.getByRole("heading", { name: "Confirm it's you" })).toBeVisible();
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("shows the not-yours line the same way, without treating it specially", async () => {
    runTap.mockResolvedValue({ kind: "failed", message: "This key isn't one of yours." });
    render(<Harness onCancel={vi.fn()} onConfirmed={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Reason"), VALID_REASON);
    await userEvent.click(screen.getByRole("button", { name: "Tap your key" }));
    expect(await screen.findByRole("status")).toHaveTextContent("This key isn't one of yours.");
  });

  it("Cancel calls onCancel and starts nothing", async () => {
    const onCancel = vi.fn();
    const onConfirmed = vi.fn();
    render(<Harness onCancel={onCancel} onConfirmed={onConfirmed} />);
    await userEvent.type(screen.getByLabelText("Reason"), VALID_REASON);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(runTap).not.toHaveBeenCalled();
  });

  it("says nothing new when the member dismisses the prompt, and leaves the dialog open", async () => {
    runTap.mockResolvedValue({ kind: "cancelled" });
    const onCancel = vi.fn();
    const onConfirmed = vi.fn();
    render(<Harness onCancel={onCancel} onConfirmed={onConfirmed} />);
    await userEvent.type(screen.getByLabelText("Reason"), VALID_REASON);
    await userEvent.click(screen.getByRole("button", { name: "Tap your key" }));
    await waitFor(() => expect(runTap).toHaveBeenCalledOnce());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Tap your key" })).toBeEnabled();
  });

  it("reads Waiting for your key… while a tap is running, and disables the button", async () => {
    let resolveTap: ((outcome: { kind: "done" }) => void) | undefined;
    runTap.mockImplementation(() => new Promise((resolve) => (resolveTap = resolve)));
    render(<Harness onCancel={vi.fn()} onConfirmed={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Reason"), VALID_REASON);
    await userEvent.click(screen.getByRole("button", { name: "Tap your key" }));
    expect(await screen.findByRole("button", { name: "Waiting for your key…" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Touch your security key or approve on your device");
    resolveTap?.({ kind: "done" });
  });
});
