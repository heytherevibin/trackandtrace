---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: []
---

# Surface: / (landing)

Scope: the public home page. Visitor mode: Persuade, tool-is-the-hero.

Audience: an Indian rail traveler on a phone, on a platform in daylight or in a berth at night, checking whether a waitlisted or RAC ticket confirmed before chart preparation.
Job: check a 10-digit PNR right now without an account. Action: type ten digits into the row and press RUN.
Proof and content allowed: (1) only fields returned by a verified source, with provenance and retrieval time, no fabricated odds; (2) free, no account required; (3) PNRs and passenger names never logged; plus the not-affiliated notice. No testimonials, metrics, customers, or sample-result screenshots. Sample data exists only in development and is always labelled.
Constraints: light and dark themes; WCAG AA; hero content visible in SSR HTML with no entrance animation; the ten-key row never wraps; keyboard-initiated actions never animate.

Direction: Rhythm Machine Step Row (dealt challenger, adopted by the user; seed c2e5f350). Memorable moment: pressing RUN sends a chase light across the ten keys through validation, source, and result, and the LED plus readout settle on the answer.
Unresolved: exact key-cap colour treatment in the light (909-face) theme; whether the closing CTA repeats the full row or a compact one.
