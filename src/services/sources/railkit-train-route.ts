import { messages } from "@/messages";
import { log } from "@/services/log";
import type { TrainRouteOutcome, TrainRouteRequest, TrainRouteSource } from "@/services/train-route-source";
import { isRecord } from "./irctc-record";
import { unavailable } from "./outcome";
import { parseRailkitTrainRouteResponse } from "./railkit-train-route-parse";

// ---------------------------------------------------------------------------
// RailKit as the one-train-run source — the sibling of `railkit-route.ts`,
// reading the same base URL, the same `x-api-key` header and the same
// `{ success: false, error }` refusal envelope.
//
// `GET /api/v1/trains/:trainNo/info`. Found by reading the provider's own
// documentation on 2026-09-26, after twenty-two guessed paths had produced a
// confident and wrong "this endpoint does not exist".
//
// One GET per TRAIN, and only after the number is readable: a request is never
// spent on a train number this adapter can already see is wrong.
//
// The rule it inherits: **a refusal is never an empty run.** Every train calls
// somewhere, so an empty stop list can only mean the record was not understood,
// and the parser refuses it rather than drawing a train that stops nowhere.
// ---------------------------------------------------------------------------

export interface RailkitTrainRouteConfig {
  readonly key: string;
  /** https://api.railkit.in unless overridden; no trailing slash. */
  readonly baseUrl: string;
  readonly timeoutMs: number;
}

export interface RailkitTrainRouteDeps {
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
}

const OUT = messages.source.outcomes;
const ROUTE = messages.source.route;

const TRAIN_NO = /^\d{5}$/;

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

export function createRailKitTrainRouteSource(config: RailkitTrainRouteConfig, deps: RailkitTrainRouteDeps = {}): TrainRouteSource {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? (() => new Date());

  return {
    async check(request: TrainRouteRequest): Promise<TrainRouteOutcome> {
      const trainNo = request.trainNo.trim();
      if (!TRAIN_NO.test(trainNo)) return { ok: false, code: "INVALID", message: ROUTE.invalidRequest };

      let response: Response;
      try {
        response = await doFetch(`${config.baseUrl}/api/v1/trains/${encodeURIComponent(trainNo)}/info`, {
          method: "GET",
          cache: "no-store",
          headers: { "x-api-key": config.key, accept: "application/json" },
          signal: AbortSignal.timeout(config.timeoutMs),
        });
      } catch (error) {
        if (isTimeout(error)) {
          log.warn("[source:railkit-train-route] timed out", { timeoutMs: config.timeoutMs });
          return unavailable(OUT.timeout, "timeout");
        }
        log.warn("[source:railkit-train-route] request failed", { kind: error instanceof Error ? error.name : typeof error });
        return unavailable(OUT.unreachable, "network");
      }

      if (response.status === 401 || response.status === 403) {
        log.error("[source:railkit-train-route] key or plan refused", { status: response.status });
        return unavailable(OUT.refused, "refused", { status: response.status });
      }
      if (response.status === 429) {
        log.warn("[source:railkit-train-route] quota or rate limit reached", { status: response.status });
        return unavailable(OUT.busy, "quota", { status: response.status, retryAfter: retryAfterSeconds(response.headers) });
      }

      const body = await jsonOrNull(response);
      // A 4xx the provider explains: still "we could not ask", never an empty run.
      if (response.status >= 400 && response.status < 500 && isRecord(body) && body.success === false) {
        log.warn("[source:railkit-train-route] request refused", { status: response.status });
        return unavailable(ROUTE.couldNotAnswer, "server", { status: response.status });
      }
      if (!response.ok) {
        log.warn("[source:railkit-train-route] provider error", { status: response.status });
        return unavailable(OUT.error, "server", { status: response.status });
      }
      if (body === null) {
        log.warn("[source:railkit-train-route] unreadable body", { status: response.status });
        return unavailable(OUT.unreadable, "unreadable");
      }

      const parsed = parseRailkitTrainRouteResponse(body, trainNo, now());
      if (!parsed.ok) log.warn("[source:railkit-train-route] run not readable");
      return parsed;
    },
  };
}
