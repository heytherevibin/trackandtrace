# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Indian rail travelers checking a 10-digit PNR on a phone: on a crowded platform in harsh daylight, or in a moving berth at night, one hand free, low attention. They want to know whether a waitlisted or RAC ticket confirmed before the reservation chart is prepared. No secondary audience is confirmed; "enterprise-grade" describes the quality bar, not a B2B buyer.

## Product Purpose

Accept a 10-digit PNR, request the current reservation record from a verified railway data source, and show exactly the fields that source returned, with its name and retrieval time. Optionally keep a watchlist of saved PNRs on the device and, with an account, across devices. Success is a traveler reading their status correctly in one glance and never being misled by an invented value.

## Positioning

Only fields returned by a verified source are shown, each with provenance and retrieval time; no fabricated confirmation odds, trends, or route rankings. Checking is free and needs no account. PNRs and passenger names are never written to logs. A neighboring product that predicts confirmation cannot truthfully make the first claim.

## Operating Context

- Indian Standard Time everywhere; chart preparation (about four hours before departure) is the deadline travelers care about.
- Installable PWA; used repeatedly for the same PNR over days.
- Anonymous-first: the check works without sign-in; an account only adds a synced watchlist.
- Development uses a clearly labeled sample-data fixture (`PNR_SOURCE=fixture`); production refuses it. Every fixture result is badged "Sample data".
- Accounts and the synced watchlist run on Supabase (Auth + Postgres); data access is server-side with row-level security.

## Capabilities and Constraints

Confirmed: PNR validation and the 3-3-4 digit entry control; a verified-source seam that resolves to an explicit unavailable state until a provider is connected; result surface (status band, passenger table, journey details, provenance timeline); local watchlist with account sync, merge, and undo; recent checks; share and copy of a result link; account export and deletion; pre-booking form with no inventory source; accuracy page with no records; privacy and terms pages.

Constraints: strict real-only data policy; prediction, trend, and factor fields exist in the type layer but are never rendered; passenger names are never stored or rendered; no railway provider is wired yet (identity undecided); English only for now with a locale-ready string structure (Hindi launch undecided).

Stack: Next.js 16 App Router, TypeScript strict, Tailwind CSS v4, Supabase (Auth + Postgres via supabase-js and @supabase/ssr), Base UI primitives, Sonner, Motion, Vitest, Testing Library, Playwright. Deploy target Vercel.

## Brand Commitments

- Name: Track & Trace (kept). The former tagline "Journey intelligence" implies inference the product forbids and is retired in favor of a factual descriptor.
- Honesty is a brand commitment: sample data is always labeled; accuracy is never invented; unavailable states are explained, not hidden.
- Quality bar: Stripe/Linear-level system discipline in app surfaces, Airbnb-level warmth on the landing page.
- Light and dark themes (Day and Night), following the system, with an Auto · Day · Night toggle.
- Visual system: Industry, the wireframe world from the Claude Design project "App landing page redesign" (Landing, Watchlist, Pre-booking, Accuracy, Sign in B sheets), matched exactly. Undrawn surfaces follow its grammar (see DESIGN.md).
- Not affiliated with IRCTC or Indian Railways; stated on every surface footer.

## Evidence on Hand

- No verified railway provider is connected. For now the product can read the third-party RapidAPI "IRCTC" API (IRCTCAPI, not affiliated with IRCTC); its results are tagged "Third-party" and name the provider. The official path under evaluation is CRIS Pravah.
- No testimonials, customer names, usage metrics, ratings, or accuracy records exist. None may be fabricated.
- No logo, icon, or social image assets exist; the mark is designed in this redesign.
- The development fixture (deterministic sample records keyed by PNR digits) is design and test material only and must never be presented as real.

## Product Principles

1. Fail closed: no source, no claim.
2. Provenance over inference: every value names where it came from and when.
3. Anonymous first: the check never needs an account; an account only adds sync.
4. Explicit save: nothing persists without the traveler's action.
5. Legible under stress: one glance, one thumb, daylight or night.

## Accessibility & Inclusion

WCAG AA, with one recorded exception: the design-locked steel pairing (primary button fill, outline tag, ghost button text; #5980a6 against the grounds at about 3.7:1 by day and 3.4:1 by night) is kept exactly as drawn by decision on 2026-09-17, and is the only exemption in the automated axe scans. Otherwise: keyboard navigation, visible focus, semantic tables, status announcements through live regions, reduced-motion support, color never the sole status indicator, controls at the sheets' drawn sizes (32px buttons, 44px on sign in), 16px inputs on phones, and a string structure ready for Indian languages.
