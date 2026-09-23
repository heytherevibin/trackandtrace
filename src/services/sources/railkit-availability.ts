import { messages } from "@/messages";
import type { AvailabilityOutcome, AvailabilityRequest, AvailabilitySource } from "@/services/availability-source";
import { log } from "@/services/log";
import { bookingClassSchema, quotaSchema } from "@/types/schemas";
import { isRecord } from "./irctc-record";
import { unavailable, type SourceFailure } from "./outcome";
import { classifyAvailabilityRefusal, parseRailkitAvailabilityResponse, refusalFailure } from "./railkit-availability-parse";

// ---------------------------------------------------------------------------
// RailKit (railkit.in) as a seat-availability source, over its REST API — the
// sibling of `railkit.ts`, which reads the same base URL, the same `x-api-key`
// header and the same `{ success: false, error }` refusal envelope for PNRs.
// A third party, not affiliated with IRCTC or Indian Railways, and never named
// in front of a traveller.
//
// One GET per check. The key is sent as a header and never as a path or query
// segment, so it cannot land in a proxy log. Nothing here logs the key, the
// body, or anything about a person — these are facts about berths.
//
// **The date is converted here and nowhere else.** ISO crosses every internal
// boundary; `DD-MM-YYYY` exists only in the URL this file builds. That is not
// style: RailKit answers `Invalid date format. Use DD-MM-YYYY.` for an ISO date
// and `Date still invalid after normalization.` elsewhere, and a second
// conversion site is how those two diverge.
// ---------------------------------------------------------------------------

export interface RailkitAvailabilityConfig {
  readonly key: string;
  /** https://api.railkit.in unless overridden; no trailing slash. */
  readonly baseUrl: string;
  readonly timeoutMs: number;
}

export interface RailkitAvailabilityDeps {
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
}

const OUT = messages.source.outcomes;
const AV = messages.source.availability;

const TRAIN_NO = /^\d{5}$/;
const STATION = /^[A-Z]{2,5}$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * ISO `2026-09-23` → `23-09-2026`, the only place in this product that writes a
 * provider's date format. A date that is not ISO, or not a real calendar day,
 * returns null and no request is spent.
 */
export function toProviderDate(iso: string): string | null {
  const match = ISO_DATE.exec(iso.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  if (!year || !month || !day) return null;
  const probe = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (probe.getUTCFullYear() !== Number(year) || probe.getUTCMonth() !== Number(month) - 1 || probe.getUTCDate() !== Number(day)) return null;
  return `${day}-${month}-${year}`;
}

interface Asked {
  /** The request as the rest of the product states it: still ISO, trimmed and upper-cased. */
  readonly request: AvailabilityRequest;
  /** The six URL segments, with the date in the provider's form. */
  readonly segments: readonly string[];
}

/** Everything the URL needs, checked before a request is spent. Nothing is coerced: a value that does not parse is refused. */
function normalise(request: AvailabilityRequest): Asked | null {
  const trainNo = request.trainNo.trim();
  const from = request.from.trim().toUpperCase();
  const to = request.to.trim().toUpperCase();
  const travelClass = bookingClassSchema.safeParse(request.travelClass.trim().toUpperCase());
  const quota = quotaSchema.safeParse(request.quota.trim().toUpperCase());
  const journeyDate = request.journeyDate.trim();
  const providerDate = toProviderDate(journeyDate);
  if (!TRAIN_NO.test(trainNo) || !STATION.test(from) || !STATION.test(to)) return null;
  if (!travelClass.success || !quota.success || !providerDate) return null;
  return {
    request: { trainNo, from, to, journeyDate, travelClass: travelClass.data, quota: quota.data },
    segments: [trainNo, from, to, providerDate, travelClass.data, quota.data],
  };
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

/** A 4xx `{ success: false, error }` refusal, read for what it says and logged for what it costs us. */
function refusal(body: unknown, status: number): SourceFailure {
  const said = isRecord(body) && typeof body.error === "string" ? body.error : "";
  const kind = classifyAvailabilityRefusal(said);
  if (kind === "our-date-format") log.error("[source:railkit-availability] the date this adapter sent was refused", { status });
  else log.warn("[source:railkit-availability] request refused", { status, kind });
  return refusalFailure(kind);
}

export function createRailKitAvailabilitySource(config: RailkitAvailabilityConfig, deps: RailkitAvailabilityDeps = {}): AvailabilitySource {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? (() => new Date());

  return {
    async check(request: AvailabilityRequest): Promise<AvailabilityOutcome> {
      const asked = normalise(request);
      if (!asked) return { ok: false, code: "INVALID", message: AV.invalidRequest };

      const path = asked.segments.map(encodeURIComponent).join("/");

      let response: Response;
      try {
        response = await doFetch(`${config.baseUrl}/api/v1/seats/${path}`, {
          method: "GET",
          cache: "no-store",
          headers: { "x-api-key": config.key, accept: "application/json" },
          signal: AbortSignal.timeout(config.timeoutMs),
        });
      } catch (error) {
        if (isTimeout(error)) {
          log.warn("[source:railkit-availability] timed out", { timeoutMs: config.timeoutMs });
          return unavailable(OUT.timeout, "timeout");
        }
        log.warn("[source:railkit-availability] request failed", { kind: error instanceof Error ? error.name : typeof error });
        return unavailable(OUT.unreachable, "network");
      }

      if (response.status === 401 || response.status === 403) {
        log.error("[source:railkit-availability] key or plan refused", { status: response.status });
        return unavailable(OUT.refused, "refused", { status: response.status });
      }
      if (response.status === 429) {
        log.warn("[source:railkit-availability] quota or rate limit reached", { status: response.status });
        return unavailable(OUT.busy, "quota", { status: response.status, retryAfter: retryAfterSeconds(response.headers) });
      }

      const body = await jsonOrNull(response);
      if (response.status >= 400 && response.status < 500 && isRecord(body) && body.success === false) return refusal(body, response.status);

      if (!response.ok) {
        log.warn("[source:railkit-availability] provider error", { status: response.status });
        return unavailable(OUT.error, "server", { status: response.status });
      }
      if (body === null) {
        log.warn("[source:railkit-availability] unreadable body", { status: response.status });
        return unavailable(OUT.unreadable, "unreadable");
      }

      // The parser checks the answer is about the train we asked for, so it reads the normalised
      // request rather than the caller's spacing and casing.
      const parsed = parseRailkitAvailabilityResponse(body, asked.request, now());
      if (!parsed.ok && parsed.code === "SOURCE_UNAVAILABLE") log.warn("[source:railkit-availability] record not readable");
      return parsed;
    },
  };
}
