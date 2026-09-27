import { test as base, expect } from "@playwright/test";

// Each worker gets its own forwarded address so parallel runs each hold their
// own 20-per-minute PNR budget, instead of jointly exhausting one IP's.
export const test = base.extend({
  context: async ({ context }, runTest, testInfo) => {
    await context.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${(testInfo.workerIndex % 200) + 10}` });
    // The runner's software GPU (SwiftShader) draws the live train slower than any frame budget, so left alone the
    // governor would floor it to the still mid-spec. Budgets are proven on a real GPU instead (J5-12); every spec here
    // keeps the drawing live unless it asks otherwise. Read only outside production builds (scene/live.ts).
    await context.addInitScript(() => {
      window.__ttHoldFloor = true;
    });
    await runTest(context);
  },
});

export { expect };
