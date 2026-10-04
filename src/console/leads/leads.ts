import { z } from "zod";
import type { ConsoleDb } from "@/console/auth/db";
import { ACCOUNT_STATUSES, LEAD_ID, LEAD_PAGE_SIZE, LEAD_SOURCES, NEWS_STATUSES, sinceFor, type LeadFilters } from "@/console/leads/filters";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

// The console's calls over leads (20261005090000_console_leads.sql, and 20261006090000 for tags
// and notes), each through the member's own session: the database re-checks the Support floor and
// masks every address it returns. The whole address reaches this code only from `revealLead`, which
// the database records.
//
// A database error THROWS: "no leads" and "the database is down" are different pages.

const m = consoleMessages.leads.errors;

const when = z.iso.datetime({ offset: true });
const count = z.number().int().nonnegative();
/** The first letter, three dots, the domain. A row carrying anything else is refused, not drawn. */
const masked = z.string().regex(/^.?•••@.+$/u);
const id = z.string().regex(LEAD_ID);
const list = z.enum(["news", "availability"]);

const rowShape = z.object({
  id,
  email: masked,
  news: z.enum(NEWS_STATUSES),
  availability: z.boolean(),
  account: z.enum(ACCOUNT_STATUSES),
  source: z.enum(LEAD_SOURCES),
  campaign: z.object({ source: z.string().nullable(), medium: z.string().nullable(), name: z.string().nullable() }).nullable(),
  tags: z.array(z.string().min(1)),
  firstSeen: when,
  lastActivity: when,
});

const tagsShape = z.array(z.string().min(1));
const notesShape = z.array(z.object({ id: z.guid(), author: z.string().min(1), at: when, body: z.string().min(1) }));

const pageShape = z.object({ total: count, rows: z.array(rowShape) });

const figuresShape = z.object({ total: count, pending: count, subscribed: count, unsubscribed: count, suppressed: count, accounts: count, availability: count });

const detailShape = z.object({
  id,
  email: masked,
  firstSeen: when,
  consents: z.array(
    z.object({
      list,
      status: z.enum(["pending", "subscribed", "unsubscribed", "suppressed"]),
      source: z.enum(LEAD_SOURCES),
      noticeVersion: z.string().min(1),
      consentedAt: when,
      confirmedAt: when.nullable(),
      withdrawnAt: when.nullable(),
      withdrawReason: z.string().nullable(),
    }),
  ),
  account: z
    .object({ createdAt: when, lastSignInAt: when.nullable(), disabled: z.boolean(), emailLink: z.boolean(), google: z.boolean(), passkeys: count, savedPnrs: count })
    .nullable(),
  campaign: z.object({ source: z.string().nullable(), medium: z.string().nullable(), name: z.string().nullable(), firstPage: z.string().nullable() }).nullable(),
  timeline: z.array(
    z.object({
      at: when,
      kind: z.enum(["signed_up", "confirmed", "unsubscribed", "account_created", "signed_in", "received", "suppressed"]),
      list: list.nullable(),
      source: z.enum(LEAD_SOURCES).nullable(),
      subject: z.string().nullable(),
      reason: z.string().nullable(),
    }),
  ),
  tags: tagsShape,
  notes: notesShape,
});

export type LeadRow = z.infer<typeof rowShape>;
export type LeadPage = z.infer<typeof pageShape>;
export type LeadFigures = z.infer<typeof figuresShape>;
export type LeadDetail = z.infer<typeof detailShape>;
export type LeadNote = z.infer<typeof notesShape>[number];

const unavailable = (): AppError => new AppError("SOURCE_UNAVAILABLE", m.database);

function fromError(error: { readonly message: string }): AppError {
  const text = error.message;
  if (text.includes("no access")) return new AppError("INVALID_INPUT", m.noAccess, { status: 403 });
  if (text.includes("no such lead") || text.includes("not a lead id")) return new AppError("NOT_FOUND", m.gone);
  if (text.includes("not an address")) return new AppError("INVALID_INPUT", m.notAddress);
  if (text.includes("not a tag")) return new AppError("INVALID_INPUT", m.notTag);
  if (text.includes("too many tags")) return new AppError("INVALID_INPUT", m.tooManyTags);
  if (text.includes("empty note")) return new AppError("INVALID_INPUT", m.emptyNote);
  if (text.includes("note too long")) return new AppError("INVALID_INPUT", m.noteTooLong);
  return unavailable();
}

function parsed<T>(shape: z.ZodType<T>, data: unknown): T {
  const result = shape.safeParse(data);
  if (!result.success) throw unavailable();
  return result.data;
}

export async function readFigures(db: ConsoleDb): Promise<LeadFigures> {
  const { data, error } = await db.rpc("console_lead_figures");
  if (error) throw fromError(error);
  return parsed(figuresShape, data);
}

/** One page of the list under these filters. `now` is what "First seen: last 30 days" counts back from. */
export async function readLeads(db: ConsoleDb, filters: LeadFilters, now: Date): Promise<LeadPage> {
  const since = sinceFor(filters.seen, now);
  // A filter that is off is left out: the function's arguments default to "all".
  const { data, error } = await db.rpc("console_leads", {
    ...(filters.news ? { p_news: filters.news } : {}),
    ...(filters.account ? { p_account: filters.account } : {}),
    ...(filters.source ? { p_source: filters.source } : {}),
    ...(filters.tag ? { p_tag: filters.tag } : {}),
    ...(since ? { p_since: since } : {}),
    p_limit: LEAD_PAGE_SIZE,
    p_offset: (filters.page - 1) * LEAD_PAGE_SIZE,
  });
  if (error) throw fromError(error);
  return parsed(pageShape, data);
}

/** Null is "there is no such lead". */
export async function readLead(db: ConsoleDb, leadId: string): Promise<LeadDetail | null> {
  const { data, error } = await db.rpc("console_lead", { p_id: leadId });
  if (error) throw fromError(error);
  return data === null ? null : parsed(detailShape, data);
}

/** The address, whole. The database writes the audit row; there is no reveal that does not. */
export async function revealLead(db: ConsoleDb, environment: string, leadId: string): Promise<string> {
  const { data, error } = await db.rpc("console_reveal_lead", { p_environment: environment, p_id: leadId });
  if (error) throw fromError(error);
  return parsed(z.string().min(3), data);
}

/** The lead with exactly this address, still masked, or null. Recorded by the database either way. */
export async function findLead(db: ConsoleDb, environment: string, email: string): Promise<LeadRow | null> {
  const { data, error } = await db.rpc("console_find_lead", { p_environment: environment, p_email: email });
  if (error) throw fromError(error);
  return data === null ? null : parsed(rowShape, data);
}

/** Every tag in use, in order: the Tag filter's choices and the record's suggestions. */
export async function readTags(db: ConsoleDb): Promise<readonly string[]> {
  const { data, error } = await db.rpc("console_lead_tags");
  if (error) throw fromError(error);
  return parsed(tagsShape, data);
}

/** Adds a tag and answers the lead's tags. The database lowers and trims it, and records the act. */
export async function tagLead(db: ConsoleDb, environment: string, leadId: string, tag: string): Promise<readonly string[]> {
  const { data, error } = await db.rpc("console_tag_lead", { p_environment: environment, p_id: leadId, p_tag: tag });
  if (error) throw fromError(error);
  return parsed(tagsShape, data);
}

export async function untagLead(db: ConsoleDb, environment: string, leadId: string, tag: string): Promise<readonly string[]> {
  const { data, error } = await db.rpc("console_untag_lead", { p_environment: environment, p_id: leadId, p_tag: tag });
  if (error) throw fromError(error);
  return parsed(tagsShape, data);
}

/** Adds a note and answers the lead's notes AS STORED: the database scrubs the words before it keeps them. */
export async function noteLead(db: ConsoleDb, environment: string, leadId: string, body: string): Promise<readonly LeadNote[]> {
  const { data, error } = await db.rpc("console_note_lead", { p_environment: environment, p_id: leadId, p_body: body });
  if (error) throw fromError(error);
  return parsed(notesShape, data);
}
