import { z } from "zod";
import { LEAD_ID } from "@/console/leads/filters";
import { consoleMessages } from "@/console/messages";

// Module 06's request bodies. `.strict()` on both: the environment is the server's to decide.

/** The WHOLE address. Shape only: whether anyone has it is the database's answer, and is recorded. */
export const findBody = z
  .object({ email: z.string().trim().min(3).max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, consoleMessages.leads.errors.notAddress) })
  .strict();

export const revealBody = z.object({ id: z.string().regex(LEAD_ID) }).strict();
