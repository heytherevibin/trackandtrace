# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS, npm. Deploy target: Vercel (serverless monolith). Persistence: serverless Postgres (e.g., Neon/Supabase) + Prisma, schema written in v1. Cache/rate-limiting/queues: Redis (Upstash). Auth: Auth.js (email magic-link + Google OAuth). All stack choices confirmed by the user in planning; the user's directive also pins enterprise-grade polish, PWA support, and latest-2026 design-language fluency for the UI.

## Users

Primary: Indian rail travelers holding waitlisted (WL/RAC) tickets who need to know their confirmation odds and what to do about it. Secondary: travelers deciding whether to book (pre-booking analysis) and groups tracking several PNRs. Operating scene: mobile-first, often at a station or in transit, low attention, chart-prep anxiety; the interface must be instantly legible and feel precise.

## Product Purpose

Enter a 10-digit PNR → current status plus an explainable, calibrated confirmation probability; before booking, analyze a train/date/class/quota context and compare routes. Success means users trust the probability because they can see its reasoning, and they make better go/no-go travel decisions with less manual checking.

## Positioning

Calibrated probability with per-factor explainability — "a number, and the why behind it." Category competitors return a percentage; TrackAndTrace shows the reasoning: quota, WL position, time-to-chart, day-of-week, and train-level demand as ±point factor contributions, with honest confidence buckets and a transparency page. Presentation is a futuristic mission-control world with enterprise-grade polish — never hype, never generic.

## Operating Context

Phone-first web app. Users re-check repeatedly as chart preparation approaches (chart ≈ 4h before departure, IST). A watchlist with scheduled re-checks and browser notifications reduces manual checking. Every result shows its data provenance ("Live status" vs "Demo prediction"). Countdowns and scheduling are IST-correct.

## Capabilities and Constraints

v1: PNR checker (probability gauge, explainable factors, WL-movement curve, modeled 5-day trend, coach/berth map); pre-booking single + multi-route compare; account-backed watchlist with browser notifications; accuracy/trust page; auth (magic-link + Google); ToS/Privacy pages; account deletion and data export.

Constraints: Indian Railways offers no public API. Data comes from a synthetic demo engine (documented deterministic demo PNRs, clearly labeled) plus a live adapter (server-side enquiry of indianrail.gov.in, budget-guarded, degrading to labeled synthetic) whose viability is verified by a build-time probe. Accuracy claims are never fabricated; trend charts render modeled priors labeled "modeled trend" until a community ledger supplies real counts. PNRs and passenger identifiers are never logged.

## Brand Commitments

Name: TrackAndTrace (working, brandable later). Aesthetic (user-pinned brief): futuristic, enterprise-grade polish, advanced UX/UI, butter-smooth motion, fully responsive, PWA, aligned with current (2026) design languages; explicitly no generic colors, no emojis, no basic structures. Honesty is a brand commitment: demo data is always labeled, accuracy claims are never invented.

## Evidence on Hand

None real — greenfield project: no user data, no testimonials, no press. Demo PNRs are synthetic and documented. Accuracy figures shown are model outputs from the labeled demo engine, never verified claims.

## Product Principles

1. Explainability before numbers — every probability decomposes into visible, per-factor reasoning.
2. Honesty over hype — calibrated outputs, labeled provenance, transparent limits.
3. Speed and precision — a decision tool; the UI feels instant and surgical.
4. Phone-first, ops-room clarity — designed for the station platform, not the office.
5. Enterprise-grade craft — tokens-only design system, world-consistent components, motion that compounds rather than decorates.

## Accessibility & Inclusion

WCAG AA, full keyboard flow, visible focus, prefers-reduced-motion support, color never the sole indicator, gauge always carries a numeric label, i18n architecture from day one (हिन्दी in a later phase).