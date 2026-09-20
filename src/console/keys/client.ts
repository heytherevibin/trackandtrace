"use client";

import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { consoleMessages } from "@/console/messages";

// The browser half of every ceremony (spec §D): ask the server for options, run the
// @simplewebauthn/browser ceremony, then post what it returns. Every outcome becomes one of three
// shapes -- done, cancelled, or failed with a line the member can read -- never a raw thrown error.

const m = consoleMessages.keys;

/** What every ceremony shares once it stops short of "done": dismissed, or failed with a line to show. */
type FailureOutcome = { readonly kind: "cancelled" } | { readonly kind: "failed"; readonly message: string };

export type CeremonyOutcome = { readonly kind: "done" } | FailureOutcome;

export type AddKeyOutcome = { readonly kind: "done"; readonly keyCount: number; readonly activated: boolean } | FailureOutcome;

/** Whether this browser can run a ceremony at all (the sheet's "can't use security keys" state). */
export function keysUsable(): boolean {
  return typeof window !== "undefined" && browserSupportsWebAuthn();
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok || payload.ok !== true) {
    throw new Error(typeof payload.message === "string" ? payload.message : m.didNotAnswer);
  }
  return payload;
}

/** A prompt the member dismissed is not a failure: it gets no line of its own (decision #2). */
function isDismissal(err: unknown): boolean {
  return err instanceof Error && (err.name === "NotAllowedError" || err.name === "AbortError");
}

function failure(err: unknown): FailureOutcome {
  if (isDismissal(err)) return { kind: "cancelled" };
  return { kind: "failed", message: err instanceof Error && err.message ? err.message : m.didNotAnswer };
}

export async function tapToSignIn(): Promise<CeremonyOutcome> {
  try {
    const begun = await post("/api/keys/options", { intent: "sign_in" });
    const response = await startAuthentication({ optionsJSON: begun.options as never });
    await post("/api/keys/verify", { intent: "sign_in", response });
    return { kind: "done" };
  } catch (err) {
    return failure(err);
  }
}

/** The server alone decides whether a tap comes first: it knows how many keys this member holds. */
async function resolveRegistrationOptions(begun: Record<string, unknown>): Promise<unknown> {
  if (begun.step !== "tap") return begun.options;
  const tap = await startAuthentication({ optionsJSON: begun.options as never });
  const unlocked = await post("/api/keys/verify", { intent: "add_key", step: "tap", response: tap });
  return unlocked.options;
}

export async function addKey(name: string): Promise<AddKeyOutcome> {
  try {
    const begun = await post("/api/keys/options", { intent: "add_key" });
    const registrationOptions = await resolveRegistrationOptions(begun);
    const response = await startRegistration({ optionsJSON: registrationOptions as never });
    const done = await post("/api/keys/verify", { intent: "add_key", step: "register", name, response });
    return { kind: "done", keyCount: Number(done.keyCount ?? 0), activated: done.activated === true };
  } catch (err) {
    return failure(err);
  }
}
