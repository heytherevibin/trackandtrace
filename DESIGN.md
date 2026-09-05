# DESIGN.md — Track & Trace

World: **The Destiny Clock** (grounded direction #5, concept-seed key `06ec86fe`). Indian Railways as a precision instrument: every read is a race against chart time, resolved on twin dials. Recorded from the built world (M1 prototype, code-led).

## Direction contract (as embedded in `src/app/layout.tsx`)

- **THESIS** — Railway time decides every ticket; the product is a precision instrument that reads a PNR and shows, on one master clock, whether the seat frees before chart time.
- **OWN-WORLD** — Lacquered instrument grounds, dial-bone luminous markings, steel hairlines, brass sparingly; signal aspects (green/amber/red) are destiny states, never decoration; every data value is set in the mono instrument face; no stock chrome.
- **STORY** — Ten digits in, one honest light out: the odds dial sweeps, the chart hand races, and the reasoning behind the number reads as a factored ledger.
- **FIRST VIEWPORT** — Twin faces (CONFIRMATION ODDS / TIME TO CHART) flank an engraved PNR terminal; submit resolves both instruments.
- **FORM** — Grounded list #5, raised by five declined challengers (parametric needle, one ruling time axis, packet→instrument deployment, frame-reflowing dial, focus-reveals-detail).
- **FINISH** — This build is documented; M2+ (backend) proceeds per PRODUCT.md.

## Tokens (`src/app/globals.css`)

| Group | Values |
| --- | --- |
| Grounds | `ink-0 #06080b` page · `ink-1 #0b0e12` · `ink-2 #10141a` · `ink-3 #161b23` · `ink-4 #1e2530` |
| Luminous | `bone #ece4d2` · `bone-dim #c2b9a4` |
| Steel | `steel #7e8894` · `steel-2 #adb7c2` |
| Signal | `go #2fbf71` · `watch #f2a93b` · `stop #e5484d` (+ t10/t30 alpha tints) |
| Brass | `brass #c9a25f` (machined detailing only) |
| Radii | `bez-el 24px` panels · `panel 16px` mid cards · `field 12px` inputs/wells · `chip ∞` pills |
| Type | Display: **Archivo** (weight 400–900) · Body: **Inter** · Data: **IBM Plex Mono** (`font-data`, tabular) |
| Motion | `--ease-out-strong cubic-bezier(0.16,1,0.3,1)` · `--ease-out cubic-bezier(0.23,1,0.32,1)` · UI < 300 ms · instrument resolves ≤ 1.6 s |

One scale rule: *bez-el → panel → field* maps to *major instrument → inner card/strip → input*, and every surface obeys it. No one-off radii, paddings, or `!` overrides.

## Component grammar

- **Bezel** — double-bezel: outer shell ring + inset plate with concentric radius and inner top-highlight. All major panels.
- **PlateLabel** — 10px uppercase tracked micro-label; the only kicker voice.
- **Button** — pill, three sizes (`sm/md/lg`), `:active` scale 0.97, trailing **ButtonIcon** capsule; variants primary (bone), outline, ghost.
- **Chip** — pill status chips with signal tones + LED dot; sizes `sm/md`.
- **ArrowIcon** — one drawn arrow glyph (rotatable) used for every directional affordance; no text arrows.
- **SelectField** — engraved well + drawn chevron; the only dropdown treatment.
- **Focus** — one luminous `go-bright` focus-visible ring everywhere; inputs use a `well:focus-within` ring instead of removing focus.

## Instruments & data-viz (hand-rolled SVG, no chart library)

- **ProbabilityDial** — 240° arc, signal-colored value arc, needle settle, mono center readout with count-up; numeric label beside it (a11y).
- **CountdownRing** — 24h window ring, 6h/12h markers, IST ticking MM:HH:SS, red in final approach.
- **MiniDial** — compact odds ring for cards/rows.
- **AspectLamps** — GO/WATCH/STOP lamps, active one lit (blinks until settled).
- **TrendBars** — modeled 5-day confirm rate; bars animate `scaleY` (transform only).
- **MovementPanel** — your recorded checks (solid) over the modeled path to chart (dashed); labeled "demo".
- **FactorRows** — ±points with `scaleX` impact bars, staggered in.
- **CoachMap** — 3A 64-berth bay grid, occupancy reconstructed from PNR seed; labeled indicative.

## Motion grammar

Transform + opacity only (detector-verified). Entrances: reveal fade-up via IntersectionObserver; result surfaces stagger 30–80 ms. Resolves: dial needle/arc 1.4–1.6 s `ease-out-strong`. Press feedback 140 ms. `prefers-reduced-motion` strips movement, keeps opacity/color. Hover affordances gated to `(hover:hover) and (pointer:fine)`. No animation on keyboard-initiated or high-frequency actions (re-check, notifications).

## States & provenance

Loading → scanning (PNR digit sweep) → settled; error/empty/not-found states in the same bezel grammar. Every read carries provenance: `DEMO PREDICTION` chips, modeled-trend labels, and the accuracy page's synthetic calibration ledger. Real claims are never fabricated; live status lands behind the `PnrDataSource` seam (M3).

## Page anatomy (consistent across surfaces)

Header: `PlateLabel` kicker + 4xl/5xl `tracking-[-0.02em]` title + 15px steel lead, right slot for actions. Page shell: `pt-28 sm:pt-32`, `pb-20`, `max-w-6xl`; hero exempt (owns its rhythm). Results in bezel panels on a `gap-4` grid.