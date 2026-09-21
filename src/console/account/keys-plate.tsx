"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Plate } from "@/components/ui/plate";
import { AddKeyDialog } from "@/console/account/add-key-dialog";
import type { MyKeysRow } from "@/console/account/my-keys";
import { fetchMyKeys } from "@/console/account/my-keys-client";
import { RenameKeyDialog } from "@/console/account/rename-key-dialog";
import { consoleMessages } from "@/console/messages";
import { formatDate } from "@/utils/datetime";

const m = consoleMessages.myKeys;

type DialogState = { readonly kind: "none" } | { readonly kind: "add" } | { readonly kind: "rename"; readonly row: MyKeysRow };

/**
 * The Keys plate (ConsoleMyKeys.dc.html): the member's own keys, in the order console_my_keys
 * already returns them (oldest first), with Add and Rename now wired to the server (task-7).
 * Removing a key is still the next task, so the actions cell draws Rename alone, not the sheet's
 * Remove button -- the same call this file already made for both actions before this task ("a
 * button with nowhere to send its click is worse than no button").
 *
 * Owns its own copy of `keys`, seeded from the server-rendered prop. An add or a rename re-fetches
 * GET /api/keys/mine (fetchMyKeys) rather than patching this state by hand, so the table never shows
 * a row the server does not also show (task-7-addendum.md §4) -- and so a unit test can prove the
 * new name or key actually lands, not merely that a request was sent.
 */
export function KeysPlate({ keys: initialKeys }: { readonly keys: readonly MyKeysRow[] }) {
  const [keys, setKeys] = useState(initialKeys);
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });

  async function refresh(): Promise<void> {
    const fresh = await fetchMyKeys();
    if (fresh) setKeys(fresh.keys);
  }

  async function handleAdded(): Promise<void> {
    setDialog({ kind: "none" });
    await refresh();
  }

  async function handleRenamed(): Promise<void> {
    setDialog({ kind: "none" });
    await refresh();
  }

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
        <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "rename", row: k })}>
          {m.rename}
        </Button>
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
      </div>
      <AddKeyDialog open={dialog.kind === "add"} onClose={() => setDialog({ kind: "none" })} onAdded={() => void handleAdded()} />
      <RenameKeyDialog
        open={dialog.kind === "rename"}
        keyRow={dialog.kind === "rename" ? dialog.row : null}
        onClose={() => setDialog({ kind: "none" })}
        onRenamed={() => void handleRenamed()}
      />
    </Plate>
  );
}
