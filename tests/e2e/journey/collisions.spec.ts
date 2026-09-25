import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { gotoReady } from "../helpers";
import { collisionsInView, collisionsTopToBottom } from "./collisions";

/** Draws two probe lines, the second `gap` px below the first, fixed where the window shows them. */
async function drawProbeLines(page: Page, gap: number): Promise<void> {
  await page.evaluate((offset) => {
    for (const [text, top] of [
      ["Probe line one", 240],
      ["Probe line two", 240 + offset],
    ] as const) {
      const line = document.createElement("p");
      line.textContent = text;
      line.style.cssText = `position:fixed;left:40px;top:${top}px;margin:0;font:16px/20px sans-serif;z-index:9999`;
      document.body.append(line);
    }
  }, gap);
}

// The checker proves itself first: a checker that finds nothing, ever, would pass every baseline below.
test.describe("the collision checker", () => {
  test("sees two lines of text drawn over each other", async ({ page }) => {
    await gotoReady(page, "/");
    await drawProbeLines(page, 6);
    expect(await collisionsInView(page)).toContain('text "Probe line one" × text "Probe line two"');
  });

  test("lets two lines that only touch pass", async ({ page }) => {
    await gotoReady(page, "/");
    await drawProbeLines(page, 20);
    expect(await collisionsInView(page)).not.toContain('text "Probe line one" × text "Probe line two"');
  });

  test("sees a panel drawn over text outside it", async ({ page }) => {
    await gotoReady(page, "/");
    await drawProbeLines(page, 40);
    await page.evaluate(() => {
      const panel = document.createElement("div");
      panel.id = "probe-panel";
      panel.style.cssText = "position:fixed;left:20px;top:230px;width:300px;height:40px;z-index:9999";
      document.body.append(panel);
    });
    expect(await collisionsInView(page, { panels: ["#probe-panel"] })).toContain('panel div#probe-panel × text "Probe line one"');
  });

  test("sees two panels drawn over each other", async ({ page }) => {
    await gotoReady(page, "/");
    await page.evaluate(() => {
      for (const [id, left] of [
        ["probe-panel-a", 20],
        ["probe-panel-b", 60],
      ] as const) {
        const panel = document.createElement("div");
        panel.id = id;
        panel.style.cssText = `position:fixed;left:${left}px;top:300px;width:120px;height:60px;z-index:9999`;
        document.body.append(panel);
      }
    });
    expect(await collisionsInView(page, { panels: ["#probe-panel-a", "#probe-panel-b"] })).toContain("panel div#probe-panel-a × panel div#probe-panel-b");
  });

  test("does not see the answer inside a closed <details>, only its question", async ({ page }) => {
    await gotoReady(page, "/");
    await drawProbeLines(page, 20);
    await page.evaluate(() => {
      const details = document.createElement("details");
      details.innerHTML = '<summary>Probe question</summary><p style="margin:0">Probe answer</p>';
      details.style.cssText = "position:fixed;left:40px;top:240px;margin:0;font:16px/20px sans-serif;z-index:9999";
      document.body.append(details);
    });
    const found = await collisionsInView(page);
    expect(found).toContain('text "Probe line one" × text "Probe question"');
    expect(found).not.toContain('text "Probe line two" × text "Probe answer"');
  });

  test("sees a page that scrolls sideways", async ({ page }) => {
    await gotoReady(page, "/");
    await page.evaluate(() => {
      const wide = document.createElement("div");
      wide.style.cssText = "width:200vw;height:1px";
      document.body.append(wide);
    });
    expect((await collisionsInView(page)).some((finding) => finding.startsWith("sideways overflow"))).toBe(true);
  });

  test("sees text drawn inside a header that is not the masthead", async ({ page }) => {
    await gotoReady(page, "/");
    await page.evaluate(() => {
      const header = document.createElement("header");
      for (const [text, top] of [
        ["Probe header one", 240],
        ["Probe header two", 246],
      ] as const) {
        const line = document.createElement("p");
        line.textContent = text;
        line.style.cssText = `position:fixed;left:40px;top:${top}px;margin:0;font:16px/20px sans-serif;z-index:9999`;
        header.append(line);
      }
      document.body.append(header);
    });
    expect(await collisionsInView(page)).toContain('text "Probe header one" × text "Probe header two"');
  });

  test("compares a positioned child's text against its own parent's text", async ({ page }) => {
    await gotoReady(page, "/");
    await page.evaluate(() => {
      const li = document.createElement("li");
      li.textContent = "Probe parent";
      li.style.cssText = "position:fixed;left:40px;top:400px;margin:0;font:16px/20px sans-serif;z-index:9999";
      const child = document.createElement("p");
      child.textContent = "Probe child";
      child.style.cssText = "position:absolute;left:0;top:0;margin:0;font:16px/20px sans-serif";
      li.append(child);
      document.body.append(li);
    });
    expect(await collisionsInView(page)).toContain('text "Probe parent" × text "Probe child"');
  });

  test("sees overlapping lines drawn inside the real masthead", async ({ page }) => {
    await gotoReady(page, "/");
    await page.evaluate(() => {
      const header = document.querySelector("header");
      if (!header) throw new Error("no header found");
      for (const [text, top] of [
        ["Probe masthead one", 4],
        ["Probe masthead two", 8],
      ] as const) {
        const line = document.createElement("p");
        line.textContent = text;
        line.style.cssText = `position:absolute;left:4px;top:${top}px;margin:0;font:16px/20px sans-serif;z-index:9999`;
        header.append(line);
      }
    });
    expect(await collisionsInView(page)).toContain('text "Probe masthead one" × text "Probe masthead two"');
  });

  test("does not report page content straddling the masthead's bottom edge against masthead text", async ({ page }) => {
    await gotoReady(page, "/");
    // The exact offset that straddles the masthead's own text glyphs shifts with viewport and the hero's fluid
    // font, so this sweeps the h1's top from 5 to 60px above the masthead's bottom edge in 5px steps, collecting
    // every finding across all of them, rather than trusting one offset to land in the danger zone.
    const base = await page.evaluate(() => {
      const header = document.querySelector("header");
      const h1 = document.querySelector("#hero-title") ?? document.querySelector("main h1");
      if (!header || !h1) throw new Error("missing header or hero h1");
      return { mastheadBottom: header.getBoundingClientRect().bottom, h1Top: h1.getBoundingClientRect().top, scrollY: window.scrollY };
    });
    const found: string[] = [];
    for (let above = 5; above <= 60; above += 5) {
      await page.evaluate(
        (top) =>
          new Promise<void>((done) => {
            window.scrollTo({ top, behavior: "instant" });
            requestAnimationFrame(() => requestAnimationFrame(() => done()));
          }),
        base.scrollY + (base.h1Top - (base.mastheadBottom - above)),
      );
      found.push(...(await collisionsInView(page)));
    }
    expect(found.some((finding) => finding.includes('"Your PNR,"'))).toBe(false);
  });

  test("does not report page text wholly hidden under the masthead", async ({ page }) => {
    await gotoReady(page, "/");
    // The landing h1's bottom ends up above the masthead's bottom edge: the whole heading is tucked out of
    // sight behind the sticky masthead.
    await page.evaluate(
      () =>
        new Promise<void>((done) => {
          const header = document.querySelector("header");
          const h1 = document.querySelector("#hero-title") ?? document.querySelector("main h1");
          if (!header || !h1) throw new Error("missing header or hero h1");
          const mastheadBottom = header.getBoundingClientRect().bottom;
          const h1Bottom = h1.getBoundingClientRect().bottom;
          window.scrollTo({ top: window.scrollY + (h1Bottom - (mastheadBottom - 10)), behavior: "instant" });
          requestAnimationFrame(() => requestAnimationFrame(() => done()));
        }),
    );
    const found = await collisionsInView(page);
    expect(found.some((finding) => finding.includes('"Your PNR,"'))).toBe(false);
  });
});

// Today's landing, before the journey adds anything: the baseline every journey PR must keep.
const SIZES = [
  { name: "1440×900", viewport: { width: 1440, height: 900 }, phone: false },
  { name: "390×844", viewport: { width: 390, height: 844 }, phone: true },
  { name: "844×390, a phone on its side", viewport: { width: 844, height: 390 }, phone: true },
] as const;

for (const size of SIZES) {
  test.describe(`the landing at ${size.name}`, () => {
    test.use({ viewport: size.viewport });
    test.skip(({ isMobile }) => isMobile !== size.phone, "each size runs once, in the project that emulates its device");

    for (const motion of ["on", "off"] as const) {
      test(`Motion ${motion}: nothing collides, top to bottom`, async ({ page }) => {
        if (motion === "off") await page.addInitScript(() => window.localStorage.setItem("tt.motion", "off"));
        await gotoReady(page, "/");
        expect(await collisionsTopToBottom(page)).toEqual([]);
      });
    }
  });
}

// The footer's "Your device asks for reduced motion" note only shows under the device's own setting.
test.describe("the landing at 390×844 under the device's reduced motion", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.skip(({ isMobile }) => !isMobile, "runs once, in the project that emulates a phone");

  test("nothing collides, top to bottom", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoReady(page, "/");
    // Proves the sweep actually covers the note: without this, the sweep would still pass green if the note
    // never rendered at all.
    await expect(page.getByText("Your device asks for reduced motion")).toBeVisible();
    expect(await collisionsTopToBottom(page)).toEqual([]);
  });
});
