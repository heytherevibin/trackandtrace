# TrackAndTrace — Handoff (M3 Accounts Milestone, mid-implementation)

**Written for:** the next agent session continuing Phase 3 (accounts milestone) of the TrackAndTrace build.
**Project root:** `/Users/heytherevibin/Downloads/Code/Dev/trackandtrace`
**Working tree:** shared local checkout. Check `git status`/branch before any git operation. Do not commit unless asked.

## What this project is

TrackAndTrace — a futuristic PNR-intelligence web app for Indian Railways (category: RailTC/ConfirmTkt), built per the approved plan. Stack: Next.js 16 (App Router) + TS + Tailwind v4, npm. Deploy target Vercel serverless monolith; Postgres (Prisma 6) + Redis (Upstash) planned; Auth.js v5 for accounts. Visual direction locked: **"The Destiny Clock"** — instrument/ops-room world, dark grounds, signal aspects (go/watch/stop), Figtree display + Inter body + Plex Mono data (all self-hosted via next/font).

Durable context lives in these files — read, don't duplicate:
- `PRODUCT.md` — product truth, stack decisions, constraints, brand commitments (user-confirmed).
- `DESIGN.md` — recorded design system: tokens, components, motion, page anatomy.
- `.freebuff/run.md` — how to run the dev server / reproduce artifacts.
- `src/app/layout.tsx` (top comment) — the direction contract for The Destiny Clock world.

## Phase status

- **M0** direction roll — done (The Destiny Clock, dice-assigned).
- **M1** full UI prototype — done + one consistency pass (dial leveling, 10px type floor, transform-only motion, unified radii/buttons/icons/focus). DESIGN.md recorded.
- **M2** backend foundation — done: typed env (`src/lib/env.ts`), errors (`src/lib/errors.ts`), rate limiting (`src/lib/ratelimit.ts`), cache (`src/lib/cache.ts`), server data source (`src/lib/server-source.ts`), PNR API route (`src/app/api/pnr/[pnr]/route.ts`, GET-only, zod + rate-limit + cache), Prisma schema + client, security headers in `next.config.ts`, audit-clean deps.
- **M3 accounts milestone — IN PROGRESS.** Work done so far this turn:
  - Installed `next-auth@5.0.0-beta.32` + `@auth/prisma-adapter@2.11.3` (verified Next 16 + React 19 peer support).
  - Todo list written (see below). Nothing else written yet — auth code has NOT been started.

## M3 remaining work (exact order in the todo list)

1. Write `src/auth.ts` — NextAuth v5 config: Prisma adapter, Google + nodemailer (SMTP magic link) providers, database sessions, `trustHost: true`. Providers/secret only when env set; export stubs when unconfigured so the anonymous demo keeps running (no `AUTH_SECRET`/`DATABASE_URL` locally).
2. `src/app/api/auth/[...nextauth]/route.ts` — export handlers (or a 503 stub when unconfigured).
3. `src/lib/session.ts` — `currentUser()` helper for server components/route handlers.
4. Wire `/login` and `/account` to real auth:
   - Login page is a client component (`src/app/login/page.tsx`) — use `signIn` from `next-auth/react`; email form calls `signIn("nodemailer", { email })`, Google button calls `signIn("google")`. Keep the graceful "prototype" fallback when providers unconfigured.
   - Account page (`src/app/account/page.tsx`) is a client component with a `demo=1` query hack — replace with session-aware server/client hybrid: profile (name/email), synced watchlist count, Export + Delete buttons wired to the new APIs.
   - Consider adding a client `SessionProvider` in layout for `useSession` on the watchlist page.
5. Watchlist API `src/app/api/watchlist/route.ts` — GET (list), POST (upsert `{pnr, label}`, zod), DELETE (by pnr). Session-gated → 401 `UNAUTHENTICATED`. DB model `WatchlistEntry` already in `prisma/schema.prisma` (`checks Json`, `@@unique([userId, pnr])`).
6. Local→account merge: `src/lib/store.ts` is the local-first store (localStorage key `tt.watchlist.v1`, `useWatchlist` hook). On signed-in watchlist page, POST local entries missing from the account, then offer clear-local.
7. Account APIs: `src/app/api/account/route.ts` DELETE (user cascade) and `src/app/api/account/export/route.ts` GET (JSON dump of user + watchlist + analyses).
8. Redis limiter: extend `src/lib/ratelimit.ts` with an Upstash implementation (same interface as `MemoryRateLimiter`; plain fetch to `UPSTASH_REDIS_REST_URL`/token — `SET key 0 EX <s> NX` + `INCR`, no SDK needed). Factory picks upstash when configured; wire into the PNR route.
9. Migration artifact without a live DB: `mkdir -p prisma/migrations/0001_init && npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0001_init/migration.sql`.
10. Tests with vitest (add devDep + `test` script): engine determinism/demo stories, rate-limit window behavior, watchlist zod validation. Prefer relative imports to dodge the `@/` alias in vitest config.
11. Finish gate: `npx tsc --noEmit` clean, `npm run build` green, detector clean, preview verification (anonymous flow + signed-out states must still work).

## Commands

- Dev server (already running detached, verify with `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4210/`): `npm run dev -- --port 4210` (see `.freebuff/run.md` for the detach recipe + log path).
- Typecheck: `npx tsc --noEmit` · Build: `npm run build` · Lint: `npm run lint`.
- Design detector: `node /Users/heytherevibin/.agents/skills/impeccable/scripts/detect.mjs src/` (must be clean; it flags the codex-grid pattern — graticule lives inside dial SVGs only).
- Prisma is pinned to **v6.12.0** deliberately (v8 RC broke the CLI). `npm audit` must stay clean.

## Gotchas / session facts

- **This agent cannot view images** — the preview screenshot and user-attached PNGs are not visible. All visual verification is DOM/computed-style/console based. The user is watching the live Preview tab, so ask them to name anything that still looks off.
- Recent user-fixed items (do not regress): hero dials must sit level (equal column structure in `src/app/page.tsx`); **no text under 10px** anywhere (type floor, swept all files); PNR terminal keeps the "Read signal" button beside the digits row and shows the full formatted 10-digit value without clipping (`src/components/pnr-input.tsx` — digits sized `clamp(1.25rem, 4vw, 1.8rem)`, tracking 0.14em); PNR placeholder is `234 567 8901`.
- No `.env.local` exists (no DATABASE_URL, AUTH_SECRET, provider keys, Upstash creds). Everything must degrade gracefully to the anonymous demo. Never log PNRs or passenger identifiers (product constraint).
- `npm` has a scripts policy blocking some postinstall scripts — `npm install` works; ignore the install-scripts warnings.
- Dev server restarts pick a new pid — re-register the preview if it drops.

## User taste / directives (from the brief)

Fully polished enterprise grade; advanced UX; butter-smooth motion; fully responsive; PWA; 2026 design-language fluency; no generic colors, no emojis, no basic structures. Honesty is a brand commitment: demo data always labeled, accuracy never invented.

## Suggested skills for the next session

- `impeccable` — the design skill driving this project (craft floor, detector, DESIGN.md). Load `/Users/heytherevibin/.agents/skills/impeccable` reference files only as needed.
- `emil-design-eng` — motion/UX polish sensibility (animation decisions, micro-interactions).
- `ui-ux-pro-max` — searchable design database if a new visual question comes up (`.agents/skills/ui-ux-pro-max`, CLI via python3).
- `high-end-visual-design` — agency-tier visual craft checks.
- `handoff` is not needed again for this project.