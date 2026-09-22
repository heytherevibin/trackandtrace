import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock's factory is hoisted above a plain top-level const, and this one reads runTap directly
// in the object it returns rather than inside a nested closure, so it needs vi.hoisted (same trap
// as tests/unit/console/setup/setup-flow.test.tsx's addKey/keysUsable mock).
const { runTap } = vi.hoisted(() => ({ runTap: vi.fn() }));
vi.mock("@/console/keys/tap-client", () => ({ runTap }));

import { ConfirmItsYou } from "@/console/components/confirm-its-you";
import { TAP_REASON_MAX, tapReason } from "@/console/keys/tap-schema";

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
function Harness({
  onCancel,
  onConfirmed,
  hint,
  change = CHANGE,
}: {
  readonly onCancel: () => void;
  readonly onConfirmed: () => void;
  readonly hint?: string;
  /**
   * `null` stands for "this caller passes no `change` at all" -- the two Task 6 dialogs, which the
   * sheet draws with no Change row. Spelt as null rather than undefined because a default parameter
   * cannot tell an omitted prop from an explicit undefined one, and the harness needs to.
   */
  readonly change?: { readonly label: string; readonly before: string; readonly after: string } | null;
}) {
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
      change={change ?? undefined}
      hint={hint}
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
    expect(screen.getByPlaceholderText("Why? This goes in the audit log.")).toBeVisible();
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

  // Main.dc.html's own TC-01 (:213-231) has no consequence line -- it carries a bespoke "Message to
  // travellers" field there instead. ConsoleTeam.dc.html's three team actions all draw one, in the
  // same column as the summary and the Change line (:267, :291, :316), and the only way to keep one
  // TC-01 rather than fork it is an optional prop (task-5-addendum.md §1). Optional, not required,
  // because the sheet's own first caller genuinely has none.
  it("draws an optional hint under the change line, and nothing at all without one", () => {
    const { rerender } = render(<Harness onCancel={vi.fn()} onConfirmed={vi.fn()} />);
    expect(screen.queryByText(/signed out everywhere/)).toBeNull();
    rerender(<Harness onCancel={vi.fn()} onConfirmed={vi.fn()} hint="Kiran is signed out everywhere at once." />);
    expect(screen.getByText("Kiran is signed out everywhere at once.")).toBeVisible();
  });

  // ConsoleTeam.dc.html's dlg_reset (:288-300) and dlg_remove (:313-325) draw a bold line and a
  // hint and *no Change row at all*, unlike dlg_role beside them (task-6-addendum.md §1). `change`
  // is optional for the same reason `hint` is: a shared TC-01 that could not draw the sheet's own
  // two-thirds body would have been forked into a second implementation rather than reused. The
  // "Change" legend goes with it -- a label with nothing after it is worse than no row.
  it("omits the change line, and its legend, when the caller has none to draw", () => {
    render(<Harness onCancel={vi.fn()} onConfirmed={vi.fn()} change={null} hint="Kiran is signed out everywhere at once." />);
    expect(screen.getByText(SUMMARY)).toBeVisible();
    expect(screen.getByText("Kiran is signed out everywhere at once.")).toBeVisible();
    expect(screen.queryByText("Change")).toBeNull();
    expect(screen.queryByText(CHANGE_TEXT)).toBeNull();
    expect(screen.queryByText(/→/)).toBeNull();
  });

  it("refuses a reason under 10 characters, without starting a ceremony", async () => {
    render(<Harness onCancel={vi.fn()} onConfirmed={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Reason"), "short");
    await userEvent.click(screen.getByRole("button", { name: "Tap your key" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Add a reason of at least 10 characters.");
    expect(runTap).not.toHaveBeenCalled();
  });

  // The alert above is the *only* one this dialog draws, so it would have been shown for an
  // over-long reason too -- telling a member who wrote 201 characters to write more. The field
  // stops where tapReason stops (TAP_REASON_MAX), which makes that state unreachable by typing,
  // the same fix both key-name fields already carry.
  it("stops the reason field at the same length the schema does", () => {
    render(<Harness onCancel={vi.fn()} onConfirmed={vi.fn()} />);
    expect(screen.getByLabelText("Reason")).toHaveAttribute("maxlength", String(TAP_REASON_MAX));
    expect(TAP_REASON_MAX).toBe(200);
    // And the schema really does refuse one character past it, so the cap is not merely cosmetic.
    expect(tapReason.safeParse("x".repeat(TAP_REASON_MAX)).success).toBe(true);
    expect(tapReason.safeParse("x".repeat(TAP_REASON_MAX + 1)).success).toBe(false);
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

  // fix-2: closing a dialog does not unmount it, so mountedRef alone was never enough -- a member
  // who cancels while runTap's verify round trip is still in flight must not have the action run
  // once that promise resolves. This is the one failure a confirmation gate must never have.
  it("does not confirm the action when Cancel is pressed while a tap is waiting", async () => {
    let resolveTap: ((outcome: { kind: "done" }) => void) | undefined;
    runTap.mockImplementation(() => new Promise((resolve) => (resolveTap = resolve)));
    const onCancel = vi.fn();
    const onConfirmed = vi.fn();
    render(<Harness onCancel={onCancel} onConfirmed={onConfirmed} />);
    await userEvent.type(screen.getByLabelText("Reason"), VALID_REASON);
    await userEvent.click(screen.getByRole("button", { name: "Tap your key" }));
    expect(await screen.findByRole("button", { name: "Waiting for your key…" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();

    // The ceremony/verify round trip was already in flight and settles after Cancel was pressed --
    // exactly the ordinary window the bug lives in, not an exotic race.
    await act(async () => {
      resolveTap?.({ kind: "done" });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onConfirmed).not.toHaveBeenCalled();
  });
});

// The bug this guards was invisible to every other test in this file and to production alike, and
// only turned up when someone drove the dialog in a real browser (task-11-report.md).
//
// mountedRef was cleared to false on cleanup but never set back to true in the mount effect. React
// Strict Mode's development-only double-invoke -- mount, simulate an unmount, mount again, on the
// same fiber with the same refs -- therefore ran that cleanup once before any real interaction, and
// useRef's initial value is not revisited on the second mount. So the ref read false for the rest
// of the instance's life and confirm() discarded every outcome it ever received: the member tapped
// their key, the tap verified, and the dialog sat there.
//
// Every other test here renders without Strict Mode, which is why none of them saw it. This one
// renders with it, so a regression fails in milliseconds instead of surfacing as a four-second
// end-to-end ceremony timing out for no stated reason.
describe("ConfirmItsYou under Strict Mode", () => {
  it("still reports a completed tap after the double-invoke has run its simulated unmount", async () => {
    runTap.mockResolvedValue({ kind: "done" });
    const onConfirmed = vi.fn();
    render(
      <StrictMode>
        <Harness onCancel={vi.fn()} onConfirmed={onConfirmed} />
      </StrictMode>,
    );
    await userEvent.type(screen.getByLabelText("Reason"), VALID_REASON);
    await userEvent.click(screen.getByRole("button", { name: "Tap your key" }));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
  });
});
