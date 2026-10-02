# Landing journey — design

Date: 2026-09-24 · Status: **approved 2026-09-24**, with the J1 plan · Owner: Vibin Mathew

The landing ("/") becomes a train-themed scroll journey in the app's own Industry look: a drawn WAP-7-style
locomotive that is scanned, taken apart, labelled, coupled up and sent on its way as the page scrolls, and
every section around it turned into a railway instrument. The approved reference is prototype v3
(https://claude.ai/artifact/Bimwag2w9J1qTtHGUsd6u2, Version 3, build sha256 `8d830410…`), verified by a
scripted gate before approval. This spec turns it into the app: what ships, how it fits the codebase, how it
fails, how it is tested, and in what order it lands.

## 1. Where things stand

- The landing is `src/app/(site)/page.tsx`, a Server Component rendered per request (`await connection()`),
  with server-only sections in `src/components/landing/` (hero, principles, how it works, specimen record,
  reliability, roadmap, features, photo split, FAQ, closing plate) and two client parts: the check plates
  (`src/components/pnr/pnr-terminal.tsx`) and the IST clock.
- Motion today is small and fixed: the press, the theme icon turn, the invalid shake, the clock flip, the
  caret, the sweep bar, popup fades (DESIGN.md §Motion). Motion 13 is loaded as `LazyMotion` with
  `domAnimation` (no layout animations) and `MotionConfig reducedMotion="user"`.
- Found while planning: the reduced-motion rule meant to stop the press (`:where(button, …):active
  { transform: none }`) loses on specificity to the press rule (`:active` plus three `:not()`s), so under
  reduced motion a held button still settles to 96%, only instantly (checked in Chromium). J1 fixes it.
- The traveller CSP is static in `next.config.ts` (`script-src 'self' 'unsafe-inline'`, `worker-src 'self'`,
  `img-src 'self' data: blob:`; no nonces, so pages stay cacheable). three.js and Anime.js are not installed.
- Tests: Vitest (node + jsdom, no WebGL, no IntersectionObserver), Playwright on `next dev` in fixture mode at
  1280×800 and 390×844, axe on every route in both themes, a CSP spec, a responsive spec (320/360/390/768), a
  smoothness spec, and a tap-target spec (every control answers a finger across 44px on touch screens). Contract tests forbid raw hex outside the palette files, arbitrary text/rounded/z classes,
  off-scale spacing, and files over 500 lines.
- Prototype v3 exists as 41 throwaway ES modules (5.2k lines) plus its verification harness. It is the
  reference, not the code to ship: the app gets typed, tested modules built to its conventions.

Non-goals: new copy beyond what v3 shows; changes to the check, the API or the record page; the declined v3
options (a result-personalised drawing, a travelling request indicator in the plate, a platform train in the
hero, a draggable strip train, part inspection, a status lamp board).

## 2. Decisions already taken

Settled with the user between 2026-09-24 rounds 1–4, A–E, and the v3 approval:

- **Style:** the animejs.com manner in the app's Industry grammar: hairlines, registration marks, condensed
  capitals, one steel accent, follows Day and Night. Realistic 3D (PBR) was built and rejected.
- **Libraries:** Anime.js v4 (`animejs@4.5.0`, MIT) on native scroll with its `onScroll` sync; three.js
  (`three@0.186.0`) for the drawn train only. No GSAP, no Lenis, no scroll hijacking. Motion stays the app's
  UI motion library (the plate morph uses it).
- **The train:** a WAP-7-style electric locomotive and LHB coaches in steel, drawn as a 3D hairline technical
  drawing with hidden lines removed. Heading kept: "Every part answers to the source".
- **v2 features (all 14):** kinetic headline, living dial, chart countdown ring, plotter intro once per visit,
  label↔part highlight, dimensions and title block, berth plan (03), station clock (04), track-laying
  roadmap (05), departure board under the hero, ~~route strip (a left rail since 2026-09-27)~~ (removed by the owner, 2026-09-27), plate morph, registration-mark
  sound off by default (rail clack, departure horn) behind a footer switch.
- **v3 additions:** the window-seat run through 06–07, Night falls (theme sweep), line side passing at the
  departure, headlight beam at Night, scan reveal, adaptive quality, Data Saver, and the frame meter (a review
  tool: preview deployments and development only, §3.J; J5-10).
- **Motion off** (device setting or the footer Motion switch) means still drawings and static layouts.
  Phones get the same journey, lighter.
- **Copy:** the new words shown in v3 (the drawing chapter's heading and lead, the ten part labels, the
  departure board, the title block and caption, the nameboard "PLATFORM 3 · DEPARTURES", the kilometre posts)
  were approved with v3 and move into `src/messages/en-IN/home.ts` unchanged.

This changes three written rules, recorded here and in DESIGN.md when the work lands: the Phase 1 brief's
closed list of motions (the journey is the deferred Phase 6 motion pass); "only lamps and route stops are
round" (dials, the station clock and route stops are round instruments); and the older note that the hero
has no entrance animation (the headline's letters rise by transform only; the text is in the server HTML
and is the page's largest paint either way).

**Removed by the owner, 2026-09-27:** the route rail (#77) — "Actually we don't need this, remove it
completely," and, asked explicitly, the phone's hairline rail too. Nothing of it survives: the left column
(`#route-strip`), the phone rail (`PhoneRail` / `.phone-rail`), their journey modules (`strip.ts`,
`strip-position.ts`), their CSS, and their tests. "/" is full width again and the masthead is its plain 4rem
row; every other row below still holds. The mentions of the strip further down are kept, struck through, so
the history of what shipped and was then withdrawn stays readable.

## 3. Design

### A. Experience

Top to bottom, as in v3:

| Where | What happens | Motion off |
|---|---|---|
| Masthead (on "/") | ~~The route rail (from 48rem; approved 2026-09-27): a fixed 4rem column down the page's left edge, from the masthead's foot to the window's, with a hairline on its right; the page stands clear of it. Stations DEP, GA, 01–08, END top to bottom on a rail, each a full-width link at least 44px tall (an eleventh of the rail each in a window too short for that, never overlapping); a train glyph runs down the rail nose first as the page scrolls, leaning into speed; odometer KM 000→781 at the column's foot; the current stop is highlighted (no spelled-out station name). Phones: a hairline rail in the masthead's bottom edge.~~ **Removed by the owner, 2026-09-27: nothing of the strip or its rail survives, on desktop or on a phone.** The masthead keeps its own plain 4rem row, nothing added. | Glyph moves, no lean |
| Hero | Letters of the h1 rise; the plotter draws the masthead rule and the plate's hairlines once per visit; the living dial behind the plate lights segments as digits are typed; after a result, a 24-hour face marks the chart time printed in the record (never computed) with "Chart HH:MM IST · in 3 h 12 min". | Dial and face drawn still |
| Departure board (new) | "Departures · Platform 3": the page's sections as departures with code, km and status (NEXT, AT PLATFORM, DEPARTED); rows flip in; names link to their sections. | Static board |
| The drawn train (new, pinned) | A solid steel locomotive; a scan gate sweeps it nose to tail into the line drawing; it turns and comes apart into ten labelled parts (label↔part highlight on fine pointers); side elevation with dimensions; coaches couple, the pantograph rises, the train departs with the camera riding along past masts, a signal gantry and Platform 3's nameboard, and leaves the frame (J5-1). Night: light-on-dark, steel glow, headlight beam. | The still drawing |
| 01 Principles | Kicker flips in; rows rise into place (transform only). | Static |
| 02 How it works (pinned) | Three stops play inside one instrument dial; a request-trace card prints each stop. | Plain section |
| 03 Record | Coach B1 · 3A berth plan beside the specimen; the sample passenger's berth lights. | Plan drawn still |
| 04 Reliability | Station clock (IST) with sweeping second hand. | Hands at rest |
| 05 Roadmap | The route line lays its sleepers; a train follows the curve lighting each row. | Line drawn still |
| 06–07 Window-seat run (pinned, sideways) | Scroll carries the two sections sideways past a window along a line diagram: kilometre posts KM 530→644 and a platform per station at the train's pace; far masts slower; near posts faster; the train holds the window; the station at the window lights. Tab and station links bring a card to the window; touch stops settle a card at the window. | Sections as today |
| 08 FAQ | Arrivals. | Static |
| Terminus | The full train arrives above the closing plate; Night: headlight beam. | The still terminus drawing |
| Footer (landing) | Motion switch (on; off and disabled with a note under reduced motion) and Sound switch (off). | — |
| Page-wide | ~~Registration-mark cursor (fine pointer, motion on)~~ (removed by the owner, 2026-09-30: it hid the native pointer page-wide and framed every control it rested on). Night falls: the theme switch sweeps the new theme out from the button in a circle (same-document View Transition). | Instant theme switch |

**Section entrances play once per load** (the owner, 2026-09-30, reverting 2026-09-25). Five entrances play
once per page load and never replay when the reader scrolls back: the section kickers flipping in, rows rising
into place (01, 03, 04, 05, 06, 08), registration marks snapping onto plates, the departure board's rows flipping in,
and 03's berth plan drawing itself and lighting the sample berth (it draws once, then stays).

*When each plays.* An entrance whose trigger is visible when the journey starts (any of it in the window) plays
once, right then, at load, like the headline: so a desktop window loaded at the top, with the board at its foot,
flips the board's rows in at load, and no board ever waits blank. One out of sight at start waits armed and plays the
first time it enters its band, the middle of the window (from 12% to 88% of its height; 10% to 90% for the board and
the berth plan, 8% to 92% for the plates' marks), from either side, so a reader who lands deep (an anchor, a reload)
and scrolls up sees it play once. A reload mid-page plays whatever is visible then, once.

A reload plays them again. A rebuild (Motion off, then on) never replays a section already played (one not yet
played, visible as Motion comes back on, plays then, as at a start): the played set
lives in the journey's context, beside the still's place and the engine, for the whole of that startJourney (a fresh
client navigation back to "/" starts fresh, as a new page). The hero headline's letters play once per load, and the
plotter intro once per visit. Everything tied to the scroll position (the drawing chapter, dial, run and route)
still follows the scroll both ways. Motion off: static, as before.

*History:* from 2026-09-25 to 2026-09-30 the four section entrances replayed ("Section entrances replay"): each
reset out of sight once its section had fully left the window and played again every time it came back, and the
berth plan, counted then among the scroll-tied pieces, redrew each time it came back. The owner reverted both on
2026-09-30. Two intermediate rules were tried the same day and replaced: a section in the window at start was left at
rest as "seen" (so the desktop board, peeking in at load, never flipped); then only one properly in the band counted
as seen and a peeking one waited armed, blank, until scrolled in. After seeing that blank board, the owner ruled
that anything visible at start plays at start.

Every pinned piece (drawing chapter, chapters dial, run) measures its content against the visible window and
falls back to its static layout when it cannot fit: short windows show only the current stop's words, phones
on their side put the dial beside its stops and the parts list beside the drawing, very large text lists the
parts under the drawing, and anything that still cannot fit unpins.

### B. Architecture

Three layers, loaded in order, so the check never waits for, or depends on, the journey:

1. **Page (server).** Every section's markup, including all new ones, rendered by Server Components from pure
   geometry and copy modules: the dials, clock face, berth plan, route map, departure board, route strip, the
   run's frame (its window's lines are drawn by `run.ts` from `geometry/run.ts`, since they follow the cards'
   measured widths; J6-6, accepted at J6's pre-flight), the labels, title block and legend. With no JavaScript
   the page is complete and static.
2. **Journey (client island).** `JourneyLoader`, a small client component on "/", imports the journey chunk
   after hydration when the page is idle (`requestIdleCallback`, 1.5 s timeout) and calls its
   `startJourney(root)`. The chunk (Anime.js + journey modules, ≤ 70 KB compressed) animates the server
   markup imperatively, outside React's render loop, and returns one teardown. Every module returns its own
   teardown, so a rebuild (the Motion switch, Strict Mode's double mount, leaving "/") is idempotent. An error
   boundary and a watchdog (15 s) turn a failed journey into the motion-off page — by writing
   `data-journey="failed"`: every moving or pinned state requires `data-journey="on"`, and the reader's Motion
   choice is never changed (J3-1).
3. **Live drawing (client, on demand).** When the drawing is live, or held still only by `place` (then the
   scene prepares in the background, J5-2), the journey dynamically imports the scene chunk (three.js + scene,
   ≤ 240 KB compressed). The rig is built a part at a time, yielding between parts (≤ 61 ms per step at 4× CPU
   slowdown); coaches and bogie frames share geometry; shaders compile in the background (`compileAsync`). One
   fixed canvas draws each visible stage into its own scissored rectangle, and draws only when a stage is on
   screen and its progress or position changed.

The plate morph (a result growing out of the plate; ruling J3-13) tweens height imperatively — `animate` on a
Motion value, not the declarative `animate` prop — between the entry's and the record's measured heights,
under the app's strict `domAnimation` `LazyMotion`: a prop-driven keyframe update on an already-mounted `m.div`
does not interpolate `height` there, only the imperative engine does. The new face rises 8px and the old goes
at once, never fading text; a still-running tween is stopped on every face change before the next one starts,
so it never writes a stale height or fires a stale `tt:layout`. Motion off, or an unchanged height: an instant
swap.

**State.** A small inline script in the `(site)` root layout's `<head>` writes, before first paint:
`data-motion` (`on`/`off` from reduced motion and `tt.motion`), `data-saver`, and `data-drawing`
(`live`/`still`). CSS pins sections only under `html[data-motion="on"]`, and pins and draws the drawing
chapter live only under `#anatomy.is-live`, which the journey writes while the live drawing runs, alongside
`html[data-drawing="live"]` (J5-3), so the no-JS default is static. The journey adds `data-journey` and
`data-drawing-why`. Events on `window`: `tt:layout`, `tt:theme`, `tt:station`, `tt:depart`, `tt:drawing`,
`tt:webgl`. One shared registry of scroll observers is refreshed on `tt:layout`. Section entrances are
checked live against boxes, so jumps and reloads never strand anything. Each one visible when the journey starts
plays then; each out of sight is armed and plays the first time it enters its band. Once per load: a played entrance
never arms again, across rebuilds too (§3.A, 2026-09-30). Motion off also applies the site's
reduced-motion rules (motion.css) to every traveller page, so the switch means the same thing everywhere
(confirmed, §7; built in J1).

**Module map** (all TypeScript, strict, each file < 500 lines; path `src/components/landing/journey/`):

| Group | Modules |
|---|---|
| Server markup | ~~`route-strip.tsx`~~ (removed by the owner, 2026-09-27), `departure-board.tsx`, `hero-dial.tsx`, `drawing-chapter.tsx`, `chapters-instrument.tsx`, `berth-plan.tsx`, `route-map.tsx`, `window-run.tsx`, `terminus-stage.tsx`, `journey-switches.tsx` |
| Pure geometry and logic (unit-tested) | `geometry/dial.ts`, `geometry/clock.ts`, `geometry/berths.ts`, `geometry/route.ts`, `geometry/run.ts`, `pose.ts` (anatomy and terminus poses), `governor.ts`, `labels-layout.ts`, ~~`strip-position.ts`~~ (removed by the owner, 2026-09-27), `drawing-mode.ts`, `fit.ts`, `chart-countdown.ts` |
| Client island | `journey-loader.tsx`, `start-journey.ts`, `observers.ts`, `motion-tokens.ts`, `intro.ts`, ~~`strip.ts`~~ (removed by the owner, 2026-09-27), `board.ts`, `hero.ts`, `chapters.ts`, `berths.ts`, `station-clock.tsx`, `clock.ts`, `route.ts`, `run.ts`, `arrivals.ts`, ~~`cursor.ts`~~ (removed by the owner, 2026-09-30), `sound.ts`, `drawing.ts`, `still.ts`, `keep-place.ts`, `live-labels.ts`, `webgl-probe.ts`, `hud.ts`, `hud-gate.ts` |
| Scene (three.js) | `scene/engine.ts`, `scene/rig.ts`, `scene/rig-parts.ts`, `scene/lines.ts`, `scene/line-world.ts`, `scene/departure.ts`, `scene/beam.ts`, `scene/scan.ts`, `scene/fit.ts`, `scene/apply-pose.ts`, `scene/palette.ts`, `scene/live.ts`, `scene/glow.ts`, `scene/scene-mark.ts` |
| Build-time | `scripts/bake-train-stills.mjs`, generated `still-manifest.ts` |

Night falls lives with the theme button, not the journey: `src/components/theme/night-falls.ts`, shared by every
traveller page (J6-10, accepted at J6's pre-flight).

### C. Drawing modes

The train is drawn **live** unless a reason holds; reasons come and go and the page follows:

| Reason | When | Back to live |
|---|---|---|
| `motion` | Motion off | the switch goes back on |
| `saver` | Data Saver, a slow-2g/2g/3g connection, `prefers-reduced-data` | next visit without them |
| `webgl` | no WebGL 2, or the GPU drops the context | the context is restored |
| `quality` | adaptive quality's floor (below) | next session |
| `load` | the scene chunk failed or took over 20 s | the next rebuild (a Motion toggle, a fit change) retries |
| `fit` | the chapter cannot fit its words even as a list | the next rebuild |
| `place` | the reader is below the chapter's top when the live drawing would begin | they come back above it |

While `place` is the only reason, the scene still loads and builds, so the switch is immediate (J5-2).

**Still** is the same drawing baked at build time (§3.D): unpinned, fully apart, every label beside it with
leaders to its part (or listed under it), label↔part highlight kept; the terminus shows the arrived train. A
still page never downloads three.js, except while `place` is the only reason, when the scene prepares in the
background (J5-2). Whether the chapter fits is judged before the scene is fetched: `drawing.ts`'s `liveFits` lays
the pinned chapter out for an instant, measures it with `live-labels.ts`'s own `layout()` (a DOM measurement, no
three.js), and puts it back in the same task (J6-5). The scene's own check, on every relayout while live, stands
behind it. Switching mid-chapter keeps the reader at the chapter's start.

**Adaptive quality.** A governor watches intervals between frames the drawing actually drew within one scroll
gesture. An interval over 120 ms with no scroll inside it is a pause between gestures and never counts, nor does one
across a frame with nothing to draw or the drawing leaving the screen; an interval the page scrolled through counts
however long, so a device drawing under 8 fps still steps down and reaches the still. p90 over 26 ms for 30 frames
steps down (resolution 2× → 1.5× → 1×; Night effects off; coaches 3 → 2 → 1), waiting 45 frames after each change;
p90 under 18.5 ms for 180 frames steps up (at most twice); still over 40 ms at the lowest step asks for the still
drawing. The step is kept in sessionStorage (`tt.q`).

### D. The still drawing

`scripts/bake-train-stills.mjs` runs the real scene code in headless Chromium: it poses the rig exactly as the
page would, renders the fills depth-only with the live polygon offset, renders every edge in its own ID colour
depth-tested against them, and walks each edge across the image keeping only the stretches whose colour
survived. The result is SVG paths per part (anchors for the ten labels included) for four shapes: drawing
wide and tall, terminus wide and tall (17–34 KB compressed each). The script writes one file per shape,
`public/journey/<shape>.<hash>.svg` (a group per part, strokes `currentColor`, each ink weight an inherited CSS
variable), so a page fetches at most two, and `still-manifest.ts` (J4-2, J4-3) (the hashed path, viewBoxes,
anchors, and a hash of the scene sources it was baked from). `next.config.ts` serves
`/journey/*` as `public, max-age=31536000, immutable`. The page shows a still by setting `<use href>` per
part, for the shape its width shows, only when it draws still or its journey failed (J4-4); a `<noscript>`
copy covers pages without JavaScript.
A unit test fails when the scene sources change without a re-bake.

### E. Scene colours and tokens

No hex in the scene: `scene/palette.ts` reads the theme's tokens at runtime (`--surface-0`, `--ink-1`,
`--accent`, `--accent-text`; J5-8) with `getComputedStyle`, parses them into three.js colours, and derives
the scan's steel shades by mixing `--accent` with ink and ground. It re-reads on `tt:theme`. Canvas text (the
nameboard) uses the heading face from its CSS variable once `document.fonts` has it.

### F. Night falls

The theme toggle's click runs `document.startViewTransition(async () => { flushSync(() => setTheme(next)); await
themeApplied(next); journey.redrawNow(); })` and animates `::view-transition-new(root)` with a clip-path circle
from the toggle's centre (640 ms, `--ease-in-out`). `themeApplied` resolves when `data-theme` changes (a
MutationObserver, 100 ms cap). No View Transitions, reduced motion or Motion off: the switch is instant.
`::view-transition { pointer-events: none }` keeps clicks working during the sweep. It runs on every traveller
page where Motion is on (`html[data-motion="on"]`); the console, which has no Motion switch, always switches at
once (J6-10).

### G. Accessibility

The drawing and every instrument are decorative (`aria-hidden`); the ten labels are a real list (visually
hidden, never removed, in the list layout). Reveals move by transform, never opacity, so contrast holds at every
moment. Focus is never hidden under the masthead (WCAG 2.4.11); every link in the run brings its station to
the window; the skip link stays the first Tab stop. 200% text reflows (container queries in rem, as in
`3a8b0f3`). On a touch screen every control the journey adds (switches, station links, the run's stops)
answers a finger across 44px without changing the drawing (#43's coarse-pointer rule, `.tap-44`,
`tests/e2e/tap-targets.spec.ts`). Forced colours read in both system themes. Sound starts only by the
reader's hand.

### H. Performance budgets

| Budget | Target | v3 measured |
|---|---|---|
| Check interactive | never waits on journey code | holds; a blocked CDN still leaves Run working |
| Journey chunk | ≤ 70 KB compressed | Anime.js 39 KB (full) + modules |
| Scene chunk | ≤ 240 KB compressed, live only, except while `place` is the only reason (§3.C) | three.js ~188 KB (full) + scene |
| Still drawings | ≤ 60 KB compressed per page | 23 + 34 KB |
| Longest journey task at load, 4× CPU phone | ≤ 120 ms | scene steps ≤ 61 ms (page total 202 ms incl. first layout) |
| Scroll, reference desktop | p95 ≤ 12 ms, 0% > 25 ms | p95 9.8 ms, 0% |
| Scroll, 4× CPU phone | median ≥ 55 fps, ≤ 2% > 33 ms | 63 fps, 0.7% |
| Layout shift at load | CLS ≤ 0.05 | 0.009 |
| Drawing progress | never steps back while scrolling down | 0 |

`npx next experimental-analyze` confirms three.js stays out of the landing's initial bundle.

### I. Security

three.js and Anime.js are bundled from npm (no CDN), with no `eval`, WebAssembly, `data:`/`blob:` fetches or
blob workers, so the traveller CSP is unchanged. The head script is inline like the theme's. The stills are
same-origin static SVG without scripts. Web Audio needs no permission or CSP change.

### J. Not shipped from the prototype

The Prototype panel (a review tool). The plate re-enactment and captured markup (the app has the real
components). The CDN import map (the app bundles). The frame meter ships only on preview deployments and in
development, behind `?journey-hud`; production never renders it.

## 4. Failure behaviour

| Failure | What the traveller gets |
|---|---|
| Journey chunk fails or never starts (offline, blocked, script error) | The check works as today; after the error or the 15 s watchdog: motion off, static layouts, the still drawing. |
| Scene chunk fails | Still drawing (`load`); everything else keeps moving. |
| No WebGL 2 | Still drawing from the start; no three.js download. |
| GPU drops the context | Still drawing at once; live again when restored. |
| Device too slow | Quality steps down, then still for the session. |
| Very large text / short window | Parts list, compact stops, unpinned sections, still drawing when nothing else fits. |
| The still sprite fails to load | Labels and list remain; the drawing area stays empty (no broken image). |
| Motion switch toggled mid-page | Rebuild in place, reader kept at the same section. |

## 5. Tests written first

- **Unit (Vitest, node):** poses (bounds, phase windows, still pose), governor (synthetic frame streams: step
  down, up, floor, cool-down), label column placement and zone, strip position, run anchors and current
  station, drawing-mode reducer, fit checks from boxes, chart countdown, the bake's ID-run extraction on a
  synthetic buffer, palette parsing of token strings, the still-manifest staleness hash.
- **Unit (jsdom):** server markup (landmarks, ids, labels list, aria-hidden decoration), switches' state and
  persistence, the loader's error boundary and watchdog (timers faked).
- **E2E on every PR** (`tests/e2e/journey/`): collisions (the prototype's in-page checker as a shared helper:
  text over text, panels over text, the drawing's box over any label, crossing leader lines, sideways scroll)
  at 1440×900, 390×844 and 844×390, dense through the three pinned pieces; every drawing mode (live, Data
  Saver, reduced motion, no WebGL, context lost and restored, journey chunk blocked, scene chunk blocked,
  quality floor); the check on every sample scenario with the journey on and off; run keyboard and station
  links; theme sweep; axe at 12 positions (top, drawing, chapters, record, Night drawing, motion off, phone
  drawing, run, Night run, phone run, Data Saver, Night terminus); focus never obscured; existing home, responsive, axe, CSP,
  smoothness, press and tap-target specs kept green. The responsive sweep (280, 320, 360, 390 and 768) measures the
  landing as the journey leaves it, the run pinned where it fits; the track the run's pin clips on purpose is left to its
  own check there (only while the pin clips, never a scroller), which stands each station at rest, every word of it,
  wholly in the window at every width the run pins at, and nothing sideways. The landing is also swept with its text
  at 200% at the four phone widths: the departure board then reflows its rows inside its plate, by a container query
  in rem, so at 100% it stays the table (found 2026-10-01).
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
    - the place, run, Night falls and drawing specs in WebKit;
    - a device too slow to draw (Chromium at 60× CPU, once the drawing is live, scrolled once a frame): quality steps
      down, then the still (`quality`), with its frames checked to run past the governor's 120 ms gesture gap
      (`tests/e2e/nightly/slow-device.spec.ts`; the governor's rules are unit-tested on every PR).

  GitHub's runners have no GPU, so §3.H's frame-time and long-task budgets are measured by hand on a real GPU
  (`npm run build:local && node scripts/journey-perf.mjs`, the owner's Mac), and their lines go into every journey PR.

## 6. Order of work (one PR each)

| PR | Scope | Visible result |
|---|---|---|
| J1 | The Motion switch: the head script (`data-motion`), Motion off applying the site's reduced-motion rules everywhere (with the press fix, §1), Motion's own animations following it, the footer switch, DESIGN.md's Motion section; the shared e2e collision checker, with today's landing as its baseline | The footer's Motion switch |
| J2 | Server instruments: route strip, departure board (without its status column), hero dial, berth plan, station clock, route map, all static, with their copy and container sizes; DESIGN.md's round-instruments rule | The new instruments, drawn still |
| J3 | Journey island: `animejs` added; loader, observers, arrivals, intro and headline, strip, board, hero dial, chapters (pinned, fit rules), berths, clock, route, cursor, the Sound switch and its clack, plate morph; journey motion tokens; DESIGN.md's motion and hero-entrance rules; the chapters instrument; the departure board's status column | The page moves (except the train and the run) |
| J4 | Still drawing: `three` added; the rig, poses and fit the bake and the live scene share; bake script, sprite, manifest, drawing chapter and terminus markup with the still; the head script gains `data-saver` and `data-drawing`; GA joins ~~the strip and~~ the board (the strip removed by the owner, 2026-09-27) | The train, drawn still |
| J5 | Live drawing: engine, anatomy and terminus, scan, departure line side, beam, governor, WebGL loss, the departure horn, the frame meter | The train comes alive |
| J6 | Window-seat run and Night falls; nightly workflow; performance budgets | v3 complete — done (J6) |

Moved while planning J2 (2026-09-25): the chapters instrument and the board's status only exist with
scroll-driven motion, so they land in J3; GA's station lands with its section in J4.

Decided while planning J3 (2026-09-25):
- ~~the phone strip is its own aria-hidden rail (J3-7)~~ (removed by the owner, 2026-09-27);
- ~~the strip's hand-off pulse~~ and the departure horn land with their callers in J4/J5 (J3-8; the pulse is moot, the strip removed 2026-09-27);
- the plate morph tweens height on `domAnimation` (J3-13).

Decided while planning J4 (2026-09-26):
- one still file per shape, not one sprite, to keep a page within its still budget (J4-2);
- the camera fit, the governor, the palette, the glow and ~~the strip's hand-off pulse~~ wait for the live drawing in
  J5, their only caller (J4-5; J3-8's pulse moves to J5, then is moot: the strip removed by the owner, 2026-09-27);
- the parts list is the page's own layout; the journey stands the labels beside the drawing when they fit (J4-7).

Decided while planning J5 (2026-09-27):
- the rail is gone, so the departure hands over to nothing: the train leaves the frame (J5-1);
- a seventh reason, `place`, keeps a reader below the chapter on the still until they come back above it (J5-2);
- one owner, `drawing.ts`, for the live pin's height changes and the reader's place around them (J5-3); a reader inside
  the pin when its height changes lands on its start, and since J6 only when it changes shape: a resize keeps them the
  same fraction through it (decided after J6, below);
- the engine lives for the journey and is reused across rebuilds and restores (J5-4);
- labels while live wipe in and rise, never fade, with their own writers (J5-5); until a frame has placed them after a
  layout (the pin's `data-drawn`), they and the dimension figures stay wiped and the leaders hidden, so a jump into the
  chapter never shows them unplaced over the masthead before the stage's first frame (found 2026-10-01);
- the palette reads four tokens (J5-8);
- the frame meter ships with J5, for the owner's real-device check (J5-10).

Decided while planning J6 (2026-09-28):
- CI's Playwright run in four shards, the console suite in its own job, one `e2e` gate; the chunk budgets on every
  PR (J6-1);
- a production build serves the fixture only on this machine: `LOCAL_FIXTURE`, refused on Vercel and beside any live
  credential, with an offline guard in the server (J6-2);
- the nightly measures what a GPU-less runner can; frame times and long tasks are measured by hand on a real GPU
  (J6-3);
- one rule for where the reader goes, `readerPlace`, for every piece that changes height (J6-4): above it (its top in
  the window, or within 8px above), nothing moves them; inside it (over half the window still in it), a change of shape
  (Motion off or on, a pin or an unpin, live to still, the run failing to fit) lands them on its start, under the
  masthead, and a resize or relayout of the same shape keeps them the same fraction through it, measured as its timeline
  measures it (`placeInProportion`; decided after J6, below); past it (its foot within the window's top half), they
  move by exactly the change;
- `fit` judged before the scene is fetched, by a trial layout (J6-5);
- the run's frame is server markup, its lines drawn by `run.ts` (J6-6; a departure from §3.B, accepted at J6's
  pre-flight); it pins by `#run.is-running` inside `keepPlace`, only while the reader is not below it (J6-7); links
  to 06 and 07 bring their stations to the window (J6-8). Its fit (found 2026-10-01): every station stands above the
  line diagram, and every station at its resting point, centred on the train, stands wholly inside the pin. The train
  holds a third in (the middle on a phone), moved in only as far as the widest station needs (`trainFor`; at 768 wide,
  07's figure ran 96 px past the pin's left side a third in); where no place holds it, the run does not pin;
- J5-17 amended (the owner, 2026-09-28), amended again (the owner, 2026-09-29): the reader taking over cancels the
  Back restore. That is a mostly vertical wheel that is not a pinch-zoom, a finger dragging, a scroll key (the arrows,
  Page Up and Down, Home, End, Space) outside a text field with no Alt, Ctrl or Meta, and Tab or Shift+Tab, and
  Alt+Tab (Safari moves to links with Option-Tab), but not Ctrl+Tab or Meta+Tab (the browser's own tabs). Space
  cancels only where it would scroll the page: on a control that takes Space (a button, a switch, a checkbox, a
  radio, a summary, a select, a text field, or a control with such a role) the control acts and the restore goes
  on; on a link it does cancel, since Space scrolls past a focused link and never follows it; Shift+Space follows the
  same rule. A trackpad's swipe back, a tap and every other key leave it pending (J6-9);
  `focus-glide.ts` lets go of a glide by the same rule (`ownScroll`);
- Back into the run returns the reader where they left: a section riding it is read where `run.ts` says it stands
  (`data-run-at`), so a reader who left at 07 comes back to 07 (J6-9);
- Night falls on every traveller page with Motion on, from the theme button's own module,
  `src/components/theme/night-falls.ts`, not the journey's `theme-sweep.ts` (J6-10; a departure from §3.B, accepted
  at J6's pre-flight);
- the nightly on a schedule, and on the pull request that changes it (J6-11); WebKit in the nightly (J6-12); 200%
  text at the PR's three sizes (J6-13).

Found while building J6 (2026-09-28):
- the by-hand frame-time check runs `npm run build:local && node scripts/journey-perf.mjs` after the gate: the
  gate's plain `npm run build` leaves the build unstamped, and the served production path refuses an unstamped
  build; the nightly runs `npm run build:local` too;
- a Tab glide that a place-keeping jump cuts short is taken up again (`focus-glide.ts`): armed only after a real
  Tab (Option-Tab counts, since Safari moves to links with it; Ctrl or Meta combinations never count), taking up
  at most 3 cuts, and letting go on the reader's own scroll, a pointerdown, or after 10 still frames; it also
  re-aims once after Safari's own focus reveal, while the watch is armed;
- after J6 (the owner, 2026-09-28): a Tab glide that a layout change cuts short is taken up too, under the same bounds
  (the same 3 takes, shared with the jumps). The browser sets a glide's end as it begins, so a piece that grows or
  shrinks between the reader and the link (the live drawing pinning a frame after the Tab, a late web font, a resize)
  leaves the glide landing where the link was. It counts only when the relayout (`tt:layout`, or the window's resize)
  moved the link on the page, and only while the page still stood between the glide's start and the farthest a reveal
  could take it: a relayout that finds a reader dragged off that course lets the glide go (a jump alone still takes it
  up, as in J6); a journey rebuild (a late font changing a piece's fit) hands the watched glide to the rebuilt module in
  the same task, with the takes it has left, under the same course rule; a station of the running run stays `run.ts`'s;
- at 200% text, the masthead folds its nav into the menu button whenever the nav can't hold one row, sitewide
  (100% text unchanged), by a container query in rem on an inner div, not the sticky header, since WebKit reads
  the header's box stale during the run's unpin; the nightly's sweep adds 1024×768 at 200% text, and fails on
  text clipped inside the page;
- Motion off relays the drawn train's columns inside the rebuild's own task, so 02's place guard never reads a
  half-built page; before this, WebKit moved the reader 304 px.

Decided after J6 (the owner, 2026-09-29): a resize keeps a reader inside a piece the same fraction through it; a change
of shape still lands on its start.
- The fraction runs as each timeline's range does, from its top where the timeline starts to its foot at the large
  viewport's foot (100lvh, as anime's scroll observers measure it, a phone's toolbar shown or not). The timeline starts
  under the masthead, but for the live pin it starts where the pin takes hold, its sticky top (`pinTop`): in the list
  layout on a phone that is the words' height above the masthead's foot, which moves with the window (their top padding
  is in vh), so it is kept with the place in the window the reader read in and measured afresh after the resize, before
  the labels write it (found 2026-10-01: from the masthead, 844 to 660 left the reader 0.0106 of the range off). The timelines are linear, so it
  is their progress: the same stop and frame come back. "Its start", for a change of shape, is where it always was (02's
  scroll margin, 1rem lower than its timeline's start).
- A reader beyond that range's end, its foot still in the window, keeps their distance from the foot, but never goes
  back inside the range when the window gets shorter (the review, I1).
- 02's guard tells a resize from a change of shape by #how's shape as the page shows it (Motion, and pinned or plain),
  compared with the shape it last settled; the Motion switch reaches it as a change of shape.
- The run answers a resize from its pin's own observer, after 02's guard in the same frame, and from the place the reader
  last read it in: the page has laid the new window out, and moved the reader for the pieces above, by then.
- WebKit lays a resize out in steps, a frame or more apart and in any order, `innerHeight` the new window's throughout:
  what 100vh sizes (02's 330vh, the live pin's 520vh), and what 100svh and 100lvh size (the still's columns, the run's
  pin, every timeline's end), mostly those two together, with "resize" between the steps or after them (found
  2026-09-30). Every piece that keeps a place across a resize (02's guard, the live pin, the run) learns the window the
  reader read in, and answers a resize, only while the page is laid out for one window (`laidOut`): 100vh less 100lvh
  is the page's own gap (0 in every engine), and 100vh, 100svh and 100lvh have all moved since the page was last laid
  out, or none has (a phone's toolbar moves none). A change that lands between the steps is answered at the step that
  completes it. The pieces hear it through one observer of the page's own measures of the window (`watchView`), in
  document order: the live pin above answers before 02's guard (as "resize", heard before any observer, always let it),
  and the run below last. So 02's guard, settling once for every step, covers the still's columns above it, as
  `still.ts` assumes. Measures that stand apart for a second are the page's own (a browser that moves one unit alone):
  adopted then, and every piece that waited is told. A change of shape (Motion's switch) settles 02 at once, laid out
  or not: its move uses no window height, and J6-7's order holds. `viewHeight` reads the large viewport from the layout
  each time, never kept by the window's size.

Decided after J6 (2026-10-02): an in-page link's glide is taken up again, as a Tab stop's is, when it is cut short.
- The browser sets a glide's end as it begins. A window resized a few frames in (a phone's toolbar) moves every section
  below a piece sized by the window (the still's columns, 02, the run) out from under that end, with no jump; a
  place-keeping jump made meanwhile cancels the glide outright; and WebKit's own scroll anchoring, answering the resize,
  stops it where it stands with nothing for the page to hear. Measured on the board's links to 07 and 08: short on every
  run in Chromium's phone, and in about 4 runs in 10 in WebKit's.
- The click arms the same watch a Tab's focus does, under the same bounds: taken up two frames after a jump, or after a
  relayout that moved the target while the page stood on the glide's course, at most three times; let go by the reader's
  own scroll (a wheel, a finger moving, a scrolling key), a press, or ten still frames. It is taken up to the link's
  target at its landing while the address still names it (`focus-glide.ts`); a link to 06 or 07 of the running run to
  its first station while focus is where the click put it (`run.ts`). No rule for a Tab's glide changed.
- Scroll anchoring is held off (`overflow-anchor: none` on the root) only while a link's glide is watched, and given back
  as the watch lets go. The page keeps its own places without it, as it does on every browser that has none.
- A link's glide runs the whole way to its target, so "between where it began and its target" cannot tell the glide
  from a reader's own hand: a scrollbar's drag (no wheel, touch, key or press) short of the target, then a resize,
  carried the reader on to the target (the review, 2026-10-02; main leaves them where they put the page). A link's
  glide is therefore followed frame by frame against the end the browser set for it (`followGlide`): the browser's own
  goes on toward that end every frame, never back, never stopping more than 64 px short of it, never dropping below a
  quarter of its last speed there. Three frames in a row that do any of those are the reader's, and the glide is let
  go. One or two are forgiven (a frame the scroll did not advance in, on a loaded machine), so a drag younger than
  three frames when the resize lands is not yet known. A Tab's glide is not followed so; its course rule stands.
- Back mid-glide is the reader's: the watch lets go for good as the address stops naming the target (`popstate`), and
  takes nothing up while the address names something else. The run's take-up held to where focus was, which a rebuild
  moves; it holds to the address now, and a link's glide to 06 or 07 is handed through the journey's rebuild as
  `focus-glide.ts` hands its own.
- A link the router handles (the masthead's to the terminal, a Next `<Link>`: its click arrives with its default
  prevented, and the router glides to the fragment a few frames later) is watched from its click too, with half a
  second for the glide to begin (30 frames, where a Tab's has six).

Found after J6 (2026-10-02): the live pin's sticky top after a resize is its labels' once laid out for the new window.
- A tablet turned (768×1024 to 1024×768 and back) flips the live chapter's labels between the list and their columns,
  and the pin's sticky top with them (202 px: the words' height above the masthead's foot, or under it). The chapter
  stays live and pinned, its timeline the same: a resize of the same shape, not a change of shape.
- `drawing.ts` answered the resize before the scene laid its labels out again, so its range after the turn started at
  the layout before's sticky top, and a reader inside the chapter landed (1 − f) × 202 px off: 151 px at 25%, 80 at
  60%, 20 at 90% (0.047, 0.025 and 0.006 of the range), the same both ways round and with scroll anchoring on or off.
  It now asks the scene to lay the labels out first (`pinTopLaidOut`), then reads the sticky top: within 4 px.
- In WebKit that still failed about 3 turns in 10: the labels chose their layout from a media query made when they
  were built, which WebKit leaves at its old answer through the "resize" that changed it, so the layout asked for at
  the answer was the list again and the columns came a frame later. The labels now ask the query afresh at each layout.
- 02 itself (columns at 64rem and up, its list below; 330vh and 300vh) was measured through the same turn at 25%, 60%
  and 90%, both ways and with anchoring on and off, in Chromium and WebKit, the drawing live or still: within 1 px
  (0.0003 of its range). Its guard needed no change; `place.spec.ts` now holds both there.

Found after J6 (2026-10-02): 02's guard reads the reader's place as 02 itself decides to pin or to let its pin go.
- The guard learns the reader's scroll from "scroll" events, and none once #how has changed size until it has settled
  (such an event may be the browser's own move). A reader below a plain 02 who jumps to the top can have 02 pin (its
  refit's timer, a "resize") before that jump's event is told: judged from the place before it, they were "past 02" and
  thrown back down by the pin's growth, to the run, where the drawing stays still (1 run in 30 at 6× CPU, and in 1 of 60
  measured again).
- `chapters.ts` now says when 02 is about to pin or to try its fit again (`tt:how-before`), and the guard reads the
  reader's place and #how's box then, as it does on `tt:layout` and before Motion's switch. The rules for a resize, a
  change of shape, the split resize and the Back restore are unchanged.

Found after J6, finishing 200% text (2026-09-29; 100% text unchanged throughout):
- the masthead keeps one row at 390×844 with 200% text: below 16.5rem of its inner query container SIGN IN keeps only
  its icon (its name stays, visually hidden), as it already does below xs; 16.5rem is 264px at 100% text, inside xs.
  A narrower phone at 200% (360px, 280px) still takes the last-resort second row;
- section headings (`heading-fit`) grow with larger text only while the column holds their longest word whole,
  CONSTRUCTION, and never below the drawn 32px: no word breaks from 280px up at 200% text; `wrap-anywhere` breaks a
  word only in a column narrower than that word at 32px (a window under about 260px at 200%);
- nothing is cut short with an ellipsis: the route popover's station names, and the account view's and account menu's
  name and email, wrap; an email breaks after its @ and before a dot (`EmailText`), and inside a word only when that
  word is wider than the whole line. The route popover holds to the room its row gives it, never below the drawn
  256px; menus hold to the window, never below 192px;
- the nightly's 200% text checks also fail on text cut at its foot (overflow hidden or clipped, or a line clamp), on
  a heading's word broken across lines, and on a masthead taller than its one row; and they open the route popover,
  the account view and the account menu (`/e2e/signed-in`: a fixture traveller, only on Playwright's own server with
  no accounts configured, a 404 and never indexed anywhere else).

Each PR brings the dependency, copy, tokens and DESIGN.md rules its own code first uses, so nothing lands
unused, and nothing a traveller can see is inert (a Sound switch with no sound). Each runs `npm run check`
and the e2e suite, ships behind nothing (every PR leaves the landing whole), and merges only with the user's
go-ahead. Each PR's plan is written when the one before it merges, from the code that actually shipped.

## 7. What only the user can do

- Approve this spec, then each PR's merge.
- ~~Confirm that Motion off also quiets the app's own small motions on the page (the press, the sweep, the
  theme icon turn), as a device's reduced-motion setting already does.~~ **Confirmed 2026-09-24: yes,
  site-wide.** J1 is built on it.
- Try the result on a real mid-range Android phone before J5 merges (a hidden `?journey-hud` query shows the
  frame meter on preview deployments and in development only; J5-10).
- Decide whether the nightly workflow may run on a schedule. J6 ships it at 03:00 IST: the repository is public, so its Actions minutes are free (J6-11). Removing the two `schedule` lines keeps it manual.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Low-end GPUs (Mali, Adreno 6xx) slower than CPU throttling suggests | Governor steps and the still floor; real-device check before J5 merges |
| iOS Safari: `svh`/`lvh`, sticky with `overflow: clip`, root scroll snapping, View Transitions (18+) | The place, run, Night falls and drawing specs in WebKit, desktop and phone, in the nightly run; every test that needs the live drawing skips, saying why, where that WebKit has no WebGL 2; static fallbacks |
| Anime.js or three.js API churn | Exact versions pinned; upgrades are their own PRs with the full journey suite |
| Strict Mode double mounts, route changes | Idempotent teardowns; engine disposed when leaving "/" |
| CI e2e time grows | Four Playwright shards and the console suite in parallel on every PR (J6-1); heavy suites nightly |
| Dev-only CSP in e2e hides a production-only violation | Nightly production-build CSP smoke |
| Bundle creep | Budgets checked on every PR (`verify`) and in the nightly run; `experimental-analyze` in review |

## 9. Acceptance

- Every row of §3.A works in Day, Night and on a phone, and every "Motion off" column holds.
- Every §4 failure produces the stated result, proven by an e2e test.
- §3.H's chunk budgets met on every PR and in the nightly run; its frame-time and long-task budgets met on a real GPU (`journey-perf.mjs`) before each journey PR merges; CLS and the governor held in the nightly's throttled runs; no collisions at the 15 sizes or at 200% text in the journey's sections.
- axe clean at the 12 positions; the CSP spec and the production-build smoke clean.
- `npm run check` green on every PR; no raw hex, no file over 500 lines, no `Co-Authored-By` trailer.
