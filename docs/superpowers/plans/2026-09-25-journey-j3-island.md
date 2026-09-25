# The Page Moves: Implementation Plan (Landing journey J3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the landing moves. J2's still instruments come alive on scroll, all except the train and the window-seat run:
- the strip's train runs and leans, with an odometer and the current station, and a hairline rail on phones;
- the board's status column follows the scroll, and its rows flip in;
- the headline's letters rise, and the plotter draws the masthead rule and the plates once per visit;
- sections enter every time they come back into view;
- the hero dial answers the plate: segments light as digits are typed, a sweep runs during a check, and a 24-hour face shows after a result;
- 02 becomes a pinned chapters instrument, with fit rules;
- the berth plan draws itself, the clock gets a sweeping second hand, and the route lays its line;
- a registration-mark cursor, the Sound switch and its clack, and the plate morph.

**Architecture:** the server markup stays the finished, still page. A small client component, `JourneyLoader`, imports the journey chunk once the page is idle (`requestIdleCallback`, 1.5 s timeout) and calls `startJourney()`. The chunk holds Anime.js and every journey module. It marks `<html data-journey="on">`, starts each module, and rebuilds them all when the Motion switch changes. Each module takes the server's markup over imperatively, outside React, and returns a teardown that puts the markup back exactly. Every journey-only state in CSS sits under `html[data-journey="on"]`. So a page whose journey never starts is J2's page, whole and still: offline, blocked, a script error, or the 15 s watchdog.
- **Pure logic is unit-tested.** Strip position, entrances, board status, chart face, chapter progress, fit, sound pacing and geometry live in their own modules.
- **Browser behaviour is proven with Playwright.**
- **The plate morph uses Motion,** tweening the plate's height with the `domAnimation` features the app already loads (ruling 13). It never loads Anime.js.

**Tech Stack:**
- Next.js 16.3.4 App Router, React 19.2, Tailwind 4;
- **Anime.js 4.5.0** (new, exact);
- Motion 13.4 (the app's `domAnimation`);
- Vitest 4, Playwright 1.62.

**Spec:** `docs/superpowers/specs/2026-09-24-landing-journey-design.md`. The relevant parts:
- §3.A, the rows for Masthead, Hero, Departure board, 01, 02, 03, 04, 05, 08 and Footer, the "Section entrances replay" paragraph, and the fit paragraph;
- §3.B: the loader, the chunk, teardowns, the state attributes, the events and the module map;
- §3.G, §3.H (the journey chunk ≤ 70 KB compressed), §3.I, §4 (the first, third-to-last and last rows), §5, and §6 J3.

**Reference:** prototype v3, source in the session scratchpad at `train-proto/src/js/`. Its built page is `train-proto/build/index.html`; serve it with `python3 -m http.server` for side-by-side checks. Two digests stand beside this plan in the scratchpad:
- `j3-v3-digest.md`: v3's behaviour, with every number;
- `j3-code-digest.md`: this branch's code as J2 left it.

**Branch:** `feat/journey-j3-journey-island` (worktree `../trackandtrace-j3`), from `feat/journey-j2-instruments` (b29bb0b). J1 and J2 are not merged; if either changes before it merges, rebase onto it.

**Rulings made while planning.** Task 14 writes 1, 5, 7 and 8 into the spec. The rest are recorded here and in DESIGN.md.
1. **A failed journey never touches `data-motion`.** v3's give-up wrote `data-motion="off"`, which would flip the reader's Motion switch and the whole site's motion. Here it writes `data-journey="failed"`. Every moving or pinned state requires `data-journey="on"`, so the page falls back to still without lying about the reader's choice.
2. **Entrances replay, and are checked against boxes.** A small reducer (`entrances.ts`) decides from each trigger's live box:
   - arm the start state when the trigger is wholly out of the window;
   - play when it comes into the band.

   So jumps and reloads never strand anything, and nothing resets while visible. v3's one-shot `arrive()` is not ported.
3. **Text moves by transform only** (spec §3.G). v3 also faded the letters, lead, tags, kickers and board characters in; here those move by transform alone. Decorative drawings may still fade: registration marks, dial segments and ticks, lines.
4. **The board's status column is true with Motion off too.** Its value follows the scroll either way; only the flip is motion. The column shows only while the journey runs.
5. **The hero face reads the record's own `chartAt`** from structured data (`TerminalResult.chartAt`, the source's timestamp), not scraped text. Its readout uses the record page's wording: "Chart 15:20 IST · in 3 h 20 min", or "… · prepared". No "~": the time is the source's, not an estimate. This updates §3.A's hero row.
6. **One writer per attribute.** React keeps the clock's hour and minute hands (15 s); the journey owns only the new second hand, which React renders without a `transform`. Likewise, the journey never writes an attribute React renders from state.
7. **The phone strip is its own `aria-hidden` rail** (`.phone-rail`). The strip's `<nav>` stays hidden below 48rem, so phones never expose an empty navigation landmark (the J2 review's finding).
8. **What only a later PR can call waits for that PR.** The strip's hand-off pulse and the departure horn have no caller before J4 and J5 (the drawn train). They land with their callers, so nothing in J3 is inert.
9. **v3's hero-dial `fit()` is not ported.** J2's CSS fit already holds, guarded by `instruments.spec.ts`: shown from 64rem, masked on the left, clipped at the page.
10. **Chapters rebuild by event, not by a global.** v3 used `window.__rebuildMotion`. Here a fit flip dispatches `tt:rebuild`, which `startJourney` answers.
11. **The trace card and the chapters demo echo the specimen.** The PNR, the statuses, the party and the retrieval time come from `buildSpecimen()` (`chapterTrace`). None of it is retyped, and no "now" stands in for a retrieval time.
12. **The journey runs with Motion off too.** Several pieces are true information, not motion, so they still update: the strip's position and odometer, `aria-current`, the board's status, the lit dial segments, and the chart face. With Motion off, modules install only those at-rest states. Entrances, the intro, the lean, the cursor and pinning stay off.
13. **The plate morph tweens the plate's height, not its layout.** Spec §3.B asks for Motion's layout animation with `domMax`, but that has two problems here:
    - Layout animation moves by transforms, so it would stretch the plate's text mid-morph.
    - `Plate` is not a Motion element, so the plate's own border would jump.

    Instead, `PlateMorph` measures the old and new content, tweens the content's height between them, and the new face rises 8px. The border grows with it. It runs on the `domAnimation` features the app already loads, so there is no `domMax` download. Motion off: the swap is instant.
    - The exiting face is removed at once rather than faded out. Ruling 3 forbids fading text, and two faces overlapping in one cell would collide.
    - Cost if wrong: a later shared-element morph would add `domMax` then.

    Task 14 writes this into §3.B.

## Global Constraints

Every task's requirements include all of these.

- TypeScript strict, never `any`. Files under 500 lines, whether source, tests or scripts (the contract test enforces this). `journey.css` is 147 lines today. Journey-only CSS goes in a new `src/styles/journey-island.css`, so neither file nears the limit.
- **Anime.js is exactly `4.5.0`,** bundled from npm, with named imports only (`import { animate, stagger } from "animejs"`). No CDN, no `eval`, no workers. The traveller CSP in `next.config.ts` does not change.
- **The check never waits on journey code.** Nothing the plates import pulls in Anime.js or `src/components/landing/journey/start-journey.ts`. Only `JourneyLoader` imports the chunk, and only dynamically.
- **The server markup is the finished still page.** Every journey-only state, class or element is shown only under `html[data-journey="on"]`, and moving ones only under `html[data-motion="on"]` as well. Every module's teardown restores the server's markup exactly: classes, attributes, inline styles and text.
- **Text moves by transform only.** Decorative drawings may fade (ruling 3).
- **Motion off means still.** No entrance, intro, lean, flip, sweep, cursor or pin. True readings keep updating (ruling 12).
- **The Industry grammar:**
  - Tokens only: no raw 6-digit hex in `.ts`/`.tsx`.
  - No `text-[`, `rounded-[`, `tracking-[`, `shadow-[`, `duration-[` or `z-[` in `.tsx`.
  - Spacing on the scale steps.
  - HTML text takes `var(--text-*)`. SVG labels are sized in drawing units, with the `/* drawing units */` note.
- **Copy:** every string a traveller sees lives in `src/messages/en-IN/*`. New journey copy goes in `journey.ts`. Copy v3 showed stays verbatim, except where a ruling here says otherwise.
- **Accessibility:**
  - Decorative instruments are `aria-hidden`.
  - Real links and controls stay real and named.
  - Every new control answers a finger across 44px (`tap-44`).
  - Focus is never hidden under the masthead.
  - Sound starts only by the reader's hand.
- **One writer per DOM attribute:** React or the journey, never both (ruling 6).
- **Events:** their names come from `src/components/landing/journey/journey-events.ts`. `tt:motion` stays in `use-motion.ts`, and `tt:sound` in `use-sound.ts`.
- **TDD:** each behaviour starts with a test that fails for the stated reason.
- **The whole gate before every commit:** `npm run check`. Before the PR, also run `npx playwright test`. A subset is not the gate.
- **Playwright:**
  - Run it only in this worktree, on port 4210, in fixture mode.
  - Check port 4210 first (`lsof -nP -iTCP:4210 -sTCP:LISTEN` prints nothing), because Playwright reuses whatever server is there.
  - Never run against another folder's server or port 3100.
- **Git:**
  - Conventional commits with no `Co-Authored-By` trailer.
  - Never commit `.env*`, `settings.local.json` or `.superpowers/`.
  - Push, open the PR and merge only on the owner's word.

## Before you start

```bash
cd /Users/heytherevibin/Downloads/Code/Dev/trackandtrace-j3 && git log --oneline -1   # b29bb0b or later on feat/journey-j3-journey-island
ls node_modules/.bin/next                                                          # the APFS clone is in place
```

Read `AGENTS.md`. This Next.js differs from older versions; its guides are in `node_modules/next/dist/docs/`.

## File Structure

New, under `src/components/landing/journey/` unless a path is given:

| File | Responsibility |
|---|---|
| `journey-events.ts` | Event names and detail types shared by the plates, the loader and the island |
| `journey-mark.ts` | `JOURNEY_CHUNK_MARK`, a string found only in the journey chunk, so e2e can block it |
| `journey-loader.tsx` | Client. Idle import, 15 s watchdog, `data-journey="failed"`, teardown on unmount |
| `start-journey.ts` | The chunk's entry: `data-journey="on"`, builds the modules, rebuilds on `tt:motion` and `tt:rebuild`, and sends `tt:layout` on resize |
| `observers.ts` | The scroll-observer registry (`track`, `untrackAll`, `refreshAll`) and `watchEntrances` |
| `motion-tokens.ts` | Pure: `T`, `STAGGER`, `SMOOTH` and the ease curves (`parseCurve`) |
| `ease.ts` | Client: Anime.js easing functions from the live CSS tokens |
| `entrances.ts` | Pure: the entrance reducer (`entranceStep`) |
| `arrivals.ts` | Kickers flip, rows rise, registration marks snap. All replay |
| `intro.ts` | Once per visit: the plotter (masthead rule, hero plate and board outlines) and the headline's letters |
| `strip-position.ts` | Pure: station tops, strip place, odometer, lean |
| `strip.ts` | The strip's train, lean, odometer, current station, `aria-current`, `tt:station` |
| `board-status.ts` | Pure: DEPARTED / AT PLATFORM / NEXT |
| `board.ts` | The status column's values and flips, and the rows' replaying flip-in |
| `chart-countdown.ts` | Pure: the 24-hour face (`chartFace`, `dayTicks`, `istMinutes`) |
| `hero.ts` | The hero dial: lit segments, keystroke pulse, run sweep, the chart face, the needle, the intro reveal |
| `chapters-instrument.tsx` | Server: 02's dial, chapter arcs, demo layers and trace card |
| `chapters-progress.ts` | Pure: `chapterAt`, `typedDigits`, `barWidth`, `stepLit` |
| `fit.ts` | Pure: `fitsWindow` |
| `chapters.ts` | 02 pinned: fit check, scroll progress, stops, card, demo layers, rebuild on a fit flip |
| `berths.ts` | The berth plan draws itself, then lights the berth. Replays |
| `clock.ts` | The station clock's sweeping second hand while it is on screen |
| `route.ts` | The roadmap's line laid by scroll: dash, sleepers, the train on the curve, stops and rows passed |
| `cursor.ts` | The registration-mark cursor (fine pointer, Motion on) |
| `sound-pace.ts` | Pure: when a clack sounds, and how loud |
| `sound.ts` | Web Audio clack paced by scrolling; wakes only on the reader's gesture |
| `src/components/shell/use-sound.ts` | Client store: `tt.sound`, `tt:sound`, `chooseSound`, `useSound` |
| `src/components/shell/sound-toggle.tsx` | The footer's Sound switch, after Motion |
| `src/components/pnr/plate-morph.tsx` | The plate's morph between its entry and its result: a measured height tween, and the new face rising (ruling 13) |
| `src/styles/journey-island.css` | Every rule that applies only while the journey runs |
| `tests/e2e/journey/journey-helpers.ts` | `waitForJourney`, `blockJourneyChunk`, `scrollToId`, `transformOf`, `motionOff` |

Modified:
- `package.json` and `package-lock.json` (animejs);
- `src/app/globals.css` (imports `journey-island.css`);
- `src/app/(site)/page.tsx` (the loader, and the chapters trace);
- `route-strip.tsx`, `departure-board.tsx`, `hero-dial.tsx`, `station-clock.tsx`, `route-map.tsx`;
- `geometry/{dial,clock,route}.ts`;
- `src/components/landing/{hero,how-it-works,sheet-type,specimen-data}.tsx|ts`;
- `src/components/pnr/{pnr-terminal.tsx,pnr-terminal-state.ts}`;
- `src/components/shell/footer.tsx`;
- `src/messages/en-IN/journey.ts`, `src/styles/journey.css`;
- `tests/e2e/journey/{collisions.ts,collisions.spec.ts,instruments.spec.ts}`;
- `DESIGN.md` and the spec.

Tests mirror `src/`: `tests/unit/components/landing/journey/*.test.ts(x)` and `tests/e2e/journey/*.spec.ts`. Files named `*.test.ts` run in node, and `*.test.tsx` in jsdom.

---
### Task 1: Anime.js, the loader, and the journey's lifecycle

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `src/components/landing/journey/{journey-events.ts,journey-mark.ts,motion-tokens.ts,ease.ts,observers.ts,start-journey.ts,journey-loader.tsx}`
- Modify: `src/app/(site)/page.tsx`
- Create: `tests/unit/components/landing/journey/motion-tokens.test.ts`, `tests/unit/components/landing/journey/journey-loader.test.tsx`
- Create: `tests/e2e/journey/journey-helpers.ts`, `tests/e2e/journey/island.spec.ts`

**Interfaces:**
- Produces:
  - `journey-events.ts`:
    - the names `LAYOUT_EVENT = "tt:layout"`, `STATION_EVENT = "tt:station"`, `REBUILD_EVENT = "tt:rebuild"`, `PLATE_EVENT = "tt:plate"`, `RUN_EVENT = "tt:run"`, `RESULT_EVENT = "tt:result"`;
    - the detail types `StationDetail { index }`, `PlateDetail { hero; digits; running }`, `RunDetail { hero }`, `ResultDetail { hero; kind; chartAt }`;
    - `emit<T>(name, detail?)`.
  - `JOURNEY_CHUNK_MARK = "tt-journey-chunk"`.
  - `motion-tokens.ts`: `T`, `STAGGER`, `SMOOTH`, `CURVES`, `CurveToken`, `parseCurve(raw, token)`.
  - `ease.ts`: `ease.out() | .expo() | .in() | .inOut()`, each returning `EasingFunction`.
  - `observers.ts`: `track(o)`, `untrackAll()`, `refreshAll()`.
  - `start-journey.ts`:
    - `JourneyContext { motion: boolean }` (Task 3 adds `intro`);
    - `Teardown = () => void`;
    - `JourneyModule = (ctx: JourneyContext) => Teardown`;
    - `MODULES: readonly JourneyModule[]`, which later tasks append to;
    - `startJourney(): Teardown`.
  - `journey-loader.tsx`: `JourneyLoader({ load? })`, `WATCHDOG_MS = 15_000`, `IDLE_TIMEOUT_MS = 1_500`, `LoadJourney`.
  - `journey-helpers.ts`: `waitForJourney(page)`, `blockJourneyChunk(page)`, `scrollToId(page, id, offset?)`, `transformOf(locator)`, `motionOff(page)`.

- [ ] **Step 1: Add Anime.js, pinned**

```bash
cd /Users/heytherevibin/Downloads/Code/Dev/trackandtrace-j3 && npm install animejs@4.5.0 --save-exact
grep '"animejs"' package.json   # "animejs": "4.5.0"
```

- [ ] **Step 2: Write the failing token test**

`tests/unit/components/landing/journey/motion-tokens.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CURVES, STAGGER, T, parseCurve, type CurveToken } from "@/components/landing/journey/motion-tokens";

const tokens = readFileSync(join(process.cwd(), "src/styles/tokens.css"), "utf8");

describe("journey motion tokens", () => {
  it("keeps v3's ladder of durations and staggers", () => {
    expect(T).toEqual({ fast: 180, base: 420, slow: 760, draw: 1100 });
    expect(STAGGER).toEqual({ char: 16, row: 60, tick: 4, seg: 40, flap: 22 });
  });

  it("falls back to exactly the curves tokens.css defines", () => {
    for (const token of Object.keys(CURVES) as CurveToken[]) {
      const declared = new RegExp(`${token}:\\s*cubic-bezier\\(([^)]+)\\)`).exec(tokens)?.[1];
      expect(declared, token).toBeDefined();
      expect(declared!.split(",").map((n) => Number(n.trim()))).toEqual([...CURVES[token]]);
    }
  });

  it("reads a live cubic-bezier, and falls back when the property is empty or malformed", () => {
    expect(parseCurve(" cubic-bezier(0.1, 0.2, 0.3, 0.4)", "--ease-out")).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(parseCurve("", "--ease-out-expo")).toEqual([...CURVES["--ease-out-expo"]]);
    expect(parseCurve("cubic-bezier(1, nope, 2)", "--ease-in")).toEqual([...CURVES["--ease-in"]]);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run tests/unit/components/landing/journey/motion-tokens.test.ts`
Expected: FAIL with "Failed to resolve import "@/components/landing/journey/motion-tokens"".

- [ ] **Step 4: Write the tokens, the events and the mark**

`src/components/landing/journey/motion-tokens.ts`:
```ts
// The journey's timing, from prototype v3's tokens.js. Durations and staggers in ms. Eases are the app's own
// curves (tokens.css), read live by ease.ts; CURVES is only the fallback when a property is missing.

export const T = { fast: 180, base: 420, slow: 760, draw: 1100 } as const;
export const STAGGER = { char: 16, row: 60, tick: 4, seg: 40, flap: 22 } as const;
/** onScroll's sync for scroll-driven values: how far they trail the scroll (v3's "smooth"). */
export const SMOOTH = 0.55;

export type Curve = readonly [number, number, number, number];

export const CURVES = {
  "--ease-out": [0.25, 1, 0.5, 1],
  "--ease-out-expo": [0.16, 1, 0.3, 1],
  "--ease-in": [0.5, 0, 0.75, 0],
  "--ease-in-out": [0.76, 0, 0.24, 1],
} as const satisfies Record<string, Curve>;

export type CurveToken = keyof typeof CURVES;

/** The four numbers of a computed `cubic-bezier(…)`, or the token's fallback. */
export function parseCurve(raw: string, token: CurveToken): Curve {
  const nums = /cubic-bezier\(([^)]+)\)/.exec(raw)?.[1]?.split(",").map((n) => Number(n.trim()));
  if (nums && nums.length === 4 && nums.every(Number.isFinite)) return [nums[0]!, nums[1]!, nums[2]!, nums[3]!];
  return CURVES[token];
}
```

`src/components/landing/journey/journey-events.ts`:
```ts
// The landing journey's window events (spec 2026-09-24 §3.B). Names and details only, so the plates, the loader
// and the journey chunk share them without importing each other.

/** Something moved the page's layout (a morph, fonts, a resize): scroll-driven pieces re-measure. */
export const LAYOUT_EVENT = "tt:layout";
/** The strip reached another station. */
export const STATION_EVENT = "tt:station";
/** A piece's fit changed (chapters pinned ⇄ static): the whole journey rebuilds around it. */
export const REBUILD_EVENT = "tt:rebuild";
/** A check plate repainted: how many digits it holds, and whether it is running. */
export const PLATE_EVENT = "tt:plate";
/** A check plate started a request. */
export const RUN_EVENT = "tt:run";
/** A check plate shows a result: its kind, and the record's own chart time when the source sent one. */
export const RESULT_EVENT = "tt:result";

export interface StationDetail {
  readonly index: number;
}
export interface PlateDetail {
  readonly hero: boolean;
  readonly digits: number;
  readonly running: boolean;
}
export interface RunDetail {
  readonly hero: boolean;
}
export interface ResultDetail {
  readonly hero: boolean;
  readonly kind: string;
  readonly chartAt: string | null;
}

export function emit<T>(name: string, detail?: T): void {
  window.dispatchEvent(new CustomEvent<T | undefined>(name, { detail }));
}
```

`src/components/landing/journey/journey-mark.ts`:
```ts
/** A string only the journey chunk carries, so an e2e test can block that chunk and nothing else. */
export const JOURNEY_CHUNK_MARK = "tt-journey-chunk";
```

- [ ] **Step 5: Run the token test and watch it pass**

Run: `npx vitest run tests/unit/components/landing/journey/motion-tokens.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Write the failing loader test**

`tests/unit/components/landing/journey/journey-loader.test.tsx`:
```tsx
import { render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JourneyLoader, WATCHDOG_MS, type LoadJourney } from "@/components/landing/journey/journey-loader";

const html = () => document.documentElement;

describe("JourneyLoader", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    html().removeAttribute("data-journey");
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("imports the journey once the page is idle, starts it, and stops it on unmount", async () => {
    const stop = vi.fn();
    const startJourney = vi.fn(() => stop);
    const load: LoadJourney = vi.fn(async () => ({ startJourney }));
    const { unmount } = render(<JourneyLoader load={load} />);
    expect(load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(startJourney).toHaveBeenCalledTimes(1);
    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("marks the journey failed when its chunk cannot load", async () => {
    const load: LoadJourney = () => Promise.reject(new Error("blocked"));
    render(<JourneyLoader load={load} />);
    await vi.advanceTimersByTimeAsync(1);
    expect(html().getAttribute("data-journey")).toBe("failed");
  });

  it("gives up after the watchdog, and ignores a chunk that arrives too late", async () => {
    const startJourney = vi.fn(() => () => {});
    let arrive: (value: { startJourney: typeof startJourney }) => void = () => {};
    const late = new Promise<{ startJourney: typeof startJourney }>((resolve) => {
      arrive = resolve;
    });
    render(<JourneyLoader load={() => late} />);
    await vi.advanceTimersByTimeAsync(WATCHDOG_MS);
    expect(html().getAttribute("data-journey")).toBe("failed");
    arrive({ startJourney });
    await vi.advanceTimersByTimeAsync(1);
    expect(startJourney).not.toHaveBeenCalled();
  });

  it("marks the journey failed when starting it throws", async () => {
    const load: LoadJourney = async () => ({
      startJourney: () => {
        throw new Error("boom");
      },
    });
    render(<JourneyLoader load={load} />);
    await vi.advanceTimersByTimeAsync(1);
    expect(html().getAttribute("data-journey")).toBe("failed");
  });

  it("survives Strict Mode's double mount with one live journey", async () => {
    const stops: Array<ReturnType<typeof vi.fn>> = [];
    const startJourney = vi.fn(() => {
      const stop = vi.fn();
      stops.push(stop);
      return stop;
    });
    render(
      <StrictMode>
        <JourneyLoader load={async () => ({ startJourney })} />
      </StrictMode>,
    );
    await vi.advanceTimersByTimeAsync(1);
    const live = startJourney.mock.calls.length - stops.filter((s) => s.mock.calls.length > 0).length;
    expect(live).toBe(1);
  });
});
```

- [ ] **Step 7: Run it and watch it fail**

Run: `npx vitest run tests/unit/components/landing/journey/journey-loader.test.tsx`
Expected: FAIL with "Failed to resolve import "@/components/landing/journey/journey-loader"".

- [ ] **Step 8: Write the registry, the eases, the entry and the loader**

`src/components/landing/journey/observers.ts`:
```ts
import type { ScrollObserver } from "animejs";

// Every scroll observer the journey creates, so a layout change refreshes them all in one frame and a rebuild
// starts from none (v3's observers.js, as a module singleton instead of a window global).

const live = new Set<ScrollObserver>();
let queued = 0;

export function track<O extends ScrollObserver>(observer: O): O {
  live.add(observer);
  return observer;
}

export function untrackAll(): void {
  live.clear();
}

export function refreshAll(): void {
  if (queued) return;
  queued = requestAnimationFrame(() => {
    queued = 0;
    for (const o of live) {
      if (o.reverted) live.delete(o);
      else o.refresh();
    }
  });
}
```

`src/components/landing/journey/ease.ts`:
```ts
import { cubicBezier, type EasingFunction } from "animejs";
import { parseCurve, type CurveToken } from "./motion-tokens";

// Anime.js eases made from the app's own curve tokens, read once from the live CSS, so the journey eases
// exactly as the rest of the app does.

const made = new Map<CurveToken, EasingFunction>();

function curve(token: CurveToken): EasingFunction {
  const cached = made.get(token);
  if (cached) return cached;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token);
  const fn = cubicBezier(...parseCurve(raw, token));
  made.set(token, fn);
  return fn;
}

export const ease = {
  /** Things settling into place. */
  out: () => curve("--ease-out"),
  /** Emphatic arrivals: letters, flaps, marks. */
  expo: () => curve("--ease-out-expo"),
  /** Departures. */
  in: () => curve("--ease-in"),
  /** Drawings and sweeps that go and come back. */
  inOut: () => curve("--ease-in-out"),
};
```

`src/components/landing/journey/start-journey.ts`:
```ts
import { MOTION_EVENT } from "@/components/motion/use-motion";
import { LAYOUT_EVENT, REBUILD_EVENT } from "./journey-events";
import { JOURNEY_CHUNK_MARK } from "./journey-mark";
import { refreshAll, untrackAll } from "./observers";

// The journey chunk's entry (spec §3.B). JourneyLoader imports this file after hydration, when the page is
// idle, and calls startJourney(). It marks <html data-journey="on"> and starts every module on the server's
// markup; each returns a teardown that puts the markup back. The Motion switch and a fit change rebuild them
// all, idempotently; leaving "/" stops them.

export { JOURNEY_CHUNK_MARK };

export interface JourneyContext {
  /** Motion on: things may move. Off: only true readings update, drawn still. */
  readonly motion: boolean;
}
export type Teardown = () => void;
export type JourneyModule = (ctx: JourneyContext) => Teardown;

/** In start order. Later tasks append their modules here. */
export const MODULES: readonly JourneyModule[] = [];

export function startJourney(): Teardown {
  const html = document.documentElement;
  let teardowns: Teardown[] = [];
  let resizeTimer = 0;

  const stopAll = () => {
    for (const t of teardowns.reverse()) t();
    teardowns = [];
    untrackAll();
  };
  const build = () => {
    stopAll();
    const ctx: JourneyContext = { motion: html.getAttribute("data-motion") !== "off" };
    try {
      for (const start of MODULES) teardowns.push(start(ctx));
    } catch (error) {
      stopAll();
      html.setAttribute("data-journey", "failed");
      throw error;
    }
    requestAnimationFrame(() => window.dispatchEvent(new Event(LAYOUT_EVENT)));
  };
  const rebuild = () => {
    if (html.getAttribute("data-journey") !== "on") return;
    try {
      build();
    } catch (error) {
      console.error(error);
    }
  };
  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => window.dispatchEvent(new Event(LAYOUT_EVENT)), 150);
  };

  html.setAttribute("data-journey", "on");
  build();
  window.addEventListener(MOTION_EVENT, rebuild);
  window.addEventListener(REBUILD_EVENT, rebuild);
  window.addEventListener("resize", onResize);
  window.addEventListener(LAYOUT_EVENT, refreshAll);
  return () => {
    window.removeEventListener(MOTION_EVENT, rebuild);
    window.removeEventListener(REBUILD_EVENT, rebuild);
    window.removeEventListener("resize", onResize);
    window.removeEventListener(LAYOUT_EVENT, refreshAll);
    window.clearTimeout(resizeTimer);
    stopAll();
    if (html.getAttribute("data-journey") === "on") html.removeAttribute("data-journey");
  };
}
```

`src/components/landing/journey/journey-loader.tsx`:
```tsx
"use client";

import { useEffect } from "react";

/** How long the page waits for the journey before it stays still for good (spec §3.B). */
export const WATCHDOG_MS = 15_000;
/** The longest the import waits for the browser to be idle. */
export const IDLE_TIMEOUT_MS = 1_500;

export type LoadJourney = () => Promise<{ readonly startJourney: () => () => void }>;

const loadJourney: LoadJourney = () => import("./start-journey");

function whenIdle(run: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, 1);
  return () => window.clearTimeout(id);
}

/**
 * Starts the landing's journey once the page is idle, so the check never waits on it. If the chunk fails, throws,
 * or has not started after WATCHDOG_MS, <html data-journey="failed"> keeps the page as the server drew it: still,
 * static, whole. It never touches the reader's Motion choice.
 */
export function JourneyLoader({ load = loadJourney }: { readonly load?: LoadJourney }) {
  useEffect(() => {
    const html = document.documentElement;
    let stop: (() => void) | null = null;
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      html.setAttribute("data-journey", "failed");
    };
    const watchdog = window.setTimeout(fail, WATCHDOG_MS);
    const cancelIdle = whenIdle(() => {
      load().then(({ startJourney }) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(watchdog);
        try {
          stop = startJourney();
        } catch {
          html.setAttribute("data-journey", "failed");
        }
      }, fail);
    });
    return () => {
      settled = true;
      cancelIdle();
      window.clearTimeout(watchdog);
      stop?.();
      stop = null;
      if (html.getAttribute("data-journey") === "failed") html.removeAttribute("data-journey");
    };
  }, [load]);
  return null;
}
```

In `src/app/(site)/page.tsx`, import `JourneyLoader` from `@/components/landing/journey/journey-loader` and render `<JourneyLoader />` as the last child of the `<div id="top" className="page-frame">`.

- [ ] **Step 9: Run the unit tests and watch them pass**

Run: `npx vitest run tests/unit/components/landing/journey/`
Expected: PASS. The loader file has 5 tests, and J2's tests are unchanged.

- [ ] **Step 10: Write the e2e helpers and the failing island spec**

`tests/e2e/journey/journey-helpers.ts`:
```ts
import { expect, type Locator, type Page } from "@playwright/test";
import { JOURNEY_CHUNK_MARK } from "@/components/landing/journey/journey-mark";

/** The journey marks <html data-journey="on"> once it has taken the page over. */
export async function waitForJourney(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("data-journey", "on", { timeout: 15_000 });
}

/** Aborts the one script chunk that carries the journey, found by its content, so its hashed name never matters. */
export async function blockJourneyChunk(page: Page): Promise<void> {
  await page.route("**/_next/static/**/*.js", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (body.includes(JOURNEY_CHUNK_MARK)) return route.abort();
    return route.fulfill({ response, body });
  });
}

/** Scrolls instantly so a section's top sits `offset` px below the window's top. */
export async function scrollToId(page: Page, id: string, offset = 0): Promise<void> {
  await page.evaluate(
    ([target, by]) => {
      const el = document.getElementById(target);
      if (!el) throw new Error(`#${target} is missing`);
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - by, behavior: "instant" });
    },
    [id, offset] as const,
  );
}

/** An element's computed transform, with the identity written as "none" whichever way the browser spells it. */
export async function transformOf(locator: Locator): Promise<string> {
  const t = await locator.evaluate((el) => getComputedStyle(el).transform);
  return t === "matrix(1, 0, 0, 1, 0, 0)" ? "none" : t;
}

/** Motion off, as the footer switch stores it, before the page's first script. */
export async function motionOff(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.setItem("tt.motion", "off"));
}
```

`tests/e2e/journey/island.spec.ts`:
```ts
import { expect, test } from "@playwright/test";
import { PNR } from "../helpers";
import { blockJourneyChunk, waitForJourney } from "./journey-helpers";

test.describe("the journey island", () => {
  test("starts once the page is idle", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
  });

  test("a blocked journey chunk leaves the page still, and the check still works", async ({ page }) => {
    await blockJourneyChunk(page);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-journey", "failed", { timeout: 15_000 });
    const plate = page.getByTestId("hero-instrument");
    await plate.getByRole("textbox").fill(PNR.cnf);
    await plate.getByRole("button", { name: /run/i }).click();
    await expect(page.getByTestId("terminal-result")).toBeVisible();
  });

  test("never starts on other pages", async ({ page }) => {
    await page.goto("/accuracy");
    await page.waitForTimeout(2_000);
    await expect(page.locator("html")).not.toHaveAttribute("data-journey", /.+/);
  });
});
```
Check that `PNR` and a textbox-by-role match `tests/e2e/helpers.ts` and the plate's input (`aria-label` from `messages.check.label`). If the plate's input is found another way in `home.spec.ts`, copy that locator exactly.

- [ ] **Step 11: Run the island spec**

Run: `lsof -nP -iTCP:4210 -sTCP:LISTEN; npx playwright test tests/e2e/journey/island.spec.ts --project=desktop`
Expected:
- Before Step 8's `page.tsx` change, the first test fails.
- After the change, all three pass.
- If the block test never sees `failed`, print the chunk URLs (`page.on("request")`) and confirm that the chunk's text holds `tt-journey-chunk`. Turbopack's dev chunks carry module source. Report it if they do not.

- [ ] **Step 12: The whole gate, then commit**

```bash
npm run check && npx playwright test tests/e2e/journey/ tests/e2e/csp.spec.ts tests/e2e/home.spec.ts
git add package.json package-lock.json src/components/landing/journey src/app/\(site\)/page.tsx tests/unit/components/landing/journey tests/e2e/journey
git commit -m "feat(journey): load the journey when the page is idle, and keep the page still if it never starts"
```

### Task 2: Entrances that replay

**Files:**
- Create: `src/components/landing/journey/{entrances.ts,arrivals.ts}`, `src/styles/journey-island.css`
- Modify: `src/components/landing/journey/{observers.ts,start-journey.ts}`, `src/components/landing/sheet-type.tsx`, `src/app/globals.css`
- Create: `tests/unit/components/landing/journey/entrances.test.ts`, `tests/unit/components/landing/sheet-type.test.tsx`, `tests/e2e/journey/entrances.spec.ts`

**Interfaces:**
- Consumes: `JourneyContext`, `Teardown`, `MODULES` (Task 1); `T`, `STAGGER`, `ease`; `LAYOUT_EVENT`.
- Produces:
  - `entrances.ts`:
    - `EntrancePhase = "rest" | "armed"`;
    - `EntranceBox { top; bottom }`;
    - `EntranceStep = "arm" | "play" | null`;
    - `entranceStep(phase, box, viewportHeight, at): EntranceStep`.
  - `observers.ts`: `Entrance { trigger; at; arm(); play(); settle() }` and `watchEntrances(list): Teardown`.
  - `arrivals.ts`: `startArrivals: JourneyModule`.
  - `SectionKicker`'s span carries `data-flap`.

Spec §3.A says each entrance resets out of sight once its section has fully left the window, and plays again when it returns; nothing moves while a reader can see it. The reducer encodes that from live boxes:
- **Rest** (the server's still state) becomes **armed** only when the trigger is wholly outside the window.
- **Armed** plays when the trigger enters the band (top above `at` of the window, bottom below `1 − at`), from either direction.
- A trigger in view when the journey starts stays at rest, so nothing flickers at load.
- A jump lands a trigger in the band, so it plays at once. A jump past it leaves it armed and out of sight, which is harmless.

- [ ] **Step 1: Write the failing reducer test**

`tests/unit/components/landing/journey/entrances.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { entranceStep } from "@/components/landing/journey/entrances";

const VH = 800;
const box = (top: number, height = 400) => ({ top, bottom: top + height });

describe("entranceStep", () => {
  it("leaves a trigger at rest while any of it is in the window", () => {
    expect(entranceStep("rest", box(100), VH, 0.88)).toBeNull();
    expect(entranceStep("rest", box(-399), VH, 0.88)).toBeNull();
    expect(entranceStep("rest", box(799), VH, 0.88)).toBeNull();
  });

  it("arms a trigger only once it has wholly left the window, above or below", () => {
    expect(entranceStep("rest", box(-400), VH, 0.88)).toBe("arm");
    expect(entranceStep("rest", box(800), VH, 0.88)).toBe("arm");
  });

  it("plays an armed trigger when it comes into the band from below", () => {
    expect(entranceStep("armed", box(720), VH, 0.88)).toBeNull();
    expect(entranceStep("armed", box(700), VH, 0.88)).toBe("play");
  });

  it("plays an armed trigger when it comes back from above", () => {
    expect(entranceStep("armed", box(-330), VH, 0.88)).toBeNull();
    expect(entranceStep("armed", box(-300), VH, 0.88)).toBe("play");
  });

  it("keeps an armed trigger armed while it is still out of sight", () => {
    expect(entranceStep("armed", box(-2000), VH, 0.88)).toBeNull();
    expect(entranceStep("armed", box(3000), VH, 0.88)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/components/landing/journey/entrances.test.ts`
Expected: FAIL with "Failed to resolve import "@/components/landing/journey/entrances"".

- [ ] **Step 3: Write the reducer**

`src/components/landing/journey/entrances.ts`:
```ts
// Section entrances that replay (spec §3.A, decided 2026-09-25), decided from the trigger's live box on every
// check, so a jump or a reload never strands anything: rest (the server's still state) → armed only once the
// trigger has wholly left the window → played when it comes back into the band, from either side.

export type EntrancePhase = "rest" | "armed";
export type EntranceStep = "arm" | "play" | null;

export interface EntranceBox {
  readonly top: number;
  readonly bottom: number;
}

export function entranceStep(phase: EntrancePhase, box: EntranceBox, viewportHeight: number, at: number): EntranceStep {
  if (phase === "rest") return box.bottom <= 0 || box.top >= viewportHeight ? "arm" : null;
  return box.top < viewportHeight * at && box.bottom > viewportHeight * (1 - at) ? "play" : null;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/unit/components/landing/journey/entrances.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the failing kicker test**

`tests/unit/components/landing/sheet-type.test.tsx`:
```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectionKicker } from "@/components/landing/sheet-type";

describe("SectionKicker", () => {
  it("marks its words as a flap the journey may turn, keeping them plain text", () => {
    const { container } = render(<SectionKicker rule="mb-6">01 · Operating principles</SectionKicker>);
    const kicker = container.querySelector("[data-flap]");
    expect(kicker?.textContent).toBe("01 · Operating principles");
    expect(kicker?.children).toHaveLength(0);
  });
});
```

Run: `npx vitest run tests/unit/components/landing/sheet-type.test.tsx`
Expected: FAIL (`kicker` is null).

- [ ] **Step 6: Mark the kicker, and write the runner and the arrivals**

In `src/components/landing/sheet-type.tsx`, `SectionKicker`'s span becomes:
```tsx
      <span data-flap="" className={`mb-3 ${KICKER}`}>
        {children}
      </span>
```

Append to `src/components/landing/journey/observers.ts`. Add the two imports at the top of the file, with the others.
```ts
import { LAYOUT_EVENT } from "./journey-events";
import { entranceStep, type EntrancePhase } from "./entrances";

/** One replaying entrance: its trigger's box decides; arm puts the start state on, play animates to rest,
 * settle puts the server's state back (on teardown). */
export interface Entrance {
  readonly trigger: Element;
  readonly at: number;
  arm(): void;
  play(): void;
  settle(): void;
}

/** Checks every entrance against its trigger's live box on scroll and layout, one frame at a time. */
export function watchEntrances(entrances: readonly Entrance[]): () => void {
  const phases = new Map<Entrance, EntrancePhase>(entrances.map((e) => [e, "rest"]));
  let frame = 0;
  const check = () => {
    frame = 0;
    const vh = window.innerHeight;
    for (const e of entrances) {
      const step = entranceStep(phases.get(e) ?? "rest", e.trigger.getBoundingClientRect(), vh, e.at);
      if (step === "arm") {
        e.arm();
        phases.set(e, "armed");
      } else if (step === "play") {
        e.play();
        phases.set(e, "rest");
      }
    }
  };
  const queue = () => {
    if (!frame) frame = requestAnimationFrame(check);
  };
  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener(LAYOUT_EVENT, queue);
  check();
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("scroll", queue);
    window.removeEventListener(LAYOUT_EVENT, queue);
    for (const e of entrances) e.settle();
  };
}
```

`src/components/landing/journey/arrivals.ts`:
```ts
import { animate, splitText, stagger, utils, type TextSplitter } from "animejs";
import { ease } from "./ease";
import { STAGGER, T } from "./motion-tokens";
import { watchEntrances, type Entrance } from "./observers";
import type { JourneyContext, Teardown } from "./start-journey";

// Section entrances (spec §3.A), replaying: kickers flip in, rows rise, registration marks snap onto plates.
// Text moves by transform only; the marks are drawing and may fade. Motion off: none of it.

const ROWS: readonly (readonly [targets: string, section: string])[] = [
  ["#principles [role=row]", "#principles"],
  ["#record .blueprint, #record .berth-plan", "#record"],
  ["#reliability dl > div, #reliability .station-clock", "#reliability"],
  ["#roadmap li", "#roadmap"],
  ["#features article", "#features"],
  ["#faq details", "#faq"],
];

type Styled = HTMLElement | SVGElement;

/** Stops any tween on these elements and hands their transform and opacity back to the stylesheet. */
function release(els: readonly Styled[]): void {
  if (els.length) utils.remove(els as Styled[]);
  for (const el of els) {
    el.style.removeProperty("transform");
    el.style.removeProperty("opacity");
  }
}

function all<E extends Element>(selector: string, root: ParentNode = document): E[] {
  return [...root.querySelectorAll<E>(selector)];
}

function kickers(): Entrance[] {
  return all<HTMLElement>("main [data-flap]").map((kicker) => {
    let split: TextSplitter | null = null;
    const unsplit = () => {
      split?.revert();
      split = null;
    };
    return {
      trigger: kicker.closest("section") ?? kicker,
      at: 0.88,
      arm: () => {
        unsplit();
        split = splitText(kicker, { chars: true });
        utils.set(split.chars, { rotateX: -80 });
      },
      play: () => {
        const own = split;
        if (!own) return;
        animate(own.chars, {
          rotateX: [-80, 0],
          delay: stagger(STAGGER.char),
          duration: T.base,
          ease: ease.expo(),
          // Never revert inside a completion: Anime.js is still finishing it.
          onComplete: () => window.setTimeout(() => split === own && unsplit(), 0),
        });
      },
      settle: unsplit,
    };
  });
}

function rows(): Entrance[] {
  return ROWS.flatMap(([selector, section]) => {
    const trigger = document.querySelector(section);
    const targets = all<HTMLElement>(selector);
    if (!trigger || !targets.length) return [];
    return [
      {
        trigger,
        at: 0.88,
        arm: () => {
          release(targets);
          utils.set(targets, { translateY: 16 });
        },
        play: () => {
          animate(targets, { translateY: [16, 0], delay: stagger(STAGGER.row), duration: T.slow, ease: ease.expo(), onComplete: () => release(targets) });
        },
        settle: () => release(targets),
      },
    ];
  });
}

function marks(): Entrance[] {
  return all<HTMLElement>("main .blueprint").flatMap((plate) => {
    const corners = all<HTMLElement>(":scope > .corner", plate);
    if (!corners.length) return [];
    return [
      {
        trigger: plate,
        at: 0.92,
        arm: () => {
          release(corners);
          utils.set(corners, { scale: 2.2, opacity: 0 });
        },
        play: () => {
          animate(corners, { scale: [2.2, 1], opacity: [0, 1], delay: stagger(STAGGER.row), duration: T.base, ease: ease.expo(), onComplete: () => release(corners) });
        },
        settle: () => release(corners),
      },
    ];
  });
}

export function startArrivals({ motion }: JourneyContext): Teardown {
  if (!motion) return () => {};
  return watchEntrances([...kickers(), ...rows(), ...marks()]);
}
```

In `start-journey.ts`, import `startArrivals` from `./arrivals` and set `export const MODULES: readonly JourneyModule[] = [startArrivals];`.

`src/styles/journey-island.css` (new):
```css
/* The landing journey while it runs (spec 2026-09-24 §3.B): every rule here applies only under
   html[data-journey="on"], so a page whose journey never starts is the still page journey.css draws. */

/* ---- Entrances: a kicker's characters turn on their own axis, so each is its own box */
html[data-journey="on"] [data-flap] :is(span) { display: inline-block; transform-origin: 50% 55%; backface-visibility: hidden; }
```
In `src/app/globals.css`, add `@import "../styles/journey-island.css";` on the line after the `journey.css` import.

- [ ] **Step 7: Run the unit tests**

Run: `npx vitest run tests/unit/components/landing/`
Expected: PASS.

- [ ] **Step 8: Write the failing e2e**

`tests/e2e/journey/entrances.spec.ts`:
```ts
import { expect, test, type Page } from "@playwright/test";
import { motionOff, scrollToId, transformOf, waitForJourney } from "./journey-helpers";

const firstRow = (page: Page) => page.locator("#principles [role=row]").first();

test.describe("section entrances", () => {
  test.skip(({ isMobile }) => isMobile, "one viewport is enough for the mechanism; collisions cover phones");

  test("every row group the journey names exists", async ({ page }) => {
    await page.goto("/");
    for (const sel of ["#principles [role=row]", "#record .blueprint", "#reliability dl > div", "#roadmap li", "#features article", "#faq details"]) {
      await expect(page.locator(sel).first(), sel).toBeAttached();
    }
  });

  test("a row seen at rest arms out of sight and rises again when it comes back", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "principles", 120);
    await expect.poll(() => transformOf(firstRow(page))).toBe("none");
    await scrollToId(page, "terminus");
    await expect.poll(() => transformOf(firstRow(page))).toBe("matrix(1, 0, 0, 1, 0, 16)");
    await scrollToId(page, "principles", 120);
    await expect.poll(() => transformOf(firstRow(page)), { timeout: 3_000 }).toBe("none");
  });

  test("a jump straight to a section never strands its rows", async ({ page }) => {
    await page.goto("/#faq");
    await waitForJourney(page);
    await expect.poll(() => transformOf(page.locator("#faq details").first()), { timeout: 3_000 }).toBe("none");
  });

  test("a kicker's words are whole again after it flips", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "terminus");
    await scrollToId(page, "principles", 120);
    const kicker = page.locator("#principles [data-flap]");
    await expect.poll(() => kicker.evaluate((el) => el.children.length), { timeout: 3_000 }).toBe(0);
    await expect(kicker).toHaveText(/Operating principles/i);
  });

  test("Motion off: nothing is ever offset", async ({ page }) => {
    await motionOff(page);
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "terminus");
    await page.waitForTimeout(300);
    expect(await transformOf(firstRow(page))).toBe("none");
    await scrollToId(page, "principles", 120);
    expect(await transformOf(firstRow(page))).toBe("none");
  });
});
```
The kicker's copy is whatever `messages.home` gives 01. Read it from `src/messages/en-IN/home.ts`, and match it with the regex above.

Run: `npx playwright test tests/e2e/journey/entrances.spec.ts --project=desktop`
Expected: before Step 6's `MODULES` change, the replay tests fail (the transform stays `none` out of sight); after it, all pass.

- [ ] **Step 9: The whole gate, then commit**

```bash
npm run check && npx playwright test tests/e2e/journey/ tests/e2e/home.spec.ts tests/e2e/press.spec.ts tests/e2e/axe.spec.ts
git add src/components/landing src/styles/journey-island.css src/app/globals.css tests/unit/components/landing tests/e2e/journey
git commit -m "feat(journey): section entrances that replay whenever their section comes back into view"
```

### Task 3: The intro: the headline's letters and the plotter, once

**Files:**
- Create: `src/components/landing/journey/intro.ts`, `tests/e2e/journey/intro.spec.ts`
- Modify: `src/components/landing/journey/start-journey.ts`, `src/styles/journey-island.css`

**Interfaces:**
- Consumes: `T`, `STAGGER`, `ease` (Task 1).
- Produces:
  - `INTRO_KEY = "tt.intro"`;
  - `introWanted(motion: boolean): boolean`;
  - `startIntro(): Teardown`;
  - `JourneyContext` gains `readonly intro: boolean`, true only in the build that plays the intro. Task 6's hero dial reveals itself with it.

Spec §3.A says the headline's letters play once per load, and the plotter once per visit. v3 plays both together, once per tab session (`sessionStorage["tt.intro"]`), only when:
- Motion is on;
- the reader starts within 40px of the top;
- and no rebuild has already played it on this load.

Keep v3's rule for both, since one session gate satisfies "once per visit" and never replays within a load. The letters rise by transform only (ruling 3). The text stays the server's `<h1>`: the split is reverted as soon as the letters land.

- [ ] **Step 1: Write the failing e2e**

`tests/e2e/journey/intro.spec.ts`:
```ts
import { expect, test, type Page } from "@playwright/test";
import { motionOff, waitForJourney } from "./journey-helpers";

/** Counts every plotter outline and masthead rule the page ever inserts, from the first script on. */
async function countPlotting(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __plots: number };
    w.__plots = 0;
    new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) if (n instanceof Element && n.matches(".intro-outline, .intro-rule")) w.__plots += 1;
    }).observe(document, { childList: true, subtree: true });
  });
}
const plots = (page: Page) => page.evaluate(() => (window as unknown as { __plots: number }).__plots);

test.describe("the intro", () => {
  test("plays once on a first visit at the top, and leaves the headline whole", async ({ page }) => {
    await countPlotting(page);
    await page.goto("/");
    await waitForJourney(page);
    await expect.poll(() => plots(page)).toBeGreaterThan(0);
    await expect(page.locator(".intro-outline, .intro-rule")).toHaveCount(0, { timeout: 4_000 });
    const h1 = page.locator("#hero-title");
    await expect(h1).toHaveText(/Your PNR,\s*as the railway records it\./i);
    await expect(h1.locator(":scope > span")).toHaveCount(2);
    expect(await page.evaluate(() => sessionStorage.getItem("tt.intro"))).toBe("1");
  });

  test("does not play again on this visit", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await countPlotting(page);
    await page.reload();
    await waitForJourney(page);
    await page.waitForTimeout(800);
    expect(await plots(page)).toBe(0);
  });

  test("does not play for a reader who starts partway down, or with Motion off", async ({ page }) => {
    await countPlotting(page);
    await page.goto("/#record");
    await waitForJourney(page);
    await page.waitForTimeout(800);
    expect(await plots(page)).toBe(0);
  });

  test("Motion off: no intro", async ({ page }) => {
    await motionOff(page);
    await countPlotting(page);
    await page.goto("/");
    await waitForJourney(page);
    await page.waitForTimeout(800);
    expect(await plots(page)).toBe(0);
  });
});
```

Run: `npx playwright test tests/e2e/journey/intro.spec.ts --project=desktop`
Expected: FAIL. The first test's poll stays at 0, because nothing plots yet.

- [ ] **Step 2: Write the intro**

`src/components/landing/journey/intro.ts`:
```ts
import { animate, splitText, stagger, svg } from "animejs";
import { ease } from "./ease";
import { STAGGER, T } from "./motion-tokens";
import type { Teardown } from "./start-journey";

// Once per visit (spec §3.A): the plotter draws the masthead rule and the outlines of the hero plate and the
// board, their registration marks snap on, and the headline's letters rise. Every drawn overlay is removed and
// every split reverted when it lands, so the page is the server's again.

export const INTRO_KEY = "tt.intro";
const NS = "http://www.w3.org/2000/svg";

/** Motion on, the reader at the top, and not yet this visit. */
export function introWanted(motion: boolean): boolean {
  if (!motion || window.scrollY >= 40) return false;
  try {
    return window.sessionStorage.getItem(INTRO_KEY) !== "1";
  } catch {
    return true; // storage refused: the intro may replay next time, which is harmless
  }
}

function markSeen(): void {
  try {
    window.sessionStorage.setItem(INTRO_KEY, "1");
  } catch {
    // as above
  }
}

type Undo = () => void;

function plotRule(header: HTMLElement): Undo {
  const rule = document.createElement("span");
  rule.className = "intro-rule";
  rule.setAttribute("aria-hidden", "true");
  header.append(rule);
  header.classList.add("is-plotting");
  const undo = () => {
    header.classList.remove("is-plotting");
    rule.remove();
  };
  const a = animate(rule, { scaleX: [0, 1], duration: T.slow, ease: ease.expo(), onComplete: undo });
  return () => {
    a.revert();
    undo();
  };
}

function plotPlate(plate: HTMLElement, delay: number): Undo {
  const box = plate.getBoundingClientRect();
  const outline = document.createElementNS(NS, "svg");
  outline.setAttribute("class", "intro-outline");
  outline.setAttribute("aria-hidden", "true");
  outline.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
  const rect = document.createElementNS(NS, "rect");
  rect.setAttribute("x", "0.5");
  rect.setAttribute("y", "0.5");
  rect.setAttribute("width", String(Math.max(0, box.width - 1)));
  rect.setAttribute("height", String(Math.max(0, box.height - 1)));
  outline.append(rect);
  plate.append(outline);
  plate.classList.add("is-plotting");
  const undo = () => {
    plate.classList.remove("is-plotting");
    outline.remove();
  };
  const draw = animate(svg.createDrawable(rect), { draw: ["0 0", "0 1"], duration: T.draw, delay, ease: ease.inOut(), onComplete: undo });
  const corners = [...plate.querySelectorAll<HTMLElement>(":scope > .corner")];
  const snap = corners.length
    ? animate(corners, { scale: [2.2, 1], opacity: [0, 1], duration: T.base, delay: stagger(STAGGER.row, { start: delay + T.draw * 0.6 }), ease: ease.expo() })
    : null;
  return () => {
    draw.revert();
    snap?.revert();
    undo();
  };
}

function riseHeadline(h1: HTMLElement): Undo {
  const split = splitText(h1, { chars: true });
  let reverted = false;
  const unsplit = () => {
    if (reverted) return;
    reverted = true;
    split.revert();
  };
  const letters = animate(split.chars, {
    translateY: [14, 0],
    duration: T.slow,
    delay: stagger(STAGGER.char, { start: 100 }),
    ease: ease.expo(),
    onComplete: () => window.setTimeout(unsplit, 0),
  });
  const lead = h1.nextElementSibling;
  const tags = lead?.nextElementSibling ? [...lead.nextElementSibling.children] : [];
  const rest = [lead, ...tags].filter((el): el is Element => el !== null);
  const follow = rest.length ? animate(rest, { translateY: [8, 0], duration: T.slow, delay: stagger(STAGGER.row, { start: 420 }), ease: ease.expo() }) : null;
  return () => {
    letters.revert();
    follow?.revert();
    unsplit();
  };
}

export function startIntro(): Teardown {
  markSeen();
  const undo: Undo[] = [];
  const header = document.querySelector<HTMLElement>("header");
  if (header) undo.push(plotRule(header));
  const hero = document.querySelector<HTMLElement>('[data-testid="hero-instrument"]');
  if (hero) undo.push(plotPlate(hero, 120));
  const board = document.querySelector<HTMLElement>("#departures .board");
  if (board && board.getBoundingClientRect().top < window.innerHeight) undo.push(plotPlate(board, 320));
  const h1 = document.querySelector<HTMLElement>("#hero-title");
  if (h1) undo.push(riseHeadline(h1));
  return () => {
    for (const u of undo.reverse()) u();
  };
}
```

In `start-journey.ts`:
- Import `introWanted` and `startIntro` from `./intro`.
- Add `readonly intro: boolean;` to `JourneyContext`, with the doc comment "True only in the build that plays the once-per-visit intro."
- Add `let introPlayed = false;` beside `teardowns`.
- Make `build()`'s context and intro read:
```ts
    const motion = html.getAttribute("data-motion") !== "off";
    const intro = !introPlayed && introWanted(motion);
    introPlayed = true;
    const ctx: JourneyContext = { motion, intro };
    try {
      if (intro) teardowns.push(startIntro());
      for (const start of MODULES) teardowns.push(start(ctx));
```
`introPlayed` is set on the first build whether or not the intro plays. So switching Motion back on later never plays it: once per load (spec §3.A).

Append to `src/styles/journey-island.css`:
```css
/* ---- The intro's plotter: the masthead rule and the plates' outlines draw themselves once per visit */
html[data-journey="on"] header.is-plotting { border-bottom-color: transparent; }
html[data-journey="on"] .blueprint.is-plotting { border-color: transparent; }
.intro-rule { position: absolute; left: 0; right: 0; bottom: -1px; height: 1px; background: var(--line-strong); transform-origin: 0 50%; pointer-events: none; }
.intro-outline { position: absolute; inset: -1px; width: calc(100% + 2px); height: calc(100% + 2px); pointer-events: none; overflow: visible; }
.intro-outline rect { fill: none; stroke: var(--line); stroke-width: 1; vector-effect: non-scaling-stroke; }
html[data-journey="on"] #hero-title span span { display: inline-block; }
```
Check that the masthead `<header>` is positioned (it is sticky, so it is), and that the hero plate and the board carry `position: relative` or `.blueprint`, so the overlay sits on them.

- [ ] **Step 3: Run the intro spec, then the specs that read the hero**

Run: `npx playwright test tests/e2e/journey/intro.spec.ts tests/e2e/home.spec.ts tests/e2e/smoothness.spec.ts`
Expected: PASS on both projects. The home spec's exact h1 text and its in-viewport plate still hold.

- [ ] **Step 4: The whole gate, then commit**

```bash
npm run check && npx playwright test tests/e2e/journey/ tests/e2e/axe.spec.ts
git add src/components/landing/journey src/styles/journey-island.css tests/e2e/journey
git commit -m "feat(journey): the headline rises and the plotter draws the plates, once per visit"
```

### Task 4: The strip's train runs, and a hairline rail on phones

**Files:**
- Create: `src/components/landing/journey/{strip-position.ts,strip.ts}`
- Modify: `src/components/landing/journey/{route-strip.tsx,start-journey.ts}`, `src/messages/en-IN/journey.ts`, `src/styles/journey.css`, `src/styles/journey-island.css`
- Create: `tests/unit/components/landing/journey/strip-position.test.ts`, `tests/e2e/journey/strip.spec.ts`
- Modify: `tests/unit/components/landing/journey/route-strip.test.tsx`

**Interfaces:**
- Consumes: `STATIONS`, `kmFigure`, `stopName` (J2); `STATION_EVENT`, `StationDetail`, `LAYOUT_EVENT`.
- Produces:
  - `strip-position.ts`: `StripPlace { i; f }`, `stationTops(anchors, bias)`, `stripPlace(tops, y)`, `stripFraction(place, count)`, `odometer(place, kms)`, `leanStep(lean, velocity)`.
  - `strip.ts`: `startStrip: JourneyModule`, which dispatches `tt:station` `{ index }` whenever the station changes, and again on every `tt:layout`, so a module that starts later learns where the page is.
  - Messages: `journey.strip.km(figure)` → `"KM 212"`.

The spec's Masthead row: the train runs right as the page scrolls, leaning into speed; the odometer reads KM 000 → 781; the current station's name shows. Phones get a hairline rail in the masthead's bottom edge. Motion off: the glyph moves, with no lean. The journey shows all of it (ruling 7 for phones). Without the journey, J2's strip is unchanged.

- [ ] **Step 1: Write the failing position test**

`tests/unit/components/landing/journey/strip-position.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { leanStep, odometer, stationTops, stripFraction, stripPlace } from "@/components/landing/journey/strip-position";

describe("the strip's position", () => {
  it("starts at 0, sets each station a third of a window early, and always rises", () => {
    expect(stationTops([0, 900, 1800, 1700], 300)).toEqual([0, 600, 1500, 1501]);
  });

  it("finds the station and how far towards the next", () => {
    const tops = [0, 600, 1500];
    expect(stripPlace(tops, 0)).toEqual({ i: 0, f: 0 });
    expect(stripPlace(tops, 300)).toEqual({ i: 0, f: 0.5 });
    expect(stripPlace(tops, 600)).toEqual({ i: 1, f: 0 });
    expect(stripPlace(tops, 9_000)).toEqual({ i: 2, f: 0 });
  });

  it("maps a place to the strip's fraction and the odometer's kilometre", () => {
    expect(stripFraction({ i: 1, f: 0.5 }, 5)).toBe(0.375);
    expect(odometer({ i: 0, f: 0.5 }, [0, 64, 138])).toBe(32);
    expect(odometer({ i: 2, f: 0 }, [0, 64, 138])).toBe(138);
  });

  it("leans against the scroll, never past 10°, and comes back upright when it stops", () => {
    expect(leanStep(0, 100)).toBeCloseTo(-1.8);
    const hard = Array.from({ length: 60 }).reduce<number>((lean) => leanStep(lean, 400), 0);
    expect(hard).toBeGreaterThanOrEqual(-10);
    const settled = Array.from({ length: 120 }).reduce<number>((lean) => leanStep(lean, 0), -9);
    expect(settled).toBe(0);
  });
});
```

Run: `npx vitest run tests/unit/components/landing/journey/strip-position.test.ts`
Expected: FAIL (the module is missing).

- [ ] **Step 2: Write the position module**

`src/components/landing/journey/strip-position.ts`:
```ts
// Where the strip's train stands (prototype v3's strip.js), from the scroll and the stations' boxes. Pure.

export interface StripPlace {
  /** The station the page has reached. */
  readonly i: number;
  /** How far towards the next, 0–1. */
  readonly f: number;
}

/** Each station's top in page px, reached a third of a window early (`bias`); the first is 0, and each is
 * at least 1px past the last, so the table always rises. */
export function stationTops(anchors: readonly number[], bias: number): readonly number[] {
  return anchors.reduce<readonly number[]>((tops, anchor, k) => [...tops, k === 0 ? 0 : Math.max(anchor - bias, tops[k - 1]! + 1)], []);
}

export function stripPlace(tops: readonly number[], y: number): StripPlace {
  const last = tops.length - 1;
  const passed = tops.findLastIndex((top, k) => k <= last && y >= top);
  const i = Math.max(0, passed);
  if (i >= last) return { i: last, f: 0 };
  return { i, f: Math.min(1, Math.max(0, (y - tops[i]!) / (tops[i + 1]! - tops[i]!))) };
}

/** 0 at DEP, 1 at END. */
export function stripFraction({ i, f }: StripPlace, count: number): number {
  return (i + f) / (count - 1);
}

export function odometer({ i, f }: StripPlace, kms: readonly number[]): number {
  const here = kms[i]!;
  const next = kms[Math.min(i + 1, kms.length - 1)]!;
  return Math.round(here + (next - here) * f);
}

/** One frame of lean, in degrees: against the scroll (`velocity` px per frame), at most 10°, closing 18% of the
 * gap each frame, and exactly upright once it has settled. */
export function leanStep(lean: number, velocity: number): number {
  const target = Math.max(-10, Math.min(10, -velocity * 0.35));
  const next = lean + (target - lean) * 0.18;
  return velocity === 0 && Math.abs(next) < 0.05 ? 0 : next;
}
```
Check that `Array.prototype.findLastIndex` is in the project's `lib`. If typecheck refuses it, count down with a plain loop in a helper.

Run the test: PASS (4 tests).

- [ ] **Step 3: Update the J2 strip test to the J3 markup, and watch it fail**

In `tests/unit/components/landing/journey/route-strip.test.tsx`, replace the "no odometer, no station reading and no train yet" test with:
```tsx
  it("carries the odometer, the station reading and the trains for the journey to show, all hidden from assistive tech", () => {
    const { container } = render(<RouteStrip />);
    expect(container.querySelector(".strip-odo")).toHaveTextContent("KM 000");
    expect(container.querySelector(".strip-odo")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".strip-now")).toHaveTextContent("DEP · Platform 3 · Departures");
    expect(container.querySelector(".strip-now")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll(".strip-train")).toHaveLength(2);
    expect(container.querySelector(".phone-rail")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("#route-strip .phone-rail")).toBeNull();
  });
```
Run: `npx vitest run tests/unit/components/landing/journey/route-strip.test.tsx`
Expected: FAIL (`.strip-odo` is null).

- [ ] **Step 4: Write the markup, the copy and the styles**

In `src/messages/en-IN/journey.ts`, `strip` gains `km: (figure: string) => \`KM ${figure}\`,`.

`src/components/landing/journey/route-strip.tsx` becomes:
```tsx
import { messages } from "@/messages";
import { STATIONS, kmFigure, stopLeft, stopName } from "./stations";
import { TrainGlyph } from "./train-glyph";

function Train() {
  return (
    <span className="strip-train" aria-hidden="true">
      <span className="strip-glyph">
        <TrainGlyph />
      </span>
    </span>
  );
}

/**
 * The masthead's second row on the landing (from 48rem): the page's stations on a rail, each a named link to its
 * section. The odometer, the current station and the train are the journey's: they show only while it runs
 * (journey-island.css), because only then do they stay true as the page scrolls. Below 48rem the strip is a
 * hairline rail along the masthead's foot, carrying the train alone; it is its own aria-hidden element, so phones
 * never expose an empty navigation landmark.
 */
export function RouteStrip() {
  const m = messages.journey.strip;
  return (
    <>
      <nav id="route-strip" aria-label={m.label} className="route-strip">
        <div className="page-frame strip-row">
          <span className="strip-odo tnum" aria-hidden="true">
            {m.km(kmFigure(0))}
          </span>
          <div className="strip-track">
            <div className="strip-rail rail" aria-hidden="true" />
            <ol className="strip-stops">
              {STATIONS.map((station, i) => (
                <li key={station.id} style={{ left: stopLeft(i, STATIONS.length) }}>
                  <a href={`#${station.id}`} aria-label={stopName(station)} className="tap-44">
                    {station.code}
                  </a>
                </li>
              ))}
            </ol>
            <Train />
          </div>
          <span className="strip-now" aria-hidden="true">
            {stopName(STATIONS[0]!)}
          </span>
        </div>
      </nav>
      <div className="phone-rail" aria-hidden="true">
        <Train />
      </div>
    </>
  );
}
```
Read `top-nav.tsx` first: the strip prop must render as a child of the sticky `<header>`, so `.phone-rail` can sit on its foot. If it renders outside the header, wrap the prop's output in the header instead, and say so in the report.

In `src/styles/journey.css`, in the strip block, add the still defaults (hidden without the journey):
```css
.strip-odo, .strip-now, .strip-train, .phone-rail { display: none; }
.strip-odo, .strip-now {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--text-2xs);
  line-height: var(--text-2xs--line-height);
  letter-spacing: var(--tracking-caps);
  text-transform: uppercase;
  white-space: nowrap;
}
.strip-odo { color: var(--accent-text); font-variant-numeric: tabular-nums; min-width: 4.5em; }
.strip-now { color: var(--ink-3); max-width: 16rem; overflow: hidden; text-overflow: ellipsis; }
.strip-train { position: absolute; left: 0; top: 13px; width: 30px; height: 12px; transform: translateX(-50%); color: var(--accent); pointer-events: none; }
.strip-glyph { display: block; width: 100%; height: 100%; transform-origin: 50% 100%; }
.strip-glyph svg { display: block; width: 100%; height: 100%; }
```
Append to `src/styles/journey-island.css`:
```css
/* ---- The strip: the train runs, the odometer counts, and the current station reads (from 64rem, where the
   rail keeps room for every stop). Phones: a hairline rail in the masthead's foot, with the train alone. */
html[data-journey="on"] .strip-row { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; column-gap: 16px; }
html[data-journey="on"] :is(.strip-odo, .route-strip .strip-train) { display: block; }
@media (min-width: 64rem) {
  html[data-journey="on"] .strip-row { grid-template-columns: auto minmax(0, 1fr) auto; }
  html[data-journey="on"] .strip-now { display: block; }
}
@media (max-width: 47.99rem) {
  html[data-journey="on"] .phone-rail { display: block; position: absolute; left: 0; right: 0; bottom: -1px; height: 12px; pointer-events: none; }
  html[data-journey="on"] .phone-rail::before { content: ""; position: absolute; left: 0; right: 0; top: 5px; height: 1px; background: var(--line); }
  html[data-journey="on"] .phone-rail .strip-train { display: block; top: 1px; width: 22px; height: 9px; }
}
```

Run the route-strip test: PASS.

- [ ] **Step 5: Write the failing strip e2e**

`tests/e2e/journey/strip.spec.ts`:
```ts
import { expect, test } from "@playwright/test";
import { blockJourneyChunk, motionOff, scrollToId, waitForJourney } from "./journey-helpers";

const km = async (text: string | null) => Number(/KM (\d{3})/.exec(text ?? "")?.[1]);

test.describe("the route strip, moving", () => {
  test.describe("desktop", () => {
    test.skip(({ isMobile }) => isMobile, "the strip's row is for 48rem and up");

    test("follows the page: the current stop, the odometer, the train", async ({ page }) => {
      await page.goto("/");
      await waitForJourney(page);
      const strip = page.locator("#route-strip");
      await expect(strip.locator(".strip-odo")).toHaveText("KM 000");
      await expect(strip.getByRole("link", { name: /^DEP ·/ })).toHaveAttribute("aria-current", "location");
      await scrollToId(page, "record", 40);
      await expect(strip.getByRole("link", { name: /^03 ·/ })).toHaveAttribute("aria-current", "location");
      await expect(strip.getByRole("link", { name: /^DEP ·/ })).not.toHaveAttribute("aria-current", "location");
      await expect.poll(async () => km(await strip.locator(".strip-odo").textContent())).toBeGreaterThanOrEqual(212);
      const left = await strip.locator(".strip-train").evaluate((el) => parseFloat(el.style.left));
      expect(left).toBeGreaterThan(30);
      expect(left).toBeLessThan(45);
    });

    test("Motion off: the train still moves, but never leans", async ({ page }) => {
      await motionOff(page);
      await page.goto("/");
      await waitForJourney(page);
      await page.mouse.wheel(0, 2_400);
      const lean = await page.locator("#route-strip .strip-glyph").evaluate((el) => el.style.transform);
      expect(lean).toBe("");
      await expect.poll(() => page.locator("#route-strip .strip-train").evaluate((el) => parseFloat(el.style.left))).toBeGreaterThan(0);
    });

    test("without the journey, the strip is J2's: no odometer, no train", async ({ page }) => {
      await blockJourneyChunk(page);
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("data-journey", "failed", { timeout: 15_000 });
      await expect(page.locator("#route-strip .strip-odo")).toBeHidden();
      await expect(page.locator("#route-strip .strip-train")).toBeHidden();
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
  });
});
```
The 30–45% bound for `record`: stop 03 is index 3 of 10, which is 33.3%; the tops are biased a third of a window early. If the measured value falls just outside, print it and widen the bound to the stop indexes either side. Do not drop the check.

Run: `npx playwright test tests/e2e/journey/strip.spec.ts`
Expected: FAIL. The odometer and train are hidden, and `aria-current` is unset.

- [ ] **Step 6: Write the strip module**

`src/components/landing/journey/strip.ts`:
```ts
import { messages } from "@/messages";
import { LAYOUT_EVENT, STATION_EVENT, type StationDetail } from "./journey-events";
import type { JourneyContext, Teardown } from "./start-journey";
import { STATIONS, kmFigure, stopName } from "./stations";
import { leanStep, odometer, stationTops, stripFraction, stripPlace } from "./strip-position";

// The strip while the journey runs (spec §3.A, Masthead): the train runs right as the page scrolls and leans
// into speed; the odometer counts; the current stop is aria-current and named. Motion off: it moves, no lean.

const KMS = STATIONS.map((s) => s.km);

export function startStrip({ motion }: JourneyContext): Teardown {
  const nav = document.getElementById("route-strip");
  if (!nav) return () => {};
  const links = STATIONS.map((s) => nav.querySelector<HTMLAnchorElement>(`.strip-stops a[href="#${s.id}"]`));
  const odo = nav.querySelector<HTMLElement>(".strip-odo");
  const now = nav.querySelector<HTMLElement>(".strip-now");
  const trains = [...document.querySelectorAll<HTMLElement>(".strip-train")];
  const glyphs = [...document.querySelectorAll<HTMLElement>(".strip-glyph")];
  let tops: readonly number[] = [];
  let last = -1;
  let paintFrame = 0;
  let leanFrame = 0;
  let lean = 0;
  let lastY = window.scrollY;

  const measure = () => {
    const anchors = STATIONS.map((s) => {
      const el = document.getElementById(s.id);
      return el ? el.getBoundingClientRect().top + window.scrollY : 0;
    });
    tops = stationTops(anchors, window.innerHeight * 0.35);
  };
  const paint = (announce: boolean) => {
    paintFrame = 0;
    const place = stripPlace(tops, window.scrollY);
    const left = `${(stripFraction(place, STATIONS.length) * 100).toFixed(3)}%`;
    for (const t of trains) t.style.left = left;
    if (odo) odo.textContent = messages.journey.strip.km(kmFigure(odometer(place, KMS)));
    if (place.i === last && !announce) return;
    last = place.i;
    links.forEach((a, k) => (k === place.i ? a?.setAttribute("aria-current", "location") : a?.removeAttribute("aria-current")));
    if (now) now.textContent = stopName(STATIONS[place.i]!);
    window.dispatchEvent(new CustomEvent<StationDetail>(STATION_EVENT, { detail: { index: place.i } }));
  };
  const tick = () => {
    const y = window.scrollY;
    const v = y - lastY;
    lastY = y;
    lean = leanStep(lean, v);
    const skew = lean === 0 ? "" : `skewX(${lean.toFixed(2)}deg)`;
    for (const g of glyphs) g.style.transform = skew;
    leanFrame = lean !== 0 || v !== 0 ? requestAnimationFrame(tick) : 0;
  };
  const onScroll = () => {
    if (!paintFrame) paintFrame = requestAnimationFrame(() => paint(false));
    if (motion && !leanFrame) {
      lastY = window.scrollY;
      leanFrame = requestAnimationFrame(tick);
    }
  };
  const onLayout = () => {
    measure();
    paint(true);
  };

  measure();
  paint(true);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener(LAYOUT_EVENT, onLayout);
  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener(LAYOUT_EVENT, onLayout);
    cancelAnimationFrame(paintFrame);
    cancelAnimationFrame(leanFrame);
    for (const t of trains) t.style.removeProperty("left");
    for (const g of glyphs) g.style.removeProperty("transform");
    for (const a of links) a?.removeAttribute("aria-current");
    if (odo) odo.textContent = messages.journey.strip.km(kmFigure(0));
    if (now) now.textContent = stopName(STATIONS[0]!);
  };
}
```
`lastY` is reset when the lean loop starts. Without that, the first frame after a long still would read the whole jump as one frame's speed.

In `start-journey.ts`, `MODULES` becomes `[startArrivals, startStrip]`.

- [ ] **Step 7: Run the strip e2e, and J2's instruments spec**

Run: `npx playwright test tests/e2e/journey/strip.spec.ts tests/e2e/journey/instruments.spec.ts tests/e2e/tap-targets.spec.ts tests/e2e/responsive.spec.ts`
Expected: PASS on both projects.

- [ ] **Step 8: The whole gate, then commit**

```bash
npm run check && npx playwright test tests/e2e/journey/
git add src/components/landing/journey src/messages/en-IN/journey.ts src/styles tests/unit/components/landing/journey tests/e2e/journey
git commit -m "feat(journey): the strip's train runs and leans, with the odometer and the current station"
```

### Task 5: The board's status column, and its rows flipping in

**Files:**
- Create: `src/components/landing/journey/{board-status.ts,board.ts}`
- Modify: `src/components/landing/journey/{departure-board.tsx,start-journey.ts}`, `src/messages/en-IN/journey.ts`, `src/styles/journey.css`, `src/styles/journey-island.css`
- Create: `tests/unit/components/landing/journey/board-status.test.ts`, `tests/e2e/journey/board.spec.ts`
- Modify: `tests/unit/components/landing/journey/departure-board.test.tsx`. If J2 named it differently, find it with `ls tests/unit/components/landing/journey`.

**Interfaces:**
- Consumes: `STATION_EVENT` from the strip (Task 4), which fires again on every `tt:layout`; `watchEntrances` (Task 2).
- Produces:
  - `board-status.ts`: `BoardStatus = "departed" | "here" | "next" | ""` and `boardStatus(stop, station)`.
  - Messages: `journey.board.status = "Status"` and `journey.board.statuses = { departed: "Departed", here: "At platform", next: "Next" }`. The board's cells are uppercase by CSS, so they read as v3's DEPARTED / AT PLATFORM / NEXT, and a screen reader hears words.
  - Each `<tr>` carries `data-stop` (1 to 9) and a trailing `<td class="board-status">`.

Ruling 4: the column's values follow the scroll whether Motion is on or off. The flips, and the rows' replaying flip-in (spec §3.A), are motion.

- [ ] **Step 1: Write the failing status test**

`tests/unit/components/landing/journey/board-status.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { boardStatus } from "@/components/landing/journey/board-status";

describe("boardStatus", () => {
  it("departs every stop before the page's, holds the page's at the platform, and calls only the next one", () => {
    expect([1, 2, 3, 4, 5, 6].map((stop) => boardStatus(stop, 3))).toEqual(["departed", "departed", "here", "next", "", ""]);
  });

  it("at DEP, the first stop is next and nothing has departed", () => {
    expect([1, 2].map((stop) => boardStatus(stop, 0))).toEqual(["next", ""]);
  });
});
```
Run it: FAIL (the module is missing).

- [ ] **Step 2: Write it**

`src/components/landing/journey/board-status.ts`:
```ts
// The departure board's status column (v3's board.js): the page's own station is AT PLATFORM, those behind it
// DEPARTED, the one after it NEXT, the rest blank. `stop` is a row's station index (1 for 01); `station` the
// strip's current index (0 at DEP).

export type BoardStatus = "departed" | "here" | "next" | "";

export function boardStatus(stop: number, station: number): BoardStatus {
  if (stop < station) return "departed";
  if (stop === station) return "here";
  return stop === station + 1 ? "next" : "";
}
```
Run it: PASS.

- [ ] **Step 3: Add the column's markup test and watch it fail**

Add to the departure board's unit test:
```tsx
  it("carries a status column for the journey to fill, one row per stop", () => {
    const { container } = render(<DepartureBoard />);
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();
    const rows = container.querySelectorAll("tbody tr");
    expect([...rows].map((r) => r.getAttribute("data-stop"))).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    for (const row of rows) expect(row.querySelector("td.board-status")).toHaveTextContent("");
  });
```
The board renders an `IstClock`, a client component. If the existing test mocks it, keep the mock. Run it: FAIL (no Status header).

- [ ] **Step 4: Write the markup, the copy and the styles**

`journey.board` in `journey.ts` gains:
```ts
    status: "Status",
    statuses: { departed: "Departed", here: "At platform", next: "Next" },
```
In `departure-board.tsx`:
- Add `<th scope="col" className="board-status">{m.status}</th>` after the Km header.
- Map with the index: `STATIONS.slice(1).map((station, i) => (<tr key={station.id} data-stop={i + 1}>`.
- Close each row with `<td className="board-status" />`.
- Change the doc comment to "…the page's sections as departures. The status column is the journey's: it shows while the journey runs, and follows the scroll."

In `journey.css`, in the board block:
```css
.board-status { display: none; width: 9rem; color: var(--ink-3); white-space: nowrap; }
@media (max-width: 39.99rem) {
  .board-status { width: 6.75rem; }
}
```
Append to `journey-island.css`:
```css
/* ---- The board: the status column follows the scroll; the page's own row is at the platform */
html[data-journey="on"] .board-status { display: table-cell; }
html[data-journey="on"] .board-table tr.is-here td { background: var(--accent-wash); }
html[data-journey="on"] .board-table tr.is-here .board-status { color: var(--accent-text); }
html[data-journey="on"] .board-table tr.is-next .board-status { color: var(--ink-1); }
html[data-journey="on"] .board-table .flap-char { display: inline-block; transform-origin: 50% 55%; backface-visibility: hidden; }
```
Run the unit test: PASS.

- [ ] **Step 5: Write the failing board e2e**

`tests/e2e/journey/board.spec.ts`:
```ts
import { expect, test, type Page } from "@playwright/test";
import { motionOff, scrollToId, waitForJourney } from "./journey-helpers";

const statuses = (page: Page) => page.locator("#departures tbody td.board-status").allTextContents();

test.describe("the departure board's status", () => {
  test("follows the page", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.getByRole("columnheader", { name: "Status" })).toBeVisible();
    await expect.poll(() => statuses(page)).toEqual(["Next", "", "", "", "", "", "", "", ""]);
    await scrollToId(page, "record", 40);
    await expect.poll(() => statuses(page)).toEqual(["Departed", "Departed", "At platform", "Next", "", "", "", "", ""]);
  });

  test("is true with Motion off too", async ({ page }) => {
    await motionOff(page);
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "reliability", 40);
    await expect.poll(() => statuses(page)).toEqual(["Departed", "Departed", "Departed", "At platform", "Next", "", "", "", ""]);
  });

  test("its rows' words are whole again after they flip in", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "terminus");
    await scrollToId(page, "departures");
    await expect.poll(() => page.locator("#departures .flap-char").count(), { timeout: 3_000 }).toBe(0);
    await expect(page.locator("#departures .board-name a").first()).toHaveText("Operating principles");
  });
});
```
The status cells hold the copy's case. The uppercase is CSS, so `allTextContents` reads "Departed". Run it: FAIL (the column is hidden).

- [ ] **Step 6: Write the board module**

`src/components/landing/journey/board.ts`:
```ts
import { animate, stagger, utils } from "animejs";
import { messages } from "@/messages";
import { boardStatus, type BoardStatus } from "./board-status";
import { ease } from "./ease";
import { STATION_EVENT, type StationDetail } from "./journey-events";
import { STAGGER, T } from "./motion-tokens";
import { watchEntrances } from "./observers";
import type { JourneyContext, Teardown } from "./start-journey";

// The departure board while the journey runs (spec §3.A): the status column follows the strip's station, and
// changed statuses flip in; the rows' names and statuses flip in again whenever the board comes back into view.
// Flaps are characters on their own axis, turned by transform only, then written back as plain text.

const LABELS = messages.journey.board.statuses;

/** Writes text as one span per character, ready to turn; returns the spans. */
function flapChars(el: HTMLElement, text: string): HTMLElement[] {
  el.replaceChildren(
    ...[...text].map((c) => {
      const s = document.createElement("span");
      s.className = "flap-char";
      s.textContent = c === " " ? " " : c;
      return s;
    }),
  );
  return [...el.children] as HTMLElement[];
}

/** Turns the characters in; once they land, writes the plain text back, unless a newer status replaced them. */
function turn(chars: readonly HTMLElement[], el: HTMLElement, text: string, delay: ReturnType<typeof stagger>) {
  return animate(chars, {
    rotateX: [-90, 0],
    duration: T.base,
    delay,
    ease: ease.expo(),
    onComplete: () =>
      window.setTimeout(() => {
        if (el.querySelector(".flap-char") && el.textContent?.replace(/ /g, " ") === text) el.textContent = text;
      }, 0),
  });
}

export function startBoard({ motion }: JourneyContext): Teardown {
  const board = document.querySelector<HTMLElement>("#departures .board");
  if (!board) return () => {};
  const rows = [...board.querySelectorAll<HTMLTableRowElement>("tbody tr[data-stop]")];
  const cells = rows.map((row) => row.querySelector<HTMLElement>("td.board-status"));
  const names = rows.map((row) => row.querySelector<HTMLElement>(".board-name a"));
  const values = new Map<HTMLElement, BoardStatus>();
  let station = 0;

  const text = (status: BoardStatus) => (status ? LABELS[status] : "");
  const paint = (flip: boolean) => {
    rows.forEach((row, k) => {
      const cell = cells[k];
      if (!cell) return;
      const next = boardStatus(Number(row.dataset.stop), station);
      if (values.get(cell) === next) return;
      values.set(cell, next);
      row.classList.toggle("is-here", next === "here");
      row.classList.toggle("is-next", next === "next");
      if (flip && motion && next) turn(flapChars(cell, text(next)), cell, text(next), stagger(STAGGER.flap));
      else cell.textContent = text(next);
    });
  };
  const onStation = (event: Event) => {
    station = (event as CustomEvent<StationDetail>).detail.index;
    paint(true);
  };
  window.addEventListener(STATION_EVENT, onStation);
  paint(false);

  const settleWords = () => {
    names.forEach((a) => {
      if (a && a.querySelector(".flap-char")) a.textContent = a.dataset.label ?? a.textContent;
    });
    cells.forEach((cell) => {
      if (cell) cell.textContent = text(values.get(cell) ?? "");
    });
  };
  const flipIn = motion
    ? watchEntrances([
        {
          trigger: board,
          at: 0.9,
          arm: () => {
            settleWords();
            const nameChars = names.flatMap((a) => {
              if (!a) return [];
              a.dataset.label = a.textContent ?? "";
              return flapChars(a, a.dataset.label);
            });
            const statusChars = cells.flatMap((cell) => (cell && cell.textContent ? flapChars(cell, cell.textContent) : []));
            utils.set([...nameChars, ...statusChars], { rotateX: -90 });
          },
          play: () => {
            names.forEach((a, k) => {
              if (!a) return;
              const chars = [...a.querySelectorAll<HTMLElement>(".flap-char")];
              if (chars.length) turn(chars, a, a.dataset.label ?? "", stagger(8, { start: k * 30 }));
            });
            cells.forEach((cell, k) => {
              if (!cell) return;
              const chars = [...cell.querySelectorAll<HTMLElement>(".flap-char")];
              if (chars.length) turn(chars, cell, text(values.get(cell) ?? ""), stagger(STAGGER.flap, { start: 260 + k * 30 }));
            });
          },
          settle: settleWords,
        },
      ])
    : () => {};

  return () => {
    window.removeEventListener(STATION_EVENT, onStation);
    flipIn();
    utils.remove(board.querySelectorAll(".flap-char"));
    settleWords();
    names.forEach((a) => a?.removeAttribute("data-label"));
    rows.forEach((row) => row.classList.remove("is-here", "is-next"));
    cells.forEach((cell) => {
      if (cell) cell.textContent = "";
    });
  };
}
```
Register the module before the strip, so its listener exists when the strip first announces: `MODULES = [startArrivals, startBoard, startStrip]`. The strip announces again on every `tt:layout` either way.

- [ ] **Step 7: Run the board e2e, then the collision baseline**

Run: `npx playwright test tests/e2e/journey/board.spec.ts tests/e2e/journey/collisions.spec.ts tests/e2e/responsive.spec.ts`
Expected: PASS on both projects. The new column fits at 320px (the phone widths hide Km).

- [ ] **Step 8: The whole gate, then commit**

```bash
npm run check && npx playwright test tests/e2e/journey/ tests/e2e/axe.spec.ts
git add src/components/landing/journey src/messages/en-IN/journey.ts src/styles tests/unit/components/landing/journey tests/e2e/journey
git commit -m "feat(journey): the board's status column follows the page, and its rows flip in"
```

### Task 6: The hero dial answers the plate

**Files:**
- Create: `src/components/landing/journey/{chart-countdown.ts,hero.ts}`
- Modify:
  - `src/components/landing/journey/{hero-dial.tsx,start-journey.ts}`
  - `src/components/landing/hero.tsx`
  - `src/components/pnr/{pnr-terminal.tsx,pnr-terminal-state.ts}`
  - `src/messages/en-IN/journey.ts`
  - `src/styles/journey.css`, `src/styles/journey-island.css`
- Create: `tests/unit/components/landing/journey/chart-countdown.test.ts`, `tests/unit/components/pnr/plate-events.test.tsx`, `tests/e2e/journey/hero-dial.spec.ts`
- Modify: the `pnr-terminal-state` unit test (`ls tests/unit/components/pnr`)

**Interfaces:**
- Consumes: `PLATE_EVENT`, `RUN_EVENT`, `RESULT_EVENT` and their details (Task 1); `ctx.intro` (Task 3); `arcPath`, `polar`, `round2`, `digitArcs` (J2); `countdownTo`, `formatTime` (`src/utils/datetime.ts`).
- Produces:
  - `TerminalResult.chartAt: string | null`: the source's own `snapshot.chartAt` for an ok result, and `null` otherwise.
  - The plates dispatch `tt:plate` `{ hero, digits, running }` on every change, `tt:run` `{ hero }`, and `tt:result` `{ hero, kind, chartAt }`. `useCheckPlate` takes `hero: boolean`.
  - `chart-countdown.ts`: `istMinutes(at)`, `ChartFace`, `chartFace(chartAt, now)`, `dayTicks()`.
  - Hero-dial markup: `.dial-sweep`, `.dial-face` (with `.dial-arc` and `.dial-chart-mark`), `.dial-needle`, plus `<p class="dial-readout">` in `hero.tsx`.
  - Messages: `journey.dial.readout(time, when)`.

The spec's Hero row:
- the living dial lights segments as digits are typed;
- after a result, a 24-hour face marks the chart time printed in the record (never computed), with "Chart … IST · in 3 h 12 min";
- Motion off: the dial and face are drawn still.

Ruling 5 fixes the face's source and words. The ten digit segments are the only `.dial-seg` paths in the hero dial; the face's arc is `.dial-arc`.

- [ ] **Step 1: Write the failing chart-face test**

`tests/unit/components/landing/journey/chart-countdown.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { chartFace, dayTicks, istMinutes } from "@/components/landing/journey/chart-countdown";

const ist = (hhmm: string, day = "2026-09-17") => new Date(`${day}T${hhmm}:00+05:30`);

describe("the 24-hour chart face", () => {
  it("reads minutes past midnight in IST", () => {
    expect(istMinutes(ist("00:00"))).toBe(0);
    expect(istMinutes(ist("15:12"))).toBe(912);
  });

  it("sweeps from now to the chart time, ahead", () => {
    const face = chartFace(ist("15:12").toISOString(), ist("12:00"));
    expect(face).toMatchObject({ ahead: true, hours: 3, minutes: 12, nowDeg: 180, chartDeg: 228 });
    expect(face.arc).toMatch(/^M/);
    expect(face.mark[0]).toBeCloseTo(352 * Math.sin((228 * Math.PI) / 180), 1);
  });

  it("sweeps forward through midnight", () => {
    const face = chartFace(ist("00:15", "2026-09-18").toISOString(), ist("23:50"));
    expect(face.ahead).toBe(true);
    expect(face.hours * 60 + face.minutes).toBe(25);
    expect(face.chartDeg).toBeCloseTo(3.75);
  });

  it("draws no arc once the chart time has passed", () => {
    const face = chartFace(ist("09:00").toISOString(), ist("12:00"));
    expect(face.ahead).toBe(false);
    expect(face.arc).toBe("");
  });

  it("marks 24 hours, every sixth a major one", () => {
    const ticks = dayTicks();
    expect(ticks).toHaveLength(24);
    expect(ticks.filter((t) => t.major)).toHaveLength(4);
  });
});
```
Run it: FAIL (the module is missing).

- [ ] **Step 2: Write the face**

`src/components/landing/journey/chart-countdown.ts`:
```ts
import { countdownTo } from "@/utils/datetime";
import { arcPath, polar, round2, type Point, type Tick } from "./geometry/dial";

// The hero dial's 24-hour face after a result (spec §3.A, Hero): an arc from now to the chart time the record
// itself shows (the source's chartAt; never computed here), on an IST clock face. Pure.

const DAY = 1440;
const RING = 352;

export function istMinutes(at: Date): number {
  return (at.getUTCHours() * 60 + at.getUTCMinutes() + 330 + at.getUTCSeconds() / 60) % DAY;
}

export interface ChartFace {
  readonly ahead: boolean;
  readonly hours: number;
  readonly minutes: number;
  readonly nowDeg: number;
  readonly chartDeg: number;
  /** The arc from now to the chart time, or "" once it has passed. */
  readonly arc: string;
  readonly mark: Point;
}

export function chartFace(chartAt: string, now: Date): ChartFace {
  const at = new Date(chartAt);
  const left = countdownTo(at, now);
  const nowDeg = (istMinutes(now) / DAY) * 360;
  const chartDeg = (istMinutes(at) / DAY) * 360;
  const raw = chartDeg - nowDeg;
  const sweep = raw <= 0 ? raw + 360 : raw;
  const ahead = left.state === "ahead";
  const [x, y] = polar(RING, chartDeg);
  return {
    ahead,
    hours: left.hours,
    minutes: left.minutes,
    nowDeg,
    chartDeg,
    arc: ahead ? arcPath(RING, nowDeg, nowDeg + Math.min(sweep, 359.5)) : "",
    mark: [round2(x), round2(y)],
  };
}

/** The face's hour marks: 24, every sixth longer. */
export function dayTicks(): readonly Tick[] {
  return Array.from({ length: 24 }, (_, h) => {
    const major = h % 6 === 0;
    const [x1, y1] = polar(major ? 338 : 344, h * 15);
    const [x2, y2] = polar(360, h * 15);
    return { x1: round2(x1), y1: round2(y1), x2: round2(x2), y2: round2(y2), major };
  });
}
```
Run it: PASS. The 25-minute case goes through `countdownTo`, whose hours are wall-clock, not modulo a day.

- [ ] **Step 3: Carry the record's chart time on the result, and dispatch the plate's events. Test first.**

In the `pnr-terminal-state` unit test, add:
```ts
  it("carries the source's own chart time on an ok result, and none otherwise", () => {
    const ok = terminalResult(buildFixtureResult(PNR_CNF, NOW), { pnr: PNR_CNF, attemptedAt: NOW, sampleMode: true });
    expect(ok.chartAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const missing = terminalResult({ ok: false, code: "NOT_FOUND", message: "" }, { pnr: PNR_CNF, attemptedAt: NOW, sampleMode: true });
    expect(missing.chartAt).toBeNull();
  });
```
Use the test file's own fixture helpers and constants; if it names them differently, adapt the two builders and keep the assertions. `buildFixtureResult` is exported by `src/services/sources/fixture.ts`.

`tests/unit/components/pnr/plate-events.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PLATE_EVENT, type PlateDetail } from "@/components/landing/journey/journey-events";
import { PnrClosingTerminal, PnrTerminal } from "@/components/pnr/pnr-terminal";

function listen(): PlateDetail[] {
  const seen: PlateDetail[] = [];
  window.addEventListener(PLATE_EVENT, (e) => seen.push((e as CustomEvent<PlateDetail>).detail));
  return seen;
}

describe("the check plates tell the page what they hold", () => {
  it("the hero plate reports its digit count as it is typed", async () => {
    const seen = listen();
    render(<PnrTerminal sampleMode />);
    await userEvent.type(screen.getByRole("textbox"), "234");
    expect(seen.at(-1)).toEqual({ hero: true, digits: 3, running: false });
  });

  it("the closing plate reports as not the hero", async () => {
    const seen = listen();
    render(<PnrClosingTerminal sampleMode title="t" meta="m" lead="l" />);
    await userEvent.type(screen.getByRole("textbox"), "9");
    expect(seen.at(-1)).toEqual({ hero: false, digits: 1, running: false });
  });
});
```
If rendering the plate needs providers or mocks in this repo's existing plate tests, copy that setup verbatim.

Run: `npx vitest run tests/unit/components/pnr`
Expected: FAIL (`chartAt` is undefined, and no events are seen).

- [ ] **Step 4: Write the plate's side**

In `pnr-terminal-state.ts`:
- `TerminalResult` gains `readonly chartAt: string | null;`.
- In `terminalResult`, `base` gains `chartAt: null`.
- The ok branch sets `chartAt: result.snapshot.chartAt ?? null`.

In `pnr-terminal.tsx`:
- Import `PLATE_EVENT`, `RUN_EVENT`, `RESULT_EVENT`, `emit`, `PlateDetail`, `RunDetail`, `ResultDetail` from `@/components/landing/journey/journey-events`. It is a names-only module, so the plates still import no journey code.
- `useCheckPlate(sampleMode, connected, hero: boolean)`; `PnrTerminal` passes `true` and `PnrClosingTerminal` passes `false`.
- Add this after the focus effect:
```ts
  // The hero dial (the landing journey) follows the plate through these; nothing here waits on it.
  useEffect(() => {
    emit<PlateDetail>(PLATE_EVENT, { hero, digits: digits.length, running: phase === "running" });
  }, [hero, digits.length, phase]);
```
- In `run()`, emit `emit<RunDetail>(RUN_EVENT, { hero });` right after `setPhase("running");`, and `emit<ResultDetail>(RESULT_EVENT, { hero, kind: view.kind, chartAt: view.chartAt });` right after `setPhase("done");`.

Run the pnr unit tests: PASS.

- [ ] **Step 5: Write the dial's markup, the readout and the styles**

`journey.dial` gains `readout: (time: string, when: string) => \`Chart ${time} IST · ${when}\`,`. The `when` part is `messages.result.chart.in(hours, minutes)` or `messages.result.chart.prepared`, the same words the record's own chart cell uses (`src/components/pnr/chart-countdown.tsx`). Confirm both keys exist in `src/messages/en-IN/result.ts`.

In `hero-dial.tsx`, import `dayTicks` from `./chart-countdown` (`const DAY_TICKS = dayTicks();`). Before `</svg>`, after the inner ring, add:
```tsx
        <path d={arcPath(352, -8, 22)} className="dial-sweep" />
        <g className="dial-face">
          {DAY_TICKS.map((t, i) => (
            <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} className={t.major ? "dial-tick is-major" : "dial-tick"} />
          ))}
          <path d="" className="dial-arc" />
          <circle cx={0} cy={-352} r={7} className="dial-chart-mark" />
        </g>
        <g className="dial-needle">
          <line x1={0} y1={-300} x2={0} y2={-438} className="dial-needle-line" />
          <circle cx={0} cy={-444} r={5} className="dial-needle-cap" />
        </g>
```
Update its doc comment: "…drawn at rest. While the journey runs, a segment lights per digit typed, a sweep rides the ring during a check, and a result turns it into a 24-hour face. Decoration only."

In `src/components/landing/hero.tsx`, inside `.dial-host`, after `<PnrTerminal … />`, add `<p className="dial-readout" aria-hidden="true" />`. It is decoration: the record states the same chart time in words.

In `journey.css`, in the dial block:
```css
.dial-host > .dial-readout {
  position: absolute; left: 0; right: 0; top: calc(100% + 12px); margin: 0; display: none;
  text-align: center; font-family: var(--font-display); font-weight: 600; font-size: var(--text-2xs);
  line-height: var(--text-2xs--line-height); letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--accent-text);
}
.dial-seg.is-current { stroke: var(--accent-busy); }
.dial-sweep, .dial-face { opacity: 0; }
.dial-sweep { fill: none; stroke: var(--accent); stroke-width: 2; vector-effect: non-scaling-stroke; }
.dial-arc { fill: none; stroke: var(--accent); stroke-width: 7; }
.dial-chart-mark { fill: var(--surface-0); stroke: var(--accent-text); stroke-width: 2; vector-effect: non-scaling-stroke; }
.dial-needle-line { stroke: var(--accent); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.dial-needle-cap { fill: var(--surface-0); stroke: var(--accent); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.dial-needle { transform-box: view-box; transform-origin: 0 0; }
[data-theme="dark"] .dial-seg.is-on, [data-theme="dark"] .dial-needle-line { filter: drop-shadow(0 0 4px var(--accent)); }
```
Append to `journey-island.css`:
```css
/* ---- The hero dial after a result: the digit ring gives way to the 24-hour face, and the readout shows */
html[data-journey="on"] .hero-dial.is-face .dial-face { opacity: 1; }
html[data-journey="on"] .hero-dial.is-face .dial-seg { opacity: 0; }
@media (min-width: 64rem) {
  html[data-journey="on"] .dial-host.is-face > .dial-readout { display: block; }
}
html[data-journey="on"] .hero-dial .is-dashed { transform-box: view-box; transform-origin: 0 0; }
```
The dark drop-shadow is a filter on a hairline drawing, not text, so it follows v3.

- [ ] **Step 6: Write the failing dial e2e**

`tests/e2e/journey/hero-dial.spec.ts`:
```ts
import { expect, test } from "@playwright/test";
import { PNR } from "../helpers";
import { motionOff, waitForJourney } from "./journey-helpers";

test.describe("the hero dial", () => {
  test.skip(({ isMobile }) => isMobile, "the dial draws from 64rem");

  test("lights one segment per digit, and clears with the plate", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    const input = page.getByTestId("hero-instrument").getByRole("textbox");
    await input.pressSequentially("2345");
    await expect(page.locator(".hero-dial .dial-seg.is-on")).toHaveCount(4);
    await input.fill("");
    await expect(page.locator(".hero-dial .dial-seg.is-on")).toHaveCount(0);
  });

  test("turns into a 24-hour face after a result, with the record's own chart time", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-09-17T06:30:00.000Z"));
    await page.goto("/");
    await waitForJourney(page);
    const plate = page.getByTestId("hero-instrument");
    await plate.getByRole("textbox").fill(PNR.cnf);
    await plate.getByRole("button", { name: /run/i }).click();
    await expect(page.getByTestId("terminal-result")).toBeVisible();
    await expect(page.locator(".hero-dial")).toHaveClass(/is-face/);
    await expect(page.locator(".dial-readout")).toHaveText(/^Chart \d{2}:\d{2} IST · in \d+ h \d+ min$/i);
    await expect(page.locator(".dial-arc")).toHaveAttribute("d", /^M/);
  });

  test("Motion off: the face is drawn at once", async ({ page }) => {
    await motionOff(page);
    await page.goto("/");
    await waitForJourney(page);
    const plate = page.getByTestId("hero-instrument");
    await plate.getByRole("textbox").fill(PNR.cnf);
    await plate.getByRole("button", { name: /run/i }).click();
    await expect(page.locator(".hero-dial")).toHaveClass(/is-face/);
    expect(await page.locator(".dial-face").evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  });
});
```
`E2E_NOW` pins the fixture's clock to 2026-09-17T06:30Z (`playwright.config.ts`), so the fixture's chart time lies ahead of the page's frozen clock. Run it: FAIL (no segments light).

- [ ] **Step 7: Write the dial module**

`src/components/landing/journey/hero.ts`:
```ts
import { animate, createAnimatable, stagger, svg, utils, type JSAnimation } from "animejs";
import { messages } from "@/messages";
import { formatTime } from "@/utils/datetime";
import { chartFace } from "./chart-countdown";
import { ease } from "./ease";
import { PLATE_EVENT, RESULT_EVENT, RUN_EVENT, type PlateDetail, type ResultDetail, type RunDetail } from "./journey-events";
import { STAGGER, T } from "./motion-tokens";
import type { JourneyContext, Teardown } from "./start-journey";

// The hero dial while the journey runs (spec §3.A, Hero): a segment lights per digit typed; a sweep rides the
// ring while a check runs; a result with the record's chart time turns it into a 24-hour IST face with the
// needle on now. On a fine pointer with Motion on, the needle otherwise follows the pointer. Motion off: every
// state is drawn at once.

export function startHero({ motion, intro }: JourneyContext): Teardown {
  const dial = document.querySelector<SVGSVGElement>(".hero-dial svg");
  const host = document.querySelector<HTMLElement>(".dial-host");
  if (!dial || !host) return () => {};
  const shell = dial.parentElement!;
  const segs = [...dial.querySelectorAll<SVGPathElement>(".dial-seg")];
  const dashed = dial.querySelector<SVGCircleElement>(".is-dashed");
  const sweep = dial.querySelector<SVGPathElement>(".dial-sweep");
  const arc = dial.querySelector<SVGPathElement>(".dial-arc");
  const mark = dial.querySelector<SVGCircleElement>(".dial-chart-mark");
  const needle = dial.querySelector<SVGGElement>(".dial-needle");
  const readout = host.querySelector<HTMLElement>(".dial-readout");
  const running: JSAnimation[] = [];
  let lit = 0;
  let spin: JSAnimation | null = null;
  let face: { readonly chartAt: string; readonly timer: number } | null = null;
  let angle = 0;
  const turn = needle ? createAnimatable(needle, { rotate: { unit: "deg", duration: motion ? 520 : 0 }, ease: ease.expo() }) : null;
  const aim = (deg: number) => {
    const raw = deg - (angle % 360);
    const d = raw > 180 ? raw - 360 : raw < -180 ? raw + 360 : raw;
    angle += d;
    turn?.rotate(angle);
  };

  const setDigits = (n: number) => segs.forEach((s, i) => {
    s.classList.toggle("is-on", i < n);
    s.classList.toggle("is-current", i === n && n < 10);
  });
  const stopSweep = () => {
    spin?.revert();
    spin = null;
    sweep?.style.removeProperty("opacity");
  };
  const paintFace = () => {
    if (!face) return;
    const f = chartFace(face.chartAt, new Date());
    arc?.setAttribute("d", f.arc);
    mark?.setAttribute("cx", String(f.mark[0]));
    mark?.setAttribute("cy", String(f.mark[1]));
    aim(f.nowDeg);
    if (readout) {
      const c = messages.result.chart;
      readout.textContent = messages.journey.dial.readout(formatTime(face.chartAt), f.ahead ? c.in(f.hours, f.minutes) : c.prepared);
    }
  };
  const exitFace = () => {
    if (!face) return;
    window.clearInterval(face.timer);
    face = null;
    shell.classList.remove("is-face");
    host.classList.remove("is-face");
    arc?.setAttribute("d", "");
    if (readout) readout.textContent = "";
  };
  const enterFace = (chartAt: string) => {
    exitFace();
    face = { chartAt, timer: window.setInterval(paintFace, 20_000) };
    shell.classList.add("is-face");
    host.classList.add("is-face");
    paintFace();
    if (motion && arc) running.push(animate(svg.createDrawable(arc), { draw: ["0 0", "0 1"], duration: T.draw, delay: T.fast, ease: ease.inOut() }));
  };

  const onPlate = (event: Event) => {
    const { hero, digits, running: busy } = (event as CustomEvent<PlateDetail>).detail;
    if (!hero) return;
    if (!busy) {
      exitFace();
      stopSweep();
    }
    setDigits(digits);
    if (motion && digits > lit && segs[digits - 1]) {
      running.push(animate(segs[digits - 1]!, { strokeWidth: [13, 7], duration: T.slow, ease: ease.expo() }));
      if (dashed) running.push(animate(dashed, { rotate: "+=14", duration: T.slow, ease: ease.expo() }));
    }
    lit = digits;
  };
  const onRun = (event: Event) => {
    if (!(event as CustomEvent<RunDetail>).detail.hero || !motion || !sweep) return;
    stopSweep();
    spin = animate(sweep, { rotate: [0, 360], opacity: [0, 1, 1, 0], duration: 1200, loop: true, ease: ease.inOut() });
  };
  const onResult = (event: Event) => {
    const { hero, chartAt } = (event as CustomEvent<ResultDetail>).detail;
    if (!hero) return;
    stopSweep();
    if (chartAt) enterFace(chartAt);
    else if (motion) running.push(animate(segs, { opacity: [1, 0.4, 1], duration: 580, delay: stagger(26), ease: ease.out() }));
  };
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const onPointer = (e: PointerEvent) => {
    if (face) return;
    const r = dial.getBoundingClientRect();
    aim((Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI + 90);
  };

  // Start from what the plate already holds: the journey may have arrived after the reader began typing.
  lit = document.querySelectorAll('[data-testid="hero-instrument"] [data-cell][data-filled]').length;
  setDigits(lit);
  window.addEventListener(PLATE_EVENT, onPlate);
  window.addEventListener(RUN_EVENT, onRun);
  window.addEventListener(RESULT_EVENT, onResult);
  if (motion && fine) window.addEventListener("pointermove", onPointer, { passive: true });
  if (motion && intro) {
    running.push(animate(dial.querySelectorAll(".dial-bezel .dial-tick"), { opacity: [0, 1], duration: 500, delay: stagger(STAGGER.tick, { start: 200 }), ease: ease.out() }));
    running.push(animate(svg.createDrawable(dial.querySelectorAll(":scope > .dial-ring")), { draw: ["0 0", "0 1"], duration: T.draw, delay: 300, ease: ease.inOut() }));
    running.push(animate(segs, { opacity: [0, 1], duration: 400, delay: stagger(STAGGER.seg, { start: 700 }), ease: ease.out() }));
  }
  if (motion && dashed) running.push(animate(dashed, { rotate: "-=360", duration: 90_000, loop: true, ease: "linear" }));

  return () => {
    window.removeEventListener(PLATE_EVENT, onPlate);
    window.removeEventListener(RUN_EVENT, onRun);
    window.removeEventListener(RESULT_EVENT, onResult);
    window.removeEventListener("pointermove", onPointer);
    for (const a of running) a.revert();
    stopSweep();
    exitFace();
    turn?.revert();
    if (needle) utils.remove(needle);
    needle?.style.removeProperty("transform");
    setDigits(0);
  };
}
```
v3 paused the slow ring rotation while the dial was off screen. The dial sits in the hero, and Anime.js's engine idles in hidden tabs. If the loop's cost shows in the Finish step's smoothness run, wrap it in an `IntersectionObserver` that pauses it off screen, and say so.

Register it: `MODULES = [startArrivals, startBoard, startStrip, startHero]`.

- [ ] **Step 8: Run the dial e2e, the home spec and the collisions**

Run: `npx playwright test tests/e2e/journey/hero-dial.spec.ts tests/e2e/home.spec.ts tests/e2e/journey/collisions.spec.ts --project=desktop`
Expected: PASS. Then add one collision check after a result at 1440×900: the readout must not touch the board.
```ts
  test("the chart readout never touches the board", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.clock.setFixedTime(new Date("2026-09-17T06:30:00.000Z"));
    await page.goto("/");
    await waitForJourney(page);
    const plate = page.getByTestId("hero-instrument");
    await plate.getByRole("textbox").fill(PNR.cnf);
    await plate.getByRole("button", { name: /run/i }).click();
    await expect(page.locator(".dial-readout")).toBeVisible();
    await page.locator(".dial-readout").scrollIntoViewIfNeeded();
    expect(await collisionsInView(page, INSTRUMENTS)).toEqual([]);
  });
```
Add it to `collisions.spec.ts`, which already defines `INSTRUMENTS` and imports `collisionsInView`. If the readout overlaps the board, move it into the plate's own foot rather than shrinking the gap, and report the move.

- [ ] **Step 9: The whole gate, then commit**

```bash
npm run check && npx playwright test tests/e2e/journey/ tests/e2e/home.spec.ts tests/e2e/axe.spec.ts
git add src tests
git commit -m "feat(journey): the hero dial lights as digits are typed, and turns into the record's 24-hour chart face"
```

### Task 7: The chapters instrument, drawn still

**Files:**
- Create: `src/components/landing/journey/chapters-instrument.tsx`
- Modify: `src/components/landing/{how-it-works.tsx,specimen-data.ts}`, `src/app/(site)/page.tsx`, `src/messages/en-IN/journey.ts`, `src/styles/journey.css`
- Create: `tests/unit/components/landing/how-it-works.test.tsx`
- Modify: the specimen unit test (`ls tests/unit/components/landing` shows J2's `landing-specimen.test.ts` or a similar name), and `tests/e2e/journey/instruments.spec.ts`

**Interfaces:**
- Consumes: `buildSpecimen`, `Specimen`, `SPECIMEN_PNR` (J2); `statusCode`-derived `PaxRow.current`; `formatPnr`, `formatTime`; the J2 dial geometry.
- Produces:
  - `Specimen` gains `retrieved: string` (`formatTime(checkedAt)`).
  - `ChapterTrace { pnr; digits; statuses; party; count; retrieved }` and `chapterTrace(specimen)`.
  - `HowItWorks({ trace })`, with `<section id="how" class="chapters section-pad">` › `.chapters-pin` › `.chapters-copy` (with `li[data-chapter]`) plus `ChaptersInstrument`.
  - `ChaptersInstrument({ trace })`: `.chapters-instrument` › `.chapters-dial svg[data-pnr]` holding:
    - `.dial-seg` ×10, `.chapter-arc` ×3, `.chapter-label` ×3;
    - `g.chapter-layer[data-layer]` ×3, each with its pieces: `.chapter-digits`, `.chapter-bar` ×17, `.chapter-step` ×3, `.chapter-pulse`, `.dial-sweep`;
    - `.chapter-card` with `.chapter-step-count` and `pre[data-card]` ×3.

    Layer 0 and card 0 carry `is-current` from the server.
  - Messages: `journey.chapters.*`.

Spec §3.A, 02: "Three stops play inside one instrument dial; a request-trace card prints each stop. Motion off: plain section." This task draws the instrument and keeps the section exactly as plain as today. With the journey stopped, or with Motion off, the instrument is not shown. Task 8 pins it. Ruling 11: the demo's words are the specimen's.

- [ ] **Step 1: Write the failing trace test**

Add to the specimen unit test:
```ts
  it("gives the chapters' trace card the specimen's own PNR, statuses, party and retrieval time", () => {
    const specimen = buildSpecimen(new Date("2026-09-17T06:30:00.000Z"))!;
    expect(chapterTrace(specimen)).toEqual({
      pnr: "234 567 8909",
      digits: "2345678909",
      statuses: "CNF · RAC · WL",
      party: ["P1 · CNF · B1 · 12 LB", "P2 · RAC 4", "P3 · WL 9"],
      count: 3,
      retrieved: specimen.retrieved,
    });
    expect(specimen.retrieved).toMatch(/^\d{2}:\d{2}$/);
  });
```
Import `chapterTrace` next to `buildSpecimen`. If the fixture's statuses for this PNR read differently (`RAC 4`, `WL 9`), the expected party follows the fixture; the statuses line keeps only each status's code. Run it: FAIL.

- [ ] **Step 2: Write the trace and the copy**

`journey.ts`: above `export const journey`, add:
```ts
const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six"] as const;
```
In the object, add:
```ts
  chapters: {
    pnrGroups: "PNR number · 3–3–4",
    noDigits: "— — —",
    steps: [{ label: "Validate" }, { label: "Source" }, { label: "Result" }],
    trace: "Request trace",
    step: (n: number, of: number) => `${String(n).padStart(2, "0")} / ${String(of).padStart(2, "0")}`,
    cards: {
      pnr: "PNR",
      digits: "digits",
      tenOfTen: "10 / 10",
      groups: "groups",
      groupsValue: "3 · 3 · 4",
      validate: "validate",
      ok: "ok",
      source: "source",
      askedOnce: "asked once",
      result: "result",
      asReturned: "as returned",
      status: "status",
      party: "party",
      retrieved: "retrieved",
    },
    party: (n: number, status: string, seat: string | null) => (seat ? `P${n} · ${status} · ${seat}` : `P${n} · ${status}`),
    partyOf: (count: number) => `${NUMBER_WORDS[count] ?? String(count)} passengers`,
    time: (time: string) => `${time} IST`,
    stamp: (time: string) => `Retrieved ${time} IST · Sample data`,
  },
```
`specimen-data.ts`:
- `Specimen` gains `readonly retrieved: string;`, and `buildSpecimen` returns `retrieved: formatTime(checkedAt)`.
- Append:
```ts
/** What 02's chapters instrument prints about the specimen (spec ruling J3-11): its own PNR, statuses, party and
 * retrieval time, never retyped. */
export interface ChapterTrace {
  readonly pnr: string;
  readonly digits: string;
  readonly statuses: string;
  readonly party: readonly string[];
  readonly count: number;
  readonly retrieved: string;
}

export function chapterTrace(specimen: Specimen, pnr: string = SPECIMEN_PNR): ChapterTrace {
  const m = messages.journey;
  const seat = specimen.seats ? m.berths.seat(specimen.seats.coach, specimen.seats.berth) : null;
  return {
    pnr: formatPnr(pnr),
    digits: pnr,
    statuses: specimen.pax.map((p) => p.current.split(" ")[0]).join(" · "),
    party: specimen.pax.map((p, i) => m.chapters.party(i + 1, p.current, i === 0 ? seat : null)),
    count: specimen.pax.length,
    retrieved: specimen.retrieved,
  };
}
```
(Import `formatPnr` from `@/utils/pnr`.) Run the specimen test: PASS.

- [ ] **Step 3: Write the failing section test**

`tests/unit/components/landing/how-it-works.test.tsx`:
```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HowItWorks } from "@/components/landing/how-it-works";
import { buildSpecimen, chapterTrace } from "@/components/landing/specimen-data";

const trace = chapterTrace(buildSpecimen(new Date("2026-09-17T06:30:00.000Z"))!);

describe("02 · How it works", () => {
  it("keeps its words as they were: a heading and three stops", () => {
    render(<HowItWorks trace={trace} />);
    const section = screen.getByRole("region", { name: /three stops/i });
    const stops = within(section).getAllByRole("listitem");
    expect(stops.map((li) => li.getAttribute("data-chapter"))).toEqual(["0", "1", "2"]);
    expect(within(section).getAllByRole("heading", { level: 3 })).toHaveLength(3);
  });

  it("draws the chapters instrument as decoration, with the specimen's trace", () => {
    const { container } = render(<HowItWorks trace={trace} />);
    const instrument = container.querySelector(".chapters-instrument");
    expect(instrument).toHaveAttribute("aria-hidden", "true");
    expect(instrument?.querySelectorAll(".chapters-dial .dial-seg")).toHaveLength(10);
    expect(instrument?.querySelectorAll(".chapter-arc")).toHaveLength(3);
    expect(instrument?.querySelectorAll("[data-layer]")).toHaveLength(3);
    expect(instrument?.querySelector("svg")).toHaveAttribute("data-pnr", "2345678909");
    expect(instrument?.querySelector('pre[data-card="0"]')).toHaveTextContent("PNR 234 567 8909");
    expect(instrument?.querySelector('pre[data-card="2"]')).toHaveTextContent("three passengers");
    expect(instrument?.querySelector('[data-layer="0"]')).toHaveClass("is-current");
  });

  it("draws no instrument without a specimen", () => {
    const { container } = render(<HowItWorks trace={null} />);
    expect(container.querySelector(".chapters-instrument")).toBeNull();
  });
});
```
`<section aria-labelledby>` is a region named by its h2 ("Three stops, nothing hidden"). Run it: FAIL (`HowItWorks` takes no trace, and draws no instrument).

- [ ] **Step 4: Write the section and the instrument**

`src/components/landing/journey/chapters-instrument.tsx`:
```tsx
import type { ChapterTrace } from "@/components/landing/specimen-data";
import { Corners } from "@/components/ui/corners";
import { messages } from "@/messages";
import { arcPath, bezelTicks, digitArcs, groupLabelPoints } from "./geometry/dial";

const ARCS = digitArcs();
const TICKS = bezelTicks();
const LABELS = groupLabelPoints(ARCS, 326);
const CHAPTERS = [0, 1, 2].map((i) => ({ from: -150 + i * 102, to: -150 + i * 102 + 94 }));
const BARS = Array.from({ length: 17 }, (_, i) => -118 + i * 14);
const STEP_X = [-190, 0, 190] as const;

/**
 * 02's instrument (spec §3.A): the three stops of a check inside one dial, with each stop's name on the bezel,
 * a demo per stop in its middle, and a request-trace card. It prints the specimen's own record (ruling J3-11).
 * Decoration: the section's list says every word. Drawn at stop 01; the journey (chapters.ts) pins it and plays
 * the stops as the page scrolls.
 */
export function ChaptersInstrument({ trace }: { readonly trace: ChapterTrace }) {
  const m = messages.journey.chapters;
  const how = messages.home.how;
  const c = m.cards;
  return (
    <div className="chapters-instrument" aria-hidden="true">
      <div className="chapters-dial">
        <svg viewBox="-480 -480 960 960" focusable="false" data-pnr={trace.digits}>
          <g className="dial-bezel">
            {TICKS.map((t, i) => (
              <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} className={t.major ? "dial-tick is-major" : "dial-tick"} />
            ))}
          </g>
          <circle r={382} className="dial-ring" />
          <circle r={370} className="dial-ring is-dashed" />
          {ARCS.map((arc) => (
            <path key={arc.from} d={arcPath(352, arc.from, arc.to)} className="dial-seg" />
          ))}
          {messages.journey.dial.groups.map((group, i) => (
            <text key={group.label} x={LABELS[i]![0]} y={LABELS[i]![1]} className="dial-label" textAnchor="middle" dominantBaseline="middle">
              {group.label}
            </text>
          ))}
          <circle r={306} className="dial-ring" />
          <path d={arcPath(352, -8, 22)} className="dial-sweep" />
          {CHAPTERS.map((a) => (
            <path key={a.from} d={arcPath(424, a.from, a.to)} className="chapter-arc" />
          ))}
          <defs>
            {CHAPTERS.map((a, i) => (
              <path key={a.from} id={`chapter-arc-${i}`} d={arcPath(446, a.from, a.to)} />
            ))}
          </defs>
          {how.steps.map((step, i) => (
            <text key={step.num} className="dial-label chapter-label">
              <textPath href={`#chapter-arc-${i}`} startOffset="50%" textAnchor="middle">
                {how.stepLabel(step.num, step.kicker)}
              </textPath>
            </text>
          ))}
          <g data-layer="0" className="chapter-layer is-current">
            <text x={0} y={-10} className="dial-label is-steel chapter-digits" textAnchor="middle">
              {m.noDigits}
            </text>
            <text x={0} y={58} className="dial-label" textAnchor="middle">
              {m.pnrGroups}
            </text>
          </g>
          <g data-layer="1" className="chapter-layer">
            {BARS.map((y) => (
              <rect key={y} x={-120} y={y} width={240} height={2} className="dial-dot chapter-bar" />
            ))}
            <line x1={-190} y1={150} x2={190} y2={150} className="dial-ring chapter-rail" />
            {m.steps.map((s, i) => (
              <g key={s.label}>
                <circle cx={STEP_X[i]} cy={150} r={7} className="dial-ring" />
                <circle cx={STEP_X[i]} cy={150} r={4} className="dial-dot chapter-step" />
                <text x={STEP_X[i]} y={180} className="dial-label" textAnchor="middle">
                  {s.label}
                </text>
              </g>
            ))}
            <circle cx={-190} cy={150} r={9} className="chapter-pulse" />
          </g>
          <g data-layer="2" className="chapter-layer">
            <text x={0} y={-40} className="dial-label is-steel chapter-status" textAnchor="middle">
              {trace.statuses}
            </text>
            {trace.party.map((line, i) => (
              <text key={line} x={0} y={22 + i * 30} className="dial-label chapter-party" textAnchor="middle">
                {line}
              </text>
            ))}
            <text x={0} y={132} className="dial-label" textAnchor="middle">
              {m.stamp(trace.retrieved)}
            </text>
          </g>
        </svg>
      </div>
      <div className="chapter-card blueprint bg-surface-0">
        <Corners />
        <div className="flex border-b border-line">
          <span className="legend flex-1 px-4 py-2">{m.trace}</span>
          <span className="legend chapter-step-count tnum border-l border-line px-4 py-2">{m.step(1, 3)}</span>
        </div>
        <pre data-card="0" className="is-current">
          {`${c.pnr}  `}
          <b>{trace.pnr}</b>
          {`\n${c.digits}  `}
          <b>{c.tenOfTen}</b>
          {`\n${c.groups}  ${c.groupsValue}`}
        </pre>
        <pre data-card="1">
          {`${c.validate}  `}
          <b>{c.ok}</b>
          {`\n${c.source}    `}
          <b>{c.askedOnce}</b>
          {`\n${c.result}    `}
          <b>{c.asReturned}</b>
        </pre>
        <pre data-card="2">
          {`${c.status}  `}
          <b>{trace.statuses}</b>
          {`\n${c.party}   ${m.partyOf(trace.count)}\n${c.retrieved}  `}
          <b>{m.time(trace.retrieved)}</b>
        </pre>
      </div>
    </div>
  );
}
```
The `textPath` `id`s are fixed, because the instrument renders once per page (on "/").

`src/components/landing/how-it-works.tsx` becomes:
```tsx
import type { ChapterTrace } from "@/components/landing/specimen-data";
import { messages } from "@/messages";
import { ChaptersInstrument } from "./journey/chapters-instrument";
import { TrainGlyph } from "./journey/train-glyph";
import { BODY, H2, H3, SectionKicker } from "./sheet-type";

// The route line: twin rails with sleepers and three stops at origin, midway, and terminus.
const STOPS = ["left-0", "left-[calc(50%-8px)]", "left-[calc(100%-16px)]"] as const;

/**
 * 02 · How it works: the check drawn as a route with three stops. Drawn still it is a plain section; while the
 * journey runs with Motion on, and the stops fit the window, it pins and plays them inside the chapters
 * instrument (journey/chapters.ts, spec §3.A).
 */
export function HowItWorks({ trace }: { readonly trace: ChapterTrace | null }) {
  const m = messages.home.how;
  return (
    <section id="how" aria-labelledby="how-title" className="chapters section-pad">
      <div className="chapters-pin">
        <div className="chapters-copy">
          <SectionKicker rule="mb-3">{m.kicker}</SectionKicker>
          <h2 id="how-title" className={H2}>
            {m.title}
          </h2>
          <div aria-hidden="true" className="chapters-rail relative mt-[44px] h-6">
            <div className="rail absolute inset-x-0 top-1.5 h-3" />
            {STOPS.map((left) => (
              <span key={left} className={`absolute top-1 flex size-4 items-center justify-center rounded-full border border-accent-text bg-surface-0 ${left}`}>
                <span className="size-1.5 rounded-full bg-accent" />
              </span>
            ))}
            <span className="rail-marker">
              <TrainGlyph />
            </span>
          </div>
          <ol className="chapters-steps">
            {m.steps.map((step, i) => (
              <li key={step.num} data-chapter={i} className="min-w-0">
                <span className="font-display text-label font-semibold uppercase leading-normal tracking-caps text-accent-text tnum">{m.stepLabel(step.num, step.kicker)}</span>
                <h3 className={`mt-2 ${H3}`}>{step.title}</h3>
                <p className={`mt-2.5 ${BODY}`}>{step.detail}</p>
              </li>
            ))}
          </ol>
        </div>
        {trace ? <ChaptersInstrument trace={trace} /> : null}
      </div>
    </section>
  );
}
```
In `page.tsx`, import `chapterTrace`, and render `<HowItWorks trace={specimen ? chapterTrace(specimen) : null} />`.

Append to `journey.css`. The `<ol>`'s layout moves here from utilities, so the pinned layout in Task 8 can override it without `!important`:
```css
/* ---- 02 · the chapters instrument: drawn still, the section is plain and the instrument is not shown; the
   journey pins it (journey-island.css). The dial reuses the hero dial's classes. */
.chapters-pin { display: block; }
.chapters-instrument, .rail-marker { display: none; }
.chapters-steps {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: 32px clamp(20px, 3vw, 48px); margin: 20px 0 0; padding: 0; list-style: none;
}
.chapters-dial { position: relative; aspect-ratio: 1; }
.chapters-dial svg { display: block; width: 100%; height: 100%; overflow: visible; }
.chapter-arc { fill: none; stroke: var(--line); stroke-width: 7; }
.chapter-arc.is-on { stroke: var(--accent); }
.chapter-label { font-size: 15px; /* drawing units */ }
.dial-label.is-steel { fill: var(--accent-text); }
.chapter-digits { font-size: 64px; /* drawing units */ letter-spacing: 0.06em; }
.chapter-status { font-size: 54px; /* drawing units */ }
.chapter-party { font-size: 17px; /* drawing units */ }
.dial-dot { fill: var(--accent); }
.chapter-rail { stroke: var(--line-strong); }
.chapter-pulse { fill: none; stroke: var(--accent); stroke-width: 2; vector-effect: non-scaling-stroke; }
.chapter-layer:not(.is-current), .chapter-card pre:not(.is-current) { display: none; }
.chapter-card { position: relative; align-self: flex-end; width: 17.5rem; z-index: 2; }
.chapter-card pre {
  margin: 0; padding: 12px 14px; font-family: var(--font-display); font-weight: 500; font-size: var(--text-label);
  line-height: 1.35rem; letter-spacing: 0.04em; color: var(--ink-2); white-space: pre-wrap; font-variant-numeric: tabular-nums;
}
.chapter-card pre b { color: var(--accent-text); font-weight: 600; }
.rail-marker { position: absolute; top: -3px; left: 0; width: 30px; height: 12px; color: var(--accent); transform: translateX(-50%); }
.rail-marker svg { display: block; width: 100%; height: 100%; }
```
Run the section test: PASS.

- [ ] **Step 5: Prove the still section is unchanged**

Add to `tests/e2e/journey/instruments.spec.ts`:
```ts
test("02 is a plain section until the journey pins it: three stops side by side, no instrument", async ({ page, isMobile }) => {
  await blockJourneyChunk(page);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-journey", "failed", { timeout: 15_000 });
  await expect(page.locator("#how .chapters-instrument")).toBeHidden();
  const tops = await page.locator("#how li[data-chapter]").evaluateAll((lis) => lis.map((li) => Math.round(li.getBoundingClientRect().top)));
  if (!isMobile) expect(new Set(tops).size).toBe(1);
});
```
Import `blockJourneyChunk` from `./journey-helpers`. Take a 1440×900 screenshot of `#how` into the workspace, before (`git stash`) and after, and confirm they match.

Run: `npx playwright test tests/e2e/journey/instruments.spec.ts tests/e2e/journey/collisions.spec.ts tests/e2e/home.spec.ts`
Expected: PASS.

- [ ] **Step 6: The whole gate, then commit**

```bash
npm run check && npx playwright test tests/e2e/journey/ tests/e2e/axe.spec.ts tests/e2e/responsive.spec.ts
git add src tests
git commit -m "feat(journey): draw 02's chapters instrument, from the specimen, for the journey to pin"
```

### Task 8: The chapters pinned: three stops in one dial, and the fit rules

**Files:**
- Create: `src/components/landing/journey/{chapters-progress.ts,fit.ts,chapters.ts}`
- Modify: `src/components/landing/journey/start-journey.ts`, `src/styles/journey-island.css`, `tests/e2e/journey/collisions.ts`, `tests/e2e/journey/collisions.spec.ts`
- Create: `tests/unit/components/landing/journey/{chapters-progress.test.ts,fit.test.ts}`, `tests/e2e/journey/chapters.spec.ts`

**Interfaces:**
- Consumes: Task 7's markup; `track`, `SMOOTH`, `REBUILD_EVENT`, `LAYOUT_EVENT`.
- Produces:
  - `chapterAt(p)` → `{ i: 0 | 1 | 2; t }`, plus `typedCount(t)`, `barWidth(k, t)`, `stepLit(k, t)`.
  - `Span { top; bottom }` and `fitsWindow(parts, pin, windowBottom)`.
  - `startChapters: JourneyModule`: `.chapters.is-pinned` while the stops fit, and `tt:rebuild` when the fit changes.
  - `CollisionOptions` gains `step?: number`, the fraction of the window per sweep step (default 0.45).

Spec §3.A: every pinned piece measures its content against the visible window, and falls back to its static layout when it cannot fit:
- short windows show only the current stop's words;
- phones on their side put the dial beside the stops;
- anything that still cannot fit unpins.

v3's `fitsPinned` opens each stop in turn and checks that the copy and the instrument sit inside the pin's window under the masthead. The CSS supplies the compact forms, so the check measures them.

- [ ] **Step 1: Write the failing pure tests**

`tests/unit/components/landing/journey/chapters-progress.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { barWidth, chapterAt, stepLit, typedCount } from "@/components/landing/journey/chapters-progress";

describe("the chapters' progress", () => {
  it("splits the scroll into three equal stops", () => {
    expect(chapterAt(0)).toEqual({ i: 0, t: 0 });
    expect(chapterAt(0.5)).toEqual({ i: 1, t: 0.5 });
    expect(chapterAt(1)).toEqual({ i: 2, t: 1 });
  });
  it("types the ten digits over the first four fifths of stop 01", () => {
    expect([0, 0.4, 0.8, 1].map(typedCount)).toEqual([0, 5, 10, 10]);
  });
  it("draws the request bars as v3 does", () => {
    expect(barWidth(8, 0)).toBeCloseTo(230.5, 1);
    expect(barWidth(0, 0)).toBeCloseTo(11.8, 1);
  });
  it("lights each step dot as the pulse reaches it", () => {
    expect([stepLit(0, 0), stepLit(1, 0.47), stepLit(1, 0.49), stepLit(2, 0.98)]).toEqual([true, false, true, true]);
  });
});
```
`tests/unit/components/landing/journey/fit.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { fitsWindow } from "@/components/landing/journey/fit";

const pin = { top: 96, bottom: 900 };

describe("fitsWindow", () => {
  it("fits when every shown part sits inside the pin and above the window's foot", () => {
    expect(fitsWindow([{ top: 120, bottom: 700 }, { top: 110, bottom: 880 }], pin, 900)).toBe(true);
  });
  it("does not fit when a part runs past the window's foot, even inside the pin", () => {
    expect(fitsWindow([{ top: 120, bottom: 820 }], pin, 800)).toBe(false);
  });
  it("ignores a part that is not shown", () => {
    expect(fitsWindow([null, { top: 100, bottom: 400 }], pin, 900)).toBe(true);
  });
});
```
Run both: FAIL (the modules are missing).

- [ ] **Step 2: Write them**

`src/components/landing/journey/chapters-progress.ts`:
```ts
// 02's scroll progress (prototype v3's chapters.js), pure: which stop, how far into it, and the demo's drawing.

export interface ChapterPlace {
  readonly i: 0 | 1 | 2;
  readonly t: number;
}

export function chapterAt(p: number): ChapterPlace {
  const i = Math.min(2, Math.max(0, Math.floor(p * 3))) as 0 | 1 | 2;
  return { i, t: Math.min(1, Math.max(0, p * 3 - i)) };
}

/** Digits typed into stop 01's demo: all ten by four fifths of the way. */
export function typedCount(t: number): number {
  return Math.min(10, Math.floor(t * 12.5));
}

/** Stop 02's seventeen request bars, rippling as the stop plays. */
export function barWidth(k: number, t: number): number {
  const w = 240 * (0.18 + 0.82 * Math.abs(Math.sin(k * 0.55 + t * 9))) * (1 - Math.abs(k - 8) / 11);
  return Math.round(w * 10) / 10;
}

/** Stop 02's step dots light as the pulse passes them: validate, source, result. */
export function stepLit(k: number, t: number): boolean {
  return t >= k / 2 - 0.02;
}
```
`src/components/landing/journey/fit.ts`:
```ts
// Whether a pinned piece's parts fit its window (spec §3.A): inside the pin, and above the window's foot under
// the masthead. A part that is not shown (null) never blocks. Pure; chapters.ts measures the boxes.

export interface Span {
  readonly top: number;
  readonly bottom: number;
}

export function fitsWindow(parts: readonly (Span | null)[], pin: Span, windowBottom: number): boolean {
  const bottom = Math.min(pin.bottom, windowBottom);
  return parts.every((p) => p === null || (p.top >= pin.top - 1 && p.bottom <= bottom + 1));
}
```
Run both: PASS.

- [ ] **Step 3: Write the failing chapters e2e, and the dense sweep**

In `tests/e2e/journey/collisions.ts`, add `readonly step?: number;` to `CollisionOptions` with the doc comment "How far each sweep step moves, as a fraction of the window (default 0.45)". In `collisionsTopToBottom`, use `options.step ?? 0.45` where the 45% constant is today. Keep the 400-step cap.

`tests/e2e/journey/chapters.spec.ts`:
```ts
import { expect, test, type Page } from "@playwright/test";
import { collisionsInView } from "./collisions";
import { motionOff, scrollToId, waitForJourney } from "./journey-helpers";

const PANELS = { panels: [".board", ".berth-plan", ".station-clock", ".route-map", ".chapter-card"], skip: [".hero-dial"] };

async function throughHow(page: Page, fractions: readonly number[]): Promise<string[]> {
  const found: string[] = [];
  for (const f of fractions) {
    await page.evaluate((frac) => {
      const how = document.getElementById("how")!;
      const top = how.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top + (how.offsetHeight - window.innerHeight) * frac, behavior: "instant" });
    }, f);
    await page.waitForTimeout(250);
    found.push(...(await collisionsInView(page, PANELS)).map((c) => `@${f}: ${c}`));
  }
  return found;
}

test.describe("02 · the chapters, pinned", () => {
  test("holds under the masthead and plays its three stops as the page scrolls", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#how")).toHaveClass(/is-pinned/);
    const headerBottom = await page.locator("header").evaluate((h) => Math.round(h.getBoundingClientRect().bottom));
    for (const [f, stop, card] of [[0.1, "0", "01 / 03"], [0.5, "1", "02 / 03"], [0.95, "2", "03 / 03"]] as const) {
      await page.evaluate((frac) => {
        const how = document.getElementById("how")!;
        window.scrollTo({ top: how.getBoundingClientRect().top + window.scrollY + (how.offsetHeight - window.innerHeight) * frac, behavior: "instant" });
      }, f);
      await expect(page.locator(`#how li[data-chapter="${stop}"]`)).toHaveClass(/is-current/);
      await expect(page.locator("#how .chapter-step-count")).toHaveText(card);
      const pinTop = await page.locator("#how .chapters-pin").evaluate((p) => Math.round(p.getBoundingClientRect().top));
      expect(Math.abs(pinTop - headerBottom)).toBeLessThanOrEqual(2);
    }
  });

  test("never collides while it plays: desktop, short desktop, phone, and a phone on its side", async ({ page }) => {
    for (const size of [{ width: 1440, height: 900 }, { width: 1440, height: 600 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      await page.goto("/");
      await waitForJourney(page);
      expect(await throughHow(page, [0, 0.2, 0.4, 0.6, 0.8, 1]), `${size.width}×${size.height}`).toEqual([]);
    }
  });

  test("Motion off: a plain section", async ({ page }) => {
    await motionOff(page);
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "how");
    await expect(page.locator("#how")).not.toHaveClass(/is-pinned/);
    await expect(page.locator("#how .chapters-instrument")).toBeHidden();
  });
});
```
Add one dense sweep to `collisions.spec.ts`: `collisionsTopToBottom(page, { ...INSTRUMENTS, panels: [...INSTRUMENTS.panels, ".chapter-card"], step: 0.15 })` at 1440×900 and 390×844, Motion on, expecting `[]`.

Run: `npx playwright test tests/e2e/journey/chapters.spec.ts --project=desktop`
Expected: FAIL (`#how` never gets `is-pinned`).

- [ ] **Step 4: Write the pinned styles**

Append to `journey-island.css`:
```css
/* ---- 02 · pinned: the section holds under the masthead while its three stops play in one dial. Only while it
   fits (chapters.ts adds .is-pinned after measuring each stop open); otherwise it stays the plain section. */
html[data-motion="on"][data-journey="on"] .chapters.is-pinned { position: relative; height: 330vh; padding-top: 0; padding-bottom: 0; }
html[data-motion="on"][data-journey="on"] .is-pinned .chapters-pin {
  position: sticky; z-index: 2; top: var(--header-height); height: calc(100svh - var(--header-height)); min-height: 560px;
  display: grid; grid-template-columns: minmax(0, 27rem) minmax(0, 1fr); column-gap: clamp(24px, 4vw, 64px); align-items: center;
}
html[data-motion="on"][data-journey="on"] .is-pinned .chapters-instrument { display: flex; flex-direction: column; align-items: center; gap: 14px; min-width: 0; }
html[data-motion="on"][data-journey="on"] .is-pinned .rail-marker { display: block; }
html[data-motion="on"][data-journey="on"] .is-pinned .chapters-dial { width: min(100%, calc(100svh - var(--header-height) - 12.5rem), 560px); }
html[data-motion="on"][data-journey="on"] .is-pinned .chapters-steps { display: flex; flex-direction: column; gap: 22px; margin-top: 20px; }
html[data-motion="on"][data-journey="on"] .is-pinned .chapters-steps > li:not(.is-current) :is(h3, p) { color: var(--ink-3); }
html[data-motion="on"][data-journey="on"] .is-pinned .chapters-steps > li.is-current h3 { color: var(--ink-1); }
@media (max-width: 63.99rem) {
  html[data-motion="on"][data-journey="on"] .chapters.is-pinned { height: 300vh; }
  html[data-motion="on"][data-journey="on"] .is-pinned .chapters-pin { grid-template-columns: 1fr; grid-template-rows: auto auto; align-content: start; row-gap: 4px; padding-top: 12px; min-height: 0; }
  html[data-motion="on"][data-journey="on"] .is-pinned .chapters-instrument { grid-row: 1; }
  html[data-motion="on"][data-journey="on"] .is-pinned .chapters-dial { width: min(84%, 34vh, 360px, calc(100svh - var(--header-height) - 21rem)); }
  html[data-motion="on"][data-journey="on"] .is-pinned .chapters-copy { grid-row: 2; }
  html[data-motion="on"][data-journey="on"] .is-pinned .chapters-copy > :is(span, hr, .chapters-rail) { display: none; }
  html[data-motion="on"][data-journey="on"] .is-pinned .chapters-copy h2 { font-size: var(--text-h3); line-height: var(--text-h3--line-height); }
  html[data-motion="on"][data-journey="on"] .is-pinned .chapters-steps { gap: 8px; margin-top: 10px; }
  html[data-motion="on"][data-journey="on"] .is-pinned .chapters-steps > li:not(.is-current) p { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  html[data-motion="on"][data-journey="on"] .is-pinned .chapter-card { display: none; }
}
/* Short windows: only the current stop's words. */
@media (min-width: 64rem) and (max-height: 760px) {
  html[data-motion="on"][data-journey="on"] .is-pinned .chapters-steps { gap: 12px; margin-top: 14px; }
  html[data-motion="on"][data-journey="on"] .is-pinned .chapters-steps > li:not(.is-current) p { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  html[data-motion="on"][data-journey="on"] .is-pinned .chapters-dial { width: min(100%, calc(100svh - var(--header-height) - 11rem), 520px); }
}
/* A phone on its side: the dial beside the stops. */
@media (max-height: 520px) and (orientation: landscape) {
  html[data-motion="on"][data-journey="on"] .is-pinned .chapters-pin { grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: auto; align-content: center; padding-top: 0; column-gap: 24px; }
  html[data-motion="on"][data-journey="on"] .is-pinned .chapters-copy { grid-row: 1; grid-column: 1; }
  html[data-motion="on"][data-journey="on"] .is-pinned .chapters-instrument { grid-row: 1; grid-column: 2; }
  html[data-motion="on"][data-journey="on"] .is-pinned .chapters-dial { width: min(38vw, calc(100svh - var(--header-height) - 28px)); }
  html[data-motion="on"][data-journey="on"] .is-pinned .chapter-card { display: none; }
}
html[data-motion="on"][data-journey="on"] .is-pinned .chapters-dial .is-dashed,
html[data-motion="on"][data-journey="on"] .is-pinned .dial-sweep { transform-box: view-box; transform-origin: 0 0; }
```
Confirm the h2's type role on narrow screens: v3 used 1.5rem / 1.75rem. Pick the `--text-*` token that matches from `tokens.css` (the name above is a guess). Name the one you used in the report.

- [ ] **Step 5: Write the chapters module**

`src/components/landing/journey/chapters.ts`:
```ts
import { animate, onScroll, stagger, utils, type JSAnimation } from "animejs";
import { messages } from "@/messages";
import { formatPnr } from "@/utils/pnr";
import { barWidth, chapterAt, stepLit, typedCount } from "./chapters-progress";
import { ease } from "./ease";
import { fitsWindow, type Span } from "./fit";
import { LAYOUT_EVENT, REBUILD_EVENT } from "./journey-events";
import { SMOOTH, STAGGER, T } from "./motion-tokens";
import { track } from "./observers";
import type { JourneyContext, Teardown } from "./start-journey";

// 02 pinned (spec §3.A): the section holds under the masthead while the scroll plays its three stops inside
// one dial, and the trace card prints each. Pinned only while every stop fits the window (fitsPinned); a fit
// that changes rebuilds the journey (tt:rebuild). Motion off: the plain section.

const m = messages.journey.chapters;

function headerOffset(): number {
  return Math.round(document.querySelector("header")?.getBoundingClientRect().height ?? 64);
}

function span(el: Element | null): Span | null {
  if (!el || getComputedStyle(el).display === "none") return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom };
}

/** Pins the section, opens each stop in turn, and keeps the pin only if every stop fits the window. */
function fitsPinned(section: HTMLElement): boolean {
  section.classList.add("is-pinned");
  const pin = section.querySelector(".chapters-pin");
  const items = [...section.querySelectorAll<HTMLElement>("li[data-chapter]")];
  const was = items.map((li) => li.classList.contains("is-current"));
  const pr = pin?.getBoundingClientRect();
  const ok =
    pr !== undefined &&
    items.every((open) => {
      items.forEach((li) => li.classList.toggle("is-current", li === open));
      const parts = [span(section.querySelector(".chapters-copy")), span(section.querySelector(".chapters-instrument"))];
      return fitsWindow(parts, { top: pr.top, bottom: pr.bottom }, pr.top + window.innerHeight - headerOffset());
    });
  items.forEach((li, k) => li.classList.toggle("is-current", was[k] ?? false));
  if (!ok) section.classList.remove("is-pinned");
  return ok;
}

export function startChapters({ motion }: JourneyContext): Teardown {
  const section = document.getElementById("how");
  const dial = section?.querySelector<SVGSVGElement>(".chapters-dial svg");
  if (!section || !dial || !motion) return () => {};
  const pinned = fitsPinned(section);
  let refitTimer = 0;
  const onLayout = () => {
    window.clearTimeout(refitTimer);
    refitTimer = window.setTimeout(() => {
      if (fitsPinned(section) !== pinned) window.dispatchEvent(new Event(REBUILD_EVENT));
    }, 200);
  };
  window.addEventListener("resize", onLayout);
  window.addEventListener(LAYOUT_EVENT, onLayout);
  const stopListening = () => {
    window.clearTimeout(refitTimer);
    window.removeEventListener("resize", onLayout);
    window.removeEventListener(LAYOUT_EVENT, onLayout);
  };
  if (!pinned) return stopListening;

  const q = <E extends Element>(sel: string) => [...section.querySelectorAll<E>(sel)];
  const items = q<HTMLElement>("li[data-chapter]");
  const arcs = q<SVGPathElement>(".chapter-arc");
  const labels = q<SVGTextElement>(".chapter-label");
  const layers = q<SVGGElement>("[data-layer]");
  const cards = q<HTMLElement>("pre[data-card]");
  const segs = [...dial.querySelectorAll<SVGPathElement>(".dial-seg")];
  const bars = q<SVGRectElement>(".chapter-bar");
  const steps = q<SVGCircleElement>(".chapter-step");
  const count = section.querySelector<HTMLElement>(".chapter-step-count");
  const digits = section.querySelector<SVGTextElement>(".chapter-digits");
  const pulse = section.querySelector<SVGCircleElement>(".chapter-pulse");
  const sweep = dial.querySelector<SVGPathElement>(".dial-sweep");
  const dashed = dial.querySelector<SVGCircleElement>(".is-dashed");
  const marker = section.querySelector<HTMLElement>(".rail-marker");
  const pnr = dial.dataset.pnr ?? "";
  const flourish: JSAnimation[] = [];
  const state = { p: 0 };
  let current = -1;

  const enter = (i: number) => {
    items.forEach((li, k) => li.classList.toggle("is-current", k === i));
    arcs.forEach((a, k) => a.classList.toggle("is-on", k <= i));
    labels.forEach((l, k) => l.classList.toggle("is-steel", k === i));
    layers.forEach((g, k) => g.classList.toggle("is-current", k === i));
    cards.forEach((c, k) => c.classList.toggle("is-current", k === i));
    if (count) count.textContent = m.step(i + 1, 3);
    const shown = [...(layers[i]?.querySelectorAll("text, rect") ?? [])];
    if (shown.length) flourish.push(animate(shown, { translateY: [10, 0], delay: stagger(i === 1 ? STAGGER.char : STAGGER.row), duration: T.base, ease: ease.expo() }));
  };
  const render = () => {
    const { i, t } = chapterAt(state.p);
    if (i !== current) {
      current = i;
      enter(i);
    }
    if (marker) marker.style.left = `${(state.p * 100).toFixed(2)}%`;
    const typed = i === 0 ? typedCount(t) : 10;
    segs.forEach((s, k) => {
      s.classList.toggle("is-on", k < typed);
      s.classList.toggle("is-current", k === typed && typed < 10);
    });
    if (i === 0 && digits) digits.textContent = typed ? formatPnr(pnr.slice(0, typed)) : m.noDigits;
    if (i === 1) {
      bars.forEach((b, k) => {
        const w = barWidth(k, t);
        b.setAttribute("x", (-w / 2).toFixed(1));
        b.setAttribute("width", w.toFixed(1));
      });
      pulse?.setAttribute("cx", (-190 + 380 * t).toFixed(1));
      steps.forEach((s, k) => (s.style.opacity = stepLit(k, t) ? "1" : "0.25"));
    }
    if (sweep) {
      sweep.style.opacity = i === 1 ? "1" : "0";
      sweep.style.transform = i === 1 ? `rotate(${(t * 300).toFixed(1)}deg)` : "";
    }
  };

  const observer = track(onScroll({ target: section, enter: () => `top+=${headerOffset()} top`, leave: "bottom bottom", sync: SMOOTH }));
  const drive = animate(state, { p: [0, 1], ease: "linear", duration: 1000, onUpdate: render, autoplay: observer });
  const ring = dashed ? animate(dashed, { rotate: "-=360", duration: 90_000, loop: true, ease: "linear" }) : null;
  render();

  return () => {
    stopListening();
    drive.revert();
    observer.revert();
    ring?.revert();
    for (const f of flourish) f.revert();
    utils.remove([...segs, ...bars]);
    items.forEach((li) => li.classList.remove("is-current"));
    arcs.forEach((a) => a.classList.remove("is-on"));
    labels.forEach((l) => l.classList.remove("is-steel"));
    layers.forEach((g, k) => g.classList.toggle("is-current", k === 0));
    cards.forEach((c, k) => c.classList.toggle("is-current", k === 0));
    segs.forEach((s) => s.classList.remove("is-on", "is-current"));
    bars.forEach((b) => {
      b.setAttribute("x", "-120");
      b.setAttribute("width", "240");
    });
    pulse?.setAttribute("cx", "-190");
    steps.forEach((s) => s.style.removeProperty("opacity"));
    sweep?.style.removeProperty("opacity");
    sweep?.style.removeProperty("transform");
    marker?.style.removeProperty("left");
    if (count) count.textContent = m.step(1, 3);
    if (digits) digits.textContent = m.noDigits;
    section.classList.remove("is-pinned");
  };
}
```
With `autoplay: observer`, Anime.js drives the animation's progress from the scroll, so `duration: 1000` is a nominal span (v3's idiom). Check that the installed `ScrollObserverParams.enter` accepts a callback; if not, pass the string, refresh the observer on `tt:layout` (`refreshAll` already does), and say so.

Register it: `MODULES = [startArrivals, startBoard, startStrip, startHero, startChapters]`.

- [ ] **Step 6: Run the chapters e2e, the dense sweep, and the responsive spec**

Run: `npx playwright test tests/e2e/journey/chapters.spec.ts tests/e2e/journey/collisions.spec.ts tests/e2e/responsive.spec.ts tests/e2e/smoothness.spec.ts`
Expected: PASS on both projects.
- At 1440×600, the section may pin with compact stops or stay plain. Either is right, provided nothing collides. Report which it chose.
- At 844×390, the dial sits beside the stops, or the section stays plain.

Take 1440×900 screenshots at stops 01, 02 and 03, and one at 390×844. Compare them with v3 at the same sizes, and describe any difference in the report.

- [ ] **Step 7: The whole gate, then commit**

```bash
npm run check && npx playwright test tests/e2e/journey/ tests/e2e/axe.spec.ts
git add src tests
git commit -m "feat(journey): pin 02's three stops inside one dial, only while they fit the window"
```

### Task 9: The berth plan draws itself, and the clock's second hand sweeps

**Files:**
- Create: `src/components/landing/journey/{berths.ts,clock.ts}`
- Modify: `src/components/landing/journey/{station-clock.tsx,geometry/clock.ts,start-journey.ts}`, `src/styles/journey.css`, `src/styles/journey-island.css`
- Modify: the clock geometry unit test (`tests/unit/components/landing/journey/clock.test.ts`)
- Create: `tests/e2e/journey/record-and-clock.spec.ts`

**Interfaces:**
- Consumes: `watchEntrances` (Task 2); J2's `.berth-plan` markup (`.plan-line`, `.plan-berth`, `.is-lit`) and the station clock.
- Produces: `secondAngle(now: Date): number` (in `geometry/clock.ts`), `startBerths: JourneyModule`, `startClock: JourneyModule`, and the clock's `.clock-hand.is-second`.

The spec's rows:
- **03:** the berth plan beside the specimen, and the sample passenger's berth lights. Motion off: the plan is drawn still.
- **04:** the station clock with a sweeping second hand. Motion off: the hands at rest.

§3.A lists the berths among the pieces that follow the scroll both ways, so the plan's drawing replays like an entrance. Ruling 6: the second hand is the journey's alone.

- [ ] **Step 1: Write the failing second-hand test**

Add to the clock geometry test:
```ts
  it("turns the second hand 6° a second, sweeping through the milliseconds", () => {
    expect(secondAngle(new Date("2026-09-17T06:30:00.000Z"))).toBe(0);
    expect(secondAngle(new Date("2026-09-17T06:30:15.500Z"))).toBe(93);
    expect(secondAngle(new Date("2026-09-17T06:30:59.999Z"))).toBeCloseTo(359.99, 2);
  });
```
Run it: FAIL (`secondAngle` is not exported).

- [ ] **Step 2: Write it, and draw the hand**

Append to `geometry/clock.ts`:
```ts
/** The second hand's angle, sweeping: 6° a second, through the milliseconds. IST is a whole number of minutes
 * from UTC, so the seconds are the same. */
export function secondAngle(now: Date): number {
  return round2((now.getUTCSeconds() + now.getUTCMilliseconds() / 1000) * 6);
}
```
Import `round2` from `./dial` if the file does not already.

In `station-clock.tsx`, inside the `angles ? (<>…</>)` fragment, after the minute hand, add the second hand. It has no `transform`: the journey alone turns it.
```tsx
            <line x1={0} y1={16} x2={0} y2={-78} className="clock-hand is-second" />
```
Update the component's doc comment, replacing "J3 adds the sweeping second hand." with: "The second hand is the journey's (clock.ts): it shows and sweeps only while the journey runs with Motion on, so React never writes its angle."

In `journey.css`, in the clock block: `.clock-hand.is-second { display: none; stroke: var(--accent); stroke-width: 1; }`.
Append to `journey-island.css`:
```css
/* ---- 04 · the station clock's second hand sweeps, while the journey runs with Motion on */
html[data-motion="on"][data-journey="on"] .clock-hand.is-second { display: inline; }
```
Run the geometry test: PASS.

- [ ] **Step 3: Write the failing e2e**

`tests/e2e/journey/record-and-clock.spec.ts`:
```ts
import { expect, test } from "@playwright/test";
import { motionOff, scrollToId, waitForJourney } from "./journey-helpers";

test.describe("03 and 04, moving", () => {
  test("the berth plan draws itself on arrival, then lights the berth", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "terminus");
    await expect(page.locator(".berth-plan .plan-berth.is-lit")).toHaveCount(0);
    await scrollToId(page, "record", 40);
    await page.locator(".berth-plan").scrollIntoViewIfNeeded();
    await expect(page.locator(".berth-plan .plan-berth.is-lit")).toHaveCount(1, { timeout: 4_000 });
    await expect(page.locator(".berth-cap")).toContainText("12 LB");
  });

  test("the second hand sweeps while the clock is on screen", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "reliability", 40);
    const hand = page.locator(".station-clock .clock-hand.is-second");
    await expect(hand).toBeVisible();
    const first = await hand.getAttribute("transform");
    await page.waitForTimeout(1_200);
    expect(await hand.getAttribute("transform")).not.toBe(first);
  });

  test("Motion off: the plan is drawn and lit from the start, and there is no second hand", async ({ page }) => {
    await motionOff(page);
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "terminus");
    await expect(page.locator(".berth-plan .plan-berth.is-lit")).toHaveCount(1);
    await scrollToId(page, "reliability", 40);
    await expect(page.locator(".station-clock .clock-hand.is-second")).toBeHidden();
  });
});
```
Run it: FAIL. The berth stays lit out of sight, and the hand is hidden.

- [ ] **Step 4: Write the two modules**

`src/components/landing/journey/berths.ts`:
```ts
import { animate, createTimer, stagger, svg, utils, type JSAnimation, type Timer } from "animejs";
import { ease } from "./ease";
import { T } from "./motion-tokens";
import { watchEntrances } from "./observers";
import type { JourneyContext, Teardown } from "./start-journey";

// 03 · the berth plan while the journey runs (spec §3.A): whenever it comes into view it draws itself, line by
// line, then the sample passenger's berth lights with one bright pulse. Out of sight it waits undrawn and unlit.
// Motion off: drawn and lit, as the server made it.

export function startBerths({ motion }: JourneyContext): Teardown {
  const drawing = document.querySelector<SVGSVGElement>(".berth-plan svg");
  if (!drawing || !motion) return () => {};
  const strokes = [...drawing.querySelectorAll<SVGGeometryElement>(".plan-line, .plan-berth")];
  const lit = [...drawing.querySelectorAll<SVGElement>(".is-lit")];
  const berth = drawing.querySelector<SVGRectElement>(".plan-berth.is-lit");
  let running: (JSAnimation | Timer)[] = [];
  const stop = () => {
    for (const a of running) a.revert();
    running = [];
  };
  const light = (on: boolean) => lit.forEach((el) => el.classList.toggle("is-lit", on));
  return watchEntrances([
    {
      trigger: drawing,
      at: 0.9,
      arm: () => {
        stop();
        light(false);
        running.push(utils.set(svg.createDrawable(strokes), { draw: "0 0" }));
      },
      play: () => {
        running.push(animate(svg.createDrawable(strokes), { draw: ["0 0", "0 1"], duration: T.draw, delay: stagger(10), ease: ease.inOut() }));
        running.push(createTimer({ duration: T.draw + 300, onComplete: () => light(true) }));
        if (berth) running.push(animate(berth, { strokeWidth: [{ to: 3, duration: 200, delay: T.draw + 320 }, { to: 1.5, duration: 500 }], ease: ease.out() }));
      },
      settle: () => {
        stop();
        light(true);
      },
    },
  ]);
}
```
`src/components/landing/journey/clock.ts`:
```ts
import { secondAngle } from "./geometry/clock";
import type { JourneyContext, Teardown } from "./start-journey";

// 04 · the station clock's second hand (spec §3.A): it sweeps every frame while the clock is on screen, and
// rests off it. React draws the hand without an angle; only this module turns it. Motion off: no second hand.

export function startClock({ motion }: JourneyContext): Teardown {
  const hand = document.querySelector<SVGLineElement>(".station-clock .clock-hand.is-second");
  if (!hand || !motion) return () => {};
  let frame = 0;
  let visible = false;
  const loop = () => {
    hand.setAttribute("transform", `rotate(${secondAngle(new Date())})`);
    frame = visible ? requestAnimationFrame(loop) : 0;
  };
  const io = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false;
    if (visible && !frame) frame = requestAnimationFrame(loop);
  });
  io.observe(hand.ownerSVGElement ?? hand);
  loop();
  return () => {
    io.disconnect();
    cancelAnimationFrame(frame);
    hand.removeAttribute("transform");
  };
}
```
The hand exists once `StationClock` has read the time, which happens at hydration, before the idle import. If a test shows the module starting before the hand exists, look it up inside `loop` instead, and say so.

Register both: `MODULES = [startArrivals, startBoard, startStrip, startHero, startChapters, startBerths, startClock]`.

- [ ] **Step 5: Run the e2e, and J2's instruments spec**

Run: `npx playwright test tests/e2e/journey/record-and-clock.spec.ts tests/e2e/journey/instruments.spec.ts`
Expected: PASS on both projects. J2's minute-hand check is unchanged.

- [ ] **Step 6: The whole gate, then commit**

```bash
npm run check && npx playwright test tests/e2e/journey/
git add src tests
git commit -m "feat(journey): the berth plan draws itself and lights its berth, and the clock's second hand sweeps"
```

### Task 10: The route lays its line

**Files:**
- Create: `src/components/landing/journey/route.ts`, `tests/e2e/journey/route.spec.ts`
- Modify: `src/components/landing/journey/{geometry/route.ts,route-map.tsx,start-journey.ts}`, `src/styles/journey-island.css`
- Modify: the route geometry unit test (`tests/unit/components/landing/journey/route.test.ts`)

**Interfaces:**
- Consumes: J2's `routeStops`, `routeSleepers`; `track`, `SMOOTH`.
- Produces:
  - `sleeperFractions(stops, spacing = 14): readonly number[]` and `stopFractions(stops): readonly number[]`: each sleeper's and each stop's place along the path, 0–1 of its length.
  - `RouteMap` writes them as `data-t` on each `.route-sleeper` and each stop's `<g>`.
  - `startRoute: JourneyModule`.

Spec §3.A, 05: the route line lays its sleepers, and a train follows the curve, lighting each row. Motion off: the line is drawn still. The server's map is the finished line. The journey un-lays it and lays it again as the page scrolls, both ways (v3's `roadmap()`, `onScroll` from 75% of the window to 90%).

- [ ] **Step 1: Write the failing geometry test**

Add to the route geometry test:
```ts
  it("places each sleeper and each stop along the line, as fractions of its length", () => {
    const stops = routeStops(7);
    const sleepers = sleeperFractions(stops);
    expect(sleepers).toHaveLength(routeSleepers(stops).length);
    expect(sleepers[0]).toBe(0);
    expect(sleepers.every((t, i) => i === 0 || t > sleepers[i - 1]!)).toBe(true);
    expect(sleepers.at(-1)!).toBeLessThanOrEqual(1);
    const at = stopFractions(stops);
    expect(at).toHaveLength(7);
    expect(at[0]!).toBeGreaterThan(0);
    expect(at.at(-1)!).toBeLessThan(1);
    expect(at.every((t, i) => i === 0 || t > at[i - 1]!)).toBe(true);
  });
```
Run it: FAIL (the functions are not exported).

- [ ] **Step 2: Write them**

In `geometry/route.ts`, lift the sampling out of `routeSleepers` into a helper, so all three share one measurement of the path. Keep `routeSleepers`' output byte-identical.
```ts
interface Sampled {
  readonly samples: readonly RoutePoint[];
  readonly lengths: readonly number[];
  readonly total: number;
}

/** The path sampled 64 times per segment, with the running arc length at each sample. */
function sample(stops: readonly RoutePoint[]): Sampled {
  const samples = segments(stops).flatMap((s, index) => Array.from({ length: 64 + (index === 0 ? 1 : 0) }, (_, i) => pointAt(s, (index === 0 ? i : i + 1) / 64)));
  const lengths = samples.reduce<number[]>((acc, p, i) => [...acc, i === 0 ? 0 : acc[i - 1]! + Math.hypot(p.x - samples[i - 1]!.x, p.y - samples[i - 1]!.y)], []);
  return { samples, lengths, total: lengths.at(-1)! };
}

/** Each sleeper's place along the line, 0–1, in routeSleepers' order. */
export function sleeperFractions(stops: readonly RoutePoint[], spacing = 14): readonly number[] {
  const { total } = sample(stops);
  return Array.from({ length: Math.floor(total / spacing) + 1 }, (_, k) => Math.round(((k * spacing) / total) * 10_000) / 10_000);
}

/** Each stop's place along the line, 0–1. Stop k ends segment k + 1 (segment 0 is the lead-in). */
export function stopFractions(stops: readonly RoutePoint[]): readonly number[] {
  const { lengths, total } = sample(stops);
  return stops.map((_, k) => Math.round((lengths[64 * (k + 1)]! / total) * 10_000) / 10_000);
}
```
`routeSleepers` then starts `const { samples, lengths, total } = sample(stops);`, and the rest of its body is unchanged.

In `route-map.tsx`:
- Compute `const laid = sleeperFractions(stops);` and `const at = stopFractions(stops);`.
- Give each sleeper `data-t={laid[i]}`, and each stop's `<g>` `data-t={at[i]}`.
- Update the doc comment: "…drawn still as v3 draws it with Motion off. While the journey runs with Motion on, it lays the line as the page scrolls (route.ts), from each piece's data-t."

Append to `journey-island.css`:
```css
/* ---- 05 · the route: a sleeper fades in as the line is laid; a row lights as the train passes its stop */
html[data-motion="on"][data-journey="on"] .route-sleeper { transition: opacity 160ms var(--ease-out); }
html[data-journey="on"] #roadmap li.is-passed { background: var(--accent-wash); }
```
Run the geometry and route-map unit tests: PASS. J2's route-map test keeps its sleeper and stop counts.

- [ ] **Step 3: Write the failing e2e**

`tests/e2e/journey/route.spec.ts`:
```ts
import { expect, test, type Page } from "@playwright/test";
import { motionOff, waitForJourney } from "./journey-helpers";

async function roadmapAt(page: Page, fraction: number): Promise<void> {
  await page.evaluate((f) => {
    const s = document.getElementById("roadmap")!;
    const top = s.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top - window.innerHeight * 0.75 + (s.offsetHeight + window.innerHeight * 0.65) * f, behavior: "instant" });
  }, fraction);
}
const laid = (page: Page) => page.locator("#roadmap .route-sleeper.is-laid").count();

test.describe("05 · the route, laid by scroll", () => {
  test.skip(({ isMobile }) => isMobile, "the route map draws from 40rem");

  test("lays the line and lights the rows as the page scrolls, and takes them up again going back", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    const all = await page.locator("#roadmap .route-sleeper").count();
    await roadmapAt(page, 0.02);
    await expect.poll(() => laid(page)).toBeLessThan(all / 4);
    await roadmapAt(page, 1.2);
    await expect.poll(() => laid(page)).toBe(all);
    await expect(page.locator("#roadmap li.is-passed")).toHaveCount(7);
    await expect(page.locator("#roadmap .route-train")).toHaveAttribute("transform", /rotate\(/);
    await roadmapAt(page, 0.02);
    await expect.poll(() => laid(page)).toBeLessThan(all / 4);
  });

  test("Motion off: the line is drawn, and no row is lit", async ({ page }) => {
    await motionOff(page);
    await page.goto("/");
    await waitForJourney(page);
    await roadmapAt(page, 0.02);
    const all = await page.locator("#roadmap .route-sleeper").count();
    expect(await laid(page)).toBe(all);
    await expect(page.locator("#roadmap li.is-passed")).toHaveCount(0);
  });
});
```
Run it: FAIL. Every sleeper stays laid.

- [ ] **Step 4: Write the route module**

`src/components/landing/journey/route.ts`:
```ts
import { animate, onScroll } from "animejs";
import { SMOOTH } from "./motion-tokens";
import { track } from "./observers";
import type { JourneyContext, Teardown } from "./start-journey";

// 05 · the roadmap's track while the journey runs (spec §3.A): the scroll lays the line, sleepers a little
// ahead of the train, the train rides the curve, and each stop and its row light as it passes. Both ways.
// Motion off, or where the map is not drawn (phones): the finished line, as the server drew it.

export function startRoute({ motion }: JourneyContext): Teardown {
  const section = document.getElementById("roadmap");
  const map = section?.querySelector<HTMLElement>(".route-map");
  const path = map?.querySelector<SVGPathElement>(".route-path");
  if (!section || !map || !path || !motion || getComputedStyle(map).display === "none") return () => {};
  const total = path.getTotalLength();
  const sleepers = [...map.querySelectorAll<SVGLineElement>(".route-sleeper")].map((el) => ({ el, t: Number(el.dataset.t) }));
  const stops = [...map.querySelectorAll<SVGGElement>("g[data-t]")].map((el) => ({ el, t: Number(el.dataset.t) }));
  const rows = [...section.querySelectorAll<HTMLElement>("li")];
  const train = map.querySelector<SVGGElement>(".route-train");
  const rest = train?.getAttribute("transform") ?? null;

  const paint = (p: number) => {
    const len = total * p;
    path.style.strokeDasharray = `${len.toFixed(1)} ${total.toFixed(1)}`;
    for (const s of sleepers) s.el.classList.toggle("is-laid", s.t <= p + 0.035);
    const at = path.getPointAtLength(Math.max(0.01, len));
    const ahead = path.getPointAtLength(Math.min(total, len + 2));
    const deg = (Math.atan2(ahead.y - at.y, ahead.x - at.x) * 180) / Math.PI;
    train?.setAttribute("transform", `translate(${at.x.toFixed(1)} ${at.y.toFixed(1)}) rotate(${deg.toFixed(1)})`);
    stops.forEach((s, i) => {
      const passed = p >= s.t - 0.004;
      s.el.classList.toggle("is-passed", passed);
      rows[i]?.classList.toggle("is-passed", passed);
    });
  };

  const state = { p: 0 };
  paint(0);
  const observer = track(onScroll({ target: section, enter: "bottom-=25% top", leave: "bottom-=10% bottom", sync: SMOOTH }));
  const drive = animate(state, { p: [0, 1], ease: "linear", duration: 1000, onUpdate: () => paint(state.p), autoplay: observer });

  return () => {
    drive.revert();
    observer.revert();
    path.style.removeProperty("stroke-dasharray");
    for (const s of sleepers) s.el.classList.add("is-laid");
    for (const s of stops) s.el.classList.add("is-passed");
    for (const r of rows) r.classList.remove("is-passed");
    if (train && rest !== null) train.setAttribute("transform", rest);
  };
}
```
The thresholds are v3's. In Anime.js's `"<container> <target>"` form, the line starts when the section's top reaches 75% of the window, and ends when its bottom reaches 90%. Confirm this against the installed `onScroll`, and adjust the e2e's `roadmapAt` if the start differs, reporting how.

Register it: `MODULES = [startArrivals, startBoard, startStrip, startHero, startChapters, startBerths, startClock, startRoute]`.

- [ ] **Step 5: Run the e2e, and the instruments and collisions specs**

Run: `npx playwright test tests/e2e/journey/route.spec.ts tests/e2e/journey/instruments.spec.ts tests/e2e/journey/collisions.spec.ts`
Expected: PASS.

- [ ] **Step 6: The whole gate, then commit**

```bash
npm run check && npx playwright test tests/e2e/journey/
git add src tests
git commit -m "feat(journey): the roadmap's line is laid as the page scrolls, and each row lights as the train passes"
```

### Task 11: The registration-mark cursor

**Files:**
- Create: `src/components/landing/journey/cursor.ts`, `tests/e2e/journey/cursor.spec.ts`
- Modify: `src/components/landing/journey/start-journey.ts`, `src/styles/journey-island.css`

**Interfaces:**
- Consumes: `ease` (Task 1).
- Produces: `startCursor: JourneyModule`, which appends one `.reg-cursor` to `<body>` and adds `html.has-reg-cursor` while it lives.

Spec §3.A, page-wide: a registration-mark cursor, on a fine pointer with Motion on. It is v3's `cursor.js`:
- a 22px cross follows the pointer;
- over a control, it opens into four corner marks framing the control, plus 10px;
- over a text field, it gives way to the native caret;
- it squeezes while pressed;
- it hides when the pointer leaves the window.

It has `pointer-events: none` and is `aria-hidden`, so hit-testing and assistive tech never meet it.

- [ ] **Step 1: Write the failing e2e**

`tests/e2e/journey/cursor.spec.ts`:
```ts
import { expect, test } from "@playwright/test";
import { motionOff, waitForJourney } from "./journey-helpers";

test.describe("the registration-mark cursor", () => {
  test("frames a control, gives way to the caret in a text field", async ({ page, isMobile }) => {
    test.skip(isMobile, "fine pointers only");
    await page.goto("/");
    await waitForJourney(page);
    const cursor = page.locator(".reg-cursor");
    await expect(cursor).toBeAttached();
    await expect(page.locator("html")).toHaveClass(/has-reg-cursor/);
    await page.getByRole("link", { name: /watchlist/i }).first().hover();
    await expect(cursor).toHaveClass(/is-snapped/);
    await page.getByTestId("hero-instrument").getByRole("textbox").hover();
    await expect(cursor).toHaveClass(/is-off/);
    expect(await page.getByTestId("hero-instrument").getByRole("textbox").evaluate((el) => getComputedStyle(el).cursor)).toBe("text");
  });

  test("none on a touch screen", async ({ page, isMobile }) => {
    test.skip(!isMobile, "touch only");
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator(".reg-cursor")).toHaveCount(0);
  });

  test("none with Motion off", async ({ page }) => {
    await motionOff(page);
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator(".reg-cursor")).toHaveCount(0);
    await expect(page.locator("html")).not.toHaveClass(/has-reg-cursor/);
  });
});
```
The masthead's Watchlist link is the control to hover; copy its locator from `tests/e2e/press.spec.ts` if that spec names it differently. Run: FAIL (no `.reg-cursor`).

- [ ] **Step 2: Write the cursor and its styles**

`src/components/landing/journey/cursor.ts`:
```ts
import { createAnimatable, utils } from "animejs";
import { ease } from "./ease";
import type { JourneyContext, Teardown } from "./start-journey";

// The registration-mark cursor (spec §3.A, page-wide): a hairline cross that follows the pointer and opens into
// four corner marks framing any control it rests on. Fine pointers with Motion on only. Over a text field it
// gives way to the native caret. It never takes a click (pointer-events: none) and is hidden from assistive tech.

const INTERACTIVE = 'a[href], button, [role="button"], [role="switch"], summary, label[for], select';
const NATIVE = 'input, textarea, [contenteditable="true"]';

export function startCursor({ motion }: JourneyContext): Teardown {
  if (!motion || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return () => {};
  const html = document.documentElement;
  const el = document.createElement("div");
  el.className = "reg-cursor is-off";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = '<span class="reg-cross"></span><span class="reg-frame"><i class="reg-mark tl"></i><i class="reg-mark tr"></i><i class="reg-mark bl"></i><i class="reg-mark br"></i></span>';
  document.body.append(el);
  html.classList.add("has-reg-cursor");
  const frameEl = el.querySelector<HTMLElement>(".reg-frame")!;
  const follow = createAnimatable(el, { x: { unit: "px", duration: 110 }, y: { unit: "px", duration: 110 }, ease: ease.out() });
  const frame = createAnimatable(frameEl, { width: { unit: "px", duration: 180 }, height: { unit: "px", duration: 180 }, ease: ease.expo() });

  const onMove = (e: PointerEvent) => {
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest(NATIVE)) {
      el.classList.add("is-off");
      return;
    }
    el.classList.remove("is-off");
    const hit = target?.closest(INTERACTIVE) ?? null;
    if (hit) {
      const r = hit.getBoundingClientRect();
      follow.x(r.left + r.width / 2);
      follow.y(r.top + r.height / 2);
      frame.width(r.width + 10);
      frame.height(r.height + 10);
      el.classList.add("is-snapped");
    } else {
      follow.x(e.clientX);
      follow.y(e.clientY);
      frame.width(22);
      frame.height(22);
      el.classList.remove("is-snapped");
    }
  };
  const onDown = () => el.classList.add("is-down");
  const onUp = () => el.classList.remove("is-down");
  const onLeave = () => el.classList.add("is-off");
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onDown, { passive: true });
  window.addEventListener("pointerup", onUp, { passive: true });
  document.documentElement.addEventListener("pointerleave", onLeave);
  return () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointerup", onUp);
    document.documentElement.removeEventListener("pointerleave", onLeave);
    follow.revert();
    frame.revert();
    utils.remove([el, frameEl]);
    el.remove();
    html.classList.remove("has-reg-cursor");
  };
}
```
Append to `journey-island.css`:
```css
/* ---- The registration-mark cursor (fine pointer, Motion on): the native cursor gives way, except for the
   caret in text fields */
html.has-reg-cursor, html.has-reg-cursor * { cursor: none !important; }
html.has-reg-cursor :is(input, textarea, [contenteditable="true"]) { cursor: text !important; }
.reg-cursor { position: fixed; left: 0; top: 0; z-index: var(--z-toast); pointer-events: none; width: 0; height: 0; color: var(--accent); }
.reg-cursor.is-off { opacity: 0; }
.reg-cross { position: absolute; left: -11px; top: -11px; width: 22px; height: 22px; transition: opacity 120ms var(--ease-out); }
.reg-cross::before, .reg-cross::after { content: ""; position: absolute; background: currentColor; }
.reg-cross::before { left: 10.5px; top: 0; width: 1px; height: 100%; }
.reg-cross::after { top: 10.5px; left: 0; height: 1px; width: 100%; }
.reg-cursor.is-snapped .reg-cross { opacity: 0; }
.reg-frame { position: absolute; left: 0; top: 0; width: 22px; height: 22px; transform: translate(-50%, -50%); opacity: 0; transition: opacity 120ms var(--ease-out); }
.reg-cursor.is-snapped .reg-frame { opacity: 1; }
.reg-mark { position: absolute; width: 9px; height: 9px; }
.reg-mark::before, .reg-mark::after { content: ""; position: absolute; background: currentColor; }
.reg-mark::before { left: 4px; top: 0; width: 1px; height: 100%; }
.reg-mark::after { top: 4px; left: 0; height: 1px; width: 100%; }
.reg-mark.tl { left: -5px; top: -5px; }
.reg-mark.tr { right: -5px; top: -5px; }
.reg-mark.bl { left: -5px; bottom: -5px; }
.reg-mark.br { right: -5px; bottom: -5px; }
.reg-cursor.is-down .reg-cross { transform: scale(0.8); }
```
`--z-toast` is a guess at the top z-token. Read the `--z-*` tokens in `tokens.css`, and take the highest one that still sits under the toast host and dialogs; never use a raw number. The `!important` on `cursor` is v3's, and it is needed: component utilities set `cursor-pointer`.

Register it: append `startCursor` to `MODULES`.

- [ ] **Step 3: Run the e2e and the specs that press and tap**

Run: `npx playwright test tests/e2e/journey/cursor.spec.ts tests/e2e/press.spec.ts tests/e2e/tap-targets.spec.ts tests/e2e/smoothness.spec.ts`
Expected: PASS on both projects. `elementsFromPoint` skips `pointer-events: none`, so tap targets are untouched.

- [ ] **Step 4: The whole gate, then commit**

```bash
npm run check && npx playwright test tests/e2e/journey/
git add src tests
git commit -m "feat(journey): a registration-mark cursor that frames the control beneath it"
```

### Task 12: The Sound switch and its clack

**Files:**
- Create: `src/components/shell/{use-sound.ts,sound-toggle.tsx}`, `src/components/landing/journey/{sound-pace.ts,sound.ts}`
- Modify: `src/components/shell/footer.tsx`, `src/messages/en-IN/shell.ts`, `src/components/landing/journey/start-journey.ts`, `src/styles/journey.css`, `src/styles/journey-island.css`
- Create: `tests/unit/components/landing/journey/sound-pace.test.ts`, `tests/unit/components/shell/sound-toggle.test.tsx`, `tests/e2e/journey/sound.spec.ts`

**Interfaces:**
- Produces:
  - `use-sound.ts`: `SOUND_STORAGE_KEY = "tt.sound"`, `SOUND_EVENT = "tt:sound"`, `SoundDetail { on }`, `soundOn()`, `chooseSound(on)`, `useSound()`.
  - `sound-toggle.tsx`: `SoundToggle`.
  - `sound-pace.ts`: `Pace { travelled; lastClack }`, `START_PACE`, `paceStep(pace, dy, now, speed)`, returning `{ pace; level: number | null }`.
  - `sound.ts`: `startSound: JourneyModule`.
  - Messages: `shell.footer.sound = "Sound"`.

The spec:
- **§2:** sound is off by default: a rail clack behind a footer switch.
- **§3.A Footer:** the Sound switch (off).
- **§3.G:** sound starts only by the reader's hand.

It is v3's `sound.js`:
- **The clack:** a clack sounds for each 120px scrolled, at least 80ms apart, louder with speed (at most 0.32). Each clack is two band-passed noise knocks, 55ms apart.
- **Remembered choice:** the choice is kept (`localStorage["tt.sound"] = "on"`). Even when remembered, the audio context is made only on the reader's first gesture.
- **The switch:** it shows only while the journey runs, since only the journey can sound (nothing inert). Motion does not affect it.
- **The horn:** it waits for J5 (ruling 8).

- [ ] **Step 1: Write the failing pure and switch tests**

`tests/unit/components/landing/journey/sound-pace.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { START_PACE, paceStep } from "@/components/landing/journey/sound-pace";

describe("the clack's pace", () => {
  it("stays silent until 120px have passed", () => {
    const a = paceStep(START_PACE, 70, 1_000, 0.5);
    expect(a.level).toBeNull();
    const b = paceStep(a.pace, -60, 1_100, 0.5);
    expect(b.level).toBeCloseTo(0.12);
    expect(b.pace).toEqual({ travelled: 0, lastClack: 1_100 });
  });
  it("never clacks twice within 80ms, and keeps counting meanwhile", () => {
    const first = paceStep(START_PACE, 200, 1_000, 1);
    const soon = paceStep(first.pace, 200, 1_050, 1);
    expect(soon.level).toBeNull();
    expect(soon.pace.travelled).toBe(200);
  });
  it("grows louder with speed, to 0.32 at most", () => {
    expect(paceStep(START_PACE, 500, 1_000, 10).level).toBe(0.32);
  });
});
```
`tests/unit/components/shell/sound-toggle.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SOUND_EVENT, SOUND_STORAGE_KEY, type SoundDetail } from "@/components/shell/use-sound";
import { SoundToggle } from "@/components/shell/sound-toggle";

describe("SoundToggle", () => {
  it("is off by default", () => {
    render(<SoundToggle />);
    expect(screen.getByRole("switch", { name: "Sound" })).not.toBeChecked();
  });

  it("remembers the choice and tells the page, on and off", async () => {
    const seen: boolean[] = [];
    window.addEventListener(SOUND_EVENT, (e) => seen.push((e as CustomEvent<SoundDetail>).detail.on));
    render(<SoundToggle />);
    const sw = screen.getByRole("switch", { name: "Sound" });
    await userEvent.click(sw);
    expect(sw).toBeChecked();
    expect(window.localStorage.getItem(SOUND_STORAGE_KEY)).toBe("on");
    await userEvent.click(sw);
    expect(window.localStorage.getItem(SOUND_STORAGE_KEY)).toBeNull();
    expect(seen).toEqual([true, false]);
  });
});
```
Run: `npx vitest run tests/unit/components/landing/journey/sound-pace.test.ts tests/unit/components/shell/sound-toggle.test.tsx`
Expected: FAIL (the modules are missing).

- [ ] **Step 2: Write the pace, the store and the switch**

`src/components/landing/journey/sound-pace.ts`:
```ts
// When the rail clack sounds (prototype v3's sound.js): once per 120px scrolled, never within 80ms of the last,
// louder the faster the page moves. Silent when the page stops, because nothing else ever sounds it. Pure.

export interface Pace {
  readonly travelled: number;
  readonly lastClack: number;
}

export const START_PACE: Pace = { travelled: 0, lastClack: -Infinity };

export function paceStep(pace: Pace, dy: number, now: number, speed: number): { readonly pace: Pace; readonly level: number | null } {
  const travelled = pace.travelled + Math.abs(dy);
  if (travelled >= 120 && now - pace.lastClack > 80) return { pace: { travelled: 0, lastClack: now }, level: Math.min(0.32, 0.06 + speed * 0.12) };
  return { pace: { travelled, lastClack: pace.lastClack }, level: null };
}
```
`src/components/shell/use-sound.ts`:
```ts
"use client";

import { useSyncExternalStore } from "react";

// The landing's Sound switch (spec §3.A, Footer): off by default; "on" is remembered. The journey's sound.ts
// listens for SOUND_EVENT and sounds only after the reader's own gesture.

export const SOUND_STORAGE_KEY = "tt.sound";
export const SOUND_EVENT = "tt:sound";

export interface SoundDetail {
  readonly on: boolean;
}

/** This page's choice when storage refuses it (blocked site data): it lasts the visit. */
const memory = { on: false };

export function soundOn(): boolean {
  try {
    return window.localStorage.getItem(SOUND_STORAGE_KEY) === "on";
  } catch {
    return memory.on;
  }
}

export function chooseSound(on: boolean): void {
  memory.on = on;
  try {
    if (on) window.localStorage.setItem(SOUND_STORAGE_KEY, "on");
    else window.localStorage.removeItem(SOUND_STORAGE_KEY);
  } catch {
    // as above
  }
  window.dispatchEvent(new CustomEvent<SoundDetail>(SOUND_EVENT, { detail: { on } }));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === SOUND_STORAGE_KEY || e.key === null) onChange();
  };
  window.addEventListener(SOUND_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(SOUND_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

const assumeOff = (): boolean => false;

/** Sound as the reader chose it. The server and hydration assume off. */
export function useSound(): boolean {
  return useSyncExternalStore(subscribe, soundOn, assumeOff);
}
```
`memory` is a mutable module object by necessity: it is the only place a refused choice can live.

`src/components/shell/sound-toggle.tsx`:
```tsx
"use client";

import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { SWITCH_THUMB, SWITCH_TRACK } from "@/components/ui/switch";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";
import { chooseSound, useSound } from "./use-sound";

/**
 * The landing footer's Sound switch, after Motion: off by default. On, the page's journey sounds a soft rail
 * clack as the page scrolls, starting only from the reader's own gesture. It shows only while the journey
 * runs, since only the journey can sound (journey-island.css).
 */
export function SoundToggle() {
  const on = useSound();
  return (
    <span className="sound-toggle inline-flex items-center">
      <label className="inline-flex cursor-pointer items-center gap-2.5">
        <BaseSwitch.Root checked={on} onCheckedChange={(next) => chooseSound(next)} className={cn(SWITCH_TRACK, "tap-44")}>
          <BaseSwitch.Thumb className={SWITCH_THUMB} />
        </BaseSwitch.Root>
        <span className="font-display text-xs font-semibold uppercase tracking-caps text-ink-1/70">{messages.shell.footer.sound}</span>
      </label>
    </span>
  );
}
```
In `src/messages/en-IN/shell.ts`, `footer` gains `sound: "Sound",` after `motionByDevice`. In `footer.tsx`, import `SoundToggle` and render `<SoundToggle />` after `<MotionToggle />`. Update `FullFooter`'s doc comment: "…the clock, and the Motion and Sound switches."

In `journey.css`, append `.sound-toggle { display: none; }`. Append to `journey-island.css`:
```css
/* ---- The footer's Sound switch: only the journey can sound */
html[data-journey="on"] .sound-toggle { display: inline-flex; }
```
Run the two unit tests: PASS.

- [ ] **Step 3: Write the failing sound e2e**

`tests/e2e/journey/sound.spec.ts`:
```ts
import { expect, test, type Page } from "@playwright/test";
import { blockJourneyChunk, waitForJourney } from "./journey-helpers";

/** Replaces Web Audio with a counter: contexts made, and knocks started. */
async function countAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __audio: { contexts: number; knocks: number } };
    w.__audio = { contexts: 0, knocks: 0 };
    class Param {
      value = 0;
      setValueAtTime() {}
      linearRampToValueAtTime() {}
      exponentialRampToValueAtTime() {}
    }
    class Node {
      gain = new Param();
      frequency = new Param();
      Q = new Param();
      type = "";
      buffer: unknown = null;
      connect<T>(next: T): T {
        return next;
      }
      start() {
        w.__audio.knocks += 1;
      }
      stop() {}
    }
    class Context {
      state = "running";
      currentTime = 0;
      sampleRate = 44_100;
      destination = {};
      constructor() {
        w.__audio.contexts += 1;
      }
      createGain() {
        return new Node();
      }
      createBufferSource() {
        return new Node();
      }
      createBiquadFilter() {
        return new Node();
      }
      createBuffer(_channels: number, length: number) {
        return { getChannelData: () => new Float32Array(length) };
      }
      resume() {
        return Promise.resolve();
      }
      close() {
        return Promise.resolve();
      }
    }
    Object.defineProperty(window, "AudioContext", { value: Context, configurable: true, writable: true });
  });
}
const audio = (page: Page) => page.evaluate(() => (window as unknown as { __audio: { contexts: number; knocks: number } }).__audio);
const scrollBy = (page: Page, px: number) => page.evaluate((by) => window.scrollBy({ top: by, behavior: "instant" }), px);

test.describe("the Sound switch", () => {
  test("is off by default, and scrolling is silent", async ({ page }) => {
    await countAudio(page);
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.getByRole("switch", { name: "Sound" })).not.toBeChecked();
    for (let i = 0; i < 6; i += 1) await scrollBy(page, 200);
    expect(await audio(page)).toEqual({ contexts: 0, knocks: 0 });
  });

  test("switching it on clacks once, and scrolling clacks with the rail", async ({ page }) => {
    await countAudio(page);
    await page.goto("/");
    await waitForJourney(page);
    const sw = page.getByRole("switch", { name: "Sound" });
    await sw.scrollIntoViewIfNeeded();
    await sw.click();
    await expect.poll(() => audio(page)).toEqual({ contexts: 1, knocks: 2 });
    for (let i = 0; i < 6; i += 1) {
      await scrollBy(page, -200);
      await page.waitForTimeout(100);
    }
    expect((await audio(page)).knocks).toBeGreaterThan(2);
  });

  test("remembered, yet silent until the reader's own gesture", async ({ page }) => {
    await countAudio(page);
    await page.addInitScript(() => window.localStorage.setItem("tt.sound", "on"));
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.getByRole("switch", { name: "Sound" })).toBeChecked();
    await scrollBy(page, 600);
    expect((await audio(page)).contexts).toBe(0);
    await page.mouse.click(5, 300);
    await expect.poll(async () => (await audio(page)).contexts).toBe(1);
  });

  test("absent when the journey cannot run", async ({ page }) => {
    await blockJourneyChunk(page);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-journey", "failed", { timeout: 15_000 });
    await expect(page.getByRole("switch", { name: "Sound" })).toBeHidden();
  });
});
```
Loops in tests may use `let`. The pointer click lands on the page's left margin; if that hits a control at 5,300, pick a blank point and say which. Run: FAIL (no Sound switch).

- [ ] **Step 4: Write the sound module**

`src/components/landing/journey/sound.ts`:
```ts
import { SOUND_EVENT, soundOn, type SoundDetail } from "@/components/shell/use-sound";
import { START_PACE, paceStep } from "./sound-pace";
import type { Teardown } from "./start-journey";

// The rail clack (spec §2, §3.A Footer, §3.G): synthesised, no samples. A quarter-second of decaying noise,
// made once, is band-passed into two knocks 55ms apart. The audio context is made only by the reader's own
// gesture: the switch itself, or a first pointer or key press while a remembered choice is on.

interface Audio {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly noise: AudioBuffer;
}

export function startSound(): Teardown {
  let audio: Audio | null = null;
  let pace = START_PACE;
  let lastY = window.scrollY;
  let lastT = performance.now();

  const wake = (): Audio | null => {
    if (!audio) {
      if (typeof window.AudioContext !== "function") return null;
      const ctx = new window.AudioContext();
      const master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      const length = Math.floor(ctx.sampleRate * 0.25);
      const noise = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      audio = { ctx, master, noise };
    }
    if (audio.ctx.state === "suspended") void audio.ctx.resume().catch(() => undefined);
    return audio;
  };
  const knock = (a: Audio, at: number, level: number) => {
    const src = a.ctx.createBufferSource();
    src.buffer = a.noise;
    const band = a.ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 1900 + Math.random() * 500;
    band.Q.value = 4;
    const gain = a.ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
    src.connect(band).connect(gain).connect(a.master);
    src.start(at);
    src.stop(at + 0.1);
  };
  const clack = (a: Audio, level: number) => {
    const now = a.ctx.currentTime;
    knock(a, now, level);
    knock(a, now + 0.055, level * 0.8);
  };

  const onScroll = () => {
    const y = window.scrollY;
    const t = performance.now();
    const dy = y - lastY;
    const speed = Math.abs(dy) / Math.max(1, t - lastT);
    lastY = y;
    lastT = t;
    if (!audio || audio.ctx.state !== "running" || !soundOn()) return;
    const step = paceStep(pace, dy, t, speed);
    pace = step.pace;
    if (step.level !== null) clack(audio, step.level);
  };
  const onChoice = (event: Event) => {
    if (!(event as CustomEvent<SoundDetail>).detail.on) return;
    const a = wake();
    if (a) clack(a, 0.12);
  };
  const onGesture = () => {
    if (soundOn()) wake();
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener(SOUND_EVENT, onChoice);
  window.addEventListener("pointerdown", onGesture, { once: true });
  window.addEventListener("keydown", onGesture, { once: true });
  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener(SOUND_EVENT, onChoice);
    window.removeEventListener("pointerdown", onGesture);
    window.removeEventListener("keydown", onGesture);
    void audio?.ctx.close().catch(() => undefined);
    audio = null;
  };
}
```
The switch's click dispatches `tt:sound` synchronously inside the reader's click, so the context is made within their gesture. `startSound` ignores the context (sound is not motion); it still fits `JourneyModule`. Append `startSound` to `MODULES`.

- [ ] **Step 5: Run the sound e2e, the tap targets and axe**

Run: `npx playwright test tests/e2e/journey/sound.spec.ts tests/e2e/tap-targets.spec.ts tests/e2e/axe.spec.ts tests/e2e/motion-switch.spec.ts`
Expected: PASS on both projects. The Sound switch answers a finger across 44px, as J1's Motion switch does.

- [ ] **Step 6: The whole gate, then commit**

```bash
npm run check && npx playwright test tests/e2e/journey/
git add src tests
git commit -m "feat(journey): the Sound switch, off by default, and a rail clack paced by the scroll"
```

### Task 13: The plate morph

**Files:**
- Create: `src/components/pnr/plate-morph.tsx`, `tests/e2e/journey/plate-morph.spec.ts`
- Modify: `src/components/pnr/pnr-terminal.tsx`

**Interfaces:**
- Consumes: `useMotion` (J1), `LAYOUT_EVENT`, and the app's `LazyMotion` (`domAnimation`, strict) in `providers.tsx`.
- Produces: `PlateMorph({ face, children })`.

The spec's §3.B, "a result growing out of the plate", is met by ruling 13. `PlateMorph` wraps the plate's switching block, the entry or the record. When `face` changes:
- it tweens the block's height from the old face's measured height to the new one's (420ms, `--ease-out-expo`), so the plate's border grows with it;
- the new face rises 8px;
- the old face goes at once;
- once settled, it hands the height back to `auto` and sends `tt:layout`, so the journey re-measures below.

Motion off: an instant swap. The morph is Motion only; the plates never import Anime.js.

- [ ] **Step 1: Write the failing e2e**

`tests/e2e/journey/plate-morph.spec.ts`:
```ts
import { expect, test, type Page } from "@playwright/test";
import { PNR } from "../helpers";
import { motionOff } from "./journey-helpers";

/** Samples the morph's height every frame for `ms` after `act`. */
async function heightsDuring(page: Page, act: () => Promise<void>, ms = 900): Promise<number[]> {
  await page.evaluate((span) => {
    const w = window as unknown as { __heights: number[] };
    w.__heights = [];
    const el = document.querySelector('[data-testid="hero-instrument"] .plate-morph')!;
    const end = performance.now() + span;
    const tick = () => {
      w.__heights.push(Math.round(el.getBoundingClientRect().height));
      if (performance.now() < end) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, ms);
  await act();
  await page.waitForTimeout(ms + 100);
  return page.evaluate(() => (window as unknown as { __heights: number[] }).__heights);
}

async function run(page: Page): Promise<void> {
  const plate = page.getByTestId("hero-instrument");
  await plate.getByRole("textbox").fill(PNR.cnf);
  await plate.getByRole("button", { name: /run/i }).click();
  await expect(page.getByTestId("terminal-result")).toBeVisible();
}

test.describe("the plate morph", () => {
  test("the record grows out of the plate", async ({ page }) => {
    await page.goto("/");
    const heights = await heightsDuring(page, () => run(page), 2_400);
    const final = heights.at(-1)!;
    const between = heights.filter((h) => h > heights[0]! + 2 && h < final - 2);
    expect(between.length).toBeGreaterThanOrEqual(3);
    expect(await page.locator('[data-testid="hero-instrument"] .plate-morph').evaluate((el) => (el as HTMLElement).style.height)).toMatch(/^(auto|)$/);
  });

  test("Motion off: the record appears at once", async ({ page }) => {
    await motionOff(page);
    await page.goto("/");
    const heights = await heightsDuring(page, () => run(page), 2_400);
    const final = heights.at(-1)!;
    expect(heights.filter((h) => h > heights[0]! + 2 && h < final - 2)).toEqual([]);
  });

  test("checking another PNR morphs back, and the entry takes the caret", async ({ page }) => {
    await page.goto("/");
    await run(page);
    await page.getByRole("button", { name: /check another pnr/i }).click();
    await expect(page.getByTestId("hero-instrument").getByRole("textbox")).toBeFocused();
    await expect(page.getByTestId("terminal-result")).toHaveCount(0);
  });
});
```
The run holds its running state for `MIN_RUNNING_MS` before the record lands, so the sampling window covers the run as well as the morph. Run: FAIL (no `.plate-morph`).

- [ ] **Step 2: Write the morph**

`src/components/pnr/plate-morph.tsx`:
```tsx
"use client";

import { m } from "motion/react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { LAYOUT_EVENT } from "@/components/landing/journey/journey-events";
import { useMotion } from "@/components/motion/use-motion";

// A check plate's morph between its entry and its record (spec §3.B; ruling J3-13): the block's height tweens
// from the old face's to the new one's, so the plate's border grows with it, and the new face rises 8px. The
// old face goes at once, never fading text. Motion off: an instant swap. Afterwards the height is the
// content's again, and the page is told its layout moved (tt:layout).

const EXPO = [0.16, 1, 0.3, 1] as const;
const MORPH_S = 0.42;

interface Morph {
  readonly from: number;
  readonly to: number;
}

export function PlateMorph({ face, children }: { readonly face: string; readonly children: ReactNode }) {
  const on = useMotion().motion === "on";
  const inner = useRef<HTMLDivElement>(null);
  const seen = useRef<{ readonly face: string; readonly height: number } | null>(null);
  const [morph, setMorph] = useState<Morph | null>(null);

  // After every commit: remember this face's height; when the face has just changed, morph from the last one's.
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const height = el.offsetHeight;
    const before = seen.current;
    seen.current = { face, height };
    if (before && before.face !== face) {
      if (on && before.height !== height) setMorph({ from: before.height, to: height });
      else window.dispatchEvent(new Event(LAYOUT_EVENT));
    }
  });

  const settle = () => {
    setMorph(null);
    window.dispatchEvent(new Event(LAYOUT_EVENT));
  };

  return (
    <m.div
      className="plate-morph"
      style={morph ? { overflow: "clip" } : { height: "auto" }}
      initial={false}
      animate={morph ? { height: [morph.from, morph.to] } : undefined}
      transition={{ duration: MORPH_S, ease: EXPO }}
      onAnimationComplete={() => morph && settle()}
    >
      <m.div ref={inner} key={face} initial={on ? { y: 8 } : false} animate={{ y: 0 }} transition={{ duration: on ? MORPH_S : 0, ease: EXPO }}>
        {children}
      </m.div>
    </m.div>
  );
}
```
In `pnr-terminal.tsx`, wrap each plate's switching block (the `plate.phase !== "done" || !plate.result ? (…) : (<TerminalRecord …/>)` expression, not `RecentChecks` or the live region) in `<PlateMorph face={plate.phase === "done" && plate.result ? "record" : "entry"}>…</PlateMorph>`. Do this in both `PnrTerminal` and `PnrClosingTerminal`.

Check these against Motion 13's own docs (`node_modules/motion/…`) rather than assuming:
- `animate` accepts height keyframes under the strict `domAnimation` `LazyMotion` (it does: layout is the only feature missing);
- `style={{ height: "auto" }}` releases the tweened height afterwards.

If a test shows the height sticking, clear it in `settle` with the element's own style (`inner.current?.parentElement?.style.removeProperty("height")`), and say so.

- [ ] **Step 3: Run the morph e2e, then everything that runs a check**

Run: `npx playwright test tests/e2e/journey/plate-morph.spec.ts tests/e2e/home.spec.ts tests/e2e/journey/hero-dial.spec.ts`, plus every spec that runs a check (`grep -ln "terminal-result" tests/e2e`).
Expected: PASS on both projects. There are no duplicate test ids, because the old face is gone at once.

- [ ] **Step 4: The whole gate, then commit**

```bash
npm run check && npx playwright test
git add src tests
git commit -m "feat(check): the record grows out of the plate, and the entry comes back the same way"
```

### Task 14: Together: collisions, axe positions, the docs, and the spec's rulings

**Files:**
- Modify: `tests/e2e/journey/collisions.spec.ts`, `DESIGN.md`, `docs/superpowers/specs/2026-09-24-landing-journey-design.md`
- Create: `tests/e2e/journey/journey-axe.spec.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: the collision baseline with the moving page in it; axe at J3's positions; DESIGN.md's journey motion and hero-entrance rules; the spec updated for rulings 1, 5, 7, 8 and 13.

- [ ] **Step 1: The collision baseline, moving**

In `collisions.spec.ts`, add `".chapter-card"` to `INSTRUMENTS.panels`. The existing runs (1440×900, 390×844 and 844×390, Motion on and off, plus the device's reduced motion) now sweep the moving page, because the journey starts on every load. Before each sweep, add `await waitForJourney(page)` for Motion on and off. The reduced-motion run keeps its wait on `data-motion="off"`. Add the dense Task 8 sweeps, if they are not already there.

Run: `npx playwright test tests/e2e/journey/collisions.spec.ts`
Expected: PASS. Any finding is a real overlap to fix at its source, never to skip.

- [ ] **Step 2: axe where the journey stands**

`tests/e2e/journey/journey-axe.spec.ts`:
```ts
import { test } from "@playwright/test";
import { expectAxeClean } from "../axe-helpers";
import { motionOff, scrollToId, waitForJourney } from "./journey-helpers";

const POSITIONS: readonly (readonly [name: string, id: string | null, fraction?: number])[] = [
  ["top", null],
  ["chapters, midway", "how", 0.5],
  ["record", "record"],
  ["roadmap", "roadmap"],
];

test.describe("axe, while the journey runs", () => {
  for (const [name, id, fraction] of POSITIONS) {
    test(`clean at ${name}`, async ({ page }) => {
      await page.goto("/");
      await waitForJourney(page);
      if (id && fraction !== undefined) {
        await page.evaluate(([target, f]) => {
          const s = document.getElementById(target)!;
          window.scrollTo({ top: s.getBoundingClientRect().top + window.scrollY + (s.offsetHeight - window.innerHeight) * f, behavior: "instant" });
        }, [id, fraction] as const);
      } else if (id) await scrollToId(page, id, 40);
      await page.waitForTimeout(1_200);
      await expectAxeClean(page);
    });
  }

  test("clean with Motion off", async ({ page }) => {
    await motionOff(page);
    await page.goto("/");
    await waitForJourney(page);
    await expectAxeClean(page);
  });

  test("clean at Night, at the top", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("tt.theme", "dark"));
    await page.goto("/");
    await waitForJourney(page);
    await page.waitForTimeout(1_200);
    await expectAxeClean(page);
  });
});
```
Take `expectAxeClean`'s import path and the Night mechanism from `tests/e2e/axe.spec.ts`, whatever they are; the names above are guesses. The phone position comes from the mobile project, which runs the same file. The spec's other axe positions (drawing, run, Night drawing and terminus, Data Saver) arrive with J4–J6.

Run: `npx playwright test tests/e2e/journey/journey-axe.spec.ts`
Expected: PASS on both projects.

- [ ] **Step 3: The check on every sample, journey on and blocked; and focus never hidden (spec §5, §3.G)**

Append to `tests/e2e/journey/island.spec.ts`:
```ts
for (const blocked of [false, true]) {
  test(`every sample check reads its record with the journey ${blocked ? "blocked" : "on"}`, async ({ page }) => {
    if (blocked) await blockJourneyChunk(page);
    await page.goto("/");
    const plate = page.getByTestId("hero-instrument");
    for (const pnr of [PNR.cnf, PNR.rac, PNR.wl, PNR.mixed, PNR.notFound]) {
      await plate.getByRole("textbox").fill(pnr);
      await plate.getByRole("button", { name: /run/i }).click();
      await expect(page.getByTestId("terminal-result")).toBeVisible();
      await page.getByRole("button", { name: /check another pnr/i }).click();
    }
  });
}

test("Tab never leaves focus under the masthead or behind a pinned piece", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await waitForJourney(page);
  for (let i = 0; i < 80; i += 1) {
    await page.keyboard.press("Tab");
    const hidden = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect();
      const header = document.querySelector("header")!.getBoundingClientRect().bottom;
      const x = Math.min(Math.max(r.left + r.width / 2, 0), window.innerWidth - 1);
      const y = Math.min(Math.max(r.top + r.height / 2, 0), window.innerHeight - 1);
      const top = document.elementFromPoint(x, y);
      const inMasthead = el.closest("header") !== null;
      const covered = !inMasthead && (r.bottom <= header || (top !== null && top !== el && !el.contains(top)));
      return covered ? `${el.tagName} ${el.textContent?.trim().slice(0, 40)}` : null;
    });
    expect(hidden).toBeNull();
  }
});
```
Import `waitForJourney` alongside the helpers already imported. The focused element's centre is tested with `elementFromPoint`: the cursor and every drawing have `pointer-events: none`, so only a real cover counts. If the check shows a pinned piece covering focus, give the focused element `scroll-margin` or lift it above the pin, and say which.

Run: `npx playwright test tests/e2e/journey/island.spec.ts`
Expected: PASS on both projects.

- [ ] **Step 4: DESIGN.md**

In the Motion section, after the Motion switch paragraph, add:
```md
**The landing journey** (spec 2026-09-24, from J3) is the one place the app moves at length, and it follows
these rules.
- **The server's page is complete and still.** The journey (Anime.js, one chunk, loaded when the page is idle)
  takes it over only while it runs, under `html[data-journey="on"]`. If the journey never starts (offline,
  blocked, the 15 s watchdog), the page stays as drawn. It never changes the reader's Motion choice.
- **Text moves by transform only, never opacity**, so contrast holds at every frame. Drawings may fade.
- **Section entrances replay.** Kickers flip in, rows rise, registration marks snap on, and the board's rows
  flip in. Each resets only once its section has wholly left the window, and plays again when it comes back.
- **The headline's letters rise once per load, and the plotter once per visit.** The headline is the server's
  `<h1>` before and after; the split exists only while the letters move.
- **Scroll-driven pieces follow the scroll both ways:** the strip, the board's status, the chapters, the berths
  and the route. Pinned pieces pin only while their content fits the window.
- **Motion off means still.** True readings keep updating (the strip's place, the board's status, the dial's
  segments and chart face), with no movement.
- **One writer per attribute:** React or the journey, never both.
```
Replace the Shell section's route strip sentence with:
```md
On `/` a second row, the route strip, links the page's sections as stations on a rail (from 48rem); while the
journey runs, a train runs along it with the odometer and the current station, and phones get a hairline rail
in the masthead's foot.
```
In the Round instruments paragraph, add the chapters dial to the list of instruments.

- [ ] **Step 5: The spec**

In `docs/superpowers/specs/2026-09-24-landing-journey-design.md`:
- **§3.A, the Hero row:** change the readout to "Chart HH:MM IST · in 3 h 12 min" (the record's own wording and time; ruling J3-5).
- **§3.B:**
  - Replace the plate-morph paragraph with ruling J3-13's technique.
  - Add after "An error boundary and a watchdog (15 s) turn a failed journey into the motion-off page": "…by writing `data-journey="failed"`: every moving or pinned state requires `data-journey="on"`, and the reader's Motion choice is never changed (J3-1)."
- **§6, after the J2 note:** add "Decided while planning J3 (2026-09-25):
  - the phone strip is its own aria-hidden rail (J3-7);
  - the strip's hand-off pulse and the departure horn land with their callers in J4/J5 (J3-8);
  - the plate morph tweens height on `domAnimation` (J3-13)."

- [ ] **Step 6: The whole gate and the whole suite, then commit**

```bash
npm run check && npx playwright test
git add tests DESIGN.md docs/superpowers/specs/2026-09-24-landing-journey-design.md
git commit -m "docs(journey): the journey's motion rules, J3's rulings in the spec, and axe where it stands"
```

## Finish: budgets, proof, then the owner's word

- [ ] `npm run check` and `npx playwright test` are green on the final head. Report failures as they are.
- [ ] **The journey chunk's budget (spec §3.H, ≤ 70 KB compressed).** Run `npm run build`. Then find the chunk that holds `tt-journey-chunk` and measure its gzip size:
```bash
f=$(grep -l "tt-journey-chunk" .next/static/chunks/*.js .next/static/chunks/**/*.js 2>/dev/null | head -1); echo "$f"; gzip -c "$f" | wc -c
```
Record the number in the report. Over 70 KB fails the task; find what grew. Also confirm that no chunk loaded by the landing's initial HTML holds `animejs`. List the page's initial `<script src>` chunks from the built HTML, and grep each for `animejs` or `onScroll`.
- [ ] **Smoothness.** Rerun `tests/e2e/smoothness.spec.ts`. Then record a 4 s scroll from the top to `#reliability` at 1440×900 with a CDP trace. Report the long frames (over 25 ms); the spec's desktop budget is p95 ≤ 12 ms. The nightly budget run lands in J6, so this is a report, not a gate.
- [ ] **Screenshots into the workspace:**
  - 1440×900, Day and Night: the hero during and after the intro, the board with statuses, 02 at each stop, 03 after the plan draws, 04 with the second hand, and 05 half laid;
  - 390×844: the phone rail and 02 pinned;
  - v3 at the same positions, for comparison.
- [ ] Ask the owner before pushing. The PR carries J1's and J2's commits too, unless they have merged first; then rebase onto main.

## Self-review notes

1. `npm run check` and the full `npx playwright test` are green.
2. `git log --format=%B feat/journey-j2-instruments..HEAD | grep -ci co-authored-by` prints `0`.
3. `grep -rn "animejs" src/components/pnr src/components/shell` matches nothing. `grep -rn "start-journey" src --include=*.tsx` matches only `journey-loader.tsx`.
4. `grep -rn "opacity" src/components/landing/journey/{arrivals,intro,board,chapters}.ts` matches only drawings (marks, segments, dots), never text.
5. Every rule in `journey-island.css` starts with `html[data-journey="on"]`, `html[data-motion="on"][data-journey="on"]`, `html.has-reg-cursor`, `.reg-`, `.intro-`, or the plotter's `is-plotting` pair.
6. Every module's teardown is exercised: the e2e specs switch Motion mid-page (`motion-switch.spec.ts`) with the journey running and assert nothing is left offset or split.

## What J4 inherits

- `startJourney`, `MODULES`, `JourneyContext` and `watchEntrances`: J4's still drawing and GA join as modules.
- Events for later modules:
  - `tt:station` carries the strip's index;
  - the strip's trains live in `.strip-train`, and J4/J5 add `pulse()` with the drawn train that calls it (ruling 8);
  - the Sound module adds the horn on `tt:depart` in J5.
- The head script gains `data-saver` and `data-drawing` in J4. The journey's CSS gates on `data-journey`, which J4 keeps.
- The collision baseline sweeps the moving page, with `step` for dense passes through pinned pieces.
