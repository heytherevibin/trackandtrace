import { expect, test, type Page } from "@playwright/test";
import { blockJourneyChunk, motionOff, scrollToId, waitForJourney } from "./journey-helpers";

const km = async (text: string | null) => Number(/KM (\d{3})/.exec(text ?? "")?.[1]);

/** The rail's train's centre, and its track's box, in the window's px. */
async function railTrain(page: Page) {
  return page.locator("#route-strip .strip-train").evaluate((el) => {
    const train = el.getBoundingClientRect();
    const track = el.parentElement!.getBoundingClientRect();
    return { centre: train.top + train.height / 2, top: train.top, bottom: train.bottom, left: train.left, right: train.right, track: { top: track.top, bottom: track.bottom, left: track.left, right: track.right } };
  });
}

/** Each stop's link box, top to bottom as the list runs. */
async function stopBoxes(page: Page) {
  return page.locator("#route-strip .strip-stops a").evaluateAll((links) =>
    links.map((a) => {
      const r = a.getBoundingClientRect();
      return { code: a.textContent, top: r.top, bottom: r.bottom, left: r.left, width: r.width, height: r.height };
    }),
  );
}

test.describe("the route rail, moving", () => {
  test.describe("desktop", () => {
    test.skip(({ isMobile }) => isMobile, "the rail is for 48rem and up");

    test("follows the page: the current stop, the odometer, and the train running down the rail", async ({ page }) => {
      await page.goto("/");
      await waitForJourney(page);
      const strip = page.locator("#route-strip");
      await expect(strip.locator(".strip-odo")).toHaveText("KM 000");
      await expect(strip.getByRole("link", { name: /^DEP ·/ })).toHaveAttribute("aria-current", "location");
      const atDep = await railTrain(page);
      await scrollToId(page, "record", 40);
      await expect(strip.getByRole("link", { name: /^03 ·/ })).toHaveAttribute("aria-current", "location");
      await expect(strip.getByRole("link", { name: /^DEP ·/ })).not.toHaveAttribute("aria-current", "location");
      await expect.poll(async () => km(await strip.locator(".strip-odo").textContent())).toBeGreaterThanOrEqual(212);
      // The train has run down the rail, by transform alone, and stands level with 03's stop.
      await expect.poll(async () => (await railTrain(page)).centre).toBeGreaterThan(atDep.centre + 100);
      expect(await strip.locator(".strip-train").evaluate((el) => [el.style.left, el.style.top])).toEqual(["", ""]);
      const stop03 = await strip.getByRole("link", { name: /^03 ·/ }).boundingBox();
      const train = await railTrain(page);
      expect(train.centre).toBeGreaterThanOrEqual(stop03!.y - 4);
      expect(train.centre).toBeLessThanOrEqual(stop03!.y + stop03!.height + stop03!.height);
    });

    test("GA stands between DEP and 01, and lights while #anatomy is the section under the masthead", async ({ page }) => {
      await page.goto("/");
      await waitForJourney(page);
      const strip = page.locator("#route-strip");
      const codes = await strip.locator(".strip-stops a").allTextContents();
      expect(codes.indexOf("GA")).toBe(codes.indexOf("DEP") + 1);
      expect(codes.indexOf("01")).toBe(codes.indexOf("GA") + 1);
      await scrollToId(page, "anatomy");
      await expect(strip.locator('.strip-stops a[href="#anatomy"]')).toHaveAttribute("aria-current", "location");
      await expect(strip.locator(".strip-stops a[aria-current]")).toHaveCount(1);
      // The highlighted stop carries the station's name: nothing spells it out beside the rail.
      await expect(page.locator(".strip-now")).toHaveCount(0);
    });

    test("the train is held inside the rail at both ends, pointing down", async ({ page }) => {
      await page.goto("/");
      await waitForJourney(page);
      const top = await railTrain(page);
      expect(top.top).toBeGreaterThanOrEqual(top.track.top - 0.5);
      expect(top.left).toBeGreaterThanOrEqual(top.track.left - 0.5);
      expect(top.right).toBeLessThanOrEqual(top.track.right + 0.5);
      // Taller than wide: the glyph runs nose down the rail.
      expect(top.bottom - top.top).toBeGreaterThan(top.right - top.left);
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
      await expect(page.locator("#route-strip").getByRole("link", { name: /^END ·/ })).toHaveAttribute("aria-current", "location");
      await expect.poll(async () => (await railTrain(page)).centre).toBeGreaterThan(top.track.bottom - 60);
      const end = await railTrain(page);
      expect(end.bottom).toBeLessThanOrEqual(end.track.bottom + 0.5);
      expect(end.top).toBeGreaterThanOrEqual(end.track.top);
    });

    test("Motion off: the train still moves, but never leans", async ({ page }) => {
      await motionOff(page);
      await page.goto("/");
      await waitForJourney(page);
      const before = await railTrain(page);
      await page.mouse.wheel(0, 2_400);
      const lean = await page.locator("#route-strip .strip-glyph").evaluate((el) => el.style.transform);
      expect(lean).toBe("");
      await expect.poll(async () => (await railTrain(page)).centre).toBeGreaterThan(before.centre);
    });

    test("Motion on: the train leans into speed down the rail, and stands upright once the page is still", async ({ page }) => {
      await page.goto("/");
      await waitForJourney(page);
      const glyph = page.locator("#route-strip .strip-glyph");
      // Every lean the journey writes, as it writes it.
      await glyph.evaluate((el) => {
        const seen: string[] = [];
        (window as unknown as { leans: string[] }).leans = seen;
        new MutationObserver(() => seen.push(el.style.transform)).observe(el, { attributes: true, attributeFilter: ["style"] });
      });
      // A scroll that carries on across frames, as a flick does: 60px a frame for 20 frames.
      await page.evaluate(
        () =>
          new Promise<void>((done) => {
            const step = (left: number) => {
              window.scrollBy({ top: 60, behavior: "instant" });
              if (left > 1) requestAnimationFrame(() => step(left - 1));
              else done();
            };
            requestAnimationFrame(() => step(20));
          }),
      );
      await expect.poll(() => page.evaluate(() => (window as unknown as { leans: string[] }).leans.some((t) => /^skewY\(/.test(t)))).toBe(true);
      await expect.poll(() => glyph.evaluate((el) => el.style.transform), { timeout: 5_000 }).toBe("");
    });

    test("without the journey, the rail is the server's list of links: no odometer, no train", async ({ page }) => {
      await blockJourneyChunk(page);
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("data-journey", "failed", { timeout: 15_000 });
      await expect(page.locator("#route-strip .strip-odo")).toBeHidden();
      await expect(page.locator("#route-strip .strip-train")).toBeHidden();
      await expect(page.locator("#route-strip .strip-stops a")).toHaveCount(11);
      for (const box of await stopBoxes(page)) expect(box.height, box.code ?? "").toBeGreaterThanOrEqual(44);
    });
  });

  test.describe("the rail's column", () => {
    test.skip(({ isMobile }) => isMobile, "the rail is for 48rem and up");

    test("stands down the left edge from the masthead's foot to the window's, and the page never draws under it", async ({ page }) => {
      await page.goto("/");
      await waitForJourney(page);
      const measure = () =>
        page.evaluate(() => {
          const rail = document.getElementById("route-strip")!.getBoundingClientRect();
          const header = document.querySelector("header")!.getBoundingClientRect();
          const main = document.getElementById("main")!.getBoundingClientRect();
          const footer = document.querySelector("#main ~ footer")!.getBoundingClientRect();
          const style = getComputedStyle(document.getElementById("route-strip")!);
          return {
            rail: { left: rail.left, top: rail.top, bottom: rail.bottom, width: rail.width },
            headerBottom: header.bottom,
            headerWidth: header.width,
            mainLeft: main.left,
            footerLeft: footer.left,
            position: style.position,
            border: `${style.borderRightWidth} ${style.borderRightStyle}`,
            rem: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
            headerHeight: getComputedStyle(document.documentElement).getPropertyValue("--header-height").trim(),
            vw: document.documentElement.clientWidth,
            vh: window.innerHeight,
          };
        });
      const at = await measure();
      expect(at.position).toBe("fixed");
      expect(at.border).toBe("1px solid");
      expect(at.rail.left).toBe(0);
      expect(at.rail.width).toBe(4 * at.rem);
      expect(Math.abs(at.rail.top - at.headerBottom)).toBeLessThanOrEqual(0.5);
      expect(at.rail.bottom).toBe(at.vh);
      // The masthead keeps its own height and spans the window; the page and its footer stand clear of the rail.
      expect(at.headerHeight).toBe("4rem");
      expect(at.headerWidth).toBe(at.vw);
      expect(at.mainLeft).toBeGreaterThanOrEqual(at.rail.width);
      expect(at.footerLeft).toBeGreaterThanOrEqual(at.rail.width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      // Fixed: the same box far down the page.
      await page.mouse.wheel(0, 3_000);
      await expect.poll(async () => (await measure()).rail).toEqual(at.rail);
    });

    test("each stop is a full-width link at least 44px tall, code first, top to bottom in the route's order", async ({ page }) => {
      await page.goto("/");
      await waitForJourney(page);
      const rail = (await page.locator("#route-strip").boundingBox())!;
      const boxes = await stopBoxes(page);
      expect(boxes.map((b) => b.code)).toEqual(["DEP", "GA", "01", "02", "03", "04", "05", "06", "07", "08", "END"]);
      for (const [k, box] of boxes.entries()) {
        expect(box.height, box.code ?? "").toBeGreaterThanOrEqual(44);
        expect(box.left, box.code ?? "").toBe(rail.x);
        expect(box.width, box.code ?? "").toBeGreaterThanOrEqual(rail.width - 1);
        if (k > 0) expect(box.top, box.code ?? "").toBeGreaterThanOrEqual(boxes[k - 1]!.bottom - 0.5);
      }
      // Each accessible name starts with the code it shows (WCAG 2.5.3).
      for (const link of await page.locator("#route-strip .strip-stops a").all()) {
        expect(await link.getAttribute("aria-label")).toMatch(new RegExp(`^${await link.textContent()} · `));
      }
    });

    for (const height of [600, 480] as const) {
      test(`in a ${height}px window the stops still fit between the masthead and the odometer, never overlapping`, async ({ page }) => {
        await page.setViewportSize({ width: 1280, height });
        await page.goto("/");
        await waitForJourney(page);
        const boxes = await stopBoxes(page);
        const odo = (await page.locator("#route-strip .strip-odo").boundingBox())!;
        const header = await page.locator("header").evaluate((el) => el.getBoundingClientRect().bottom);
        expect(boxes[0]!.top).toBeGreaterThanOrEqual(header);
        expect(boxes.at(-1)!.bottom).toBeLessThanOrEqual(odo.y + 0.5);
        for (const [k, box] of boxes.entries()) {
          // 44px while eleven fit (down to a 600px window at 1280); shorter windows share the track evenly.
          if (height === 600) expect(box.height, box.code ?? "").toBeGreaterThanOrEqual(44);
          else expect(box.height, box.code ?? "").toBeGreaterThanOrEqual(30);
          if (k > 0) expect(box.top, box.code ?? "").toBeGreaterThanOrEqual(boxes[k - 1]!.bottom - 0.5);
        }
      });
    }

    test("at 200% text zoom the rail widens with its words, and the page still never draws under it", async ({ page }) => {
      await page.goto("/");
      await waitForJourney(page);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
        window.dispatchEvent(new Event("resize"));
      });
      const measured = await page.evaluate(() => {
        const main = document.getElementById("main")!.getBoundingClientRect();
        return {
          rail: document.getElementById("route-strip")!.getBoundingClientRect().width,
          main: { left: main.left, right: main.right },
          vw: document.documentElement.clientWidth,
        };
      });
      expect(measured.rail).toBe(128);
      // The page stands clear of the wider rail and still fits the window beside it. (The masthead's own row is
      // not the rail's: at 200% its controls outgrow a 1280px window with or without the rail.)
      expect(measured.main.left).toBeGreaterThanOrEqual(128);
      expect(measured.main.right).toBeLessThanOrEqual(measured.vw);
      const boxes = await stopBoxes(page);
      for (const [k, box] of boxes.entries()) if (k > 0) expect(box.top, box.code ?? "").toBeGreaterThanOrEqual(boxes[k - 1]!.bottom - 0.5);
      // Every code still reads whole inside its link.
      const clipped = await page.locator("#route-strip .strip-stops a").evaluateAll((links) => links.filter((a) => a.scrollWidth > a.clientWidth).map((a) => a.textContent));
      expect(clipped).toEqual([]);
    });
  });

  // A finger in a short window (a phone on its side is 48rem wide and more): eleven stops cannot each be 44px
  // tall, and cannot be padded to 44px without overlapping, so the column gives way to the phone's rail.
  test.describe("a phone on its side", () => {
    test.use({ viewport: { width: 844, height: 390 } });
    test.skip(({ isMobile }) => !isMobile, "a touch screen: the project that emulates a phone");

    test("shows the phone's hairline rail, not the column, and the page is not inset", async ({ page }) => {
      await page.goto("/");
      await waitForJourney(page);
      await expect(page.locator("#route-strip")).toBeHidden();
      await expect(page.getByRole("navigation", { name: "Route through this page" })).toHaveCount(0);
      await expect(page.locator(".phone-rail")).toBeVisible();
      expect(await page.locator("#main").evaluate((el) => el.getBoundingClientRect().left)).toBe(0);
      expect(await page.locator("#main ~ footer").evaluate((el) => el.getBoundingClientRect().left)).toBe(0);
      await scrollToId(page, "roadmap");
      await expect.poll(() => page.locator(".phone-rail .strip-train").evaluate((el) => parseFloat(el.style.left))).toBeGreaterThan(40);
    });
  });

  test.describe("a fine pointer in the same short window", () => {
    test.use({ viewport: { width: 844, height: 390 } });
    test.skip(({ isMobile }) => isMobile, "a mouse: the desktop project");

    test("keeps the column, its stops shrunk evenly and never overlapping", async ({ page }) => {
      await page.goto("/");
      await waitForJourney(page);
      await expect(page.locator("#route-strip")).toBeVisible();
      await expect(page.locator(".phone-rail")).toBeHidden();
      const boxes = await stopBoxes(page);
      for (const [k, box] of boxes.entries()) if (k > 0) expect(box.top, box.code ?? "").toBeGreaterThanOrEqual(boxes[k - 1]!.bottom - 0.5);
    });
  });

  test.describe("phone", () => {
    test.skip(({ isMobile }) => !isMobile, "phones only");

    test("a hairline rail in the masthead's foot carries the train, with no strip landmark", async ({ page }) => {
      await page.goto("/");
      await waitForJourney(page);
      await expect(page.locator(".phone-rail")).toBeVisible();
      await expect(page.locator("#route-strip")).toBeHidden();
      await expect(page.getByRole("navigation", { name: "Route through this page" })).toHaveCount(0);
      await scrollToId(page, "roadmap");
      await expect.poll(() => page.locator(".phone-rail .strip-train").evaluate((el) => parseFloat(el.style.left))).toBeGreaterThan(40);
    });

    test("at rest (DEP, before any scroll), the train never draws past the screen edge", async ({ page }) => {
      await page.goto("/");
      await waitForJourney(page);
      const box = await page.locator(".phone-rail .strip-train").boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
    });
  });
});
