import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MyKeysRow } from "@/console/account/my-keys";

// KeysPlate now orchestrates two dialogs and a re-fetch; its own test stays about orchestration
// (which button opens which dialog, and that a success re-renders the table), not the ceremony or
// network logic underneath -- that is each dialog's own file
// (tests/unit/console/account/add-key-dialog.test.tsx, .../rename-key-dialog.test.tsx) and
// fetchMyKeys' own (tests/unit/console/account/my-keys-client.test.ts). The mocked dialogs below
// expose just enough of their real props (open, keyRow, onAdded/onRenamed) to drive that.
const { fetchMyKeys } = vi.hoisted(() => ({ fetchMyKeys: vi.fn() }));
vi.mock("@/console/account/my-keys-client", () => ({ fetchMyKeys }));
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

beforeEach(() => {
  fetchMyKeys.mockReset();
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

  it("draws Add a key and a Rename per row, but no Remove control -- removal is still the next task", () => {
    render(<KeysPlate keys={KEYS} />);
    expect(screen.getByRole("button", { name: "Add a key" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Rename" })).toHaveLength(KEYS.length);
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
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
});
