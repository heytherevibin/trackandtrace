import { expect, type Locator, type Page } from "@playwright/test";
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

/**
 * Runs a check and ends on the full record at /pnr/<pnr>. On the landing plate the record renders
 * in place first, so this follows its "Open full record" link; the navigate-mode form goes straight there.
 */
export async function runCheck(page: Page, pnr: string): Promise<void> {
  const target = `**/pnr/${pnr}`;
  await enterPnr(page, pnr);
  await page.getByRole("button", { name: "Run", exact: true }).first().click();
  const open = page.getByRole("link", { name: "Open full record" }).first();
  const landed = await Promise.race([
    page.waitForURL(target, { timeout: 30_000 }).then(
      () => true,
      () => false,
    ),
    open.waitFor({ state: "visible", timeout: 30_000 }).then(
      () => false,
      () => false,
    ),
  ]);
  if (!landed) {
    await open.click();
    await page.waitForURL(target);
  }
}

/** Opens the masthead menu sheet on a phone; on desktop the nav row is already there. */
export async function openMasthead(page: Page, isMobile: boolean): Promise<Locator> {
  const banner = page.getByRole("banner");
  if (!isMobile) return banner.getByRole("navigation", { name: "Primary" });
  await banner.getByRole("button", { name: "Open menu" }).click();
  const sheet = page.getByRole("dialog", { name: "Menu" });
  await expect(sheet).toBeVisible();
  return sheet.getByRole("navigation", { name: "Menu" });
}

/** Follows a masthead nav item, wherever this width keeps it. */
export async function navigateFromMasthead(page: Page, name: string, isMobile: boolean): Promise<void> {
  const nav = await openMasthead(page, isMobile);
  await nav.getByRole("link", { name, exact: true }).click();
}

/** The Industry steel and its drawn hover step, tuned to the ground at 3:1 by the design (primary fill, outline tag, ghost text). */
const DESIGN_LOCKED_ACCENT: ReadonlySet<string> = new Set(["#5980a6", "#597ea3"]);

type AxeNode = Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"][number]["nodes"][number];

function isDesignLockedAccent(node: AxeNode): boolean {
  return node.any.some((check) => {
    const data: unknown = check.data;
    if (typeof data !== "object" || data === null) return false;
    const { fgColor, bgColor } = data as { readonly fgColor?: unknown; readonly bgColor?: unknown };
    return (typeof fgColor === "string" && DESIGN_LOCKED_ACCENT.has(fgColor)) || (typeof bgColor === "string" && DESIGN_LOCKED_ACCENT.has(bgColor));
  });
}

/**
 * Zero serious or critical axe findings on the current page. The steel pairing is design-locked
 * (decided 2026-09-17: the reference is matched exactly), so by default only colour-contrast nodes
 * drawn in #5980a6 are exempt; every other finding still fails. Pass `allowDesignLockedAccent: false`
 * for a strict scan.
 */
export async function expectAxeClean(page: Page, options: { readonly allowDesignLockedAccent?: boolean } = {}): Promise<void> {
  // Park the pointer so no hover tint is mid-transition when colours are sampled.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200);
  // @axe-core/playwright bundles a newer playwright-core type; the runtime API is identical.
  const results = await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"] }).analyze();
  const material = results.violations
    .map((v) => ((options.allowDesignLockedAccent ?? true) && v.id === "color-contrast" ? { ...v, nodes: v.nodes.filter((n) => !isDesignLockedAccent(n)) } : v))
    .filter((v) => (v.impact === "serious" || v.impact === "critical") && v.nodes.length > 0);
  expect(material.map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`)).toEqual([]);
}
