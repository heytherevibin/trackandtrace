import { z } from "zod";
import { LEAD_ID, LEAD_NOTE_MAX, LEAD_TAG } from "@/console/leads/filters";
import { TAP_VALUE_MAX, tapReason } from "@/console/keys/tap-schema";
import { consoleMessages } from "@/console/messages";

// Module 06's request bodies. `.strict()` on each: the environment is the server's to decide.

/** The WHOLE address. Shape only: whether anyone has it is the database's answer, and is recorded. */
export const findBody = z
  .object({ email: z.string().trim().min(3).max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, consoleMessages.leads.errors.notAddress) })
  .strict();

export const revealBody = z.object({ id: z.string().regex(LEAD_ID) }).strict();

const m = consoleMessages.leads.errors;
const leadId = z.string().regex(LEAD_ID);

/** Lowered and trimmed here as the database does again: `Press ` and `press` are one tag. */
export const tagBody = z.object({ id: leadId, tag: z.string().trim().toLowerCase().regex(LEAD_TAG, m.notTag) }).strict();

/** As typed, trimmed. The database scrubs it; this only refuses what it would refuse, in the form's own words. */
export const noteBody = z.object({ id: leadId, body: z.string().trim().min(1, m.emptyNote).max(LEAD_NOTE_MAX, m.noteTooLong) }).strict();

// The two bodies behind a reason and a key. `reason` is `tapReason`, the one schema every tap's
// reason goes through, because its trim decides the exact string that was digested. `value` and
// `filters` are bounded and otherwise untouched: they are digested strings, and the database reads
// them rather than this file.

/** A JSON object, as text, within what a tap's `value` may hold. */
const digestedObject = z
  .string()
  .max(TAP_VALUE_MAX)
  .refine((text) => {
    try {
      const value: unknown = JSON.parse(text);
      return typeof value === "object" && value !== null && !Array.isArray(value);
    } catch {
      return false;
    }
  });

export const deleteBody = z.object({ id: leadId, value: digestedObject, reason: tapReason }).strict();

export const exportBody = z.object({ filters: digestedObject, reason: tapReason }).strict();
