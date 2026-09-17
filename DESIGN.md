# DESIGN.md — Track & Trace

World: **Industry**, the wireframe system. **Fidelity rule: every surface matches the Claude Design
reference exactly** — structure, copy, sizes, spacing, colours, and states are transcribed from the
B sheets' inline styles, not reinterpreted. Adopted 2026-09-17 from the Claude Design project
"App landing page redesign" (`Landing Redesign B.dc.html` plus the Watchlist, Pre-booking,
Accuracy, and Sign in B pages). It replaces the Rhythm Machine Step Row.

## Direction contract

- **THESIS** — A PNR check is a drawing of a record. Every surface is a technical sheet: nothing is decorated, everything is labelled.
- **OWN-WORLD** — A light technical ground by day, a steel-blue ground by night. Square hairline plates with `+` registration marks at the corners. Barlow Condensed capitals over Barlow body copy. One steel accent; the primary button is the one solid object on the board.
- **STORY** — Punch ten digits into the ticket-stub plate (3-3-4), press Run, watch the sweep, read the record the source returned with its provenance and retrieval time. If the source is silent, the plate says so and stops.
- **FIRST VIEWPORT** — The promise on the left in hero capitals with four outline tags; the live check plate ("PNR check — live request · Form T&T-01") on the right.
- **FINISH** — All visible data is source-backed, labelled sample data, or explicitly unavailable.

## Tokens (`src/styles/theme.css`, mapped in `tokens.css`)

| Role | Day | Night | Use |
| --- | --- | --- | --- |
| `surface-0` | #f2f2f3 | #1d2d3d | page ground |
| `surface-1` | #e9e9ea | #2c455d | wells (inputs), neutral tag fill |
| `surface-2/3` | #f5f5f8 | #243a50 | menus, toasts, dialogs, sheets |
| `ink-1` / `ink-2` / `ink-3` | 100% / 78% / 70% text | same ramp | text, body copy, legends and meta |
| `ink-alert` | #2c455d | #d6ebff | validation and error text (the deep steel step; mono world) |
| `accent` | #5980a6 | #5980a6 | lines, carets, lamps, route stops, focus on inputs. Never text. |
| `accent-text` | #416180 | #b5d9fd | readable steel: links, kickers, field labels, active nav |
| `accent-strong` (+hover/active) / `accent-ink` | #5980a6 (#597ea3, #416180) / ground | #5980a6 / ground | the primary button (design-locked 3:1 pairing) |
| `accent-soft` / `accent-soft-ink` | tint / deep | deep / tint | the filled tag |
| `accent-wash`, `accent-busy` | 8% steel, #94bce3 | | digit cell fill, running lamp |
| `line`, `line-strong`, `mark` | ink 16% / 45% / 55% | paper 24% / 45% / 55% | hairlines, hover edges, registration marks |

The contract test (`tests/unit/tokens.contract.test.ts`) enforces AA for every text role on every
surface, parity with `brand-colors.ts`, no raw hex in components, no arbitrary size classes, the
spacing rhythm, and the Industry vocabulary (no rounded corners, no signal tones, no key/readout tokens).

Type roles: `text-2xs` 11 · `xs` 12 · `label` 13 · `sm` 14 · `body` 15 · `base` 16 · `lead` 17 ·
`lg` 18 · `xl` 20 · `2xl` 22 · `3xl` 24 · `4xl` 30 · `5xl` 32 · `page` clamp(34–52) · `hero` clamp(44–76).
Tracking: `tracking-caps` .08em (legends), `brand` .06em (wordmark, digits), `head` .02em, `display` .01em.

## Utilities (`src/styles/utilities.css`)

- `page-frame` — 1200px sheet with fluid gutters. `page-body` — app page top/bottom padding. `section-pad` — landing section rhythm.
- `legend` 13px · `legend-md` 12px · `legend-sm` 11px — condensed capitals in `ink-3`. `kicker` — 13px capitals in `accent-text`. `caps` — capitals at any size.
- `font-data` — condensed, tabular figures (PNRs, times, coach and berth, counts). `tnum` — tabular figures in the body face.
- `blueprint` — square hairline object; always pair with `<Corners />`. `seam` — hairline top rule. `perforation` — dashed top rule.
- `well` — the input ground. `rail` — twin rails with sleepers for route lines. `duotone` — steel duotone for photographs.
- `optical-hang` — pulls large condensed headings left so stems align with body copy.
- Motion: `shake` (invalid entry), `flip` (clock minute), `caret-blink` (digit caret), `sweep` (running request), `spin`.

## Primitives (`src/components/ui`)

| Primitive | Grammar |
| --- | --- |
| `Corners` | The four registration marks. Every plate, figure, dialog, and state block wears them. |
| `Plate` (+ `PlateHeader`) | `blueprint` object with an optional title-block header row: a title cell and meta cells behind hairlines ("Form T&T-02", "Sheet 01 of 04", "Sample data"). Padding none/sm/md/lg; cells tight/regular/wide. |
| `SectionHeader` | Kicker "02 · How it works" → hairline rule → 32px condensed capital `h2` → optional lead and actions. |
| `PageHeader` | Optional back link and kicker, `text-page` capital `h1`, 16px lead, legend meta line, actions right. |
| `Button` | Square, hairline, condensed, sentence case. `primary` solid steel; `secondary` hairline; `ghost` steel text; `danger` solid deep steel. Sizes sm 32 · md 36 · lg 44. |
| `Badge` / `Tag` | 11px body-face tag. Mono tone by form: `go` filled, `watch` steel outline, `stop`/`neutral` grey. |
| `StatusPill` | CNF filled · RAC/WL outline · CANCELLED/NOT_FOUND grey; sr-only description. |
| `Led` / `Lamp` | 8px ring; lit = steel fill, `busy` = light steel, off = hollow. Text beside it carries the meaning. |
| `FactGrid` | Legend over condensed figure; `framed` draws the terminal's hairline cell grid. |
| `KeyValueList` | Legend and value on hairline rows. |
| `DataTable` | 12px legend heads, hairline rows, tabular figures; stacks to labelled rows below md. |
| `Timeline` | Vertical lifecycle: filled stop = done, tinted ring = current, hollow = pending, deep-steel ring = failed. |
| `StateBlock` → `EmptyState`, `ErrorState`, `UnavailableState` | Plate with a 24px capital title, 15px detail, evidence row (Response · Provenance · Fallback), actions. |
| `Field`/`FieldLabel` (steel 12px legend), `Input`, `NativeSelect`, `Select` | Wells with a steel focus edge; errors in `ink-alert`. |
| `SweepBar` | 2px running indicator; pair with a live status line. |
| `Dialog`, `ConfirmDialog`, `Sheet`, `Menu`, `Tooltip`, toasts | Square, hairline, `surface-2/3`, marks on dialogs. |

## Shell

- **Masthead** (`TopNav`), the same on every page: sticky, `surface-0`, hairline bottom. Wordmark (mark + "TRACK & TRACE" 18px `tracking-brand`); the nav CHECK A PNR · WATCHLIST · PRE-BOOKING · ACCURACY, each a Fluent **Filled** icon at 20px beside its 13px capital label, the current page underlined in steel (on `/`, Check a PNR is current and jumps to `#terminal`); the Auto · Day · Night cells with their Filled icons; and SIGN IN (capitals, person icon) as its own secondary button on the right, or the account menu. From `xl` it is one row; below `xl` it is two aligned tiers (brand and SIGN IN, then the nav with the theme cells, scrolling sideways on phones). `/login` is not sticky and shows the brand only.
- **Footer**: `/` gets the enterprise footer (brand + disclaimer; Sections — the landing's anchors How it works, The record, Sources, Roadmap, FAQ with Filled icons; Product; Company; Status lamps read from real flags; © and IST clock). App pages get one line: disclaimer · © and the IST clock.

## Page anatomy

- App pages: `<section className="page-frame page-body">` → `PageHeader` → plates with `mt-8` rhythm → numbered sections (`SectionHeader kicker="01 · …"`) at `mt-11`-ish spacing (use `mt-12`).
- Landing: `page-frame` sections with `section-pad`; hero grid `repeat(auto-fit, minmax(min(100%, 420px), 1fr))`.
- Numbering: sections carry "NN · Title" kickers; plates carry sheet/form numbers in meta cells.

## State grammar

- **Loading** — flat skeleton blocks in the shape of the eventual plate, announced once.
- **Empty** — plate: capital title, one sentence, the next valid action.
- **Unavailable** — plate: what was received (Response · Provenance · Fallback), nothing substituted, policy link.
- **Error** — plate with `role="alert"`, precise cause, retry where meaningful.
- **Ready** — source-backed record with provenance and retrieval time; fixture results carry the "Sample data" tag.

## Data policy

Strict real-only mode (see PRODUCT.md). No invented odds, trends, testimonials, or metrics. The
landing's specimen record is generated from the labelled development fixture and always wears
"Specimen record" and "Sample data".

## Motion

Tint, never transform, on hover and press. The only movements: the invalid shake, the clock's
flip, the digit caret, the running sweep, popup fades. All collapse under reduced motion.

## Accessibility

AA text contrast on every surface (enforced), visible 2px steel focus, semantic tables, live
regions for status, 44px touch targets on phones, 16px inputs, colour never the only carrier.
