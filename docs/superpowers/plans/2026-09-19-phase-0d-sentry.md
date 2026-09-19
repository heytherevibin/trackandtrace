# Phase 0 · Part D: Error tracking (Sentry) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** crashes on the server, the edge and the browser reach Sentry with no PNR, email, token or cookie in them. Source maps upload at build time and never ship publicly.

**Architecture:**

- `@sentry/nextjs` 10.75.0 is initialised from `src/instrumentation.ts` (server and edge, plus `onRequestError`) and `src/instrumentation-client.ts` (browser, plus router transitions).
- Both take their options from `sentryOptions()`, whose `beforeSend`, `beforeSendTransaction` and `beforeBreadcrumb` all run one scrubber.
- `withSentryConfig` in `next.config.ts` tunnels events through `/monitoring` (same origin, so the CSP's `connect-src 'self'` holds and ad-blockers don't drop them). It uploads and then deletes source maps, and only when `SENTRY_AUTH_TOKEN` is present.
- With no `NEXT_PUBLIC_SENTRY_DSN` (local runs, CI, e2e), Sentry is off.

**Tech stack:** `@sentry/nextjs` 10.75.0 (peer `next ^16`), Next 16 instrumentation files, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-18-phase-0-foundations-design.md`, part D.

## Global Constraints

- **Keys:** they come from the Vercel Sentry integration: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN`, on Production and Preview. Connected 2026-09-19. No log drain was created, and none will be.
- **Privacy:**
  - `sendDefaultPii: false`, and no Session Replay.
  - The scrubber masks ten-digit runs (with the same `redact` as the logs), email addresses, `Bearer …`, and any token-like run of 24 or more characters.
  - It drops cookies, request bodies, query strings, user IP and email, and the `authorization`, `cookie`, `x-api-key` and `x-rapidapi-key` headers.
  - It keeps URL paths.
  - **It names no provider**, because it ships in the browser bundle. The privacy contract test scans `src/services/telemetry` and `src/instrumentation-client.ts`.
- **Sampling:**
  - `tracesSampleRate` is 0.05 in production and 1 in preview/development.
  - `environment` comes from `NEXT_PUBLIC_VERCEL_ENV ?? VERCEL_ENV ?? "development"`.
  - The release is injected by the build plugin from the commit SHA.
- **The proxy skips `/monitoring`:** there's no Supabase session work on tunnel requests.
- TDD, conventional commits with **no `Co-Authored-By`**, no `any`, files under 500 lines.

---

### Task 1: The scrubber

**Files:**
- Create: `src/services/telemetry/scrub.ts`
- Test: `tests/unit/services/telemetry/scrub.test.ts`
- Modify: `tests/unit/privacy/no-provider-names.test.ts` (ROOTS gains `src/services/telemetry` and `src/instrumentation-client.ts`)

**Interfaces:**
- Produces: `scrubText(text: string): string`, `scrubEvent<T extends Event>(event: T): T`, and `scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb`. `Event` and `Breadcrumb` are types from `@sentry/nextjs`.

- [ ] **Step 1: Failing tests:**
  - `scrubText` masks a PNR (`2345678901` → `23••••••01`), an email (→ `[email]`), a bearer token (→ `Bearer [token]`), and a 24+ character token (→ `[token]`). Short words and 16-hex chunk names are kept.
  - `scrubEvent` scrubs the message, exception values, breadcrumbs, span descriptions and nested `extra`/`contexts`.
  - `scrubEvent` removes `request.cookies`, `request.data` and `request.query_string`, cuts the query off `request.url`, drops the sensitive headers, and drops `user.ip_address` and `user.email`.
  - `scrubBreadcrumb` scrubs `message` and cuts the query off `data.url`.
  - Numbers and booleans are unchanged.
- [ ] **Step 2: Run and see it fail.**
- [ ] **Step 3: Implement.** A deep, immutable walk over `unknown`: strings become `scrubText`, arrays and objects are rebuilt, and the special keys are handled at `request`, `user` and `data.url`.
- [ ] **Step 4: Run and see it pass,** including the privacy test.
- [ ] **Step 5: Commit.** `feat(telemetry): a scrubber that keeps PNRs, emails, tokens and cookies out of error reports`

### Task 2: Options and initialisation

**Files:**
- Create: `src/services/telemetry/sentry-options.ts`, `src/instrumentation.ts`, `src/instrumentation-client.ts`
- Test: `tests/unit/services/telemetry/sentry-options.test.ts`

**Interfaces:**
- Produces: `sentryOptions(source = process.env): SentryOptions`. It carries `dsn`, `enabled`, `environment`, `sendDefaultPii: false`, `tracesSampleRate`, and the three hooks.

- [ ] **Step 1: Failing tests:**
  - it's disabled without a DSN
  - the environment comes from `NEXT_PUBLIC_VERCEL_ENV` or `VERCEL_ENV`
  - the sample rate is 0.05 in production and 1 elsewhere
  - `sendDefaultPii` is false
  - the hooks are the scrubbers, and `beforeSend` masks a PNR
- [ ] **Step 2: Run and see it fail.** **Step 3: Implement** `sentryOptions`, then the two instrumentation files:
  - `src/instrumentation.ts`: `register()` inits on `nodejs`/`edge`; `export const onRequestError = Sentry.captureRequestError`.
  - `src/instrumentation-client.ts`: `Sentry.init(sentryOptions())`; `export const onRouterTransitionStart = Sentry.captureRouterTransitionStart`.
- [ ] **Step 4: Run and see it pass.**
- [ ] **Step 5: Commit.** `feat(telemetry): Sentry on the server, the edge and the browser, scrubbed and off without a DSN`

### Task 3: Build wiring, tunnel and proxy

**Files:**
- Modify: `next.config.ts` (`withSentryConfig`), `src/proxy.ts` (the matcher skips `monitoring`), `tests/unit/next-config.test.ts`
- Test: `tests/unit/app/proxy-matcher.test.ts`

- [ ] **Step 1: Failing tests:**
  - the proxy matcher's pattern doesn't match `/monitoring` but still matches `/`, `/pnr` and `/account`
  - the www redirect tests still pass against the wrapped config
- [ ] **Step 2: Implement:**
  - wrap the config in `withSentryConfig(nextConfig, { org, project, authToken })`, taken from `SENTRY_*`
  - `silent: !process.env.CI`, `tunnelRoute: "/monitoring"`, `widenClientFileUpload: true`, `telemetry: false`
  - `sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN, deleteSourcemapsAfterUpload: true }`
  - `webpack: { treeshake: { removeDebugLogging: true } }`
  - add `monitoring` to the proxy matcher's negative lookahead
- [ ] **Step 3: Full check:** `npm run check && npx playwright test`. The build passes with no Sentry keys, and e2e stays green with Sentry off.
- [ ] **Step 4: Commit.** `feat(telemetry): tunnel Sentry through /monitoring and upload hidden source maps`

### Task 4: Docs, PR and verification

- [ ] Architecture: add a telemetry line to Layers, and a Failure-modes row ("Sentry unreachable: events dropped; the app is unaffected"). Onboarding: a Deploy bullet saying the Sentry integration supplies the four keys.
- [ ] Push, open the PR, and watch CI. The Vercel preview build shows "Sentry" uploading source maps.
- [ ] Merge with the user's go-ahead, then verify:
  - the site answers 200
  - `/monitoring` answers without 5xx on POST, and the tunnel is live
  - the browser bundle holds the public DSN only, with no auth token
  - have the user open Sentry → Issues after a deliberate client error (DevTools console: `throw new Error("sentry check 2345678901")` from the page, which Sentry's global handler catches). It should appear masked as `23••••••01`.
