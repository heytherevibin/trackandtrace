"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Corners } from "@/components/ui/corners";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PlateHeader } from "@/components/ui/plate";
import { SweepBar } from "@/components/ui/sweep-bar";
import { consoleMessages } from "@/console/messages";
import { apiRequest } from "@/services/api-client";

const m = consoleMessages.signIn;
const RESEND_AFTER_SECONDS = 60;
const EMAIL = z.email();
const SENT = z.object({ ok: z.literal(true) });

type Stage =
  | { readonly kind: "email"; readonly error: string | null; readonly invalid: boolean; readonly blocked: boolean }
  | { readonly kind: "sending" }
  | { readonly kind: "sent"; readonly deadline: number };

/** Seconds left until `deadline`, clamped at 0: derived from elapsed wall-clock time, never a per-render decrement, so a backgrounded tab still lands on the right number once it wakes. */
function secondsUntil(deadline: number): number {
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

/** Console Sign In (Form TC-02): the email states. The key step arrives with sessions (plan 2c). */
export function SignInForm() {
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "email", error: null, invalid: false, blocked: false });
  const [tick, setTick] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);
  const sentRef = useRef<HTMLHeadingElement>(null);
  // One request in flight at a time: a fresh submit, or unmount, retires whichever came before it.
  const abortRef = useRef<AbortController | null>(null);
  // What the previous render's stage was, so a failure can be told apart from every other way
  // the email stage is reached (first render, "Use a different email").
  const previousStageKindRef = useRef<Stage["kind"]>(stage.kind);

  // One tick a second while "Send again in N s" counts down, just to force the re-render that
  // reads the clock again; the deadline itself never changes, so this never drifts.
  useEffect(() => {
    if (stage.kind !== "sent" || secondsUntil(stage.deadline) === 0) return;
    const timer = window.setTimeout(() => setTick((n) => n + 1), 1000);
    return () => window.clearTimeout(timer);
  }, [stage, tick]);

  useEffect(() => {
    if (stage.kind === "sent") sentRef.current?.focus();
  }, [stage]);

  // A failed send returns to the email stage with the field disabled a moment ago; give it focus
  // back rather than leaving it on <body>. Never on first render: only a genuine "sending" → "email"
  // transition counts.
  useEffect(() => {
    const previous = previousStageKindRef.current;
    previousStageKindRef.current = stage.kind;
    if (previous === "sending" && stage.kind === "email") emailRef.current?.focus();
  }, [stage]);

  // Retire any in-flight request when the form goes away, so its answer never lands on a gone component.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(address: string): Promise<void> {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStage({ kind: "sending" });
    const result = await apiRequest(
      "/api/sign-in",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: address }), signal: controller.signal },
      SENT,
    );
    if (controller.signal.aborted) return;
    if (result.ok) {
      setStage({ kind: "sent", deadline: Date.now() + RESEND_AFTER_SECONDS * 1000 });
      return;
    }
    // The address is only ever "invalid" for a malformed input, never for a rate limit or an
    // unreachable console: the request count is what's limited, not the email itself, and a
    // failure to reach the server says nothing about the address either. The drawings have no
    // failure state of their own for that last case, so it gets the console's own sentence.
    const { code } = result.error;
    const recognized = code === "RATE_LIMITED" || code === "INVALID_INPUT";
    setStage({ kind: "email", error: recognized ? result.error.message : m.unreachable, invalid: code === "INVALID_INPUT", blocked: code === "RATE_LIMITED" });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const address = email.trim();
    if (!EMAIL.safeParse(address).success) {
      setStage({ kind: "email", error: m.invalid, invalid: true, blocked: false });
      return;
    }
    void send(address);
  }

  function differentEmail(): void {
    setStage({ kind: "email", error: null, invalid: false, blocked: false });
    window.setTimeout(() => emailRef.current?.focus(), 0);
  }

  // "Too many" would otherwise be a dead end until reload: editing the address is reasonable
  // grounds to let the person try again, so it clears the block along with its message. No
  // retryAfter timer: the drawing shows the button disabled, and clearing on edit is the
  // smallest honest fix.
  function onEmailChange(value: string): void {
    setEmail(value);
    setStage((current) => (current.kind === "email" && current.blocked ? { ...current, error: null, blocked: false } : current));
  }

  const sending = stage.kind === "sending";
  return (
    <section className="blueprint" aria-labelledby="console-sign-in-plate">
      <Corners />
      {sending ? <SweepBar /> : null}
      <PlateHeader title={m.plate} titleId="console-sign-in-plate" cells="tight" meta={[m.form]} stack={false} />
      <div className="flex flex-col gap-4 px-4 py-5 sm:p-6">
        {stage.kind === "sent" ? (
          <>
            <h2 ref={sentRef} tabIndex={-1} className="text-3xl tracking-head outline-none">
              {m.sent.title}
            </h2>
            <p className="text-body text-ink-2">{m.sent.detail}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" className="max-sm:h-11" disabled={secondsUntil(stage.deadline) > 0} onClick={() => void send(email.trim())}>
                {secondsUntil(stage.deadline) > 0 ? m.sent.againIn(secondsUntil(stage.deadline)) : m.sent.again}
              </Button>
              <Button variant="ghost" className="max-sm:h-11" onClick={differentEmail}>
                {m.sent.different}
              </Button>
            </div>
          </>
        ) : (
          <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field invalid={stage.kind === "email" && stage.invalid}>
              <FieldLabel>{m.emailLabel}</FieldLabel>
              <Input
                ref={emailRef}
                type="email"
                autoComplete="email"
                placeholder={m.emailPlaceholder}
                value={email}
                disabled={sending}
                onChange={(event) => onEmailChange(event.currentTarget.value)}
                size="sm"
                className="text-sm max-sm:h-11 max-sm:text-base disabled:opacity-100"
              />
              {stage.kind === "email" && stage.error ? (
                <FieldError match role="alert">
                  {stage.error}
                </FieldError>
              ) : null}
            </Field>
            <Button type="submit" variant="primary" fullWidth className="max-sm:h-11" disabled={sending || (stage.kind === "email" && stage.blocked)}>
              {sending ? m.sending : m.send}
            </Button>
            <p className="text-label text-ink-3">{m.legend}</p>
          </form>
        )}
      </div>
    </section>
  );
}
