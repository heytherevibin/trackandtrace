import { messages } from "@/messages";
import type { PnrSnapshot, PnrSource } from "@/types/domain";
import { isThirdPartySource } from "@/utils/source";

// How a record's optional facts read. A fact the source did not send says "Not returned";
// nothing here estimates a value the source did not provide.

const NOT_RETURNED = messages.common.notReturned;

/** "19:20 IST", or Not returned. */
export function timeValue(time: string | undefined, format: (time: string) => string = messages.result.facts.time): string {
  return time ? format(time) : NOT_RETURNED;
}

/** The chart: a time where the source gave one, else its prepared state as reported, else Not returned. */
export function chartValue(snapshot: PnrSnapshot, format: (time: string) => string = messages.result.facts.time): string {
  if (snapshot.chartTime) return format(snapshot.chartTime);
  if (snapshot.chartPrepared === true) return messages.result.facts.chartPrepared;
  if (snapshot.chartPrepared === false) return messages.result.facts.chartNotPrepared;
  return NOT_RETURNED;
}

/** "2,444 km", or Not returned. */
export function distanceValue(km: number | undefined): string {
  return km === undefined ? NOT_RETURNED : messages.result.facts.km(new Intl.NumberFormat("en-IN").format(km));
}

/** Which tag a result wears beside its status: the fixture's Sample data, or the third-party source's label. */
export function sourceTagFor(source: PnrSource): "sample" | "thirdParty" | null {
  if (source === "fixture") return "sample";
  if (isThirdPartySource(source)) return "thirdParty";
  return null;
}
