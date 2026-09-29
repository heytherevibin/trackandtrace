import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { gotoReady } from "./helpers";

// The page ground is film grain (owner, 2026-09-29): fine noise painted on the traveller site's canvas, in both
// themes, and nothing else — no grid. The console keeps its flat surfaces, and the grain steps aside wherever the
// reader has asked for plainer colours (forced colours, more contrast) and on paper.

interface Ground {
  readonly image: string;
  readonly color: string;
  readonly attachment: string;
  /** The page's own wrappers between the canvas and the content: each must let the canvas through. */
  readonly covers: readonly string[];
}

async function ground(page: Page): Promise<Ground> {
  return page.evaluate(() => {
    const html = getComputedStyle(document.documentElement);
    const wrappers = [document.body, document.getElementById("app-root"), document.getElementById("app-root")?.firstElementChild, document.getElementById("main")];
    const covers = wrappers.flatMap((el) => {
      if (!(el instanceof HTMLElement)) return [];
      const s = getComputedStyle(el);
      const clear = s.backgroundColor === "rgba(0, 0, 0, 0)" && s.backgroundImage === "none";
      return clear ? [] : [`${el.tagName.toLowerCase()}#${el.id}: ${s.backgroundColor} ${s.backgroundImage}`];
    });
    return { image: html.backgroundImage, color: html.backgroundColor, attachment: html.backgroundAttachment, covers };
  });
}

const GRAIN = /^url\("[^"]+"\)$/;

for (const [theme, face] of [["light", "Day"], ["dark", "Night"]] as const) {
  test.describe(`${face}`, () => {
    test.use({ colorScheme: theme });
    for (const route of ["/", "/pre-booking", "/privacy"] as const) {
      test(`${route} paints film grain on the page canvas, and no grid`, async ({ page }) => {
        await page.addInitScript((t) => window.localStorage.setItem("tt.theme", t), theme);
        await gotoReady(page, route);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        const g = await ground(page);
        // One layer, an image: the grain. A grid would be a second layer, or a gradient.
        expect(g.image).toMatch(GRAIN);
        expect(g.image).not.toMatch(/gradient/);
        // On the page colour, and scrolling with the page like paper, never fixed to the window.
        expect(g.color).toBe(theme === "light" ? "rgb(242, 242, 243)" : "rgb(0, 0, 0)");
        expect(g.attachment).toBe("scroll");
        // Nothing between the canvas and the content repaints the flat colour over it.
        expect(g.covers).toEqual([]);
      });
    }
  });
}

test("the grain changes with the theme: ink by day, white by night", async ({ page }) => {
  await gotoReady(page, "/privacy");
  await page.evaluate(() => window.localStorage.setItem("tt.theme", "light"));
  await gotoReady(page, "/privacy");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const day = (await ground(page)).image;
  await page.evaluate(() => window.localStorage.setItem("tt.theme", "dark"));
  await gotoReady(page, "/privacy");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const night = (await ground(page)).image;
  expect(day).toMatch(GRAIN);
  expect(night).toMatch(GRAIN);
  expect(night).not.toBe(day);
});

test("the console's host has no grain", async ({ page, baseURL }) => {
  const consoleOrigin = (baseURL ?? "http://localhost:4210").replace("//localhost", "//admin.localhost");
  await page.goto(`${consoleOrigin}/login`);
  expect((await ground(page)).image).toBe("none");
});

for (const [name, media] of [
  ["forced colours", { forcedColors: "active" }],
  ["more contrast", { contrast: "more" }],
  ["print", { media: "print" }],
] as const) {
  test(`${name}: no grain`, async ({ page }) => {
    await gotoReady(page, "/privacy");
    expect((await ground(page)).image).toMatch(GRAIN);
    await page.emulateMedia(media);
    expect((await ground(page)).image).toBe("none");
  });
}

// The steel duotone blends with what is beneath it inside #app-root, its own blend group. With the page's flat colour
// gone from the shell (the grain is on the canvas, outside that group), the print needs a ground of its own, or the
// blend has nothing to tint and paints the sky solid steel. Still (no run) and in the run alike.
for (const reducedMotion of ["reduce", "no-preference"] as const) {
  test(`the platform print keeps its own flat ground (${reducedMotion} motion)`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await gotoReady(page, "/");
    const figure = page.locator("#use figure");
    await figure.scrollIntoViewIfNeeded();
    const fill = await figure.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.backgroundColor, image: s.backgroundImage };
    });
    expect(fill).toEqual({ color: "rgb(242, 242, 243)", image: "none" });
  });
}
