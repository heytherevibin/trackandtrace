import type { PnrResult, PublicPnrResult } from "@/types/domain";
import { publicSourceOf } from "@/utils/source";

/** The record as it leaves the server: the provider that answered is never named to the browser. */
export function toPublicResult(result: PnrResult): PublicPnrResult {
  return { ...result, snapshot: { ...result.snapshot, source: publicSourceOf(result.snapshot.source) } };
}
