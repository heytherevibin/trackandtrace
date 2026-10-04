"use client";

import { z } from "zod";
import { consoleApiMessage } from "@/console/api-message";
import type { LeadRow } from "@/console/leads/leads";
import { apiRequest } from "@/services/api-client";

// Module 06's two network calls, kept out of the components so their tests mock functions rather
// than fetch — the same split the other modules use.

export type Failed = { readonly kind: "failed"; readonly message: string };

// The row is checked on the server (leads.ts) before it is sent; here only its presence is.
const foundSchema = z.object({ ok: z.literal(true), lead: z.custom<LeadRow>((value) => typeof value === "object" && value !== null).nullable() }).strict();
const revealedSchema = z.object({ ok: z.literal(true), address: z.string() }).strict();

function post(body: unknown): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

/** The address goes in the body, never in a URL. The answer is the masked row, or null. */
export async function requestFind(email: string): Promise<{ readonly kind: "done"; readonly lead: LeadRow | null } | Failed> {
  const result = await apiRequest("/api/leads/find", post({ email }), foundSchema);
  return result.ok ? { kind: "done", lead: result.data.lead } : { kind: "failed", message: consoleApiMessage(result.error) };
}

/** The address comes to the browser once, here, and the database has already recorded that it did. */
export async function requestReveal(id: string): Promise<{ readonly kind: "done"; readonly address: string } | Failed> {
  const result = await apiRequest("/api/leads/reveal", post({ id }), revealedSchema);
  return result.ok ? { kind: "done", address: result.data.address } : { kind: "failed", message: consoleApiMessage(result.error) };
}
