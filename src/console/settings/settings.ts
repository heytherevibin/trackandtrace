// What module 11's Limits plate is given to draw, and the rules for reading it.
//
// Pure: a row in, a shape out. The reads themselves live in the page, so this file can be tested
// without a database and the plate can be drawn from a fixture.
//
// **Two absences that are not zeroes**, and the plate must be able to tell them apart:
//
//   * a NULL column means the console has not taken that switch over, so the deployment's own
//     number is still in force. Not zero, not "off" — the same rule `runtime-settings` keeps on the
//     traveller side, stated once in each place because the two read the same column for different
//     reasons and must not drift.
//   * a meter that could not be read is not a meter reading zero. "0 used today" is a claim about a
//     quiet day; an unread counter is an absence. Drawing the first for the second tells an operator
//     the site is idle when it may be busy, which is the one thing a meter exists to prevent.

/** The columns this plate reads, shaped as `console_auth_read_settings` returns them. */
export interface SettingsRow {
  readonly live_checks_per_day: number | null;
  readonly version: number;
  readonly changed_at: string | null;
  readonly changed_by_name: string | null;
}

/** A number in force, and whether the console is the reason it is. */
export interface LimitInForce {
  readonly value: number;
  readonly fromConsole: boolean;
}

export interface Limits {
  readonly liveChecks: LimitInForce;
  /** Today's spend for the meter, or null when the counter could not be read. */
  readonly used: number | null;
  /** The optimistic-concurrency token `console_save_settings` checks. Null when there is no row to save against. */
  readonly version: number | null;
  readonly changedAt: string | null;
  readonly changedBy: string | null;
}

/** The column's own check constraint, restated because this side must not trust the row either. */
const MIN = 1;
const MAX = 1_000_000;

function inForce(stored: number | null, fallback: number): LimitInForce {
  if (stored === null || !Number.isInteger(stored) || stored < MIN || stored > MAX) return { value: fallback, fromConsole: false };
  return { value: stored, fromConsole: true };
}

export function readLimits(row: SettingsRow | null, at: { readonly used: number | null; readonly fallback: number }): Limits {
  return {
    liveChecks: inForce(row?.live_checks_per_day ?? null, at.fallback),
    used: at.used,
    version: row?.version ?? null,
    changedAt: row?.changed_at ?? null,
    changedBy: row?.changed_by_name ?? null,
  };
}

/**
 * The message `console_save_settings`'s stale-version refusal reaches the browser with.
 *
 * It lives in this pure module because both sides need it and neither may import the other's: the
 * server builds the `AppError` with it, the browser tells that refusal from an unreachable store by
 * it. `apiRequest` does not carry the HTTP status, so the string is the only signal that crosses —
 * and one string in one place is the alternative to two copies drifting apart.
 *
 * Both failures leave the setting unchanged, which is why they must still be told apart: an operator
 * told "the change didn't reach the store" about a change that DID reach it, made by somebody else a
 * minute ago, goes looking for a broken database.
 */
export const STALE_VERSION_MESSAGE = "The settings changed while this page was open.";
