# TL-02 v2 — every train on the route, with the class you would travel in

**Status:** approved from the prototype at `claude.ai/artifact/CqiLAiXUgovvbaPg18LRD8` (v6, 25 Sep 2026).
**Supersedes the form half of:** `2026-09-23-pre-booking-availability-design.md` §7 Part C. The source
seam, the observation store and the refusal taxonomy in that spec are unchanged and still binding.

## 1. Goal

Today `/pre-booking` answers one question: *for this one train, in this one class, what does the
chart say?* The traveller has to already know which train they want.

TL-02 v2 answers the question they actually have: **given two stations, a date, and the classes I
would travel in, which trains can I get on?** It lists every train the route lookup returns, each
carrying a real availability answer, sortable and filterable, with the other chosen classes and the
three neighbouring dates one click away.

## 2. What already exists, and is not rebuilt

| Piece | Where | State |
|---|---|---|
| Route lookup seam + RailKit adapter | `services/route-source.ts`, `sources/railkit-route.ts` | shipped (#44) |
| `GET /api/trains?from=&to=` | `app/api/trains/route.ts` | shipped (#44) |
| Availability seam + adapter, four dates per answer | `services/availability-source.ts` | shipped (#38/#45) |
| `POST /api/availability`, one train × one class | `app/api/availability/route.ts` | shipped (#45) |
| Observation recording, fire-and-forget | `services/observations.ts` | shipped (#39) |
| Rate limiter, daily live budget | `services/rate-limit.ts`, `services/live-budget.ts` | shipped |
| Status colours: `open` / `queued` / `closed` | `styles/theme.css`, `tokens.css` | PR #48 |
| Form TL-02, stations → train → chart | `pre-booking-form.tsx`, `availability-plate.tsx` | shipped (#46/#47) |

Nothing in the source layer changes. This spec is a **fan-out service, a new list surface, and the
budget arithmetic that makes the fan-out survivable.**

## 3. Global constraints

Copied verbatim because every task inherits them.

- **A refusal is never an empty list.** An empty `days` reads as "no berths"; an empty `trains` means
  "no trains run this pair", which is a real answer. A failure must render as a refusal.
- **Never name a data provider on a traveller surface.** Answers come "from Trakline".
- **Never predict.** The source's own prediction percentage is never shown. The status colour is keyed
  to what the source said and never to how likely a queue looks to clear.
- **A sample answer always says so.** `sampleData` must survive the fan-out — see §6.4.
- **No weekday may be named** from the route response's running-day mask until one real response has
  been read against a known calendar. "Runs 4 days a week" is what ships.
- TypeScript strict, no `any`. Files under 500 lines. Path aliases, never deep relatives.
- TDD: the failing test first, and shown to fail.

## 4. The decision that shapes everything: nine requests, then two

Availability exists only **per train per class**. So a list row with no class asked is a timetable
entry, not an answer — nothing to scan, sort or filter by.

The ruling (25 Sep, after "lazy load classes on expand"):

> The **first chosen class** is asked for **every train** in the list. The other chosen classes are
> named but not asked, and arrive when a row is opened.

| Action | Requests |
|---|---|
| A search: 1 route + first class × 8 trains | **9** |
| Opening one train: its remaining 2 chosen classes | **+2** |
| Four dates per answer | **free** — already in the payload |

Nine up front instead of twenty-five. A reader who opens three trains spends fifteen; one who opens
none spends nine.

Every row carrying the *same* class is also what makes Sort work: a column of SL answers can be
ranked against each other, where a mixture of classes could not.

**Ordering rule.** "First chosen" is the first of the selected classes **in the order
`bookingClassSchema` declares them** (`types/schemas.ts:13`). Deriving it from the enum rather than
repeating a list here means the two cannot drift. The order is stable, so two readers with the same
selection see the same column. It is *not* the cheapest and *not* the first one clicked.

## 5. What the limiter and budget do today, and why they block this

Measured, not remembered:

- `AVAILABILITY_RATE_LIMIT = { limit: 10, windowMs: 60_000 }` — per client, per minute.
- `LIVE_REQUESTS_PER_DAY` default **300**, schema max 1,000,000 (`services/env.ts:73`). Site-wide.
- `LiveBudget.take()` takes **one** unit and returns `{ ok }` or a retry-after.

A nine-request search **trips the per-client limiter on its tenth call** if a reader opens a train
within the same minute. At 300/day the whole site gets ~33 searches. Both are ours, not the
provider's.

### 5.1 The limiter counts a search

A user action is one unit, not N. `ROUTE_RATE_LIMIT` and `AVAILABILITY_RATE_LIMIT` stay for the
single-ask paths; the fan-out gets its own key and its own budget:

```ts
export const ROUTE_AVAILABILITY_RATE_LIMIT = { limit: 6, windowMs: 60_000 };  // searches
export const CLASS_EXPAND_RATE_LIMIT = { limit: 30, windowMs: 60_000 };       // row opens
```

Six searches a minute is generous for a human and hostile to a script. Thirty expands allows reading
a whole list of eight without ever waiting.

### 5.2 The budget takes many at once

`LiveBudget` grows one method. `take()` stays exactly as it is — every current caller is unchanged.

```ts
export interface LiveBudget {
  take(): Promise<BudgetVerdict>;
  /** Reserve `n` units at once. All or nothing: a partial reservation is refunded. */
  takeMany(n: number): Promise<BudgetVerdict>;
}
```

`takeMany` is `incrBy` where the store has it, and the all-or-nothing rule matters: half a fan-out
is a half-drawn list, which reads like an answer and is not one. When the reservation fails the whole
search refuses, and says the day's budget is spent.

**Refunds.** A reserved unit that is never spent (the fan-out short-circuits, a train drops out) is
*not* refunded. Over-counting the budget is safe; under-counting spends the provider plan.

### 5.3 A fan-out cap, independent of the budget

`ROUTE_AVAILABILITY_MAX_TRAINS = 12`. A pair like Mumbai–Delhi returns far more than eight trains, and
an uncapped fan-out is an outbound stampede on one click. Trains beyond the cap are listed **without**
an availability block and carry the same "not asked yet" affordance as an unopened class — the list
is honest about what it did and did not ask.

### 5.4 The env raise is a deploy, not a code change

`LIVE_REQUESTS_PER_DAY` is already env-driven with a max of 1,000,000. RailKit at 100,000/month is
~3,225/day. At nine per search that is ~358 searches a day before the budget bites. **No code change
is needed to raise it** — the value moves in Vercel, Production only.

## 6. Part A — the fan-out service

### 6.1 The seam

New file `services/route-availability-query.ts`. It composes the two existing query services and owns
nothing they already own.

```ts
export interface RouteAvailabilityRequest {
  readonly from: string;
  readonly to: string;
  readonly journeyDate: string;   // ISO
  readonly quota: Quota;
  readonly classes: readonly BookingClass[];  // 1..7, in any order
}

/** One train's row: the route's facts, plus the answer for the classes asked so far. */
export interface TrainRow {
  readonly train: RouteTrain;
  /** Keyed by class. A class present here was asked; a class absent was not. */
  readonly answers: Readonly<Record<string, AvailabilityAnswer>>;
  /** Classes chosen but not yet asked — the row's "3A, 2A not asked yet". */
  readonly pending: readonly BookingClass[];
  /** True when the fan-out cap stopped this train being asked at all. */
  readonly beyondCap: boolean;
}

export interface RouteAvailabilityAnswer {
  readonly from: string;
  readonly to: string;
  readonly journeyDate: string;
  readonly leadClass: BookingClass;
  readonly rows: readonly TrainRow[];
  readonly retrievedAt: string;
}
```

`RouteAvailabilityOutcome` is `{ ok: true, answer }` or the same `SourceFailure` shape every source
uses — the taxonomy is not forked.

### 6.2 The order of operations

1. Rate limit on `routeAvailability:<addressKey(ip)>`. Refuse → `RATE_LIMITED`.
2. Route lookup via the **existing** `queryRoute`. A failure propagates; **an empty `trains` is a real
   answer** and returns `rows: []` with `ok: true`, which the page renders as "No trains run SBC → XXXX".
3. Cap the list at `ROUTE_AVAILABILITY_MAX_TRAINS`.
4. `budget.takeMany(n)` where `n` is the capped train count. Refuse → `SOURCE_UNAVAILABLE` with the
   daily-limit message.
5. Fan out the lead class across the capped trains, **bounded at 4 concurrent**, using the existing
   `AvailabilitySource`. Per-train failures do not fail the search — that train's row carries no
   answer and says so.
6. Each successful answer records its observation, fire-and-forget, exactly as `queryAvailability` does
   today. **A store that is down must not cost anyone their answer.**

**Why not call `queryAvailability` in the loop:** it would take the per-ask rate limit and one budget
unit per call, which is precisely the double-counting this design removes. The fan-out calls the
*source*, having already paid at the search level. This is stated here because it looks like
duplication and is not.

### 6.3 Partial failure is visible, never silent

A train whose availability call fails renders its row with the train's facts and a refusal in place of
the class block. It must never render as an empty or absent block: **an absence reads as "no berths".**

### 6.4 `sampleData` survives the fan-out

`servingSampleData()` is a deployment fact, not a per-answer one, so it is read once and set on the
envelope. The badge appears on the plate whenever it is true — the rule that `pages.spec.ts` already
enforces, and which caught its own absence once before.

## 7. Part B — the API

### 7.1 `POST /api/route-availability`

POST for the reason the existing availability route is POST: it spends provider requests from a shared
plan and must not be reachable by a crawler following a link or a browser prefetching one.

```ts
const bodySchema = z.object({
  from: z.string().min(2).max(5),
  to: z.string().min(2).max(5),
  journeyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quota: quotaSchema,
  classes: z.array(bookingClassSchema).min(1).max(7),
}).strict();
```

Duplicate classes are de-duplicated before the count is checked, so `["SL","SL"]` is one class and not
a way past the max.

Response: `{ ok: true, remaining, sampleData, ...answer }` — the envelope every other route uses.

### 7.2 `POST /api/availability` gains a class list

Rather than a second expand route, the existing one accepts `travelClass` **or** `travelClasses`
(1..6, the remainder after the lead). Exactly one of the two must be present. It takes
`CLASS_EXPAND_RATE_LIMIT` and `takeMany(classes.length)`.

This keeps one route for "ask about one train" whatever the class count, and leaves every existing
caller and test valid.

## 8. Part C — the list surface

### 8.1 Files

| File | Responsibility |
|---|---|
| `pre-booking-form.tsx` (modify) | stations, date, quota, **class chips**, submit |
| `class-chips.tsx` (new) | the multi-select group: `aria-pressed` toggles, `role="group"` |
| `trains-plate.tsx` (new) | the plate: header, controls strip, rows |
| `train-row.tsx` (new) | one train: facts, class blocks, expand |
| `class-block.tsx` (new) | status, figure, class + fare, history line |
| `availability-plate.tsx` (keep) | the opened train's four-date matrix |

Six files rather than two, because `train-row` alone would otherwise carry the row, its blocks, its
expand state and its matrix — and the 500-line rule is a symptom, not the reason.

### 8.2 The class block, as drawn

Order is load-bearing and was changed once already on review:

1. **The answer** — status chip and the queue figure, at reading size, in the status colour.
2. **The price** — class code and fare, quiet, second.
3. **The history** — "Not enough history yet".

"Will I get on" is asked before "what does it cost". The first draft had the fare as the headline and
was wrong.

### 8.3 The history line ships empty, on purpose

`availability_observations` has the `outcome` column and **nothing writes it yet**. The line renders
"Not enough history yet" until the crawler has depth. When it fills it becomes
*"Cleared 9 of the last 10 weeks"* — a **count of what happened**, never a probability. Drawing it now
means adding the number later is not a re-layout.

### 8.4 Controls

- **Sort**: `Departure | Duration | Fare`, one-of, `aria-pressed`. Client-side over rows already in hand.
- **Filter**: "Only what I can book" — a single toggle that says what it **keeps**, not what it hides.
- Sorting by Fare orders on the lead class's fare; rows with no fare sort last, never as zero.

### 8.5 States

| State | What the page shows |
|---|---|
| No trains on the pair | The refusal, twice: under the field, and as the lifecycle stop |
| Search refused (rate/budget/source) | The refusal. **Never a table** |
| A train's call failed | That row keeps its facts, carries a refusal where the block goes |
| Beyond the fan-out cap | Row listed, no block, "not asked yet" |
| Class not carried by the train | "Not carried" — kept, per the 25 Sep ruling |
| Cannot book | Red chip, its own word, and the note that gives no reason we cannot stand behind |

### 8.6 Phone

`stackedTable("sm")` already folds the four-date matrix. Rows are flex and fold on their own. The
collapsed board is 3,188px at 390 — a third of what three inline classes cost — because a collapsed
row carries one block.

## 9. What is deliberately not here

- **No cache.** Availability is the number a traveller is about to act on; the page promises it was
  read at the moment of the request. The budget stops a busy day, not a cache serving yesterday's berths.
- **No weekday names** — see §3.
- **No prediction, no percentage, no "chance of confirmation".**
- **No station autocomplete.** Typed codes, as decided; the bundled station list is its own piece of work.
- **No special phrasing for `WL 148/136`.** "148 of 136 when booking opened" already says the queue
  grew. Ruled 25 Sep in the absence of a call; overturnable.

## 10. Risks

1. **The fan-out is the first place this app makes N outbound calls per user action.** Bounded
   concurrency and the cap are the controls; the per-train failure path is what keeps one bad call
   from costing the whole list.
2. **`takeMany` over-counts by design.** An unspent reservation is not refunded. Safe for the plan,
   slightly pessimistic for the budget.
3. **The lead-class rule is invisible until it is wrong.** If a reader expects their first *clicked*
   class to lead, the list will look arbitrary. The class chips show the selection; the plate header
   should name the lead class.
4. **Nine requests per search still caps the site** at ~358 searches/day even at 100k/month. Public
   traffic would need either a shorter list or a cache, and a cache is refused above. This is a real
   ceiling and it is stated, not solved.

## 11. Acceptance

- A search on `SBC → NDLS` lists every train the route returns, each with a lead-class answer.
- Exactly **9** upstream calls for that search; exactly **2** more when a train is opened.
- A pair with no trains says so and renders **no table**.
- A refused search renders a refusal and **no table**.
- One failing train does not empty the list.
- `npm run check` green; `e2e` green, including the phone fold.
