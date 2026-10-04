import { z } from "zod";
import type { ConsoleDb } from "@/console/auth/db";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

// The console's seven calls (supabase/migrations/20261004090000_console_letters.sql), each through
// the MEMBER'S OWN session: the database re-checks the Admin floor and takes the member from the
// session, so nothing here passes a member id and nothing here could forge one.
//
// A database error THROWS. "No letters" and "the database is down" are different pages, and a
// caller must never be able to mistake one for the other. So does an answer of the wrong shape.

const m = consoleMessages.announcements.errors;

export const LETTER_LISTS = ["news", "availability"] as const;
export type LetterList = (typeof LETTER_LISTS)[number];
export const LETTER_STATES = ["draft", "queued", "sending", "stopped", "done"] as const;
export type LetterState = (typeof LETTER_STATES)[number];

// Postgres writes a timestamptz with an offset ("+00:00"), not "Z".
const when = z.iso.datetime({ offset: true });
const count = z.number().int().nonnegative();

const rowShape = z.object({
  id: z.guid(),
  list: z.enum(LETTER_LISTS),
  subject: z.string().min(1).max(200),
  state: z.enum(LETTER_STATES),
  total: count,
  sent: count,
  skipped: count,
  unknown: count,
  waiting: count,
  createdAt: when,
  queuedAt: when.nullable(),
  stoppedAt: when.nullable(),
  finishedAt: when.nullable(),
});

const detailShape = rowShape.extend({
  body: z.string().min(1).max(20000),
  testSentAt: when.nullable(),
  testSentTo: z.string().nullable(),
  queuedBy: z.string().nullable(),
  stoppedBy: z.string().nullable(),
  sentToday: count,
});

const listsShape = z.object({
  news: count,
  availability: count,
  availabilitySpent: z.boolean(),
  availabilitySpentAt: when.nullable(),
});

export type LetterRow = z.infer<typeof rowShape>;
export type LetterDetail = z.infer<typeof detailShape>;
export type ListCounts = z.infer<typeof listsShape>;

const unavailable = (): AppError => new AppError("SOURCE_UNAVAILABLE", m.database);

/** The database's own sentences, turned into the console's. Anything unrecognised is a fault. */
function fromError(error: { readonly message: string }): AppError {
  const text = error.message;
  if (text.includes("no access")) return new AppError("INVALID_INPUT", m.noAccess, { status: 403 });
  if (text.includes("not been test sent")) return new AppError("INVALID_INPUT", m.notTested);
  if (text.includes("only a draft may be queued") || text.includes("not a draft")) return new AppError("INVALID_INPUT", m.notDraft);
  if (text.includes("availability list is spent")) return new AppError("INVALID_INPUT", m.spent);
  if (text.includes("nobody to send to")) return new AppError("INVALID_INPUT", m.nobody);
  if (text.includes("not open")) return new AppError("INVALID_INPUT", m.notOpen);
  if (text.includes("no such letter")) return new AppError("NOT_FOUND", m.gone);
  if (/subject length|body length|unknown list/.test(text)) return new AppError("INVALID_INPUT", m.invalid);
  return unavailable();
}

function parsed<T>(shape: z.ZodType<T>, data: unknown): T {
  const result = shape.safeParse(data);
  if (!result.success) throw unavailable();
  return result.data;
}

export async function readLetters(db: ConsoleDb): Promise<readonly LetterRow[]> {
  const { data, error } = await db.rpc("console_letters");
  if (error) throw fromError(error);
  return parsed(z.array(rowShape), data);
}

/** Null is "there is no such letter", which the page draws as not found. */
export async function readLetter(db: ConsoleDb, id: string): Promise<LetterDetail | null> {
  const { data, error } = await db.rpc("console_letter", { p_letter: id });
  if (error) throw fromError(error);
  return data === null ? null : parsed(detailShape, data);
}

export async function readLists(db: ConsoleDb): Promise<ListCounts> {
  const { data, error } = await db.rpc("console_letter_lists");
  if (error) throw fromError(error);
  return parsed(listsShape, data);
}

/** A new draft when `id` is absent. Returns the letter's id either way. */
export async function saveLetter(db: ConsoleDb, letter: { readonly id?: string; readonly list: LetterList; readonly subject: string; readonly body: string }): Promise<string> {
  const args = { p_list: letter.list, p_subject: letter.subject, p_body: letter.body };
  const { data, error } = await db.rpc("console_save_letter", letter.id ? { ...args, p_letter: letter.id } : args);
  if (error) throw fromError(error);
  return parsed(z.guid(), data);
}

export async function recordTest(db: ConsoleDb, environment: string, id: string): Promise<void> {
  const { error } = await db.rpc("console_letter_tested", { p_environment: environment, p_letter: id });
  if (error) throw fromError(error);
}

/** Returns how many people the queue fixed. */
export async function queueLetter(db: ConsoleDb, environment: string, id: string): Promise<number> {
  const { data, error } = await db.rpc("console_queue_letter", { p_environment: environment, p_letter: id });
  if (error) throw fromError(error);
  return parsed(z.number().int().positive(), data);
}

export async function stopLetter(db: ConsoleDb, environment: string, id: string): Promise<void> {
  const { error } = await db.rpc("console_stop_letter", { p_environment: environment, p_letter: id });
  if (error) throw fromError(error);
}
