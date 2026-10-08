"use client";

import { z } from "zod";
import type { AccountRow } from "@/console/accounts/accounts";
import { consoleApiMessage } from "@/console/api-message";
import { apiRequest } from "@/services/api-client";

// Module 08's network calls, kept out of the components so their tests mock functions rather
// than fetch — the same split the other modules use.

export type Failed = { readonly kind: "failed"; readonly message: string };

// The row is checked on the server (accounts.ts) before it is sent; here only its presence is.
const foundSchema = z.object({ ok: z.literal(true), account: z.custom<AccountRow>((value) => typeof value === "object" && value !== null).nullable() }).strict();
const revealedSchema = z.object({ ok: z.literal(true), address: z.string() }).strict();

function post(body: unknown): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

/** The address goes in the body, never in a URL. The answer is the masked row, or null. */
export async function requestFindAccount(email: string): Promise<{ readonly kind: "done"; readonly account: AccountRow | null } | Failed> {
  const result = await apiRequest("/api/accounts/find", post({ email }), foundSchema);
  return result.ok ? { kind: "done", account: result.data.account } : { kind: "failed", message: consoleApiMessage(result.error) };
}

/** The address comes to the browser once, here, and the database has already recorded that it did. */
export async function requestRevealAccount(id: string): Promise<{ readonly kind: "done"; readonly address: string } | Failed> {
  const result = await apiRequest("/api/accounts/reveal", post({ id }), revealedSchema);
  return result.ok ? { kind: "done", address: result.data.address } : { kind: "failed", message: consoleApiMessage(result.error) };
}
