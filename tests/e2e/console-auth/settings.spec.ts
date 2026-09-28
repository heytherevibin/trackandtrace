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
    // Two plates on this page each have a "Save"; press the one beside this field.
    await page.locator("section", { has: field }).getByRole("button", { name: m.limits.liveChecks.save }).click();
    await tapThrough(page, "Raising the budget for the long weekend");

    await expect(page.getByText(m.state.saved(`${m.limits.liveChecks.name} ${next}`))).toBeVisible();
    expect(read()).toBe(String(next));
  } finally {
    // The local stack is shared: put the row back as it was, directly, rather than leave a test's number behind.
    consoleSql(`update console.settings set live_checks_per_day = ${before === "" ? "null" : before} where environment = 'development'`);
  }
});

/**
 * The site notice, end to end: turned on here through a real tap, drawn under the masthead on the
 * traveller site, closed there, and — the sheet's rule — still closed on the next page for this device.
 */
test("an Owner turns the site notice on, and travellers see it until they close it", async ({ page, baseURL }) => {
  const base = baseURL ?? BASE;
  const traveller = base.replace("admin.localhost", "localhost");
  const text = `Planned maintenance tonight, ${Date.now() % 100000}.`;
  const before = consoleSql("select coalesce(site_notice_on::text, '') || '|' || coalesce(site_notice_text, '') || '|' || coalesce(site_notice_version::text, '') from console.settings where environment = 'development'");
  try {
    await setUpFirstOwner(page, base);
    await gotoReady(page, "/settings");
    const n = m.switches.notice;
    await page.getByLabel(n.textLabel).fill(text);
    const switches = page.getByRole("region", { name: m.switches.title });
    await switches.getByRole("group", { name: n.name }).getByRole("button", { name: m.switches.on }).click();
    await switches.getByRole("button", { name: m.switches.save }).click();
    await tapThrough(page, "Warning travellers about tonight's window");
    await expect(page.getByText(m.state.saved(`${n.name} ${m.switches.on}`))).toBeVisible();

    const strip = page.getByRole("region", { name: "Site notice" });
    // The traveller side reads settings through a five-second in-process copy, so allow for it.
    await expect(async () => {
      await page.goto(`${traveller}/`);
      await expect(strip).toContainText(text, { timeout: 1000 });
    }).toPass({ timeout: 20_000 });

    await strip.getByRole("button", { name: "Close this notice" }).click();
    await expect(strip).toHaveCount(0);
    await page.goto(`${traveller}/privacy`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(strip, "closed stays closed for this notice on this device").toHaveCount(0);
  } finally {
    const [on, previous, version] = before.split("|");
    consoleSql(
      `update console.settings set site_notice_on = ${on === "" ? "null" : on}, site_notice_text = ${previous === "" ? "null" : `'${(previous ?? "").replace(/'/g, "''")}'`}, site_notice_version = ${version === "" ? "null" : version} where environment = 'development'`,
    );
  }
});
