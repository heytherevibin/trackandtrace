import { env, liveRequestsPerDay, type Env } from "./env";
import { log } from "./log";
import { createAdminSupabase } from "./supabase/admin";
import { isSupabaseConfigured } from "./supabase/public-env";

// ---------------------------------------------------------------------------
// The console's runtime settings, read on the traveller path. Server only.
//
// Design §F sets the waterfall, and every step exists because the one after it
// is worse:
//
//   1. an in-process copy, fresh for 5 seconds
//   2. then ONE Postgres read, with an 800 ms timeout
//   3. then the LAST GOOD value
//   4. then the deployment's defaults
//
// **The rule underneath all four: a check must keep answering.** §5 puts it as
// "Settings unreadable | Last good value, then the deployment's defaults; checks
// keep answering". A settings store that cannot be read is an inconvenience. A
// settings store that stops PNR checks is an outage this module caused, and it
// would be a worse one than whatever it was trying to control.
//
// Hence: nothing here throws into a caller, every failure has a value to fall
// back to, and the timeout is real rather than aspirational — a read that never
// returns must not become a check that never returns.
//
// **Null means "the deployment's default".** Every column in `console.settings`
// is nullable and null is never "zero" or "off": it means the console has not
// taken that switch over, so the environment still owns it. `liveChecksPerDay`
// therefore takes the default from its caller rather than reaching for `env()`
// itself, so the one place that reads `LIVE_REQUESTS_PER_DAY` stays the one
// place that reads it.
//
// **Each field is validated on its own**, so one bad column cannot take the
// others down with it. A value outside the column's own check constraint can
// only have been written by something that is not the console — and a live-check
// limit of zero would stop every check on the site, which is precisely the
// failure this module must not cause.
//
// Today it reads one switch. The other seven in §F are written the same way,
// one line each, when their surfaces ship.
// ---------------------------------------------------------------------------

/** How long an in-process copy is served before the store is asked again. Design §F: about five seconds. */
export const COPY_FRESH_MS = 5_000;
/** How long one Postgres read may take before the waterfall moves on without it. Design §F. */
export const READ_TIMEOUT_MS = 800;

/** The column's own check constraint, restated here because this side must not trust the row either. */
const MIN_LIVE_CHECKS = 1;
const MAX_LIVE_CHECKS = 1_000_000;

/** The console's own limit on a notice (the column allows 200; the Switches sheet draws 160). */
export const SITE_NOTICE_MAX = 160;

/** The strip travellers see under the masthead. `version` changes with the text, so a closed notice stays closed only until it says something new. */
export interface SiteNotice {
  readonly text: string;
  readonly version: number;
}

/** What this module has decided the console is asking for. Null on a field means the deployment's default. */
interface Snapshot {
  readonly liveChecksPerDay: number | null;
  /** Off is the default: there is no deployment value for a notice. */
  readonly siteNotice: SiteNotice | null;
  readonly readAt: number;
}

export interface RuntimeSettingsDeps {
  /** One read of `console.settings` for this environment. Returns the row, or anything at all — it is validated. */
  readonly read: () => Promise<unknown>;
  readonly now: () => number;
  /** Injected so the timeout can be tested without waiting for it. */
  readonly wait?: (ms: number) => Promise<void>;
}

export interface RuntimeSettings {
  /** Today's live-check limit: the console's, or `fallback` when the console has not set one. */
  liveChecksPerDay: (fallback: number) => Promise<number>;
  /** The site notice when it is on, or null. */
  siteNotice: () => Promise<SiteNotice | null>;
}

/** An integer inside the column's range, or null. Anything else is not a limit and is refused. */
function readLiveChecks(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < MIN_LIVE_CHECKS || value > MAX_LIVE_CHECKS) return null;
  return value;
}

/**
 * On, with text to show, within the console's limit — or null. A version that is missing or not a
 * whole number reads as the first, so a device can still close the notice.
 */
function readSiteNotice(row: Record<string, unknown>): SiteNotice | null {
  if (row.site_notice_on !== true) return null;
  const text = typeof row.site_notice_text === "string" ? row.site_notice_text.trim() : "";
  if (text === "" || text.length > SITE_NOTICE_MAX) return null;
  const version = typeof row.site_notice_version === "number" && Number.isInteger(row.site_notice_version) && row.site_notice_version >= 1 ? row.site_notice_version : 1;
  return { text, version };
}

function isRow(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createRuntimeSettings(deps: RuntimeSettingsDeps): RuntimeSettings {
  const sleep = deps.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  /** Step 1. Replaced whole on every successful read, never patched field by field. */
  let copy: Snapshot | null = null;
  /** Step 3. Only ever set from a read that succeeded, so it is always a value the console really asked for. */
  let lastGood: Snapshot | null = null;

  /**
   * What a failed attempt leaves behind: the last good values, stamped NOW.
   *
   * Without this the waterfall retries on every single request, so a settings store that is down
   * adds a read — and up to its whole 800 ms timeout — to every traveller check. That is far worse
   * than serving a value five seconds old, which is the most this can cost. One attempt per window,
   * whatever happens.
   */
  function hold(): Snapshot | null {
    copy = { liveChecksPerDay: lastGood?.liveChecksPerDay ?? null, siteNotice: lastGood?.siteNotice ?? null, readAt: deps.now() };
    return lastGood;
  }

  async function current(): Promise<Snapshot | null> {
    if (copy !== null && deps.now() - copy.readAt < COPY_FRESH_MS) return copy;

    let row: unknown;
    try {
      // A sentinel rather than a rejection: a timeout is not an error, it is this
      // module declining to wait any longer, and the difference matters to the log.
      const timedOut = Symbol("timed out");
      row = await Promise.race([deps.read(), sleep(READ_TIMEOUT_MS).then(() => timedOut)]);
      if (row === timedOut) {
        log.warn("[settings] the settings read did not answer in time; using the last good value", { timeoutMs: READ_TIMEOUT_MS });
        return hold();
      }
    } catch (err) {
      // Includes a `read` that throws synchronously, which `Promise.race` would
      // otherwise let escape before any promise existed to catch it.
      log.warn("[settings] the settings store could not be read; using the last good value", { message: err instanceof Error ? err.message : "unknown" });
      return hold();
    }

    const fresh: Snapshot = {
      liveChecksPerDay: isRow(row) ? readLiveChecks(row.live_checks_per_day) : null,
      siteNotice: isRow(row) ? readSiteNotice(row) : null,
      readAt: deps.now(),
    };
    copy = fresh;
    lastGood = fresh;
    return fresh;
  }

  return {
    async liveChecksPerDay(fallback) {
      const snapshot = await current();
      return snapshot?.liveChecksPerDay ?? fallback;
    },
    async siteNotice() {
      const snapshot = await current();
      return snapshot?.siteNotice ?? null;
    },
  };
}

/** Which row of `console.settings` this deployment reads. `NODE_ENV` only decides it when Vercel has not. */
export function settingsEnvironment(current: Env = env()): "production" | "preview" | "development" {
  if (current.VERCEL_ENV) return current.VERCEL_ENV;
  return current.NODE_ENV === "production" ? "production" : "development";
}

let shared: RuntimeSettings | null = null;

/** The deployment's own instance, wired to Supabase. One per process, because the copy is what makes this cheap. */
export function runtimeSettings(current: Env = env()): RuntimeSettings {
  shared ??= createRuntimeSettings({
    now: () => Date.now(),
    read: async () => {
      // No store is not a failure. A deployment without Supabase has no console and therefore no
      // settings to read, so this answers "nothing set" rather than attempting a read that would
      // throw — which, before the guard, warned once per budget check on every such deployment.
      if (!isSupabaseConfigured() || !current.SUPABASE_SECRET_KEY) return null;
      const db = createAdminSupabase();
      const { data, error } = await db.rpc("console_auth_read_settings", { p_environment: settingsEnvironment(current) });
      if (error) throw new Error(error.message);
      return data;
    },
  });
  return shared;
}

/**
 * The daily live-check budget as it stands right now: the console's value, or the deployment's.
 *
 * `liveRequestsPerDay` stays the one place `LIVE_REQUESTS_PER_DAY` is read — its own comment says
 * it was written that way "so the console can later own it", and this is later.
 */
export async function liveChecksPerDay(current: Env = env()): Promise<number> {
  return runtimeSettings(current).liveChecksPerDay(liveRequestsPerDay(current));
}

/** The site notice as it stands right now, for the traveller strip — or null when it is off. Never throws. */
export async function siteNotice(current: Env = env()): Promise<SiteNotice | null> {
  return runtimeSettings(current).siteNotice();
}
