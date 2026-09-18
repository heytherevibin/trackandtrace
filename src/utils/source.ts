import type { PnrSource } from "@/types/domain";

// Which sources are third parties: real reservation records from a provider that is
// not an official railway source, always labelled "Third-party" with the provider named.
// Client-safe (no env access), so components and the env schema share one definition.

export type ThirdPartySource = Extract<PnrSource, "rapidapi" | "railkit">;

export function isThirdPartySource(source: PnrSource): source is ThirdPartySource {
  return source === "rapidapi" || source === "railkit";
}
