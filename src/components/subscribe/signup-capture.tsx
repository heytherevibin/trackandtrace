"use client";

import { useId, useState } from "react";
import { z } from "zod";
import { messages } from "@/messages";
import { ALERT, FIELD, LABEL, REFUSAL } from "./field-parts";
import { signUp as postSignUp, type SignupAsk, type SignupState } from "./use-signup";

const m = messages.subscribe;
const EMAIL = z.email().max(254);

export type CapturePlace = "band" | "pre-booking";

// v4 .btn.primary and v4's links.
const BUTTON =
  "nb-press relative inline-flex cursor-pointer select-none items-center justify-center gap-2 max-w-full shrink-0 whitespace-normal rounded-control border-2 border-edge bg-accent px-4 font-structure text-sm font-bold leading-5 text-on-fill no-underline shadow-control hover:bg-lime disabled:cursor-not-allowed disabled:opacity-55 aria-disabled:cursor-not-allowed aria-disabled:opacity-55";
const LINK = "text-link underline decoration-2 underline-offset-3 hover:bg-accent hover:text-on-fill";

/** What differs between the two places: the form, the button, and the two lines around it. */
const PLACE: Record<CapturePlace, { form: string; button: string; sent: string; consent: string }> = {
  band: {
    form: "flex flex-col gap-1.5",
    button: "h-11 flex-[1_0_auto] px-5",
    sent: "m-0 text-sm text-ink-2",
    consent: "mt-2.5 m-0 font-figure text-xs leading-4 text-ink-3",
  },
  "pre-booking": {
    form: "mt-3.5 flex max-w-[52ch] flex-col gap-1.5",
    button: "h-11 flex-[1_0_auto]",
    sent: "mt-3.5 m-0 text-sm text-ink-2",
    consent: "mt-2.5 m-0 max-w-[60ch] font-figure text-xs leading-4 text-ink-3",
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
          {/* One row while the field keeps its floor, 7.5rem, which follows the text's size; when the button no longer
              fits beside that, it goes under the field and both are the form wide (text at 200% on a phone: the field
              was 55px at 280px, never wrapping). Beside the field the button keeps its own width: its share of the
              row's spare room is one part in a hundred thousand. */}
          <div className="flex flex-wrap items-end gap-x-2.5 gap-y-1.5">
            <div className="flex min-w-0 flex-[99999_1_7.5rem] flex-col gap-1.5">{labelled}</div>
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
