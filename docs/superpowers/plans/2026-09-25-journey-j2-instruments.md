# The Journey's Instruments, Drawn Still: Implementation Plan (Landing journey J2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the landing's first visible redesign. Six railway instruments, rendered by the server and drawn still:
- the route strip in the masthead
- the departure board under the hero
- the hero dial behind the check plate
- the berth plan beside the specimen record
- the station clock in Reliability
- the route map over the roadmap

**Architecture:** every instrument is a React Server Component under `src/components/landing/journey/`, drawn from pure geometry modules (`journey/geometry/*.ts`, unit-tested) and one copy module (`src/messages/en-IN/journey.ts`). The route strip reaches the client masthead as a server-rendered prop, following the pattern `FooterSwitch` already uses. Instrument styling lives in one stylesheet, `src/styles/journey.css`, written with tokens. HTML text uses the type roles; SVG labels are sized in their drawing's own units. Nothing moves yet: J3 animates these same elements. Two pieces need live values:
- **The station clock** is a small client component. It shows the real IST time, so it has to tick.
- **The berth plan** is derived from the specimen fixture, the same data the record beside it shows.

**Tech Stack:** Next.js 16.3.4 App Router (Server Components), React 19.2, Tailwind 4, SVG, Vitest 4, Playwright 1.62.

**Spec:** `docs/superpowers/specs/2026-09-24-landing-journey-design.md`, specifically §3.A (the rows for Masthead, Hero, Departure board, 03, 04 and 05, with their Motion-off column), §3.B (the module map), §3.G, §5 and §6 J2. **Reference:** prototype v3. Its source is in the session scratchpad at `train-proto/`, and a built page at `train-proto/build/index.html` can be opened with Playwright for side-by-side checks.

**Branch:** `feat/journey-j2-instruments`, from `feat/journey-j1-motion-switch` (J1 is not merged yet). If J1 changes before it merges, rebase onto it.

**Scope rulings (made while planning, from the v3 digest).** Each is also written into spec §6 by Task 7.
1. **The chapters instrument moves to J3.** Its Motion-off state is the plain section it replaces (spec §3.A, "02 How it works"). Drawn still, it would ship invisible to everyone, so it lands in J3 together with the pinning that shows it.
2. **The departure board's status column moves to J3.** DEPARTED / AT PLATFORM / NEXT is a function of scroll position, so a static status would be false. J2's board lists destinations and kilometres only.
3. **GA ("The train, drawn") joins the strip and the board in J4,** which ships its section. J2 links only to sections that exist.
4. **The station clock ticks.** A clock that stops at render time shows the wrong time. It follows the app's own `IstClock` pattern: a small client component that renders nothing time-dependent on the server.
5. **200% text for the instruments is checked once the 200% fix merges.** That fix (`3a8b0f3`, `fix/landing-200-percent-text`) is not on this branch. Without it the landing's own masthead overflows at 200%, so a 200% test here would fail for a reason J2 does not own. The HTML text J2 adds all takes type roles in rem, and the nightly run holds 200% for every journey section (spec §5).
6. **Nothing a traveller sees is invented.** The berth plan's lit berth, its coach and class, and its caption come from `buildSpecimen()`. If the specimen has no berth in a 3A layout, the plan renders nothing.

## Global Constraints

Every task's requirements include all of these.

- TypeScript strict, never `any`. Files under 500 lines, whether source, tests or scripts (the contract test enforces this).
- **The Industry grammar:**
  - Tokens only: no raw 6-digit hex in `.ts`/`.tsx`.
  - No `text-[`, `rounded-[`, `tracking-[`, `shadow-[`, `duration-[` or `z-[` in `.tsx`.
  - Spacing on the scale steps.
  - Hairlines and square plates. The one sanctioned exception is the round instruments (Task 3 writes the rule).
- **Styles:** Tailwind classes where the markup is ordinary. Instrument internals live in `src/styles/journey.css`.
  - HTML text uses the type roles (`var(--text-*)`).
  - SVG labels are sized in px of the drawing's own units, because they scale with the drawing. Each rule says so.
  - No colour outside `var(--token)`.
- **Copy:** every string a traveller sees lives in `src/messages/en-IN/*`. New journey copy goes in `journey.ts`, verbatim from v3.
- **Data:** nothing invented. Clock time comes from the real IST, and seats come from `buildSpecimen()`. Travellers never see a provider name.
- **Accessibility:** decorative instruments are `aria-hidden`. Real links stay real, named links. Every control answers a finger across 44px on touch screens (`tap-44` where the coarse-pointer rule does not reach).
- **The Motion switch (J1) keeps meaning what it means.** J2 adds no motion.
- **The check never waits on journey code.** The only new client code is the station clock.
- TDD: each behaviour starts with a test that fails for the stated reason.
- **The whole gate before every commit:** `npm run check`. Before the PR, also run `npx playwright test`. A subset is not the gate.
- **Playwright:** run it only in this worktree, on port 4210, in fixture mode. Check port 4210 first, and never run against another folder's server or port 3100.
- **Git:** conventional commits with no `Co-Authored-By` trailer. Never commit `.env*`, `settings.local.json` or `.superpowers/`. Push, open the PR and merge only on the owner's word.

## Before you start

```bash
cd /Users/heytherevibin/Downloads/Code/Dev/trackandtrace-j2 && git log --oneline -1
```

This worktree already exists, on `feat/journey-j2-instruments`, with a cloned `node_modules`. Read `AGENTS.md`: this is Next 16. Use the shared helpers from J1: `tests/e2e/journey/collisions.ts` (`collisionsInView`, `collisionsTopToBottom`, with options `panels` and `skip`), `@/components/ui/corners` and `@/components/shell/ist-clock`.

## File Structure

| File | Responsibility |
|---|---|
| `src/messages/en-IN/journey.ts` | All J2 copy, verbatim from v3 |
| `src/messages/index.ts` | Modify: add `journey` |
| `src/components/landing/journey/stations.ts` | The route: station ids, codes and kilometres in order; stop placement and labels |
| `src/components/landing/journey/train-glyph.tsx` | The shared train glyph SVG |
| `src/components/landing/journey/route-strip.tsx` | The masthead's second row |
| `src/components/landing/journey/departure-board.tsx` | Departures · Platform 3 |
| `src/components/landing/journey/geometry/dial.ts` | Polar maths, arcs, digit segments, bezel ticks, group labels |
| `src/components/landing/journey/hero-dial.tsx` | The dial behind the hero plate |
| `src/components/landing/journey/geometry/berths.ts` | A 3A coach's berth layout and where a berth sits |
| `src/components/landing/journey/berth-plan.tsx` | Coach B1 · 3A · plan |
| `src/components/landing/journey/geometry/clock.ts` | IST time, hand angles and ticks |
| `src/components/landing/journey/station-clock.tsx` | Client: the station clock |
| `src/components/landing/journey/geometry/route.ts` | Stop points, the path, and sleepers sampled along it |
| `src/components/landing/journey/route-map.tsx` | The roadmap's track |
| `src/styles/journey.css` | Instrument styles (imported by `globals.css`) |
| `src/styles/tokens.css` | Modify: the `text-3xs` role; the round-instruments comment |
| `src/components/shell/top-nav.tsx`, `app-shell.tsx` | Modify: the strip prop |
| `src/components/landing/specimen-data.ts` | Modify: `seats` on the specimen |
| `src/app/(site)/page.tsx`, `hero.tsx`, `principles-sheet.tsx`, `features.tsx`, `photo-split.tsx`, `closing-cta.tsx`, `specimen-record.tsx`, `reliability-band.tsx`, `roadmap.tsx` | Modify: mount the instruments; section ids |
| `tests/unit/components/landing/journey/*.test.ts(x)` | Geometry (node) and markup (jsdom) |
| `tests/e2e/journey/instruments.spec.ts` | The instruments in a real browser |
| `tests/e2e/journey/collisions.spec.ts` | Modify: the baseline declares the new panels |
| `DESIGN.md`, `docs/architecture.md`, the spec | The round-instruments rule, the folder, and §6's moved items |

---

### Task 1: The route, its copy, and a section for every station

**Files:**
- Create: `src/messages/en-IN/journey.ts`, `src/components/landing/journey/stations.ts`, `tests/unit/components/landing/journey/stations.test.ts`, `tests/e2e/journey/instruments.spec.ts`
- Modify: `src/messages/index.ts`, `src/components/landing/principles-sheet.tsx`, `features.tsx`, `photo-split.tsx`, `closing-cta.tsx`

**Interfaces — Produces:**
- `messages.journey` (the full tree below; later tasks read `strip`, `board`, `dial`, `berths` and `clock`).
- `type StationId`, and `interface Station { readonly id: StationId; readonly code: string; readonly km: number; readonly name: string }`.
- `STATIONS: readonly Station[]` (10 stations: DEP, 01 to 08, END).
- `stopLeft(index: number, count: number): string`, for example `"33.333%"`.
- `kmFigure(km: number): string`, for example `"064"`.
- `stopName(station: Station): string`.

- [ ] **Step 1: Write the failing unit test**: `tests/unit/components/landing/journey/stations.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { STATIONS, kmFigure, stopLeft, stopName } from "@/components/landing/journey/stations";

describe("the route through the landing", () => {
  it("runs DEP, 01 to 08, END, in order of kilometres, with a name for each", () => {
    expect(STATIONS.map((s) => s.code)).toEqual(["DEP", "01", "02", "03", "04", "05", "06", "07", "08", "END"]);
    expect(STATIONS.map((s) => s.km)).toEqual([0, 64, 138, 212, 318, 407, 530, 644, 730, 781]);
    expect(new Set(STATIONS.map((s) => s.id)).size).toBe(STATIONS.length);
    for (const s of STATIONS) expect(s.name.length, s.id).toBeGreaterThan(0);
  });

  it("spaces the stops evenly along the strip", () => {
    expect(stopLeft(0, 10)).toBe("0.000%");
    expect(stopLeft(3, 10)).toBe("33.333%");
    expect(stopLeft(9, 10)).toBe("100.000%");
  });

  it("prints kilometres as three figures", () => {
    expect(kmFigure(0)).toBe("000");
    expect(kmFigure(64)).toBe("064");
    expect(kmFigure(781)).toBe("781");
  });

  it("names a numbered stop with its number, and DEP and END by name alone", () => {
    const byCode = (code: string) => STATIONS.find((s) => s.code === code)!;
    expect(stopName(byCode("01"))).toBe("01 · Operating principles");
    expect(stopName(byCode("DEP"))).toBe("Platform 3 · Departures");
    expect(stopName(byCode("END"))).toBe("Run a check");
  });
});
```

- [ ] **Step 2: Run it and watch it fail.** `npx vitest run tests/unit/components/landing/journey/stations.test.ts` fails with `Failed to resolve import`.

- [ ] **Step 3: Write the copy.** Create `src/messages/en-IN/journey.ts`:

```ts
import type { MessageTree } from "../types";

// The landing journey's instruments, verbatim from prototype v3 (approved 2026-09-24).

export const journey = {
  stations: {
    top: "Platform 3 · Departures",
    principles: "Operating principles",
    how: "How it works",
    record: "The record you get",
    reliability: "Reliability",
    roadmap: "On the roadmap",
    features: "More than a check",
    use: "Where it gets used",
    faq: "Questions",
    terminus: "Run a check",
  },
  strip: {
    label: "Route through this page",
    km: (figure: string) => `KM ${figure}`,
    stop: (code: string, name: string) => `${code} · ${name}`,
  },
  board: {
    title: "Departures · Platform 3",
    scope: "This page",
    caption: "The sections of this page, listed as departures",
    stn: "Stn",
    destination: "Destination",
    km: "Km",
  },
  dial: {
    groups: [{ label: "1–3" }, { label: "4–6" }, { label: "7–10" }],
  },
  berths: {
    title: (coach: string, cls: string) => `Coach ${coach} · ${cls} · plan`,
    sample: "Sample data",
    litLead: (status: string) => `Passenger 1 · ${status} · berth `,
    seat: (coach: string, berth: string) => `${coach} · ${berth}`,
    litOnly: ", lit.",
    waiting: (who: string, statuses: string) => `, lit. Passengers ${who} (${statuses}) have no berth allotted yet.`,
  },
  clock: {
    label: "Station clock, Indian Standard Time",
    at: (time: string) => `Station clock: ${time} IST`,
    brand: "TRAKLINE",
    ist: "IST",
  },
} as const satisfies MessageTree;
```

Register it in `src/messages/index.ts`: add `import { journey } from "./en-IN/journey";`, and add `journey` to the `messages` object (after `home`).

- [ ] **Step 4: Write `src/components/landing/journey/stations.ts`**

```ts
import { messages } from "@/messages";

// The landing, drawn as a route (spec 2026-09-24 §3.A): every section a station with its code and kilometre
// post, in page order. GA, the drawn train, joins with its section in J4.

export type StationId = keyof typeof messages.journey.stations;

export interface Station {
  readonly id: StationId;
  readonly code: string;
  readonly km: number;
  readonly name: string;
}

const ROUTE: readonly { readonly id: StationId; readonly code: string; readonly km: number }[] = [
  { id: "top", code: "DEP", km: 0 },
  { id: "principles", code: "01", km: 64 },
  { id: "how", code: "02", km: 138 },
  { id: "record", code: "03", km: 212 },
  { id: "reliability", code: "04", km: 318 },
  { id: "roadmap", code: "05", km: 407 },
  { id: "features", code: "06", km: 530 },
  { id: "use", code: "07", km: 644 },
  { id: "faq", code: "08", km: 730 },
  { id: "terminus", code: "END", km: 781 },
];

export const STATIONS: readonly Station[] = ROUTE.map((stop) => ({ ...stop, name: messages.journey.stations[stop.id] }));

/** Where a stop sits along the strip's track, as a percentage. */
export function stopLeft(index: number, count: number): string {
  return `${((index / (count - 1)) * 100).toFixed(3)}%`;
}

/** Kilometres as the board prints them: three figures. */
export function kmFigure(km: number): string {
  return String(km).padStart(3, "0");
}

/** A stop's accessible name: "01 · Operating principles" for numbered stops, the name alone for DEP and END. */
export function stopName(station: Station): string {
  return /^\d/.test(station.code) ? messages.journey.strip.stop(station.code, station.name) : station.name;
}
```

- [ ] **Step 5: Run it and watch it pass.** `npx vitest run tests/unit/components/landing/journey/stations.test.ts` passes 4 tests. Also run `npx vitest run tests/unit/messages`, which should pass (no empty strings).

- [ ] **Step 6: Write the failing e2e**: `tests/e2e/journey/instruments.spec.ts`

```ts
import { expect, test } from "../fixtures";
import { gotoReady } from "../helpers";
import { STATIONS } from "../../../src/components/landing/journey/stations";

// The journey's instruments, drawn still (spec 2026-09-24 §3.A, J2). Each test names the instrument it holds.

test.describe("the route", () => {
  test("every station on the route is a section of the landing", async ({ page }) => {
    await gotoReady(page, "/");
    for (const station of STATIONS) await expect(page.locator(`#${station.id}`), station.id).toHaveCount(1);
  });
});
```

This file imports `STATIONS` from source through a relative path, because Playwright does not resolve the `@/` alias. If Playwright's transpiler refuses the import (for example because it cannot resolve `@/messages` inside `stations.ts`), stop and report it rather than copying the list into the test.

- [ ] **Step 7: Run it and watch it fail.** `npx playwright test tests/e2e/journey/instruments.spec.ts` fails with `principles` expected count 1, received 0. `features`, `use` and `terminus` are missing too.

- [ ] **Step 8: Give the four sections their ids.** These are the ids v3 assigned:
  - `src/components/landing/principles-sheet.tsx`: `<section aria-label={m.label}` becomes `<section id="principles" aria-label={m.label}`.
  - `src/components/landing/features.tsx`: `<section aria-label={m.kicker}` becomes `<section id="features" aria-label={m.kicker}`.
  - `src/components/landing/photo-split.tsx`: `<section aria-labelledby="photo-title"` becomes `<section id="use" aria-labelledby="photo-title"`.
  - `src/components/landing/closing-cta.tsx`: `<section aria-label={m.title}` becomes `<section id="terminus" aria-label={m.title}`.

- [ ] **Step 9: Run it and watch it pass.** Run the e2e from Step 7 (both projects), then `npx playwright test tests/e2e/home.spec.ts` (the existing anchors are unchanged).

- [ ] **Step 10: Run the gate and commit.** `npm run check` is green.

```bash
git add src/messages/en-IN/journey.ts src/messages/index.ts src/components/landing/journey/stations.ts src/components/landing/principles-sheet.tsx src/components/landing/features.tsx src/components/landing/photo-split.tsx src/components/landing/closing-cta.tsx tests/unit/components/landing/journey/stations.test.ts tests/e2e/journey/instruments.spec.ts
git commit -m "feat(journey): the landing drawn as a route, a station for every section"
```

---

### Task 2: The route strip in the masthead

**Files:**
- Create: `src/components/landing/journey/train-glyph.tsx`, `src/components/landing/journey/route-strip.tsx`, `src/styles/journey.css`, `tests/unit/components/landing/journey/route-strip.test.tsx`
- Modify: `src/app/globals.css`, `src/styles/tokens.css`, `src/components/shell/top-nav.tsx`, `src/components/shell/app-shell.tsx`, `tests/unit/components/top-nav.test.tsx`, `tests/e2e/journey/instruments.spec.ts`

**Interfaces:**
- **Consumes:** `STATIONS`, `stopLeft`, `stopName` and `kmFigure` (Task 1), and `messages.journey.strip`.
- **Produces:**
  - `TrainGlyph()`: a server component, the glyph SVG with `aria-hidden`, which J3's route map and J6's run reuse.
  - `RouteStrip()`: `<nav id="route-strip">`.
  - `TopNav({ strip }: { readonly strip?: ReactNode })`, which renders `strip` only on "/".
  - `src/styles/journey.css`, to which later tasks append their blocks.
  - The `text-3xs` type role: 10px on 14px, for station codes.

The strip is the masthead's second row at 48rem and up. On a phone it is a hairline rail in the masthead's bottom edge, with the train at DEP and no labels. That is v3's layout, drawn at rest, since J3 moves the train.

- [ ] **Step 1: Write the failing tests.** First, `tests/unit/components/landing/journey/route-strip.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RouteStrip } from "@/components/landing/journey/route-strip";

describe("RouteStrip", () => {
  it("is a named navigation of the page's stations, each a link to its section", () => {
    render(<RouteStrip />);
    const strip = screen.getByRole("navigation", { name: "Route through this page" });
    const links = within(strip).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["DEP", "01", "02", "03", "04", "05", "06", "07", "08", "END"]);
    expect(within(strip).getByRole("link", { name: "03 · The record you get" })).toHaveAttribute("href", "#record");
    expect(within(strip).getByRole("link", { name: "Platform 3 · Departures" })).toHaveAttribute("href", "#top");
  });

  it("stands at DEP, kilometre zero, with the train drawn but hidden from assistive tech", () => {
    const { container } = render(<RouteStrip />);
    expect(screen.getByText("KM 000")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("DEP · Platform 3 · Departures")).toBeInTheDocument();
    expect(container.querySelector(".strip-train")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".strip-stops li:last-child")!.getAttribute("style")).toMatch(/left:\s*100(\.0+)?%/);
  });
});
```

Second, in `tests/unit/components/top-nav.test.tsx`, add:

```tsx
  it("carries the landing's route strip on the landing only", () => {
    const strip = <nav aria-label="Route through this page" />;
    nav.pathname = "/";
    const { unmount } = render(<TopNav strip={strip} />);
    expect(within(screen.getByRole("banner")).getByRole("navigation", { name: "Route through this page" })).toBeInTheDocument();
    unmount();
    nav.pathname = "/watchlist";
    render(<TopNav strip={strip} />);
    expect(screen.queryByRole("navigation", { name: "Route through this page" })).toBeNull();
  });
```

Third, append to `tests/e2e/journey/instruments.spec.ts`:

```ts
test.describe("the route strip", () => {
  test("sits in the landing's masthead, and its stops jump to their sections below the masthead", async ({ page, isMobile }) => {
    test.skip(isMobile, "on a phone the strip is a hairline rail without labels");
    await gotoReady(page, "/");
    const strip = page.getByRole("banner").getByRole("navigation", { name: "Route through this page" });
    await expect(strip).toBeVisible();
    await strip.getByRole("link", { name: "03 · The record you get" }).click();
    await expect(page).toHaveURL(/#record$/);
    const gap = await page.evaluate(() => document.getElementById("record")!.getBoundingClientRect().top - document.querySelector("header")!.getBoundingClientRect().bottom);
    expect(gap).toBeGreaterThanOrEqual(0);
    await gotoReady(page, "/watchlist");
    await expect(page.getByRole("navigation", { name: "Route through this page" })).toHaveCount(0);
  });

  test("on a phone, is a rail in the masthead's bottom edge with no labels", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phone layout");
    await gotoReady(page, "/");
    await expect(page.locator("#route-strip .strip-stops")).toBeHidden();
    await expect(page.locator("#route-strip .strip-train")).toBeVisible();
  });
});
```

The `gap ≥ 0` assertion proves anchors land below the taller masthead, which is why `--header-height` changes.

- [ ] **Step 2: Run them and watch them fail.**
  - `npx vitest run tests/unit/components/landing/journey/route-strip.test.tsx tests/unit/components/top-nav.test.tsx` fails: the module resolves nothing, and `TopNav` has no `strip` prop.
  - `npx playwright test tests/e2e/journey/instruments.spec.ts -g "route strip"` fails: there is no strip.

- [ ] **Step 3: Add the type role.** In `src/styles/tokens.css`, after `--text-2xs--line-height: 1rem;`:

```css
  --text-3xs: 0.625rem; /* the route strip's station codes, as v3 draws them */
  --text-3xs--line-height: 0.875rem;
```

- [ ] **Step 4: Write `src/components/landing/journey/train-glyph.tsx`.** This is v3's glyph, verbatim. The window cut-outs take the ground colour.

```tsx
/** The journey's train, as a glyph: a coach and a locomotive in side elevation. Decoration only. */
export function TrainGlyph() {
  return (
    <svg viewBox="0 0 68 26" aria-hidden="true" focusable="false">
      <g fill="currentColor">
        <path d="M0 7h27v12H0z" opacity=".55" />
        <path d="M30 5h27l7 5.5V19H30z" />
        <path d="M40 1.5l6 3.2M46 4.7l3-3.2" stroke="currentColor" strokeWidth="1.2" fill="none" />
      </g>
      {/* A CSS variable only works in a style, never in a presentation attribute. */}
      <g style={{ fill: "var(--surface-0)" }}>
        <path d="M3 9.5h4v3H3zM9 9.5h4v3H9zM15 9.5h4v3h-4zM21 9.5h4v3h-4zM33 8h4v3.4h-4zM55.5 7.2h4.2l3 2.6h-7.2z" />
      </g>
      <g fill="currentColor">
        <circle cx="5" cy="21.5" r="2.2" />
        <circle cx="22" cy="21.5" r="2.2" />
        <circle cx="35" cy="21.5" r="2.4" />
        <circle cx="41" cy="21.5" r="2.4" />
        <circle cx="53" cy="21.5" r="2.4" />
        <circle cx="59" cy="21.5" r="2.4" />
      </g>
    </svg>
  );
}
```

- [ ] **Step 5: Write `src/components/landing/journey/route-strip.tsx`**

```tsx
import { messages } from "@/messages";
import { STATIONS, kmFigure, stopLeft, stopName } from "./stations";
import { TrainGlyph } from "./train-glyph";

/**
 * The masthead's second row on the landing: the page's stations on a rail, with the kilometre reading and the
 * current station. Drawn at rest at DEP; J3 moves the train and the readings as the page scrolls. On a phone,
 * it is a hairline rail in the masthead's bottom edge (journey.css).
 */
export function RouteStrip() {
  const m = messages.journey.strip;
  const first = STATIONS[0]!;
  return (
    <nav id="route-strip" aria-label={m.label} className="route-strip">
      <div className="page-frame strip-row">
        <span className="strip-odo" aria-hidden="true">
          {m.km(kmFigure(first.km))}
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
          <span className="strip-train" aria-hidden="true">
            <TrainGlyph />
          </span>
        </div>
        <span className="strip-now">{m.stop(first.code, first.name)}</span>
      </div>
    </nav>
  );
}
```

- [ ] **Step 6: Write `src/styles/journey.css`.** This is v3's `proto.css`, with its sizes set by the type roles. Then import it in `src/app/globals.css`, after `../styles/motion.css`: `@import "../styles/journey.css";`.

```css
/* The landing journey's instruments (spec 2026-09-24), drawn still; J3 animates these same elements. HTML text
   takes the type roles. SVG labels are sized in px of the drawing's own units, so they scale with the drawing.
   Colours are tokens only. */

/* ---- The route strip (the masthead's second row on "/") */
.route-strip { border-top: 1px solid var(--line); background: var(--surface-0); }
.strip-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; column-gap: 16px; height: 30px; }
.strip-odo,
.strip-now {
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
.strip-track { position: relative; height: 30px; min-width: 0; }
.strip-rail { position: absolute; left: 0; right: 0; top: 17px; height: 12px; }
.strip-stops { position: absolute; inset: 0; margin: 0; padding: 0; list-style: none; }
.strip-stops li { position: absolute; top: 2px; transform: translateX(-50%); }
.strip-stops a {
  display: block;
  padding: 0 3px;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--text-3xs);
  line-height: var(--text-3xs--line-height);
  letter-spacing: var(--tracking-brand);
  color: var(--ink-3);
  text-decoration: none;
}
.strip-stops a[aria-current="location"] { color: var(--accent-text); }
.strip-train { position: absolute; left: 0; top: 13px; width: 30px; height: 12px; transform: translateX(-50%); color: var(--accent); pointer-events: none; }
.strip-train svg { display: block; width: 100%; height: 100%; }
/* The strip makes the landing's masthead taller: anchors stop below it (base.css reads --header-height). */
@media (min-width: 48rem) {
  :root:has(#route-strip) { --header-height: 5.9375rem; /* 4rem row + 1px rule + 30px strip */ }
}
@media (max-width: 47.99rem) {
  .route-strip { position: absolute; left: 0; right: 0; bottom: -1px; height: 12px; border-top: 0; background: transparent; pointer-events: none; }
  .strip-row { display: block; height: 12px; }
  .strip-odo,
  .strip-now,
  .strip-stops { display: none; }
  .strip-track { height: 12px; }
  .strip-rail { top: 5px; height: 6px; background: linear-gradient(var(--line), var(--line)) left 5px / 100% 1px no-repeat; }
  .strip-train { top: 1px; width: 22px; height: 9px; }
}
```

- [ ] **Step 7: Put the strip in the masthead.**
  - In `src/components/shell/top-nav.tsx`, add `import type { ReactNode } from "react";`.
  - Change the signature to `export function TopNav({ strip }: { readonly strip?: ReactNode } = {}) {`.
  - Just before `</header>`, after the row `</div>`, add `{pathname === "/" && !minimal ? strip : null}`.
  - Append one sentence to the doc comment: "On the landing a second row carries the route strip, server-rendered and passed in (`strip`)."
  - In `src/components/shell/app-shell.tsx`, import `RouteStrip` from `@/components/landing/journey/route-strip` and render `<TopNav strip={<RouteStrip />} />`.

- [ ] **Step 8: Run the tests and watch them pass.** Run the unit tests from Step 2, then `npx playwright test tests/e2e/journey/instruments.spec.ts tests/e2e/smoothness.spec.ts tests/e2e/responsive.spec.ts tests/e2e/tap-targets.spec.ts tests/e2e/journey/collisions.spec.ts`. Everything should pass. The masthead must still fit at 320px, and the collision baseline must still be zero, now that the strip's text is inside the masthead.

- [ ] **Step 9: Run the gate and commit.** `npm run check` is green.

```bash
git add src/components/landing/journey/train-glyph.tsx src/components/landing/journey/route-strip.tsx src/styles/journey.css src/app/globals.css src/styles/tokens.css src/components/shell/top-nav.tsx src/components/shell/app-shell.tsx tests/unit/components/landing/journey/route-strip.test.tsx tests/unit/components/top-nav.test.tsx tests/e2e/journey/instruments.spec.ts
git commit -m "feat(journey): the route strip in the landing's masthead"
```

---

### Task 3: The departure board, the hero dial, and the round-instruments rule

**Files:**
- Create: `src/components/landing/journey/departure-board.tsx`, `src/components/landing/journey/geometry/dial.ts`, `src/components/landing/journey/hero-dial.tsx`, `tests/unit/components/landing/journey/dial.test.ts`, `tests/unit/components/landing/journey/board-and-dial.test.tsx`
- Modify: `src/app/(site)/page.tsx`, `src/components/landing/hero.tsx`, `src/styles/journey.css`, `src/styles/tokens.css`, `DESIGN.md`, `tests/e2e/journey/instruments.spec.ts`

**Interfaces:**
- **Consumes:** `STATIONS` and `kmFigure` (Task 1), `IstClock`, `Corners`, and `messages.journey.board` and `messages.journey.dial`.
- **Produces:**
  - `type Point = readonly [number, number]`.
  - `polar(r: number, deg: number): Point`.
  - `arcPath(r: number, from: number, to: number): string`.
  - `interface DigitArc { readonly from: number; readonly to: number; readonly group: number }`.
  - `digitArcs(options?: { start?: number; sweep?: number; groupGap?: number; digitGap?: number }): readonly DigitArc[]`.
  - `interface Tick { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly major: boolean }`.
  - `bezelTicks(): readonly Tick[]`.
  - `groupLabelPoints(arcs: readonly DigitArc[], r: number): readonly Point[]`.
  - `DepartureBoard()` and `HeroDial()`.

J3's chapters instrument and hero motion reuse `geometry/dial.ts` as is.

- [ ] **Step 1: Write the failing geometry test**: `tests/unit/components/landing/journey/dial.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { arcPath, bezelTicks, digitArcs, groupLabelPoints, polar } from "@/components/landing/journey/geometry/dial";

describe("the dial's geometry", () => {
  it("measures angles clockwise from twelve o'clock", () => {
    const [x0, y0] = polar(100, 0);
    const [x90, y90] = polar(100, 90);
    expect(x0).toBeCloseTo(0);
    expect(y0).toBeCloseTo(-100);
    expect(x90).toBeCloseTo(100);
    expect(y90).toBeCloseTo(0);
  });

  it("draws an arc from one angle to another, the long way round only past 180°", () => {
    expect(arcPath(100, 0, 90)).toBe("M0.00 -100.00 A100 100 0 0 1 100.00 0.00");
    expect(arcPath(100, 0, 270)).toContain(" 0 1 1 ");
  });

  it("lays ten digit segments in groups of 3, 3 and 4 across the sweep", () => {
    const arcs = digitArcs({ start: -60, sweep: 300 });
    expect(arcs).toHaveLength(10);
    expect(arcs.map((a) => a.group)).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2, 2]);
    expect(arcs[0]!.from).toBeCloseTo(-60);
    expect(arcs[9]!.to).toBeCloseTo(240);
    const widths = arcs.map((a) => a.to - a.from);
    for (const w of widths) expect(w).toBeCloseTo(widths[0]!);
    expect(arcs[3]!.from - arcs[2]!.to).toBeCloseTo(9);
    expect(arcs[1]!.from - arcs[0]!.to).toBeCloseTo(1.6);
  });

  it("rings the bezel with 120 ticks, every tenth a major one", () => {
    const ticks = bezelTicks();
    expect(ticks).toHaveLength(120);
    expect(ticks.filter((t) => t.major)).toHaveLength(12);
    expect(ticks[0]).toMatchObject({ major: true });
    expect(Math.hypot(ticks[0]!.x1, ticks[0]!.y1)).toBeCloseTo(392);
    expect(Math.hypot(ticks[1]!.x1, ticks[1]!.y1)).toBeCloseTo(400);
    expect(Math.hypot(ticks[1]!.x2, ticks[1]!.y2)).toBeCloseTo(412);
  });

  it("puts each group's label at the middle of its own arcs", () => {
    const arcs = digitArcs({ start: -60, sweep: 300 });
    const points = groupLabelPoints(arcs, 326);
    expect(points).toHaveLength(3);
    const [x, y] = polar(326, (arcs[0]!.from + arcs[2]!.to) / 2);
    expect(points[0]![0]).toBeCloseTo(x);
    expect(points[0]![1]).toBeCloseTo(y);
  });
});
```

- [ ] **Step 2: Run it and watch it fail.** `npx vitest run tests/unit/components/landing/journey/dial.test.ts` fails with `Failed to resolve import`.

- [ ] **Step 3: Write `src/components/landing/journey/geometry/dial.ts`**

```ts
// The dial's geometry, from prototype v3's dial.js: angles in degrees, clockwise from twelve o'clock, in a drawing
// centred on 0,0. Pure, so the server draws it and J3 animates the same shapes.

export type Point = readonly [number, number];

/** The digit groups of a PNR as a ticket prints it: 3-3-4. */
export const DIGIT_GROUPS = [3, 3, 4] as const;

export function polar(r: number, deg: number): Point {
  const a = ((deg - 90) * Math.PI) / 180;
  return [r * Math.cos(a), r * Math.sin(a)];
}

/** An SVG arc of radius r from one angle to another, clockwise. */
export function arcPath(r: number, from: number, to: number): string {
  const [x0, y0] = polar(r, from);
  const [x1, y1] = polar(r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export interface DigitArc {
  readonly from: number;
  readonly to: number;
  readonly group: number;
}

/** Ten equal segments, one per digit, in groups of 3-3-4 with a wider gap between groups. */
export function digitArcs({ start = -150, sweep = 300, groupGap = 9, digitGap = 1.6 }: { start?: number; sweep?: number; groupGap?: number; digitGap?: number } = {}): readonly DigitArc[] {
  const usable = sweep - groupGap * (DIGIT_GROUPS.length - 1) - digitGap * (10 - DIGIT_GROUPS.length);
  const each = usable / 10;
  return DIGIT_GROUPS.flatMap((count, group) => {
    const before = DIGIT_GROUPS.slice(0, group).reduce((sum, n) => sum + n, 0);
    const groupStart = start + before * each + (before - group) * digitGap + group * groupGap;
    return Array.from({ length: count }, (_, i) => {
      const from = groupStart + i * (each + digitGap);
      return { from, to: from + each, group };
    });
  });
}

export interface Tick {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly major: boolean;
}

/** The bezel: 120 ticks, 3° apart, every tenth a longer major tick. */
export function bezelTicks(): readonly Tick[] {
  return Array.from({ length: 120 }, (_, i) => {
    const major = i % 10 === 0;
    const [x1, y1] = polar(major ? 392 : 400, i * 3);
    const [x2, y2] = polar(412, i * 3);
    return { x1, y1, x2, y2, major };
  });
}

/** Where each digit group's label sits: at radius r, midway along that group's own arcs. */
export function groupLabelPoints(arcs: readonly DigitArc[], r: number): readonly Point[] {
  return DIGIT_GROUPS.map((_, group) => {
    const own = arcs.filter((arc) => arc.group === group);
    return polar(r, (own[0]!.from + own.at(-1)!.to) / 2);
  });
}
```

- [ ] **Step 4: Run it and watch it pass.** `npx vitest run tests/unit/components/landing/journey/dial.test.ts` passes 5 tests.

- [ ] **Step 5: Write the failing markup test**: `tests/unit/components/landing/journey/board-and-dial.test.tsx`

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DepartureBoard } from "@/components/landing/journey/departure-board";
import { HeroDial } from "@/components/landing/journey/hero-dial";

describe("DepartureBoard", () => {
  it("lists the page's sections as departures, each a link, with its kilometre post", () => {
    render(<DepartureBoard />);
    const board = screen.getByRole("region", { name: "Departures · Platform 3" });
    const table = within(board).getByRole("table", { name: "The sections of this page, listed as departures" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(9);
    expect(within(rows[0]!).getByRole("link", { name: "Operating principles" })).toHaveAttribute("href", "#principles");
    expect(within(rows[0]!).getByText("064")).toBeInTheDocument();
    expect(within(rows.at(-1)!).getByRole("link", { name: "Run a check" })).toHaveAttribute("href", "#terminus");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Stn", "Destination", "Km"]);
  });
});

describe("HeroDial", () => {
  it("is decoration: ten digit segments in three labelled groups, none lit, hidden from assistive tech", () => {
    const { container } = render(<HeroDial />);
    const dial = container.querySelector(".hero-dial")!;
    expect(dial).toHaveAttribute("aria-hidden", "true");
    expect(dial.querySelectorAll(".dial-seg")).toHaveLength(10);
    expect(dial.querySelectorAll(".dial-seg.is-on")).toHaveLength(0);
    expect(dial.querySelectorAll(".dial-tick")).toHaveLength(120);
    expect([...dial.querySelectorAll(".dial-label")].map((t) => t.textContent)).toEqual(["1–3", "4–6", "7–10"]);
  });
});
```

- [ ] **Step 6: Run it and watch it fail.** `npx vitest run tests/unit/components/landing/journey/board-and-dial.test.tsx` fails with `Failed to resolve import`.

- [ ] **Step 7: Write `src/components/landing/journey/departure-board.tsx`.** This is v3's board without its status column (scope ruling 2).

```tsx
import { IstClock } from "@/components/shell/ist-clock";
import { Corners } from "@/components/ui/corners";
import { messages } from "@/messages";
import { STATIONS, kmFigure } from "./stations";

/** Departures · Platform 3, under the hero: the page's sections as departures. J3 adds the status column, which follows the scroll. */
export function DepartureBoard() {
  const m = messages.journey.board;
  return (
    <section id="departures" aria-labelledby="board-title" className="pb-10 pt-2">
      <div className="blueprint board">
        <Corners />
        <div className="flex flex-wrap items-stretch border-b border-line">
          <h2 id="board-title" className="legend min-w-[16ch] flex-1 px-5 py-3 leading-6 text-ink-1 max-sm:basis-full">
            {m.title}
          </h2>
          <span className="legend whitespace-nowrap border-l border-line px-5 py-3 leading-6 max-sm:flex-1 max-sm:border-l-0 max-sm:border-t">{m.scope}</span>
          <span className="flex items-center whitespace-nowrap border-l border-line px-5 py-3 max-sm:border-t">
            <IstClock />
          </span>
        </div>
        <table className="board-table">
          <caption className="sr-only">{m.caption}</caption>
          <thead>
            <tr>
              <th scope="col">{m.stn}</th>
              <th scope="col">{m.destination}</th>
              <th scope="col" className="board-km">
                {m.km}
              </th>
            </tr>
          </thead>
          <tbody>
            {STATIONS.slice(1).map((station) => (
              <tr key={station.id}>
                <td className="board-code">{station.code}</td>
                <td className="board-name">
                  <a href={`#${station.id}`}>{station.name}</a>
                </td>
                <td className="board-km tnum">{kmFigure(station.km)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 8: Write `src/components/landing/journey/hero-dial.tsx`.** This is v3's dial at rest: no digits lit, and no needle or chart face, since J3 brings those with a result.

```tsx
import { messages } from "@/messages";
import { arcPath, bezelTicks, digitArcs, groupLabelPoints } from "./geometry/dial";

const ARCS = digitArcs({ start: -60, sweep: 300 });
const TICKS = bezelTicks();
const LABELS = groupLabelPoints(ARCS, 326);

/** The living dial behind the hero's check plate, drawn at rest: J3 lights a segment per digit typed. Decoration only. */
export function HeroDial() {
  return (
    <div className="hero-dial" aria-hidden="true">
      <svg viewBox="-430 -430 860 860" focusable="false">
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
      </svg>
    </div>
  );
}
```

- [ ] **Step 9: Run the markup test and watch it pass.** `npx vitest run tests/unit/components/landing/journey/board-and-dial.test.tsx` passes.

- [ ] **Step 10: Mount both, and style them.**
  - **`src/app/(site)/page.tsx`:** import `DepartureBoard` from `@/components/landing/journey/departure-board` and render `<DepartureBoard />` between `<Hero …/>` and `<PrinciplesSheet />`.
  - **`src/components/landing/hero.tsx`:** import `HeroDial` from `@/components/landing/journey/hero-dial` and wrap the plate as `<div className="dial-host"><HeroDial /><PnrTerminal sampleMode={sampleMode} connected={connected} /></div>`. Add `overflow-x-clip` to the `<section>`'s classes, so a wide dial never makes the page scroll sideways.
  - **`src/styles/journey.css`:** append the block below.

```css
/* ---- Departures · Platform 3 (under the hero) */
.board-table { width: 100%; border-collapse: collapse; }
.board-table th {
  padding: 8px 20px;
  text-align: left;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--text-2xs);
  line-height: var(--text-2xs--line-height);
  letter-spacing: var(--tracking-caps);
  text-transform: uppercase;
  color: var(--ink-3);
  border-bottom: 1px solid var(--line);
}
.board-table td {
  padding: 7px 20px;
  border-top: 1px solid var(--line);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--text-body);
  line-height: 1.25rem; /* v3's board row, tighter than body copy */
  letter-spacing: var(--tracking-brand);
  text-transform: uppercase;
}
.board-table tbody tr:first-child td { border-top: 0; }
.board-code { width: 4.5rem; color: var(--accent-text); font-variant-numeric: tabular-nums; }
.board-name a { color: var(--ink-1); text-decoration: none; }
.board-name a:hover { color: var(--accent-text); }
.board-km { width: 4.5rem; color: var(--ink-3); }
@media (max-width: 39.99rem) {
  .board-table th,
  .board-table td { padding: 6px 12px; font-size: var(--text-label); }
  .board-km { display: none; }
  .board-code { width: 3rem; }
}

/* ---- The hero dial: behind the check plate, only where the plate stands beside the words (two columns). Its
   left side fades out before the words, and the hero clips its width (hero.tsx), so it never scrolls the page. */
.dial-host { position: relative; min-width: 0; }
.dial-host > :not(.hero-dial) { position: relative; z-index: 1; }
.hero-dial { display: none; }
@media (min-width: 64rem) {
  .hero-dial {
    display: block;
    position: absolute;
    left: 50%;
    top: 50%;
    width: min(860px, 160%);
    aspect-ratio: 1;
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 0;
    mask-image: linear-gradient(to right, transparent 0, black 32%), linear-gradient(to bottom, transparent 0, black 14%, black 86%, transparent 100%);
    mask-composite: intersect;
  }
}
.hero-dial svg { display: block; width: 100%; height: 100%; overflow: visible; }
.dial-tick { stroke: var(--line); stroke-width: 1; vector-effect: non-scaling-stroke; }
.dial-tick.is-major { stroke: var(--line-strong); }
.dial-ring { fill: none; stroke: var(--line); stroke-width: 1; vector-effect: non-scaling-stroke; }
.dial-ring.is-dashed { stroke-dasharray: 2 7; }
.dial-seg { fill: none; stroke: var(--line); stroke-width: 7; stroke-linecap: butt; }
.dial-seg.is-on { stroke: var(--accent); }
.dial-label { fill: var(--ink-3); font-family: var(--font-display); font-weight: 600; font-size: 13px; /* drawing units */ letter-spacing: var(--tracking-caps); text-transform: uppercase; }
```

- [ ] **Step 11: Write the round-instruments rule.**
  - In `src/styles/tokens.css`, change `/* The wireframe world is square. Only lamps and route stops are round. */` to `/* The wireframe world is square. Only lamps, route stops and the journey's instruments (dials, the station clock, the route map) are round. */`.
  - In `DESIGN.md`'s `## Primitives` section, after the table, add:

```markdown
**Round instruments.** The landing journey draws railway instruments: the hero dial, the station clock, and the
route map's stops. These, with lamps and route stops, are the only round things in the world. They are hairline
SVG drawings in steel, never filled plates, and they are decoration (`aria-hidden`); anything they say is also
said in text. Their styles live in `src/styles/journey.css`. SVG labels there are sized in the drawing's own
units, so they scale with it; HTML text anywhere still takes the type roles.
```

- [ ] **Step 12: Write the failing e2e, then watch it pass.** Append to `tests/e2e/journey/instruments.spec.ts`:

```ts
test.describe("the departure board and the hero dial", () => {
  test("the board sits under the hero, and its destinations jump to their sections", async ({ page }) => {
    await gotoReady(page, "/");
    const board = page.getByRole("region", { name: "Departures · Platform 3" });
    await expect(board).toBeVisible();
    const heroBottom = await page.locator("section[aria-labelledby='hero-title']").evaluate((el) => el.getBoundingClientRect().bottom);
    expect((await board.boundingBox())!.y).toBeGreaterThanOrEqual(heroBottom - 1);
    await board.getByRole("link", { name: "Questions" }).click();
    await expect(page).toHaveURL(/#faq$/);
  });

  test("the dial stands behind the plate on a wide screen, hidden on a phone, and never scrolls the page", async ({ page, isMobile }) => {
    await gotoReady(page, "/");
    const dial = page.locator(".hero-dial");
    if (isMobile) await expect(dial).toBeHidden();
    else await expect(dial).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
```

Run `npx playwright test tests/e2e/journey/instruments.spec.ts -g "board and the hero dial"`. It passes after Step 10. Watch it fail first by running it before Step 10's mount.

- [ ] **Step 13: Check it against v3 by eye.** Open `train-proto/build/index.html` from the session scratchpad at 1440×900. Screenshot the hero plus the board, then do the same for the app at `/`, and save both into the workspace. The dial's rings, segments and labels should sit around the plate as in v3, and fade before the headline. If the fade or the size clearly differs, tune only `width` and the mask stops in `journey.css`, and record the values you chose. If you cannot make them match, report it with both screenshots.

- [ ] **Step 14: Run the gate and commit.** `npm run check` is green. Run the e2e for `instruments.spec.ts`, `home.spec.ts`, `responsive.spec.ts` and `axe.spec.ts`: all pass.

```bash
git add src/components/landing/journey/departure-board.tsx src/components/landing/journey/geometry/dial.ts src/components/landing/journey/hero-dial.tsx src/app/\(site\)/page.tsx src/components/landing/hero.tsx src/styles/journey.css src/styles/tokens.css DESIGN.md tests/unit/components/landing/journey/dial.test.ts tests/unit/components/landing/journey/board-and-dial.test.tsx tests/e2e/journey/instruments.spec.ts
git commit -m "feat(journey): the departure board and the hero dial, drawn still"
```

---

### Task 4: The berth plan, from the specimen

**Files:**
- Create: `src/components/landing/journey/geometry/berths.ts`, `src/components/landing/journey/berth-plan.tsx`, `tests/unit/components/landing/journey/berths.test.ts`, `tests/unit/components/landing/journey/berth-plan.test.tsx`
- Modify: `src/components/landing/specimen-data.ts`, `src/components/landing/specimen-record.tsx`, `src/styles/journey.css`, `tests/unit/components/landing-specimen.test.ts`, `tests/e2e/journey/instruments.spec.ts`

**Interfaces:**
- **Consumes:** `buildFixtureResult` (through `buildSpecimen`), `statusLabel`, and `messages.journey.berths`.
- **Produces:**
  - `interface SpecimenSeats { readonly cls: string; readonly coach: string; readonly berth: string; readonly status: string; readonly waiting: readonly { readonly index: number; readonly label: string }[] }`.
  - `Specimen.seats: SpecimenSeats | null`.
  - `berthNumber(label: string): number | null`.
  - `interface BerthSeat { readonly bay: number; readonly place: "stack" | "side"; readonly stack: 0 | 1 }`.
  - `berthSeat(n: number): BerthSeat | null`.
  - `coachPlan(lit: BerthSeat | null)`, typed below.
  - `BerthPlan({ seats }: { readonly seats: SpecimenSeats | null })`.

A 3A coach has nine bays of eight berths. Berth n is in bay ⌊(n−1)/8⌋. Within the bay, offsets 0–2 are the first stack, 3–5 the second, and 6–7 the side pair. So the specimen's berth 12 is bay 2 (index 1), second stack: v3's lit berth, now derived instead of typed.

- [ ] **Step 1: Write the failing tests.** First, `tests/unit/components/landing/journey/berths.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BAYS, berthNumber, berthSeat, coachPlan } from "@/components/landing/journey/geometry/berths";

describe("a 3A coach's berths", () => {
  it("reads a berth's number from its label", () => {
    expect(berthNumber("12 LB")).toBe(12);
    expect(berthNumber("SL")).toBeNull();
  });

  it("finds a berth's bay and place: two stacks of three, then the side pair", () => {
    expect(berthSeat(1)).toEqual({ bay: 0, place: "stack", stack: 0 });
    expect(berthSeat(12)).toEqual({ bay: 1, place: "stack", stack: 1 });
    expect(berthSeat(15)).toEqual({ bay: 1, place: "side", stack: 0 });
    expect(berthSeat(0)).toBeNull();
    expect(berthSeat(BAYS * 8 + 1)).toBeNull();
  });

  it("draws nine bays, numbered as the coach is, lighting only the given berth's stack", () => {
    const plan = coachPlan(berthSeat(12));
    expect(plan.bays).toHaveLength(9);
    expect(plan.bays[1]!.stacks.map((s) => s.label)).toEqual(["9·10·11", "12·13·14"]);
    expect(plan.bays[1]!.side.label).toBe("15·16");
    expect(plan.bays.flatMap((b) => [...b.stacks, b.side]).filter((part) => part.lit)).toHaveLength(1);
    expect(plan.bays[1]!.stacks[1]!.lit).toBe(true);
    expect(plan.tagX).toBeCloseTo(plan.bays[1]!.stacks[1]!.x + 11);
    expect(coachPlan(null).tagX).toBeNull();
  });
});
```

Second, add to `tests/unit/components/landing-specimen.test.ts`. Read the file first, and follow its imports and the fixed clock it uses:

```ts
  it("carries the lead passenger's seat for the berth plan, and who is still waiting", () => {
    const specimen = buildSpecimen(new Date("2026-09-17T06:30:00.000Z"))!;
    expect(specimen.seats).toEqual({ cls: "3A", coach: "B1", berth: "12 LB", status: "CNF", waiting: [{ index: 2, label: "RAC 4" }, { index: 3, label: "WL 9" }] });
  });
```

The expected values are the fixture's own: `src/services/sources/fixture.ts` gives PNR `…9` a CNF lead in B1, berth 12 LB, then RAC 4 and WL 9. If the fixture's class for this PNR is not `3A`, stop and report it. The plan would then be drawing a coach the specimen is not in.

Third, `tests/unit/components/landing/journey/berth-plan.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BerthPlan } from "@/components/landing/journey/berth-plan";

const SEATS = { cls: "3A", coach: "B1", berth: "12 LB", status: "CNF", waiting: [{ index: 2, label: "RAC 4" }, { index: 3, label: "WL 9" }] } as const;

describe("BerthPlan", () => {
  it("names the coach, marks itself sample data, and says in words which berth is lit", () => {
    render(<BerthPlan seats={SEATS} />);
    expect(screen.getByText("Coach B1 · 3A · plan")).toBeInTheDocument();
    expect(screen.getByText("Sample data")).toBeInTheDocument();
    expect(screen.getByRole("figure")).toHaveTextContent("Passenger 1 · CNF · berth B1 · 12 LB, lit. Passengers 2 and 3 (RAC 4, WL 9) have no berth allotted yet.");
  });

  it("lights one berth stack and tags it with the berth", () => {
    const { container } = render(<BerthPlan seats={SEATS} />);
    expect(container.querySelectorAll(".plan-berth.is-lit")).toHaveLength(1);
    expect(container.querySelector(".plan-tag.is-lit")).toHaveTextContent("12 LB");
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("draws nothing when the specimen has no berth to show", () => {
    const { container } = render(<BerthPlan seats={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run them and watch them fail.** `npx vitest run tests/unit/components/landing/journey/berths.test.ts tests/unit/components/landing/journey/berth-plan.test.tsx tests/unit/components/landing-specimen.test.ts` fails. The modules are missing, and `specimen.seats` is `undefined`.

- [ ] **Step 3: Write `src/components/landing/journey/geometry/berths.ts`**

```ts
// A 3A coach drawn in plan, from prototype v3's berths.js: nine bays between the end corridors, each bay two stacks
// of three berths across the aisle and a side pair along it. Drawing units match the plan's viewBox (0 0 640 142).

export const BAYS = 9;
const BAY_X0 = 58;
const BAY_X1 = 578;
export const BAY_WIDTH = (BAY_X1 - BAY_X0) / BAYS;

export interface BerthSeat {
  readonly bay: number;
  readonly place: "stack" | "side";
  readonly stack: 0 | 1;
}

/** "12 LB" → 12. A label without a leading number has none. */
export function berthNumber(label: string): number | null {
  const match = /^(\d+)\b/.exec(label.trim());
  return match ? Number(match[1]) : null;
}

/** Where berth n sits: bay ⌊(n−1)/8⌋; offsets 0–2 and 3–5 are the two stacks, 6–7 the side pair. */
export function berthSeat(n: number): BerthSeat | null {
  if (!Number.isInteger(n) || n < 1 || n > BAYS * 8) return null;
  const bay = Math.floor((n - 1) / 8);
  const offset = (n - 1) % 8;
  if (offset >= 6) return { bay, place: "side", stack: 0 };
  return { bay, place: "stack", stack: offset < 3 ? 0 : 1 };
}

export interface PlanPart {
  readonly x: number;
  readonly label: string;
  readonly lit: boolean;
}

export interface PlanBay {
  readonly x0: number;
  readonly stacks: readonly [PlanPart, PlanPart];
  readonly side: PlanPart & { readonly width: number };
}

export interface CoachPlan {
  readonly bays: readonly PlanBay[];
  /** Where the lit berth's tag is centred, or null when nothing is lit. */
  readonly tagX: number | null;
}

export function coachPlan(lit: BerthSeat | null): CoachPlan {
  const bays = Array.from({ length: BAYS }, (_, b): PlanBay => {
    const x0 = BAY_X0 + b * BAY_WIDTH;
    const first = 8 * b + 1;
    const here = lit?.bay === b;
    return {
      x0,
      stacks: [
        { x: x0 + 4, label: `${first}·${first + 1}·${first + 2}`, lit: here && lit.place === "stack" && lit.stack === 0 },
        { x: x0 + BAY_WIDTH - 26, label: `${first + 3}·${first + 4}·${first + 5}`, lit: here && lit.place === "stack" && lit.stack === 1 },
      ],
      side: { x: x0 + 6, width: BAY_WIDTH - 12, label: `${first + 6}·${first + 7}`, lit: here && lit.place === "side" },
    };
  });
  const litBay = lit ? bays[lit.bay] : undefined;
  const tagX = !lit || !litBay ? null : lit.place === "side" ? litBay.side.x + litBay.side.width / 2 : litBay.stacks[lit.stack].x + 11;
  return { bays, tagX };
}
```

- [ ] **Step 4: Give the specimen its seats.** In `src/components/landing/specimen-data.ts`:
  - Add `import type { TicketStatus } from "@/types/domain";` if the file needs it for the status label.
  - Add the `SpecimenSeats` interface (as in Interfaces) and `readonly seats: SpecimenSeats | null;` to `Specimen`.
  - In `buildSpecimen`, compute:

```ts
  const waiting = snapshot.pax.filter((p) => !p.berth).map((p) => ({ index: p.index, label: statusLabel(p.currentStatus, p.position) }));
  // The berth plan draws a 3A coach, so it shows only a lead with a berth in one.
  const seats = lead.coach && lead.berth && snapshot.cls === "3A" ? { cls: snapshot.cls, coach: lead.coach, berth: lead.berth, status: statusLabel(lead.status, lead.position), waiting } : null;
```

  Then return `seats` with the other fields.

- [ ] **Step 5: Write `src/components/landing/journey/berth-plan.tsx`**

```tsx
import { Corners } from "@/components/ui/corners";
import { messages } from "@/messages";
import type { SpecimenSeats } from "../specimen-data";
import { BAY_WIDTH, berthNumber, berthSeat, coachPlan } from "./geometry/berths";

const listFormat = new Intl.ListFormat("en-IN", { style: "long", type: "conjunction" });

/** 03 · the specimen passenger's coach in plan, their berth lit. Sample data, from the same fixture as the record beside it. */
export function BerthPlan({ seats }: { readonly seats: SpecimenSeats | null }) {
  const number = seats ? berthNumber(seats.berth) : null;
  const seat = number === null ? null : berthSeat(number);
  if (!seats || !seat) return null;
  const m = messages.journey.berths;
  const plan = coachPlan(seat);
  const who = listFormat.format(seats.waiting.map((w) => String(w.index)));
  const statuses = seats.waiting.map((w) => w.label).join(", ");
  return (
    <figure className="berth-plan blueprint" aria-labelledby="berth-cap">
      <Corners />
      <div className="flex flex-wrap items-stretch border-b border-line">
        <span className="legend flex-1 px-4 py-2 leading-6 text-ink-1">{m.title(seats.coach, seats.cls)}</span>
        <span className="legend whitespace-nowrap border-l border-line px-4 py-2 leading-6">{m.sample}</span>
      </div>
      <svg viewBox="0 0 640 142" aria-hidden="true" focusable="false">
        <rect x={8} y={16} width={624} height={118} className="plan-line" />
        <line x1={8} y1={100} x2={632} y2={100} className="plan-line is-faint" />
        {[8, 578].map((x) => (
          <g key={x}>
            <rect x={x + 4} y={20} width={20} height={34} className="plan-line" />
            <rect x={x + 28} y={20} width={20} height={34} className="plan-line" />
          </g>
        ))}
        {plan.bays.map((bay) => (
          <g key={bay.x0}>
            <line x1={bay.x0} y1={16} x2={bay.x0} y2={96} className="plan-line is-faint" />
            {bay.stacks.map((stack) => (
              <g key={stack.label}>
                <rect x={stack.x} y={22} width={22} height={70} className={stack.lit ? "plan-line plan-berth is-lit" : "plan-line plan-berth"} />
                <text x={stack.x + 11} y={60} className="plan-num" textAnchor="middle" transform={`rotate(-90 ${stack.x + 11} 60)`}>
                  {stack.label}
                </text>
              </g>
            ))}
            <rect x={bay.side.x} y={106} width={bay.side.width} height={22} className={bay.side.lit ? "plan-line plan-berth is-lit" : "plan-line"} />
            <text x={bay.x0 + BAY_WIDTH / 2} y={121} className="plan-num" textAnchor="middle">
              {bay.side.label}
            </text>
          </g>
        ))}
        {plan.tagX === null ? null : (
          <text x={plan.tagX} y={12} className="plan-tag is-lit" textAnchor="middle">
            {seats.berth}
          </text>
        )}
      </svg>
      <figcaption id="berth-cap" className="berth-cap">
        {m.litLead(seats.status)}
        <b>{m.seat(seats.coach, seats.berth)}</b>
        {seats.waiting.length ? m.waiting(who, statuses) : m.litOnly}
      </figcaption>
    </figure>
  );
}
```

- [ ] **Step 6: Mount and style it.**
  - **`src/components/landing/specimen-record.tsx`:** import `BerthPlan` and render `<BerthPlan seats={specimen?.seats ?? null} />` as the last child of the copy column (the first `<div className="min-w-0">`, after the second `<p>`).
  - **`src/styles/journey.css`:** append the block below.

```css
/* ---- 03 · the berth plan (sample data, beside the specimen record) */
.berth-plan { margin: 28px 0 0; max-width: 34rem; }
.berth-plan svg { display: block; width: 100%; height: auto; padding: 10px 12px 2px; box-sizing: border-box; }
.plan-line { fill: none; stroke: var(--line-strong); stroke-width: 1; vector-effect: non-scaling-stroke; }
.plan-line.is-faint { stroke: var(--line); }
.plan-berth.is-lit { fill: var(--accent-wash); stroke: var(--accent); stroke-width: 1.5; }
.plan-num { fill: var(--ink-3); font-family: var(--font-display); font-weight: 600; font-size: 9px; /* drawing units */ letter-spacing: var(--tracking-wide); }
.plan-tag { fill: var(--ink-3); font-family: var(--font-display); font-weight: 600; font-size: 11px; /* drawing units */ letter-spacing: var(--tracking-caps); }
.plan-tag.is-lit { fill: var(--accent-text); }
.berth-cap { margin: 0; padding: 8px 12px 10px; border-top: 1px solid var(--line); font-size: var(--text-label); line-height: 1.25rem; color: var(--ink-2); }
.berth-cap b { font-weight: 600; color: var(--accent-text); }
```

- [ ] **Step 7: Run the tests and watch them pass.** Run the three unit files from Step 2. Then append this e2e and run it:

```ts
test.describe("the berth plan", () => {
  test("lights the specimen passenger's berth beside the record, and says so in words", async ({ page }) => {
    await gotoReady(page, "/");
    const plan = page.locator("#record figure.berth-plan");
    await expect(plan).toBeVisible();
    await expect(plan.locator(".plan-tag.is-lit")).toHaveText("12 LB");
    await expect(plan).toContainText("berth B1 · 12 LB, lit.");
  });
});
```

- [ ] **Step 8: Run the gate and commit.** `npm run check` is green. Run the e2e for `instruments.spec.ts` and `home.spec.ts`.

```bash
git add src/components/landing/journey/geometry/berths.ts src/components/landing/journey/berth-plan.tsx src/components/landing/specimen-data.ts src/components/landing/specimen-record.tsx src/styles/journey.css tests/unit/components/landing/journey/berths.test.ts tests/unit/components/landing/journey/berth-plan.test.tsx tests/unit/components/landing-specimen.test.ts tests/e2e/journey/instruments.spec.ts
git commit -m "feat(journey): the specimen passenger's berth plan, drawn from the fixture"
```

---

### Task 5: The station clock

**Files:**
- Create: `src/components/landing/journey/geometry/clock.ts`, `src/components/landing/journey/station-clock.tsx`, `tests/unit/components/landing/journey/clock.test.ts`, `tests/unit/components/landing/journey/station-clock.test.tsx`
- Modify: `src/components/landing/reliability-band.tsx`, `src/styles/journey.css`, `tests/e2e/journey/instruments.spec.ts`

**Interfaces:**
- **Consumes:** `polar` (Task 3), `messages.journey.clock`, and `formatTime` (`@/utils/datetime`, the app's IST "HH:MM").
- **Produces:**
  - `interface IstTime { readonly h: number; readonly m: number }`.
  - `istTime(now: Date): IstTime`.
  - `handAngles(t: IstTime): { readonly hour: number; readonly minute: number }`.
  - `clockTicks(): readonly Tick[]` (reusing `Tick` from `geometry/dial.ts`).
  - `StationClock()`: a client component.

The clock has no second hand in J2; J3 adds its sweep. It reads the real time on the client, every 15 seconds, like v3 with Motion off. Before it mounts it draws the face without hands, so the server's HTML and the first client render match: the same approach `IstClock` takes with `--:--`.

- [ ] **Step 1: Write the failing tests.** First, `tests/unit/components/landing/journey/clock.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { clockTicks, handAngles, istTime } from "@/components/landing/journey/geometry/clock";

describe("the station clock's geometry", () => {
  it("reads the time in India, whatever the machine's zone", () => {
    expect(istTime(new Date("2026-09-17T06:30:00.000Z"))).toEqual({ h: 12, m: 0 });
    expect(istTime(new Date("2026-09-17T18:45:00.000Z"))).toEqual({ h: 0, m: 15 });
  });

  it("turns the hour hand 30° an hour plus half a degree a minute, and the minute hand 6° a minute", () => {
    expect(handAngles({ h: 3, m: 0 })).toEqual({ hour: 90, minute: 0 });
    expect(handAngles({ h: 15, m: 30 })).toEqual({ hour: 105, minute: 180 });
    expect(handAngles({ h: 12, m: 0 })).toEqual({ hour: 0, minute: 0 });
  });

  it("marks sixty minutes around the face, every fifth a longer hour mark", () => {
    const ticks = clockTicks();
    expect(ticks).toHaveLength(60);
    expect(ticks.filter((t) => t.major)).toHaveLength(12);
    expect(Math.hypot(ticks[0]!.x1, ticks[0]!.y1)).toBeCloseTo(76);
    expect(Math.hypot(ticks[1]!.x1, ticks[1]!.y1)).toBeCloseTo(82);
    expect(Math.hypot(ticks[1]!.x2, ticks[1]!.y2)).toBeCloseTo(88);
  });
});
```

Second, `tests/unit/components/landing/journey/station-clock.test.tsx`:

```tsx
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StationClock } from "@/components/landing/journey/station-clock";

describe("StationClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-17T06:30:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("shows the time in India with its hands, and says it in words", () => {
    const { container } = render(<StationClock />);
    const clock = screen.getByRole("img", { name: "Station clock: 12:00 IST" });
    expect(clock).toBeInTheDocument();
    expect(container.querySelector(".clock-hand.is-hour")).toHaveAttribute("transform", "rotate(0)");
    expect(container.querySelector(".clock-hand.is-minute")).toHaveAttribute("transform", "rotate(0)");
  });

  it("moves on as the minutes pass", () => {
    const { container } = render(<StationClock />);
    act(() => {
      vi.setSystemTime(new Date("2026-09-17T06:45:00.000Z"));
      vi.advanceTimersByTime(15_000);
    });
    expect(screen.getByRole("img", { name: "Station clock: 12:15 IST" })).toBeInTheDocument();
    expect(container.querySelector(".clock-hand.is-minute")).toHaveAttribute("transform", "rotate(90)");
  });
});
```

The test expects `formatTime` to print `12:00` for 06:30Z. If the app's `formatTime` prints a different form (for example 24-hour `12:00` versus `00:00` edge cases), assert what `formatTime` returns for these instants, and say so in the report.

- [ ] **Step 2: Run them and watch them fail.** `npx vitest run tests/unit/components/landing/journey/clock.test.ts tests/unit/components/landing/journey/station-clock.test.tsx` fails with `Failed to resolve import`.

- [ ] **Step 3: Write `src/components/landing/journey/geometry/clock.ts`**

```ts
import { type Tick, polar } from "./dial";

// The station clock's geometry, from prototype v3's clock.js: a face 200 drawing units across, centred on 0,0.

export interface IstTime {
  readonly h: number;
  readonly m: number;
}

const IST = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });

/** The hour (0–23) and minute in India at this instant. */
export function istTime(now: Date): IstTime {
  const parts = Object.fromEntries(IST.formatToParts(now).map((part) => [part.type, part.value]));
  return { h: Number(parts.hour) % 24, m: Number(parts.minute) };
}

/** Hand angles in degrees clockwise from twelve: the hour hand moves on through its hour. */
export function handAngles({ h, m }: IstTime): { readonly hour: number; readonly minute: number } {
  return { hour: ((h % 12) + m / 60) * 30, minute: m * 6 };
}

/** Sixty minute marks, every fifth a longer hour mark. */
export function clockTicks(): readonly Tick[] {
  return Array.from({ length: 60 }, (_, i) => {
    const major = i % 5 === 0;
    const [x1, y1] = polar(major ? 76 : 82, i * 6);
    const [x2, y2] = polar(88, i * 6);
    return { x1, y1, x2, y2, major };
  });
}
```

- [ ] **Step 4: Write `src/components/landing/journey/station-clock.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { messages } from "@/messages";
import { formatTime } from "@/utils/datetime";
import { clockTicks, handAngles, istTime } from "./geometry/clock";

const TICKS = clockTicks();
const NUMERALS = [
  { text: "12", x: 0, y: -60 },
  { text: "3", x: 62, y: 0 },
  { text: "6", x: 0, y: 62 },
  { text: "9", x: -62, y: 0 },
] as const;

/**
 * 04 · the station clock, in Indian Standard Time. It reads the time on the client every 15 seconds; until then it
 * draws the face without hands, so the server's HTML matches (as IstClock shows "--:--"). J3 adds the sweeping
 * second hand.
 */
export function StationClock() {
  const m = messages.journey.clock;
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const read = () => setNow(new Date());
    read();
    const timer = window.setInterval(read, 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const angles = now ? handAngles(istTime(now)) : null;
  return (
    <figure className="station-clock" role="img" aria-label={now ? m.at(formatTime(now)) : m.label}>
      <svg viewBox="-100 -100 200 200" aria-hidden="true" focusable="false">
        <circle r={96} className="clock-ring" />
        <circle r={90} className="clock-ring is-faint" />
        {TICKS.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} className={t.major ? "clock-tick is-major" : "clock-tick"} />
        ))}
        {NUMERALS.map((n) => (
          <text key={n.text} x={n.x} y={n.y} className="clock-num" textAnchor="middle" dominantBaseline="central">
            {n.text}
          </text>
        ))}
        <text x={0} y={-28} className="clock-label" textAnchor="middle">
          {m.brand}
        </text>
        <text x={0} y={36} className="clock-label" textAnchor="middle">
          {m.ist}
        </text>
        {angles ? (
          <>
            <line x1={0} y1={10} x2={0} y2={-46} className="clock-hand is-hour" transform={`rotate(${angles.hour})`} />
            <line x1={0} y1={12} x2={0} y2={-70} className="clock-hand is-minute" transform={`rotate(${angles.minute})`} />
          </>
        ) : null}
        <circle r={3.6} className="clock-cap" />
      </svg>
    </figure>
  );
}
```

- [ ] **Step 5: Mount and style it.**
  - **`src/components/landing/reliability-band.tsx`:** wrap the heading block (`<div className="max-w-[56ch]">…</div>`) and a new `<StationClock />` in `<div className="rel-head">…</div>`, with the clock after the heading block. Import `StationClock` from `@/components/landing/journey/station-clock`.
  - **`src/styles/journey.css`:** append the block below.

```css
/* ---- 04 · the station clock, beside Reliability's heading */
.rel-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 20px 40px; }
.rel-head > div { flex: 1 1 22rem; }
.station-clock { margin: 0; width: 168px; height: 168px; flex: 0 0 auto; }
.station-clock svg { display: block; width: 100%; height: 100%; overflow: visible; }
.clock-ring { fill: none; stroke: var(--line-strong); stroke-width: 1; vector-effect: non-scaling-stroke; }
.clock-ring.is-faint { stroke: var(--line); }
.clock-tick { stroke: var(--line); stroke-width: 1; vector-effect: non-scaling-stroke; }
.clock-tick.is-major { stroke: var(--ink-1); stroke-width: 1.5; }
.clock-num { fill: var(--ink-1); font-family: var(--font-display); font-weight: 600; font-size: 15px; /* drawing units */ }
.clock-label { fill: var(--ink-3); font-family: var(--font-display); font-weight: 600; font-size: 8px; /* drawing units */ letter-spacing: 0.12em; }
.clock-hand { stroke: var(--ink-1); stroke-linecap: butt; }
.clock-hand.is-hour { stroke-width: 3.5; }
.clock-hand.is-minute { stroke-width: 2.2; }
.clock-cap { fill: var(--surface-0); stroke: var(--ink-1); stroke-width: 1.5; }
@media (max-width: 39.99rem) {
  .station-clock { width: 124px; height: 124px; }
}
```

- [ ] **Step 6: Run the tests and watch them pass.** Run the unit files from Step 2, plus `npx vitest run tests/unit/components/landing/reliability-band.test.tsx` (its existing assertions hold). Then append this e2e and run it:

```ts
test.describe("the station clock", () => {
  test("shows the time in India beside Reliability's heading", async ({ page }) => {
    await gotoReady(page, "/");
    const clock = page.locator("#reliability").getByRole("img", { name: /^Station clock: \d{2}:\d{2} IST$/ });
    await expect(clock).toBeVisible();
    await expect(clock.locator(".clock-hand.is-minute")).toHaveAttribute("transform", /^rotate\(\d+(\.\d+)?\)$/);
  });
});
```

- [ ] **Step 7: Run the gate and commit.** `npm run check` is green. Run the e2e for `instruments.spec.ts`, `home.spec.ts` and `axe.spec.ts`.

```bash
git add src/components/landing/journey/geometry/clock.ts src/components/landing/journey/station-clock.tsx src/components/landing/reliability-band.tsx src/styles/journey.css tests/unit/components/landing/journey/clock.test.ts tests/unit/components/landing/journey/station-clock.test.tsx tests/e2e/journey/instruments.spec.ts
git commit -m "feat(journey): the station clock in India's time, beside Reliability"
```

---

### Task 6: The route map over the roadmap

**Files:**
- Create: `src/components/landing/journey/geometry/route.ts`, `src/components/landing/journey/route-map.tsx`, `tests/unit/components/landing/journey/route.test.ts`, `tests/unit/components/landing/journey/route-map.test.tsx`
- Modify: `src/components/landing/roadmap.tsx`, `src/styles/journey.css`, `tests/e2e/journey/instruments.spec.ts`

**Interfaces:**
- **Consumes:** `messages.home.roadmap.items` (for the count), and the route-train shape.
- **Produces:**
  - `interface RoutePoint { readonly x: number; readonly y: number }`.
  - `routeStops(count: number): readonly RoutePoint[]`.
  - `routePath(stops: readonly RoutePoint[]): string`.
  - `interface Sleeper { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }`.
  - `routeSleepers(stops: readonly RoutePoint[], spacing?: number, half?: number): readonly Sleeper[]`.
  - `RouteMap()`.

v3 laid the sleepers with the browser's `getPointAtLength`, which a Server Component does not have. `routeSleepers` samples the same path's lines and cubic Béziers numerically, walking arc length every 14 units, and sets a 12-unit tick across the path at each point. Drawn still, the map is v3's Motion-off state: the full line, every sleeper laid, every stop passed, and the train at the end. The roadmap's rows keep their own styling.

- [ ] **Step 1: Write the failing tests.** First, `tests/unit/components/landing/journey/route.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { routePath, routeSleepers, routeStops } from "@/components/landing/journey/geometry/route";

describe("the route map's geometry", () => {
  const stops = routeStops(7);

  it("places the stops evenly across the drawing, alternating high and low", () => {
    expect(stops[0]).toEqual({ x: 70, y: 46 });
    expect(stops[1]).toEqual({ x: 70 + 1060 / 6, y: 104 });
    expect(stops[6]).toEqual({ x: 1130, y: 46 });
  });

  it("draws a lead-in, one curve per stop after the first, and a lead-out", () => {
    const d = routePath(stops);
    expect(d.startsWith("M20 46 L70 46")).toBe(true);
    expect(d.match(/ C/g)).toHaveLength(6);
    expect(d.endsWith("L1180 46")).toBe(true);
  });

  it("lays sleepers every 14 units along the path, each 12 across it and square to it", () => {
    const sleepers = routeSleepers(stops);
    expect(sleepers.length).toBeGreaterThan(80);
    const mids = sleepers.map((s) => ({ x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 }));
    for (let i = 1; i < mids.length; i++) {
      expect(Math.hypot(mids[i]!.x - mids[i - 1]!.x, mids[i]!.y - mids[i - 1]!.y)).toBeLessThanOrEqual(14.05);
    }
    for (const s of sleepers) expect(Math.hypot(s.x2 - s.x1, s.y2 - s.y1)).toBeCloseTo(12, 1);
    expect(mids[0]).toEqual({ x: 20, y: 46 });
    expect(Math.abs(sleepers[0]!.x2 - sleepers[0]!.x1)).toBeCloseTo(0);
  });
});
```

Second, `tests/unit/components/landing/journey/route-map.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RouteMap } from "@/components/landing/journey/route-map";

describe("RouteMap", () => {
  it("draws the finished line: a numbered, passed stop per planned item, every sleeper laid, hidden from assistive tech", () => {
    const { container } = render(<RouteMap count={7} />);
    const map = container.querySelector(".route-map")!;
    expect(map).toHaveAttribute("aria-hidden", "true");
    expect(map.querySelectorAll(".route-stop")).toHaveLength(7);
    expect(map.querySelectorAll(".is-passed")).toHaveLength(7);
    expect([...map.querySelectorAll(".route-num")].map((n) => n.textContent)).toEqual(["01", "02", "03", "04", "05", "06", "07"]);
    expect(map.querySelectorAll(".route-sleeper.is-laid").length).toBe(map.querySelectorAll(".route-sleeper").length);
  });
});
```

- [ ] **Step 2: Run them and watch them fail.** `npx vitest run tests/unit/components/landing/journey/route.test.ts tests/unit/components/landing/journey/route-map.test.tsx` fails with `Failed to resolve import`.

- [ ] **Step 3: Write `src/components/landing/journey/geometry/route.ts`**

```ts
// The roadmap's route line, from prototype v3's sections.js: stops alternate high and low across a 1200×150
// drawing, joined by S-curves, with a short lead-in and lead-out. Sleepers are laid by sampling the path, since a
// Server Component has no getPointAtLength.

export interface RoutePoint {
  readonly x: number;
  readonly y: number;
}

export interface Sleeper {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export function routeStops(count: number): readonly RoutePoint[] {
  return Array.from({ length: count }, (_, i) => ({ x: 70 + (i * 1060) / (count - 1), y: i % 2 ? 104 : 46 }));
}

type Segment = { readonly kind: "line"; readonly a: RoutePoint; readonly b: RoutePoint } | { readonly kind: "cubic"; readonly p: readonly [RoutePoint, RoutePoint, RoutePoint, RoutePoint] };

function segments(stops: readonly RoutePoint[]): readonly Segment[] {
  const first = stops[0]!;
  const last = stops.at(-1)!;
  const curves = stops.slice(1).map((to, i): Segment => {
    const from = stops[i]!;
    const mx = (from.x + to.x) / 2;
    return { kind: "cubic", p: [from, { x: mx, y: from.y }, { x: mx, y: to.y }, to] };
  });
  return [{ kind: "line", a: { x: first.x - 50, y: first.y }, b: first }, ...curves, { kind: "line", a: last, b: { x: last.x + 50, y: last.y } }];
}

export function routePath(stops: readonly RoutePoint[]): string {
  return segments(stops)
    .map((s, i) => {
      if (s.kind === "line") return i === 0 ? `M${s.a.x} ${s.a.y} L${s.b.x} ${s.b.y}` : `L${s.b.x} ${s.b.y}`;
      const [, c1, c2, end] = s.p;
      return `C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`;
    })
    .join(" ");
}

function pointAt(s: Segment, t: number): RoutePoint {
  if (s.kind === "line") return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t };
  const [p0, p1, p2, p3] = s.p;
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

/** Sleepers every `spacing` units of arc length, each `2 × half` across the path at that point. */
export function routeSleepers(stops: readonly RoutePoint[], spacing = 14, half = 6): readonly Sleeper[] {
  const samples = segments(stops).flatMap((s, index) => Array.from({ length: 64 + (index === 0 ? 1 : 0) }, (_, i) => pointAt(s, (index === 0 ? i : i + 1) / 64)));
  const lengths = samples.reduce<number[]>((acc, p, i) => [...acc, i === 0 ? 0 : acc[i - 1]! + Math.hypot(p.x - samples[i - 1]!.x, p.y - samples[i - 1]!.y)], []);
  const total = lengths.at(-1)!;
  return Array.from({ length: Math.floor(total / spacing) + 1 }, (_, k) => {
    const d = k * spacing;
    const j = Math.max(1, lengths.findIndex((l) => l >= d));
    const a = samples[j - 1]!;
    const b = samples[j]!;
    const span = lengths[j]! - lengths[j - 1]! || 1;
    const t = Math.min(1, Math.max(0, (d - lengths[j - 1]!) / span));
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    return { x1: x - nx * half, y1: y - ny * half, x2: x + nx * half, y2: y + ny * half };
  });
}
```

- [ ] **Step 4: Write `src/components/landing/journey/route-map.tsx`**

```tsx
import { routePath, routeSleepers, routeStops } from "./geometry/route";

/**
 * 05 · the roadmap's track, drawn still as v3 draws it with Motion off: the full line, every sleeper laid, each
 * planned stop passed, and the train at the end. J3 lays the line as the page scrolls. Decoration only; the rows below say
 * everything in words.
 */
export function RouteMap({ count }: { readonly count: number }) {
  const stops = routeStops(count);
  const d = routePath(stops);
  const last = stops.at(-1)!;
  return (
    <div className="route-map" aria-hidden="true">
      <svg viewBox="0 0 1200 150" focusable="false">
        <path d={d} className="route-path-ghost" />
        <g>
          {routeSleepers(stops).map((s, i) => (
            <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} className="route-sleeper is-laid" />
          ))}
        </g>
        <path d={d} className="route-path" />
        {stops.map((stop, i) => (
          <g key={stop.x} className="is-passed">
            <circle cx={stop.x} cy={stop.y} r={7} className="route-stop" />
            <text x={stop.x} y={stop.y + (i % 2 ? 30 : -22)} className="route-num" textAnchor="middle">
              {String(i + 1).padStart(2, "0")}
            </text>
          </g>
        ))}
        <g transform={`translate(${last.x + 50} ${last.y})`} className="route-train">
          <g transform="translate(-34 -13)">
            <path d="M0 7h27v12H0z" fill="currentColor" opacity=".55" />
            <path d="M30 5h27l7 5.5V19H30z" fill="currentColor" />
            <circle cx="5" cy="21.5" r="2.2" fill="currentColor" />
            <circle cx="22" cy="21.5" r="2.2" fill="currentColor" />
            <circle cx="35" cy="21.5" r="2.4" fill="currentColor" />
            <circle cx="59" cy="21.5" r="2.4" fill="currentColor" />
          </g>
        </g>
      </svg>
    </div>
  );
}
```

v3 dropped the dashed scaffold marks on passed stops, so the map draws none.

- [ ] **Step 5: Mount and style it.**
  - **`src/components/landing/roadmap.tsx`:** import `RouteMap` and render `<RouteMap count={m.items.length} />` immediately before the `<ul>`.
  - **`src/styles/journey.css`:** append the block below.

```css
/* ---- 05 · the roadmap's track (hidden on phones, as in v3) */
.route-map { margin-top: 24px; }
.route-map svg { display: block; width: 100%; height: auto; overflow: visible; }
.route-path-ghost { fill: none; stroke: var(--line); stroke-width: 1; stroke-dasharray: 3 6; vector-effect: non-scaling-stroke; }
.route-path { fill: none; stroke: var(--line-strong); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.route-sleeper { stroke: var(--line-strong); stroke-width: 1; opacity: 0; vector-effect: non-scaling-stroke; }
.route-sleeper.is-laid { opacity: 1; }
.route-stop { fill: var(--surface-0); stroke: var(--line-strong); stroke-width: 1; vector-effect: non-scaling-stroke; }
.route-num { fill: var(--ink-3); font-family: var(--font-display); font-weight: 600; font-size: 12px; /* drawing units */ letter-spacing: var(--tracking-caps); }
.is-passed > .route-stop { fill: var(--accent); stroke: var(--accent); }
.is-passed > .route-num { fill: var(--accent-text); }
.route-train { color: var(--accent); }
@media (max-width: 39.99rem) {
  .route-map { display: none; }
}
```

- [ ] **Step 6: Run the tests and watch them pass.** Run the unit files from Step 2. Then append this e2e and run it:

```ts
test.describe("the route map", () => {
  test("lays the roadmap's track above its rows on a wide screen, and steps aside on a phone", async ({ page, isMobile }) => {
    await gotoReady(page, "/");
    const map = page.locator("#roadmap .route-map");
    if (isMobile) await expect(map).toBeHidden();
    else await expect(map.locator(".route-stop")).toHaveCount(7);
  });
});
```

- [ ] **Step 7: Run the gate and commit.** `npm run check` is green. Run the e2e for `instruments.spec.ts`.

```bash
git add src/components/landing/journey/geometry/route.ts src/components/landing/journey/route-map.tsx src/components/landing/roadmap.tsx src/styles/journey.css tests/unit/components/landing/journey/route.test.ts tests/unit/components/landing/journey/route-map.test.tsx tests/e2e/journey/instruments.spec.ts
git commit -m "feat(journey): the roadmap's track, laid"
```

---

### Task 7: The instruments together: collisions, the docs, and the spec's moved items

**Files:**
- Modify: `tests/e2e/journey/collisions.spec.ts`, `docs/architecture.md`, `docs/superpowers/specs/2026-09-24-landing-journey-design.md`

**Interfaces:**
- **Consumes:** everything above.
- **Produces:** a collision baseline that holds the instruments as panels. J3 inherits it.

- [ ] **Step 1: Declare the instruments as panels.** In `tests/e2e/journey/collisions.spec.ts`, in the landing baseline (the `for (const size of SIZES)` block and the reduced-motion test), pass these options to `collisionsTopToBottom`:

```ts
const INSTRUMENTS = { panels: [".board", ".berth-plan", ".station-clock", ".route-map"], skip: [".hero-dial"] } as const;
```

That call becomes `collisionsTopToBottom(page, INSTRUMENTS)`. The hero dial is drawn under the plate on purpose (v3's gate skipped it as well), and its left side fades before the words. The other instruments must never cover text outside themselves, nor each other. If `collisionsTopToBottom`'s options type rejects a `readonly` tuple, spread the arrays into plain arrays. Do not change `collisions.ts`.

- [ ] **Step 2: Run the baseline.** `npx playwright test tests/e2e/journey/collisions.spec.ts` must pass: zero findings at 1440×900, 390×844 and 844×390, with Motion on and off. A finding is a real overlap. Report it with its scroll position and a screenshot. Do not add to `skip`.

- [ ] **Step 3: Update the docs.**
  - **`docs/architecture.md`:** add a line under `motion`, with the em dash in the same column:

```text
  journey (src/components/landing/journey/*) — the landing's railway instruments: server-drawn from pure geometry (journey/geometry/*.ts) and the journey copy module; styled in src/styles/journey.css; the route strip reaches the client masthead as a server-rendered prop; the station clock is the one client piece (J2)
```

  - **The spec:** in `docs/superpowers/specs/2026-09-24-landing-journey-design.md` §6, make these edits:
    - The J2 row's scope becomes: "Server instruments: route strip, departure board (without its status column), hero dial, berth plan, station clock, route map, all static, with their copy and container sizes; DESIGN.md's round-instruments rule".
    - Add "the chapters instrument; the departure board's status column" to J3's scope.
    - Add "GA joins the strip and the board" to J4's.
    - Under the table, add one line: "Moved while planning J2 (2026-09-25): the chapters instrument and the board's status only exist with scroll-driven motion, so they land in J3; GA's station lands with its section in J4."

- [ ] **Step 4: Run the whole gate.** `npm run check`, then `npx playwright test`: everything green, in both projects.

- [ ] **Step 5: Commit.**

```bash
git add tests/e2e/journey/collisions.spec.ts docs/architecture.md docs/superpowers/specs/2026-09-24-landing-journey-design.md
git commit -m "test(journey): the instruments as panels in the collision baseline, and the docs"
```

---

## Finish: the whole gate, proof, then the owner's word

- [ ] `npm run check` and `npx playwright test` green on the final head. Report failures as they are.
- [ ] Screenshots into the workspace:
  - the landing at 1440×900, Day and Night: hero with dial and board, 03 with the berth plan, 04 with the clock, 05 with the track;
  - 390×844: the hero with the phone rail, and the board;
  - v3 at the same sizes, for comparison.
- [ ] Ask the owner before pushing. The PR carries J1's commits too, unless J1 has merged first; in that case rebase onto main.

## Self-review notes

1. `npm run check` and the full `npx playwright test` are green.
2. `git log --format=%B feat/journey-j1-motion-switch..HEAD | grep -ci co-authored-by` prints `0`.
3. `grep -rnE '#[0-9a-fA-F]{6}\b' src/styles/journey.css src/components/landing/journey` matches nothing.
4. Every SVG font size in `journey.css` carries the `/* drawing units */` note, and every HTML text size is a `var(--text-*)`.
5. Nothing in `src/components/landing/journey/` reads the fixture except through `buildSpecimen()`.
6. No instrument link points at an id the page lacks: the Task 1 e2e holds it.

## What J3 inherits

- `geometry/dial.ts` for the hero dial's lit segments, the needle and the chart face, and for the chapters instrument (moved to J3).
- `STATIONS`, `stopLeft` and `RouteStrip` markup (`#route-strip`, `.strip-train`, `.strip-odo`, `.strip-now`). J3 moves the train, and sets `aria-current="location"` and the readings as the page scrolls.
- The board's rows (J3 adds the status column, computed from scroll position) and the clock's face (J3 adds the second hand).
- `routeSleepers` and the route map's elements. J3 lays them as the page scrolls; drawn still, they stay finished.
- The collision baseline with the instruments as panels.
