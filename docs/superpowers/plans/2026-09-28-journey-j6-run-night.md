# Landing journey J6: the window-seat run, Night falls, and the nightly — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish v3 on the landing. 06 and 07 ride sideways past a window as the page scrolls (the window-seat run). The theme button's change sweeps out from it in a circle (Night falls). The journey's budgets are held on every PR and every night, on a production build of this checkout that can reach nothing live. Before any of it lands, CI gets the capacity to carry it.

**Architecture:**
- **CI first.** The Playwright run is split into four parallel shards. The database tests and the console suite get their own job. One job still named `e2e` waits for all of them, so main's required check keeps its name. The journey's chunk budgets gate every PR in `verify`.
- **A production build that cannot reach anything live.** `LOCAL_FIXTURE=1` is the one way `env.ts` lets a production build serve the fixture. `env.ts` refuses it on Vercel and beside any live credential. `scripts/serve-local-production.mjs` serves `.next` that way:
  - every credential is blanked;
  - a working tree holding any `.env*` file but `.env.example` is refused, since Next bakes `NEXT_PUBLIC_*` into the build;
  - `scripts/offline-guard.mjs` is preloaded into the server, so any connection off this machine is refused and written down.

  The nightly, the production smoke and `journey-perf.mjs` all use it.
- **One rule for the reader's place.** `readerPlace` (above / inside / past) is J5-3's rule, lifted out of `placeAfter`. It is now shared by:
  - the live drawing's pin;
  - 02's place guard;
  - the still's column settle;
  - the new run.

  `keepPlace` moves to `keep-place.ts`, so the run changes its height only through it, as the drawing does.
- **The run** has three layers, as the rest of the journey does:
  - server markup (`window-run.tsx`: the frame around 06 and 07, the stations marked);
  - pure geometry (`geometry/run.ts`);
  - a journey module (`run.ts`). It pins `#run.is-running` inside `keepPlace`, writes `--run-h` in px, and draws the window's layers from measured widths.
- **Night falls** is `src/components/theme/night-falls.ts`, called by the theme button. Where the browser has View Transitions and Motion is on, it runs a same-document view transition. Its callback commits the theme with `flushSync`, waits for `themeApplied`, then sends `tt:theme` (J5-9's synchronous redraw). A clip-path circle on `::view-transition-new(root)` reveals the new theme. Otherwise the switch is instant.
- **The nightly** (`.github/workflows/journey-nightly.yml`) does what a GPU-less runner can:
  - chunk budgets;
  - the production-build smoke;
  - throttled runs at 4×, 6× and 10× that assert only machine-independent results;
  - collisions at 15 sizes and at 200% text;
  - screenshots in Day, Night and on a phone;
  - the journey's specs in WebKit.

  The frame-time and long-task budgets stay a manual run on a real GPU (`node scripts/journey-perf.mjs`), and the spec says so.

**Tech Stack:**
- Next.js 16.3.4, React 19.2, Tailwind 4, TypeScript 5.9 (`document.startViewTransition` is typed);
- `animejs@4.5.0`, `three@0.186.0` (pinned; no new dependency);
- Vitest 4 (`*.test.ts` in node, `*.test.tsx` in jsdom);
- Playwright 1.62 (Chromium and WebKit, `--shard` and `merge-reports`);
- GitHub Actions: `actions/checkout` v7.0.1, `actions/setup-node` v7.0.0, `actions/cache` v6.1.0, `actions/upload-artifact` v7.0.1 (all already pinned in `ci.yml`), and `actions/download-artifact` v8.0.1 at `3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c` (read from `gh api repos/actions/download-artifact/git/ref/tags/v8.0.1` on 2026-09-28; Task 1 re-reads it).

**Spec:** `docs/superpowers/specs/2026-09-24-landing-journey-design.md`. The sections that bind J6:
- §3.A: the 06–07 row, the Page-wide row (Night falls), the section-entrance rule and the fit rule;
- §3.B: the layers, State, the one-writer discipline and the module map (`window-run.tsx`, `geometry/run.ts`, `run.ts`, `theme-sweep.ts`);
- §3.C: `fit` and `load`;
- §3.F: Night falls;
- §3.G: accessibility (focus never obscured, every run link brings its station to the window, 44px targets);
- §3.H: budgets;
- §5: the PR e2e items still open (run keyboard and station links, theme sweep, axe at run, Night run and phone run), and the Nightly;
- §6: the J6 row and every J3–J5 ruling;
- §7: the nightly's schedule;
- §8: risks (WebKit, CI time, production-only CSP, bundle creep);
- §9: acceptance.

**Reference (read-only):**
- **Prototype v3.** `/private/tmp/claude-501/-Users-heytherevibin-Downloads-Code-Dev-trackandtrace/34a2c8a3-8fc3-4ec4-9ffd-8bf48c6af4ce/scratchpad/train-proto/`, below called `V3/`:
  - the run: `V3/src/js/run.js`, `V3/src/run.css`, and `V3/build.mjs` lines 145–164 (how 06 and 07 are marked);
  - Night falls: `V3/src/js/shell.js` lines 9–45.
- **J5's record,** in `…/scratchpad/j5-record/`:
  - `final-review.md` (the triage table);
  - `progress.md` (the ledger, its "minor (deferred)" and "Parked" lines);
  - `perf-report.md` (how `journey-perf.mjs` measures);
  - `final-rereview-2.md` (the 02 reader in its last 120 px).
- **The J5 plan's "What J6 inherits"** (`docs/superpowers/plans/2026-09-27-journey-j5-live-drawing.md`, its last section). Every item there is placed below.

## Before Task 1

The branch `feat/journey-j6-run-night` is off `main` at `803361f`, where J1–J5 are merged and the rail is gone (#80).
- In this worktree (`/Users/heytherevibin/Downloads/Code/Dev/trackandtrace-j6`), run `npm ci`, then `npm run check`. Expected: green.
- Never touch the primary checkout `/Users/heytherevibin/Downloads/Code/Dev/trackandtrace`, another worktree, or port 3100.

## Rulings made while planning J6

Each ruling has an id (J6-n) and says what it costs if wrong. Task 10 writes them into the spec's §6.

1. **CI is sharded before any J6 spec lands** (Task 1).
   - Playwright runs in four matrix jobs (`--shard=n/4`), each with its own fixture-mode `next dev`, and each failing shard keeps a blob report.
   - The database tests and the console suite move to their own `console` job.
   - A gate job keeps the name `e2e` (main's required check). It passes only when every shard and `console` passed, and when a shard failed it merges the blobs into one HTML report.
   - `verify` also runs `node scripts/journey-budgets.mjs` after its build (J5 final review, minor 7).

   *Cost if wrong: about four times the setup minutes per PR (npm ci, the browser cache, a `next dev` compile per shard). The repository is public, so the minutes cost nothing.*
2. **A production build serves the fixture only on this machine** (Task 2).
   - `LOCAL_FIXTURE=1` joins `env.ts`. With it, `PNR_SOURCE=fixture` is allowed when `NODE_ENV=production`.
   - It is refused where Vercel runs (`VERCEL`, `VERCEL_ENV` or `VERCEL_URL` set) and beside any live credential. A deployment that carried it therefore fails at boot (`env()` throws in production) rather than serving sample data.
   - `scripts/serve-local-production.mjs` is the only thing that sets it. It blanks every live variable, not merely unsets it, and preloads `scripts/offline-guard.mjs`. A unit test holds its blanked list to `env.ts`'s own `LIVE_CREDENTIALS` (exported), so the two lists cannot drift.
   - The serve script refuses to serve from a working tree that holds any `.env*` file but `.env.example`. Next inlines `NEXT_PUBLIC_*` values into the build at `npm run build`, which the serve script does not control, so a build made beside a `.env.local` would ship the live Supabase URL and the Sentry DSN to the page (the pre-flight's finding 6).
   - The guard refuses every non-loopback TCP connection before DNS and logs it. The serve script confirms the guard loaded in the server; the production smoke and `journey-perf.mjs` fail on any refusal.

   *Cost if wrong: a new flag at a security boundary. The two refusals in `env.ts`, the serve script's `.env` refusal and the guard make it four locks, not one. The `.env` refusal means the nightly and every perf run happen in a working tree with no `.env.local` (CI's, and the j-worktrees, have none).*
3. **What the nightly measures, and what it cannot** (Tasks 8, 9). GitHub's runners have no GPU, so Chromium draws WebGL through SwiftShader on the CPU. arm64 macOS runners have no GPU acceleration either.

   The nightly measures:
   - the chunk budgets;
   - the production-build smoke (CSP scrolled end to end, no other host, a sample check, the guard's log);
   - throttled runs at 4×, 6× and 10×. These assert only what holds on any machine: no other host, CLS ≤ 0.05, the drawing decided, and at 10× a governor that answered. They print frame times and long tasks, but do not judge them;
   - collisions at 15 sizes, and at 200% text;
   - screenshots of every chapter in Day, Night and on a phone;
   - the journey's specs in WebKit.

   The §3.H frame-time and long-task budgets stay a manual real-GPU run: `npm run build && node scripts/journey-perf.mjs`, on the owner's Mac. Its lines go into every journey PR. §5 and §9 say so plainly (Task 9).

   *Cost if wrong: a frame-time regression between manual runs lands unseen until the next one.*
4. **One rule for where the reader goes** (Task 3). `readerPlace(box, viewport)` is J5-3's judgement, lifted out of `placeAfter`:
   - *above*: the box's top is at or below −8 px;
   - *inside*: over half the window is still in the box;
   - *past*: the box's foot is within the window's top half.

   It is now used by:
   - 02's place guard, which judged "inside" by the window's top edge alone;
   - the still's column settle, which judged "past" by the window's top edge alone;
   - `drawing.ts`'s `below()`, whose boundary was 0 against `placeAfter`'s −8 (J5 Task 6 minor);
   - the run.

   This closes both reader-position items J5 parked:
   - a reader landing at `#principles` is no longer moved 77 px by the first column settle without scroll anchoring;
   - a reader in 02's last ~120 px, with `#record` on screen, is kept on `#record` rather than thrown back 2,300–3,000 px.

   *Cost if wrong: a reader in the top half of a piece's last screen now counts as past it. Such a reader is kept on what follows it, not sent back to its start.*
5. **`fit` is judged before the scene is fetched** (Task 4).
   - `drawing.ts`'s `liveFits(section)` lays out the pinned chapter for an instant and measures it with `live-labels.ts`'s own `layout()`, which is DOM-only with no three.js. In the same task it puts everything back and restores `scrollY`, so nothing paints.
   - It runs once, just before the first `prepare()`. A chapter that cannot fit sets `fit`, so a reader who cannot fit downloads nothing.
   - The scene's own check, on every relayout while live, stays behind it.
   - The trial is the one write of `#anatomy.is-live` outside `keepPlace`, undone in the same task. It is still `drawing.ts`'s write.

   *Cost if wrong: a trial judged before a web font swaps in could misjudge by a few pixels. A false "no" holds the still until the next rebuild; a false "yes" is caught by the scene's check, as today.*
6. **The run's frame is server markup; its lines are drawn by `run.ts`** (Task 5).
   - `window-run.tsx` renders the pin, the three empty layer `<svg>`s and the train glyph around 06 and 07, all hidden without the journey (`journey.css`).
   - The layers' paths depend on measured card widths, so `run.ts` draws them from `geometry/run.ts`'s pure builders. §3.B lists "the run's window layers" under server markup: this departs from it for the paths only. The departure was accepted at pre-flight (2026-09-28): it is internal architecture with no visible difference, and the lines need measured card widths. Task 10 records it in the spec.

   *Cost if wrong: none visible. The spec's module map changes.*
7. **The run pins by `#run.is-running`, J5-3's pattern** (Task 6).
   - Only `run.ts` writes the class, always inside `keepPlace`, and the CSS does not gate it on `data-motion`. Motion off therefore unpins it inside `keepPlace`, with the reader kept.
   - Its height is `--run-h` in px (the pin plus the travel), so only `run.ts` ever changes it.
   - It pins only while the reader is not below it (J3's rule: a pin's growth lands below the reader). Otherwise it waits until they come back above it.

   *Cost if wrong: a reader who arrives below the run (a `/#faq` link) reads 06–07 in their static layout until they scroll back above it.*
8. **Links to 06 or 07 while the run is pinned** (Task 6).
   - `run.ts` takes a plain primary click on an `a[href="#features"]` or `a[href="#use"]` (the departure board's links). It pushes the hash with `history.pushState(null, "", "#use")`, which Next 16 integrates (`node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md`, "Native History API"). It scrolls to where that section's first station stands at the window, and focuses the section without scrolling (`tabindex="-1"` while running).
   - `run.ts` writes `data-run-at` on `#features` and `#use`. That is the page y each would have were it not riding the run, and `station-progress.ts` reads it, so the board's status follows the run.

   *Cost if wrong: Next's router reacting to the push, which run.spec's link test would show.*
9. **Back returns the reader where they left, the run included** (Tasks 3 and 6). `place-memory.ts` changes twice:
   - **Only the reader's own scroll cancels a pending restore** (Task 3; the owner, 2026-09-28, amending J5-17's "any key"). That is:
     - a mostly vertical wheel that is not a pinch-zoom (`ctrlKey`);
     - `touchmove`, a finger dragging, never `touchstart`, a tap;
     - a keydown of ArrowUp, ArrowDown, PageUp, PageDown, Home, End or Space, with focus outside a text field and no Alt, Ctrl or Meta (Shift+Space scrolls up, so Shift is allowed).

     A trackpad's swipe back (a sideways wheel), Back and Forward's own keys (Alt+←, Cmd+[), a tap and every other key leave the restore pending.
   - **Its place is read where the reader reads it inside the pinned run** (Task 6). A section riding the run is read at `data-run-at`, as `station-progress.ts` reads it, not at the pinned box it shares with the other. Both the sampling and the restore do so. A reader who left at 07 returns to 07: to its first station at the window when the run has pinned, or to `#use`'s own top while the run waits below them. `run.spec.ts` proves Back to 07.

   *Cost if wrong: none for the first (the owner's call). The second is a small addition to Task 6; without it, a return to 07 lands at 06.*
10. **Night falls on every traveller page with Motion on** (Task 7). The sweep runs only under `html[data-motion="on"]`. Only the site's head script writes that, and it already answers reduced motion, so the console, which has none, always switches at once. Three details:
    - the masthead rides in the page's own capture: its `view-transition-name` is set to none during the sweep;
    - `tt:theme` is sent once the theme is applied, inside the view-transition callback;
    - the module is `src/components/theme/night-falls.ts`, not the spec's `theme-sweep.ts` in the journey folder, because it is the theme button's, shared by every traveller page, not only the journey. The departure was accepted at pre-flight (2026-09-28): internal architecture, with no visible difference. Task 10 records the rename in the spec.

    *Cost if wrong: none. The spec's module map changes.*
11. **The nightly runs on a schedule, and on the PR that changes it** (Task 9).
    - The schedule is 03:00 IST (`30 21 * * *` UTC). A public repository's Actions minutes are free.
    - It also runs on `pull_request` only when `.github/workflows/journey-nightly.yml` itself changes, so the J6 PR proves the nightly before it merges.
    - Spec §7 leaves the schedule to the owner, who kept it (2026-09-28).

    *Cost if wrong: the owner deletes two lines.*
12. **WebKit** (Task 9).
    - The nightly runs `place`, `run`, `night-falls`, `drawing-modes` and `live-drawing` in WebKit, on a desktop and a phone project.
    - Where WebKit reports no WebGL 2 (Linux WebKit on a GPU-less runner may not have it), a test that needs the live drawing skips, saying why. The check lives in one place, `waitForLive` itself (`skipWithoutWebgl2`), so `place`, `drawing-modes` and `night-falls` skip cleanly too. `live-drawing.spec.ts`'s own skip reuses it.

    *Cost if wrong: the live drawing on Safari is proven only on the owner's phone, and the tests that need it (in `place`, `drawing-modes` and `night-falls`) only on Chromium.*
13. **200% text at the three PR sizes** (Task 9). Spec §5's "at 15 sizes … and at 200% text" is read as the text setting, checked where every PR checks the landing: 1440×900, 390×844 and 844×390.

    *Cost if wrong: twelve size and text pairs go unchecked.*
14. **`journey-perf.mjs` serves the build itself** (Task 8).
    - It starts `serve-local-production.mjs`'s server, so there is no second shell and no fixture question.
    - It refuses a port another server already answers.
    - It fails on any refusal in the guard's log.

    *Cost if wrong: none.*
15. **J5's deferred minors.** Each lands in a task or is ruled out here with its reason.

    | From | Item | Where |
    |---|---|---|
    | Final review, minor 1 | `page.tsx` `hudAllowed(process.env)` | Closed: `page.tsx` already passes `current` (on `main`). |
    | Final review, minor 2 | A scene chunk that arrives late still builds an engine | Task 4: an `AbortSignal` from the module, and a `settled` flag at 20 s. |
    | Final review, minor 3 | `startLive` is not transactional | **Ruled out.** Its registrations throw only if a DOM API is missing (IntersectionObserver, ResizeObserver) or anime fails. The journey's first build would already have failed on those. The cost is listeners kept until navigation. Transactional start needs every registration site rewritten, a large diff for an unreachable path. |
    | Final review, minor 4 | Spec: `load` "next visit"; the fit reason | Task 4 amends §3.C and §3.H. |
    | Final review, minor 5 | No forced-colours e2e | Task 4. |
    | Final review, minor 6 | `waitForJourney` needs a dev-only flag | Task 2: it falls back to `data-drawing-why` and two frames when the probe is absent (a production build). |
    | Final review, minor 7 | Chunk budgets could gate every PR | Task 1. |
    | Final review, minor 8 | After `place` clears, the still vanishes until `scrollend` | **Ruled out:** the owner keeps J5's behaviour until the pin (2026-09-28). It was a UX call, not a correctness fault. |
    | Task 1 / M8 | `rig.test.ts:101` unused `_` | Task 4. `rig.test.ts` is a test, not a bake source. |
    | Task 2 | Governor p90 re-sorts ≤ 40 items | **Ruled out:** negligible. |
    | Task 3 | `departure.ts` `fonts.load().then(draw)` not cancelled | **Ruled out:** it redraws an unused 2D canvas. `departure.ts` is not a bake source, but the change buys nothing. |
    | Task 4 | M1 watchContext seam test; M7 palette and glow test gaps | **Ruled out.** GPU loss is driven end to end by `drawing-modes.spec.ts`'s "the GPU drops the context". The palette and glow have unit tests; the gaps are branch-level. |
    | Task 4 | M2 `warm()` comment | Closed by the final review. |
    | Task 4 | M3 fractional `qualityAt`, M4 `inked` width, M6 `setClearAlpha` | **Ruled out:** unreachable, dev probe only, and cosmetic. |
    | Task 5 | Restore test asserts once; only wheel cancels in tests | Task 3 (J6-9): a unit test for every input that cancels the restore, and for every one that must not. |
    | Task 5 | Cancel listeners with nothing to restore; #how measured twice; `leaving` can stick | **Ruled out:** negligible or unreachable. |
    | Task 5 | Any key and a trackpad swipe cancel the restore | Task 3 (J6-9; the owner, 2026-09-28): only the reader's own scroll cancels it. |
    | Task 6 | `below()` vs `placeAfter` boundary | Task 3 (J6-4). |
    | Task 6 | The WebGL probe on every rebuild; a synchronously throwing loader; the listener-order test | **Ruled out:** one throwaway context; unreachable with `sceneLoader`; test quality. |
    | Task 6 | `still.test` timers and fonts not reset on failure | Task 3. |
    | Task 7 | `drawing.ts` resize without `tt:layout`; the 1e-4 wake; the redundant terminus branch | **Ruled out:** subsumed by 02's guard (traced in the final review); harmless; harmless. |
    | Task 7 | `sound.spec.ts:76` exact-2 poll | **Ruled out:** it predates J5, and #83's CI was green. Watch it in the sharded run. |
    | Task 7 | anime's scroll sync stalls after a > 500 ms frame | Closed in J5: `scene/live.ts`'s `behind()` wakes it. |
    | Task 9 | `journey-loader.test` default-false case | Task 4. |
    | Task 10 | `journey-budgets.mjs` hardening | Task 8, all four items. |
    | Task 10 | Mode specs assert only `data-drawing-why` | Task 4. |
    | Parked | still.ts's first settle moves a reader at `#principles` by 77 px | Task 3 (J6-4). |
    | Parked | "Inside 02" judged by the window's top edge alone | Task 3 (J6-4). |
    | Final review, recommendations | A WebKit project; an `overflow-anchor: none` variant | Task 9; the variant already exists (`noAnchoring`), and Task 3 widens it. |
    | Final review, recommendations | Move `storedQuality` out of `drawing.ts` | **Ruled out:** it only shapes the chunk split, which the budgets count correctly. |

### Pre-flight amendments (the controller's rulings, 2026-09-28)

The pre-flight scan checked this plan against itself, the spec, the owner's decisions and the branch. Its twelve rulings are written into the tasks above and below:
1. The Back restore is cancelled only by the reader's own scroll (wheel, touch-drag, scroll keys): Task 3, J6-9, J6-15, Task 10's §6.
2. Night falls' unit test is `night-falls.test.tsx`, so it runs under jsdom: Task 7.
3. Task 4's new unit tests live in `drawing-fit.test.tsx`, keeping `drawing.test.tsx` under 500 lines: Task 4.
4. The "no WebGL 2 in WebKit" skip lives in `waitForLive` itself, reused by `live-drawing.spec.ts`: Task 9, J6-12.
5. Back into the run returns to 07: place-memory reads `data-run-at`, with a run.spec Back test: Task 6, J6-9.
6. The serve script refuses a working tree with any `.env*` but `.env.example`, and its blanked list is tested against `LIVE_CREDENTIALS`: Task 2, J6-2, the Global Constraints.
7. The `e2e` gate runs `if: ${{ !cancelled() }}`, so a superseded run does not report: Task 1.
8. The nightly's step-order contract reads from `jobs:` on, so it proves the build step, not the header comment: Task 9.
9. The nightly's size sweep steps 0.15 of a window, as dense as the PR's: Task 9.
10. `hud.ts` writes `HUD_CHUNK_MARK` onto its own root element, so the bundler keeps it in the meter's chunk: Task 8.
11. The one-writer list names `liveFits`'s trial writes: the Global Constraints.
12. Both §3.B departures (the run's lines drawn by `run.ts`, J6-6; `night-falls.ts`, J6-10) are accepted, and Task 10 records them.

## Global Constraints

- **Next.js.** It is Next.js 16.3.4: read `AGENTS.md` and the relevant guide in `node_modules/next/dist/docs/` before writing Next-specific code (the page, the native History API, `next start`).
- **Code rules.**
  - TypeScript strict, with no `any`; use `unknown` and narrowing.
  - Imports: `@/` across directories. Inside `src/components/landing/journey/`, `./` and one-level `../` are allowed (the existing style); never two levels (`../../`). Tests import `src` by `@/`, and tests of `scripts/*.mjs` import them relatively (`../../../scripts/…`), as the existing script tests do.
  - Prefer `const`; use `let` only in loops and closures that need it.
  - Every file stays under 500 lines, `scripts/**/*.mjs` included.
- **TDD.** Write the failing test first, and watch it fail for the right reason before implementing.
- **Pins.** `three` stays `0.186.0` and `animejs` stays `4.5.0`. Add no dependency.
- **three.js only in the scene chunk.** Only `src/components/landing/journey/scene/*.ts` and `scripts/bake/page.ts` import `"three"`. The journey chunk reaches the scene only through `import("./scene/live")` in `drawing.ts`. Type-only imports are allowed anywhere. A still page never downloads three.js, except while `place` is the only reason, when the scene prepares in the background (J5-2). From Task 4 on, the fit exception is gone: the trial layout judges `fit` before the import (J6-5).
- **Budgets, verbatim from spec §3.H:**
  - Journey chunk ≤ 70 KB compressed;
  - Scene chunk ≤ 240 KB compressed, live only, except while `place` is the only reason, or when the live chapter's fit check finds the drawing cannot fit its window (§3.C). Task 4 removes the fit exception from §3.H and §3.C: the trial layout judges `fit` before the download (J6-5);
  - Still drawings ≤ 60 KB compressed per page;
  - Longest journey task at load, 4× CPU phone ≤ 120 ms (scene steps ≤ 61 ms);
  - Scroll, reference desktop: p95 ≤ 12 ms, 0% > 25 ms;
  - Scroll, 4× CPU phone: median ≥ 55 fps, ≤ 2% > 33 ms;
  - Layout shift at load: CLS ≤ 0.05;
  - Drawing progress never steps back while scrolling down.
- **No hex in the scene** (§3.E), nor in the run: its strokes take their colours from tokens in `journey-island.css`. The grep in the Finish covers `scene/`, `scripts/bake/`, `governor.ts`, `live-labels.ts`, `hud.ts`, `run.ts`, `geometry/run.ts` and `src/components/theme/night-falls.ts`.
- **Journey state lives per `startJourney`,** as a `Kept` or `atEnd` on the context, or in a module's own closure; never at module level. The chunk survives client navigation.
- **Text moves by transform only, never opacity or visibility.** The run's cards ride the track's transform; decoration (the window's lines, the train) may fade.
- **Every reason not to draw live settles on the still,** with `data-drawing="still"` and its reason in `data-drawing-why`.
- **One writer per attribute.** J5's list stands, with these additions:
  - `drawing.ts` still owns `#anatomy.is-live`. That includes `liveFits`'s trial, which is undone in the same task (J6-5).
  - `liveFits`'s trial also drives `live-labels.ts`'s own writes, through `createLiveLabels(section)`, `layout()` and `clear()`: the pin's `data-live` and `data-compact`, `--anatomy-copy-h`, its `.live-lines` layer, and the reset of the labels' `transform` and `clip-path`. These are the trial's, inside its own task, and undone before it returns.
  - `keepPlace` (in `keep-place.ts`) is how `drawing.ts` and `run.ts` change their pieces' heights; it writes only `scrollY`.
  - `run.ts` owns everything the run writes:
    - `#run.is-running` and `#run`'s `--run-h` and `--run-band`;
    - the three layer `<svg>`s' children, `viewBox`, `width` and `transform`;
    - `.run-track`'s `transform`, `.run-train`'s `left` and its glyph's `transform`;
    - the stations' `.is-here` and `.is-passed`, and the stops' `.is-lit`;
    - `#features` and `#use`'s `data-run-at` and `tabindex`;
    - the `.run-snap` marks.
  - `night-falls.ts` owns `html[data-theme-sweep]`. `ThemeToggle` keeps `data-theme-switching`; next-themes keeps `data-theme`.
- **Gating.**
  - Journey-only CSS rules start with `html[data-journey="on"]` and live in `src/styles/journey-island.css`.
  - A rule that is the page's no-JavaScript default lives ungated in `src/styles/journey.css`.
  - The theme sweep's rules are site-wide and live in `src/styles/motion.css`, keyed on `html[data-theme-sweep]`.
  - A failed journey writes only `data-journey="failed"` (J3-1).
- **Copy** is verbatim from v3 ("KM 530"). Travellers never see provider names.
- **Tests.**
  - E2E specs import `{ test, expect }` from `tests/e2e/fixtures`.
  - Any e2e that waits on `terminal-result` asserts `data-kind`.
  - E2E waits on state (`frames(page, n)`, `expect.poll`, an attribute), never a fixed time, except a window that is itself the assertion ("nothing downloads"), which says so in a comment.
  - Run Playwright only in this worktree, on port 4210 (check `lsof -nP -iTCP:4210 -sTCP:LISTEN` first). Use fixture mode, or the local production server of Task 2.
  - Never send a sample PNR to a live site. Never touch port 3100 or the primary checkout.
- **Production-build runs** go only through `scripts/serve-local-production.mjs`. `LOCAL_FIXTURE` is set nowhere else: in no `.env*` file, no workflow `env:`, and no Vercel environment. The script refuses a working tree that holds any `.env*` file but `.env.example`, because Next inlines `NEXT_PUBLIC_*` into the build: build and serve for measurement only where there is none (this worktree, CI).
- **Workflows.** Every action is pinned to a full commit SHA with its version in a comment. `permissions: contents: read`. No `secrets.` in `ci.yml` or `journey-nightly.yml`. Node 24. `tests/unit/ci-workflows.contract.test.ts` holds all of it.
- **The bake.** No task in J6 edits a file in `BAKE_SOURCES` (`scripts/bake/emit.mjs`). If one must, re-bake on this Mac (`npm run bake:stills`) and commit its outputs in the same commit; the `sourceHash` test enforces it.
- **The gate.** Run `npm run check` (the whole gate) before every commit. Each task runs its own focused e2e; Task 10 runs the full `npx playwright test`.
- **Commits.** Conventional commits, with no `Co-Authored-By` or any other attribution trailer. Never commit `.env*`, secrets or `settings.local.json`.

## File structure

| File | Responsibility | Task |
|---|---|---|
| `.github/workflows/ci.yml`, `playwright.config.ts`, `tests/unit/ci-workflows.contract.test.ts`, `.gitignore` | four Playwright shards with blob reports, the `console` job, the `e2e` gate, budgets in `verify` | 1 |
| `src/services/env.ts`, `tests/unit/services/env.test.ts` | `LOCAL_FIXTURE`, refused on Vercel and beside a live credential; `LIVE_CREDENTIALS` exported | 2 |
| `scripts/offline-guard-rules.mjs`, `scripts/offline-guard.mjs`, `scripts/serve-local-production.mjs`, `package.json` (`serve:local`) | the offline guard; the local production server, which refuses a working tree with a `.env` file | 2 |
| `playwright.config.ts` (`testIgnore`), `playwright.production.config.ts`, `tests/e2e/production/landing.spec.ts`, `tests/e2e/journey/journey-helpers.ts` | the production-build smoke; `waitForJourney` without the dev probe | 2 |
| `src/components/landing/journey/drawing-mode.ts` (`readerPlace`, `pastShift`), `keep-place.ts` (new), `drawing.ts`, `chapters.ts`, `still.ts` | one rule for the reader's place; `keepPlace` shared | 3 |
| `tests/e2e/journey/place.spec.ts`, `journey-helpers.ts` (`noAnchoring`), `DESIGN.md` | the reader-position proofs; the rule in writing | 3 |
| `src/components/landing/journey/place-memory.ts`, `tests/unit/components/landing/journey/place-memory.test.tsx` | only the reader's own scroll cancels the Back restore (J6-9) | 3 |
| `src/components/landing/journey/drawing.ts` (`liveFits`, the abort), `tests/unit/components/landing/journey/drawing-fit.test.tsx` (new), `tests/e2e/journey/{drawing-modes,live-drawing}.spec.ts`, the spec's §3.C and §3.H | fit before the import; a late scene builds nothing; the modes' still; forced colours | 4 |
| `src/components/landing/journey/geometry/run.ts`, `window-run.tsx` (new), `src/components/landing/{features,photo-split}.tsx`, `src/app/(site)/page.tsx`, `src/messages/en-IN/journey.ts`, `src/styles/journey.css` | the run's frame and geometry | 5 |
| `src/components/landing/journey/run.ts` (new), `station-progress.ts`, `place-memory.ts` (`data-run-at`), `start-journey.ts`, `src/styles/journey-island.css`, `DESIGN.md` | the run, moving; Back into it (J6-9) | 6 |
| `tests/e2e/journey/run.spec.ts` (new), `collisions.ts` (`LANDING_INSTRUMENTS`), `collisions.spec.ts`, `teardown.spec.ts`, `journey-axe.spec.ts` | the run's proofs; axe at run, Night run and phone run | 6 |
| `src/components/theme/night-falls.ts` (new), `theme-toggle.tsx`, `src/styles/motion.css`, `tests/e2e/journey/night-falls.spec.ts`, `DESIGN.md` | Night falls | 7 |
| `scripts/journey-budgets.mjs`, `src/components/landing/journey/hud-mark.ts` (new), `hud.ts` (the mark on its root), `scripts/journey-perf.mjs` | the budgets hardened; the perf script serving itself, and `--software` | 8 |
| `.github/workflows/journey-nightly.yml` (new), `playwright.nightly.config.ts` (new), `tests/e2e/nightly/{sizes,screens}.spec.ts` (new), `journey-helpers.ts` (`waitForLive`'s WebKit skip), `live-drawing.spec.ts`, the spec's §5, §7, §8 and §9 | the nightly | 9 |
| the spec's §2, §3.B and §6 | the J6 rulings, the row marked done; the whole suite | 10 |

---

### Task 1: CI with room to spare: four Playwright shards, the console suite apart, one `e2e` gate

On #83, CI's e2e job took 25.8 of its 30 minutes: Playwright alone ran for 20.0 minutes (549 tests on SwiftShader), plus the Supabase start, the database tests and the console suite. J6 adds the heaviest specs yet, so the job needs real headroom before any of them lands (J6-1).
- The Playwright run is split into four shards.
- The database tests and the console suite get their own job.
- One job, still named `e2e`, gates them all.
- The chunk budgets join `verify`.

**Files:**
- Modify: `.github/workflows/ci.yml` (whole file below)
- Modify: `playwright.config.ts` (the CI reporter)
- Modify: `.gitignore`
- Test: `tests/unit/ci-workflows.contract.test.ts`

**Interfaces:**
- Consumes: `scripts/journey-budgets.mjs` (J5-15; its CLI exits 1 on a missed budget).
- Produces: the job names `verify`, `e2e-shard` (matrix `shard: [1, 2, 3, 4]`), `console` and `e2e` (the gate; main's required check). With `CI` set, Playwright writes `blob-report/`. Task 9's nightly reuses this file's pinned SHAs.

- [ ] **Step 1: Re-read the one SHA this task adds**

```bash
gh api repos/actions/download-artifact/git/ref/tags/v8.0.1 --jq '.object.sha + " " + .object.type'
```
Expected: `3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c commit`. If the type is `tag` (annotated), resolve it with `gh api repos/actions/download-artifact/git/tags/<sha> --jq .object.sha` and use that commit SHA below instead.

- [ ] **Step 2: Write the failing contract tests**

In `tests/unit/ci-workflows.contract.test.ts`, add inside `describe("ci.yml", …)`, after its last `it`:

```ts
  it("shards the browser suite over four parallel jobs, and the e2e check waits for every shard and the console suite", () => {
    expect(ci).toMatch(/^ {2}e2e-shard:$/m);
    expect(ci).toContain("shard: [1, 2, 3, 4]");
    expect(ci).toContain("npx playwright test --shard=${{ matrix.shard }}/4");
    expect(ci).toMatch(/^ {2}console:$/m);
    const gate = ci.slice(ci.search(/^ {2}e2e:$/m));
    expect(gate).toContain("needs: [e2e-shard, console]");
    // a failed or timed-out shard still reaches the gate; a run superseded by a newer push does not report
    expect(gate).toContain("if: ${{ !cancelled() }}");
    expect(gate).toContain("npx playwright merge-reports --reporter html ./all-blob-reports");
  });

  it("runs the database tests and the console suite against a local Supabase stack, in their own job", () => {
    const job = ci.slice(ci.search(/^ {2}console:$/m), ci.search(/^ {2}e2e:$/m));
    expect(job).toContain("npx supabase@2.117.0 test db");
    expect(job).toContain("npm run test:e2e:console");
  });

  it("gives every job a time limit", () => {
    expect((ci.match(/timeout-minutes:/g) ?? []).length).toBe((ci.match(/runs-on:/g) ?? []).length);
  });

  it("holds the journey's chunk budgets on every pull request, after the production build", () => {
    const build = ci.indexOf("npm run build");
    expect(build).toBeGreaterThan(-1);
    expect(ci.indexOf("node scripts/journey-budgets.mjs")).toBeGreaterThan(build);
  });

  it("keeps each shard's results as a blob report, for the gate to merge when a shard fails", () => {
    const config = readFileSync(join(process.cwd(), "playwright.config.ts"), "utf8");
    expect(config).toContain('reporter: process.env.CI ? [["github"], ["blob"]] : [["list"]]');
  });
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/unit/ci-workflows.contract.test.ts`
Expected: FAIL. The five new tests fail with `expected … to match /^ {2}e2e-shard:$/m`, `expected -1 to be greater than …`, and so on. The existing tests pass.

- [ ] **Step 4: Rewrite `.github/workflows/ci.yml`**

Replace the whole file with:

```yaml
# Checks every pull request into main and every push to main.
# No secrets: every test runs on the sample-data fixture.
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

env:
  NEXT_TELEMETRY_DISABLED: "1"

jobs:
  verify:
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test:unit
      - run: npm run build
      # The landing journey's chunks against spec §3.H (70 KB, 240 KB, three.js only in the scene): seconds, on the
      # build above, and the only build-time guard that three.js stays out of the journey chunk.
      - run: node scripts/journey-budgets.mjs

  e2e-shard:
    # The Playwright run in four parallel shards. On #83 it took 20 of the old job's 30 minutes (549 tests, the live
    # drawing drawn by SwiftShader), and the journey's last PR adds more. Each shard starts its own fixture-mode
    # `next dev`; a failing shard keeps its blob report for the e2e job to merge.
    name: e2e shard ${{ matrix.shard }}/4
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - name: Read the Playwright version
        id: playwright
        run: echo "version=$(node -p "require('@playwright/test/package.json').version")" >> "$GITHUB_OUTPUT"
      - name: Cache Playwright browsers
        id: browsers
        uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ steps.playwright.outputs.version }}
      - name: Install Chromium and its system libraries
        if: steps.browsers.outputs.cache-hit != 'true'
        run: npx playwright install --with-deps chromium
      - name: Install Chromium's system libraries
        if: steps.browsers.outputs.cache-hit == 'true'
        run: npx playwright install-deps chromium
      - run: npx playwright test --shard=${{ matrix.shard }}/4
      - name: Keep the shard's report
        if: failure()
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: blob-report-${{ matrix.shard }}
          path: blob-report/
          retention-days: 7

  console:
    # The database tests and the console's end-to-end suite, against a real local Supabase stack. A rate-limited image
    # pull can add minutes to the start.
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - name: Start the local Supabase stack
        run: npx supabase@2.117.0 start -x realtime,storage-api,imgproxy,studio,edge-runtime,logflare,vector,supavisor,mailpit
      - name: Database tests
        run: npx supabase@2.117.0 test db
      - name: Read the Playwright version
        id: playwright
        run: echo "version=$(node -p "require('@playwright/test/package.json').version")" >> "$GITHUB_OUTPUT"
      - name: Cache Playwright browsers
        id: browsers
        uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ steps.playwright.outputs.version }}
      - name: Install Chromium and its system libraries
        if: steps.browsers.outputs.cache-hit != 'true'
        run: npx playwright install --with-deps chromium
      - name: Install Chromium's system libraries
        if: steps.browsers.outputs.cache-hit == 'true'
        run: npx playwright install-deps chromium
      # The console suite resets `console.members` between specs through psql, because
      # `console.create_first_owner_link` refuses to issue a second link while an Owner exists.
      # ubuntu-24.04 ships PostgreSQL 16's client tools, so this is normally a no-op — but an
      # implicit dependency on the runner image's contents is worth one line to make explicit.
      - name: Make sure psql is on PATH
        run: |
          if ! command -v psql > /dev/null; then
            sudo apt-get update && sudo apt-get install -y postgresql-client
          fi
          psql --version
      - name: Console end-to-end
        run: npm run test:e2e:console
      - name: Keep the console report
        if: failure()
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: console-report
          path: |
            playwright-report/
            test-results/
          retention-days: 7

  e2e:
    # The check main requires, under its old name: every shard and the console suite passed. When a shard failed, the
    # shards' blob reports are merged into one HTML report and kept. Not cancelled(), rather than always(): a failed or
    # timed-out shard still reaches the gate and fails it, while a run superseded by a newer push (cancel-in-progress)
    # starts nothing and reports nothing.
    if: ${{ !cancelled() }}
    needs: [e2e-shard, console]
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - name: Every shard and the console suite passed
        env:
          SHARDS: ${{ needs.e2e-shard.result }}
          CONSOLE: ${{ needs.console.result }}
        run: test "$SHARDS" = success && test "$CONSOLE" = success
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        if: failure()
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        if: failure()
        with:
          node-version: 24
          cache: npm
      - if: failure()
        run: npm ci
      - name: Gather the failing shards' reports
        if: failure()
        continue-on-error: true
        uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1
        with:
          pattern: blob-report-*
          path: all-blob-reports
          merge-multiple: true
      - name: Merge them into one report
        if: failure()
        continue-on-error: true
        run: npx playwright merge-reports --reporter html ./all-blob-reports
      - name: Keep the report
        if: failure()
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

- [ ] **Step 5: The CI reporter writes blobs**

In `playwright.config.ts`, replace:
```ts
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
```
with:
```ts
  // On CI each shard writes a blob; the e2e job merges a failing run's blobs into one HTML report (ci.yml).
  reporter: process.env.CI ? [["github"], ["blob"]] : [["list"]],
```
In `.gitignore`, under `# testing`, after `/coverage`, add:
```gitignore
/blob-report/
/all-blob-reports/
```

- [ ] **Step 6: Run the contract tests, parse the workflow, and see the shards split the suite**

```bash
npx vitest run tests/unit/ci-workflows.contract.test.ts
node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/ci.yml','utf8')); console.log('parsed')"
for n in 1 2 3 4; do npx playwright test --list --shard=$n/4 | tail -1; done
npx playwright test --list | tail -1
```
Expected:
- the contract tests PASS;
- `parsed` prints (js-yaml is already in `node_modules`, pulled in by the lint tooling; it is not added to `package.json`);
- the four shards' "Total: N tests" lines sum to the whole run's total, each within a few tests of a quarter.

- [ ] **Step 7: The gate, then commit**

```bash
npm run check
git add .github/workflows/ci.yml playwright.config.ts .gitignore tests/unit/ci-workflows.contract.test.ts
git commit -m "ci: split the browser suite into four shards and the console suite into its own job, under one e2e check"
```
The proof on the runners comes with the PR's first CI run (the Finish): each shard well inside 20 minutes, and `e2e` green.

---

### Task 2: A production build on this machine that can reach nothing live

`env.ts` refuses `PNR_SOURCE=fixture` in production, so `next start` for measurement could not serve sample data. J5's perf run served "live" with an empty environment instead, and relied on nothing being set. This task makes the production fixture path explicit and locked three ways (J6-2):
- `LOCAL_FIXTURE=1`, which `env.ts` refuses on Vercel and beside any live credential;
- a serve script that blanks every live variable, and refuses a working tree with any `.env*` file but `.env.example` (Next inlines `NEXT_PUBLIC_*` into the build, where blanking cannot reach);
- an offline guard in the server that refuses any connection off this machine.

The production smoke proves "/" contacts nothing live under it.

**Files:**
- Modify: `src/services/env.ts`
- Create: `scripts/offline-guard-rules.mjs`, `scripts/offline-guard.mjs`, `scripts/serve-local-production.mjs`
- Create: `playwright.production.config.ts`, `tests/e2e/production/landing.spec.ts`
- Modify: `playwright.config.ts` (`testIgnore`), `tests/e2e/journey/journey-helpers.ts` (`waitForJourney`), `package.json` (`serve:local`), `.gitignore`
- Test: `tests/unit/services/env.test.ts`, `tests/unit/scripts/offline-guard.test.ts`, `tests/unit/scripts/serve-local-production.test.ts`

**Interfaces:**
- Consumes: `parseEnv`, `fixtureAllowed` and `activePnrSource` (`src/services/env.ts`).
- Produces:
  - `Env.LOCAL_FIXTURE: boolean`;
  - `LIVE_CREDENTIALS`, now exported from `src/services/env.ts`;
  - `scripts/offline-guard-rules.mjs`: `isLoopback(host: unknown): boolean` and `targetOf(args: readonly unknown[]): { host: string | undefined, port: unknown }`;
  - `scripts/serve-local-production.mjs`:
    - `GUARD_LOG: string` (`<root>/.offline-guard.log`);
    - `LIVE_VARIABLES: string[]`;
    - `localProductionEnv(base: Record<string, string | undefined>, port: number): Record<string, string>`;
    - `strayEnvFiles(names: readonly string[]): string[]`;
    - `refusals(): string[]`;
    - `startLocalProduction({ port }?: { port?: number }): Promise<{ url: string, stop(): Promise<void> }>`, used by Task 8;
  - `npm run serve:local -- --port 4210`;
  - `playwright.production.config.ts`, which Task 9 runs;
  - `waitForJourney(page)`, which now also works on a production build.

- [ ] **Step 1: Write the failing env tests**

In `tests/unit/services/env.test.ts`, add `activePnrSource` to the import from `@/services/env`, then add at the end of the file:

```ts
describe("a production build served on this machine with sample data (LOCAL_FIXTURE, J6-2)", () => {
  const local = { NODE_ENV: "production", PNR_SOURCE: "fixture", LOCAL_FIXTURE: "1" };

  it("lets a production build serve the fixture only with LOCAL_FIXTURE=1", () => {
    const parsed = parseEnv(local);
    if (!parsed.ok) throw new Error(parsed.issues.join("; "));
    expect(fixtureAllowed(parsed.env)).toBe(true);
    expect(activePnrSource(parsed.env)).toBe("fixture");
    expect(parseEnv({ NODE_ENV: "production", PNR_SOURCE: "fixture" }).ok).toBe(false);
  });

  it.each([
    ["VERCEL", "1"],
    ["VERCEL_ENV", "preview"],
    ["VERCEL_ENV", "production"],
    ["VERCEL_URL", "trakline-git-main.vercel.app"],
  ])("is refused wherever Vercel runs (%s=%s), so a deployment carrying it fails at boot", (name, value) => {
    const parsed = parseEnv({ ...local, [name]: value });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.issues.join(" ")).toMatch(/LOCAL_FIXTURE=1 is refused on Vercel/);
  });

  it.each([
    ["RAILKIT_API_KEY", `railkit_${"a".repeat(24)}`],
    ["DATA_KEY", `${"A".repeat(43)}=`],
    ["UPSTASH_REDIS_REST_URL", "https://example.upstash.io"],
    ["KV_REST_API_TOKEN", "token"],
    ["NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co"],
    ["SUPABASE_SECRET_KEY", `sb_secret_${"a".repeat(20)}`],
    ["RESEND_API_KEY", `re_${"a".repeat(20)}`],
  ])("is refused beside a live credential (%s): sample data must reach nothing live", (name, value) => {
    const parsed = parseEnv({ ...local, [name]: value });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.issues.join(" ")).toMatch(new RegExp(`LOCAL_FIXTURE=1 is refused beside a live credential \\(${name}`));
  });

  it("changes nothing without the fixture: a production build that asks the live seam parses as before", () => {
    expect(parseEnv({ NODE_ENV: "production", LOCAL_FIXTURE: "1" }).ok).toBe(true);
  });

  it("never unlocks E2E in production", () => {
    expect(parseEnv({ ...local, E2E: "1" }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/services/env.test.ts`
Expected: FAIL.
- The first test fails with `PNR_SOURCE: PNR_SOURCE=fixture is refused in production.`
- The Vercel and credential cases fail on their message: the schema strips the unknown key, and parses.

- [ ] **Step 3: Implement `LOCAL_FIXTURE` in `src/services/env.ts`**

Above `const envSchema = z`, add:
```ts
/** Every variable that reaches a live service or a live account. A production build serving sample data carries none.
 * Exported so the local production server's test holds its blanked list to this one (J6-2). */
export const LIVE_CREDENTIALS = [
  "RAILKIT_API_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "DATA_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "RESEND_API_KEY",
] as const;
```
In the schema object, after `E2E_NOW`, add:
```ts
    /**
     * Lets a production build serve the fixture on this machine: the journey's nightly and its real-GPU run, through
     * scripts/serve-local-production.mjs and nothing else. Refused wherever Vercel runs and beside any live credential
     * (below), so a deployment that carried it would fail at boot rather than serve sample data. Never in an .env file.
     */
    LOCAL_FIXTURE: flag.default("0").transform((v) => v === "1"),
    /** Set by Vercel on every build and function ("1"). Read only to refuse LOCAL_FIXTURE there. */
    VERCEL: z.string().optional(),
    /** Set by Vercel on every deployment: its own host. Read only to refuse LOCAL_FIXTURE there. */
    VERCEL_URL: z.string().optional(),
```
In `superRefine`, replace:
```ts
    if (v.NODE_ENV === "production" && v.PNR_SOURCE === "fixture") {
      ctx.addIssue({ code: "custom", path: ["PNR_SOURCE"], message: "PNR_SOURCE=fixture is refused in production." });
    }
```
with:
```ts
    if (v.LOCAL_FIXTURE && (v.VERCEL || v.VERCEL_ENV || v.VERCEL_URL)) {
      ctx.addIssue({ code: "custom", path: ["LOCAL_FIXTURE"], message: "LOCAL_FIXTURE=1 is refused on Vercel: it is for a production build served on this machine." });
    }
    const live = LIVE_CREDENTIALS.filter((name) => Boolean(v[name]));
    if (v.LOCAL_FIXTURE && live.length > 0) {
      ctx.addIssue({ code: "custom", path: ["LOCAL_FIXTURE"], message: `LOCAL_FIXTURE=1 is refused beside a live credential (${live.join(", ")}): a build that serves sample data must reach nothing live.` });
    }
    if (v.NODE_ENV === "production" && v.PNR_SOURCE === "fixture" && !v.LOCAL_FIXTURE) {
      ctx.addIssue({ code: "custom", path: ["PNR_SOURCE"], message: "PNR_SOURCE=fixture is refused in production." });
    }
```
Replace `fixtureAllowed` with:
```ts
/** The fixture may serve only when explicitly requested: outside production, or in a production build on this machine
 * with LOCAL_FIXTURE=1 (refused on Vercel and beside any live credential, above). */
export function fixtureAllowed(current: Env = env()): boolean {
  return current.PNR_SOURCE === "fixture" && (current.NODE_ENV !== "production" || current.LOCAL_FIXTURE);
}
```

- [ ] **Step 4: Run the env tests to verify they pass**

Run: `npx vitest run tests/unit/services/env.test.ts`
Expected: PASS, the existing tests included.

- [ ] **Step 5: Write the failing guard and serve-script tests**

Create `tests/unit/scripts/offline-guard.test.ts`:

```ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { isLoopback, targetOf } from "../../../scripts/offline-guard-rules.mjs";

// The local production server's second lock (J6-2): nothing it runs reaches past this machine. The rules are pure; the
// guard itself is proven in a child process, so this test runner's own sockets are never patched.

describe("which connections stay on this machine", () => {
  it.each(["localhost", "admin.localhost", "127.0.0.1", "127.8.0.1", "::1", "[::1]", undefined, ""])("lets %s through", (host) => {
    expect(isLoopback(host)).toBe(true);
  });

  it.each(["api.railkit.in", "example.invalid", "10.0.0.1", "0.0.0.0.example"])("refuses %s", (host) => {
    expect(isLoopback(host)).toBe(false);
  });

  it("reads the host from each way a socket is connected", () => {
    const cb = () => undefined;
    expect(targetOf([[{ host: "api.railkit.in", port: 443 }, cb]])).toEqual({ host: "api.railkit.in", port: 443 });
    expect(targetOf([{ host: "example.invalid", port: 80 }, cb])).toEqual({ host: "example.invalid", port: 80 });
    expect(targetOf([8080, "example.invalid"])).toEqual({ host: "example.invalid", port: 8080 });
    expect(targetOf([8080])).toEqual({ host: undefined, port: 8080 });
    expect(targetOf([{ path: "/tmp/next.sock" }])).toEqual({ host: "", port: undefined });
    expect(targetOf(["/tmp/next.sock", cb])).toEqual({ host: "", port: undefined });
  });
});

describe("the guard, preloaded into a process", () => {
  const guard = pathToFileURL(join(process.cwd(), "scripts/offline-guard.mjs")).href;
  const run = (code: string, log: string): string =>
    execFileSync(process.execPath, ["--import", guard, "--input-type=module", "-e", code], { env: { ...process.env, OFFLINE_GUARD_LOG: log }, encoding: "utf8", timeout: 20_000 });
  const logFile = () => join(mkdtempSync(join(tmpdir(), "offline-guard-")), "log");

  it("refuses a connection off this machine before any DNS question, and writes it down", () => {
    const log = logFile();
    // .invalid never resolves (RFC 2606), so even a broken guard would reach no service
    const out = run('try { await fetch("https://example.invalid/pnr"); console.log("reached"); } catch (e) { console.log(String(e.cause?.message ?? e.message)); }', log);
    expect(out).toContain("[offline-guard] refused example.invalid:443");
    expect(out).not.toContain("reached");
    expect(readFileSync(log, "utf8")).toMatch(/^# offline guard on \(pid \d+\)\n\[offline-guard\] refused example\.invalid:443\n$/);
  });

  it("lets a connection to this machine through", () => {
    const log = logFile();
    const code = [
      'import http from "node:http";',
      'const server = http.createServer((q, r) => r.end("ok"));',
      'await new Promise((done) => server.listen(0, "127.0.0.1", done));',
      "const address = server.address();",
      'const port = typeof address === "object" && address ? address.port : 0;',
      'const reply = await fetch("http://127.0.0.1:" + port + "/");',
      "console.log(await reply.text());",
      "server.close();",
    ].join("\n");
    expect(run(code, log).trim()).toBe("ok");
    expect(readFileSync(log, "utf8")).toMatch(/^# offline guard on \(pid \d+\)\n$/);
  });
});
```

Create `tests/unit/scripts/serve-local-production.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LIVE_CREDENTIALS, activePnrSource, fixtureAllowed, parseEnv } from "@/services/env";
import { GUARD_LOG, LIVE_VARIABLES, localProductionEnv, strayEnvFiles } from "../../../scripts/serve-local-production.mjs";

// The local production server's environment (J6-2): sample data, every live variable blanked, the guard preloaded.

describe("the local production server's environment", () => {
  const stray = {
    PATH: "/usr/bin",
    NODE_OPTIONS: "--max-old-space-size=4096",
    RAILKIT_API_KEY: `railkit_${"a".repeat(24)}`,
    DATA_KEY: `${"A".repeat(43)}=`,
    NEXT_PUBLIC_SENTRY_DSN: "https://key@example.invalid/1",
    VERCEL: "1",
  };

  it("blanks every live variable, even one the shell set, so a stray .env.local cannot fill it in either", () => {
    const env = localProductionEnv(stray, 4210);
    for (const name of LIVE_VARIABLES) expect(env[name], name).toBe("");
    expect(env.PATH).toBe("/usr/bin");
  });

  it("blanks every credential env.ts refuses LOCAL_FIXTURE beside, so the two lists cannot drift apart", () => {
    expect(LIVE_VARIABLES).toEqual(expect.arrayContaining([...LIVE_CREDENTIALS]));
  });

  it("serves the fixture from a production build, which env.ts accepts only this way", () => {
    const parsed = parseEnv(localProductionEnv(stray, 4210));
    if (!parsed.ok) throw new Error(parsed.issues.join("; "));
    expect(fixtureAllowed(parsed.env)).toBe(true);
    expect(activePnrSource(parsed.env)).toBe("fixture");
  });

  it("preloads the offline guard, keeping the shell's own NODE_OPTIONS, and names its log", () => {
    const env = localProductionEnv(stray, 4210);
    expect(env.NODE_OPTIONS).toMatch(/^--max-old-space-size=4096 --import=file:\/\/.*\/scripts\/offline-guard\.mjs$/);
    expect(env.OFFLINE_GUARD_LOG).toBe(GUARD_LOG);
    expect(env.PORT).toBe("4210");
    expect(env.NEXT_TELEMETRY_DISABLED).toBe("1");
  });
});

describe("the working tree it serves from (J6-2)", () => {
  it("refuses one that holds any .env file but the example: Next inlines NEXT_PUBLIC_* into the build, where blanking cannot reach", () => {
    expect(strayEnvFiles([".env.example", ".env.local", "package.json", ".next", ".env"])).toEqual([".env", ".env.local"]);
    expect(strayEnvFiles([".env.production.local", ".env.development"])).toEqual([".env.development", ".env.production.local"]);
  });

  it("serves from one with none: the example is documentation, and nothing else is an env file", () => {
    expect(strayEnvFiles([".env.example", "package.json", "src", ".gitignore", "vercel.json"])).toEqual([]);
  });
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `npx vitest run tests/unit/scripts/offline-guard.test.ts tests/unit/scripts/serve-local-production.test.ts`
Expected: FAIL with `Failed to load ../../../scripts/offline-guard-rules.mjs` and `… serve-local-production.mjs`.

- [ ] **Step 7: Write the guard**

Create `scripts/offline-guard-rules.mjs`:

```js
// The offline guard's rules (scripts/offline-guard.mjs), pure so they are unit-tested without patching anything.

/**
 * A host on this machine: loopback by name or address, a *.localhost name, or none (a Unix socket, or Node's own
 * default of localhost).
 * @param {unknown} host
 */
export function isLoopback(host) {
  if (host === undefined || host === null || host === "") return true;
  const h = String(host).toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h.endsWith(".localhost") || h === "::1" || h === "0:0:0:0:0:0:0:1" || /^127(\.\d{1,3}){3}$/.test(h);
}

/**
 * The host and port a `net.Socket#connect` call asks for, from each of its shapes: Node's own normalised
 * `[[options, cb]]`, `(options, cb)`, `(port, host)`, `(port)` and `(path)`.
 * @param {readonly unknown[]} args
 * @returns {{ host: string | undefined, port: unknown }}
 */
export function targetOf(args) {
  const [first, second] = args;
  if (Array.isArray(first)) return targetOf(first);
  if (first !== null && typeof first === "object") {
    const path = Reflect.get(first, "path");
    if (typeof path === "string") return { host: "", port: undefined };
    const host = Reflect.get(first, "host");
    return { host: typeof host === "string" ? host : undefined, port: Reflect.get(first, "port") };
  }
  if (typeof first === "string" && !/^\d+$/.test(first)) return { host: "", port: undefined };
  return { host: typeof second === "string" ? second : undefined, port: first };
}
```

Create `scripts/offline-guard.mjs`:

```js
// Preloaded into the local production server (scripts/serve-local-production.mjs), so nothing the server runs
// reaches past this machine (J6-2):
//   node --import ./scripts/offline-guard.mjs …
// Every TCP connection to a host that is not loopback is refused before a DNS question is asked, and each refusal is
// written to OFFLINE_GUARD_LOG, one line each, after a first line that says the guard is on. So a run can prove
// afterwards that the guard was loaded and that nothing tried to leave. The server has no credentials (the serve
// script blanks every one); this is the second lock, not the first.
import { appendFileSync } from "node:fs";
import net from "node:net";
import { isLoopback, targetOf } from "./offline-guard-rules.mjs";

const log = process.env.OFFLINE_GUARD_LOG;

/** @param {string} line */
function record(line) {
  if (log) appendFileSync(log, `${line}\n`);
}

const connect = net.Socket.prototype.connect;

/** @this {import("node:net").Socket} @param {unknown[]} args */
function guarded(...args) {
  const { host, port } = targetOf(args);
  if (isLoopback(host)) return Reflect.apply(connect, this, args);
  const message = `[offline-guard] refused ${host}:${String(port ?? "?")}`;
  record(message);
  console.error(message);
  process.nextTick(() => this.destroy(new Error(message)));
  return this;
}

Reflect.set(net.Socket.prototype, "connect", guarded);
record(`# offline guard on (pid ${process.pid})`);
```

- [ ] **Step 8: Write the serve script**

Create `scripts/serve-local-production.mjs`:

```js
// A production build of this checkout, served on this machine with sample data and nothing live (J6-2): what the
// journey's nightly, its production-build smoke and its perf runs measure, never a deployment.
//   npm run build && npm run serve:local -- --port 4210        (check `lsof -nP -iTCP:4210 -sTCP:LISTEN` first)
// - PNR_SOURCE=fixture with LOCAL_FIXTURE=1: the one way env.ts lets a production build serve sample data. It refuses
//   the pair on Vercel and beside any live credential, so a deployment that carried it would fail at boot, not serve;
// - every live variable blanked, not merely unset: Next never overrides a variable that is set, so a stray .env.local
//   cannot fill one in (an empty value counts as unset in env.ts);
// - scripts/offline-guard.mjs preloaded into the server: any connection off this machine is refused before it is made,
//   and written to .offline-guard.log, which the production smoke and journey-perf.mjs read afterwards;
// - a working tree that holds any .env file but .env.example refused outright: Next inlines NEXT_PUBLIC_* values into
//   the build at `npm run build`, where blanking at serve time cannot reach, so a build made beside a .env.local would
//   ship live addresses (Supabase, Sentry) to the page. Build and serve only where there is none (this worktree, CI).
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
export const GUARD_LOG = join(ROOT, ".offline-guard.log");

/** Every variable that could reach a live service, a live account or Vercel's own switches: blanked. */
export const LIVE_VARIABLES = [
  "RAILKIT_API_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "DATA_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "RESEND_API_KEY",
  "NEXT_PUBLIC_SENTRY_DSN",
  "SENTRY_DSN",
  "SENTRY_AUTH_TOKEN",
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
];

/**
 * The server's environment: sample data, nothing live, the guard preloaded. Pure, so a unit test reads it.
 * @param {Readonly<Record<string, string | undefined>>} base @param {number} port
 * @returns {Record<string, string>}
 */
export function localProductionEnv(base, port) {
  /** @type {Record<string, string>} */
  const kept = Object.fromEntries(Object.entries(base).filter((entry) => typeof entry[1] === "string"));
  const guard = `--import=${pathToFileURL(join(ROOT, "scripts/offline-guard.mjs")).href}`;
  return {
    ...kept,
    ...Object.fromEntries(LIVE_VARIABLES.map((name) => [name, ""])),
    NODE_ENV: "production",
    PNR_SOURCE: "fixture",
    PNR_FALLBACK: "none",
    LOCAL_FIXTURE: "1",
    E2E: "",
    NEXT_TELEMETRY_DISABLED: "1",
    OFFLINE_GUARD_LOG: GUARD_LOG,
    NODE_OPTIONS: [base.NODE_OPTIONS, guard].filter(Boolean).join(" "),
    PORT: String(port),
  };
}

/**
 * The .env files in a working tree that Next would read into a build, baking their NEXT_PUBLIC_* values into the page:
 * every `.env*` but `.env.example`. Pure, so a unit test reads it.
 * @param {readonly string[]} names the working tree's root entries
 * @returns {string[]}
 */
export function strayEnvFiles(names) {
  return names.filter((name) => name.startsWith(".env") && name !== ".env.example").sort();
}

/** Every connection the guard refused since the server started, one line each. */
export function refusals() {
  return existsSync(GUARD_LOG) ? readFileSync(GUARD_LOG, "utf8").split("\n").filter((line) => line !== "" && !line.startsWith("#")) : [];
}

/** @param {string} url */
const answers = (url) => fetch(url).then((r) => r.ok, () => false);

/**
 * Starts `next start` on the build in .next and resolves once it answers, with the guard proven loaded. Refuses a
 * working tree with a .env file (strayEnvFiles), a missing build, and a port another server already answers.
 * @param {{ port?: number }} [options]
 * @returns {Promise<{ url: string, stop: () => Promise<void> }>}
 */
export async function startLocalProduction({ port = 4210 } = {}) {
  const stray = strayEnvFiles(readdirSync(ROOT));
  if (stray.length) throw new Error(`refused: ${stray.join(", ")} in this working tree. Next inlines its NEXT_PUBLIC_* values into the build, so the page could reach a live service: build and serve from a working tree with no .env file (J6-2)`);
  if (!existsSync(join(ROOT, ".next/BUILD_ID"))) throw new Error("no production build here: run `npm run build` first");
  const url = `http://localhost:${port}/`;
  if (await answers(url)) throw new Error(`${url} already answers: another server holds port ${port} (lsof -nP -iTCP:${port} -sTCP:LISTEN)`);
  rmSync(GUARD_LOG, { force: true });
  const child = spawn(join(ROOT, "node_modules/.bin/next"), ["start", "--port", String(port)], { cwd: ROOT, env: localProductionEnv(process.env, port), stdio: ["ignore", "inherit", "inherit"] });
  const exited = new Promise((resolve) => child.once("exit", resolve));
  const stop = async () => {
    if (child.exitCode === null) child.kill("SIGTERM");
    await exited;
  };
  const deadline = Date.now() + 60_000;
  while (!(await answers(url))) {
    if (child.exitCode !== null) throw new Error(`next start exited (${child.exitCode}) before it answered`);
    if (Date.now() > deadline) {
      await stop();
      throw new Error(`${url} did not answer within 60 s`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!existsSync(GUARD_LOG) || !readFileSync(GUARD_LOG, "utf8").includes("# offline guard on")) {
    await stop();
    throw new Error("the offline guard did not load in the server: NODE_OPTIONS did not reach it");
  }
  return { url, stop };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf("--port");
  const port = at >= 0 ? Number(process.argv[at + 1]) : 4210;
  const server = await startLocalProduction({ port });
  console.log(`serving this checkout's production build at ${server.url}: sample data, nothing live (the guard logs to ${GUARD_LOG})`);
  const end = () => {
    void server.stop().then(() => {
      const refused = refusals();
      if (refused.length) console.error(refused.join("\n"));
      process.exit(refused.length ? 1 : 0);
    });
  };
  process.once("SIGINT", end);
  process.once("SIGTERM", end);
}
```

In `package.json`'s `scripts`, after `"dev:railkit"`, add:
```json
    "serve:local": "node scripts/serve-local-production.mjs",
```
In `.gitignore`, under `# testing`, add:
```gitignore
/.offline-guard.log
/playwright-report-production/
```

- [ ] **Step 9: Run the script tests to verify they pass**

Run: `npx vitest run tests/unit/scripts/offline-guard.test.ts tests/unit/scripts/serve-local-production.test.ts`
Expected: PASS. If the refusal test prints `reached` or `fetch failed` with another cause, Node's `fetch` has stopped going through `net.Socket#connect`. Stop and report; do not widen the guard by guesswork.

- [ ] **Step 10: Write the production smoke (the failing proof)**

In `playwright.config.ts`, in both the `desktop` and `mobile` projects, replace:
```ts
      testIgnore: /console(-auth)?\//,
```
with:
```ts
      // production/ runs against a production build (playwright.production.config.ts), nightly/ in the nightly's own
      // config (playwright.nightly.config.ts): neither belongs to the fixture-mode `next dev` run.
      testIgnore: /(console(-auth)?|production|nightly)\//,
```
Create `playwright.production.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

// "/" as production serves it (J6-2): this checkout's production build, served on this machine with sample data and
// nothing live (scripts/serve-local-production.mjs). The journey's nightly runs it after `npm run build`; so can anyone:
//   npm run build && npx playwright test -c playwright.production.config.ts
// Always its own server: a server already on the port is refused, never adopted (the 2026-09-26 lesson,
// playwright.config.ts).
const PORT = Number(process.env.E2E_PORT ?? 4210);

export default defineConfig({
  testDir: "tests/e2e/production",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never", outputFolder: "playwright-report-production" }]] : [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "on-first-retry", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: `node scripts/serve-local-production.mjs --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 90_000,
  },
});
```

Create `tests/e2e/production/landing.spec.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "../fixtures";
import { PNR } from "../helpers";
import { frames, waitForJourney } from "../journey/journey-helpers";

// "/" as production serves it (J6-2; spec §5's production-build smoke): this checkout's production build on this
// machine, with sample data and nothing live. The dev-only probes (__ttJourney, __ttJourneyStarted) are compiled out
// here, so state is read from the page's own attributes. The server's offline guard writes every connection it refused
// to .offline-guard.log (scripts/serve-local-production.mjs): each test ends by reading that nothing tried.

const GUARD_LOG = join(process.cwd(), ".offline-guard.log");
const refused = (): string[] => (existsSync(GUARD_LOG) ? readFileSync(GUARD_LOG, "utf8").split("\n").filter((l) => l !== "" && !l.startsWith("#")) : []);

declare global {
  interface Window {
    __cspViolations: string[];
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => window.__cspViolations.push(`${event.effectiveDirective} ${event.blockedURI}`));
  });
});

test("'/' scrolled end to end breaks no rule of the security policy and asks no other host", async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? "http://localhost").origin;
  const foreign = new Set<string>();
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith("http") && u.origin !== origin) foreign.add(u.origin);
  });
  await page.goto("/");
  await waitForJourney(page);
  const bottom = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  const step = await page.evaluate(() => Math.round(window.innerHeight * 0.5));
  for (let y = 0; y <= bottom + step; y += step) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
    await frames(page, 2);
  }
  expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
  expect([...foreign]).toEqual([]);
  expect(refused()).toEqual([]);
});

test("a sample PNR is checked from the fixture, never a live source", async ({ page }) => {
  await page.goto("/");
  await waitForJourney(page);
  const plate = page.getByTestId("hero-instrument");
  await plate.getByRole("textbox").fill(PNR.cnf);
  await plate.getByRole("button", { name: /run/i }).click();
  const result = page.getByTestId("terminal-result");
  await expect(result).toBeVisible();
  await expect(result).toHaveAttribute("data-kind", "ok");
  expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
  expect(refused()).toEqual([]);
});

test("a production build has no frame meter and no dev probes", async ({ page }) => {
  await page.goto("/?journey-hud");
  await waitForJourney(page);
  await expect(page.getByRole("button", { name: "Close the frame meter" })).toHaveCount(0);
  // (__ttHoldFloor is not in the list: tests/e2e/fixtures.ts sets it in every context; production only never reads it.)
  expect(await page.evaluate(() => ["__ttJourney", "__ttJourneyStarted"].filter((k) => k in window))).toEqual([]);
});
```

- [ ] **Step 11: Run it to verify it fails**

```bash
lsof -nP -iTCP:4210 -sTCP:LISTEN
ls -a | grep '^\.env'
npm run build
npx playwright test -c playwright.production.config.ts
```
Expected: `ls` lists only `.env.example` (the serve script refuses any other `.env*` file). Then FAIL: `waitForJourney` times out on `__ttJourneyStarted`, which a production build never defines.

- [ ] **Step 12: `waitForJourney` without the dev probe**

In `tests/e2e/journey/journey-helpers.ts`, replace `waitForJourney` with:

```ts
/** The journey marks <html data-journey="on"> as it takes the page over, then starts its modules a turn at a time;
 * outside production it says when the last has started and the page has settled (window.__ttJourneyStarted), and
 * specs act only after that. A production build has no such probe (it is compiled out): there, drawing.ts's own
 * decision (data-drawing-why, written by the eleventh of twelve modules) and two frames stand in for it. */
export async function waitForJourney(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("data-journey", "on", { timeout: 15_000 });
  if (await page.evaluate(() => "__ttJourneyStarted" in window)) {
    await page.waitForFunction(() => Reflect.get(window, "__ttJourneyStarted") === true, undefined, { timeout: 15_000 });
    return;
  }
  await expect(page.locator("html")).toHaveAttribute("data-drawing-why", /.*/, { timeout: 15_000 });
  await frames(page, 2);
}
```
`frames` is declared further down the same file, so a function declaration is hoisted and the call works.

- [ ] **Step 13: Run the smoke and the journey helpers' users**

```bash
npx playwright test -c playwright.production.config.ts
npx playwright test tests/e2e/journey/sound.spec.ts tests/e2e/journey/place.spec.ts
```
Expected: PASS. The production run prints the serve script's line, and `.offline-guard.log` holds only its `# offline guard on` line (`cat .offline-guard.log`). The two dev-mode specs pass unchanged: `__ttJourneyStarted` is in `window` from `startJourney`'s first line.

- [ ] **Step 14: The gate, then commit**

```bash
npm run check
git add src/services/env.ts tests/unit/services/env.test.ts scripts/offline-guard-rules.mjs scripts/offline-guard.mjs scripts/serve-local-production.mjs tests/unit/scripts/offline-guard.test.ts tests/unit/scripts/serve-local-production.test.ts playwright.config.ts playwright.production.config.ts tests/e2e/production/landing.spec.ts tests/e2e/journey/journey-helpers.ts package.json .gitignore
git commit -m "feat(journey): serve a production build on this machine with sample data, and prove it reaches nothing live"
```

---

### Task 3: One rule for where the reader goes

Three places judged the reader by different edges:
- `placeAfter` (the live drawing) by the half window;
- 02's place guard, and the still's column settle, by the window's top edge alone;
- `drawing.ts`'s `below()` by the top at 0, where `placeAfter` uses −8.

The last two cause J5's two parked moves:
- a reader who lands at `#principles` is moved 77 px by the first column settle without scroll anchoring;
- a reader in 02's last lines, `#record` on screen, is thrown back to 02's start on a Motion change, a resize or a turned phone.

This task lifts J5-3's judgement into `readerPlace` and uses it in all three (J6-4). It also moves `keepPlace` into its own module, so the run (Task 6) changes its height through it, as the drawing does.

It also owns the reader's place on Back (J6-9; the owner, 2026-09-28). A pending restore is cancelled only by the reader's own scroll: a mostly vertical wheel that is not a pinch-zoom, a finger dragging, or a scroll key outside a text field without Alt, Ctrl or Meta. A trackpad's swipe back, Back and Forward's own keys, a tap and every other key leave it pending.

**Files:**
- Modify: `src/components/landing/journey/drawing-mode.ts` (`readerPlace`, `pastShift`; `placeAfter` uses them)
- Create: `src/components/landing/journey/keep-place.ts` (`keepPlace` and `mastheadBottom`, moved from `drawing.ts`)
- Modify: `src/components/landing/journey/drawing.ts`, `chapters.ts`, `still.ts`
- Modify: `src/components/landing/journey/place-memory.ts` (`ownScroll`: only the reader's own scroll cancels the restore)
- Modify: `tests/e2e/journey/journey-helpers.ts` (`noAnchoring`, moved from `place.spec.ts`), `tests/e2e/journey/place.spec.ts`
- Modify: `DESIGN.md`
- Test: `tests/unit/components/landing/journey/{drawing-mode,place-guard,still,place-memory}.test.ts(x)`

**Interfaces:**
- Consumes: `placeAfter`'s J5-3 contract (unchanged), and `startPlaceMemory()` (J5-17; its API unchanged).
- Produces:
  - `readerPlace(box: { top: number; bottom: number }, viewport: number): "above" | "inside" | "past"`;
  - `pastShift(before: { top: number; bottom: number }, change: number, viewport: number): number`;
  - `keepPlace(section: HTMLElement | null, change: () => void): void` and `mastheadBottom(): number`, exported from `keep-place.ts` (Task 6 uses both);
  - `noAnchoring(page)`, exported from `journey-helpers.ts` (Task 6 uses it);
  - in `place-memory.ts`, the private `ownScroll(event)`, which says whether a `wheel`, `touchmove` or `keydown` is the reader's own scroll. Task 6 adds its `topOf` beside it.

- [ ] **Step 1: Write the failing unit tests**

In `tests/unit/components/landing/journey/drawing-mode.test.ts`, add `pastShift` and `readerPlace` to the import from `@/components/landing/journey/drawing-mode`, then add inside the file's `describe`, after the `placeAfter` test:

```ts
  it("judges the reader against a piece of the page by one rule (J5-3, shared by J6-4)", () => {
    // its top visible, or within 8px above: above it, and a change lands below them
    expect(readerPlace({ top: 0, bottom: 4000 }, 900)).toBe("above");
    expect(readerPlace({ top: -8, bottom: 4000 }, 900)).toBe("above");
    // over half the window still in it: inside
    expect(readerPlace({ top: -9, bottom: 4000 }, 900)).toBe("inside");
    expect(readerPlace({ top: -3000, bottom: 451 }, 900)).toBe("inside");
    // its foot within the window's top half: past it, reading what follows
    expect(readerPlace({ top: -3000, bottom: 450 }, 900)).toBe("past");
    expect(readerPlace({ top: -3000, bottom: 120 }, 900)).toBe("past");
    expect(readerPlace({ top: -3000, bottom: -500 }, 900)).toBe("past");
  });

  it("moves a reader past a piece by exactly its change, and nobody else", () => {
    expect(pastShift({ top: -900, bottom: 16 }, -77, 900)).toBe(-77); // #principles at 80 px, the pin's foot at 16 px
    expect(pastShift({ top: -900, bottom: 16 }, 0.5, 900)).toBe(0); // no change worth a move
    expect(pastShift({ top: -900, bottom: 600 }, -77, 900)).toBe(0); // inside: the piece's own business
    expect(pastShift({ top: 40, bottom: 900 }, -77, 900)).toBe(0); // above: the change lands below
  });
```

In `tests/unit/components/landing/journey/place-guard.test.tsx`, add inside `describe("02's place guard", …)`:

```ts
  it("keeps a reader in 02's last lines on what follows it: its foot within the window's top half is past it (J6-4)", () => {
    let observed: ResizeObserverCallback = () => undefined;
    window.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) {
        observed = callback;
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
    document.body.innerHTML = `<header></header><section id="how"></section>`;
    const how = document.getElementById("how")!;
    how.style.scrollMarginTop = "80px";
    const doc = { top: 1000, height: 3000 };
    let y = 0;
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => y);
    how.getBoundingClientRect = () => ({ top: doc.top - y, bottom: doc.top - y + doc.height, width: 800, height: doc.height }) as DOMRect;
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const stop = startPlaceGuard();
    y = 3880; // 02's foot 120px down the window, #record's heading below it
    window.dispatchEvent(new Event("scroll"));
    doc.height = 2600; // Motion off collapses 02, or the window turns
    observed([], {} as ResizeObserver);
    // by exactly the change, so #record stays where the reader was reading it
    expect(scrollTo).toHaveBeenCalledWith({ top: 3880 - 400, behavior: "instant" });
    stop();
  });
```

In `tests/unit/components/landing/journey/still.test.tsx`, make the timer and font state reset even when a test fails (J5 Task 6 minor). Replace the file's `afterEach` with:
```ts
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, "fonts");
  delete html.dataset.drawing;
  document.body.replaceChildren();
});
```
Then delete the now-redundant `vi.useRealTimers();` line at the end of the third test.

In `tests/unit/components/landing/journey/place-memory.test.tsx`, add inside `describe("startPlaceMemory", …)`, after the test "restores nothing once the reader has scrolled by their own hand" (which keeps its vertical wheel):

```ts
  // Only the reader's own scroll cancels the restore (J6-9; the owner, 2026-09-28, amending J5-17's "any key"): a
  // mostly vertical wheel that is not a pinch-zoom, a finger dragging, and a scroll key outside a text field with no
  // Alt, Ctrl or Meta. A swipe back, Back and Forward's own keys, a tap and every other key leave it pending.
  type Act = [name: string, act: () => void];
  const wheel =
    (init: WheelEventInit) =>
    (): void => {
      window.dispatchEvent(new WheelEvent("wheel", init));
    };
  const key =
    (k: string, init: KeyboardEventInit = {}) =>
    (): void => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...init }));
    };
  const inField =
    (tag: "input" | "textarea" | "div", k: string) =>
    (): void => {
      const field = document.createElement(tag);
      if (tag === "div") field.setAttribute("contenteditable", "");
      document.body.append(field);
      field.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
    };
  const cancels: Act[] = [
    ["a mostly vertical wheel", wheel({ deltaX: 12, deltaY: 40 })],
    ["a finger dragging (touchmove)", () => window.dispatchEvent(new Event("touchmove"))],
    ["ArrowUp", key("ArrowUp")],
    ["ArrowDown", key("ArrowDown")],
    ["PageUp", key("PageUp")],
    ["PageDown", key("PageDown")],
    ["Home", key("Home")],
    ["End", key("End")],
    ["Space", key(" ")],
    ["Shift+Space", key(" ", { shiftKey: true })],
  ];
  const keeps: Act[] = [
    ["a trackpad's swipe back (a sideways wheel)", wheel({ deltaX: -60 })],
    ["a wheel as much sideways as down", wheel({ deltaX: 30, deltaY: 30 })],
    ["a pinch-zoom (ctrl+wheel)", wheel({ deltaY: 40, ctrlKey: true })],
    ["a tap (touchstart alone)", () => window.dispatchEvent(new Event("touchstart"))],
    ["the a key", key("a")],
    ["Tab", key("Tab")],
    ["Shift", key("Shift")],
    ["Escape", key("Escape")],
    ["ArrowLeft", key("ArrowLeft")],
    ["ArrowRight", key("ArrowRight")],
    ["Alt+ArrowLeft (Back)", key("ArrowLeft", { altKey: true })],
    ["Meta+[ (Back)", key("[", { metaKey: true })],
    ["Alt+ArrowDown", key("ArrowDown", { altKey: true })],
    ["Ctrl+End", key("End", { ctrlKey: true })],
    ["Meta+ArrowUp", key("ArrowUp", { metaKey: true })],
    ["ArrowDown in a text input", inField("input", "ArrowDown")],
    ["Space in a textarea", inField("textarea", " ")],
    ["End in an editable region", inField("div", "End")],
  ];

  it.each(cancels)("restores nothing once the reader scrolls by their own hand: %s", (_, act) => {
    store({ entry: "k1", id: "record", offset: 136 });
    const memory = startPlaceMemory();
    act();
    memory.restore();
    expect(scrolls).toEqual([]);
    memory.stop();
  });

  it.each(keeps)("still restores after what is not the reader's own scroll: %s", (_, act) => {
    store({ entry: "k1", id: "record", offset: 136 });
    const memory = startPlaceMemory();
    act();
    memory.restore();
    expect(scrolls).toEqual([3000 - 64 - 136]);
    memory.stop();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/components/landing/journey/drawing-mode.test.ts tests/unit/components/landing/journey/place-guard.test.tsx tests/unit/components/landing/journey/still.test.tsx tests/unit/components/landing/journey/place-memory.test.tsx`
Expected: FAIL.
- `readerPlace is not a function` and `pastShift is not a function`.
- The guard test fails with `expected "spy" to be called with arguments: [ { top: 3480, … } ]`: the old rule sends that reader to `1000 - 80`.
- The still tests pass.
- In place-memory, every "still restores" case fails with `expected [] to deeply equal [ 2800 ]` (today any wheel, any key and a tap cancel), and the touchmove case fails with `expected [ 2800 ] to deeply equal []` (nothing listens for it). The other "restores nothing" cases pass.

- [ ] **Step 3: `readerPlace` and `pastShift`**

In `src/components/landing/journey/drawing-mode.ts`, replace `placeAfter` and its comment with:

```ts
export type ReaderPlace = "above" | "inside" | "past";

/**
 * Where the reader stands against a piece of the page about to change height (J5-3; shared since J6-4 by the live
 * drawing's pin, 02's dial, the still's columns and the run), from its box in window coordinates:
 * - above it while its top is visible, or within 8px above: a change lands below them;
 * - inside it while over half the window is still in it;
 * - past it once its foot is within the window's top half: what follows it is what they are reading.
 */
export function readerPlace(box: { readonly top: number; readonly bottom: number }, viewport: number): ReaderPlace {
  if (box.top >= -8) return "above";
  return box.bottom > viewport * 0.5 ? "inside" : "past";
}

/** The move that keeps a reader past a piece on what follows it when its height changes by `change`; 0 for anyone else. */
export function pastShift(before: { readonly top: number; readonly bottom: number }, change: number, viewport: number): number {
  return Math.abs(change) > 1 && readerPlace(before, viewport) === "past" ? change : 0;
}

/**
 * Where the reader belongs once the chapter changed height under them (J5-3), or null to stay put:
 * - above it: the change lands below them;
 * - inside it: its start, under the masthead;
 * - past it: moved by exactly the change, so what they read stays put.
 */
export function placeAfter(
  before: { readonly top: number; readonly bottom: number; readonly height: number },
  after: { readonly top: number; readonly height: number },
  { scrollY, viewport, masthead }: { readonly scrollY: number; readonly viewport: number; readonly masthead: number },
): number | null {
  const change = after.height - before.height;
  if (Math.abs(change) <= 1) return null;
  const where = readerPlace(before, viewport);
  if (where === "above") return null;
  if (where === "inside") return Math.round(after.top + scrollY - masthead);
  return Math.round(scrollY + change);
}
```

- [ ] **Step 4: `keep-place.ts`, and `drawing.ts` on it**

Create `src/components/landing/journey/keep-place.ts`:

```ts
import { placeAfter } from "./drawing-mode";

// The one way a pinned piece changes its own height (J5-3): the change runs, then the reader lands where placeAfter
// says, judged from the piece's box just before. drawing.ts (the live drawing's pin) and run.ts (the window-seat run's)
// change their heights only through here. It writes the scroll only.

export function mastheadBottom(): number {
  return Math.round(document.querySelector("header")?.getBoundingClientRect().bottom ?? 0);
}

/** Runs a change to the piece, then puts the reader where placeAfter says. A piece already gone from the document (a
 * client navigation away) just changes. */
export function keepPlace(section: HTMLElement | null, change: () => void): void {
  if (!section?.isConnected) {
    change();
    return;
  }
  const before = section.getBoundingClientRect();
  const scrollY = window.scrollY;
  change();
  const to = placeAfter(before, section.getBoundingClientRect(), { scrollY, viewport: window.innerHeight, masthead: mastheadBottom() });
  if (to !== null) window.scrollTo({ top: to, behavior: "instant" });
}
```

In `src/components/landing/journey/drawing.ts`:
- Replace the import line `import { modeOf, placeAfter, startingReasons, wantsScene, whyOf, withReason, type DrawingMode, type DrawingReason, type Reasons } from "./drawing-mode";` with:
  ```ts
  import { modeOf, placeAfter, readerPlace, startingReasons, wantsScene, whyOf, withReason, type DrawingMode, type DrawingReason, type Reasons } from "./drawing-mode";
  import { keepPlace, mastheadBottom } from "./keep-place";
  ```
- Delete the file's own `function mastheadBottom()` and `function keepPlace(…)` (with its comment), from `function mastheadBottom(): number {` to the closing brace of `keepPlace`.
- Replace `const below = () => (section?.getBoundingClientRect().top ?? 0) < 0;` with:
  ```ts
      // below the chapter by the same rule that moves the reader (readerPlace; the old 0 against placeAfter's −8 was J5's minor)
      const below = () => section !== null && readerPlace(section.getBoundingClientRect(), window.innerHeight) !== "above";
  ```

- [ ] **Step 5: 02's guard and the still's settle on the rule**

In `src/components/landing/journey/chapters.ts`, add `import { readerPlace } from "./drawing-mode";` to the imports, and replace `settlePlace` with:

```ts
/** Above 02's old start: nothing. Inside it (over half the window in it): 02's new start, at its landing under the
 * masthead. Past it (its foot within the window's top half, what follows on screen): the same distance past its new
 * end (the height's change, plus its top's when the width moved it). Judged by readerPlace, the rule every piece uses
 * (J6-4): the window's top edge alone sent a reader in 02's last lines, #record on screen, back to its start. Returns
 * the place to judge the next change from. */
function settlePlace(section: HTMLElement, was: Place): Place {
  const now = docBox(section);
  const { y } = was;
  const where = readerPlace({ top: was.box.top - y, bottom: was.box.bottom - y }, window.innerHeight);
  if (where === "past") window.scrollTo({ top: y + now.bottom - was.box.bottom, behavior: "instant" });
  else if (where === "inside") window.scrollTo({ top: now.top - Number.parseFloat(getComputedStyle(section).scrollMarginTop), behavior: "instant" });
  return { box: now, y: window.scrollY };
}
```

In `src/components/landing/journey/still.ts`, add `import { pastShift } from "./drawing-mode";` to the imports. In `layout`, replace:
```ts
    if (wasColumns || isColumns) {
      const beforeDocBottom = beforeRect.top + beforeScrollY + beforeHeight;
      if (beforeScrollY >= beforeDocBottom && afterHeight !== beforeHeight) window.scrollTo({ top: beforeScrollY + (afterHeight - beforeHeight), behavior: "instant" });
    }
```
with:
```ts
    if (wasColumns || isColumns) {
      // Past the pin by the rule every piece uses (J6-4): its foot within the window's top half. The window's top edge
      // alone missed a reader at #principles, the pin's foot a few px under the masthead, and moved them 77 px.
      const shift = pastShift({ top: beforeRect.top, bottom: beforeRect.top + beforeHeight }, afterHeight - beforeHeight, window.innerHeight);
      if (shift !== 0) window.scrollTo({ top: beforeScrollY + shift, behavior: "instant" });
    }
```
Update the long comment above `layout` accordingly: replace its first sentence ("A reader already below the chapter never asked to move: …") so it reads "A reader past the chapter (readerPlace's past: its foot within the window's top half) never asked to move: …".

- [ ] **Step 6: Only the reader's own scroll cancels the Back restore**

In `src/components/landing/journey/place-memory.ts`, replace:
```ts
/** The reader's own hand: any of these before the restore means they have moved on, and nothing is restored under them. */
const HAND = ["wheel", "touchstart", "keydown"] as const;
```
with:
```ts
/** The events that can carry the reader's own scroll; ownScroll says which of them do. */
const HAND = ["wheel", "touchmove", "keydown"] as const;
/** The keys that scroll the page: the arrows up and down, Page Up and Page Down, Home, End and Space (Shift+Space up). */
const SCROLL_KEYS: ReadonlySet<string> = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);
/** Where a key types or picks rather than scrolls. */
const TEXT_FIELD = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

/**
 * The reader's own scroll (J5-17, amended by the owner on 2026-09-28; J6-9): before the restore, it means they have
 * moved on, and nothing is restored under them. Only a scroll counts:
 * - a wheel that is mostly vertical and not a pinch-zoom (ctrl+wheel). A sideways wheel is a trackpad's swipe back, or
 *   its momentum as the page returns;
 * - a finger dragging (touchmove). A tap (touchstart alone) is not a scroll;
 * - a scroll key, with focus outside a text field and no Alt, Ctrl or Meta: Alt+← and Cmd+[ are Back and Forward.
 * A swipe back, a tap and every other key leave the restore pending.
 */
function ownScroll(event: Event): boolean {
  if (event.type === "touchmove") return true;
  if (event instanceof WheelEvent) return !event.ctrlKey && Math.abs(event.deltaY) > Math.abs(event.deltaX);
  if (!(event instanceof KeyboardEvent) || !SCROLL_KEYS.has(event.key)) return false;
  if (event.altKey || event.ctrlKey || event.metaKey) return false;
  return !(event.target instanceof Element && event.target.closest(TEXT_FIELD));
}
```
In `startPlaceMemory`, replace:
```ts
  const onHand = () => {
    pending = null;
    stopHand();
  };
```
with:
```ts
  const onHand = (event: Event) => {
    if (!ownScroll(event)) return;
    pending = null;
    stopHand();
  };
```
The listeners stay capture and passive, and `stopHand` still removes all three.

- [ ] **Step 7: Run the unit tests to verify they pass**

Run: `npx vitest run tests/unit/components/landing/journey`
Expected: PASS, every existing test included. `drawing.test.tsx`'s J5 cases use tops of 200 and large negatives, both on the same side of −8.

- [ ] **Step 8: Write the failing e2e proofs**

In `tests/e2e/journey/journey-helpers.ts`, add (moved from `place.spec.ts`, which then imports it):
```ts
/** From before the page's first script: scroll anchoring off, as a browser without it would be (Safari, every iOS
 * browser), moving the reader with any change of height above them that nothing compensates. */
export async function noAnchoring(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync("html { overflow-anchor: none; }");
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  });
}
```
In `tests/e2e/journey/place.spec.ts`:
- delete its local `noAnchoring`;
- change the helper import to `import { drawStill, frames, noAnchoring, scrollToId, waitForJourney, waitForLive } from "./journey-helpers";`;
- replace the arrival loop (from `// The journey marks the page as its own` to its closing `}`) with:

```ts
  // The journey marks the page as its own (data-journey="on") before drawing.ts, eleventh of the modules it starts a
  // turn at a time, has decided which drawing it shows, and still.ts then settles the still's columns. None of it may
  // move a reader who arrived below the chapter (an in-page link, a reload, Back), scroll anchoring or not: the still's
  // first settle judges them past the pin by readerPlace (J6-4), where it once moved #principles by 77 px.
  for (const id of ["principles", "record"] as const) {
    test(`a reader who arrives at #${id}, below the drawn train, stays put through the journey's start and the still's settle`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await watchTop(page, id);
      await page.goto(`/#${id}`);
      await waitForJourney(page);
      await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "place");
      await frames(page, 4); // anything the settle set going has had its turn
      const samples = await page.evaluate(() => (Reflect.get(window, "__ttTops") ?? []) as Sample[]);
      const landed = samples.findIndex((s) => s.y > 0); // the browser's jump to the fragment
      expect(landed, "the page never scrolled to the fragment").toBeGreaterThanOrEqual(0);
      const judged = samples.slice(landed);
      expect(judged.some((s) => s.decided), "the samples stop before drawing.ts decided").toBe(true);
      expect(judged.some((s) => s.columns), "the samples stop before the still settled its columns").toBe(true);
      const at = judged[0]!.top;
      const moved = judged.map((s) => s.top).filter((top) => Math.abs(top - at) > 4);
      expect(moved, `#${id} landed at ${at} px`).toEqual([]);
    });
  }
```
- in `rebuilds`, change the fit rebuild's `offset: 0` to `offset: 120`, and replace the comment above `const principlesTop` with:
  ```ts
  // A rebuild tears the live drawing down and builds the drawing again: to a reader below the chapter, the unpin and
  // the still's return are one change, kept in place together (J5-3), whether the browser anchors scroll or not; the
  // still's first columns settle then keeps them too (J6-4).
  ```
- add at the end of the `describe`:

```ts
  // 02's last lines (J6-4): a reader whose window still shows 02's foot, #record's heading below it, is past 02 by
  // readerPlace, and stays on #record through a change of 02's height, where the window's top edge alone sent them back
  // 2,300–3,000 px to 02's start (J5 final re-review 2).
  const recordTop = (page: Page) => page.locator("#record").evaluate((el) => el.getBoundingClientRect().top);
  const changes = [
    {
      change: "Motion goes off",
      act: async (page: Page) => {
        await page.getByRole("contentinfo").getByRole("switch", { name: "Motion" }).evaluate((el) => (el as HTMLElement).click());
        await expect(page.locator("#how")).not.toHaveClass(/is-pinned/);
      },
    },
    { change: "the window gets shorter", act: (page: Page) => page.setViewportSize({ width: 1440, height: 700 }) },
  ] as const;
  for (const anchoring of ["on", "off"] as const) {
    for (const { change, act } of changes) {
      test(`a reader in 02's last lines stays on #record when ${change} (scroll anchoring ${anchoring})`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await drawStill(page);
        if (anchoring === "off") await noAnchoring(page);
        await page.goto("/");
        await waitForJourney(page);
        await expect(page.locator("#how")).toHaveClass(/is-pinned/);
        await scrollToId(page, "record", 120); // 02's foot 120px down the window
        await frames(page, 3); // the guard has learned the reader's place
        const before = await recordTop(page);
        await act(page);
        await frames(page, 6); // the collapse, its padding a frame later, the guard's and the still's settles
        const after = await recordTop(page);
        expect(Math.abs(after - before), `#record ${before} -> ${after}`).toBeLessThanOrEqual(4);
      });
    }
  }
```

- [ ] **Step 9: Run the e2e proofs**

```bash
lsof -nP -iTCP:4210 -sTCP:LISTEN
npx playwright test tests/e2e/journey/place.spec.ts tests/e2e/journey/chapters.spec.ts tests/e2e/journey/drawing.spec.ts tests/e2e/journey/live-drawing.spec.ts
```
Expected: PASS.
- Before Steps 3–5, the `#principles` arrival failed with anchoring off (a 77 px move).
- The four "02's last lines" tests failed with `#record 120 -> 2…` or `-> 3…`.

Confirm both by stashing Steps 3–5 (`git stash push src/components/landing/journey`), running `place.spec.ts`, and restoring (`git stash pop`). If `chapters.spec.ts` has a case that put a reader at 02's foot and expected 02's start, it asserted the old rule: change its expectation to "stays on #record", and say so in the commit body.

- [ ] **Step 10: Write the rule into DESIGN.md**

In `DESIGN.md`'s Motion section, in the landing journey's bullet list, after the "**Scroll-driven pieces follow the scroll both ways:**" bullet, add:
```markdown
- **Nothing moves under the reader.** A piece that grows or shrinks (the drawing's pin, 02's dial, the still's
  columns, the run) judges the reader by one rule (`readerPlace`). Above it, its top in view, the change lands below
  them. Inside it, with over half the window in it, they go to its start. Past it, its foot within the window's top
  half, they move by exactly the change, so what follows it stays where they were reading.
```

- [ ] **Step 11: The gate, then commit**

```bash
npm run check
git add src/components/landing/journey/drawing-mode.ts src/components/landing/journey/keep-place.ts src/components/landing/journey/drawing.ts src/components/landing/journey/chapters.ts src/components/landing/journey/still.ts src/components/landing/journey/place-memory.ts tests/unit/components/landing/journey/drawing-mode.test.ts tests/unit/components/landing/journey/place-guard.test.tsx tests/unit/components/landing/journey/still.test.tsx tests/unit/components/landing/journey/place-memory.test.tsx tests/e2e/journey/journey-helpers.ts tests/e2e/journey/place.spec.ts DESIGN.md
git commit -m "fix(journey): judge the reader by one rule everywhere, so neither 02's last lines nor #principles move them" -m "Back's restore is cancelled only by the reader's own scroll: a vertical wheel, a finger dragging, a scroll key (J6-9)."
```

---

### Task 4: The drawing's loose ends: fit before the download, a late scene that builds nothing

J5 decided `fit` inside the scene chunk, after three.js had loaded. The check (`live-labels.ts`'s `layout()`) is a DOM measurement, but of the pinned layout, which existed only once the scene had loaded. `liveFits` lays that layout out for an instant, before the import, and puts it back in the same task (J6-5). A reader whose window cannot fit the chapter downloads nothing.

The rest are J5's deferred minors:
- a scene chunk that arrives after its 20 s limit, or after its module ended, builds nothing;
- the mode specs assert the still itself, not only its reason;
- forced colours get an e2e;
- the loader's default `hud: false` is tested;
- `rig.test.ts`'s unused `_` goes;
- the spec's `load` and `fit` lines match the code.

**Files:**
- Modify: `src/components/landing/journey/drawing.ts` (`liveFits`, `drawingModule`'s third argument, `sceneLoader`'s signal)
- Modify: `tests/e2e/journey/drawing-modes.spec.ts`, `tests/e2e/journey/live-drawing.spec.ts`
- Modify: `tests/unit/components/landing/journey/journey-loader.test.tsx`, `tests/unit/components/landing/journey/scene/rig.test.ts`
- Modify: `docs/superpowers/specs/2026-09-24-landing-journey-design.md` (§3.C, §3.H)
- Create: `tests/unit/components/landing/journey/drawing-fit.test.tsx` (`drawing.test.tsx` is at 463 of its 500 lines, and stays unchanged)

**Interfaces:**
- Consumes: `createLiveLabels(section)` and its `layout()` and `clear()` (`live-labels.ts`, J5).
- Produces:
  - `liveFits(section: HTMLElement | null): boolean`;
  - `drawingModule(loadLive: LoadLive, probe?: () => boolean, fits?: (section: HTMLElement | null) => boolean): JourneyModule`;
  - `LoadLive = (ask: Ask, ctx: JourneyContext, signal?: AbortSignal) => Promise<Begin>`. `scene/live.ts`'s `prepareLive(ask, ctx)` still matches: a function may take fewer parameters.

- [ ] **Step 1: Write the failing unit tests**

`drawing.test.tsx` already has 463 lines, and these would take it past the 500-line limit that `tokens.contract.test.ts` enforces. So they go in a file of their own. Create `tests/unit/components/landing/journey/drawing-fit.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOAD_LIMIT_MS, drawingModule, liveFits, sceneLoader, type Begin, type LoadLive } from "@/components/landing/journey/drawing";
import { testContext } from "./journey-context";

// drawing.ts's J6 additions, apart from drawing.test.tsx (at its line limit): fit judged before the scene is fetched
// (J6-5), and a scene that arrives too late (J5 final review, minor 2).

const html = document.documentElement;

beforeEach(() => {
  html.dataset.drawing = "live";
  html.dataset.saver = "off";
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete html.dataset.drawing;
  delete html.dataset.drawingWhy;
  delete html.dataset.saver;
  window.sessionStorage.clear();
  document.body.innerHTML = "";
});

describe("fit, judged before the scene is fetched (J6-5)", () => {
  const markup = `<header></header><section id="anatomy"><div class="anatomy-pin"><div class="anatomy-copy"></div><ol class="callouts"><li class="callout" data-side="left"></li></ol><p class="anatomy-caption"></p><div class="title-block"></div><ol class="anatomy-legend"></ol></div></section>`;

  it("lays the pinned chapter out for an instant, and puts it all back in the same task", () => {
    // live-labels.ts asks whether the window is narrow; jsdom has no matchMedia
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
    document.body.innerHTML = markup;
    const section = document.getElementById("anatomy")!;
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    // jsdom lays nothing out: the zone is empty, so the words do not fit
    expect(liveFits(section)).toBe(false);
    expect(section.classList.contains("is-live")).toBe(false);
    expect(section.querySelector(".live-lines")).toBeNull();
    expect(section.querySelector<HTMLElement>(".anatomy-pin")?.dataset.live).toBeUndefined();
    expect(scrollTo).not.toHaveBeenCalled(); // the reader never moved, so nothing was put back
  });

  it("has nothing to judge without the chapter's markup: the scene's own check decides", () => {
    expect(liveFits(null)).toBe(true);
    document.body.innerHTML = `<section id="anatomy"></section>`;
    expect(liveFits(document.getElementById("anatomy"))).toBe(true);
  });

  it("settles on the still for fit, and never asks for the scene, when the chapter cannot fit", () => {
    const load = vi.fn<LoadLive>();
    const stop = drawingModule(load, () => true, () => false)(testContext());
    expect(html.dataset.drawing).toBe("still");
    expect(html.dataset.drawingWhy).toBe("fit");
    expect(load).not.toHaveBeenCalled();
    stop();
  });

  it("asks for the scene when it fits", () => {
    const load = vi.fn<LoadLive>(() => new Promise<Begin>(() => undefined));
    const stop = drawingModule(load, () => true, () => true)(testContext());
    expect(load).toHaveBeenCalledTimes(1);
    stop();
  });
});

describe("a scene that arrives too late builds nothing (J5 final review, minor 2)", () => {
  it("prepares nothing from a chunk that arrives after the 20 s limit", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const prepareLive = vi.fn<LoadLive>();
    const arrive: { now: () => void } = { now: () => undefined };
    const chunk = new Promise<{ readonly prepareLive: LoadLive }>((resolve) => {
      arrive.now = () => resolve({ prepareLive });
    });
    const stop = drawingModule(sceneLoader(() => chunk), () => true, () => true)(testContext());
    await vi.advanceTimersByTimeAsync(LOAD_LIMIT_MS);
    expect(html.dataset.drawingWhy).toBe("load");
    arrive.now();
    await vi.advanceTimersByTimeAsync(0);
    expect(prepareLive).not.toHaveBeenCalled();
    stop();
    warn.mockRestore();
  });

  it("prepares nothing from a chunk that arrives after its module has ended", async () => {
    const prepareLive = vi.fn<LoadLive>();
    const arrive: { now: () => void } = { now: () => undefined };
    const chunk = new Promise<{ readonly prepareLive: LoadLive }>((resolve) => {
      arrive.now = () => resolve({ prepareLive });
    });
    const stop = drawingModule(sceneLoader(() => chunk), () => true, () => true)(testContext());
    stop(); // a Motion toggle, or leaving "/"
    arrive.now();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(prepareLive).not.toHaveBeenCalled();
  });
});
```

In `tests/unit/components/landing/journey/journey-loader.test.tsx`, add after the last test:
```ts
  it("tells the journey the frame meter is not allowed unless the page says so", async () => {
    const startJourney = vi.fn(() => () => {});
    render(<JourneyLoader load={async () => ({ startJourney })} />);
    await vi.advanceTimersByTimeAsync(1);
    expect(startJourney).toHaveBeenCalledWith({ hud: false });
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/components/landing/journey/drawing-fit.test.tsx tests/unit/components/landing/journey/journey-loader.test.tsx`
Expected: FAIL.
- `liveFits is not a function`, then the two "builds nothing" tests with `expected "spy" to not be called at all, but actually been called 1 times`.
- The loader test passes at once: it pins behaviour J5 left untested, which is its point.

- [ ] **Step 3: Implement them in `drawing.ts`**

Add `import { createLiveLabels } from "./live-labels";` to the imports. Change the `LoadLive` type to:
```ts
/** Prepares the live drawing and resolves to what begins it. `signal` aborts when the module that asked has ended. */
export type LoadLive = (ask: Ask, ctx: JourneyContext, signal?: AbortSignal) => Promise<Begin>;
```
After `storeFloor`, add:
```ts
/**
 * Whether the live chapter's words fit its window (spec §3.C, fit), judged before the scene is fetched (J6-5): the pinned
 * layout, laid out for an instant and measured by the live labels' own layout() (a DOM measurement, no three.js), then
 * put back in the same task, so nothing paints. A reader below the chapter may have been moved by scroll anchoring
 * while it stood pinned: the scroll is put back too. The one write of the pin outside keepPlace, and still this
 * module's. The scene's own check, on every relayout while live, stands behind it. Without the chapter's markup (a
 * unit test) there is nothing to judge, and the scene decides.
 */
export function liveFits(section: HTMLElement | null): boolean {
  if (!section || section.classList.contains(PINNED)) return true;
  const y = window.scrollY;
  section.classList.add(PINNED);
  const labels = createLiveLabels(section);
  const fits = labels === null || labels.layout() !== null;
  labels?.clear();
  section.classList.remove(PINNED);
  if (window.scrollY !== y) window.scrollTo({ top: y, behavior: "instant" });
  return fits;
}
```
`PINNED` is declared above `quietMs`, so move this function below that constant. Change `drawingModule`'s signature to:
```ts
export function drawingModule(loadLive: LoadLive, probe: () => boolean = webgl2, fits: (section: HTMLElement | null) => boolean = liveFits): JourneyModule {
```
In its body, after `let alive = true;`, add:
```ts
    const ended = new AbortController(); // a scene that arrives after this module ends builds nothing
```
In `prepare`, replace `const mine = loadLive(ask, ctx);` with `const mine = loadLive(ask, ctx, ended.signal);`. In `apply()`, replace its first two lines:
```ts
      if (!alive) return;
      if (wantsScene(reasons)) prepare();
```
with:
```ts
      if (!alive) return;
      // judged once, just before the first fetch: a chapter that cannot fit its window never downloads the scene (J6-5)
      if (wantsScene(reasons) && !prepared && !fits(section)) reasons = withReason(reasons, "fit", true);
      if (wantsScene(reasons)) prepare();
```
In the module's teardown, right after `alive = false;`, add `ended.abort();`. Replace `sceneLoader` with:
```ts
export function sceneLoader(importScene: () => Promise<SceneChunk> = () => import("./scene/live")): LoadLive {
  return (ask, ctx, signal) =>
    new Promise<Begin>((resolve, reject) => {
      let settled = false; // the limit has passed: a chunk that arrives now builds nothing (J5 final review, minor 2)
      const timer = window.setTimeout(() => {
        settled = true;
        reject(new Error("the live drawing took over 20 s to arrive"));
      }, LOAD_LIMIT_MS);
      importScene().then(
        (scene) => {
          window.clearTimeout(timer);
          if (settled) return;
          settled = true;
          if (signal?.aborted) reject(new Error("the live drawing is no longer wanted"));
          else resolve(scene.prepareLive(ask, ctx));
        },
        (error: unknown) => {
          window.clearTimeout(timer);
          if (settled) return;
          settled = true;
          reject(error);
        },
      );
    });
}
```
The rejection after an abort reaches `prepare`'s `catch` with `prepared !== mine` (the teardown nulled it), so nothing is warned or asked.

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `npx vitest run tests/unit/components/landing/journey`
Expected: PASS. The J5 cases call `drawingModule(load, probe)` with two arguments, and on their markup (no pin) `liveFits` is true.

- [ ] **Step 5: The e2e: fit downloads nothing, the modes' still, forced colours**

In `tests/e2e/journey/drawing-modes.spec.ts`, replace the fit test with:
```ts
  test("words too large for the window, even as a list: still (fit), and three.js never downloaded (J6-5)", async ({ page }) => {
    const three = watchThree(page);
    // A phone with its text at 200%: the lead and the parts list leave the drawing less than its 150px (spec §3.C).
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => document.documentElement.style.setProperty("font-size", "200%")));
    await page.goto("/");
    await waitForJourney(page);
    // judged before the scene is fetched: the pinned layout, laid out for an instant and put back
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "fit");
    await expect(page.locator("html")).toHaveAttribute("data-drawing", "still");
    await expect(page.locator("#anatomy")).not.toHaveClass(/is-live/);
    await expect(drawn(page).first()).toBeAttached();
    // A window is the assertion: a download that never starts has no state to wait on.
    await page.waitForTimeout(1_500);
    expect(three()).toEqual([]);
  });
```
In the same file, in each of these tests, directly after its `toHaveAttribute("data-drawing-why", …)` line, add `await expect(page.locator("html")).toHaveAttribute("data-drawing", "still");`:
- "no WebGL";
- "the GPU drops the context", after its `"webgl"` assertion;
- "the scene chunk blocked";
- "the session's quality floor";
- "a reader landing below the chapter".

In `tests/e2e/journey/live-drawing.spec.ts`, add inside `test.describe("the train, drawn live (spec §3.A, §3.C)", …)`:
```ts
  test("forced colours: it draws live in the system's own colours, and the labels keep theirs (J5-21)", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto("/");
    await waitForLive(page);
    await scrollIntoChapter(page, 0.4);
    await expect.poll(() => page.evaluate(() => window.__ttJourney?.inked("#anatomy .anatomy-stage") ?? 0)).toBeGreaterThan(0.002);
    const [label, system] = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "CanvasText";
      document.body.append(probe);
      const read = [getComputedStyle(document.querySelector("#anatomy .callout-title")!).color, getComputedStyle(probe).color];
      probe.remove();
      return read;
    });
    expect(label).toBe(system);
  });
```

- [ ] **Step 6: Run the e2e**

```bash
lsof -nP -iTCP:4210 -sTCP:LISTEN
npx playwright test tests/e2e/journey/drawing-modes.spec.ts tests/e2e/journey/live-drawing.spec.ts tests/e2e/journey/place.spec.ts
```
Expected: PASS. Before Step 3, the fit test's `three()` listed the scene's chunk.

- [ ] **Step 7: The two small ones**

In `tests/unit/components/landing/journey/scene/rig.test.ts`, replace the loop in "builds a part at a time, and only hands over the rig once it is whole":
```ts
    for (const _ of rigSteps(style, { coaches: 1 }, out)) {
      steps += 1;
      expect(out.rig).toBeUndefined();
    }
```
with:
```ts
    const build = rigSteps(style, { coaches: 1 }, out);
    for (let next = build.next(); !next.done; next = build.next()) {
      steps += 1;
      expect(out.rig).toBeUndefined();
    }
```
Run: `npx vitest run tests/unit/components/landing/journey/scene/rig.test.ts && npm run lint`
Expected: PASS, and lint prints no warning for `rig.test.ts`.

- [ ] **Step 8: The spec says what the code does**

In `docs/superpowers/specs/2026-09-24-landing-journey-design.md`:
- §3.C's table: change the `load` row's "next visit" to "the next rebuild (a Motion toggle, a fit change) retries".
- §3.C's still paragraph: replace from "except while `place` is the only reason, when the scene prepares in the background (J5-2), or when the live chapter's fit check finds the drawing cannot fit its window." to the end of that paragraph with: "except while `place` is the only reason, when the scene prepares in the background (J5-2). Whether the chapter fits is judged before the scene is fetched: `drawing.ts`'s `liveFits` lays the pinned chapter out for an instant, measures it with `live-labels.ts`'s own `layout()` (a DOM measurement, no three.js), and puts it back in the same task (J6-5). The scene's own check, on every relayout while live, stands behind it."
- §3.H's Scene chunk row: delete ", or when the live chapter's fit check finds the drawing cannot fit its window".

- [ ] **Step 9: The gate, then commit**

```bash
npm run check
git add src/components/landing/journey/drawing.ts tests/unit/components/landing/journey/drawing-fit.test.tsx tests/unit/components/landing/journey/journey-loader.test.tsx tests/unit/components/landing/journey/scene/rig.test.ts tests/e2e/journey/drawing-modes.spec.ts tests/e2e/journey/live-drawing.spec.ts docs/superpowers/specs/2026-09-24-landing-journey-design.md
git commit -m "fix(journey): judge fit before the scene is fetched, and let a scene that arrives too late build nothing"
```

---

### Task 5: The window-seat run's frame and geometry

The server renders the run's frame around 06 and 07 (J6-6):
- the pin;
- a window of three empty line layers;
- the train glyph;
- the track holding both sections, each piece marked as a station.

Without the journey, with Motion off, or while the run is not pinned, the window and the train are not shown, and the sections read exactly as today. The geometry the window is drawn from is pure and unit-tested here. Task 6 moves it.

**Files:**
- Create: `src/components/landing/journey/geometry/run.ts`, `src/components/landing/journey/window-run.tsx`
- Modify: `src/components/landing/features.tsx`, `src/components/landing/photo-split.tsx`, `src/app/(site)/page.tsx`
- Modify: `src/messages/en-IN/journey.ts` (`run.km`), `src/styles/journey.css`
- Test: `tests/unit/components/landing/journey/run-geometry.test.ts`, `tests/unit/components/landing/journey/window-run.test.tsx`

**Interfaces:**
- Consumes: `TrainGlyph` (`train-glyph.tsx`), `STATIONS` and `kmFigure` (`stations.ts`).
- Produces, from `geometry/run.ts`:
  - `StationBox { x0; x1 }`;
  - `RunLayout { w; h; trainX; centers; halves; boxes; first; travel }`;
  - `KmRange { from; to }`;
  - `Stroke { cls; d }`, `Post { x; y; km }`, `Stop { platform; tick }`;
  - `Layers { far: Layer; line: Layer & { posts; stops }; near: Layer }`, where `Layer { span; strokes }`;
  - `PARALLAX`;
  - `band(h)`, `fitsRun(heights, h, w)`, `trainAt(w, phone)`, `runLayout(boxes, pin)`, `anchorOf(center, first, travel)`, `hereAt(pos, centers, halves)`, `offsets(p, at)`, `leanStep(lean, dp, travel)`, `kmAt(x, first, travel, km)`, `mast(x, y0, y1, w)` and `layers(at, km)`.

  Also produced:
  - `<WindowRun>{children}</WindowRun>`: `#run.run > .run-pin > (.run-window > svg.run-far, svg.run-line, svg.run-near) + .run-train > span > TrainGlyph + .run-track > children`;
  - the stations, `[data-station]` in reading order: `#features .run-intro`, the three `#features article`s, `#use > div`, `#use > figure`;
  - `messages.journey.run.km(figure: string): string`.

- [ ] **Step 1: Write the failing geometry tests**

Create `tests/unit/components/landing/journey/run-geometry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PARALLAX, anchorOf, band, fitsRun, hereAt, kmAt, layers, leanStep, mast, offsets, runLayout, trainAt } from "@/components/landing/journey/geometry/run";

// The window-seat run's geometry (spec §3.A; prototype v3's run.js), pure.

const KM = { from: 530, to: 644 };
// three stations on the track: 06's heading, a card, 07's figure
const L = runLayout(
  [
    { x0: 0, x1: 300 },
    { x0: 400, x1: 700 },
    { x0: 800, x1: 1400 },
  ],
  { w: 1440, h: 836, trainX: trainAt(1440, false) },
);

describe("the run's window", () => {
  it("keeps a line diagram along its foot, lower on short windows", () => {
    expect(band(639)).toBe(96);
    expect(band(640)).toBe(124);
  });

  it("runs only while the tallest station stands above the line diagram, on a window wide enough to read", () => {
    expect(fitsRun([400, 692], 836, 1440)).toBe(true); // 836 - 124 - 20 = 692
    expect(fitsRun([400, 693], 836, 1440)).toBe(false);
    expect(fitsRun([100], 836, 299)).toBe(false);
    expect(fitsRun([], 836, 1440)).toBe(false);
  });

  it("holds the train a third in on a wide window, in the middle on a phone", () => {
    expect(trainAt(1440, false)).toBe(432);
    expect(trainAt(390, true)).toBe(195);
  });

  it("measures the stations' centres, and the travel that brings the last to the window", () => {
    expect(L.centers).toEqual([150, 550, 1100]);
    expect(L.halves).toEqual([150, 150, 300]);
    expect(L.first).toBe(150);
    expect(L.travel).toBe(950);
  });

  it("puts a station at the window by its distance from the first, within the travel", () => {
    expect(anchorOf(550, L.first, L.travel)).toBe(400);
    expect(anchorOf(100, L.first, L.travel)).toBe(0);
    expect(anchorOf(5000, L.first, L.travel)).toBe(950);
  });

  it("names the station at the window: the last whose near edge, less 24px, has reached it", () => {
    expect(hereAt(L.first, L.centers, L.halves)).toBe(0);
    expect(hereAt(550 - 150 - 25, L.centers, L.halves)).toBe(0);
    expect(hereAt(550 - 150 - 24, L.centers, L.halves)).toBe(1);
    expect(hereAt(L.first + L.travel, L.centers, L.halves)).toBe(2);
  });

  it("brings the first station to the train at 0 and the last at 1; the far masts pass slower, the near posts faster", () => {
    expect(L.centers[0]! + offsets(0, L).track).toBe(L.trainX);
    expect(L.centers[2]! + offsets(1, L).track).toBe(L.trainX);
    const moved = (k: "track" | "far" | "near") => offsets(0, L)[k] - offsets(1, L)[k];
    expect(moved("far")).toBeCloseTo(L.travel * PARALLAX.far, 6);
    expect(moved("track")).toBe(L.travel);
    expect(moved("near")).toBeCloseTo(L.travel * PARALLAX.near, 6);
  });

  it("leans the train into its pace, a quarter of the way each frame, never past 9°", () => {
    expect(leanStep(0, 0.01, 1000)).toBeCloseTo(-0.75, 6); // 10px forward: a lean of −3°, reached a quarter at a time
    expect(leanStep(0, 1, 1000)).toBeCloseTo(-2.25, 6); // a fling: −9° at most
    expect(leanStep(-4, 0, 1000)).toBeCloseTo(-3, 6); // at rest it rights itself
  });

  it("counts kilometre posts on from 06's to 07's", () => {
    expect(kmAt(L.first, L.first, L.travel, KM)).toBe(530);
    expect(kmAt(L.first + L.travel, L.first, L.travel, KM)).toBe(644);
  });

  it("draws a lattice mast as its two legs and its braces", () => {
    expect(mast(10, 100, 60, 7)).toBe("M10 100V60M17 100V60M10 100L17 88M17 88L10 76M10 76L17 64");
  });
});

describe("the window's three layers", () => {
  const drawn = layers(L, KM);

  it("spans each layer as far as it travels", () => {
    expect(drawn.far.span).toBe(Math.ceil(1440 + 950 * PARALLAX.far + 40));
    expect(drawn.line.span).toBe(1440 + 950 + 40);
    expect(drawn.near.span).toBe(Math.ceil(1440 + 950 * PARALLAX.near + 40));
  });

  it("draws a platform and a tick for every station", () => {
    expect(drawn.line.stops).toHaveLength(3);
    const rail = 836 - 46;
    expect(drawn.line.stops[2]).toEqual({ platform: `M800.0 ${rail - 30}H1400.0M800.0 ${rail - 30}V${rail - 24}M1400.0 ${rail - 30}V${rail - 24}`, tick: `M1100.0 ${rail - 40}V${rail + 12}` });
  });

  it("labels every other kilometre post below the rails, counting from the track's own x", () => {
    const rail = 836 - 46;
    expect(drawn.line.posts[0]).toEqual({ x: 64, y: rail + 24, km: kmAt(60, L.first, L.travel, KM) });
    expect(drawn.line.posts.every((p, i, all) => i === 0 || p.x - all[i - 1]!.x === 320)).toBe(true);
  });

  it("strokes each layer with its own weight class", () => {
    expect(drawn.far.strokes.map((s) => s.cls)).toEqual(["run-stroke is-far"]);
    expect(drawn.line.strokes.map((s) => s.cls)).toEqual(["run-stroke is-faint", "run-stroke", "run-stroke is-mast"]);
    expect(drawn.near.strokes.map((s) => s.cls)).toEqual(["run-stroke is-near"]);
  });
});
```

`kmAt(60, …)` is `Math.round(530 + ((60 - 150) / 950) * 114)`, which is 519. The first post is labelled KM 519, left of 06's heading. That is v3's behaviour, and it is why `layers` skips only negative posts.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/components/landing/journey/run-geometry.test.ts`
Expected: FAIL with `Failed to resolve import "@/components/landing/journey/geometry/run"`.

- [ ] **Step 3: Write `geometry/run.ts`**

Create `src/components/landing/journey/geometry/run.ts`:

```ts
// The window-seat run's geometry (spec §3.A; prototype v3's run.js), pure so it is unit-tested: run.ts measures the
// page and writes what these return. Units are the pin's px, x to the right, y down. The track's own left edge is x 0,
// so the line layer, which rides with the track, shares its x.

export interface StationBox {
  readonly x0: number;
  readonly x1: number;
}
export interface RunLayout {
  /** The pin's width and height. */
  readonly w: number;
  readonly h: number;
  /** Where the train holds, from the pin's left edge. */
  readonly trainX: number;
  readonly boxes: readonly StationBox[];
  readonly centers: readonly number[];
  readonly halves: readonly number[];
  /** The first station's centre, and how far the track travels to bring the last one to the window. */
  readonly first: number;
  readonly travel: number;
}
export interface KmRange {
  readonly from: number;
  readonly to: number;
}
export interface Stroke {
  readonly cls: string;
  readonly d: string;
}
export interface Layer {
  readonly span: number;
  readonly strokes: readonly Stroke[];
}
export interface Post {
  readonly x: number;
  readonly y: number;
  readonly km: number;
}
export interface Stop {
  readonly platform: string;
  readonly tick: string;
}
export interface Layers {
  readonly far: Layer;
  readonly line: Layer & { readonly posts: readonly Post[]; readonly stops: readonly Stop[] };
  readonly near: Layer;
}

/** How much slower the far masts pass, and how much faster the near posts, than the line. */
export const PARALLAX = { far: 0.35, near: 1.8 } as const;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const f = (n: number): string => n.toFixed(1);

/** The line diagram's height along the window's foot. */
export function band(h: number): number {
  return h < 640 ? 96 : 124;
}

/** The window holds the tallest station above the line diagram, and is wide enough to read. */
export function fitsRun(heights: readonly number[], h: number, w: number): boolean {
  const room = h - band(h) - 20;
  return w >= 300 && heights.length > 0 && heights.every((height) => height <= room);
}

/** Where the train holds: a third in on a wide window, the middle on a phone. */
export function trainAt(w: number, phone: boolean): number {
  return Math.round(w * (phone ? 0.5 : 0.3));
}

export function runLayout(boxes: readonly StationBox[], pin: { readonly w: number; readonly h: number; readonly trainX: number }): RunLayout {
  const centers = boxes.map((b) => (b.x0 + b.x1) / 2);
  const halves = boxes.map((b) => (b.x1 - b.x0) / 2);
  const first = centers[0] ?? 0;
  return { ...pin, boxes, centers, halves, first, travel: Math.max(0, (centers.at(-1) ?? first) - first) };
}

/** How far into the run a station stands at the window: its centre's distance from the first's, within the travel. */
export function anchorOf(center: number, first: number, travel: number): number {
  return Math.round(clamp(center - first, 0, travel));
}

/** The station at the window at track position `pos`: the last whose near edge, less 24px, has reached it. */
export function hereAt(pos: number, centers: readonly number[], halves: readonly number[]): number {
  return centers.reduce((here, c, i) => (c - (halves[i] ?? 0) - 24 <= pos ? i : here), 0);
}

/** Each layer's sideways offset at progress p: the track and the line at the train's pace, the far masts slower, the
 * near posts faster, each lined up on the first station at p = 0. */
export function offsets(p: number, at: Pick<RunLayout, "trainX" | "first" | "travel">): { readonly track: number; readonly far: number; readonly near: number } {
  const base = at.trainX - at.first;
  const gone = p * at.travel;
  return { track: base - gone, far: (base - gone) * PARALLAX.far, near: (base - gone) * PARALLAX.near };
}

/** The train's lean after one frame that moved progress by dp: into its pace, a quarter of the way, never past 9°. */
export function leanStep(lean: number, dp: number, travel: number): number {
  return lean + (clamp(-dp * travel * 0.3, -9, 9) - lean) * 0.25;
}

/** The kilometre post at track x: the run counts on from 06's km to 07's. */
export function kmAt(x: number, first: number, travel: number, km: KmRange): number {
  return Math.round(km.from + ((x - first) / Math.max(1, travel)) * (km.to - km.from));
}

/** A lattice mast from y0 up to y1 (y grows down), w wide: its two legs, then braces zig-zagging up. */
export function mast(x: number, y0: number, y1: number, w: number): string {
  const parts = [`M${x} ${y0}V${y1}M${x + w} ${y0}V${y1}`];
  for (let y = y0, up = true; y > y1 + 8; y -= 12, up = !up) parts.push(`M${up ? x : x + w} ${y}L${up ? x + w : x} ${y - 12}`);
  return parts.join("");
}

/**
 * The window's three layers (v3's drawLayers):
 * - far: slim masts over the whole window carrying the overhead line (a sagging messenger, the contact wire and its
 *   droppers), and the horizon;
 * - the line: rails and sleepers, a kilometre post every 160px (every other one labelled, below the rails, where the
 *   train never passes over them), a platform and a tick under every station, and lattice masts;
 * - near: heavy posts close by, in the foreground.
 */
export function layers(at: RunLayout, km: KmRange): Layers {
  const { w, h, travel, first } = at;
  const foot = h - band(h);
  const rail = h - 46;
  const spans = { far: Math.ceil(w + travel * PARALLAX.far + 40), line: Math.ceil(w + travel + 40), near: Math.ceil(w + travel * PARALLAX.near + 40) };

  const top = Math.round(h * 0.1);
  const wire = top + 34;
  const sag = (t: number): number => top + 10 + 16 * Math.sin(Math.PI * t);
  const masts: number[] = [];
  for (let x = 90; x < spans.far; x += 210) masts.push(x);
  const far = [`M0 ${foot + 18}H${spans.far}`, ...masts.map((x) => `M${x} ${foot + 18}V${top}M${x - 14} ${top + 10}H${x + 14}`)];
  masts.slice(0, -1).forEach((a, i) => {
    const b = masts[i + 1] ?? a;
    const along = (k: number): number => a + ((b - a) * k) / 12;
    far.push(`M${a} ${top + 10}${Array.from({ length: 12 }, (_, j) => `L${f(along(j + 1))} ${f(sag((j + 1) / 12))}`).join("")}`);
    far.push(`M${a} ${wire}H${b}`);
    for (let k = 2; k < 12; k += 2) far.push(`M${f(along(k))} ${f(sag(k / 12))}V${wire}`);
  });

  const sleepers: string[] = [];
  for (let x = 0; x < spans.line; x += 12) sleepers.push(`M${x} ${rail - 3}V${rail + 9}`);
  const lineMasts: string[] = [];
  for (let x = 150; x < spans.line; x += 300) lineMasts.push(mast(x, rail - 2, foot - 44, 7));
  const ticks: string[] = [];
  const posts: Post[] = [];
  for (let x = 60, k = 0; x < spans.line; x += 160, k += 1) {
    const value = kmAt(x, first, travel, km);
    if (value < 0) continue;
    ticks.push(`M${x} ${rail + 10}V${rail + 17}`);
    if (k % 2 === 0) posts.push({ x: x + 4, y: rail + 24, km: value });
  }
  const stops = at.boxes.map((b, i) => ({
    platform: `M${f(b.x0)} ${rail - 30}H${f(b.x1)}M${f(b.x0)} ${rail - 30}V${rail - 24}M${f(b.x1)} ${rail - 30}V${rail - 24}`,
    tick: `M${f(at.centers[i] ?? 0)} ${rail - 40}V${rail + 12}`,
  }));

  const near: string[] = [];
  for (let x = 40; x < spans.near; x += 260) near.push(mast(x, h, rail + 30, 12));

  return {
    far: { span: spans.far, strokes: [{ cls: "run-stroke is-far", d: far.join("") }] },
    line: {
      span: spans.line,
      strokes: [
        { cls: "run-stroke is-faint", d: sleepers.join("") },
        { cls: "run-stroke", d: `M0 ${rail}H${spans.line}M0 ${rail + 6}H${spans.line}${ticks.join("")}` },
        { cls: "run-stroke is-mast", d: lineMasts.join("") },
      ],
      posts,
      stops,
    },
    near: { span: spans.near, strokes: [{ cls: "run-stroke is-near", d: near.join("") }] },
  };
}
```

- [ ] **Step 4: Run the geometry tests to verify they pass**

Run: `npx vitest run tests/unit/components/landing/journey/run-geometry.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing markup test**

Create `tests/unit/components/landing/journey/window-run.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Features } from "@/components/landing/features";
import { WindowRun } from "@/components/landing/journey/window-run";
import { PhotoSplit } from "@/components/landing/photo-split";

// 06–07's frame (spec §3.A, §3.B; J6-6): the server draws it, the journey (run.ts) moves it.

function page() {
  return render(
    <WindowRun>
      <Features />
      <PhotoSplit />
    </WindowRun>,
  ).container;
}

describe("the window-seat run's frame", () => {
  it("wraps 06 and 07 on its track, with a window of three layers and a train, both hidden from assistive tech", () => {
    const run = page().querySelector("#run.run")!;
    const window_ = run.querySelector(".run-pin > .run-window")!;
    expect(window_).toHaveAttribute("aria-hidden", "true");
    expect([...window_.querySelectorAll("svg")].map((s) => s.getAttribute("class"))).toEqual(["run-far", "run-line", "run-near"]);
    expect(run.querySelector(".run-pin > .run-train")).toHaveAttribute("aria-hidden", "true");
    expect(run.querySelector(".run-train svg")).not.toBeNull();
    expect([...run.querySelectorAll(".run-pin > .run-track > section")].map((s) => s.id)).toEqual(["features", "use"]);
  });

  it("marks six stations in reading order: 06's heading, its three plates, 07's words and its figure", () => {
    const container = page();
    const stations = [...container.querySelectorAll<HTMLElement>("[data-station]")];
    expect(stations.map((s) => `${s.tagName.toLowerCase()}${s.classList.contains("run-intro") ? ".run-intro" : ""}`)).toEqual(["div.run-intro", "article", "article", "article", "div", "figure"]);
    expect(container.querySelector(".run-intro [data-flap]")).toHaveTextContent("06 · More than a check");
    expect(container.querySelector("#features > .run-cards")).not.toBeNull();
    // the links keep their reading order: the three plates' own
    expect([...container.querySelectorAll("#run a")].map((a) => a.textContent)).toEqual(["Open Watchlist →", "Open Pre-booking →", "Open Accuracy →"]);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/unit/components/landing/journey/window-run.test.tsx`
Expected: FAIL with `Failed to resolve import "@/components/landing/journey/window-run"`.

- [ ] **Step 7: The frame, the marks, the page**

Create `src/components/landing/journey/window-run.tsx`:

```tsx
import type { ReactNode } from "react";
import { TrainGlyph } from "./train-glyph";

/**
 * 06–07, the window-seat run's frame (spec §3.A; J6-6). The pin holds a window of three line layers (the far masts, the
 * line, the near posts) and the train, above a track carrying both sections; run.ts pins it and moves them. The
 * layers are empty here: their lines depend on the cards' measured widths, so run.ts draws them (geometry/run.ts).
 * Without the journey, with Motion off, or while it is not pinned, the window and the train are not shown
 * (journey.css) and the two sections read as they always did.
 */
export function WindowRun({ children }: { readonly children: ReactNode }) {
  return (
    <div id="run" className="run">
      <div className="run-pin">
        <div className="run-window" aria-hidden="true">
          <svg className="run-far" focusable="false" />
          <svg className="run-line" focusable="false" />
          <svg className="run-near" focusable="false" />
        </div>
        <span className="run-train" aria-hidden="true">
          <span>
            <TrainGlyph />
          </span>
        </span>
        <div className="run-track">{children}</div>
      </div>
    </div>
  );
}
```

In `src/components/landing/features.tsx`, replace the section's body:
```tsx
    <section id="features" aria-label={m.kicker} className="section-pad">
      <SectionKicker rule="mb-8">{m.kicker}</SectionKicker>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-[clamp(28px,3vw,48px)]">
```
with:
```tsx
    <section id="features" aria-label={m.kicker} className="section-pad">
      {/* data-station: a stop of the window-seat run (run.ts); inert, and the layout the same, without it */}
      <div className="run-intro" data-station="">
        <SectionKicker rule="mb-8">{m.kicker}</SectionKicker>
      </div>
      <div className="run-cards grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-[clamp(28px,3vw,48px)]">
```
and add `data-station=""` to the `<Plate key={key} as="article" padding="lg">`, making it `<Plate key={key} as="article" padding="lg" data-station="">`. The wrapper `div` has no padding or border, so the rule's bottom margin collapses through it exactly as before.

In `src/components/landing/photo-split.tsx`, add `data-station=""` to `<div className="min-w-0">` and to `<figure className="blueprint duotone relative m-0 overflow-visible">`.

In `src/app/(site)/page.tsx`, add `import { WindowRun } from "@/components/landing/journey/window-run";` beside the other journey imports, and replace:
```tsx
      <Features />
      <PhotoSplit />
```
with:
```tsx
      <WindowRun>
        <Features />
        <PhotoSplit />
      </WindowRun>
```

In `src/messages/en-IN/journey.ts`, add after `chapters: { … },`:
```ts
  run: {
    /** A kilometre post along the run's line (v3: "KM 530"). */
    km: (figure: string) => `KM ${figure}`,
  },
```

In `src/styles/journey.css`, add at the end:
```css
/* ---- 06–07 · the window-seat run: its window and train only while it runs (journey-island.css, run.ts) */
.run { position: relative; }
.run-window, .run-train { display: none; }
```

- [ ] **Step 8: Run the tests, and look at the page**

```bash
npx vitest run tests/unit/components/landing/journey/window-run.test.tsx tests/unit/components/landing
lsof -nP -iTCP:4210 -sTCP:LISTEN
npx playwright test tests/e2e/home.spec.ts tests/e2e/responsive.spec.ts tests/e2e/journey/collisions.spec.ts tests/e2e/journey/entrances.spec.ts tests/e2e/axe.spec.ts
```
Expected: PASS. No module moves the run yet, so 06 and 07 look exactly as they did. `entrances.spec.ts`'s kicker flip still finds `main [data-flap]`, and its row rise still finds `#features article`.

- [ ] **Step 9: The gate, then commit**

```bash
npm run check
git add src/components/landing/journey/geometry/run.ts src/components/landing/journey/window-run.tsx src/components/landing/features.tsx src/components/landing/photo-split.tsx "src/app/(site)/page.tsx" src/messages/en-IN/journey.ts src/styles/journey.css tests/unit/components/landing/journey/run-geometry.test.ts tests/unit/components/landing/journey/window-run.test.tsx
git commit -m "feat(journey): the window-seat run's frame around 06 and 07, and the geometry it is drawn from"
```

---

### Task 6: The window-seat run, moving

`run.ts` pins the run and scroll carries 06 and 07 sideways past the window along its line diagram, as v3's `run.js` does. Under J6-7 and J6-8 it:
- pins only while the reader is not below the run and every station fits, always inside `keepPlace`;
- draws the window's lines from the measured cards;
- lights the station at the window;
- leans the train into its pace;
- answers Tab and the board's links;
- on touch screens, gives each station a resting point.

Back into the run returns the reader where they left (J6-9): `place-memory.ts` reads a section riding the pinned run at its `data-run-at`, as `station-progress.ts` does, both as it samples and as it restores.

**Files:**
- Create: `src/components/landing/journey/run.ts`
- Modify: `src/components/landing/journey/station-progress.ts` (`data-run-at`), `place-memory.ts` (`topOf`: `data-run-at`), `start-journey.ts` (`MODULES`), `src/styles/journey-island.css`, `DESIGN.md`
- Modify: `tests/e2e/journey/journey-helpers.ts` (`scrollIntoRun`), `collisions.ts` (`LANDING_INSTRUMENTS`), `collisions.spec.ts`, `teardown.spec.ts`, `journey-axe.spec.ts`
- Create: `tests/e2e/journey/run.spec.ts`
- Test: `tests/unit/components/landing/journey/run.test.tsx`, `station-progress.test.tsx`, `place-memory.test.tsx`

**Interfaces:**
- Consumes:
  - Task 5's `geometry/run.ts` (every export) and markup;
  - Task 3's `readerPlace`, `keepPlace` and `mastheadBottom`, and its `place-memory.ts` (`ownScroll` beside the `topOf` added here);
  - `track` (`observers.ts`), `SMOOTH` (`motion-tokens.ts`), `STATIONS` and `kmFigure`, `messages.journey.run.km`.
- Produces:
  - `startRun(ctx: JourneyContext): Teardown` (a `JourneyModule`);
  - `#features[data-run-at]` and `#use[data-run-at]`, each the page y that section's top would have were it not riding the run (the scroll at which its first station stands at the window, plus the masthead). `station-progress.ts` and `place-memory.ts` read it;
  - `scrollIntoRun(page, p)` and `LANDING_INSTRUMENTS` for e2e (Task 9 uses both).

- [ ] **Step 1: Write the failing unit tests**

Create `tests/unit/components/landing/journey/run.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startRun } from "@/components/landing/journey/run";
import { testContext } from "./journey-context";

// run.ts on a laid-out stand-in (jsdom lays nothing out): three stations 300px wide, 500px apart, on a 1440×836 pin.
// Anime's scroll sync is the e2e's to prove (run.spec.ts); here it is a stand-in.
vi.mock("animejs", () => ({
  onScroll: () => ({ revert: () => undefined, refresh: () => undefined, reverted: false, target: null }),
  animate: () => ({ revert: () => undefined }),
}));

const MARKUP = `<header></header><div id="run" class="run"><div class="run-pin"><div class="run-window" aria-hidden="true"><svg class="run-far"></svg><svg class="run-line"></svg><svg class="run-near"></svg></div><span class="run-train" aria-hidden="true"><span></span></span><div class="run-track"><section id="features"><div class="run-intro" data-station=""></div><article data-station=""></article></section><section id="use"><div data-station=""></div></section></div></div></div>`;

function lay(runTop: number, pinHeight = 836): HTMLElement {
  const run = document.getElementById("run")!;
  run.getBoundingClientRect = () => ({ top: runTop, bottom: runTop + 900, left: 0, right: 1440, width: 1440, height: 900 }) as DOMRect;
  const pin = run.querySelector<HTMLElement>(".run-pin")!;
  Object.defineProperty(pin, "clientHeight", { configurable: true, value: pinHeight });
  Object.defineProperty(pin, "clientWidth", { configurable: true, value: 1440 });
  run.querySelector<HTMLElement>(".run-track")!.getBoundingClientRect = () => ({ left: 0 }) as DOMRect;
  run.querySelectorAll<HTMLElement>("[data-station]").forEach((s, i) => {
    Object.defineProperty(s, "offsetHeight", { configurable: true, value: 300 });
    s.getBoundingClientRect = () => ({ left: i * 500, right: i * 500 + 300, top: 0, bottom: 300 }) as DOMRect;
  });
  return run;
}

beforeEach(() => {
  document.body.innerHTML = MARKUP;
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("the window-seat run (J6-7, J6-8)", () => {
  it("leaves 06 and 07 as the server drew them with Motion off", () => {
    const run = lay(200);
    const stop = startRun(testContext({ motion: false }));
    expect(run.classList.contains("is-running")).toBe(false);
    stop();
  });

  it("pins when the reader is above it and every station fits: its height, the window's lines, where each section stands", () => {
    const run = lay(200);
    const stop = startRun(testContext());
    expect(run.classList.contains("is-running")).toBe(true);
    // centres 150, 650, 1150: the travel is 1000, and the pin plus the travel is the run's height
    expect(run.style.getPropertyValue("--run-h")).toBe("1836px");
    expect(run.querySelector(".run-line .run-stop")).not.toBeNull();
    expect(run.querySelectorAll(".run-line .run-km").length).toBeGreaterThan(0);
    // the page y each section's top would have: the run's start plus its first station's anchor (no masthead here)
    expect(document.getElementById("features")?.dataset.runAt).toBe("200");
    expect(document.getElementById("use")?.dataset.runAt).toBe("1200");
    expect(document.getElementById("use")?.getAttribute("tabindex")).toBe("-1");
    expect(document.querySelector("[data-station].is-here")).toBe(document.querySelector(".run-intro"));
    stop();
  });

  it("waits while the reader is below it, and pins once they are back above it (J3's rule)", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const run = lay(-500);
    const stop = startRun(testContext());
    expect(run.classList.contains("is-running")).toBe(false);
    lay(100);
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersToNextFrame();
    expect(run.classList.contains("is-running")).toBe(true);
    stop();
  });

  it("never pins a window too short for its stations", () => {
    const run = lay(200, 400); // 400 - 96 - 20 leaves 284px for 300px stations
    const stop = startRun(testContext());
    expect(run.classList.contains("is-running")).toBe(false);
    expect(run.style.getPropertyValue("--run-band")).toBe("");
    stop();
  });

  it("brings 07's first station to the window from a link to it, says so in the address, and focuses 07 in place", () => {
    lay(200);
    const push = vi.spyOn(window.history, "pushState");
    const stop = startRun(testContext());
    const link = document.createElement("a");
    link.href = "#use";
    document.body.append(link);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(push).toHaveBeenCalledWith(null, "", "#use");
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 1200 });
    expect(document.activeElement?.id).toBe("use");
    stop();
  });

  it("puts everything back on teardown", () => {
    const run = lay(200);
    const stop = startRun(testContext());
    stop();
    expect(run.classList.contains("is-running")).toBe(false);
    expect(run.getAttribute("style") ?? "").toBe("");
    expect(run.querySelector(".run-line")?.childNodes.length).toBe(0);
    expect(run.querySelector(".run-line")?.hasAttribute("viewBox")).toBe(false);
    expect(document.querySelectorAll("[data-run-at], [tabindex], .is-here, .is-passed, .run-snap")).toHaveLength(0);
  });
});
```

In `tests/unit/components/landing/journey/station-progress.test.tsx`, change the first import to `import { afterEach, describe, expect, it, vi } from "vitest";` and add at the end:

```tsx
describe("a section riding the window-seat run (J6-8)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it("is reached where run.ts says its first station stands at the window, not at its pinned box", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    document.body.innerHTML = STATIONS.map((s) => `<section id="${s.id}"></section>`).join("");
    const tops: Record<string, number> = Object.fromEntries(STATIONS.map((s, i) => [s.id, i * 1000]));
    tops.use = 15_000; // pinned in the run: its box is the pin's, far from where its words come to the window
    tops.faq = 20_000;
    tops.terminus = 21_000;
    for (const s of STATIONS) document.getElementById(s.id)!.getBoundingClientRect = () => ({ top: tops[s.id] ?? 0 }) as DOMRect;
    document.getElementById("use")!.dataset.runAt = "12345";
    let y = 0;
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => y);
    const heard: number[] = [];
    const hear = (e: Event) => heard.push((e as CustomEvent<StationDetail>).detail.index);
    window.addEventListener(STATION_EVENT, hear);
    const stop = startStationProgress();
    y = 12_200; // past use's run anchor, less the third-of-a-window bias; short of its pinned box
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersToNextFrame();
    expect(heard.at(-1)).toBe(STATIONS.findIndex((s) => s.id === "use"));
    stop();
    window.removeEventListener(STATION_EVENT, hear);
  });
});
```

In `tests/unit/components/landing/journey/place-memory.test.tsx`, add at the end of `describe("startPlaceMemory", …)`:

```ts
  // The window-seat run (J6-9): #features and #use ride it inside one pin, so their boxes stand together, far from
  // where their words come to the window. run.ts writes where each would stand (data-run-at), as station-progress reads.
  const ride = () => {
    document.body.insertAdjacentHTML("beforeend", `<section id="features" data-run-at="3600"></section><section id="use" data-run-at="4600"></section>`);
    for (const id of ["features", "use"]) document.getElementById(id)!.getBoundingClientRect = () => ({ top: 3600 - scrollY }) as DOMRect;
  };

  it("reads a section riding the run where run.ts says it stands, not at the pinned box it shares", () => {
    ride();
    const memory = startPlaceMemory();
    scrollY = 4600 - 40; // 07's top 40px down the window, 24px above the masthead's foot
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersToNextFrame();
    memory.stop();
    expect(parsePlace(window.sessionStorage.getItem(PLACE_KEY))).toEqual({ entry: "k1", id: "use", offset: -24 });
  });

  it("restores a place in the run where run.ts says it stands", () => {
    ride();
    store({ entry: "k1", id: "use", offset: -24 });
    const memory = startPlaceMemory();
    memory.restore();
    expect(scrolls).toEqual([4600 - 64 + 24]);
    memory.stop();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/components/landing/journey/run.test.tsx tests/unit/components/landing/journey/station-progress.test.tsx tests/unit/components/landing/journey/place-memory.test.tsx`
Expected: FAIL.
- `run.test.tsx` fails with `Failed to resolve import "@/components/landing/journey/run"`.
- The station test fails with `expected 7 to be 8` (it reads `#use`'s pinned box).
- The first run test in place-memory stores `id: "features"`, offset −1024 (the pinned box both share), where `"use"`, −24 was expected; the second fails with `expected [ 3560 ] to deeply equal [ 4560 ]`.

- [ ] **Step 3: Write `run.ts`**

Create `src/components/landing/journey/run.ts`:

```ts
import { animate, onScroll, type JSAnimation, type ScrollObserver } from "animejs";
import { messages } from "@/messages";
import { readerPlace } from "./drawing-mode";
import { anchorOf, band, fitsRun, hereAt, layers, leanStep, offsets, runLayout, trainAt, type RunLayout } from "./geometry/run";
import { LAYOUT_EVENT, emit } from "./journey-events";
import { keepPlace, mastheadBottom } from "./keep-place";
import { SMOOTH } from "./motion-tokens";
import { track } from "./observers";
import type { JourneyContext, Teardown } from "./start-journey";
import { STATIONS, kmFigure } from "./stations";

// 06–07, the window-seat run (spec §3.A; prototype v3's run.js). The run pins (#run.is-running) and the scroll carries
// both sections sideways past a window along a line diagram: the rails, the kilometre posts and a platform per station
// at the train's pace, the far masts slower and the near posts faster, while the train holds its place at the window and
// the station at the window lights. The cards keep their words and links in reading order: Tab, and a link to 06 or 07
// (the departure board's), bring a station to the window, and on a touch screen each station is a resting point.
// Pinned only while the reader is not below the run (pinning grows it by its travel, which must land below them: J3's
// rule) and every station fits the window. Every pin, unpin and change of its height happens inside keepPlace (J5-3,
// J6-7). Motion off, a window too short, or a reader below it: the two sections read as they always did.

const RUNNING = "is-running";
const NS = "http://www.w3.org/2000/svg";
const PHONE = "(max-width: 47.99rem)";
const COARSE = "(pointer: coarse)";
const PLACE_EVENTS = ["scroll", "resize", LAYOUT_EVENT] as const;
const kmOf = (id: string): number => STATIONS.find((s) => s.id === id)?.km ?? 0;
const KM = { from: kmOf("features"), to: kmOf("use") };

function stroke(cls: string, d: string): SVGPathElement {
  const path = document.createElementNS(NS, "path");
  path.setAttribute("class", cls);
  path.setAttribute("d", d);
  return path;
}

export function startRun({ motion }: JourneyContext): Teardown {
  const run = document.getElementById("run");
  const pin = run?.querySelector<HTMLElement>(":scope > .run-pin");
  const trackEl = pin?.querySelector<HTMLElement>(":scope > .run-track");
  const far = pin?.querySelector<SVGSVGElement>(".run-far");
  const line = pin?.querySelector<SVGSVGElement>(".run-line");
  const near = pin?.querySelector<SVGSVGElement>(".run-near");
  const train = pin?.querySelector<HTMLElement>(":scope > .run-train");
  if (!motion || !run || !pin || !trackEl || !far || !line || !near || !train) return () => {};
  const glyph = train.querySelector<HTMLElement>(":scope > span");
  const stations = [...trackEl.querySelectorAll<HTMLElement>("[data-station]")];
  const sections = [...trackEl.querySelectorAll<HTMLElement>(":scope > section[id]")];
  const svgs = [far, line, near] as const;
  const state = { p: 0 };
  const marks: HTMLElement[] = [];
  let at: RunLayout | null = null;
  let driver: { readonly observer: ScrollObserver; readonly drive: JSAnimation } | null = null;
  let current = -1;
  let lastP = 0;
  let lean = 0;
  let waiting = false;
  let placeFrame = 0;
  let layoutFrame = 0;

  /** The scroll at which station i stands at the window: the run's start (its top under the masthead) plus its anchor. */
  const stationY = (i: number, layout: RunLayout): number =>
    Math.round(run.getBoundingClientRect().top + window.scrollY - mastheadBottom() + anchorOf(layout.centers[i] ?? layout.first, layout.first, layout.travel));

  /** The stations as the running layout lays them out (#run.is-running must be on), or null when they cannot fit. */
  const measure = (): RunLayout | null => {
    const h = pin.clientHeight;
    const w = pin.clientWidth;
    run.style.setProperty("--run-band", `${band(h)}px`);
    if (!fitsRun(stations.map((s) => s.offsetHeight), h, w)) return null;
    const origin = trackEl.getBoundingClientRect().left;
    const boxes = stations.map((s) => {
      const r = s.getBoundingClientRect();
      return { x0: r.left - origin, x1: r.right - origin };
    });
    return runLayout(boxes, { w, h, trainX: trainAt(w, window.matchMedia(PHONE).matches) });
  };

  const draw = (layout: RunLayout) => {
    const drawn = layers(layout, KM);
    const pairs = [
      [far, drawn.far],
      [line, drawn.line],
      [near, drawn.near],
    ] as const;
    for (const [svg, layer] of pairs) {
      svg.setAttribute("viewBox", `0 0 ${layer.span} ${layout.h}`);
      svg.style.width = `${layer.span}px`;
      svg.replaceChildren(...layer.strokes.map((s) => stroke(s.cls, s.d)));
    }
    for (const post of drawn.line.posts) {
      const label = document.createElementNS(NS, "text");
      label.setAttribute("class", "run-km");
      label.setAttribute("x", String(post.x));
      label.setAttribute("y", String(post.y));
      label.textContent = messages.journey.run.km(kmFigure(post.km));
      line.append(label);
    }
    drawn.line.stops.forEach((stop, i) => {
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", "run-stop");
      g.dataset.i = String(i);
      g.append(stroke("run-stroke is-platform", stop.platform), stroke("run-stroke is-tick", stop.tick));
      line.append(g);
    });
  };

  /** Everything the pinned run writes but its motion: its height, the train's place, the window's lines, where each
   * section stands, and on touch screens a resting point per station. */
  const place = (layout: RunLayout) => {
    const head = mastheadBottom();
    run.style.setProperty("--run-h", `${Math.round(layout.h + layout.travel)}px`);
    train.style.left = `${layout.trainX}px`;
    draw(layout);
    current = -1; // the stops were drawn afresh: light them again
    for (const section of sections) {
      const i = stations.findIndex((s) => section.contains(s));
      if (i < 0) continue;
      // the page y this section's top would have were it not riding the run (station-progress.ts reads it)
      section.dataset.runAt = String(stationY(i, layout) + head);
      section.tabIndex = -1; // a link to it focuses it in place (onClick)
    }
    for (const mark of marks.splice(0)) mark.remove();
    if (!window.matchMedia(COARSE).matches) return;
    for (const c of layout.centers) {
      const mark = document.createElement("i");
      mark.className = "run-snap";
      mark.setAttribute("aria-hidden", "true");
      mark.style.top = `${anchorOf(c, layout.first, layout.travel) - head}px`;
      run.append(mark);
      marks.push(mark);
    }
  };

  const clear = () => {
    run.style.removeProperty("--run-h");
    run.style.removeProperty("--run-band");
    train.style.removeProperty("left");
    glyph?.style.removeProperty("transform");
    trackEl.style.removeProperty("transform");
    for (const svg of svgs) {
      svg.replaceChildren();
      svg.removeAttribute("viewBox");
      svg.style.removeProperty("width");
      svg.style.removeProperty("transform");
    }
    for (const s of stations) s.classList.remove("is-here", "is-passed");
    for (const section of sections) {
      delete section.dataset.runAt;
      section.removeAttribute("tabindex");
    }
    for (const mark of marks.splice(0)) mark.remove();
    current = -1;
    lean = 0;
    lastP = 0;
  };

  const paint = () => {
    const layout = at;
    if (!layout) return;
    const o = offsets(state.p, layout);
    trackEl.style.transform = `translate3d(${o.track.toFixed(1)}px,0,0)`;
    line.style.transform = `translate3d(${o.track.toFixed(1)}px,0,0)`;
    far.style.transform = `translate3d(${o.far.toFixed(1)}px,0,0)`;
    near.style.transform = `translate3d(${o.near.toFixed(1)}px,0,0)`;
    const here = hereAt(layout.first + state.p * layout.travel, layout.centers, layout.halves);
    if (here !== current) {
      current = here;
      stations.forEach((s, i) => {
        s.classList.toggle("is-here", i === here);
        s.classList.toggle("is-passed", i < here);
      });
      for (const stop of line.querySelectorAll<SVGGElement>(".run-stop")) stop.classList.toggle("is-lit", Number(stop.dataset.i) <= here);
    }
    lean = leanStep(lean, state.p - lastP, layout.travel);
    lastP = state.p;
    if (glyph) glyph.style.transform = Math.abs(lean) < 0.05 ? "" : `skewX(${lean.toFixed(2)}deg)`;
  };

  const startDriver = () => {
    const observer = track(onScroll({ target: run, enter: () => `top+=${mastheadBottom()} top`, leave: "bottom bottom", sync: SMOOTH }));
    const drive = animate(state, { p: [0, 1], ease: "linear", duration: 1000, onUpdate: paint, autoplay: observer });
    driver = { observer, drive };
  };
  const stopDriver = () => {
    driver?.drive.revert();
    driver?.observer.revert();
    driver = null;
  };

  /** Lays the run out and measures it, inside keepPlace; a run that cannot fit is put back. True when it fits. */
  const settle = (): boolean => {
    keepPlace(run, () => {
      run.classList.add(RUNNING);
      at = measure();
      if (at) place(at);
      else {
        run.classList.remove(RUNNING);
        clear();
      }
    });
    return at !== null;
  };
  const unpin = () => {
    stopDriver();
    keepPlace(run, () => {
      run.classList.remove(RUNNING);
      clear();
    });
    at = null;
  };

  const above = () => readerPlace(run.getBoundingClientRect(), window.innerHeight) === "above";
  const recheck = () => {
    if (placeFrame) return;
    placeFrame = requestAnimationFrame(() => {
      placeFrame = 0;
      if (above()) decide();
    });
  };
  const wait = (on: boolean) => {
    if (on === waiting) return;
    waiting = on;
    for (const type of PLACE_EVENTS) {
      if (on) window.addEventListener(type, recheck, { passive: true });
      else window.removeEventListener(type, recheck);
    }
  };
  /** Pinned only while the reader is not below the run: its growth must land below them (J3's rule; J6-7). */
  function decide(): void {
    if (!above()) {
      wait(true);
      return;
    }
    wait(false);
    if (!settle()) return;
    startDriver();
    paint();
    emit(LAYOUT_EVENT);
  }

  /** Anything that moves the page re-measures the pinned run, inside keepPlace; a run that no longer fits unpins. A
   * run not pinned (and no reader below it) tries again: a window that grew may fit now. */
  const relayout = () => {
    layoutFrame = 0;
    if (!at) {
      if (!waiting) decide();
      return;
    }
    const before = run.offsetHeight;
    if (!settle()) {
      stopDriver();
      emit(LAYOUT_EVENT);
      return;
    }
    driver?.observer.refresh();
    paint();
    if (run.offsetHeight !== before) emit(LAYOUT_EVENT);
  };
  const soon = () => {
    if (!layoutFrame) layoutFrame = requestAnimationFrame(relayout);
  };

  // Tab onto a link in a card: bring its station to the window (the page's own scroll-behavior glides it).
  const onFocus = (event: FocusEvent) => {
    const layout = at;
    const station = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-station]") : null;
    const i = station ? stations.indexOf(station) : -1;
    if (!layout || i < 0) return;
    window.scrollTo({ top: stationY(i, layout) });
  };
  // A link to 06 or 07 (the departure board's): its first station to the window, the address, and focus in place (J6-8).
  const onClick = (event: MouseEvent) => {
    const layout = at;
    if (!layout || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="#"]') : null;
    const section = link ? sections.find((s) => link.hash === `#${s.id}`) : undefined;
    const i = section ? stations.findIndex((s) => section.contains(s)) : -1;
    if (!section || i < 0) return;
    event.preventDefault();
    window.history.pushState(null, "", `#${section.id}`);
    window.scrollTo({ top: stationY(i, layout) });
    section.focus({ preventScroll: true });
  };

  decide();
  window.addEventListener(LAYOUT_EVENT, soon);
  window.addEventListener("resize", soon);
  trackEl.addEventListener("focusin", onFocus);
  document.addEventListener("click", onClick);
  return () => {
    cancelAnimationFrame(placeFrame);
    cancelAnimationFrame(layoutFrame);
    wait(false);
    window.removeEventListener(LAYOUT_EVENT, soon);
    window.removeEventListener("resize", soon);
    trackEl.removeEventListener("focusin", onFocus);
    document.removeEventListener("click", onClick);
    if (!at) return;
    unpin();
    emit(LAYOUT_EVENT);
  };
}
```

In `src/components/landing/journey/station-progress.ts`, replace `measure`'s `anchors` with:
```ts
    const anchors = STATIONS.map((s) => {
      const el = document.getElementById(s.id);
      if (!el) return 0;
      // A section riding the window-seat run (run.ts) stands where its first station reaches the window, not at the
      // pinned box it shares with the other (J6-8).
      const riding = Number(el.dataset.runAt);
      return el.dataset.runAt !== undefined && Number.isFinite(riding) ? riding : el.getBoundingClientRect().top + window.scrollY;
    });
```
In `src/components/landing/journey/start-journey.ts`, add `import { startRun } from "./run";` and put `startRun` after `startRoute` in `MODULES`:
```ts
export const MODULES: readonly JourneyModule[] = [startArrivals, startBoard, startStationProgress, startHero, startChapters, startBerths, startClock, startRoute, startRun, startCursor, startSound, startDrawing, startStill];
```
In `src/components/landing/journey/place-memory.ts`, after `mastheadFoot`, add:
```ts
/** A section's top in the window, where the reader reads it: while it rides the window-seat run, where run.ts says it
 * stands (data-run-at, the page y it would have were it not riding, as station-progress.ts reads it; J6-9), not the
 * pinned box it shares with the other; otherwise its own box. */
function topOf(el: HTMLElement): number {
  const riding = Number(el.dataset.runAt);
  return el.dataset.runAt !== undefined && Number.isFinite(riding) ? riding - window.scrollY : el.getBoundingClientRect().top;
}
```
In `placeNow`, replace `return el?.isConnected ? [{ id, top: el.getBoundingClientRect().top }] : [];` with `return el?.isConnected ? [{ id, top: topOf(el) }] : [];`. In `restore`, replace `const by = el.getBoundingClientRect().top - mastheadFoot() - place.offset;` with `const by = topOf(el) - mastheadFoot() - place.offset;`. A reader who left at 07 is stored on `#use`. On their return they land at 07: at its first station, by `data-run-at`, if the run has pinned by then; at `#use`'s own top if it waits below them.

`start-journey-paced.test.tsx` counts the modules: if it asserts twelve, make it thirteen and say why in the test's comment. Check it with `grep -n "12\|twelve" tests/unit/components/landing/journey/start-journey-paced.test.tsx`. The e2e helper's comment in `waitForJourney` (Task 2) names drawing.ts "the eleventh of twelve": make it "the twelfth of thirteen".

- [ ] **Step 4: The run's CSS**

In `src/styles/journey-island.css`, add before `/* ---- The frame meter`:

```css
/* ---- 06–07 · the window-seat run (spec §3.A; J6). run.ts pins it (#run.is-running) only while Motion is on, the reader
   is not below it and every station fits the window, and writes --run-h (the pin plus the travel) and --run-band (the
   line diagram's height). Only run.ts writes .is-running, always inside keepPlace (J5-3, J6-7), so these rules are not
   gated on data-motion: Motion off unpins it there, with the reader kept. Otherwise both sections keep their layout. */
html[data-journey="on"] #run.is-running { height: var(--run-h); }
/* clip, not hidden: a clipped box is not a scroll container, so focusing a card cannot scroll it sideways */
html[data-journey="on"] #run.is-running .run-pin { position: sticky; top: var(--header-height); z-index: 2; height: calc(100svh - var(--header-height)); overflow: clip; }
html[data-journey="on"] #run.is-running :is(.run-window, .run-train) { display: block; }
html[data-journey="on"] #run.is-running .run-window { position: absolute; inset: 0; pointer-events: none; }
html[data-journey="on"] #run.is-running .run-window svg { position: absolute; left: 0; top: 0; height: 100%; overflow: visible; will-change: transform; }
html[data-journey="on"] #run.is-running .run-far { z-index: 0; }
html[data-journey="on"] #run.is-running .run-line { z-index: 1; }
html[data-journey="on"] #run.is-running .run-near { z-index: 4; }
html[data-journey="on"] #run.is-running .run-train { position: absolute; bottom: 44px; z-index: 3; width: 74px; height: 28px; transform: translateX(-50%); color: var(--accent); pointer-events: none; }
html[data-journey="on"] #run.is-running .run-train > span { display: block; width: 100%; height: 100%; transform-origin: 50% 100%; }
html[data-journey="on"] #run.is-running .run-train svg { display: block; width: 100%; height: 100%; }
html[data-journey="on"] #run.is-running .run-track { position: relative; z-index: 2; display: flex; align-items: flex-end; gap: clamp(56px, 9vw, 150px); width: max-content; height: calc(100% - var(--run-band, 124px)); padding: 0; will-change: transform; }
html[data-journey="on"] #run.is-running .run-track > section { display: flex; align-items: flex-end; gap: clamp(48px, 7vw, 120px); padding: 0; margin: 0; }
html[data-journey="on"] #run.is-running .run-cards { display: contents; }
html[data-journey="on"] #run.is-running [data-station] { flex: none; background: var(--surface-0); }
html[data-journey="on"] #run.is-running .run-intro { width: min(19rem, 80vw); padding-bottom: 8px; }
html[data-journey="on"] #run.is-running .run-intro > span { font-size: clamp(1.625rem, 2.6vw, 2.25rem); line-height: 1.12; letter-spacing: 0.04em; }
html[data-journey="on"] #run.is-running .run-intro > hr { margin: 14px 0 0; }
html[data-journey="on"] #run.is-running .run-cards > [data-station] { width: min(22rem, 80vw); }
html[data-journey="on"] #run.is-running #use > div[data-station] { width: min(34rem, 84vw); }
html[data-journey="on"] #run.is-running #use > figure[data-station] { width: min(38rem, 84vw); }
html[data-journey="on"] #run.is-running .blueprint[data-station] { transition: box-shadow 240ms var(--ease-out), border-color 240ms var(--ease-out); }
html[data-journey="on"] #run.is-running .blueprint[data-station].is-here { border-color: var(--line-strong); box-shadow: inset 0 2px 0 var(--accent); }
/* a link to 06 or 07 focuses the section itself, in place, so the next Tab starts inside it; no ring on a section */
html[data-journey="on"] #run.is-running :is(#features, #use):focus { outline: none; }
html[data-journey="on"] .run-stroke { fill: none; stroke: var(--line-strong); stroke-width: 1; vector-effect: non-scaling-stroke; }
html[data-journey="on"] .run-stroke:is(.is-faint, .is-far) { stroke: var(--line); }
html[data-journey="on"] .run-stroke.is-mast { opacity: 0.6; }
html[data-journey="on"] .run-stroke.is-near { stroke: var(--ink-3); opacity: 0.5; }
html[data-journey="on"] .run-stop.is-lit :is(.is-tick, .is-platform) { stroke: var(--accent); }
html[data-journey="on"] .run-km { fill: var(--ink-3); font-family: var(--font-display); font-weight: 600; font-size: 0.625rem; /* drawing units, as v3's posts: no token matches */ letter-spacing: 0.08em; }
/* short windows: 07's words run wider (and so shorter) to stand in the window */
@media (max-height: 760px) and (min-width: 48rem) {
  html[data-journey="on"] #run.is-running #use > div[data-station] { width: min(46rem, 60vw); }
  html[data-journey="on"] #run.is-running #use > div[data-station] p { max-width: 64ch; }
  html[data-journey="on"] #run.is-running #use > div[data-station] h2 { font-size: 2.5rem; line-height: 2.75rem; }
  html[data-journey="on"] #run.is-running #use > figure[data-station] { width: min(38rem, 52vw, calc((100svh - var(--header-height) - var(--run-band, 124px) - 28px) * 1.45)); }
}
/* touch screens: each station is a resting point (run.ts places these marks) */
html[data-journey="on"] .run-snap { position: absolute; left: 0; width: 1px; height: 1px; pointer-events: none; scroll-snap-align: start; }
html[data-journey="on"]:has(#run.is-running .run-snap) { scroll-snap-type: y proximity; }
```

- [ ] **Step 5: Run the unit tests to verify they pass**

Run: `npx vitest run tests/unit/components/landing/journey`
Expected: PASS.

- [ ] **Step 6: Write the run's e2e**

In `tests/e2e/journey/journey-helpers.ts`, add:
```ts
/** Scrolls the pinned run to progress p (0 as the pin takes hold, 1 at its end), then lets the page draw. Its place is
 * measured, never assumed: everything above it (the live drawing's 520vh pin, 02's 330vh) moves it. */
export async function scrollIntoRun(page: Page, p: number): Promise<void> {
  await page.evaluate((at) => {
    const run = document.getElementById("run");
    const pin = run?.querySelector<HTMLElement>(".run-pin");
    if (!run || !pin) throw new Error("#run is missing");
    const head = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
    const start = run.getBoundingClientRect().top + window.scrollY - head;
    window.scrollTo({ top: start + (run.offsetHeight - pin.offsetHeight) * at, behavior: "instant" });
  }, p);
  await frames(page, 2);
}
```
In `tests/e2e/journey/collisions.ts`, add at the end:
```ts
/** The landing's railway instruments, held as panels: the hero dial is drawn under the plate on purpose (v3's gate
 * skipped it as well), and its left side fades before the words. Every other instrument must never cover text
 * outside itself, nor another instrument. Shared by the PR's specs and the nightly's. */
export const LANDING_INSTRUMENTS = { panels: [".board", ".berth-plan", ".station-clock", ".route-map", ".chapter-card", ".title-block"], skip: [".hero-dial"] } as const;
```
In `tests/e2e/journey/collisions.spec.ts`, delete the local `INSTRUMENTS` constant and its comment, import `LANDING_INSTRUMENTS` from `./collisions`, and replace each use of `INSTRUMENTS` with `LANDING_INSTRUMENTS`.

Create `tests/e2e/journey/run.spec.ts`:

```ts
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { LANDING_INSTRUMENTS, collisionsInView } from "./collisions";
import { drawStill, frames, motionOff, noAnchoring, scrollIntoRun, scrollToId, waitForJourney } from "./journey-helpers";

// 06–07, the window-seat run (spec §3.A, §3.G; J6-7, J6-8). The drawing above is held to the still (drawStill): these
// specs are about the run, and the live drawing would only make the software GPU slower.

/** How far station i's centre stands from the train's: 0 when it is at the window. */
function offTrain(page: Page, i: number): Promise<number> {
  return page.evaluate((k) => {
    const station = document.querySelectorAll("#run [data-station]")[k];
    const train = document.querySelector("#run .run-train");
    if (!station || !train) throw new Error("no such station, or no train");
    const s = station.getBoundingClientRect();
    const t = train.getBoundingClientRect();
    return Math.abs(Math.round(s.left + s.width / 2 - (t.left + t.width / 2)));
  }, i);
}
const here = (page: Page) => page.locator("#run [data-station]").evaluateAll((els) => els.findIndex((el) => el.classList.contains("is-here")));
const stationOf = (page: Page, selector: string) => page.locator("#run [data-station]").evaluateAll((els, sel) => els.findIndex((el) => el.matches(sel) || el.querySelector(sel) !== null || el.closest(sel) !== null), selector);
const running = (page: Page) => expect(page.locator("#run")).toHaveClass(/is-running/);
/** How far 07's top stands from the masthead's foot, read as place-memory reads it (J6-9): where run.ts says it stands
 * while the run is pinned (data-run-at), its own box otherwise. 0 when the reader is at 07. */
const from07 = (page: Page) =>
  page.evaluate(() => {
    const use = document.getElementById("use");
    if (!use) throw new Error("#use is missing");
    const foot = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
    const top = use.dataset.runAt === undefined ? use.getBoundingClientRect().top : Number(use.dataset.runAt) - window.scrollY;
    return Math.abs(Math.round(top - foot));
  });

test.describe("the window-seat run (spec §3.A)", () => {
  test.beforeEach(async ({ page }) => {
    await drawStill(page);
  });

  test("pins 06–07 and carries each station to the window in turn, lit, its words never fading", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await running(page);
    const count = await page.locator("#run [data-station]").count();
    expect(count).toBe(6);
    await scrollIntoRun(page, 0);
    await expect.poll(() => here(page)).toBe(0);
    await expect.poll(() => offTrain(page, 0)).toBeLessThanOrEqual(3);
    await scrollIntoRun(page, 1);
    await expect.poll(() => here(page)).toBe(count - 1);
    await expect.poll(() => offTrain(page, count - 1)).toBeLessThanOrEqual(3);
    await expect(page.locator("#run [data-station].is-passed")).toHaveCount(count - 1);
    await expect(page.locator("#run .run-stop.is-lit")).toHaveCount(count);
    expect(await page.locator("#run [data-station]").evaluateAll((els) => els.every((el) => getComputedStyle(el).opacity === "1"))).toBe(true);
  });

  test("the line counts kilometre posts on, and the train holds its place at the window", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await running(page);
    const posts = await page.locator("#run .run-km").allTextContents();
    expect(posts.length).toBeGreaterThan(2);
    expect(posts.every((p) => /^KM \d{3}$/.test(p))).toBe(true);
    const km = posts.map((p) => Number(p.slice(3)));
    expect(km.every((k, i) => i === 0 || k > km[i - 1]!)).toBe(true);
    const trainLeft = () => page.locator("#run .run-train").evaluate((el) => el.getBoundingClientRect().left);
    await scrollIntoRun(page, 0);
    const at = await trainLeft();
    await scrollIntoRun(page, 0.5);
    expect(await trainLeft()).toBe(at);
  });

  test("a link to 07 on the departure board brings its words to the window, and the address and the board say so", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await running(page);
    await page.locator(".board").getByRole("link", { name: "Where it gets used" }).click();
    await expect(page).toHaveURL(/#use$/);
    const first07 = await stationOf(page, "#use *");
    await expect.poll(() => offTrain(page, first07)).toBeLessThanOrEqual(3);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("use");
    // 07's row: the board's rows follow the stations after DEP, one each (departure-board.tsx)
    await expect(page.locator('.board tr[data-stop="8"] td.board-status')).toHaveText(/At\s*platform/i);
  });

  test("Back from 07, inside the run, returns the reader to 07, not 06 (J6-9)", async ({ page, isMobile }) => {
    test.skip(isMobile, "one project is enough");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForJourney(page);
    await running(page);
    // 07's first station to the window, at the place run.ts gives it (data-run-at, less the masthead)
    await page.evaluate(() => {
      const use = document.getElementById("use");
      const head = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      window.scrollTo({ top: Number(use?.dataset.runAt) - head, behavior: "instant" });
    });
    const first07 = await stationOf(page, "#use *");
    await expect.poll(() => offTrain(page, first07)).toBeLessThanOrEqual(3);
    await frames(page); // the scroll has been sampled
    await page.getByLabel("Primary").getByRole("link", { name: "Watchlist" }).click();
    await expect(page).toHaveURL(/\/watchlist/);
    await page.goBack();
    await waitForJourney(page);
    await expect.poll(() => from07(page)).toBeLessThanOrEqual(4); // the restore has landed, on 07
  });

  test("Tab brings each card to the window, never under the masthead (spec §3.G; WCAG 2.4.11)", async ({ page, isMobile }) => {
    test.skip(isMobile, "the keyboard: one project is enough");
    await page.goto("/");
    await waitForJourney(page);
    await running(page);
    await page.getByRole("link", { name: "Open Watchlist →" }).focus();
    for (const [n, name] of ["Open Watchlist →", "Open Pre-booking →", "Open Accuracy →"].entries()) {
      if (n > 0) await page.keyboard.press("Tab");
      const link = page.getByRole("link", { name });
      await expect(link).toBeFocused();
      const i = await link.evaluate((a) => [...document.querySelectorAll("#run [data-station]")].findIndex((s) => s.contains(a)));
      await expect.poll(() => offTrain(page, i)).toBeLessThanOrEqual(3);
      const seen = await link.evaluate((a) => {
        const r = a.getBoundingClientRect();
        const foot = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
        return r.top >= foot && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
      });
      expect(seen, `${name} is wholly in view, below the masthead`).toBe(true);
    }
  });

  test("on a touch screen each station is a resting point", async ({ page, isMobile }) => {
    test.skip(!isMobile, "touch screens");
    await page.goto("/");
    await waitForJourney(page);
    await running(page);
    await expect(page.locator("#run .run-snap")).toHaveCount(6);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollSnapType)).toBe("y proximity");
  });

  test("Motion off: 06 and 07 read as they always did", async ({ page }) => {
    await motionOff(page);
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#run")).not.toHaveClass(/is-running/);
    await expect(page.locator("#run .run-window")).toBeHidden();
    await expect(page.locator("#run .run-train")).toBeHidden();
    const [features, use] = await page.evaluate(() => ["features", "use"].map((id) => document.getElementById(id)?.getBoundingClientRect().toJSON() as DOMRect));
    expect(use!.top).toBeGreaterThanOrEqual(features!.bottom - 1);
  });

  test("a window too short for its stations: the sections as ever", async ({ page, isMobile }) => {
    await page.setViewportSize(isMobile ? { width: 844, height: 390 } : { width: 1440, height: 360 });
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#run")).not.toHaveClass(/is-running/);
    await expect(page.locator("#run .run-window")).toBeHidden();
  });

  test("a reader below the run leaves it unpinned until they come back above it (J3's rule)", async ({ page, isMobile }) => {
    test.skip(isMobile, "one project is enough");
    await page.goto("/#faq");
    await waitForJourney(page);
    await expect(page.locator("#run")).not.toHaveClass(/is-running/);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await running(page);
  });

  for (const anchoring of ["on", "off"] as const) {
    test(`a reader below the pinned run stays put when Motion goes off (scroll anchoring ${anchoring})`, async ({ page, isMobile }) => {
      test.skip(isMobile, "one project is enough");
      await page.setViewportSize({ width: 1440, height: 900 });
      if (anchoring === "off") await noAnchoring(page);
      await page.goto("/");
      await waitForJourney(page);
      await running(page);
      await scrollToId(page, "faq", 120);
      await frames(page, 3); // the scroll has been heard
      const faqTop = () => page.locator("#faq").evaluate((el) => el.getBoundingClientRect().top);
      const before = await faqTop();
      // through the DOM: Playwright's click would scroll the footer's switch into view first
      await page.getByRole("contentinfo").getByRole("switch", { name: "Motion" }).evaluate((el) => (el as HTMLElement).click());
      await expect(page.locator("#run")).not.toHaveClass(/is-running/);
      await frames(page, 6); // the unpin, 02's collapse and the still's settle
      expect(Math.abs((await faqTop()) - before)).toBeLessThanOrEqual(4);
    });
  }
});

test.describe("nothing collides while the run carries 06–07 past the window (spec §5)", () => {
  for (const size of [
    { name: "1440×900", viewport: { width: 1440, height: 900 }, phone: false },
    { name: "390×844", viewport: { width: 390, height: 844 }, phone: true },
  ] as const) {
    test(`at ${size.name}, a tenth of the run at a time`, async ({ page, isMobile }) => {
      test.skip(isMobile !== size.phone, "each size runs once, in the project that emulates its device");
      await drawStill(page);
      await page.setViewportSize(size.viewport);
      await page.goto("/");
      await waitForJourney(page);
      await running(page);
      const found: string[] = [];
      for (let k = 0; k <= 10; k += 1) {
        await scrollIntoRun(page, k / 10);
        await frames(page, 2);
        found.push(...(await collisionsInView(page, LANDING_INSTRUMENTS)));
      }
      expect(found).toEqual([]);
    });
  }
});
```

In `tests/e2e/journey/teardown.spec.ts`, extend `STYLE` so a teardown that left the run's writes behind shows:
```ts
const STYLE = ["transform", "opacity", "left", "top", "height", "width", "--run-h", "--run-band", "stroke-width", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "clip-path"] as const;
```

In `tests/e2e/journey/journey-axe.spec.ts`, add `drawStill` and `scrollIntoRun` to the helper import, and add inside the `describe` (both projects run it: the mobile project is spec §5's "phone run"):
```ts
  for (const [name, night] of [
    ["the run, midway", false],
    ["Night, at the run, midway", true],
  ] as const) {
    test(`clean at ${name}`, async ({ page }) => {
      if (night) await page.addInitScript(() => window.localStorage.setItem("tt.theme", "dark"));
      await drawStill(page);
      await page.goto("/");
      await waitForJourney(page);
      await expect(page.locator("#run")).toHaveClass(/is-running/);
      await scrollIntoRun(page, 0.5);
      await expect(page.locator("#run [data-station].is-here")).toHaveCount(1);
      await expectAxeClean(page);
    });
  }
```

- [ ] **Step 7: Run the run's e2e, and every spec the run could disturb**

```bash
lsof -nP -iTCP:4210 -sTCP:LISTEN
npx playwright test tests/e2e/journey tests/e2e/home.spec.ts tests/e2e/responsive.spec.ts tests/e2e/tap-targets.spec.ts tests/e2e/axe.spec.ts tests/e2e/smoothness.spec.ts
```
Expected: PASS.
- Before Step 3, `run.spec.ts` failed on `toHaveClass(/is-running/)`.
- A spec outside `run.spec.ts` that assumed 06–07's static layout must be changed to measure. The candidates are `board.spec.ts`'s links, `entrances.spec.ts`'s `#features article`, and `tap-targets.spec.ts`'s card links, which are clipped off-window while the run is pinned. For tap targets, measure each link where it stands at the window (bring it there by `.focus()`).
- Report every such change with its reason.

- [ ] **Step 8: Write the run into DESIGN.md**

In `DESIGN.md`'s landing journey list, after the "Nothing moves under the reader" bullet (Task 3), add:
```markdown
- **The window-seat run (06–07)** pins only while Motion is on, the reader is not below it, and every station fits
  the window. The scroll then carries the two sections sideways past a window along a line diagram, the train holding
  the window. Tab, and the board's links to 06 and 07, bring a station to the window. On touch screens each station is
  a resting point (proximity snapping). Otherwise the sections read as they always did.
```

- [ ] **Step 9: The gate, then commit**

```bash
npm run check
git add src/components/landing/journey/run.ts src/components/landing/journey/station-progress.ts src/components/landing/journey/place-memory.ts src/components/landing/journey/start-journey.ts src/styles/journey-island.css DESIGN.md tests/unit/components/landing/journey/run.test.tsx tests/unit/components/landing/journey/station-progress.test.tsx tests/unit/components/landing/journey/place-memory.test.tsx tests/e2e/journey
git add -u tests/unit tests/e2e
git commit -m "feat(journey): the window-seat run: 06 and 07 ride past the window, and every link and Tab stop brings its station there"
```

---

### Task 7: Night falls

The theme button's change sweeps out from the button in a widening circle, and the drawn train is redrawn inside it at once (spec §3.F; J6-10). The new theme is committed inside a same-document view transition:
1. `flushSync` commits the choice;
2. `themeApplied` waits until next-themes' effect has written `data-theme`, 100 ms at most;
3. `tt:theme` is sent, J5-9's synchronous redraw.

The new page is then revealed by a clip-path circle on `::view-transition-new(root)` (640 ms, `--ease-in-out`). The switch is instant where the browser has no View Transitions, and wherever Motion is not on. `data-motion` also answers reduced motion, and the console never writes it.

**Files:**
- Create: `src/components/theme/night-falls.ts`
- Modify: `src/components/theme/theme-toggle.tsx`, `src/styles/motion.css`, `DESIGN.md`
- Create: `tests/e2e/journey/night-falls.spec.ts`
- Test: `tests/unit/components/theme/night-falls.test.tsx`, `tests/unit/components/theme-toggle.test.tsx` (unchanged, must stay green)

**Interfaces:**
- Consumes: `THEME_EVENT` and `emit` (`journey-events.ts`), and `ThemeChoice` (`use-theme.ts`).
- Produces:
  - `SWEEP_MS`;
  - `sweepFrom(box, viewport): { x: number; y: number; reach: number }`;
  - `themeApplied(resolved: "light" | "dark", cap?: number): Promise<void>`;
  - `resolvedChoice(choice: ThemeChoice): "light" | "dark"`;
  - `nightFalls(from: Element, apply: () => void, resolved: "light" | "dark"): void`;
  - `html[data-theme-sweep]` while a sweep runs.

- [ ] **Step 1: Write the failing unit tests**

Create `tests/unit/components/theme/night-falls.test.tsx`. It is a `.tsx` file, so it runs under jsdom (vitest.config.mts: `*.test.ts` runs in node, where `document` does not exist):

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_EVENT } from "@/components/landing/journey/journey-events";
import { SWEEP_MS, nightFalls, sweepFrom, themeApplied } from "@/components/theme/night-falls";

// Night falls (spec §3.F; J6-10). jsdom has no View Transitions and no Element#animate: the tests give it stand-ins.

const html = document.documentElement;

afterEach(() => {
  delete html.dataset.motion;
  delete html.dataset.theme;
  delete html.dataset.themeSweep;
  Reflect.deleteProperty(document, "startViewTransition");
  Reflect.deleteProperty(html, "animate");
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function button(): HTMLButtonElement {
  const b = document.createElement("button");
  b.getBoundingClientRect = () => ({ left: 100, top: 10, width: 36, height: 36 }) as DOMRect;
  return b;
}

function listen(): { readonly heard: () => number; readonly stop: () => void } {
  let count = 0;
  const hear = () => {
    count += 1;
  };
  window.addEventListener(THEME_EVENT, hear);
  return { heard: () => count, stop: () => window.removeEventListener(THEME_EVENT, hear) };
}

describe("the sweep's circle", () => {
  it("starts at the button's centre and reaches the window's farthest corner", () => {
    expect(sweepFrom({ left: 1380, top: 14, width: 36, height: 36 }, { width: 1440, height: 900 })).toEqual({ x: 1398, y: 32, reach: Math.ceil(Math.hypot(1398, 868)) });
  });
});

describe("themeApplied", () => {
  it("resolves at once when <html> already reads the theme", async () => {
    html.dataset.theme = "dark";
    await expect(themeApplied("dark")).resolves.toBeUndefined();
  });

  it("resolves when next-themes writes it", async () => {
    html.dataset.theme = "light";
    const done = themeApplied("dark");
    html.dataset.theme = "dark";
    await expect(done).resolves.toBeUndefined();
  });

  it("stops waiting after 100 ms", async () => {
    vi.useFakeTimers();
    html.dataset.theme = "light";
    const done = vi.fn();
    void themeApplied("dark").then(done);
    await vi.advanceTimersByTimeAsync(99);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalledTimes(1);
  });
});

describe("nightFalls", () => {
  it("switches at once where the browser has no View Transitions, then redraws the train", async () => {
    html.dataset.motion = "on";
    html.dataset.theme = "light";
    const theme = listen();
    const apply = vi.fn(() => {
      html.dataset.theme = "dark";
    });
    nightFalls(button(), apply, "dark");
    expect(apply).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(theme.heard()).toBe(1));
    expect(html.dataset.themeSweep).toBeUndefined();
    theme.stop();
  });

  it("switches at once with Motion off, even where View Transitions exist", async () => {
    html.dataset.motion = "off";
    html.dataset.theme = "light";
    const start = vi.fn();
    Object.defineProperty(document, "startViewTransition", { configurable: true, value: start });
    const theme = listen();
    // the theme is written, as next-themes would: a themeApplied left waiting would redraw inside the next test
    const apply = vi.fn(() => {
      html.dataset.theme = "dark";
    });
    nightFalls(button(), apply, "dark");
    expect(apply).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(theme.heard()).toBe(1));
    theme.stop();
  });

  it("sweeps out from the button: the change inside a view transition, the train redrawn in it, the new page revealed by a widening circle", async () => {
    html.dataset.motion = "on";
    html.dataset.theme = "light";
    const updates: Array<() => Promise<void>> = [];
    const done: { finish: () => void } = { finish: () => undefined };
    const finished = new Promise<void>((resolve) => {
      done.finish = resolve;
    });
    const start = vi.fn((update: () => Promise<void>) => {
      updates.push(update);
      return { ready: Promise.resolve(), finished, updateCallbackDone: Promise.resolve(), skipTransition: () => undefined };
    });
    Object.defineProperty(document, "startViewTransition", { configurable: true, value: start });
    const animate = vi.fn();
    Object.defineProperty(html, "animate", { configurable: true, value: animate });
    const theme = listen();
    const apply = vi.fn(() => {
      html.dataset.theme = "dark";
    });
    nightFalls(button(), apply, "dark");
    expect(start).toHaveBeenCalledTimes(1);
    expect(html.dataset.themeSweep).toBe("");
    expect(apply).not.toHaveBeenCalled(); // only inside the transition's update
    await updates[0]!();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(theme.heard()).toBe(1); // redrawn inside the capture, in the new theme
    const { x, y, reach } = sweepFrom({ left: 100, top: 10, width: 36, height: 36 }, { width: window.innerWidth, height: window.innerHeight });
    await vi.waitFor(() =>
      expect(animate).toHaveBeenCalledWith({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${reach}px at ${x}px ${y}px)`] }, expect.objectContaining({ duration: SWEEP_MS, pseudoElement: "::view-transition-new(root)" })),
    );
    done.finish();
    await vi.waitFor(() => expect(html.dataset.themeSweep).toBeUndefined());
    theme.stop();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/components/theme/night-falls.test.tsx`
Expected: FAIL with `Failed to resolve import "@/components/theme/night-falls"`.

- [ ] **Step 3: Write `night-falls.ts`**

Create `src/components/theme/night-falls.ts`:

```ts
import { flushSync } from "react-dom";
import { THEME_EVENT, emit } from "@/components/landing/journey/journey-events";
import type { ThemeChoice } from "./use-theme";

// Night falls (spec 2026-09-24 §3.F; prototype v3's shell.js; J6-10). The theme button's change sweeps out from the
// button in a widening circle, the drawn train redrawn inside it at once. A same-document View Transition captures the
// page in both themes; the new one is revealed by a clip-path circle on ::view-transition-new(root). Instant where the
// browser has no View Transitions, and wherever Motion is not on: html[data-motion] also answers reduced motion, and
// only the traveller pages' head script writes it, so the console always switches at once.

export const SWEEP_MS = 640;
const APPLIED_CAP_MS = 100;
const EASE_IN_OUT = "--ease-in-out";

interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** The circle's centre (the button's) and the radius that reaches the window's farthest corner. */
export function sweepFrom(box: Box, viewport: { readonly width: number; readonly height: number }): { readonly x: number; readonly y: number; readonly reach: number } {
  const x = Math.round(box.left + box.width / 2);
  const y = Math.round(box.top + box.height / 2);
  return { x, y, reach: Math.ceil(Math.hypot(Math.max(x, viewport.width - x), Math.max(y, viewport.height - y))) };
}

/** Resolves once <html data-theme> reads `resolved` (next-themes writes it in an effect), or after 100 ms at most. */
export function themeApplied(resolved: "light" | "dark", cap = APPLIED_CAP_MS): Promise<void> {
  const html = document.documentElement;
  if (html.dataset.theme === resolved) return Promise.resolve();
  return new Promise((done) => {
    const finish = () => {
      observer.disconnect();
      window.clearTimeout(timer);
      done();
    };
    const observer = new MutationObserver(() => {
      if (html.dataset.theme === resolved) finish();
    });
    observer.observe(html, { attributes: true, attributeFilter: ["data-theme"] });
    const timer = window.setTimeout(finish, cap);
  });
}

/** The theme a choice resolves to now. */
export function resolvedChoice(choice: ThemeChoice): "light" | "dark" {
  if (choice !== "system") return choice;
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Changes the theme: `apply` sets it (inside flushSync, so React commits it at once), then the drawn train redraws. */
export function nightFalls(from: Element, apply: () => void, resolved: "light" | "dark"): void {
  const html = document.documentElement;
  const redraw = () => emit(THEME_EVENT);
  if (typeof document.startViewTransition !== "function" || html.dataset.motion !== "on") {
    apply();
    void themeApplied(resolved).then(redraw);
    return;
  }
  const { x, y, reach } = sweepFrom(from.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight });
  const easing = getComputedStyle(html).getPropertyValue(EASE_IN_OUT).trim() || "ease-in-out";
  html.dataset.themeSweep = "";
  const transition = document.startViewTransition(async () => {
    flushSync(apply);
    await themeApplied(resolved);
    redraw();
  });
  transition.ready.then(
    () => html.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${reach}px at ${x}px ${y}px)`] }, { duration: SWEEP_MS, easing, pseudoElement: "::view-transition-new(root)" }),
    () => undefined,
  );
  const done = () => delete html.dataset.themeSweep;
  transition.finished.then(done, done);
}
```

In `src/components/theme/theme-toggle.tsx`, add `import { nightFalls, resolvedChoice } from "./night-falls";`, and replace:
```tsx
      onClick={() => switchTheme(setTheme, next.value)}
```
with:
```tsx
      onClick={(event) => nightFalls(event.currentTarget, () => switchTheme(setTheme, next.value), resolvedChoice(next.value))}
```
Update the component's doc comment: after "A click moves System → Day → Night.", add "With Motion on, the change sweeps out from the button in a circle (Night falls, night-falls.ts)."

In `src/styles/motion.css`, after the `::view-transition-old(root), ::view-transition-new(root)` block, add:
```css
/* Night falls (spec 2026-09-24 §3.F; night-falls.ts): while the theme sweeps, the new page is revealed over the old,
   held still, by a clip-path circle from the theme button, never a cross-fade. The masthead rides in the page's own
   capture, so the circle sweeps it too. */
html[data-theme-sweep]::view-transition-old(root),
html[data-theme-sweep]::view-transition-new(root) {
  animation: none;
  mix-blend-mode: normal;
}
html[data-theme-sweep]::view-transition-new(root) {
  z-index: 1;
}
html[data-theme-sweep] header {
  view-transition-name: none !important; /* over top-nav.tsx's inline name, for the sweep only */
}
```

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `npx vitest run tests/unit/components/theme/night-falls.test.tsx tests/unit/components/theme-toggle.test.tsx tests/unit/styles`
Expected: PASS.
- `theme-toggle.test.tsx` runs in jsdom, which has no `document.startViewTransition`, so every click takes the instant path and `setTheme` is called as before.
- `motion.contract.test.ts` still holds the reduced-motion and Motion-off blocks to each other: the sweep's rules sit outside both.

- [ ] **Step 5: Write the e2e**

Create `tests/e2e/journey/night-falls.spec.ts`:

```ts
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { motionOff, waitForJourney, waitForLive } from "./journey-helpers";

// Night falls (spec §3.F, §5's "theme sweep"; J6-10): the theme button's change sweeps out from it in a widening circle,
// the drawn train redrawn inside it. Every clip-path animation on ::view-transition-new(root) is recorded as it starts.

interface Sweep {
  readonly clip: readonly string[];
}

async function recordSweeps(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const sweeps: Sweep[] = [];
    Reflect.set(window, "__ttSweeps", sweeps);
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, keyframes, options) {
      if (typeof options === "object" && options.pseudoElement === "::view-transition-new(root)" && keyframes && !Array.isArray(keyframes)) {
        const clip = Reflect.get(keyframes, "clipPath");
        if (Array.isArray(clip)) sweeps.push({ clip: clip.map(String) });
      }
      return animate.call(this, keyframes, options);
    };
  });
}
const sweeps = (page: Page) => page.evaluate(() => (Reflect.get(window, "__ttSweeps") ?? []) as Sweep[]);
const themeButton = (page: Page) => page.getByRole("banner").getByRole("button", { name: /^Theme:/ });

test.describe("Night falls (spec §3.F)", () => {
  test.skip(({ isMobile }) => isMobile, "the masthead's theme button at a desktop width; one project is enough");

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("tt.theme", "light"));
  });

  test("the new theme sweeps out from the theme button in a circle, and the drawn train redraws inside it", async ({ page }) => {
    await recordSweeps(page);
    await page.goto("/");
    await waitForLive(page);
    const box = (await themeButton(page).boundingBox())!;
    await themeButton(page).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect.poll(async () => (await sweeps(page)).length).toBe(1);
    const [sweep] = await sweeps(page);
    const x = Math.round(box.x + box.width / 2);
    const y = Math.round(box.y + box.height / 2);
    expect(sweep!.clip[0]).toBe(`circle(0px at ${x}px ${y}px)`);
    expect(sweep!.clip[1]).toMatch(new RegExp(`^circle\\(\\d+px at ${x}px ${y}px\\)$`));
    await expect.poll(() => page.evaluate(() => window.__ttJourney?.night() ?? false)).toBe(true);
    await expect(page.locator("html")).not.toHaveAttribute("data-theme-sweep");
  });

  test("clicks land while the sweep runs", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await themeButton(page).click();
    // at once, while the circle widens: ::view-transition lets pointer events through to the page (motion.css)
    await page.locator(".board").getByRole("link", { name: "Operating principles" }).click();
    await expect(page).toHaveURL(/#principles$/);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("Motion off: the switch is instant", async ({ page }) => {
    await recordSweeps(page);
    await motionOff(page);
    await page.goto("/");
    await waitForJourney(page);
    await themeButton(page).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await sweeps(page)).toEqual([]);
    await expect(page.locator("html")).not.toHaveAttribute("data-theme-sweep");
  });

  test("a browser without View Transitions: the switch is instant", async ({ page }) => {
    await recordSweeps(page);
    await page.addInitScript(() => Reflect.deleteProperty(Document.prototype, "startViewTransition"));
    await page.goto("/");
    await waitForJourney(page);
    await themeButton(page).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await sweeps(page)).toEqual([]);
  });

  // The console never sweeps by construction: its layout writes no data-motion (night-falls.ts's gate).
  test("every other traveller page sweeps too", async ({ page }) => {
    await recordSweeps(page);
    await page.goto("/watchlist");
    await page.locator("html[data-hydrated]").waitFor({ timeout: 15_000 });
    await themeButton(page).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect.poll(async () => (await sweeps(page)).length).toBe(1);
  });
});
```

- [ ] **Step 6: Run the e2e, and the specs the theme button's click touches**

```bash
lsof -nP -iTCP:4210 -sTCP:LISTEN
npx playwright test tests/e2e/journey/night-falls.spec.ts tests/e2e/theme.spec.ts tests/e2e/smoothness.spec.ts tests/e2e/journey/live-drawing.spec.ts tests/e2e/csp.spec.ts
```
Expected: PASS. Before Step 3, the first night-falls test fails with `expected 0 to be 1` sweeps. `smoothness.spec.ts`'s "the theme button eases back from its press while the theme changes" must stay green: the button's transform is read from the live DOM, which the view transition does not replace.

- [ ] **Step 7: Write it into DESIGN.md**

In `DESIGN.md`'s Motion section, replace "The other movements: the theme button's turning icon, the invalid shake, the clock's flip, the digit caret, the running sweep, popup fades." with:
"The other movements: the theme button's turning icon, and Night falls, where the theme's change sweeps out from the button in a widening circle (a same-document View Transition, 640 ms, instant where the browser has none; `night-falls.ts`). Then the invalid shake, the clock's flip, the digit caret, the running sweep, and popup fades."

- [ ] **Step 8: The gate, then commit**

```bash
npm run check
git add src/components/theme/night-falls.ts src/components/theme/theme-toggle.tsx src/styles/motion.css DESIGN.md tests/unit/components/theme/night-falls.test.tsx tests/e2e/journey/night-falls.spec.ts
git commit -m "feat(theme): Night falls: the theme sweeps out from its button in a circle, the drawn train redrawn inside it"
```

---

### Task 8: The budgets, hardened, and a throttled run a GPU-less runner can trust

The chunk budgets now gate every PR (Task 1) and the nightly (Task 9), so J5's four hardening items land (J6-15):
- the frame meter's mark is a constant pinned by a test;
- a loader group is classed as the scene before the meter;
- a group carrying both marks fails;
- a real build whose scene no loader fetches fails.

`journey-perf.mjs` serves this checkout's production build itself (J6-14). It gains `--software`, the nightly's throttled run at 4×, 6× and 10×. That run asserts only what holds on any machine and prints the rest (J6-3).

**Files:**
- Create: `src/components/landing/journey/hud-mark.ts`
- Modify: `src/components/landing/journey/hud.ts` (writes the mark onto its own root element), `scripts/journey-budgets.mjs`, `scripts/journey-perf.mjs`
- Test: `tests/unit/scripts/journey-budgets.test.ts`, `tests/unit/scripts/journey-perf.test.ts`, `tests/unit/components/landing/journey/hud.test.tsx`

**Interfaces:**
- Consumes: Task 2's `startLocalProduction` and `refusals` (`scripts/serve-local-production.mjs`).
- Produces:
  - `HUD_CHUNK_MARK = "tt-hud-chunk"`, which the frame meter's root element carries as `data-chunk`;
  - `MARKS.hud === HUD_CHUNK_MARK`;
  - `softwareFailures(run: { rate: number; foreign: readonly string[]; cls: number; why: string | null; q: string | null; heaviest: boolean }): string[]`;
  - the CLIs `node scripts/journey-perf.mjs` (real GPU) and `node scripts/journey-perf.mjs --software`, which Task 9 runs.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/scripts/journey-budgets.test.ts`, add `import { HUD_CHUNK_MARK } from "@/components/landing/journey/hud-mark";`. In the first test, after `expect(MARKS.scene).toBe(SCENE_CHUNK_MARK);`, add `expect(MARKS.hud).toBe(HUD_CHUNK_MARK);`. Then add inside the second `describe`:

```ts
  it("classes a loader group by the scene's mark before the meter's, and fails one that carries both", () => {
    const both = { name: "static/chunks/both.js", text: `${MARKS.scene} ${MARKS.hud} ${noise(100)}` };
    const r = measure([page, journey, anime, { ...loaders, text: `${loads("both.js")}` }, both, three], { requireLoader: true });
    expect(r.failures.join(" ")).toMatch(/one loader fetches both the scene and the frame meter/);
  });

  it("with requireLoader, fails when no loader fetches the scene: what loads beside it would go uncounted", () => {
    const r = measure([page, journey, anime, { ...loaders, text: loads("hud.js") }, scene, three, hud], { requireLoader: true });
    expect(r.failures.join(" ")).toMatch(/no loader fetches the scene chunk/);
  });
```

In `tests/unit/components/landing/journey/hud.test.tsx`, add `import { HUD_CHUNK_MARK } from "@/components/landing/journey/hud-mark";`, and add inside the `describe`:

```tsx
  it("carries its chunk's mark on its own root, so the chunk budgets can tell its chunk apart (J6-15)", () => {
    const stop = startHud();
    expect(document.querySelector<HTMLElement>(".journey-hud")?.dataset.chunk).toBe(HUD_CHUNK_MARK);
    stop();
  });
```

In `tests/unit/scripts/journey-perf.test.ts`, add `softwareFailures` to the import, and add at the end:

```ts
describe("softwareFailures: what a software GPU's run can fail on (J6-3)", () => {
  const clean = { rate: 4, foreign: [], cls: 0.002, why: "", q: null, heaviest: false } as const;

  it("passes a run that asked no other host, held its layout and decided its drawing; frame times are not its business", () => {
    expect(softwareFailures(clean)).toEqual([]);
  });

  it("fails another host asked, CLS over 0.05, or a drawing that never decided", () => {
    expect(softwareFailures({ ...clean, foreign: ["https://example.invalid"] })).toEqual(["asked https://example.invalid"]);
    expect(softwareFailures({ ...clean, cls: 0.06 })).toEqual(["CLS 0.060 over 0.05"]);
    expect(softwareFailures({ ...clean, why: null })).toEqual(["the drawing never decided"]);
  });

  it("at the heaviest rate, asks the governor to have answered: a quality step stored, or the still for quality or load", () => {
    expect(softwareFailures({ ...clean, heaviest: true })).toEqual(["the governor never answered: no quality step stored, and no still for quality or load"]);
    expect(softwareFailures({ ...clean, heaviest: true, q: "1" })).toEqual([]);
    expect(softwareFailures({ ...clean, heaviest: true, why: "quality" })).toEqual([]);
    expect(softwareFailures({ ...clean, heaviest: true, why: "load" })).toEqual([]);
    expect(softwareFailures({ ...clean, heaviest: true, why: "place" })).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/scripts/journey-budgets.test.ts tests/unit/scripts/journey-perf.test.ts tests/unit/components/landing/journey/hud.test.tsx`
Expected: FAIL.
- `Failed to resolve import "@/components/landing/journey/hud-mark"`.
- After Step 3's first file exists, the budgets tests fail on `expected "Close the frame meter" to be "tt-hud-chunk"` and the two new failure messages, and the meter's test on `expected undefined to be "tt-hud-chunk"`.
- `softwareFailures is not a function`.

- [ ] **Step 3: The frame meter's mark, and the budgets' four hardenings**

Create `src/components/landing/journey/hud-mark.ts`:
```ts
/** A string only the frame meter's chunk carries, so the chunk budgets tell it from the journey's and the scene's
 * (J5-10, J6-15). hud.ts writes it onto the meter's own root element (data-chunk): a value the code reads is one no
 * bundler can drop, where an unread re-export could be, and only hud.ts imports this file, so it lands in that chunk. */
export const HUD_CHUNK_MARK = "tt-hud-chunk";
```
In `src/components/landing/journey/hud.ts`, add `import { HUD_CHUNK_MARK } from "./hud-mark";` to its imports, and in `startHud`, replace:
```ts
  el.className = "journey-hud";
```
with:
```ts
  el.className = "journey-hud";
  el.dataset.chunk = HUD_CHUNK_MARK; // the chunk budgets find the meter's chunk by this (journey-budgets.mjs)
```
In `scripts/journey-budgets.mjs`:
- In the header comment, replace "never the frame meter (`?journey-hud`, previews and development only; J5-10), found by its close button's label." with "never the frame meter (`?journey-hud`, previews and development only; J5-10), found by its own mark (hud-mark.ts).".
- Change `MARKS` to:
  ```js
  export const MARKS = { journey: "tt-journey-chunk", scene: "tt-scene-chunk", three: "THREE.WebGLRenderer", hud: "tt-hud-chunk" };
  ```
- In `follow`, replace:
  ```js
      const fetched = resolve(group);
      if (fetched.some((c) => c.text.includes(MARKS.hud))) continue;
      if (inScene || fetched.some((c) => c.text.includes(MARKS.scene))) {
  ```
  with:
  ```js
      const fetched = resolve(group);
      const carries = (/** @type {string} */ mark) => fetched.some((c) => c.text.includes(mark));
      if (carries(MARKS.scene) && carries(MARKS.hud)) {
        failures.push(`one loader fetches both the scene and the frame meter (${group.join(", ")}): the budgets cannot tell them apart`);
        continue;
      }
      // the scene first: a group is the meter's only when it carries no scene
      if (inScene || carries(MARKS.scene)) {
  ```
  and, after that `if` block's closing brace, before the `for (const c of fetched)` line, add:
  ```js
      if (carries(MARKS.hud)) continue;
  ```
- After the line `if (requireLoader && marked.length && !withJourney.length) head.push(…);`, add:
  ```js
  if (requireLoader && byMark.some((c) => c.text.includes(MARKS.scene)) && !sceneLoaded.length) head.push("no loader fetches the scene chunk, so what loads beside it cannot be counted");
  ```

- [ ] **Step 4: `journey-perf.mjs` serves the build, and runs in software**

In `scripts/journey-perf.mjs`:
- Replace the header comment (every `//` line above the first `import`) with:

```js
// The journey's performance budgets (spec §3.H), against this checkout's production build, which the script serves
// itself on this machine with sample data and nothing live (scripts/serve-local-production.mjs; J6-14):
//   npm run build && node scripts/journey-perf.mjs              the real-GPU run, by hand, on the owner's Mac (run it
//                                                                twice: a fresh server's first answers are cold)
//   npm run build && node scripts/journey-perf.mjs --software   the nightly's throttled run, on a runner with no GPU
// It refuses port 4210 when another server answers there (`lsof -nP -iTCP:4210 -sTCP:LISTEN`), and, through the serve
// script, a working tree holding any .env file but .env.example (J6-2). JOURNEY_PERF_URL points it at a server already
// running instead. Either run fails when the server's offline guard refused anything, or when the
// page asked any host but this one. It never submits a PNR. Exits 1 on a missed budget.
//
// The real-GPU run: a headed Chromium on the real GPU (Metal on a Mac), a fresh one for each, loads "/" twice:
// - a phone, 390×844 at 4× CPU: the longest journey task at load (≤ 120 ms) and the scene's longest step (≤ 61 ms),
//   from the start to one frame after the drawing goes live. Each long task is named by the scripts that ran in it
//   (Long Animation Frames), against the chunk lists journey-budgets.mjs reads from the build; the page's own longest
//   (React's hydration, Next's runtime) is printed beside them, but it is not the journey's. Then CLS, and the scroll
//   through the drawing: median fps and frames over 33 ms;
// - the reference desktop, 1280×800 at 1×: the same scroll's p95 and frames over 25 ms, recorded from two frames after
//   the jump into #anatomy, with the progress through #anatomy of every frame over 25 ms.
// The software run (J6-3): a headless Chromium drawing through SwiftShader, on the CPU: a phone at 4×, 6× and 10× CPU,
// and the desktop at 1×. A software GPU measures the rasteriser, not the page, so frame times and long tasks are printed
// only. It fails on what holds on any machine: another host asked, CLS over 0.05, a drawing that never decided, and at
// 10× a governor that never answered (no quality step stored in tt.q, and no still for quality or load).
```

- Add to the imports `import { refusals, startLocalProduction } from "./serve-local-production.mjs";`.
- After `frameStats`, add:

```js
/**
 * What a software GPU's run can fail on (J6-3): another host asked, CLS over budget, a drawing that never decided, and
 * at the heaviest rate a governor that never answered. Frame times and long tasks are never its business.
 * @param {{ rate: number, foreign: readonly string[], cls: number, why: string | null, q: string | null, heaviest: boolean }} run
 * @returns {string[]}
 */
export function softwareFailures(run) {
  /** @type {string[]} */
  const out = [];
  if (run.foreign.length) out.push(`asked ${run.foreign.join(", ")}`);
  if (run.cls > BUDGETS.cls) out.push(`CLS ${run.cls.toFixed(3)} over ${BUDGETS.cls}`);
  if (run.why === null) out.push("the drawing never decided");
  const answered = run.q !== null || /\b(quality|load)\b/.test(run.why ?? "");
  if (run.heaviest && !answered) out.push("the governor never answered: no quality step stored, and no still for quality or load");
  return out;
}

/** @param {number} n */
const ms = (n) => `${n.toFixed(0)} ms`;
```

- After `scrollThrough`, add:

```js
/**
 * Every origin but the page's own that the page asks, as it asks.
 * @param {import("@playwright/test").Page} page @param {string} base
 */
function watchForeign(page, base) {
  /** @type {Set<string>} */
  const foreign = new Set();
  const origin = new URL(base).origin;
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.origin !== origin && u.protocol !== "data:" && u.protocol !== "blob:") foreign.add(u.origin);
  });
  return foreign;
}
```

- In `measureRun`, replace the six lines from `/** @type {Set<string>} */` through the `page.on("request", …);` block with `const foreign = watchForeign(page, base);`.
- After `measureRun`, add:

```js
/**
 * One software-GPU run, in its own headless browser (SwiftShader): the page's decision, its quality step and its CLS;
 * its long tasks and, when live, its scroll, printed only.
 * @param {string} base @param {Owners} owners @param {{ width: number, height: number, cpu: number }} run
 */
async function softwareRun(base, owners, { width, height, cpu }) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  const foreign = watchForeign(page, base);
  const cdp = await page.context().newCDPSession(page);
  if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  await page.addInitScript(observe);
  await page.goto(base);
  const decided = await page.waitForSelector("html[data-drawing-why]", { state: "attached", timeout: 60_000 }).then(() => true, () => false);
  const live = decided && (await page.waitForSelector("#anatomy.is-live", { state: "attached", timeout: 30_000 }).then(() => true, () => false));
  const scroll = live ? await scrollThrough(page, { width, height }) : null;
  /** @type {{ tasks: Task[], scripts: Script[], cls: number }} */
  const perf = await page.evaluate(() => Reflect.get(window, "__perf"));
  const state = await page.evaluate(() => ({ why: document.documentElement.getAttribute("data-drawing-why"), q: window.sessionStorage.getItem("tt.q") }));
  await browser.close();
  return { width, height, cpu, tasks: longest(attribute(perf.tasks, perf.scripts, owners)), cls: perf.cls, stats: scroll?.stats ?? null, foreign: [...foreign], ...state };
}

/**
 * The real-GPU run's verdicts (spec §3.H).
 * @param {string} base @param {Owners} owners @returns {Promise<Array<[string, boolean]>>}
 */
async function hardware(base, owners) {
  const phone = await measureRun(base, owners, { width: 390, height: 844, cpu: 4 });
  const desk = await measureRun(base, owners, { width: 1280, height: 800, cpu: 1 });
  console.log(`phone long tasks: ${phone.all.map((t) => `${t.owner} ${ms(t.duration)}`).join(", ") || "none"}`);
  console.log(`desktop long tasks: ${desk.all.map((t) => `${t.owner} ${ms(t.duration)}`).join(", ") || "none"}`);
  if (phone.slow.length) console.log(`phone frames over 25 ms (progress through #anatomy): ${phone.slow.join(", ")}`);
  if (desk.slow.length) console.log(`desktop frames over 25 ms (progress through #anatomy): ${desk.slow.join(", ")}`);
  return [
    [`phone longest journey task at load ${ms(phone.tasks.journey)} (page's own longest ${ms(phone.tasks.page)})`, phone.tasks.journey <= BUDGETS.journeyTask],
    [`phone longest scene step ${ms(phone.tasks.scene)}`, phone.tasks.scene <= BUDGETS.sceneStep],
    [`phone scroll median ${phone.stats.medianFps} fps, ${phone.stats.over33}% > 33 ms (${phone.stats.count} frames)`, phone.stats.medianFps >= BUDGETS.phoneFps && phone.stats.over33 <= BUDGETS.phoneOver33],
    [`desktop scroll p95 ${desk.stats.p95.toFixed(1)} ms, ${desk.stats.over25}% > 25 ms (${desk.stats.count} frames)`, desk.stats.p95 <= BUDGETS.desktopP95 && desk.stats.over25 <= BUDGETS.desktopOver25],
    [`CLS at load: phone ${phone.cls.toFixed(3)}, desktop ${desk.cls.toFixed(3)}`, Math.max(phone.cls, desk.cls) <= BUDGETS.cls],
    [`other hosts asked: ${[...phone.foreign, ...desk.foreign].join(", ") || "none"}`, !phone.foreign.length && !desk.foreign.length],
  ];
}

/**
 * The software run's verdicts (J6-3): each line prints its numbers, and judges only softwareFailures.
 * @param {string} base @param {Owners} owners @returns {Promise<Array<[string, boolean]>>}
 */
async function software(base, owners) {
  /** @type {Array<[string, boolean]>} */
  const lines = [];
  const runs = [
    { width: 390, height: 844, cpu: 4 },
    { width: 390, height: 844, cpu: 6 },
    { width: 390, height: 844, cpu: 10 },
    { width: 1280, height: 800, cpu: 1 },
  ];
  for (const run of runs) {
    const r = await softwareRun(base, owners, run);
    const scrolled = r.stats ? `scroll median ${r.stats.medianFps} fps, p95 ${r.stats.p95.toFixed(1)} ms, ${r.stats.over33}% > 33 ms` : "not live, so no scroll";
    const drawing = r.why === null ? "undecided" : r.why === "" ? "live" : `still (${r.why})`;
    console.log(`${r.width}×${r.height} at ${r.cpu}× (software GPU, printed only): longest journey task ${ms(r.tasks.journey)}, scene step ${ms(r.tasks.scene)}, page ${ms(r.tasks.page)}; ${scrolled}; drawing ${drawing}; quality step ${r.q ?? "none stored"}`);
    const failures = softwareFailures({ rate: r.cpu, foreign: r.foreign, cls: r.cls, why: r.why, q: r.q, heaviest: r.cpu === 10 });
    lines.push([`${r.width}×${r.height} at ${r.cpu}×: CLS ${r.cls.toFixed(3)}, other hosts ${r.foreign.join(", ") || "none"}, drawing ${drawing}${failures.length ? `: ${failures.join("; ")}` : ""}`, failures.length === 0]);
  }
  return lines;
}
```

- Replace the whole `if (process.argv[1] === fileURLToPath(import.meta.url)) { … }` block with:

```js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
  const built = measure(chunksIn(join(root, ".next/static/chunks")), { requireLoader: true });
  if (built.failures.length) throw new Error(`the build's chunks cannot be placed: ${built.failures.join("; ")}`);
  const owners = { journey: new Set(built.journey.map(chunkOf)), scene: new Set(built.scene.map(chunkOf)) };
  const own = process.env.JOURNEY_PERF_URL ? null : await startLocalProduction({ port: 4210 });
  const base = process.env.JOURNEY_PERF_URL ?? own?.url ?? "";
  const judge = process.argv.includes("--software") ? software : hardware;
  const lines = await judge(base, owners).finally(() => own?.stop());
  if (own) {
    const refused = refusals();
    lines.push([`the server's offline guard refused: ${refused.join(", ") || "nothing"}`, refused.length === 0]);
  }
  for (const [text, ok] of lines) console.log(`${ok ? "✓" : "✗"} ${text}`);
  process.exit(lines.every(([, ok]) => ok) ? 0 : 1);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/scripts`
Expected: PASS.

- [ ] **Step 6: Run both against a real build**

```bash
npm run build
node scripts/journey-budgets.mjs
lsof -nP -iTCP:4210 -sTCP:LISTEN
node scripts/journey-perf.mjs --software
```
Expected:
- the budgets pass. The journey chunk is about 40 KB: J5's 38.5, plus the run. The scene is about 156 KB. The frame meter's chunk is classed by its new mark, with no "which no budget can place" failure;
- the software run prints four lines and exits 0: CLS within budget, no other host, and at 10× a stored quality step or the still for `quality`;
- the offline guard refused nothing.

The meter writes its mark onto its root, so the bundler keeps the string in its chunk. If the chunk budgets still fail with "the journey loads …hud…, which no budget can place", report it with the chunk's name.

- [ ] **Step 7: The gate, then commit**

```bash
npm run check
git add src/components/landing/journey/hud-mark.ts src/components/landing/journey/hud.ts scripts/journey-budgets.mjs scripts/journey-perf.mjs tests/unit/scripts/journey-budgets.test.ts tests/unit/scripts/journey-perf.test.ts tests/unit/components/landing/journey/hud.test.tsx
git commit -m "test(journey): harden the chunk budgets, and let the perf script serve its own build and run on a software GPU"
```

---

### Task 9: The nightly

`.github/workflows/journey-nightly.yml` does, every night, what a pull request's CI cannot afford or cannot do at all (spec §5, §8; J6-3, J6-11 to J6-13). It runs two jobs on sample data, with no secret and no live source.

`production` works on this checkout's production build, served by Task 2's script:
- the chunk budgets;
- the production-build smoke;
- the software-GPU throttled runs.

`journey`, in three shards, runs on the fixture-mode `next dev` every PR uses:
- collisions at 15 sizes, and at 200% text;
- every chapter photographed in Day, Night and on a phone;
- the journey's specs in WebKit.

The §3.H frame-time and long-task budgets are not measured here, and the workflow and the spec say so: GitHub's runners have no GPU.

**Files:**
- Create: `.github/workflows/journey-nightly.yml`, `playwright.nightly.config.ts`, `tests/e2e/nightly/sizes.spec.ts`, `tests/e2e/nightly/screens.spec.ts`
- Modify: `tests/e2e/journey/journey-helpers.ts` (`skipWithoutWebgl2`, which `waitForLive` calls: a WebKit without WebGL 2 skips, saying so), `tests/e2e/journey/live-drawing.spec.ts` (its own skip reuses it), `.gitignore`
- Modify: `docs/superpowers/specs/2026-09-24-landing-journey-design.md` (§5 Nightly, §7, §8, §9)
- Test: `tests/unit/ci-workflows.contract.test.ts`

**Interfaces:**
- Consumes:
  - Task 1's pinned SHAs;
  - Task 2's `playwright.production.config.ts`;
  - Task 6's `LANDING_INSTRUMENTS` and `scrollIntoRun`;
  - Task 8's `journey-perf.mjs --software`;
  - `collisionsTopToBottom(page, { panels, skip, step })`, and `waitForLive` and `scrollIntoChapter` (J5).
- Produces:
  - `skipWithoutWebgl2(page)`, exported from `journey-helpers.ts` and called by `waitForLive`, so every spec that needs the live drawing skips in a WebKit that has no WebGL 2 (J6-12);
  - the workflow's jobs `production` and `journey`;
  - the Playwright projects `sizes`, `screens`, `webkit` and `webkit-phone`.

- [ ] **Step 1: Write the failing contract tests**

In `tests/unit/ci-workflows.contract.test.ts`, change `const FILES = ["ci.yml", "audit.yml"] as const;` to:
```ts
const FILES = ["ci.yml", "audit.yml", "journey-nightly.yml"] as const;
```
and add at the end of the file:

```ts
describe("journey-nightly.yml", () => {
  const nightly = read("journey-nightly.yml");

  it("runs at night and by hand, and on a pull request only when it changes itself (J6-11)", () => {
    expect(nightly).toMatch(/schedule:\n\s+- cron: /);
    expect(nightly).toContain("workflow_dispatch:");
    expect(nightly).toMatch(/pull_request:\n\s+paths: \[\.github\/workflows\/journey-nightly\.yml\]/);
  });

  it("never runs on a fork, and gives every job a time limit", () => {
    const jobs = (nightly.match(/runs-on:/g) ?? []).length;
    expect(jobs).toBe(2);
    expect((nightly.match(/if: github\.repository == 'heytherevibin\/trackandtrace'/g) ?? []).length).toBe(jobs);
    expect((nightly.match(/timeout-minutes:/g) ?? []).length).toBe(jobs);
  });

  it("serves sample data and nothing live: no live source, no credential, nowhere", () => {
    expect(nightly).not.toMatch(/PNR_SOURCE:\s*(railkit|live)/);
    expect(nightly).not.toMatch(/RAILKIT|UPSTASH|SUPABASE|DATA_KEY|SENTRY|RESEND|LOCAL_FIXTURE/);
  });

  it("measures what a GPU-less runner can: the chunk budgets, the production build, the throttled runs, the wide e2e", () => {
    // read from `jobs:` on: the header comment names `npm run build` too, and must not stand in for the build step
    const steps = nightly.slice(nightly.search(/^jobs:$/m));
    const order = ["npm run build", "node scripts/journey-budgets.mjs", "npx playwright test -c playwright.production.config.ts", "node scripts/journey-perf.mjs --software"].map((step) => steps.indexOf(step));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(nightly).toContain("npx playwright test -c playwright.nightly.config.ts --shard=${{ matrix.shard }}/3");
    expect(nightly).toContain("npx playwright install --with-deps chromium webkit");
  });

  it("says plainly that the real-GPU budgets are measured by hand", () => {
    expect(nightly).toContain("node scripts/journey-perf.mjs");
    expect(nightly).toMatch(/no GPU/);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/ci-workflows.contract.test.ts`
Expected: FAIL. `journey-nightly.yml`'s `exists` test fails with `expected '' not to be ''`, and so do the nightly's own tests.

- [ ] **Step 3: Write the workflow**

Create `.github/workflows/journey-nightly.yml`:

```yaml
# The landing journey's nightly checks (spec 2026-09-24 §5, §8; J6-3): what a pull request's CI cannot afford, or
# cannot do at all.
# - production: this checkout's production build, served on the runner with sample data and nothing live
#   (scripts/serve-local-production.mjs, an offline guard in the server): the chunk budgets, the production-build smoke
#   (the security policy scrolled end to end, no other host, a sample check), and the throttled runs at 4×, 6× and 10×.
# - journey: the fixture-mode `next dev` every PR runs on. Collisions at fifteen sizes and at 200% text, every chapter
#   photographed in Day, Night and on a phone (kept as an artifact), and the journey's specs in WebKit.
# What it does NOT measure: §3.H's frame times and long tasks. GitHub's runners have no GPU (Chromium draws WebGL through
# SwiftShader, on the CPU), so the throttled runs judge only what holds on any machine and print the rest. Those budgets
# are measured by hand on a real GPU, before each journey PR merges: `npm run build && node scripts/journey-perf.mjs`.
# No secrets: every run serves sample data, and the serve script blanks every credential.
name: Journey nightly

on:
  # 03:00 IST: after the day's merges, before the availability crawler (05:30 IST)
  schedule:
    - cron: "30 21 * * *"
  workflow_dispatch:
  # The pull request that changes this file proves it before it merges; no other pull request runs it.
  pull_request:
    paths: [.github/workflows/journey-nightly.yml]

permissions:
  contents: read

concurrency:
  group: journey-nightly-${{ github.ref }}
  cancel-in-progress: true

env:
  NEXT_TELEMETRY_DISABLED: "1"

jobs:
  production:
    # Never from a fork.
    if: github.repository == 'heytherevibin/trackandtrace'
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run build
      - name: Chunk budgets (70 KB, 240 KB, three.js only in the scene)
        run: node scripts/journey-budgets.mjs
      - name: Read the Playwright version
        id: playwright
        run: echo "version=$(node -p "require('@playwright/test/package.json').version")" >> "$GITHUB_OUTPUT"
      - name: Cache Playwright browsers
        id: browsers
        uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ steps.playwright.outputs.version }}
      - name: Install Chromium and its system libraries
        if: steps.browsers.outputs.cache-hit != 'true'
        run: npx playwright install --with-deps chromium
      - name: Install Chromium's system libraries
        if: steps.browsers.outputs.cache-hit == 'true'
        run: npx playwright install-deps chromium
      - name: The production build's smoke (the security policy, other hosts, a sample check, the offline guard)
        run: npx playwright test -c playwright.production.config.ts
      - name: Throttled at 4×, 6× and 10× on the runner's software GPU (frame times printed, not judged)
        shell: bash
        run: node scripts/journey-perf.mjs --software | tee -a "$GITHUB_STEP_SUMMARY"
      - name: Keep the report
        if: failure()
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: production-report
          path: |
            playwright-report-production/
            test-results/
            .offline-guard.log
          retention-days: 14

  journey:
    # Never from a fork.
    if: github.repository == 'heytherevibin/trackandtrace'
    name: journey ${{ matrix.shard }}/3
    runs-on: ubuntu-24.04
    timeout-minutes: 45
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3]
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - name: Read the Playwright version
        id: playwright
        run: echo "version=$(node -p "require('@playwright/test/package.json').version")" >> "$GITHUB_OUTPUT"
      - name: Cache Playwright browsers
        id: browsers
        uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0
        with:
          path: ~/.cache/ms-playwright
          key: playwright-webkit-${{ runner.os }}-${{ steps.playwright.outputs.version }}
      - name: Install Chromium, WebKit and their system libraries
        if: steps.browsers.outputs.cache-hit != 'true'
        run: npx playwright install --with-deps chromium webkit
      - name: Install Chromium's and WebKit's system libraries
        if: steps.browsers.outputs.cache-hit == 'true'
        run: npx playwright install-deps chromium webkit
      - run: npx playwright test -c playwright.nightly.config.ts --shard=${{ matrix.shard }}/3
      - name: Keep the report and the photographs
        # kept whether the shard passed or failed, for a person to look at; a cancelled run keeps nothing
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: journey-${{ matrix.shard }}
          path: |
            playwright-report-nightly/
            test-results/
          retention-days: 14
```

- [ ] **Step 4: The nightly's Playwright config and its two specs**

Create `playwright.nightly.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

// The journey's nightly e2e (spec 2026-09-24 §5, §8; J6-3), on the same fixture-mode `next dev` as every PR:
// - sizes: the landing at fifteen sizes, and at 200% text at the PR's three;
// - screens: every chapter photographed in Day, Night and on a phone;
// - webkit and webkit-phone: the journey's place, run, Night falls and drawing specs in WebKit, Safari's engine (§8).
// .github/workflows/journey-nightly.yml runs it in three shards:
//   npx playwright test -c playwright.nightly.config.ts
const JOURNEY_IN_WEBKIT = /journey\/(place|run|night-falls|drawing-modes|live-drawing)\.spec\.ts$/;

export default defineConfig({
  ...base,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never", outputFolder: "playwright-report-nightly" }]] : [["list"]],
  projects: [
    { name: "sizes", testMatch: /nightly\/sizes\.spec\.ts$/, use: { ...devices["Desktop Chrome"] } },
    { name: "screens", testMatch: /nightly\/screens\.spec\.ts$/, use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", testMatch: JOURNEY_IN_WEBKIT, use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 800 } } },
    { name: "webkit-phone", testMatch: JOURNEY_IN_WEBKIT, use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } } },
  ],
});
```

Create `tests/e2e/nightly/sizes.spec.ts`:

```ts
import { expect, test } from "../fixtures";
import { gotoReady } from "../helpers";
import { LANDING_INSTRUMENTS, collisionsTopToBottom } from "../journey/collisions";
import { waitForJourney } from "../journey/journey-helpers";

// Nightly (spec §5, §9; J6-13): the landing top to bottom, Motion on, at fifteen sizes, and with its text at 200% at the
// three sizes every PR checks. The sweep is as dense as the PR's densest (collisions.spec.ts's sweep through 02 pinned:
// 0.15 of a window a step), here over the whole page, so every stop of the three pinned pieces (the drawing chapter,
// 02's dial, the run) is looked at. The live drawing draws through the runner's software GPU, which is slow, not wrong
// (J5-12). A size is a phone's when its short side is under 500px.

const SIZES = [
  [1440, 900],
  [1280, 720],
  [1024, 768],
  [768, 1024],
  [390, 844],
  [360, 740],
  [320, 568],
  [844, 390],
  [667, 375],
  [280, 653],
  [1280, 600],
  [1180, 820],
  [820, 1180],
  [1920, 1080],
  [2560, 1440],
] as const;
const AT_200 = new Set(["1440×900", "390×844", "844×390"]);

for (const [width, height] of SIZES) {
  const name = `${width}×${height}`;
  const phone = Math.min(width, height) < 500;
  test.describe(name, () => {
    test.use({ viewport: { width, height }, isMobile: phone, hasTouch: phone });

    test("nothing collides, top to bottom", async ({ page }) => {
      test.setTimeout(600_000);
      await gotoReady(page, "/");
      await waitForJourney(page);
      expect(await collisionsTopToBottom(page, { ...LANDING_INSTRUMENTS, step: 0.15 })).toEqual([]);
    });

    if (AT_200.has(name)) {
      test("nothing collides with its text at 200%", async ({ page }) => {
        test.setTimeout(600_000);
        await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => document.documentElement.style.setProperty("font-size", "200%")));
        await gotoReady(page, "/");
        await waitForJourney(page);
        expect(await collisionsTopToBottom(page, { ...LANDING_INSTRUMENTS, step: 0.15 })).toEqual([]);
      });
    }
  });
}
```

Create `tests/e2e/nightly/screens.spec.ts`:

```ts
import { statSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { frames, scrollIntoChapter, scrollIntoRun, scrollToId, waitForLive } from "../journey/journey-helpers";

// Nightly (spec §5): every chapter of the landing photographed in Day, Night and on a phone, kept as the run's artifact
// for a person to look at. It asserts only that each place was reached and photographed; the pictures are the evidence.

type Place = readonly [name: string, go: (page: Page) => Promise<void>];

const at = (id: string, offset = 40) => (page: Page) => scrollToId(page, id, offset);
const PLACES: readonly Place[] = [
  ["01-top", (page) => page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }))],
  ["02-drawing-scan", (page) => scrollIntoChapter(page, 0.05)],
  ["03-drawing-apart", (page) => scrollIntoChapter(page, 0.4)],
  ["04-drawing-dimensions", (page) => scrollIntoChapter(page, 0.65)],
  ["05-drawing-departing", (page) => scrollIntoChapter(page, 0.93)],
  ["06-principles", at("principles")],
  ["07-how", at("how", -200)],
  ["08-record", at("record")],
  ["09-reliability", at("reliability")],
  ["10-roadmap", at("roadmap")],
  ["11-run-start", (page) => scrollIntoRun(page, 0)],
  ["12-run-middle", (page) => scrollIntoRun(page, 0.5)],
  ["13-run-end", (page) => scrollIntoRun(page, 1)],
  ["14-faq", at("faq")],
  ["15-terminus", at("terminus")],
];

const FACES = [
  { face: "day", theme: "light", viewport: { width: 1440, height: 900 }, phone: false },
  { face: "night", theme: "dark", viewport: { width: 1440, height: 900 }, phone: false },
  { face: "phone", theme: "light", viewport: { width: 390, height: 844 }, phone: true },
] as const;

for (const { face, theme, viewport, phone } of FACES) {
  test.describe(face, () => {
    test.use({ viewport, isMobile: phone, hasTouch: phone });

    test(`every chapter, photographed (${face})`, async ({ page }, info) => {
      test.setTimeout(300_000);
      await page.addInitScript((t) => window.localStorage.setItem("tt.theme", t), theme);
      await page.goto("/");
      await waitForLive(page);
      for (const [name, go] of PLACES) {
        await go(page);
        await frames(page, 6);
        const path = info.outputPath(`${face}-${name}.png`);
        await page.screenshot({ path });
        expect(statSync(path).size, `${face} ${name}`).toBeGreaterThan(0);
      }
    });
  });
}
```

In `tests/e2e/journey/journey-helpers.ts`, change the first import to `import { expect, test, type Locator, type Page } from "@playwright/test";`, and replace `waitForLive` with:
```ts
/** The drawing is live and pinned: the scene loaded, the engine built, the chapter began. Where the browser cannot draw
 * it at all (a WebKit with no WebGL 2), the test skips there, saying so (skipWithoutWebgl2). */
export async function waitForLive(page: Page): Promise<void> {
  await waitForJourney(page);
  await skipWithoutWebgl2(page);
  await expect(page.locator("#anatomy")).toHaveClass(/is-live/, { timeout: 25_000 });
  await expect(page.locator("html")).toHaveAttribute("data-drawing", "live");
}

/** WebKit on a GPU-less Linux runner (the nightly's webkit projects, J6-12) may have no WebGL 2: there the live drawing
 * cannot be drawn at all, so a test that needs it skips, saying so, instead of failing on the missing context. One
 * place for every spec: waitForLive calls it (place, drawing-modes, night-falls), and live-drawing.spec.ts's own skip
 * reuses it. Chromium always runs them. */
export async function skipWithoutWebgl2(page: Page): Promise<void> {
  if (page.context().browser()?.browserType().name() !== "webkit") return;
  const webgl2 = await page.evaluate(() => document.createElement("canvas").getContext("webgl2") !== null);
  test.info().skip(!webgl2, "this WebKit has no WebGL 2: the live drawing is proven in Chromium and on the owner's devices");
}
```
In `tests/e2e/journey/live-drawing.spec.ts`, add `skipWithoutWebgl2` to the import from `./journey-helpers`, and add at the top, after the imports:
```ts
// Every test here needs the live drawing: in a WebKit with no WebGL 2 (J6-12) each skips before it starts, saying so,
// by the same check waitForLive makes.
test.beforeEach(async ({ page }) => skipWithoutWebgl2(page));
```
In `.gitignore`, under `# testing`, add `/playwright-report-nightly/`.

- [ ] **Step 5: Run the contract tests, then the nightly's specs here**

```bash
npx vitest run tests/unit/ci-workflows.contract.test.ts
node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/journey-nightly.yml','utf8')); console.log('parsed')"
npx playwright install webkit
lsof -nP -iTCP:4210 -sTCP:LISTEN
npx playwright test -c playwright.nightly.config.ts --project=sizes --grep "1440×900|390×844|844×390|2560×1440"
npx playwright test -c playwright.nightly.config.ts --project=screens
npx playwright test -c playwright.nightly.config.ts --project=webkit --project=webkit-phone
```
Expected:
- the contract tests PASS, and `parsed` prints;
- the sizes and screens runs pass. The photographs are in `test-results/`: look at the run's three and the drawing's four, in each face. 844×390 at 200% text is the longest sweep (the shortest window over the tallest page): report its time, and if `collisionsTopToBottom` throws its 400-position cap anywhere, report the size. Do not raise the cap or coarsen the step by guesswork;
- the WebKit projects run on this Mac's WebKit. Report every failure with its test and message:
  - a real WebKit fault (sticky with `overflow: clip`, `svh`, root scroll snapping, View Transitions: §8's list) is fixed in this task if it is small;
  - otherwise it is reported to the owner, with the spec named, and not skipped silently.
- `playwright install webkit` downloads Playwright's own pinned WebKit build (about 90 MB) into `~/Library/Caches/ms-playwright`. It is not a project dependency.

- [ ] **Step 6: The spec says what the nightly does, and what it cannot**

In `docs/superpowers/specs/2026-09-24-landing-journey-design.md`:
- §5, replace the **Nightly** bullet with:
  ```markdown
  - **Nightly** (`.github/workflows/journey-nightly.yml`, same pinning and permissions rules as CI; J6-3). It runs at
    03:00 IST, by hand, and on the pull request that changes it. It has two jobs:
    - **production**, on this checkout's production build served on the runner with sample data and nothing live
      (`scripts/serve-local-production.mjs`: `LOCAL_FIXTURE`, every credential blanked, an offline guard in the server;
      J6-2):
      - the chunk budgets;
      - the production-build smoke: the security policy on "/" scrolled end to end, no other host, a sample check,
        nothing refused by the guard;
      - CDP-throttled runs at 4×, 6× and 10× on the runner's software GPU. These fail only on what holds on any
        machine: another host, CLS, an undecided drawing, and at 10× a governor that never answered. They print
        startup tasks and scroll frames without judging them;
    - **journey**, on the fixture-mode `next dev`:
      - collisions at 15 sizes (1440×900, 1280×720, 1024×768, 768×1024, 390×844, 360×740, 320×568, 844×390,
        667×375, 280×653, 1280×600, 1180×820, 820×1180, 1920×1080, 2560×1440), and at 200% text at 1440×900,
        390×844 and 844×390;
      - screenshots of every chapter in Day, Night and on a phone;
      - the place, run, Night falls and drawing specs in WebKit.

    GitHub's runners have no GPU, so §3.H's frame-time and long-task budgets are measured by hand on a real GPU
    (`npm run build && node scripts/journey-perf.mjs`, the owner's Mac), and their lines go into every journey PR.
  ```
- §7, replace "Decide whether the nightly workflow may run on a schedule (it costs CI minutes)." with "Decide whether the nightly workflow may run on a schedule. J6 ships it at 03:00 IST: the repository is public, so its Actions minutes are free (J6-11). Removing the two `schedule` lines keeps it manual."
- §8, replace the rows:
  - "iOS Safari: …" → mitigation "The place, run, Night falls and drawing specs in WebKit, desktop and phone, in the nightly run; every test that needs the live drawing skips, saying why, where that WebKit has no WebGL 2; static fallbacks";
  - "CI e2e time grows" → mitigation "Four Playwright shards and the console suite in parallel on every PR (J6-1); heavy suites nightly";
  - "Bundle creep" → mitigation "Budgets checked on every PR (`verify`) and in the nightly run; `experimental-analyze` in review".
- §9, replace "§3.H budgets met in the nightly run; no collisions at the 15 sizes or at 200% text in the journey's sections." with "§3.H's chunk budgets met on every PR and in the nightly run; its frame-time and long-task budgets met on a real GPU (`journey-perf.mjs`) before each journey PR merges; CLS and the governor held in the nightly's throttled runs; no collisions at the 15 sizes or at 200% text in the journey's sections."

- [ ] **Step 7: The gate, then commit**

```bash
npm run check
git add .github/workflows/journey-nightly.yml playwright.nightly.config.ts tests/e2e/nightly tests/e2e/journey/journey-helpers.ts tests/e2e/journey/live-drawing.spec.ts tests/unit/ci-workflows.contract.test.ts .gitignore docs/superpowers/specs/2026-09-24-landing-journey-design.md
git commit -m "ci(journey): the nightly: budgets, a production-build smoke, throttled runs, fifteen sizes, photographs and WebKit"
```

---

### Task 10: The record, and the whole suite

The spec keeps J6's rulings as it kept J3's to J5's, and the J6 row is marked done. Then the whole suite runs once on the final head.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-24-landing-journey-design.md` (§3.B, §3.F, §6)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing new.

- [ ] **Step 1: The spec's record**

In `docs/superpowers/specs/2026-09-24-landing-journey-design.md`:
- §3.B, the **Page (server)** item: replace "the run's window layers" with "the run's frame (its window's lines are drawn by `run.ts` from `geometry/run.ts`, since they follow the cards' measured widths; J6-6, accepted at J6's pre-flight)".
- §3.B, the module map's Client island row: delete `theme-sweep.ts` and add `keep-place.ts`. Under the table, add: "Night falls lives with the theme button, not the journey: `src/components/theme/night-falls.ts`, shared by every traveller page (J6-10, accepted at J6's pre-flight)."
- §3.F: after its last sentence, add "It runs on every traveller page where Motion is on (`html[data-motion="on"]`); the console, which has no Motion switch, always switches at once (J6-10)."
- §6: after "Decided while planning J5 (2026-09-27):" and its list, add:
  ```markdown
  Decided while planning J6 (2026-09-28):
  - CI's Playwright run in four shards, the console suite in its own job, one `e2e` gate; the chunk budgets on every PR (J6-1);
  - a production build serves the fixture only on this machine: `LOCAL_FIXTURE`, refused on Vercel and beside any live
    credential, with an offline guard in the server (J6-2);
  - the nightly measures what a GPU-less runner can; frame times and long tasks are measured by hand on a real GPU (J6-3);
  - one rule for where the reader goes, `readerPlace`, for every piece that changes height (J6-4);
  - `fit` judged before the scene is fetched, by a trial layout (J6-5);
  - the run's frame is server markup, its lines drawn by `run.ts` (J6-6; a departure from §3.B, accepted at J6's
    pre-flight); it pins by `#run.is-running` inside `keepPlace`, only while the reader is not below it (J6-7); links
    to 06 and 07 bring their stations to the window (J6-8);
  - J5-17 amended (the owner, 2026-09-28): only the reader's own scroll (a mostly vertical wheel that is not a
    pinch-zoom, a finger dragging, a scroll key outside a text field with no Alt, Ctrl or Meta) cancels the Back
    restore; a trackpad's swipe back, a tap and every other key leave it pending (J6-9);
  - Back into the run returns the reader where they left: a section riding it is read where `run.ts` says it stands
    (`data-run-at`), so a reader who left at 07 comes back to 07 (J6-9);
  - Night falls on every traveller page with Motion on, from the theme button's own module,
    `src/components/theme/night-falls.ts`, not the journey's `theme-sweep.ts` (J6-10; a departure from §3.B, accepted
    at J6's pre-flight);
  - the nightly on a schedule, and on the pull request that changes it (J6-11); WebKit in the nightly (J6-12); 200% text
    at the PR's three sizes (J6-13).
  ```
- §6's table, the J6 row: append " — done (J6)" to its Visible result, so it reads "v3 complete — done (J6)".

- [ ] **Step 2: The whole gate and the whole suite**

```bash
npm run check
lsof -nP -iTCP:4210 -sTCP:LISTEN
npx playwright test
npm run build && npx playwright test -c playwright.production.config.ts
node scripts/journey-budgets.mjs
node scripts/journey-perf.mjs --software
```
Expected: green. Report every failure with its test name and message, and investigate it. The last full run on `main` was #83's: 549 passed, 0 failed.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-24-landing-journey-design.md
git commit -m "docs(journey): J6's rulings in the spec, and v3 complete"
```

## Finish: proof, then the owner's word

- [ ] `npm run check`, `npx playwright test` and the production smoke are green on the final head. Report failures as they are.
- [ ] **The chunks.** `npm run build && node scripts/journey-budgets.mjs`: report both numbers (J5: journey 38.5 KB, scene 156.0 KB).
- [ ] **three.js stays behind the door.**
  - `grep -rln 'from "three' src --include='*.ts' --include='*.tsx' | grep -v "/scene/"` prints nothing.
  - `grep -rn 'import("./scene/live")' src` prints only `drawing.ts`.
- [ ] **No hex where the constraints forbid it.** This prints nothing:
  ```bash
  grep -rnE "#[0-9a-fA-F]{3,6}\b|0x[0-9a-fA-F]{6}" src/components/landing/journey/scene src/components/landing/journey/{governor,live-labels,hud,run}.ts src/components/landing/journey/geometry/run.ts src/components/theme/night-falls.ts scripts/bake
  ```
- [ ] **`LOCAL_FIXTURE` is set in one place.** `grep -rn "LOCAL_FIXTURE" --exclude-dir=node_modules --exclude-dir=.next . | grep -v "^./docs/"` lists only these, and no `.env*` file:
  - `src/services/env.ts`;
  - `tests/unit/services/env.test.ts`;
  - `scripts/serve-local-production.mjs`;
  - `tests/unit/scripts/serve-local-production.test.ts`;
  - `tests/unit/ci-workflows.contract.test.ts`.
- [ ] **On a real GPU** (the owner's Mac: the spec's reference desktop and 4× CPU phone, §3.H), in this worktree, which has no `.env` file (the serve script refuses a working tree that has one, such as the primary checkout). Check `lsof -nP -iTCP:4210 -sTCP:LISTEN`, then run `npm run build && node scripts/journey-perf.mjs` twice. Report both runs' lines as measured, over budget or not. The run adds a pinned piece below the drawing and the scroll test crosses only `#anatomy`, so also report one run of the same script with `#anatomy` replaced by `#run` in `scrollThrough`: a scratch copy in the session's scratchpad, never in the repo.
- [ ] **Screenshots** into the workspace:
  - the run at progress 0, 0.5 and 1, at 1440×900 in Day and Night, and at 390×844;
  - Night falls mid-sweep: a screenshot taken 300 ms after the click, where the fixed wait is itself the evidence;
  - v3's run at the same three moments, for comparison.
- [ ] **The owner's device check.** On a preview deployment, on an iPhone (Safari) and a mid-range Android phone:
  - the run: pinning, a swipe settling a card at the window, a link from the board;
  - Night falls;
  - a reload at `/#principles` (J6-4);
  - Back to "/" (J6-9): with no scroll, it lands on the stored place, a trackpad's swipe back included; from 07 in the run, it returns to 07.
- [ ] **Push and open the PR only on the owner's word.** Then read the first CI run:
  - each `e2e shard n/4` well inside 20 minutes;
  - `console` green;
  - `e2e` green;
  - the nightly's own run on the PR (it changes the workflow), `production` and `journey 1–3`, with its WebKit results read one by one.

## What remains after J6

- v3 is complete on the landing. What the spec asked and J6 did not do is ruled out above (J6-15's table), each with its reason.
- The owner answered the plan's questions on 2026-09-28, and the PR repeats the answers:
  - the nightly runs on its 03:00 IST schedule (§7; J6-11);
  - the still keeps J5's behaviour until the pin after `place` clears (J5 final review, minor 8);
  - only the reader's own scroll cancels the Back restore (J5 Task 5; J6-9).

## Self-review notes

1. **Spec coverage:**
   - §3.A's 06–07 row: Tasks 5 and 6. The Page-wide row (Night falls): Task 7.
   - The fit rule: Task 4. The section-entrance rule: kept, since `arrivals.ts`'s `#features article` rows still rise.
   - §3.B's module map: Tasks 5 and 6, with Night falls moved (Task 10).
   - §3.C: Task 4. §3.F: Task 7. §3.H: Tasks 1, 8 and 9, and the Finish.
   - §3.G:
     - run links and Tab: Task 6;
     - focus never under the masthead: Task 6's Tab test;
     - 44px: `tap-targets.spec.ts` in Task 6's run;
     - forced colours: Task 4.
   - §5's open PR items:
     - run keyboard and station links: Task 6;
     - theme sweep: Task 7;
     - axe at run, Night run and phone run: Task 6.

     The Nightly: Task 9. §7's schedule: Task 9, and the owner's (2026-09-28). §8's WebKit, CI time and CSP smoke: Tasks 1, 2 and 9. §9: Tasks 9 and 10.
2. **J5's inheritance:**
   - Night falls sends `tt:theme` after `themeApplied`: Task 7.
   - The nightly runs the budgets and the 4×, 6× and 10× checks, governor steps counted from `tt.q`: Tasks 8 and 9.
   - The dev probe is absent in production: Task 2's smoke never uses it, and asserts so.
   - WebKit runs `live-drawing` and `drawing-modes`: Task 9.
   - SwiftShader: the fixture's hold on the floor stays for the PR run; the nightly's software run leaves the governor free.
   - The fit check before the import: Task 4.
   - The run measures, never assumes: `scrollIntoRun`, `offTrain`.
3. **Types:** every name a later task uses is produced above it:
   - `readerPlace`, `pastShift`, `keepPlace` and `mastheadBottom` (Task 3), used by Task 6;
   - `RunLayout`, `layers` and the rest (Task 5), used by Task 6;
   - `LANDING_INSTRUMENTS` and `scrollIntoRun` (Task 6), used by Task 9;
   - `startLocalProduction` and `refusals` (Task 2), used by Task 8;
   - `place-memory.ts`'s `ownScroll` (Task 3), beside which Task 6 adds `topOf`;
   - `softwareFailures` (Task 8), whose CLI Task 9 runs;
   - `HUD_CHUNK_MARK` (Task 8).
4. No commit carries a `Co-Authored-By` or any trailer: `git log --format=%B origin/main..HEAD | grep -ci co-authored-by` prints `0`.
5. Every rule J6 adds to `journey-island.css` starts with `html[data-journey="on"]`. J6's addition to `journey.css` needs no JavaScript. The sweep's rules in `motion.css` key on `html[data-theme-sweep]`.
6. No task edits a file in `BAKE_SOURCES`, so no re-bake.
