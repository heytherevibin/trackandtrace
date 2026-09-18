import type { Page, Request } from "@playwright/test";
import { expect, test } from "./fixtures";
import { PNR, gotoReady, navigateFromMasthead, runCheck } from "./helpers";

// No request our pages make carries a PNR in its address. Paths and query strings are recorded in
// platform request logs; request bodies and the part after "#" never are.

function record(page: Page): Request[] {
  const requests: Request[] = [];
  page.on("request", (request) => requests.push(request));
  return requests;
}

function addressesCarrying(requests: readonly Request[], pnr: string): string[] {
  return requests.map((request) => request.url()).filter((url) => new URL(url).pathname.includes(pnr) || new URL(url).search.includes(pnr));
}

test("a check, the full record, a reload and the watchlist never put the PNR in a request address", async ({ page, isMobile }) => {
  const requests = record(page);
  await gotoReady(page, "/");
  await runCheck(page, PNR.cnf);
  await expect(page).toHaveURL(new RegExp(`/pnr#${PNR.cnf}$`));
  await expect(page.getByTestId("result-status")).toHaveText("Confirmed");

  // The lookup went out as a POST with the PNR in its body.
  const lookups = requests.filter((request) => new URL(request.url()).pathname === "/api/pnr");
  expect(lookups.length).toBeGreaterThan(0);
  for (const lookup of lookups) {
    expect(lookup.method()).toBe("POST");
    expect(lookup.postDataJSON()).toMatchObject({ pnr: PNR.cnf });
  }

  // A reload keeps the record: the PNR survives in the hash.
  await page.reload();
  await page.locator("html[data-hydrated]").waitFor({ timeout: 15_000 });
  await expect(page.getByTestId("result-status")).toHaveText("Confirmed");

  // Saved, listed, and opened again from the watchlist.
  await page.getByTestId("save-watchlist").click();
  await expect(page.getByTestId("save-watchlist")).toHaveText(/Saved/);
  await navigateFromMasthead(page, "Watchlist", isMobile);
  await page.waitForURL("**/watchlist");
  await page.getByRole("link", { name: "234 567 8901" }).click();
  await expect(page).toHaveURL(new RegExp(`/pnr#${PNR.cnf}$`));
  await expect(page.getByTestId("result-status")).toHaveText("Confirmed");

  expect(addressesCarrying(requests, PNR.cnf)).toEqual([]);
});

test("back and forward between two records follow the hash", async ({ page }) => {
  await gotoReady(page, `/pnr#${PNR.cnf}`);
  await expect(page.getByTestId("result-status")).toHaveText("Confirmed");
  await gotoReady(page, `/pnr#${PNR.wl}`);
  await expect(page.getByTestId("result-status")).not.toHaveText("Confirmed");
  await page.goBack();
  await expect(page.getByTestId("result-status")).toHaveText("Confirmed");
});

test("an old /pnr/<pnr> link redirects once to the hash form", async ({ page }) => {
  await gotoReady(page, `/pnr/${PNR.cnf}`);
  await expect(page).toHaveURL(new RegExp(`/pnr#${PNR.cnf}$`));
  await expect(page.getByTestId("result-status")).toHaveText("Confirmed");
});

test("the form posts before hydration and lands on the hash form", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/nowhere");
  const form = page.getByTestId("pnr-check-form");
  await expect(form).toHaveAttribute("method", "post");
  const posted = page.waitForRequest((request) => new URL(request.url()).pathname === "/check" && request.method() === "POST");
  await page.getByLabel("PNR number").first().fill(PNR.cnf);
  await form.getByRole("button", { name: "Run", exact: true }).click();
  const request = await posted;
  expect(request.url()).not.toContain(PNR.cnf);
  await expect(page).toHaveURL(new RegExp(`/pnr#${PNR.cnf}$`));
  await context.close();
});

test("checking again from the result page follows the new PNR in the hash", async ({ page }) => {
  await gotoReady(page, "/pnr#12345");
  await expect(page.getByRole("heading", { name: "That is not a PNR" })).toBeVisible();
  await page.getByLabel("PNR number").first().fill(PNR.cnf);
  await page.getByRole("button", { name: "Run", exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/pnr#${PNR.cnf}$`));
  await expect(page.getByTestId("result-status")).toHaveText("Confirmed");
});
