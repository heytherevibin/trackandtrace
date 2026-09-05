import { checkPnr } from "./engine";
import type { HistoryPoint, PnrOutcome } from "./types";

// The typed seam the UI consumes. In M1 the synthetic engine runs in the
// client; M3 swaps in a server adapter (government enquiry / reseller) behind
// this same interface without touching any component.
export interface PnrDataSource {
  check(pnr: string, history: HistoryPoint[]): Promise<PnrOutcome>;
}

export const syntheticLatency = () => 650 + Math.random() * 450;

export const clientSyntheticSource: PnrDataSource = {
  async check(pnr, history) {
    await new Promise((r) => setTimeout(r, syntheticLatency()));
    return checkPnr(pnr, history);
  },
};
