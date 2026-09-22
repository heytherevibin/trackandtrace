"use client";

import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { z } from "zod";
import { consoleApiMessage } from "@/console/api-message";
import { consoleMessages } from "@/console/messages";
import { apiRequest } from "@/services/api-client";
import type { ConsoleKeyKind } from "./kind";

// The browser half of every ceremony (spec §D): ask the server for options, run the
// @simplewebauthn/browser ceremony, then post what it returns. Every outcome becomes one of three
// shapes -- done, cancelled, or failed with a line the member can read -- never a raw thrown error.
// apiRequest (not a bare fetch) carries the request: it fails closed on a network error, treats a
// malformed body as an error rather than data, validates the shape of a real one, and times out.

const m = consoleMessages.keys;

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
/** A prompt the member dismissed is not a failure: it gets no line of its own (decision #2). Exported so tap-client.ts's runTap shares this exact check rather than keeping a second copy. */
export function isDismissal(err: unknown): boolean {
  return err instanceof Error && (err.name === "NotAllowedError" || err.name === "AbortError");
}

/**
 * `excludeCredentials` makes the browser itself throw before any request reaches our server: Task 9's
 * `consoleApiMessage` only ever sees a real HTTP answer, so it never gets the chance to replace this one's
 * wording. `@simplewebauthn/browser` wraps the raw DOMException in its own `WebAuthnError`, which
 * keeps the DOM error's own `name` ("InvalidStateError") and adds a `code` naming why
 * ("ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") -- checking both is what survives either the browser
 * throwing the bare DOMException directly or the wrapped form, whichever a given browser surfaces.
 */
function isPreviouslyRegistered(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "InvalidStateError") return true;
  const code = (err as { readonly code?: unknown }).code;
  return code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED";
}

/**
 * Runs one WebAuthn call, turning a dismissed or failed prompt into an outcome rather than a throw.
 * A failure's own `message` is the browser's technical wording (e.g. "The authenticator was
 * previously registered"), never a line the sheets wrote, so it never reaches the member directly --
 * matching Ruling 30's rule for a server refusal's *absence*, not just its presence. The one browser
 * failure with a sheet line of its own (the same key twice) is named; every other one falls back to
 * the console's own "didn't answer".
 */
async function runCeremony<T>(run: () => Promise<T>): Promise<{ readonly kind: "done"; readonly response: T } | FailureOutcome> {
  try {
    return { kind: "done", response: await run() };
  } catch (err) {
    if (isDismissal(err)) return { kind: "cancelled" };
    if (isPreviouslyRegistered(err)) return { kind: "failed", message: m.alreadyAdded };
    return { kind: "failed", message: m.didNotAnswer };
  }
}

export async function tapToSignIn(): Promise<CeremonyOutcome> {
  const begun = await apiRequest("/api/keys/options", jsonPost({ intent: "sign_in" }), optionsSchema);
  if (!begun.ok) return { kind: "failed", message: consoleApiMessage(begun.error) };

  const tapped = await runCeremony(() => startAuthentication({ optionsJSON: begun.data.options as never }));
  if (tapped.kind !== "done") return tapped;

  const verified = await apiRequest("/api/keys/verify", jsonPost({ intent: "sign_in", response: tapped.response }), signInVerifiedSchema);
  return verified.ok ? { kind: "done" } : { kind: "failed", message: consoleApiMessage(verified.error) };
}

/**
 * The server alone decides whether a tap comes first: it knows how many keys this member holds.
 *
 * `keyKind` travels with the tap because whichever of the two routes ends up minting the
 * registration options is the one that has to hear it -- this one does for every key after the
 * first, which is exactly the member in the defect report. Named `keyKind`, not `kind`, because
 * `kind` already means "which outcome is this" on every shape in this module.
 */
async function resolveRegistrationOptions(
  begun: { readonly step: "tap" | "register"; readonly options: unknown },
  keyKind: ConsoleKeyKind,
): Promise<{ readonly kind: "done"; readonly options: unknown } | FailureOutcome> {
  if (begun.step !== "tap") return { kind: "done", options: begun.options };

  const tapped = await runCeremony(() => startAuthentication({ optionsJSON: begun.options as never }));
  if (tapped.kind !== "done") return tapped;

  const unlocked = await apiRequest(
    "/api/keys/verify",
    jsonPost({ intent: "add_key", step: "tap", kind: keyKind, response: tapped.response }),
    tapVerifiedSchema,
  );
  if (!unlocked.ok) return { kind: "failed", message: consoleApiMessage(unlocked.error) };
  return { kind: "done", options: unlocked.data.options };
}

/**
 * `keyKind` is what the member said they are about to present, and it decides one thing: which
 * sheet the browser opens. It is sent with the two calls that mint registration options and with
 * neither of the two that do not -- in particular not with the register step, which records the
 * key: the type stored there is read off the attestation on the server, never off this.
 */
export async function addKey(name: string, keyKind: ConsoleKeyKind): Promise<AddKeyOutcome> {
  const begun = await apiRequest("/api/keys/options", jsonPost({ intent: "add_key", kind: keyKind }), optionsSchema);
  if (!begun.ok) return { kind: "failed", message: consoleApiMessage(begun.error) };

  const resolved = await resolveRegistrationOptions(begun.data, keyKind);
  if (resolved.kind !== "done") return resolved;

  const registered = await runCeremony(() => startRegistration({ optionsJSON: resolved.options as never }));
  if (registered.kind !== "done") return registered;

  const done = await apiRequest(
    "/api/keys/verify",
    jsonPost({ intent: "add_key", step: "register", name, response: registered.response }),
    registeredSchema,
  );
  if (!done.ok) return { kind: "failed", message: consoleApiMessage(done.error) };
  return { kind: "done", keyCount: done.data.keyCount, activated: done.data.activated };
}
