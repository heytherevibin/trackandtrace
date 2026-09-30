import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { atRest, drawStill, frames, noAnchoring, pressTab, readyTab, scrollToId, skipWithoutWebgl2, waitForJourney, waitForLive } from "./journey-helpers";

// A Tab stop's glide, taken up again (focus-glide.ts; WCAG 2.4.11; Task 6 review). The browser glides a Tab stop into the
// window, and an instant scroll that keeps the reader's place (the drawing falling to the still mid-glide) cancels it,
// stranding focus off-screen at rest: the glide is taken up again, after each such cut (at most three). Never against the
// reader (rounds 2 and 4): a reader who leaves mid-glide by a drag (no wheel, touch or key), whom a mouse focused, or whom
// focus returning to the window finds away, stays where they are, whatever the layout does next. The link is 04's "Read the data policy", outside the window-seat run (run.spec holds the run's own).

const POLICY = "Read the data policy";
const policy = (page: Page) => page.locator("#reliability a", { hasText: POLICY });
/** Wholly in the window, below the masthead, and nothing painted over it. */
const inWindow = (page: Page) =>
  policy(page).evaluate((a) => {
    const r = a.getBoundingClientRect();
    const foot = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return r.top >= foot && r.bottom <= window.innerHeight && hit !== null && a.contains(hit);
  });
const principlesTop = (page: Page) => page.locator("#principles").evaluate((el) => el.getBoundingClientRect().top);

/** A link wholly in the window, below the masthead, and nothing painted over it. */
const linkInWindow = (page: Page, scope: string, name: string) =>
  page.locator(`${scope} a`, { hasText: name }).evaluate((a) => {
    const r = a.getBoundingClientRect();
    const foot = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return r.top >= foot && r.bottom <= window.innerHeight && hit !== null && a.contains(hit);
  });

/** A relayout, as the live drawing's pin makes it the frame after a Tab (island.spec's 3 in 190 under load): `at` frames
 * after the link named `name` takes focus, a block `px` tall grows just above `before`, below the reader's window and
 * above the link, where scroll anchoring answers nothing, and the page says so (tt:layout). No instant scroll: no jump.
 * `rebuild`: the journey rebuilds in the same task (a late web font changing a piece's fit), every module torn down and
 * started again, focus-glide.ts with them. */
async function relayoutOnFocus(page: Page, scope: string, name: string, before: string, at: number, rebuild = false): Promise<void> {
  await page.evaluate(
    ([within, text, id, frames, again]) => {
      const link = [...document.querySelectorAll<HTMLElement>(`${within} a`)].find((a) => a.textContent?.includes(text));
      const next = document.getElementById(id);
      if (!link || !next) throw new Error(`no "${text}" in ${within}, or no #${id}`);
      const grow = () => {
        const block = document.createElement("div");
        block.setAttribute("data-relayout", "");
        block.style.height = "2400px";
        next.before(block);
        window.dispatchEvent(new Event("tt:layout"));
        if (again) window.dispatchEvent(new Event("tt:rebuild")); // a piece's fit changed with it: the journey rebuilds
      };
      const wait = (left: number): void => {
        if (left <= 0) grow();
        else requestAnimationFrame(() => wait(left - 1));
      };
      link.addEventListener("focus", () => wait(frames), { once: true });
    },
    [scope, name, before, at, rebuild] as const,
  );
}

/** The live drawing about to pin as a Tab lands (the #94 review's root cause): from before the page's first script, the
 * engine's build (scene/engine.ts, createEngine) is held at its last yield, the one after its upload, whose end resolves
 * the scene and begins the drawing; `window.__ttPinHold.release()` lets it go, and the pin follows in the same task. Each
 * Tab stop's glide taken up (focus-glide.ts's scrollIntoView, centred) is counted in `window.__ttTakeUps`. */
async function holdThePin(page: Page): Promise<void> {
  await page.addInitScript(() => {
    /** createEngine's yields: the sixth follows the upload, and nothing but the build's end follows it (engine.ts). */
    const LAST = 6;
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const hold = { steps: 0, held: false, after: 0, release: () => release() };
    Reflect.set(window, "__ttPinHold", hold);
    const native: unknown = Reflect.get(window, "scheduler");
    const own = native !== null && typeof native === "object" ? Reflect.get(native, "yield") : undefined;
    const pass = (): Promise<unknown> => (typeof own === "function" ? Reflect.apply(own, native, []) : new Promise((resolve) => window.setTimeout(resolve, 0)));
    const yielding = (): Promise<unknown> => {
      const stack = (new Error().stack ?? "").split("\n");
      const at = stack.findIndex((line) => /\bpause\b/.test(line));
      const caller = at >= 0 ? (stack[at + 1] ?? "") : "";
      if (!/createEngine/.test(caller) || /\basync\b/.test(caller)) return pass();
      hold.steps += 1;
      if (hold.held) hold.after += 1;
      if (hold.steps !== LAST) return pass();
      hold.held = true;
      return held;
    };
    if (native !== null && typeof native === "object") Object.defineProperty(native, "yield", { configurable: true, value: yielding });
    else Object.defineProperty(window, "scheduler", { configurable: true, value: { yield: yielding } });
    Reflect.set(window, "__ttTakeUps", 0);
    const reveal = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element, arg?: boolean | ScrollIntoViewOptions) {
      if (typeof arg === "object" && arg.block === "center") Reflect.set(window, "__ttTakeUps", Number(Reflect.get(window, "__ttTakeUps")) + 1);
      return Reflect.apply(reveal, this, [arg]);
    };
  });
}

test.describe("a Tab stop's glide (spec §3.G; WCAG 2.4.11)", () => {
  test.skip(({ isMobile }) => isMobile, "the keyboard and a fine pointer: one project is enough");
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  for (const anchoring of ["on", "off"] as const) {
    test.describe(`scroll anchoring ${anchoring}`, () => {
      test.beforeEach(async ({ page }) => {
        if (anchoring === "off") await noAnchoring(page);
      });

      // The root cause the #94 review named: the live drawing pinning #anatomy (+≈4350px) a task after a Tab, before the
      // glide's first scroll, under a glide whose end the browser set at the focus. The drawing waits for a Tab's glide as
      // it waits for an in-page link's (drawing.ts), so the glide lands at the link with nothing to take up.
      test('the drawing does not pin under a Tab\'s glide to "Read the data policy": it lands with nothing taken up', async ({ page }) => {
        await holdThePin(page);
        await page.goto("/");
        await waitForJourney(page);
        await skipWithoutWebgl2(page);
        await page.waitForFunction(() => Reflect.get(window, "__ttPinHold")?.held === true, undefined, { timeout: 25_000 });
        await expect(page.locator("html")).toHaveAttribute("data-drawing", "live");
        await expect(page.locator("#anatomy")).not.toHaveClass(/is-live/); // about to pin
        await scrollToId(page, "top");
        await frames(page, 3);
        await readyTab(page, "#reliability", POLICY);
        const before = await page.evaluate((name) => {
          const link = [...document.querySelectorAll<HTMLElement>("#reliability a")].find((a) => a.textContent?.includes(name));
          const anatomy = document.getElementById("anatomy");
          if (!link || !anatomy) throw new Error("no data policy link, or no #anatomy");
          const log = { pins: 0, glide: [] as number[] };
          Reflect.set(window, "__ttGlideLog", log);
          new MutationObserver(() => {
            if (anatomy.classList.contains("is-live")) log.pins += 1;
          }).observe(anatomy, { attributes: true, attributeFilter: ["class"] });
          // each step of the glide, while the drawing has yet to decide where it landed
          document.addEventListener("scroll", () => {
            if (document.documentElement.dataset.drawing === "live") log.glide.push(anatomy.getBoundingClientRect().height);
          }, { capture: true, passive: true });
          // the scene arrives a task after the Tab's focus, before the glide's first scroll
          link.addEventListener("focus", () => window.setTimeout(() => Reflect.get(window, "__ttPinHold").release(), 0), { once: true });
          return { height: anatomy.getBoundingClientRect().height, below: link.getBoundingClientRect().top > window.innerHeight };
        }, POLICY);
        expect(before.below, "the link starts below the window: the Tab glides to it").toBe(true);
        await pressTab(page);
        await expect(policy(page)).toBeFocused();
        await atRest(page, 15);
        await frames(page, 30);
        await atRest(page, 15);
        const after = await page.evaluate(() => ({
          log: Reflect.get(window, "__ttGlideLog") as { pins: number; glide: number[] },
          takeUps: Number(Reflect.get(window, "__ttTakeUps")),
          after: Number(Reflect.get(window, "__ttPinHold").after),
        }));
        expect(after.after, "the held yield was the engine's last (scene/engine.ts): the pin followed its release at once").toBe(0);
        expect.soft(after.log.glide.length, "the glide scrolled").toBeGreaterThan(0);
        expect.soft(after.log.glide.filter((h) => Math.abs(h - before.height) > 1), "#anatomy's height held through the glide").toEqual([]);
        expect.soft(after.log.pins, "the drawing did not pin under the glide").toBe(0);
        expect.soft(after.takeUps, "focus-glide's take-up was never used").toBe(0);
        expect(await inWindow(page), "the focused link is wholly in the window, below the masthead").toBe(true);
      });

      test("reaches the window though the drawing above falls to the still mid-glide", async ({ page }) => {
        await page.goto("/");
        await waitForLive(page);
        await scrollToId(page, "record", 100); // past the drawn train; 04's link below the window
        await frames(page, 3);
        await readyTab(page, "#reliability", POLICY, "lost");
        await pressTab(page);
        await expect(policy(page)).toBeFocused();
        await expect(page.locator("html")).toHaveAttribute("data-drawing", "still");
        await atRest(page);
        expect(await inWindow(page), "the focused link is wholly in the window, below the masthead").toBe(true);
      });

      // A resize mid-glide (a window resized or zoomed, browser UI changing the height) makes 02's guard, the drawing and
      // the still keep the reader's place, and their instant scrolls cut the glide (round 3). With the drawing yet to
      // decide at the Tab, the guard's jump lets it decide: the still's columns grow 03 and the still jumps again, a few
      // frames after the glide was first taken up, so each later cut is taken up too (round 4).
      for (const drawing of ["still", "undecided"] as const)
        for (const at of [2, 8]) {
          const when = drawing === "still" ? "" : ", the drawing yet to decide";
          test(`reaches the window though it is resized ${at} frames into the glide${when}`, async ({ page }) => {
            // the still: held there, as the governor floors it on a slow GPU; undecided: the Tab before the scene arrives
            if (drawing === "still") await drawStill(page);
            await page.goto("/");
            await waitForJourney(page);
            await scrollToId(page, "record", 100);
            await frames(page, 3);
            await readyTab(page, "#reliability", POLICY);
            await pressTab(page);
            await expect(policy(page)).toBeFocused();
            await frames(page, at);
            await page.setViewportSize({ width: 1440, height: 860 });
            await atRest(page, 15);
            await frames(page, 30); // the journey's own resize answer lands 150 ms later
            await atRest(page, 15);
            expect(await inWindow(page), "the focused link is wholly in the window, below the masthead").toBe(true);
          });
        }

      // A relayout mid-glide (the owner's decision, 2026-09-28): the browser set the glide's end at the Tab, and a piece
      // that grows between the reader and the link (the live drawing pinning a frame after the Tab, the one island.spec
      // caught) moves the link past that end with no place-keeping jump to announce it. The glide lands where the link
      // was, the link 2400px below the window, unless the relayout is taken up too. 04's link from the page's top, as
      // island.spec's walk reaches it; the footer's first link from 08, below the window-seat run.
      for (const link of [
        { scope: "#reliability", name: POLICY, from: "top", grow: "principles" },
        { scope: "footer", name: "How it works", from: "faq", grow: "terminus" },
      ] as const)
        for (const at of [1, 6]) {
          test(`reaches the window though the page is relaid out ${at} frame${at > 1 ? "s" : ""} into the glide to "${link.name}"`, async ({ page }) => {
            await drawStill(page);
            await page.goto("/");
            await waitForJourney(page);
            await scrollToId(page, link.from, link.from === "top" ? 0 : 100);
            await frames(page, 3);
            const below = await page.locator(`${link.scope} a`, { hasText: link.name }).evaluate((a) => a.getBoundingClientRect().top > window.innerHeight);
            expect(below, "the link starts below the window: the Tab glides to it").toBe(true);
            await readyTab(page, link.scope, link.name);
            await relayoutOnFocus(page, link.scope, link.name, link.grow, at);
            await pressTab(page);
            await expect(page.locator(`${link.scope} a`, { hasText: link.name })).toBeFocused();
            await expect(page.locator("[data-relayout]")).toHaveCount(1);
            await atRest(page, 15);
            await frames(page, 30);
            await atRest(page, 15);
            expect(await linkInWindow(page, link.scope, link.name), "the focused link is wholly in the window, below the masthead").toBe(true);
          });
        }

      test("reaches the window though the journey rebuilds as the page is relaid out, a frame into the glide", async ({ page }) => {
        await drawStill(page);
        await page.goto("/");
        await waitForJourney(page);
        await scrollToId(page, "top");
        await frames(page, 3);
        await readyTab(page, "#reliability", POLICY);
        await relayoutOnFocus(page, "#reliability", POLICY, "principles", 1, true);
        await pressTab(page);
        await expect(policy(page)).toBeFocused();
        await expect(page.locator("[data-relayout]")).toHaveCount(1);
        await atRest(page, 15);
        await frames(page, 30);
        await atRest(page, 15);
        expect(await inWindow(page), "the focused link is wholly in the window, below the masthead").toBe(true);
      });

      test("never pulls back a reader who dragged away mid-glide, though the page is relaid out while the glide is watched", async ({ page }) => {
        await drawStill(page);
        await page.goto("/");
        await waitForJourney(page);
        await scrollToId(page, "record", 100);
        await frames(page, 3);
        await readyTab(page, "#reliability", POLICY, "away"); // the drag: two frames after the focus
        await relayoutOnFocus(page, "#reliability", POLICY, "reliability", 4); // two frames after the drag, still watched
        await pressTab(page);
        await expect(policy(page)).toBeFocused();
        await expect(page.locator("[data-relayout]")).toHaveCount(1);
        await atRest(page, 20);
        await frames(page, 30);
        await atRest(page, 20);
        expect(await principlesTop(page), "the drag left the reader at 01, and nothing took them back").toBeCloseTo(100, -1);
      });

      // A rebuild (02's refit, 200 ms after a tt:layout) hands the watched glide to the rebuilt module: a reader a drag took
      // off the glide's course before it keeps their place there too (review F1).
      test("never pulls back a reader who dragged away mid-glide, though the journey then rebuilds", async ({ page }) => {
        await drawStill(page);
        await page.goto("/");
        await waitForJourney(page);
        await scrollToId(page, "record", 100);
        await frames(page, 3);
        await readyTab(page, "#reliability", POLICY, "away"); // the drag: two frames after the focus
        await page.evaluate((name) => {
          const link = [...document.querySelectorAll<HTMLElement>("#reliability a")].find((a) => a.textContent?.includes(name));
          if (!link) throw new Error("no data policy link");
          const wait = (left: number): void => {
            if (left <= 0) window.dispatchEvent(new Event("tt:rebuild"));
            else requestAnimationFrame(() => wait(left - 1));
          };
          link.addEventListener("focus", () => wait(4), { once: true }); // two frames after the drag, still watched
        }, POLICY);
        await pressTab(page);
        await expect(policy(page)).toBeFocused();
        await atRest(page, 20);
        await frames(page, 30);
        await atRest(page, 20);
        expect(await principlesTop(page), "the drag left the reader at 01, and nothing took them back").toBeCloseTo(100, -1);
      });

      test("never pulls back a reader whom a mouse focused, though the page is relaid out after the click", async ({ page, browserName }) => {
        test.skip(browserName === "webkit", "WebKit doesn't focus a link on click");
        await drawStill(page);
        await page.goto("/");
        await waitForJourney(page);
        await page.evaluate((name) => {
          const link = [...document.querySelectorAll<HTMLAnchorElement>("#reliability a")].find((a) => a.textContent?.includes(name));
          if (!link) throw new Error("no data policy link");
          window.scrollTo({ top: link.getBoundingClientRect().top + window.scrollY - (window.innerHeight - 8), behavior: "instant" });
          link.addEventListener("click", (event) => event.preventDefault(), { once: true });
        }, POLICY);
        await frames(page, 3);
        await relayoutOnFocus(page, "#reliability", POLICY, "reliability", 2);
        const box = await policy(page).boundingBox();
        if (!box) throw new Error("the link is not laid out");
        await page.mouse.click(box.x + box.width / 2, box.y + 3);
        await expect(policy(page)).toBeFocused();
        await expect(page.locator("[data-relayout]")).toHaveCount(1);
        await atRest(page, 20);
        await frames(page, 30);
        // the link moved 2400px down the page: Chromium with anchoring off moves the page with it, and it stays cut off at
        // the window's foot; with anchoring on, it is below the window. Either way, nothing brought it in.
        const top = await policy(page).evaluate((a) => a.getBoundingClientRect().top - window.innerHeight);
        expect(top, "the link is still at or below the window's foot, where the click left it").toBeGreaterThanOrEqual(-12);
      });

      test("never pulls back a reader whom focus returning to the window finds away, though the page is relaid out", async ({ page }) => {
        await drawStill(page);
        await page.goto("/");
        await waitForJourney(page);
        await scrollToId(page, "record", 100);
        await frames(page, 3);
        await readyTab(page, "#reliability", POLICY);
        await pressTab(page);
        await expect(policy(page)).toBeFocused();
        await atRest(page, 20);
        expect(await inWindow(page), "the Tab brought the link to the window").toBe(true);
        await page.mouse.move(700, 450);
        await page.mouse.wheel(0, 1500); // away, down: the link above the window
        await atRest(page, 20);
        await frames(page, 30);
        await page.evaluate(() => {
          const a = document.activeElement;
          if (!(a instanceof HTMLElement)) throw new Error("nothing is focused");
          a.blur();
          a.focus({ preventScroll: true });
          // then, above the link: it moves 300px down the page, still above the window whether or not anchoring answers
          const grow = document.createElement("div");
          grow.setAttribute("data-relayout", "");
          grow.style.height = "300px";
          document.getElementById("principles")?.before(grow);
          window.dispatchEvent(new Event("tt:layout"));
        });
        await atRest(page, 20);
        await frames(page, 30);
        await atRest(page, 20);
        await expect(policy(page)).toBeFocused();
        const bottom = await policy(page).evaluate((a) => a.getBoundingClientRect().bottom);
        expect(bottom, "the link stays above the window, where the reader left it").toBeLessThan(0);
      });

      test("never pulls back a reader who dragged away mid-glide: a layout change and a resize leave them put", async ({ page }) => {
        await drawStill(page);
        await page.goto("/");
        await waitForJourney(page);
        await scrollToId(page, "record", 100);
        await frames(page, 3);
        await readyTab(page, "#reliability", POLICY, "away");
        await pressTab(page);
        await expect(policy(page)).toBeFocused();
        await atRest(page);
        const before = await principlesTop(page);
        expect(before, "the drag left the reader at 01").toBeCloseTo(100, -1);
        await page.evaluate(() => window.dispatchEvent(new Event("tt:layout")));
        await frames(page, 5);
        await page.setViewportSize({ width: 1440, height: 880 });
        await atRest(page, 20);
        // 01 stays where the reader left it (a resize that changes the drawing above moves them by exactly its change)
        expect(Math.abs((await principlesTop(page)) - before)).toBeLessThanOrEqual(4);
      });

      // Focus coming back to the window (a tab or window switch) is :focus-visible again, but no Tab moved it: a resize
      // that comes with it (browser UI changing the height) makes the page jump, and must not pull a reader who wheeled
      // away back to the link (round 4; blur and focus without scrolling stand in for the switch).
      for (const at of [0, 2]) {
        test(`never pulls back a reader whom focus returning to the window finds away, resized ${at} frames after`, async ({ page }) => {
          await drawStill(page);
          await page.goto("/");
          await waitForJourney(page);
          await scrollToId(page, "record", 100);
          await frames(page, 3);
          await readyTab(page, "#reliability", POLICY);
          await pressTab(page);
          await expect(policy(page)).toBeFocused();
          await atRest(page, 20);
          expect(await inWindow(page), "the Tab brought the link to the window").toBe(true);
          await page.mouse.move(700, 450);
          await page.mouse.wheel(0, 1500); // away, down: the link above the window
          await atRest(page, 20);
          await frames(page, 30);
          await page.evaluate(() => {
            const a = document.activeElement;
            if (!(a instanceof HTMLElement)) throw new Error("nothing is focused");
            a.blur();
            a.focus({ preventScroll: true });
          });
          await frames(page, at);
          await page.setViewportSize({ width: 1440, height: 860 });
          await atRest(page, 20);
          await frames(page, 30);
          await atRest(page, 20);
          await expect(policy(page)).toBeFocused();
          const bottom = await policy(page).evaluate((a) => a.getBoundingClientRect().bottom);
          expect(bottom, "the link stays above the window, where the reader left it").toBeLessThan(0);
        });
      }

      test("never pulls back a reader whom a mouse focused: a click on a link cut off at the window's foot starts no glide", async ({ page, browserName }) => {
        test.skip(browserName === "webkit", "WebKit doesn't focus a link on click");
        await drawStill(page);
        await page.goto("/");
        await waitForJourney(page);
        // the link's foot below the window's; the click itself must not leave the page
        await page.evaluate((name) => {
          const link = [...document.querySelectorAll<HTMLAnchorElement>("#reliability a")].find((a) => a.textContent?.includes(name));
          if (!link) throw new Error("no data policy link");
          window.scrollTo({ top: link.getBoundingClientRect().top + window.scrollY - (window.innerHeight - 8), behavior: "instant" });
          link.addEventListener("click", (event) => event.preventDefault(), { once: true });
        }, POLICY);
        await frames(page, 3);
        const box = await policy(page).boundingBox();
        if (!box) throw new Error("the link is not laid out");
        await page.mouse.click(box.x + box.width / 2, box.y + 3);
        await expect(policy(page)).toBeFocused();
        await scrollToId(page, "principles", 100); // then a drag away
        await atRest(page);
        const before = await principlesTop(page);
        await page.evaluate(() => window.dispatchEvent(new Event("tt:layout")));
        await frames(page, 15);
        expect(Math.abs((await principlesTop(page)) - before)).toBeLessThanOrEqual(4);
      });
    });
  }
});
