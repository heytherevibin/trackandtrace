# Architecture

## Layers

```
Browser
  components (src/components/*)            — the visual world; no fetch logic
  stores (src/services/stores/*)           — device state: watchlist, recent, share, install, merge
  api-client (src/services/api-client.ts)  — validated fetch; malformed bodies become errors
Next.js server
  pages (src/app/(site)/*)                 — every traveller page under the site's root layout; unmatched addresses get src/app/global-not-found.tsx (the site's not-found page, server-rendered, 404; sign in on the console host)
  route handlers (src/app/api/*)           — thin: guard → validate → repository/query → jsonOk/jsonError
  pnr-query (src/services/pnr-query.ts)    — the one PNR path: validate → rate limit (IPv6 per /64) → cache → daily live-request budget → single-flight → source
  shared-store (src/services/shared-store.ts) — Upstash Redis (Mumbai) on deployments: shared limits + the encrypted 60 s PNR cache
  sources (src/services/sources/*)         — registry: live seam (unavailable until a provider lands) | railkit | rapidapi (third-party, shown as Trakline; optional fallback between them) | fixture (dev only)
  guarded (src/services/sources/guarded.ts) — each provider behind its breaker, one safe retry (network, 502/503/504) and a daily usage count
  watchlist-repo (src/services/watchlist-repo.ts) — supabase-js over RLS-guarded tables
  session (src/services/session.ts)        — verified JWT claims → SessionUser DTO
  proxy (src/proxy.ts)                     — one app, two hosts: the console host (admin.trakline.in; admin.localhost locally) is rewritten into src/app/console with a per-request nonce CSP; elsewhere /console answers 404 and Supabase sessions are refreshed on page requests (skips /api and /monitoring)
  console (src/console/*, src/app/console/*) — the team console: its own root layout, copy and components; only the console tree and the host router (src/proxy.ts, src/app/global-not-found.tsx) import it (tests/unit/console/boundary.contract.test.ts)
  telemetry (src/instrumentation*.ts, src/services/telemetry/*) — Sentry on server, edge and browser via the /monitoring tunnel; every event scrubbed of PNRs, emails, tokens, cookies, bodies, queries and URL fragments; off without a DSN
Supabase
  auth.users + public.watchlist_entries (supabase/migrations/*) — RLS: owner-only
  console schema (supabase/migrations/2026092009*.sql) — the console's own tables, reached only through security-definer public.console_* functions; the audit log is append-only and console.purge_audit() drops rows past two years
```

PNRs never travel in an address, because request paths and query strings are recorded in platform request logs. The result page is `/pnr#<pnr>`: a static shell whose client body (`PnrHashResult`) reads the PNR from the hash and asks `POST /api/pnr` with `{ pnr, fresh? }` in the body. Links are built only by `pnrHref()`. The pre-hydration form posts to `/check` (303 to the hash form), old `/pnr/<pnr>` links answer 308, and `tests/unit/privacy/no-pnr-in-urls.test.ts` fails the build if code puts a PNR in a path or query string again.

## Real-only enforcement points

1. `src/services/env.ts` — `PNR_SOURCE=fixture` refuses to boot in production.
2. `src/services/sources/index.ts` — the registry refuses the fixture again at call time.
3. `snapshot.source` — `"live" | "railkit" | "rapidapi" | "fixture"` on the server only. `toPublicResult()` maps providers to `"live"` before a record leaves `POST /api/pnr`, and the wire schema accepts only `"live" | "fixture"`, so a missed mapping fails closed in the browser. Fixture results render a visible "Sample data" badge; real results read "from Trakline". Adapter messages are neutral (`messages.source.outcomes`). `tests/unit/privacy/no-provider-names.test.ts` fails the build if a provider name appears in pages, components, messages, the wire schema, `public/` or email templates.
3a. `src/services/sources/rapidapi-parse.ts` — the RapidAPI adapter validates every rendered field, never reads the provider's predictions or passenger names, leaves unsent fields unset ("Not returned"), and fails closed on anything unreadable. `RAPIDAPI_KEY` is server-only and required by the env schema when `PNR_SOURCE=rapidapi`.
3b. `src/services/sources/railkit.ts` + `railkit-parse.ts` — RailKit over REST (never its obfuscated SDK), with the same rules; the fare and booking time are never read. `RAILKIT_API_KEY` must look like a RailKit key or production refuses to boot. Both adapters share `irctc-record.ts` for IRCTC seat notation and dates.
3c. `src/services/sources/fallback.ts` — `PNR_FALLBACK` asks a second third-party source only when the first is unavailable, never on "no record"; each answer keeps its own source label, and when both fail the primary's explanation is kept.
4. `public/sw.js` — never caches `/api/*` or `/auth/*`; a stale record can never be served as live.
5. `src/services/log.ts` — every log line is redacted; ten-digit runs never reach the console.
6. Prediction fields exist in the type layer but no component renders them.

## Failure modes (each has an automated assertion)

| Condition | Behaviour |
| --- | --- |
| Source unavailable | UnavailableState with Response / Provenance / Fallback cells; retry |
| Source answered, no record | "No record for this PNR", not an error |
| Rate limited (20/min per address; IPv6 per /64 network, which one client controls) | 429 with Retry-After; UI counts down. Unreadable addresses share one limit |
| Refresh within 30 s of the record's retrieval | Answered from the cache (`cached: true`, the record's own retrieval time); no provider request |
| Daily live-request budget spent (`LIVE_REQUESTS_PER_DAY`, 300 by default; every address together, per IST day) | Checks with a cached record are answered from the cache; the rest get 503 SOURCE_UNAVAILABLE, "Trakline has used today's live checks. Try again after 00:00 IST.", with Retry-After to midnight IST. No provider is asked. One `[budget]` warning a day, with the day and the limit only |
| Upstash slow or down | Cache misses; limits and the daily budget fall back to this instance's memory; checks keep answering |
| Provider failing repeatedly | 5 failures in 60 s open its breaker for 30 s (doubling per failed probe, up to 10 min); the fallback answers at once and no request is spent on the failing provider |
| Provider refuses the key or plan, or its quota | Breaker open 10 min (401/403), or for the provider's Retry-After (429) |
| Sentry unreachable | Error reports are dropped; the app is unaffected |
| A script, style or connection the policy doesn't allow | Blocked by the enforced CSP; reported to Sentry from production; `tests/e2e/csp.spec.ts` fails on any violation on every route in both faces |
| Malformed API body | Client zod validation fails → error state, never rendered as data |
| Supabase unconfigured | Accounts surface says so; watchlist stays device-local; APIs 503 |
| Session expired | 401 → UI returns to local mode |
| Storage unavailable / corrupt | Stores degrade to empty; invalid records dropped on parse |
| Invalid or missing PNR after `/pnr#` | The check-again sheet; nothing is requested |

## State

- Device: `tt.watchlist.v2`, `tt.recent.v1`, `tt.theme`, `tt.install.v1`, `tt.mergePrompt.v1` — versioned keys, zod-validated on read, synced across tabs via `useSyncExternalStore`.
- Account: `watchlist_entries` with unique `(user_id, pnr)`; local→account merge is planned by `planMerge` and executed by `POST /api/watchlist/merge`.
- Shared (deployments only): Upstash Redis under `tt:{VERCEL_ENV}:`. The PNR cache is `pnr:v1:<HMAC>` → an AES-256-GCM value sealed to its key, 60 s. Limits are sliding windows keyed by an HMAC of the address (an IPv6 address by its /64) or user id. The daily live-request budget is a plain count per day in India, `budget:live:<date>`, kept two days, beside a marker that makes the day's `[budget]` warning fire once. The subkeys come from `DATA_KEY` (HKDF), so Upstash never holds a PNR, a record, an address or a user id in the clear. Any store failure is a cache miss, and the per-instance limiter. `upstash.ts` is the only module that imports Upstash.

## Testing

- `tests/unit` — pure logic and jsdom component tests (Vitest projects; `.test.ts` node, `.test.tsx` jsdom).
- `tests/unit/tokens.contract.test.ts` — the design-system guard: AA contrast for every text role on every surface in both faces, the design-locked steel pairing held at 3:1, parity with `brand-colors.ts`, the Industry vocabulary (no rounded corners, signal tones, or instrument tokens), banned arbitrary size classes, spacing rhythm, no raw hex, 500-line cap.
- `tests/unit/utils/cn.test.ts` — class merging keeps the custom type scale (`text-label`, `text-body`, …) beside colours.
- `tests/integration` — route handlers against an in-memory Supabase fake.
- `tests/e2e` — Playwright, desktop + mobile, fixture mode; `axe.spec.ts` scans every route in both faces, with the design-locked steel pairing as the only exemption.
- `.github/workflows/ci.yml`: on every pull request into `main` and every push to `main`, `verify` runs types, lint, unit and integration tests and a production build, and `e2e` runs the Playwright suite. No secrets; fixture mode. `audit.yml` runs `npm audit` on production dependencies weekly and when the dependency files change. `tests/unit/ci-workflows.contract.test.ts` holds the policy.
