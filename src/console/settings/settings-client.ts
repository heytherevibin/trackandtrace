"use client";

import { z } from "zod";
import type { SaveResult } from "./limits-plate";
import { STALE_VERSION_MESSAGE } from "./settings";
import { apiRequest } from "@/services/api-client";

// The one network call the Limits plate makes, kept out of the component so the plate's test mocks
// a function rather than fetch — the same split `team-client.ts` uses.
//
// **A lost version race is told apart from an unreachable store.** Both leave the setting unchanged,
// so a single "it failed" would be true and useless. `apiRequest` does not carry the HTTP status, so
// the signal that crosses is the message — `STALE_VERSION_MESSAGE`, held in the pure module both
// sides import rather than typed out twice.

const savedSchema = z.object({ ok: z.literal(true) }).strict();

export async function saveLiveChecks(value: number, version: number, reason: string): Promise<SaveResult> {
  const result = await apiRequest(
    "/api/settings",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ liveChecksPerDay: value, version, reason }) },
    savedSchema,
  );
  if (result.ok) return { ok: true };
  return { ok: false, stale: result.error.message === STALE_VERSION_MESSAGE };
}
