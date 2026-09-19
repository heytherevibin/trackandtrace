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
  | { readonly kind: "email"; readonly error: string | null; readonly blocked: boolean }
  | { readonly kind: "sending" }
  | { readonly kind: "sent"; readonly wait: number };

/** Console Sign In (Form TC-02): the email states. The key step arrives with sessions (plan 2c). */
export function SignInForm() {
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "email", error: null, blocked: false });
  const emailRef = useRef<HTMLInputElement>(null);
  const sentRef = useRef<HTMLHeadingElement>(null);
  // One request in flight at a time: a fresh submit, or unmount, retires whichever came before it.
  const abortRef = useRef<AbortController | null>(null);

  // One tick a second while "Send again in N s" counts down.
  useEffect(() => {
    if (stage.kind !== "sent" || stage.wait === 0) return;
    const timer = window.setTimeout(() => setStage({ kind: "sent", wait: stage.wait - 1 }), 1000);
    return () => window.clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    if (stage.kind === "sent" && stage.wait === RESEND_AFTER_SECONDS) sentRef.current?.focus();
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
      setStage({ kind: "sent", wait: RESEND_AFTER_SECONDS });
      return;
    }
    setStage({ kind: "email", error: result.error.message, blocked: result.error.code === "RATE_LIMITED" });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const address = email.trim();
    if (!EMAIL.safeParse(address).success) {
      setStage({ kind: "email", error: m.invalid, blocked: false });
      return;
    }
    void send(address);
  }

  function differentEmail(): void {
    setStage({ kind: "email", error: null, blocked: false });
    window.setTimeout(() => emailRef.current?.focus(), 0);
  }

  const sending = stage.kind === "sending";
  return (
    <section className="blueprint" aria-labelledby="console-sign-in-plate">
      <Corners />
      {sending ? <SweepBar /> : null}
      <PlateHeader title={m.plate} titleId="console-sign-in-plate" cells="tight" meta={[m.form]} />
      <div className="flex flex-col gap-4 px-4 py-5 sm:p-6">
        {stage.kind === "sent" ? (
          <>
            <h2 ref={sentRef} tabIndex={-1} className="text-3xl tracking-head outline-none">
              {m.sent.title}
            </h2>
            <p className="text-body text-ink-2">{m.sent.detail}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" className="max-sm:h-11" disabled={stage.wait > 0} onClick={() => void send(email.trim())}>
                {stage.wait > 0 ? m.sent.againIn(stage.wait) : m.sent.again}
              </Button>
              <Button variant="ghost" className="max-sm:h-11" onClick={differentEmail}>
                {m.sent.different}
              </Button>
            </div>
          </>
        ) : (
          <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field invalid={stage.kind === "email" && stage.error !== null}>
              <FieldLabel>{m.emailLabel}</FieldLabel>
              <Input
                ref={emailRef}
                type="email"
                autoComplete="email"
                placeholder={m.emailPlaceholder}
                value={email}
                disabled={sending}
                onChange={(event) => setEmail(event.currentTarget.value)}
                size="sm"
                className="text-sm max-sm:h-11 max-sm:text-base"
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
