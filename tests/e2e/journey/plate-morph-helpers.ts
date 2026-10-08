import type { Page } from "@playwright/test";
import { expect } from "../fixtures";
import { PNR } from "../helpers";
import { frames, waitForJourney } from "./journey-helpers";

// What plate-morph.spec.ts shares: when a hand can be put to the hero plate, and the plate read frame by frame from
// before a press until it rests.

/** The hero plate's morphing block. */
export const PLATE = '[data-testid="hero-instrument"] .plate-morph';
/** The morph's length (plate-morph.tsx, MORPH_S). Its tweens are of time, so a frame is judged by when it was drawn. */
export const MORPH_MS = 420;
/** This many frames in a row with nothing about the plate changing is rest. */
export const REST_FRAMES = 10;
/** The longest a recording waits for that rest before it gives up and the test fails, saying what it last saw. A press
 * to rest is about 1.4 s (the running state's 900 ms, then the morph); a loaded runner stretches it, never this far. */
const GIVE_UP_MS = 15_000;

/** React is interactive on the page, and its Motion is the page's. A hand put to the plate before that is lost: a
 * press reaches no handler, and digits filled into the server's markup are not the plate's (Run then answers "Enter all
 * 10 digits"). html[data-hydrated] is the page's own mark (hydration-marker.tsx). Hydration always starts from Motion
 * on, whatever <html data-motion> says, and puts itself right in the render after: the footer's switch shows React's
 * Motion, so the switch agreeing with <html data-motion> is that render landed. States, never a time. */
export async function hydrated(page: Page): Promise<void> {
  await page.locator("html[data-hydrated]").waitFor({ state: "attached", timeout: 15_000 });
  const on = (await page.locator("html").getAttribute("data-motion")) !== "off";
  await expect(page.getByRole("contentinfo").getByRole("switch", { name: "Motion" })).toHaveAttribute("aria-checked", String(on));
}

/** The page has finished starting: the journey has started and settled (waitForJourney), and the drawing is what it will
 * be, still, or live and begun with its first frames drawn. The live drawing's first frame holds the page for over half
 * a second on the runner's software GPU (570 to 720 ms measured, whatever the CPU): from about 0.8 s to 1.4 s into the
 * page on a quiet machine, later on a busy one. A press made as the page loads brings the record at 1.4 s, so the two
 * meet whenever either is a little late, and the morph's tweens are of time: one the stall lands on is never drawn (the
 * frame after the stall is its last). No reading of the morph's frames means anything unless the page is past it. */
async function settled(page: Page): Promise<void> {
  await waitForJourney(page);
  await page.locator('html[data-drawing="still"], #anatomy.is-live').first().waitFor({ state: "attached", timeout: 25_000 });
  await frames(page, 2);
}

/** Opens the landing and waits until a hand can be put to the plate and the morph can be read: hydrated, and settled. */
export async function open(page: Page): Promise<void> {
  await page.goto("/");
  await hydrated(page);
  await settled(page);
}

/** Fills the PNR only — on 390px this alone reveals the entry face's Clear button, growing it, which is
 * unrelated to the morph (the face never changes here). */
export async function fill(page: Page, pnr: string = PNR.cnf): Promise<void> {
  await page.getByTestId("hero-instrument").getByRole("textbox").fill(pnr);
}

/** Clicks Run and waits for the record — the only span the morph itself runs across. */
export async function clickRun(page: Page): Promise<void> {
  const plate = page.getByTestId("hero-instrument");
  await plate.getByRole("button", { name: /run/i }).click();
  const result = page.getByTestId("terminal-result");
  await expect(result).toBeVisible();
  await expect(result).toHaveAttribute("data-kind", "ok");
}

export async function run(page: Page): Promise<void> {
  await fill(page);
  await clickRun(page);
}

/** The hero plate in one frame, read as the frame's callbacks began: what the last frame drew, and whatever a commit
 * wrote since (the record's first frame reads the 8px and the old height the morph starts from). */
export interface PlateFrame {
  /** When (performance.now(), ms). */
  readonly at: number;
  /** The record is on the plate. */
  readonly record: boolean;
  /** The face's vertical offset (px, from its computed matrix): 0 at rest. */
  readonly rise: number;
  /** The plate's height (px). */
  readonly height: number;
  /** What the morph has written inline, the plate's height and the face's transform: both empty at rest. */
  readonly inline: { readonly height: string; readonly transform: string };
}

export interface Recording {
  readonly frames: readonly PlateFrame[];
  /** When the plate's face changed (the commit the morph's tweens start in), or null if it never did. */
  readonly changed: number | null;
  /** True once the plate came to rest; false when the recording gave up, GIVE_UP_MS on. */
  readonly rested: boolean;
}

/** Starts recording the hero plate, every frame from now until a state: `face` is on the plate, and nothing about the
 * plate (the face's offset, the height, either inline style) has changed for REST_FRAMES frames in a row. Never a count
 * of seconds: a press, the running state and the record's arrival take as long as the runner takes. Returns the wait for
 * that state. A plate that is not there after GIVE_UP_MS ends the recording unrested (see `rested`). Started with `face`
 * already on the plate and still, it ends REST_FRAMES frames on: record towards the face the plate is about to take. */
export async function recordPlate(page: Page, face: "record" | "entry" = "record"): Promise<() => Promise<Recording>> {
  await page.evaluate(
    ([selector, wanted, rest, giveUp]) => {
      const plate = document.querySelector<HTMLElement>(selector);
      if (!plate) throw new Error("the hero plate is missing");
      const drawn = () => plate.querySelector('[data-testid="terminal-result"]') !== null;
      const had = drawn();
      let changed: number | null = null;
      // told of the commit itself, between frames: the tweens' own start, however long the next frame takes to come
      const faces = new MutationObserver(() => {
        if (changed === null && drawn() !== had) changed = performance.now();
      });
      faces.observe(plate, { childList: true });
      const until = performance.now() + giveUp;
      const seen: PlateFrame[] = [];
      const recording = new Promise<Recording>((done) => {
        let held = 0;
        const tick = () => {
          const el = plate.firstElementChild instanceof HTMLElement ? plate.firstElementChild : null;
          const now: PlateFrame = {
            at: performance.now(),
            record: drawn(),
            rise: el ? new DOMMatrixReadOnly(getComputedStyle(el).transform).m42 : 0,
            height: plate.getBoundingClientRect().height,
            inline: { height: plate.style.height, transform: el?.style.transform ?? "" },
          };
          const last = seen.at(-1);
          const still = last !== undefined && last.rise === now.rise && last.height === now.height && last.inline.height === now.inline.height && last.inline.transform === now.inline.transform;
          held = still && now.record === (wanted === "record") ? held + 1 : 0;
          seen.push(now);
          if (held < rest && now.at < until) return void requestAnimationFrame(tick);
          faces.disconnect();
          done({ frames: seen, changed, rested: held >= rest });
        };
        requestAnimationFrame(tick);
      });
      Reflect.set(window, "__ttPlateRecording", recording);
    },
    [PLATE, face, REST_FRAMES, GIVE_UP_MS] as const,
  );
  return () => page.evaluate(() => Reflect.get(window, "__ttPlateRecording") as Promise<Recording>);
}

/** A recording that ended at rest; one that gave up fails here, saying what the plate was doing. */
export function rested(recording: Recording): Recording {
  const last = recording.frames.slice(-3).map((frame) => ({ ...frame, at: Math.round(frame.at) }));
  expect(recording.rested, `the plate was not at rest ${GIVE_UP_MS / 1000} s after its recording began: ${recording.frames.length} frames, the last ${JSON.stringify(last)}`).toBe(true);
  return recording;
}

/** Presses Run with the plate recorded from before the press until the record is drawn and at rest. */
export async function recordRun(page: Page): Promise<Recording> {
  const atRest = await recordPlate(page);
  await clickRun(page);
  return rested(await atRest());
}

/** Keeps every height the morph writes on the plate, in order (`window.__written`): a MutationObserver is told each
 * write with the value it replaced, so the list is every inline height the plate has had, the last one before the morph
 * cleared it included, whatever the frame rate. */
export async function watchHeights(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __written: number[] };
    w.__written = [];
    const el = document.querySelector('[data-testid="hero-instrument"] .plate-morph')!;
    new MutationObserver((records) => {
      for (const record of records) {
        const height = /(?:^|;\s*)height:\s*([\d.]+)px/.exec(record.oldValue ?? "");
        if (height) w.__written.push(Number(height[1]));
      }
    }).observe(el, { attributes: true, attributeFilter: ["style"], attributeOldValue: true });
  });
}

/** The morph has run and let go: it wrote heights, and none is left on the plate. A state, never a time. */
export async function letGo(page: Page): Promise<void> {
  const wrapper = page.locator('[data-testid="hero-instrument"] .plate-morph');
  await expect.poll(() => wrapper.evaluate((el) => (window as unknown as { __written: number[] }).__written.length > 0 && (el as HTMLElement).style.height === ""), { timeout: 10_000 }).toBe(true);
}

/** Every plate face's computed transform, sampled each frame from the first frame a face exists (the server's
 * markup, before hydration) until `ms` after the journey has taken the page over (so hydration and whatever
 * follows it are always inside the window, however slowly the dev server hydrates). Starts before the page's
 * own scripts. Identity is written as "none" however the browser spells it. */
export async function faceTransformsFromFirstPaint(page: Page, ms = 600): Promise<string[]> {
  await page.addInitScript((span) => {
    const w = window as unknown as { __faces: string[]; __facesDone: boolean };
    w.__faces = [];
    w.__facesDone = false;
    let hydrated: number | null = null;
    const tick = () => {
      for (const face of document.querySelectorAll(".plate-morph > div")) {
        const t = getComputedStyle(face).transform;
        w.__faces.push(t === "matrix(1, 0, 0, 1, 0, 0)" ? "none" : t);
      }
      if (hydrated === null && document.documentElement.getAttribute("data-journey") === "on") hydrated = performance.now();
      if (hydrated === null || performance.now() - hydrated < span) requestAnimationFrame(tick);
      else w.__facesDone = true;
    };
    requestAnimationFrame(tick);
  }, ms);
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as { __facesDone: boolean }).__facesDone, null, { timeout: 20_000 });
  return page.evaluate(() => (window as unknown as { __faces: string[] }).__faces);
}
