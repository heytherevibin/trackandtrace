import { z } from "zod";
import type { BlockDeps } from "@/console/abuse/blocks";
import { writeConsoleAudit } from "@/console/auth/audit";
import { createConsoleDb, createConsoleServiceDb } from "@/console/auth/db";
import { tapReason } from "@/console/keys/tap";
import { BLOCK_DURATIONS } from "@/services/blocklist";
import { blocksForConsole } from "@/services/shared-store";

// What module 04's routes share: the body shapes and the wiring of the real stores. Kept out of the
// route files so each route reads as its three steps.

/** A kind, a dot, 43 base64url characters: what the hash route answers and nothing else. */
export const memberSchema = z.string().regex(/^[46?]\.[A-Za-z0-9_-]{43}$/);

// `.strict()` on both: the environment is the server's to decide, never a caller's — a browser that
// could name its own could file a block's record under another deployment.
export const blockBody = z
  .object({
    member: memberSchema,
    duration: z.enum(BLOCK_DURATIONS as [string, ...string[]]),
    note: z.string().trim().max(200).default(""),
    reason: tapReason,
  })
  .strict();

export const unblockBody = z.object({ member: memberSchema, reason: tapReason }).strict();

export async function blockDeps(): Promise<BlockDeps & { readonly keyId: string }> {
  const client = await createConsoleDb();
  const { list, keyId, invalidate } = blocksForConsole();
  return {
    db: { rpc: (fn, args) => client.rpc(fn, args) },
    list,
    keyId,
    invalidate,
    audit: (row) => writeConsoleAudit(createConsoleServiceDb(), row),
  };
}
