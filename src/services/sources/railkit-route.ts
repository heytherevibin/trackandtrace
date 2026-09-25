import { messages } from "@/messages";
import { log } from "@/services/log";
import type { RouteOutcome, RouteRequest, RouteSource } from "@/services/route-source";
import { isRecord } from "./irctc-record";
import { unavailable } from "./outcome";
import { parseRailkitRouteResponse } from "./railkit-route-parse";

// ---------------------------------------------------------------------------
// RailKit as the trains-on-a-route source — the sibling of `railkit.ts` and
// `railkit-availability.ts`, reading the same base URL, the same `x-api-key`
// header and the same `{ success: false, error }` refusal envelope.
//
// One GET per ask, and only after the pair is readable: the monthly budget is
// shared with live PNR checks and the crawler, so a request is never spent on
// a station code this adapter can already see is wrong.
//
// The rule, one step earlier in the journey than the availability adapter's:
// **a refusal is never "no trains run that pair".** A traveller reads the
// second as "try a different route" and would stop asking.
// ---------------------------------------------------------------------------

export interface RailkitRouteConfig {
  readonly key: string;
  /** https://api.railkit.in unless overridden; no trailing slash. */
  readonly baseUrl: string;
  readonly timeoutMs: number;
}

export interface RailkitRouteDeps {
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
}

const OUT = messages.source.outcomes;
const ROUTE = messages.source.route;

const STATION = /^[A-Z]{2,5}$/;

function seconds(header: string | null): number | undefined {
  if (!header) return undefined;
  const value = Number(header);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

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

/** The pair as the rest of the product states it: trimmed and upper-cased, or null when it is not a pair of codes. */
function normalise(request: RouteRequest): RouteRequest | null {
  const from = request.from.trim().toUpperCase();
  const to = request.to.trim().toUpperCase();
  if (!STATION.test(from) || !STATION.test(to)) return null;
  return { from, to };
}

export function createRailKitRouteSource(config: RailkitRouteConfig, deps: RailkitRouteDeps = {}): RouteSource {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? (() => new Date());

  return {
    async check(request: RouteRequest): Promise<RouteOutcome> {
      const asked = normalise(request);
      if (!asked) return { ok: false, code: "INVALID", message: ROUTE.invalidRequest };

      const path = [asked.from, asked.to].map(encodeURIComponent).join("/");

      let response: Response;
      try {
        response = await doFetch(`${config.baseUrl}/api/v1/trains/between/${path}`, {
          method: "GET",
          cache: "no-store",
          headers: { "x-api-key": config.key, accept: "application/json" },
          signal: AbortSignal.timeout(config.timeoutMs),
        });
      } catch (error) {
        if (isTimeout(error)) {
          log.warn("[source:railkit-route] timed out", { timeoutMs: config.timeoutMs });
          return unavailable(OUT.timeout, "timeout");
        }
        log.warn("[source:railkit-route] request failed", { kind: error instanceof Error ? error.name : typeof error });
        return unavailable(OUT.unreachable, "network");
      }

      if (response.status === 401 || response.status === 403) {
        log.error("[source:railkit-route] key or plan refused", { status: response.status });
        return unavailable(OUT.refused, "refused", { status: response.status });
      }
      if (response.status === 429) {
        log.warn("[source:railkit-route] quota or rate limit reached", { status: response.status });
        return unavailable(OUT.busy, "quota", { status: response.status, retryAfter: retryAfterSeconds(response.headers) });
      }

      const body = await jsonOrNull(response);
      // A 4xx the provider explains: still "we could not ask", never an empty route.
      if (response.status >= 400 && response.status < 500 && isRecord(body) && body.success === false) {
        log.warn("[source:railkit-route] request refused", { status: response.status });
        return unavailable(ROUTE.couldNotAnswer, "server", { status: response.status });
      }
      if (!response.ok) {
        log.warn("[source:railkit-route] provider error", { status: response.status });
        return unavailable(OUT.error, "server", { status: response.status });
      }
      if (body === null) {
        log.warn("[source:railkit-route] unreadable body", { status: response.status });
        return unavailable(OUT.unreadable, "unreadable");
      }

      const parsed = parseRailkitRouteResponse(body, asked, now());
      if (!parsed.ok) log.warn("[source:railkit-route] route not readable");
      return parsed;
    },
  };
}
