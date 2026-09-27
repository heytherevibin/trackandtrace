import { consoleMessages } from "@/console/messages";
import type { Fuse } from "@/console/sources/source-plate";
import { readSourceUsage } from "@/console/sources/sources";
import type { UsageDay } from "@/services/usage";
import { formatTime, TIME_ZONE } from "@/utils/datetime";

// Module 01's figures, shaped from reads other modules already make. Pure: reads in, rows out, so
// the plates can be drawn from fixtures and this can be tested without a store or a database.
//
// **A read that failed says so.** Every row below has a "cannot say" answer, and it is the one it
// gives when its read came back unknown — never the resting value. "Answering" drawn off a store
// nobody could reach is the failure module 02 was written against, and a summary page is where an
// operator would believe it most.

const m = consoleMessages.overview;
const callers = consoleMessages.sources.fuses.caller;

/** The sheet's four lamps: lit is well, half is partly, hollow is off or unknown, ringed is down. */
export type Lamp = "lit" | "half" | "hollow" | "ringed";

export interface ServiceRow {
  readonly lamp: Lamp;
  readonly word: string;
  readonly notes: readonly string[];
}

/** The PNR checks row: the budget state, since nothing wires a pause switch to the checks yet. */
export function checksRow({ configured, used, limit }: { readonly configured: boolean; readonly used: number | null; readonly limit: number }): ServiceRow {
  // No third-party source, no budget: `liveBudget` is unlimited there, so there is nothing to spend.
  if (!configured) return { lamp: "lit", word: m.service.words.answering, notes: [] };
  if (used === null) return { lamp: "hollow", word: m.service.words.cannotSay, notes: [m.service.budgetUnknown] };
  if (used >= limit) return { lamp: "half", word: m.service.words.degraded, notes: [m.service.budgetUsed] };
  return { lamp: "lit", word: m.service.words.answering, notes: [] };
}

/** "14:41": when a fuse resting `seconds` from `now` may be asked again. */
function reopensAt(now: Date, seconds: number): string {
  return formatTime(new Date(now.getTime() + seconds * 1000));
}

/**
 * The primary source's row, from all three callers' fuses. The sheet draws one breaker per source; there are
 * three, and a row that read only the PNR fuse would say "Answering" while route search was shut.
 *
 * A provider-wide fuse opens every caller at once, so it is said once. A caller's own fuse is named,
 * because which caller is shut is the operator's next question.
 */
export function primarySourceRow({ configured, fuses, now }: { readonly configured: boolean; readonly fuses: readonly Fuse[]; readonly now: Date }): ServiceRow {
  if (!configured) return { lamp: "hollow", word: m.service.words.notConfigured, notes: [m.service.noSource] };
  if (fuses.length === 0 || fuses.some((f) => !f.state.known)) return { lamp: "hollow", word: m.service.words.cannotSay, notes: [m.service.fusesUnknown] };

  const open = fuses.filter((f) => f.state.open);
  if (open.length === 0) return { lamp: "lit", word: m.service.words.answering, notes: [] };

  const whole = open.length === fuses.length;
  const provider = open.find((f) => f.state.openedBy === "provider");
  const notes =
    whole && provider
      ? [provider.state.retryAfterSeconds === null ? m.service.openFor(callers[provider.caller]) : m.service.openUntil(reopensAt(now, provider.state.retryAfterSeconds))]
      : open.map((f) => (f.state.retryAfterSeconds === null ? m.service.openFor(callers[f.caller]) : m.service.openUntilFor(callers[f.caller], reopensAt(now, f.state.retryAfterSeconds))));
  return whole ? { lamp: "ringed", word: m.service.words.down, notes } : { lamp: "half", word: m.service.words.degraded, notes };
}

/** "local": no shared store is configured, so there is nothing to connect to — only this server's memory. */
export type StoreState = "connected" | "unreachable" | "local";

export function storeRow(state: StoreState): ServiceRow {
  if (state === "connected") return { lamp: "lit", word: m.service.words.connected, notes: [] };
  if (state === "unreachable") return { lamp: "ringed", word: m.service.words.notAnswering, notes: [] };
  return { lamp: "hollow", word: m.service.words.thisInstance, notes: [m.service.thisInstanceNote] };
}

export type AccountsState = "connected" | "unreachable" | "notConfigured";

export function accountsRow(state: AccountsState): ServiceRow {
  if (state === "connected") return { lamp: "lit", word: m.service.words.connected, notes: [] };
  if (state === "unreachable") return { lamp: "ringed", word: m.service.words.notAnswering, notes: [] };
  return { lamp: "hollow", word: m.service.words.notConfigured, notes: [] };
}

export interface MonthQuota {
  readonly used: number;
  readonly plan: number;
  /** 0..1 for the meter. Capped at full: a plan can be overspent, a bar cannot be longer than itself. */
  readonly share: number;
  /** Days of the month the store could not read. Left out of `used`, and said, rather than counted as none. */
  readonly unreadDays: number;
}

/** The month's spend against the plan, from exactly this month's days. Null when none could be read. */
export function monthQuota(history: readonly UsageDay[], plan: number): MonthQuota | null {
  const usage = readSourceUsage(history);
  if (usage.monthTotal === null) return null;
  return { used: usage.monthTotal, plan, share: Math.min(1, usage.monthTotal / plan), unreadDays: history.length - usage.daysCounted };
}

const IST_PARTS = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "numeric", day: "numeric" });
const MONTH_SHORT = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" });

/** Today's day of the month in India — how many days "this month" has had so far. */
export function istDayOfMonth(now: Date): number {
  return Number(IST_PARTS.formatToParts(now).find((p) => p.type === "day")?.value ?? "1");
}

/** "1 Oct": the day the plan resets, which is the 1st of India's next month, not the server's. */
export function resetsOn(now: Date): string {
  const parts = IST_PARTS.formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  // Date.UTC rolls month 12 over to January of the next year on its own.
  return `1 ${MONTH_SHORT.format(new Date(Date.UTC(year, month, 1)))}`;
}

const IST_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });
const DAY_MONTH = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: TIME_ZONE });

/** An audit entry's time as the sheet draws it — and with its day when it is not today's. */
export function auditWhen(at: string, now: Date): string {
  const when = new Date(at);
  return IST_DAY.format(when) === IST_DAY.format(now) ? formatTime(when) : `${DAY_MONTH.format(when)}, ${formatTime(when)}`;
}
