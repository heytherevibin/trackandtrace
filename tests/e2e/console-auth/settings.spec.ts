import { consoleMessages } from "@/console/messages";
import { consoleSql, expect, resetConsole, setUpFirstOwner, test } from "./fixtures";
import { tapThrough } from "./team-helpers";
import { gotoReady } from "../helpers";

const BASE = "http://admin.localhost:4211";
const m = consoleMessages.settings;

test.beforeEach(() => resetConsole());

/**
 * A real save of module 11's one control, through the drawn dialog and a real tap, checked in the
 * database. Nothing did this until 2026-09-28 — and every save was being refused: the dialog minted
 * its tap over ("Change the live-check limit", "Switches & settings", "300") while
 * console_save_settings spends ('settings.save', <environment>, <changes as jsonb text>). The unit
 * tests mocked the tap at its edge, so both halves were green and the whole never worked.
 */
test("an Owner changes the live-check limit, and it reaches the database", async ({ page, baseURL }) => {
  const read = () => consoleSql("select coalesce(live_checks_per_day::text, '') from console.settings where environment = 'development'");
  const before = read();
  const next = before === "450" ? 451 : 450;
  try {
    await setUpFirstOwner(page, baseURL ?? BASE);
    await gotoReady(page, "/settings");
    const field = page.getByRole("spinbutton", { name: m.limits.liveChecks.name });
    await field.fill(String(next));
    await page.getByRole("button", { name: m.limits.liveChecks.save }).click();
    await tapThrough(page, "Raising the budget for the long weekend");

    await expect(page.getByText(m.state.saved(`${m.limits.liveChecks.name} ${next}`))).toBeVisible();
    expect(read()).toBe(String(next));
  } finally {
    // The local stack is shared: put the row back as it was, directly, rather than leave a test's number behind.
    consoleSql(`update console.settings set live_checks_per_day = ${before === "" ? "null" : before} where environment = 'development'`);
  }
});
