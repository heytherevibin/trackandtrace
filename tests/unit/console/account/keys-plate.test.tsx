import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MyKeysRow } from "@/console/account/my-keys";

// KeysPlate now orchestrates three dialogs and a re-fetch; its own test stays about orchestration
// (which button opens which dialog, and that a success re-renders the table), not the ceremony or
// network logic underneath -- that is each dialog's own file
// (tests/unit/console/account/add-key-dialog.test.tsx, .../rename-key-dialog.test.tsx) and
// fetchMyKeys'/removeKey's own (tests/unit/console/account/my-keys-client.test.ts). The mocked Add
// and Rename dialogs below expose just enough of their real props (open, keyRow, onAdded/onRenamed)
// to drive that.
//
// ConfirmItsYou is deliberately NOT mocked here: this plate is its first real caller (task-8), so
// the wiring under test is specifically KeysPlate -> the real ConfirmItsYou -> a mocked runTap ->
// a mocked removeKey, the same layering confirm-its-you.test.tsx itself uses one level down.
const { fetchMyKeys, removeKey } = vi.hoisted(() => ({ fetchMyKeys: vi.fn(), removeKey: vi.fn() }));
const { runTap } = vi.hoisted(() => ({ runTap: vi.fn() }));
// task-9-addendum.md §1: the removal toast was the previous task's gap ("nothing in the console
// mounts a toaster yet"); this task mounts ToastHost and wires this one line. Mocked here the same
// way tests/unit/console/account/sessions-plate.test.tsx mocks it, so this test asserts the exact
// string reaches notify.success without depending on sonner's own internals.
const { notifySuccess } = vi.hoisted(() => ({ notifySuccess: vi.fn() }));
vi.mock("@/console/account/my-keys-client", () => ({ fetchMyKeys, removeKey }));
vi.mock("@/console/keys/tap-client", () => ({ runTap }));
vi.mock("@/components/ui/toast", () => ({ notify: { success: notifySuccess, error: vi.fn() } }));
vi.mock("@/console/account/add-key-dialog", () => ({
  AddKeyDialog: ({ open, onAdded }: { readonly open: boolean; readonly onAdded: () => void }) =>
    open ? (
      <button type="button" onClick={onAdded}>
        mock add succeeded
      </button>
    ) : null,
}));
vi.mock("@/console/account/rename-key-dialog", () => ({
  RenameKeyDialog: ({ open, keyRow, onRenamed }: { readonly open: boolean; readonly keyRow: MyKeysRow | null; readonly onRenamed: () => void }) =>
    open ? (
      <button type="button" onClick={onRenamed}>{`mock rename succeeded for ${keyRow?.name ?? ""}`}</button>
    ) : null,
}));

import { KeysPlate } from "@/console/account/keys-plate";

const KEYS: readonly MyKeysRow[] = [
  { id: "aaaaaaaa-0000-0000-0000-000000000001", name: "YubiKey 5C", type: "security_key", createdAt: "2026-09-02T10:00:00Z", lastUsedAt: "2026-09-19T08:32:00Z" },
  { id: "aaaaaaaa-0000-0000-0000-000000000003", name: "MacBook Pro", type: "passkey", createdAt: "2026-09-05T10:00:00Z", lastUsedAt: null },
];

// A third key: Remove is refused below two keys (spec §D), so most Remove-flow tests need enough
// keys that removing one is even allowed.
const THREE_KEYS: readonly MyKeysRow[] = [
  ...KEYS,
  { id: "aaaaaaaa-0000-0000-0000-000000000005", name: "YubiKey 5 NFC", type: "security_key", createdAt: "2026-09-11T10:00:00Z", lastUsedAt: null },
];

const VALID_REASON = "Left at the old office; replaced.";

beforeEach(() => {
  fetchMyKeys.mockReset();
  removeKey.mockReset();
  runTap.mockReset();
  notifySuccess.mockReset();
});

describe("KeysPlate", () => {
  it("titles the plate Keys and counts the keys", () => {
    render(<KeysPlate keys={KEYS} />);
    expect(screen.getByRole("heading", { name: "Keys" })).toBeInTheDocument();
    expect(screen.getByText("2 keys")).toBeInTheDocument();
  });

  it("pluralises a single key correctly", () => {
    render(<KeysPlate keys={[KEYS[0]!]} />);
    expect(screen.getByText("1 key")).toBeInTheDocument();
  });

  it("draws every column heading, including the visually-hidden Actions one", () => {
    render(<KeysPlate keys={KEYS} />);
    for (const name of ["Name", "Type", "Added", "Last used", "Actions"]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    }
  });

  it("lists each key's name and type label", () => {
    render(<KeysPlate keys={KEYS} />);
    expect(screen.getByText("YubiKey 5C")).toBeInTheDocument();
    expect(screen.getByText("Security key")).toBeInTheDocument();
    expect(screen.getByText("MacBook Pro")).toBeInTheDocument();
    expect(screen.getByText("Passkey")).toBeInTheDocument();
  });

  it("formats Added and Last used through the shared date formatter", () => {
    render(<KeysPlate keys={KEYS} />);
    // formatDate's medium style: day, short month, year (utils/datetime.ts) -- IST throughout.
    expect(screen.getByText("02 Sept 2026")).toBeInTheDocument();
    expect(screen.getByText("19 Sept 2026")).toBeInTheDocument();
  });

  it("reads a key that has never been used as Never, not a formatting crash", () => {
    render(<KeysPlate keys={KEYS} />);
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  it("carries the two legends and the two-key line", () => {
    render(<KeysPlate keys={KEYS} />);
    expect(screen.getByText("Only keys added here or during setup work for the console.")).toBeInTheDocument();
    expect(screen.getByText("Adding a key starts with a tap of a key you already have.")).toBeInTheDocument();
    expect(screen.getByText("You need at least two keys. Add another before removing one.")).toBeInTheDocument();
  });

  it("draws Add a key, a Rename and a Remove per row", () => {
    render(<KeysPlate keys={KEYS} />);
    expect(screen.getByRole("button", { name: "Add a key" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Rename" })).toHaveLength(KEYS.length);
    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(KEYS.length);
  });

  it("disables every Remove button at the two-key floor", () => {
    render(<KeysPlate keys={KEYS} />);
    for (const button of screen.getAllByRole("button", { name: "Remove" })) expect(button).toBeDisabled();
  });

  it("enables Remove once a third key exists", () => {
    render(<KeysPlate keys={THREE_KEYS} />);
    for (const button of screen.getAllByRole("button", { name: "Remove" })) expect(button).toBeEnabled();
  });

  it("opens the Add dialog from the Add a key button", async () => {
    render(<KeysPlate keys={KEYS} />);
    expect(screen.queryByText("mock add succeeded")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add a key" }));
    expect(screen.getByText("mock add succeeded")).toBeInTheDocument();
  });

  it("opens the Rename dialog for the row whose button was clicked, not just any row", async () => {
    render(<KeysPlate keys={KEYS} />);
    const renameButtons = screen.getAllByRole("button", { name: "Rename" });
    await userEvent.click(renameButtons[1]!);
    expect(screen.getByText("mock rename succeeded for MacBook Pro")).toBeInTheDocument();
  });

  it("re-fetches and shows the new name once a rename lands", async () => {
    fetchMyKeys.mockResolvedValue({
      keys: [KEYS[0], { ...KEYS[1], name: "MacBook Air" }],
      member: { name: "Asha Rao", email: "asha@trakline.in", role: "owner", createdAt: "2026-09-02T09:00:00Z" },
    });
    render(<KeysPlate keys={KEYS} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Rename" })[1]!);
    await userEvent.click(screen.getByText("mock rename succeeded for MacBook Pro"));
    expect(await screen.findByText("MacBook Air")).toBeInTheDocument();
    expect(screen.queryByText("MacBook Pro")).not.toBeInTheDocument();
  });

  // The write landed and the re-read did not. Showing the old name with nothing said is the worst
  // outcome available: the member has no way to tell a failed rename from a stale table.
  it("says so when a rename lands but the re-read fails, rather than showing the old name in silence", async () => {
    fetchMyKeys.mockResolvedValue(null);
    render(<KeysPlate keys={KEYS} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Rename" })[1]!);
    await userEvent.click(screen.getByText("mock rename succeeded for MacBook Pro"));
    expect(await screen.findByRole("alert")).toHaveTextContent("The console could not be reached. Try again.");
  });

  it("re-fetches and shows the new key once an add lands, and closes the dialog", async () => {
    const added: MyKeysRow = { id: "aaaaaaaa-0000-0000-0000-000000000009", name: "iPhone", type: "passkey", createdAt: "2026-09-20T10:00:00Z", lastUsedAt: null };
    fetchMyKeys.mockResolvedValue({
      keys: [...KEYS, added],
      member: { name: "Asha Rao", email: "asha@trakline.in", role: "owner", createdAt: "2026-09-02T09:00:00Z" },
    });
    render(<KeysPlate keys={KEYS} />);
    await userEvent.click(screen.getByRole("button", { name: "Add a key" }));
    await userEvent.click(screen.getByText("mock add succeeded"));
    expect(await screen.findByText("iPhone")).toBeInTheDocument();
    expect(screen.queryByText("mock add succeeded")).not.toBeInTheDocument();
  });

  // KeysPlate is ConfirmItsYou's first real caller (task-8): these exercise the whole chain --
  // Remove -> the real ConfirmItsYou -> a mocked runTap -> a mocked removeKey -- the same order
  // spec §D fixes (Main.dc.html, task-8-brief.md).
  describe("Remove", () => {
    it("opens Confirm it's you with the drawn summary and change line", async () => {
      render(<KeysPlate keys={THREE_KEYS} />);
      const removeButtons = screen.getAllByRole("button", { name: "Remove" });
      await userEvent.click(removeButtons[2]!); // YubiKey 5 NFC
      expect(screen.getByRole("heading", { name: "Confirm it's you" })).toBeVisible();
      expect(screen.getByText("Remove YubiKey 5 NFC")).toBeVisible();
      expect(screen.getByText("Keys: 3 → 2")).toBeVisible();
    });

    it("refuses a reason under 10 characters without starting a ceremony", async () => {
      render(<KeysPlate keys={THREE_KEYS} />);
      await userEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]!);
      await userEvent.type(screen.getByLabelText("Reason"), "short");
      await userEvent.click(screen.getByRole("button", { name: "Tap your key" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Add a reason of at least 10 characters.");
      expect(runTap).not.toHaveBeenCalled();
      expect(removeKey).not.toHaveBeenCalled();
    });

    it("a completed tap calls DELETE with the key and the typed reason, and the table reflects the removal", async () => {
      runTap.mockResolvedValue({ kind: "done" });
      removeKey.mockResolvedValue({ kind: "done" });
      fetchMyKeys.mockResolvedValue({
        keys: KEYS,
        member: { name: "Asha Rao", email: "asha@trakline.in", role: "owner", createdAt: "2026-09-02T09:00:00Z" },
      });
      render(<KeysPlate keys={THREE_KEYS} />);
      await userEvent.click(screen.getAllByRole("button", { name: "Remove" })[2]!); // YubiKey 5 NFC
      await userEvent.type(screen.getByLabelText("Reason"), VALID_REASON);
      await userEvent.click(screen.getByRole("button", { name: "Tap your key" }));
      await waitFor(() => expect(removeKey).toHaveBeenCalledExactlyOnceWith("aaaaaaaa-0000-0000-0000-000000000005", VALID_REASON));
      // The tap's `target` is the key's id, not its name. console.keys has no uniqueness on
      // (member_id, name), so a tap over "YubiKey 5 NFC" approved any key that happened to be
      // called that -- and the digest is what console_remove_key re-computes, from `p_key::text`
      // (supabase/migrations/20260921100300_console_remove_key_binds_id.sql). `value` is the count
      // after this removal, the client's half of the agreement proved for real in
      // tests/e2e/console-auth/my-keys.spec.ts.
      expect(runTap).toHaveBeenCalledExactlyOnceWith({
        action: "Removed a key",
        target: "aaaaaaaa-0000-0000-0000-000000000005",
        value: "2",
        reason: VALID_REASON,
      });
      expect(await screen.findByText("2 keys")).toBeInTheDocument();
      expect(screen.queryByText("YubiKey 5 NFC")).not.toBeInTheDocument();
      // ConsoleMyKeys.dc.html's own state script: st === 'Removed' -> 'Key removed · logged'.
      expect(notifySuccess).toHaveBeenCalledExactlyOnceWith("Key removed · logged");
    });

    it("a cancelled tap sends no DELETE and leaves the key in the table", async () => {
      runTap.mockResolvedValue({ kind: "cancelled" });
      render(<KeysPlate keys={THREE_KEYS} />);
      await userEvent.click(screen.getAllByRole("button", { name: "Remove" })[2]!);
      await userEvent.type(screen.getByLabelText("Reason"), VALID_REASON);
      await userEvent.click(screen.getByRole("button", { name: "Tap your key" }));
      await waitFor(() => expect(runTap).toHaveBeenCalledOnce());
      expect(removeKey).not.toHaveBeenCalled();
      expect(screen.getByText("YubiKey 5 NFC")).toBeInTheDocument();
    });

    it("a failed tap sends no DELETE and leaves the key in the table", async () => {
      runTap.mockResolvedValue({ kind: "failed", message: "That key didn't answer. Try again." });
      render(<KeysPlate keys={THREE_KEYS} />);
      await userEvent.click(screen.getAllByRole("button", { name: "Remove" })[2]!);
      await userEvent.type(screen.getByLabelText("Reason"), VALID_REASON);
      await userEvent.click(screen.getByRole("button", { name: "Tap your key" }));
      await waitFor(() => expect(runTap).toHaveBeenCalledOnce());
      expect(removeKey).not.toHaveBeenCalled();
      expect(screen.getByText("YubiKey 5 NFC")).toBeInTheDocument();
    });

    it("a DELETE refusal leaves the key in the table, shows the console's own message and re-reads the list", async () => {
      // A message that appears nowhere else on the page (unlike the two-key line, which the plate's
      // footer always shows -- task-2-addendum.md's own "a test that passes for the wrong reason"
      // rule: reusing that string here would pass even if this banner were never wired up).
      runTap.mockResolvedValue({ kind: "done" });
      removeKey.mockResolvedValue({ kind: "failed", message: "This key isn't one of yours." });
      // The re-read answers with the same three keys: nothing was removed, so this is what the
      // server really holds, and the table must be left showing it rather than a guess.
      fetchMyKeys.mockResolvedValue({
        keys: THREE_KEYS,
        member: { name: "Asha Rao", email: "asha@trakline.in", role: "owner", createdAt: "2026-09-02T09:00:00Z" },
      });
      render(<KeysPlate keys={THREE_KEYS} />);
      await userEvent.click(screen.getAllByRole("button", { name: "Remove" })[2]!);
      await userEvent.type(screen.getByLabelText("Reason"), VALID_REASON);
      await userEvent.click(screen.getByRole("button", { name: "Tap your key" }));
      await waitFor(() => expect(removeKey).toHaveBeenCalledOnce());
      expect(await screen.findByText("This key isn't one of yours.")).toBeVisible();
      expect(screen.getByText("YubiKey 5 NFC")).toBeInTheDocument();
      // Every refusal Remove can meet is the server saying this table is out of date; leaving it
      // stale would have the next attempt mint a tap over the same wrong count and fail identically.
      await waitFor(() => expect(fetchMyKeys).toHaveBeenCalledOnce());
      expect(notifySuccess).not.toHaveBeenCalled();
    });

    it("keeps the refusal on screen even when the re-read that follows it cannot complete", async () => {
      // The message is set before the re-read, so a refresh that fails does not replace the one
      // sentence telling the member what actually happened with a second, vaguer one.
      runTap.mockResolvedValue({ kind: "done" });
      removeKey.mockResolvedValue({ kind: "failed", message: "This key isn't one of yours." });
      fetchMyKeys.mockResolvedValue(null);
      render(<KeysPlate keys={THREE_KEYS} />);
      await userEvent.click(screen.getAllByRole("button", { name: "Remove" })[2]!);
      await userEvent.type(screen.getByLabelText("Reason"), VALID_REASON);
      await userEvent.click(screen.getByRole("button", { name: "Tap your key" }));
      await waitFor(() => expect(fetchMyKeys).toHaveBeenCalledOnce());
      expect(await screen.findByText("This key isn't one of yours.")).toBeVisible();
      expect(screen.getByText("YubiKey 5 NFC")).toBeInTheDocument();
    });
  });
});
