"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { z } from "zod";
import { consoleApiMessage } from "@/console/api-message";
import { consoleMessages } from "@/console/messages";
import { apiRequest } from "@/services/api-client";
import { isDismissal } from "./client";
import type { TapRequest } from "./tap";

// The browser half of a per-action tap (spec §D step 2): ask /api/tap/options to mint a challenge
// bound to these four fields, run the WebAuthn ceremony, then post what it returns to
// /api/tap/verify. Mirrors src/console/keys/client.ts's own ceremony shape -- see that file for
// why apiRequest (not a bare fetch) carries the request, why a dismissed prompt is not a failure,
// and why SOURCE_UNAVAILABLE/INTERNAL get the console's own line instead of apiRequest's technical
// wording. Nothing here hashes, trims or otherwise reshapes the four fields: the database's digest
// must be computed over the very same bytes the action later recomputes it from (tap.ts's own
// note), so they go out exactly as given. The challenge this mints is never spent here either --
// verify only proves a real key answered, and the action the tap approves spends it later.

export type TapOutcome = { readonly kind: "done" } | { readonly kind: "cancelled" } | { readonly kind: "failed"; readonly message: string };


const optionsSchema = z.object({ ok: z.literal(true), options: z.unknown() });
const verifiedSchema = z.object({ ok: z.literal(true) });

function jsonPost(body: unknown): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

/**
 * Same substitution as every other console client's: a real refusal (a genuine HTTP answer) already
 * carries sheet copy, so it passes through unchanged. SOURCE_UNAVAILABLE (the fetch itself failed
 * or timed out) and INTERNAL (the body wasn't the JSON it should have been) are apiRequest's own
 * technical wording, never a line the sheets wrote, so both get the console's one line instead.
 */
/** Runs the tap ceremony for one risky action (spec §D), turning every outcome into a TapOutcome rather than a throw. */
export async function runTap(tap: TapRequest): Promise<TapOutcome> {
  const begun = await apiRequest("/api/tap/options", jsonPost(tap), optionsSchema);
  if (!begun.ok) return { kind: "failed", message: consoleApiMessage(begun.error) };

  let response: Awaited<ReturnType<typeof startAuthentication>>;
  try {
    response = await startAuthentication({ optionsJSON: begun.data.options as never });
  } catch (err) {
    if (isDismissal(err)) return { kind: "cancelled" };
    // consoleMessages.tap.didNotAnswer, not .keys.didNotAnswer: this is TC-01's own fallback for a
    // browser-side ceremony failure, read from TC-01's own copy file so it can diverge from the
    // sign-in step's without hunting down call sites.
    return { kind: "failed", message: consoleMessages.tap.didNotAnswer };
  }

  const verified = await apiRequest("/api/tap/verify", jsonPost({ response }), verifiedSchema);
  return verified.ok ? { kind: "done" } : { kind: "failed", message: consoleApiMessage(verified.error) };
}
