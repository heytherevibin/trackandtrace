# Phase 0 · Part C: Provider resilience implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**

- A provider that keeps failing stops being called for a while: its circuit breaker opens, and the fallback answers at once.
- Only safe failures get one retry.
- Every provider request is counted against its daily usage, which is what we need for RailKit's quota.

**Architecture:** each third-party adapter reports *why* it failed, as a server-only `cause` with an HTTP `status`. `createGuardedSource(adapter, deps)` wraps each adapter inside the fallback. On every check it:

1. asks its breaker whether the provider may be called
2. counts the request
3. calls the adapter
4. retries once, only for network errors and 502/503/504, within 3 s
5. tells the breaker the outcome

Breaker and usage state live in a small `Kv` interface. On deployments that's Upstash, falling back to this instance's memory when Upstash errors. Locally it's memory only.

**Tech stack:** TypeScript strict, Vitest 4, the part B shared store (`@upstash/redis` through `upstash.ts`).

**Spec:** `docs/superpowers/specs/2026-09-18-phase-0-foundations-design.md`, part C and section 4.

## Global Constraints

- **Causes:** `timeout | network | server | refused | quota | unreadable`, plus `status` when HTTP answered. They're server-only and never reach the wire. "No record" is `NOT_FOUND`, an answer, not a failure.
- **Breaker, with state in the shared store (per-instance memory if the store is down):**
  - Five counting failures (`timeout | network | server | unreadable`) within 60 s open it for 30 s. Each repeat trip within 30 min doubles the window, up to 10 min.
  - `quota` (429) opens it for the provider's Retry-After or RateLimit-Reset, or 60 s.
  - `refused` (401/403) opens it for 10 min.
  - While it's open, the guard answers "unavailable" at once with `retryAfter` = the time left, and spends no provider request.
  - Half-open: after the window, requests probe. A counting failure re-opens it with the doubled window, and a success closes it and forgets the trips.
- **One safe retry:** only for `network`, or `server` with status 502/503/504, after 200–500 ms of jitter, and only if under 3 s have passed. Never for timeouts, other 4xx/5xx, or 429.
- **Usage:** every provider request, retries included, increments `tt:{env}:usage:{source}:{yyyy-mm-dd}` (IST date, 40-day TTL). Counts only, never PNRs. A failure to count never blocks a check.
- **Travellers:** the breaker's answer uses one new neutral line, `messages.source.outcomes.resting`, with no provider names (the privacy contract tests stay green).
- TDD, conventional commits with **no `Co-Authored-By`**, no `any`, files under 500 lines.

**Scope note:** the API envelope keeps dropping `retryAfter` for `SOURCE_UNAVAILABLE` (`fromSourceCode` takes code and message only). The breaker's `retryAfter` sits on the outcome for a later UI pass, and no client change comes with this part.

---

### Task 1: Adapters report a cause

**Files:**
- Create: `src/services/sources/outcome.ts`
- Modify:
  - `src/services/pnr-source.ts` (`PnrDataSource.check` returns `Promise<SourceOutcome>`)
  - `src/services/sources/railkit.ts`, `src/services/sources/rapidapi.ts`
  - `src/messages/en-IN/source.ts` (adds `resting`)
- Test: `tests/unit/services/sources/railkit.test.ts`, `tests/unit/services/sources/rapidapi.test.ts`

**Interfaces:**
- Produces:
  - `type FailureCause`
  - `type SourceFailure`, which is `Extract<PnrOutcome, { ok: false }>` plus `{ cause?: FailureCause; status?: number }`
  - `type SourceOutcome`
  - `unavailable(message, cause, extra?)`

- [ ] **Step 1: Failing tests.** In both adapter test files, add one table test that asserts `cause` and `status` for each failure path:
  - timeout → `{ cause: "timeout" }`
  - fetch rejects with a TypeError → `{ cause: "network" }`
  - 401 → `{ cause: "refused", status: 401 }`
  - 429 → `{ cause: "quota", status: 429 }`
  - 503 → `{ cause: "server", status: 503 }`
  - 500 → `{ cause: "server", status: 500 }`
  - a non-JSON 200 → `{ cause: "unreadable" }`
  - For RailKit also: a 4xx `{ success: false, error: "Something unexpected" }` → `{ cause: "unreadable" }`, and the no-record 400 → `NOT_FOUND` with no `cause`.
- [ ] **Step 2: Run and see it fail**: `npx vitest run tests/unit/services/sources` fails on the missing `cause`.
- [ ] **Step 3: Implement.** `outcome.ts`:

```ts
import type { PnrOutcome } from "@/types/domain";

/** Why a provider could not answer. Server-only: it drives the breaker and the retry policy, and never reaches the wire. */
export type FailureCause = "timeout" | "network" | "server" | "refused" | "quota" | "unreadable";

export type SourceFailure = Extract<PnrOutcome, { ok: false }> & { readonly cause?: FailureCause; readonly status?: number };
export type SourceOutcome = Extract<PnrOutcome, { ok: true }> | SourceFailure;

export function unavailable(message: string, cause: FailureCause, extra: { readonly status?: number; readonly retryAfter?: number } = {}): SourceFailure {
  return {
    ok: false,
    code: "SOURCE_UNAVAILABLE",
    message,
    cause,
    ...(extra.status === undefined ? {} : { status: extra.status }),
    ...(extra.retryAfter === undefined ? {} : { retryAfter: extra.retryAfter }),
  };
}
```

  In each adapter, replace the local `unavailable` with this one, and give every failure its cause and status:
  - timeout → `unavailable(OUT.timeout, "timeout")`
  - network → `"network"`
  - 401/403 → `"refused"`, with `{ status }`
  - 429 → `"quota"`, with `{ status, retryAfter }`
  - any other non-OK status → `"server"`, with `{ status }`
  - unreadable body, and a parser answering `SOURCE_UNAVAILABLE` → `"unreadable"`. Map the parser's result with `{ ...parsed, cause: "unreadable" }` when `!parsed.ok && parsed.code === "SOURCE_UNAVAILABLE"`.

  The adapters' `check` return type is `Promise<SourceOutcome>`, and `PnrDataSource.check` becomes `Promise<SourceOutcome>`. Every existing source still satisfies it, because the new fields are optional.

  Add `resting: "The reservation service is not answering right now. Try again shortly."` to `source.outcomes`.

- [ ] **Step 4: Run and see it pass**: `npx vitest run && npm run typecheck`.
- [ ] **Step 5: Commit.** `feat(sources): adapters report why a provider could not answer`

### Task 2: A small key-value interface over Upstash and memory

**Files:**
- Create: `src/services/kv.ts`
- Modify: `src/services/upstash.ts` (adds `incr`, `pexpire` and `pttl` to `RedisLike`), `tests/support/fake-upstash.ts` (the same three)
- Test: `tests/unit/services/kv.test.ts`

**Interfaces:**
- Produces:
  - `interface Kv { get(key): Promise<string | null>; set(key, value, ttlMs): Promise<void>; del(key): Promise<void>; incr(key, ttlMs, refreshTtl?): Promise<number>; ttl(key): Promise<number> }`
  - `class MemoryKv implements Kv` (constructed with an optional `now`)
  - `redisKv(redis: RedisLike): Kv`
  - `resilientKv(primary: Kv, fallback: Kv, onError?: (error: unknown) => void): Kv`

- [ ] **Step 1: Failing tests.** One behaviour suite runs against `MemoryKv` (with a fake clock) and `redisKv(fake.redis)`:
  - `set`/`get`/`del`
  - `ttl` returns the time left, or 0 when the key is absent
  - `incr` starts at 1 and sets the TTL only on creation, unless `refreshTtl`
  - keys expire

  Also test that `resilientKv` answers from the fallback when the primary throws, and reports the error.
- [ ] **Step 2: Run and see it fail.**
- [ ] **Step 3: Implement.**
  - `MemoryKv` keeps `Map<string, { value: string; exp: number }>`.
  - `redisKv`:
    - `incr` = `redis.incr`, then `redis.pexpire(key, ttlMs)` when the result is 1 or `refreshTtl` is set
    - `ttl` = `max(0, pttl)`, where -2/-1 become 0
    - `set` = `redis.set(key, value, { px })`
    - `get` returns a string or null
  - `resilientKv` wraps each method in try, falling back on catch.
  - Extend `RedisLike` with `incr(key): Promise<number>`, `pexpire(key, ms): Promise<unknown>` and `pttl(key): Promise<number>`, and extend the fake to match (`pttl` gives -2 when absent).
- [ ] **Step 4: Run and see it pass** (the whole suite, plus typecheck: `Redis` must still satisfy `RedisLike`).
- [ ] **Step 5: Commit.** `feat(store): a small key-value interface over Upstash and memory`

### Task 3: The circuit breaker

**Files:**
- Create: `src/services/breaker.ts`
- Test: `tests/unit/services/breaker.test.ts`

**Interfaces:**
- Consumes: `Kv` (Task 2), `SourceOutcome` (Task 1).
- Produces:
  - `createBreaker(kv: Kv, base: string, options?: { onChange?: (event: BreakerEvent) => void }): Breaker`
  - `interface Breaker { admit(): Promise<Admission>; record(outcome: SourceOutcome): Promise<void> }`
  - `type Admission = { open: false } | { open: true; retryAfterSeconds: number }`
  - `BREAKER` constants

- [ ] **Step 1: Failing tests** (`MemoryKv` with a fake clock):
  - closed: four failures in 60 s stay closed; a fifth opens it for 30 s, and `admit` gives `retryAfterSeconds` 30
  - failures spread over more than 60 s never trip it
  - after 30 s it admits (half-open); one counting failure re-opens it for 60 s, then 120 s, 240 s, 480 s, and caps at 600 s
  - a success in half-open closes it, so the next trip is 30 s again
  - `quota` with `retryAfter` 120 opens for 120 s, and without one for 60 s
  - `refused` opens for 600 s
  - `NOT_FOUND`, `INVALID` and OK never count
  - trips older than 30 min are forgotten, so the window is back to 30 s
  - `onChange` reports opening and closing
- [ ] **Step 2: Run and see it fail.**
- [ ] **Step 3: Implement** (keys under `base`: `:open`, `:fails`, `:trips`, `:probe`):

```ts
export const BREAKER = {
  threshold: 5,
  failureWindowMs: 60_000,
  baseOpenMs: 30_000,
  maxOpenMs: 600_000,
  tripMemoryMs: 1_800_000,
  refusedOpenMs: 600_000,
  quotaOpenMs: 60_000,
  probeGraceMs: 300_000,
} as const;
```

  - `admit`: `ms = await kv.ttl(open)`. When `ms > 0`, the answer is `{ open: true, retryAfterSeconds: ceil(ms / 1000) }`.
  - `record`: an outcome that is OK, or whose code isn't `SOURCE_UNAVAILABLE`, is a success. If `probe` is set, delete `probe` and `trips` and emit `closed`.
    - `refused` → `openFor(refusedOpenMs)`
    - `quota` → `openFor((retryAfter ?? 60) * 1000)`
    - otherwise it's a counting failure: if `probe` is set, trip; else `n = incr(fails, failureWindowMs)`, and trip when `n >= threshold`
    - `trip`: `t = incr(trips, tripMemoryMs, true)`, then `openFor(min(baseOpenMs * 2 ** (t - 1), maxOpenMs))`
    - `openFor(ms)`: set `open` for `ms`, set `probe` for `ms + probeGraceMs`, delete `fails`, and emit `opened` with `ms` and the reason
- [ ] **Step 4: Run and see it pass.**
- [ ] **Step 5: Commit.** `feat(sources): a circuit breaker per provider`

### Task 4: Daily usage counters

**Files:**
- Create: `src/services/usage.ts`
- Test: `tests/unit/services/usage.test.ts`

**Interfaces:**
- Produces: `createUsageCounter(kv: Kv, prefix: string, now?: () => Date): (source: string) => Promise<void>` and `usageKey(prefix, source, date): string`.

- [ ] **Step 1: Failing tests.**
  - The key is `tt:test:usage:railkit:2026-09-19` for an IST date. Use a UTC instant of `2026-09-18T20:00:00Z`, which is 01:30 on the 19th in IST.
  - Counting increments, with a 40-day TTL.
  - A failing `Kv` never throws.
- [ ] **Step 2: Run and see it fail.** **Step 3: Implement.** Use `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", ... })`, and wrap `incr` in try/catch. **Step 4: Run and see it pass.**
- [ ] **Step 5: Commit.** `feat(sources): daily provider usage counters`

### Task 5: The guarded source

**Files:**
- Create: `src/services/sources/guarded.ts`
- Test: `tests/unit/services/sources/guarded.test.ts`

**Interfaces:**
- Consumes: `Breaker` (Task 3), `SourceOutcome`/`unavailable` (Task 1).
- Produces:
  - `createGuardedSource(source, deps: GuardDeps): PnrDataSource`
  - `isSafeToRetry(outcome): boolean`
  - `retryDelayMs(random): number`
  - `GuardDeps = { breaker; countRequest: () => Promise<void>; sleep?; random?; now? }`

- [ ] **Step 1: Failing tests** (a stub source, a fake breaker, `sleep` recording its delays):
  - an open breaker means no provider call, and `SOURCE_UNAVAILABLE` with `messages.source.outcomes.resting` and `retryAfter`
  - `network` retries once, and the recorded delay is within [200, 500]
  - 503 retries, while 500, 429, 401, timeout and unreadable don't
  - a retry after more than 3 s has passed doesn't happen
  - `countRequest` runs once per provider request (twice with a retry)
  - the breaker records the final outcome
  - `retryDelayMs(() => 0)` is 200, and `retryDelayMs(() => 0.999)` is 500
- [ ] **Step 2: Run and see it fail.** **Step 3: Implement** as specified above. **Step 4: Run and see it pass.**
- [ ] **Step 5: Commit.** `feat(sources): a guarded source with a breaker gate, one safe retry, and usage`

### Task 6: Wire it in, and prove that an open breaker goes straight to the fallback

**Files:**
- Modify: `src/services/shared-store.ts` (adds `providerGuard(source, current)`), `src/services/sources/index.ts` (wraps each third-party adapter)
- Test: `tests/unit/services/sources/registry.test.ts` (the providers are guarded), `tests/integration/api/pnr-breaker.test.ts`

**Interfaces:**
- Produces: `providerGuard(source: ThirdPartySource, current?: Env): GuardDeps`. It's memoized per env and source.
  - With the shared store, the `Kv` is `resilientKv(redisKv(connectRedis(creds, 500)), localKv, report)`. Otherwise it's the module-level `localKv`.
  - The breaker base is `${prefix}:breaker:${source}`, and `onChange` logs through `log.warn` with no PNR.
  - The usage prefix is `prefix`.

- [ ] **Step 1: Failing integration test.**
  - Set `PNR_SOURCE=railkit`, `PNR_FALLBACK=rapidapi` and fake keys, with no store, so memory is used.
  - Stub the global `fetch`: RailKit answers 500 (a counting failure, with no retry), and RapidAPI answers a valid body.
  - Five checks of different PNRs each answer from the fallback, and RailKit's fetch count is 5.
  - A sixth check answers from the fallback, and RailKit's fetch count **stays 5**.
- [ ] **Step 2: Run and see it fail** (without the wiring, RailKit's count reaches 6).
- [ ] **Step 3: Implement the wiring.** In `thirdPartySource`, return `createGuardedSource(adapter, providerGuard(source, current))`.
- [ ] **Step 4: Run it all**: `npm run check && npx playwright test`. Expected: green, with e2e on the fixture, which is unguarded.
- [ ] **Step 5: Commit.** `feat(sources): guard both providers; an open breaker goes straight to the fallback`

### Task 7: Docs and PR

- [ ] `docs/architecture.md`:
  - In the Layers diagram, the `sources` line notes the guard (breaker, one safe retry, usage).
  - Add Failure-modes rows for "Provider failing repeatedly" (the breaker opens and the fallback answers) and "Provider refuses the key or plan" (the breaker is open 10 min).
- [ ] Commit this plan. Push, open the PR, and watch CI. Merge with the user's go-ahead, and verify production: the site answers 200, a made-up PNR is still "No record", and the logs show no `[store]` or breaker warnings.
