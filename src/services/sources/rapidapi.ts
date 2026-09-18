import type { PnrDataSource } from "@/services/pnr-source";
import { log } from "@/services/log";
import type { PnrOutcome } from "@/types/domain";
import { PNR_INVALID_MESSAGE, isValidPnr } from "@/utils/pnr";
import { parseIrctc1Response } from "./rapidapi-parse";
import { messages } from "@/messages";

// ---------------------------------------------------------------------------
// The RapidAPI "IRCTC" API (IRCTCAPI, irctc1.p.rapidapi.com) as a PNR source.
// A third party, not affiliated with IRCTC or Indian Railways: every result it
// produces carries source "rapidapi" and is labelled so in the interface.
//
// One GET per check (the shared query caches for a minute and rate limits per
// connection), a hard timeout, and every failure mapped to an honest outcome.
// Never logs the PNR, the response body, or the key.
// ---------------------------------------------------------------------------

export interface RapidApiConfig {
  readonly key: string;
  readonly host: string;
  readonly path: string;
  readonly timeoutMs: number;
}

export interface RapidApiDeps {
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
}

/** Travellers read one neutral voice; the provider, key, plan and HTTP status stay in the server log. */
const OUT = messages.source.outcomes;

function unavailable(message: string, retryAfter?: number): PnrOutcome {
  return retryAfter === undefined ? { ok: false, code: "SOURCE_UNAVAILABLE", message } : { ok: false, code: "SOURCE_UNAVAILABLE", message, retryAfter };
}

function retryAfterSeconds(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isInteger(seconds) && seconds > 0 ? seconds : undefined;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

export function createRapidApiSource(config: RapidApiConfig, deps: RapidApiDeps = {}): PnrDataSource {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? (() => new Date());

  return {
    async check(pnr: string): Promise<PnrOutcome> {
      if (!isValidPnr(pnr)) return { ok: false, code: "INVALID", message: PNR_INVALID_MESSAGE };

      const url = `https://${config.host}${config.path}?pnrNumber=${encodeURIComponent(pnr)}`;
      let response: Response;
      try {
        response = await doFetch(url, {
          method: "GET",
          cache: "no-store",
          headers: { "x-rapidapi-key": config.key, "x-rapidapi-host": config.host, accept: "application/json" },
          signal: AbortSignal.timeout(config.timeoutMs),
        });
      } catch (error) {
        if (isTimeout(error)) {
          log.warn("[source:rapidapi] timed out", { timeoutMs: config.timeoutMs });
          return unavailable(OUT.timeout);
        }
        log.warn("[source:rapidapi] request failed", { kind: error instanceof Error ? error.name : typeof error });
        return unavailable(OUT.unreachable);
      }

      if (response.status === 401 || response.status === 403) {
        log.error("[source:rapidapi] credentials refused", { status: response.status });
        return unavailable(OUT.refused);
      }
      if (response.status === 429) {
        log.warn("[source:rapidapi] quota exhausted", { status: response.status });
        return unavailable(OUT.busy, retryAfterSeconds(response.headers.get("retry-after")));
      }
      if (!response.ok) {
        log.warn("[source:rapidapi] provider error", { status: response.status });
        return unavailable(OUT.error);
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        log.warn("[source:rapidapi] unreadable body", { status: response.status });
        return unavailable(OUT.unreadable);
      }

      const parsed = parseIrctc1Response(body, pnr, now());
      if (!parsed.ok && parsed.code === "SOURCE_UNAVAILABLE") log.warn("[source:rapidapi] record not readable");
      return parsed;
    },
  };
}
