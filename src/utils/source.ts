import type { PnrSource, PublicPnrSource } from "@/types/domain";

// What a traveller is told about where a record came from: labelled sample data, or Trakline.
// The provider behind a check stays on the server (src/services).

export type { PublicPnrSource };

export function publicSourceOf(source: PnrSource): PublicPnrSource {
  return source === "fixture" ? "fixture" : "live";
}
