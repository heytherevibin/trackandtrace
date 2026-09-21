import { DataTable, type Column } from "@/components/ui/data-table";
import { Plate } from "@/components/ui/plate";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import type { MyKeysRow } from "@/console/account/my-keys";
import { consoleMessages } from "@/console/messages";
import { formatDate } from "@/utils/datetime";

const m = consoleMessages.myKeys;

const COLUMNS: readonly Column<MyKeysRow>[] = [
  { key: "name", header: m.columns.name, cell: (k) => <span className="font-medium">{k.name}</span> },
  { key: "type", header: m.columns.type, cell: (k) => m.typeLabel[k.type] },
  { key: "added", header: m.columns.added, cell: (k) => formatDate(k.createdAt), numeric: true },
  { key: "lastUsed", header: m.columns.lastUsed, cell: (k) => (k.lastUsedAt ? formatDate(k.lastUsedAt) : m.neverUsed), numeric: true },
  // Visually hidden, matching ConsoleMyKeys.dc.html:111's own <span style="position: absolute; ...">
  // for this header. The cells are empty rather than Rename/Remove buttons: adding, renaming and
  // removing a key are later tasks (task-6-addendum.md's scope line), and a button with nowhere to
  // send its click is worse than no button -- the same call Ruling 4 made for the module rail.
  { key: "actions", header: <VisuallyHidden>{m.columns.actions}</VisuallyHidden>, cell: () => null, align: "end" },
];

/**
 * The Keys plate (ConsoleMyKeys.dc.html): the member's own keys, in the order console_my_keys
 * already returns them (oldest first). "Add a key" and the two dialogs are not drawn here either --
 * the brief's quoted-copy list names neither, and this task is the read path only.
 */
export function KeysPlate({ keys }: { readonly keys: readonly MyKeysRow[] }) {
  return (
    <Plate as="section" title={m.keysTitle} titleId="mk-keys" headingLevel={2} meta={[m.count(keys.length)]} padding="none">
      <DataTable columns={COLUMNS} rows={keys} rowKey={(k) => k.id} caption={m.tableCaption} />
      <div className="flex flex-col gap-3 border-t border-line px-5 py-3.5">
        <p className="text-label text-ink-3">{m.twoKeyLine}</p>
        <p className="text-label text-ink-3">{m.legends.onlyHere}</p>
        <p className="text-label text-ink-3">{m.legends.addStarts}</p>
      </div>
    </Plate>
  );
}
