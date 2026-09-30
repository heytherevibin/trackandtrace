"use client";

import { useId, useState } from "react";
import { z } from "zod";
import { ALERT, FIELD, LABEL, REFUSAL } from "@/components/subscribe/field-parts";
import { Button, NOTE, Status, TEXT } from "@/components/subscribe/plate-parts";
import { SubscriptionPage } from "@/components/subscribe/subscription-page";
import { signUp, type SignupState } from "@/components/subscribe/use-signup";
import { messages } from "@/messages";
import { apiRequest } from "@/services/api-client";

const m = messages.subscribe.page.confirm;
const EMAIL = z.email().max(254);

const answer = z.object({ ok: z.literal(true), state: z.string() });

type Pressed = "idle" | "pressing" | "subscribed" | "already" | "error";

/**
 * The state the press leaves. The route's `confirmed` means the opposite of the peek's: the peek
 * says a link is still confirmable, the route says it has just been confirmed. Anything else, on
 * either side of the press, is not a subscription.
 */
async function press(token: string): Promise<Pressed> {
  const result = await apiRequest(
    "/api/subscribe/confirm",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) },
    answer,
  );
  if (!result.ok) return "error";
  if (result.data.state === "confirmed") return "subscribed";
  if (result.data.state === "already") return "already";
  return "error";
}

/**
 * The Before state: opening the link changed nothing, and only this button confirms.
 * It draws the shell itself because the lead ("Opening this link changed nothing...") belongs to the
 * state before the press and must go once the press has answered.
 */
function Before({ headline, lead, token, promise }: { readonly headline: string; readonly lead: string; readonly token: string; readonly promise: string }) {
  const [pressed, setPressed] = useState<Pressed>("idle");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pressed === "pressing") return;
    setPressed("pressing");
    setPressed(await press(token).catch((): Pressed => "error"));
  }

  // The lead is not passed once the press has answered: the board draws none in these states.
  if (pressed === "subscribed" || pressed === "already") {
    return (
      <SubscriptionPage headline={headline}>
        <Status>{pressed === "subscribed" ? m.after : m.already}</Status>
      </SubscriptionPage>
    );
  }
  return (
    <SubscriptionPage headline={headline} lead={lead}>
      <p className={TEXT}>{promise}</p>
      {pressed === "error" ? <Status>{messages.subscribe.errors.failed}</Status> : null}
      <form noValidate onSubmit={submit}>
        <Button label={m.button} busy={pressed === "pressing"} />
      </form>
    </SubscriptionPage>
  );
}

/** The expired link: the page holds no address, so the person types theirs and asks again. */
function Expired({ headline, list }: { readonly headline: string; readonly list: "news" | "availability" }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<SignupState>("idle");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (state === "sending") return;
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL.safeParse(trimmed).success) {
      setState("invalid");
      return;
    }
    setState("sending");
    // The same path as any sign-up, so the same connection limit and the same day's allowance apply.
    // The source is cosmetic here: an address already on file keeps the source it first came from.
    setState(await signUp({ email: trimmed, list, source: "footer" }).catch((): SignupState => "error"));
  }

  const refusal = REFUSAL[state];
  return (
    <SubscriptionPage headline={headline}>
      <Status>{m.expired}</Status>
      {state === "sent" ? (
        <Status>{messages.subscribe.sent}</Status>
      ) : (
        <form noValidate onSubmit={submit} className="mt-1.5 flex flex-col gap-1.5">
          <label htmlFor={id} className={LABEL}>
            {messages.subscribe.form.label}
          </label>
          <input
            id={id}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder={messages.subscribe.form.placeholder}
            className={FIELD}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            {...(refusal ? { "aria-invalid": state === "invalid", "aria-describedby": `${id}-message` } : {})}
          />
          {refusal ? (
            <p id={`${id}-message`} role="alert" className={ALERT}>
              {refusal}
            </p>
          ) : null}
          <Button label={m.sendAgain} busy={state === "sending"} />
        </form>
      )}
      <p className={NOTE}>{m.sendAgainNote}</p>
    </SubscriptionPage>
  );
}

export type ConfirmClientProps =
  | { readonly view: "before"; readonly headline: string; readonly lead: string; readonly token: string; readonly promise: string }
  | { readonly view: "expired"; readonly headline: string; readonly list: "news" | "availability" };

/** The client draws the whole shell: what sits between the headline and the plate depends on the press. */
export function ConfirmClient(props: ConfirmClientProps) {
  return props.view === "before" ? (
    <Before headline={props.headline} lead={props.lead} token={props.token} promise={props.promise} />
  ) : (
    <Expired headline={props.headline} list={props.list} />
  );
}
