import { z } from "zod";
import { LETTER_LISTS } from "@/console/announcements/letters";
import type { TestSendDeps } from "@/console/announcements/test-send";
import { createConsoleDb } from "@/console/auth/db";
import { consoleMessages } from "@/console/messages";
import { countSent } from "@/services/email/allowance";
import { sendToAddress } from "@/services/email/suppression";
import { env } from "@/services/env";
import { publicStore } from "@/services/shared-store";
import { travellerOrigin } from "@/services/subscriptions/links";

// What module 07's routes share: the body shapes and the wiring of the real stores. Kept out of the
// route files so each route reads as its steps.

const c = consoleMessages.announcements.compose;

// `.strict()` on both: the member, the recipient of a test and the environment are the server's to
// decide. A browser that could name any of them could mail a stranger or file a record elsewhere.
export const saveBody = z
  .object({
    id: z.guid().optional(),
    list: z.enum(LETTER_LISTS),
    subject: z.string().trim().min(1, c.subjectNeeded).max(200, c.subjectTooLong),
    body: z
      .string()
      .max(20000, c.bodyTooLong)
      .refine((value) => value.trim().length > 0, c.bodyNeeded),
  })
  .strict();

export const letterBody = z.object({ id: z.guid() }).strict();

/**
 * The traveller site's origin, from the console's own host: the test's unsubscribe line links
 * there. Empty when the host is one this deployment does not serve.
 */
export function travellerOriginFor(req: Request): string {
  return travellerOrigin((req.headers.get("host") ?? "").replace(/^admin\./, ""), env().VERCEL_ENV);
}

export async function testDeps(): Promise<TestSendDeps> {
  const store = publicStore();
  return {
    db: await createConsoleDb(),
    send: (letter, kind) => sendToAddress(letter, kind),
    counted: () => countSent(store.kv, store.prefix, new Date()),
  };
}
