import { consoleMessages } from "@/console/messages";
import { expect, resetConsole, setUpFirstOwner, test } from "./fixtures";
import { tapThrough } from "./team-helpers";
import { PNR, expectAxeClean, gotoReady } from "../helpers";
import { layoutBreaks } from "../layout";

const BASE = "http://admin.localhost:4211";
/** The traveller host of the same server: the proxy routes by host, so this reaches /api/pnr. */
const TRAVELLER = (base: string) => base.replace("admin.localhost", "localhost");
/**
 * A documentation address (RFC 5737), sent as the client address the traveller routes read. A fresh
 * one per run: a block lives in the server's memory, so a retry after a failure part-way through
 * would otherwise start with the last attempt's block still in force.
 */
const freshAddress = () => `198.51.100.${(Date.now() % 200) + 20}`;
const m = consoleMessages.abuse;

test.beforeEach(() => resetConsole());

/**
 * 04 Abuse & limits. The figures and the blocklist are proven in tests/unit/console/abuse and
 * tests/unit/services; this proves an Owner reaches it from the rail, that a block made here through
 * a real tap refuses a real traveller check and an unblock lets it through again, and that the page
 * lays out and scans clean at both widths.
 */
test.describe("Abuse & limits", () => {
  test("an Owner opens it from the rail, and it draws its three plates", async ({ page, baseURL }) => {
    await setUpFirstOwner(page, baseURL ?? BASE);
    const rail = page.getByRole("navigation", { name: "Console" });
    await rail.getByRole("link", { name: /Abuse/ }).click();

    await expect(page.getByRole("heading", { level: 1, name: m.title })).toBeVisible();
    await expect(page.getByRole("region", { name: m.limits.title })).toBeVisible();
    await expect(page.getByRole("region", { name: m.blocked.title })).toBeVisible();
    await expect(page.getByRole("region", { name: m.mostLimited.title })).toBeVisible();
    await expect(page.getByText(m.blocked.none)).toBeVisible();
    await expectAxeClean(page);
  });

  test("a block made here refuses that address's traveller checks, and an unblock answers them again", async ({ page, baseURL, request }) => {
    const base = baseURL ?? BASE;
    const ADDRESS = freshAddress();
    await setUpFirstOwner(page, base);
    const check = () => request.post(`${TRAVELLER(base)}/api/pnr`, { headers: { "x-forwarded-for": ADDRESS, "content-type": "application/json" }, data: { pnr: PNR.cnf } });
    expect((await check()).status(), "answered before any block").toBe(200);

    await gotoReady(page, "/abuse");
    await page.getByRole("button", { name: m.block.trigger }).click();
    await page.getByLabel(m.block.addressLabel).fill(ADDRESS);
    await page.getByRole("radio", { name: m.block.durations["1h"] }).check();
    await page.getByRole("button", { name: m.block.continue }).click();
    // Hashed on entry: from here on the address is on the screen nowhere.
    await expect(page.getByText(ADDRESS)).toHaveCount(0);
    await tapThrough(page, "Scripted checks from one address all morning");
    // Exact: "Blocked." is also a substring of the page's lead and of "No addresses are blocked.".
    await expect(page.getByText(m.block.doneToast, { exact: true })).toBeVisible();

    const blocked = page.getByRole("table", { name: m.blocked.caption });
    await expect(blocked.getByRole("row")).toHaveCount(2);
    expect((await check()).status(), "refused once blocked, as a rate limit").toBe(429);

    await blocked.getByRole("button", { name: /Unblock/ }).click();
    await tapThrough(page, "Blocked by mistake, lifting it now");
    await expect(page.getByText(m.blocked.none)).toBeVisible();
    expect((await check()).status(), "answered again once unblocked").toBe(200);
    await expect(page.getByText(ADDRESS)).toHaveCount(0);
  });

  test("fits a phone with no horizontal overflow", async ({ page, baseURL }) => {
    await setUpFirstOwner(page, baseURL ?? BASE);
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoReady(page, "/abuse");
    await expect(page.getByRole("heading", { level: 1, name: m.title })).toBeVisible();
    expect(await layoutBreaks(page), "Abuse at 390px").toEqual([]);
    await expectAxeClean(page);
  });
});
