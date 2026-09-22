"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { z } from "zod";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { DialogClose, DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { notify } from "@/components/ui/toast";
import type { ConsoleRole } from "@/console/auth/member";
import { ConfirmItsYou } from "@/console/components/confirm-its-you";
import { consoleMessages } from "@/console/messages";
import { inviteMember } from "@/console/team/team-client";
import { cn } from "@/utils/cn";

const m = consoleMessages.team.invite;
const f = consoleMessages.frame;
const t = consoleMessages.tap;

// The literal console.use_tap('Invited a member', …) binds
// (supabase/migrations/20260922090000_console_team.sql) -- a digest field, never rendered, so it
// lives beside the dialog it feeds rather than in the copy file with the drawn strings, the same
// place keys-plate.tsx keeps its own REMOVE_ACTION.
const INVITE_ACTION = "Invited a member";

// The sheet's own order, top to bottom (ConsoleTeam.dc.html:215-218), and its own default:
// Support is the only choice drawn with aria-checked="true" (:217).
const ROLES = ["owner", "admin", "support", "viewer"] as const satisfies readonly ConsoleRole[];
const DEFAULT_ROLE: ConsoleRole = "support";

const EMAIL = z.email();

/**
 * The sheet's role picker: `role="radiogroup"` labelled by the "Role" legend, four `role="radio"`
 * choices, each a name over a description (:214-219).
 *
 * The sheet draws each choice as a `<div role="radio" tabindex="-1">`. A div cannot be operated
 * from the keyboard and is not a button to assistive technology's activation model, so these are
 * `<button type="button" role="radio">` instead -- the accessible choice where the transcription
 * would otherwise conflict, and the line departed from is quoted above. The roving tabindex the
 * sheet draws (0 on the checked choice, -1 on the rest) is kept exactly, and arrow keys move the
 * selection the way the radiogroup pattern requires.
 *
 * The four descriptions are imported, never restated: task-3 authored them once at
 * consoleMessages.team.roleDescription precisely so this dialog and the setup page could share one
 * copy (task-3-report.md, task-4-addendum.md §1).
 */
function RolePicker({ value, labelId, onChange }: { readonly value: ConsoleRole; readonly labelId: string; readonly onChange: (role: ConsoleRole) => void }) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function move(delta: number): void {
    const next = ROLES[(ROLES.indexOf(value) + delta + ROLES.length) % ROLES.length];
    onChange(next);
    buttons.current[ROLES.indexOf(next)]?.focus();
  }

  return (
    <div role="radiogroup" aria-labelledby={labelId} className="flex flex-col">
      {ROLES.map((role, index) => (
        <button
          key={role}
          ref={(node) => {
            buttons.current[index] = node;
          }}
          type="button"
          role="radio"
          aria-checked={value === role}
          tabIndex={value === role ? 0 : -1}
          onClick={() => onChange(role)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowRight") {
              event.preventDefault();
              move(1);
            } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
              event.preventDefault();
              move(-1);
            }
          }}
          className="press flex cursor-pointer items-start gap-2.5 border-b border-line px-1 py-2.5 text-left last:border-b-0 hover:bg-ink-1/5"
        >
          <span
            aria-hidden="true"
            className={cn("mt-1 size-3.5 shrink-0 border", value === role ? "border-accent-strong bg-accent-strong" : "border-line-strong bg-surface-1")}
          />
          <span className="flex min-w-0 flex-col">
            <span className="text-sm font-medium leading-5">{f.roleLabel[role]}</span>
            <span className="text-label leading-5 text-ink-3">{consoleMessages.team.roleDescription[role]}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Closed, on TC-04, on TC-01, or between the two with a send in flight. */
type Stage = { readonly kind: "closed" } | { readonly kind: "form" } | { readonly kind: "confirming" } | { readonly kind: "sending" };

/**
 * Form TC-04 (ConsoleTeam.dc.html:203-259): one self-contained unit -- the trigger, the dialog, the
 * tap and the refresh. The sheet draws the trigger twice, as two different buttons: a primary in
 * the page header's `ph-actions` (:106) and a secondary beside "You're the only member." (:157).
 * Both open this same dialog, so this component takes the variant as a prop and is rendered twice
 * rather than lifting an `open` flag into the page (task-4-addendum.md §5). Two instances, one open
 * at a time, is what the page can actually reach.
 *
 * Inviting takes a tap, because it grants console access (spec §D). TC-04 collects the address and
 * the role; ConfirmItsYou (TC-01) collects the reason and runs the ceremony; only a completed tap
 * reaches `inviteMember`. A cancelled tap comes back to TC-04 with what was typed still there,
 * rather than throwing it away -- the sheet draws no state for that return, and losing a typed
 * address to a mis-tap is a worse answer than the one it does not draw.
 *
 * The list refreshes with `router.refresh()`: the three plates are server components, so the page
 * re-runs `getTeam()` and the refreshed roster cannot disagree with the first paint.
 */
export function InviteDialog({ variant = "primary" }: { readonly variant?: ButtonVariant }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "closed" });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ConsoleRole>(DEFAULT_ROLE);
  const [reason, setReason] = useState("");
  // What was refused, and for which address. Derived against the live field below rather than
  // tracked as its own boolean, so editing the address clears the alert for free -- the same shape
  // ConfirmItsYou's own `reasonAlert` uses one level down. It carries both refusals a member can
  // see here: this dialog's own "that is not an address", and whatever the database refused.
  const [refusal, setRefusal] = useState<{ readonly email: string; readonly message: string } | null>(null);
  const roleLabelId = useId();

  function open(): void {
    setEmail("");
    setRole(DEFAULT_ROLE);
    setReason("");
    setRefusal(null);
    setStage({ kind: "form" });
  }

  /**
   * TC-04's Continue. The address is checked here, in the browser, before any request goes out --
   * an address that is not an address is not something the console needs to be asked about.
   */
  function onContinue(): void {
    if (!EMAIL.safeParse(email.trim().toLowerCase()).success) {
      setRefusal({ email, message: m.invalidEmail });
      return;
    }
    setRefusal(null);
    setStage({ kind: "confirming" });
  }

  /**
   * spec §D step 3, and only step 3: ConfirmItsYou calls this once /api/tap/verify has answered
   * `{ ok: true }` for a challenge minted over these exact four fields. The tap stays unspent until
   * console_invite_member's own console.use_tap(), inside the same transaction as the invite row and
   * its audit row. A cancelled or failed tap never reaches this function at all.
   */
  async function onConfirmed(): Promise<void> {
    const typed = email;
    setStage({ kind: "sending" });
    const outcome = await inviteMember(typed.trim().toLowerCase(), role, reason);
    if (outcome.kind === "done") {
      notify.success(m.sentToast);
      router.refresh();
      setStage({ kind: "closed" });
      setEmail("");
      setRole(DEFAULT_ROLE);
      setReason("");
      return;
    }
    // Back to TC-04 with the refusal under the field it is about, as dlg_refused draws it -- not to
    // a toast. A toast goes away; a refusal a member has to act on stays next to the thing that
    // refused. Continue is disabled until the address changes, because nothing else about this
    // attempt could make the same address succeed.
    setRefusal({ email: typed, message: outcome.message });
    setStage({ kind: "form" });
  }

  const address = email.trim().toLowerCase();
  const refused = refusal !== null && refusal.email === email;

  return (
    <>
      <Button variant={variant} onClick={open}>
        {m.trigger}
      </Button>
      <DialogRoot
        open={stage.kind === "form"}
        onOpenChange={(next) => {
          if (!next) setStage({ kind: "closed" });
        }}
      >
        <DialogContent
          title={m.trigger}
          description={m.form}
          footer={
            <>
              <DialogClose render={<Button variant="secondary">{t.cancel}</Button>} />
              <Button variant="primary" disabled={refused} onClick={onContinue}>
                {m.continue}
              </Button>
            </>
          }
        >
          {/* The sheet's own 18px column gap (:206) is off the spacing rhythm this repo holds to
              (tests/unit/tokens.contract.test.ts), so it rounds to the nearest step on it -- the
              same 16px ConfirmItsYou's own body already uses. */}
          <div className="flex flex-col gap-4">
            <Field invalid={refused}>
              <FieldLabel>{m.emailLabel}</FieldLabel>
              <Input type="email" autoComplete="off" value={email} maxLength={254} onChange={(event) => setEmail(event.currentTarget.value)} />
              {refused ? (
                <FieldError match role="alert">
                  {refusal.message}
                </FieldError>
              ) : null}
            </Field>
            <div className="flex flex-col gap-1.5">
              <span id={roleLabelId} className="legend-md text-accent-text">
                {m.roleLabel}
              </span>
              <RolePicker value={role} labelId={roleLabelId} onChange={setRole} />
            </div>
            <p className="text-label text-ink-3">{m.hint}</p>
          </div>
        </DialogContent>
      </DialogRoot>
      <ConfirmItsYou
        open={stage.kind === "confirming"}
        action={INVITE_ACTION}
        // The lower-cased address, because that is what console_invite_member digests
        // (`v_email := lower(p_email)`). Anything else mints a tap the spend cannot match, and the
        // invite fails with "no tap for this action" with nothing on screen to say why.
        target={address}
        value={role}
        reason={reason}
        // Never derived from the four digest fields above: those are what the database hashes and
        // re-hashes, and they are never rendered. ConsoleTeam.dc.html draws TC-01 for Change role,
        // Reset keys and Remove, but not for the invite -- these two lines are authored in that
        // same shape and flagged in task-4-report.md.
        summary={m.confirmSummary(address)}
        change={{ label: m.confirmChangeLabel, before: m.confirmNoRole, after: f.roleLabel[role] }}
        onReasonChange={setReason}
        onCancel={() => {
          // Only a genuine Cancel/Escape/close on TC-01 comes back to TC-04. Guarded on the stage
          // so a programmatic close -- this component setting `open` to false after a send -- can
          // never reopen the form over a finished invite.
          if (stage.kind === "confirming") setStage({ kind: "form" });
        }}
        onConfirmed={() => void onConfirmed()}
      />
    </>
  );
}
