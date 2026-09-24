# The Motion Switch Implementation Plan (Landing journey J1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a Motion switch in the landing footer that stills every traveller page as the device's reduced-motion setting does. The state is decided before first paint, and CSS and Motion both follow it. J1 also brings the shared collision checker that every later journey PR tests with.

**Architecture:** one inline script in the site layout's `<head>` resolves Motion from the stored choice (`tt.motion`) and the device's reduced-motion setting, and writes `<html data-motion="on|off">`. `motion.css` applies its existing reduced-motion rules under that attribute as well as under the media query. `SiteMotion` feeds the same state to `MotionConfig`, and re-applies it when the device setting changes or another tab flips it. React reads the attribute and never writes it on mount. The collision checker is a Playwright helper that measures the page's drawn text and reports overlaps.

**Tech Stack:** Next.js 16.3.4 (App Router), React 19.2, Motion 13.4, Base UI 1.8 (Switch), Tailwind 4, Vitest 4 (node + jsdom), Playwright 1.62.

**Spec:** `docs/superpowers/specs/2026-09-24-landing-journey-design.md` — §6 J1, §3.A (the Footer row and every "Motion off" cell), §3.B (State), §3.G, §7 (the site-wide confirmation), §1 (the press bug found while planning).

**Branch:** `feat/journey-j1-motion-switch`, from `main`.

**Scope ruling.** The spec has six PRs; this plan is J1 only. The J2 plan is written when J1 merges, from the code J1 actually shipped, the way Phase 2's plans were. J1 assumes the owner says yes to §7 (Motion off also quiets the site's own motions). If the owner says no, keep Task 2's press fix and Task 5 as they are. Drop Tasks 1, 3 and 4 (the head script, `SiteMotion` and the switch move to J3), and cut Task 2 to its device half.

## Global Constraints

Every task's requirements include all of these.

- TypeScript strict, never `any`. A DOM test double may cast through `unknown` to its DOM type. Files stay under 500 lines, source, tests and scripts; `tests/unit/tokens.contract.test.ts` enforces it.
- The Industry grammar only: tokens, never a raw 6-digit hex; no `text-[`, `rounded-[`, `tracking-[`, `shadow-[`, `duration-[` or `z-[` classes in `.tsx`; spacing on the scale steps (0–24); square and hairline. Legends are `font-display … uppercase tracking-caps`. The contract test enforces all of this.
- Every string a traveller sees lives in `src/messages/en-IN/*`, with no literals in JSX. J1's two new strings are prototype v3's own words: "Motion" and "Your device asks for reduced motion".
- The traveller CSP in `next.config.ts` does not change. The head script is inline like the theme's, which `script-src 'self' 'unsafe-inline'` allows. No `eval`, no new origins.
- The check never waits on motion code. Nothing in J1 delays hydration, the plates or Run.
- On a touch screen every control answers a finger across 44px (#43: the coarse-pointer rule in `motion.css`, `.tap-44` for a control the rule does not already cover, and `tests/e2e/tap-targets.spec.ts`), without changing the drawing.
- Motion off means exactly what the device's reduced-motion setting means, on every traveller page. The console (its own layout, providers and CSP) is untouched.
- TDD: every step that adds behaviour starts with a test that fails for the stated reason. A test that passes before its code exists is testing the wrong thing, unless the step names it as the control.
- Run the whole gate before every commit: `npm run check` (typecheck, lint, unit, build). Before the PR, also run the full `npx playwright test`. A subset is not the gate.
- Lint warnings count: a new warning is fixed before the commit, not left.
- Playwright never runs against another session's dev server (port 3100), and never with `E2E_BASE_URL` pointed at a live source. Work in the worktree below; its own `next dev` on 4210 runs in fixture mode.
- Conventional commits, with **no `Co-Authored-By` trailer** (the project's CLAUDE.md forbids it). Never commit `.env*` or `settings.local.json`.
- Push, open the PR and merge only with the owner's go-ahead.

## Before you start

- The owner has approved the spec and answered §7.
- Create the worktree. Next 16 allows one `next dev` per folder, and another session may be holding the main one:

```bash
git -C /Users/heytherevibin/Downloads/Code/Dev/trackandtrace worktree add ../trackandtrace-j1 -b feat/journey-j1-motion-switch main
```

```bash
cp -cR /Users/heytherevibin/Downloads/Code/Dev/trackandtrace/node_modules /Users/heytherevibin/Downloads/Code/Dev/trackandtrace-j1/node_modules
```

`cp -c` is an instant APFS clone; a symlink breaks Turbopack, which rejects a `node_modules` outside the project root. Every command below runs in `/Users/heytherevibin/Downloads/Code/Dev/trackandtrace-j1`. No `.env.local` is needed: the e2e web server blanks Supabase and sets `PNR_SOURCE=fixture`.

- Read `AGENTS.md`: this is Next 16. The inline-script pattern used here comes from `node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`, §Themes.

## File Structure

| File | Responsibility |
|---|---|
| `src/components/motion/motion-boot.ts` | The stored key, the reduced-motion query, `resolveMotion` (pure), and `MOTION_BOOT_SCRIPT`, the pre-paint script |
| `src/components/motion/use-motion.ts` | Client: `applyMotion`, `chooseMotion`, `useMotion`, `MOTION_EVENT` |
| `src/components/motion/site-motion.tsx` | Client: `MotionConfig` following Motion; re-applies on a device-setting change or another tab's choice |
| `src/app/(site)/layout.tsx` | Modify: the head script |
| `src/components/providers.tsx` | Modify: `SiteMotion` replaces the fixed `MotionConfig reducedMotion="user"` |
| `src/styles/motion.css` | Modify: the press fix in the reduced-motion block; the Motion-off block |
| `src/components/ui/switch.tsx` | Modify: export the track and thumb classes |
| `src/components/shell/motion-toggle.tsx` | The footer's Motion switch |
| `src/components/shell/footer.tsx` | Modify: the switch in the bottom bar, after the clock |
| `src/messages/en-IN/shell.ts` | Modify: `footer.motion`, `footer.motionByDevice` |
| `tests/unit/components/motion/motion-boot.test.ts` | Node: `resolveMotion`, and the script string run in a VM against the same cases |
| `tests/unit/components/motion/use-motion.test.tsx` | jsdom: choosing, applying, following the device and other tabs, never writing on mount |
| `tests/unit/components/motion-toggle.test.tsx` | jsdom: the switch |
| `tests/e2e/motion-switch.spec.ts` | Before paint; Motion off stills the site; Motion's own turn; the device changing; the switch |
| `tests/e2e/tap-targets.spec.ts` | Modify: measure `role="switch"`; pass over hidden form proxies |
| `tests/e2e/journey/collisions.ts` | The shared collision checker |
| `tests/e2e/journey/collisions.spec.ts` | The checker's self-test, and today's landing as its baseline |
| `DESIGN.md`, `docs/architecture.md` | The Motion switch, the press fix, the new folder |

---

### Task 1: Motion, decided before first paint

**Files:**
- Create: `src/components/motion/motion-boot.ts`, `tests/unit/components/motion/motion-boot.test.ts`, `tests/e2e/motion-switch.spec.ts`
- Modify: `src/app/(site)/layout.tsx`

**Interfaces — Produces** (later tasks and PRs import these exact names):
- `MOTION_STORAGE_KEY = "tt.motion"`. The only value ever stored is `"off"`; on is the default and is stored as nothing.
- `REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"`
- `type MotionState = "on" | "off"`
- `resolveMotion(stored: string | null, deviceReduced: boolean): MotionState`
- `MOTION_BOOT_SCRIPT: string`, which writes `data-motion` on `<html>`. J4 extends it with `data-saver` and `data-drawing`.

- [ ] **Step 1: Write the failing unit test** — `tests/unit/components/motion/motion-boot.test.ts`

```ts
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { MOTION_BOOT_SCRIPT, MOTION_STORAGE_KEY, REDUCED_MOTION_QUERY, resolveMotion } from "@/components/motion/motion-boot";

// The script runs in <head> before any module, so it cannot import resolveMotion: it restates it. These tests
// run the real string against a stand-in page and hold the two to the same answers.

interface StandIn {
  readonly stored: string | null;
  readonly reduced: boolean;
  readonly storageThrows?: boolean;
  readonly noMatchMedia?: boolean;
}

/** Runs MOTION_BOOT_SCRIPT against a stand-in page and returns what it wrote to <html data-motion>. */
function boot({ stored, reduced, storageThrows = false, noMatchMedia = false }: StandIn): string | undefined {
  const written = new Map<string, string>();
  runInNewContext(MOTION_BOOT_SCRIPT, {
    localStorage: {
      getItem: (key: string) => {
        if (storageThrows) throw new Error("SecurityError: site data is blocked");
        return key === MOTION_STORAGE_KEY ? stored : null;
      },
    },
    window: noMatchMedia ? {} : { matchMedia: (query: string) => ({ matches: query === REDUCED_MOTION_QUERY && reduced }) },
    document: { documentElement: { setAttribute: (name: string, value: string) => written.set(name, value) } },
  });
  return written.get("data-motion");
}

const CASES = [
  [null, false, "on"],
  ["off", false, "off"],
  ["on", false, "on"],
  ["anything else", false, "on"],
  [null, true, "off"],
  ["off", true, "off"],
] as const;

describe("resolveMotion", () => {
  it.each(CASES)("stored %s, device reduced %s: %s", (stored, reduced, expected) => {
    expect(resolveMotion(stored, reduced)).toBe(expected);
  });
});

describe("MOTION_BOOT_SCRIPT", () => {
  it.each(CASES)("writes what resolveMotion decides: stored %s, device reduced %s", (stored, reduced, expected) => {
    expect(boot({ stored, reduced })).toBe(expected);
  });

  it("still decides when storage throws (blocked site data)", () => {
    expect(boot({ stored: "off", reduced: false, storageThrows: true })).toBe("on");
    expect(boot({ stored: null, reduced: true, storageThrows: true })).toBe("off");
  });

  it("still decides without matchMedia", () => {
    expect(boot({ stored: "off", reduced: false, noMatchMedia: true })).toBe("off");
    expect(boot({ stored: null, reduced: false, noMatchMedia: true })).toBe("on");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/components/motion/motion-boot.test.ts`
Expected: FAIL, `Failed to resolve import "@/components/motion/motion-boot"`.

- [ ] **Step 3: Write `src/components/motion/motion-boot.ts`**

```ts
// Motion, decided before first paint. The footer's Motion switch stores "off" under MOTION_STORAGE_KEY (on
// is the default and is stored as nothing); the device's reduced-motion setting turns Motion off whatever
// is stored. The answer lives on <html data-motion="on|off">: motion.css and Motion (SiteMotion) follow it,
// and React reads it but never writes it on mount, so the first paint is already right.
export const MOTION_STORAGE_KEY = "tt.motion";
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export type MotionState = "on" | "off";

/** Off when the reader switched Motion off, or the device asks for reduced motion. */
export function resolveMotion(stored: string | null, deviceReduced: boolean): MotionState {
  return stored === "off" || deviceReduced ? "off" : "on";
}

/** Inline in the site's <head>. Restates resolveMotion, since it runs before any module; either read may throw. */
export const MOTION_BOOT_SCRIPT = `(function(){var m="on";try{if(localStorage.getItem("${MOTION_STORAGE_KEY}")==="off")m="off"}catch(e){}try{if(window.matchMedia("${REDUCED_MOTION_QUERY}").matches)m="off"}catch(e){}document.documentElement.setAttribute("data-motion",m)})();`;
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/unit/components/motion/motion-boot.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Write the failing e2e** — `tests/e2e/motion-switch.spec.ts`

```ts
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// The Motion switch (spec 2026-09-24 §3.A, §3.B). Motion is decided before first paint. Off stills the
// site's own movements exactly as the device's reduced-motion setting does, on every traveller page.

declare global {
  interface Window {
    __motionAtParse?: string | null;
  }
}

/** What <html data-motion> said the moment the document finished parsing: before React, before hydration. */
async function motionAtParse(page: Page, path: string): Promise<string | null | undefined> {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      window.__motionAtParse = document.documentElement.getAttribute("data-motion");
    });
  });
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__motionAtParse !== undefined);
  return page.evaluate(() => window.__motionAtParse);
}

test.describe("Motion is decided before first paint", () => {
  test("on by default", async ({ page }) => {
    expect(await motionAtParse(page, "/")).toBe("on");
  });

  test("off on every page once the reader has switched it off", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("tt.motion", "off"));
    expect(await motionAtParse(page, "/watchlist")).toBe("off");
  });

  test("off when the device asks for reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await motionAtParse(page, "/")).toBe("off");
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npx playwright test tests/e2e/motion-switch.spec.ts`
Expected: FAIL in both projects, `Expected: "on"  Received: null` (and `"off"`/`null`): nothing writes the attribute yet.

- [ ] **Step 7: Put the script in the site layout's `<head>`** — `src/app/(site)/layout.tsx`

Add the import beside the others:

```tsx
import { MOTION_BOOT_SCRIPT } from "@/components/motion/motion-boot";
```

and give `<html>` a `<head>` before `<body>` (the `suppressHydrationWarning` already on `<html>` covers the attribute the script adds):

```tsx
    <html lang="en" className={fontVars} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        {/* Motion, before first paint: html[data-motion] (motion-boot.ts). Inline, as the traveller CSP allows. */}
        <script dangerouslySetInnerHTML={{ __html: MOTION_BOOT_SCRIPT }} />
      </head>
      <body className="bg-surface-0 text-ink-1">
```

- [ ] **Step 8: Run the e2e and watch it pass**

Run: `npx playwright test tests/e2e/motion-switch.spec.ts tests/e2e/csp.spec.ts`
Expected: PASS, 6 motion tests (3 × 2 projects), and the CSP spec still clean on every route in both faces.

- [ ] **Step 9: Run the gate and commit**

Run: `npm run check`. Expected: green.

```bash
git add src/components/motion/motion-boot.ts "src/app/(site)/layout.tsx" tests/unit/components/motion/motion-boot.test.ts tests/e2e/motion-switch.spec.ts
git commit -m "feat(motion): decide Motion before first paint"
```

---

### Task 2: Motion off stills the site, and a held button keeps still under reduced motion

**Files:**
- Modify: `src/styles/motion.css`, `tests/e2e/motion-switch.spec.ts`

**Interfaces:**
- Consumes: `html[data-motion]` (Task 1).
- Produces: the rule that a page under `html[data-motion="off"]` behaves as it does under the device's reduced motion. J3's journey keys its static layouts on the same attribute.

**The bug this fixes** (spec §1, reproduced in Chromium while planning). Inside `@media (prefers-reduced-motion: reduce)`, `:where(button, [role="button"], .press):active { transform: none }` has specificity (0,1,0). The press rule, `:where(…):active:not(:focus-visible):not(:disabled):not([aria-disabled="true"])`, has (0,4,0) and wins. So under reduced motion a held button still settles to 96%, only instantly.

- [ ] **Step 1: Write the failing e2e.** Add `Locator` to the type import at the top of `tests/e2e/motion-switch.spec.ts`:

```ts
import type { Locator, Page } from "@playwright/test";
```

add `gotoReady` to the imports:

```ts
import { gotoReady } from "./helpers";
```

and append:

```ts
/** Holds the pointer down on a button and reads how far it settled: 1 means it did not move. */
async function heldScale(page: Page, target: Locator): Promise<number> {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(250);
  const scale = await target.evaluate((el) => {
    const t = getComputedStyle(el).transform;
    return t === "none" ? 1 : Number.parseFloat(t.slice(7));
  });
  // Release away from the button, so the press never runs a check.
  await page.mouse.move(0, 0);
  await page.mouse.up();
  return scale;
}

const STILLED_BY: Readonly<Record<string, (page: Page) => Promise<void>>> = {
  "the reader switched Motion off": (page) => page.addInitScript(() => window.localStorage.setItem("tt.motion", "off")),
  "the device asks for reduced motion": (page) => page.emulateMedia({ reducedMotion: "reduce" }),
};

test.describe("Motion off stills the site's own movements", () => {
  for (const [why, still] of Object.entries(STILLED_BY)) {
    test(`when ${why}: a held button does not settle, nothing eases, anchors jump`, async ({ page }) => {
      await still(page);
      await gotoReady(page, "/");
      const run = page.getByRole("button", { name: "Run", exact: true }).first();
      expect(await run.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("1e-05s");
      expect(await heldScale(page, run)).toBe(1);
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
    });
  }
});
```

- [ ] **Step 2: Run it and watch both cases fail, each for its own reason**

Run: `npx playwright test tests/e2e/motion-switch.spec.ts -g "stills the site"`
Expected: FAIL. "the reader switched Motion off" fails with `Expected: "1e-05s"  Received: "0.2s"`, because nothing reads `data-motion` yet. "the device asks for reduced motion" fails with `Expected: 1  Received: 0.96`: the bug above.

- [ ] **Step 3: Rewrite the tail of `src/styles/motion.css`.** Replace everything from `@media (prefers-reduced-motion: reduce) {` to the end of the file with:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  ::before,
  ::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  ::view-transition-old(*),
  ::view-transition-new(*),
  ::view-transition-group(*) {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
  }
  .skeleton::after,
  .sweep {
    animation: none;
  }
  /* !important: the press rule (:active plus three :not()s) outranks this selector, which had left a held
     button settling to 96% under reduced motion, only instantly. */
  :where(button, [role="button"], .press):active {
    transform: none !important;
  }
}

/* Motion off (the landing footer's switch; html[data-motion], written before first paint): exactly the rules
   above, on every traveller page, whatever the device says. Keep the two blocks identical. */
html[data-motion="off"],
html[data-motion="off"] *,
html[data-motion="off"] ::before,
html[data-motion="off"] ::after {
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.01ms !important;
  scroll-behavior: auto !important;
}
html[data-motion="off"]::view-transition-old(*),
html[data-motion="off"]::view-transition-new(*),
html[data-motion="off"]::view-transition-group(*) {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
}
html[data-motion="off"] .skeleton::after,
html[data-motion="off"] .sweep {
  animation: none;
}
html[data-motion="off"] :where(button, [role="button"], .press):active {
  transform: none !important;
}
```

- [ ] **Step 4: Run it, and the specs that guard Motion on**

Run: `npx playwright test tests/e2e/motion-switch.spec.ts tests/e2e/press.spec.ts tests/e2e/smoothness.spec.ts`
Expected: PASS. Both "stills the site" cases pass, and with Motion on buttons still press and ease and in-page anchors still glide.

- [ ] **Step 5: Run the gate and commit**

Run: `npm run check`. Expected: green.

```bash
git add src/styles/motion.css tests/e2e/motion-switch.spec.ts
git commit -m "fix(motion): keep a held button still under reduced motion, and when Motion is off"
```

---

### Task 3: Motion's own animations follow, and the page follows the device

**Files:**
- Create: `src/components/motion/use-motion.ts`, `src/components/motion/site-motion.tsx`, `tests/unit/components/motion/use-motion.test.tsx`
- Modify: `src/components/providers.tsx`, `tests/e2e/motion-switch.spec.ts`

**Interfaces:**
- Consumes: `MOTION_STORAGE_KEY`, `REDUCED_MOTION_QUERY`, `resolveMotion`, `MotionState` (Task 1).
- Produces:
  - `MOTION_EVENT = "tt:motion"`, dispatched on `window` after every rewrite of `data-motion`. J3's journey rebuilds on it.
  - `applyMotion(choice?: string | null): MotionState` re-resolves Motion from `choice` (or, when it is omitted, the stored choice) and the device, writes `data-motion`, and dispatches `MOTION_EVENT`.
  - `chooseMotion(on: boolean): void` stores the choice (switching on removes the key), then calls `applyMotion` with it. A page whose storage is blocked still follows the switch.
  - `useMotion(): { readonly motion: MotionState; readonly deviceReduced: boolean }`. The server and hydration assume on and not reduced.
  - `SiteMotion({ children }: { readonly children: ReactNode })` sets `MotionConfig reducedMotion` to `"always"` when Motion is off and `"user"` otherwise, and listens for the device setting and other tabs.

- [ ] **Step 1: Write the failing unit test** — `tests/unit/components/motion/use-motion.test.tsx`

```tsx
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SiteMotion } from "@/components/motion/site-motion";
import { MOTION_EVENT, applyMotion, chooseMotion, useMotion } from "@/components/motion/use-motion";

function Probe() {
  const { motion, deviceReduced } = useMotion();
  return <p data-testid="probe">{`${motion}${deviceReduced ? " by device" : ""}`}</p>;
}

/** A reduced-motion setting the test can change, calling listeners as a browser does. */
function deviceSetting(reduced: boolean): { readonly change: (next: boolean) => void } {
  const listeners = new Set<() => void>();
  const current = { reduced };
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        get matches() {
          return query === "(prefers-reduced-motion: reduce)" && current.reduced;
        },
        media: query,
        onchange: null,
        addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
  return {
    change: (next) => {
      current.reduced = next;
      for (const listener of listeners) listener();
    },
  };
}

const html = () => document.documentElement;

describe("the reader's Motion choice", () => {
  beforeEach(() => {
    html().setAttribute("data-motion", "on");
  });

  it("switched off: stored, written to <html>, and announced", () => {
    const heard = vi.fn();
    window.addEventListener(MOTION_EVENT, heard);
    chooseMotion(false);
    window.removeEventListener(MOTION_EVENT, heard);
    expect(window.localStorage.getItem("tt.motion")).toBe("off");
    expect(html()).toHaveAttribute("data-motion", "off");
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("switched back on: forgotten, since on is the default", () => {
    chooseMotion(false);
    chooseMotion(true);
    expect(window.localStorage.getItem("tt.motion")).toBeNull();
    expect(html()).toHaveAttribute("data-motion", "on");
  });

  it("still stills this page when storage refuses the choice", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    chooseMotion(false);
    expect(html()).toHaveAttribute("data-motion", "off");
  });

  it("gives way to the device: reduced motion is off whatever is stored", () => {
    deviceSetting(true);
    expect(applyMotion()).toBe("off");
    expect(html()).toHaveAttribute("data-motion", "off");
  });

  it("is read by useMotion as the page shows it", () => {
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("on");
    act(() => chooseMotion(false));
    expect(screen.getByTestId("probe")).toHaveTextContent("off");
  });
});

describe("SiteMotion", () => {
  beforeEach(() => {
    html().setAttribute("data-motion", "on");
  });

  it("follows the device setting while the page is open", () => {
    const device = deviceSetting(false);
    render(
      <SiteMotion>
        <Probe />
      </SiteMotion>,
    );
    act(() => device.change(true));
    expect(html()).toHaveAttribute("data-motion", "off");
    expect(screen.getByTestId("probe")).toHaveTextContent("off by device");
    act(() => device.change(false));
    expect(html()).toHaveAttribute("data-motion", "on");
  });

  it("follows the choice made in another tab", () => {
    render(
      <SiteMotion>
        <Probe />
      </SiteMotion>,
    );
    window.localStorage.setItem("tt.motion", "off");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "tt.motion", newValue: "off" }));
    });
    expect(html()).toHaveAttribute("data-motion", "off");
  });

  it("writes <html data-motion> only when something changes, never on mount", () => {
    // The stored choice disagrees with the attribute on purpose: had SiteMotion written on mount, it would read off.
    window.localStorage.setItem("tt.motion", "off");
    render(
      <SiteMotion>
        <Probe />
      </SiteMotion>,
    );
    expect(html()).toHaveAttribute("data-motion", "on");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/components/motion/use-motion.test.tsx`
Expected: FAIL, `Failed to resolve import "@/components/motion/site-motion"`.

- [ ] **Step 3: Write `src/components/motion/use-motion.ts`**

```ts
"use client";

import { useSyncExternalStore } from "react";
import { MOTION_STORAGE_KEY, REDUCED_MOTION_QUERY, resolveMotion, type MotionState } from "./motion-boot";

/** Dispatched on window after every rewrite of <html data-motion>; the journey (J3) rebuilds on it. */
export const MOTION_EVENT = "tt:motion";

function storedChoice(): string | null {
  try {
    return window.localStorage.getItem(MOTION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function deviceReducesMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** Re-resolves Motion from the choice (else the stored one) and the device, writes it, and tells listeners. */
export function applyMotion(choice: string | null = storedChoice()): MotionState {
  const motion = resolveMotion(choice, deviceReducesMotion());
  document.documentElement.setAttribute("data-motion", motion);
  window.dispatchEvent(new Event(MOTION_EVENT));
  return motion;
}

/** The footer switch. On is the default, so switching on forgets the choice rather than storing "on". */
export function chooseMotion(on: boolean): void {
  const choice = on ? null : "off";
  try {
    if (choice === null) window.localStorage.removeItem(MOTION_STORAGE_KEY);
    else window.localStorage.setItem(MOTION_STORAGE_KEY, choice);
  } catch {
    // Storage refused (blocked site data): this page still follows the switch; the next one will not know.
  }
  applyMotion(choice);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(MOTION_EVENT, onChange);
  return () => window.removeEventListener(MOTION_EVENT, onChange);
}

const readMotion = (): MotionState => (document.documentElement.getAttribute("data-motion") === "off" ? "off" : "on");
const assumeOn = (): MotionState => "on";
const assumeNotReduced = (): boolean => false;

/** Motion as the page shows it (<html data-motion>). The server and hydration assume on and not reduced. */
export function useMotion(): { readonly motion: MotionState; readonly deviceReduced: boolean } {
  const motion = useSyncExternalStore(subscribe, readMotion, assumeOn);
  const deviceReduced = useSyncExternalStore(subscribe, deviceReducesMotion, assumeNotReduced);
  return { motion, deviceReduced };
}
```

- [ ] **Step 4: Write `src/components/motion/site-motion.tsx`**

```tsx
"use client";

import { MotionConfig } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { MOTION_STORAGE_KEY, REDUCED_MOTION_QUERY } from "./motion-boot";
import { applyMotion, useMotion } from "./use-motion";

/**
 * Motion's own animations follow the site's Motion. When Motion is off they are reduced ("always") whatever
 * the device says; when it is on, the device decides ("user"). SiteMotion also keeps <html data-motion>
 * true while the page is open, when the device setting changes or another tab flips the switch. It never
 * writes on mount: the head script already did.
 */
export function SiteMotion({ children }: { readonly children: ReactNode }) {
  const { motion } = useMotion();
  useEffect(() => {
    const device = window.matchMedia(REDUCED_MOTION_QUERY);
    const onDevice = () => applyMotion();
    const onStorage = (event: StorageEvent) => {
      if (event.key === MOTION_STORAGE_KEY) applyMotion();
    };
    device.addEventListener("change", onDevice);
    window.addEventListener("storage", onStorage);
    return () => {
      device.removeEventListener("change", onDevice);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return <MotionConfig reducedMotion={motion === "off" ? "always" : "user"}>{children}</MotionConfig>;
}
```

- [ ] **Step 5: Run the unit test and watch it pass**

Run: `npx vitest run tests/unit/components/motion/use-motion.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 6: Write the failing e2e.** Append to `tests/e2e/motion-switch.spec.ts`:

```ts
/** Clicks the theme button in the page and returns the most distinct transforms any icon took over 30 frames. */
async function mostTurnsOfThemeIcon(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((done) => {
        const seen = new Map<Element, Set<string>>();
        const sample = (frame: number) => {
          for (const icon of document.querySelectorAll('header button[aria-label^="Theme"] > span > span')) {
            seen.set(icon, (seen.get(icon) ?? new Set<string>()).add(getComputedStyle(icon).transform));
          }
          if (frame < 30) requestAnimationFrame(() => sample(frame + 1));
          else done(Math.max(0, ...[...seen.values()].map((values) => values.size)));
        };
        document.querySelector<HTMLButtonElement>('header button[aria-label^="Theme"]')!.click();
        requestAnimationFrame(() => sample(1));
      }),
  );
}

test.describe("Motion's own animations follow Motion", () => {
  // The control: it passes before SiteMotion exists, and proves the sampler can see a turn at all.
  test("with Motion on, the theme icon turns through many frames as it changes", async ({ page }) => {
    await gotoReady(page, "/watchlist");
    expect(await mostTurnsOfThemeIcon(page)).toBeGreaterThan(3);
  });

  test("with Motion off, the icon changes at once, without turning", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("tt.motion", "off"));
    await gotoReady(page, "/watchlist");
    expect(await mostTurnsOfThemeIcon(page)).toBeLessThanOrEqual(2);
    await expect(page.locator("html")).toHaveAttribute("data-theme", /light|dark/);
  });

  test("the page follows the device setting changing while it is open", async ({ page }) => {
    await gotoReady(page, "/");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
  });
});
```

(At most 2: under `reducedMotion="always"` an icon may jump once, from its `initial` to its target, but never animates through the frames between.)

- [ ] **Step 7: Run it and watch the right two fail**

Run: `npx playwright test tests/e2e/motion-switch.spec.ts -g "follow Motion"`
Expected: the control passes. "with Motion off" fails with `Expected: <= 2  Received: ` about 19 (Motion still follows only the device). "follows the device setting" fails with `Expected: "off"  Received: "on"` (nothing listens yet).

- [ ] **Step 8: Put `SiteMotion` in the providers** — `src/components/providers.tsx`

Replace the file with:

```tsx
"use client";

import { LazyMotion, domAnimation } from "motion/react";
import type { ReactNode } from "react";
import { HydrationMarker } from "@/components/hydration-marker";
import { SiteMotion } from "@/components/motion/site-motion";
import { SessionProvider } from "@/components/session/session-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ToastHost } from "@/components/ui/toast";
import type { SessionUser } from "@/types/session";

export function Providers({ userPromise, children }: { readonly userPromise: Promise<SessionUser | null>; readonly children: ReactNode }) {
  return (
    <ThemeProvider>
      <SessionProvider userPromise={userPromise}>
        <LazyMotion features={domAnimation} strict>
          <SiteMotion>
            <HydrationMarker />
            {children}
            <ToastHost />
          </SiteMotion>
        </LazyMotion>
      </SessionProvider>
    </ThemeProvider>
  );
}
```

`src/console/components/console-providers.tsx` keeps its own `MotionConfig reducedMotion="user"`: the console has no Motion switch.

- [ ] **Step 9: Run the e2e and the theme specs, and watch them pass**

Run: `npx playwright test tests/e2e/motion-switch.spec.ts tests/e2e/theme.spec.ts tests/e2e/smoothness.spec.ts`
Expected: PASS.

- [ ] **Step 10: Run the gate and commit**

Run: `npm run check`. Expected: green.

```bash
git add src/components/motion/use-motion.ts src/components/motion/site-motion.tsx src/components/providers.tsx tests/unit/components/motion/use-motion.test.tsx tests/e2e/motion-switch.spec.ts
git commit -m "feat(motion): Motion's own animations and the page follow Motion as it changes"
```

---

### Task 4: The footer's Motion switch

**Files:**
- Create: `src/components/shell/motion-toggle.tsx`, `tests/unit/components/motion-toggle.test.tsx`
- Modify: `src/components/ui/switch.tsx`, `src/components/shell/footer.tsx`, `src/messages/en-IN/shell.ts`, `tests/e2e/motion-switch.spec.ts`, `tests/e2e/tap-targets.spec.ts`, `DESIGN.md`, `docs/architecture.md`

**Interfaces:**
- Consumes: `chooseMotion`, `useMotion` (Task 3).
- Produces:
  - `SWITCH_TRACK`, `SWITCH_THUMB` class strings exported from `@/components/ui/switch`. J3's Sound switch uses them too.
  - `MotionToggle()`, a client component with no props.
  - `messages.shell.footer.motion` ("Motion") and `messages.shell.footer.motionByDevice` ("Your device asks for reduced motion").

The switch sits in the landing footer's bottom bar, after the IST clock, as in v3. Its label is the bar's legend voice (condensed capitals, 12px), not the form switch's body-text label. Under the device's reduced motion it reads off and is disabled, and the reason sits beside it, tied to it by `aria-describedby`. Only the track dims. The words stay at full contrast.

It is the first Base UI switch on a page the tap-target spec scans, and that brings two things the spec does not yet know. Base UI renders the switch as a `span[role="switch"]` plus a proxy `<input type="checkbox">`: `aria-hidden`, `tabindex="-1"`, 1×1px, fixed at the window's top-left corner and clipped to nothing (`@base-ui/utils/visuallyHidden.js`). The spec's selector matches that proxy, which no finger aims at, and misses `role="switch"`, which a finger does aim at. Steps 10–12 teach the spec both, then give the switch its 44px.

- [ ] **Step 1: Write the failing unit test** — `tests/unit/components/motion-toggle.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MotionToggle } from "@/components/shell/motion-toggle";

function deviceReducesMotion(): void {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}

describe("MotionToggle", () => {
  beforeEach(() => {
    document.documentElement.setAttribute("data-motion", "on");
  });

  it("is a switch named Motion, on while the page moves", () => {
    render(<MotionToggle />);
    expect(screen.getByRole("switch", { name: "Motion" })).toBeChecked();
  });

  it("switched off: remembered, and the page is still", async () => {
    render(<MotionToggle />);
    await userEvent.click(screen.getByRole("switch", { name: "Motion" }));
    expect(screen.getByRole("switch", { name: "Motion" })).not.toBeChecked();
    expect(document.documentElement).toHaveAttribute("data-motion", "off");
    expect(window.localStorage.getItem("tt.motion")).toBe("off");
  });

  it("switched back on: the choice is forgotten", async () => {
    render(<MotionToggle />);
    await userEvent.click(screen.getByRole("switch", { name: "Motion" }));
    await userEvent.click(screen.getByRole("switch", { name: "Motion" }));
    expect(screen.getByRole("switch", { name: "Motion" })).toBeChecked();
    expect(window.localStorage.getItem("tt.motion")).toBeNull();
  });

  it("under the device's reduced motion: off, disabled, and it says why", () => {
    deviceReducesMotion();
    document.documentElement.setAttribute("data-motion", "off");
    render(<MotionToggle />);
    const toggle = screen.getByRole("switch", { name: "Motion" });
    expect(toggle).not.toBeChecked();
    expect(toggle).toHaveAttribute("aria-disabled", "true");
    expect(toggle).toHaveAccessibleDescription("Your device asks for reduced motion");
  });

  it("labels itself in the footer bar's legend voice", () => {
    render(<MotionToggle />);
    expect(screen.getByText("Motion")).toHaveClass("font-display", "uppercase", "tracking-caps");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/components/motion-toggle.test.tsx`
Expected: FAIL, `Failed to resolve import "@/components/shell/motion-toggle"`.

- [ ] **Step 3: Add the copy** — `src/messages/en-IN/shell.ts`, inside `footer`, after `sections: "Sections",`:

```ts
    motion: "Motion",
    motionByDevice: "Your device asks for reduced motion",
```

- [ ] **Step 4: Share the switch's track and thumb** — `src/components/ui/switch.tsx`

Replace the file with (behaviour unchanged; the two class strings are named and exported):

```tsx
"use client";

import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

/** The square track, steel when on, and its thumb. The footer's switches share them and label as legends. */
export const SWITCH_TRACK =
  "relative inline-flex h-5 w-9 shrink-0 items-center border border-line-strong bg-surface-1 transition-colors data-[checked]:border-accent-strong data-[checked]:bg-accent-strong";
export const SWITCH_THUMB =
  "block size-3.5 translate-x-0.5 bg-ink-3 transition-transform duration-(--duration-fast) ease-out data-[checked]:translate-x-4.5 data-[checked]:bg-accent-ink";

/** A square toggle: hairline track, steel when on. */
export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  className,
}: {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly disabled?: boolean;
  readonly className?: string;
}) {
  return (
    <label className={cn("flex items-start gap-3", disabled && "opacity-45", className)}>
      <BaseSwitch.Root checked={checked} onCheckedChange={(next) => onCheckedChange(next)} disabled={disabled} className={cn("mt-0.5", SWITCH_TRACK)}>
        <BaseSwitch.Thumb className={SWITCH_THUMB} />
      </BaseSwitch.Root>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-1">{label}</span>
        {description ? <span className="block text-label text-ink-3">{description}</span> : null}
      </span>
    </label>
  );
}
```

- [ ] **Step 5: Write `src/components/shell/motion-toggle.tsx`**

```tsx
"use client";

import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { useId } from "react";
import { chooseMotion, useMotion } from "@/components/motion/use-motion";
import { SWITCH_THUMB, SWITCH_TRACK } from "@/components/ui/switch";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";

/**
 * The landing footer's Motion switch, after the clock. On by default; off stills every traveller page as the
 * device's reduced-motion setting does (motion.css, SiteMotion). When the device asks for reduced motion it
 * reads off, is disabled, and says why beside it. Only the track dims; the words keep their contrast.
 */
export function MotionToggle() {
  const { motion, deviceReduced } = useMotion();
  const noteId = useId();
  const m = messages.shell.footer;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <label className={cn("inline-flex items-center gap-2.5", !deviceReduced && "cursor-pointer")}>
        <BaseSwitch.Root
          checked={motion === "on"}
          onCheckedChange={(next) => chooseMotion(next)}
          disabled={deviceReduced}
          aria-describedby={deviceReduced ? noteId : undefined}
          className={cn(SWITCH_TRACK, "data-[disabled]:opacity-45")}
        >
          <BaseSwitch.Thumb className={SWITCH_THUMB} />
        </BaseSwitch.Root>
        <span className="font-display text-xs font-semibold uppercase tracking-caps text-ink-1/70">{m.motion}</span>
      </label>
      {deviceReduced ? (
        <span id={noteId} className="text-label text-ink-3">
          {m.motionByDevice}
        </span>
      ) : null}
    </span>
  );
}
```

- [ ] **Step 6: Run the unit test and watch it pass**

Run: `npx vitest run tests/unit/components/motion-toggle.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 7: Write the failing e2e.** Add `expectAxeClean` to the helpers import in `tests/e2e/motion-switch.spec.ts`:

```ts
import { expectAxeClean, gotoReady } from "./helpers";
```

and append:

```ts
test.describe("the footer's Motion switch", () => {
  const motionSwitch = (page: Page) => page.getByRole("contentinfo").getByRole("switch", { name: "Motion" });

  test("sits in the landing's footer, on; app pages' one-line footer has none", async ({ page }) => {
    await gotoReady(page, "/");
    await expect(motionSwitch(page)).toBeChecked();
    await gotoReady(page, "/watchlist");
    await expect(motionSwitch(page)).toHaveCount(0);
  });

  test("off stills the site and holds across pages and visits; on again forgets it", async ({ page }) => {
    await gotoReady(page, "/");
    await motionSwitch(page).click();
    await expect(motionSwitch(page)).not.toBeChecked();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
    await gotoReady(page, "/watchlist");
    await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
    await gotoReady(page, "/");
    await expect(motionSwitch(page)).not.toBeChecked();
    await motionSwitch(page).click();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
    expect(await page.evaluate(() => window.localStorage.getItem("tt.motion"))).toBeNull();
  });

  test("under the device's reduced motion: off, disabled, says why, and axe is clean", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoReady(page, "/");
    await expect(motionSwitch(page)).not.toBeChecked();
    await expect(motionSwitch(page)).toHaveAttribute("aria-disabled", "true");
    await expect(motionSwitch(page)).toHaveAccessibleDescription("Your device asks for reduced motion");
    await expectAxeClean(page);
  });
});
```

- [ ] **Step 8: Run it and watch it fail**

Run: `npx playwright test tests/e2e/motion-switch.spec.ts -g "footer's Motion switch"`
Expected: FAIL. `getByRole('contentinfo').getByRole('switch', { name: 'Motion' })` resolves to no element: the footer does not render the switch yet.

- [ ] **Step 9: Put the switch in the footer's bar** — `src/components/shell/footer.tsx`

Import it beside the other shell imports:

```tsx
import { MotionToggle } from "./motion-toggle";
```

and in `FullFooter`'s bottom bar, after the clock:

```tsx
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <ServicePill status={status} />
            <IstClock />
            <MotionToggle />
          </div>
```

`CompactFooter` does not change.

- [ ] **Step 10: Run the e2e, axe, responsive, CSP and tap-target specs**

Run: `npx playwright test tests/e2e/motion-switch.spec.ts tests/e2e/axe.spec.ts tests/e2e/responsive.spec.ts tests/e2e/csp.spec.ts tests/e2e/tap-targets.spec.ts`
Expected: everything passes except one test. The switch holds on every width from 320px, and axe stays clean on every route in both faces. The exception is `/ answers a finger across 44px` (mobile), which FAILS with `INPUT [1x1] reaches 1x1`: the proxy checkbox described above.

- [ ] **Step 11: Teach the tap-target spec what a target is** — `tests/e2e/tap-targets.spec.ts`

Measure switches, and pass over a form proxy that is hidden from everyone. Change the selector line to:

```ts
      const SELECTOR = 'a[href], button, [role="button"], [role="switch"], input:not([type="hidden"]), select, textarea, summary';
```

and after the `.sr-only` line add:

```ts
        // A form proxy hidden from everyone (Base UI's checkbox beside a switch: aria-hidden, out of the tab
        // order, clipped to nothing) is not a target. The finger aims at the switch, which is measured.
        if (el.matches('input[aria-hidden="true"][tabindex="-1"]')) continue;
```

Run: `npx playwright test tests/e2e/tap-targets.spec.ts`
Expected: `/ answers a finger across 44px` still FAILS, now for the right reason: `SPAN [36x20] reaches 36x20` (about that). The switch answers only across its drawn track.

- [ ] **Step 12: Give the switch a finger's reach** — `src/components/shell/motion-toggle.tsx`

Add `tap-44` to the switch's root (the coarse-pointer rule in `motion.css` gives it a transparent 44px overlay, centred, and leaves the drawing alone):

```tsx
          className={cn(SWITCH_TRACK, "tap-44 data-[disabled]:opacity-45")}
```

Run: `npx playwright test tests/e2e/tap-targets.spec.ts tests/e2e/motion-switch.spec.ts`
Expected: PASS, including `a fine pointer is left exactly as drawn` on desktop.

- [ ] **Step 13: Record it in DESIGN.md**

In `## Motion`, change the end of the first paragraph from `popup fades. All collapse under reduced motion.` to `popup fades. All collapse under reduced motion, and under the Motion switch.`, then add this paragraph after it:

```markdown
**The Motion switch** sits in the landing footer's bar, after the clock, and is on by default. Off means
what the device's reduced-motion setting means, on every traveller page. `motion.css` applies its
reduced-motion rules under `html[data-motion="off"]` as well as under the media query, and Motion's own
animations run reduced (`SiteMotion`, `MotionConfig reducedMotion="always"`). The head script in the site
layout (`src/components/motion/motion-boot.ts`) writes `data-motion` before first paint, from the stored
choice (`tt.motion`, only ever `off`) and the device. `SiteMotion` re-applies it when either changes;
React never writes it on mount. When the device asks for reduced motion, the switch reads off, is disabled,
and says why. Under both, a held button stays still. That rule is `!important` because the press selector
outranks it (guarded by `tests/e2e/motion-switch.spec.ts`).
```

In `## Shell`, in the **Footer** bullet, change `"Services are unavailable") and the IST clock. App pages` to `"Services are unavailable"), the IST clock and the Motion switch. App pages`.

- [ ] **Step 14: Record the folder in `docs/architecture.md`.** In the Layers block, after the `components (src/components/*)` line, add (the em dash in the same column as its neighbours):

```text
  motion (src/components/motion/*)         — the reader's Motion: html[data-motion] written before first paint (motion-boot.ts, inline in the site layout's <head>), changed by the footer switch (use-motion.ts), followed by motion.css and SiteMotion (MotionConfig)
```

- [ ] **Step 15: Run the gate and commit**

Run: `npm run check`. Expected: green, with the message tree test still passing (no empty strings).

```bash
git add src/components/shell/motion-toggle.tsx src/components/ui/switch.tsx src/components/shell/footer.tsx src/messages/en-IN/shell.ts tests/unit/components/motion-toggle.test.tsx tests/e2e/motion-switch.spec.ts tests/e2e/tap-targets.spec.ts DESIGN.md docs/architecture.md
git commit -m "feat(motion): the Motion switch in the landing footer"
```

---

### Task 5: The shared collision checker, with today's landing as its baseline

**Files:**
- Create: `tests/e2e/journey/collisions.ts`, `tests/e2e/journey/collisions.spec.ts`

**Interfaces — Produces** (J2–J6 import these):
- `interface CollisionOptions { readonly panels?: readonly string[]; readonly skip?: readonly string[] }`. `panels` are boxes that must never cover text outside themselves, nor each other; J2 passes its instruments. `skip` lists subtrees drawn under text on purpose.
- `collisionsInView(page: Page, options?: CollisionOptions): Promise<string[]>`: text over text, a panel over text, a panel over a panel, and sideways scroll, in the current window.
- `collisionsTopToBottom(page: Page, options?: CollisionOptions): Promise<string[]>`: the same, scrolled from top to bottom in steps of 45% of the window. Each finding is reported once, prefixed `@<scrollY>: `. J3 adds dense sampling through its pinned sections; J4 and J5 add the drawing's checks (leader lines, the drawing's box, the dial ring) with the pieces that need them.

This is prototype v3's in-page gate, cut down to its general part. It measures what a person sees. Each line of text counts as its line-height band, so tight display leading is not a collision. Any ancestor that clips cuts the band. Only what lies below the sticky masthead and inside the window counts. Lines of the same block never collide with each other.

- [ ] **Step 1: Write the failing spec** — `tests/e2e/journey/collisions.spec.ts`

```ts
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

  test("sees a page that scrolls sideways", async ({ page }) => {
    await gotoReady(page, "/");
    await page.evaluate(() => {
      const wide = document.createElement("div");
      wide.style.cssText = "width:200vw;height:1px";
      document.body.append(wide);
    });
    expect((await collisionsInView(page)).some((finding) => finding.startsWith("sideways overflow"))).toBe(true);
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx playwright test tests/e2e/journey/collisions.spec.ts`
Expected: FAIL, `Cannot find module './collisions'`.

- [ ] **Step 3: Write `tests/e2e/journey/collisions.ts`**

```ts
import type { Page } from "@playwright/test";

// The landing journey's shared collision checker (spec 2026-09-24 §5), prototype v3's in-page gate cut down to
// its general part. It measures what a person sees. Each line of text counts as its line-height band (tight
// display leading is not a collision), cut by any ancestor that clips it, below the sticky masthead and inside
// the window. "Panels" are boxes that must never cover text outside themselves, nor each other. Findings name
// both parties. The journey's own checks (leader lines, the drawing's box, the dial ring) join this file in the
// PRs that draw those pieces.

export interface CollisionOptions {
  /** Boxes that must never cover text outside themselves, nor each other. */
  readonly panels?: readonly string[];
  /** Subtrees drawn under text on purpose, which the checker ignores. */
  readonly skip?: readonly string[];
}

/** Every collision in the current window: text over text, a panel over text or a panel, sideways scroll. */
export async function collisionsInView(page: Page, options: CollisionOptions = {}): Promise<string[]> {
  return page.evaluate(
    ({ panels, skip }) => {
      interface Box {
        left: number;
        right: number;
        top: number;
        bottom: number;
      }
      const header = document.querySelector("header");
      const mastheadBottom = header ? header.getBoundingClientRect().bottom : 0;
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const ignored = ["header", ".sr-only", "noscript", "script", "style", "nextjs-portal", "[data-sonner-toaster]", ...skip].join(", ");

      /** Seen by a person: laid out, not hidden, not clipped away as screen-reader-only, not faded out. */
      const visible = (el: Element): boolean => {
        const box = el.getBoundingClientRect();
        if (box.width < 1 && box.height < 1) return false;
        const opacities: number[] = [];
        for (let node: Element | null = el; node && node !== document.documentElement; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.display === "none" || style.visibility === "hidden") return false;
          if (style.clipPath.startsWith("inset(50%") || style.clip === "rect(0px, 0px, 0px, 0px)") return false;
          if (style.overflow === "hidden" && node.clientWidth <= 1 && node.clientHeight <= 1) return false;
          opacities.push(Number(style.opacity));
        }
        return opacities.reduce((product, opacity) => product * opacity, 1) > 0.12;
      };
      /** The block a text line belongs to: lines of one paragraph share leading and never collide with each other. */
      const blockOf = (el: Element): Element => {
        for (let node: Element | null = el; node; node = node.parentElement) {
          const display = getComputedStyle(node).display;
          if (display !== "inline" && display !== "contents") return node;
        }
        return el;
      };
      /** What the ancestors that clip (a scroller, an ellipsis) leave visible. */
      const clipOf = (el: Element): Box => {
        const clip: Box = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
        for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) {
          const style = getComputedStyle(node);
          const box = node.getBoundingClientRect();
          if (style.overflowX !== "visible") {
            clip.left = Math.max(clip.left, box.left);
            clip.right = Math.min(clip.right, box.right);
          }
          if (style.overflowY !== "visible") {
            clip.top = Math.max(clip.top, box.top);
            clip.bottom = Math.min(clip.bottom, box.bottom);
          }
        }
        return clip;
      };
      const inView = (r: Box) => r.right - r.left > 1 && r.bottom - r.top > 1 && r.bottom > mastheadBottom + 2 && r.top < vh && r.right > 0 && r.left < vw;
      const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      const related = (a: Element, b: Element) => a === b || a.contains(b) || b.contains(a);
      const name = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.classList[0] ? `.${el.classList[0]}` : ""}`;

      const texts: { box: Box; owner: Element; block: Element; text: string }[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const owner = node.parentElement;
        const words = node.nodeValue?.trim() ?? "";
        if (!words || !owner || owner.closest(ignored)) continue;
        // Cheap first: text wholly above or below the window is never walked for visibility.
        const reach = owner.getBoundingClientRect();
        if (reach.bottom <= mastheadBottom || reach.top >= vh || !visible(owner)) continue;
        const style = getComputedStyle(owner);
        const size = Number.parseFloat(style.fontSize);
        const leading = style.lineHeight === "normal" ? size * 1.2 : Number.parseFloat(style.lineHeight);
        const clip = clipOf(owner);
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const line of range.getClientRects()) {
          const middle = (line.top + line.bottom) / 2;
          const half = Math.min(line.height, leading) / 2;
          const box = { left: Math.max(line.left, clip.left), right: Math.min(line.right, clip.right), top: Math.max(middle - half, clip.top), bottom: Math.min(middle + half, clip.bottom) };
          if (inView(box)) texts.push({ box, owner, block: blockOf(owner), text: words.slice(0, 40) });
        }
      }
      const drawn = panels.length
        ? [...document.querySelectorAll(panels.join(", "))]
            .filter((el) => !el.closest(ignored) && visible(el))
            .map((el) => ({ el, box: el.getBoundingClientRect() }))
            .filter(({ box }) => inView(box))
        : [];

      const found: string[] = [];
      texts.forEach((a, i) => {
        for (const b of texts.slice(i + 1)) if (!related(a.block, b.block) && overlap(a.box, b.box) > 6) found.push(`text "${a.text}" × text "${b.text}"`);
      });
      for (const panel of drawn) {
        for (const t of texts) if (!panel.el.contains(t.owner) && overlap(panel.box, t.box) > 6) found.push(`panel ${name(panel.el)} × text "${t.text}"`);
      }
      drawn.forEach((a, i) => {
        for (const b of drawn.slice(i + 1)) if (!related(a.el, b.el) && overlap(a.box, b.box) > 6) found.push(`panel ${name(a.el)} × panel ${name(b.el)}`);
      });
      if (document.documentElement.scrollWidth > vw + 1) found.push(`sideways overflow ${document.documentElement.scrollWidth - vw}px`);
      return [...new Set(found)];
    },
    { panels: [...(options.panels ?? [])], skip: [...(options.skip ?? [])] },
  );
}

/** Scrolls from top to bottom in steps of 45% of the window; each finding once, with the scroll position it was seen at. */
export async function collisionsTopToBottom(page: Page, options: CollisionOptions = {}): Promise<string[]> {
  const { height, max } = await page.evaluate(() => ({ height: window.innerHeight, max: document.documentElement.scrollHeight - window.innerHeight }));
  const step = Math.max(1, Math.round(height * 0.45));
  const positions = [...new Set([...Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step), max])];
  const found = new Map<string, number>();
  for (const y of positions) {
    // An instant jump, then two frames: style, layout and anything that follows the scroll have settled.
    await page.evaluate(
      (top) =>
        new Promise<void>((done) => {
          window.scrollTo({ top, behavior: "instant" });
          requestAnimationFrame(() => requestAnimationFrame(() => done()));
        }),
      y,
    );
    for (const finding of await collisionsInView(page, options)) if (!found.has(finding)) found.set(finding, y);
  }
  return [...found].map(([finding, y]) => `@${y}: ${finding}`);
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx playwright test tests/e2e/journey/collisions.spec.ts`
Expected: PASS. The four self-tests pass in both projects, and the six baseline runs pass (1440×900 in `desktop`; 390×844 and 844×390 in `mobile`).

**If the baseline finds anything**, it is a real collision in today's landing. Stop and report the findings to the owner with a screenshot at the reported scroll position. Never widen `skip` or add a panel exemption to make the baseline pass. The fix belongs in its own reviewed change.

- [ ] **Step 5: Run the gate and commit**

Run: `npm run check`. Expected: green, and both files under 500 lines.

```bash
git add tests/e2e/journey/collisions.ts tests/e2e/journey/collisions.spec.ts
git commit -m "test(journey): the shared collision checker, with today's landing as its baseline"
```

---

## Finish: the whole gate, then the PR with the owner's go-ahead

- [ ] **Run every suite from a clean start:** `npm run check`, then `npx playwright test` (the whole e2e suite, both projects). Expected: all green. Report failures as they are, with their output; do not retry until green.
- [ ] **Capture proof** into the session scratchpad: the landing footer with the switch on and off (1280×800 and 390×844), and the switch under the device's reduced motion with its reason.
- [ ] **Ask the owner** before pushing. With a yes: push `feat/journey-j1-motion-switch` and open the PR. The title is `feat(motion): the Motion switch, and the journey's collision checker (J1)`. The body gives a summary, the press bug and its fix, what each test proves, and the gate's numbers, and ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Watch CI; merge only on the owner's word.
- [ ] **Remove the worktree** once merged: `git -C /Users/heytherevibin/Downloads/Code/Dev/trackandtrace worktree remove ../trackandtrace-j1`.

## Self-review notes

Run before the final whole-branch review:

1. `npm run check` and the full `npx playwright test` green.
2. `git log --format=%B main..HEAD | grep -ci "co-authored-by"` prints `0`.
3. `grep -rn 'data-motion' src`: outside comments, only `motion-boot.ts` and `use-motion.ts` write or read the attribute, and only `motion.css` styles by it.
4. `grep -rn 'reducedMotion=' src` matches `site-motion.tsx` (following Motion) and `src/console/components/console-providers.tsx` (the console's fixed `"user"`), and nothing else.
5. The Motion-off block in `motion.css` restates the reduced-motion block declaration for declaration.
6. The two new strings in `shell.ts` are v3's own words; no other copy was added.
7. The baseline found nothing, or its findings went to the owner and none were skipped.

## What J2 inherits

- `collisionsInView` / `collisionsTopToBottom` and `CollisionOptions` (Task 5). J2 passes its instruments as `panels`.
- `MOTION_EVENT` and `useMotion` (Task 3). J3's journey rebuilds on the event and reads the state.
- `SWITCH_TRACK` / `SWITCH_THUMB` (Task 4), for J3's Sound switch beside Motion, which carries `tap-44` too.
- A tap-target spec that measures `role="switch"` and passes over hidden form proxies (Task 4). Every control the journey adds must answer a finger across 44px.
- `MOTION_BOOT_SCRIPT` (Task 1), which J4 extends with `data-saver` and `data-drawing`, with its VM test extended to match.
