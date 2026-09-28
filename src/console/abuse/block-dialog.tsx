"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { DialogClose, DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { notify } from "@/components/ui/toast";
import { BLOCK_ACTION, blockTapValue, shortMember } from "@/console/abuse/abuse";
import { hashAddress, requestBlock } from "@/console/abuse/abuse-client";
import { ConfirmItsYou } from "@/console/components/confirm-its-you";
import { consoleMessages } from "@/console/messages";
import type { BlockDuration } from "@/services/blocklist";

const m = consoleMessages.abuse;
const t = consoleMessages.tap;

const DURATIONS: readonly BlockDuration[] = ["1h", "24h", "7d", "removed"];
const DEFAULT_DURATION: BlockDuration = "24h";
const NOTE_MAX = 200;

type Stage = { readonly kind: "closed" } | { readonly kind: "form" } | { readonly kind: "hashing" } | { readonly kind: "confirming"; readonly member: string } | { readonly kind: "sending" };

/**
 * TC-06, "Block an address" (b3-provider-operations.md, DIALOG). Two ways in: the page's primary,
 * with an IP field, or a Most limited row, whose hash is already known — "the hash is prefilled and
 * the field is hidden".
 *
 * **The address is hashed on entry.** Continue sends it to the server once and gets back the hash it
 * is stored under; the tap is minted over that hash, and from then on the dialog holds and shows
 * only the hash. The address never reaches the tap, the audit log or the blocklist.
 */
export function BlockDialog({ environment, member: prefilled, variant = "primary" }: { readonly environment: string; readonly member?: string; readonly variant?: ButtonVariant }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "closed" });
  const [address, setAddress] = useState("");
  const [duration, setDuration] = useState<BlockDuration>(DEFAULT_DURATION);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);
  const durationLabelId = useId();

  function open(): void {
    setAddress("");
    setDuration(DEFAULT_DURATION);
    setNote("");
    setReason("");
    setRefusal(null);
    setStage({ kind: "form" });
  }

  async function onContinue(): Promise<void> {
    setRefusal(null);
    if (prefilled !== undefined) {
      setStage({ kind: "confirming", member: prefilled });
      return;
    }
    setStage({ kind: "hashing" });
    const hashed = await hashAddress(address.trim());
    if (hashed.kind === "failed") {
      setRefusal(hashed.message);
      setStage({ kind: "form" });
      return;
    }
    // The address is not needed again, so it is not kept.
    setAddress("");
    setStage({ kind: "confirming", member: hashed.member });
  }

  async function onConfirmed(member: string): Promise<void> {
    setStage({ kind: "sending" });
    const outcome = await requestBlock({ member, duration, note: note.trim(), reason });
    setStage({ kind: "closed" });
    if (outcome.kind === "done") {
      notify.success(m.block.doneToast);
      router.refresh();
      return;
    }
    notify.error(outcome.message);
  }

  const confirming = stage.kind === "confirming" ? stage.member : null;
  const formOpen = stage.kind === "form" || stage.kind === "hashing";

  return (
    <>
      {prefilled === undefined ? (
        <Button variant={variant} onClick={open}>
          {m.block.trigger}
        </Button>
      ) : (
        <Button variant="secondary" size="sm" aria-label={m.block.rowTrigger(shortMember(prefilled))} onClick={open}>
          {m.block.rowShort}
        </Button>
      )}
      <DialogRoot
        open={formOpen}
        onOpenChange={(next) => {
          if (!next) setStage({ kind: "closed" });
        }}
      >
        <DialogContent
          title={prefilled === undefined ? m.block.trigger : m.block.rowTrigger(shortMember(prefilled))}
          description={m.block.form}
          footer={
            <>
              <DialogClose render={<Button variant="secondary">{t.cancel}</Button>} />
              <Button variant="primary" disabled={stage.kind === "hashing" || (prefilled === undefined && address.trim() === "")} onClick={() => void onContinue()}>
                {m.block.continue}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            {prefilled === undefined ? (
              <Field invalid={refusal !== null}>
                <FieldLabel>{m.block.addressLabel}</FieldLabel>
                <Input autoComplete="off" spellCheck={false} inputMode="text" maxLength={64} value={address} onChange={(event) => setAddress(event.currentTarget.value)} />
                <p className="text-label text-ink-3">{m.block.addressLegend}</p>
              </Field>
            ) : null}
            {refusal !== null ? (
              <p role="alert" className="text-label text-ink-alert font-medium">
                {refusal}
              </p>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <span id={durationLabelId} className="legend-md text-accent-text">
                {m.block.durationLabel}
              </span>
              <div role="radiogroup" aria-labelledby={durationLabelId} className="flex flex-col">
                {DURATIONS.map((d) => (
                  <label key={d} className="border-line flex min-h-11 cursor-pointer items-center gap-2.5 border-b px-1 last:border-b-0">
                    <input type="radio" name={durationLabelId} value={d} checked={duration === d} onChange={() => setDuration(d)} className="accent-accent-strong size-4" />
                    <span className="text-sm">{m.block.durations[d]}</span>
                  </label>
                ))}
              </div>
            </div>
            <Field>
              <FieldLabel>{m.block.noteLabel}</FieldLabel>
              <Input autoComplete="off" maxLength={NOTE_MAX} value={note} onChange={(event) => setNote(event.currentTarget.value)} />
            </Field>
          </div>
        </DialogContent>
      </DialogRoot>
      <ConfirmItsYou
        open={confirming !== null}
        action={BLOCK_ACTION}
        target={confirming ?? ""}
        value={blockTapValue(environment, duration, note.trim())}
        reason={reason}
        summary={m.block.summary(shortMember(confirming ?? ""))}
        change={{ label: m.block.changeLabel, before: m.block.notBlocked, after: m.block.durations[duration] }}
        hint={m.block.hint}
        onReasonChange={setReason}
        onCancel={() => setStage({ kind: "closed" })}
        onConfirmed={() => {
          if (confirming !== null) void onConfirmed(confirming);
        }}
      />
    </>
  );
}
