"use client";

import { useState } from "react";
import { z } from "zod";
import { Button, NOTE, Status, TEXT } from "@/components/subscribe/plate-parts";
import { SubscriptionPage } from "@/components/subscribe/subscription-page";
import { messages } from "@/messages";
import { apiRequest } from "@/services/api-client";

const m = messages.subscribe.page.unsubscribe;
const confirm = messages.subscribe.page.confirm;

const LEGEND = "font-display text-xs font-semibold uppercase leading-normal tracking-caps text-accent-text p-0";
const CHOICE = "flex min-h-11 items-center gap-2.5 text-sm text-ink-1/78";

const answer = z.object({ ok: z.literal(true), state: z.string() });

type Action = "unsubscribe" | "resubscribe" | "reason";
type Reason = (typeof m.reasons)[number]["value"];
/** What the route made of an action. `unknown` and anything unexpected are `error`: nothing we can claim. */
type Outcome = "done" | "already" | "error";

interface Link {
  readonly person: string;
  readonly list: "news" | "availability";
  readonly signature: string;
}

async function post(link: Link, action: Action, reason?: Reason): Promise<Outcome> {
  const result = await apiRequest(
    "/api/unsubscribe",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ p: link.person, l: link.list, s: link.signature, action, ...(reason ? { reason } : {}) }),
    },
    answer,
  ).catch(() => null);
  if (!result?.ok) return "error";
  return result.data.state === "done" || result.data.state === "already" ? result.data.state : "error";
}

/** Where the page is. Nothing has been pressed until `left`; `rejoined` and `stillIn` end it. */
type Stage = "before" | "left" | "alreadyLeft" | "rejoined" | "stillIn";

export interface UnsubscribeClientProps extends Link {
  readonly headline: string;
  readonly lead: string;
  readonly promise: string;
}

/**
 * The client draws the whole shell: the lead ("Opening this link changed nothing...") belongs to the
 * state before the press and must go once the press has answered. A failed press keeps it, since
 * nothing changed. The reasons come after the person has left and are never asked for beforehand.
 */
export function UnsubscribeClient({ headline, lead, promise, ...link }: UnsubscribeClientProps) {
  const [stage, setStage] = useState<Stage>("before");
  const [busy, setBusy] = useState<Action | null>(null);
  const [failed, setFailed] = useState<Action | null>(null);
  const [reason, setReason] = useState<Reason | null>(null);

  /** Runs one action, one at a time. A failure is remembered against the action, so its message sits beside its control. */
  async function run(action: Action, chosen?: Reason): Promise<Outcome | "busy"> {
    if (busy) return "busy";
    setBusy(action);
    setFailed(null);
    const outcome = await post(link, action, chosen);
    setBusy(null);
    if (outcome === "error") setFailed(action);
    return outcome;
  }

  if (stage === "rejoined" || stage === "stillIn") {
    return (
      <SubscriptionPage headline={headline}>
        {/* A rejoin sends no confirmation email, so this is the confirm page's After, not "Check your inbox". */}
        <Status>{stage === "rejoined" ? confirm.after : confirm.already}</Status>
      </SubscriptionPage>
    );
  }

  if (stage === "before") {
    return (
      <SubscriptionPage headline={headline} lead={lead}>
        <p className={TEXT}>{promise}</p>
        {failed ? <Status>{messages.subscribe.errors.failed}</Status> : null}
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void run("unsubscribe").then((outcome) => {
              if (outcome === "done") setStage("left");
              else if (outcome === "already") setStage("alreadyLeft");
            });
          }}
        >
          <Button label={m.button} busy={busy === "unsubscribe"} />
        </form>
      </SubscriptionPage>
    );
  }

  return (
    <SubscriptionPage headline={headline}>
      <Status>{stage === "left" ? m.after : m.already}</Status>
      <p className={NOTE}>{m.changedMind}</p>
      {failed === "resubscribe" ? <Status>{messages.subscribe.errors.failed}</Status> : null}
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void run("resubscribe").then((outcome) => {
            if (outcome === "done") setStage("rejoined");
            else if (outcome === "already") setStage("stillIn");
          });
        }}
      >
        <Button label={m.resubscribe} busy={busy === "resubscribe"} />
      </form>
      <fieldset className="mt-6 border-0 p-0">
        <legend className={LEGEND}>{m.whyLegend}</legend>
        <div className="mt-2.5 flex flex-col gap-2">
          {m.reasons.map((option) => (
            <label key={option.value} className={CHOICE}>
              <input
                type="radio"
                name="reason"
                value={option.value}
                className="size-4 accent-accent-strong"
                checked={reason === option.value}
                onChange={() => {
                  const previous = reason;
                  setReason(option.value);
                  // A reason that was not recorded is not shown as chosen.
                  void run("reason", option.value).then((outcome) => {
                    if (outcome === "error" || outcome === "busy") setReason(previous);
                  });
                }}
              />
              {option.label}
            </label>
          ))}
        </div>
        {failed === "reason" ? <Status>{messages.subscribe.errors.failed}</Status> : null}
      </fieldset>
    </SubscriptionPage>
  );
}
