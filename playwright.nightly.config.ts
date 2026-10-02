import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

// The journey's nightly e2e (spec 2026-09-24 §5, §8; J6-3), on the same fixture-mode `next dev` as every PR:
// - sizes: the landing at fifteen sizes, and at 200% text at the PR's three;
// - screens: every chapter photographed in Day, Night and on a phone;
// - webkit and webkit-phone: the journey's place (and place-steps), run (and run-place), link glide, Night falls and
//   drawing specs in WebKit, Safari's engine (§8);
// - slow-device and slow-device-phone: a device too slow to draw steps quality down, then draws still (§4), at 60× CPU
//   in Chromium: minutes on a slow core, and machine-bound, so nightly only (its governor's rules are unit-tested).
// .github/workflows/journey-nightly.yml runs it in three shards:
//   npx playwright test -c playwright.nightly.config.ts
const JOURNEY_IN_WEBKIT = /journey\/(place|place-steps|run|run-place|link-glide|night-falls|drawing-modes|live-drawing)\.spec\.ts$/;

export default defineConfig({
  ...base,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never", outputFolder: "playwright-report-nightly" }]] : [["list"]],
  projects: [
    { name: "sizes", testMatch: /nightly\/sizes\.spec\.ts$/, use: { ...devices["Desktop Chrome"] } },
    { name: "screens", testMatch: /nightly\/screens\.spec\.ts$/, use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", testMatch: JOURNEY_IN_WEBKIT, use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 800 } } },
    { name: "webkit-phone", testMatch: JOURNEY_IN_WEBKIT, use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } } },
    { name: "slow-device", testMatch: /nightly\/slow-device\.spec\.ts$/, use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "slow-device-phone", testMatch: /nightly\/slow-device\.spec\.ts$/, use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
});
