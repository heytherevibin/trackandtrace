"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { Mark } from "@/components/brand/mark";
import { Button } from "@/components/ui/button";
import { Corners } from "@/components/ui/corners";
import { messages } from "@/messages";
import { passkeysUsable, sendMagicLink, signInWithGoogle, signInWithPasskey } from "@/services/auth-client";

// The Sign in B sheet: mark, title, lead, one plate that holds the idle, sent, or
// not-connected state, then the no-account note.

type Phase = "idle" | "sending" | "sent";

const subscribeNever = () => () => undefined;
const noPasskeysOnServer = () => false;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_ID = "email";
const ERROR_ID = "email-error";
/** .btn-block adds full width and a 6.8px top margin; the sheet sets 44px. */
const BLOCK = "mt-[6.8px] h-11";
const STATE_TITLE = "text-3xl leading-[1.12] tracking-head";
const STATE_DETAIL = "text-body leading-[23px] text-ink-1/78";

interface LoginFormProps {
  readonly configured: boolean;
  /** Google is offered only once the provider is switched on for this deployment. */
  readonly google: boolean;
  /** Passkeys are offered once the project has them, and only where the browser can do the ceremony. */
  readonly passkey: boolean;
  readonly error: string | null;
}

export function LoginForm({ configured, google, passkey, error }: LoginFormProps) {
  const m = messages.auth;
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [passkeyWaiting, setPasskeyWaiting] = useState(false);
  // Read on the client only: the server cannot know what the reader's device can do.
  const passkeyReady = useSyncExternalStore(subscribeNever, passkeysUsable, noPasskeysOnServer) && passkey;
  const [message, setMessage] = useState<string | null>(error === "link" ? m.errors.link : null);
  const invalid = message === m.errors.invalidEmail;

  const send = async () => {
    if (phase === "sending") return;
    if (!EMAIL_PATTERN.test(email)) {
      setMessage(m.errors.invalidEmail);
      return;
    }
    setMessage(null);
    setPhase("sending");
    const result = await sendMagicLink(email);
    if (result.ok) {
      setPhase("sent");
      return;
    }
    setPhase("idle");
    setMessage(result.message);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send();
  };

  const continueWithPasskey = async () => {
    if (passkeyWaiting) return;
    setMessage(null);
    setPasskeyWaiting(true);
    const result = await signInWithPasskey();
    setPasskeyWaiting(false);
    if (result.ok) {
      // The browser client wrote the session cookie; the server renders the account from it.
      router.push("/account");
      router.refresh();
      return;
    }
    // A dismissed device prompt carries no message: the reader already knows they closed it.
    if (result.message) setMessage(result.message);
  };

  const continueWithGoogle = async () => {
    setMessage(null);
    const result = await signInWithGoogle();
    if (!result.ok) setMessage(result.message);
  };

  return (
    <section className="mx-auto w-full max-w-[520px] px-6 pb-20 pt-[clamp(40px,7vw,80px)]">
      <Mark size={40} />
      <h1 className="optical-hang mt-6 text-signin tracking-display">{m.title}</h1>
      <p className="mt-3 text-base text-ink-1/78">{google ? m.lead : passkeyReady ? m.leadPasskey : m.leadEmailOnly}</p>

      <div className="blueprint mt-8">
        <Corners />
        <div className="p-6">
          {!configured ? (
            <div role="status" className="flex flex-col gap-3">
              <h2 className={STATE_TITLE}>{m.notConfigured.title}</h2>
              <p className={STATE_DETAIL}>{m.notConfigured.detail}</p>
            </div>
          ) : phase === "sent" ? (
            <div role="status" className="flex flex-col gap-3">
              <h2 className={STATE_TITLE}>{m.sent.title}</h2>
              <p className={STATE_DETAIL}>{m.sent.detail(email)}</p>
              <div className="mt-1.5 flex flex-wrap gap-2.5">
                <Button variant="secondary" onClick={() => void send()}>
                  {m.sent.resend}
                </Button>
                <Button variant="ghost" onClick={() => setPhase("idle")}>
                  {m.sent.change}
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor={EMAIL_ID} className="font-display text-xs font-semibold uppercase leading-normal tracking-caps text-accent-text">
                  {m.email}
                </label>
                <input
                  id={EMAIL_ID}
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder={m.emailPlaceholder}
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setMessage(null);
                  }}
                  aria-invalid={invalid || undefined}
                  aria-describedby={message ? ERROR_ID : undefined}
                  className="well h-11 min-h-9 w-full px-2.5 py-1.5 placeholder:text-ink-3"
                />
                {message ? (
                  <p id={ERROR_ID} role="alert" className="mt-0.5 text-label leading-normal text-accent-soft-ink">
                    {message}
                  </p>
                ) : null}
              </div>
              <Button type="submit" variant="primary" fullWidth className={BLOCK} aria-busy={phase === "sending" || undefined}>
                {phase === "sending" ? m.sending : m.sendLink}
              </Button>
              {passkeyReady ? (
                <Button variant="secondary" fullWidth className={BLOCK} aria-busy={passkeyWaiting || undefined} onClick={() => void continueWithPasskey()}>
                  {passkeyWaiting ? m.passkeyWaiting : m.passkey}
                </Button>
              ) : null}
              {google ? (
                <Button variant="secondary" fullWidth className={BLOCK} onClick={() => void continueWithGoogle()}>
                  {m.google}
                </Button>
              ) : null}
            </form>
          )}
        </div>
      </div>

      <p className="mt-6 text-sm text-ink-1/74">{m.footnote}</p>
      <p className="mt-2.5">
        <Link href="/" className="font-display text-label font-semibold uppercase leading-normal tracking-caps no-underline">
          {m.without} <span aria-hidden="true">→</span>
        </Link>
      </p>
    </section>
  );
}
