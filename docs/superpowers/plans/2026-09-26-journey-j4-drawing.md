# Landing journey J4: the train, drawn still — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the drawn train to the landing as a still drawing. It is a WAP-7-style locomotive and LHB rake, baked at build time from the real three.js rig into one SVG file per shape. It shows in a new drawing chapter (GA) under the departure board and in a terminus stage above the closing plate. Its ten parts are labelled in a real list, which stands beside the drawing with leaders while the journey runs, and the head script decides Data Saver and the drawing mode before first paint.

**Architecture:**
- **Shared scene code.** The scene modules in `src/components/landing/journey/scene/` (math, util, lines, rig-parts, rig, line-world, world, apply-pose) and `pose.ts` are shared by the build-time bake (this PR) and the live drawing (J5).
- **The bake.** `scripts/bake-train-stills.mjs` bundles `scripts/bake/page.ts` with esbuild and runs it in headless Chromium. It keeps only the stretches of each edge that survive hidden-line removal, then writes four content-hashed SVG files to `public/journey/` and the generated `still-manifest.ts`.
- **The page.** The server renders the chapter and the stage. A small client component, `StillDrawing`, owns the `<use href>`s and sets them only when the page draws still, or the journey failed.
- **The journey.** The journey's `drawing.ts` settles the drawing mode. Its `still.ts` lays the labels out in columns with leaders when they fit.

**Tech Stack:**
- `three@0.186.0`, with `@types/three@0.186.0`;
- `esbuild@0.28.2`, a devDependency for the bake;
- Playwright 1.62's Chromium, for the bake;
- Next.js 16.3.4, React 19.2, Tailwind 4;
- Vitest 4 (`*.test.ts` in node, `*.test.tsx` in jsdom);
- Playwright e2e.

Anime.js is not used by any J4 module.

**Spec:** `docs/superpowers/specs/2026-09-24-landing-journey-design.md`. The sections that bind J4:
- §3.A: the drawn train and terminus rows, and GA;
- §3.B: State;
- §3.C: drawing modes;
- §3.D: the still drawing;
- §3.G: accessibility;
- §3.H: budgets;
- §4: failures;
- §5: tests;
- §6: the J4 row.

**Reference (read-only):**
- **Prototype v3 source:** in the session scratchpad at `/private/tmp/claude-501/-Users-heytherevibin-Downloads-Code-Dev-trackandtrace/34a2c8a3-8fc3-4ec4-9ffd-8bf48c6af4ce/scratchpad/train-proto/src/js/`, below called `V3/`. `V3/scene/` holds the rig and lines; `V3/../proto.css`, `V3/../still.css` and `V3/../fit.css` hold the CSS. Its built page is `train-proto/build/index.html`.
- **Digests,** in the same scratchpad beside the plan:
  - `j4-v3-digest.md`: v3's rig, poses, lines, bake, still mode and markup, with every number and the copy;
  - `j4-code-digest.md`: this branch as J3 left it.

  Read the digest section a task names before porting.

## Rulings made while planning J4

Each ruling has an id (J4-n) and says what it costs if wrong. Task 12 writes rulings 2, 4, 5 and 7 into the spec.

1. **The stroke helper becomes `strokes.ts`.** J3's `journey/drawing.ts` (`drawStrokes`) is renamed to `journey/strokes.ts`, so that `drawing.ts` can be the drawing mode the spec's module map names. *Cost if wrong: one rename.*
2. **One still file per shape.** Each shape is its own file, `public/journey/<shape>.<hash>.svg`: `anatomy-wide`, `anatomy-tall`, `terminus-wide` and `terminus-tall`, each holding one `<g id>` per part. They replace one sprite with symbols. A page shows one anatomy and one terminus shape, so it fetches at most two files, which keeps the ≤ 60 KB per-page budget (§3.H). A unit test holds that budget. *Cost if wrong: two more requests than one sprite on a still page.*
3. **Stills carry no theme.** They are baked once as geometry and coloured by `currentColor` and custom properties the page sets, which inherit into `<use>`. So Night needs no second bake, and the still drawing needs no palette. *Cost if wrong: a Night stroke weight that CSS cannot reach.*
4. **Only React sets the still's `href`s.** `StillDrawing` sets them only when `<html data-drawing="still">` or `data-journey="failed"`, and only for the shape its width shows (≥ 48rem wide, else tall). A page without JavaScript gets a `<noscript>` copy. J3-1 is unchanged: a failed journey writes only `data-journey="failed"`. *Cost if wrong: none; a live page never fetches a still.*
5. **Whatever only the live drawing uses waits for J5.** That covers:
   - `scene/fit.ts` (camera fit), the governor and `buildRigAsync`;
   - the headlight and pantograph glow sprites, the scan, the departure line side and the beam;
   - `scene/palette.ts` (reading tokens) and the WebGL probe;
   - the dimension labels and the chapter caption ("Scroll · the drawing turns…");
   - the strip's hand-off pulse. Its only caller is the live departure at progress 0.975, so J3-8's "J4/J5" becomes J5.

   Nothing lands unused. *Cost if wrong: J5 adds them, which was planned anyway.*
6. **In J4, every page settles on still.** `drawing.ts` takes the live loader as a parameter, and J4's loader rejects because no scene chunk exists yet. So a reader with Motion on and no Data Saver still settles on still, with the reason `load`. J5 passes the real loader. *Cost if wrong: `data-drawing-why` reads `load` until J5.*
7. **The page's own label layout is the parts list,** in this order: the words, then the drawing, then the list, with the accessible labels visually hidden and a visible `aria-hidden` legend. The journey's `still.ts` moves up to columns with leaders (`.is-columns`) only when they fit (v3's rules). So a page without the journey is whole. Labels never fade: text moves by transform only, and nothing in J4 moves them. *Cost if wrong: a desktop reader without the journey sees the list, not the columns.*
8. **GA** is the station id `anatomy`, code `GA`, km `12`, named "The train, drawn". The drawing chapter (`<section id="anatomy">`) is its section. *Cost if wrong: none; these are v3's values.*
9. **Copy location.** The chapter's words go in `messages.home.drawing` and the terminus caption in `messages.home.terminus`, as spec §2 says. GA's name goes in `messages.journey.stations`. *Cost if wrong: none.*
10. **The bake runs on a developer's machine** (it needs a GPU), and its outputs are committed. CI checks only that the manifest's source hash matches today's scene sources. `esbuild` becomes an exact devDependency at the version already installed (0.28.2). *Cost if wrong: someone must re-bake by hand after any scene change, which the test forces.*
11. **The terminus stage nests inside the existing `<section id="terminus">`,** before the closing plate. The `END` station already anchors that section. *Cost if wrong: none.*
12. **The quality floor.** The adaptive-quality step lives in `sessionStorage["tt.q"]` (spec §3.C), and the value `"still"` means the floor. J4's head script only reads it; J5's governor writes it. *Cost if wrong: J5 renames one constant.*

## Global Constraints

- **Next.js.** It is Next.js 16.3.4: read `AGENTS.md` and the relevant guide in `node_modules/next/dist/docs/` before writing Next-specific code.
- **Code rules.**
  - TypeScript strict, with no `any`; use `unknown` and narrowing.
  - Use `@/` aliases in `src` and `tests`; tests of `scripts/*.mjs` import them relatively (`../../../scripts/…`), as the existing script tests do.
  - Prefer `const`; use `let` only in loops and closures that need it.
  - Every file stays under 500 lines. The contract test also covers `scripts/**/*.mjs`.
- **TDD.** Write the failing test first, and watch it fail for the right reason before implementing.
- **Pins.**
  - `three` exactly `0.186.0`, `@types/three` exactly `0.186.0` (dev), `esbuild` exactly `0.28.2` (dev).
  - No CDN: import from `"three"` and `"three/addons/…"`. If the `three/addons` types fail to resolve, use `"three/examples/jsm/…"`, and say which.
- **three.js never enters a page bundle in J4.** Only `scripts/bake/page.ts` imports scene modules. The app imports only `train-parts.ts`, `still-shapes.ts` and `still-manifest.ts`, none of which import three.
- **No hex in the scene** (§3.E). The bake passes colour values it builds with `new Color(r, g, b)`. The stills use `currentColor`.
- **Decoration and labels.** The drawing, the leaders, the legend and the title block are decorative (`aria-hidden`). The ten labels are one real list (`<ol aria-label="What each part does">`), never removed.
- **Text moves by transform only, never opacity.**
- **One writer per attribute:** React or the journey, never both. In J4:
  - React owns the `href` of each `<use>`;
  - the journey owns `data-hot`, `is-columns`, `is-compact` and `is-hot`, the labels' `style.top`, and the still holder's `style.left`, `top`, `width` and `height`.
- **Gating.**
  - Every journey-only CSS rule starts with `html[data-journey="on"]` and lives in `src/styles/journey-island.css`.
  - The page's own still layout lives in `src/styles/journey.css`.
  - A failed journey writes only `data-journey="failed"` (J3-1), and never `data-motion`.
- **Copy** is verbatim from v3; Task 8 lists it. Travellers never see provider names.
- **Tests.**
  - E2E specs import `{ test, expect }` from `tests/e2e/fixtures`.
  - Any e2e that waits on `terminal-result` must assert `data-kind`.
  - Run Playwright only in this worktree, on port 4210 (check `lsof -nP -iTCP:4210 -sTCP:LISTEN` first), in fixture mode.
  - Never send a sample PNR to a live site. Never touch port 3100 or the primary checkout `/Users/heytherevibin/Downloads/Code/Dev/trackandtrace`.
- **The gate.** Run `npm run check` before every commit, and the full `npx playwright test` in Task 12.
- **Commits.** Conventional commits, with no `Co-Authored-By` or any other attribution trailer. Never commit `.env*`, secrets or `settings.local.json`.

## File structure

| File | Responsibility | Task |
|---|---|---|
| `src/components/landing/journey/scene/math.ts` | `TAU`, `clamp`, `lerp`, `smoothstep`, and the cubic eases (no three) | 1 |
| `src/components/landing/journey/pose.ts` | `anatomyPhases`, `anatomyPose`, `terminusPose`, `STILL_ANATOMY` (pure) | 1 |
| `src/components/landing/journey/scene/util.ts` | box, cylinder and mesh builders | 2 |
| `src/components/landing/journey/scene/lines.ts` | the drawing's materials; `drawn`, `setBase`/`baseOf`, `cloneShared`, `mergeAll`, `drawHierarchy`, `edgesOf` | 2 |
| `src/components/landing/journey/train-parts.ts` | `CALLOUT_PARTS`, `PartId`, `partSide` (no three) | 3 |
| `src/components/landing/journey/scene/rig-parts.ts` (+ `rig-cab.ts` if needed for < 500 lines) | the part builders and dimension tables | 3 |
| `src/components/landing/journey/scene/rig.ts` | `rigSteps`, `buildRig`, the `Rig` interface | 3 |
| `src/components/landing/journey/scene/line-world.ts` | rails, sleepers, masts, wires and the grid | 4 |
| `src/components/landing/journey/scene/world.ts` | `buildWorld`: the scene, fog, line, rig and camera (no renderer) | 4 |
| `src/components/landing/journey/scene/apply-pose.ts` | `applyPose(world, camera, pose)` | 4 |
| `scripts/bake/trace.ts` | the bake's pure core: ID decoding, run walking, the crop, path chaining | 5 |
| `scripts/bake/emit.mjs` | the shape table, SVG and manifest text, content and source hashes | 5 |
| `scripts/bake/page.ts` | the browser half: build, pose, the two render passes, readback (`window.bake`) | 6 |
| `scripts/bake-train-stills.mjs` | the Node half: esbuild bundle, Chromium, writing the files | 6 |
| `src/components/landing/journey/still-shapes.ts` | the `StillManifest` types, `WIDE_QUERY`, `shapeFor` | 6 |
| `src/components/landing/journey/still-manifest.ts` | **generated** by the bake | 6 |
| `public/journey/*.svg` | **generated** by the bake: four files | 6 |
| `src/components/motion/motion-boot.ts` | the head script also writes `data-saver` and `data-drawing` | 7 |
| `src/components/landing/journey/still-svg.tsx` | one shape's `<svg>` of `<use>`s (shared by the server and the client) | 8 |
| `src/components/landing/journey/still-drawing.tsx` | the client component owning the `href`s | 8 |
| `src/components/landing/journey/drawing-chapter.tsx` | `<section id="anatomy">`: copy, still, labels, legend, title block | 8 |
| `src/components/landing/journey/terminus-stage.tsx` | the terminus still with its caption | 8 |
| `src/components/landing/journey/stations.ts`, `src/messages/en-IN/journey.ts` | GA joins | 9 |
| `src/components/landing/journey/strokes.ts` | renamed from `drawing.ts` (J4-1) | 10 |
| `src/components/landing/journey/drawing-mode.ts` | the pure reasons reducer | 10 |
| `src/components/landing/journey/drawing.ts` | the journey module: `data-drawing`, `data-drawing-why`, `tt:drawing`, keeping the reader's place | 10 |
| `src/components/landing/journey/labels-layout.ts` | the pure column, zone, letterbox and leader maths | 11 |
| `src/components/landing/journey/still.ts` | the journey module: columns, leaders, part highlight | 11 |
| `tests/e2e/journey/drawing-checks.ts` | the drawing's collision checks: labels over the drawing, crossing leaders | 12 |

---

### Task 1: The drawn train's poses, as pure functions

**Files:**
- Create: `src/components/landing/journey/scene/math.ts`
- Create: `src/components/landing/journey/pose.ts`
- Test: `tests/unit/components/landing/journey/scene/math.test.ts`, `tests/unit/components/landing/journey/pose.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `math.ts`: `TAU: number`, `clamp(v, lo = 0, hi = 1): number`, `lerp(a, b, t): number`, `smoothstep(e0, e1, x): number`, `easeInOutCubic(t): number`, `easeOutCubic(t): number`.
  - `pose.ts`: `type Vec3 = readonly [number, number, number]`, `interface Phases`, `interface Pose`, `type AnatomyPose = Pose & Omit<Phases, "drive">`, `STILL_ANATOMY = 0.4`, `anatomyPhases(p): Phases`, `anatomyPose(p, aspect): AnatomyPose`, `terminusPose(p, aspect): Pose`.

Source: `V3/anatomy-pose.js` and `V3/scene/util.js` (digest §2.1, §3).

- [ ] **Step 1: Write the failing tests**

`tests/unit/components/landing/journey/scene/math.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { clamp, easeInOutCubic, easeOutCubic, lerp, smoothstep } from "@/components/landing/journey/scene/math";

describe("the drawing's math", () => {
  it("clamps into 0..1 by default, or the range given", () => {
    expect(clamp(-1)).toBe(0);
    expect(clamp(2)).toBe(1);
    expect(clamp(0.3)).toBe(0.3);
    expect(clamp(5, 0, 3)).toBe(3);
  });

  it("interpolates", () => {
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });

  it("smoothsteps with flat ends and a half at the middle", () => {
    expect(smoothstep(0.2, 0.4, 0.1)).toBe(0);
    expect(smoothstep(0.2, 0.4, 0.5)).toBe(1);
    expect(smoothstep(0.2, 0.4, 0.3)).toBeCloseTo(0.5, 10);
  });

  it("eases on the cubic, in-out and out", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.25)).toBeCloseTo(0.0625, 10);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 10);
    expect(easeOutCubic(1)).toBe(1);
  });
});
```

`tests/unit/components/landing/journey/pose.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { STILL_ANATOMY, anatomyPhases, anatomyPose, terminusPose, type Pose } from "@/components/landing/journey/pose";

const distance = (p: Pose): number => Math.hypot(p.pos[0] - p.target[0], p.pos[1] - p.target[1], p.pos[2] - p.target[2]);

describe("anatomyPhases", () => {
  it("comes apart between 0.12 and 0.32, and back together between 0.5 and 0.6", () => {
    expect(anatomyPhases(0.12).explode).toBe(0);
    expect(anatomyPhases(0.32).explode).toBe(1);
    expect(anatomyPhases(0.45).explode).toBe(1);
    expect(anatomyPhases(0.6).explode).toBe(0);
  });

  it("shows the callouts only while the parts are apart", () => {
    expect(anatomyPhases(0.25).callouts).toBe(0);
    expect(anatomyPhases(0.4).callouts).toBe(1);
    expect(anatomyPhases(0.54).callouts).toBe(0);
  });

  it("couples, raises the pantograph and drives away in that order", () => {
    const at = anatomyPhases(0.86);
    expect(at.couple).toBe(1);
    expect(at.panto).toBeGreaterThan(0);
    expect(at.panto).toBeLessThan(1);
    expect(at.drive).toBe(0);
    expect(anatomyPhases(1).drive).toBe(1);
  });
});

describe("the still frame", () => {
  it("is fully apart with its callouts shown, before the side view", () => {
    expect(anatomyPose(STILL_ANATOMY, 2)).toMatchObject({ scan: 1, explode: 1, callouts: 1, side: 0, dims: 0, couple: 0, panto: 0, drive: 0, lineside: false });
  });

  it("frames wide screens at 30° and phones at 46°", () => {
    expect(anatomyPose(STILL_ANATOMY, 2).fov).toBe(30);
    expect(anatomyPose(STILL_ANATOMY, 0.75).fov).toBe(46);
  });

  it("stands back far enough for the exploded height, in front of the train", () => {
    for (const aspect of [2, 0.75]) {
      const pose = anatomyPose(STILL_ANATOMY, aspect);
      const half = Math.tan((pose.fov * Math.PI) / 360);
      const spanH = aspect < 1 ? 12 : 17;
      expect(distance(pose)).toBeGreaterThanOrEqual((spanH / 2 / half) * 1.08 - 1e-9);
      expect(pose.pos[2]).toBeGreaterThan(0);
    }
  });

  it("is a pure function of progress and shape", () => {
    expect(anatomyPose(0.4, 1.6)).toEqual(anatomyPose(0.4, 1.6));
  });
});

describe("terminusPose", () => {
  it("has arrived by 85% of its progress", () => {
    expect(terminusPose(0, 2).drive).toBe(-150);
    expect(terminusPose(0.85, 2).drive).toBeCloseTo(0, 10);
    expect(terminusPose(1, 2).drive).toBeCloseTo(0, 10);
  });

  it("shows the whole train coupled, with the pantograph up", () => {
    expect(terminusPose(1, 2)).toMatchObject({ scan: 1, explode: 0, callouts: 0, dims: 0, couple: 1, panto: 1, lineside: false });
  });

  it("stands 46 m off on wide screens at 26°, and 60 m off on phones at 44°", () => {
    const wide = terminusPose(1, 2);
    expect(wide.fov).toBe(26);
    expect(wide.target).toEqual([-18, 2.2, 0]);
    expect(distance(wide)).toBeCloseTo(46, 9);
    const tall = terminusPose(1, 0.8);
    expect(tall.fov).toBe(44);
    expect(distance(tall)).toBeCloseTo(60, 9);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/unit/components/landing/journey/scene/math.test.ts tests/unit/components/landing/journey/pose.test.ts`
Expected: FAIL, because neither module exists yet.

- [ ] **Step 3: Write `math.ts`**

```ts
// The drawn train's small maths (prototype v3's scene/util.js): clamping, blending and the cubic eases its poses
// use. No three.js here, so the poses stay pure and the tests need no scene.

export const TAU = Math.PI * 2;

export const clamp = (v: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
```

- [ ] **Step 4: Write `pose.ts`**

```ts
import { clamp, easeInOutCubic, easeOutCubic, lerp, smoothstep } from "./scene/math";

// The drawing chapter as a pure function of its scroll progress, 0..1 (prototype v3's anatomy-pose.js): the
// locomotive is scanned into its drawing while it turns, comes apart into its labelled parts, goes back together in
// side elevation with its dimensions, takes its coaches, raises the pantograph to the wire and pulls away. Also the
// terminus arrival. The bake poses the still drawings with these (J4); the live drawing plays them (J5).

export type Vec3 = readonly [number, number, number];

export interface Phases {
  readonly scan: number;
  readonly explode: number;
  readonly callouts: number;
  readonly side: number;
  readonly dims: number;
  readonly couple: number;
  readonly panto: number;
  readonly drive: number;
  readonly follow: number;
}

/** One frame of the drawn train: the rig's state and the camera's. */
export interface Pose {
  readonly scan: number;
  readonly explode: number;
  readonly callouts: number;
  readonly dims: number;
  readonly couple: number;
  readonly panto: number;
  /** The whole train's offset along the track, in metres. */
  readonly drive: number;
  readonly fov: number;
  readonly target: Vec3;
  readonly pos: Vec3;
  /** Whether the line side (masts, gantry, nameboard) is drawn. */
  readonly lineside: boolean;
}

export type AnatomyPose = Pose & Omit<Phases, "drive">;

/** The rig's x at the locomotive's middle (its nose is at 0). */
const LOCO_CENTRE = -10.15;

/** Where the chapter rests when it is drawn still: fully apart, its callouts showing. */
export const STILL_ANATOMY = 0.4;

function orbit(target: Vec3, yaw: number, pitch: number, dist: number): Vec3 {
  return [target[0] + Math.sin(yaw) * Math.cos(pitch) * dist, target[1] + Math.sin(pitch) * dist, target[2] + Math.cos(yaw) * Math.cos(pitch) * dist];
}

export function anatomyPhases(p: number): Phases {
  const explodeIn = smoothstep(0.12, 0.32, p);
  const explodeOut = smoothstep(0.5, 0.6, p);
  return {
    // a scan gate sweeps the solid steel locomotive into its drawing while it turns
    scan: smoothstep(0.015, 0.13, p),
    explode: explodeIn * (1 - explodeOut),
    callouts: smoothstep(0.26, 0.33, p) * (1 - smoothstep(0.47, 0.53, p)),
    side: easeInOutCubic(smoothstep(0.5, 0.66, p)),
    dims: smoothstep(0.62, 0.67, p) * (1 - smoothstep(0.73, 0.77, p)),
    couple: smoothstep(0.74, 0.86, p),
    panto: smoothstep(0.84, 0.9, p),
    drive: smoothstep(0.88, 1, p),
    // the camera rides along as the train pulls away (so the line side streams past), then lets it go
    follow: smoothstep(0.885, 0.93, p) * (1 - 0.32 * smoothstep(0.955, 1, p)),
  };
}

export function anatomyPose(p: number, aspect: number): AnatomyPose {
  const ph = anatomyPhases(p);
  const phone = aspect < 1;
  const fov = phone ? 46 : 30;
  const turn = easeInOutCubic(smoothstep(0, 0.3, p));
  const yaw = lerp(lerp(0.72, 0.42, turn), 0, ph.side);
  const pitch = lerp(lerp(0.44, 0.3, turn), 0.1, ph.side);
  const drive = 150 * ph.drive * ph.drive;
  // phones: the side elevation shows the whole locomotive before the coaches arrive
  const spanW = phone ? lerp(lerp(19, 29, ph.explode), lerp(24, 30, ph.couple), ph.side) : lerp(lerp(30, 54, ph.explode), 46, ph.side * ph.couple);
  const spanH = phone ? lerp(7, 12, ph.explode) : lerp(9, 17, ph.explode);
  const vfov = (fov * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  const dist = Math.max(spanW / 2 / Math.tan(hfov / 2), spanH / 2 / Math.tan(vfov / 2)) * 1.08;
  const ride = drive * ph.follow;
  const targetX = lerp(LOCO_CENTRE, LOCO_CENTRE - 12, ph.side * ph.couple) + ride;
  const target: Vec3 = [targetX, lerp(lerp(2.3, 2.6, ph.explode), lerp(2.6, 3.4, ph.couple), ph.side), 0];
  return { ...ph, drive, fov, target, pos: orbit(target, yaw, pitch, dist), lineside: ph.drive > 0.001 };
}

export function terminusPose(p: number, aspect: number): Pose {
  const t = clamp(p / 0.85);
  const phone = aspect < 1;
  const target: Vec3 = [-18, 2.2, 0];
  return {
    scan: 1,
    explode: 0,
    callouts: 0,
    dims: 0,
    couple: 1,
    panto: 1,
    drive: -150 * (1 - easeOutCubic(t)) ** 1.2,
    fov: phone ? 44 : 26,
    target,
    pos: orbit(target, 0.52, 0.16, phone ? 60 : 46),
    lineside: false,
  };
}
```

- [ ] **Step 5: Run the tests to see them pass, then the gate**

Run: `npx vitest run tests/unit/components/landing/journey/scene/math.test.ts tests/unit/components/landing/journey/pose.test.ts`
Expected: PASS.
Run: `npm run check`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/components/landing/journey/scene/math.ts src/components/landing/journey/pose.ts tests/unit/components/landing/journey/scene/math.test.ts tests/unit/components/landing/journey/pose.test.ts
git commit -m "feat(journey): the drawn train's poses, as pure functions of the chapter's progress"
```

---

### Task 2: three.js joins, with the drawing's primitives and lines

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `src/components/landing/journey/scene/util.ts`, `src/components/landing/journey/scene/lines.ts`
- Test: `tests/unit/components/landing/journey/scene/util.test.ts`, `tests/unit/components/landing/journey/scene/lines.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `util.ts`:
    - `type Axis = "x" | "y" | "z"`;
    - `boxGeo(w, h, d, r = 0, seg = 2): BufferGeometry`;
    - `mesh(geo, mat, x = 0, y = 0, z = 0): Mesh`;
    - `box(parent, mat, w, h, d, x, y, z, r = 0): Mesh`;
    - `cyl(parent, mat, radius, length, x, y, z, axis = "y", seg = 16, radiusTop = radius): Mesh`.
  - `lines.ts`:
    - `interface Palette { ground; ink; steel; steelText: Color }`;
    - `interface LineOpacity { line; faint; near: number }`, with `DAY_OPACITY`;
    - `FILL_OFFSET = { factor: 1.5, units: 2 }`;
    - `interface LineStyle { fill: MeshBasicMaterial; line, faint, near, accent, dim: LineBasicMaterial }`;
    - `createStyle(palette, opacity = DAY_OPACITY): LineStyle`;
    - `setBase(edges, material): void` and `baseOf(edges): LineBasicMaterial | undefined`;
    - `drawn(geometry, style, { threshold = 16, lineMat }?): Group`;
    - `cloneShared<T extends Object3D>(src: T): T`;
    - `mergeAll(group: Object3D): BufferGeometry`;
    - `drawHierarchy<T extends Object3D>(root: T, style, opts?): T`;
    - `edgesOf(obj): LineSegments[]`.

Source: `V3/scene/util.js` and `V3/scene/lines.js` (digest §2.1 and §5.1). Per J4-5, the glow texture and its sprite material, and `setTheme` (Night), wait for J5.

- [ ] **Step 1: Install three.js**

```bash
npm install --save-exact three@0.186.0
npm install --save-exact --save-dev @types/three@0.186.0
```
Check that `package.json` reads exactly `"three": "0.186.0"` and `"@types/three": "0.186.0"`.

- [ ] **Step 2: Write the failing tests**

`tests/unit/components/landing/journey/scene/util.test.ts`:
```ts
import { BoxGeometry, Group, MeshBasicMaterial } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { describe, expect, it } from "vitest";
import { box, boxGeo, cyl } from "@/components/landing/journey/scene/util";

const MAT = new MeshBasicMaterial();

describe("the drawing's primitives", () => {
  it("builds square boxes plain and rounded ones rounded", () => {
    expect(boxGeo(1, 2, 3)).toBeInstanceOf(BoxGeometry);
    expect(boxGeo(1, 2, 3, 0.1)).toBeInstanceOf(RoundedBoxGeometry);
  });

  it("adds a box to its parent, centred where asked", () => {
    const parent = new Group();
    const m = box(parent, MAT, 1, 1, 1, 2, 3, 4);
    expect(m.parent).toBe(parent);
    expect(m.position.toArray()).toEqual([2, 3, 4]);
  });

  it("lays a cylinder along x or z", () => {
    const parent = new Group();
    const along = (axis: "x" | "z") => {
      const c = cyl(parent, MAT, 0.5, 4, 0, 0, 0, axis);
      c.geometry.computeBoundingBox();
      const b = c.geometry.boundingBox;
      if (!b) throw new Error("no bounding box");
      return { x: b.max.x - b.min.x, y: b.max.y - b.min.y, z: b.max.z - b.min.z };
    };
    expect(along("x").x).toBeCloseTo(4, 5);
    expect(along("x").y).toBeCloseTo(1, 5);
    expect(along("z").z).toBeCloseTo(4, 5);
  });
});
```

`tests/unit/components/landing/journey/scene/lines.test.ts`:
```ts
import { BoxGeometry, BufferAttribute, BufferGeometry, Color, Group, LineSegments, Mesh, MeshBasicMaterial } from "three";
import { describe, expect, it } from "vitest";
import { baseOf, cloneShared, createStyle, drawn, edgesOf, mergeAll, type Palette } from "@/components/landing/journey/scene/lines";

const INK = new Color(0, 0, 0);
const PALETTE: Palette = { ground: INK, ink: INK, steel: INK, steelText: INK };

describe("the drawing's lines", () => {
  it("draws a solid as its fill and its creases, with the fill pushed back so hidden edges stay hidden", () => {
    const style = createStyle(PALETTE);
    const [fill, edges] = drawn(new BoxGeometry(1, 1, 1), style).children;
    expect(fill).toBeInstanceOf(Mesh);
    expect(fill instanceof Mesh && fill.material).toBe(style.fill);
    expect([style.fill.polygonOffset, style.fill.polygonOffsetFactor, style.fill.polygonOffsetUnits]).toEqual([true, 1.5, 2]);
    expect(edges).toBeInstanceOf(LineSegments);
    expect(edges instanceof LineSegments && edges.geometry.attributes.position.count).toBe(24); // a box's 12 creases
    expect(baseOf(edges)).toBe(style.line);
  });

  it("keeps each edge set's base material across a shared clone (a second coach)", () => {
    const style = createStyle(PALETTE);
    const src = new Group();
    src.add(drawn(new BoxGeometry(1, 1, 1), style, { lineMat: style.faint }));
    const [a] = edgesOf(src);
    const [b] = edgesOf(cloneShared(src));
    expect(b).not.toBe(a);
    expect(b.geometry).toBe(a.geometry);
    expect(baseOf(b)).toBe(style.faint);
  });

  it("merges meshes into one geometry in the group's frame", () => {
    const group = new Group();
    const one = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    const two = one.clone();
    two.position.x = 5;
    group.add(one, two);
    const merged = mergeAll(group);
    expect(merged.attributes.position.count).toBe(72);
    merged.computeBoundingBox();
    expect(merged.boundingBox?.max.x).toBeCloseTo(5.5, 6);
  });

  it("turns a mirrored mesh's triangles back the right way round", () => {
    const tri = new BufferGeometry();
    tri.setAttribute("position", new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
    const m = new Mesh(tri, new MeshBasicMaterial());
    m.scale.x = -1;
    const group = new Group();
    group.add(m);
    const out = Array.from(mergeAll(group).attributes.position.array, (v) => v + 0); // -0 reads as 0
    expect(out).toEqual([0, 0, 0, 0, 1, 0, -1, 0, 0]);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run tests/unit/components/landing/journey/scene/util.test.ts tests/unit/components/landing/journey/scene/lines.test.ts`
Expected: FAIL, because the modules do not exist.

- [ ] **Step 4: Write `util.ts`**

```ts
import { BoxGeometry, CylinderGeometry, Mesh, type BufferGeometry, type Material, type Object3D } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// Builders for the drawn train's primitives (prototype v3's scene/util.js), in metres. The maths the poses use
// lives in math.ts, so the poses need no three.js.

export type Axis = "x" | "y" | "z";

/** A box whose origin is its centre; rounded when r > 0. */
export function boxGeo(w: number, h: number, d: number, r = 0, seg = 2): BufferGeometry {
  if (r > 0) return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2));
  return new BoxGeometry(w, h, d);
}

export function mesh(geo: BufferGeometry, mat: Material, x = 0, y = 0, z = 0): Mesh {
  const m = new Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

export function box(parent: Object3D, mat: Material, w: number, h: number, d: number, x: number, y: number, z: number, r = 0): Mesh {
  const m = mesh(boxGeo(w, h, d, r), mat, x, y, z);
  parent.add(m);
  return m;
}

/** A cylinder lying along the given axis. */
export function cyl(parent: Object3D, mat: Material, radius: number, length: number, x: number, y: number, z: number, axis: Axis = "y", seg = 16, radiusTop = radius): Mesh {
  const g = new CylinderGeometry(radiusTop, radius, length, seg);
  if (axis === "x") g.rotateZ(Math.PI / 2);
  if (axis === "z") g.rotateX(Math.PI / 2);
  const m = mesh(g, mat, x, y, z);
  parent.add(m);
  return m;
}
```

- [ ] **Step 5: Write `lines.ts`**

Port `V3/scene/lines.js` with these changes:
- Colours arrive as a `Palette`, never as hex.
- There is no `INK` table, no glow texture, no `glow` material and no `setTheme` (J4-5).
- `userData.baseMat` is read through `baseOf`.
- `instanceof` replaces `isMesh` and `isLineSegments`.

```ts
import { BufferGeometry, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial, type Color, type Object3D } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Technical-drawing rendering (prototype v3's scene/lines.js): every solid is drawn as its hairline edges over a
// fill in the sheet's own ground colour, pushed back in depth so edges behind a surface are hidden (hidden-line
// removal). The bake reproduces the same push (FILL_OFFSET) when it decides which stretches of edge are visible.
// Colours arrive as a palette, never as hex: the live drawing reads the theme's tokens (J5); the bake needs none.

export interface Palette {
  readonly ground: Color;
  readonly ink: Color;
  readonly steel: Color;
  readonly steelText: Color;
}

export interface LineOpacity {
  readonly line: number;
  readonly faint: number;
  readonly near: number;
}

/** Day's ink weights. Night's arrive with the live drawing (J5); the still takes its weights from CSS. */
export const DAY_OPACITY: LineOpacity = { line: 0.8, faint: 0.1, near: 0.42 };

/** How far a fill is pushed back in depth: the live drawing and the bake must agree. */
export const FILL_OFFSET = { factor: 1.5, units: 2 } as const;

export interface LineStyle {
  readonly fill: MeshBasicMaterial;
  readonly line: LineBasicMaterial;
  readonly faint: LineBasicMaterial;
  /** The nearest things the departing train passes: lighter, so they read as foreground. */
  readonly near: LineBasicMaterial;
  readonly accent: LineBasicMaterial;
  /** The general-arrangement dimension lines. */
  readonly dim: LineBasicMaterial;
}

export function createStyle(palette: Palette, opacity: LineOpacity = DAY_OPACITY): LineStyle {
  const ink = (o: number) => new LineBasicMaterial({ color: palette.ink, transparent: true, opacity: o, fog: true });
  return {
    fill: new MeshBasicMaterial({ color: palette.ground, polygonOffset: true, polygonOffsetFactor: FILL_OFFSET.factor, polygonOffsetUnits: FILL_OFFSET.units }),
    line: ink(opacity.line),
    faint: ink(opacity.faint),
    near: ink(opacity.near),
    accent: new LineBasicMaterial({ color: palette.steel, transparent: true, opacity: 1, fog: true }),
    dim: new LineBasicMaterial({ color: palette.steelText, transparent: true, opacity: 0, fog: false, depthTest: false }),
  };
}

const BASE = "baseMat";

/**
 * The material an edge set returns to after a highlight. Kept off userData's enumerable keys: three.js copies
 * userData through JSON when it clones, and a material does not survive that (shared coaches clone).
 */
export function setBase(edges: Object3D, material: LineBasicMaterial): void {
  Object.defineProperty(edges.userData, BASE, { value: material, enumerable: false, configurable: true, writable: true });
}

export function baseOf(edges: Object3D): LineBasicMaterial | undefined {
  const value: unknown = edges.userData[BASE];
  return value instanceof LineBasicMaterial ? value : undefined;
}
```

Then port, typed and unchanged in behaviour:
- `drawn(geometry: BufferGeometry, style: LineStyle, { threshold = 16, lineMat }: { readonly threshold?: number; readonly lineMat?: LineBasicMaterial } = {}): Group`. It calls `setBase(edges, lineMat ?? style.line)`.
- `cloneShared<T extends Object3D>(src: T): T`. It walks `src` and the clone in step and re-sets `baseOf`.
- `mergeAll(group: Object3D): BufferGeometry`, with the determinant winding fix-up verbatim (digest §5.1 and gotcha 9).
- `drawHierarchy<T extends Object3D>(root: T, style: LineStyle, opts?: { readonly threshold?: number; readonly lineMat?: LineBasicMaterial }): T`.
- `edgesOf(obj: Object3D): LineSegments[]`.

- [ ] **Step 6: Run the tests to see them pass, then the gate**

Run: `npx vitest run tests/unit/components/landing/journey/scene/`
Expected: PASS.
Run: `npm run check`
Expected: green. If `three/addons/...` types do not resolve, switch both specifiers to `three/examples/jsm/...` and say so in your report.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/components/landing/journey/scene/util.ts src/components/landing/journey/scene/lines.ts tests/unit/components/landing/journey/scene/util.test.ts tests/unit/components/landing/journey/scene/lines.test.ts
git commit -m "feat(journey): three.js joins, with the drawing's primitives and its hidden-line style"
```

---

### Task 3: The rig: the locomotive in ten labelled parts, and its coaches

**Files:**
- Create: `src/components/landing/journey/train-parts.ts`
- Create: `src/components/landing/journey/scene/rig-parts.ts`. If the typed port passes 450 lines, move `cabNose` and `pantograph` into `scene/rig-cab.ts`.
- Create: `src/components/landing/journey/scene/rig.ts`
- Test: `tests/unit/components/landing/journey/train-parts.test.ts`, `tests/unit/components/landing/journey/scene/rig.test.ts`

**Interfaces:**
- Consumes (Task 2):
  - `box`, `cyl`, `mesh`, `boxGeo` (util);
  - `drawn`, `drawHierarchy`, `cloneShared`, `mergeAll`, `setBase`, `baseOf`, `type LineStyle` (lines);
  - `clamp`, `TAU` (math).
- Produces:
  - `train-parts.ts`:
    - `CALLOUT_PARTS = ["pantoFront", "shell", "cabFront", "bogieFront", "wheelsFront", "pantoRear", "roof", "cabRear", "bogieRear", "wheelsRear"] as const`;
    - `type PartId`, `type LabelSide = "left" | "right"`;
    - `isPartId(v: string): v is PartId`;
    - `partSide(id: string): LabelSide`: the first five stand right, the last five left.
  - `rig-parts.ts`: `LOCO`, `COACH`, `GAUGE_Z`, and the builders `bodyProfile`, `extrudeSection`, `roofCap`, `wheelGeometry`, `bogie`, `cabNose`, `pantograph`, `drawnPart`, `featureLines`, `addWheels`, `coachSteps` (digest §2.2, verbatim numbers).
  - `rig.ts`:
    ```ts
    export type RigPartId = PartId | "tanks";
    export interface RigPart { readonly id: RigPartId; readonly obj: Group; readonly base: Vector3; readonly explode: Vector3; readonly anchor: Vector3; readonly delay: number }
    export interface Rig {
      readonly group: Group;
      readonly parts: Readonly<Record<RigPartId, RigPart>>;
      readonly coaches: readonly { readonly obj: Object3D; readonly baseX: number }[];
      /** 0 = assembled, 1 = fully apart; each part leaves a little after the one before. */
      setExplode(t: number): void;
      /** 0 = folded, 1 = the trailing pantograph at the wire (the leading one stays folded). */
      setPantograph(t: number): void;
      /** 0 = coaches waiting off to the left, 1 = coupled; `shown` caps how many draw. */
      setCoupling(t: number, shown?: number): void;
      turnWheels(): void;
      /** The world position of a labelled part's leader anchor. */
      anchor(id: PartId, v?: Vector3): Vector3;
      dimAnchor(which: string, v?: Vector3): Vector3;
      setDims(t: number): void;
      /** Light one part's edges in steel; null clears. */
      setHighlight(id: RigPartId | null): void;
      /** The headlight lens's centre in the front cab's frame (the Night beam, J5). */
      readonly headlight: Vector3;
      readonly cabFront: Group;
    }
    export function rigSteps(style: LineStyle, opts: { readonly coaches?: number }, out: { rig?: Rig }): Generator<void, void, void>;
    export function buildRig(style: LineStyle, opts?: { readonly coaches?: number }): Rig;
    ```
    Keep `dimAnchor`'s key type as whatever v3's `dimAnchors` object names: use a string-literal union of its keys.

Source: `V3/scene/rig-parts.js` (361 lines) and `V3/scene/rig.js` (263 lines). Digest §2.2 and §2.3 give the tables and the part list.

**Porting rules** (the geometry is verbatim: every number, every step and every `yield`):
1. **Imports.** Import from `./util`, `./lines` and `./math`, and use named `three` imports.
2. **No glow (J4-5).** Drop `style.glow`, the front cab's glow `Sprite`, `headGlow` and the pantograph-head search that places it. `applyPose` no longer touches `headGlow`.
3. **Not yet.** There is no `pickables()` and no `buildRigAsync` (J5). Export `rigSteps`, so J5 can drive it.
4. **The placeholder material.** `M` becomes `const PLACEHOLDER = new MeshBasicMaterial(); export const M: Readonly<Record<string, MeshBasicMaterial>> = new Proxy<Readonly<Record<string, MeshBasicMaterial>>>({}, { get: () => PLACEHOLDER });`.
5. **Type checks.** Replace `o.isMesh`, `o.isGroup` and `o.isLineSegments` with `instanceof`.
6. **Wheel data.** Read `o.userData.wheel` through a narrowing helper, `wheelOf(o): { r: number; side: number } | undefined`, which checks both are numbers.
7. **Highlight.** `setHighlight` reads each edge's base through `baseOf`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/components/landing/journey/train-parts.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { CALLOUT_PARTS, isPartId, partSide } from "@/components/landing/journey/train-parts";

describe("the drawn train's labelled parts", () => {
  it("are ten, leading end first", () => {
    expect(CALLOUT_PARTS).toEqual(["pantoFront", "shell", "cabFront", "bogieFront", "wheelsFront", "pantoRear", "roof", "cabRear", "bogieRear", "wheelsRear"]);
  });

  it("stand right of the drawing for the leading five and left for the trailing five", () => {
    expect(CALLOUT_PARTS.map(partSide)).toEqual(["right", "right", "right", "right", "right", "left", "left", "left", "left", "left"]);
  });

  it("knows its own ids", () => {
    expect(isPartId("roof")).toBe(true);
    expect(isPartId("coach")).toBe(false);
  });
});
```

`tests/unit/components/landing/journey/scene/rig.test.ts`:
```ts
import { Box3, Color, Group, LineSegments, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { buildRig, rigSteps, type Rig } from "@/components/landing/journey/scene/rig";
import { baseOf, createStyle, edgesOf, type LineStyle } from "@/components/landing/journey/scene/lines";
import { CALLOUT_PARTS } from "@/components/landing/journey/train-parts";

const INK = new Color(0, 0, 0);
const style: LineStyle = createStyle({ ground: INK, ink: INK, steel: INK, steelText: INK });
const rig: Rig = buildRig(style, { coaches: 3 });

const offset = (id: keyof Rig["parts"]) => rig.parts[id].obj.position.clone().sub(rig.parts[id].base);

describe("the drawn train's rig", () => {
  it("has the ten labelled parts, and the tanks", () => {
    expect(Object.keys(rig.parts).sort()).toEqual([...CALLOUT_PARTS, "tanks"].sort());
  });

  it("takes each part apart along its own line, the roof a little after the shell", () => {
    rig.setExplode(1);
    expect(offset("shell").toArray().map((v) => +v.toFixed(6))).toEqual([0, 0.9, 0]);
    expect(offset("roof").y).toBeCloseTo(2.8, 6);
    rig.setExplode(0.04);
    expect(offset("shell").y).toBeGreaterThan(0);
    expect(offset("roof").y).toBeCloseTo(0, 9);
    rig.setExplode(0);
    for (const id of CALLOUT_PARTS) expect(offset(id).length()).toBeCloseTo(0, 9);
  });

  it("brings its coaches in from the left, as many as it is allowed to show", () => {
    rig.setCoupling(0);
    expect(rig.coaches.every((c) => !c.obj.visible)).toBe(true);
    rig.setCoupling(1);
    expect(rig.coaches.map((c) => c.obj.visible)).toEqual([true, true, true]);
    expect(rig.coaches.map((c) => c.obj.position.x)).toEqual(rig.coaches.map((c) => c.baseX));
    rig.setCoupling(1, 1);
    expect(rig.coaches.map((c) => c.obj.visible)).toEqual([true, false, false]);
  });

  it("raises the trailing pantograph to the wire and leaves the leading one folded", () => {
    const top = (id: "pantoFront" | "pantoRear") => new Box3().setFromObject(rig.parts[id].obj).max.y;
    rig.setPantograph(0);
    const [front0, rear0] = [top("pantoFront"), top("pantoRear")];
    rig.setPantograph(1);
    expect(top("pantoRear")).toBeGreaterThan(rear0 + 0.5);
    expect(top("pantoFront")).toBeCloseTo(front0, 6);
    rig.setPantograph(0);
  });

  it("lights one part in steel and gives every edge its own ink back, even on a shared clone", () => {
    rig.setHighlight("bogieRear");
    expect(edgesOf(rig.parts.bogieRear.obj).every((e) => e.material === style.accent)).toBe(true);
    expect(edgesOf(rig.parts.bogieFront.obj).some((e) => e.material === style.accent)).toBe(false);
    rig.setHighlight(null);
    expect(edgesOf(rig.parts.bogieRear.obj).every((e) => e.material === baseOf(e))).toBe(true);
  });

  it("gives every labelled part a finite leader anchor", () => {
    rig.group.updateMatrixWorld(true);
    for (const id of CALLOUT_PARTS) expect(rig.anchor(id).toArray().every(Number.isFinite)).toBe(true);
  });

  it("turns the wheels as the train moves along the track", () => {
    const wheels: Group[] = [];
    rig.parts.wheelsFront.obj.traverse((o) => {
      if (o instanceof Group && typeof o.userData.wheel === "object") wheels.push(o);
    });
    expect(wheels.length).toBeGreaterThan(0);
    rig.group.position.x = 3;
    rig.group.updateMatrixWorld(true);
    rig.turnWheels();
    const turned = wheels[0].rotation.z;
    rig.group.position.x = 0;
    rig.group.updateMatrixWorld(true);
    rig.turnWheels();
    expect(turned).not.toBeCloseTo(wheels[0].rotation.z, 3);
  });

  it("fades the dimension lines with setDims", () => {
    rig.setDims(0.5);
    expect(style.dim.opacity).toBeCloseTo(0.475, 9);
    rig.setDims(0);
  });

  it("builds a part at a time, and only hands over the rig once it is whole", () => {
    const out: { rig?: Rig } = {};
    let steps = 0;
    for (const _ of rigSteps(style, { coaches: 1 }, out)) {
      steps += 1;
      expect(out.rig).toBeUndefined();
    }
    expect(steps).toBeGreaterThanOrEqual(9);
    expect(out.rig?.coaches).toHaveLength(1);
  });

  it("draws only hairlines over fills", () => {
    const kinds = new Set<string>();
    rig.group.traverse((o) => {
      if (o instanceof LineSegments) kinds.add("lines");
    });
    expect(kinds.has("lines")).toBe(true);
    expect(new Vector3().copy(rig.headlight).toArray()).toEqual([0.36, 3.93, 0]);
  });
});
```
If v3 registers the wheel data on a different object type than `Group`, match what v3 does and say so. The test's point is that a wheel's rotation depends on where the train stands.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/unit/components/landing/journey/train-parts.test.ts tests/unit/components/landing/journey/scene/rig.test.ts`
Expected: FAIL, because the modules do not exist.

- [ ] **Step 3: Write `train-parts.ts`**

```ts
// The drawn train's ten labelled parts (spec §3.A), in the labels' order: the leading end (right of the drawing)
// first, then the trailing end (left). The rig, the bake's anchors, the copy and the labels all key on these ids.
// No three.js here: the page imports this.

export const CALLOUT_PARTS = ["pantoFront", "shell", "cabFront", "bogieFront", "wheelsFront", "pantoRear", "roof", "cabRear", "bogieRear", "wheelsRear"] as const;

export type PartId = (typeof CALLOUT_PARTS)[number];
export type LabelSide = "left" | "right";

export function isPartId(v: string): v is PartId {
  return CALLOUT_PARTS.some((id) => id === v);
}

export function partSide(id: string): LabelSide {
  return CALLOUT_PARTS.findIndex((p) => p === id) < 5 ? "right" : "left";
}
```

- [ ] **Step 4: Port `rig-parts.ts` and `rig.ts`** under the porting rules above. Start each file with v3's header comment, adapted, and one line naming its source file. Keep `rig.ts`'s `part(id, obj, explode, anchor, delay)` registration exactly as v3 has it (digest §2.3's table).

- [ ] **Step 5: Run the tests to see them pass, then the gate**

Run: `npx vitest run tests/unit/components/landing/journey/`
Expected: PASS.
Run: `npm run check`
Expected: green, with every file under 500 lines.

- [ ] **Step 6: Commit**

```bash
git add src/components/landing/journey/train-parts.ts src/components/landing/journey/scene/ tests/unit/components/landing/journey/train-parts.test.ts tests/unit/components/landing/journey/scene/rig.test.ts
git commit -m "feat(journey): the drawn train's rig, built a part at a time, in ten labelled parts"
```

---

### Task 4: The train's world, and one pose applied to it

**Files:**
- Create: `src/components/landing/journey/scene/line-world.ts`, `src/components/landing/journey/scene/world.ts`, `src/components/landing/journey/scene/apply-pose.ts`
- Test: `tests/unit/components/landing/journey/scene/world.test.ts`

**Interfaces:**
- Consumes:
  - `buildRig`, `type Rig` (Task 3);
  - `createStyle`, `type LineStyle`, `type Palette` (Task 2);
  - `type Pose`, `anatomyPose`, `terminusPose`, `STILL_ANATOMY` (Task 1).
- Produces:
  - `line-world.ts`: `buildLine(style: LineStyle, from: number, to: number, opts?: { readonly masts?: boolean; readonly grid?: boolean; readonly sleepers?: boolean }): Group`. The wire assembly is named `"wires"`.
  - `world.ts`:
    - `interface World { readonly scene: Scene; readonly camera: PerspectiveCamera; readonly rig: Rig; readonly style: LineStyle }`;
    - `LINE_FROM = -420`, `LINE_TO = 520`;
    - `buildWorld(palette: Palette, opts?: { readonly coaches?: number }): World`.
  - `apply-pose.ts`: `applyPose(world: World, camera: PerspectiveCamera, pose: Pose, opts?: { readonly coaches?: number }): void`.

Source:
- `V3/scene/line-world.js`, verbatim numbers (digest §5.2);
- `V3/scene/engine.js`'s `assemble()` (its lines 33–60): only the scene, fog, line, rig and camera. No renderer, scan, departure, beam or glow; those are J5.
- `V3/scene/apply-pose.js`, without `headGlow`, `departure` and `scan` (J4-5).

- [ ] **Step 1: Write the failing test**

`tests/unit/components/landing/journey/scene/world.test.ts`:
```ts
import { Color, Fog, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { STILL_ANATOMY, anatomyPose, terminusPose } from "@/components/landing/journey/pose";
import { applyPose } from "@/components/landing/journey/scene/apply-pose";
import { buildWorld } from "@/components/landing/journey/scene/world";

const INK = new Color(0, 0, 0);
const PALETTE = { ground: INK, ink: INK, steel: INK, steelText: INK };

describe("the drawn train's world", () => {
  const world = buildWorld(PALETTE, { coaches: 3 });

  it("stands the rig on its line under fog, with a camera to pose", () => {
    expect(world.scene.fog).toBeInstanceOf(Fog);
    expect(world.rig.group.parent).toBe(world.scene);
    expect(world.scene.getObjectByName("wires")).toBeDefined();
    expect(world.camera.near).toBe(0.5);
    expect(world.camera.far).toBe(900);
  });

  it("poses the still chapter: apart, no coaches, no wire, the camera on the target", () => {
    const pose = anatomyPose(STILL_ANATOMY, 2);
    applyPose(world, world.camera, pose);
    expect(world.rig.parts.shell.obj.position.y - world.rig.parts.shell.base.y).toBeCloseTo(0.9, 6);
    expect(world.rig.coaches.some((c) => c.obj.visible)).toBe(false);
    expect(world.scene.getObjectByName("wires")?.visible).toBe(false);
    expect(world.camera.fov).toBe(30);
    const looking = world.camera.getWorldDirection(new Vector3());
    const toTarget = new Vector3(...pose.target).sub(world.camera.position).normalize();
    expect(looking.dot(toTarget)).toBeCloseTo(1, 6);
  });

  it("poses the terminus: coupled, the wire up, the train arrived", () => {
    applyPose(world, world.camera, terminusPose(1, 2));
    expect(world.rig.coaches.every((c) => c.obj.visible)).toBe(true);
    expect(world.scene.getObjectByName("wires")?.visible).toBe(true);
    expect(world.rig.group.position.x).toBeCloseTo(0, 9);
  });
});
```

- [ ] **Step 2: Run the test to see it fail.**
Run: `npx vitest run tests/unit/components/landing/journey/scene/world.test.ts`
Expected: FAIL, because the modules do not exist.

- [ ] **Step 3: Port `line-world.ts`, and write `world.ts` and `apply-pose.ts`**

`world.ts`:
```ts
import { Fog, PerspectiveCamera, Scene } from "three";
import { buildLine } from "./line-world";
import { createStyle, type LineStyle, type Palette } from "./lines";
import { buildRig, type Rig } from "./rig";

// The drawn train's world (prototype v3's engine.js assemble, without a renderer): the rig on its line, the line
// drawn from 420 m behind to 520 m ahead, fog so the far line fades, and the camera the poses aim. The bake renders
// it (J4); the live drawing adds its renderer, the scan, the departure line side and the Night beam (J5).

export interface World {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly rig: Rig;
  readonly style: LineStyle;
}

export const LINE_FROM = -420;
export const LINE_TO = 520;

export function buildWorld(palette: Palette, { coaches = 3 }: { readonly coaches?: number } = {}): World {
  const style = createStyle(palette);
  const scene = new Scene();
  scene.fog = new Fog(palette.ground, 60, 260);
  scene.add(buildLine(style, LINE_FROM, LINE_TO));
  const rig = buildRig(style, { coaches });
  scene.add(rig.group);
  return { scene, camera: new PerspectiveCamera(30, 1, 0.5, 900), rig, style };
}
```
If v3's `assemble()` adds anything else to the scene that the bake's still would show, port it too and name it in your report.

`apply-pose.ts`:
```ts
import type { PerspectiveCamera } from "three";
import type { Pose } from "../pose";
import type { World } from "./world";

// One frame of a chapter (prototype v3's apply-pose.js), shared by the bake and the live drawing so both show the
// same train. The live drawing also sets its scan and its line side from the same pose (J5).

export function applyPose({ rig, scene }: World, camera: PerspectiveCamera, pose: Pose, { coaches = Infinity }: { readonly coaches?: number } = {}): void {
  rig.setExplode(pose.explode);
  rig.setPantograph(pose.panto);
  rig.setCoupling(pose.couple, coaches);
  rig.setDims(pose.dims);
  rig.group.position.x = pose.drive;
  camera.fov = pose.fov;
  camera.position.set(...pose.pos);
  camera.lookAt(...pose.target);
  const wires = scene.getObjectByName("wires");
  if (wires) wires.visible = pose.couple > 0.5;
}
```

- [ ] **Step 4: Run the test to see it pass, then the gate.**
Run: `npx vitest run tests/unit/components/landing/journey/scene/`
Expected: PASS.
Run: `npm run check`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/journey/scene/line-world.ts src/components/landing/journey/scene/world.ts src/components/landing/journey/scene/apply-pose.ts tests/unit/components/landing/journey/scene/world.test.ts
git commit -m "feat(journey): the drawn train's world, and one pose applied to it"
```

---

### Task 5: The bake's pure core: tracing visible edges, and writing the files

**Files:**
- Create: `scripts/bake/trace.ts`, `scripts/bake/emit.mjs`
- Test: `tests/unit/scripts/bake-trace.test.ts`, `tests/unit/scripts/bake-emit.test.ts`

**Interfaces:**
- Consumes: nothing. Both files stay free of three.js and the DOM, so they can be unit-tested.
- Produces:
  - `trace.ts`:
    ```ts
    export type IdAt = (x: number, y: number) => number;
    export type Quad = readonly [number, number, number, number];
    export interface ScreenSeg { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }
    export interface Run { readonly i: number; readonly xy: Quad }
    export interface Box { readonly l: number; readonly t: number; readonly r: number; readonly b: number }
    export type LineClass = "line" | "faint" | "near";
    export interface EdgeMeta { readonly part: string; readonly cls: LineClass }
    export function idReader(px: Uint8Array, W: number, H: number): IdAt;
    export function idColour(i: number): readonly [number, number, number];
    export function walkRuns(idAt: IdAt, seg: ScreenSeg, i: number, minRun?: number): Run[];
    export function cropBox(runs: readonly Run[], isTrain: (i: number) => boolean, margin: number, W: number, H: number): Box | null;
    export const f1: (v: number) => number;
    export function chainPath(list: readonly Quad[]): string;
    export function pathsByPart(runs: readonly Run[], meta: readonly EdgeMeta[], box: Box): Record<string, string>;
    ```
  - `emit.mjs`:
    - `SHAPES`: `{ anatomyWide: { kind: "anatomy", W: 1800, H: 900, file: "anatomy-wide" }, anatomyTall: { kind: "anatomy", W: 900, H: 1200, file: "anatomy-tall" }, terminusWide: { kind: "terminus", W: 2100, H: 660, file: "terminus-wide" }, terminusTall: { kind: "terminus", W: 1100, H: 900, file: "terminus-tall" } }`;
    - `BAKE_SOURCES: string[]`;
    - `sourceHash(root, files = BAKE_SOURCES): string` (16 hex);
    - `contentHash(text): string` (10 hex);
    - `partsOf(paths): string[]`;
    - `shapeSvg(paths): string`;
    - `manifestSource({ sourceHash, shapes }): string`.

Source: `V3/bake-entry.js` lines 841–967 (digest §6.2, steps 5–8), ported as free functions, so they are tested on synthetic images.

- [ ] **Step 1: Write the failing tests**

`tests/unit/scripts/bake-trace.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { chainPath, cropBox, idColour, idReader, pathsByPart, walkRuns, type IdAt, type Run } from "../../../scripts/bake/trace";

/** A synthetic ID image: `paint(x, y)` says which edge id (0 = none) each pixel holds. */
function image(W: number, H: number, paint: (x: number, y: number) => number): IdAt {
  return (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : paint(x, y));
}

describe("reading the ID image", () => {
  it("decodes a 24-bit id from RGBA, reading render targets bottom-up", () => {
    const W = 2;
    const H = 2;
    const px = new Uint8Array(W * H * 4);
    // id 70000 = 0x011170 at image (1, 0), which a render target keeps in its last row
    px.set([0x70, 0x11, 0x01, 255], ((H - 1) * W + 1) * 4);
    expect(idReader(px, W, H)(1, 0)).toBe(70000);
    expect(idReader(px, W, H)(1, 1)).toBe(0);
    expect(idReader(px, W, H)(5, 0)).toBe(0);
  });

  it("colours edge i with id i + 1", () => {
    expect(idColour(0)).toEqual([1 / 255, 0, 0]);
    expect(idColour(256)).toEqual([1 / 255, 1 / 255, 0]);
  });
});

describe("walking an edge across the image", () => {
  const seg = { x0: 0, y0: 2, x1: 19, y1: 2 };

  it("keeps the stretches where the edge's own colour survived, split where another surface hides it", () => {
    // edge 0 (id 1) drawn at x 2..14 on row 2; a nearer surface's edge (id 2) covers x 7..11
    const idAt = image(20, 5, (x, y) => (y === 2 && x >= 2 && x <= 14 ? (x >= 7 && x <= 11 ? 2 : 1) : 0));
    expect(walkRuns(idAt, seg, 0).map((r) => r.xy)).toEqual([
      [1, 2, 7, 2],
      [11, 2, 15, 2],
    ]);
  });

  it("bridges a gap of two samples", () => {
    const idAt = image(20, 5, (x, y) => (y === 2 && x >= 2 && x <= 14 && x !== 8 && x !== 9 ? 1 : 0));
    expect(walkRuns(idAt, seg, 0)).toHaveLength(1);
  });

  it("drops stretches shorter than the least run", () => {
    const idAt = image(20, 5, (x, y) => (y === 2 && x === 5 ? 1 : 0));
    expect(walkRuns(idAt, seg, 0, 1.5)).toHaveLength(1);
    expect(walkRuns(idAt, seg, 0, 3)).toHaveLength(0);
  });

  it("ignores an edge that is a point on screen", () => {
    expect(walkRuns(image(4, 4, () => 1), { x0: 1, y0: 1, x1: 1, y1: 1 }, 0)).toEqual([]);
  });
});

describe("cropping and writing paths", () => {
  const runs: Run[] = [
    { i: 0, xy: [100, 50, 200, 50] },
    { i: 1, xy: [150, 150, 150, 250] },
    { i: 2, xy: [0, 400, 1000, 400] },
  ];
  const meta = [
    { part: "shell", cls: "line" },
    { part: "roof", cls: "faint" },
    { part: "world", cls: "line" },
  ] as const;

  it("crops to the train, not the line side, with a margin, inside the image", () => {
    const box = cropBox(runs, (i) => meta[i].part !== "world", 0.1, 1800, 900);
    expect(box).toEqual({ l: 90, t: 30, r: 210, b: 270 });
    expect(cropBox([], () => true, 0.1, 10, 10)).toBeNull();
  });

  it("chains stretches that meet end to start into one polyline", () => {
    expect(chainPath([[0, 0, 10, 0], [10, 0, 10, 5]])).toBe("M0 0l10 0l0 5");
    expect(chainPath([[0, 0, 3, -2]])).toBe("M0 0l3-2");
    expect(chainPath([[0.04, 0, 1.26, 0], [9, 9, 9, 10]])).toBe("M0 0l1.3 0M9 9l0 1");
  });

  it("groups each part's stretches inside the crop, crop-relative", () => {
    const box = { l: 90, t: 30, r: 210, b: 270 };
    expect(pathsByPart(runs, meta, box)).toEqual({ "shell|line": "M10 20l100 0", "roof|faint": "M60 120l0 100" });
  });
});
```

`tests/unit/scripts/bake-emit.test.ts`:
```ts
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SHAPES, contentHash, manifestSource, partsOf, shapeSvg, sourceHash } from "../../../scripts/bake/emit.mjs";

const PATHS = { "shell|line": "M0 0l1 0", "shell|faint": "M2 2l0 1", "coach|line": "M5 5l1 1", "world|near": "M9 9l1 0" };

describe("writing a baked shape", () => {
  it("names the four shapes with their sizes", () => {
    expect(Object.keys(SHAPES)).toEqual(["anatomyWide", "anatomyTall", "terminusWide", "terminusTall"]);
    expect(SHAPES.anatomyWide).toEqual({ kind: "anatomy", W: 1800, H: 900, file: "anatomy-wide" });
    expect(SHAPES.terminusTall).toEqual({ kind: "terminus", W: 1100, H: 900, file: "terminus-tall" });
  });

  it("gathers each part's paths into one group, in a stable order", () => {
    expect(partsOf(PATHS)).toEqual(["coach", "shell", "world"]);
  });

  it("draws in currentColor, each weight a variable the page can set, with no script or link", () => {
    const svg = shapeSvg(PATHS);
    expect(svg).toContain('<g id="shell" fill="none" stroke="currentColor"');
    expect(svg).toContain('<path d="M0 0l1 0" vector-effect="non-scaling-stroke" style="stroke-opacity:var(--still-line,.8)"/>');
    expect(svg).toContain("stroke-opacity:var(--still-faint,.14)");
    expect(svg).toContain("stroke-opacity:var(--still-near,.42)");
    expect(svg).not.toMatch(/<script|href=|\son\w+=/);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"><defs>')).toBe(true);
  });

  it("hashes content into a short, stable name", () => {
    expect(contentHash("a")).toMatch(/^[0-9a-f]{10}$/);
    expect(contentHash("a")).toBe(contentHash("a"));
    expect(contentHash("a")).not.toBe(contentHash("b"));
  });

  it("hashes the scene sources, so a changed source asks for a new bake", () => {
    const root = mkdtempSync(join(tmpdir(), "bake-"));
    writeFileSync(join(root, "a.ts"), "one");
    writeFileSync(join(root, "b.ts"), "two");
    const before = sourceHash(root, ["a.ts", "b.ts"]);
    expect(before).toMatch(/^[0-9a-f]{16}$/);
    writeFileSync(join(root, "b.ts"), "two\r\n");
    const crlf = sourceHash(root, ["a.ts", "b.ts"]);
    writeFileSync(join(root, "b.ts"), "two\n");
    expect(sourceHash(root, ["a.ts", "b.ts"])).toBe(crlf); // line endings never ask for a re-bake
    writeFileSync(join(root, "b.ts"), "three");
    expect(sourceHash(root, ["a.ts", "b.ts"])).not.toBe(before);
  });

  it("writes still-manifest.ts as typed, generated data", () => {
    const text = manifestSource({ sourceHash: "abc", shapes: { anatomyWide: { href: "/journey/anatomy-wide.0123456789.svg", viewBox: [0, 0, 10, 5], parts: ["shell"], anchors: { shell: [1, 2] } } } });
    expect(text).toContain("Generated by scripts/bake-train-stills.mjs");
    expect(text).toContain('import type { StillManifest } from "./still-shapes";');
    expect(text).toContain("as const satisfies StillManifest;");
    expect(text).toContain('"href": "/journey/anatomy-wide.0123456789.svg"');
  });
});
```

- [ ] **Step 2: Run the tests to see them fail.**
Run: `npx vitest run tests/unit/scripts/bake-trace.test.ts tests/unit/scripts/bake-emit.test.ts`
Expected: FAIL, because the modules do not exist.

- [ ] **Step 3: Write `scripts/bake/trace.ts`**

```ts
// The bake's pure core (prototype v3's bake-entry.js): the GPU has drawn every edge in its own colour, depth-tested
// against the fills. Walk each edge across that image and keep the stretches where its own colour survived, crop to
// the train, and chain the stretches into SVG path data. No three.js and no DOM, so it is unit-tested on synthetic
// images; scripts/bake/page.ts runs it in the browser.

export type IdAt = (x: number, y: number) => number;
export type Quad = readonly [number, number, number, number];

/** One edge on the image, in pixels (y down). */
export interface ScreenSeg {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** A visible stretch of edge `i`, [x0, y0, x1, y1]. */
export interface Run {
  readonly i: number;
  readonly xy: Quad;
}

export interface Box {
  readonly l: number;
  readonly t: number;
  readonly r: number;
  readonly b: number;
}

export type LineClass = "line" | "faint" | "near";

export interface EdgeMeta {
  readonly part: string;
  readonly cls: LineClass;
}

/** The id an RGBA readback holds at (x, y); render targets are bottom-up. */
export function idReader(px: Uint8Array, W: number, H: number): IdAt {
  return (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return 0;
    const k = ((H - 1 - y) * W + x) * 4;
    return px[k] | (px[k + 1] << 8) | (px[k + 2] << 16);
  };
}

/** Edge i's colour (id i + 1, 24 bits) as 0..1 channels. */
export function idColour(i: number): readonly [number, number, number] {
  const id = i + 1;
  return [(id & 255) / 255, ((id >> 8) & 255) / 255, ((id >> 16) & 255) / 255];
}

/**
 * The stretches of edge i whose own colour survived. It samples once per pixel along the edge's longer screen
 * axis, looks one pixel either side, bridges up to two missed samples, and drops stretches shorter than minRun.
 */
export function walkRuns(idAt: IdAt, seg: ScreenSeg, i: number, minRun = 1.5): Run[] {
  const { x0, y0, x1, y1 } = seg;
  const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
  if (n < 1) return [];
  const id = i + 1;
  const at = (k: number): readonly [number, number] => [x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n];
  const runs: Run[] = [];
  let start = -1;
  let last = -1;
  let gap = 0;
  const flush = () => {
    if (start >= 0 && last - start >= minRun) runs.push({ i, xy: [...at(start), ...at(last)] });
    start = -1;
  };
  for (let k = 0; k <= n; k++) {
    const [x, y] = at(k);
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    let hit = false;
    for (let dy = -1; dy <= 1 && !hit; dy++) for (let dx = -1; dx <= 1 && !hit; dx++) hit = idAt(cx + dx, cy + dy) === id;
    if (hit) {
      if (start < 0) start = k;
      last = k;
      gap = 0;
    } else if (start >= 0 && ++gap > 2) flush();
  }
  flush();
  return runs;
}
```
Then port `cropBox` (v3's crop, with `isTrain` in place of `meta[run.i].part !== "world"`, returning `null` when no train stretch exists), `f1`, `chainPath` (v3's `byStart` and `used` greedy chain and its two cleanup regexes, verbatim), and `pathsByPart`. `pathsByPart` keeps a run when either end is inside the box, subtracts `box.l` and `box.t`, groups the runs by `` `${part}|${cls}` ``, and chains each group with `chainPath`.

- [ ] **Step 4: Write `scripts/bake/emit.mjs`**

```js
// The bake's writing half (spec §3.D): each baked shape as its own SVG file (J4-2), one <g id> per part, strokes in
// currentColor and each ink weight a CSS variable the page sets (J4-3); the file's content hash for its name; the
// scene sources' hash, so a changed source asks for a new bake; and still-manifest.ts. Pure; the bake script does
// the writing.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const SHAPES = {
  anatomyWide: { kind: "anatomy", W: 1800, H: 900, file: "anatomy-wide" },
  anatomyTall: { kind: "anatomy", W: 900, H: 1200, file: "anatomy-tall" },
  terminusWide: { kind: "terminus", W: 2100, H: 660, file: "terminus-wide" },
  terminusTall: { kind: "terminus", W: 1100, H: 900, file: "terminus-tall" },
};

/** What a still is drawn from. Change one and the stills must be baked again (tests/unit/scripts/bake-stills.test.ts). */
export const BAKE_SOURCES = [
  "src/components/landing/journey/pose.ts",
  "src/components/landing/journey/train-parts.ts",
  "src/components/landing/journey/scene/math.ts",
  "src/components/landing/journey/scene/util.ts",
  "src/components/landing/journey/scene/lines.ts",
  "src/components/landing/journey/scene/rig-parts.ts",
  "src/components/landing/journey/scene/rig.ts",
  "src/components/landing/journey/scene/line-world.ts",
  "src/components/landing/journey/scene/world.ts",
  "src/components/landing/journey/scene/apply-pose.ts",
  "scripts/bake/trace.ts",
  "scripts/bake/page.ts",
  "scripts/bake/emit.mjs",
];

/** @param {string} root @param {readonly string[]} [files] */
export function sourceHash(root, files = BAKE_SOURCES) {
  const hash = createHash("sha256");
  for (const file of files) hash.update(`${file}\0${readFileSync(join(root, file), "utf8").replace(/\r\n/g, "\n")}\0`);
  return hash.digest("hex").slice(0, 16);
}

/** @param {string} text */
export function contentHash(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 10);
}

/** @param {Record<string, string>} paths keyed "part|class" */
export function partsOf(paths) {
  return [...new Set(Object.keys(paths).map((key) => key.split("|")[0]))].sort();
}

const WEIGHT = { line: "var(--still-line,.8)", faint: "var(--still-faint,.14)", near: "var(--still-near,.42)" };

/** @param {Record<string, string>} paths keyed "part|class" */
export function shapeSvg(paths) {
  const groups = partsOf(paths).map((part) => {
    const body = Object.keys(paths)
      .filter((key) => key.split("|")[0] === part)
      .sort()
      .map((key) => `<path d="${paths[key]}" vector-effect="non-scaling-stroke" style="stroke-opacity:${WEIGHT[key.split("|")[1]]}"/>`)
      .join("");
    return `<g id="${part}" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">${body}</g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg"><defs>${groups.join("")}</defs></svg>\n`;
}

/** @param {{ sourceHash: string, shapes: Record<string, unknown> }} manifest */
export function manifestSource(manifest) {
  return `// Generated by scripts/bake-train-stills.mjs from the scene sources it hashed. Do not edit: run npm run bake:stills.
import type { StillManifest } from "./still-shapes";

export const STILL_MANIFEST = ${JSON.stringify(manifest, null, 2)} as const satisfies StillManifest;
`;
}
```
If the type test for `.mjs` imports needs JSDoc types for `SHAPES`, add them with `/** @type {…} */`.

- [ ] **Step 5: Run the tests to see them pass, then the gate.**
Run: `npx vitest run tests/unit/scripts/bake-trace.test.ts tests/unit/scripts/bake-emit.test.ts`
Expected: PASS.
Run: `npm run check`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add scripts/bake/trace.ts scripts/bake/emit.mjs tests/unit/scripts/bake-trace.test.ts tests/unit/scripts/bake-emit.test.ts
git commit -m "feat(journey): the bake's core, tracing which stretches of each edge are seen, and its files"
```

---

### Task 6: The bake: the stills drawn from the real rig, one file per shape

**Files:**
- Modify: `package.json` (the `esbuild` devDependency, and a `bake:stills` script), `package-lock.json`
- Create: `scripts/bake/page.ts`, `scripts/bake-train-stills.mjs`, `src/components/landing/journey/still-shapes.ts`
- Generated and committed: `public/journey/anatomy-wide.<hash>.svg`, `anatomy-tall.<hash>.svg`, `terminus-wide.<hash>.svg`, `terminus-tall.<hash>.svg`, and `src/components/landing/journey/still-manifest.ts`
- Modify: `next.config.ts` (`/journey/*` immutable), `tests/unit/next-config.test.ts`
- Test: `tests/unit/scripts/bake-stills.test.ts`

**Interfaces:**
- Consumes:
  - `buildWorld` (Task 4) and `applyPose` (Task 4);
  - `STILL_ANATOMY`, `anatomyPose` and `terminusPose` (Task 1);
  - `FILL_OFFSET` (Task 2);
  - `CALLOUT_PARTS` (Task 3);
  - every export of `trace.ts` and `emit.mjs` (Task 5).
- Produces:
  - `still-shapes.ts`:
    ```ts
    export type StillKind = "anatomy" | "terminus";
    export type StillShapeName = "anatomyWide" | "anatomyTall" | "terminusWide" | "terminusTall";
    export interface StillShape { readonly href: string; readonly viewBox: readonly [number, number, number, number]; readonly parts: readonly string[]; readonly anchors: Readonly<Partial<Record<PartId, readonly [number, number]>>> }
    export interface StillManifest { readonly sourceHash: string; readonly shapes: Readonly<Record<StillShapeName, StillShape>> }
    export const WIDE_QUERY = "(min-width: 48rem)";
    export function shapeFor(kind: StillKind, wide: boolean): StillShapeName;
    ```
  - `STILL_MANIFEST` in `still-manifest.ts` (generated);
  - `npm run bake:stills`.

Source: `V3/bake-entry.js` lines 755–840 and 896–967 for the passes and anchors, and `train-proto/bake.mjs` for the driver (digest §6).

- [ ] **Step 1: Add esbuild and the script**

```bash
npm install --save-exact --save-dev esbuild@0.28.2
```
Add `"bake:stills": "node scripts/bake-train-stills.mjs"` to `package.json`'s scripts, after `"screenshots"`.

- [ ] **Step 2: Write `still-shapes.ts`**

```ts
import type { PartId } from "./train-parts";

// The baked still drawings' shape (spec §3.D; J4-2): four shapes, each one SVG file of <g id> per part, named by its
// content hash. still-manifest.ts, which the bake writes, fills these types in.

export type StillKind = "anatomy" | "terminus";
export type StillShapeName = "anatomyWide" | "anatomyTall" | "terminusWide" | "terminusTall";

export interface StillShape {
  readonly href: string;
  readonly viewBox: readonly [number, number, number, number];
  /** The file's groups, one per part: the ten labelled ones, "coach" and "world". */
  readonly parts: readonly string[];
  /** Where each labelled part's leader ends, in the shape's viewBox units (the anatomy shapes only). */
  readonly anchors: Readonly<Partial<Record<PartId, readonly [number, number]>>>;
}

export interface StillManifest {
  readonly sourceHash: string;
  readonly shapes: Readonly<Record<StillShapeName, StillShape>>;
}

/** The wide drawing from 48rem up; the tall one on narrower screens. */
export const WIDE_QUERY = "(min-width: 48rem)";

export function shapeFor(kind: StillKind, wide: boolean): StillShapeName {
  if (kind === "anatomy") return wide ? "anatomyWide" : "anatomyTall";
  return wide ? "terminusWide" : "terminusTall";
}
```

- [ ] **Step 3: Write the failing tests**

`tests/unit/scripts/bake-stills.test.ts`:
```ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { STILL_MANIFEST } from "@/components/landing/journey/still-manifest";
import { shapeFor, type StillShape } from "@/components/landing/journey/still-shapes";
import { CALLOUT_PARTS } from "@/components/landing/journey/train-parts";
import { contentHash, sourceHash } from "../../../scripts/bake/emit.mjs";

const ROOT = join(__dirname, "../../..");
const file = (shape: StillShape) => readFileSync(join(ROOT, "public", shape.href), "utf8");
const gz = (shape: StillShape) => gzipSync(file(shape)).length;
const shapes = Object.values(STILL_MANIFEST.shapes);

describe("the baked stills (spec §3.D)", () => {
  it("were baked from today's scene sources", () => {
    expect(STILL_MANIFEST.sourceHash, "a scene source changed: run npm run bake:stills and commit what it writes").toBe(sourceHash(ROOT));
  });

  it("are four files in public/journey, each named by its own content", () => {
    expect(readdirSync(join(ROOT, "public/journey")).sort()).toEqual(shapes.map((s) => s.href.replace("/journey/", "")).sort());
    for (const shape of shapes) {
      expect(existsSync(join(ROOT, "public", shape.href))).toBe(true);
      expect(shape.href).toContain(`.${contentHash(file(shape))}.svg`);
    }
  });

  it("hold one group per part the manifest lists, and the anatomy shapes hold all ten", () => {
    for (const shape of shapes) for (const part of shape.parts) expect(file(shape)).toContain(`<g id="${part}"`);
    for (const wide of [true, false]) expect(STILL_MANIFEST.shapes[shapeFor("anatomy", wide)].parts).toEqual(expect.arrayContaining([...CALLOUT_PARTS]));
  });

  it("anchor every label inside the anatomy drawings, and none on the terminus", () => {
    for (const wide of [true, false]) {
      const shape = STILL_MANIFEST.shapes[shapeFor("anatomy", wide)];
      const [, , w, h] = shape.viewBox;
      for (const id of CALLOUT_PARTS) {
        const at = shape.anchors[id];
        expect(at, id).toBeDefined();
        expect(at?.[0]).toBeGreaterThanOrEqual(0);
        expect(at?.[0]).toBeLessThanOrEqual(w);
        expect(at?.[1]).toBeGreaterThanOrEqual(0);
        expect(at?.[1]).toBeLessThanOrEqual(h);
      }
      expect(STILL_MANIFEST.shapes[shapeFor("terminus", wide)].anchors).toEqual({});
    }
  });

  it("stay within 60 KB compressed for any page, which shows one anatomy and one terminus shape (§3.H)", () => {
    for (const anatomy of [true, false]) for (const terminus of [true, false]) {
      const bytes = gz(STILL_MANIFEST.shapes[shapeFor("anatomy", anatomy)]) + gz(STILL_MANIFEST.shapes[shapeFor("terminus", terminus)]);
      expect(bytes).toBeLessThanOrEqual(60 * 1024);
    }
  });

  it("carry no script, link or handler (§3.I)", () => {
    for (const shape of shapes) expect(file(shape)).not.toMatch(/<script|href=|\son\w+=|<foreignObject/i);
  });
});
```

In `tests/unit/next-config.test.ts`, add a test in the file's existing style: the headers that `next.config` returns for `/journey/anatomy-wide.0123456789.svg` include `Cache-Control: public, max-age=31536000, immutable`, and those for `/` do not. Use `unstable_getResponseFromNextConfig` if it reports headers; otherwise read `(await nextConfig.headers())` and find the `/journey/:path*` rule.

- [ ] **Step 4: Run the tests to see them fail.**
Run: `npx vitest run tests/unit/scripts/bake-stills.test.ts tests/unit/next-config.test.ts`
Expected: FAIL, because `still-manifest.ts` does not exist and the header is missing.

- [ ] **Step 5: Write `scripts/bake/page.ts`**, a typed port of `V3/bake-entry.js`'s `window.bake`, with these changes:
- It builds `buildWorld(BLACK_PALETTE, { coaches })`. `BLACK_PALETTE` has every colour `new Color(0, 0, 0)`: the ID passes never read colour.
- It creates its own `new WebGLRenderer({ canvas, antialias: false, alpha: true })`, because an antialiased image would blend neighbouring IDs.
- The depth-only material uses `FILL_OFFSET.factor` and `FILL_OFFSET.units`.
- The class map is `new Map<LineBasicMaterial, LineClass>([[style.line, "line"], [style.faint, "faint"], [style.near, "near"], [style.accent, "line"]])`.
- Owners are the ten parts and the tanks by their id, every coach as `"coach"`, and everything else as `"world"`.
- The walk, crop and chain call `trace.ts` (`idReader`, `idColour`, `walkRuns`, `cropBox`, `pathsByPart`, `f1`).
- Anchors come from `rig.anchor(id)` for each id in `CALLOUT_PARTS`, projected through the camera and made crop-relative. They exist for `kind === "anatomy"` only.
- On return it disposes the renderer, the render target, the ID geometry and the ID material.

```ts
declare global {
  interface Window {
    bake?: (config: BakeConfig) => BakeResult;
  }
}

export interface BakeConfig {
  readonly kind: "anatomy" | "terminus";
  readonly W: number;
  readonly H: number;
  readonly coaches?: number;
  readonly minRun?: number;
  readonly margin?: number;
}

export interface BakeResult {
  readonly viewBox: readonly [number, number, number, number];
  readonly paths: Record<string, string>;
  readonly anchors: Record<string, readonly [number, number]>;
  readonly segments: number;
  readonly runs: number;
}
```
Keep v3's near-plane clip (`NEAR = 0.05`) and its perspective divide by hand, exactly as `V3/bake-entry.js:848-870` does. It turns each 3D segment into a `ScreenSeg` for `walkRuns`. End the file with `export {};` if TypeScript needs it to treat the `declare global` as a module augmentation.

- [ ] **Step 6: Write `scripts/bake-train-stills.mjs`**

```js
// Bakes the drawn train's still drawings (spec §3.D). It bundles scripts/bake/page.ts with esbuild, runs it in
// headless Chromium with the GPU, and writes one SVG per shape to public/journey/ (named by content) and
// src/components/landing/journey/still-manifest.ts. Run it after changing any scene source (BAKE_SOURCES):
//   npm run bake:stills
// It runs on a developer's machine; CI only checks that the manifest matches today's sources (J4-10).
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { SHAPES, contentHash, manifestSource, partsOf, shapeSvg, sourceHash } from "./bake/emit.mjs";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "public/journey");
const MANIFEST = join(ROOT, "src/components/landing/journey/still-manifest.ts");
// Real GPU rendering, so the depth test behaves as a reader's browser does.
const GPU = process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];

const bundle = await build({
  entryPoints: [join(ROOT, "scripts/bake/page.ts")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  write: false,
  tsconfig: join(ROOT, "tsconfig.json"),
  logLevel: "warning",
});
const html = `<!doctype html><html><body><script type="module">${bundle.outputFiles[0].text}</script></body></html>`;

const browser = await chromium.launch({ args: GPU });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("http://bake.local/", (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
  await page.goto("http://bake.local/");
  await page.waitForFunction(() => typeof window.bake === "function", null, { timeout: 30_000 });
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const shapes = {};
  for (const [name, shape] of Object.entries(SHAPES)) {
    const t0 = Date.now();
    const result = await page.evaluate((config) => window.bake(config), { kind: shape.kind, W: shape.W, H: shape.H });
    const svg = shapeSvg(result.paths);
    const file = `${shape.file}.${contentHash(svg)}.svg`;
    writeFileSync(join(OUT, file), svg);
    shapes[name] = { href: `/journey/${file}`, viewBox: result.viewBox, parts: partsOf(result.paths), anchors: result.anchors };
    console.log(`${name}: ${result.segments} edges, ${result.runs} visible stretches, ${(svg.length / 1024).toFixed(0)} KB, ${(gzipSync(svg).length / 1024).toFixed(1)} KB gzip (${Date.now() - t0} ms)`);
  }
  if (errors.length) throw new Error(`the bake page failed: ${errors.join("; ")}`);
  writeFileSync(MANIFEST, manifestSource({ sourceHash: sourceHash(ROOT), shapes }));
} finally {
  await browser.close();
}
```

- [ ] **Step 7: Add the immutable header** in `next.config.ts`'s `headers()`, as the first rule:

```ts
      // The baked still drawings (spec §3.D): content-named, so they never change under their name.
      { source: "/journey/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
```

- [ ] **Step 8: Bake**

Run: `npm run bake:stills`
Expected: four lines, one per shape. v3 measured 68, 68, 98 and 48 KB of path data. Then it writes `public/journey/*.svg` and `still-manifest.ts`.
Open `public/journey/anatomy-wide.*.svg` in the Playwright Chromium, or inline it in a scratch HTML page under the scratchpad with `color: black`, and screenshot it. The locomotive must be drawn apart into its parts, with hidden lines gone. Compare it with `train-proto/build/index.html`'s drawing chapter drawn still (the prototype panel's Motion off). Save both screenshots to the task's report.

- [ ] **Step 9: Run the tests to see them pass**

Run: `npx vitest run tests/unit/scripts/ tests/unit/next-config.test.ts`
Expected: PASS.

If the 60 KB budget fails, shrink the path data in this order, re-baking after each and reporting the sizes:
1. `minRun` 2;
2. rounding in `f1` to the nearest 0.5 px, which needs `chainPath`'s tests updated in the same step;
3. `margin` 0.02.

Stop and report if all three still miss the budget.

- [ ] **Step 10: The gate, and a check that three.js stayed out of the app**

Run: `npm run check`
Expected: green.
Run: `grep -l "WebGLRenderer\|RoundedBoxGeometry" .next/static/chunks/*.js .next/static/chunks/**/*.js 2>/dev/null | wc -l`
Expected: `0`. Nothing in the app imports the scene yet.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json scripts/bake/page.ts scripts/bake-train-stills.mjs src/components/landing/journey/still-shapes.ts src/components/landing/journey/still-manifest.ts public/journey next.config.ts tests/unit/next-config.test.ts tests/unit/scripts/bake-stills.test.ts
git commit -m "feat(journey): bake the drawn train's stills from the real rig, one file per shape"
```

---

### Task 7: The head script decides Data Saver and the drawing before first paint

**Files:**
- Modify: `src/components/motion/motion-boot.ts`
- Test: `tests/unit/components/motion/motion-boot.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces, in `motion-boot.ts`:
  - `QUALITY_STORAGE_KEY = "tt.q"` and `REDUCED_DATA_QUERY = "(prefers-reduced-data: reduce)"`;
  - `SLOW_CONNECTIONS = ["slow-2g", "2g", "3g"] as const`;
  - `type SaverState = "on" | "off"` and `type DrawingState = "live" | "still"`;
  - `interface ConnectionHint { readonly saveData?: boolean; readonly effectiveType?: string }`;
  - `resolveSaver(connection: ConnectionHint | null | undefined, reducedData: boolean): SaverState`;
  - `resolveDrawing(motion: MotionState, saver: SaverState, quality: string | null): DrawingState`;
  - `MOTION_BOOT_SCRIPT` also writes `data-saver` and `data-drawing`.

Spec §3.B and §3.C; J1's plan named this hand-off. v3's local `tt.saver` override was a prototype tool and is not shipped.

- [ ] **Step 1: Write the failing tests.** Rewrite `tests/unit/components/motion/motion-boot.test.ts` so that its stand-in page also has `navigator`, `sessionStorage` and the reduced-data query, and `boot()` returns everything the script wrote. Keep the existing cases, now reading `.get("data-motion")`.

```ts
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  MOTION_BOOT_SCRIPT,
  MOTION_STORAGE_KEY,
  QUALITY_STORAGE_KEY,
  REDUCED_DATA_QUERY,
  REDUCED_MOTION_QUERY,
  resolveDrawing,
  resolveMotion,
  resolveSaver,
  type ConnectionHint,
} from "@/components/motion/motion-boot";

// The script runs in <head> before any module, so it cannot import the resolvers: it restates them. These tests
// run the real string against a stand-in page and hold the two to the same answers.

interface StandIn {
  readonly stored: string | null;
  readonly reduced: boolean;
  readonly storageThrows?: boolean;
  readonly noMatchMedia?: boolean;
  readonly connection?: ConnectionHint;
  readonly reducedData?: boolean;
  readonly quality?: string | null;
  readonly sessionThrows?: boolean;
}

/** Runs MOTION_BOOT_SCRIPT against a stand-in page and returns what it wrote on <html>. */
function boot({ stored, reduced, storageThrows = false, noMatchMedia = false, connection, reducedData = false, quality = null, sessionThrows = false }: StandIn): ReadonlyMap<string, string> {
  const written = new Map<string, string>();
  runInNewContext(MOTION_BOOT_SCRIPT, {
    localStorage: {
      getItem: (key: string) => {
        if (storageThrows) throw new Error("SecurityError: site data is blocked");
        return key === MOTION_STORAGE_KEY ? stored : null;
      },
    },
    sessionStorage: {
      getItem: (key: string) => {
        if (sessionThrows) throw new Error("SecurityError: site data is blocked");
        return key === QUALITY_STORAGE_KEY ? quality : null;
      },
    },
    navigator: connection ? { connection } : {},
    window: noMatchMedia ? {} : { matchMedia: (query: string) => ({ matches: (query === REDUCED_MOTION_QUERY && reduced) || (query === REDUCED_DATA_QUERY && reducedData) }) },
    document: { documentElement: { setAttribute: (name: string, value: string) => written.set(name, value) } },
  });
  return written;
}
```
Keep the existing `CASES`, `resolveMotion` tests and the storage-throws and no-matchMedia tests, reading `boot(…).get("data-motion")`. Add these:
```ts
const SAVER = [
  [undefined, false, "off"],
  [{ saveData: true }, false, "on"],
  [{ effectiveType: "slow-2g" }, false, "on"],
  [{ effectiveType: "2g" }, false, "on"],
  [{ effectiveType: "3g" }, false, "on"],
  [{ effectiveType: "4g" }, false, "off"],
  [{ saveData: false, effectiveType: "4g" }, true, "on"],
] as const;

describe("resolveSaver", () => {
  it.each(SAVER)("connection %o, reduced data %s: %s", (connection, reducedData, expected) => {
    expect(resolveSaver(connection, reducedData)).toBe(expected);
  });
});

describe("resolveDrawing", () => {
  it("draws live unless Motion is off, Data Saver is on, or this session fell to the floor", () => {
    expect(resolveDrawing("on", "off", null)).toBe("live");
    expect(resolveDrawing("off", "off", null)).toBe("still");
    expect(resolveDrawing("on", "on", null)).toBe("still");
    expect(resolveDrawing("on", "off", "still")).toBe("still");
    expect(resolveDrawing("on", "off", "2")).toBe("live");
  });
});

describe("MOTION_BOOT_SCRIPT's saver and drawing", () => {
  it.each(SAVER)("writes what resolveSaver decides: connection %o, reduced data %s", (connection, reducedData, expected) => {
    expect(boot({ stored: null, reduced: false, connection, reducedData }).get("data-saver")).toBe(expected);
  });

  it("writes what resolveDrawing decides", () => {
    expect(boot({ stored: null, reduced: false }).get("data-drawing")).toBe("live");
    expect(boot({ stored: "off", reduced: false }).get("data-drawing")).toBe("still");
    expect(boot({ stored: null, reduced: true }).get("data-drawing")).toBe("still");
    expect(boot({ stored: null, reduced: false, connection: { saveData: true } }).get("data-drawing")).toBe("still");
    expect(boot({ stored: null, reduced: false, quality: "still" }).get("data-drawing")).toBe("still");
  });

  it("still decides when session storage throws, or the page has no Network Information", () => {
    expect(boot({ stored: null, reduced: false, sessionThrows: true }).get("data-drawing")).toBe("live");
    expect(boot({ stored: null, reduced: false }).get("data-saver")).toBe("off");
  });
});
```

- [ ] **Step 2: Run the test to see it fail.**
Run: `npx vitest run tests/unit/components/motion/motion-boot.test.ts`
Expected: FAIL, because the new exports do not exist.

- [ ] **Step 3: Implement.** Add the constants, types and resolvers above to `motion-boot.ts`. Add one line to its header comment: "It also decides Data Saver (`data-saver`) and whether the landing's drawing is live or still (`data-drawing`, spec §3.C)." Then replace the script:

```ts
/** Inline in the site's <head>. Restates the resolvers, since it runs before any module; every read may throw. */
export const MOTION_BOOT_SCRIPT = `(function(){var r=document.documentElement,m="on",s="off",q=null;try{if(localStorage.getItem("${MOTION_STORAGE_KEY}")==="off")m="off"}catch(e){}try{if(window.matchMedia("${REDUCED_MOTION_QUERY}").matches)m="off"}catch(e){}try{var c=navigator.connection;if(c&&(c.saveData||${JSON.stringify(SLOW_CONNECTIONS)}.indexOf(c.effectiveType)>=0))s="on"}catch(e){}try{if(window.matchMedia("${REDUCED_DATA_QUERY}").matches)s="on"}catch(e){}try{q=sessionStorage.getItem("${QUALITY_STORAGE_KEY}")}catch(e){}r.setAttribute("data-motion",m);r.setAttribute("data-saver",s);r.setAttribute("data-drawing",m==="off"||s==="on"||q==="still"?"still":"live")})();`;
```
```ts
export function resolveSaver(connection: ConnectionHint | null | undefined, reducedData: boolean): SaverState {
  if (reducedData || connection?.saveData) return "on";
  return SLOW_CONNECTIONS.some((type) => type === connection?.effectiveType) ? "on" : "off";
}

export function resolveDrawing(motion: MotionState, saver: SaverState, quality: string | null): DrawingState {
  return motion === "off" || saver === "on" || quality === "still" ? "still" : "live";
}
```

- [ ] **Step 4: Run the tests to see them pass, then the gate.**
Run: `npx vitest run tests/unit/components/motion/`
Expected: PASS.
Run: `npm run check`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/components/motion/motion-boot.ts tests/unit/components/motion/motion-boot.test.ts
git commit -m "feat(journey): the head script decides Data Saver and the drawing before first paint"
```

---

### Task 8: The drawing chapter and the terminus, drawn still

**Files:**
- Modify: `src/messages/en-IN/home.ts` (`drawing`, `terminus`)
- Create: `src/components/landing/journey/still-svg.tsx`, `src/components/landing/journey/still-drawing.tsx`, `src/components/landing/journey/drawing-chapter.tsx`, `src/components/landing/journey/terminus-stage.tsx`
- Modify: `src/app/(site)/page.tsx`, `src/components/landing/closing-cta.tsx`, `src/styles/journey.css`
- Test: `tests/unit/components/landing/journey/still-drawing.test.tsx`, `tests/unit/components/landing/journey/drawing-chapter.test.tsx`

**Interfaces:**
- Consumes:
  - `STILL_MANIFEST` (Task 6);
  - `shapeFor`, `WIDE_QUERY` and `type StillKind` (Task 6);
  - `CALLOUT_PARTS` and `partSide` (Task 3);
  - `SectionKicker`, `H2` and `BODY` from `@/components/landing/sheet-type`;
  - `Corners` from `@/components/ui/corners`.
- Produces:
  - `StillSvg({ kind, wide, drawn }: { readonly kind: StillKind; readonly wide: boolean; readonly drawn: boolean })`: an `<svg class="still-wide|still-tall">` with one `<g data-part>` holding a `<use>` per part. `href` is set only when `drawn`.
  - `StillDrawing({ kind, className })`, a client component: `<div class="still-drawing {className}" aria-hidden="true">` with both shapes. It draws the one its width shows, only when `<html data-drawing="still">` or `data-journey="failed"` (J4-4).
  - `DrawingChapter()`: `<section id="anatomy">`. It holds:
    - `.anatomy-pin`;
    - `.anatomy-copy` (kicker, `h2#anatomy-title`, lead);
    - `.anatomy-still`;
    - the `<noscript>` copy;
    - `svg.callout-lines`;
    - `ol.callouts` ("What each part does"), whose `li.callout[data-part][data-side]` each hold `.callout-num`, `.callout-title` and `.callout-detail`;
    - `ol.anatomy-legend[aria-hidden]`;
    - `.title-block[aria-hidden]`.
  - `TerminusStage()`: `.terminus-stage[aria-hidden]` with `.terminus-caption` and `.terminus-still`.

Source: digest §8.1–8.2 (v3's markup and copy), and `V3/../still.css` and `V3/../proto.css` lines 129–226 and 336–337 (digest §7.6).

**The copy, verbatim** (approved with v3, spec §2), added to `home.ts` after `hero`, as `drawing`, and after `closing`, as `terminus`:
```ts
  // The drawn train's chapter (GA) and the terminus, approved with prototype v3 (spec 2026-09-24 §2).
  drawing: {
    kicker: "General arrangement · Drawing TL-07",
    title: "Every part answers to the source",
    lead: "Take a check apart and each piece does one job: ask the source once, show exactly what came back, and say when. Nothing in it guesses.",
    listLabel: "What each part does",
    parts: [
      { id: "pantoFront", title: "Leading pantograph", promise: "One live request", detail: "asked the moment you press Run" },
      { id: "shell", title: "Body shell", promise: "The record", detail: "only the fields the source returned" },
      { id: "cabFront", title: "Headlight", promise: "Provenance", detail: "every field says where it came from" },
      { id: "bogieFront", title: "Leading bogie", promise: "Time-stamped", detail: "retrieval time beside the status, in IST" },
      { id: "wheelsFront", title: "Leading wheelsets", promise: "Fails closed", detail: "no source, no claim" },
      { id: "pantoRear", title: "Trailing pantograph", promise: "No odds", detail: "confirmation chances are never shown" },
      { id: "roof", title: "Roof equipment", promise: "Nothing filled in", detail: "a missing field reads “Not returned”" },
      { id: "cabRear", title: "Rear cab", promise: "PNR entry", detail: "ten digits, punched 3–3–4" },
      { id: "bogieRear", title: "Trailing bogie", promise: "Never logged", detail: "PNRs and names stay out of logs" },
      { id: "wheelsRear", title: "Trailing wheelsets", promise: "No account", detail: "a check needs only the PNR" },
    ],
    titleBlock: {
      drawing: "DRG TL-07",
      drawingName: "General arrangement",
      sheet: "Sheet 1 of 1",
      subject: "WAP-7-style electric locomotive · LHB rake",
      scale: "Not to scale",
      gauge: "Broad gauge 1 676 · dimensions approx.",
      maker: "Trakline",
    },
  },
```
```ts
  terminus: {
    caption: "Terminus · the check starts here",
  },
```

- [ ] **Step 1: Write the failing tests**

`tests/unit/components/landing/journey/still-drawing.test.tsx`:
```tsx
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StillDrawing } from "@/components/landing/journey/still-drawing";
import { STILL_MANIFEST } from "@/components/landing/journey/still-manifest";

let wide = true;
const changes = new Set<() => void>();
const html = document.documentElement;

beforeEach(() => {
  wide = true;
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      get matches() {
        return wide;
      },
      media: query,
      addEventListener: (_: string, listener: () => void) => changes.add(listener),
      removeEventListener: (_: string, listener: () => void) => changes.delete(listener),
    }),
  });
});

afterEach(() => {
  html.removeAttribute("data-drawing");
  html.removeAttribute("data-journey");
  changes.clear();
});

const hrefs = (root: HTMLElement) => [...root.querySelectorAll("use")].flatMap((u) => u.getAttribute("href") ?? []);
const all = (name: "anatomyWide" | "anatomyTall") => STILL_MANIFEST.shapes[name].parts.map((p) => `${STILL_MANIFEST.shapes[name].href}#${p}`);

describe("StillDrawing", () => {
  it("fetches nothing while the drawing is live", () => {
    html.setAttribute("data-drawing", "live");
    const { container } = render(<StillDrawing kind="anatomy" className="anatomy-still" />);
    expect(hrefs(container)).toEqual([]);
  });

  it("draws every part of the wide shape once the page draws still", async () => {
    html.setAttribute("data-drawing", "live");
    const { container } = render(<StillDrawing kind="anatomy" className="anatomy-still" />);
    await act(async () => html.setAttribute("data-drawing", "still"));
    expect(hrefs(container)).toEqual(all("anatomyWide"));
  });

  it("draws the tall shape on a narrow screen, and follows the width", async () => {
    wide = false;
    html.setAttribute("data-drawing", "still");
    const { container } = render(<StillDrawing kind="anatomy" className="anatomy-still" />);
    expect(hrefs(container)).toEqual(all("anatomyTall"));
    wide = true;
    await act(async () => changes.forEach((change) => change()));
    expect(hrefs(container)).toEqual(all("anatomyWide"));
  });

  it("draws still when the journey failed, whatever the head script guessed", async () => {
    html.setAttribute("data-drawing", "live");
    const { container } = render(<StillDrawing kind="terminus" className="terminus-still" />);
    await act(async () => html.setAttribute("data-journey", "failed"));
    expect(hrefs(container)).toHaveLength(STILL_MANIFEST.shapes.terminusWide.parts.length);
  });

  it("is decoration", () => {
    const { container } = render(<StillDrawing kind="anatomy" className="anatomy-still" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
```

`tests/unit/components/landing/journey/drawing-chapter.test.tsx`:
```tsx
import { render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DrawingChapter } from "@/components/landing/journey/drawing-chapter";
import { STILL_MANIFEST } from "@/components/landing/journey/still-manifest";
import { TerminusStage } from "@/components/landing/journey/terminus-stage";
import { CALLOUT_PARTS } from "@/components/landing/journey/train-parts";
import { messages } from "@/messages";

describe("the drawing chapter (GA)", () => {
  it("is a section named by its heading, with GA's anchor", () => {
    render(<DrawingChapter />);
    expect(screen.getByRole("region", { name: "Every part answers to the source" }).id).toBe("anatomy");
  });

  it("keeps its copy's parts in the labels' order", () => {
    expect(messages.home.drawing.parts.map((p) => p.id)).toEqual([...CALLOUT_PARTS]);
  });

  it("says what each part does in one real list, leading end right, trailing end left", () => {
    render(<DrawingChapter />);
    const items = within(screen.getByRole("list", { name: "What each part does" })).getAllByRole("listitem");
    expect(items.map((li) => li.dataset.part)).toEqual([...CALLOUT_PARTS]);
    expect(items.map((li) => li.dataset.side)).toEqual(["right", "right", "right", "right", "right", "left", "left", "left", "left", "left"]);
    expect(items[0]).toHaveTextContent("01Leading pantographOne live request · asked the moment you press Run");
    expect(items[9]).toHaveTextContent("10Trailing wheelsetsNo account · a check needs only the PNR");
  });

  it("keeps the drawing, the leaders, the legend and the title block from assistive tech", () => {
    const { container } = render(<DrawingChapter />);
    for (const selector of [".anatomy-still", ".callout-lines", ".anatomy-legend", ".title-block"]) {
      expect(container.querySelector(selector), selector).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("sends a page with JavaScript no still file, and a page without it the drawing", () => {
    const html = renderToString(<DrawingChapter />);
    const [page, noscript = ""] = html.split("<noscript>");
    expect(page).not.toContain("/journey/");
    expect(noscript).toContain(`${STILL_MANIFEST.shapes.anatomyWide.href}#shell`);
    expect(noscript).toContain(`${STILL_MANIFEST.shapes.anatomyTall.href}#shell`);
  });
});

describe("the terminus stage", () => {
  it("captions the arrived train and keeps it from assistive tech", () => {
    const { container } = render(<TerminusStage />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container).toHaveTextContent("Terminus · the check starts here");
  });

  it("sends the terminus drawing only to a page without JavaScript", () => {
    const [page, noscript = ""] = renderToString(<TerminusStage />).split("<noscript>");
    expect(page).not.toContain("/journey/");
    expect(noscript).toContain(STILL_MANIFEST.shapes.terminusWide.href);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail.**
Run: `npx vitest run tests/unit/components/landing/journey/still-drawing.test.tsx tests/unit/components/landing/journey/drawing-chapter.test.tsx`
Expected: FAIL, because the components do not exist.

- [ ] **Step 3: Add the copy** to `src/messages/en-IN/home.ts`, exactly as above.

- [ ] **Step 4: Write `still-svg.tsx` and `still-drawing.tsx`**

`still-svg.tsx` (no directive; the server's `<noscript>` and the client both render it):
```tsx
import { STILL_MANIFEST } from "./still-manifest";
import { shapeFor, type StillKind } from "./still-shapes";

/** One baked shape: a <use> per part, pointing at its group in the shape's file only when `drawn`. */
export function StillSvg({ kind, wide, drawn }: { readonly kind: StillKind; readonly wide: boolean; readonly drawn: boolean }) {
  const shape = STILL_MANIFEST.shapes[shapeFor(kind, wide)];
  return (
    <svg className={wide ? "still-wide" : "still-tall"} viewBox={shape.viewBox.join(" ")} preserveAspectRatio={kind === "anatomy" ? "xMidYMid meet" : "xMidYMax meet"} focusable="false">
      {shape.parts.map((part) => (
        <g key={part} data-part={part}>
          <use href={drawn ? `${shape.href}#${part}` : undefined} />
        </g>
      ))}
    </svg>
  );
}
```

`still-drawing.tsx`:
```tsx
"use client";

import { useSyncExternalStore } from "react";
import { WIDE_QUERY, type StillKind } from "./still-shapes";
import { StillSvg } from "./still-svg";

// The still drawing of the train (spec §3.C–D; J4-4): the baked shapes, one <use> per part. Their files are fetched
// only when the page draws still (<html data-drawing="still">, or a journey that failed), and only the shape this
// width shows, so a live page never downloads them. React owns the hrefs; the journey only lights a part (data-hot)
// and places the holder (still.ts).

type Shown = "none" | "wide" | "tall";

function read(): Shown {
  const { dataset } = document.documentElement;
  if (dataset.drawing !== "still" && dataset.journey !== "failed") return "none";
  return window.matchMedia(WIDE_QUERY).matches ? "wide" : "tall";
}

function subscribe(change: () => void): () => void {
  const observer = new MutationObserver(change);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-drawing", "data-journey"] });
  const media = window.matchMedia(WIDE_QUERY);
  media.addEventListener("change", change);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", change);
  };
}

const onServer = (): Shown => "none";

export function StillDrawing({ kind, className }: { readonly kind: StillKind; readonly className: string }) {
  const shown = useSyncExternalStore(subscribe, read, onServer);
  return (
    <div className={`still-drawing ${className}`} aria-hidden="true">
      <StillSvg kind={kind} wide drawn={shown === "wide"} />
      <StillSvg kind={kind} wide={false} drawn={shown === "tall"} />
    </div>
  );
}
```

- [ ] **Step 5: Write `drawing-chapter.tsx` and `terminus-stage.tsx`**

```tsx
import { Corners } from "@/components/ui/corners";
import { messages } from "@/messages";
import { BODY, H2, SectionKicker } from "../sheet-type";
import { StillDrawing } from "./still-drawing";
import { StillSvg } from "./still-svg";
import { partSide } from "./train-parts";

const num = (i: number) => String(i + 1).padStart(2, "0");

/**
 * GA · the drawn train (spec §3.A): the locomotive apart into its ten parts, each labelled with the job it does.
 * Drawn still, the page reads words, then the drawing, then the parts list (journey.css); while the journey runs,
 * still.ts stands the labels beside the drawing with leaders to their parts when they fit (J4-7). The live drawing
 * pins this section in J5.
 */
export function DrawingChapter() {
  const m = messages.home.drawing;
  const t = m.titleBlock;
  return (
    <section id="anatomy" aria-labelledby="anatomy-title" className="anatomy section-pad">
      <div className="anatomy-pin">
        <header className="anatomy-copy">
          <SectionKicker rule="mb-3">{m.kicker}</SectionKicker>
          <h2 id="anatomy-title" className={H2}>
            {m.title}
          </h2>
          <p className={`mt-3.5 ${BODY}`}>{m.lead}</p>
        </header>
        <StillDrawing kind="anatomy" className="anatomy-still" />
        <noscript>
          <div className="still-drawing anatomy-still is-noscript" aria-hidden="true">
            <StillSvg kind="anatomy" wide drawn />
            <StillSvg kind="anatomy" wide={false} drawn />
          </div>
        </noscript>
        <svg className="callout-lines" aria-hidden="true" focusable="false" />
        <ol className="callouts" aria-label={m.listLabel}>
          {m.parts.map((part, i) => (
            <li key={part.id} className="callout" data-part={part.id} data-side={partSide(part.id)}>
              <span className="callout-num tnum">{num(i)}</span>
              <span className="callout-title">{part.title}</span>
              <span className="callout-detail">
                <b>{part.promise}</b> · {part.detail}
              </span>
            </li>
          ))}
        </ol>
        <ol className="anatomy-legend" aria-hidden="true">
          {m.parts.map((part, i) => (
            <li key={part.id}>
              <b className="tnum">{num(i)}</b>
              <span>
                {part.title} · {part.promise}
              </span>
            </li>
          ))}
        </ol>
        <div className="title-block blueprint" aria-hidden="true">
          <Corners />
          <span className="tb-cell tb-wide">
            <b>{t.drawing}</b> · {t.drawingName}
          </span>
          <span className="tb-cell">{t.sheet}</span>
          <span className="tb-cell tb-wide">{t.subject}</span>
          <span className="tb-cell">{t.scale}</span>
          <span className="tb-cell tb-wide">{t.gauge}</span>
          <span className="tb-cell">{t.maker}</span>
        </div>
      </div>
    </section>
  );
}
```
`terminus-stage.tsx`:
```tsx
import { messages } from "@/messages";
import { StillDrawing } from "./still-drawing";
import { StillSvg } from "./still-svg";

/** The terminus (spec §3.A): the whole train arrived, above the closing plate. Decoration; drawn still until J5. */
export function TerminusStage() {
  return (
    <div className="terminus-stage" aria-hidden="true">
      <span className="legend-sm terminus-caption">{messages.home.terminus.caption}</span>
      <StillDrawing kind="terminus" className="terminus-still" />
      <noscript>
        <div className="still-drawing terminus-still is-noscript">
          <StillSvg kind="terminus" wide drawn />
          <StillSvg kind="terminus" wide={false} drawn />
        </div>
      </noscript>
    </div>
  );
}
```
Place `<DrawingChapter />` after `<DepartureBoard />` in `src/app/(site)/page.tsx`, and `<TerminusStage />` as the first child of `ClosingCta`'s `<section id="terminus">`, before `<PnrClosingTerminal …/>` (J4-11).

- [ ] **Step 6: The still layout in `src/styles/journey.css`.** Append it. v3's values are listed; the type sizes use the theme's roles.

```css
/* ------------------------------------------------------------------ the drawn train (GA) and the terminus
   Drawn still (spec §3.C–D). The page's own layout is the parts list: the words, the drawing, then the list; the
   ten labels stay a real list for screen readers, and a legend shows them. While the journey runs, still.ts stands
   the labels beside the drawing with leaders when they fit (journey-island.css, .is-columns). */
.anatomy-pin { position: relative; }
.anatomy-copy { position: relative; z-index: 2; max-width: 32rem; }
.anatomy-still { position: relative; width: 100%; aspect-ratio: 1.6; margin: 18px 0 14px; }
.still-drawing { color: var(--ink-1); pointer-events: none; }
.still-drawing svg { display: block; width: 100%; height: 100%; overflow: visible; }
/* a shape shows once it has something to draw; a page without JavaScript shows its <noscript> copy instead */
.still-drawing svg:not(:has(use[href])) { display: none; }
@media (min-width: 48rem) { .still-drawing .still-tall { display: none; } }
@media (max-width: 47.99rem) { .still-drawing .still-wide { display: none; } }
html:not([data-motion]) .still-drawing:not(.is-noscript) { display: none; }
/* ink weights reach into the baked files through <use>, as inherited variables (J4-3) */
[data-theme="dark"] .still-drawing { --still-line: 0.74; }
.still-drawing [data-hot] { color: var(--accent); --still-line: 1; --still-faint: 1; --still-near: 1; }
.callout-lines, .title-block { display: none; }
.callouts { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); margin: 0; padding: 0; list-style: none; }
.anatomy-legend { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr)); gap: 2px 14px; margin: 0; padding: 8px 0 0; list-style: none; border-top: 1px solid var(--line); }
.anatomy-legend li { display: flex; gap: 6px; min-width: 0; font-size: var(--text-xs); line-height: var(--text-xs--line-height); color: var(--ink-2); }
.anatomy-legend b { font-family: var(--font-display); font-weight: 600; color: var(--accent-text); }
.terminus-stage { position: relative; height: clamp(200px, 30vh, 320px); margin-bottom: 20px; }
.terminus-caption { position: absolute; left: 0; top: 0; z-index: 2; }
.terminus-still { position: absolute; inset: 18px 0 0; }
```

- [ ] **Step 7: Run the tests to see them pass, then the gate.**
Run: `npx vitest run tests/unit/components/landing/`
Expected: PASS.
Run: `npm run check`
Expected: green.
The station tests still pass, because GA is not a station until Task 9. `#anatomy` exists now, but nothing links to it yet.

- [ ] **Step 8: Look at it.** Run `npx playwright test tests/e2e/home.spec.ts --project=desktop` (port 4210) to see that the landing still passes. Then, with a throwaway Playwright script in the scratchpad against the same dev server, screenshot `#anatomy` at 1440×900 and 390×844 with `tt.motion=off` stored. Motion off makes the head script say still, so the drawing shows. Attach both screenshots to your report.

- [ ] **Step 9: Commit**

```bash
git add src/messages/en-IN/home.ts src/components/landing/journey/still-svg.tsx src/components/landing/journey/still-drawing.tsx src/components/landing/journey/drawing-chapter.tsx src/components/landing/journey/terminus-stage.tsx "src/app/(site)/page.tsx" src/components/landing/closing-cta.tsx src/styles/journey.css tests/unit/components/landing/journey/still-drawing.test.tsx tests/unit/components/landing/journey/drawing-chapter.test.tsx
git commit -m "feat(journey): the drawing chapter and the terminus, drawn still"
```

---

### Task 9: GA, the drawn train, joins the strip and the board

**Files:**
- Modify: `src/messages/en-IN/journey.ts` (`stations.anatomy`), `src/components/landing/journey/stations.ts`
- Modify (tests that count stations or board rows, per digest `j4-code-digest.md` §3):
  - `tests/unit/components/landing/journey/stations.test.ts`;
  - `tests/unit/components/landing/journey/board.test.tsx`;
  - `tests/unit/components/landing/journey/board-and-dial.test.tsx`;
  - `tests/unit/components/landing/journey/board-status.test.ts`;
  - `tests/e2e/journey/board.spec.ts`;
  - any other test that `grep -rln "\"DEP\"\|781\|730\|data-stop" tests` shows depends on the station list.

**Interfaces:**
- Consumes: `#anatomy` (Task 8).
- Produces: `STATIONS` with GA second: `{ id: "anatomy", code: "GA", km: 12, name: "The train, drawn" }`. The strip and the board follow `STATIONS` on their own.

- [ ] **Step 1: Write the failing test first.** In `stations.test.ts`, change the expected codes to `["DEP", "GA", "01", "02", "03", "04", "05", "06", "07", "08", "END"]` and the kms to `[0, 12, 64, 138, 212, 318, 407, 530, 644, 730, 781]`. Add:
```ts
  it("names GA for the drawn train, whose section is #anatomy", () => {
    expect(STATIONS[1]).toEqual({ id: "anatomy", code: "GA", km: 12, name: "The train, drawn" });
  });
```
Run: `npx vitest run tests/unit/components/landing/journey/stations.test.ts`
Expected: FAIL. There is no GA yet.

- [ ] **Step 2: Implement.**
  - Add `anatomy: "The train, drawn",` after `top` in `messages.journey.stations`.
  - Insert `{ id: "anatomy", code: "GA", km: 12 },` after DEP in `ROUTE`.
  - Change the header comment's last sentence to "GA, the drawn train, joined with its section in J4."

- [ ] **Step 3: Bring every row-counting test up to date.** The board gains a first row (GA), so every status array gains one entry.
  - Recompute each array from `boardStatus(stop, station)` with the new indices, rather than shifting it by hand.
  - For e2e specs that scroll to a section and read statuses, re-derive the expected array from the section's new station index.
  - Keep each test's intent. Change no assertion's meaning.

  Run: `npx vitest run tests/unit/components/landing/journey/`
  Expected: PASS.

- [ ] **Step 4: The strip and board e2e.**
  - Run: `npx playwright test tests/e2e/journey/board.spec.ts tests/e2e/journey/strip.spec.ts tests/e2e/journey/island.spec.ts` (port 4210).
    Expected: PASS once the arrays are updated.
  - Add to `strip.spec.ts`: "GA stands between DEP and 01, and lights while #anatomy is the section under the masthead". Scroll `#anatomy` to the masthead's foot with `scrollToId(page, "anatomy")`, then wait for `.strip-stops a[href="#anatomy"]` to have `aria-current="location"` and for `.strip-now` to read GA's name.

- [ ] **Step 5: The gate, then commit**

Run: `npm run check`
Expected: green.
```bash
git add src/messages/en-IN/journey.ts src/components/landing/journey/stations.ts tests
git commit -m "feat(journey): GA, the drawn train, joins the strip and the board"
```

---

### Task 10: The drawing's mode: still for every reason it has, and the reader kept in place

**Files:**
- Rename: `src/components/landing/journey/drawing.ts` → `src/components/landing/journey/strokes.ts`, and `tests/unit/components/landing/journey/drawing.test.tsx` → `tests/unit/components/landing/journey/strokes.test.tsx` (J4-1). Update the imports in `hero.ts` and `berths.ts`.
- Create: `src/components/landing/journey/drawing-mode.ts`, and a new `src/components/landing/journey/drawing.ts`
- Modify: `src/components/landing/journey/journey-events.ts` (`DRAWING_EVENT`, `DrawingDetail`), `src/components/landing/journey/start-journey.ts` (`MODULES`)
- Test: `tests/unit/components/landing/journey/drawing-mode.test.ts`, and a new `tests/unit/components/landing/journey/drawing.test.tsx`

**Interfaces:**
- Consumes:
  - `QUALITY_STORAGE_KEY` (Task 7);
  - `emit`, `LAYOUT_EVENT` and `JourneyContext`/`Teardown`/`keep` (J3);
  - `#anatomy` (Task 8).
- Produces:
  - `drawing-mode.ts`:
    - `DRAWING_REASONS = ["motion", "saver", "webgl", "quality", "load", "fit"] as const`;
    - `type DrawingReason`, `type DrawingMode = "live" | "still"`, `type Reasons = ReadonlySet<DrawingReason>`;
    - `modeOf(reasons): DrawingMode`;
    - `withReason(reasons, why, holds: boolean): Reasons`;
    - `whyOf(reasons): string`;
    - `startingReasons({ motion, saver, quality }): Reasons`;
    - `keepsPlace(before: { top; bottom; height }, height: number, viewport: number): boolean`.
  - `journey-events.ts`: `DRAWING_EVENT = "tt:drawing"` and `interface DrawingDetail { readonly mode: DrawingMode; readonly reasons: readonly DrawingReason[] }` (a type-only import from `drawing-mode`).
  - `drawing.ts`:
    - `type Ask = { readonly still: (why: DrawingReason) => void; readonly live: (why: DrawingReason) => void }`;
    - `type LoadLive = (ask: Ask) => Promise<Teardown>`;
    - `noLiveDrawing: LoadLive`;
    - `drawingModule(loadLive: LoadLive): JourneyModule`;
    - `startDrawing = drawingModule(noLiveDrawing)`.
  - `startDrawing` is appended to `MODULES`.

The module writes `<html data-drawing>` and `data-drawing-why` and emits `tt:drawing` (spec §3.B–C). Source: `V3/drawing.js` (digest §7.4). Rulings J4-5 and J4-6 cover the parts it leaves out:
- the WebGL probe waits for J5;
- the live loader is a parameter, and J4's rejects.

**Keeping the reader's place** (spec §3.C, "switching mid-chapter keeps the reader at the chapter's start") happens only when three things are true:
- the reader is inside the chapter (its top more than 8px above the window, and more than half the window still in it);
- the chapter's height changed across the switch;
- the switch was of the mode itself.

In J4, live and still share one layout, so only the labels taking their columns can change the height. A reader who reloads mid-page is never moved for nothing.

- [ ] **Step 1: Rename the stroke helper.** Use `git mv` for both files, and fix the imports in `hero.ts`, `berths.ts` and the moved test. Change the stroke helper's header comment to name itself `strokes.ts`.
Run: `npm run check`
Expected: green.
```bash
git commit -m "refactor(journey): the stroke helper is strokes.ts, so drawing.ts can be the drawing's mode"
```

- [ ] **Step 2: Write the failing tests**

`tests/unit/components/landing/journey/drawing-mode.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { keepsPlace, modeOf, startingReasons, whyOf, withReason, type Reasons } from "@/components/landing/journey/drawing-mode";

const none: Reasons = new Set();

describe("the drawing's mode (spec §3.C)", () => {
  it("is live unless a reason holds", () => {
    expect(modeOf(none)).toBe("live");
    expect(modeOf(new Set(["webgl"]))).toBe("still");
  });

  it("adds and drops reasons without touching the set it was given", () => {
    const one = withReason(none, "load", true);
    expect([...one]).toEqual(["load"]);
    expect(none.size).toBe(0);
    expect(withReason(one, "load", false).size).toBe(0);
  });

  it("names its reasons in the spec's order", () => {
    expect(whyOf(new Set(["load", "motion", "saver"]))).toBe("motion saver load");
    expect(whyOf(none)).toBe("");
  });

  it("starts from Motion, Data Saver and this session's quality floor", () => {
    expect([...startingReasons({ motion: true, saver: false, quality: null })]).toEqual([]);
    expect(whyOf(startingReasons({ motion: false, saver: true, quality: "still" }))).toBe("motion saver quality");
    expect(whyOf(startingReasons({ motion: true, saver: false, quality: "2" }))).toBe("");
  });

  it("keeps a reader inside the chapter at its start, only when its height changed", () => {
    const inside = { top: -300, bottom: 900, height: 1200 };
    expect(keepsPlace(inside, 1500, 800)).toBe(true);
    expect(keepsPlace(inside, 1200, 800)).toBe(false);
    expect(keepsPlace({ top: 0, bottom: 1200, height: 1200 }, 1500, 800)).toBe(false); // at its start already
    expect(keepsPlace({ top: -1000, bottom: 200, height: 1200 }, 1500, 800)).toBe(false); // leaving it
  });
});
```

`tests/unit/components/landing/journey/drawing.test.tsx`:
```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drawingModule, startDrawing, type LoadLive } from "@/components/landing/journey/drawing";
import { DRAWING_EVENT, type DrawingDetail, type ResultDetail } from "@/components/landing/journey/journey-events";
import { keep, type JourneyContext } from "@/components/landing/journey/start-journey";

const html = document.documentElement;
const ctx = (motion: boolean): JourneyContext => ({ motion, intro: false, result: keep<ResultDetail | null>(null) });
const heard: DrawingDetail[] = [];
const hear = (e: Event) => heard.push((e as CustomEvent<DrawingDetail>).detail);

beforeEach(() => {
  heard.length = 0;
  window.addEventListener(DRAWING_EVENT, hear);
  html.dataset.drawing = "live";
  html.dataset.saver = "off";
});

afterEach(() => {
  window.removeEventListener(DRAWING_EVENT, hear);
  delete html.dataset.drawing;
  delete html.dataset.drawingWhy;
  delete html.dataset.saver;
  window.sessionStorage.clear();
  document.body.innerHTML = "";
});

describe("the drawing's mode on the page", () => {
  it("draws still at once with Motion off, and says why", () => {
    const stop = startDrawing(ctx(false));
    expect(html.dataset.drawing).toBe("still");
    expect(html.dataset.drawingWhy).toBe("motion");
    expect(heard.at(-1)).toEqual({ mode: "still", reasons: ["motion"] });
    stop();
  });

  it("settles still with Motion on, because J4 has no live drawing to load", async () => {
    const stop = startDrawing(ctx(true));
    await vi.waitFor(() => expect(html.dataset.drawingWhy).toBe("load"));
    expect(html.dataset.drawing).toBe("still");
    stop();
  });

  it("never asks for the live drawing on Data Saver, or once the session fell to the floor", () => {
    const load = vi.fn<LoadLive>(() => Promise.reject(new Error("no")));
    html.dataset.saver = "on";
    drawingModule(load)(ctx(true))();
    expect(html.dataset.drawingWhy).toBe("saver");
    html.dataset.saver = "off";
    window.sessionStorage.setItem("tt.q", "still");
    drawingModule(load)(ctx(true))();
    expect(html.dataset.drawingWhy).toBe("quality");
    expect(load).not.toHaveBeenCalled();
  });

  it("draws live when the live drawing loads, stops it on teardown, and follows its reasons", async () => {
    const liveStop = vi.fn();
    let ask: Parameters<LoadLive>[0] | null = null;
    const load = vi.fn<LoadLive>((a) => {
      ask = a;
      return Promise.resolve(liveStop);
    });
    const stop = drawingModule(load)(ctx(true));
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(html.dataset.drawing).toBe("live");
    ask?.still("webgl");
    expect(html.dataset.drawing).toBe("still");
    expect(liveStop).toHaveBeenCalledTimes(1);
    ask?.live("webgl");
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    stop();
  });

  it("stops a live drawing that arrives after the journey was torn down", async () => {
    const liveStop = vi.fn();
    let arrive: (t: () => void) => void = () => {};
    const stop = drawingModule(() => new Promise((resolve) => (arrive = resolve)))(ctx(true));
    stop();
    arrive(liveStop);
    await vi.waitFor(() => expect(liveStop).toHaveBeenCalledTimes(1));
  });

  it("keeps a reader inside the chapter at its start when the switch changes its height", () => {
    const section = document.createElement("section");
    section.id = "anatomy";
    document.body.append(section);
    const boxes = [
      { top: -300, bottom: 900, height: 1200 },
      { top: -300, bottom: 1200, height: 1500 },
    ];
    vi.spyOn(section, "getBoundingClientRect").mockImplementation(() => DOMRect.fromRect({ y: boxes[0].top, height: boxes.shift()?.height ?? 1500 }));
    Object.defineProperty(window, "scrollY", { value: 2000, configurable: true });
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    startDrawing(ctx(false))();
    expect(scrollTo).toHaveBeenCalledWith({ top: 1700, behavior: "instant" });
  });
});
```
The last test reads the masthead's bottom as 0 (there is no `<header>` in jsdom), so the landing is `-300 + 2000 = 1700`. Adapt the `getBoundingClientRect` stub so that it returns the "before" box first and the "after" box second.

- [ ] **Step 3: Run the tests to see them fail.**
Run: `npx vitest run tests/unit/components/landing/journey/drawing-mode.test.ts tests/unit/components/landing/journey/drawing.test.tsx`
Expected: FAIL, because the modules do not exist.

- [ ] **Step 4: Write `drawing-mode.ts`**

```ts
// Which drawing the page shows (spec §3.C), as pure logic: the train is drawn live unless a reason holds, and
// reasons come and go. drawing.ts runs it on the page.

export const DRAWING_REASONS = ["motion", "saver", "webgl", "quality", "load", "fit"] as const;
export type DrawingReason = (typeof DRAWING_REASONS)[number];
export type DrawingMode = "live" | "still";
export type Reasons = ReadonlySet<DrawingReason>;

export function modeOf(reasons: Reasons): DrawingMode {
  return reasons.size > 0 ? "still" : "live";
}

export function withReason(reasons: Reasons, why: DrawingReason, holds: boolean): Reasons {
  const next = new Set(reasons);
  if (holds) next.add(why);
  else next.delete(why);
  return next;
}

/** <html data-drawing-why>: the reasons that hold, in the spec's order. */
export function whyOf(reasons: Reasons): string {
  return DRAWING_REASONS.filter((why) => reasons.has(why)).join(" ");
}

/** The reasons known when the journey starts: Motion off, Data Saver, and this session's quality floor (tt.q). */
export function startingReasons({ motion, saver, quality }: { readonly motion: boolean; readonly saver: boolean; readonly quality: string | null }): Reasons {
  const reasons = new Set<DrawingReason>();
  if (!motion) reasons.add("motion");
  if (saver) reasons.add("saver");
  if (quality === "still") reasons.add("quality");
  return reasons;
}

/**
 * Whether switching the drawing should put the reader back at the chapter's start: they were inside it (its top gone
 * above the window, over half the window still in it), and the switch changed its height.
 */
export function keepsPlace(before: { readonly top: number; readonly bottom: number; readonly height: number }, height: number, viewport: number): boolean {
  return before.top < -8 && before.bottom > viewport * 0.5 && Math.abs(height - before.height) > 1;
}
```

- [ ] **Step 5: Add the event, and write `drawing.ts`**

In `journey-events.ts`:
```ts
import type { DrawingMode, DrawingReason } from "./drawing-mode";
…
export const DRAWING_EVENT = "tt:drawing";
…
export interface DrawingDetail {
  readonly mode: DrawingMode;
  readonly reasons: readonly DrawingReason[];
}
```

`drawing.ts`:
```ts
import { QUALITY_STORAGE_KEY } from "@/components/motion/motion-boot";
import { keepsPlace, modeOf, startingReasons, whyOf, withReason, type DrawingMode, type DrawingReason, type Reasons } from "./drawing-mode";
import { DRAWING_EVENT, LAYOUT_EVENT, emit, type DrawingDetail } from "./journey-events";
import type { JourneyContext, JourneyModule, Teardown } from "./start-journey";

// Which drawing the page shows (spec §3.B–C; prototype v3's drawing.js), written to <html data-drawing> and
// data-drawing-why, and told as tt:drawing: live unless a reason holds. The head script guessed before first paint
// (motion-boot.ts); from here on this module decides. J4 has no live drawing, so its loader says so and every page
// settles still (J4-6); J5 hands drawingModule the scene chunk's loader, the WebGL probe and the fit reason.

export interface Ask {
  readonly still: (why: DrawingReason) => void;
  readonly live: (why: DrawingReason) => void;
}
export type LoadLive = (ask: Ask) => Promise<Teardown>;

export const noLiveDrawing: LoadLive = () => Promise.reject(new Error("the live drawing arrives in J5"));

function storedQuality(): string | null {
  try {
    return window.sessionStorage.getItem(QUALITY_STORAGE_KEY);
  } catch {
    return null;
  }
}

function mastheadBottom(): number {
  return Math.round(document.querySelector("header")?.getBoundingClientRect().bottom ?? 0);
}

/** A switch of drawing that changes the chapter's height under a reader inside it puts them back at its start. */
function keepPlace(change: () => void): void {
  const section = document.getElementById("anatomy");
  const before = section?.getBoundingClientRect();
  change();
  if (!section || !before) return;
  const after = section.getBoundingClientRect();
  if (keepsPlace(before, after.height, window.innerHeight)) window.scrollTo({ top: Math.round(after.top + window.scrollY - mastheadBottom()), behavior: "instant" });
}

export function drawingModule(loadLive: LoadLive): JourneyModule {
  return ({ motion }: JourneyContext): Teardown => {
    const html = document.documentElement;
    let reasons: Reasons = startingReasons({ motion, saver: html.dataset.saver === "on", quality: storedQuality() });
    let mode: DrawingMode | null = null;
    let alive = true;
    let token: object | null = null;
    let live: Teardown | null = null;

    const report = (now: DrawingMode) => {
      html.dataset.drawing = now;
      html.dataset.drawingWhy = whyOf(reasons);
      emit<DrawingDetail>(DRAWING_EVENT, { mode: now, reasons: [...reasons] });
    };

    const ask: Ask = {
      still: (why) => {
        reasons = withReason(reasons, why, true);
        apply();
      },
      live: (why) => {
        reasons = withReason(reasons, why, false);
        apply();
      },
    };

    const startLive = () => {
      const mine = {};
      token = mine;
      loadLive(ask).then(
        (teardown) => {
          if (!alive || token !== mine || mode !== "live") return teardown();
          live = teardown;
          emit(LAYOUT_EVENT);
        },
        () => {
          if (alive && token === mine) ask.still("load");
        },
      );
    };

    function apply(): void {
      if (!alive) return;
      const want = modeOf(reasons);
      if (want === mode) return report(want);
      keepPlace(() => {
        mode = want;
        report(want);
        if (want === "still") {
          token = null;
          live?.();
          live = null;
        } else startLive();
      });
      emit(LAYOUT_EVENT);
    }

    apply();
    return () => {
      alive = false;
      token = null;
      live?.();
      live = null;
    };
  };
}

export const startDrawing = drawingModule(noLiveDrawing);
```
Append `startDrawing` to `MODULES` in `start-journey.ts`, after `startSound`.

- [ ] **Step 6: Run the tests to see them pass, then the gate and the journey's e2e.**
Run: `npx vitest run tests/unit/components/landing/journey/`
Expected: PASS.
Run: `npm run check`
Expected: green.
Run: `npx playwright test tests/e2e/journey/` (port 4210)
Expected: PASS, including `teardown.spec.ts`. The drawing writes only `html` attributes, which that spec does not snapshot.

- [ ] **Step 7: Commit**

```bash
git add src/components/landing/journey/drawing-mode.ts src/components/landing/journey/drawing.ts src/components/landing/journey/journey-events.ts src/components/landing/journey/start-journey.ts tests/unit/components/landing/journey/drawing-mode.test.ts tests/unit/components/landing/journey/drawing.test.tsx
git commit -m "feat(journey): the drawing's mode, still for every reason it has, with the reader kept in place"
```

---

### Task 11: The labels stand beside the still, with leaders to their parts

**Files:**
- Create: `src/components/landing/journey/labels-layout.ts`, `src/components/landing/journey/still.ts`
- Modify: `src/components/landing/journey/start-journey.ts` (`MODULES`), `src/styles/journey-island.css`
- Test: `tests/unit/components/landing/journey/labels-layout.test.ts`, `tests/e2e/journey/drawing.spec.ts`

**Interfaces:**
- Consumes:
  - `STILL_MANIFEST` (Task 6);
  - `partSide` and `isPartId` (Task 3);
  - `DRAWING_EVENT` and `LAYOUT_EVENT` (Task 10 and J3);
  - the markup from Task 8.
- Produces:
  - `labels-layout.ts`:
    - `interface Box { readonly l; t; r; b: number }`;
    - `distribute(heights, top, bottom, minGap = 6): { readonly tops: readonly number[]; readonly fits: boolean }`;
    - `columnsZone({ leftEdges, rightEdges, top, floor }): Box`;
    - `columnsFit({ fits, zone, pinWidth, titleWidth }): boolean`;
    - `letterbox(viewBox, box: { x; y; width; height }): { scale; x; y }`;
    - `leaderFrom(label: { left; top; width }, side: LabelSide, anchor: { x; y }): { x1; y1; x2; y2 }`.
  - `still.ts`: `startStill(ctx: JourneyContext): Teardown`, appended to `MODULES` after `startDrawing`.

Source: `V3/labels.js` (the columns, zone, fit and leaders, quoted in full in the controller's reading) and `V3/still.js` (the letterbox and highlight). Digest §7.1–7.3.

What J4 changes from v3:
- **Columns are the upgrade** (J4-7). Base CSS is the list, and `still.ts` adds `.is-columns` only at ≥ 64rem, when the page draws still, and when v3's fit rules pass.
- **No reveal, no fading.** The labels are always whole (text moves by transform only). J5 adds the scroll-tied reveal, by transform.
- **No caption** (J4-5). The left column runs down to the pin's foot less 44px, where v3 used the caption's top less 14.

- [ ] **Step 1: Write the failing tests**

`tests/unit/components/landing/journey/labels-layout.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { columnsFit, columnsZone, distribute, leaderFrom, letterbox } from "@/components/landing/journey/labels-layout";

describe("the labels' columns (prototype v3's labels.js)", () => {
  it("spreads a column evenly between its top and bottom", () => {
    expect(distribute([20, 20, 20], 0, 100)).toEqual({ tops: [0, 40, 80], fits: true });
  });

  it("keeps labels at least 6px apart, and says when they do not fit", () => {
    expect(distribute([40, 40, 40], 0, 100)).toEqual({ tops: [0, 46, 92], fits: false });
    expect(distribute([], 0, 100)).toEqual({ tops: [], fits: true });
  });

  it("leaves the drawing the room between the columns, 24px clear of each", () => {
    expect(columnsZone({ leftEdges: [200, 256], rightEdges: [1100, 1060], top: 240, floor: 700 })).toEqual({ l: 280, t: 240, r: 1036, b: 700 });
  });

  it("gives way to the parts list when the columns crowd the drawing, or the title block is too wide", () => {
    const zone = { l: 280, t: 240, r: 1036, b: 700 };
    expect(columnsFit({ fits: true, zone, pinWidth: 1400, titleWidth: 352 })).toBe(true);
    expect(columnsFit({ fits: false, zone, pinWidth: 1400, titleWidth: 352 })).toBe(false);
    expect(columnsFit({ fits: true, zone: { ...zone, r: 700 }, pinWidth: 1400, titleWidth: 352 })).toBe(false); // 420 < 34% of 1400
    expect(columnsFit({ fits: true, zone, pinWidth: 1400, titleWidth: 600 })).toBe(false); // over 42%
    expect(columnsFit({ fits: true, zone: { ...zone, b: 380 }, pinWidth: 1400, titleWidth: 352 })).toBe(false); // under 150px tall
  });
});

describe("where the drawing lands, and its leaders", () => {
  it("fits a viewBox inside a box, centred (meet)", () => {
    expect(letterbox([0, 0, 800, 400], { x: 100, y: 50, width: 400, height: 400 })).toEqual({ scale: 0.5, x: 100, y: 150 });
  });

  it("draws a leader from a label's near edge to its part", () => {
    expect(leaderFrom({ left: 10, top: 300, width: 256 }, "left", { x: 500, y: 200 })).toEqual({ x1: 266, y1: 300, x2: 500, y2: 200 });
    expect(leaderFrom({ left: 1100, top: 120, width: 256 }, "right", { x: 900, y: 180 })).toEqual({ x1: 1100, y1: 120, x2: 900, y2: 180 });
  });
});
```

`tests/e2e/journey/drawing.spec.ts`:
```ts
import { expect, test } from "../fixtures";
import { STILL_MANIFEST } from "@/components/landing/journey/still-manifest";
import { CALLOUT_PARTS } from "@/components/landing/journey/train-parts";
import { waitForJourney } from "./journey-helpers";

const WIDE = STILL_MANIFEST.shapes.anatomyWide;

test.describe("the drawn train, still (spec §3.C–D)", () => {
  test("draws every part of the shape its width shows, from immutable files", async ({ page, isMobile }) => {
    const shape = isMobile ? STILL_MANIFEST.shapes.anatomyTall : WIDE;
    const file = page.waitForResponse((r) => r.url().endsWith(shape.href));
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("html")).toHaveAttribute("data-drawing", "still");
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "load");
    const uses = page.locator("#anatomy .anatomy-still:not(.is-noscript) use[href]");
    await expect(uses).toHaveCount(shape.parts.length);
    expect((await file).headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  test("stands the labels beside the drawing at 1440×900, each leader ending on its part", async ({ page, isMobile }) => {
    test.skip(isMobile, "wide screens");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#anatomy .anatomy-pin")).toHaveClass(/is-columns/);
    const misses = await page.evaluate(({ viewBox, anchors, parts }) => {
      const pin = document.querySelector<HTMLElement>("#anatomy .anatomy-pin")!;
      const holder = pin.querySelector<HTMLElement>(".anatomy-still")!;
      const pr = pin.getBoundingClientRect();
      const hr = holder.getBoundingClientRect();
      const scale = Math.min(hr.width / viewBox[2], hr.height / viewBox[3]);
      const x0 = hr.left - pr.left + (hr.width - viewBox[2] * scale) / 2;
      const y0 = hr.top - pr.top + (hr.height - viewBox[3] * scale) / 2;
      const lines = [...pin.querySelectorAll<SVGLineElement>(".callout-lines line")];
      return parts.flatMap((part: string, i: number) => {
        const [ax, ay] = anchors[part];
        const line = lines[i];
        const dx = Number(line.getAttribute("x2")) - (x0 + ax * scale);
        const dy = Number(line.getAttribute("y2")) - (y0 + ay * scale);
        return Math.hypot(dx, dy) > 1.5 ? [`${part} ends ${dx.toFixed(1)},${dy.toFixed(1)} off`] : [];
      });
    }, { viewBox: WIDE.viewBox, anchors: WIDE.anchors, parts: [...CALLOUT_PARTS] });
    expect(misses).toEqual([]);
  });

  test("lights a part while a fine pointer rests on its label", async ({ page, isMobile }) => {
    test.skip(isMobile, "fine pointer");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#anatomy .anatomy-pin")).toHaveClass(/is-columns/);
    await page.locator('.callout[data-part="roof"]').hover();
    await expect(page.locator('#anatomy .anatomy-still g[data-part="roof"][data-hot]')).toHaveCount(2);
    await expect(page.locator('.callout[data-part="roof"]')).toHaveClass(/is-hot/);
    await page.mouse.move(5, 5);
    await expect(page.locator("#anatomy [data-hot]")).toHaveCount(0);
  });

  test("reads words, drawing, then the parts list on a phone", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phones");
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#anatomy .anatomy-pin")).not.toHaveClass(/is-columns/);
    await expect(page.locator("#anatomy .anatomy-legend")).toBeVisible();
    await expect(page.getByRole("list", { name: "What each part does" }).getByRole("listitem")).toHaveCount(10);
  });

  test("a reader below the chapter stays on what they were reading when the labels take their columns", async ({ page, isMobile }) => {
    test.skip(isMobile, "wide screens");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/#record");
    const before = await page.locator("#record").evaluate((el) => el.getBoundingClientRect().top);
    await waitForJourney(page);
    await expect(page.locator("#anatomy .anatomy-pin")).toHaveClass(/is-columns/);
    const after = await page.locator("#record").evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(after - before)).toBeLessThanOrEqual(4);
  });
});
```
Two `g[data-hot]` light, one per shape `<svg>` (wide and tall). If Playwright cannot resolve `@/` in e2e specs, import the manifest relatively, and say so.

- [ ] **Step 2: Run the tests to see them fail.**
Run: `npx vitest run tests/unit/components/landing/journey/labels-layout.test.ts`
Expected: FAIL, because the module does not exist.
Run: `npx playwright test tests/e2e/journey/drawing.spec.ts` (port 4210)
Expected: the first and fourth tests PASS, because Tasks 8 and 10 made them true. The column, leader, highlight and reader tests FAIL, because there is no `.is-columns`.

- [ ] **Step 3: Write `labels-layout.ts`**

```ts
import type { LabelSide } from "./train-parts";

// Where the drawn train's labels stand (prototype v3's labels.js), as pure maths: two columns beside the still
// drawing, each spread evenly and at least 6px apart; the free zone they leave the drawing; whether that zone is
// room enough, or the parts list should stand instead; where the drawing lands in it; and each label's leader.

export interface Box {
  readonly l: number;
  readonly t: number;
  readonly r: number;
  readonly b: number;
}

export function distribute(heights: readonly number[], top: number, bottom: number, minGap = 6): { readonly tops: readonly number[]; readonly fits: boolean } {
  if (heights.length === 0) return { tops: [], fits: true };
  const total = heights.reduce((a, b) => a + b, 0);
  const gap = (bottom - top - total) / Math.max(1, heights.length - 1);
  const step = Math.max(gap, minGap);
  const tops = heights.map((_, i) => Math.round(top + heights.slice(0, i).reduce((a, b) => a + b + step, 0)));
  return { tops, fits: gap >= minGap };
}

/** The room between the columns (pin-relative), 24px clear of each, under the words and above the title block. */
export function columnsZone({ leftEdges, rightEdges, top, floor }: { readonly leftEdges: readonly number[]; readonly rightEdges: readonly number[]; readonly top: number; readonly floor: number }): Box {
  return { l: Math.max(...leftEdges) + 24, r: Math.min(...rightEdges) - 24, t: top, b: floor };
}

/** Columns stand only when both fit and leave the drawing room: at least max(260px, 34% of the pin) wide and 150px tall, the title block within 42% of the pin. */
export function columnsFit({ fits, zone, pinWidth, titleWidth }: { readonly fits: boolean; readonly zone: Box; readonly pinWidth: number; readonly titleWidth: number }): boolean {
  return fits && zone.r - zone.l >= Math.max(260, pinWidth * 0.34) && zone.b - zone.t >= 150 && titleWidth <= pinWidth * 0.42;
}

/** Where a viewBox drawn "xMidYMid meet" inside a box lands: its scale and its top-left corner. */
export function letterbox(viewBox: readonly [number, number, number, number], box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }): { readonly scale: number; readonly x: number; readonly y: number } {
  const scale = Math.min(box.width / viewBox[2], box.height / viewBox[3]);
  return { scale, x: box.x + (box.width - viewBox[2] * scale) / 2, y: box.y + (box.height - viewBox[3] * scale) / 2 };
}

/** A label's leader: from the label's edge nearest the drawing, level with its top rule, to its part. */
export function leaderFrom(label: { readonly left: number; readonly top: number; readonly width: number }, side: LabelSide, anchor: { readonly x: number; readonly y: number }): { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number } {
  return { x1: side === "left" ? label.left + label.width : label.left, y1: label.top, x2: anchor.x, y2: anchor.y };
}
```

- [ ] **Step 4: Write `still.ts`**

```ts
import { DRAWING_EVENT, LAYOUT_EVENT, emit } from "./journey-events";
import { columnsFit, columnsZone, distribute, leaderFrom, letterbox, type Box } from "./labels-layout";
import type { JourneyContext, Teardown } from "./start-journey";
import { STILL_MANIFEST } from "./still-manifest";
import { isPartId, partSide } from "./train-parts";

// The drawn train's labels while the page draws still (spec §3.C; prototype v3's labels.js and still.js; J4-7).
// On wide screens they stand in two columns beside the drawing, each with a leader to its part, when they fit;
// otherwise the page's own parts list stands. A fine pointer resting on a label lights its part. Labels never fade
// (text moves by transform only); the live drawing adds their scroll-tied reveal in J5.

const NS = "http://www.w3.org/2000/svg";
const WIDE = STILL_MANIFEST.shapes.anatomyWide;
const COLUMNS_QUERY = "(min-width: 64rem)";
const HOLDER = ["left", "top", "width", "height"] as const;

interface Leader {
  readonly line: SVGLineElement;
  readonly dot: SVGCircleElement;
}

export function startStill(_ctx: JourneyContext): Teardown {
  const pin = document.querySelector<HTMLElement>("#anatomy .anatomy-pin");
  const copy = pin?.querySelector<HTMLElement>(".anatomy-copy");
  const holder = pin?.querySelector<HTMLElement>(".anatomy-still:not(.is-noscript)");
  const lines = pin?.querySelector<SVGSVGElement>("svg.callout-lines");
  const titleBlock = pin?.querySelector<HTMLElement>(".title-block");
  if (!pin || !copy || !holder || !lines || !titleBlock) return () => {};
  const labels = [...pin.querySelectorAll<HTMLElement>(".callout")];
  const left = labels.filter((l) => l.dataset.side === "left");
  const right = labels.filter((l) => l.dataset.side === "right");
  const columns = window.matchMedia(COLUMNS_QUERY);
  const fine = window.matchMedia("(pointer: fine)");
  let leaders: Leader[] = [];
  let frame = 0;
  let alive = true;

  const clear = () => {
    pin.classList.remove("is-columns", "is-compact");
    for (const label of labels) label.style.top = "";
    for (const key of HOLDER) holder.style[key] = "";
    for (const { line, dot } of leaders) {
      line.remove();
      dot.remove();
    }
    leaders = [];
  };

  const drawLeaders = (zone: Box, pinBox: DOMRect) => {
    const fit = letterbox(WIDE.viewBox, { x: zone.l, y: zone.t, width: zone.r - zone.l, height: zone.b - zone.t });
    // every label's box read before any leader is written, so no write forces a layout
    const boxes = labels.map((el) => ({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth }));
    lines.setAttribute("viewBox", `0 0 ${pinBox.width} ${pinBox.height}`);
    if (leaders.length === 0) {
      leaders = labels.map(() => {
        const line = document.createElementNS(NS, "line");
        const dot = document.createElementNS(NS, "circle");
        dot.setAttribute("r", "3.5");
        lines.append(line, dot);
        return { line, dot };
      });
    }
    labels.forEach((label, i) => {
      const part = label.dataset.part ?? "";
      const at = isPartId(part) ? WIDE.anchors[part] : undefined;
      if (!at) return;
      const anchor = { x: fit.x + at[0] * fit.scale, y: fit.y + at[1] * fit.scale };
      const seg = leaderFrom(boxes[i], partSide(part), anchor);
      const { line, dot } = leaders[i];
      line.setAttribute("x1", seg.x1.toFixed(1));
      line.setAttribute("y1", seg.y1.toFixed(1));
      line.setAttribute("x2", seg.x2.toFixed(1));
      line.setAttribute("y2", seg.y2.toFixed(1));
      dot.setAttribute("cx", anchor.x.toFixed(1));
      dot.setAttribute("cy", anchor.y.toFixed(1));
    });
  };

  const settle = (): boolean => {
    if (document.documentElement.dataset.drawing !== "still" || !columns.matches) return false;
    pin.classList.add("is-columns");
    const pinBox = pin.getBoundingClientRect();
    const rel = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { top: r.top - pinBox.top, bottom: r.bottom - pinBox.top, left: r.left - pinBox.left, right: r.right - pinBox.left };
    };
    let fits = false;
    for (const compact of [false, true]) {
      pin.classList.toggle("is-compact", compact);
      const l = distribute(left.map((el) => el.offsetHeight), rel(copy).bottom + 22, pinBox.height - 44);
      const r = distribute(right.map((el) => el.offsetHeight), Math.max(20, pinBox.height * 0.05), rel(titleBlock).top - 14);
      left.forEach((el, i) => {
        el.style.top = `${l.tops[i]}px`;
      });
      right.forEach((el, i) => {
        el.style.top = `${r.tops[i]}px`;
      });
      if (l.fits && r.fits) {
        fits = true;
        break;
      }
    }
    const zone = columnsZone({ leftEdges: left.map((el) => rel(el).right), rightEdges: right.map((el) => rel(el).left), top: rel(copy).bottom + 16, floor: rel(titleBlock).top - 16 });
    if (!columnsFit({ fits, zone, pinWidth: pinBox.width, titleWidth: titleBlock.offsetWidth })) return false;
    holder.style.left = `${Math.round(zone.l)}px`;
    holder.style.top = `${Math.round(zone.t)}px`;
    holder.style.width = `${Math.round(zone.r - zone.l)}px`;
    holder.style.height = `${Math.round(zone.b - zone.t)}px`;
    drawLeaders(zone, pinBox);
    return true;
  };

  const layout = () => {
    frame = 0;
    const was = pin.classList.contains("is-columns");
    if (!settle()) clear();
    // the chapter changed height: every module that measures sections hears it (only on a change, or it would loop)
    if (was !== pin.classList.contains("is-columns")) emit(LAYOUT_EVENT);
  };

  const schedule = () => {
    if (alive && !frame) frame = requestAnimationFrame(layout);
  };

  const light = (id: string | null) => {
    for (const g of holder.querySelectorAll<SVGGElement>("g[data-part]")) g.toggleAttribute("data-hot", g.dataset.part === id);
    for (const label of labels) label.classList.toggle("is-hot", label.dataset.part === id);
  };
  const pointing = labels.map((label) => {
    const enter = () => {
      if (fine.matches) light(label.dataset.part ?? null);
    };
    const leave = () => light(null);
    label.addEventListener("pointerenter", enter);
    label.addEventListener("pointerleave", leave);
    return () => {
      label.removeEventListener("pointerenter", enter);
      label.removeEventListener("pointerleave", leave);
    };
  });

  window.addEventListener(DRAWING_EVENT, schedule);
  window.addEventListener(LAYOUT_EVENT, schedule);
  columns.addEventListener("change", schedule);
  const observer = new ResizeObserver(schedule);
  observer.observe(pin);
  void document.fonts.ready.then(schedule);
  schedule();

  return () => {
    alive = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    window.removeEventListener(DRAWING_EVENT, schedule);
    window.removeEventListener(LAYOUT_EVENT, schedule);
    columns.removeEventListener("change", schedule);
    observer.disconnect();
    for (const stop of pointing) stop();
    light(null);
    clear();
  };
}
```
The `ResizeObserver` cannot loop. A pass that tries the columns and falls back to the list toggles the class within one call, so the pin ends at the size it was last reported and the observer does not fire again. Append `startStill` to `MODULES`, after `startDrawing`.

- [ ] **Step 5: The column layout in `src/styles/journey-island.css`.** Append it. Every rule starts with `html[data-journey="on"]` (J3 self-review 5). The values are v3's `proto.css` lines 129–199.

```css
/* The drawn train's labels beside the still drawing, with leaders to their parts (still.ts, spec §3.C; J4-7):
   only when they fit, else the page's own parts list stands (journey.css). */
html[data-journey="on"] .anatomy-pin.is-columns { height: max(640px, calc(100svh - var(--header-height))); }
html[data-journey="on"] .is-columns .anatomy-still { position: absolute; margin: 0; aspect-ratio: auto; z-index: 1; }
html[data-journey="on"] .is-columns .anatomy-legend { display: none; }
html[data-journey="on"] .is-columns .callout-lines { display: block; position: absolute; inset: 0; width: 100%; height: 100%; z-index: 2; pointer-events: none; overflow: visible; }
html[data-journey="on"] .callout-lines line { stroke: var(--line-strong); stroke-width: 1; }
html[data-journey="on"] .callout-lines circle { fill: var(--surface-0); stroke: var(--accent); stroke-width: 1.5; }
html[data-journey="on"] .is-columns .callouts { inset: 0; width: auto; height: auto; overflow: visible; clip-path: none; z-index: 3; pointer-events: none; }
html[data-journey="on"] .is-columns .callout { position: absolute; width: 16rem; display: grid; grid-template-columns: auto 1fr; column-gap: 10px; align-items: baseline; padding: 6px 0 7px; border-top: 1px solid var(--line); background: var(--surface-0); pointer-events: auto; }
html[data-journey="on"] .is-columns .callout[data-side="left"] { left: 0; }
html[data-journey="on"] .is-columns .callout[data-side="right"] { right: 0; }
html[data-journey="on"] .is-columns .callout-num { font-family: var(--font-display); font-weight: 600; font-size: var(--text-label); letter-spacing: 0.08em; color: var(--accent-text); }
html[data-journey="on"] .is-columns .callout-title { font-family: var(--font-display); font-weight: 600; font-size: var(--text-sm); line-height: 1.25rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-1); }
html[data-journey="on"] .is-columns .callout-detail { grid-column: 2; font-size: var(--text-label); line-height: 1.125rem; color: var(--ink-2); }
html[data-journey="on"] .is-columns .callout-detail b { font-weight: 600; color: var(--ink-1); }
html[data-journey="on"] .is-columns .callout.is-hot { border-top-color: var(--accent); }
html[data-journey="on"] .is-columns .callout.is-hot .callout-title { color: var(--accent-text); }
html[data-journey="on"] .is-columns.is-compact .callout-detail { display: none; }
html[data-journey="on"] .is-columns .title-block { display: grid; position: absolute; right: 0; bottom: 16px; z-index: 3; grid-template-columns: minmax(0, 1fr) auto; width: 22rem; background: var(--surface-0); }
html[data-journey="on"] .is-columns .tb-cell { padding: 4px 10px; font-family: var(--font-display); font-weight: 600; font-size: 0.6875rem; line-height: 1rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); }
html[data-journey="on"] .is-columns .tb-cell:nth-of-type(n + 3) { border-top: 1px solid var(--line); }
html[data-journey="on"] .is-columns .tb-cell:nth-of-type(even) { border-left: 1px solid var(--line); text-align: right; }
html[data-journey="on"] .is-columns .tb-cell b { color: var(--ink-1); font-weight: 600; }
```
Check the type sizes against the tokens: the tokens are 0.8125rem for `--text-label` and 0.875rem for `--text-sm`, where v3 used 0.8125, 0.9375 and 0.8125rem. `.tb-cell`'s 0.6875rem has no token: add `/* drawing units */` beside it, as the other instruments do, or use `--text-xs` if the title block still fits its 22rem. Say which in your report.

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run tests/unit/components/landing/journey/labels-layout.test.ts`
Expected: PASS.
Run: `npx playwright test tests/e2e/journey/drawing.spec.ts tests/e2e/journey/teardown.spec.ts tests/e2e/journey/collisions.spec.ts` (port 4210)
Expected: PASS. If `collisions.spec.ts` finds a label or the title block over another box, fix it at its source (the zone or the CSS). Never skip it.

- [ ] **Step 7: The gate, then commit**

Run: `npm run check`
Expected: green.
```bash
git add src/components/landing/journey/labels-layout.ts src/components/landing/journey/still.ts src/components/landing/journey/start-journey.ts src/styles/journey-island.css tests/unit/components/landing/journey/labels-layout.test.ts tests/e2e/journey/drawing.spec.ts
git commit -m "feat(journey): the drawn train's labels stand beside the still, with leaders to their parts"
```

---

### Task 12: Together: every drawing mode, the drawing's collisions, axe, the docs and the spec

**Files:**
- Create: `tests/e2e/journey/drawing-checks.ts`, `tests/e2e/journey/drawing-modes.spec.ts`
- Modify:
  - `tests/e2e/journey/collisions.spec.ts`;
  - `tests/e2e/journey/journey-axe.spec.ts`;
  - `tests/e2e/journey/teardown.spec.ts`, only if it finds a true reading it must drop;
  - `DESIGN.md`;
  - `docs/superpowers/specs/2026-09-24-landing-journey-design.md`.

**Interfaces:**
- Consumes: everything above; `waitForJourney`, `blockJourneyChunk`, `motionOff` and `scrollToId` (`journey-helpers.ts`); `expectAxeClean` (`tests/e2e/helpers.ts`, as `journey-axe.spec.ts` imports it).
- Produces: `drawingCollisions(page: Page): Promise<string[]>`. J5 extends it with the live drawing's box.

- [ ] **Step 1: The drawing's collision checks.** Create `tests/e2e/journey/drawing-checks.ts`:

```ts
import type { Page } from "@playwright/test";

/**
 * The drawn train's own collisions (spec §5), beside the shared checker in collisions.ts. It reports:
 * - a label over the drawing's drawn box (the shown <svg>'s content, not its holder);
 * - two leaders that cross;
 * - a leader that crosses another label.
 * Only while the labels stand in columns; the parts list cannot overlap.
 */
export async function drawingCollisions(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const pin = document.querySelector<HTMLElement>("#anatomy .anatomy-pin.is-columns");
    if (!pin) return [];
    const svg = [...pin.querySelectorAll<SVGSVGElement>(".anatomy-still:not(.is-noscript) svg")].find((s) => s.checkVisibility());
    const found: string[] = [];
    const labels = [...pin.querySelectorAll<HTMLElement>(".callout")].map((el) => ({ part: el.dataset.part ?? "", r: el.getBoundingClientRect() }));
    type R = { left: number; top: number; right: number; bottom: number };
    const overlaps = (a: R, b: R) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    if (svg) {
      const box = svg.getBBox();
      const m = svg.getScreenCTM();
      if (m && box.width > 0) {
        const p = (x: number, y: number) => new DOMPoint(x, y).matrixTransform(m);
        const a = p(box.x, box.y);
        const b = p(box.x + box.width, box.y + box.height);
        const drawn = { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) };
        for (const l of labels) if (overlaps(l.r, drawn)) found.push(`label ${l.part} over the drawing`);
      }
    }
    const pr = pin.getBoundingClientRect();
    const leaders = [...pin.querySelectorAll<SVGLineElement>(".callout-lines line")].map((line, i) => ({
      part: labels[i]?.part ?? String(i),
      a: { x: pr.left + Number(line.getAttribute("x1")), y: pr.top + Number(line.getAttribute("y1")) },
      b: { x: pr.left + Number(line.getAttribute("x2")), y: pr.top + Number(line.getAttribute("y2")) },
    }));
    type P = { x: number; y: number };
    const side = (p: P, q: P, r: P) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    const cross = (p1: P, p2: P, q1: P, q2: P) => side(p1, p2, q1) * side(p1, p2, q2) < 0 && side(q1, q2, p1) * side(q1, q2, p2) < 0;
    leaders.forEach((s, i) =>
      leaders.slice(i + 1).forEach((t) => {
        if (cross(s.a, s.b, t.a, t.b)) found.push(`leaders ${s.part} and ${t.part} cross`);
      }),
    );
    for (const s of leaders) {
      for (const l of labels) {
        if (l.part === s.part) continue;
        const { left, top, right, bottom } = l.r;
        const edges: [P, P][] = [[{ x: left, y: top }, { x: right, y: top }], [{ x: right, y: top }, { x: right, y: bottom }], [{ x: right, y: bottom }, { x: left, y: bottom }], [{ x: left, y: bottom }, { x: left, y: top }]];
        if (edges.some(([p, q]) => cross(s.a, s.b, p, q))) found.push(`leader ${s.part} crosses label ${l.part}`);
      }
    }
    return found;
  });
}
```
In `collisions.spec.ts`:
- Add `".title-block"` to `INSTRUMENTS.panels`.
- Add a test at 1440×900, 1280×800 and 1366×768: after `waitForJourney` and scrolling `#anatomy` into view, wait until the shown `<svg>`'s `getBBox().width > 0` (the files have loaded). Then assert `await drawingCollisions(page)` equals `[]`, and `collisionsInView` finds nothing at that position.
- The existing sweeps already pass through `#anatomy`. Run them.

Any finding is a real overlap: fix it at its source, the zone rules or the CSS. Never skip or loosen it.

- [ ] **Step 2: Every drawing mode (spec §4, §5).** Create `tests/e2e/journey/drawing-modes.spec.ts`:

```ts
import { expect, test } from "../fixtures";
import { STILL_MANIFEST } from "@/components/landing/journey/still-manifest";
import { blockJourneyChunk, motionOff, waitForJourney } from "./journey-helpers";

const drawn = (page: import("@playwright/test").Page) => page.locator("#anatomy .anatomy-still:not(.is-noscript) use[href]");

test.describe("every drawing mode draws the train (spec §4)", () => {
  test("Motion off: still, and the page says why", async ({ page }) => {
    await motionOff(page);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-drawing", "still"); // the head script, before first paint
    await waitForJourney(page);
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "motion"); // still from the start: the live drawing is never asked for
    await expect(drawn(page).first()).toBeAttached();
  });

  test("Data Saver: still from the first paint", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "connection", { configurable: true, get: () => ({ saveData: true, effectiveType: "4g" }) }));
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-saver", "on");
    await expect(page.locator("html")).toHaveAttribute("data-drawing", "still");
    await waitForJourney(page);
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "saver");
  });

  test("a journey that never loads still draws the train, and never touches Motion", async ({ page }) => {
    test.setTimeout(40_000);
    await blockJourneyChunk(page);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-journey", "failed", { timeout: 20_000 });
    await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
    await expect(drawn(page).first()).toBeAttached();
  });

  test("a live page fetches no still file until the page draws still", async ({ page }) => {
    const fetched: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/journey/")) fetched.push(r.url());
    });
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/_next/static/**/*.js", async (route) => {
      const body = await (await route.fetch()).text();
      if (body.includes("tt-journey-chunk")) await held;
      await route.continue();
    });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-drawing", "live");
    await page.waitForTimeout(1_500);
    expect(fetched).toEqual([]);
    release();
    await waitForJourney(page);
    await expect.poll(() => fetched.length).toBeGreaterThan(0);
  });

  test("a page without JavaScript draws the train from its noscript copy", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/");
    const shape = STILL_MANIFEST.shapes.anatomyWide;
    await expect(page.locator(`#anatomy .is-noscript use[href="${shape.href}#shell"]`)).toBeAttached();
    await expect(page.locator("#anatomy .anatomy-still:not(.is-noscript)")).toBeHidden();
    await context.close();
  });

  test("the terminus draws the arrived train above the closing plate", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#terminus .terminus-still:not(.is-noscript) use[href]").first()).toBeAttached();
  });
});
```
A few adjustments are yours to make:
- **The held chunk.** If `route.fetch()` followed by `continue()` double-fetches, fulfil the route with the fetched body instead, as `blockJourneyChunk` does.
- **Data Saver.** If `Navigator.prototype.connection` cannot be redefined in this Chromium, stub `navigator.connection` on the instance.
- **The no-JavaScript page** runs at the desktop project's viewport; on the mobile project, assert the tall shape.

- [ ] **Step 3: axe where the drawing stands (spec §5).** Add to `journey-axe.spec.ts`'s `POSITIONS`: `["drawing", "anatomy"]` and `["terminus", "terminus"]`. Add two tests in the file's style:
- "clean at Night, at the drawing": set `tt.theme=dark` and scroll to `#anatomy`.
- "clean on Data Saver, at the drawing": use the connection stub from Step 2.

The phone positions come from the mobile project, which runs the same file.

- [ ] **Step 4: DESIGN.md**
- **Motion section.** Extend the head-script sentence to: "The head script in the site layout (`src/components/motion/motion-boot.ts`) writes `data-motion` before first paint, from the stored choice (`tt.motion`, only ever `off`) and the device, and with it `data-saver` (Save-Data, a 2G or 3G connection, or reduced data) and `data-drawing` (`still` when Motion is off, on Data Saver, or once this session's drawing fell to its floor; else `live`)."
- **New paragraph, after Round instruments:**
```md
**The drawn train.** The landing's drawing chapter (GA) and terminus draw a WAP-7-style locomotive and LHB rake as
a hairline technical drawing: edges only, hidden lines removed, ink on the sheet in Day and Night, and the lit part
in steel. The still drawing is baked from the same three.js rig the live drawing (J5) uses
(`npm run bake:stills`, after any change to the scene); it is one SVG file per shape in `public/journey/`, coloured
by `currentColor`, fetched only when the page draws still. The drawing is decoration (`aria-hidden`); its ten
labels are a real list, beside the drawing with leaders on wide screens while the journey runs, and a parts list
under it everywhere else.
```

- [ ] **Step 5: The spec.** In `docs/superpowers/specs/2026-09-24-landing-journey-design.md`:
- **§3.D.** Replace "The script writes one sprite, `public/journey/stills.<hash>.svg` (symbols per part, strokes `currentColor`), and `still-manifest.ts`" with: "The script writes one file per shape, `public/journey/<shape>.<hash>.svg` (a group per part, strokes `currentColor`, each ink weight an inherited CSS variable), so a page fetches at most two, and `still-manifest.ts` (J4-2, J4-3)." Replace "The page shows a still by setting `<use href>` per part only when still" with: "The page shows a still by setting `<use href>` per part, for the shape its width shows, only when it draws still or its journey failed (J4-4)."
- **§6, after "Decided while planning J3":**
```md
Decided while planning J4 (2026-09-26):
- one still file per shape, not one sprite, to keep a page within its still budget (J4-2);
- the camera fit, the governor, the palette, the glow and the strip's hand-off pulse wait for the live drawing in
  J5, their only caller (J4-5; J3-8's pulse moves to J5);
- the parts list is the page's own layout; the journey stands the labels beside the drawing when they fit (J4-7).
```

- [ ] **Step 6: The whole gate and the whole suite, then commit**

```bash
npm run check && npx playwright test
```
Expected: green, with every failure reported with its test name and message and investigated. The last J3 run was 409 passed, 0 failed.
```bash
git add tests DESIGN.md docs/superpowers/specs/2026-09-24-landing-journey-design.md
git commit -m "docs(journey): the drawn train in DESIGN.md and the spec, with every drawing mode and its collisions under test"
```

## Finish: budgets, proof, then the owner's word

- [ ] `npm run check` and `npx playwright test` are green on the final head. Report any failures as they are.
- [ ] **three.js stays out of the page.** Run `npm run build`, then `grep -l "WebGLRenderer\|RoundedBoxGeometry\|EdgesGeometry" .next/static/chunks/*.js .next/static/chunks/**/*.js`. Expected: nothing. Also re-measure the journey chunk (`tt-journey-chunk`) against its 70 KB budget. `still-manifest.ts` joins it, so report the growth.
- [ ] **Still budget.** The unit test holds ≤ 60 KB per page. Report each shape's gzip size.
- [ ] **Screenshots** into the workspace: `#anatomy` at 1440×900 in Day and Night (columns and leaders), at 1440×900 with a label hovered, and at 390×844 (the parts list). Also the terminus in Day and Night, and v3's still drawing chapter at the same sizes for comparison.
- [ ] **Smoothness.** Rerun `tests/e2e/smoothness.spec.ts`. The still adds no animation, so there should be no change.
- [ ] **Push and PR only with the owner's word.** The branch stacks on J3 (and J2, J1). Unless those have merged, the PR carries their commits too.

## Self-review notes

1. `npm run check` and the full `npx playwright test` are green.
2. `git log --format=%B feat/journey-j3-journey-island..HEAD | grep -ci co-authored-by` prints `0`.
3. `grep -rn "from \"three" src --include=*.tsx` matches nothing. `grep -rln "scene/" src/app src/components/landing/*.tsx src/components/landing/journey/*.tsx` matches nothing. Only `scripts/bake/page.ts` imports the scene.
4. `grep -rn "#[0-9a-fA-F]\{6\}" src/components/landing/journey/scene scripts/bake` matches nothing (§3.E).
5. Every rule J4 adds to `journey-island.css` starts with `html[data-journey="on"]`. `journey.css`'s new rules need no JavaScript.
6. `teardown.spec.ts` passes with no new `LIVE` entry. The still leaves nothing behind across a Motion switch.
7. `still-manifest.ts` is generated, and a unit test fails when a scene source changes without a re-bake.

## What J5 inherits

- **The shared scene.** `pose.ts`, `scene/{math,util,lines,rig-parts,rig,line-world,world,apply-pose}.ts` and `rigSteps`. J5 adds `buildRigAsync` over `rigSteps`, `scene/fit.ts` (with `userData.noFit` for the beam), `scene/palette.ts` reading the tokens and re-reading on `tt:theme`, the glow sprites, and `applyPose`'s scan and line side.
- **The live loader.** `drawingModule(loadLive)`: J5 passes the scene chunk's loader, adds the WebGL probe and the `webgl` and `fit` reasons, and the governor writes `tt.q`.
- **The bake.** `BAKE_SOURCES` gains every scene file J5 adds that the still depends on. Re-bake when they change.
- **The live layout.** `html[data-drawing="live"]` has no layout of its own in J4. J5 pins `#anatomy` and draws into the holder `still.ts` places, and `keepsPlace` starts to matter.
- **The strip's hand-off pulse** lands with J5's departure (J3-8, J4-5).
- **`rig.loco`/`rig.length` and `pickables()` were dropped**, and J5's scan (v3 `scan.js:52`) needs `rig.loco`.
- **`drawingModule` needs a place for a synchronous starting probe** (`webgl`), so a page without WebGL never downloads three.js, and for the 20 s `load` timeout.
- **`page.ts` depends on `scene.background` being null** for hidden-line removal: null it during the passes, or throw, before any background is set in `buildWorld`.
- **`sourceHash` should also hash the three version and `scripts/bake-train-stills.mjs`.**
- **The bake-source minors queued for J5's re-bake:**
  - the header comments below the imports in `rig-parts.ts` and `rig.ts`;
  - the `rig.ts` Partial cast (check that all 11 parts are there);
  - the `rig.ts` relative import (esbuild resolves `@/`);
  - `drawHierarchy`'s error wording and its order of checks;
  - `MaterialMap` written twice;
  - the lint warning `_step` at `rig.ts:302`;
  - `shapeSvg` not validating its keys;
  - the `f1` name, which now rounds to 0.5 px;
  - `setClearColor(0x000000, 0)`;
  - `lines.test` casts.
- **The loader's rejection reason is not logged.** Log it once J5 has a real loader.
