"use client";

import { useId, useState } from "react";
import { z } from "zod";
import { signUp, type SignupState } from "@/components/subscribe/use-signup";
import { messages } from "@/messages";
import { apiRequest } from "@/services/api-client";

const m = messages.subscribe.page.confirm;
const EMAIL = z.email().max(254);

const LABEL = "font-display text-xs font-semibold uppercase leading-normal tracking-caps text-accent-text";
const FIELD = "well h-11 min-h-9 w-full px-2.5 py-1.5 placeholder:text-ink-3";
const BUTTON =
  "press relative inline-flex cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap border font-display font-semibold no-underline disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-45 px-[12.24px] py-[6.8px] text-sm leading-[1.2] border-accent-strong bg-accent-strong text-accent-ink hover:bg-accent-strong-hover active:bg-accent-strong-active w-full mt-[6.8px] h-11";
const TEXT = "m-0 text-base text-ink-1/78";
const NOTE = "mt-3 m-0 text-sm text-ink-1/70";

const answer = z.object({ ok: z.literal(true), state: z.string() });

function Status({ children }: { readonly children: string }) {
  return (
    <div role="status" className="flex flex-col gap-3">
      <p className={TEXT}>{children}</p>
    </div>
  );
}

function Button({ label, busy }: { readonly label: string; readonly busy: boolean }) {
  return (
    <button type="submit" aria-busy={busy} className={BUTTON}>
      <span className="inline-flex items-center gap-1.5">{label}</span>
    </button>
  );
}

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

/** The Before state: opening the link changed nothing, and only this button confirms. */
function Before({ token, promise }: { readonly token: string; readonly promise: string }) {
  const [pressed, setPressed] = useState<Pressed>("idle");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pressed === "pressing") return;
    setPressed("pressing");
    setPressed(await press(token).catch((): Pressed => "error"));
  }

  if (pressed === "subscribed") return <Status>{m.after}</Status>;
  if (pressed === "already") return <Status>{m.already}</Status>;
  return (
    <>
      <p className={TEXT}>{promise}</p>
      {pressed === "error" ? <Status>{messages.subscribe.errors.failed}</Status> : null}
      <form noValidate onSubmit={submit}>
        <Button label={m.button} busy={pressed === "pressing"} />
      </form>
    </>
  );
}

/** Which answers put a message in place of the form. Everything but a sent link leaves the form standing. */
const REFUSAL: Partial<Record<SignupState, string>> = {
  invalid: messages.subscribe.errors.invalid,
  limited: messages.subscribe.errors.limited,
  dailyLimit: messages.subscribe.errors.dailyLimit,
  error: messages.subscribe.errors.failed,
};

/** The expired link: the page holds no address, so the person types theirs and asks again. */
function Expired({ list }: { readonly list: "news" | "availability" }) {
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
    <>
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
            <p id={`${id}-message`} role="alert" className="mt-0.5 text-label leading-normal text-accent-soft-ink">
              {refusal}
            </p>
          ) : null}
          <Button label={m.sendAgain} busy={state === "sending"} />
        </form>
      )}
      <p className={NOTE}>{m.sendAgainNote}</p>
    </>
  );
}

export type ConfirmClientProps =
  | { readonly view: "before"; readonly token: string; readonly promise: string }
  | { readonly view: "expired"; readonly list: "news" | "availability" };

export function ConfirmClient(props: ConfirmClientProps) {
  return props.view === "before" ? <Before token={props.token} promise={props.promise} /> : <Expired list={props.list} />;
}
