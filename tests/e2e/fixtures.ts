import { test as base, expect } from "@playwright/test";

// Each worker gets its own forwarded address so parallel runs each hold their
// own 20-per-minute PNR budget, instead of jointly exhausting one IP's.
export const test = base.extend({
  context: async ({ context }, runTest, testInfo) => {
    await context.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${(testInfo.workerIndex % 200) + 10}` });
    await runTest(context);
  },
});

export { expect };
