"use client";

import { z } from "zod";
import { consoleApiMessage } from "@/console/api-message";
import { apiRequest } from "@/services/api-client";

// Module 04's three network calls, kept out of the components so their tests mock functions rather
// than fetch — the same split team-client.ts and settings-client.ts use.

export type Outcome = { readonly kind: "done" } | { readonly kind: "failed"; readonly message: string };
export type HashOutcome = { readonly kind: "done"; readonly member: string } | { readonly kind: "failed"; readonly message: string };

const hashedSchema = z.object({ ok: z.literal(true), member: z.string() }).strict();
const doneSchema = z.object({ ok: z.literal(true) }).strict();

function post(body: unknown): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

/** The address goes to the server once, here, and comes back as the hash it is stored under. */
export async function hashAddress(address: string): Promise<HashOutcome> {
  const result = await apiRequest("/api/abuse/hash", post({ address }), hashedSchema);
  return result.ok ? { kind: "done", member: result.data.member } : { kind: "failed", message: consoleApiMessage(result.error) };
}

export async function requestBlock(ask: { readonly member: string; readonly duration: string; readonly note: string; readonly reason: string }): Promise<Outcome> {
  const result = await apiRequest("/api/abuse/block", post(ask), doneSchema);
  return result.ok ? { kind: "done" } : { kind: "failed", message: consoleApiMessage(result.error) };
}

export async function requestUnblock(ask: { readonly member: string; readonly reason: string }): Promise<Outcome> {
  const result = await apiRequest("/api/abuse/unblock", post(ask), doneSchema);
  return result.ok ? { kind: "done" } : { kind: "failed", message: consoleApiMessage(result.error) };
}
