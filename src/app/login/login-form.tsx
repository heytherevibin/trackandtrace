"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Mark } from "@/components/brand/mark";
import { Button, buttonClassName } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { messages } from "@/messages";
import { sendMagicLink, signInWithGoogle } from "@/services/auth-client";

type Phase = "idle" | "sending" | "sent";

export function LoginForm({ configured, error }: { readonly configured: boolean; readonly error: string | null }) {
  const m = messages.auth;
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(error === "link" ? m.errors.link : null);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validEmail) {
      setMessage(m.errors.invalidEmail);
      return;
    }
    setPhase("sending");
    const result = await sendMagicLink(email);
    if (result.ok) {
      setPhase("sent");
      setMessage(null);
    } else {
      setPhase("idle");
      setMessage(result.message);
    }
  };

  return (
    <section className="mx-auto w-full max-w-narrow px-4 py-12 sm:px-6">
      <Mark size={40} />
      <h1 className="mt-6 text-3xl">{m.title}</h1>
      <p className="mt-2 text-ink-2">{m.lead}</p>
      <div className="mt-8">
        {!configured ? (
          <UnavailableState title={m.notConfigured.title} detail={m.notConfigured.detail} />
        ) : phase === "sent" ? (
          <div className="panel p-6" role="status">
            <h2 className="text-xl">{m.sent.title}</h2>
            <p className="mt-2 text-ink-2">{m.sent.detail(email)}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void submit(new Event("submit") as unknown as FormEvent)}>
                {m.sent.resend}
              </Button>
              <Button variant="ghost" onClick={() => setPhase("idle")}>
                {m.sent.change}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="panel flex flex-col gap-4 p-6" noValidate>
            <Field name="email" invalid={message === m.errors.invalidEmail}>
              <FieldLabel>{m.email}</FieldLabel>
              <Input type="email" autoComplete="email" inputMode="email" placeholder={m.emailPlaceholder} value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Button type="submit" variant="run" size="lg" loading={phase === "sending"} disabled={email.length === 0}>
              {m.sendLink}
            </Button>
            <Button type="button" variant="secondary" size="lg" onClick={() => void signInWithGoogle()}>
              {m.google}
            </Button>
          </form>
        )}
        {message ? <ErrorState className="mt-4" title={message} detail={undefined} /> : null}
      </div>
      <p className="mt-6 text-sm text-ink-2">{m.footnote}</p>
      <Link href="/" className={buttonClassName({ variant: "ghost", size: "sm", className: "-ml-3 mt-2" })}>
        {m.without}
      </Link>
    </section>
  );
}
