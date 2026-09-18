import type { PnrDataSource } from "@/services/pnr-source";
import { log } from "@/services/log";

// ---------------------------------------------------------------------------
// Primary source first; the fallback answers only while the primary is
// unavailable. "No record", an invalid PNR and our own rate limit are answers,
// never reasons to ask elsewhere. Each result keeps the source that produced
// it, so a fallback answer is labelled as the fallback. When both fail, the
// primary's explanation is kept.
// ---------------------------------------------------------------------------

export function createFallbackSource(primary: PnrDataSource, fallback: PnrDataSource): PnrDataSource {
  return {
    async check(pnr) {
      const first = await primary.check(pnr);
      if (first.ok || first.code !== "SOURCE_UNAVAILABLE") return first;

      try {
        const second = await fallback.check(pnr);
        if (second.ok || second.code !== "SOURCE_UNAVAILABLE") {
          log.warn("[source:fallback] answered while the primary was unavailable");
          return second;
        }
      } catch (error) {
        log.error("[source:fallback] threw", { kind: error instanceof Error ? error.name : typeof error });
      }
      return first;
    },
  };
}
