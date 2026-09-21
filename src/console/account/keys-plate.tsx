"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Plate } from "@/components/ui/plate";
import { AddKeyDialog } from "@/console/account/add-key-dialog";
import type { MyKeysRow } from "@/console/account/my-keys";
import { fetchMyKeys, removeKey } from "@/console/account/my-keys-client";
import { RenameKeyDialog } from "@/console/account/rename-key-dialog";
import { ConfirmItsYou } from "@/console/components/confirm-its-you";
import { consoleMessages } from "@/console/messages";
import { formatDate } from "@/utils/datetime";

const m = consoleMessages.myKeys;

// The literal console.use_tap('Removed a key', …) binds (supabase/migrations/20260921100000_console_my_keys.sql)
// -- a digest field, never rendered, so it lives beside the dialog it feeds rather than in the copy
// file with the drawn strings (task-8-addendum.md §1-2).
const REMOVE_ACTION = "Removed a key";

type DialogState = { readonly kind: "none" } | { readonly kind: "add" } | { readonly kind: "rename"; readonly row: MyKeysRow } | { readonly kind: "remove"; readonly row: MyKeysRow };

/**
 * The Keys plate (ConsoleMyKeys.dc.html): the member's own keys, in the order console_my_keys
 * already returns them (oldest first). Add and Rename were wired to the server in task-7; task-8
 * wires Remove, ConfirmItsYou's first real caller (spec §D) -- the dialog itself is the shared TC-01
 * (src/console/components/confirm-its-you.tsx), rendered directly here rather than behind a
 * My-keys-specific wrapper, because unlike Add/Rename there is no ceremony of Remove's own to hide
 * behind one.
 *
 * Owns its own copy of `keys`, seeded from the server-rendered prop. An add, a rename or a removal
 * re-fetches GET /api/keys/mine (fetchMyKeys) rather than patching this state by hand, so the table
 * never shows a row the server does not also show (task-7-addendum.md §4) -- and so a unit test can
 * prove the change actually lands, not merely that a request was sent.
 */
export function KeysPlate({ keys: initialKeys }: { readonly keys: readonly MyKeysRow[] }) {
  const [keys, setKeys] = useState(initialKeys);
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [removeReason, setRemoveReason] = useState("");
  // What the last DELETE refused, if anything -- ConfirmItsYou has already closed by the time a
  // refusal comes back (ConfirmItsYou's own onConfirmed fires once the tap is verified, before the
  // delete this file performs afterward even starts), so there is no dialog left open to show it in,
  // and this console has no toast wired up yet to hand it to instead. Cleared whenever a new Remove
  // attempt opens.
  const [plateError, setPlateError] = useState<string | null>(null);

  // A write that lands and a re-read that does not is the worst of both: the server has the new
  // name, the table still shows the old one, and saying nothing would let the member believe their
  // change was lost -- or, if they look away and back, that it never happened. So a failed re-read
  // says so, in the same place a refused action does.
  async function refresh(): Promise<void> {
    const fresh = await fetchMyKeys();
    if (fresh) setKeys(fresh.keys);
    else setPlateError(consoleMessages.session.unavailable);
  }

  async function handleAdded(): Promise<void> {
    setDialog({ kind: "none" });
    setPlateError(null);
    await refresh();
  }

  async function handleRenamed(): Promise<void> {
    setDialog({ kind: "none" });
    setPlateError(null);
    await refresh();
  }

  function openRemove(row: MyKeysRow): void {
    setRemoveReason("");
    setPlateError(null);
    setDialog({ kind: "remove", row });
  }

  function closeRemove(): void {
    setDialog({ kind: "none" });
    setRemoveReason("");
  }

  /**
   * spec §D step 3, and only step 3: ConfirmItsYou calls this after /api/tap/verify has already
   * answered `{ ok: true }` for a challenge minted with this exact key, count and reason -- the tap
   * stays unspent until console_remove_key's own console.use_tap() call, inside the same transaction
   * as the delete and its audit row. A cancelled or failed tap never reaches this function at all
   * (ConfirmItsYou's onConfirmed fires on "done" alone), so there is nothing here to gate a second time.
   */
  async function handleRemoveConfirmed(): Promise<void> {
    if (dialog.kind !== "remove") return;
    const { row } = dialog;
    const reason = removeReason;
    closeRemove();
    const outcome = await removeKey(row.id, reason);
    if (outcome.kind === "done") {
      await refresh();
      return;
    }
    // A refusal -- the two-key floor, a stale key that is no longer this member's, or a stale count
    // that no longer matches the tap's own digest (task-8-addendum.md §2) -- leaves `keys` untouched:
    // no optimistic removal ever happened, so "the key stays in the table" needs no undo.
    setPlateError(outcome.message);
  }

  const removing = dialog.kind === "remove" ? dialog.row : null;
  // spec §D: a member must keep at least two keys, so Remove is refused once exactly two remain --
  // matching ConsoleMyKeys.dc.html's own `removeDisabled` (:112-114), never a disabled control with
  // nowhere for its click to go.
  const removeDisabled = keys.length <= 2;

  const columns: readonly Column<MyKeysRow>[] = [
    { key: "name", header: m.columns.name, cell: (k) => <span className="font-medium">{k.name}</span> },
    { key: "type", header: m.columns.type, cell: (k) => m.typeLabel[k.type] },
    { key: "added", header: m.columns.added, cell: (k) => formatDate(k.createdAt), numeric: true },
    { key: "lastUsed", header: m.columns.lastUsed, cell: (k) => (k.lastUsedAt ? formatDate(k.lastUsedAt) : m.neverUsed), numeric: true },
    // Visually hidden, matching ConsoleMyKeys.dc.html:111's own <span style="position: absolute; ...">
    // for this header. Through `hideHeader` rather than a wrapped element, so the header stays a
    // plain string: DataTable also prints it as the stacked phone layout's row label, and a DOM
    // attribute can only carry a string.
    {
      key: "actions",
      header: m.columns.actions,
      hideHeader: true,
      cell: (k) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "rename", row: k })}>
            {m.rename}
          </Button>
          <Button variant="ghost" size="sm" disabled={removeDisabled} onClick={() => openRemove(k)}>
            {m.remove}
          </Button>
        </div>
      ),
      align: "end",
    },
  ];

  return (
    <Plate as="section" title={m.keysTitle} titleId="mk-keys" headingLevel={2} meta={[m.count(keys.length)]} padding="none">
      <DataTable columns={columns} rows={keys} rowKey={(k) => k.id} caption={m.tableCaption} />
      <div className="flex flex-col gap-3 border-t border-line px-5 py-3.5">
        <div>
          <Button variant="primary" onClick={() => setDialog({ kind: "add" })}>
            {m.addTitle}
          </Button>
        </div>
        <p className="text-label text-ink-3">{m.twoKeyLine}</p>
        <p className="text-label text-ink-3">{m.legends.onlyHere}</p>
        <p className="text-label text-ink-3">{m.legends.addStarts}</p>
        {plateError ? (
          <p role="alert" className="text-label font-medium text-ink-alert">
            {plateError}
          </p>
        ) : null}
      </div>
      <AddKeyDialog open={dialog.kind === "add"} onClose={() => setDialog({ kind: "none" })} onAdded={() => void handleAdded()} />
      <RenameKeyDialog
        open={dialog.kind === "rename"}
        keyRow={dialog.kind === "rename" ? dialog.row : null}
        onClose={() => setDialog({ kind: "none" })}
        onRenamed={() => void handleRenamed()}
      />
      <ConfirmItsYou
        open={dialog.kind === "remove"}
        action={REMOVE_ACTION}
        target={removing?.name ?? ""}
        value={String(keys.length - 1)}
        reason={removeReason}
        summary={removing ? m.removeSummary(removing.name) : ""}
        change={{ label: m.removeChangeLabel, before: String(keys.length), after: String(keys.length - 1) }}
        onReasonChange={setRemoveReason}
        onCancel={closeRemove}
        onConfirmed={() => void handleRemoveConfirmed()}
      />
    </Plate>
  );
}
