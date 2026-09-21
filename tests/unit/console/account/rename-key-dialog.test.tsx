import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MyKeysRow } from "@/console/account/my-keys";

// vi.mock's factory is hoisted above a plain top-level const, and this one reads renameKey directly
// in the object it returns rather than inside a nested closure, so it needs vi.hoisted (same trap as
// tests/unit/console/setup/setup-flow.test.tsx's own addKey/keysUsable mock).
const { renameKey } = vi.hoisted(() => ({ renameKey: vi.fn() }));
vi.mock("@/console/account/my-keys-client", () => ({ renameKey }));

import { RenameKeyDialog } from "@/console/account/rename-key-dialog";

const KEY: MyKeysRow = { id: "aaaaaaaa-0000-0000-0000-000000000003", name: "MacBook Pro", type: "passkey", createdAt: "2026-09-05T10:00:00Z", lastUsedAt: null };

// A realistic controlled harness -- open lives here, exactly as KeysPlate (the real caller) owns
// it -- matching tests/unit/console/account/add-key-dialog.test.tsx's own Harness.
function Harness({ onRenamed }: { readonly onRenamed: () => void }) {
  const [open, setOpen] = useState(true);
  return <RenameKeyDialog open={open} keyRow={KEY} onClose={() => setOpen(false)} onRenamed={onRenamed} />;
}

beforeEach(() => {
  renameKey.mockReset();
  renameKey.mockResolvedValue({ kind: "done" });
});

describe("RenameKeyDialog", () => {
  it("draws Rename as the title, and pre-fills the field with this key's current name", () => {
    render(<RenameKeyDialog open keyRow={KEY} onClose={vi.fn()} onRenamed={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Rename" })).toBeVisible();
    expect(screen.getByLabelText("Name this key")).toHaveValue("MacBook Pro");
  });

  it("sends this key's id and the trimmed new name", async () => {
    render(<RenameKeyDialog open keyRow={KEY} onClose={vi.fn()} onRenamed={vi.fn()} />);
    const field = screen.getByLabelText("Name this key");
    await userEvent.clear(field);
    await userEvent.type(field, "  MacBook Air  ");
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    await vi.waitFor(() => expect(renameKey).toHaveBeenCalledExactlyOnceWith("aaaaaaaa-0000-0000-0000-000000000003", "MacBook Air"));
  });

  it("refuses an empty name", async () => {
    render(<RenameKeyDialog open keyRow={KEY} onClose={vi.fn()} onRenamed={vi.fn()} />);
    await userEvent.clear(screen.getByLabelText("Name this key"));
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    expect(renameKey).not.toHaveBeenCalled();
  });

  it("calls onRenamed once the rename lands", async () => {
    const onRenamed = vi.fn();
    render(<RenameKeyDialog open keyRow={KEY} onClose={vi.fn()} onRenamed={onRenamed} />);
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    await vi.waitFor(() => expect(onRenamed).toHaveBeenCalledOnce());
  });

  it("shows the server's own refusal rather than a raw string, and does not call onRenamed", async () => {
    renameKey.mockResolvedValue({ kind: "failed", message: "You don't have access to this." });
    const onRenamed = vi.fn();
    render(<RenameKeyDialog open keyRow={KEY} onClose={vi.fn()} onRenamed={onRenamed} />);
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You don't have access to this.");
    expect(onRenamed).not.toHaveBeenCalled();
  });

  it("closes on Cancel without ever calling renameKey", async () => {
    const onRenamed = vi.fn();
    render(<Harness onRenamed={onRenamed} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(renameKey).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
