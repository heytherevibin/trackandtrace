"use client";

import { useId, useState } from "react";
import { z } from "zod";
import { messages } from "@/messages";
import { ALERT, FIELD, LABEL, REFUSAL } from "./field-parts";
import { signUp as postSignUp, type SignupAsk, type SignupState } from "./use-signup";

const m = messages.subscribe;
const EMAIL = z.email().max(254);

export type CapturePlace = "band" | "pre-booking";

const BUTTON =
  "press relative inline-flex cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap border font-display font-semibold no-underline disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-45 px-[12.24px] py-[6.8px] text-sm leading-[1.2] border-accent-strong bg-accent-strong text-accent-ink hover:bg-accent-strong-hover active:bg-accent-strong-active";
const LINK = "text-accent-text underline underline-offset-4 hover:text-accent-soft-ink";

/** What differs between the two places: the form, the button, and the two lines around it. */
const PLACE: Record<CapturePlace, { form: string; button: string; sent: string; consent: string }> = {
  band: {
    form: "flex flex-col gap-1.5",
    button: "h-11 shrink-0 px-5",
    sent: "m-0 text-sm text-ink-1/78",
    consent: "mt-2.5 m-0 text-2xs leading-normal text-ink-1/70",
  },
  "pre-booking": {
    form: "mt-3.5 flex max-w-[52ch] flex-col gap-1.5",
    button: "h-11 shrink-0",
    sent: "mt-3.5 m-0 text-sm text-ink-1/78",
    consent: "mt-2.5 m-0 max-w-[60ch] text-2xs leading-normal text-ink-1/70",
  },
};

/**
 * The sign-up form and its consent line. Returns a fragment on purpose: in each place the two are
 * siblings inside the surrounding layout (the band's column, the pre-booking plate), and a
 * wrapper element here would collapse that.
 */
export function SignupCapture({
  place,
  list,
  source,
  signUp = postSignUp,
}: {
  readonly place: CapturePlace;
  readonly list: SignupAsk["list"];
  readonly source: SignupAsk["source"];
  readonly signUp?: (ask: SignupAsk) => Promise<SignupState>;
}) {
  const id = useId();
  const messageId = `${id}-message`;
  const [email, setEmail] = useState("");
  const [state, setState] = useState<SignupState>("idle");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (state === "sending") return;
    const trimmed = email.trim().toLowerCase();
    // Checked here as well as on the route: an address that is not one should not cost a request,
    // and the route's own check is what actually protects the database.
    if (!EMAIL.safeParse(trimmed).success) {
      setState("invalid");
      return;
    }
    setState("sending");
    // `signUp` is injectable: a rejection must not leave the button stuck in `sending`.
    setState(await signUp({ email: trimmed, list, source }).catch((): SignupState => "error"));
  }

  const layout = PLACE[place];
  const message = REFUSAL[state];
  // Only `invalid` is the address's own fault; the rest are the site's.
  const mine = state === "invalid";
  const label = state === "sending" ? m.form.sending : place === "pre-booking" ? m.form.notify : m.form.subscribe;

  const labelled = (
    <>
      <label htmlFor={id} className={LABEL}>
        {m.form.label}
      </label>
      <input
        id={id}
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder={m.form.placeholder}
        className={FIELD}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        {...(message ? { "aria-invalid": mine, "aria-describedby": messageId } : {})}
      />
    </>
  );
  const note = message ? (
    <p id={messageId} role="alert" className={ALERT}>
      {message}
    </p>
  ) : null;
  const button = (
    <button type="submit" aria-busy={state === "sending"} className={`${BUTTON} ${layout.button}`}>
      <span className="inline-flex items-center gap-1.5">{label}</span>
    </button>
  );

  return (
    <>
      {state === "sent" ? (
        <p role="status" className={layout.sent}>
          {m.sent}
        </p>
      ) : (
        // The band stands on nearly every page, and a page can carry a field of its own called "Email", so the band's
        // form is named for what it subscribes to. The pre-booking plate has its own heading and intro.
        <form noValidate onSubmit={submit} className={layout.form} {...(place === "band" ? { "aria-label": m.places.footerColumn } : {})}>
          <div className="flex flex-wrap items-end gap-x-2.5 gap-y-1.5">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">{labelled}</div>
            {button}
          </div>
          {note}
        </form>
      )}
      <p className={layout.consent}>
        {m.form.consent.text}
        <a href="/privacy" className={LINK}>
          {m.form.consent.link}
        </a>
      </p>
    </>
  );
}
