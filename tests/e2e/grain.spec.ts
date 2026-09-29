import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { axeResults, gotoReady } from "./helpers";
import { scrollIntoRun, waitForJourney } from "./journey/journey-helpers";

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
// blend has nothing to tint and paints the sky solid steel. Still (reduced motion: no run) and pinned in the run, where
// the stations take the grained ground and the print alone stays flat; in both faces. Read as it renders, too: the
// share of the print that is the solid steel (#5980a6) itself, which a working print keeps to its hairlines.
async function steelShare(page: Page, figure: ReturnType<Page["locator"]>): Promise<number> {
  const shot = (await figure.screenshot()).toString("base64");
  return page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, img.width, img.height).data;
    let steel = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (Math.abs(px[i]! - 89) + Math.abs(px[i + 1]! - 128) + Math.abs(px[i + 2]! - 166) < 36) steel += 1;
    }
    return steel / (px.length / 4);
  }, shot);
}

for (const theme of ["light", "dark"] as const) {
  for (const where of ["still", "in the run"] as const) {
    test(`the platform print keeps its own flat ground (${where}, ${theme})`, async ({ page }) => {
      await page.addInitScript((t) => window.localStorage.setItem("tt.theme", t), theme);
      await page.emulateMedia({ reducedMotion: where === "still" ? "reduce" : "no-preference" });
      await gotoReady(page, "/");
      const figure = page.locator("#use figure");
      if (where === "in the run") {
        await waitForJourney(page);
        await scrollIntoRun(page, 0.9);
        await expect(page.locator("#run")).toHaveClass(/is-running/);
        await expect(figure).toBeInViewport();
      } else {
        await figure.scrollIntoViewIfNeeded();
        await expect(page.locator("#run")).not.toHaveClass(/is-running/);
      }
      const fill = await figure.evaluate((el) => {
        const s = getComputedStyle(el);
        return { color: s.backgroundColor, image: s.backgroundImage };
      });
      expect(fill).toEqual({ color: theme === "light" ? "rgb(242, 242, 243)" : "rgb(0, 0, 0)", image: "none" });
      expect(await steelShare(page, figure)).toBeLessThan(0.2);
    });
  }
}

// axe cannot judge text over a background image: it files every such node as "incomplete" (reason bgImage), and
// expectAxeClean reads only violations, so over the grain the contrast check would pass by not looking. The scan
// judges the flat token colour instead, as it did before the grain; the grain's own cost is a measured margin
// (review 2026-09-29: over the grain's mean tone, Day ink-3 5.59:1 and accent-text 5.56:1, Night ink-3 6.19:1).
for (const theme of ["light", "dark"] as const) {
  test.describe(`axe in ${theme}`, () => {
    test.use({ colorScheme: theme });
    for (const route of ["/privacy", "/pre-booking"] as const) {
      test(`${route}: contrast is judged, not skipped for the grain`, async ({ page }) => {
        await page.addInitScript((t) => window.localStorage.setItem("tt.theme", t), theme);
        await gotoReady(page, route);
        const results = await axeResults(page);
        const contrast = (list: typeof results.passes) => list.find((r) => r.id === "color-contrast")?.nodes ?? [];
        const overImage = contrast(results.incomplete).filter((n) => n.any.some((c) => (c.data as { messageKey?: string } | null)?.messageKey === "bgImage"));
        expect(overImage.map((n) => n.target.join(" "))).toEqual([]);
        expect(contrast(results.passes).length).toBeGreaterThan(30);
        // …and the page keeps its grain afterwards: the scan's switch is its own.
        expect((await ground(page)).image).toMatch(GRAIN);
      });
    }
  });
}

// The masthead is the page's own paper, grained like it, so it does not read as a flat band a tone off the grain's
// mean (night: #000 against the grain's ~#080808). It stays opaque: it hides what scrolls under it, and its hairline
// marks the one edge where its still grain meets the moving page. The menu sheet floats over a scrim and stays flat.
for (const theme of ["light", "dark"] as const) {
  test(`the masthead carries the grain, and stays opaque (${theme})`, async ({ page }) => {
    await page.addInitScript((t) => window.localStorage.setItem("tt.theme", t), theme);
    await gotoReady(page, "/privacy");
    const fill = await page.getByRole("banner").evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.backgroundColor, image: s.backgroundImage };
    });
    expect(fill.color).toBe(theme === "light" ? "rgb(242, 242, 243)" : "rgb(0, 0, 0)");
    expect(fill.image).toMatch(GRAIN);
  });
}
