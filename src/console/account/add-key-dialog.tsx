"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Led } from "@/components/ui/led";
import { addKey } from "@/console/keys/client";
import { KeyKindPicker } from "@/console/keys/key-kind-picker";
import type { ConsoleKeyKind } from "@/console/keys/kind";
import { KEY_NAME_MAX } from "@/console/account/key-name";
import { consoleMessages } from "@/console/messages";

const m = consoleMessages.myKeys;
const k = consoleMessages.keys;
const t = consoleMessages.tap;

type Stage = { readonly kind: "idle"; readonly error: string | null } | { readonly kind: "adding" };

export interface AddKeyDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Fired once addKey resolves "done". The caller (KeysPlate) owns closing and refreshing the table. */
  readonly onAdded: () => void;
}

/**
 * ConsoleMyKeys.dc.html's Add dialog (task-7). Wires the drawn form to `addKey`
 * (`@/console/keys/client`), which already runs the tap-then-register two-step end to end -- this
 * dialog adds no ceremony logic, no second error mapping and no second dismissal check of its own
 * (task-7-addendum.md §3).
 *
 * The sheet draws exactly one snapshot of this dialog: mid-ceremony (`state: "Adding"`), both status
 * lines shown together, the primary button disabled and reading "Waiting for your key…". It draws no
 * separate frame for "just opened" or "step 2 under way" -- and `addKey` itself resolves once, at
 * the very end, never reporting which of its two ceremonies (tap, then register) is currently
 * running. Rather than animate between the two lines on a guessed timer -- "a progress line driven
 * by a guess is worse than one that does not move" (task-7-addendum.md §3) -- both lines are drawn
 * together, exactly as the sheet draws them, for the whole time a ceremony is running. Flagged in
 * task-7-report.md.
 */
export function AddKeyDialog({ open, onClose, onAdded }: AddKeyDialogProps) {
  const [name, setName] = useState("");
  // Which kind of key this is, which decides which sheet the browser opens (@/console/keys/kind).
  // Undrawn, and deliberately unset until the member says: see KeyKindPicker's own note.
  const [keyKind, setKeyKind] = useState<ConsoleKeyKind | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: "idle", error: null });
  const kindLabelId = useId();

  // The sheet's own dialog always opens on an empty field with no error -- reset during render on a
  // genuine closed -> open edge (react.dev's recommended shape for adjusting state from a prop),
  // since the same mounted instance is reused for the next "Add a key" click
  // (src/console/components/confirm-its-you.tsx's own pattern).
  const [openSeen, setOpenSeen] = useState(open);
  if (open !== openSeen) {
    setOpenSeen(open);
    if (open) {
      setName("");
      setKeyKind(null);
      setStage({ kind: "idle", error: null });
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = name.trim();
    // Both guards read the same way: the submit is already disabled without them, so neither is a
    // refusal the member can see -- they are what keeps a stray Enter from starting a ceremony the
    // form is not ready for.
    if (!trimmed || keyKind === null) return;
    setStage({ kind: "adding" });
    const outcome = await addKey(trimmed, keyKind);
    if (outcome.kind === "done") {
      // Reset here rather than only relying on the parent to unmount or re-hide this dialog on
      // `onAdded`: a caller that keeps it mounted (or is merely slow to react) must never find a
      // permanently disabled "Waiting for your key…" button once the ceremony is actually over.
      setStage({ kind: "idle", error: null });
      onAdded();
      return;
    }
    // A dismissed prompt says nothing new (decision #2, carried from setup-flow.tsx): the dialog
    // just returns to idle so the member can try again.
    setStage({ kind: "idle", error: outcome.kind === "failed" ? outcome.message : null });
  }

  const adding = stage.kind === "adding";
  const error = stage.kind === "idle" ? stage.error : null;

  return (
    <DialogRoot
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        title={m.addTitle}
        footer={
          <>
            <DialogClose render={<Button variant="secondary">{t.cancel}</Button>} />
            <Button type="submit" form="add-key-form" variant="primary" disabled={adding || keyKind === null}>
              {adding ? k.waiting : m.addTitle}
            </Button>
          </>
        }
      >
        <form id="add-key-form" noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span id={kindLabelId} className="legend-md text-accent-text">
              {k.kindLabel}
            </span>
            <KeyKindPicker value={keyKind} labelId={kindLabelId} disabled={adding} onChange={setKeyKind} />
          </div>
          <Field invalid={error !== null}>
            <FieldLabel>{k.nameLabel}</FieldLabel>
            <Input value={name} maxLength={KEY_NAME_MAX} disabled={adding} onChange={(event) => setName(event.currentTarget.value)} />
            {error !== null ? (
              <FieldError match role="alert">
                {error}
              </FieldError>
            ) : null}
          </Field>
          {adding ? (
            <>
              <div role="status" className="flex items-center gap-2.5 border border-line bg-surface-1 px-3.5 py-3">
                <Led lit />
                <span className="text-sm">{m.addProgress.tap}</span>
              </div>
              <div role="status" className="flex items-center gap-2.5 border border-line bg-surface-1 px-3.5 py-3">
                <Led />
                <span className="text-sm">{m.addProgress.register}</span>
              </div>
            </>
          ) : null}
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
