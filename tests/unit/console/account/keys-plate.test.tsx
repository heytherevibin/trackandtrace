import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeysPlate } from "@/console/account/keys-plate";
import type { MyKeysRow } from "@/console/account/my-keys";

const KEYS: readonly MyKeysRow[] = [
  { id: "aaaaaaaa-0000-0000-0000-000000000001", name: "YubiKey 5C", type: "security_key", createdAt: "2026-09-02T10:00:00Z", lastUsedAt: "2026-09-19T08:32:00Z" },
  { id: "aaaaaaaa-0000-0000-0000-000000000003", name: "MacBook Pro", type: "passkey", createdAt: "2026-09-05T10:00:00Z", lastUsedAt: null },
];

describe("KeysPlate", () => {
  it("titles the plate Keys and counts the keys", () => {
    render(<KeysPlate keys={KEYS} />);
    expect(screen.getByRole("heading", { name: "Keys" })).toBeInTheDocument();
    expect(screen.getByText("2 keys")).toBeInTheDocument();
  });

  it("pluralises a single key correctly", () => {
    render(<KeysPlate keys={[KEYS[0]]} />);
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

  it("renders no Add, Rename or Remove controls -- those are later tasks", () => {
    render(<KeysPlate keys={KEYS} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
