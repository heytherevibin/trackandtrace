import { z } from "zod";
import { ACCOUNT_ID } from "@/console/accounts/filters";
import { TAP_VALUE_MAX, tapReason } from "@/console/keys/tap-schema";
import { consoleMessages } from "@/console/messages";

// Module 08's request bodies. `.strict()` on each: the environment is the server's to decide.

/** The WHOLE address. Shape only: whether an account has it is the database's answer, and is recorded. */
export const findBody = z
  .object({ email: z.string().trim().min(3).max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, consoleMessages.accounts.errors.notAddress) })
  .strict();

export const revealBody = z.object({ id: z.string().regex(ACCOUNT_ID) }).strict();

// The body of the three acts behind a reason and a key. `reason` is `tapReason`, the one schema
// every tap's reason goes through, because its trim decides the exact string that was digested.
// `value` is bounded and otherwise untouched: it is a digested string, and the database reads it
// rather than this file.

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

export const actBody = z.object({ id: z.string().regex(ACCOUNT_ID), value: digestedObject, reason: tapReason }).strict();

