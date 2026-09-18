import type { PnrDataSource } from "@/services/pnr-source";
import { log } from "@/services/log";
import { isRecord } from "./irctc-record";
import type { PnrOutcome } from "@/types/domain";
import { PNR_INVALID_MESSAGE, isValidPnr } from "@/utils/pnr";
import { parseRailkitPnrResponse } from "./railkit-parse";

// ---------------------------------------------------------------------------
// RailKit (railkit.in) as a PNR source, over its REST API. A third party, not
// affiliated with IRCTC or Indian Railways and not an official source: every
// result carries source "railkit" and is labelled so in the interface.
//
// The published `railkit` npm SDK ships only obfuscated code, so it is not
// used: this adapter calls the documented endpoint directly, with its own
// timeout and fail-closed parsing. One GET per check (the shared query caches
// for a minute and rate limits per connection). Never logs the PNR, the
// response body, or the key.
// ---------------------------------------------------------------------------

export interface RailkitConfig {
  readonly key: string;
  /** https://api.railkit.in unless overridden; no trailing slash. */
  readonly baseUrl: string;
  readonly timeoutMs: number;
}

export interface RailkitDeps {
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
}

function unavailable(message: string, retryAfter?: number): PnrOutcome {
  return retryAfter === undefined ? { ok: false, code: "SOURCE_UNAVAILABLE", message } : { ok: false, code: "SOURCE_UNAVAILABLE", message, retryAfter };
}

function seconds(header: string | null): number | undefined {
  if (!header) return undefined;
  const value = Number(header);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

/** Retry-After first, then the IETF RateLimit-Reset RailKit sends with its token bucket. */
function retryAfterSeconds(headers: Headers): number | undefined {
  return seconds(headers.get("retry-after")) ?? seconds(headers.get("ratelimit-reset"));
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

async function jsonOrNull(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function createRailkitSource(config: RailkitConfig, deps: RailkitDeps = {}): PnrDataSource {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? (() => new Date());

  return {
    async check(pnr: string): Promise<PnrOutcome> {
      if (!isValidPnr(pnr)) return { ok: false, code: "INVALID", message: PNR_INVALID_MESSAGE };

      let response: Response;
      try {
        response = await doFetch(`${config.baseUrl}/api/v1/pnr/${encodeURIComponent(pnr)}`, {
          method: "GET",
          cache: "no-store",
          headers: { "x-api-key": config.key, accept: "application/json" },
          signal: AbortSignal.timeout(config.timeoutMs),
        });
      } catch (error) {
        if (isTimeout(error)) {
          log.warn("[source:railkit] timed out", { timeoutMs: config.timeoutMs });
          return unavailable("RailKit did not answer in time. Nothing was shown in its place.");
        }
        log.warn("[source:railkit] request failed", { kind: error instanceof Error ? error.name : typeof error });
        return unavailable("RailKit could not be reached. Nothing was shown in its place.");
      }

      if (response.status === 401 || response.status === 403) {
        log.error("[source:railkit] key or plan refused", { status: response.status });
        return unavailable("RailKit refused this deployment's API key or plan. Nothing was shown in its place.");
      }
      if (response.status === 429) {
        log.warn("[source:railkit] quota or rate limit reached", { status: response.status });
        return unavailable("RailKit's request limit is used up for now. Try again later.", retryAfterSeconds(response.headers));
      }

      const body = await jsonOrNull(response);
      // RailKit refuses with a 4xx and { success: false, error }: HTTP 400 "No PNR data found or invalid PNR
      // number" is its no-record answer (probed 2026-09-18). The parser reads the refusal text.
      if (response.status >= 400 && response.status < 500 && isRecord(body) && body.success === false) {
        const refused = parseRailkitPnrResponse(body, pnr, now());
        if (!refused.ok && refused.code === "SOURCE_UNAVAILABLE") log.warn("[source:railkit] request refused", { status: response.status });
        return refused;
      }
      if (!response.ok) {
        log.warn("[source:railkit] provider error", { status: response.status });
        return unavailable(`RailKit returned an error (HTTP ${response.status}). Nothing was shown in its place.`);
      }
      if (body === null) {
        log.warn("[source:railkit] unreadable body", { status: response.status });
        return unavailable("RailKit returned an unreadable response. Nothing was shown in its place.");
      }

      const parsed = parseRailkitPnrResponse(body, pnr, now());
      if (!parsed.ok && parsed.code === "SOURCE_UNAVAILABLE") log.warn("[source:railkit] record not readable");
      return parsed;
    },
  };
}
