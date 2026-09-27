# Landing journey J5: the train, drawn live — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw the train live on the landing. The three.js drawing arrives in its own chunk, on demand. The drawing chapter (GA) pins while a scan gate turns the steel locomotive into its drawing; it comes apart into its ten labelled parts, shows its dimensions, takes its coaches and pulls away past the line side with a horn; the terminus draws the arrived train. Every reason not to draw live settles on J4's still drawing, with the reason recorded.

**Architecture:**
- **Two chunks, one door.** The journey chunk (Anime.js and the journey modules, no three.js) reaches the live drawing only through `import("./scene/live")` in `drawing.ts`. Everything that imports `three` sits behind that door: the engine, palette, fit, scan, line side, glow, beam, and the live chapter with its labels.
- **Prepare, then begin.** `drawing.ts` prepares the live drawing (the chunk, then the engine, built a part at a time) as soon as nothing but the reader's place holds it back. It begins it (the pin, the views, the labels) inside `keepPlace`, the one owner of the live pin's height changes.
- **One engine per journey.** The engine lives on `JourneyContext` (`scene`, a `Kept`) for one `startJourney`. Rebuilds and WebGL restores reuse it; `atEnd` disposes it when the journey ends. Its canvas sits in `#app-root`, hidden whenever the drawing is not live.
- **The labels have their own writers while live.** The pin's `data-live`, a transform and a clip wipe per label, and their own leader `<svg>`. `still.ts` stands aside the moment it hears the drawing go live.

**Tech Stack:**
- `three@0.186.0` (installed by J4), `animejs@4.5.0`;
- Next.js 16.3.4, React 19.2, Tailwind 4;
- Vitest 4 (`*.test.ts` in node, `*.test.tsx` in jsdom);
- Playwright 1.62. Its headless Chromium has WebGL 2 through SwiftShader, with `WEBGL_lose_context` (checked 2026-09-27 on this machine). CI's Linux runners are expected to match; Task 7 Step 1 proves it there.

No new dependency.

**Spec:** `docs/superpowers/specs/2026-09-24-landing-journey-design.md`. The sections that bind J5:
- §3.A: the drawn train and terminus rows, and the section-entrance rule;
- §3.B: the three layers, State and its events, the module map;
- §3.C: drawing modes and adaptive quality;
- §3.D: the still (J5 re-bakes it);
- §3.E–H: scene colours, Night, accessibility, budgets;
- §4: failures;
- §5: tests;
- §6: the J5 row and the J3/J4 rulings;
- §7: the owner's real-device check before J5 merges;
- §8: risks;
- §9: acceptance.

**Reference (read-only):**
- **Prototype v3 source:** `/private/tmp/claude-501/-Users-heytherevibin-Downloads-Code-Dev-trackandtrace/34a2c8a3-8fc3-4ec4-9ffd-8bf48c6af4ce/scratchpad/train-proto/src/js/`, below called `V3/`. The live drawing is `V3/journey.js`, `V3/scene/{engine,scan,departure,beam,fit}.js`, `V3/governor.js`, `V3/labels.js`, `V3/drawing.js`, `V3/sound.js` and `V3/hud.js`. Its CSS is `V3/../proto.css` (from line 129), `V3/../fit.css` and `V3/../still.css`.
- **Digests,** in the same scratchpad: `j4-v3-digest.md` §4 (fit), §10 (the strip hand-off, now void), §11 (tokens), §12 (gotchas); `j4-code-digest.md`. They predate J4's build, so check anything you use against the code on the branch.
- **The J4 plan's "What J5 inherits"** (`docs/superpowers/plans/2026-09-26-journey-j4-drawing.md`, its last section). Every item there is placed in a task below.

## Before Task 1: the rail is gone

The owner removed the route rail (the left column, its train glyph and odometer, and the phone rail; #77) in #80 (e7ae65e), which merged before J5 began; this branch is on `main` after it. This plan is written for a page with no rail.
- Before Task 1: `npm ci` and `npm run check`. Expected: green.
- No task touches what the removal left behind: `train-glyph.tsx` survives #80 (the how-it-works and route-map figures use it) and stays as it is; `station-progress.ts` is `STATION_EVENT`'s source now (Task 4 only rewords that event's comment).

## Rulings made while planning J5

Each ruling has an id (J5-n) and says what it costs if wrong. Task 10 writes rulings 1–5, 8 and 10 into the spec.

1. **No hand-off to the strip.** The rail is gone (owner, 2026-09-27), so "the strip glyph takes over" (spec §3.A; J3-8, J4-5) is void. The departure ends as the train leaves the frame with the camera letting it go. `tt:depart` (at progress 0.88) and the horn stay. *Cost if wrong: whatever replaces the rail adds its own hand-off.*
2. **A seventh reason, `place`.** It holds while the reader is below the chapter's top when the live drawing would begin, and clears when they come back above it. This is J3's rule for #how: pinning never grows a section under the reader. While `place` is the only reason, the scene still loads and builds in the background, so the switch is immediate when it clears. *Cost if wrong: a reader landing mid-page (a hash link, a Back return) sees the still until they scroll back up to GA.*
3. **One owner of the live pin's height changes.** That owner is `keepPlace` in `drawing.ts`, with a pure rule, `placeAfter` (`still.ts` keeps compensating its own still-mode columns while the drawing is still, as J4 did; J5-5):
   - the chapter's top is visible, or below: nothing moves;
   - the reader is inside the chapter (its top gone above, over half the window still in it): they go to its start, as J4 did;
   - the reader is past it (its bottom within the window's top half): they move by exactly the change.

   The pin is the class `#anatomy.is-live`. Only `drawing.ts` writes it, always inside `keepPlace`, including on teardown while the section is still in the document. It is never gated on `data-motion`, so a Motion toggle's collapse happens inside `keepPlace` too. *Cost if wrong: a reader past the chapter is moved by the wrong amount on a switch.*
4. **One engine per `startJourney`.** It is a `Kept` on the context (J4's lesson: the chunk outlives a client navigation). Rebuilds and WebGL restores reuse it, and `ctx.atEnd` disposes it when the journey ends; `atEnd` after the end runs at once, so a late engine is still disposed. The canvas `#journey-canvas` stays in `#app-root` for the engine's life, `hidden` while not live, because a detached canvas may never hear its context restored. *Cost if wrong: one WebGL context held until the journey ends.*
5. **The labels have their own writers while live.**
   - The pin gets `data-live="columns"|"list"` and `data-compact`.
   - Each label is placed and revealed by `transform` and a `clip-path` wipe: never opacity (text moves by transform only) and never `visibility` (the labels stay the page's real list for screen readers).
   - The leaders go in their own `svg.live-lines`.
   - `still.ts` stands aside the moment it hears the drawing go live, and never compensates the reader's place while live.
   - J4's column CSS is shared through `:is(.is-columns, [data-live="columns"])`.

   *Cost if wrong: two CSS vocabularies for one look.*
6. **The dimension figures, the caption and the nameboard land** (J4-5's deferral). Their words are verbatim from v3, in `messages.home.drawing`: "≈ 20 560 mm", "≈ 4 255 mm", "Scroll · the drawing turns, comes apart, couples up and departs", "PLATFORM 3" and "DEPARTURES". The figures reveal by the same wipe. The caption shows only in live columns. *Cost if wrong: none; they are v3's.*
7. **A parts list standing beside the drawing no longer fades.** On a phone on its side, v3 faded it as the train pulled away, which is text opacity. It keeps its ground now, and the train passes behind it. *Cost if wrong: the drive's last frames are hidden behind the list on landscape phones.*
8. **The palette reads four tokens:** `--surface-0`, `--ink-1`, `--accent` and `--accent-text`. §3.E also lists `--line`, but the scene's hairline weights are its own opacities, so it has no use.
   - The scan's shades are mixed. By Day: dark = mix(accent, ink, 0.4) and light = mix(accent, ground, 0.5). At Night: dark = mix(accent, ground, 0.5) and light = mix(accent, ink, 0.3). The gate is `--accent-text`.
   - The lit part is `--accent` by Day and `--accent-text` at Night, as v3 had it.
   - Colours are set in sRGB (`setRGB(r, g, b, SRGBColorSpace)`), as v3's hex strings were.
   - Night's ink weights are 0.74, 0.13 and 0.40 (v3; the still's own `--still-line` is 0.74).

   *Cost if wrong: steel shades a few percent off v3's.*
9. **Theme.** The live drawing re-reads its palette when `<html data-theme>` changes (a MutationObserver). On `tt:theme` it re-reads and redraws synchronously; that is the hook J6's Night falls calls as `journey.redrawNow()`. *Cost if wrong: J6 adds the event's first sender, which was planned anyway.*
10. **The frame meter ships in J5.** Spec §7 asks the owner to try J5 on a real phone with it before J5 merges. The server passes `hud` (`VERCEL_ENV === "preview"`, or development) to `JourneyLoader`; only then does `?journey-hud` import `hud.ts`, which is its own chunk. Production never renders it. Its strings are a review tool's, not traveller copy, so they live in `hud.ts`, and it reads the quality step from `tt.q`. *Cost if wrong: a small chunk J6 would otherwise add.*
11. **The 20 s `load` limit covers the scene chunk's import only.** The engine build that follows yields every part and has no limit. The first rejection is logged with `console.warn` (J4's parked note). *Cost if wrong: a very slow device builds for longer before the governor judges it.*
12. **The PR e2e runs on CI's SwiftShader,** so it proves the live drawing draws and behaves, but not how fast. Frame-time budgets for the live drawing are measured on a real GPU in the Finish, and nightly in J6. PR specs about the still (J4's `drawing.spec.ts`, the columns collisions) pin the still with `tt.q = "still"` (the `drawStill` helper). *Cost if wrong: a CI-only slowdown shows up as a governor step, which the specs tolerate.*
13. **A dev-only probe.** Outside production builds, `window.__ttJourney` exposes the progress, the quality step, Night, the drawing's box and how much of a stage it inked. Production never defines it. *Cost if wrong: e2e reads a hook that production lacks, so only production-build smoke tests (J6) cannot use it.*
14. **The scene chunk is found by `SCENE_CHUNK_MARK`** (`scene/scene-mark.ts`, no three), which `scene/live.ts` re-exports, as J4 did with the journey chunk. *Cost if wrong: none.*
15. **Budgets are checked by `scripts/journey-budgets.mjs`** after `npm run build`: the journey chunk at most 70 KB gzip, the scene chunks at most 240 KB, and no three.js in the journey chunk. It runs in the Finish, and J6 wires it into the nightly. *Cost if wrong: a chunk split differently than the marks expect is under-counted; the e2e "no three.js on a still page" check stays the real guard.*
16. **The bake minors and `sourceHash`'s coverage land in Task 1, with one re-bake.** `sourceHash` now also covers three's version and the driver. The driver bakes every shape into memory and writes only when all of them succeeded. *Cost if wrong: none.*
17. **`place-memory.ts` samples on the Navigation API's `navigate` event** (except reloads) instead of on every click. That event fires before any navigation, while the sections still exist and the entry being left is current, which is also the likeliest cure for Back→Forward→Back. Task 5 proves it with a failing e2e first; if that e2e stays red, stop and report rather than guess a second fix.
    - A reader's own wheel, touch or key before the restore cancels it.
    - `parsePlace` refuses an empty entry.

    *Cost if wrong: one more investigation round on Back→Forward→Back.*
18. **The horn sounds once per visit** (`tt.horn` in sessionStorage), on `tt:depart`, only while Sound is on and the audio context is running after the reader's own gesture. It is marked as sounded only once it has actually played. The numbers are v3's. *Cost if wrong: none.*
19. **The chapters place guard refreshes its box on `tt:layout`** while #how's own size is unchanged. The live drawing grows and shrinks #anatomy above #how, which moves #how's document box without resizing it. *Cost if wrong: a Motion toggle inside a pinned 02 lands the reader at the wrong place.*
20. **The glow sprites are built by the live engine only** (`scene/glow.ts`: a canvas texture needs a document). They hang on `rig.cabFront` and the new `rig.pantoHead`. The bake never sees them. *Cost if wrong: none.*
21. **Forced colours.** The live drawing then reads the system's own colours (Canvas, CanvasText, Highlight, LinkText) through a probe element, as the still's `currentColor` does, and follows the setting's change (spec §3.G, "forced colours read in both system themes"). *Cost if wrong: a forced-colours reader sees author colours on a system ground.*

### Pre-flight amendments (2026-09-27)

The controller's pre-flight scan raised 25 findings; each ruling below is already carried into the tasks, the constraints and Task 10's spec edits.
1. The rail went with #80 before J5 began: "Before Task 1" says so, and Task 10 has no rail precondition.
2. `still.test.tsx` stubs no `ResizeObserver`: `tests/setup.ts` defines it (Task 6).
3. Task 10's context restore narrows the extension by its method through `Reflect`, not `instanceof WEBGL_lose_context` (an interface, not a constructor).
4. The probe's test is `webgl-probe.test.tsx`, for jsdom (Task 6).
5. Task 10 replaces §3.A's struck strip clause with "and leaves the frame (J5-1)".
6. J5-2 stands: the three.js constraint below, and spec §3.B item 3 and §3.C (Task 10), allow the scene to prepare while `place` is the only reason.
7. The governor waits 45 frames after every change, up or down, as spec §3.C says (Task 2's code and test).
8. The frame meter stays on previews and in development (J5-10); Task 10 amends spec §2 and §7 to match.
9. Task 10 rewrites spec §3.B's live gate to name `#anatomy.is-live` (with `data-drawing="live"` alongside) instead of adding a second clause.
10. `still.ts` gates `leave` as it gates `enter`; `live-labels.clear()` leaves `.is-hot` to `scene/live.ts` (Tasks 6, 7).
11. `scene/live.ts` owns `#journey-canvas`'s creation, `hidden` and removal; the engine exposes `canvas` read-only and owns its buffer and context (Tasks 4, 7; the one-writer list).
12. Task 7 states `drawing-modes.spec.ts`'s full import list and adds `drawStill` to `drawing.spec.ts` and `collisions.spec.ts` with the specs that use it; Task 10 adds only `blockSceneChunk` and `drawStill` to `drawing-modes.spec.ts`.
13. Task 6 migrates each context to `testContext({ motion, intro, result })`, keeping hero.test's shared `kept` and strokes.test's `intro: true`.
14. The 20 s limit is proved with fake timers and an import that never settles (`sceneLoader`, Task 7); the frame meter's text is asserted in its unit test and its corner in its e2e (Task 9).
15. One `storedQuality` (exported by `drawing.ts`), one `blockChunk(page, mark)` under `blockJourneyChunk`/`blockSceneChunk`, and one `radialTexture` under `glowTexture`/`poolTexture` (Tasks 3, 6, 7).
16. E2E waits are `frames(page, n)` (Task 5's helper) or `expect.poll` on state; only Task 10's three 1.5 s "nothing downloads" windows stay, each saying why.
17. `placeBox` and `lastScrollY` move into `startPlaceGuard`'s closure, and `settlePlace` takes and returns them (Task 5).
18. The Gating constraint allows the page's no-JavaScript default, ungated, in `journey.css`.
19. The import constraint allows `./` and one-level `../` inside `src/components/landing/journey/`; `@/` across directories; never two levels.
20. Task 1 passes three's version to all four `sourceHash` calls, and its re-bake accepts either renamed SVGs or only a changed manifest.
21. J5-3 names one owner of the live pin's height changes; `still.ts` still compensates its own still-mode columns.
22. The frame meter's clipboard guard is in its code (Task 9).
23. `playwright.config.ts` is in Task 7's file list and `git add`, for the SwiftShader flag if CI needs it.
24. `tt.q`'s two writers (the floor in `drawing.ts`, the level in the governor) are named in the one-writer list.
25. Task 4 rewords `STATION_EVENT`'s comment to name `station-progress.ts` as its source.

## Global Constraints

- **Next.js.** It is Next.js 16.3.4: read `AGENTS.md` and the relevant guide in `node_modules/next/dist/docs/` before writing Next-specific code (the loader, the page prop, the dynamic import).
- **Code rules.**
  - TypeScript strict, with no `any`; use `unknown` and narrowing.
  - Imports: `@/` across directories. Inside `src/components/landing/journey/` (the existing code's style), `./` and one-level `../` are allowed (`scene/*.ts` importing `../pose`, say); never two levels (`../../`). Tests import `src` by `@/`, and tests of `scripts/*.mjs` import them relatively (`../../../scripts/…`), as the existing script tests do. Task 1's `../train-parts` → `@/` conversion in `rig.ts` stays (the bake's esbuild resolves `@/`).
  - Prefer `const`; use `let` only in loops and closures that need it.
  - Every file stays under 500 lines, `scripts/**/*.mjs` included.
- **TDD.** Write the failing test first, and watch it fail for the right reason before implementing.
- **Pins.** `three` stays `0.186.0` and `animejs` stays `4.5.0`. Add no dependency.
- **three.js only in the scene chunk.** Only `src/components/landing/journey/scene/*.ts` and `scripts/bake/page.ts` import `"three"`. The journey chunk reaches the scene only through the dynamic `import("./scene/live")` in `drawing.ts`. Type-only imports (`import type`) are allowed anywhere. A still page never downloads three.js, except while `place` is the only reason, when the scene prepares in the background (J5-2), or when the scene's own fit check finds the drawing cannot fit its window (it needs the scene to measure).
- **Budgets, verbatim from spec §3.H:**
  - Journey chunk ≤ 70 KB compressed;
  - Scene chunk ≤ 240 KB compressed, live only, except while `place` is the only reason, or when the scene's own fit check finds the drawing cannot fit its window (§3.C);
  - Still drawings ≤ 60 KB compressed per page;
  - Longest journey task at load, 4× CPU phone ≤ 120 ms (scene steps ≤ 61 ms);
  - Scroll, reference desktop: p95 ≤ 12 ms, 0% > 25 ms;
  - Scroll, 4× CPU phone: median ≥ 55 fps, ≤ 2% > 33 ms;
  - Layout shift at load: CLS ≤ 0.05;
  - Drawing progress never steps back while scrolling down.
- **No hex in the scene** (§3.E). Colours come from the theme's tokens through `scene/palette.ts`, and three.js colours are made with `new Color().setRGB(…)`. The grep in the Finish covers `scene/`, `scripts/bake/`, `governor.ts`, `live-labels.ts` and `hud.ts`.
- **Journey state lives per `startJourney`,** as a `Kept` or `atEnd` on the context, never at module level. The chunk survives client navigation.
- **Text moves by transform only, never opacity.** That covers labels, figures, caption and legend. Decoration (leaders, dots, the canvas, sprites) may fade.
- **Every reason not to draw live settles on the still,** with `data-drawing="still"` and its reason in `data-drawing-why`: Motion off, reduced motion, Data Saver, no WebGL, a lost GPU, the quality floor, a failed load, `fit` and `place`.
- **One writer per attribute:**
  - React owns the still's `<use href>`s;
  - `drawing.ts` owns `#anatomy.is-live`, `data-drawing` and `data-drawing-why`;
  - `still.ts` owns `.is-columns`, `.is-compact`, the labels' `style.top`, the still holder's box and `svg.callout-lines`;
  - `live-labels.ts` owns `data-live`, `data-compact`, `--anatomy-copy-h`, the labels' `transform` and `clip-path`, and `svg.live-lines`;
  - `.is-hot` is written by whichever of `still.ts` and `scene/live.ts` matches the current drawing: `still.ts`'s pointer handlers act only while `data-drawing="still"` (its one `light(null)` as it stands aside hands the labels over clean), and `live-labels.ts` never writes it;
  - `scene/live.ts` owns the dimension figures' `transform` and `clip-path`;
  - `scene/live.ts` owns the `#journey-canvas` element: its creation, its `hidden` and its removal. The engine owns its drawing buffer and WebGL context, and reads the element only;
  - `tt.q` (sessionStorage) has two writers, in turn: `drawing.ts` stores the floor (`"still"`), and the governor (in `scene/live.ts`) stores its level. `drawing.ts` and `scene/live.ts` read it through the one `storedQuality()` in `drawing.ts`; the frame meter reads it for display only.
- **Gating.** Journey-only CSS rules are gated: each starts with `html[data-journey="on"]` and lives in `src/styles/journey-island.css`. A rule that is the page's no-JavaScript default layout lives ungated in `src/styles/journey.css` (Task 7's `.anatomy-stage, .anatomy-caption, .dim-label { display: none; }`, as J4's `.callout-lines, .title-block` rule is). A failed journey writes only `data-journey="failed"` (J3-1).
- **Copy** is verbatim from v3. Travellers never see provider names.
- **Tests.**
  - E2E specs import `{ test, expect }` from `tests/e2e/fixtures`.
  - Any e2e that waits on `terminal-result` asserts `data-kind`.
  - E2E code in this plan waits on state (`frames(page, n)`, `expect.poll`, an attribute), never a fixed time, except a window that is itself the assertion ("nothing downloads"), which says so in a comment.
  - Run Playwright only in this worktree, on port 4210 (check `lsof -nP -iTCP:4210 -sTCP:LISTEN` first), in fixture mode.
  - Never send a sample PNR to a live site. Never touch port 3100 or the primary checkout `/Users/heytherevibin/Downloads/Code/Dev/trackandtrace`.
- **The bake.** Editing any file in `BAKE_SOURCES` means re-baking (`npm run bake:stills`, on this Mac's GPU) and committing its outputs in the same commit; the `sourceHash` test enforces it. Only Task 1 edits bake sources.
- **The gate.** Run `npm run check` (the whole gate) before every commit, and the full `npx playwright test` in Task 10.
- **Commits.** Conventional commits, with no `Co-Authored-By` or any other attribution trailer. Never commit `.env*`, secrets or `settings.local.json`.

## File structure

| File | Responsibility | Task |
|---|---|---|
| `src/components/landing/journey/scene/{rig,rig-parts,lines,world}.ts`, `pose.ts` | `rig.loco`, `rig.pantoHead`, the parts check, Night weights and `restyle`, `buildWorldAsync`; the queued bake minors | 1 |
| `scripts/bake/{page,trace}.ts`, `scripts/bake/emit.mjs`, `scripts/bake-train-stills.mjs` | background guard, `half`, key checks, `sourceHash` over three and the driver, bake then write | 1 |
| `src/components/landing/journey/still-manifest.ts`, `public/journey/*.svg` | **regenerated** by the bake | 1 |
| `src/components/landing/journey/scene/palette.ts` | tokens → the scene's colours (pure, no three) | 2 |
| `src/components/landing/journey/governor.ts` | adaptive quality (pure) | 2 |
| `src/components/landing/journey/scene/fit.ts` | the camera fit, `projectTo` | 2 |
| `src/components/landing/journey/scene/{scan,departure,glow,beam}.ts` | the scan gate, the line side and nameboard, the Night glow, the headlight beam | 3 |
| `src/components/landing/journey/scene/engine.ts`, `journey-events.ts` (`tt:webgl`; `tt:station`'s comment) | the renderer, views, quality, palette, context loss, warm-up, picking | 4 |
| `src/components/landing/journey/chapters.ts`, `place-memory.ts`, `tests/e2e/journey/journey-helpers.ts` (`frames`) | the guard's layout refresh, its state in its closure; the parked place minors; the e2e frame wait | 5 |
| `src/components/landing/journey/{drawing,drawing-mode,start-journey,still}.ts`, `webgl-probe.ts` | prepare/begin, `place`, WebGL, `placeAfter`, the engine's lifetime, still.ts standing aside | 6 |
| `src/components/landing/journey/scene/{scene-mark,live}.ts`, `live-labels.ts`, `journey-events.ts` (`tt:depart`, `tt:theme`) | the live chapter and terminus; the labels while live | 7 |
| `src/components/landing/journey/drawing-chapter.tsx`, `src/messages/en-IN/home.ts`, `src/styles/journey{,-island}.css` | the stage, figures, caption and nameboard words; the live layout | 7 |
| `src/components/landing/journey/sound.ts` | the departure horn | 8 |
| `src/components/landing/journey/{hud,hud-gate}.ts`, `journey-loader.tsx`, `src/app/(site)/page.tsx` | the frame meter, previews only | 9 |
| `scripts/journey-budgets.mjs` | the chunk budgets after a build | 10 |
| `tests/e2e/journey/{live-drawing,place}.spec.ts` and the existing journey specs | live, collisions, every mode, axe | 5, 7, 10 |

---

### Task 1: The shared scene, readied for the live drawing, and baked again

Everything J5 needs from the bake sources, in one commit with one re-bake: the locomotive and the pantograph head for the scan and the glow, Night's ink weights and a restyle for theme changes, an async world build, and every bake-source minor J4 queued (J5-16).

**Files:**
- Modify: `src/components/landing/journey/scene/rig.ts`, `scene/rig-parts.ts`, `scene/lines.ts`, `scene/world.ts`, `pose.ts`
- Modify: `scripts/bake/page.ts`, `scripts/bake/trace.ts`, `scripts/bake/emit.mjs`, `scripts/bake-train-stills.mjs`
- Regenerate: `src/components/landing/journey/still-manifest.ts`, `public/journey/*.svg`
- Test: `tests/unit/components/landing/journey/scene/{rig,lines,world}.test.ts`, `tests/unit/scripts/{bake-emit,bake-trace}.test.ts`

**Interfaces:**
- Consumes: J4's scene (`rigSteps`, `buildRig`, `createStyle`, `buildWorld`, `applyPose`).
- Produces:
  - `rig.ts`: `RIG_PARTS: readonly RigPartId[]`, `isRigPart(v: string): v is RigPartId`, `allParts(parts: Partial<Record<RigPartId, RigPart>>): Record<RigPartId, RigPart>`; `Rig` gains `readonly loco: Group` and `readonly pantoHead: Group`.
  - `rig-parts.ts`: `Pantograph` gains `readonly head: Group`.
  - `lines.ts`: `NIGHT_OPACITY: LineOpacity` (0.74, 0.13, 0.40); `restyle(style: LineStyle, palette: Palette, opacity: LineOpacity): void`.
  - `world.ts`: `type Pause = () => Promise<void>`; `buildWorldAsync(palette: Palette, options: { readonly coaches?: number; readonly opacity?: LineOpacity }, pause: Pause): Promise<World>`.
  - `trace.ts`: `half` (was `f1`).
  - `emit.mjs`: `threeVersion(root)`; `sourceHash(root, files = BAKE_SOURCES, three = threeVersion(root))`; `BAKE_SOURCES` gains `"scripts/bake-train-stills.mjs"`.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/components/landing/journey/scene/rig.test.ts`, add `Object3D` to the `three` import and `allParts, RIG_PARTS` to the rig import, then add:
```ts
  it("exposes the locomotive and the trailing pantograph's head, for the scan and the glow (J5)", () => {
    expect(rig.loco.parent).toBe(rig.group);
    for (const id of RIG_PARTS) expect(rig.parts[id].obj.parent).toBe(rig.loco);
    const chain: Object3D[] = [];
    for (let o: Object3D | null = rig.pantoHead; o; o = o.parent) chain.push(o);
    expect(chain).toContain(rig.parts.pantoRear.obj);
  });

  it("refuses a rig missing any of its eleven parts", () => {
    const ten = Object.fromEntries(Object.entries(rig.parts).filter(([id]) => id !== "tanks"));
    expect(() => allParts(ten)).toThrow(/tanks/);
    expect(Object.keys(allParts(rig.parts)).sort()).toEqual([...RIG_PARTS].sort());
  });
```
In `tests/unit/components/landing/journey/scene/lines.test.ts`, add `NIGHT_OPACITY, restyle` to the lines import, and add:
```ts
  it("restyles its materials in place for another palette and weights, so a theme change needs no rebuild", () => {
    const style = createStyle(PALETTE);
    const line = style.line;
    const white = new Color(1, 1, 1);
    const steel = new Color(0.5, 0.6, 0.7);
    restyle(style, { ground: white, ink: white, steel, steelText: white }, NIGHT_OPACITY);
    expect(style.line).toBe(line);
    expect(style.fill.color.equals(white)).toBe(true);
    for (const m of [style.line, style.faint, style.near]) expect(m.color.equals(white)).toBe(true);
    expect([style.line.opacity, style.faint.opacity, style.near.opacity]).toEqual([0.74, 0.13, 0.4]);
    expect(style.accent.color.equals(steel)).toBe(true);
    expect(style.dim.color.equals(white)).toBe(true);
  });
```
In the same file, replace the cast at `const [fill, edges] = (drawing as Group).children;` with:
```ts
    if (!(drawing instanceof Group)) throw new Error("the drawing is not a group");
    const [fill, edges] = drawing.children;
```
In `tests/unit/components/landing/journey/scene/world.test.ts`, import `buildWorldAsync` beside `buildWorld`, and add:
```ts
  it("builds the same world a part at a time, yielding to the page between parts (J5)", async () => {
    let pauses = 0;
    const built = await buildWorldAsync(PALETTE, { coaches: 2 }, async () => {
      pauses += 1;
    });
    expect(pauses).toBeGreaterThanOrEqual(8);
    expect(built.rig.coaches).toHaveLength(2);
    expect(built.rig.group.parent).toBe(built.scene);
    expect(built.scene.getObjectByName("wires")).toBeDefined();
    expect(built.scene.background).toBeNull();
  });
```
In `tests/unit/scripts/bake-emit.test.ts`:
- Add `mkdirSync` to the `node:fs` import, and `BAKE_SOURCES` to the emit import.
- Pass `"0.186.0"` as a third argument to all four existing `sourceHash(root, [...])` calls (its lines 40, 43, 45 and 47), since the temporary root has no `node_modules/three`.
- Add:
```ts
  it("hashes three's version too, and counts the bake's own driver among its sources", () => {
    expect(BAKE_SOURCES).toContain("scripts/bake-train-stills.mjs");
    const root = mkdtempSync(join(tmpdir(), "bake-"));
    writeFileSync(join(root, "a.ts"), "one");
    mkdirSync(join(root, "node_modules/three"), { recursive: true });
    writeFileSync(join(root, "node_modules/three/package.json"), JSON.stringify({ version: "0.186.0" }));
    const before = sourceHash(root, ["a.ts"]);
    expect(before).toBe(sourceHash(root, ["a.ts"], "0.186.0"));
    writeFileSync(join(root, "node_modules/three/package.json"), JSON.stringify({ version: "0.187.0" }));
    expect(sourceHash(root, ["a.ts"])).not.toBe(before);
  });

  it("refuses a path keyed with no known line class", () => {
    expect(() => shapeSvg({ "shell|bold": "M0 0l1 0" })).toThrow(/line class/);
    expect(() => shapeSvg({ shell: "M0 0l1 0" })).toThrow(/line class/);
  });
```
In `tests/unit/scripts/bake-trace.test.ts`, rename `f1` to `half` in the import and in the rounding test.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/unit/components/landing/journey/scene tests/unit/scripts/bake-emit.test.ts tests/unit/scripts/bake-trace.test.ts`
Expected: FAIL. `rig.loco`, `RIG_PARTS`, `allParts`, `restyle`, `NIGHT_OPACITY`, `buildWorldAsync` and `half` are not exported; the `sourceHash`/`shapeSvg` tests fail.

- [ ] **Step 3: Implement**

`scene/rig-parts.ts`:
- Move the header comment ("Builders for the drawn train's parts…") above the imports.
- Type the placeholder map once: `export const M: MaterialMap = new Proxy<MaterialMap>({}, { get: () => PLACEHOLDER });`
- `Pantograph` gains the head:
```ts
export interface Pantograph {
  readonly group: Group;
  /** The collector head, where the Night glow hangs (J5). */
  readonly head: Group;
  readonly set: (t: number) => void;
}
```
- `pantograph()` returns `{ group: g, head, set }`.

`scene/rig.ts`:
- Move the header comment above the imports.
- Import `@/components/landing/journey/train-parts` instead of `../train-parts` (the bake's esbuild resolves `@/` through `tsconfig.json`, as `page.ts` already shows). Add `CALLOUT_PARTS` to that import.
- Add, after the `RigPart` interface:
```ts
/** The rig's eleven parts: the ten the labels name, and the tanks. */
export const RIG_PARTS: readonly RigPartId[] = [...CALLOUT_PARTS, "tanks"];

export function isRigPart(v: string): v is RigPartId {
  return RIG_PARTS.some((id) => id === v);
}

/** The parts record, checked whole: a builder that forgot a part fails here, not as an undefined later. */
export function allParts(parts: Partial<Record<RigPartId, RigPart>>): Record<RigPartId, RigPart> {
  const missing = RIG_PARTS.filter((id) => !parts[id]);
  if (missing.length) throw new Error(`rig: missing ${missing.join(", ")}`);
  return Object.fromEntries(RIG_PARTS.map((id) => [id, parts[id]])) as Record<RigPartId, RigPart>;
}
```
  The one `as` is safe: every key was just checked.
- Add to the `Rig` interface:
```ts
  /** The locomotive's own group (every part hangs on it): the scan reads its fills (J5). */
  readonly loco: Group;
  /** The trailing pantograph's collector head: the Night glow hangs on it (J5). */
  readonly pantoHead: Group;
```
- In `rigSteps`, replace `const rigParts = parts as Record<RigPartId, RigPart>;` with `const rigParts = allParts(parts);`, and add `loco,` and `pantoHead: pantos[1].head,` to `out.rig`.
- Replace `buildRig`'s loop:
```ts
export function buildRig(style: LineStyle, opts: { readonly coaches?: number } = {}): Rig {
  const out: { rig?: Rig } = {};
  const steps = rigSteps(style, opts, out);
  let done = false;
  while (!done) done = steps.next().done === true;
  if (!out.rig) throw new Error("rig: buildRig finished without producing a rig");
  return out.rig;
}
```

`scene/lines.ts`:
- After `DAY_OPACITY`, add:
```ts
/** Night's ink weights (v3): lighter lines on the dark sheet. The still takes its own from CSS (--still-line). */
export const NIGHT_OPACITY: LineOpacity = { line: 0.74, faint: 0.13, near: 0.4 };

/** Recolours the drawing's shared materials in place: a theme change needs no rebuild (J5). */
export function restyle(style: LineStyle, palette: Palette, opacity: LineOpacity): void {
  style.fill.color.copy(palette.ground);
  for (const [m, o] of [[style.line, opacity.line], [style.faint, opacity.faint], [style.near, opacity.near]] as const) {
    m.color.copy(palette.ink);
    m.opacity = o;
  }
  style.accent.color.copy(palette.steel);
  style.dim.color.copy(palette.steelText);
}
```
- In `drawHierarchy`, check the parent before building the drawing, and word the error for the function, not the rig:
```ts
  for (const m of meshes) {
    const parent = m.parent;
    if (!parent) throw new Error("drawHierarchy: a mesh has no parent to receive its drawing");
    const d = drawn(m.geometry, style, opts);
    d.position.copy(m.position);
    d.quaternion.copy(m.quaternion);
    d.scale.copy(m.scale);
    parent.add(d);
    parent.remove(m);
  }
```

`scene/world.ts`: replace the body below `LINE_TO` with the following, keeping the file's header comment and adding `rigSteps`, `type LineOpacity` and `DAY_OPACITY` to its imports:
```ts
function assemble(palette: Palette, style: LineStyle, rig: Rig): World {
  const scene = new Scene();
  scene.fog = new Fog(palette.ground, 60, 260);
  scene.add(buildLine(style, LINE_FROM, LINE_TO));
  scene.add(rig.group);
  return { scene, camera: new PerspectiveCamera(30, 1, 0.5, 900), rig, style };
}

export function buildWorld(palette: Palette, { coaches = 3 }: { readonly coaches?: number } = {}): World {
  const style = createStyle(palette);
  return assemble(palette, style, buildRig(style, { coaches }));
}

/** Waits for the page between steps (a frame, or scheduler.yield). */
export type Pause = () => Promise<void>;

/** The same world, a part at a time (spec §3.B: ≤ 61 ms per step at 4× CPU), for the live drawing (J5). */
export async function buildWorldAsync(palette: Palette, { coaches = 3, opacity = DAY_OPACITY }: { readonly coaches?: number; readonly opacity?: LineOpacity }, pause: Pause): Promise<World> {
  const style = createStyle(palette, opacity);
  const out: { rig?: Rig } = {};
  const steps = rigSteps(style, { coaches }, out);
  while (!steps.next().done) await pause();
  if (!out.rig) throw new Error("world: the rig's steps finished without a rig");
  return assemble(palette, style, out.rig);
}
```

`pose.ts`: above `orbit`, add `// z adds target[2], which v3 omitted: inert while every target's z is 0.`

`scripts/bake/trace.ts`: rename `f1` to `half` (declaration and uses).

`scripts/bake/page.ts`:
- Import `half` instead of `f1`, and use it in both places.
- Replace `renderer.setClearColor(0x000000, 0);` with `renderer.setClearColor(new Color(0, 0, 0), 0);`.
- Before `const canvas = document.createElement("canvas");`, add:
```ts
  // Hidden-line removal needs nothing painted behind the fills: a background would fill the ID pass's pixels.
  if (scene.background !== null) throw new Error("bake: the scene has a background; hidden-line removal needs none");
```

`scripts/bake/emit.mjs`:
- Add `"scripts/bake-train-stills.mjs"` to the end of `BAKE_SOURCES`.
- Replace `sourceHash` with:
```js
/** @param {string} root */
export function threeVersion(root) {
  return JSON.parse(readFileSync(join(root, "node_modules/three/package.json"), "utf8")).version;
}

/** @param {string} root @param {readonly string[]} [files] @param {string} [three] */
export function sourceHash(root, files = BAKE_SOURCES, three = threeVersion(root)) {
  const hash = createHash("sha256");
  hash.update(`three@${three}\0`);
  for (const file of files) hash.update(`${file}\0${readFileSync(join(root, file), "utf8").replace(/\r\n/g, "\n")}\0`);
  return hash.digest("hex").slice(0, 16);
}
```
- In `shapeSvg`, check each key:
```js
/** @param {string} key */
function classOf(key) {
  const [part, cls] = key.split("|");
  if (!part || cls === undefined || !Object.hasOwn(WEIGHT, cls)) throw new Error(`shapeSvg: "${key}" names no line class (line, faint or near)`);
  return cls;
}
```
  and use `WEIGHT[classOf(key)]` in place of `WEIGHT[key.split("|")[1]]`.

`scripts/bake-train-stills.mjs`: bake every shape into memory first, and write only when all succeeded. Replace the block from `rmSync(OUT…)` to the manifest write with:
```js
  const outputs = [];
  const shapes = {};
  for (const [name, shape] of Object.entries(SHAPES)) {
    const t0 = Date.now();
    const result = await page.evaluate((config) => window.bake(config), { kind: shape.kind, W: shape.W, H: shape.H });
    const svg = shapeSvg(result.paths);
    const file = `${shape.file}.${contentHash(svg)}.svg`;
    outputs.push([file, svg]);
    shapes[name] = { href: `/journey/${file}`, viewBox: result.viewBox, parts: partsOf(result.paths), anchors: result.anchors };
    console.log(`${name}: ${result.segments} edges, ${result.runs} visible stretches, ${(svg.length / 1024).toFixed(0)} KB, ${(gzipSync(svg).length / 1024).toFixed(1)} KB gzip (${Date.now() - t0} ms)`);
  }
  if (errors.length) throw new Error(`the bake page failed: ${errors.join("; ")}`);
  // Only now, with every shape in hand, replace what is on disk: a failed bake leaves the last good one.
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  for (const [file, svg] of outputs) writeFileSync(join(OUT, file), svg);
  writeFileSync(MANIFEST, manifestSource({ sourceHash: sourceHash(ROOT), shapes }));
```

- [ ] **Step 4: Run the unit tests**

Run: `npx vitest run tests/unit/components/landing/journey/scene tests/unit/scripts`
Expected: the new tests PASS. `bake-stills.test.ts`'s "were baked from today's scene sources" FAILS, because the sources changed. That failure is the point: the next step re-bakes.

- [ ] **Step 5: Re-bake, and read what changed**

Run: `npm run bake:stills`
Expected: four lines, each with its edge and stretch counts and gzip size (each under 34 KB). The rig's geometry did not change, so each shape's size should be within a few bytes of J4's.

Then run `git status --short public/journey src/components/landing/journey/still-manifest.ts`. Expected: the manifest changed (its `sourceHash` is new). Either outcome for `public/journey` is right: no change, because the edits (comments, names, key checks, `new Color`) leave every SVG's bytes and so its hashed name the same; or four new files and four removed, if the SVG bytes moved at all. If any shape's gzip size moved by more than 1 KB, stop and report: only comments, names and checks changed, so the drawing should not have.

- [ ] **Step 6: The whole gate, then commit**

```bash
npm run check
git add src/components/landing/journey/scene src/components/landing/journey/pose.ts src/components/landing/journey/still-manifest.ts public/journey scripts/bake scripts/bake-train-stills.mjs tests/unit/components/landing/journey/scene tests/unit/scripts
git commit -m "refactor(journey): ready the shared scene for the live drawing, and bake the stills again"
```

---

### Task 2: The live drawing's pure parts: palette, governor and camera fit

Three units the engine and the live chapter lean on, each with its own tests:
- the palette turns the theme's tokens into the scene's colours (J5-8);
- the governor is v3's adaptive quality (§3.C);
- the fit is v3's camera fit, which keeps the drawing inside the room the words leave (J4 digest §4).

**Files:**
- Create: `src/components/landing/journey/scene/palette.ts`, `src/components/landing/journey/governor.ts`, `src/components/landing/journey/scene/fit.ts`
- Test: `tests/unit/components/landing/journey/scene/palette.test.ts`, `tests/unit/components/landing/journey/governor.test.ts`, `tests/unit/components/landing/journey/scene/fit.test.ts`

**Interfaces:**
- Consumes: `buildRig`, `Rig`, `RigPartId` (Task 1); `Box` from `labels-layout.ts`; `lerp` from `scene/math.ts`.
- Produces:
  - `palette.ts` (no three): `interface Rgb { r; g; b }` (0..1, sRGB); `interface ScenePalette { night; ground; ink; steel; steelText; scanDark; scanLight }`; `PALETTE_TOKENS`; `type PaletteToken`; `parseColor(raw: string): Rgb | null`; `mix(a: Rgb, b: Rgb, t: number): Rgb`; `readPalette(read: (token: PaletteToken) => string, night: boolean): ScenePalette | null`; `tokenReader(root?: Element): (token: PaletteToken) => string`; `SYSTEM_COLOURS`; `systemReader(resolve?: (keyword: string) => string): (token: PaletteToken) => string` (forced colours, J5-21); `cssRgb(c: Rgb): string`.
  - `governor.ts` (pure): `LONG_MS = 26`, `SLOW_MS = 40`, `PACE_MS = 18.5`; `interface Governor { level(): number; drew(now: number): void; idle(): void }`; `createGovernor(options: { levels; start?; set(level); floor() }): Governor`; `startLevel(stored: string | null, levels: number): number`.
  - `fit.ts`: `interface Rect { x; y; w; h }` (viewport CSS px); `interface ScreenPoint { x; y }`; `projectTo(point: Vector3, camera: Camera, rect: Rect, out?: Vector3): ScreenPoint`; `interface FitOptions { across; panto; target: Vector3; center? }`; `interface Fit { screenBox(camera: PerspectiveCamera, rect: Rect, panto: number): Box; apply(camera: PerspectiveCamera, rect: Rect, zone: Box | null, options: FitOptions): void }`; `createFit(rig: Rig): Fit`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/components/landing/journey/scene/palette.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PALETTE_TOKENS, cssRgb, mix, parseColor, readPalette, systemReader, type PaletteToken, type Rgb } from "@/components/landing/journey/scene/palette";

const byte = (c: Rgb) => [c.r, c.g, c.b].map((v) => Math.round(v * 255));

describe("parseColor", () => {
  it("reads the theme's token formats", () => {
    expect(byte(parseColor("#f2f2f3")!)).toEqual([242, 242, 243]);
    expect(byte(parseColor("  #FFF ")!)).toEqual([255, 255, 255]);
    expect(byte(parseColor("rgba(29, 31, 32, 0.16)")!)).toEqual([29, 31, 32]);
    expect(byte(parseColor("rgb(89 128 166 / 50%)")!)).toEqual([89, 128, 166]);
  });
  it("is nothing for anything else", () => {
    for (const raw of ["", "steel", "#12", "#1234567", "oklch(0.7 0.1 250)", "rgb(300, 0, 0)"]) expect(parseColor(raw), raw).toBeNull();
  });
});

describe("readPalette (J5-8)", () => {
  const day: Record<PaletteToken, string> = { "--surface-0": "#f2f2f3", "--ink-1": "#1d1f20", "--accent": "#5980a6", "--accent-text": "#416180" };
  const night: Record<PaletteToken, string> = { "--surface-0": "#000000", "--ink-1": "#ededed", "--accent": "#5980a6", "--accent-text": "#b5d9fd" };

  it("lights the part in the accent by Day, and in the accent's text colour at Night", () => {
    expect(byte(readPalette((t) => day[t], false)!.steel)).toEqual([89, 128, 166]);
    expect(byte(readPalette((t) => night[t], true)!.steel)).toEqual([181, 217, 253]);
  });

  it("mixes the scan's steel from the accent, toward ink and ground", () => {
    const d = readPalette((t) => day[t], false)!;
    expect(byte(d.scanDark)).toEqual([65, 89, 112]);
    expect(byte(d.scanLight)).toEqual([165, 185, 205]);
    const n = readPalette((t) => night[t], true)!;
    expect(byte(n.scanDark)).toEqual([45, 64, 83]);
    expect(byte(n.scanLight)).toEqual([133, 161, 187]);
  });

  it("is nothing when a token does not parse", () => {
    expect(readPalette((t) => (t === "--accent" ? "oklch(0.7 0.1 250)" : day[t]), false)).toBeNull();
  });

  it("reads both of the app's themes as they are written today", () => {
    const css = readFileSync(join(__dirname, "../../../../../../src/styles/theme.css"), "utf8");
    const values = (token: string) => [...css.matchAll(new RegExp(`${token}:\\s*([^;]+);`, "g"))].map((m) => m[1]!.trim());
    for (const theme of [0, 1]) {
      const read = (t: PaletteToken) => values(t)[theme] ?? "";
      expect(readPalette(read, theme === 1), `theme ${theme}`).not.toBeNull();
    }
    expect(PALETTE_TOKENS).toEqual(["--surface-0", "--ink-1", "--accent", "--accent-text"]);
  });

  it("reads the system's own colours under forced colours, as the still's currentColor does (spec §3.G; J5-21)", () => {
    const asked: string[] = [];
    const read = systemReader((keyword) => {
      asked.push(keyword);
      return "rgb(0, 0, 0)";
    });
    expect(readPalette(read, false)).not.toBeNull();
    expect(asked).toEqual(["Canvas", "CanvasText", "Highlight", "LinkText"]);
  });

  it("writes a colour back for a canvas", () => {
    expect(cssRgb(mix({ r: 0, g: 0, b: 0 }, { r: 1, g: 1, b: 1 }, 0.5))).toBe("rgb(128 128 128)");
  });
});
```
Check the relative path depth to `src/styles/theme.css` against the other tests in that folder before running.

`tests/unit/components/landing/journey/governor.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { createGovernor, startLevel } from "@/components/landing/journey/governor";

function run(levels = 3, start = 0) {
  const sets: number[] = [];
  let floors = 0;
  let t = 1000;
  const g = createGovernor({ levels, start, set: (l) => sets.push(l), floor: () => (floors += 1) });
  const feed = (n: number, gap: number) => {
    for (let i = 0; i < n; i += 1) {
      t += gap;
      g.drew(t);
    }
  };
  return { g, sets, feed, floors: () => floors };
}

describe("the governor (spec §3.C; v3's governor.js)", () => {
  it("holds at the display's pace", () => {
    const { sets, feed, floors } = run();
    feed(400, 16);
    expect(sets).toEqual([]);
    expect(floors()).toBe(0);
  });

  it("steps down when a gesture's p90 runs over 26 ms, judging again only after 45 frames", () => {
    const { sets, feed } = run();
    feed(31, 30); // the first frame only starts the clock; 30 gaps later it judges
    expect(sets).toEqual([1]);
    feed(45, 30); // cooling down
    expect(sets).toEqual([1]);
    feed(1, 30);
    expect(sets).toEqual([1, 2]);
  });

  it("asks for the still drawing only when the lowest step still runs over 40 ms", () => {
    const { sets, feed, floors } = run(3, 2);
    feed(31, 30);
    expect(floors()).toBe(0);
    expect(sets).toEqual([]);
    feed(46, 45);
    expect(floors()).toBe(1);
  });

  it("never counts a pause between gestures, or a stall that is not the drawing's", () => {
    const { g, sets, feed } = run();
    feed(200, 200);
    g.drew(99_000);
    g.idle();
    g.drew(99_030);
    expect(sets).toEqual([]);
  });

  it("steps back up after 180 good judgements, at most twice", () => {
    const { sets, feed } = run(4, 3);
    feed(211, 16);
    expect(sets).toEqual([2]);
    feed(45 + 181, 16); // 45 frames' cool-down after the step up, then 181 good judgements
    expect(sets).toEqual([2, 1]);
    feed(1000, 16);
    expect(sets).toEqual([2, 1]);
  });

  it("starts from this session's step, or full quality", () => {
    expect(startLevel("2", 3)).toBe(2);
    for (const stored of [null, "still", "7", "-1", "1.5"]) expect(startLevel(stored, 3), String(stored)).toBe(0);
  });
});
```

`tests/unit/components/landing/journey/scene/fit.test.ts`:
```ts
import { BoxGeometry, Color, Group, Mesh, PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { STILL_ANATOMY, anatomyPose } from "@/components/landing/journey/pose";
import { createFit, projectTo, type Rect } from "@/components/landing/journey/scene/fit";
import { createStyle } from "@/components/landing/journey/scene/lines";
import { buildRig } from "@/components/landing/journey/scene/rig";

const INK = new Color(0, 0, 0);
const rig = buildRig(createStyle({ ground: INK, ink: INK, steel: INK, steelText: INK }), { coaches: 1 });
const camera = new PerspectiveCamera(30, 2, 0.5, 900);
const rect: Rect = { x: 0, y: 0, w: 1000, h: 500 };

function pose(p: number) {
  const a = anatomyPose(p, 2);
  rig.setExplode(a.explode);
  rig.setPantograph(a.panto);
  camera.fov = a.fov;
  camera.position.set(...a.pos);
  camera.lookAt(...a.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return a;
}

describe("the camera fit (v3's scene/fit.js)", () => {
  it("projects a world point into a view's rectangle", () => {
    pose(STILL_ANATOMY);
    const at = projectTo(new Vector3(...anatomyPose(STILL_ANATOMY, 2).target), camera, rect);
    expect(at.x).toBeCloseTo(500, 0);
    expect(at.y).toBeCloseTo(250, 0);
  });

  it("pulls back and slides until the drawing sits inside the zone the words leave", () => {
    const fit = createFit(rig);
    const a = pose(STILL_ANATOMY);
    const zone = { l: 300, t: 150, r: 700, b: 350 };
    const before = fit.screenBox(camera, rect, a.panto);
    expect(before.r - before.l).toBeGreaterThan(zone.r - zone.l);
    fit.apply(camera, rect, zone, { across: 1, panto: a.panto, target: new Vector3(...a.target) });
    const after = fit.screenBox(camera, rect, a.panto);
    expect(after.l).toBeGreaterThanOrEqual(zone.l - 2);
    expect(after.r).toBeLessThanOrEqual(zone.r + 2);
    expect(after.t).toBeGreaterThanOrEqual(zone.t - 2);
    expect(after.b).toBeLessThanOrEqual(zone.b + 2);
  });

  it("leaves the camera alone when the zone is under 80px tall, or missing", () => {
    const fit = createFit(rig);
    const a = pose(STILL_ANATOMY);
    const at = camera.position.clone();
    fit.apply(camera, rect, { l: 0, t: 0, r: 1000, b: 60 }, { across: 1, panto: a.panto, target: new Vector3(...a.target) });
    fit.apply(camera, rect, null, { across: 1, panto: a.panto, target: new Vector3(...a.target) });
    expect(camera.position.equals(at)).toBe(true);
  });

  it("never counts what hangs on a part but is not the drawing (userData.noFit: the beam)", () => {
    pose(STILL_ANATOMY);
    const before = createFit(rig).screenBox(camera, rect, 0);
    const light = new Group();
    light.userData.noFit = true;
    light.add(new Mesh(new BoxGeometry(80, 80, 80)));
    rig.parts.cabFront.obj.add(light);
    const after = createFit(rig).screenBox(camera, rect, 0);
    rig.parts.cabFront.obj.remove(light);
    expect(after).toEqual(before);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/unit/components/landing/journey/scene/palette.test.ts tests/unit/components/landing/journey/governor.test.ts tests/unit/components/landing/journey/scene/fit.test.ts`
Expected: FAIL. The three modules do not exist.

- [ ] **Step 3: Implement**

`src/components/landing/journey/scene/palette.ts`:
```ts
// The live drawing's colours from the theme's own tokens (spec §3.E; J5-8): the sheet, the ink, the steel accent and
// its text colour, and the scan's steel shades mixed from them. No hex and no three.js here: the engine turns these
// into three.js colours (in sRGB), and re-reads them whenever the theme changes.

/** A colour as sRGB channels, 0..1. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface ScenePalette {
  readonly night: boolean;
  /** --surface-0: the fills that hide lines behind them, and the fog. */
  readonly ground: Rgb;
  /** --ink-1: every hairline, and the nameboard's letters. */
  readonly ink: Rgb;
  /** The lit part: --accent by Day, --accent-text at Night (v3). */
  readonly steel: Rgb;
  /** --accent-text: the dimension lines, the scan's gate, the glow and the beam. */
  readonly steelText: Rgb;
  readonly scanDark: Rgb;
  readonly scanLight: Rgb;
}

export const PALETTE_TOKENS = ["--surface-0", "--ink-1", "--accent", "--accent-text"] as const;
export type PaletteToken = (typeof PALETTE_TOKENS)[number];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*[\d.]+%?)?\s*\)$/i;

export function parseColor(raw: string): Rgb | null {
  const value = raw.trim();
  const hex = HEX.exec(value)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
    const channel = (i: number) => Number.parseInt(full.slice(i, i + 2), 16) / 255;
    return { r: channel(0), g: channel(2), b: channel(4) };
  }
  const fn = RGB.exec(value);
  if (!fn) return null;
  const [r = Number.NaN, g = Number.NaN, b = Number.NaN] = [fn[1], fn[2], fn[3]].map((c) => Number(c) / 255);
  return [r, g, b].every((c) => Number.isFinite(c) && c >= 0 && c <= 1) ? { r, g, b } : null;
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

/** The scene's palette from four tokens; null when any of them is not a colour this parser reads. */
export function readPalette(read: (token: PaletteToken) => string, night: boolean): ScenePalette | null {
  const [ground, ink, accent, accentText] = PALETTE_TOKENS.map((token) => parseColor(read(token)));
  if (!ground || !ink || !accent || !accentText) return null;
  return {
    night,
    ground,
    ink,
    steel: night ? accentText : accent,
    steelText: accentText,
    scanDark: night ? mix(accent, ground, 0.5) : mix(accent, ink, 0.4),
    scanLight: night ? mix(accent, ink, 0.3) : mix(accent, ground, 0.5),
  };
}

/** Reads the tokens as the page resolves them now. */
export function tokenReader(root: Element = document.documentElement): (token: PaletteToken) => string {
  const style = getComputedStyle(root);
  return (token) => style.getPropertyValue(token);
}

/** Forced colours (spec §3.G; J5-21): the system's own colours stand in for the tokens, as currentColor does for the still. */
export const SYSTEM_COLOURS: Readonly<Record<PaletteToken, string>> = { "--surface-0": "Canvas", "--ink-1": "CanvasText", "--accent": "Highlight", "--accent-text": "LinkText" };

/** A system colour keyword as the page resolves it now, through a hidden probe. */
function computedColour(keyword: string): string {
  const probe = document.createElement("span");
  probe.style.display = "none";
  probe.style.color = keyword;
  document.body.append(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
}

export function systemReader(resolve: (keyword: string) => string = computedColour): (token: PaletteToken) => string {
  return (token) => resolve(SYSTEM_COLOURS[token]);
}

/** A colour for a 2D canvas (the nameboard). */
export function cssRgb({ r, g, b }: Rgb): string {
  return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
}
```

`src/components/landing/journey/governor.ts`:
```ts
// Adaptive quality (spec §3.C; prototype v3's governor.js). It watches the gaps between frames the drawing actually
// drew, only within one scroll gesture: a gap over 120 ms is a new gesture, and idle() says a frame went by with
// nothing to draw. The p90 of the last 30–40 gaps over 26 ms steps quality down; over 40 ms at the lowest step asks
// for the still drawing; under 18.5 ms for 180 judgements steps back up, at most twice. Each change waits 45 frames
// before judging again (spec §3.C; v3 waited 60 after a step up). Pure: the live chapter feeds it frames and acts on
// its answers.

export const LONG_MS = 26;
export const SLOW_MS = 40;
export const PACE_MS = 18.5;

export interface Governor {
  level(): number;
  /** A frame was drawn at `now` (the rAF time). */
  drew(now: number): void;
  /** A frame went by with nothing to draw: the gesture paused. */
  idle(): void;
}

export interface GovernorOptions {
  readonly levels: number;
  readonly start?: number;
  readonly set: (level: number) => void;
  readonly floor: () => void;
}

export function createGovernor({ levels, start = 0, set, floor }: GovernorOptions): Governor {
  let level = Math.max(0, Math.min(start, levels - 1));
  let last = 0;
  let cool = 0;
  let good = 0;
  let ups = 0;
  const win: number[] = [];
  const p90 = (): number => [...win].sort((a, b) => a - b)[Math.floor(win.length * 0.9)] ?? 0;
  return {
    level: () => level,
    drew(now) {
      const gap = last ? now - last : 0;
      last = now;
      if (!gap || gap > 120) return;
      win.push(gap);
      if (win.length > 40) win.shift();
      if (cool > 0) {
        cool -= 1;
        return;
      }
      if (win.length < 30) return;
      const slow = p90();
      if (slow > LONG_MS) {
        if (level < levels - 1) {
          level += 1;
          set(level);
        } else if (slow > SLOW_MS) floor();
        win.length = 0;
        cool = 45;
        good = 0;
      } else if (slow < PACE_MS && level > 0 && ups < 2) {
        good += 1;
        if (good > 180) {
          level -= 1;
          set(level);
          ups += 1;
          good = 0;
          cool = 45;
          win.length = 0;
        }
      } else good = 0;
    },
    idle() {
      last = 0;
    },
  };
}

/** This session's step (tt.q, a whole number below `levels`), or full quality. "still" is the drawing's reason, not a step. */
export function startLevel(stored: string | null, levels: number): number {
  const n = Number(stored);
  return stored !== null && Number.isInteger(n) && n >= 0 && n < levels ? n : 0;
}
```

`src/components/landing/journey/scene/fit.ts`: a typed port of `V3/scene/fit.js` (J4 digest §4.1 quotes it whole). Keep its comments; these are the only changes:
```ts
import { Box3, Line, Matrix4, Mesh, Vector3, type Camera, type Group, type Object3D, type PerspectiveCamera } from "three";
import type { Box } from "../labels-layout";
import { lerp } from "./math";
import type { Rig, RigPartId } from "./rig";

// Keeping the drawing clear of the words around it (prototype v3's scene/fit.js): each part's box is measured once in
// its own frame; each frame its corners are projected and, when the drawing reaches past the zone the page leaves it,
// the camera dollies back along its line of sight and slides only as far as it must. The result depends only on the
// pose, so scrolling back and forth lands on the same frame. Anything under a part flagged userData.noFit (the Night
// beam) is light, not the drawing, and never counts.

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}
export interface FitOptions {
  /** 0..1: how much the side limits hold (only while labels stand beside the drawing). */
  readonly across: number;
  readonly panto: number;
  /** The point the camera looks at; it moves with any slide. */
  readonly target: Vector3;
  /** 0..1: also slide the drawing to the zone's middle (narrow screens). */
  readonly center?: number;
}
export interface Fit {
  screenBox(camera: PerspectiveCamera, rect: Rect, panto: number): Box;
  apply(camera: PerspectiveCamera, rect: Rect, zone: Box | null, options: FitOptions): void;
}

/** Where a world point lands in a view's rectangle, in viewport CSS px. */
export function projectTo(point: Vector3, camera: Camera, rect: Rect, out = new Vector3()): ScreenPoint {
  out.copy(point).project(camera);
  return { x: rect.x + ((out.x + 1) / 2) * rect.w, y: rect.y + ((1 - out.y) / 2) * rect.h };
}

function lightOnly(o: Object3D, root: Object3D): boolean {
  for (let a: Object3D | null = o; a && a !== root; a = a.parent) if (a.userData.noFit === true) return true;
  return false;
}

function localBox(obj: Object3D): Box3 {
  obj.updateWorldMatrix(true, true);
  const inverse = obj.matrixWorld.clone().invert();
  const box = new Box3();
  const one = new Box3();
  const m = new Matrix4();
  obj.traverse((o) => {
    if (!(o instanceof Mesh || o instanceof Line) || lightOnly(o, obj)) return;
    const geometry = o.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox) return;
    m.multiplyMatrices(inverse, o.matrixWorld);
    box.union(one.copy(geometry.boundingBox).applyMatrix4(m));
  });
  return box;
}

interface Measured {
  readonly id: RigPartId;
  readonly obj: Group;
  readonly low: Box3;
  readonly high: Box3 | null;
}
```
Then `createFit`, v3's measurement and three-pass loop with types, and every scratch vector inside its closure (never at module level):
```ts
export function createFit(rig: Rig): Fit {
  rig.setPantograph(0);
  const lows = Object.values(rig.parts).map(({ id, obj }) => ({ id, obj, low: localBox(obj) }));
  // The trailing pantograph changes shape as it rises to the wire: measure it raised too, and blend.
  rig.setPantograph(1);
  const raised = localBox(rig.parts.pantoRear.obj);
  rig.setPantograph(0);
  const parts: readonly Measured[] = lows.map((p) => ({ ...p, high: p.id === "pantoRear" ? raised : null }));

  const box = new Box3();
  const corner = new Vector3();
  const projected = new Vector3();
  const right = new Vector3();
  const up = new Vector3();
  const offset = new Vector3();

  function screenBox(camera: PerspectiveCamera, rect: Rect, panto: number): Box {
    rig.group.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    let l = Infinity;
    let t = Infinity;
    let r = -Infinity;
    let b = -Infinity;
    for (const p of parts) {
      if (p.high) {
        box.min.lerpVectors(p.low.min, p.high.min, panto);
        box.max.lerpVectors(p.low.max, p.high.max, panto);
      } else box.copy(p.low);
      for (let i = 0; i < 8; i += 1) {
        corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(p.obj.matrixWorld);
        const s = projectTo(corner, camera, rect, projected);
        l = Math.min(l, s.x);
        r = Math.max(r, s.x);
        t = Math.min(t, s.y);
        b = Math.max(b, s.y);
      }
    }
    return { l, t, r, b };
  }

  function apply(camera: PerspectiveCamera, rect: Rect, zone: Box | null, { across, panto, target, center = 0 }: FitOptions): void {
    if (!zone) return;
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const zw = zone.r - zone.l;
    const zh = zone.b - zone.t;
    const useX = across > 0 && zw > 120;
    if (zh < 80) return;
    for (let pass = 0; pass < 3; pass += 1) {
      const s = screenBox(camera, rect, panto);
      let k = 1;
      if (useX) k = Math.max(k, lerp(1, (s.r - s.l) / zw, across));
      k = Math.max(k, (s.b - s.t) / zh);
      // where the box lands once the camera has pulled back by k, then the least slide that brings it in
      const l = cx + (s.l - cx) / k;
      const r = cx + (s.r - cx) / k;
      const t = cy + (s.t - cy) / k;
      const b = cy + (s.b - cy) / k;
      let dx = useX ? (Math.max(0, zone.l - l) - Math.max(0, r - zone.r)) * across : 0;
      let dy = Math.max(0, zone.t - t) - Math.max(0, b - zone.b);
      if (center > 0) {
        dy = lerp(dy, (zone.t + zone.b) / 2 - (t + b) / 2, center);
        if (useX) dx = lerp(dx, ((zone.l + zone.r) / 2 - (l + r) / 2) * across, center);
      }
      if (k < 1.0005 && Math.abs(dx) < 0.25 && Math.abs(dy) < 0.25) return;
      if (k > 1) camera.position.sub(target).multiplyScalar(k).add(target);
      if (dx || dy) {
        const dist = camera.position.distanceTo(target);
        const pxPerUnit = rect.h / (2 * dist * Math.tan((camera.fov * Math.PI) / 360));
        right.setFromMatrixColumn(camera.matrixWorld, 0);
        up.setFromMatrixColumn(camera.matrixWorld, 1);
        offset.copy(right).multiplyScalar(-dx / pxPerUnit).addScaledVector(up, dy / pxPerUnit);
        camera.position.add(offset);
        target.add(offset);
      }
    }
    camera.updateMatrixWorld();
  }

  return { screenBox, apply };
}
```
`i & 1` is v3's corner walk; if the lint forbids bitwise operators, use `i % 2`, `Math.floor(i / 2) % 2` and `Math.floor(i / 4) % 2` instead.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run tests/unit/components/landing/journey/scene/palette.test.ts tests/unit/components/landing/journey/governor.test.ts tests/unit/components/landing/journey/scene/fit.test.ts`
Expected: PASS.

If the fit's zone test is off by a few pixels, check that `screenBox` updates the rig's matrices first; v3's three passes converge within 1 px.

- [ ] **Step 5: The whole gate, then commit**

```bash
npm run check
git add src/components/landing/journey/scene/palette.ts src/components/landing/journey/governor.ts src/components/landing/journey/scene/fit.ts tests/unit/components/landing/journey/scene/palette.test.ts tests/unit/components/landing/journey/governor.test.ts tests/unit/components/landing/journey/scene/fit.test.ts
git commit -m "feat(journey): the live drawing's palette from the theme's tokens, its quality governor and its camera fit"
```

---
### Task 3: The scan gate, the line side, the glow and the headlight beam

The four things the live drawing adds to J4's world. Each is built in node, without a renderer, so each is unit-tested here. Anything that needs a document (a canvas texture) is made by a separate function the engine calls, and is passed in, so the tests pass a plain `Texture`.

**Files:**
- Create: `src/components/landing/journey/scene/scan.ts`, `scene/departure.ts`, `scene/glow.ts`, `scene/beam.ts`
- Test: `tests/unit/components/landing/journey/scene/live-parts.test.ts`

**Interfaces:**
- Consumes: `Rig` with `loco`, `pantoHead`, `cabFront` and `headlight` (Task 1); `LineStyle` (J4); `Rgb` and `cssRgb` (Task 2); `createFit` (Task 2, in the beam's test).
- Produces:
  - `scan.ts`: `interface Scan { readonly group: Group; set(t: number): void; setColors(dark: Color, light: Color, gate: Color, night: boolean): void }`; `createScan(rig: Rig, style: LineStyle): Scan`. `t` = 0 all solid, 1 all drawn.
  - `departure.ts`: `interface BoardFace { readonly texture: Texture; paint(ink: Rgb): void }`; `boardFace(words: { readonly platform: string; readonly departures: string }, family: string): BoardFace` (needs a document); `interface Departure { readonly group: Group; setInk(ink: Rgb): void }`; `buildDeparture(style: LineStyle, face: BoardFace): Departure`.
  - `glow.ts`: `radialTexture(stops: readonly (readonly [number, number])[]): Texture` (a white radial fade, `[offset, alpha]` stops; needs a document; the one texture helper both sprites and the pool use, J5 pre-flight #15); `glowTexture(): Texture` (needs a document); `interface Glow { set(on: boolean, headUp: boolean): void; setColor(c: Color): void }`; `createGlow(rig: Rig, texture: Texture): Glow`.
  - `beam.ts`: `poolTexture(): Texture` (glow.ts's `radialTexture` with its own stops; needs a document); `interface Beam { readonly group: Group; set(on: boolean, lit: number): void; setColor(c: Color): void }`; `createBeam(rig: Rig, pool: Texture): Beam`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/components/landing/journey/scene/live-parts.test.ts`:
```ts
import { Color, LineSegments, Mesh, PerspectiveCamera, Sprite, Texture, type Object3D } from "three";
import { describe, expect, it, vi } from "vitest";
import { STILL_ANATOMY, anatomyPose } from "@/components/landing/journey/pose";
import { createBeam } from "@/components/landing/journey/scene/beam";
import { buildDeparture, type BoardFace } from "@/components/landing/journey/scene/departure";
import { createFit } from "@/components/landing/journey/scene/fit";
import { createGlow } from "@/components/landing/journey/scene/glow";
import { createStyle } from "@/components/landing/journey/scene/lines";
import { buildRig } from "@/components/landing/journey/scene/rig";
import { createScan } from "@/components/landing/journey/scene/scan";

const INK = new Color(0, 0, 0);
const style = createStyle({ ground: INK, ink: INK, steel: INK, steelText: INK });
const rig = buildRig(style, { coaches: 1 });
const under = (o: Object3D, root: Object3D) => {
  for (let a: Object3D | null = o; a; a = a.parent) if (a === root) return true;
  return false;
};

describe("the scan gate (v3's scene/scan.js)", () => {
  const scan = createScan(rig, style);
  const skins: Mesh[] = [];
  rig.loco.traverse((o) => {
    if (o instanceof Mesh && o.material !== style.fill && o.parent instanceof Mesh) skins.push(o);
  });

  it("skins every fill of the locomotive with the steel solid, sharing its geometry", () => {
    expect(skins.length).toBeGreaterThan(10);
    for (const s of skins) expect(s.parent instanceof Mesh && s.geometry === s.parent.geometry).toBe(true);
  });

  it("stands solid before the scan, sweeps nose to tail, and leaves only the drawing", () => {
    scan.set(0);
    expect(skins.every((s) => s.visible)).toBe(true);
    expect(scan.group.visible).toBe(false);
    scan.set(0.5);
    expect(scan.group.visible).toBe(true);
    expect(scan.group.position.x).toBeCloseTo(1.2 + (-21.6 - 1.2) * 0.5, 6);
    scan.set(1);
    expect(skins.some((s) => s.visible)).toBe(false);
    expect(scan.group.visible).toBe(false);
  });
});

describe("the line side (v3's scene/departure.js)", () => {
  const face: BoardFace = { texture: new Texture(), paint: vi.fn() };
  const departure = buildDeparture(style, face);

  it("is hidden until the train pulls away, drawn in hairlines, with the nameboard's face", () => {
    expect(departure.group.visible).toBe(false);
    const materials = departure.group.children.flatMap((c) => (c instanceof LineSegments ? [c.material] : []));
    expect(materials).toEqual([style.near, style.line, style.line]);
    const board = departure.group.children.find((c) => c instanceof Mesh);
    expect(board instanceof Mesh && board.material).toHaveProperty("map", face.texture);
  });

  it("paints the nameboard in the ink it is given", () => {
    departure.setInk({ r: 1, g: 1, b: 1 });
    expect(face.paint).toHaveBeenCalledWith({ r: 1, g: 1, b: 1 });
  });
});

describe("the Night glow and the headlight beam", () => {
  it("hangs the glow on the headlight and on the raised pantograph's head", () => {
    const glow = createGlow(rig, new Texture());
    const sprites: Sprite[] = [];
    rig.group.traverse((o) => {
      if (o instanceof Sprite) sprites.push(o);
    });
    expect(sprites.some((s) => under(s, rig.cabFront))).toBe(true);
    const head = sprites.find((s) => under(s, rig.pantoHead));
    expect(head).toBeDefined();
    glow.set(true, false);
    expect(head?.visible).toBe(false);
    expect((sprites[0]!.material).opacity).toBe(0.9);
    glow.set(false, true);
    expect(head?.visible).toBe(true);
    expect((sprites[0]!.material).opacity).toBe(0);
  });

  it("throws the beam from the front cab, only while lit, and never counts it in the camera fit", () => {
    const camera = new PerspectiveCamera(30, 2, 0.5, 900);
    const pose = anatomyPose(STILL_ANATOMY, 2);
    camera.position.set(...pose.pos);
    camera.lookAt(...pose.target);
    const rect = { x: 0, y: 0, w: 1000, h: 500 };
    const before = createFit(rig).screenBox(camera, rect, 0);
    const beam = createBeam(rig, new Texture());
    expect(beam.group.parent).toBe(rig.cabFront);
    expect(beam.group.userData.noFit).toBe(true);
    beam.set(true, 0);
    expect(beam.group.visible).toBe(false);
    beam.set(true, 1);
    expect(beam.group.visible).toBe(true);
    beam.set(false, 1);
    expect(beam.group.visible).toBe(false);
    expect(createFit(rig).screenBox(camera, rect, 0)).toEqual(before);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/components/landing/journey/scene/live-parts.test.ts`
Expected: FAIL. The four modules do not exist.

- [ ] **Step 3: Implement**

`src/components/landing/journey/scene/scan.ts`, from `V3/scene/scan.js`. The shaders, `NOSE_X = 1.2`, `TAIL_X = -21.6` and the gate's geometry are verbatim; the colours are passed in:
```ts
import { Color, DoubleSide, Float32BufferAttribute, Group, BufferGeometry, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Plane, PlaneGeometry, ShaderMaterial, Vector3 } from "three";
import type { LineStyle } from "./lines";
import type { Rig } from "./rig";

// The scan reveal (spec §3.A; prototype v3's scene/scan.js): the locomotive first stands as a solid steel form, and
// as the chapter begins a scan gate sweeps it nose to tail, leaving the hairline drawing behind. The solid is the
// drawing's own fill geometry, flat-shaded in steel and clipped to the side of the gate not yet scanned; it sits a
// hair in front of the drawing, so it hides the edges beneath it. Its colours are the palette's (J5-8).

const NOSE_X = 1.2;
const TAIL_X = -21.6;

const vertex = /* glsl */ `
  #include <common>
  #include <clipping_planes_pars_vertex>
  varying vec3 vViewPosition;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;
const fragment = /* glsl */ `
  #include <common>
  #include <clipping_planes_pars_fragment>
  uniform vec3 dark;
  uniform vec3 light;
  varying vec3 vViewPosition;
  void main() {
    #include <clipping_planes_fragment>
    vec3 n = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
    float k = clamp(dot(n, normalize(vec3(-0.35, 0.85, 0.45))) * 0.5 + 0.5, 0.0, 1.0);
    gl_FragColor = vec4(mix(dark, light, k * k), 1.0);
  }
`;

export interface Scan {
  readonly group: Group;
  /** 0 = all solid, 1 = all drawn (the gate has passed the tail). */
  set(t: number): void;
  setColors(dark: Color, light: Color, gate: Color, night: boolean): void;
}

export function createScan(rig: Rig, style: LineStyle): Scan {
  const plane = new Plane(new Vector3(-1, 0, 0), NOSE_X); // keeps x ≤ the gate
  const dark = { value: new Color() };
  const light = { value: new Color() };
  const solid = new ShaderMaterial({ uniforms: { dark, light }, vertexShader: vertex, fragmentShader: fragment, clipping: true, clippingPlanes: [plane], polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const fills: Mesh[] = [];
  rig.loco.traverse((o) => {
    if (o instanceof Mesh && o.material === style.fill) fills.push(o);
  });
  const skins = fills.map((fill) => {
    const skin = new Mesh(fill.geometry, solid);
    skin.renderOrder = 3;
    skin.visible = false;
    fill.add(skin);
    return skin;
  });

  // The gate: a steel frame round the locomotive's section, with a faint light sheet inside it.
  const gate = new Group();
  gate.visible = false;
  const y0 = -0.35;
  const y1 = 4.95;
  const z = 2.15;
  const frame = new BufferGeometry();
  frame.setAttribute("position", new Float32BufferAttribute([0, y0, -z, 0, y1, -z, 0, y1, -z, 0, y1, z, 0, y1, z, 0, y0, z, 0, y0, z, 0, y0, -z, 0, y0 + 1.1, z + 0.35, 0, y0 + 1.1, z, 0, y1 - 1.1, z + 0.35, 0, y1 - 1.1, z], 3));
  const gateMat = new LineBasicMaterial({ color: new Color(), transparent: true, opacity: 0.95, depthTest: false });
  const lines = new LineSegments(frame, gateMat);
  lines.renderOrder = 7;
  const sheetMat = new MeshBasicMaterial({ color: new Color(), transparent: true, opacity: 0.07, depthWrite: false, side: DoubleSide });
  const sheet = new Mesh(new PlaneGeometry(2 * z, y1 - y0), sheetMat);
  sheet.rotation.y = Math.PI / 2;
  sheet.position.y = (y0 + y1) / 2;
  sheet.renderOrder = 7;
  gate.add(lines, sheet);
  rig.group.add(gate);

  let shown = false;
  return {
    group: gate,
    set(t) {
      const on = t < 0.999;
      if (on !== shown) {
        shown = on;
        for (const s of skins) s.visible = on;
      }
      const x = NOSE_X + (TAIL_X - NOSE_X) * Math.min(1, Math.max(0, t));
      plane.constant = x; // world x ≤ the gate stays solid (the rig stands at the origin while it scans)
      gate.position.x = x;
      gate.visible = t > 0.001 && on;
    },
    setColors(d, l, g, night) {
      dark.value.copy(d);
      light.value.copy(l);
      gateMat.color.copy(g);
      sheetMat.color.copy(g);
      sheetMat.opacity = night ? 0.1 : 0.07;
    },
  };
}
```

`src/components/landing/journey/scene/departure.ts`, from `V3/scene/departure.js`. `mast()`, the near, mid and far point lists and every number are verbatim. The nameboard's face is its own function and takes the approved words and the page's condensed face:
```ts
import { CanvasTexture, Float32BufferAttribute, Group, BufferGeometry, LineSegments, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, type LineBasicMaterial, type Texture } from "three";
import { cssRgb, type Rgb } from "./palette";
import type { LineStyle } from "./lines";

// What the train passes as it leaves the drawing chapter (spec §3.A; prototype v3's scene/departure.js), at three
// depths so each passes at its own speed: masts and kilometre posts close on this side of the line (fast), a signal
// gantry spanning the line (the train's own pace), and Platform 3's end with its nameboard beyond it (slow). All
// hairlines, like the rest of the drawing; hidden until the train starts to pull away.

const GROUND_Y = -0.9;

export interface BoardFace {
  readonly texture: Texture;
  paint(ink: Rgb): void;
}
export interface Departure {
  readonly group: Group;
  setInk(ink: Rgb): void;
}

function segments(points: readonly number[], material: LineBasicMaterial): LineSegments {
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(points, 3));
  const l = new LineSegments(geo, material);
  l.frustumCulled = false;
  return l;
}

/** A lattice mast: two uprights with zig-zag bracing, like the masts carrying the overhead line. */
function mast(pts: number[], x: number, z: number, h: number, w = 0.22): void {
  pts.push(x, GROUND_Y, z, x, h, z, x + w, GROUND_Y, z, x + w, h, z);
  let up = true;
  for (let y = GROUND_Y; y < h - 0.4; y += 0.55) {
    pts.push(x + (up ? 0 : w), y, z, x + (up ? w : 0), y + 0.55, z);
    up = !up;
  }
}

/** The nameboard's face: the platform's name in the page's own condensed capitals, repainted in the theme's ink. */
export function boardFace(words: { readonly platform: string; readonly departures: string }, family: string): BoardFace {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  let ink: Rgb = { r: 0, g: 0, b: 0 };
  const draw = () => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = cssRgb(ink);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 150px ${family}`;
    ctx.fillText(words.platform, 512, 118);
    ctx.font = `600 44px ${family}`;
    ctx.fillText(words.departures, 512, 214);
    texture.needsUpdate = true;
  };
  // painted again once the condensed face has arrived (spec §3.E)
  void document.fonts.load(`600 150px ${family}`).then(draw, () => undefined);
  return {
    texture,
    paint(next) {
      ink = next;
      draw();
    },
  };
}
```
Then `buildDeparture`, v3's line side verbatim, with the face passed in:
```ts
export function buildDeparture(style: LineStyle, face: BoardFace): Departure {
  const group = new Group();
  group.name = "departure";
  group.visible = false;

  // Near: masts and kilometre posts on this side of the line.
  const near: number[] = [];
  for (let x = 24; x <= 420; x += 32) mast(near, x, 7.4, 7.8);
  for (let x = 40; x <= 420; x += 20) {
    near.push(x, GROUND_Y, 11.5, x, 0.5, 11.5, x - 0.35, 0.1, 11.5, x + 0.35, 0.1, 11.5, x - 0.35, 0.5, 11.5, x + 0.35, 0.5, 11.5);
    near.push(x - 0.35, 0.1, 11.5, x - 0.35, 0.5, 11.5, x + 0.35, 0.1, 11.5, x + 0.35, 0.5, 11.5);
  }
  group.add(segments(near, style.near));

  // Mid: a signal gantry across the line, its signal heads hanging over the track.
  const g: number[] = [];
  const gx = 78;
  for (const z of [-6.2, 9.4]) mast(g, gx, z, 7.6, 0.3);
  for (const y of [7.1, 7.6]) g.push(gx, y, -6.2, gx, y, 9.4, gx + 0.3, y, -6.2, gx + 0.3, y, 9.4);
  let flip = false;
  for (let z = -6.2; z < 9.4; z += 0.8) {
    g.push(gx, flip ? 7.1 : 7.6, z, gx, flip ? 7.6 : 7.1, z + 0.8);
    flip = !flip;
  }
  for (const z of [-0.5, 0.5]) {
    const top = 7.1;
    g.push(gx + 0.15, top, z, gx + 0.15, top - 0.6, z);
    const y0 = top - 0.6;
    const y1 = y0 - 1.5;
    g.push(gx - 0.1, y0, z - 0.3, gx - 0.1, y0, z + 0.3, gx - 0.1, y1, z - 0.3, gx - 0.1, y1, z + 0.3);
    g.push(gx - 0.1, y0, z - 0.3, gx - 0.1, y1, z - 0.3, gx - 0.1, y0, z + 0.3, gx - 0.1, y1, z + 0.3);
    for (let k = 0; k < 3; k++) {
      const cy = y0 - 0.3 - k * 0.45;
      const n = 10;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 1) / n) * Math.PI * 2;
        g.push(gx - 0.12, cy + Math.sin(a0) * 0.15, z + Math.cos(a0) * 0.15, gx - 0.12, cy + Math.sin(a1) * 0.15, z + Math.cos(a1) * 0.15);
      }
    }
  }
  group.add(segments(g, style.line));

  // Far: the end of Platform 3, its canopy, and the nameboard.
  const f: number[] = [];
  const x0 = 104;
  const x1 = 220;
  const edge = -7.2;
  const back = -12.5;
  const top = 0.84;
  f.push(x0, top, edge, x1, top, edge, x0, top - 0.2, edge, x1, top - 0.2, edge, x0, top, back, x1, top, back);
  f.push(x0, top, edge, x0 - 3.2, GROUND_Y, edge, x0, top, back, x0 - 3.2, GROUND_Y, back); // the ramp down at the platform's end
  for (let x = x0 + 12; x <= x1; x += 9) {
    f.push(x, top, -10, x, 4.6, -10);
    f.push(x - 4.5, 4.6, -7.8, x + 4.5, 4.6, -7.8);
  }
  f.push(x0 + 7.5, 4.6, -10, x1, 4.6, -10, x0 + 7.5, 4.9, -7.6, x1, 4.9, -7.6, x0 + 7.5, 5.1, -12.4, x1, 5.1, -12.4);
  const bx = x0 + 4;
  const bz = -8.6;
  for (const dx of [-2.3, 2.3]) f.push(bx + dx, top, bz, bx + dx, 3.9, bz);
  f.push(bx - 2.7, 2.5, bz, bx + 2.7, 2.5, bz, bx - 2.7, 3.9, bz, bx + 2.7, 3.9, bz, bx - 2.7, 2.5, bz, bx - 2.7, 3.9, bz, bx + 2.7, 2.5, bz, bx + 2.7, 3.9, bz);
  group.add(segments(f, style.line));

  const board = new Mesh(new PlaneGeometry(5.2, 1.3), new MeshBasicMaterial({ map: face.texture, transparent: true, depthWrite: false, fog: true }));
  board.position.set(bx, 3.2, bz + 0.02);
  group.add(board);
  return { group, setInk: (ink) => face.paint(ink) };
}
```

`src/components/landing/journey/scene/glow.ts`:
```ts
import { AdditiveBlending, CanvasTexture, Color, Sprite, SpriteMaterial, type Texture } from "three";
import type { Rig } from "./rig";

// Night's steel glow (spec §3.A; prototype v3's lines.js glow and rig.js sprites): one at the headlight, one where the
// raised pantograph's head meets the wire. Additive, and only at Night at full quality (J5-20). The live engine makes
// these; the bake never sees them.

/** A white radial fade: each stop is [offset, alpha]. An alpha mask only; the material's colour (a token's) tints it. */
export function radialTexture(stops: readonly (readonly [number, number])[]): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (const [offset, alpha] of stops) g.addColorStop(offset, `rgba(255,255,255,${alpha})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  return new CanvasTexture(canvas);
}

/** A soft white disc; the material's colour tints it. */
export function glowTexture(): Texture {
  return radialTexture([
    [0, 1],
    [0.18, 0.55],
    [1, 0],
  ]);
}

export interface Glow {
  /** `on`: Night at full quality. `headUp`: the pantograph is raised to the wire. */
  set(on: boolean, headUp: boolean): void;
  setColor(color: Color): void;
}

export function createGlow(rig: Rig, texture: Texture): Glow {
  const material = new SpriteMaterial({ map: texture, color: new Color(1, 1, 1), transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending });
  const lamp = new Sprite(material);
  lamp.position.set(0.42, 3.93, 0);
  lamp.scale.set(2.6, 2.6, 1);
  rig.cabFront.add(lamp);
  const head = new Sprite(material);
  head.position.set(0, 0.08, 0);
  head.scale.set(1.6, 1.6, 1);
  head.visible = false;
  rig.pantoHead.add(head);
  return {
    set(on, headUp) {
      material.opacity = on ? 0.9 : 0;
      head.visible = headUp;
    },
    setColor(color) {
      material.color.copy(color);
    },
  };
}
```
In the test, `sprites[0]!.material` is typed `SpriteMaterial`, so `.opacity` needs no cast.

`src/components/landing/journey/scene/beam.ts`, from `V3/scene/beam.js`. The shaders and every number are verbatim; the colour is passed in, and the uniforms are kept by reference (`UniformsUtils.merge` clones, which would lose them):
```ts
import { AdditiveBlending, Color, ConeGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, ShaderMaterial, UniformsLib, UniformsUtils, type Texture } from "three";
import { radialTexture } from "./glow";
import type { Rig } from "./rig";

// Night (spec §3.A): the locomotive's headlight throws a soft steel beam along the track ahead, and lights a pool on
// the ballast where it lands (prototype v3's scene/beam.js). Additive and depth-tested (the drawing's own fills hide it
// behind solid parts), fading along its length and toward its rim, so it reads as light, not as a solid cone. The
// camera frames the locomotive, not its light: userData.noFit.

const LENGTH = 30;
const RADIUS = 3.4;

const vertex = /* glsl */ `
  varying float vAlong;
  varying float vRim;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vAlong = clamp(1.0 - position.x / ${LENGTH.toFixed(1)}, 0.0, 1.0); // 1 at the lens, 0 at the far end
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vRim = abs(dot(n, normalize(-mvPosition.xyz)));
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const fragment = /* glsl */ `
  uniform vec3 color;
  uniform float strength;
  varying float vAlong;
  varying float vRim;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    float along = pow(vAlong, 1.6);          // brightest at the lens, gone at the far end
    float body = smoothstep(0.0, 0.85, vRim); // soft toward the silhouette
    gl_FragColor = vec4(color * along * body * strength, 1.0);
    #include <fog_fragment>
  }
`;

/** A soft white pool for the ballast (glow.ts's radial fade, its own stops); the material's colour tints it. */
export function poolTexture(): Texture {
  return radialTexture([
    [0, 0.9],
    [0.45, 0.28],
    [1, 0],
  ]);
}

export interface Beam {
  readonly group: Group;
  /** On at Night at full quality, while the headlight is lit (the pantograph at the wire). */
  set(on: boolean, lit: number): void;
  setColor(color: Color): void;
}

export function createBeam(rig: Rig, pool: Texture): Beam {
  const group = new Group();
  group.name = "beam";
  group.visible = false;
  group.userData.noFit = true; // the camera frames the locomotive, not its light
  const cone = new ConeGeometry(RADIUS, LENGTH, 32, 1, true);
  // apex at the lens: the cone's tip sits at +y; turn it to point forward (+x) with the tip at the origin
  cone.translate(0, -LENGTH / 2, 0);
  cone.rotateZ(Math.PI / 2);
  const color = { value: new Color(1, 1, 1) };
  const strength = { value: 0.32 };
  const material = new ShaderMaterial({
    uniforms: { ...UniformsUtils.clone(UniformsLib.fog), color, strength },
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    fog: true,
  });
  const beam = new Mesh(cone, material);
  beam.position.copy(rig.headlight);
  beam.rotation.z = -0.045; // dipped toward the rails
  beam.renderOrder = 6;
  group.add(beam);

  const poolMaterial = new MeshBasicMaterial({ map: pool, color: new Color(1, 1, 1), transparent: true, opacity: 0.4, depthWrite: false, blending: AdditiveBlending, fog: true });
  const puddle = new Mesh(new PlaneGeometry(1, 1), poolMaterial);
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.set(rig.headlight.x + 17, 0.02, 0);
  puddle.scale.set(18, 4.6, 1);
  puddle.renderOrder = 6;
  group.add(puddle);
  rig.cabFront.add(group);

  return {
    group,
    set(on, lit) {
      group.visible = on && lit > 0.01;
      strength.value = 0.32 * lit;
      poolMaterial.opacity = 0.4 * lit;
    },
    setColor(c) {
      color.value.copy(c);
      poolMaterial.color.copy(c);
    },
  };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/unit/components/landing/journey/scene/live-parts.test.ts`
Expected: PASS.

- [ ] **Step 5: The whole gate, then commit**

```bash
npm run check
git add src/components/landing/journey/scene/scan.ts src/components/landing/journey/scene/departure.ts src/components/landing/journey/scene/glow.ts src/components/landing/journey/scene/beam.ts tests/unit/components/landing/journey/scene/live-parts.test.ts
git commit -m "feat(journey): the scan gate, the line side, the Night glow and the headlight beam"
```

---

### Task 4: The engine

One fixed canvas draws each visible stage into its own scissored rectangle (spec §3.B; v3's `engine.js`). It builds the world a part at a time, compiles its shaders in the background, steps quality, takes a new palette in place, and tells the page when the GPU drops or restores its context. The renderer itself needs a browser, so it is proved in Task 7's e2e; its pure pieces are unit-tested here.

**Files:**
- Create: `src/components/landing/journey/scene/engine.ts`
- Modify: `src/components/landing/journey/journey-events.ts` (`WEBGL_EVENT`; `STATION_EVENT`'s comment)
- Test: `tests/unit/components/landing/journey/scene/engine.test.ts`

**Interfaces:**
- Consumes: `buildWorldAsync`, `Pause`, `World`, `restyle`, `NIGHT_OPACITY`, `DAY_OPACITY`, `Palette` (Task 1); `ScenePalette`, `Rgb`, `createFit`, `Fit`, `Rect`, `ScreenPoint`, `projectTo` (Task 2); the four builders (Task 3); `applyPose` (J4); `emit` from `journey-events.ts`, where this task adds `WEBGL_EVENT`.
- Produces:
  - `QUALITY` (three steps) and `type Quality`; `qualityAt(level: number): Quality`; `dprFor(level: number, deviceDpr: number): number`.
  - `interface ViewBox { x; w; top; h; glY }`; `viewport(r: { left; top; bottom; width; height }, bleed: boolean, vw: number, vh: number): ViewBox | null`.
  - `interface ViewContext { camera: PerspectiveCamera; rect: Rect; aspect: number; quality: Quality; night: boolean }`; `interface View { el: Element; bleed: boolean; update(ctx: ViewContext): void; after?(): void }`.
  - `interface LiveParts { world; scan; departure; glow; beam }`; `applyLive(parts: LiveParts, camera: PerspectiveCamera, pose: Pose, quality: Quality, night: boolean): void`.
  - `pickables(rig: Rig): Mesh[]`; `toLinePalette(p: ScenePalette): Palette`; `weightsFor(night: boolean): LineOpacity`.
  - `interface EngineOptions { palette: ScenePalette; coaches: number; words: { platform: string; departures: string }; family: string }`.
  - `interface Engine { world; fit; canvas; addView(id, view); removeView(id); frame(); live(pose, quality, night); setPalette(p); night(); setQuality(level); quality(); project(point, rect); pick(clientX, clientY, rect, camera); inked(el); dispose() }`. `canvas` is read-only here: `scene/live.ts` made the element and owns its `hidden` and its removal; the engine owns its drawing buffer and WebGL context (J5 pre-flight #11).
  - `createEngine(canvas: HTMLCanvasElement, options: EngineOptions, pause: Pause): Promise<Engine>`.
  - `journey-events.ts`: `WEBGL_EVENT = "tt:webgl"`, `type WebglDetail = "lost" | "restored"`; `STATION_EVENT`'s comment names `station-progress.ts` as its source (no code change).

- [ ] **Step 1: Write the failing tests**

`tests/unit/components/landing/journey/scene/engine.test.ts`:
```ts
import { Color, Mesh, PerspectiveCamera, Texture } from "three";
import { describe, expect, it } from "vitest";
import { anatomyPose } from "@/components/landing/journey/pose";
import { createBeam } from "@/components/landing/journey/scene/beam";
import { buildDeparture } from "@/components/landing/journey/scene/departure";
import { QUALITY, applyLive, dprFor, pickables, qualityAt, toLinePalette, viewport, weightsFor } from "@/components/landing/journey/scene/engine";
import { createGlow } from "@/components/landing/journey/scene/glow";
import { NIGHT_OPACITY } from "@/components/landing/journey/scene/lines";
import { createScan } from "@/components/landing/journey/scene/scan";
import { buildWorld } from "@/components/landing/journey/scene/world";

const INK = new Color(0, 0, 0);
const world = buildWorld({ ground: INK, ink: INK, steel: INK, steelText: INK }, { coaches: 3 });
const parts = {
  world,
  scan: createScan(world.rig, world.style),
  departure: buildDeparture(world.style, { texture: new Texture(), paint: () => undefined }),
  glow: createGlow(world.rig, new Texture()),
  beam: createBeam(world.rig, new Texture()),
};
world.scene.add(parts.departure.group);
const camera = new PerspectiveCamera();

describe("the engine's pure pieces (spec §3.B–C; v3's engine.js)", () => {
  it("draws a stage only while it is on screen and bigger than a sliver; a bleeding stage takes the window's width", () => {
    expect(viewport({ left: 40, top: -900, bottom: -1, width: 800, height: 899 }, false, 1280, 800)).toBeNull();
    expect(viewport({ left: 40, top: 800, bottom: 1200, width: 800, height: 400 }, false, 1280, 800)).toBeNull();
    expect(viewport({ left: 40, top: 100, bottom: 101, width: 800, height: 1 }, false, 1280, 800)).toBeNull();
    expect(viewport({ left: 40, top: 100, bottom: 500, width: 800, height: 400 }, false, 1280, 800)).toEqual({ x: 40, w: 800, top: 100, h: 400, glY: 300 });
    expect(viewport({ left: 40, top: 100, bottom: 500, width: 800, height: 400 }, true, 1280, 800)).toEqual({ x: 0, w: 1280, top: 100, h: 400, glY: 300 });
  });

  it("steps quality: resolution 2× → 1.5× → 1×, coaches all → 2 → 1, Night effects only at the top step", () => {
    expect(QUALITY.map((q) => [q.dpr, q.coaches, q.effects])).toEqual([[2, Infinity, true], [1.5, 2, false], [1, 1, false]]);
    expect([dprFor(0, 3), dprFor(1, 3), dprFor(2, 3), dprFor(0, 1)]).toEqual([2, 1.5, 1, 1]);
    expect(qualityAt(9)).toBe(QUALITY[2]);
    expect(qualityAt(-1)).toBe(QUALITY[0]);
  });

  it("poses the live parts from one pose: the scan early, the line side and the Night lights late", () => {
    applyLive(parts, camera, anatomyPose(0.05, 2), QUALITY[0], true);
    expect(parts.departure.group.visible).toBe(false);
    expect(world.rig.group.getObjectByName("beam")?.visible).toBe(false);
    applyLive(parts, camera, anatomyPose(0.95, 2), QUALITY[0], true);
    expect(parts.departure.group.visible).toBe(true);
    expect(world.rig.group.getObjectByName("beam")?.visible).toBe(true);
    applyLive(parts, camera, anatomyPose(0.95, 2), QUALITY[1], true);
    expect(world.rig.group.getObjectByName("beam")?.visible).toBe(false);
    applyLive(parts, camera, anatomyPose(0.95, 2), QUALITY[2], false);
    expect(world.rig.coaches.filter((c) => c.obj.visible)).toHaveLength(1);
  });

  it("picks only the locomotive's own fills, each naming its part", () => {
    const meshes = pickables(world.rig);
    expect(meshes.length).toBeGreaterThan(10);
    for (const m of meshes) {
      expect(m).toBeInstanceOf(Mesh);
      expect(typeof m.userData.part).toBe("string");
    }
  });

  it("turns the scene's palette into the drawing's, and Night into its weights", () => {
    const p = toLinePalette({ night: true, ground: { r: 0, g: 0, b: 0 }, ink: { r: 1, g: 1, b: 1 }, steel: { r: 1, g: 0, b: 0 }, steelText: { r: 0, g: 0, b: 1 }, scanDark: { r: 0, g: 0, b: 0 }, scanLight: { r: 0, g: 0, b: 0 } });
    expect(p.ink.equals(new Color(1, 1, 1))).toBe(true);
    expect(weightsFor(true)).toBe(NIGHT_OPACITY);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/components/landing/journey/scene/engine.test.ts`
Expected: FAIL. The module does not exist.

- [ ] **Step 3: Add the event, and implement the engine**

In `src/components/landing/journey/journey-events.ts`, first reword `STATION_EVENT`'s stale comment (the strip is gone; J5 pre-flight #25). Replace `/** The strip reached another station. */` with:
```ts
/** The scroll reached another station (station-progress.ts announces it; the departure board follows). */
```
Then, after `RESULT_EVENT`, add:
```ts
/** The live drawing's GPU context: "lost" (draw still) or "restored" (live again). Heard by drawing.ts, never by the
 * live module, which is torn down while the context is gone (v3's gotcha). */
export const WEBGL_EVENT = "tt:webgl";
export type WebglDetail = "lost" | "restored";
```

`src/components/landing/journey/scene/engine.ts`:
```ts
import { Color, Fog, Mesh, Raycaster, SRGBColorSpace, Vector2, WebGLRenderer, type PerspectiveCamera, type Vector3 } from "three";
import { WEBGL_EVENT, emit, type WebglDetail } from "../journey-events";
import type { Pose } from "../pose";
import { createBeam, poolTexture, type Beam } from "./beam";
import { boardFace, buildDeparture, type Departure } from "./departure";
import { createFit, projectTo, type Fit, type Rect, type ScreenPoint } from "./fit";
import { createGlow, glowTexture, type Glow } from "./glow";
import { DAY_OPACITY, NIGHT_OPACITY, restyle, type LineOpacity, type Palette } from "./lines";
import { smoothstep } from "./math";
import type { Rgb, ScenePalette } from "./palette";
import { applyPose } from "./apply-pose";
import { isRigPart, type Rig, type RigPartId } from "./rig";
import { createScan, type Scan } from "./scan";
import { buildWorldAsync, type Pause, type World } from "./world";

// The live drawing's engine (spec §3.B; prototype v3's scene/engine.js): one WebGL canvas fixed over the page,
// drawing each visible stage into its own scissored rectangle. A stage supplies `update`, which poses the rig and the
// camera for its rectangle; the engine draws only while a stage shows. It is built a part at a time, compiles its
// shaders in the background, steps quality (resolution, coaches, Night effects), takes a new palette in place, and
// tells the page when the GPU drops or restores its context. It is kept for one startJourney (J5-4).

/** 0 full, 1 lighter (1.5×, two coaches, Night effects off), 2 lightest (1×, one coach). */
export const QUALITY = [
  { dpr: 2, coaches: Number.POSITIVE_INFINITY, effects: true },
  { dpr: 1.5, coaches: 2, effects: false },
  { dpr: 1, coaches: 1, effects: false },
] as const;
export type Quality = (typeof QUALITY)[number];

export function qualityAt(level: number): Quality {
  return QUALITY[Math.max(0, Math.min(QUALITY.length - 1, level))] ?? QUALITY[0];
}

export function dprFor(level: number, deviceDpr: number): number {
  return Math.min(deviceDpr || 1, qualityAt(level).dpr);
}

export interface ViewBox {
  readonly x: number;
  readonly w: number;
  readonly top: number;
  readonly h: number;
  /** The rectangle's bottom edge in GL's coordinates (from the canvas's foot). */
  readonly glY: number;
}

/** Where a stage draws, or null when it is off screen or a sliver. A bleeding stage spans the window's width. */
export function viewport(r: { readonly left: number; readonly top: number; readonly bottom: number; readonly width: number; readonly height: number }, bleed: boolean, vw: number, vh: number): ViewBox | null {
  if (r.bottom <= 0 || r.top >= vh || r.height < 2 || r.width < 2) return null;
  return { x: bleed ? 0 : r.left, w: bleed ? vw : r.width, top: r.top, h: r.height, glY: vh - r.bottom };
}

export interface ViewContext {
  readonly camera: PerspectiveCamera;
  readonly rect: Rect;
  readonly aspect: number;
  readonly quality: Quality;
  readonly night: boolean;
}
export interface View {
  readonly el: Element;
  readonly bleed: boolean;
  update(ctx: ViewContext): void;
  after?(): void;
}

export interface LiveParts {
  readonly world: World;
  readonly scan: Scan;
  readonly departure: Departure;
  readonly glow: Glow;
  readonly beam: Beam;
}

/** One frame's pose for everything live: the shared rig and camera (applyPose), then the scan, the line side, and
 * the Night glow and beam (Night at full quality only; the beam lights as the pantograph reaches the wire). */
export function applyLive(parts: LiveParts, camera: PerspectiveCamera, pose: Pose, quality: Quality, night: boolean): void {
  applyPose(parts.world, camera, pose, { coaches: quality.coaches });
  parts.departure.group.visible = pose.lineside;
  parts.scan.set(pose.scan);
  const effects = night && quality.effects;
  parts.glow.set(effects, pose.panto > 0.6);
  parts.beam.set(effects, pose.panto > 0.6 ? smoothstep(0.6, 1, pose.panto) : 0);
}

/** The locomotive's own fills, each carrying its part id: what a pointer can land on. */
export function pickables(rig: Rig): Mesh[] {
  const out: Mesh[] = [];
  rig.loco.traverse((o) => {
    if (o instanceof Mesh && typeof o.userData.part === "string") out.push(o);
  });
  return out;
}

const srgb = ({ r, g, b }: Rgb): Color => new Color().setRGB(r, g, b, SRGBColorSpace);

export function toLinePalette(p: ScenePalette): Palette {
  return { ground: srgb(p.ground), ink: srgb(p.ink), steel: srgb(p.steel), steelText: srgb(p.steelText) };
}

export function weightsFor(night: boolean): LineOpacity {
  return night ? NIGHT_OPACITY : DAY_OPACITY;
}

export interface EngineOptions {
  readonly palette: ScenePalette;
  readonly coaches: number;
  readonly words: { readonly platform: string; readonly departures: string };
  readonly family: string;
}

export interface Engine {
  readonly world: World;
  readonly fit: Fit;
  /** The canvas it draws on. scene/live.ts made it and owns the element (its `hidden`, its removal); the engine owns
   * only its drawing buffer and WebGL context. */
  readonly canvas: HTMLCanvasElement;
  addView(id: string, view: View): void;
  removeView(id: string): void;
  /** Draws every visible stage now (or clears the canvas when none shows). */
  frame(): void;
  live(pose: Pose, quality: Quality, night: boolean): void;
  setPalette(palette: ScenePalette): void;
  night(): boolean;
  setQuality(level: number): void;
  quality(): number;
  project(point: Vector3, rect: Rect): ScreenPoint;
  pick(clientX: number, clientY: number, rect: Rect, camera: PerspectiveCamera): RigPartId | null;
  /** The share of an element's box the drawing inked, read in the same task as a fresh frame (the dev probe, J5-13). */
  inked(el: Element): number;
  dispose(): void;
}

export async function createEngine(canvas: HTMLCanvasElement, options: EngineOptions, pause: Pause): Promise<Engine> {
  const world = await buildWorldAsync(toLinePalette(options.palette), { coaches: options.coaches, opacity: weightsFor(options.palette.night) }, pause);
  await pause();
  const { scene, rig, camera } = world;
  const departure = buildDeparture(world.style, boardFace(options.words, options.family));
  scene.add(departure.group);
  const parts: LiveParts = { world, scan: createScan(rig, world.style), departure, glow: createGlow(rig, glowTexture()), beam: createBeam(rig, poolTexture()) };
  const fit = createFit(rig);
  const targets = pickables(rig);
  await pause();

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(new Color(0, 0, 0), 0);
  renderer.autoClear = false;
  renderer.localClippingEnabled = true;
  const views = new Map<string, View>();
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  let size = { w: 0, h: 0 };
  let drewLast = false;
  let level = 0;
  let night = options.palette.night;
  let lost = false;

  const onLost = (event: Event) => {
    event.preventDefault(); // ask for the context back
    lost = true;
    emit<WebglDetail>(WEBGL_EVENT, "lost");
  };
  const onRestored = () => {
    lost = false;
    size = { w: 0, h: 0 };
    emit<WebglDetail>(WEBGL_EVENT, "restored");
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  renderer.setPixelRatio(dprFor(level, window.devicePixelRatio));

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === size.w && h === size.h) return;
    size = { w, h };
    renderer.setSize(w, h, false);
  };

  const setPalette = (p: ScenePalette) => {
    const line = toLinePalette(p);
    restyle(world.style, line, weightsFor(p.night));
    if (scene.fog instanceof Fog) scene.fog.color.copy(line.ground);
    parts.scan.setColors(srgb(p.scanDark), srgb(p.scanLight), line.steelText, p.night);
    parts.glow.setColor(line.steelText);
    parts.beam.setColor(line.steelText);
    departure.setInk(p.ink);
    night = p.night;
  };
  setPalette(options.palette);

  function frame(): void {
    if (lost) return;
    resize();
    const shown = [...views.values()].flatMap((v) => {
      const box = viewport(v.el.getBoundingClientRect(), v.bleed, size.w, size.h);
      return box ? [{ v, box }] : [];
    });
    if (!shown.length) {
      if (drewLast) {
        renderer.setScissorTest(false);
        renderer.clear();
        drewLast = false;
      }
      return;
    }
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);
    for (const { v, box } of shown) {
      camera.aspect = box.w / box.h;
      v.update({ camera, rect: { x: box.x, y: box.top, w: box.w, h: box.h }, aspect: camera.aspect, quality: qualityAt(level), night });
      camera.updateProjectionMatrix();
      rig.turnWheels();
      renderer.setViewport(box.x, box.glY, box.w, box.h);
      renderer.setScissor(box.x, box.glY, box.w, box.h);
      renderer.render(scene, camera);
      v.after?.();
    }
    drewLast = true;
  }

  /** Compiles every shader off the main thread where the browser can (KHR_parallel_shader_compile). */
  const warm = async () => {
    try {
      parts.scan.set(0.5);
      parts.beam.set(true, 1);
      departure.group.visible = true;
      await renderer.compileAsync(scene, camera);
    } catch {
      // no parallel compile: the shaders compile on the first draw instead
    } finally {
      parts.scan.set(1);
      parts.beam.set(false, 0);
      departure.group.visible = false;
    }
  };
  await pause();
  await warm();

  return {
    world,
    fit,
    canvas,
    addView: (id, view) => {
      views.set(id, view);
    },
    removeView: (id) => {
      views.delete(id);
    },
    frame,
    live: (pose, quality, isNight) => applyLive(parts, camera, pose, quality, isNight),
    setPalette,
    night: () => night,
    setQuality: (next) => {
      level = Math.max(0, Math.min(QUALITY.length - 1, next));
      renderer.setPixelRatio(dprFor(level, window.devicePixelRatio));
      size = { w: 0, h: 0 }; // re-apply the drawing buffer's size at the new resolution
    },
    quality: () => level,
    project: (point, rect) => projectTo(point, camera, rect),
    pick: (clientX, clientY, rect, from) => {
      ndc.set(((clientX - rect.x) / rect.w) * 2 - 1, -(((clientY - rect.y) / rect.h) * 2 - 1));
      raycaster.setFromCamera(ndc, from);
      const part: unknown = raycaster.intersectObjects(targets, false)[0]?.object.userData.part;
      return typeof part === "string" && isRigPart(part) ? part : null;
    },
    inked: (el) => {
      frame();
      const gl = renderer.getContext();
      const r = el.getBoundingClientRect();
      const dpr = renderer.getPixelRatio();
      const top = Math.max(0, r.top);
      const bottom = Math.min(size.h, r.bottom);
      const x = Math.max(0, Math.floor(r.left * dpr));
      const w = Math.min(Math.floor(size.w * dpr) - x, Math.floor(r.width * dpr));
      const h = Math.floor((bottom - top) * dpr);
      if (w <= 0 || h <= 0) return 0;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(x, Math.floor((size.h - bottom) * dpr), w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let inked = 0;
      for (let i = 3; i < px.length; i += 4) if ((px[i] ?? 0) > 0) inked += 1;
      return inked / (w * h);
    },
    dispose: () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      views.clear();
      renderer.dispose();
      renderer.forceContextLoss(); // the element itself is scene/live.ts's to remove
    },
  };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/unit/components/landing/journey/scene/engine.test.ts`
Expected: PASS. Importing `WebGLRenderer` in node is fine; nothing here constructs one.

- [ ] **Step 5: The whole gate, then commit**

```bash
npm run check
git add src/components/landing/journey/scene/engine.ts src/components/landing/journey/journey-events.ts tests/unit/components/landing/journey/scene/engine.test.ts
git commit -m "feat(journey): the live drawing's engine: scissored views, quality steps, a palette in place, and a lost GPU heard"
```

---
### Task 5: The reader's place, above and around the drawing

The live drawing grows and shrinks #anatomy above #how, so the places the journey already keeps must survive that. The chapters guard refreshes its box on layout (J5-19). This task also closes the four `place-memory.ts` minors J4 parked (J5-17). Both are proved before the drawing goes live, with a stand-in that grows the page above #how.

**Files:**
- Modify: `src/components/landing/journey/chapters.ts` (`startPlaceGuard`, `settlePlace`), `src/components/landing/journey/place-memory.ts`
- Test: `tests/unit/components/landing/journey/place-memory.test.tsx`; create `tests/e2e/journey/place.spec.ts`; modify `tests/e2e/journey/journey-helpers.ts` (`frames`)

**Interfaces:**
- Consumes: `LAYOUT_EVENT` (J3); `waitForJourney`, `scrollToId` (`journey-helpers.ts`).
- Produces: no new exports from `src`. `startPlaceMemory()` keeps its signature and now samples on `navigate` instead of `click`. `parsePlace("…entry: \"\"…")` is `null`. `chapters.ts`'s `placeBox` and `lastScrollY` leave module level for `startPlaceGuard`'s closure (J5 pre-flight #17).
  - E2E helper `frames(page, n = 2)`: waits for the page to draw `n` more frames. Tasks 7 and 10 wait on it (or on `expect.poll`) instead of a fixed time.

- [ ] **Step 1: Write the failing tests**

`tests/e2e/journey/journey-helpers.ts`, add:
```ts
/** Waits for the page to draw `n` more frames: whatever a scroll, a wheel or a layout event set going has had its turn.
 * A state wait, never a fixed time (J5 pre-flight #16). */
export async function frames(page: Page, n = 2): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((done) => {
        const tick = (left: number): void => {
          if (left <= 0) done();
          else requestAnimationFrame(() => tick(left - 1));
        };
        tick(count);
      }),
    n,
  );
}
```

`tests/e2e/journey/place.spec.ts`:
```ts
import { expect, test } from "../fixtures";
import { frames, scrollToId, waitForJourney } from "./journey-helpers";

// The places the journey keeps (J5-17, J5-19): a change of height above 02 (the live drawing pinning, J5) must never
// throw a reader inside 02 when Motion then goes off; and Back, Forward, Back finds the reader's place each time.

test.describe("the reader's place", () => {
  test.skip(({ isMobile }) => isMobile, "02 pins on wide screens; one project is enough");

  test("a change above 02 never throws a reader inside it when Motion then goes off", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#how")).toHaveClass(/is-pinned/);
    // Something above 02 grows by two windows and says so, as the live drawing's pin will.
    await page.evaluate(() => {
      const spacer = document.createElement("div");
      spacer.style.height = `${window.innerHeight * 2}px`;
      document.getElementById("principles")?.after(spacer);
      window.dispatchEvent(new Event("tt:layout"));
    });
    await frames(page); // the grown page has laid out (tt:layout's listeners ran inside dispatchEvent)
    const vh = page.viewportSize()?.height ?? 800;
    await scrollToId(page, "how", -Math.round(vh * 2.5)); // well inside 02, past where its stale box would end
    await frames(page); // the scroll event has reached the guard, which learns the reader's place from it
    await page.getByRole("contentinfo").getByRole("switch", { name: "Motion" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
    await expect(page.locator("#how")).not.toHaveClass(/is-pinned/); // the collapse has happened
    await frames(page, 3); // its height, then its padding a frame later, then the guard's settle
    const [top, foot] = await page.evaluate(() => [document.getElementById("how")?.getBoundingClientRect().top ?? 0, document.querySelector("header")?.getBoundingClientRect().bottom ?? 0]);
    expect(Math.abs(top - foot)).toBeLessThanOrEqual(24); // at 02's own start (its scroll margin), not thrown past it
  });

  test("Back, Forward, then Back again finds the reader's place each time", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "record", 120);
    await frames(page); // the scroll has been sampled
    const before = await page.locator("#record").evaluate((el) => el.getBoundingClientRect().top);
    const drift = async () => Math.abs((await page.locator("#record").evaluate((el) => el.getBoundingClientRect().top)) - before);
    const away = page.getByLabel("Primary").getByRole("link", { name: "Watchlist" });
    await away.click();
    await expect(page).toHaveURL(/\/watchlist/);
    await page.goBack();
    await waitForJourney(page);
    await expect.poll(drift).toBeLessThanOrEqual(4); // the restore has landed
    await page.goForward();
    await expect(page).toHaveURL(/\/watchlist/);
    await page.goBack();
    await waitForJourney(page);
    await expect.poll(drift).toBeLessThanOrEqual(4);
  });
});
```
In `tests/unit/components/landing/journey/place-memory.test.tsx`:
- Make the fake navigation an event target, so a navigate event can reach it:
```ts
  const nav = Object.assign(new EventTarget(), { currentEntry: { key: "k1" } as { key: string } | null });
```
- Add `'{"entry":"","id":"record","offset":0}'` to the refused inputs in `parsePlace`'s second test.
- Replace the test "samples at a click, before a link's navigation, …" with:
```ts
  it("samples as a navigation starts, and keeps that place once the page's sections are gone", () => {
    const memory = startPlaceMemory();
    scrollY = 2000 - 40;
    nav.dispatchEvent(Object.assign(new Event("navigate"), { navigationType: "push" }));
    document.body.replaceChildren(); // the new page has replaced this one's markup
    scrollY = 0;
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersToNextFrame();
    memory.stop();
    expect(parsePlace(window.sessionStorage.getItem(PLACE_KEY))).toEqual({ entry: "k1", id: "how", offset: -24 });
  });

  it("never samples on a click alone, nor on a reload", () => {
    const memory = startPlaceMemory();
    scrollY = 2000 - 40;
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    nav.dispatchEvent(Object.assign(new Event("navigate"), { navigationType: "reload" }));
    document.body.replaceChildren();
    memory.stop();
    expect(parsePlace(window.sessionStorage.getItem(PLACE_KEY))?.id).toBe("anatomy"); // the first sample, at the top
  });

  it("restores nothing once the reader has scrolled by their own hand", () => {
    store({ entry: "k1", id: "record", offset: 136 });
    const memory = startPlaceMemory();
    window.dispatchEvent(new WheelEvent("wheel", { deltaY: 40 }));
    memory.restore();
    expect(scrolls).toEqual([]);
    memory.stop();
  });
```
- In "stops listening when stopped", replace the `click` assertion (and the `removeDocument` spy) with a spy on the fake: `const removeNav = vi.spyOn(nav, "removeEventListener");` and `expect(removeNav.mock.calls.map((c) => c[0])).toContain("navigate");`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/unit/components/landing/journey/place-memory.test.tsx`
Expected: FAIL. An empty entry parses; `navigate` is not heard; a wheel does not cancel the restore.

Then the e2e: `lsof -nP -iTCP:4210 -sTCP:LISTEN` (expect nothing, or this worktree's own server), then `npx playwright test tests/e2e/journey/place.spec.ts --project=desktop`.
Expected: the first test FAILS, with 02's top far from the masthead's foot: the guard judged the reader "past its end" from a stale box. The second may pass or fail. Record which, and the numbers, in your report.

- [ ] **Step 3: Implement**

In `chapters.ts`, this task adds a writer of the guard's box, so the box and the reader's place leave module level for `startPlaceGuard`'s closure first (Global Constraints: journey state lives per `startJourney`; J5 pre-flight #17). `settlePlace` takes them and returns the new pair. Delete the two module-level lines `let placeBox: Span = { top: 0, bottom: 0 };` and `let lastScrollY = 0;` (keep the long comment above them: it now introduces `settlePlace`), and replace `settlePlace` with:
```ts
/** Where the reader was, and #how's document box then: the guard's state, kept in its closure. */
interface Place {
  readonly box: Span;
  readonly y: number;
}

/** Above 02's old start: nothing. Inside it: 02's new start, at its landing under the masthead. At or past its
 * old end: the same distance past its new end (the height's change, plus its top's when the width moved it).
 * Returns the place to judge the next change from. */
function settlePlace(section: HTMLElement, was: Place): Place {
  const now = docBox(section);
  const { y } = was;
  if (y >= was.box.bottom) window.scrollTo({ top: y + now.bottom - was.box.bottom, behavior: "instant" });
  else if (y > was.box.top) window.scrollTo({ top: now.top - Number.parseFloat(getComputedStyle(section).scrollMarginTop), behavior: "instant" });
  return { box: now, y: window.scrollY };
}
```
Then replace `startPlaceGuard` with the following. The only behaviour it adds is `refresh` on `LAYOUT_EVENT` (J5-19); the rest is the same code reading its closure's `place` instead of the module's two lets. `LAYOUT_EVENT` is already imported there.
```ts
/** Started once, for the journey's whole lifetime (start-journey.ts calls this: it must already be watching
 * when a Motion toggle collapses #how, and survive the rebuild that follows), and stopped only with it. */
export function startPlaceGuard(): Teardown {
  const section = document.getElementById("how");
  if (!section) return () => {};
  let place: Place = { box: docBox(section), y: window.scrollY };
  let lastSize = sizeOf(section);
  const unchanged = () => {
    const size = sizeOf(section);
    return size.width === lastSize.width && size.height === lastSize.height;
  };
  // The reader's place, only while #how is still the size this guard last settled.
  const learn = () => {
    if (unchanged()) place = { ...place, y: window.scrollY };
  };
  window.addEventListener("scroll", learn, { passive: true });
  window.addEventListener(MOTION_BEFORE_EVENT, learn);
  // The drawing above 02 (GA, J5) pins and unpins, which moves #how's document box without resizing it. While #how
  // is the size this guard last settled, every layout change refreshes the box it judges against; a change that did
  // resize #how is the observer's, below, and must be judged against the box from before it.
  const refresh = () => {
    if (unchanged()) place = { ...place, box: docBox(section) };
  };
  window.addEventListener(LAYOUT_EVENT, refresh);
  // A freshly observed target always delivers one initial notification, even when nothing has actually
  // changed (the spec guarantees it) — this observer never fires on its own just because something above
  // #how changed size and moved it; only #how's own border-box actually changing size does that, or this
  // guaranteed-but-empty first delivery. Treating that first delivery as a real resize (the previous bug
  // here) reads whatever #how's box happens to be at that moment — including a document position already
  // shifted by content above it, before #how itself ever resized — as #how's own change, and relocates a
  // reader who never left where they were reading. The box this guard compares against still refreshes every
  // time (so a later, real resize is judged from here, never a stale one) — only the relocation itself waits
  // for #how's own box to actually change size.
  const observer = new ResizeObserver(() => {
    const resized = !unchanged();
    lastSize = sizeOf(section);
    if (resized) place = settlePlace(section, place);
    else place = { ...place, box: docBox(section) };
  });
  observer.observe(section, { box: "border-box" });
  return () => {
    window.removeEventListener("scroll", learn);
    window.removeEventListener(MOTION_BEFORE_EVENT, learn);
    window.removeEventListener(LAYOUT_EVENT, refresh);
    observer.disconnect();
  };
}
```
`place` and `lastSize` are closure state (`let` in a closure that needs it). Nothing else in the codebase reads `placeBox`, `lastScrollY` or `settlePlace` (`still.ts:149-150` names `settlePlace` only in a comment, which stays true).

In `place-memory.ts`:
- `parsePlace` refuses an empty entry: `if (typeof entry !== "string" || entry === "" || typeof id !== "string" || !IDS.includes(id)) return null;`
- Add, beside `entryKey`:
```ts
/** The Navigation API's target, where the browser has one. */
function navigationTarget(): EventTarget | null {
  const nav: unknown = Reflect.get(window, "navigation");
  return nav instanceof EventTarget ? nav : null;
}

/** The reader's own hand: any of these before the restore means they have moved on, and nothing is restored under them. */
const HAND = ["wheel", "touchstart", "keydown"] as const;
```
- In `startPlaceMemory`, replace the `document.addEventListener("click", sample, true);` line with:
```ts
  // Sampled as a navigation starts (a link, Back or Forward; never a reload): the sections still stand, and the entry
  // being left is still the current one (J5-17).
  const navigation = navigationTarget();
  const onNavigate = (event: Event) => {
    if (Reflect.get(event, "navigationType") !== "reload") sample();
  };
  navigation?.addEventListener("navigate", onNavigate);
  const stopHand = () => {
    for (const type of HAND) window.removeEventListener(type, onHand, true);
  };
  const onHand = () => {
    pending = null;
    stopHand();
  };
  for (const type of HAND) window.addEventListener(type, onHand, { capture: true, passive: true });
```
- In `restore`, call `stopHand()` first.
- In `stop`, replace `document.removeEventListener("click", sample, true);` with `navigation?.removeEventListener("navigate", onNavigate);` and add `stopHand();`.
- Update the comment above `startPlaceMemory`: "…sampled as the reader scrolls, and as a navigation starts."

`onHand` is used by `stopHand` before its `const` line, but only when called, which is after both exist.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run tests/unit/components/landing/journey/place-memory.test.tsx tests/unit/components/landing/journey/chapters-progress.test.ts`, then `npx playwright test tests/e2e/journey/place.spec.ts tests/e2e/journey/chapters.spec.ts tests/e2e/journey/drawing.spec.ts --project=desktop`.
Expected: PASS.

If "Back, Forward, then Back again" is still red, stop here and report the three measured tops and a trace (`--trace on`). Do not guess a second fix (J5-17).

- [ ] **Step 5: The whole gate, then commit**

```bash
npm run check
git add src/components/landing/journey/chapters.ts src/components/landing/journey/place-memory.ts tests/unit/components/landing/journey/place-memory.test.tsx tests/e2e/journey/place.spec.ts tests/e2e/journey/journey-helpers.ts
git commit -m "fix(journey): keep the reader's place when the page above 02 changes, and on Back, Forward, Back"
```

---
### Task 6: The drawing's modes, ready for a live drawing

`drawing.ts` becomes the machinery a live drawing needs, and is proved with fake loaders; J4's `noLiveDrawing` stays the page's loader until Task 7. It covers:
- prepare, then begin (J5-2);
- the `place` reason (J5-2);
- a WebGL probe before any download (J4's parked note);
- the GPU's lost and restored events;
- `keepPlace` with `placeAfter` (J5-3), on every switch and on teardown;
- a logged failure (J5-11);
- the session's floor;
- the engine's lifetime on the context (J5-4).

`still.ts` learns to stand aside the moment the drawing goes live (J5-5).

**Files:**
- Modify: `src/components/landing/journey/drawing-mode.ts`, `drawing.ts`, `start-journey.ts`, `still.ts`
- Create: `src/components/landing/journey/webgl-probe.ts`, `tests/unit/components/landing/journey/journey-context.ts` (a test helper)
- Test: `tests/unit/components/landing/journey/{drawing-mode.test.ts,drawing.test.tsx,start-journey.test.tsx,webgl-probe.test.tsx,still.test.tsx}`, and every other unit test that builds a `JourneyContext`

**Interfaces:**
- Consumes: `WEBGL_EVENT`, `WebglDetail` (Task 4); `Engine` (Task 4, as a type only).
- Produces:
  - `drawing-mode.ts`: `DRAWING_REASONS` gains `"place"` (last); `wantsScene(reasons: Reasons): boolean`; `startingReasons({ motion, saver, quality, place })`; `placeAfter(before: { top; bottom; height }, after: { top; height }, at: { scrollY; viewport; masthead }): number | null`. `keepsPlace` is removed.
  - `drawing.ts`: `type Begin = () => Teardown`; `type LoadLive = (ask: Ask, ctx: JourneyContext) => Promise<Begin>`; `drawingModule(loadLive: LoadLive, probe: () => boolean = webgl2): JourneyModule`; `noLiveDrawing`; `storedQuality(): string | null` (exported; Task 7's `scene/live.ts` imports it rather than repeating it); `startDrawing` (still `drawingModule(noLiveDrawing)` until Task 7).
  - `webgl-probe.ts`: `webgl2(): boolean`.
  - `start-journey.ts`: `JourneyContext` gains `readonly scene: Kept<Promise<Engine> | null>` and `readonly atEnd: (stop: Teardown) => void`; `interface Lifetime { atEnd(stop: Teardown): void; end(): void }`; `lifetime(): Lifetime`.
  - Test helper `testContext(overrides?: Partial<JourneyContext>): JourneyContext`.

- [ ] **Step 1: The test helper, then the failing tests**

`tests/unit/components/landing/journey/journey-context.ts`:
```ts
import type { ResultDetail } from "@/components/landing/journey/journey-events";
import type { Engine } from "@/components/landing/journey/scene/engine";
import { keep, type JourneyContext, type StillPlace } from "@/components/landing/journey/start-journey";

/** A journey's context for a unit test: Motion on, no intro, nothing kept yet, and an end that nothing reaches. */
export function testContext(overrides: Partial<JourneyContext> = {}): JourneyContext {
  return {
    motion: true,
    intro: false,
    result: keep<ResultDetail | null>(null),
    still: keep<StillPlace>({ columns: false, height: null }),
    scene: keep<Promise<Engine> | null>(null),
    atEnd: () => undefined,
    ...overrides,
  };
}
```
Run `grep -rn "still: keep" tests/unit` and, at every call it lists, replace the literal context with `testContext({ motion, intro, result })`, passing only the fields that differ from the helper's defaults (Motion on, no intro, a fresh `result`), so each file keeps its own overrides. Import `testContext` from `./journey-context`, and drop any import (`keep`, `ResultDetail`, `JourneyContext`) the file no longer uses. On the branch today that is:
- `board.test.tsx:18`: `testContext()`;
- `drawing.test.tsx:7`: `const ctx = (motion: boolean): JourneyContext => testContext({ motion });`;
- `hero.test.tsx:28` and `:44`: `testContext({ result: kept })`, and `:35`: `testContext({ motion: false, result: kept })`. The three share the one `kept` result: that shared result is what the test proves (the face survives a rebuild);
- `hero.test.tsx:55`: `testContext()`;
- `strokes.test.tsx:69`: `testContext({ intro: true })` (the intro's rings are what it tears down); `:78` and `:91`: `testContext()`.

The rail's `strip.test.tsx` went with the rail (#80).

`tests/unit/components/landing/journey/drawing-mode.test.ts`:
- Import `placeAfter` and `wantsScene` instead of `keepsPlace`.
- Pass `place: false` to every existing `startingReasons` call.
- Replace the `keepsPlace` test with:
```ts
  it("names place last, and starts with it when the reader is below the chapter (J5-2)", () => {
    expect(whyOf(startingReasons({ motion: false, saver: false, quality: null, place: true }))).toBe("motion place");
  });

  it("wants the scene only when nothing but the reader's place holds the drawing still", () => {
    expect(wantsScene(new Set())).toBe(true);
    expect(wantsScene(new Set(["place"]))).toBe(true);
    expect(wantsScene(new Set(["place", "saver"]))).toBe(false);
    expect(wantsScene(new Set(["webgl"]))).toBe(false);
  });

  it("places the reader once the chapter changed height under them (J5-3)", () => {
    const at = { scrollY: 5000, viewport: 800, masthead: 64 };
    // the chapter's top is visible: the change lands below the reader
    expect(placeAfter({ top: 100, bottom: 4260, height: 4160 }, { top: 100, height: 900 }, at)).toBeNull();
    // inside it: back to its start, under the masthead
    expect(placeAfter({ top: -2000, bottom: 2160, height: 4160 }, { top: -2000, height: 900 }, at)).toBe(5000 - 2000 - 64);
    // past it: by exactly the change, so what they read stays put
    expect(placeAfter({ top: -5000, bottom: -840, height: 4160 }, { top: -5000, height: 900 }, at)).toBe(5000 - 3260);
    // no change, no move
    expect(placeAfter({ top: -2000, bottom: 2160, height: 4160 }, { top: -2000, height: 4160.5 }, at)).toBeNull();
  });
```
`tests/unit/components/landing/journey/webgl-probe.test.tsx` (`.test.tsx`: this repo's vitest config gives jsdom only to `.test.tsx`, and the probe needs a document):
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { webgl2 } from "@/components/landing/journey/webgl-probe";

afterEach(() => vi.restoreAllMocks());

describe("webgl2", () => {
  it("is true only for a WebGL 2 context, and hands that context straight back", () => {
    const loseContext = vi.fn();
    const spy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ getExtension: () => ({ loseContext }) } as unknown as WebGL2RenderingContext);
    expect(webgl2()).toBe(true);
    expect(loseContext).toHaveBeenCalledTimes(1);
    spy.mockReturnValue(null);
    expect(webgl2()).toBe(false);
    spy.mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(webgl2()).toBe(false);
  });
});
```
`tests/unit/components/landing/journey/still.test.tsx`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DRAWING_EVENT, emit, type DrawingDetail } from "@/components/landing/journey/journey-events";
import { startStill } from "@/components/landing/journey/still";
import { testContext } from "./journey-context";

const html = document.documentElement;

beforeEach(() => {
  document.body.innerHTML = `<section id="anatomy"><div class="anatomy-pin is-columns"><div class="anatomy-copy"></div><div class="anatomy-still"></div><svg class="callout-lines"></svg><ol class="callouts"><li class="callout" data-part="shell" data-side="right" style="top: 40px"></li></ol><div class="title-block"></div></div></section>`;
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined }));
  Object.defineProperty(document, "fonts", { configurable: true, value: { ready: Promise.resolve() } });
  html.dataset.drawing = "still";
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete html.dataset.drawing;
  document.body.replaceChildren();
});

describe("the still's labels when the drawing goes live (J5-5)", () => {
  it("stand aside at once: columns cleared, nobody scrolled, and the kept place forgotten", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const ctx = testContext();
    ctx.still.set({ columns: true, height: 700 });
    const stop = startStill(ctx);
    html.dataset.drawing = "live";
    emit<DrawingDetail>(DRAWING_EVENT, { mode: "live", reasons: [] });
    expect(document.querySelector(".anatomy-pin")?.classList.contains("is-columns")).toBe(false);
    expect(document.querySelector<HTMLElement>(".callout")?.style.top).toBe("");
    expect(ctx.still.get()).toEqual({ columns: false, height: null });
    expect(scrollTo).not.toHaveBeenCalled();
    stop();
  });

  it("never lights or dims a label while the drawing is live: .is-hot is the live drawing's then", () => {
    const stop = startStill(testContext());
    html.dataset.drawing = "live";
    const label = document.querySelector(".callout")!;
    label.dispatchEvent(new PointerEvent("pointerenter"));
    expect(label.classList.contains("is-hot")).toBe(false);
    label.classList.add("is-hot"); // lit by the live drawing (scene/live.ts)
    label.dispatchEvent(new PointerEvent("pointerleave"));
    expect(label.classList.contains("is-hot")).toBe(true);
    stop();
  });
});
```
If jsdom lacks `PointerEvent`, use `new Event("pointerenter")` and `new Event("pointerleave")`. `tests/setup.ts` already defines `ResizeObserver` (non-configurable, so a `vi.stubGlobal` of it would throw); the test stubs only `matchMedia`.

`tests/unit/components/landing/journey/start-journey.test.tsx`: import `lifetime`, and add:
```ts
describe("a journey's lifetime (J5-4)", () => {
  it("runs what was handed to it once, newest first, when it ends; and at once once it has ended", () => {
    const life = lifetime();
    const order: string[] = [];
    life.atEnd(() => order.push("engine"));
    life.atEnd(() => order.push("later"));
    life.end();
    life.end();
    expect(order).toEqual(["later", "engine"]);
    life.atEnd(() => order.push("late"));
    expect(order).toEqual(["later", "engine", "late"]);
  });
});
```
`tests/unit/components/landing/journey/drawing.test.tsx`:
- Use `testContext` for `ctx`.
- Pass `() => true` as the probe to every `drawingModule(load)` (jsdom has no WebGL).
- Make every fake `LoadLive` resolve to a begin: `Promise.resolve(() => liveStop)`.
- "settles still with Motion on, because J4 has no live drawing to load" becomes "settles still with the reason load when the live drawing will not come", using `drawingModule(noLiveDrawing, () => true)`. Do the same in "writes back the drawing the boot script's own rule would choose…".
- "draws live when the live drawing loads, …, and follows its reasons" now expects `load` called once and the begin called twice (the prepared scene is reused).
- "stops a live drawing that arrives after the journey was torn down" now resolves the prepared promise with a begin `vi.fn()` after `stop()`, and expects that begin never to be called.
- Delete "keeps a reader inside the chapter at its start when the switch changes its height". `placeAfter`'s unit test and the new test below replace it.
- Add:
```ts
describe("J5: prepare, begin, and the reader's place", () => {
  const chapter = (top: number, height = 5000) => {
    document.body.innerHTML = `<header></header><section id="anatomy"></section>`;
    const section = document.getElementById("anatomy")!;
    const box = { top, height };
    section.getBoundingClientRect = () => ({ top: box.top, bottom: box.top + box.height, height: box.height }) as DOMRect;
    return { section, box };
  };
  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  afterEach(() => vi.useRealTimers());

  it("never asks for the scene without WebGL", () => {
    const load = vi.fn<LoadLive>();
    const stop = drawingModule(load, () => false)(testContext());
    expect(html.dataset.drawingWhy).toBe("webgl");
    expect(load).not.toHaveBeenCalled();
    stop();
  });

  it("pins the chapter when the live drawing begins, and unpins it on teardown", async () => {
    const { section } = chapter(200);
    const liveStop = vi.fn();
    const stop = drawingModule(() => Promise.resolve(() => liveStop), () => true)(testContext());
    await flush();
    expect(html.dataset.drawing).toBe("live");
    expect(section.classList.contains("is-live")).toBe(true);
    stop();
    expect(liveStop).toHaveBeenCalledTimes(1);
    expect(section.classList.contains("is-live")).toBe(false);
  });

  it("holds a reader below the chapter at the still, preparing the scene, and goes live once they come back above it", async () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const { section, box } = chapter(-600);
    const begin = vi.fn(() => () => undefined);
    const load = vi.fn<LoadLive>(() => Promise.resolve(begin));
    const stop = drawingModule(load, () => true)(testContext());
    expect(html.dataset.drawingWhy).toBe("place");
    expect(load).toHaveBeenCalledTimes(1);
    await flush();
    expect(begin).not.toHaveBeenCalled();
    box.top = 120;
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersToNextFrame();
    await flush();
    expect(html.dataset.drawing).toBe("live");
    expect(begin).toHaveBeenCalledTimes(1);
    expect(section.classList.contains("is-live")).toBe(true);
    stop();
  });

  it("hears the GPU: lost draws still, restored draws live again from the scene it already has", async () => {
    chapter(200);
    const liveStop = vi.fn();
    const begin = vi.fn(() => liveStop);
    const load = vi.fn<LoadLive>(() => Promise.resolve(begin));
    const stop = drawingModule(load, () => true)(testContext());
    await flush();
    emit<WebglDetail>(WEBGL_EVENT, "lost");
    expect(html.dataset.drawingWhy).toBe("webgl");
    expect(liveStop).toHaveBeenCalledTimes(1);
    emit<WebglDetail>(WEBGL_EVENT, "restored");
    await flush();
    expect(html.dataset.drawing).toBe("live");
    expect(begin).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenCalledTimes(1);
    stop();
  });

  it("warns once and draws still when the scene will not load, or will not start", async () => {
    chapter(200);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let stop = drawingModule(() => Promise.reject(new Error("blocked")), () => true)(testContext());
    await flush();
    expect(html.dataset.drawingWhy).toBe("load");
    stop();
    stop = drawingModule(
      () =>
        Promise.resolve(() => {
          throw new Error("no stage");
        }),
      () => true,
    )(testContext());
    await flush();
    expect(html.dataset.drawingWhy).toBe("load");
    expect(document.getElementById("anatomy")?.classList.contains("is-live")).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
    stop();
  });

  it("keeps the session's floor: the quality reason stores tt.q = still", async () => {
    chapter(200);
    let ask = null as Ask | null;
    const stop = drawingModule((a) => {
      ask = a;
      return Promise.resolve(() => () => undefined);
    }, () => true)(testContext());
    await flush();
    ask?.still("quality");
    expect(window.sessionStorage.getItem("tt.q")).toBe("still");
    expect(html.dataset.drawingWhy).toBe("quality");
    stop();
  });

  it("puts a reader inside the chapter back at its start when it unpins under them", async () => {
    const { box } = chapter(200, 5000);
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    let ask = null as Ask | null;
    const stop = drawingModule((a) => {
      ask = a;
      return Promise.resolve(() => () => {
        box.height = 1200; // the pin's height goes with it, as the CSS does
      });
    }, () => true)(testContext());
    await flush();
    box.top = -900;
    ask?.still("webgl");
    expect(scrollTo).toHaveBeenCalledWith({ top: -900 + window.scrollY, behavior: "instant" });
    stop();
  });
});
```
Import `Ask`, `WEBGL_EVENT`, `WebglDetail`, `emit` and `noLiveDrawing` where these tests need them. The masthead's foot is 0 in jsdom, so the chapter's start is its top plus `scrollY`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/unit/components/landing/journey`
Expected: FAIL. The new exports do not exist; `JourneyContext` has no `scene` or `atEnd`; still.ts does not stand aside.

- [ ] **Step 3: Implement**

`drawing-mode.ts`:
- Add `"place"` to the end of `DRAWING_REASONS`.
- `startingReasons` takes `readonly place: boolean` and adds `"place"` when it holds.
- Replace `keepsPlace` with:
```ts
/** Whether the scene may load now: nothing holds the drawing still but the reader's place, which clears by itself (J5-2). */
export function wantsScene(reasons: Reasons): boolean {
  return [...reasons].every((why) => why === "place");
}

/**
 * Where the reader belongs once the chapter changed height under them (J5-3), or null to stay put:
 * - its top is visible, or below: the change lands below them;
 * - inside it (its top gone above, over half the window still in it): its start, under the masthead;
 * - past it (its bottom within the window's top half): moved by exactly the change, so what they read stays put.
 */
export function placeAfter(
  before: { readonly top: number; readonly bottom: number; readonly height: number },
  after: { readonly top: number; readonly height: number },
  { scrollY, viewport, masthead }: { readonly scrollY: number; readonly viewport: number; readonly masthead: number },
): number | null {
  const change = after.height - before.height;
  if (Math.abs(change) <= 1 || before.top >= -8) return null;
  if (before.bottom > viewport * 0.5) return Math.round(after.top + scrollY - masthead);
  return Math.round(scrollY + change);
}
```

`webgl-probe.ts`:
```ts
// Whether this browser can draw the live train at all (spec §3.C, the webgl reason): a WebGL 2 context, handed
// straight back. Asked before anything is downloaded, so a page without WebGL never fetches three.js. No three here.

export function webgl2(): boolean {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}
```

`start-journey.ts`:
- Add `import type { Engine } from "./scene/engine";`. It is type-only, so the journey chunk gains no three.js.
- Add to `JourneyContext`:
```ts
  /** The live drawing's engine, kept for this startJourney's whole lifetime and reused by every rebuild (J5-4). */
  readonly scene: Kept<Promise<Engine> | null>;
  /** Runs `stop` once when this startJourney ends, never on a rebuild; at once if it has already ended. */
  readonly atEnd: (stop: Teardown) => void;
```
- Add, after `keep`:
```ts
export interface Lifetime {
  atEnd(stop: Teardown): void;
  end(): void;
}

/** What must outlive every rebuild but not the journey: the live drawing's engine above all (J5-4). */
export function lifetime(): Lifetime {
  const stops: Teardown[] = [];
  let ended = false;
  return {
    atEnd: (stop) => {
      if (ended) stop();
      else stops.push(stop);
    },
    end: () => {
      if (ended) return;
      ended = true;
      for (const stop of [...stops].reverse()) stop();
      stops.length = 0;
    },
  };
}
```
- In `startJourney`: create `const life = lifetime();` and `const scene = keep<Promise<Engine> | null>(null);` beside `result` and `still`. Build the context as `{ motion, intro, result, still, scene, atEnd: life.atEnd }`. Call `life.end(); scene.set(null);` in the returned teardown after `stopAll()`, and in the first-build `catch` after `memory.stop()`.

`drawing.ts`: replace the file with:
```ts
import { QUALITY_STORAGE_KEY, resolveDrawing, type MotionState, type SaverState } from "@/components/motion/motion-boot";
import { modeOf, placeAfter, startingReasons, wantsScene, whyOf, withReason, type DrawingMode, type DrawingReason, type Reasons } from "./drawing-mode";
import { DRAWING_EVENT, LAYOUT_EVENT, WEBGL_EVENT, emit, type DrawingDetail, type WebglDetail } from "./journey-events";
import type { JourneyContext, JourneyModule, Teardown } from "./start-journey";
import { webgl2 } from "./webgl-probe";

// Which drawing the page shows (spec §3.B–C; prototype v3's drawing.js), written to <html data-drawing> and
// data-drawing-why, and told as tt:drawing: live unless a reason holds. The head script guessed before first paint
// (motion-boot.ts); from here on this module decides. The live drawing comes in two steps (J5-2): prepared (the
// scene chunk, then the engine, a part at a time) as soon as nothing but the reader's place holds it back, then
// begun on the pinned chapter. The pin (#anatomy.is-live) is only ever written here, inside keepPlace (J5-3).

export interface Ask {
  readonly still: (why: DrawingReason) => void;
  readonly live: (why: DrawingReason) => void;
}
/** Starts the prepared live drawing on the pinned chapter; its teardown stops it. */
export type Begin = () => Teardown;
/** Prepares the live drawing and resolves to what begins it. */
export type LoadLive = (ask: Ask, ctx: JourneyContext) => Promise<Begin>;

export const noLiveDrawing: LoadLive = () => Promise.reject(new Error("no live drawing in this build"));

const PINNED = "is-live";
const PLACE_EVENTS = ["scroll", "resize", LAYOUT_EVENT] as const;

/** This session's tt.q: a quality step, "still" (the floor), or nothing. The live chapter imports this one reader
 * for the governor's starting step rather than repeating it (J5 pre-flight #15). */
export function storedQuality(): string | null {
  try {
    return window.sessionStorage.getItem(QUALITY_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** The quality floor lasts the session: the head script reads it on the next load (J4-12). */
function storeFloor(): void {
  try {
    window.sessionStorage.setItem(QUALITY_STORAGE_KEY, "still");
  } catch {
    // no session storage: the floor lasts this page only
  }
}

function mastheadBottom(): number {
  return Math.round(document.querySelector("header")?.getBoundingClientRect().bottom ?? 0);
}

/** Runs a change to the chapter, then puts the reader where placeAfter says (J5-3). A chapter already gone from the
 * document (a client navigation away) just changes. */
function keepPlace(section: HTMLElement | null, change: () => void): void {
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

export function drawingModule(loadLive: LoadLive, probe: () => boolean = webgl2): JourneyModule {
  return (ctx: JourneyContext): Teardown => {
    const { motion } = ctx;
    const html = document.documentElement;
    const section = document.getElementById("anatomy");
    const below = () => (section?.getBoundingClientRect().top ?? 0) < 0;
    let reasons: Reasons = startingReasons({ motion, saver: html.dataset.saver === "on", quality: storedQuality(), place: below() });
    // Probed only when nothing else keeps the drawing still, so a page without WebGL never fetches the scene.
    if (wantsScene(reasons) && !probe()) reasons = withReason(reasons, "webgl", true);
    let mode: DrawingMode | null = null;
    let alive = true;
    let prepared: Promise<Begin> | null = null;
    let live: Teardown | null = null;
    let warned = false;
    let watching = false;
    let placeFrame = 0;

    const report = (now: DrawingMode) => {
      html.dataset.drawing = now;
      html.dataset.drawingWhy = whyOf(reasons);
      emit<DrawingDetail>(DRAWING_EVENT, { mode: now, reasons: [...reasons] });
    };

    const ask: Ask = {
      still: (why) => {
        if (why === "quality") storeFloor();
        reasons = withReason(reasons, why, true);
        apply();
      },
      live: (why) => {
        reasons = withReason(reasons, why, false);
        apply();
      },
    };

    const failed = (error: unknown) => {
      if (!warned) {
        warned = true;
        console.warn("The live drawing did not start; the page draws it still.", error);
      }
      ask.still("load");
    };

    const prepare = () => {
      if (prepared) return;
      const mine = loadLive(ask, ctx);
      prepared = mine;
      mine.catch((error: unknown) => {
        if (prepared !== mine) return;
        prepared = null;
        if (alive) failed(error);
      });
    };

    const stopLive = () => {
      const stop = live;
      live = null;
      stop?.();
      section?.classList.remove(PINNED);
    };

    /** Pins the chapter and starts the live drawing on it; the error it threw, if it did. */
    const pin = (start: Begin): unknown => {
      let thrown: unknown;
      keepPlace(section, () => {
        section?.classList.add(PINNED);
        try {
          live = start();
        } catch (error) {
          thrown = error ?? new Error("the live drawing would not start");
          section?.classList.remove(PINNED);
        }
      });
      return thrown;
    };

    const begin = () => {
      const mine = prepared;
      if (!mine) return;
      mine.then(
        (start) => {
          if (!alive || prepared !== mine || mode !== "live" || live) return;
          // The reader went below the chapter while the scene loaded: pinning now would grow it under them.
          if (below()) {
            ask.still("place");
            return;
          }
          const thrown = pin(start);
          if (thrown !== undefined) {
            prepared = null;
            failed(thrown);
            return;
          }
          emit(LAYOUT_EVENT);
        },
        () => undefined,
      );
    };

    const recheck = () => {
      if (placeFrame) return;
      placeFrame = requestAnimationFrame(() => {
        placeFrame = 0;
        if (reasons.has("place") && !below()) ask.live("place");
      });
    };
    const watchPlace = (on: boolean) => {
      if (on === watching) return;
      watching = on;
      for (const type of PLACE_EVENTS) {
        if (on) window.addEventListener(type, recheck, { passive: true });
        else window.removeEventListener(type, recheck);
      }
      if (!on && placeFrame) {
        cancelAnimationFrame(placeFrame);
        placeFrame = 0;
      }
    };

    function apply(): void {
      if (!alive) return;
      if (wantsScene(reasons)) prepare();
      const want = modeOf(reasons);
      if (want !== mode) {
        keepPlace(section, () => {
          mode = want;
          report(want);
          if (want === "still") stopLive();
        });
        emit(LAYOUT_EVENT);
      } else report(want);
      if (want === "live") begin();
      watchPlace(reasons.has("place"));
    }

    // The GPU dropping its context (and giving it back) is heard here, not by the live drawing, which is torn down
    // while the context is gone (v3's gotcha).
    const onWebgl = (event: Event) => {
      if ((event as CustomEvent<WebglDetail>).detail === "lost") ask.still("webgl");
      else ask.live("webgl");
    };
    window.addEventListener(WEBGL_EVENT, onWebgl);

    apply();
    return () => {
      alive = false;
      prepared = null;
      watchPlace(false);
      window.removeEventListener(WEBGL_EVENT, onWebgl);
      keepPlace(section, stopLive);
      // A client navigation away leaves this markup for the next mount to find: it must read exactly what a fresh
      // boot script would choose for the motion this module was built with, never this lifetime's own reason.
      const motionState: MotionState = motion ? "on" : "off";
      const saverState: SaverState = html.dataset.saver === "on" ? "on" : "off";
      html.dataset.drawing = resolveDrawing(motionState, saverState, storedQuality());
      delete html.dataset.drawingWhy;
    };
  };
}

export const startDrawing = drawingModule(noLiveDrawing);
```
`(event as CustomEvent<WebglDetail>)` follows the existing pattern for window events (`sound.ts`).

`still.ts`:
- Import `type DrawingDetail`.
- Add a synchronous stand-aside:
```ts
  // The drawing going live takes the labels over (live-labels.ts, J5-5): let go of them at once, in the same task the
  // switch happens, so no frame of the still's columns ever shows under the pinned chapter. What was settled for the
  // still is forgotten; the next still settle measures afresh.
  const standAside = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    light(null);
    clear();
    still.set({ columns: false, height: null });
  };
  const onDrawing = (event: Event) => {
    if ((event as CustomEvent<DrawingDetail>).detail.mode === "live") standAside();
    else schedule();
  };
```
- Listen with `onDrawing` for `DRAWING_EVENT` in place of `schedule` (and remove it on teardown).
- At the top of `layout()`, after `frame = 0;`, add `if (document.documentElement.dataset.drawing !== "still") return standAside();`.
- In the labels' `enter` and `leave` handlers, light and dim only while the still draws, so `.is-hot` has one writer at a time (the live drawing's `setHot` while live):
```ts
    const enter = () => {
      if (fine.matches && document.documentElement.dataset.drawing === "still") light(label.dataset.part ?? null);
    };
    const leave = () => {
      if (document.documentElement.dataset.drawing === "still") light(null);
    };
```
  `standAside`'s one `light(null)` at the switch to live stays: it hands the labels over clean.
- Update the header comment: "…the live drawing (J5) takes the labels over, and this module stands aside."

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run tests/unit/components/landing/journey`
Expected: PASS.

Then the journey e2e that must not have moved (every page still settles still, now as `load` from a noLiveDrawing module; below the chapter it reads `load place`, or just `place` first):
```bash
lsof -nP -iTCP:4210 -sTCP:LISTEN
npx playwright test tests/e2e/journey --project=desktop --project=mobile
```
Expected: PASS. `drawing.spec.ts` asserts `data-drawing-why` of `load` at the top, where no place holds.

- [ ] **Step 5: The whole gate, then commit**

```bash
npm run check
git add src/components/landing/journey tests/unit/components/landing/journey
git commit -m "feat(journey): the drawing's modes get ready for a live drawing: prepare then begin, the reader's place, WebGL heard"
```

---
### Task 7: The train, drawn live

The live chapter and terminus (v3's `journey.js`), with their labels (v3's `labels.js`, under J5-5's rules), the pinned layout, the new words, and `drawing.ts` handed the real loader. This is the task where the train comes alive on the page, so its proof is e2e:
- it draws;
- its progress never steps back;
- its labels never fade;
- it tells the horn when it departs;
- nothing collides through the whole pinned chapter at three sizes.

J4's still specs are pinned to the still (J5-12).

**Files:**
- Create: `src/components/landing/journey/scene/scene-mark.ts`, `scene/live.ts`, `src/components/landing/journey/live-labels.ts`
- Modify: `src/components/landing/journey/drawing.ts` (the real loader), `journey-events.ts` (`DEPART_EVENT`, `THEME_EVENT`), `drawing-chapter.tsx`, `src/messages/en-IN/home.ts`, `src/styles/journey.css`, `src/styles/journey-island.css`
- Modify, only if CI's Chromium reports no WebGL (Step 1): `playwright.config.ts` (the SwiftShader flag)
- Test: `tests/unit/components/landing/journey/{live-labels.test.tsx,drawing-chapter.test.tsx,drawing.test.tsx}`; create `tests/e2e/journey/live-drawing.spec.ts`; modify `tests/e2e/journey/{journey-helpers.ts,drawing-checks.ts,drawing.spec.ts,collisions.spec.ts,drawing-modes.spec.ts,teardown.spec.ts}`

**Interfaces:**
- Consumes: everything from Tasks 2–4 and 6, including `storedQuality` (`drawing.ts`, Task 6); `frames` (`journey-helpers.ts`, Task 5); `Box`, `distribute`, `columnsZone`, `columnsFit`, `leaderFrom` (`labels-layout.ts`); `anatomyPose`, `terminusPose` (J4); `track` (`observers.ts`); `SMOOTH` (`motion-tokens.ts`).
- Produces:
  - `scene-mark.ts`: `SCENE_CHUNK_MARK = "tt-scene-chunk"`.
  - `scene/live.ts`: `prepareLive(ask: Ask, ctx: JourneyContext): Promise<Begin>`; it re-exports `SCENE_CHUNK_MARK`, and declares the dev-only `window.__ttJourney?: JourneyProbe` with `anatomy(): number`, `terminus(): number`, `quality(): number`, `night(): boolean`, `box(): Box | null` and `inked(selector: string): number`.
  - `live-labels.ts`: `revealOf(i: number, callouts: number): number`; `wipe(t: number): string`; `interface LiveLabels { pin; labels; layout(): Box | null; listMode(): boolean; beside(): boolean; draw(anchorOf, reveal): void; clear(): void }`; `createLiveLabels(section: HTMLElement): LiveLabels | null`.
  - `drawing.ts`: `LOAD_LIMIT_MS = 20_000`; `sceneLoader(importScene?: () => Promise<{ prepareLive: LoadLive }>): LoadLive` (the import defaults to `import("./scene/live")`); `loadScene: LoadLive = sceneLoader()`; `startDrawing = drawingModule(loadScene)`.
  - `journey-events.ts`: `DEPART_EVENT = "tt:depart"`, `THEME_EVENT = "tt:theme"`.
  - `messages.home.drawing`: `caption`, `dims: { length, height }`, `nameboard: { platform, departures }`.
  - E2E helpers: `waitForLive(page)`, `drawStill(page)`, `scrollIntoChapter(page, p)`; `blockChunk(page, mark)`, with `blockJourneyChunk(page)` (J4's, now a one-line wrapper) and `blockSceneChunk(page)` wrapping it.

- [ ] **Step 1: Prove WebGL where the tests run, then write the failing tests**

First, check that the live drawing can run in this Chromium, and that the e2e helpers will find WebGL 2:
```bash
node -e 'import("@playwright/test").then(async ({ chromium }) => { const b = await chromium.launch(); const p = await b.newPage(); console.log(await p.evaluate(() => Boolean(document.createElement("canvas").getContext("webgl2")))); await b.close(); })'
```
Expected: `true`.

CI's Linux runner is checked by this task's e2e on the PR. If CI reports `data-drawing-why` of `webgl`, add `launchOptions: { args: ["--enable-unsafe-swiftshader"] }` to the `desktop` and `mobile` projects in `playwright.config.ts`, commit it with this task (Step 8's `git add` names it), and say so in the PR.

`tests/unit/components/landing/journey/live-labels.test.tsx`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLiveLabels, revealOf, wipe } from "@/components/landing/journey/live-labels";

describe("the labels while the drawing is live (J5-5)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it("reveal down each column, a fifth of the way apart (v3's labels)", () => {
    expect(revealOf(0, 0.5)).toBeCloseTo(0.9, 9);
    expect(revealOf(4, 0.5)).toBeCloseTo(0.42, 9);
    expect(revealOf(5, 0.5)).toBeCloseTo(0.9, 9);
    expect(revealOf(0, 0)).toBe(0);
    expect(revealOf(9, 1)).toBe(1);
  });

  it("wipe in from the left, never fading: fully clipped at 0, nothing clipped at 1", () => {
    expect(wipe(0)).toBe("inset(0 100.0% 0 0)");
    expect(wipe(0.25)).toBe("inset(0 75.0% 0 0)");
    expect(wipe(1)).toBe("");
    expect(wipe(2)).toBe("");
  });

  it("add their own leader drawing, and take it and every mark of theirs away again", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    document.body.innerHTML = `<section id="anatomy"><div class="anatomy-pin"><div class="anatomy-copy"></div><ol class="callouts"><li class="callout" data-part="shell" data-side="right"></li></ol><ol class="anatomy-legend"></ol><div class="title-block"></div><p class="anatomy-caption"></p></div></section>`;
    const section = document.getElementById("anatomy")!;
    const labels = createLiveLabels(section);
    expect(labels).not.toBeNull();
    expect(section.querySelector("svg.live-lines")).not.toBeNull();
    labels?.layout(); // jsdom measures nothing, so neither columns nor the list leave the drawing room
    expect(labels?.pin.dataset.live).toBe("list");
    labels?.clear();
    expect(section.querySelector("svg.live-lines")).toBeNull();
    expect(labels?.pin.dataset.live).toBeUndefined();
    expect(labels?.pin.getAttribute("style") ?? "").not.toContain("--anatomy-copy-h");
  });

  it("are nothing without the chapter's markup", () => {
    document.body.innerHTML = `<section id="anatomy"></section>`;
    expect(createLiveLabels(document.getElementById("anatomy")!)).toBeNull();
  });
});
```
In `tests/unit/components/landing/journey/drawing-chapter.test.tsx`, add:
```ts
  it("gives the live drawing a stage, its two dimension figures and its caption; the stage and figures are decoration", () => {
    const { container } = render(<DrawingChapter />);
    expect(container.querySelector(".anatomy-stage")?.getAttribute("aria-hidden")).toBe("true");
    const dims = [...container.querySelectorAll<HTMLElement>(".dim-label")];
    expect(dims.map((d) => [d.dataset.dim, d.textContent, d.getAttribute("aria-hidden")])).toEqual([
      ["length", "≈ 20 560 mm", "true"],
      ["height", "≈ 4 255 mm", "true"],
    ]);
    expect(container.querySelector(".anatomy-caption")).toHaveTextContent("Scroll · the drawing turns, comes apart, couples up and departs");
  });
```
In `tests/unit/components/landing/journey/drawing.test.tsx`, add `LOAD_LIMIT_MS` and `sceneLoader` to the drawing import, and add:
```ts
describe("the scene's 20 s limit (spec §3.C, load; J5-11)", () => {
  afterEach(() => vi.useRealTimers());

  it("gives up on a scene chunk that never arrives at 20 s, and draws still for load", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // an import that never settles: only the limit can end the wait
    const stop = drawingModule(sceneLoader(() => new Promise(() => undefined)), () => true)(testContext());
    await vi.advanceTimersByTimeAsync(LOAD_LIMIT_MS - 1);
    expect(html.dataset.drawingWhy).toBe("");
    expect(warn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(html.dataset.drawingWhy).toBe("load");
    expect(warn).toHaveBeenCalledWith(expect.any(String), new Error("the live drawing took over 20 s to arrive"));
    stop();
    warn.mockRestore();
  });
});
```
`tests/e2e/journey/journey-helpers.ts`: import `SCENE_CHUNK_MARK` from `@/components/landing/journey/scene/scene-mark`. Replace `blockJourneyChunk` with one helper for any chunk and a one-line wrapper (J5 pre-flight #15):
```ts
/** Aborts the one script chunk that carries `mark`, found by its content, so its hashed name never matters. */
export async function blockChunk(page: Page, mark: string): Promise<void> {
  await page.route("**/_next/static/**/*.js", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (body.includes(mark)) return route.abort();
    return route.fulfill({ response, body });
  });
}

/** Aborts the journey chunk. */
export const blockJourneyChunk = (page: Page): Promise<void> => blockChunk(page, JOURNEY_CHUNK_MARK);
```
Then add:
```ts
/** The drawing is live and pinned: the scene loaded, the engine built, the chapter began. */
export async function waitForLive(page: Page): Promise<void> {
  await waitForJourney(page);
  await expect(page.locator("#anatomy")).toHaveClass(/is-live/, { timeout: 25_000 });
  await expect(page.locator("html")).toHaveAttribute("data-drawing", "live");
}

/** Holds the page to the still drawing for its session, as the quality floor does (J5-12): for specs about the still. */
export async function drawStill(page: Page): Promise<void> {
  await page.addInitScript(() => window.sessionStorage.setItem("tt.q", "still"));
}

/** Scrolls the pinned chapter to progress p (0–1): 0 as the pin takes hold, 1 as the chapter's foot reaches the
 * window's. Waits for the drawing to follow (its progress trails the scroll a little, by design). */
export async function scrollIntoChapter(page: Page, p: number): Promise<void> {
  await page.evaluate((at) => {
    const section = document.getElementById("anatomy");
    const pin = section?.querySelector(".anatomy-pin");
    if (!section || !pin) throw new Error("#anatomy is missing");
    const stick = Number.parseFloat(getComputedStyle(pin).top) || 0;
    const start = section.getBoundingClientRect().top + window.scrollY - stick;
    const run = section.offsetHeight - window.innerHeight + stick;
    window.scrollTo({ top: start + run * at, behavior: "instant" });
  }, p);
  await expect.poll(() => page.evaluate(() => window.__ttJourney?.anatomy() ?? -1), { timeout: 5_000 }).toBeCloseTo(p, 1);
}

/** Aborts the scene chunk (three.js and the live drawing). */
export const blockSceneChunk = (page: Page): Promise<void> => blockChunk(page, SCENE_CHUNK_MARK);
```
In `tests/e2e/journey/drawing-checks.ts`, let `drawingCollisions` read the live drawing too. Replace the start of the function's `page.evaluate` body, up to the `const pr = pin.getBoundingClientRect();` line, with:
```ts
    const pin = document.querySelector<HTMLElement>('#anatomy .anatomy-pin.is-columns, #anatomy .anatomy-pin[data-live="columns"]');
    if (!pin) return [];
    const live = pin.dataset.live === "columns";
    const found: string[] = [];
    // while live, a label still wiping in is not there yet (J5-5): only whole labels count
    const labels = [...pin.querySelectorAll<HTMLElement>(".callout")]
      .filter((el) => !live || getComputedStyle(el).clipPath === "none")
      .map((el) => ({ part: el.dataset.part ?? "", r: el.getBoundingClientRect() }));
    type R = { left: number; top: number; right: number; bottom: number };
    const overlaps = (a: R, b: R) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    let drawn: R | null = null;
    if (live) {
      const box = window.__ttJourney?.box() ?? null;
      drawn = box ? { left: box.l, top: box.t, right: box.r, bottom: box.b } : null;
    } else {
      const svg = [...pin.querySelectorAll<SVGSVGElement>(".anatomy-still:not(.is-noscript) svg")].find((s) => s.checkVisibility());
      const box = svg?.getBBox();
      const m = svg?.getScreenCTM();
      if (box && m && box.width > 0) {
        const p = (x: number, y: number) => new DOMPoint(x, y).matrixTransform(m);
        const a = p(box.x, box.y);
        const b = p(box.x + box.width, box.y + box.height);
        drawn = { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) };
      }
    }
    if (drawn) for (const l of labels) if (overlaps(l.r, drawn)) found.push(`label ${l.part} over the drawing`);
```
Then change the leaders' selector from `".callout-lines line"` to `live ? ".live-lines line" : ".callout-lines line"`, and pair each leader with its label by `data-part` from the full label list (not the filtered one): build `const every = [...pin.querySelectorAll<HTMLElement>(".callout")].map((el) => el.dataset.part ?? "");` and name leader `i` by `every[i]`. While live, skip a leader whose `Number(line.style.opacity)` is below 0.95, since it is still drawing in. The rest of the function stays as it is.

`tests/e2e/journey/live-drawing.spec.ts`:
```ts
import { expect, test } from "../fixtures";
import { collisionsInView } from "./collisions";
import { drawingCollisions } from "./drawing-checks";
import { frames, scrollIntoChapter, scrollToId, waitForLive } from "./journey-helpers";

test.describe("the train, drawn live (spec §3.A, §3.C)", () => {
  test("loads its scene, pins the chapter and draws into its stage", async ({ page }) => {
    await page.goto("/");
    await waitForLive(page);
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "");
    await expect(page.locator("#journey-canvas")).toBeVisible();
    await scrollIntoChapter(page, 0.4);
    await expect.poll(() => page.evaluate(() => window.__ttJourney?.inked("#anatomy .anatomy-stage") ?? 0)).toBeGreaterThan(0.002);
  });

  test("its progress never steps back while scrolling down (§3.H)", async ({ page }) => {
    await page.goto("/");
    await waitForLive(page);
    await scrollIntoChapter(page, 0);
    const seen: number[] = [];
    for (let i = 0; i < 40; i += 1) {
      await page.mouse.wheel(0, 180);
      await frames(page, 3); // the wheel's scroll has landed and the drawing has followed it a step
      seen.push(await page.evaluate(() => window.__ttJourney?.anatomy() ?? 0));
    }
    const back = seen.filter((p, i) => i > 0 && p < seen[i - 1]! - 1e-6);
    expect(back, seen.join(", ")).toEqual([]);
    expect(seen.at(-1)).toBeGreaterThan(0.5);
  });

  test("tells the horn once as the train pulls away on the way down, and not on the way back", async ({ page }) => {
    await page.goto("/");
    await waitForLive(page);
    await page.evaluate(() => {
      const w = window as unknown as { __departs: number };
      w.__departs = 0;
      window.addEventListener("tt:depart", () => (w.__departs += 1));
    });
    await scrollIntoChapter(page, 0.8);
    await scrollIntoChapter(page, 0.95);
    await scrollIntoChapter(page, 0.6);
    expect(await page.evaluate(() => (window as unknown as { __departs: number }).__departs)).toBe(1);
  });

  test("draws the arrived train at the terminus", async ({ page }) => {
    await page.goto("/");
    await waitForLive(page);
    await scrollToId(page, "terminus", 80);
    await expect.poll(() => page.evaluate(() => window.__ttJourney?.inked(".terminus-stage") ?? 0)).toBeGreaterThan(0.002);
  });

  test("draws Night from the theme's own tokens", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("tt.theme", "dark"));
    await page.goto("/");
    await waitForLive(page);
    expect(await page.evaluate(() => window.__ttJourney?.night())).toBe(true);
  });
});

test.describe("the live labels (J5-5)", () => {
  test.skip(({ isMobile }) => isMobile, "the columns are a wide screen's");

  test("stand in columns, wiping in and rising, never fading, and stay the page's list", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForLive(page);
    await scrollIntoChapter(page, 0.05);
    const pin = page.locator("#anatomy .anatomy-pin");
    await expect(pin).toHaveAttribute("data-live", "columns");
    const labels = page.locator("#anatomy .callout");
    await expect(page.getByRole("list", { name: "What each part does" }).getByRole("listitem")).toHaveCount(10);
    expect(await labels.evaluateAll((els) => els.map((el) => getComputedStyle(el).clipPath))).not.toContain("none");
    await scrollIntoChapter(page, 0.4);
    const shown = await labels.evaluateAll((els) => els.map((el) => [getComputedStyle(el).opacity, getComputedStyle(el).clipPath]));
    expect(shown.every(([opacity, clip]) => opacity === "1" && clip === "none"), JSON.stringify(shown)).toBe(true);
    await expect(page.locator("#anatomy .live-lines line")).toHaveCount(10);
  });

  test("a label under a fine pointer lights its part, and the part lights its label", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForLive(page);
    await scrollIntoChapter(page, 0.4);
    const label = page.locator('#anatomy .callout[data-part="shell"]');
    await label.hover();
    await expect(label).toHaveClass(/is-hot/);
  });
});

const SIZES = [
  { name: "1440×900", viewport: { width: 1440, height: 900 } },
  { name: "390×844", viewport: { width: 390, height: 844 } },
  { name: "844×390, a phone on its side", viewport: { width: 844, height: 390 } },
] as const;

test.describe("nothing collides through the live chapter (spec §5)", () => {
  test.skip(({ isMobile }) => isMobile, "each size is set here");
  for (const size of SIZES) {
    test(`at ${size.name}`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize(size.viewport);
      await page.goto("/");
      await waitForLive(page);
      const found: string[] = [];
      for (let k = 0; k <= 20; k += 1) {
        await scrollIntoChapter(page, k / 20);
        await frames(page); // the labels, leaders and figures have been placed for this progress
        for (const f of [...(await collisionsInView(page)), ...(await drawingCollisions(page))]) found.push(`${k / 20}: ${f}`);
      }
      expect(found).toEqual([]);
    });
  }
});
```
Pin J4's still specs to the still (J5-12):
- In `drawing.spec.ts` and in the `collisions.spec.ts` describe "the drawn train at #anatomy: nothing collides in columns", add `test.beforeEach(async ({ page }) => drawStill(page));`, and add `drawStill` to each file's `./journey-helpers` import: `drawing.spec.ts` imports `{ drawStill, scrollToId, waitForJourney }`, `collisions.spec.ts` imports `{ drawStill, waitForJourney }`.
- In `drawing.spec.ts`'s first test, the expected `data-drawing-why` becomes `quality`.
- In `drawing-modes.spec.ts`, replace "a live page fetches no still file until the page draws still" with:
```ts
  test("a live page never fetches a still file", async ({ page }) => {
    const fetched: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/journey/")) fetched.push(r.url());
    });
    await page.goto("/");
    await waitForLive(page);
    await scrollIntoChapter(page, 0.5);
    await scrollToId(page, "terminus");
    // the terminus has drawn live: every stage this page shows has been drawn, and none asked for a still
    await expect.poll(() => page.evaluate(() => window.__ttJourney?.inked(".terminus-stage") ?? 0)).toBeGreaterThan(0.002);
    expect(fetched).toEqual([]);
  });
```
  That test replaces the only use of `JOURNEY_CHUNK_MARK` in `drawing-modes.spec.ts`, so its imports become exactly:
```ts
import { expect, test } from "../fixtures";
import { STILL_MANIFEST } from "@/components/landing/journey/still-manifest";
import { blockJourneyChunk, motionOff, scrollIntoChapter, scrollToId, stubSaveData, waitForJourney, waitForLive } from "./journey-helpers";
```
- In `teardown.spec.ts`, add `"clip-path"` to `STYLE`, so a label or figure left clipped after a live run shows as a difference.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/unit/components/landing/journey/live-labels.test.tsx tests/unit/components/landing/journey/drawing-chapter.test.tsx tests/unit/components/landing/journey/drawing.test.tsx`
Expected: FAIL. `live-labels.ts`, the new markup, `LOAD_LIMIT_MS` and `sceneLoader` do not exist.

Then `npx playwright test tests/e2e/journey/live-drawing.spec.ts --project=desktop`.
Expected: FAIL at `waitForLive`. `#anatomy` never gets `is-live`, because `startDrawing` still uses `noLiveDrawing`.

- [ ] **Step 3: The words, the markup and the events**

`src/messages/en-IN/home.ts`, in `drawing`, after `listLabel`:
```ts
    caption: "Scroll · the drawing turns, comes apart, couples up and departs",
    dims: { length: "≈ 20 560 mm", height: "≈ 4 255 mm" },
    nameboard: { platform: "PLATFORM 3", departures: "DEPARTURES" },
```
`drawing-chapter.tsx`:
- Add `<div className="anatomy-stage" aria-hidden="true" />` as the first child of `.anatomy-pin`.
- After the title block, add:
```tsx
        <span className="dim-label tnum" data-dim="length" aria-hidden="true">
          {m.dims.length}
        </span>
        <span className="dim-label tnum" data-dim="height" aria-hidden="true">
          {m.dims.height}
        </span>
        <p className="anatomy-caption legend-sm">{m.caption}</p>
```
- Change its doc comment's last sentence to: "While the drawing is live, drawing.ts pins this section and scene/live.ts draws into its stage (J5)."

`journey-events.ts`, after `WEBGL_EVENT`:
```ts
/** The drawn train pulls away (progress 0.88, scrolling down): the horn's cue. */
export const DEPART_EVENT = "tt:depart";
/** Redraw the live drawing in the current theme now: the live drawing re-reads its tokens and draws at once. Night
 * falls (J6) sends it inside its view transition, as journey.redrawNow() (J5-9). */
export const THEME_EVENT = "tt:theme";
```
`src/components/landing/journey/scene/scene-mark.ts`:
```ts
/** A string only the scene chunk carries, so an e2e test can block that chunk and nothing else (J5-14). No three here. */
export const SCENE_CHUNK_MARK = "tt-scene-chunk";
```

- [ ] **Step 4: The labels while live**

`src/components/landing/journey/live-labels.ts`:
```ts
import { columnsFit, columnsZone, distribute, leaderFrom, type Box } from "./labels-layout";
import { clamp } from "./scene/math";
import { isPartId, partSide, type PartId } from "./train-parts";

// The drawn train's labels while the drawing is live (spec §3.A; prototype v3's labels.js, under J5-5): two columns
// beside the drawing on wide screens, or the page's parts list when the columns cannot fit, and below 64rem. Each
// label rises and wipes in by transform and clip-path, never opacity or visibility: they are the page's real list.
// Their leaders are drawn in their own svg. Everything is laid out from measured boxes, never fixed spots. No three
// here (scene/math.ts has none).

const NS = "http://www.w3.org/2000/svg";
const NARROW = "(max-width: 63.99rem)";

/** Label i's reveal (v3): the callouts phase ×1.8, each fifth a step later, so each column fills from the top. */
export function revealOf(i: number, callouts: number): number {
  return clamp(callouts * 1.8 - (i % 5) * 0.12);
}

/** A left-to-right wipe for words that must never fade: all of it clipped at 0, none at 1. */
export function wipe(t: number): string {
  const k = clamp(t);
  return k >= 1 ? "" : `inset(0 ${((1 - k) * 100).toFixed(1)}% 0 0)`;
}

export interface LiveLabels {
  readonly pin: HTMLElement;
  readonly labels: readonly HTMLElement[];
  /** Lays the labels out; the zone the drawing keeps to (pin-relative px), or null when even the list leaves it no room. */
  layout(): Box | null;
  listMode(): boolean;
  /** The list stands beside the drawing (a phone on its side). */
  beside(): boolean;
  /** Places each label at its reveal (0–1) and its leader toward its part's viewport point. */
  draw(anchorOf: (part: PartId) => { readonly x: number; readonly y: number } | null, reveal: (i: number) => number): void;
  clear(): void;
}

export function createLiveLabels(section: HTMLElement): LiveLabels | null {
  const pin = section.querySelector<HTMLElement>(".anatomy-pin");
  const copy = pin?.querySelector<HTMLElement>(".anatomy-copy");
  const caption = pin?.querySelector<HTMLElement>(".anatomy-caption");
  const titleBlock = pin?.querySelector<HTMLElement>(".title-block");
  const legend = pin?.querySelector<HTMLElement>(".anatomy-legend");
  if (!pin || !copy || !caption || !titleBlock || !legend) return null;
  const labels = [...pin.querySelectorAll<HTMLElement>(".callout")];
  const left = labels.filter((l) => l.dataset.side === "left");
  const right = labels.filter((l) => l.dataset.side === "right");
  const narrow = window.matchMedia(NARROW);
  const lines = document.createElementNS(NS, "svg");
  lines.classList.add("live-lines");
  lines.setAttribute("aria-hidden", "true");
  lines.setAttribute("focusable", "false");
  const leaders = labels.map(() => {
    const line = document.createElementNS(NS, "line");
    const dot = document.createElementNS(NS, "circle");
    dot.setAttribute("r", "3.5");
    lines.append(line, dot);
    return { line, dot };
  });
  pin.append(lines);
  let tops = new Map<HTMLElement, number>();
  let beside = false;

  const rel = (el: Element, pr: DOMRect) => {
    const r = el.getBoundingClientRect();
    return { top: r.top - pr.top, bottom: r.bottom - pr.top };
  };
  const resetLabels = () => {
    for (const l of labels) {
      l.style.removeProperty("transform");
      l.style.removeProperty("clip-path");
    }
  };

  const columns = (): Box | null => {
    pin.dataset.live = "columns";
    let fits = false;
    let placed = new Map<HTMLElement, number>();
    for (const compact of [false, true]) {
      pin.toggleAttribute("data-compact", compact);
      const pr = pin.getBoundingClientRect();
      const l = distribute(left.map((el) => el.offsetHeight), rel(copy, pr).bottom + 22, rel(caption, pr).top - 14);
      const r = distribute(right.map((el) => el.offsetHeight), Math.max(20, pr.height * 0.05), rel(titleBlock, pr).top - 14);
      placed = new Map([...left.map((el, i) => [el, l.tops[i] ?? 0] as const), ...right.map((el, i) => [el, r.tops[i] ?? 0] as const)]);
      if (l.fits && r.fits) {
        fits = true;
        break;
      }
    }
    const pr = pin.getBoundingClientRect();
    const zone = columnsZone({
      leftEdges: left.map((el) => el.offsetLeft + el.offsetWidth),
      rightEdges: right.map((el) => el.offsetLeft),
      top: rel(copy, pr).bottom + 16,
      floor: Math.min(rel(caption, pr).top, rel(titleBlock, pr).top) - 16,
    });
    if (!columnsFit({ fits, zone, pinWidth: pr.width, titleWidth: titleBlock.offsetWidth })) return null;
    tops = placed;
    return zone;
  };

  const list = (): Box => {
    pin.dataset.live = "list";
    pin.removeAttribute("data-compact");
    tops = new Map();
    resetLabels();
    // the words scroll away under the masthead first; then the drawing and its list hold the window (CSS)
    pin.style.setProperty("--anatomy-copy-h", `${Math.round(copy.offsetTop + copy.offsetHeight)}px`);
    const pr = pin.getBoundingClientRect();
    const t = rel(copy, pr).bottom + 16;
    const lr = legend.getBoundingClientRect();
    beside = lr.left > pr.left + pr.width * 0.45;
    if (beside) return { l: 8 - pr.left, r: lr.left - 12 - pr.left, t, b: pr.height - 12 };
    return { l: 8 - pr.left, r: window.innerWidth - 8 - pr.left, t, b: lr.top - pr.top - 12 };
  };

  return {
    pin,
    labels,
    layout() {
      beside = false;
      pin.style.removeProperty("--anatomy-copy-h");
      const zone = (!narrow.matches ? columns() : null) ?? list();
      return zone.b - zone.t >= 150 && zone.r - zone.l >= 200 ? zone : null;
    },
    listMode: () => pin.dataset.live !== "columns",
    beside: () => beside,
    draw(anchorOf, reveal) {
      const pr = pin.getBoundingClientRect();
      lines.setAttribute("viewBox", `0 0 ${pr.width.toFixed(1)} ${pr.height.toFixed(1)}`);
      const inColumns = pin.dataset.live === "columns";
      // every box read before anything is written, so no write forces a layout
      const boxes = labels.map((l) => ({ left: l.offsetLeft, width: l.offsetWidth }));
      labels.forEach((label, i) => {
        const leader = leaders[i];
        const part = label.dataset.part ?? "";
        if (!leader) return;
        const hide = () => {
          leader.line.style.opacity = "0";
          leader.dot.style.opacity = "0";
        };
        if (!inColumns || !isPartId(part)) return hide();
        const t = clamp(reveal(i));
        const rise = (1 - t) * 8;
        const top = (tops.get(label) ?? 0) + rise;
        label.style.transform = `translateY(${top.toFixed(2)}px)`;
        label.style.clipPath = wipe(t);
        const at = anchorOf(part);
        if (!at) return hide();
        const seg = leaderFrom({ left: boxes[i]?.left ?? 0, top, width: boxes[i]?.width ?? 0 }, partSide(part), { x: at.x - pr.left, y: at.y - pr.top });
        leader.line.setAttribute("x1", seg.x1.toFixed(1));
        leader.line.setAttribute("y1", seg.y1.toFixed(1));
        leader.line.setAttribute("x2", (seg.x1 + (seg.x2 - seg.x1) * t).toFixed(1));
        leader.line.setAttribute("y2", (seg.y1 + (seg.y2 - seg.y1) * t).toFixed(1));
        leader.line.style.opacity = String(t);
        leader.dot.setAttribute("cx", seg.x2.toFixed(1));
        leader.dot.setAttribute("cy", seg.y2.toFixed(1));
        leader.dot.style.opacity = t > 0.95 ? "1" : "0";
      });
    },
    clear() {
      lines.remove();
      delete pin.dataset.live;
      pin.removeAttribute("data-compact");
      pin.style.removeProperty("--anatomy-copy-h");
      resetLabels(); // .is-hot is scene/live.ts's: its teardown's setHot(null) clears it
    },
  };
}
```

- [ ] **Step 5: The live chapter and its door**

`src/components/landing/journey/scene/live.ts`:
```ts
import { animate, onScroll } from "animejs";
import { Vector3, type PerspectiveCamera } from "three";
import { QUALITY_STORAGE_KEY } from "@/components/motion/motion-boot";
import { messages } from "@/messages";
import { storedQuality, type Ask, type Begin } from "../drawing";
import { createGovernor, startLevel } from "../governor";
import { DEPART_EVENT, LAYOUT_EVENT, THEME_EVENT, emit } from "../journey-events";
import type { Box } from "../labels-layout";
import { createLiveLabels, revealOf, wipe } from "../live-labels";
import { SMOOTH } from "../motion-tokens";
import { track } from "../observers";
import { anatomyPose, terminusPose, type AnatomyPose } from "../pose";
import type { JourneyContext, Teardown } from "../start-journey";
import { isPartId } from "../train-parts";
import { QUALITY, createEngine, type Engine } from "./engine";
import type { Rect } from "./fit";
import { smoothstep } from "./math";
import { readPalette, systemReader, tokenReader, type ScenePalette } from "./palette";
import type { RigPartId } from "./rig";
import { SCENE_CHUNK_MARK } from "./scene-mark";

// The live drawn train (spec §3.A–C; prototype v3's journey.js): the scene chunk's only door. The drawing chapter,
// pinned while a scan gate sweeps the steel locomotive into its drawing; it turns, comes apart into labelled parts,
// shows its dimensions, takes its coaches and departs past the line side (tt:depart, the horn's cue). And the terminus
// arrival above the closing plate. Anime.js turns scroll into progress; one render loop draws while a stage shows,
// and a governor steps quality down when frames run long. The engine is kept for the journey's life (J5-4).

export { SCENE_CHUNK_MARK };

interface JourneyProbe {
  anatomy(): number;
  terminus(): number;
  quality(): number;
  night(): boolean;
  box(): Box | null;
  inked(selector: string): number;
}
declare global {
  interface Window {
    /** Outside production builds only (J5-13): what the e2e specs read. */
    __ttJourney?: JourneyProbe;
  }
}

const night = (): boolean => document.documentElement.dataset.theme === "dark";
const FORCED = "(forced-colors: active)";

/** The theme's tokens, or the system's own colours under forced colours (J5-21); null when they do not parse. */
function readColours(): ScenePalette | null {
  return readPalette(window.matchMedia(FORCED).matches ? systemReader() : tokenReader(), night());
}

function palette(): ScenePalette {
  const p = readColours();
  if (!p) throw new Error("the theme's colour tokens did not parse");
  return p;
}

/** Waits for the page: scheduler.yield where the browser has it, else a task. */
function pause(): Promise<void> {
  const scheduler: unknown = Reflect.get(window, "scheduler");
  const yielding: unknown = typeof scheduler === "object" && scheduler !== null ? Reflect.get(scheduler, "yield") : undefined;
  if (typeof yielding === "function") {
    const waited: unknown = Reflect.apply(yielding, scheduler, []);
    return Promise.resolve(waited).then(() => undefined);
  }
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

/** The engine for this journey: built once, a part at a time, and disposed when the journey ends (J5-4). */
function engineFor(ctx: JourneyContext): Promise<Engine> {
  const held = ctx.scene.get();
  if (held) return held;
  const colours = palette();
  const canvas = document.createElement("canvas");
  canvas.id = "journey-canvas";
  canvas.setAttribute("aria-hidden", "true");
  canvas.hidden = true;
  (document.getElementById("app-root") ?? document.body).append(canvas);
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim() || "sans-serif";
  const coaches = window.matchMedia("(max-width: 47.99rem)").matches ? 2 : 3;
  const made = createEngine(canvas, { palette: colours, coaches, words: messages.home.drawing.nameboard, family }, pause);
  ctx.scene.set(made);
  ctx.atEnd(() => {
    void made.then(
      (engine) => {
        engine.dispose();
        canvas.remove();
      },
      () => canvas.remove(),
    );
  });
  made.catch(() => {
    if (ctx.scene.get() === made) ctx.scene.set(null);
    canvas.remove();
  });
  return made;
}

/** Loads nothing more: builds (or reuses) the engine and hands back what begins the live chapter on it. */
export async function prepareLive(ask: Ask, ctx: JourneyContext): Promise<Begin> {
  const engine = await engineFor(ctx);
  return () => startLive(engine, ask);
}

function startLive(engine: Engine, ask: Ask): Teardown {
  const section = document.getElementById("anatomy");
  const stageA = section?.querySelector<HTMLElement>(".anatomy-stage");
  const labels = section ? createLiveLabels(section) : null;
  if (!section || !stageA || !labels) throw new Error("the drawing chapter's markup is missing");
  const stageT = document.querySelector<HTMLElement>(".terminus-stage");
  const { pin } = labels;
  const dims = [...pin.querySelectorAll<HTMLElement>(".dim-label")];
  const { rig, camera } = engine.world;
  const A = { p: 0 };
  const T = { p: 0 };
  const target = new Vector3();
  const pickCamera: PerspectiveCamera = camera.clone();
  let poseA: AnatomyPose | null = null;
  let rectA: Rect | null = null;
  let zone: Box | null = null;
  let alive = true;
  let drawnKey = "";
  engine.setPalette(palette()); // the theme may have changed while nothing live listened
  engine.canvas.hidden = false; // this module owns the canvas element: it shows only while the drawing is live

  // ---- pointing: a label lights its part, a part lights its label (fine pointers only)
  let hot: RigPartId | null = null;
  const setHot = (id: RigPartId | null) => {
    if (id === hot) return;
    hot = id;
    rig.setHighlight(id);
    for (const l of labels.labels) l.classList.toggle("is-hot", l.dataset.part === id);
    engine.frame();
  };
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const onStageMove = (e: PointerEvent) => {
    if (!rectA || !poseA || poseA.callouts < 0.5) return setHot(null);
    setHot(engine.pick(e.clientX, e.clientY, rectA, pickCamera));
  };
  const onStageLeave = () => setHot(null);
  const pointing = fine
    ? labels.labels.map((label) => {
        const enter = () => {
          const part = label.dataset.part ?? "";
          setHot(isPartId(part) ? part : null);
        };
        label.addEventListener("pointerenter", enter);
        label.addEventListener("pointerleave", onStageLeave);
        return () => {
          label.removeEventListener("pointerenter", enter);
          label.removeEventListener("pointerleave", onStageLeave);
        };
      })
    : [];
  if (fine) {
    stageA.addEventListener("pointermove", onStageMove);
    stageA.addEventListener("pointerleave", onStageLeave);
  }

  // ---- after each anatomy frame: the labels, their leaders and the dimension figures
  const placeOverlay = () => {
    const pose = poseA;
    const rect = rectA;
    if (!pose || !rect) return;
    pickCamera.copy(camera);
    labels.draw((part) => engine.project(rig.anchor(part), rect), (i) => revealOf(i, pose.callouts));
    const pr = pin.getBoundingClientRect();
    for (const el of dims) {
      const s = engine.project(rig.dimAnchor(el.dataset.dim === "height" ? "height" : "length"), rect);
      el.style.transform = `translate(${(s.x - pr.left).toFixed(1)}px, ${(s.y - pr.top).toFixed(1)}px) translate(-50%, -50%)`;
      el.style.clipPath = wipe(pose.dims);
    }
  };

  engine.addView("anatomy", {
    el: stageA,
    bleed: true,
    update: ({ camera: cam, rect, aspect, quality, night: isNight }) => {
      const pose = anatomyPose(A.p, aspect);
      poseA = pose;
      rectA = rect;
      engine.live(pose, quality, isNight);
      if (!zone) return;
      const pr = pin.getBoundingClientRect();
      target.set(...pose.target);
      // the sides hold while the list stands beside the drawing (and let go as the train pulls away), or while the
      // labels flank it
      const across = labels.beside() ? 1 - smoothstep(0, 3, pose.drive) : smoothstep(0, 0.6, pose.explode);
      engine.fit.apply(cam, rect, { l: pr.left + zone.l, r: pr.left + zone.r, t: pr.top + zone.t, b: pr.top + zone.b }, { across, panto: pose.panto, target, center: labels.listMode() ? 1 : 0 });
    },
    after: placeOverlay,
  });
  if (stageT) {
    engine.addView("terminus", { el: stageT, bleed: true, update: ({ aspect, quality, night: isNight }) => engine.live(terminusPose(T.p, aspect), quality, isNight) });
  }

  // ---- scroll → progress; the departure is a moment on it
  let prev = 0;
  const onA = () => {
    if (prev < 0.88 && A.p >= 0.88) emit(DEPART_EVENT);
    prev = A.p;
  };
  // progress starts the moment the pin takes hold (its sticky top differs in the list layout)
  const enterAt = () => {
    const stick = Math.round(Number.parseFloat(getComputedStyle(pin).top)) || 0;
    return stick >= 0 ? `top+=${stick} top` : `top-=${-stick} top`;
  };
  const observeA = track(onScroll({ target: section, enter: enterAt, leave: "bottom bottom", sync: SMOOTH }));
  const driveA = animate(A, { p: [0, 1], ease: "linear", duration: 1000, onUpdate: onA, autoplay: observeA });
  const observeT = stageT ? track(onScroll({ target: stageT, enter: "bottom top", leave: "center center", sync: SMOOTH })) : null;
  const driveT = observeT ? animate(T, { p: [0, 1], ease: "linear", duration: 1000, autoplay: observeT }) : null;

  // ---- quality: frame intervals while drawing steer the resolution, the coaches and the Night effects
  const governor = createGovernor({
    levels: QUALITY.length,
    start: startLevel(storedQuality(), QUALITY.length),
    set: (level) => {
      engine.setQuality(level);
      try {
        window.sessionStorage.setItem(QUALITY_STORAGE_KEY, String(level));
      } catch {
        // the step lasts this page only
      }
      drawnKey = "";
    },
    floor: () => ask.still("quality"),
  });
  engine.setQuality(governor.level());

  // ---- draw only while a stage is on (or about to come on) screen, and only when something changed
  const onScreen = new Set<Element>();
  let raf = 0;
  const loop = (now: number) => {
    const key = `${A.p}|${T.p}|${stageA.getBoundingClientRect().top}|${stageT?.getBoundingClientRect().top ?? 0}|${window.innerWidth}`;
    if (key !== drawnKey) {
      drawnKey = key;
      engine.frame();
      governor.drew(now);
    } else governor.idle();
    raf = onScreen.size > 0 ? requestAnimationFrame(loop) : 0;
  };
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) onScreen.add(e.target);
        else onScreen.delete(e.target);
      }
      if (onScreen.size && !raf) raf = requestAnimationFrame(loop);
      if (!onScreen.size) engine.frame();
    },
    { rootMargin: "20% 0px" },
  );
  io.observe(stageA);
  if (stageT) io.observe(stageT);

  // ---- theme: re-read the tokens and draw at once (J5-9); tt:theme is Night falls' synchronous redraw (J6)
  const onTheme = () => {
    const next = readColours();
    if (next) engine.setPalette(next);
    drawnKey = "";
    engine.frame();
  };
  const themeWatch = new MutationObserver(onTheme);
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const forced = window.matchMedia(FORCED);
  forced.addEventListener("change", onTheme);
  window.addEventListener(THEME_EVENT, onTheme);

  // ---- layout: the labels, and the zone the drawing keeps to; a chapter that cannot fit even as a list draws still
  let layoutFrame = 0;
  const relayout = () => {
    layoutFrame = 0;
    if (!alive) return;
    zone = labels.layout();
    if (!zone) {
      // asked after this start has returned, never inside it (drawing.ts is still pinning)
      queueMicrotask(() => {
        if (alive) ask.still("fit");
      });
      return;
    }
    drawnKey = "";
    engine.frame();
  };
  const soon = () => {
    if (!layoutFrame) layoutFrame = requestAnimationFrame(relayout);
  };
  const ro = new ResizeObserver(soon);
  ro.observe(pin);
  for (const l of labels.labels) ro.observe(l);
  window.addEventListener(LAYOUT_EVENT, relayout);
  window.addEventListener("resize", relayout);
  void document.fonts.ready.then(soon);
  relayout();
  engine.frame();

  if (process.env.NODE_ENV !== "production") {
    window.__ttJourney = {
      anatomy: () => A.p,
      terminus: () => T.p,
      quality: () => engine.quality(),
      night: () => engine.night(),
      box: () => (poseA && rectA ? engine.fit.screenBox(camera, rectA, poseA.panto) : null),
      inked: (selector) => {
        const el = document.querySelector(selector);
        return el ? engine.inked(el) : 0;
      },
    };
  }

  return () => {
    alive = false;
    driveA.revert();
    observeA.revert();
    driveT?.revert();
    observeT?.revert();
    io.disconnect();
    cancelAnimationFrame(raf);
    ro.disconnect();
    cancelAnimationFrame(layoutFrame);
    themeWatch.disconnect();
    forced.removeEventListener("change", onTheme);
    window.removeEventListener(THEME_EVENT, onTheme);
    window.removeEventListener(LAYOUT_EVENT, relayout);
    window.removeEventListener("resize", relayout);
    stageA.removeEventListener("pointermove", onStageMove);
    stageA.removeEventListener("pointerleave", onStageLeave);
    for (const stop of pointing) stop();
    setHot(null);
    labels.clear();
    for (const el of dims) {
      el.style.removeProperty("transform");
      el.style.removeProperty("clip-path");
    }
    engine.removeView("anatomy");
    engine.removeView("terminus");
    engine.frame(); // nothing left on screen: clears the canvas
    engine.canvas.hidden = true;
    if (process.env.NODE_ENV !== "production") delete window.__ttJourney;
  };
}
```
If the file passes 500 lines once formatted, move `engineFor` and `pause` into `scene/live-engine.ts`.

`drawing.ts`: replace `export const startDrawing = drawingModule(noLiveDrawing);` with:
```ts
/** The scene chunk may take this long to arrive before the page gives up and draws still (spec §3.C, load; J5-11). */
export const LOAD_LIMIT_MS = 20_000;

/** The scene chunk's one export this module calls. */
interface SceneChunk {
  readonly prepareLive: LoadLive;
}

/** The live drawing's only door: the scene chunk (three.js), imported on demand, then its engine prepared. A unit test
 * passes an import that never settles, to prove the limit (J5 pre-flight #14). */
export function sceneLoader(importScene: () => Promise<SceneChunk> = () => import("./scene/live")): LoadLive {
  return (ask, ctx) =>
    new Promise<Begin>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("the live drawing took over 20 s to arrive")), LOAD_LIMIT_MS);
      importScene().then(
        (scene) => {
          window.clearTimeout(timer);
          resolve(scene.prepareLive(ask, ctx));
        },
        (error: unknown) => {
          window.clearTimeout(timer);
          reject(error);
        },
      );
    });
}

export const loadScene: LoadLive = sceneLoader();

export const startDrawing = drawingModule(loadScene);
```

- [ ] **Step 6: The live layout**

`src/styles/journey.css`, after `.callout-lines, .title-block { display: none; }`, add:
```css
/* the live drawing's stage, figures and caption: only while it runs (journey-island.css) */
.anatomy-stage, .anatomy-caption, .dim-label { display: none; }
```
`src/styles/journey-island.css`: replace the whole block from `/* The drawn train's labels beside the still drawing` to the end of the file with:
```css
/* The drawn train's labels beside the drawing, with leaders to their parts: the still's columns (still.ts, J4-7), and
   the live drawing's (live-labels.ts, J5-5), which share one look. */
html[data-journey="on"] .anatomy-pin.is-columns { height: max(640px, calc(100svh - var(--header-height))); }
html[data-journey="on"] .is-columns .anatomy-still { position: absolute; margin: 0; aspect-ratio: auto; z-index: 1; }
html[data-journey="on"] .is-columns .callout-lines { display: block; position: absolute; inset: 0; width: 100%; height: 100%; z-index: 2; pointer-events: none; overflow: visible; }
html[data-journey="on"] .callout-lines line, html[data-journey="on"] .live-lines line { stroke: var(--line-strong); stroke-width: 1; }
html[data-journey="on"] .callout-lines circle, html[data-journey="on"] .live-lines circle { fill: var(--surface-0); stroke: var(--accent); stroke-width: 1.5; }
html[data-journey="on"] :is(.is-columns, [data-live="columns"]) .anatomy-legend { display: none; }
html[data-journey="on"] :is(.is-columns, [data-live="columns"]) .callouts { inset: 0; width: auto; height: auto; overflow: visible; clip-path: none; z-index: 3; pointer-events: none; }
html[data-journey="on"] :is(.is-columns, [data-live="columns"]) .callout { position: absolute; width: 16rem; display: grid; grid-template-columns: auto 1fr; column-gap: 10px; align-items: baseline; padding: 6px 0 7px; border-top: 1px solid var(--line); background: var(--surface-0); pointer-events: auto; }
html[data-journey="on"] [data-live="columns"] .callout { top: 0; }
html[data-journey="on"] :is(.is-columns, [data-live="columns"]) .callout[data-side="left"] { left: 0; }
html[data-journey="on"] :is(.is-columns, [data-live="columns"]) .callout[data-side="right"] { right: 0; }
html[data-journey="on"] :is(.is-columns, [data-live="columns"]) .callout-num { font-family: var(--font-display); font-weight: 600; font-size: var(--text-label); letter-spacing: 0.08em; color: var(--accent-text); }
html[data-journey="on"] :is(.is-columns, [data-live="columns"]) .callout-title { font-family: var(--font-display); font-weight: 600; font-size: var(--text-sm); line-height: 1.25rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-1); }
html[data-journey="on"] :is(.is-columns, [data-live="columns"]) .callout-detail { grid-column: 2; font-size: var(--text-label); line-height: 1.125rem; color: var(--ink-2); }
html[data-journey="on"] :is(.is-columns, [data-live="columns"]) .callout-detail b { font-weight: 600; color: var(--ink-1); }
html[data-journey="on"] :is(.is-columns, [data-live="columns"]) .callout.is-hot { border-top-color: var(--accent); }
html[data-journey="on"] :is(.is-columns, [data-live="columns"]) .callout.is-hot .callout-title { color: var(--accent-text); }
html[data-journey="on"] :is(.is-columns.is-compact, [data-live="columns"][data-compact]) .callout-detail { display: none; }
html[data-journey="on"] :is(.is-columns, [data-live="columns"]) .title-block { display: grid; position: absolute; right: 0; bottom: 16px; z-index: 3; grid-template-columns: minmax(0, 1fr) auto; width: 22rem; background: var(--surface-0); }
html[data-journey="on"] :is(.is-columns, [data-live="columns"]) .tb-cell { padding: 4px 10px; font-family: var(--font-display); font-weight: 600; font-size: 0.6875rem; /* drawing units: no token matches v3's title-block instrument at its fixed 22rem width */ line-height: 1rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); }
html[data-journey="on"] :is(.is-columns, [data-live="columns"]) .tb-cell:nth-of-type(n + 3) { border-top: 1px solid var(--line); }
html[data-journey="on"] :is(.is-columns, [data-live="columns"]) .tb-cell:nth-of-type(even) { border-left: 1px solid var(--line); text-align: right; }
html[data-journey="on"] :is(.is-columns, [data-live="columns"]) .tb-cell b { color: var(--ink-1); font-weight: 600; }

/* ---- GA · the drawn train, live (spec §3.A–C; J5). drawing.ts pins the chapter (#anatomy.is-live) only while the live
   drawing runs, and the scroll plays it. The engine's canvas is fixed over the page, under the pinned chapter,
   drawing into the chapter's stage and the terminus's. */
html[data-journey="on"] #journey-canvas:not([hidden]) { display: block; position: fixed; inset: 0 0 auto 0; width: 100%; height: 100lvh; z-index: 1; pointer-events: none; }
html[data-journey="on"] #anatomy.is-live { height: 520vh; padding-top: 0; padding-bottom: 0; }
html[data-journey="on"] #anatomy.is-live .anatomy-pin { position: sticky; z-index: 2; top: var(--header-height); height: calc(100svh - var(--header-height)); min-height: 520px; }
html[data-journey="on"] #anatomy.is-live .anatomy-stage { display: block; position: absolute; inset: 0; }
html[data-journey="on"] #anatomy.is-live .anatomy-still { display: none; }
html[data-journey="on"] #anatomy.is-live .anatomy-copy { padding-top: clamp(16px, 3.5vh, 40px); }
html[data-journey="on"] #anatomy.is-live .anatomy-copy p { max-width: 44ch; }
html[data-journey="on"] .live-lines { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 2; pointer-events: none; overflow: visible; }
html[data-journey="on"] [data-live="list"] .live-lines { display: none; }
html[data-journey="on"] [data-live="columns"] :is(.anatomy-caption, .dim-label) { display: block; }
html[data-journey="on"] .anatomy-caption { position: absolute; left: 0; bottom: 18px; z-index: 3; margin: 0; }
html[data-journey="on"] .dim-label { position: absolute; left: 0; top: 0; z-index: 3; padding: 1px 6px; background: var(--surface-0); font-family: var(--font-display); font-weight: 600; font-size: var(--text-xs); letter-spacing: 0.08em; color: var(--accent-text); white-space: nowrap; pointer-events: none; }
/* The list while live (below 64rem, or whenever the columns cannot fit): the words scroll away under the masthead
   first, then the drawing and its parts list hold the window. */
html[data-journey="on"] #anatomy.is-live .anatomy-pin[data-live="list"] { top: calc(var(--header-height) - var(--anatomy-copy-h, 0px)); height: calc(100svh - var(--header-height) + var(--anatomy-copy-h, 0px)); min-height: 0; }
html[data-journey="on"] #anatomy.is-live [data-live="list"] .anatomy-legend { position: absolute; left: 0; right: 0; bottom: 12px; z-index: 3; background: var(--surface-0); }
@media (max-width: 63.99rem) {
  html[data-journey="on"] #anatomy.is-live { height: 430vh; }
}
/* A phone on its side: the list stands beside the drawing, which keeps the window's height; it keeps its ground, and
   the departing train passes behind it (J5-7). */
@media (max-height: 520px) and (orientation: landscape) {
  html[data-journey="on"] #anatomy.is-live [data-live="list"] .anatomy-legend { top: calc(var(--anatomy-copy-h, 0px) + 10px); bottom: 10px; left: auto; width: 36%; grid-template-columns: 1fr; align-content: center; border-top: 0; border-left: 1px solid var(--line); padding: 0 0 0 12px; }
}
```
Before replacing, diff the J4 rules you remove against these, and keep any J4 declaration this block drops. The J4 rules are moved into the `:is()` form unchanged.

- [ ] **Step 7: Run everything to see it pass**

Run: `npx vitest run tests/unit/components/landing/journey`
Expected: PASS.

Then, after `lsof -nP -iTCP:4210 -sTCP:LISTEN`:
```bash
npx playwright test tests/e2e/journey --project=desktop --project=mobile
```
Expected: PASS, including every existing journey spec. If `teardown.spec.ts` shows a difference, a live teardown left something behind: fix the teardown, never the snapshot. If a collision appears in the live sweep, report the progress and pair it names before changing any layout number.

- [ ] **Step 8: The whole gate, then commit**

```bash
npm run check
git add src/components/landing/journey src/messages/en-IN/home.ts src/styles/journey.css src/styles/journey-island.css playwright.config.ts tests/unit/components/landing/journey tests/e2e/journey
git commit -m "feat(journey): the train, drawn live: the scene on demand, the pinned chapter, its labels and the terminus"
```

---
### Task 8: The departure horn

The second of the two synthesised sounds (spec §2, §3.A Footer; J3-8): a short two-tone horn as the drawn train pulls away. It sounds once per visit, only while Sound is on and the reader's own gesture has woken the audio (J5-18).

**Files:**
- Modify: `src/components/landing/journey/sound.ts`
- Test: `tests/unit/components/landing/journey/sound.test.tsx`

**Interfaces:**
- Consumes: `DEPART_EVENT` (Task 7); `soundOn`, `chooseSound` (J3).
- Produces: `HORN_KEY = "tt.horn"` (sessionStorage).

- [ ] **Step 1: Write the failing tests**

In `tests/unit/components/landing/journey/sound.test.tsx`, import `DEPART_EVENT` from `@/components/landing/journey/journey-events` and `HORN_KEY` from `@/components/landing/journey/sound`, and add:
```ts
describe("the departure horn (J5-18)", () => {
  const real = window.AudioContext;
  const tones: number[] = [];
  class HornContext extends FakeContext {
    readonly createOscillator = () => {
      const o = { ...node(), frequency: { value: 0 }, type: "", start: () => tones.push(o.frequency.value) };
      return o;
    };
  }
  beforeEach(() => {
    window.AudioContext = HornContext as unknown as typeof AudioContext;
    window.sessionStorage.clear();
    tones.length = 0;
  });
  afterEach(() => {
    window.AudioContext = real;
    made.length = 0;
    chooseSound(false);
  });

  it("sounds its two tones once per visit as the train departs, while Sound is on", () => {
    const stop = startSound();
    chooseSound(true); // the switch is the reader's own gesture: the audio wakes
    window.dispatchEvent(new Event(DEPART_EVENT));
    expect(tones).toEqual([311, 392]);
    expect(window.sessionStorage.getItem(HORN_KEY)).toBe("1");
    window.dispatchEvent(new Event(DEPART_EVENT));
    expect(tones).toEqual([311, 392]);
    stop();
  });

  it("stays silent with Sound off, and before any gesture has woken the audio, and remembers nothing then", () => {
    const stop = startSound();
    window.dispatchEvent(new Event(DEPART_EVENT));
    expect(tones).toEqual([]);
    window.localStorage.setItem("tt.sound", "on"); // a remembered "on", but no gesture yet this visit
    window.dispatchEvent(new Event(DEPART_EVENT));
    expect(tones).toEqual([]);
    expect(window.sessionStorage.getItem(HORN_KEY)).toBeNull();
    window.localStorage.removeItem("tt.sound");
    stop();
  });
});
```
If `FakeContext`'s members are declared `readonly` as fields, the subclass adds `createOscillator` the same way.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/components/landing/journey/sound.test.tsx`
Expected: FAIL. `HORN_KEY` is not exported, and nothing listens for `tt:depart`.

- [ ] **Step 3: Implement**

In `sound.ts`:
- Import `DEPART_EVENT` from `./journey-events`.
- Extend the header comment: "…and the departure horn (J5): two sawtooth tones, once per visit, as the drawn train pulls away."
- Add:
```ts
/** The horn has sounded this visit (sessionStorage). */
export const HORN_KEY = "tt.horn";

function hornedThisVisit(): boolean {
  try {
    return window.sessionStorage.getItem(HORN_KEY) === "1";
  } catch {
    return false;
  }
}
```
- Inside `startSound`, beside `clack`:
```ts
  // v3's horn: two sawtooth tones a minor third apart, low-passed, a 60 ms swell, held to 620 ms, gone by 950.
  const horn = (a: Audio) => {
    const now = a.ctx.currentTime;
    const lowpass = a.ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 1700;
    const gain = a.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.06);
    gain.gain.setValueAtTime(0.1, now + 0.62);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);
    lowpass.connect(gain).connect(a.master);
    for (const f of [311, 392]) {
      const o = a.ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.connect(lowpass);
      o.start(now);
      o.stop(now + 1);
    }
  };
  const onDepart = () => {
    // Only a context the reader's own gesture made and woke; never one made here (spec §3.G).
    if (!audio || audio.ctx.state !== "running" || !soundOn() || hornedThisVisit()) return;
    horn(audio);
    try {
      window.sessionStorage.setItem(HORN_KEY, "1");
    } catch {
      // no session storage: it may sound again on the next departure this visit
    }
  };
```
- Add `window.addEventListener(DEPART_EVENT, onDepart);`, and remove it in the teardown.

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/unit/components/landing/journey/sound.test.tsx`
Expected: PASS.

- [ ] **Step 5: The whole gate, then commit**

```bash
npm run check
git add src/components/landing/journey/sound.ts tests/unit/components/landing/journey/sound.test.tsx
git commit -m "feat(journey): the departure horn, once a visit, only by the reader's own hand"
```

---

### Task 9: The frame meter, on previews only

The owner's check on a real mid-range Android phone before J5 merges needs numbers (spec §7, §3.J; J5-10). The meter shows frame rate, p95, slow frames, long tasks, which drawing the page shows and why, the quality step, and the device, with Copy and Close. The server allows it on preview deployments and in development; the page shows it only with `?journey-hud`; production never renders it or downloads it.

**Files:**
- Create: `src/components/landing/journey/hud-gate.ts`, `src/components/landing/journey/hud.ts`, `tests/e2e/journey/hud.spec.ts`
- Modify: `src/components/landing/journey/start-journey.ts`, `journey-loader.tsx`, `src/app/(site)/page.tsx`, `src/styles/journey-island.css`
- Test: `tests/unit/components/landing/journey/{hud.test.tsx,journey-loader.test.tsx}`

**Interfaces:**
- Consumes: `lifetime()` (Task 6); `QUALITY_STORAGE_KEY`.
- Produces:
  - `hud-gate.ts`: `hudAllowed(vercelEnv: string | undefined, nodeEnv: string | undefined): boolean`.
  - `hud.ts`: `interface LongTask { at; ms }`; `interface FrameStats { fps; p95; slow; longs; longMax }`; `frameStats(frames: readonly number[], longs: readonly LongTask[], now: number): FrameStats`; `startHud(): Teardown`.
  - `start-journey.ts`: `interface JourneyOptions { readonly hud?: boolean }`; `startJourney(options?: JourneyOptions): Teardown`.
  - `journey-loader.tsx`: `JourneyLoader({ load?, hud? })`; `LoadJourney` resolves to `{ startJourney: (options?: JourneyOptions) => () => void }`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/components/landing/journey/hud.test.tsx`:
```ts
import { afterEach, describe, expect, it } from "vitest";
import { frameStats, startHud } from "@/components/landing/journey/hud";
import { hudAllowed } from "@/components/landing/journey/hud-gate";

describe("the frame meter (J5-10)", () => {
  afterEach(() => document.body.replaceChildren());

  it("is allowed on preview deployments and in development, never in production", () => {
    expect(hudAllowed("preview", "production")).toBe(true);
    expect(hudAllowed(undefined, "development")).toBe(true);
    expect(hudAllowed("production", "production")).toBe(false);
    expect(hudAllowed(undefined, "production")).toBe(false);
  });

  it("reads frame rate, p95, slow frames and the last ten seconds' long tasks", () => {
    const frames = [...Array.from({ length: 90 }, () => 16), ...Array.from({ length: 10 }, () => 40)];
    expect(frameStats(frames, [{ at: 1_000, ms: 90 }, { at: 12_000, ms: 130 }], 15_000)).toEqual({ fps: 63, p95: 40, slow: 10, longs: 1, longMax: 130 });
    expect(frameStats([], [], 0)).toEqual({ fps: 0, p95: 0, slow: 0, longs: 0, longMax: 0 });
  });

  it("says which drawing is shown and why, in the review's own words, and closes", () => {
    document.documentElement.dataset.drawing = "still";
    document.documentElement.dataset.drawingWhy = "saver";
    const stop = startHud();
    const hud = document.querySelector(".journey-hud");
    expect(hud).not.toBeNull();
    const text = hud?.querySelector("pre")?.textContent ?? "";
    expect(text).toContain("drawing still (data saver)");
    expect(text).not.toContain("quality"); // the quality step is a live drawing's
    expect(text).toMatch(/^fps \d+ {3}p95 [\d.]+ ms {3}slow [\d.]+%$/m);
    hud?.querySelector<HTMLButtonElement>('button[aria-label="Close the frame meter"]')?.click();
    expect(document.querySelector(".journey-hud")).toBeNull();
    stop();
    delete document.documentElement.dataset.drawing;
    delete document.documentElement.dataset.drawingWhy;
  });
});
```
Its corner is CSS (`journey-island.css`), which jsdom does not load, so the e2e below checks it. In `journey-loader.test.tsx`, add:
```ts
  it("tells the journey whether the frame meter is allowed", async () => {
    const startJourney = vi.fn(() => () => {});
    render(<JourneyLoader load={async () => ({ startJourney })} hud />);
    await vi.advanceTimersByTimeAsync(1);
    expect(startJourney).toHaveBeenCalledWith({ hud: true });
  });
```
`tests/e2e/journey/hud.spec.ts`:
```ts
import { expect, test } from "../fixtures";
import { waitForJourney } from "./journey-helpers";

test("the frame meter shows only when asked for, says which drawing is shown, and closes", async ({ page }) => {
  await page.goto("/");
  await waitForJourney(page);
  await expect(page.locator(".journey-hud")).toHaveCount(0);
  await page.goto("/?journey-hud");
  await waitForJourney(page);
  const hud = page.locator(".journey-hud");
  await expect(hud).toBeVisible();
  await expect(hud).toContainText(/drawing (live|still)/);
  await expect(hud).toContainText(/fps \d+ {3}p95/);
  // the page's bottom-right corner, 12px in (journey-island.css)
  const box = await hud.boundingBox();
  const size = page.viewportSize();
  expect(box && size ? [Math.round(size.width - box.x - box.width), Math.round(size.height - box.y - box.height)] : null).toEqual([12, 12]);
  await hud.getByRole("button", { name: "Close the frame meter" }).click();
  await expect(hud).toHaveCount(0);
});
```
- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/unit/components/landing/journey/hud.test.tsx tests/unit/components/landing/journey/journey-loader.test.tsx`
Expected: FAIL. The modules do not exist, and the loader passes nothing.

- [ ] **Step 3: Implement**

`src/components/landing/journey/hud-gate.ts`:
```ts
/** The frame meter (spec §3.J; J5-10) is a review tool: allowed on preview deployments and in development, never in
 * production. The server decides; the page still shows it only with ?journey-hud. */
export function hudAllowed(vercelEnv: string | undefined, nodeEnv: string | undefined): boolean {
  return vercelEnv === "preview" || nodeEnv === "development";
}
```
`src/components/landing/journey/hud.ts`:
```ts
import { QUALITY_STORAGE_KEY } from "@/components/motion/motion-boot";
import type { Teardown } from "./start-journey";

// The frame meter (spec §3.J, §7; prototype v3's hud.js; J5-10): for trying the landing on a real phone. It shows
// frame rate, slow frames, long tasks, which drawing the page shows and why, its quality step and the device, with
// Copy to send the numbers back. A review tool on previews only, so its words live here, not in the messages.

const WHY: Readonly<Record<string, string>> = { motion: "motion off", saver: "data saver", webgl: "no WebGL", quality: "device too slow", load: "3D did not load", fit: "text too large", place: "below the drawing" };

export interface LongTask {
  readonly at: number;
  readonly ms: number;
}
export interface FrameStats {
  readonly fps: number;
  readonly p95: number;
  readonly slow: number;
  readonly longs: number;
  readonly longMax: number;
}

export function frameStats(frames: readonly number[], longs: readonly LongTask[], now: number): FrameStats {
  const sorted = [...frames].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  const recent = longs.filter((l) => now - l.at < 10_000);
  return {
    fps: at(0.5) ? Math.round(1000 / at(0.5)) : 0,
    p95: Math.round(at(0.95) * 10) / 10,
    slow: sorted.length ? Math.round((sorted.filter((x) => x > 33.4).length / sorted.length) * 1000) / 10 : 0,
    longs: recent.length,
    longMax: Math.round(Math.max(0, ...recent.map((l) => l.ms))),
  };
}

/** "ANGLE (Vendor, ANGLE Metal Renderer: Chip, Version)" → "Vendor, Chip"; "Adreno (TM) 610" stays whole. */
function gpu(): string {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    const name: unknown = info && gl ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl ? "WebGL 2" : "none";
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return String(name).replace(/^ANGLE \((.*)\)$/, "$1").replace(/ANGLE [\w ]+Renderer: /, "").replace(/,? (Unspecified Version|OpenGL.*|Direct3D.*|vs_.*)$/, "").slice(0, 48);
  } catch {
    return "unknown";
  }
}

function quality(): string {
  try {
    return window.sessionStorage.getItem(QUALITY_STORAGE_KEY) ?? "0";
  } catch {
    return "?";
  }
}

export function startHud(): Teardown {
  const el = document.createElement("div");
  el.className = "journey-hud";
  const head = document.createElement("div");
  const title = document.createElement("span");
  title.textContent = "Frame meter";
  const copy = document.createElement("button");
  copy.type = "button";
  copy.textContent = "Copy";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  close.setAttribute("aria-label", "Close the frame meter");
  const pre = document.createElement("pre");
  head.append(title, copy, close);
  el.append(head, pre);
  document.body.append(el);

  const nav = navigator as Navigator & { readonly deviceMemory?: number };
  const device = `${nav.hardwareConcurrency ?? "?"} cores${nav.deviceMemory ? `, ${nav.deviceMemory} GB` : ""}, ${gpu()}`;
  let frames: number[] = [];
  let longs: LongTask[] = [];
  let last = 0;
  let raf = 0;
  let hold = 0;
  const text = () => {
    const s = frameStats(frames, longs, performance.now());
    const { drawing = "live", drawingWhy = "" } = document.documentElement.dataset;
    const why = drawingWhy.split(" ").filter(Boolean).map((w) => WHY[w] ?? w).join(", ");
    return [
      `fps ${s.fps}   p95 ${s.p95} ms   slow ${s.slow}%`,
      `long tasks (10 s) ${s.longs}${s.longMax ? `, max ${s.longMax} ms` : ""}`,
      `drawing ${drawing}${why ? ` (${why})` : ""}${drawing === "live" ? `   quality ${quality()}` : ""}`,
      `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x   ${device}`,
    ].join("\n");
  };
  let observer: PerformanceObserver | null = null;
  try {
    observer = new PerformanceObserver((list) => {
      longs = [...longs, ...list.getEntries().map((e) => ({ at: e.startTime, ms: e.duration }))];
    });
    observer.observe({ type: "longtask", buffered: false });
  } catch {
    observer = null; // no long-task timing in this browser
  }
  const tick = (t: number) => {
    if (last) frames = [...frames.slice(-179), t - last];
    last = t;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  const timer = window.setInterval(() => {
    if (performance.now() < hold) return;
    pre.textContent = text();
    longs = longs.filter((l) => performance.now() - l.at < 10_000);
  }, 500);
  pre.textContent = text();

  const stop = () => {
    cancelAnimationFrame(raf);
    window.clearInterval(timer);
    observer?.disconnect();
    el.remove();
  };
  copy.addEventListener("click", () => {
    const report = `Trakline journey · ${new Date().toISOString()}\n${text()}`;
    // An insecure page has no clipboard: navigator.clipboard is undefined there, whatever lib.dom's type says.
    const clipboard: Clipboard | undefined = navigator.clipboard;
    const written = clipboard ? clipboard.writeText(report) : Promise.reject(new Error("no clipboard"));
    written.then(
      () => {
        copy.textContent = "Copied";
      },
      () => {
        // no clipboard here: select the numbers and hold them still for eight seconds
        hold = performance.now() + 8000;
        const range = document.createRange();
        range.selectNodeContents(pre);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
        copy.textContent = "Selected";
      },
    );
    window.setTimeout(() => (copy.textContent = "Copy"), 1600);
  });
  close.addEventListener("click", stop);
  return stop;
}
```

In `start-journey.ts`:
```ts
export interface JourneyOptions {
  /** The frame meter is allowed here (preview deployments and development, J5-10). */
  readonly hud?: boolean;
}
```
`startJourney(options: JourneyOptions = {})`. After the first build succeeds, add:
```ts
  // The frame meter (J5-10): its own chunk, fetched only when allowed and asked for; it ends with the journey.
  if (options.hud && new URLSearchParams(window.location.search).has("journey-hud")) {
    void import("./hud").then(({ startHud }) => life.atEnd(startHud()), () => undefined);
  }
```
`atEnd` after the end runs at once, so a meter that arrives late is closed straight away.

`journey-loader.tsx`:
- Type `LoadJourney` as `() => Promise<{ readonly startJourney: (options?: JourneyOptions) => () => void }>`, importing `type JourneyOptions` from `./start-journey`.
- `JourneyLoader({ load = loadJourney, hud = false }: { readonly load?: LoadJourney; readonly hud?: boolean })` calls `startJourney({ hud })`, and its effect depends on `[load, hud]`.

`src/app/(site)/page.tsx`:
- Import `hudAllowed` from `@/components/landing/journey/hud-gate`.
- Read `const current = env();` once, and use it for `activePnrSource(current)`.
- Render `<JourneyLoader hud={hudAllowed(current.VERCEL_ENV, process.env.NODE_ENV)} />`.

`src/styles/journey-island.css`, at the end:
```css
/* ---- The frame meter: previews and development only, with ?journey-hud (J5-10) */
html[data-journey="on"] .journey-hud { position: fixed; right: 12px; bottom: 12px; z-index: var(--z-toast); min-width: 17rem; padding: 6px 10px 8px; background: var(--surface-1); border: 1px solid var(--line-strong); color: var(--ink-1); font-size: var(--text-xs); }
html[data-journey="on"] .journey-hud > div { display: flex; gap: 8px; align-items: center; }
html[data-journey="on"] .journey-hud > div > span { flex: 1; font-family: var(--font-display); font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; }
html[data-journey="on"] .journey-hud button { min-height: 32px; padding: 0 8px; border: 1px solid var(--line); background: var(--surface-0); }
html[data-journey="on"] .journey-hud pre { margin: 6px 0 0; font-family: ui-monospace, monospace; white-space: pre; }
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run tests/unit/components/landing/journey/hud.test.tsx tests/unit/components/landing/journey/journey-loader.test.tsx tests/unit/components/landing/journey/start-journey.test.tsx`, then `npx playwright test tests/e2e/journey/hud.spec.ts --project=desktop`.
Expected: PASS.

- [ ] **Step 5: The whole gate, then commit**

```bash
npm run check
git add src/components/landing/journey src/app/\(site\)/page.tsx src/styles/journey-island.css tests/unit/components/landing/journey tests/e2e/journey/hud.spec.ts
git commit -m "feat(journey): the frame meter, on preview deployments and in development, with ?journey-hud"
```

---

### Task 10: Every mode under test, the budgets, and the written rules

Every failure in spec §4 gets its e2e proof, and axe checks the live drawing. The budgets get a script, and DESIGN.md and the spec record what J5 decided.

**Files:**
- Modify: `tests/e2e/journey/drawing-modes.spec.ts`, `tests/e2e/journey/journey-axe.spec.ts`
- Create: `scripts/journey-budgets.mjs`, `tests/unit/scripts/journey-budgets.test.ts`
- Modify: `DESIGN.md`, `docs/superpowers/specs/2026-09-24-landing-journey-design.md`

**Interfaces:**
- Consumes: every e2e helper (Tasks 5 and 7); `JOURNEY_CHUNK_MARK`; `SCENE_CHUNK_MARK`.
- Produces: `scripts/journey-budgets.mjs` exporting `MARKS`, `BUDGETS` and `measure(chunks: readonly { name: string; text: string }[]): { journeyBytes: number; sceneBytes: number; failures: string[] }`. Run as a script, it measures `.next/static/chunks` and exits non-zero on any failure.

- [ ] **Step 1: Write the failing tests**

`tests/unit/scripts/journey-budgets.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { JOURNEY_CHUNK_MARK } from "@/components/landing/journey/journey-mark";
import { SCENE_CHUNK_MARK } from "@/components/landing/journey/scene/scene-mark";
import { BUDGETS, MARKS, measure } from "../../../scripts/journey-budgets.mjs";

const noise = (n: number) => Array.from({ length: n }, (_, i) => ((i * 2654435761) % 4294967296).toString(36)).join("");

describe("the journey's chunk budgets (spec §3.H; J5-15)", () => {
  it("finds the chunks by the same marks the app carries", () => {
    expect(MARKS.journey).toBe(JOURNEY_CHUNK_MARK);
    expect(MARKS.scene).toBe(SCENE_CHUNK_MARK);
    expect(BUDGETS).toEqual({ journey: 70 * 1024, scene: 240 * 1024 });
  });

  it("passes a journey chunk and a scene within budget, three.js only in the scene", () => {
    const r = measure([
      { name: "a.js", text: `${MARKS.journey} ${noise(2000)}` },
      { name: "b.js", text: `${MARKS.scene} ${noise(4000)}` },
      { name: "c.js", text: `${MARKS.three} ${noise(4000)}` },
      { name: "d.js", text: "the app" },
    ]);
    expect(r.failures).toEqual([]);
    expect(r.sceneBytes).toBeGreaterThan(r.journeyBytes);
  });

  it("fails three.js in the journey chunk, a missing chunk, or a chunk over budget", () => {
    expect(measure([{ name: "a.js", text: `${MARKS.journey} ${MARKS.three}` }]).failures.join(" ")).toMatch(/three\.js is in the journey chunk.*no chunk carries the scene/);
    expect(measure([{ name: "b.js", text: MARKS.scene }]).failures.join(" ")).toMatch(/no chunk carries the journey/);
    expect(measure([{ name: "a.js", text: `${MARKS.journey} ${noise(200_000)}` }, { name: "b.js", text: MARKS.scene }]).failures.join(" ")).toMatch(/journey chunk .* over its 70 KB/);
  });
});
```
In `tests/e2e/journey/drawing-modes.spec.ts`, add `blockSceneChunk` and `drawStill` to its `./journey-helpers` import (Task 7 already brought in `waitForLive`, `scrollIntoChapter` and `scrollToId`), so it reads:
```ts
import { blockJourneyChunk, blockSceneChunk, drawStill, motionOff, scrollIntoChapter, scrollToId, stubSaveData, waitForJourney, waitForLive } from "./journey-helpers";
```
Then add:
```ts
/** Every script response carrying three.js; its renderer's own message text survives minification. */
function watchThree(page: import("@playwright/test").Page): () => readonly string[] {
  const seen: string[] = [];
  page.on("response", async (r) => {
    if (!r.url().endsWith(".js")) return;
    try {
      if ((await r.text()).includes("THREE.WebGLRenderer")) seen.push(r.url());
    } catch {
      // a body the browser already let go of
    }
  });
  return () => seen;
}

test.describe("J5: every reason not to draw live (spec §3.C, §4)", () => {
  test("reduced motion: still, and three.js never downloaded", async ({ page }) => {
    const three = watchThree(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "motion");
    // A window is the assertion: nothing is asked for, so there is no state to wait on; 1.5 s is longer than a
    // prepare would take to start the scene's import.
    await page.waitForTimeout(1_500);
    expect(three()).toEqual([]);
  });

  test("no WebGL: still from the start, and three.js never downloaded", async ({ page }) => {
    const three = watchThree(page);
    await page.addInitScript(() => {
      const real = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, id: string, ...rest: unknown[]) {
        return id === "webgl2" ? null : Reflect.apply(real, this, [id, ...rest]);
      } as typeof real;
    });
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "webgl");
    await expect(drawn(page).first()).toBeAttached();
    // A window is the assertion: a download that never starts has no state to wait on.
    await page.waitForTimeout(1_500);
    expect(three()).toEqual([]);
  });

  test("the GPU drops the context: still at once, and live again when it is restored", async ({ page }) => {
    await page.goto("/");
    await waitForLive(page);
    await page.evaluate(() => {
      const lose = document.querySelector<HTMLCanvasElement>("#journey-canvas")?.getContext("webgl2")?.getExtension("WEBGL_lose_context");
      if (!lose) throw new Error("no WEBGL_lose_context");
      Reflect.set(window, "__lose", lose);
      lose.loseContext();
    });
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "webgl");
    await expect(page.locator("#anatomy")).not.toHaveClass(/is-live/);
    await expect(drawn(page).first()).toBeAttached();
    await page.evaluate(() => {
      // WEBGL_lose_context is an interface in lib.dom, not a constructor, so the extension is narrowed by its method.
      const lose: unknown = Reflect.get(window, "__lose");
      const restore: unknown = typeof lose === "object" && lose !== null ? Reflect.get(lose, "restoreContext") : undefined;
      if (typeof restore !== "function") throw new Error("no restoreContext");
      Reflect.apply(restore, lose, []);
    });
    await waitForLive(page);
  });

  test("the scene chunk blocked: still (load), and everything else keeps moving", async ({ page, isMobile }) => {
    await blockSceneChunk(page);
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "load", { timeout: 25_000 });
    await expect(drawn(page).first()).toBeAttached();
    await expect(page.locator("html")).toHaveAttribute("data-journey", "on");
    if (!isMobile) await expect(page.locator("#how")).toHaveClass(/is-pinned/);
  });

  test("the session's quality floor: still, and three.js never downloaded", async ({ page }) => {
    const three = watchThree(page);
    await drawStill(page);
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "quality");
    // A window is the assertion: a download that never starts has no state to wait on.
    await page.waitForTimeout(1_500);
    expect(three()).toEqual([]);
  });

  test("a reader landing below the chapter: still (place) until they come back above it", async ({ page }) => {
    await page.goto("/#faq");
    await waitForJourney(page);
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "place");
    await expect(page.locator("#anatomy")).not.toHaveClass(/is-live/);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await waitForLive(page);
  });
});
```

In `tests/e2e/journey/journey-axe.spec.ts`, its imports become:
```ts
import { expect, test } from "../fixtures";
import { expectAxeClean } from "../helpers";
import { motionOff, scrollIntoChapter, scrollToId, stubSaveData, waitForJourney, waitForLive } from "./journey-helpers";
```
and add, inside `test.describe("axe, while the journey runs", …)`:
```ts
  test("clean at the drawing, live, with its labels out", async ({ page }) => {
    await page.goto("/");
    await waitForLive(page);
    await scrollIntoChapter(page, 0.4);
    // out: every label has wiped in whole
    await expect.poll(() => page.locator("#anatomy .callout").evaluateAll((els) => els.every((el) => getComputedStyle(el).clipPath === "none"))).toBe(true);
    await expectAxeClean(page);
  });

  test("clean at Night, at the drawing, live, with its labels out", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("tt.theme", "dark"));
    await page.goto("/");
    await waitForLive(page);
    await scrollIntoChapter(page, 0.4);
    await expect.poll(() => page.locator("#anatomy .callout").evaluateAll((els) => els.every((el) => getComputedStyle(el).clipPath === "none"))).toBe(true);
    await expectAxeClean(page);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/unit/scripts/journey-budgets.test.ts`
Expected: FAIL. The script does not exist.

The new e2e are proofs of Tasks 6–7, not new behaviour, so they may pass at once. Run them now, after `lsof -nP -iTCP:4210 -sTCP:LISTEN`:
```bash
npx playwright test tests/e2e/journey/drawing-modes.spec.ts tests/e2e/journey/journey-axe.spec.ts
```
Any failure here is a Task 6 or 7 defect: report it with its name and message, and fix it before Step 3.

- [ ] **Step 3: The budgets script**

`scripts/journey-budgets.mjs`:
```js
// The journey's chunk budgets (spec §3.H; J5-15), after `npm run build`: the chunk carrying the journey's mark at most
// 70 KB gzip and free of three.js; the chunks carrying the scene (its mark, or three.js's own message text, which
// survives minification) at most 240 KB together. A split the marks cannot see is under-counted; the e2e "a still
// page downloads no three.js" is the guard that three.js stays behind the scene's door.
//   node scripts/journey-budgets.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

export const MARKS = { journey: "tt-journey-chunk", scene: "tt-scene-chunk", three: "THREE.WebGLRenderer" };
export const BUDGETS = { journey: 70 * 1024, scene: 240 * 1024 };

/** @param {number} bytes */
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

/** @param {string} text */
const gz = (text) => gzipSync(text).length;

/** @param {readonly { name: string, text: string }[]} chunks */
export function measure(chunks) {
  const journey = chunks.filter((c) => c.text.includes(MARKS.journey));
  const scene = chunks.filter((c) => !c.text.includes(MARKS.journey) && (c.text.includes(MARKS.scene) || c.text.includes(MARKS.three)));
  const journeyBytes = journey.reduce((n, c) => n + gz(c.text), 0);
  const sceneBytes = scene.reduce((n, c) => n + gz(c.text), 0);
  /** @type {string[]} */
  const failures = [];
  const leaks = journey.filter((c) => c.text.includes(MARKS.three)).map((c) => c.name);
  if (leaks.length) failures.push(`three.js is in the journey chunk (${leaks.join(", ")})`);
  if (!journey.length) failures.push("no chunk carries the journey's mark");
  if (!scene.length) failures.push("no chunk carries the scene");
  if (journeyBytes > BUDGETS.journey) failures.push(`the journey chunk is ${kb(journeyBytes)}, over its 70 KB`);
  if (sceneBytes > BUDGETS.scene) failures.push(`the scene is ${kb(sceneBytes)}, over its 240 KB`);
  return { journeyBytes, sceneBytes, failures };
}

/** @param {string} dir @returns {{ name: string, text: string }[]} */
function chunksIn(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return chunksIn(path);
    return entry.name.endsWith(".js") ? [{ name: path, text: readFileSync(path, "utf8") }] : [];
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
  const { journeyBytes, sceneBytes, failures } = measure(chunksIn(join(root, ".next/static/chunks")));
  console.log(`journey chunk ${kb(journeyBytes)} gzip (budget 70 KB); scene ${kb(sceneBytes)} gzip (budget 240 KB)`);
  for (const f of failures) console.error(`✗ ${f}`);
  process.exit(failures.length ? 1 : 0);
}
```
Run: `npx vitest run tests/unit/scripts/journey-budgets.test.ts`. Expected: PASS. If the noise is too compressible to pass 70 KB gzip in the over-budget case, lengthen it; the regex must match.

- [ ] **Step 4: DESIGN.md**

Replace the paragraph that begins **The drawn train.** with:
```md
**The drawn train.** The landing's drawing chapter (GA) and terminus draw a WAP-7-style locomotive and LHB rake as
a hairline technical drawing: edges only, hidden lines removed, ink on the sheet in Day and Night, and the lit part
in steel. Drawn live (three.js, fetched only when the page may draw it), the chapter pins while a scan gate turns the
steel locomotive into its drawing; it comes apart into its ten labelled parts, shows its dimensions, takes its coaches
and departs past the line side, and the terminus draws the arrived train. Its colours are the theme's own tokens,
read again whenever the theme changes. Whenever it may not draw live (Motion off, Data Saver, no WebGL, a device too
slow, a failed load, words too large to fit, or a reader below the chapter), the page shows the still drawing, baked
from the same rig (`npm run bake:stills`, after any change to the scene) as one SVG file per shape in
`public/journey/`, coloured by `currentColor`. The drawing is decoration (`aria-hidden`); its ten labels are a real
list, beside the drawing with leaders on wide screens while the journey runs, and a parts list under it everywhere
else. They rise and wipe in; they never fade.
```

- [ ] **Step 5: The spec** (`docs/superpowers/specs/2026-09-24-landing-journey-design.md`)

The rail was removed by #80 (e7ae65e) before J5 began, and §3.A's Masthead row already records its removal; J5 leaves that row alone and edits only the following. Each edit replaces the quoted text exactly.
- **§2, the J5 scope (its lines 53–54).** Replace "the frame meter (a review tool: preview deployments only, §3.J)" with "the frame meter (a review tool: preview deployments and development only, §3.J; J5-10)".
- **§3.A, the drawn-train row.** Replace "; ~~the strip glyph takes over~~ (moot: the strip was removed by the owner, 2026-09-27)." with ", and leaves the frame (J5-1)." The row then reads "…past masts, a signal gantry and Platform 3's nameboard, and leaves the frame (J5-1). Night: …".
- **§3.B, item 3, Live drawing.** Replace "When the drawing is live, the journey dynamically imports the scene chunk" with "When the drawing is live, or held still only by `place` (then the scene prepares in the background, J5-2), the journey dynamically imports the scene chunk".
- **§3.B, State.** Rewrite the gate's clause rather than adding a second one. Replace "CSS pins sections only under `html[data-motion="on"]` and draws live only under `html[data-drawing="live"]`, so the no-JS default is static." with "CSS pins sections only under `html[data-motion="on"]`, and pins and draws the drawing chapter live only under `#anatomy.is-live`, which the journey writes while the live drawing runs, alongside `html[data-drawing="live"]` (J5-3), so the no-JS default is static."
- **§3.B, the module map.**
  - In the Scene row, `scene/journey.ts` becomes `scene/live.ts`; add `scene/glow.ts` and `scene/scene-mark.ts`.
  - In the Client island row, add `live-labels.ts`, `webgl-probe.ts`, `hud.ts` and `hud-gate.ts`.
- **§3.C, the reasons table.** Add the row:
  `| \`place\` | the reader is below the chapter's top when the live drawing would begin | they come back above it |`
  Under the table, add: "While `place` is the only reason, the scene still loads and builds, so the switch is immediate (J5-2)."
- **§3.C, Still.** Replace "A still page never downloads three.js." with "A still page never downloads three.js, except while `place` is the only reason, when the scene prepares in the background (J5-2)."
- **§3.E.** The token list becomes "(`--surface-0`, `--ink-1`, `--accent`, `--accent-text`; J5-8)".
- **§3.J.** Add "and in development" after "preview deployments".
- **§7, the owner's check (its lines 322–323).** Replace "frame meter on preview deployments only)" with "frame meter on preview deployments and in development only; J5-10)".
- **§6, after "Decided while planning J4":**
```md
Decided while planning J5 (2026-09-27):
- the rail is gone, so the departure hands over to nothing: the train leaves the frame (J5-1);
- a seventh reason, `place`, keeps a reader below the chapter on the still until they come back above it (J5-2);
- one owner, `drawing.ts`, for the live pin's height changes and the reader's place around them (J5-3);
- the engine lives for the journey and is reused across rebuilds and restores (J5-4);
- labels while live wipe in and rise, never fade, with their own writers (J5-5);
- the palette reads four tokens (J5-8);
- the frame meter ships with J5, for the owner's real-device check (J5-10).
```
- **§6, the J5 row.** Add ", the frame meter" to its scope.

- [ ] **Step 6: The whole gate and the whole suite, then commit**

```bash
npm run check
lsof -nP -iTCP:4210 -sTCP:LISTEN
npx playwright test
```
Expected: green. Report every failure with its test name and message, and investigate it; the last J4 run was 448 passed, 0 failed.
```bash
git add scripts/journey-budgets.mjs tests/unit/scripts/journey-budgets.test.ts tests/e2e/journey DESIGN.md docs/superpowers/specs/2026-09-24-landing-journey-design.md
git commit -m "docs(journey): the live drawing in DESIGN.md and the spec, with every mode and the chunk budgets under test"
```

## Finish: budgets, proof, then the owner's word

- [ ] `npm run check` and `npx playwright test` are green on the final head. Report failures as they are.
- [ ] **The chunks.** Run `npm run build && node scripts/journey-budgets.mjs`. Expected: both within budget and no failures. Report both numbers; J4's journey chunk was 33.6 KB gzip.
- [ ] **three.js stays behind the door.** `grep -rln "from \"three" src --include=*.ts --include=*.tsx | grep -v "/scene/"` prints nothing. `grep -rn "import(\"./scene/live\")" src` prints only `drawing.ts`.
- [ ] **No hex in the scene.** `grep -rnE "#[0-9a-fA-F]{3,6}\b|0x[0-9a-fA-F]{6}" src/components/landing/journey/scene src/components/landing/journey/{governor,live-labels,hud}.ts scripts/bake` prints nothing.
- [ ] **The still budget** is held by `bake-stills.test.ts`. Report each shape's gzip size from Task 1's bake.
- [ ] **On a real GPU** (this Mac: the spec's reference desktop and 4× CPU phone, §3.H). Build and serve the site: `npm run build && PNR_SOURCE=fixture npx next start --port 4210` (after `lsof`). Then save this script in your session's scratchpad (never in the repo) as `j5-perf.mjs`, and run it with `node` from this worktree:
```js
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const q = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] ?? 0;

async function run({ width, height, cpu }) {
  const page = await browser.newPage({ viewport: { width, height } });
  const cdp = await page.context().newCDPSession(page);
  if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  await page.addInitScript(() => {
    window.__long = [];
    window.__cls = 0;
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(e.duration))).observe({ type: "longtask", buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__cls += e.hadRecentInput ? 0 : e.value))).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto("http://localhost:4210/");
  await page.waitForSelector("#anatomy.is-live", { timeout: 60_000 });
  const load = await page.evaluate(() => ({ longest: Math.max(0, ...window.__long), cls: window.__cls }));
  await page.evaluate(() => {
    const s = document.getElementById("anatomy");
    window.scrollTo({ top: s.getBoundingClientRect().top + window.scrollY - 64, behavior: "instant" });
    window.__frames = [];
    let last = 0;
    const tick = (t) => {
      if (last) window.__frames.push(t - last);
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.mouse.move(width / 2, height / 2);
  for (let i = 0; i < 60; i += 1) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(16);
  }
  const frames = await page.evaluate(() => window.__frames);
  const over = (ms) => ((frames.filter((f) => f > ms).length / frames.length) * 100).toFixed(1);
  console.log(`${width}×${height} ${cpu}× CPU: p95 ${q(frames, 0.95).toFixed(1)} ms, median ${(1000 / q(frames, 0.5)).toFixed(0)} fps, >25 ms ${over(25)}%, >33 ms ${over(33.4)}%; longest task at load ${load.longest.toFixed(0)} ms, CLS ${load.cls.toFixed(3)}; quality ${await page.evaluate(() => sessionStorage.getItem("tt.q") ?? "0")}`);
  await page.close();
}

await run({ width: 1280, height: 800, cpu: 1 }); // budget: p95 ≤ 12 ms, 0% > 25 ms
await run({ width: 390, height: 844, cpu: 4 }); // budget: median ≥ 55 fps, ≤ 2% > 33 ms, longest task ≤ 120 ms, CLS ≤ 0.05
await browser.close();
```
  Report the two lines as measured, over budget or not. The owner decides, and J6's nightly measures them from then on.
- [ ] **Screenshots** into the workspace:
  - `#anatomy` live at progress 0.05 (the scan), 0.4 (apart, labels out), 0.65 (dimensions) and 0.93 (departing past the gantry), at 1440×900 in Day and Night;
  - at 0.4 at 390×844 and at 844×390;
  - the terminus live in Day and Night;
  - `/?journey-hud` on a phone size;
  - v3 at the same four moments, for comparison.
- [ ] **The owner's real-device check** (spec §7). On a preview deployment, the owner opens `/?journey-hud` on a mid-range Android phone and sends the Copy report. J5 merges only after that.
- [ ] **Push and open the PR only on the owner's word.**

## What J6 inherits

- **Night falls** calls the live drawing's redraw by sending `tt:theme` (`THEME_EVENT`) inside its view transition, after `themeApplied`. The drawing re-reads its tokens and draws synchronously (J5-9).
- **The nightly** runs `node scripts/journey-budgets.mjs` after its production build (J5-15). It also runs the Finish's real-GPU measurements as throttled checks at 4×, 6× and 10×, where the governor's steps can be counted from `tt.q`.
- **The dev probe** `window.__ttJourney` does not exist in production builds (J5-13). The nightly's production-build smoke must not use it; the collisions at 15 sizes run on `next dev`, where it does.
- **WebKit** (spec §8) has not run the live drawing. The nightly's WebKit project should run `live-drawing.spec.ts` and `drawing-modes.spec.ts`.
- **CI draws through SwiftShader.** If a spec ever meets a governor step, the frames it drew were slow on the CPU rasteriser, not a product fault; hold that spec to `drawStill` only if it is about the still.
- **The window-seat run** starts below the terminus of GA's pin. #anatomy is 520vh (430vh narrow) while live, so any fixed-offset assumption in the run's specs must measure, not assume.

## Self-review notes

1. `npm run check` and the full `npx playwright test` are green.
2. `git log --format=%B origin/main..HEAD | grep -ci co-authored-by` prints `0`.
3. The three.js and hex greps in the Finish print nothing.
4. Every rule J5 adds to `journey-island.css` starts with `html[data-journey="on"]`; J5's addition to `journey.css` needs no JavaScript.
5. `teardown.spec.ts` passes with `clip-path` watched and no new `LIVE` entry: a live run leaves nothing behind.
6. The only files outside `scene/` that touch a scene module do so by `import type`, or through `drawing.ts`'s dynamic import.
7. No task touched the rail's files.
