import { readLetter, recordTest } from "@/console/announcements/letters";
import type { ConsoleDb } from "@/console/auth/db";
import { consoleMessages } from "@/console/messages";
import { letterText } from "@/services/announcements/letter";
import type { Letter } from "@/services/email/send";
import type { DoorResult, MailKind } from "@/services/email/suppression";
import { AppError } from "@/services/errors";

// The test send. One real email to the member's own address, reading exactly as a subscriber's
// will: the same subject, the same body, the same unsubscribe line. It is the only time anyone sees
// the letter as a reader does, and the last point at which a mistake costs nothing — which is why
// the database will not queue a letter until this has been recorded (announce_queue).
//
// SEND, THEN RECORD. A test recorded but never sent would unlock Queue for a letter nobody has seen.
// The cost of this order is the case where the email went and the record failed: the member is told
// so and sends again, which spends one more email and nothing else.
//
// The unsubscribe link is the bare /unsubscribe page, which answers "invalid link". A test must
// never carry a signed link, because a signed link unsubscribes a real person; and it carries no
// List-Unsubscribe headers, because a mail client's own button would POST to them.

const m = consoleMessages.announcements.errors;

export interface TestSendDeps {
  readonly db: ConsoleDb;
  /** The one door all mail goes through (src/services/email/suppression.ts). */
  readonly send: (letter: Letter, kind: MailKind) => Promise<DoorResult>;
  /** Adds one to the day's shared email count. Best-effort, as `countSent` is. */
  readonly counted: () => Promise<void>;
}

export async function sendTest(
  ask: { readonly id: string; readonly to: string; readonly from: string; readonly origin: string; readonly environment: string },
  deps: TestSendDeps,
): Promise<void> {
  const letter = await readLetter(deps.db, ask.id);
  if (!letter) throw new AppError("NOT_FOUND", m.gone);
  if (letter.state !== "draft") throw new AppError("INVALID_INPUT", m.notDraft);

  // `transactional`: the member asked for this email, this minute. A complaint-level suppression
  // must not stop it; a hard bounce still does, and the member is told.
  const result = await deps.send(
    { from: ask.from, to: ask.to, subject: letter.subject, text: letterText(letter.body, `${ask.origin}/unsubscribe`, letter.list) },
    "transactional",
  );
  if (result.outcome === "suppressed") throw new AppError("INVALID_INPUT", m.testSuppressed);
  // INVALID_INPUT with a 502, here and below, and not SOURCE_UNAVAILABLE: `consoleApiMessage`
  // replaces every SOURCE_UNAVAILABLE with one generic sentence, and these two are sentences the
  // member must read as written — one says nothing was recorded, the other says to send again.
  if (result.outcome === "failed") throw new AppError("INVALID_INPUT", m.testFailed, { status: 502 });

  // Only a real send counts, as `sendConsoleEmail` has it: a captured one under E2E never reached
  // the mail service and spent nothing from the day's allowance.
  if (result.outcome === "sent") await deps.counted();
  try {
    await recordTest(deps.db, ask.environment, ask.id);
  } catch {
    throw new AppError("INVALID_INPUT", m.testUnrecorded, { status: 502 });
  }
}
