import { z } from "zod";
import type { ConsoleDb } from "@/console/auth/db";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

// The console's three calls over suppressions (20261004150000_console_suppressions.sql), each
// through the member's own session. A row is named by an id; its address reaches this code masked,
// unless it is a console member's, and reaches the browser whole only through `revealSuppression`,
// which the database records.
//
// A database error THROWS: "nobody is suppressed" and "the database is down" are different pages.

const m = consoleMessages.announcements.suppressions;

const rowShape = z.object({
  id: z.guid(),
  address: z.string().min(3),
  masked: z.boolean(),
  operator: z.boolean(),
  scope: z.enum(["all", "list"]),
  reason: z.string().min(1),
  at: z.iso.datetime({ offset: true }),
});

export type Suppression = z.infer<typeof rowShape>;

const unavailable = (): AppError => new AppError("SOURCE_UNAVAILABLE", m.errors.database);

function fromError(error: { readonly message: string }): AppError {
  const text = error.message;
  if (text.includes("no access")) return new AppError("INVALID_INPUT", m.errors.noAccess, { status: 403 });
  if (text.includes("address mismatch")) return new AppError("INVALID_INPUT", m.errors.mismatch);
  if (text.includes("no such suppression")) return new AppError("NOT_FOUND", m.errors.gone);
  return unavailable();
}

export async function readSuppressions(db: ConsoleDb): Promise<readonly Suppression[]> {
  const { data, error } = await db.rpc("console_suppressions");
  if (error) throw fromError(error);
  const parsed = z.array(rowShape).safeParse(data);
  if (!parsed.success) throw unavailable();
  return parsed.data;
}

/** The address, whole. The database writes the audit row; there is no reveal that does not. */
export async function revealSuppression(db: ConsoleDb, environment: string, id: string): Promise<string> {
  const { data, error } = await db.rpc("console_reveal_suppression", { p_environment: environment, p_id: id });
  if (error) throw fromError(error);
  const parsed = z.string().min(3).safeParse(data);
  if (!parsed.success) throw unavailable();
  return parsed.data;
}

/** `address` is the one the caller has seen: the database refuses a lift that does not name it. */
export async function liftSuppression(db: ConsoleDb, environment: string, id: string, address: string): Promise<void> {
  const { error } = await db.rpc("console_lift_suppression", { p_environment: environment, p_id: id, p_address: address });
  if (error) throw fromError(error);
}

// The store's own words for a reason (announce_webhook writes them), and the sheet's. One of the
// stored reasons names the mail provider; the console never does.
type Kind = "hardBounce" | "complaint" | "delayed" | "provider" | "other";

export function kindOf(reason: string): Kind {
  if (reason === "hard bounce") return "hardBounce";
  if (reason === "complaint") return "complaint";
  if (reason === "repeatedly delayed") return "delayed";
  if (reason.startsWith("suppressed by")) return "provider";
  return "other";
}

export function reasonOf(reason: string): string {
  return m.reasons[kindOf(reason)];
}

const SOURCE: Readonly<Record<Kind, keyof typeof m.sources>> = { hardBounce: "delivery", complaint: "complaint", delayed: "deliveries", provider: "provider", other: "other" };

export function sourceOf(reason: string): string {
  return m.sources[SOURCE[kindOf(reason)]];
}

/**
 * The console members whose mail is stopped ENTIRELY: scope `all`, so their sign-in links will not
 * arrive. The sheet says this above the table rather than leaving it to be read off a row.
 */
export function operatorsCutOff(rows: readonly Suppression[]): readonly string[] {
  return rows.filter((row) => row.operator && row.scope === "all").map((row) => row.address);
}
