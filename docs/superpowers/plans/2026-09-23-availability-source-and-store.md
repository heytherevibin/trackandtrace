# Availability Source and Observation Store — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ask RailKit for seat availability behind the same seam the PNR path uses, and start recording observations a Trakline prediction will later be fitted to — beginning today, because a missed day cannot be backfilled.

**Architecture:** `AvailabilitySource` mirrors `PnrDataSource` exactly: one adapter, fail-closed parsing, wrapped by the existing breaker/retry/usage guard. Observations land in one table holding no personal data. A crawler script is the only feeder in this plan; the traveller feeder waits on the form.

**Tech Stack:** Next.js 16.3.4, Supabase/Postgres with pgTAP, zod 4, Vitest, Node 24.

**Spec:** `docs/superpowers/specs/2026-09-23-pre-booking-availability-design.md` — read it first. Every number in it was measured against the live API on 2026-09-23, not assumed.

## Global Constraints

Every task's requirements implicitly include all of these. Each is a bug this project has already shipped or nearly shipped.

- **A refusal must never read as "no seats".** A false sold-out on a booking-adjacent page is the worst bug this feature can ship. Every provider refusal maps to an unavailable outcome; only a real `REGRET` means sold out, and it must not be swallowed as a failure. Both directions get tests.
- **Never name the provider on a traveller surface.** "A verified railway source", as the PNR path already says.
- **Date format converts once, inside the adapter.** ISO everywhere internal; `DD-MM-YYYY` only in the URL. RailKit answers `Invalid date format. Use DD-MM-YYYY.` for ISO, and a second conversion site is how two callers diverge.
- **Parse, never cast.** `schema.parse(data)`, never `data as T`. A malformed row fails closed.
- **No personal data in the observation store.** No PNR, no user id, no passenger anything. These are facts about berths.
- **The four-date window is the provider's, not ours.** Parse the array's length; never assume four.
- **A test fixture must use the format its source actually produces.** Two production bugs this week came from fixtures that did not — a `Z` timestamp Postgres never emits, and an unwrapped base64 string. Take shapes from §4.2 and §5.3 of the spec, which were copied off the wire.
- **Never read any `.env*` file other than `.env.example`.** Scripts take the env file as an argument; the key is never printed.
- TypeScript strict, never `any`. Files under 500 lines.
- Conventional commits, and **no `Co-Authored-By` trailer** — this project's CLAUDE.md forbids it.
- A fresh worktree has **no `node_modules`**: `npm ci` before `npm run check`, or `next build` fails while typecheck and tests silently resolve from the parent checkout.

## File Structure

| File | Responsibility |
|---|---|
| `src/services/availability-source.ts` | the seam: `AvailabilityRequest`, `AvailabilityAnswer`, `AvailabilitySource` |
| `src/services/sources/railkit-availability.ts` | the adapter: URL shape, headers, status mapping |
| `src/services/sources/railkit-availability-parse.ts` | the parser: zod shapes, `rawStatus` split, fail-closed |
| `supabase/migrations/2026…_availability_observations.sql` | the table, its indexes and its grants |
| `supabase/tests/availability_observations.test.sql` | pgTAP: grants, the generated column, the outcome view |
| `src/services/observations.ts` | `recordObservations(answer, request)` — the one write path |
| `scripts/crawl-availability.mjs` | the crawler |
| `scripts/routes.json` | the route list, with its bias documented |

---

### Task 1: The seam, the adapter, and the refusals that must not lie

**Files:** Create `src/services/availability-source.ts`, `src/services/sources/railkit-availability.ts`, `src/services/sources/railkit-availability-parse.ts`; tests alongside in `tests/unit/services/sources/`.

**Interfaces — Produces:** the three types in spec §4.1 verbatim, and `createRailKitAvailabilitySource(deps): AvailabilitySource`.

**Consumes:** `unavailable()` and `FailureCause` from `src/services/sources/outcome.ts`; `createGuardedSource`'s shape from `guarded.ts` — read both before writing, and reuse rather than reimplement.

- [ ] **Step 1: Write the failing tests.** One per refusal in spec §4.3, each asserting the outcome is unavailable and **not** an empty availability list; plus one asserting a real `REGRET` day parses as a day, not a failure; plus one asserting an ISO date never reaches the URL.
- [ ] **Step 2: Run them failing.**
- [ ] **Step 3: Write the parser**, from the shapes in spec §4.2. Split `rawStatus` (`GNWL65/WL26`) into booking-position and current waitlist — both are stored later, and the friendly text alone throws half the signal away. A `rawStatus` that does not match the expected shape is kept verbatim and its parsed halves are null; it is **not** a parse failure.
- [ ] **Step 4: Write the adapter.** `GET /api/v1/seats/:trainNo/:from/:to/:date/:class/:quota`, `x-api-key`, date converted here and nowhere else.
- [ ] **Step 5: Run everything**, then commit — `feat(source): seat availability behind the PnrDataSource seam`

---

### Task 2: The observation store

**Files:** Create the migration and its pgTAP test; create `src/services/observations.ts`; tests alongside.

**Interfaces — Produces:** `recordObservations(request, answer): Promise<number>` returning rows written.

Table, indexes and grants exactly as spec §5.1, with two additions the spec leaves to this task:

- `wl_booking` and `wl_current` integer columns, from Task 1's `rawStatus` split.
- Grants: **revoked from `anon` and `authenticated`**; written by the service role only. Supabase auto-grants on new public tables, so the revoke is not optional. Assert it in pgTAP.

- [ ] **Step 1: Write the failing pgTAP** — the grants are exactly as intended; `days_out` is generated and cannot be written by a caller; the same `(train, class, quota, journey_date, observed_at::date)` twice is idempotent rather than duplicated.
- [ ] **Step 2: Run them failing** — `npm run db:reset && npm run db:test`.
- [ ] **Step 3: Write the migration.** Decide and record whether idempotency is a unique index or an upsert; a crawler retried after a partial failure must not double-count.
- [ ] **Step 4: Write `recordObservations`.** One row per returned day. Never throws into a caller's path: a failed insert loses an observation, never a response.
- [ ] **Step 5: Run everything**, then commit — `feat(source): record what availability said`

---

### Task 3: The crawler

**Files:** Create `scripts/crawl-availability.mjs` and `scripts/routes.json`; tests for the route-list shape and the window maths.

The crawler asks once per `(train, class, quota, from, to)` per run. One call returns the requested date plus three (spec §5.3), so a sixty-day horizon is ~15 calls per combo — **not** sixty. Walk the horizon in four-day strides.

**It must be honest about gaps.** Past dates cannot be read (measured), so a missed run is a permanent hole. The script reports, per run: combos attempted, calls made, rows written, and **every combo that failed, with why**. A silent partial run is the failure mode that quietly ruins the dataset.

`scripts/routes.json` carries the initial list **and a comment on its bias**: routes chosen predict their own kind. Start with a deliberate spread — a Rajdhani, a Mail/Express, a branch route — not three of the same.

- [ ] **Step 1: Write the failing tests** — the stride maths covers a horizon exactly once with no gaps and no repeats; a refused combo is reported and does not abort the run; the summary counts what actually happened.
- [ ] **Step 2: Run them failing.** **Step 3:** the stride and the reporting. **Step 4:** the route list.
- [ ] **Step 5: Run it once for real** against a small list, report the rows written and the quota consumed, then commit — `feat(source): the availability crawler`

---

### Task 4: Make a gap visible

**Files:** Modify `scripts/crawl-availability.mjs`; create `scripts/observations-report.mjs`; docs.

A permanent hole deserves more than a log line nobody reads. This task adds the smallest thing that makes a gap findable: a report over the store answering **which journey dates were expected and are missing**, per combo, and a non-zero exit when coverage drops below a threshold — so it can be wired to a check later, exactly as `npm run source:health` was.

- [ ] **Step 1: Write the failing tests** — a seeded store with a deliberate hole is reported; a complete one is not; the exit code follows the threshold.
- [ ] **Step 2: Run them failing.** **Step 3:** the report. **Step 4:** wire the crawler's own summary to it.
- [ ] **Step 5: Run everything**, write `docs/runbooks/availability-crawler.md` — how to run it, what a gap means, why it cannot be backfilled — then commit — `feat(source): show where the observations are missing`

---

## Not in this plan

- **Train selection on Form TL-02.** It has no train field, so Pre-booking cannot make a request and the traveller feeder is blocked. It needs a drawn sheet first; it is its own batch.
- **Rendering availability** on the page, for the same reason.
- **Removing the RapidAPI source** — decided, but its own change with its own blast radius.
- **The model, the accuracy page, the odds switch** — Part C, its own spec, once data exists.

## Known hazards

- `npm run db:reset` before `npm run db:test` when a migration changes; editing a migration is not resetting the database.
- No `psql` on this machine; a shim lives in the session scratchpad.
- The two Playwright suites cannot run concurrently — Next allows one dev server per project.
- Advance is 10,000 calls/month ≈ 333/day, shared with live traffic. A crawler that runs away eats the month.
