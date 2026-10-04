import type { Page } from "@playwright/test";

// Where a link's glide stands, for link-glide.spec.ts: its tests act at a place in the glide, never at a count of frames.
// Chromium's glide runs on time, so on a slow machine (CI's runner, 8x CPU here) "frame 40" is near its end: a test that
// resized there measured a page already at rest, and one that dragged there found the reader 17 px from the target
// (PR #116's first run). Each test says how far the reader still was from the target as it acted, and fails on that.

/** How far the page stands from where a link to `#id` takes it: a section of the pinned run at the window (where run.ts
 * says it stands, data-run-at), any other at its landing (its scroll margin below the window's top; the masthead's foot
 * for a section of the run while it is not pinned). Runs in the page. */
function leftTo(id: string): number {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing`);
  const foot = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
  if (el.dataset.runAt !== undefined) return Math.abs(Math.round(Number(el.dataset.runAt) - foot - window.scrollY));
  const landing = el.closest("#run") ? foot : Number.parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  return Math.abs(Math.round(el.getBoundingClientRect().top - landing));
}

export interface GlidePlace {
  /** The page's scroll. */
  readonly y: number;
  /** How far the page still was from the link's target, px. */
  readonly left: number;
}

export interface ResizePlace extends GlidePlace {
  /** The place-keeping jumps (tt:jump) made from the resize on: a piece the reader stood in kept their place. */
  readonly jumps: number;
}

/** Where the glide to `#id` stands now. */
export function glidePlace(page: Page, id: string): Promise<GlidePlace> {
  return page.evaluate(`(() => {
    ${leftTo.toString()}
    return { y: Math.round(window.scrollY), left: leftTo(${JSON.stringify(id)}) };
  })()`) as Promise<GlidePlace>;
}

/** Waits until the glide to `#id`, begun at scroll `start`, has covered `share` of its way (0–1), a frame at a time in
 * the page; where it stood then. Fails if the page stands still for three seconds first: no glide is running. */
export function throughGlide(page: Page, id: string, start: number, share: number): Promise<GlidePlace> {
  return page.evaluate(
    `new Promise((done, fail) => {
      ${leftTo.toString()}
      const whole = Math.abs(window.scrollY - ${start}) + leftTo(${JSON.stringify(id)});
      let last = window.scrollY;
      let stillSince = performance.now();
      const tick = () => {
        const left = leftTo(${JSON.stringify(id)});
        if (window.scrollY !== last) stillSince = performance.now();
        last = window.scrollY;
        if (whole - left >= whole * ${share}) return done({ y: Math.round(window.scrollY), left });
        if (performance.now() - stillSince > 3000) return fail(new Error("the page stood still for three seconds, " + left + " px from #${id}: no glide is running"));
        requestAnimationFrame(tick);
      };
      tick();
    })`,
  ) as Promise<GlidePlace>;
}

/** Tells `event` on the window once the glide to `#id`, begun at scroll `start`, has covered `share` of its way, in the
 * page and in that same frame; where the glide stood then. For what a test does mid-glide in the page itself (the
 * journey's rebuild): asked for from the test, after a count of frames, it came after WebKit's glide had ended and the
 * page had rested ten frames on a loaded machine (2 runs in 40), and measured a reader at rest in the run. */
export function tellThroughGlide(page: Page, id: string, start: number, share: number, event: string): Promise<GlidePlace> {
  return page.evaluate(
    `new Promise((done) => {
      ${leftTo.toString()}
      const whole = Math.abs(window.scrollY - ${start}) + leftTo(${JSON.stringify(id)});
      const tick = () => {
        const left = leftTo(${JSON.stringify(id)});
        if (whole - left < whole * ${share}) return void requestAnimationFrame(tick);
        const at = { y: Math.round(window.scrollY), left };
        window.dispatchEvent(new Event(${JSON.stringify(event)}));
        done(at);
      };
      tick();
    })`,
  ) as Promise<GlidePlace>;
}

/** Notes where the glide to `#id` stands as the next "resize" is told (the window's, as the page hears it), and counts
 * the place-keeping jumps made from then on: read both back with atResize once the page has settled. */
export async function watchResize(page: Page, id: string): Promise<void> {
  await page.evaluate(
    `(() => {
      ${leftTo.toString()}
      Reflect.deleteProperty(window, "__ttAtResize");
      window.addEventListener("resize", () => {
        const at = { y: Math.round(window.scrollY), left: leftTo(${JSON.stringify(id)}), jumps: 0 };
        Reflect.set(window, "__ttAtResize", at);
        window.addEventListener("tt:jump", () => (at.jumps += 1));
      }, { once: true, capture: true });
    })()`,
  );
}

/** Where the glide stood as the resize was told, and the jumps since (watchResize); fails if no resize was. */
export async function atResize(page: Page): Promise<ResizePlace> {
  const at = (await page.evaluate(() => Reflect.get(window, "__ttAtResize") ?? null)) as ResizePlace | null;
  if (!at) throw new Error("no resize was told since watchResize");
  return at;
}

/** Makes `act` (a load, a tap or a click, and a resize) until its resize was told mid-glide, the reader still more than
 * `far` px from the target, three times at most: the last one's place. The resize is asked for from another process, and
 * on a loaded machine it can be told once a short glide is over (WebKit's ten frames: 9 runs in 2,120 at a load of 80
 * and more). That run measured nothing, so it is made again; a test whose three runs all came late still fails, on its
 * own precondition. */
export async function midGlide(far: number, act: () => Promise<ResizePlace>): Promise<ResizePlace> {
  let at = await act();
  for (let again = 0; again < 2 && at.left <= far; again += 1) at = await act();
  return at;
}
