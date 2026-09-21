"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { MyKeysRow } from "@/console/account/my-keys";
import { renameKey } from "@/console/account/my-keys-client";
import { KEY_NAME_MAX } from "@/console/account/key-name";
import { consoleMessages } from "@/console/messages";

const m = consoleMessages.myKeys;
const k = consoleMessages.keys;
const t = consoleMessages.tap;

type Stage = { readonly kind: "idle"; readonly error: string | null } | { readonly kind: "renaming" };

export interface RenameKeyDialogProps {
  readonly open: boolean;
  /** The row being renamed, or null before any row has been picked. */
  readonly keyRow: MyKeysRow | null;
  readonly onClose: () => void;
  /** Fired once the rename lands. The caller (KeysPlate) owns closing and refreshing the table. */
  readonly onRenamed: () => void;
}

/**
 * A rename control for one row of the Keys plate (task-7). ConsoleMyKeys.dc.html draws "Rename"
 * three times as a row action, but its state script names only Adding, Removing, Remove blocked,
 * Removed, Sign out others and Others signed out -- there is no drawn dialog state for renaming
 * itself. Rather than invent copy the sheet never wrote, this dialog reuses only words the sheet
 * already draws: "Rename" (the row button, reused here as the title and the submit label) and
 * "Name this key" (the brief's own instruction -- the same field Add uses). Flagged in
 * task-7-report.md.
 *
 * No tap: `console_rename_key` takes none, deliberately (task-7-addendum.md §2.3) -- a name is a
 * label, not a risky action, so this dialog is a plain field and a PATCH, not a ceremony.
 */
export function RenameKeyDialog({ open, keyRow, onClose, onRenamed }: RenameKeyDialogProps) {
  const [name, setName] = useState(keyRow?.name ?? "");
  const [stage, setStage] = useState<Stage>({ kind: "idle", error: null });

  // Reset to this row's current name on a genuine closed -> open edge, the same pattern
  // add-key-dialog.tsx and confirm-its-you.tsx use: the same mounted instance is reused for the
  // next row's "Rename" click, and `keyRow` has already changed to the new row by the time this
  // runs during render.
  const [openSeen, setOpenSeen] = useState(open);
  if (open !== openSeen) {
    setOpenSeen(open);
    if (open) {
      setName(keyRow?.name ?? "");
      setStage({ kind: "idle", error: null });
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!keyRow) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setStage({ kind: "renaming" });
    const outcome = await renameKey(keyRow.id, trimmed);
    if (outcome.kind === "done") {
      // Reset here rather than only relying on the parent to unmount or re-hide this dialog on
      // `onRenamed`, the same reasoning as add-key-dialog.tsx's own success path.
      setStage({ kind: "idle", error: null });
      onRenamed();
      return;
    }
    setStage({ kind: "idle", error: outcome.message });
  }

  const renaming = stage.kind === "renaming";
  const error = stage.kind === "idle" ? stage.error : null;

  return (
    <DialogRoot
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        title={m.rename}
        footer={
          <>
            <DialogClose render={<Button variant="secondary">{t.cancel}</Button>} />
            <Button type="submit" form="rename-key-form" variant="primary" loading={renaming} disabled={renaming}>
              {m.rename}
            </Button>
          </>
        }
      >
        <form id="rename-key-form" noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
          <Field invalid={error !== null}>
            <FieldLabel>{k.nameLabel}</FieldLabel>
            <Input value={name} maxLength={KEY_NAME_MAX} disabled={renaming} onChange={(event) => setName(event.currentTarget.value)} />
            {error !== null ? (
              <FieldError match role="alert">
                {error}
              </FieldError>
            ) : null}
          </Field>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
