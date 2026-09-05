import { checkPnr } from "./engine";
import type { PnrDataSource } from "./source";

// Server-side adapter behind the same PnrDataSource seam the client uses.
// M3 swaps this for the live source (govt enquiry / reseller) without
// touching the API layer or the UI. The engine is deterministic, so the
// server read and the client read agree for the same PNR.
export const serverSyntheticSource: PnrDataSource = {
  async check(pnr, history) {
    return checkPnr(pnr, history);
  },
};