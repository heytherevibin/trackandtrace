# Phase 0 — Foundations and stability: design

Date: 2026-09-18, updated 2026-09-19 · Status: **draft for review** · Owner: Vibin Mathew

Phase 0 of the roadmap agreed on 2026-09-18 (foundations → admin core → provider operations → leads → traveller features → design pass → launch checks). Everything later leans on it: a shared store, predictable failure behaviour, error visibility, and automatic tests.

## 1. Where things stand

Done already (not in scope):

- the redesign and pending work (PR #1)
- Vercel Pro project `trakline` at **https://trakline.in**, with functions in `bom1` (`vercel.json`), and the production env
- Supabase sign-in addresses (PR #2); RailKit as the primary PNR source with a RapidAPI fallback (PR #3)
- PNRs kept out of every request address (PR #4)
- travellers see one service, "Trakline", with service status in place of the sources board (PR #5)
- sign-in on trakline.in (PR #6)
- `www` redirects to the apex; sign-in mail goes through Resend SMTP from `signin@trakline.in` with the Trakline templates (PR #7)

Still open, and the scope of this document:

| # | Piece | Why now |
|---|---|---|
| A | Automatic tests on GitHub (CI) | Nothing checks a change before it reaches `main` |
| B | Upstash Redis: shared rate limits and an encrypted shared PNR cache | Limits and cache are per server instance today, so limits leak and RailKit calls repeat |
| C | Provider resilience: breaker, one safe retry, single-flight, usage counters | A failing provider is called on every check; RailKit quota is finite (10,000/month) |
| D | Error tracking (Sentry) with scrubbing | Vercel keeps 1 day of logs; crashes are invisible |
| E | Enforced security headers and a dependency audit | The CSP is report-only |
| F | What's left of the domain work: the email rate limit, a delivery check and the passkey RP ID | Domain, SMTP and templates are live; passkeys are still off |

Non-goals: admin console, alerts, status page, key pool (Phases 2–3); Vercel WAF rules (usage-billed; revisit with traffic data).

## 2. Decisions already taken

- PNR cache in Upstash is **hashed and encrypted**: Upstash never sees a PNR or a record in the clear.
- Upstash rather than Postgres for limits and counters.
- Sentry for error tracking. Vercel Pro, spend cap $40 (set by the user in Vercel).
- Domain **trakline.in** (DNS at GoDaddy). Resend sends from `signin@trakline.in` with open and click tracking off.
- RailKit primary, RapidAPI fallback (RapidAPI stays on its free plan). Travellers never see either name. Pages, messages and the API say "Trakline".

## 3. Design

### A. CI (GitHub Actions)

The repository is public, so GitHub-hosted runners are free. One workflow, `.github/workflows/ci.yml`:

- Triggers: every push, and pull requests into `main`. `concurrency` cancels superseded runs on the same ref.
- Job `verify` (Node 24, the Vercel default): `npm ci` → `typecheck` → `lint` → `test:unit` (Vitest, includes `tests/integration`) → `build` with no env vars (the same as a fresh Vercel build).
- Job `e2e` (parallel): Playwright Chromium with system deps, browsers cached by Playwright version, `npx playwright test` in fixture mode (desktop + mobile, axe scans). The HTML report is uploaded only on failure.
- Job `audit`: on a weekly schedule and on changes to `package-lock.json`: `npm audit --omit=dev --audit-level=high`. It fails on high or critical advisories in production dependencies only.
- No secrets in CI: every test runs on the sample-data fixture.
- After it is green once, `main` requires `verify` and `e2e` (a GitHub setting; changed only with the user's go-ahead).

### B. Shared store (Upstash Redis, `ap-south-1` Mumbai)

One Upstash database, the free plan to start (500K commands/month, 256 MB). The client is `@upstash/redis` (REST, fits serverless). Every key is prefixed with the environment (`tt:production:`, `tt:preview:`), so previews can share the database without touching production numbers.

**Secret material.** One new server-only secret, `DATA_KEY` (32 random bytes, base64). HKDF-SHA256 derives three subkeys from it: cache-key HMAC, cache-value encryption, and client-address hashing. Rotating `DATA_KEY` empties the cache (entries miss) and resets limit windows; nothing else depends on it.

**Rate limits.** `@upstash/ratelimit`, sliding window, 20 checks per 60 s per client address (unchanged limit). The identifier is `HMAC(address)`, never the raw address. An `ephemeralCache` blocks known-over-limit addresses without a Redis call. `timeout: 1000 ms`: if Redis is slow, the library allows the request and marks it `timeout`; we then apply the existing per-instance memory limiter, so traffic stays limited (per instance) rather than unlimited. Any Redis error takes the same fallback. Analytics are off.

**PNR cache.** `pnr-query` keeps its read-through shape, but the cache interface becomes async:

- key `tt:{env}:pnr:v1:{base64url(HMAC-SHA256(pnr))}`
- value `v1.{iv}.{ciphertext}.{tag}`: AES-256-GCM over the JSON outcome, with the key as associated data, so a value cannot be moved to another key
- TTL 60 s; only successful records are cached (as today)
- a decrypt failure, version mismatch or Redis error is a **miss**, never an error, and never shown data

RailKit's terms allow temporary caching for performance; 60 s qualifies.

**Single-flight.** Concurrent checks of the same PNR on one instance share one in-flight provider call (a `Map` of promises cleared on settle). Across instances the shared cache already absorbs repeats within 60 s.

**Env schema.** `RATE_LIMIT_STRATEGY=upstash` plus `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` become **required in production builds** (`NODE_ENV=production`, which includes previews), along with `DATA_KEY`. Missing any of them refuses to boot, the same fail-loudly rule as `PNR_SOURCE=fixture`.

### C. Provider resilience

A wrapper, `createGuardedSource(name, source, deps)`, is composed around each third-party adapter in the registry, **inside** the fallback. So when RailKit's breaker is open, the fallback sees "unavailable" and asks RapidAPI at once.

Adapters already return honest outcomes; they gain one internal field on failures, `cause: "timeout" | "network" | "server" | "refused" | "quota" | "unreadable" | "no-record"`. It stays inside the server: the wire envelope is unchanged.

- **Breaker** (state in Redis, shared by all instances; per-instance memory if Redis is down):
  - 5 failures (`timeout | network | server | unreadable`) within 60 s open it for 30 s. Each repeat trip within 30 min doubles the window, up to 10 min.
  - `quota` (HTTP 429) opens it for the provider's `Retry-After` / `RateLimit-Reset`, or 60 s.
  - `refused` (401/403: a bad or expired key or plan) opens it for 10 min. Phase 3 adds an alert here.
  - While open, the wrapper answers "unavailable" immediately, with `retryAfter` = time left, without spending a provider request.
  - Half-open: after the window, the next request probes; failure re-opens with the doubled window.
- **One safe retry**: only for `network` and HTTP 502/503/504, after 200–500 ms jitter, and only if under 3 s have passed. Never for timeouts (a slow provider stays slow), 4xx or 429.
- **Usage counters**: every provider request increments `tt:{env}:usage:{source}:{yyyy-mm-dd}` (40-day TTL). Counts only, no PNRs. The Phase 3 dashboard reads them, and they show quota burn against RailKit's 10,000/month.

### D. Error tracking (Sentry)

- `@sentry/nextjs` 10.x (supports Next 16) with `instrumentation.ts` (server, edge) and `instrumentation-client.ts` (browser).
- Free Developer plan: 1 user, 5k errors/month, 5M spans, 30-day lookback (checked 2026-09-18). The pricing page does not state commercial terms, so check Sentry's terms before earning money.
- **Privacy:** `sendDefaultPii: false`. One scrubber runs in `beforeSend`, `beforeSendTransaction` and `beforeBreadcrumb`. It masks ten-digit runs, email addresses, `railkit_…` / `sb_…` / bearer tokens and `x-api-key` values; drops cookies, request bodies and query strings; and keeps URL paths (which no longer carry PNRs). No Session Replay.
- `tracesSampleRate` 0.05 in production, 1 in preview; `environment` from `VERCEL_ENV`; `release` from `VERCEL_GIT_COMMIT_SHA`.
- `tunnelRoute: "/monitoring"`: events go through our origin, so the CSP keeps `connect-src 'self'` and ad-blockers don't drop them.
- Source maps upload at build time with `SENTRY_AUTH_TOKEN` and are hidden from the public bundle.
- Without `NEXT_PUBLIC_SENTRY_DSN` (local, CI) Sentry is off and the app behaves the same.

### E. Security headers and dependency audit

- **CSP enforced on the public site:** `Content-Security-Policy-Report-Only` becomes `Content-Security-Policy`, with `upgrade-insecure-requests` added.
  - Script policy stays `'self' 'unsafe-inline'`. Next 16's per-request nonces force dynamic rendering, which would give up static pages and CDN caching (see `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`).
  - The admin host gets the strict nonce policy in Phase 2.
  - `report-uri` points at Sentry's security endpoint once D lands, so violations are visible in production.
- **Browser test `csp.spec.ts`** (the file `next.config.ts` already mentions): visits every route in both themes, collects `securitypolicyviolation` events, and fails on any.
- The dependency audit runs in CI (A).

### F. Domain and email (with the user)

Done on 2026-09-19:

- `trakline.in` is on the Vercel project. `www.trakline.in` answers with a 308 to the apex, keeping the path and query (`next.config.ts`, PR #7).
- Resend: `trakline.in` is verified (Tokyo) with SPF, DKIM and DMARC. The free plan allows 3,000 emails a month and 100 a day (checked 2026-09-18).
- Supabase custom SMTP uses `smtp.resend.com:465`, user `resend`, sender "Trakline" `<signin@trakline.in>`. It is set in the dashboard, and `config.toml` declares no SMTP, so config push leaves it alone.
- The Trakline templates are pushed (`supabase/templates/*.html`, subject "Your Trakline sign-in link").
- `site_url` and the redirect list are on trakline.in (`[remotes.production.auth]`).

Left:

1. Email rate limit. Config push doesn't manage `auth.rate_limit.email_sent`, so it is set in the dashboard: Authentication → Rate Limits, at least 30 an hour.
2. Delivery check: a sign-in from an address outside the Supabase organisation arrives from `signin@trakline.in`. Resend's log shows it delivered.
3. Passkeys: set the WebAuthn RP ID to `trakline.in`, then `AUTH_PASSKEY_ENABLED=1`. Passkeys are bound to that domain.

### New and changed configuration

| Variable | Where | Secret | Notes |
|---|---|---|---|
| `RATE_LIMIT_STRATEGY=upstash` | Prod + Preview | no | required in production builds |
| `UPSTASH_REDIS_REST_URL` | Prod + Preview | no | Mumbai database |
| `UPSTASH_REDIS_REST_TOKEN` | Prod + Preview | **yes** | |
| `DATA_KEY` | Prod + Preview | **yes** | `openssl rand -base64 32`; entered by the user |
| `NEXT_PUBLIC_SENTRY_DSN` | Prod + Preview | no | public by design |
| `SENTRY_ORG`, `SENTRY_PROJECT` | Prod + Preview | no | build-time |
| `SENTRY_AUTH_TOKEN` | Prod + Preview | **yes** | build-time, source maps |

## 4. Failure behaviour

| Condition | Behaviour |
|---|---|
| Upstash slow or down | Limits fall back to per-instance memory; cache misses; breaker per instance. Checks keep working. The failure goes to Sentry, at most once a minute per instance |
| Cached value unreadable (rotated key, tampering) | Miss; fresh provider call |
| RailKit failing repeatedly | Breaker opens; RapidAPI answers at once (shown as Trakline, as always); RailKit is probed after the window |
| RailKit key or plan refused | Breaker open 10 min; RapidAPI answers; Phase 3 alerts |
| Both providers unavailable | Honest unavailable state ("The reservation service …", naming no provider) and a retry time; no provider request while breakers are open |
| Sentry unreachable | Events dropped; the app is unaffected |
| CSP violation in production | Blocked in the browser, reported to Sentry |

## 5. Tests (written first)

- **Unit:**
  - HKDF subkeys, cache cipher (round trip; tamper, wrong key, wrong version → miss)
  - key prefixing
  - the limiter fallback on timeout and error
  - the breaker (every transition, backoff cap, 429 and 401 windows)
  - retry policy (which causes retry, jitter bounds, time budget)
  - single-flight
  - usage counters
  - the scrubber (ten-digit runs, emails, tokens, cookies, bodies)
  - env rules (production requires Upstash and `DATA_KEY`)
- **Integration:** `POST /api/pnr` against an in-memory Redis fake. It checks shared-limit behaviour, the cache hit across two "instances", breaker open → fallback source, and Redis down → still answers.
- **E2E:** `csp.spec.ts`. The existing suite stays green in fixture mode (memory limiter, no Redis).
- **CI:** the workflow itself is proven by a green run on the PR that adds it.

## 6. Order of work (one PR each)

1. **A: CI.** First, so every later PR is checked.
2. **B: Upstash store, limiter, encrypted cache, single-flight.** Needs the user's Upstash database and `DATA_KEY` before production is switched.
3. **C: breaker, retry, usage counters.**
4. **D: Sentry.** Needs the user's Sentry project.
5. **E: CSP enforcement and `csp.spec.ts`.**
6. **F: what's left of the domain work.** The rate limit and delivery check now; passkeys when the RP ID is set.

Each PR: tests first, full checks green locally and in CI, merged with the user's go-ahead, then verified on the live site.

## 7. What only the user can do

- Create the Upstash database (Mumbai, free) and add its URL and token to Vercel.
- Run one command to generate `DATA_KEY` into Vercel (a hidden prompt, as with the RailKit key).
- Create a Sentry project (Next.js) and add its DSN, org, project and auth token.
- Set the Supabase email rate limit in the dashboard, then sign in once from an address outside the Supabase organisation.
- Rotate the RailKit key, which was shown in a screenshot, then enter the new one through the hidden prompt.
- Approve requiring CI on `main`.

## 8. Risks and open questions

- **Sentry commercial terms** are not on the pricing page; confirm before monetising.
- **Upstash free plan (500K commands/month):** each check costs about 3–5 commands (limit, cache get/set, breaker, counter). That is roughly 100K checks a month, above RailKit's 10K cap, so the database is not the bottleneck. Watch it at launch.
- **Timeout fallback trade-off:** falling back to per-instance limits during a Redis outage lets an abuser get up to 20/min per instance. That's accepted: the alternative blocks every traveller.
- **CSP keeps `'unsafe-inline'`** for scripts on the public site. Strict nonces arrive with the admin host.
- **Public repository:** the code and docs name the providers, which travellers never see on the site. Making the repository private hides them, but then Actions minutes count against the GitHub plan (2,000 a month on Free), so CI would need a budget.

## 9. Acceptance

- CI runs on every push; `main` requires it.
- Production has Upstash, `DATA_KEY` and Sentry configured. `/accuracy` and a made-up PNR check behave as today. A second identical check within 60 s is served from the shared cache (visible in the envelope's `cached: true`).
- Forcing RailKit to fail (preview only, a bad key) opens its breaker: subsequent checks go straight to RapidAPI, and no RailKit request is spent until the window ends.
- A thrown error in production appears in Sentry with no PNR, email or key in it.
- The CSP header is enforced and `csp.spec.ts` passes.
- Sign-in email from `signin@trakline.in` reaches an address outside the Supabase organisation.
