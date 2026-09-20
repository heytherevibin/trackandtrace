"use client";

import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { z } from "zod";
import { consoleMessages } from "@/console/messages";
import { apiRequest } from "@/services/api-client";
import type { ApiErrorBody } from "@/services/errors";

// The browser half of every ceremony (spec §D): ask the server for options, run the
// @simplewebauthn/browser ceremony, then post what it returns. Every outcome becomes one of three
// shapes -- done, cancelled, or failed with a line the member can read -- never a raw thrown error.
// apiRequest (not a bare fetch) carries the request: it fails closed on a network error, treats a
// malformed body as an error rather than data, validates the shape of a real one, and times out.

const m = consoleMessages.keys;
const s = consoleMessages.session;

/** What every ceremony shares once it stops short of "done": dismissed, or failed with a line to show. */
type FailureOutcome = { readonly kind: "cancelled" } | { readonly kind: "failed"; readonly message: string };

export type CeremonyOutcome = { readonly kind: "done" } | FailureOutcome;

export type AddKeyOutcome = { readonly kind: "done"; readonly keyCount: number; readonly activated: boolean } | FailureOutcome;

/** Whether this browser can run a ceremony at all (the sheet's "can't use security keys" state). */
export function keysUsable(): boolean {
  return typeof window !== "undefined" && browserSupportsWebAuthn();
}

const optionsSchema = z.object({ ok: z.literal(true), step: z.enum(["tap", "register"]), options: z.unknown() });
const signInVerifiedSchema = z.object({ ok: z.literal(true), next: z.string() });
const tapVerifiedSchema = z.object({ ok: z.literal(true), step: z.literal("register"), options: z.unknown() });
const registeredSchema = z.object({ ok: z.literal(true), keyCount: z.number(), activated: z.boolean(), next: z.string().nullable() });

function jsonPost(body: unknown): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

/**
 * When the refusal is one of ours (a real HTTP answer with an error envelope), its message is
 * already sheet copy -- pass it through unchanged. When the server never spoke at all
 * (`SOURCE_UNAVAILABLE`: the fetch itself failed or timed out; `INTERNAL`: the body wasn't the
 * JSON it should have been), that message is apiRequest's own technical wording, not a line the
 * sheets wrote, so it's replaced with the console's one line for "couldn't reach it."
 */
function messageFor(error: ApiErrorBody): string {
  return error.code === "SOURCE_UNAVAILABLE" || error.code === "INTERNAL" ? s.unavailable : error.message;
}

/** A prompt the member dismissed is not a failure: it gets no line of its own (decision #2). */
function isDismissal(err: unknown): boolean {
  return err instanceof Error && (err.name === "NotAllowedError" || err.name === "AbortError");
}

/** Runs one WebAuthn call, turning a dismissed or failed prompt into an outcome rather than a throw. */
async function runCeremony<T>(run: () => Promise<T>): Promise<{ readonly kind: "done"; readonly response: T } | FailureOutcome> {
  try {
    return { kind: "done", response: await run() };
  } catch (err) {
    if (isDismissal(err)) return { kind: "cancelled" };
    return { kind: "failed", message: err instanceof Error && err.message ? err.message : m.didNotAnswer };
  }
}

export async function tapToSignIn(): Promise<CeremonyOutcome> {
  const begun = await apiRequest("/api/keys/options", jsonPost({ intent: "sign_in" }), optionsSchema);
  if (!begun.ok) return { kind: "failed", message: messageFor(begun.error) };

  const tapped = await runCeremony(() => startAuthentication({ optionsJSON: begun.data.options as never }));
  if (tapped.kind !== "done") return tapped;

  const verified = await apiRequest("/api/keys/verify", jsonPost({ intent: "sign_in", response: tapped.response }), signInVerifiedSchema);
  return verified.ok ? { kind: "done" } : { kind: "failed", message: messageFor(verified.error) };
}

/** The server alone decides whether a tap comes first: it knows how many keys this member holds. */
async function resolveRegistrationOptions(begun: {
  readonly step: "tap" | "register";
  readonly options: unknown;
}): Promise<{ readonly kind: "done"; readonly options: unknown } | FailureOutcome> {
  if (begun.step !== "tap") return { kind: "done", options: begun.options };

  const tapped = await runCeremony(() => startAuthentication({ optionsJSON: begun.options as never }));
  if (tapped.kind !== "done") return tapped;

  const unlocked = await apiRequest("/api/keys/verify", jsonPost({ intent: "add_key", step: "tap", response: tapped.response }), tapVerifiedSchema);
  if (!unlocked.ok) return { kind: "failed", message: messageFor(unlocked.error) };
  return { kind: "done", options: unlocked.data.options };
}

export async function addKey(name: string): Promise<AddKeyOutcome> {
  const begun = await apiRequest("/api/keys/options", jsonPost({ intent: "add_key" }), optionsSchema);
  if (!begun.ok) return { kind: "failed", message: messageFor(begun.error) };

  const resolved = await resolveRegistrationOptions(begun.data);
  if (resolved.kind !== "done") return resolved;

  const registered = await runCeremony(() => startRegistration({ optionsJSON: resolved.options as never }));
  if (registered.kind !== "done") return registered;

  const done = await apiRequest(
    "/api/keys/verify",
    jsonPost({ intent: "add_key", step: "register", name, response: registered.response }),
    registeredSchema,
  );
  if (!done.ok) return { kind: "failed", message: messageFor(done.error) };
  return { kind: "done", keyCount: done.data.keyCount, activated: done.data.activated };
}
