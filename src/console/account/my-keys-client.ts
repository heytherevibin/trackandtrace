"use client";

import { z } from "zod";
import type { MyKeys } from "@/console/account/my-keys";
import { consoleApiMessage } from "@/console/api-message";
import { apiRequest } from "@/services/api-client";

// The browser-side calls the My keys page's client component needs beyond its first, server-
// rendered paint: re-reading the list after a mutation, and sending a rename. Kept separate from
// src/console/keys/client.ts, which is specifically "the browser half of every ceremony" (its own
// comment) -- neither of these two calls runs a WebAuthn ceremony.

const myKeysResponseSchema = z.object({
  ok: z.literal(true),
  keys: z.array(
    z.object({
      id: z.guid(),
      name: z.string().min(1).max(60),
      type: z.enum(["passkey", "security_key"]),
      createdAt: z.string(),
      lastUsedAt: z.string().nullable(),
    }),
  ),
  member: z.object({
    name: z.string().min(1).max(120),
    email: z.string().min(3).max(254),
    role: z.enum(["owner", "admin", "support", "viewer"]),
    createdAt: z.string(),
  }),
});

/**
 * Re-reads GET /api/keys/mine -- the table's own source of truth after an add or a rename lands
 * (task-7-addendum.md §4: refresh from the server rather than patch local state by hand). `null` on
 * any refusal: the mutation itself already succeeded or failed on its own terms by the time this
 * runs, so a refresh that cannot complete leaves the table showing its last-known-good rows rather
 * than crashing the page.
 */
export async function fetchMyKeys(): Promise<MyKeys | null> {
  const result = await apiRequest("/api/keys/mine", { method: "GET" }, myKeysResponseSchema);
  return result.ok ? { keys: result.data.keys, member: result.data.member } : null;
}

export type RenameOutcome = { readonly kind: "done" } | { readonly kind: "failed"; readonly message: string };

const renamedSchema = z.object({ ok: z.literal(true) });

/** No tap, deliberately (task-7-addendum.md §2.3): one PATCH is the whole request, no ceremony first. */
export async function renameKey(keyId: string, name: string): Promise<RenameOutcome> {
  const result = await apiRequest(
    "/api/keys/mine",
    { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ keyId, name }) },
    renamedSchema,
  );
  return result.ok ? { kind: "done" } : { kind: "failed", message: consoleApiMessage(result.error) };
}
