import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

export const PNR = {
  cnf: "2345678901",
  rac: "2345678903",
  wl: "2345678905",
  cancelled: "2345678908",
  mixed: "2345678909",
  notFound: "2345678900",
} as const;

/** Navigate and wait until React is interactive; dev-server hydration is slow enough to swallow clicks. */
export async function gotoReady(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.locator("html[data-hydrated]").waitFor({ timeout: 15_000 });
}

export async function enterPnr(page: Page, pnr: string): Promise<void> {
  await page.getByLabel("PNR number").first().fill(pnr);
}

export async function runCheck(page: Page, pnr: string): Promise<void> {
  await enterPnr(page, pnr);
  await page.getByRole("button", { name: "Run" }).first().click();
  await page.waitForURL(`**/pnr/${pnr}`);
}

/** Zero serious or critical axe findings on the current page. */
export async function expectAxeClean(page: Page): Promise<void> {
  // @axe-core/playwright bundles a newer playwright-core type; the runtime API is identical.
  const results = await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"] }).analyze();
  const material = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(material.map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`)).toEqual([]);
}
