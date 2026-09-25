# TL-02 v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** List every train on a route with a real availability answer per row, sortable and filterable, with the remaining chosen classes and three neighbouring dates one click away.

**Architecture:** A new fan-out service composes the two shipped query services. The route lookup gives every train in one request; the first chosen class is then asked for each train with bounded concurrency, having paid the rate limit and the budget once, at the search. The remaining classes arrive when a row is opened. Nothing in the source layer changes.

**Tech Stack:** Next.js (see `node_modules/next/dist/docs/` — this version differs from training data), React, TypeScript strict, Tailwind v4 with `@theme inline` tokens, Zod, Vitest, Playwright, Upstash KV.

**Spec:** `docs/superpowers/specs/2026-09-25-tl02-v2-route-availability-design.md`

## Global Constraints

Every task's requirements implicitly include these. Copied verbatim from the spec §3.

- **A refusal is never an empty list.** An empty `days` reads as "no berths"; an empty `trains` means "no trains run this pair", which is a real answer. A failure must render as a refusal, never as an empty or absent table.
- **Never name a data provider on a traveller surface.** Answers come "from Trakline".
- **Never predict.** The source's own prediction percentage is never shown. Status colour is keyed to what the source said, never to how likely a queue looks to clear.
- **A sample answer always says so.** `sampleData` must reach the plate; `pages.spec.ts` enforces it.
- **No weekday may be named** from the running-day mask. "Runs 4 days a week" is what ships.
- **Never put a PNR in a URL or a log.** Nothing on these paths is personal, and it stays that way.
- TypeScript strict, no `any` — `unknown` plus narrowing. Files under 500 lines. Path aliases (`@/services/...`), never `../../..`.
- TDD: write the failing test first, run it, show it fail, then implement.
- Conventional commits, **no `Co-Authored-By` trailer**.
- `npm run check` must pass whole — a subset is not the gate.

## File Structure

| File | Created / Modified | Responsibility |
|---|---|---|
| `src/services/live-budget.ts` | modify | gains `takeMany(n)`; `take()` unchanged |
| `src/services/route-availability-query.ts` | create | the fan-out: limit → route → cap → reserve → fan out → record |
| `src/app/api/route-availability/route.ts` | create | `POST`, the search |
| `src/app/api/availability/route.ts` | modify | accepts `travelClasses` as well as `travelClass` |
| `src/services/availability-query.ts` | modify | a class-list ask, sharing the one budget reservation |
| `src/components/pre-booking/class-chips.tsx` | create | the multi-select group |
| `src/app/(site)/pre-booking/pre-booking-form.tsx` | modify | class chips replace the class select; submits a search |
| `src/app/(site)/pre-booking/trains-plate.tsx` | create | plate, controls strip, rows |
| `src/app/(site)/pre-booking/train-row.tsx` | create | one train: facts, blocks, expand |
| `src/app/(site)/pre-booking/class-block.tsx` | create | status, figure, class + fare, history line |
| `src/app/(site)/pre-booking/availability-plate.tsx` | keep | the opened train's four-date matrix |

---

### Task 1: `takeMany` on the live budget

**Files:**
- Modify: `src/services/live-budget.ts`, `src/services/kv.ts`, `src/services/upstash.ts`
- Test: `tests/unit/services/live-budget.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `LiveBudget.takeMany(n: number): Promise<BudgetVerdict>` — reserves `n` units all-or-nothing. `UNLIMITED_BUDGET.takeMany` always succeeds.

- [ ] **Step 1: Read the existing file and its test** so the new method matches the shape already there (`incr`, the IST day key, `BUDGET_TTL_MS`, the once-a-day `report`).

- [ ] **Step 2: Write the failing tests**

Three behaviours, and the third is the one that matters:

```ts
it("reserves n units in one call", async () => {
  const kv = countingKv();
  const budget = createLiveBudget({ kv, prefix: "t", limit: () => 10, now: () => DAY });
  expect(await budget.takeMany(4)).toEqual({ ok: true });
  expect(kv.value("t:budget:live:2026-09-25")).toBe(4);
});

it("refuses the whole reservation when it would cross the limit", async () => {
  const kv = countingKv();
  const budget = createLiveBudget({ kv, prefix: "t", limit: () => 10, now: () => DAY });
  await budget.takeMany(8);
  const verdict = await budget.takeMany(4);
  expect(verdict.ok).toBe(false);
  // All or nothing: a refused reservation leaves the counter where it was, so the
  // next smaller ask can still succeed. A partial take would strand 2 units for the day.
  expect(kv.value("t:budget:live:2026-09-25")).toBe(8);
  expect((await budget.takeMany(2)).ok).toBe(true);
});

it("never blocks when the store cannot count", async () => {
  const budget = createLiveBudget({ kv: throwingKv(), prefix: "t", limit: () => 1, now: () => DAY });
  expect(await budget.takeMany(50)).toEqual({ ok: true });
});
```

- [ ] **Step 3: Run them and watch them fail**

Run: `npx vitest run tests/unit/services/live-budget.test.ts`
Expected: FAIL — `budget.takeMany is not a function`.

- [ ] **Step 4: Implement**

`KvStore.incr` is `incr(key, ttlMs, refreshTtl?)` — its third argument is a **boolean**, not a count, so
`takeMany` cannot reuse it. Add a sibling to the interface and to both implementations
(`src/services/kv.ts`, and the Upstash one in `src/services/upstash.ts`):

```ts
/** Add `by` to a counter in one round trip. `by` may be negative, to give a reservation back. */
incrBy(key: string, ttlMs: number, by: number, refreshTtl?: boolean): Promise<number>;
```

Then:

```ts
async takeMany(n: number) {
  const at = now();
  const day = istDate(new Date(at));
  const limit = options.limit();
  const key = `${options.prefix}:budget:live:${day}`;
  let used: number;
  try {
    used = await options.kv.incrBy(key, BUDGET_TTL_MS, n);
  } catch {
    // A store that can't count never blocks a search; the shared store already falls
    // back to this instance's memory.
    return { ok: true };
  }
  if (used <= limit) return { ok: true };
  // All or nothing: give back what this call added, so a refused search does not
  // strand units that a smaller one could still have used.
  try {
    await options.kv.incrBy(key, BUDGET_TTL_MS, -n);
  } catch {
    // A refund that fails over-counts the day, which is the safe direction.
  }
  await report(day, limit);
  return { ok: false, retryAfterSeconds: secondsToIstMidnight(at) };
}
```

Leave `take()` exactly as it is — rewriting it as `takeMany(1)` would change which KV call the shipped
PNR path makes, for no gain. `UNLIMITED_BUDGET` gains `takeMany: async () => ({ ok: true })`.

- [ ] **Step 5: Run the tests, then the whole file's neighbours**

Run: `npx vitest run tests/unit/services/live-budget.test.ts tests/unit/services/shared-store.test.ts`
Expected: PASS, and every pre-existing `take()` test still green.

- [ ] **Step 6: Mutation-test the all-or-nothing rule.** Delete the refund, re-run. Expected: the second test fails on the counter assertion. Restore.

- [ ] **Step 7: Commit**

```bash
git add src/services/live-budget.ts src/services/kv.ts tests/unit/services/live-budget.test.ts
git commit -m "feat(budget): reserve many units at once, all or nothing"
```

---

### Task 2: The fan-out service

**Files:**
- Create: `src/services/route-availability-query.ts`
- Test: `tests/unit/services/route-availability-query.test.ts`

**Interfaces:**
- Consumes: `queryRoute` (`services/route-query.ts`), `getAvailabilitySource()` and `AvailabilitySource.check` (`services/sources`), `recordObservations`, `LiveBudget.takeMany` from Task 1, `createRateLimiter`, `addressKey`.
- Produces: `queryRouteAvailability(request, ip, overrides?)`, and the types `RouteAvailabilityRequest`, `TrainRow`, `RouteAvailabilityAnswer`, `RouteAvailabilityOutcome`, `RouteAvailabilityQueryResult` exactly as spec §6.1 declares them. Also `ROUTE_AVAILABILITY_RATE_LIMIT = { limit: 6, windowMs: 60_000 }` and `ROUTE_AVAILABILITY_MAX_TRAINS = 12`.

- [ ] **Step 1: Read `services/availability-query.ts` end to end.** The new service mirrors its order and its comments' voice, and must **not** call `queryAvailability` — that would take the per-ask limit and one budget unit per train, double-counting what the search already paid. Call the source.

- [ ] **Step 2: Write the failing tests**

```ts
it("spends one route request and one per train, and nothing more", async () => {
  const source = countingSource();
  const { outcome } = await queryRouteAvailability(
    { from: "SBC", to: "NDLS", journeyDate: "2026-10-16", quota: "GN", classes: ["SL", "3A", "2A"] },
    IP,
    { route: routeReturning(EIGHT_TRAINS), source, budget: unlimited(), limiter: allowAll() },
  );
  expect(outcome.ok).toBe(true);
  expect(source.calls).toHaveLength(8);
  // The lead is the first of the chosen classes in the ENUM's order, not the first clicked
  // and not the cheapest — so two readers with the same selection see the same column.
  expect(new Set(source.calls.map((c) => c.travelClass))).toEqual(new Set(["2A"]));
});

it("names the classes it did not ask", async () => {
  const { outcome } = await queryRouteAvailability(REQUEST_SL_3A_2A, IP, DEPS);
  const row = (outcome as OkOutcome).answer.rows[0]!;
  expect(Object.keys(row.answers)).toEqual(["2A"]);
  expect(row.pending).toEqual(["3A", "SL"]);
});

it("answers a pair with no trains, and that is not a refusal", async () => {
  const { outcome } = await queryRouteAvailability(REQUEST, IP, { ...DEPS, route: routeReturning([]) });
  expect(outcome.ok).toBe(true);
  expect((outcome as OkOutcome).answer.rows).toEqual([]);
});

it("keeps the list when one train's call fails", async () => {
  const source = sourceFailingOn("22685");
  const { outcome } = await queryRouteAvailability(REQUEST, IP, { ...DEPS, source });
  const rows = (outcome as OkOutcome).answer.rows;
  expect(rows).toHaveLength(8);
  // The failed train keeps its facts and carries NO answer — the page renders a refusal
  // in the block's place. An absent block would read as "no berths".
  expect(rows.find((r) => r.train.trainNo === "22685")!.answers).toEqual({});
});

it("refuses the whole search when the day's budget cannot cover it", async () => {
  const { outcome } = await queryRouteAvailability(REQUEST, IP, { ...DEPS, budget: budgetRefusing() });
  expect(outcome).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
});

it("caps the fan-out and says which trains it did not ask", async () => {
  const { outcome } = await queryRouteAvailability(REQUEST, IP, { ...DEPS, route: routeReturning(TWENTY_TRAINS) });
  const rows = (outcome as OkOutcome).answer.rows;
  expect(rows).toHaveLength(20);
  expect(rows.filter((r) => r.beyondCap)).toHaveLength(8);
  expect(rows.filter((r) => !r.beyondCap && Object.keys(r.answers).length === 1)).toHaveLength(12);
});

it("records every answer it served", async () => {
  const record = vi.fn(async () => 4);
  await queryRouteAvailability(REQUEST, IP, { ...DEPS, record });
  expect(record).toHaveBeenCalledTimes(8);
});

it("serves the answer even when recording throws", async () => {
  const record = vi.fn(async () => { throw new Error("store down"); });
  const { outcome } = await queryRouteAvailability(REQUEST, IP, { ...DEPS, record });
  expect(outcome.ok).toBe(true);
});
```

- [ ] **Step 3: Run them and watch them fail**

Run: `npx vitest run tests/unit/services/route-availability-query.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 4: Implement in the order spec §6.2 sets**

1. `limiter.check(\`routeAvailability:${addressKey(ip)}\`, …)` → `RATE_LIMITED` with `retryAfter`.
2. `queryRoute(from, to, ip)`; a failure propagates unchanged. **`trains: []` returns `ok: true` with `rows: []`** — it is an answer, not a refusal.
3. `const asked = trains.slice(0, ROUTE_AVAILABILITY_MAX_TRAINS)`.
4. `budget.takeMany(asked.length)` → `SOURCE_UNAVAILABLE` with `messages.source.outcomes.dailyLimit`.
5. Fan out at **4 concurrent**. Write the pool as a small local helper rather than adding a dependency; a per-train rejection resolves to "no answer" and never rejects the pool.
6. Record each success fire-and-forget, `void Promise.resolve(record(...)).catch(...)`, with the same warn line `availability-query.ts` uses.

Lead class: `bookingClassSchema.options.filter((c) => chosen.includes(c))[0]`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/unit/services/route-availability-query.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Mutation-test the false-negative guard.** Change the empty-`trains` branch to return a `SOURCE_UNAVAILABLE`. Expected: the "pair with no trains" test fails. Restore.

- [ ] **Step 7: Commit**

```bash
git add src/services/route-availability-query.ts tests/unit/services/route-availability-query.test.ts
git commit -m "feat(source): ask a whole route at once, paying the limit and the budget once"
```

---

### Task 3: The two API routes

**Files:**
- Create: `src/app/api/route-availability/route.ts`
- Modify: `src/app/api/availability/route.ts`
- Modify: `src/services/availability-query.ts`
- Test: `tests/unit/app/api/route-availability.test.ts`, and the existing `tests/unit/app/api/availability.test.ts`

**Interfaces:**
- Consumes: `queryRouteAvailability` from Task 2, `jsonOk`/`jsonError`, `clientIp`, `readBody`, `servingSampleData`, `bookingClassSchema`, `quotaSchema`.
- Produces: `POST /api/route-availability` → `{ ok, remaining, sampleData, ...answer }`. `POST /api/availability` additionally accepts `travelClasses: BookingClass[]` (1..6) in place of `travelClass`. Also `CLASS_EXPAND_RATE_LIMIT = { limit: 30, windowMs: 60_000 }` and `queryAvailabilityClasses(request, classes, ip, overrides?)`, both exported from `services/availability-query.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
it("de-duplicates classes before counting them", async () => {
  const res = await POST(request({ ...BODY, classes: ["SL", "SL", "SL", "SL", "SL", "SL", "SL", "SL"] }));
  // Eight entries, one class: a repeat is not a way past the max.
  expect(res.status).toBe(200);
});

it("refuses a body that names neither a class nor a class list", async () => {
  const res = await POST_AVAILABILITY(request({ ...ONE, travelClass: undefined }));
  expect(res.status).toBe(400);
});

it("refuses a body that names both", async () => {
  const res = await POST_AVAILABILITY(request({ ...ONE, travelClass: "SL", travelClasses: ["3A"] }));
  expect(res.status).toBe(400);
});

it("never answers a refusal with an empty rows array", async () => {
  const res = await POST(request(BODY), { query: refusing() });
  const body = await res.json();
  expect(body.ok).toBe(false);
  expect(body).not.toHaveProperty("rows");
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/unit/app/api/`
Expected: FAIL — route missing; the `travelClasses` cases pass a `.strict()` schema that rejects the key.

- [ ] **Step 3: Implement the search route**

Copy the shape of `app/api/availability/route.ts` exactly: `force-dynamic`, `readBody` with a `.strict()` schema, `clientIp` from `x-forwarded-for`, `jsonError` on `!ok`, `jsonOk` with `remaining` and `sampleData`. De-duplicate `classes` with a `Set` **before** `.max(7)` is applied — a `z.preprocess` or a `.transform` on the array, whichever keeps the error message readable.

Keep the comment that says why this is a POST: it spends provider requests from a shared plan and must not be reachable by a crawler following a link.

- [ ] **Step 4: Implement the expand path**

`bodySchema` becomes a union refined so exactly one of `travelClass` / `travelClasses` is present. `queryAvailability` grows a sibling `queryAvailabilityClasses(request, classes, ip)` that takes `CLASS_EXPAND_RATE_LIMIT` once and `budget.takeMany(classes.length)` once, then calls the source per class. Do not loop `queryAvailability` — the same double-counting trap as Task 2.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/unit/app/api/`
Expected: PASS, and every pre-existing availability route test still green.

- [ ] **Step 6: Commit**

```bash
git add src/app/api tests/unit/app/api src/services/availability-query.ts
git commit -m "feat(api): a whole route's availability, and a train's remaining classes"
```

---

### Task 4: Class chips, and the form that submits a search

**Files:**
- Create: `src/components/pre-booking/class-chips.tsx`
- Modify: `src/app/(site)/pre-booking/pre-booking-form.tsx`
- Modify: `src/messages/en-IN/booking.ts`
- Test: `tests/unit/components/pre-booking/class-chips.test.tsx`, `tests/unit/app/pre-booking/pre-booking-form.test.tsx`

**Interfaces:**
- Consumes: `bookingClassSchema` for the canonical order.
- Produces: `<ClassChips value={readonly BookingClass[]} onChange={(next) => void} />`. Renders `role="group"` with an `aria-labelledby` label and one `<button type="button" aria-pressed>` per class.

- [ ] **Step 1: Write the failing tests**

```ts
it("is a group of toggles, not a select", () => {
  render(<ClassChips value={["SL", "3A", "2A"]} onChange={noop} />);
  // A select shows one answer; this question has several.
  expect(screen.getByRole("group", { name: "Class" })).toBeInTheDocument();
  expect(screen.getAllByRole("button")).toHaveLength(7);
  expect(screen.getByRole("button", { name: "SL" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "1A" })).toHaveAttribute("aria-pressed", "false");
});

it("keeps the enum's order however the reader clicks", () => {
  const onChange = vi.fn();
  render(<ClassChips value={["SL"]} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "2A" }));
  // 2A leads because the enum declares it first, not because SL was clicked first.
  expect(onChange).toHaveBeenCalledWith(["2A", "SL"]);
});

it("will not let the last class be turned off", () => {
  const onChange = vi.fn();
  render(<ClassChips value={["SL"]} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "SL" }));
  // Zero classes is not a question anyone can answer, so the last one does not toggle off.
  expect(onChange).not.toHaveBeenCalled();
});

it("submits a search once the route and date are known", async () => {
  render(<PreBookingForm {...PROPS} />);
  await pickRoute("SBC", "NDLS");
  fireEvent.change(screen.getByLabelText("Journey date"), { target: { value: "2026-10-16" } });
  fireEvent.click(screen.getByRole("button", { name: "Find trains" }));
  expect(fetchMock).toHaveBeenCalledWith("/api/route-availability", expect.objectContaining({ method: "POST" }));
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/unit/components/pre-booking tests/unit/app/pre-booking`
Expected: FAIL — `ClassChips` does not exist; the form still POSTs `/api/availability`.

- [ ] **Step 3: Implement `ClassChips`**

Seven classes: `SL, 3A, 2A, 1A, CC, EC, 2S`, each chip a `<button type="button">` with `title` carrying the full name ("Sleeper", "AC 3-tier", …). Pressed uses `border-accent bg-accent-soft text-accent-soft-ink`; unpressed `border-line bg-transparent text-ink-1 hover:bg-ink-1/7`. Sort `onChange`'s output by `bookingClassSchema.options.indexOf`.

- [ ] **Step 4: Rebuild the form's class row as drawn**

One row, not a stacked block: the label inline with the chips, and the submit closing the row at the right edge. The four fields above (From, To, Journey date, Quota) keep the existing `grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))]` and stretch evenly with the button gone from their grid.

```tsx
<div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line px-5 py-3">
  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
    <span className={FIELD_LABEL} id={`${ids}-cls`}>{m.travelClass}</span>
    <ClassChips value={classes} onChange={setClasses} labelledBy={`${ids}-cls`} />
  </div>
  <Button type="submit" variant="primary" className="h-10" disabled={!ready}>{m.submit}</Button>
</div>
```

The train `<select>` and its lookup go: the list replaces it. Keep the route lookup itself — it is what tells the reader "no trains run SBC → XXXX" before they spend a search.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/unit/components/pre-booking tests/unit/app/pre-booking`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/pre-booking src/app/\(site\)/pre-booking src/messages tests/unit
git commit -m "feat(pre-booking): classes are a multiple choice, and the form asks a route"
```

---

### Task 5: The list

**Files:**
- Create: `src/app/(site)/pre-booking/class-block.tsx`, `train-row.tsx`, `trains-plate.tsx`
- Test: `tests/unit/app/pre-booking/class-block.test.tsx`, `train-row.test.tsx`, `trains-plate.test.tsx`

**Interfaces:**
- Consumes: `TrainRow`, `RouteAvailabilityAnswer` from Task 2; the status tokens `open-soft`/`queued-soft`/`closed-soft` and their `-ink` pairs (PR #48); `AvailabilityPlate` for the opened train's matrix.
- Produces: `<TrainsPlate answer={RouteAvailabilityAnswer | null} refusal={SourceFailure | null} sampleData={boolean} />`, `<TrainRowView row={TrainRow} />` and `<ClassBlock cls fare day notCarried? />`. The component is `TrainRowView`, not `TrainRow` — that name is already the service type from Task 2, and two things called `TrainRow` in one import graph is a bug waiting to be written.

- [ ] **Step 1: Write the failing tests**

```ts
it("leads with the answer and follows with the price", () => {
  render(<ClassBlock cls="SL" fare="₹710" day={WAITLISTED} />);
  const [first, second] = screen.getByTestId("class-block").children;
  // "Will I get on" is asked before "what does it cost". The first draft had these the
  // other way round and was changed on review.
  expect(first).toHaveTextContent("WL");
  expect(first).toHaveTextContent("44");
  expect(second).toHaveTextContent("SL");
  expect(second).toHaveTextContent("₹710");
});

it("says a class is not carried rather than leaving a gap", () => {
  render(<ClassBlock cls="SL" fare={null} day={null} notCarried />);
  expect(screen.getByText("Not carried")).toBeInTheDocument();
});

it("names the classes a row has not asked for", () => {
  render(<TrainRowView row={{ ...ROW, pending: ["3A", "2A"] }} />);
  expect(screen.getByText("3A, 2A not asked yet")).toBeInTheDocument();
});

it("shows a refusal where a failed train's block would go, never an empty one", () => {
  render(<TrainRowView row={{ ...ROW, answers: {}, failed: true }} />);
  expect(screen.getByText(/could not answer/i)).toBeInTheDocument();
  expect(screen.queryByTestId("class-block")).not.toBeInTheDocument();
});

it("renders no table at all when the search was refused", () => {
  render(<TrainsPlate answer={null} refusal={REFUSAL} sampleData={false} />);
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.getByText(REFUSAL.message)).toBeInTheDocument();
});

it("says so when the answer is sample data", () => {
  render(<TrainsPlate answer={ANSWER} sampleData />);
  expect(screen.getByText("Sample data")).toBeInTheDocument();
});

it("draws the history line in the state it will really ship in", () => {
  render(<ClassBlock cls="SL" fare="₹710" day={WAITLISTED} />);
  // `availability_observations.outcome` is written by nothing yet. A number here would
  // be invented; when the crawler has depth this becomes "Cleared 9 of the last 10 weeks".
  expect(screen.getByText("Not enough history yet")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/unit/app/pre-booking`
Expected: FAIL — none of the three components exist.

- [ ] **Step 3: Implement `ClassBlock`**

Three stacked lines inside `border border-line px-3 py-2.5`:
1. `flex min-h-8 flex-wrap items-center gap-2` — the status chip and, when waitlisted, the figure at `font-data text-lg leading-none` in the status ink.
2. `mt-2 flex flex-wrap items-baseline gap-2` — `legend-sm` class code, then the fare at `font-data text-ink-1/70`.
3. `mt-1 text-label text-ink-1/70` — the history line.

Reuse the `tone()` rule from `availability-plate.tsx` rather than restating it: `canBook` outranks the status word, then waitlisted, then open.

- [ ] **Step 4: Implement `TrainRow`**

Train number (`font-data`), name, `from time → to time · duration`, then the running-days line — **a count of days, never a weekday name**. Collapsed: one block at `max-w-[480px]`, then the expand button and "`3A, 2A` not asked yet". Opened: every asked class as a three-up `grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))]`, then `<AvailabilityPlate>`'s matrix.

- [ ] **Step 5: Implement `TrainsPlate`**

Header with title, `n trains · <date>`, and the sample-data badge when set. Then the controls strip (Task 6 fills it; render the container now). Then the rows. **A refusal renders the refusal and returns before any table.**

- [ ] **Step 6: Run the tests, then the whole unit suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(site\)/pre-booking tests/unit/app/pre-booking
git commit -m "feat(pre-booking): the route's trains, each with the class you would travel in"
```

---

### Task 6: Sort, filter, and the end-to-end pass

**Files:**
- Modify: `src/app/(site)/pre-booking/trains-plate.tsx`
- Modify: `tests/e2e/pre-booking.spec.ts`
- Test: `tests/unit/app/pre-booking/trains-plate.test.tsx`

**Interfaces:**
- Consumes: `TrainsPlate` from Task 5.
- Produces: nothing new outside the plate.

- [ ] **Step 1: Write the failing tests**

```ts
it("sorts one-of, and shows which one", () => {
  render(<TrainsPlate answer={ANSWER} sampleData={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Duration" }));
  expect(screen.getByRole("button", { name: "Duration" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Departure" })).toHaveAttribute("aria-pressed", "false");
});

it("sorts rows with no fare last, never as zero", () => {
  render(<TrainsPlate answer={ANSWER_WITH_A_MISSING_FARE} sampleData={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Fare" }));
  expect(lastRowNumber()).toBe("22691");
});

it("filters to what can be booked, and says what it keeps", () => {
  render(<TrainsPlate answer={ANSWER} sampleData={false} />);
  // The toggle names what survives it, not what it hides.
  fireEvent.click(screen.getByRole("button", { name: "Only what I can book" }));
  expect(screen.getAllByTestId("train-row")).toHaveLength(4);
});
```

And in `tests/e2e/pre-booking.spec.ts`:

```ts
test("lists every train on the route, each with one class answered", async ({ page }) => {
  await gotoReady(page, "/pre-booking");
  await pickRoute(page, "SBC", "NDLS");
  await page.getByLabel("Journey date").fill("2026-10-15");
  await page.getByRole("button", { name: "Find trains" }).click();
  await expect(page.getByTestId("train-row")).toHaveCount(2);
  await expect(page.getByText(/not asked yet/)).toHaveCount(2);
});

test("a pair with no trains says so, and shows no list", async ({ page }) => {
  await gotoReady(page, "/pre-booking");
  await pickRoute(page, "SBC", "XXXX");
  await expect(page.getByText(/No trains run SBC/i).first()).toBeVisible();
  await expect(page.getByTestId("train-row")).toHaveCount(0);
});

test("a refused search shows a refusal, never an empty list", async ({ page }) => {
  await page.route("**/api/route-availability", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify(REFUSAL) }));
  await gotoReady(page, "/pre-booking");
  await pickRoute(page, "SBC", "NDLS");
  await page.getByLabel("Journey date").fill("2026-10-15");
  await page.getByRole("button", { name: "Find trains" }).click();
  await expect(page.getByText("No availability returned")).toBeVisible();
  await expect(page.getByTestId("train-row")).toHaveCount(0);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/unit/app/pre-booking/trains-plate.test.tsx`
Expected: FAIL — the controls do not exist.

- [ ] **Step 3: Implement the controls strip**

`flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line px-5 py-3`, holding a `legend-sm` "Sort" label, a `role="group"` of three one-of chips, and the single filter toggle. Sorting is client-side over rows already in hand — no request is spent on it. Fare sorts on the lead class's fare; a row without one sorts last.

- [ ] **Step 4: Update the fixture source** so the sample data answers a route with two trains and the three states (open, queued, closed), and the fixture still labels itself sample data.

- [ ] **Step 5: Run the whole gate**

Run: `npm run check` — capture npm's own exit code, not a pipe's.
Expected: exit 0.

Run: `npm run e2e`
Expected: PASS, including the phone project.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(site\)/pre-booking tests
git commit -m "feat(pre-booking): sort the route's trains, and filter to what you can book"
```

---

## Verification, whole-branch

- [ ] `npm run check` — exit 0, captured from npm and not from a pipe.
- [ ] `npm run e2e` — both projects.
- [ ] Count the upstream calls for one search against the fixture source: **9**, and **+2** on the first expand. This is the spec's headline number and the one thing a passing suite would not otherwise prove.
- [ ] Render-check the page against the approved boards at 1440 and 390: no horizontal overflow, and every class used exists in the compiled stylesheet.
