# DESIGN.md — Track & Trace

World: **Verified Operations**. A calm enterprise data product for railway reservation records. The interface prioritizes source truth, provenance, structured tables, status bands, request timelines, and clear unavailable states over decorative instruments.

## Direction contract

- **THESIS** — A reservation interface should never imply certainty beyond the source response.
- **OWN-WORLD** — Graphite surfaces, bone text, steel metadata, brass labels, and functional signal colors. No decorative dashboard instrumentation where a table or status band communicates better.
- **STORY** — Enter a PNR, validate the request, query the verified source, and present the returned record. If any step cannot complete, explain exactly why.
- **FIRST VIEWPORT** — Left: product/data policy. Right: live PNR request terminal. No sample gauges or demo records.
- **FINISH** — All visible data is source-backed or explicitly unavailable.

## Tokens

Tokens remain in `src/app/globals.css`: graphite grounds, bone/steel text, signal green/amber/red, brass labels, Figtree/Inter/JetBrains Mono, shared bezel/panel/field radii, and reduced-motion support.

## Enterprise component grammar

- **PageHead** — shared kicker, title, lead, and optional action slot.
- **PanelHead** — shared section header for data panels.
- **Status band** — current source-backed state, provenance, retrieval time, and key fields.
- **Data table** — semantic responsive overflow table for passenger, journey, account, and source records.
- **Request timeline** — ordered validation/source/presentation lifecycle.
- **SourceUnavailable** — explicit no-result state with response, provenance, and fallback status.
- **SkeletonBlock / PnrResultSkeleton** — contextual loading shapes that match the data surface.
- **SelectField / Button / Chip** — shared controls with consistent sizing, focus, and responsive behavior.

## Data policy

Strict real-only mode. No demo PNRs, invented train catalogs, modeled percentages, synthetic trends, fake coach occupancy, placeholder route comparisons, or unsupported accuracy figures. Data source failures fail closed.

## Page anatomy

Every operational surface uses `max-w-6xl`, `pt-28 sm:pt-32`, `pb-20`, a shared `PageHead`, and `gap-4`/`gap-5` panel rhythm. Tables use horizontal overflow on narrow screens; status bands wrap into stacked key-value groups; action controls remain reachable on mobile.

## State grammar

- **Loading** — contextual skeleton matching the eventual table/panel layout.
- **Empty** — clear explanation plus the next valid action.
- **Unavailable** — source status, no fabricated fallback, optional policy link.
- **Error** — precise cause, retry action where meaningful, no generic success copy.
- **Ready** — source-backed records with provenance and checked-at timestamp.

## Motion

Keep motion purposeful and restrained: opacity/transform for state changes, skeleton shimmer during network waits, reduced-motion support, no decorative gauge animation for unavailable or unsupported data.
