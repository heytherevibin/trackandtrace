"use client";

import { z } from "zod";
import { consoleApiMessage } from "@/console/api-message";
import type { ConsoleRole } from "@/console/auth/member";
import { apiRequest } from "@/services/api-client";

// The browser-side call the Team page's one client component needs: sending an invite. Modelled on
// `removeKey` in src/console/account/my-keys-client.ts.
//
// There is deliberately no `fetchTeam()` beside it (task-4-addendum.md §5). The three plates stay
// server components and an invite refreshes them with `router.refresh()`, so the page re-runs
// `getTeam()` server-side and the refreshed list cannot disagree with the first paint. Tasks 5-7
// convert the plates to client components for their own row actions, and that is where a re-fetch
// belongs.

// `.strict()` is the point, not decoration: POST /api/team answers `{ ok: true }` and nothing more,
// because the raw invite token is a console-access credential and must never reach a browser
// (task-4-addendum.md §3). A route that started echoing one would fail to parse here rather than
// quietly hand it to a caller that might log it.
const invitedSchema = z.object({ ok: z.literal(true) }).strict();

export type InviteOutcome = { readonly kind: "done" } | { readonly kind: "failed"; readonly message: string };

/**
 * Sends one invite (task-4, Form TC-04). Called only after ConfirmItsYou's `onConfirmed` fires --
 * a completed tap -- never before.
 *
 * `email` arrives already lower-cased, the same string the tap was minted over: `console_invite_member`
 * digests `lower(p_email)`, so a capital here would spend against a digest the tap was never taken
 * for and the invite would fail with "no tap for this action" with nothing to say why. `reason` goes
 * out exactly as the member typed it -- only the route's own `tapReason` import trims and digests
 * it, so a second trim here would risk the two disagreeing.
 *
 * Every refusal comes back as a message already written for a member to read: the route translates
 * `console_invite_member`'s four developer strings, and `consoleApiMessage` answers the two codes
 * that carry a failing layer's own wording with the console's own sentence instead.
 */
export async function inviteMember(email: string, role: ConsoleRole, reason: string): Promise<InviteOutcome> {
  const result = await apiRequest(
    "/api/team",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, role, reason }) },
    invitedSchema,
  );
  return result.ok ? { kind: "done" } : { kind: "failed", message: consoleApiMessage(result.error) };
}
