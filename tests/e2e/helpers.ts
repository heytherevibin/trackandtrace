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

/** The Industry steel, tuned to the ground at 3:1 by the design (primary fill, outline tag, ghost text). */
const DESIGN_LOCKED_ACCENT = "#5980a6";

type AxeNode = Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"][number]["nodes"][number];

function isDesignLockedAccent(node: AxeNode): boolean {
  return node.any.some((check) => {
    const data: unknown = check.data;
    if (typeof data !== "object" || data === null) return false;
    const { fgColor, bgColor } = data as { readonly fgColor?: unknown; readonly bgColor?: unknown };
    return fgColor === DESIGN_LOCKED_ACCENT || bgColor === DESIGN_LOCKED_ACCENT;
  });
}

/**
 * Zero serious or critical axe findings on the current page. `allowDesignLockedAccent` exempts only
 * colour-contrast nodes drawn in the design-locked steel pairing; every other finding still fails.
 */
export async function expectAxeClean(page: Page, options: { readonly allowDesignLockedAccent?: boolean } = {}): Promise<void> {
  // @axe-core/playwright bundles a newer playwright-core type; the runtime API is identical.
  const results = await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"] }).analyze();
  const material = results.violations
    .map((v) => (options.allowDesignLockedAccent && v.id === "color-contrast" ? { ...v, nodes: v.nodes.filter((n) => !isDesignLockedAccent(n)) } : v))
    .filter((v) => (v.impact === "serious" || v.impact === "critical") && v.nodes.length > 0);
  expect(material.map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`)).toEqual([]);
}
