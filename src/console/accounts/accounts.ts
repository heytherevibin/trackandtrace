import { z } from "zod";
import { ACCOUNT_ID, ACCOUNT_PAGE_SIZE, type AccountFilters } from "@/console/accounts/filters";
import type { ConsoleDb } from "@/console/auth/db";
import { LEAD_ID, NEWS_STATUSES, sinceFor } from "@/console/leads/filters";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

// The console's calls over traveller accounts (20261010090000_console_accounts.sql), each through
// the member's own session: the database re-checks the Admin floor and masks every address it
// returns. The whole address reaches this code only from `revealAccount`, which the database
// records.
//
// A SAVED PNR NEVER REACHES THIS CODE. The database answers how many an account has saved, and the
// shapes below are strict: a row carrying any key they do not name is refused, not drawn.
//
// A database error THROWS: "no accounts" and "the database is down" are different pages.

const m = consoleMessages.accounts.errors;

const when = z.iso.datetime({ offset: true });
const count = z.number().int().nonnegative();
/** The first letter, three dots, the domain. A row carrying anything else is refused, not drawn. */
const masked = z.string().regex(/^.?•••@.+$/u);

const row = {
  id: z.string().regex(ACCOUNT_ID),
  email: masked,
  createdAt: when,
  /** Null for an account nobody has signed in to yet. */
  lastSignInAt: when.nullable(),
  emailLink: z.boolean(),
  google: z.boolean(),
  passkeys: count,
  /** A count, and only ever a count. */
  savedPnrs: count,
  news: z.enum(NEWS_STATUSES),
  disabled: z.boolean(),
  /** The same person's row in Leads. */
  leadId: z.string().regex(LEAD_ID),
};

const rowShape = z.object(row).strict();
const pageShape = z.object({ total: count, rows: z.array(rowShape) }).strict();
const detailShape = z.object({ ...row, sessions: z.object({ count, lastSeenAt: when.nullable() }).strict() }).strict();

export type AccountRow = z.infer<typeof rowShape>;
export type AccountPage = z.infer<typeof pageShape>;
export type AccountDetail = z.infer<typeof detailShape>;

const unavailable = (): AppError => new AppError("SOURCE_UNAVAILABLE", m.database);

/** A database refusal in the console's words. Read by message: every console refusal shares a code. */
function fromError(error: { readonly message: string }): AppError {
  const text = error.message;
  if (text.includes("no access")) return new AppError("INVALID_INPUT", m.noAccess, { status: 403 });
  if (text.includes("no such account")) return new AppError("NOT_FOUND", m.gone);
  if (text.includes("not an address")) return new AppError("INVALID_INPUT", m.notAddress);
  return unavailable();
}

function parsed<T>(shape: z.ZodType<T>, data: unknown): T {
  const result = shape.safeParse(data);
  if (!result.success) throw unavailable();
  return result.data;
}

/** One page of the list under these filters. `now` is what "Created: last 30 days" counts back from. */
export async function readAccounts(db: ConsoleDb, filters: AccountFilters, now: Date): Promise<AccountPage> {
  const since = sinceFor(filters.created, now);
  // A filter that is off is left out: the function's arguments default to "all".
  const { data, error } = await db.rpc("console_accounts", {
    ...(filters.status ? { p_status: filters.status } : {}),
    ...(filters.method ? { p_method: filters.method } : {}),
    ...(since ? { p_since: since } : {}),
    p_limit: ACCOUNT_PAGE_SIZE,
    p_offset: (filters.page - 1) * ACCOUNT_PAGE_SIZE,
  });
  if (error) throw fromError(error);
  return parsed(pageShape, data);
}

/** Null is "there is no such account". */
export async function readAccount(db: ConsoleDb, accountId: string): Promise<AccountDetail | null> {
  const { data, error } = await db.rpc("console_account", { p_id: accountId });
  if (error) throw fromError(error);
  return data === null ? null : parsed(detailShape, data);
}

/** The address, whole. The database writes the audit row; there is no reveal that does not. */
export async function revealAccount(db: ConsoleDb, environment: string, accountId: string): Promise<string> {
  const { data, error } = await db.rpc("console_reveal_account", { p_environment: environment, p_id: accountId });
  if (error) throw fromError(error);
  return parsed(z.string().min(3), data);
}

/** The account with exactly this address, still masked, or null. Recorded by the database either way. */
export async function findAccount(db: ConsoleDb, environment: string, email: string): Promise<AccountRow | null> {
  const { data, error } = await db.rpc("console_find_account", { p_environment: environment, p_email: email });
  if (error) throw fromError(error);
  return data === null ? null : parsed(rowShape, data);
}
