"use client";

import { z } from "zod";
import { KEY_NAME_MAX } from "@/console/account/key-name";
import type { MyKeys } from "@/console/account/my-keys";
import type { MySessionRow } from "@/console/account/my-sessions";
import { consoleApiMessage } from "@/console/api-message";
import { apiRequest } from "@/services/api-client";

// The browser-side calls the My keys page's client components need beyond their first, server-
// rendered paint: re-reading the keys or the sessions after a mutation, sending a rename, and
// signing the other sessions out. Kept separate from src/console/keys/client.ts, which is
// specifically "the browser half of every ceremony" (its own comment) -- none of these calls runs a
// WebAuthn ceremony, sign-out-others included (task-9: no tap).

const myKeysResponseSchema = z.object({
  ok: z.literal(true),
  keys: z.array(
    z.object({
      id: z.guid(),
      name: z.string().min(1).max(KEY_NAME_MAX),
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

export type RemoveOutcome = { readonly kind: "done" } | { readonly kind: "failed"; readonly message: string };

const removedSchema = z.object({ ok: z.literal(true) });

/**
 * The delete half of Remove (task-8, spec §D step 3) -- called only after ConfirmItsYou's
 * `onConfirmed` fires (a completed tap), never before. `reason` goes out exactly as the member
 * typed it, the same as `runTap` sends it to the mint: only the route's own `tapReason` import ever
 * trims and digests it (task-8-addendum.md §3), so a second trim here would risk the two disagreeing.
 */
export async function removeKey(keyId: string, reason: string): Promise<RemoveOutcome> {
  const result = await apiRequest(
    "/api/keys/mine",
    { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ keyId, reason }) },
    removedSchema,
  );
  return result.ok ? { kind: "done" } : { kind: "failed", message: consoleApiMessage(result.error) };
}

const mySessionsResponseSchema = z.object({
  ok: z.literal(true),
  sessions: z.array(
    z.object({
      id: z.guid(),
      deviceLabel: z.string().min(1).max(120),
      lastSeenAt: z.string(),
      createdAt: z.string(),
      isCurrent: z.boolean(),
    }),
  ),
});

/**
 * Re-reads GET /api/sessions -- the Sessions plate's own source of truth after a sign-out-others
 * lands, the same "refresh from the server rather than patch local state by hand" rule KeysPlate's
 * own fetchMyKeys follows. `null` on any refusal, for the same reason: the mutation already
 * succeeded or failed on its own terms by the time this runs.
 */
export async function fetchMySessions(): Promise<readonly MySessionRow[] | null> {
  const result = await apiRequest("/api/sessions", { method: "GET" }, mySessionsResponseSchema);
  return result.ok ? result.data.sessions : null;
}

export type SignOutOthersOutcome = { readonly kind: "done"; readonly count: number } | { readonly kind: "failed"; readonly message: string };

const signOutOthersResponseSchema = z.object({ ok: z.literal(true), count: z.number().int().nonnegative() });

/**
 * The delete half of Sessions (task-9): no body, no tap -- console_sign_out_others takes only the
 * caller's own environment, decided server-side. `count` is what the sheet's own toast does not
 * show (task-9-addendum.md §4); the caller decides what, if anything, to do with it.
 */
export async function signOutOthers(): Promise<SignOutOthersOutcome> {
  const result = await apiRequest("/api/sessions", { method: "DELETE" }, signOutOthersResponseSchema);
  return result.ok ? { kind: "done", count: result.data.count } : { kind: "failed", message: consoleApiMessage(result.error) };
}
