import { z } from "zod";
import { ACCOUNT_ID } from "@/console/accounts/filters";
import { consoleMessages } from "@/console/messages";

// Module 08's request bodies. `.strict()` on each: the environment is the server's to decide.

/** The WHOLE address. Shape only: whether an account has it is the database's answer, and is recorded. */
export const findBody = z
  .object({ email: z.string().trim().min(3).max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, consoleMessages.accounts.errors.notAddress) })
  .strict();

export const revealBody = z.object({ id: z.string().regex(ACCOUNT_ID) }).strict();
