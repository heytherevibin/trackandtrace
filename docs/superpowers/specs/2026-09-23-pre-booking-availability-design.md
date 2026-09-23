# Pre-booking availability, and the observations behind a prediction

**Date:** 2026-09-23
**Status:** design, awaiting the owner's read

## 1. Goal

Give Pre-booking a real answer — seats and fare, asked live — and start recording the observations
that a Trakline-owned confirmation prediction will later be fitted to.

Two parts ship together (**A** and **B**). A third (**C**, the model and the odds) is deferred until
the data exists, and gets its own spec.

## 2. What already exists

| | |
|---|---|
| `src/app/(site)/pre-booking/page.tsx` | the page, live |
| `pre-booking-form.tsx` | **Form TL-02**, drawn and built: class, quota, date |
| `src/messages/en-IN/booking.ts` | its copy, including the honest stub |
| `src/app/(site)/accuracy/page.tsx` | the accuracy route, with a drawn sheet |
| `PnrDataSource` (`src/services/pnr-source.ts`) | the seam this mirrors |
| `guarded.ts`, `outcome.ts`, `breaker.ts`, `rate-limit.ts` | the wrappers it reuses unchanged |

The page currently tells the truth and stops: *"Live availability appears here only when a timetable
and inventory source is connected."* The result block reads **"No availability returned."**

**The form has no train field.** Its `AvailabilityRequest` is `{cls, quota, date}` and the train row
reads *"Train search: not connected"*. Part A must supply train selection; that is new UI, not a
transcription, and §9 records it as the one open design question.

## 3. Decisions, with their reasons

Each of these was settled with the owner on 2026-09-23. They are recorded with the reason, because a
decision without one is re-litigated every time someone new reads the file.

**D1 — RailKit is the only source. RapidAPI is dropped.**
A probe of both on 2026-09-23 found RailKit serves every endpoint RapidAPI does, plus train history,
station timetable, live-at-station and cancelled trains, at ₹89/10k against ~₹880/7k — and RapidAPI's
quota was already exhausted, so the fallback had been dead for an unknown period. Removing it is its
own change with its own blast radius (production env vars, `PNR_FALLBACK`, the parser and its tests)
and is **not** in this spec's scope.

**D2 — The source is never named on a traveller surface.**
Unchanged from Phase 0. Availability and fare carry "a verified railway source", exactly as PNR data
does.

**D3 — Asked live, at the moment of the request.**
Same contract as the PNR check: one request when the traveller presses the button, time-stamped, and
a repeat within the minute marked as the last minute's read. No pre-computed availability is served
as if it were current.

**D4 — No confirmation odds ship in A or B.**
The live site promises *"Nothing is predicted, filled in or rounded up. Confirmation odds are never
shown."* RailKit returns `prediction` and `predictionPercentage`; showing them as Trakline's would be
a claim of authorship that is not true, would inherit wrongness we cannot fix, and would sit badly
with a product built on *"every field carries its source"*. Their number **is** recorded, privately,
as the baseline the eventual Trakline model has to beat (§6).

**D5 — The prediction model, when it comes, is statistical and not an LLM.**
The claim is a calibrated probability with an accuracy page proving it. Logistic regression and
gradient-boosted trees are calibrated by construction, cost nothing per call, and answer in
microseconds on a page meant for casual use. An LLM is poorly calibrated for numeric probability
without a wrapper — which is the statistical model again, underneath. Claude's place here is
**offline**: finding features in the accumulated data, and writing the sentence that sits beside the
number ("this train's 3A waitlist cleared from WL18 or better in 9 of the last 10 weeks").

**D6 — Learn from both traveller requests and a crawler.**
Every live Pre-booking request is a free observation. A crawler adds routes nobody happens to ask
about, on a schedule, with no personal data at all.

## 4. Part A — the availability source

### 4.1 The seam

Mirrors `PnrDataSource` exactly, including the rule that a failure may carry a server-only `cause`
that never reaches the wire.

```ts
export interface AvailabilityRequest {
  readonly trainNo: string;      // 5 digits
  readonly from: string;         // station code
  readonly to: string;           // station code
  readonly journeyDate: string;  // ISO yyyy-mm-dd at our boundary; DD-MM-YYYY only inside the adapter
  readonly travelClass: string;  // SL, 3A, 2A, 1A, CC, EC, 2S
  readonly quota: string;        // GN, TQ, LD, SS …
}

export interface AvailabilityDay {
  readonly date: string;             // ISO, normalised from the provider's form
  readonly status: string;           // AVAILABLE | RAC | WL | REGRET | …
  readonly availabilityText: string; // the source's own short text
  readonly rawStatus: string;        // verbatim, for the observation store
  readonly canBook: boolean;
}

export interface AvailabilityAnswer {
  readonly train: { readonly no: string; readonly name: string; readonly fromName: string; readonly toName: string; readonly distanceKm: number };
  readonly fare: { readonly base: number; readonly reservation: number; readonly superfast: number; readonly gst: number; readonly total: number };
  readonly days: readonly AvailabilityDay[];
  readonly retrievedAt: string;
}

export interface AvailabilitySource {
  check(request: AvailabilityRequest): Promise<AvailabilityOutcome>;
}
```

`AvailabilityOutcome` follows `SourceOutcome`: `{ok: true, answer}` or the existing failure shape with
`code`, `message` and a server-only `cause`.

### 4.2 The RailKit adapter

`GET /api/v1/seats/:trainNo/:from/:to/:date/:class/:quota`, key in `x-api-key`, date **DD-MM-YYYY**.
Measured live 2026-09-23; the response carries `train`, `fare` and a four-element `availability`
array, one entry per date in a window around the requested one.

**Date conversion happens once, inside the adapter.** ISO crosses every internal boundary. This is
not style: RailKit answers `Invalid date format. Use DD-MM-YYYY.` for an ISO date and
`Date still invalid after normalization.` elsewhere, and a second conversion site is how those
diverge.

`fare` is a separate endpoint (`/api/v1/fare/:trainNo/:date/:from/:to/:class/:quota`) **and** is
embedded in the seats response. Part A uses the embedded one: one request, not two, on a page that
answers live and against a 10k monthly budget.

### 4.3 Refusals, and the one that must never be misread

Measured refusals, each of which must map to "we could not ask" and **never** to "no seats":

| provider answer | meaning | maps to |
|---|---|---|
| `not an intermediate station of train` | the route is wrong for that train | `INVALID_INPUT`, a member-readable sentence |
| `Invalid date format. Use DD-MM-YYYY.` | our bug, never the traveller's | `INVALID_INPUT`, and a test that pins it can't happen |
| `No valid Profile found for this Train, Date and Station.` | upstream has no fare profile | `SOURCE_UNAVAILABLE` |
| `Unable to process your request` | generic upstream failure — **12951 answers this for every class and date tried** | `SOURCE_UNAVAILABLE` |
| 401 / 403 | key refused | `SOURCE_UNAVAILABLE`, `cause: "refused"` |
| 429 | quota or rate limit | `SOURCE_UNAVAILABLE`, `cause: "quota"` |

**A false "sold out" is the worst bug this feature can ship.** It is the same false-negative class the
PNR path was checked for, on a page where the traveller may act on it. Every refusal above gets an
explicit test asserting the traveller sees an unavailable state, not an empty one — and `REGRET`, a
real sold-out answer, gets a test asserting it is *not* swallowed as a failure.

### 4.4 Reuse, not reinvention

`createGuardedSource` (breaker, one retry on safe failures only, usage counting) and the existing
rate limiter wrap this adapter unchanged. A second implementation of either is a second thing to keep
correct.

## 5. Part B — the observation store

### 5.1 The table

```sql
create table public.availability_observations (
  id              uuid primary key default gen_random_uuid(),
  observed_at     timestamptz not null default now(),
  train_no        text not null,
  from_code       text not null,
  to_code         text not null,
  travel_class    text not null,
  quota           text not null,
  journey_date    date not null,
  days_out        integer not null generated always as (journey_date - (observed_at at time zone 'Asia/Kolkata')::date) stored,
  status          text not null,
  raw_status      text not null,
  seats           integer,
  source_prediction_pct numeric(5,2),
  outcome         text,
  outcome_at      timestamptz
);
```

**No personal data. No PNR. No user id.** These are facts about berths, not about people — which is
what makes the store defensible under §9's terms question and keeps it outside every privacy surface
the console already has.

`days_out` is generated, not written: a value computed by two callers is a value that will disagree.

Indexes: `(train_no, travel_class, quota, journey_date)` for the outcome join, and
`(journey_date) where outcome is null` for the resolver's sweep.

### 5.2 The two feeders

**Traveller requests.** Every successful Pre-booking answer writes one row per returned day — four
rows per request, free, from traffic that already happened. Written `after()` the response, so a
failed insert can never cost a traveller their answer.

**The crawler.** A script, scheduled later: for a chosen list of `(train, class, quota, from, to)`,
ask once a day. One call covers a four-day window, so the list length is the budget.

### 5.3 Closing the loop — measured, and simpler than expected

Probed live on 2026-09-23 against 12621 MAS–NDLS SL GN:

| requested date | answer |
|---|---|
| today | **200** — four days, today first, today reading `NOT AVAILABLE / No More Booking / 0` |
| tomorrow | **200** — four days, tomorrow first |
| yesterday | **400** `Failed to fetch availability` |
| −7 days | **400** `Failed to fetch availability` |

Three consequences, and each removes or adds work:

1. **There is no resolver pass.** The journey date is readable *on* the journey date, and booking has
   closed by then — so the last observation **is** the outcome. No second sweep, no `outcome_at`
   round trip, ~1,200 fewer calls a month. `outcome` is computed by reading the row whose `days_out`
   is 0 (or the smallest available) for that journey.
2. **A missed day is permanently missed.** Past dates cannot be read at all, so a crawler outage is
   not a delay — it is a hole in the dataset that nothing can fill. The crawler must be monitored,
   and a gap must be visible rather than silently reducing coverage.
3. **The window is forward-looking from the date asked**, four dates inclusive. Asking for day *D*
   returns *D..D+3*. So a sixty-day horizon is ~15 calls, not 60 — and daily sampling observes each
   journey date many times at decreasing `days_out`, which is exactly the training signal.

**And `rawStatus` carries two numbers, not one:** `GNWL65/WL26` is the booking-position waitlist and
the current waitlist. Where the queue started and where it now is are the two features a clearance
model most wants, and they arrive free in every observation. Store `raw_status` verbatim and parse
both out — never store only the friendly `WL 26`.

### 5.4 Quota budget, measured

Advance is 10,000/month ≈ **333/day**, shared with live traffic.

| | calls/day | monthly |
|---|---|---|
| 40 combos, daily rolling window | 40 | 1,200 |
| ~~outcome resolution~~ | **0** | **0** — §5.3 removed it |
| traveller traffic (headroom) | ~290 | 8,700 |

Each call yields four dated observations, so forty combos produce **~160 rows a day, ~4,800 a month**
before any user traffic — double the earlier estimate, because the four-date window was being
counted as one row. The **+50k pack at ₹379** takes the crawler to ~200 combos.

**The crawler's route list biases the model.** Rajdhani routes predict Rajdhani behaviour; branch
lines will be predicted badly by a model that never saw one. The list is a modelling decision and is
recorded as such, not chosen by convenience.

**The crawler's route list biases the model.** Rajdhani routes predict Rajdhani behaviour; branch
lines will be predicted badly by a model that never saw one. The list is a modelling decision and is
recorded as such, not chosen by convenience.

## 6. The baseline we have to beat

`source_prediction_pct` records what RailKit's own model said, per observation. It is never rendered
(D4). Its only job is to be the number the Trakline model is scored against on the accuracy page:
*"ours was right N% of the time; the source's was right M%"*. Without it, "better than theirs" is an
assertion.

## 7. Part C — deferred, with its own spec

Not built here, listed so the shape is not re-invented later:

- offline training producing a **versioned** model artefact
- an online scorer, microseconds, no network
- calibration measured and published on `/accuracy`
- the odds behind a **console switch** (module 11, Switches) so they can be dark until they earn the
  page, and dark again within a minute if they stop deserving it
- the sentence beside the number, written from the observations

## 8. Out of scope

Removing the RapidAPI source (D1); live running status, train history, station timetable and
cancelled trains, all of which RailKit serves and none of which this spec touches; any change to the
PNR path.

## 9. Risks and open questions

1. **Train selection is undrawn.** Form TL-02 has no train field. RailKit's `/trains/search?name=`
   and `/trains/between/:from/:to` can both feed one, but the UI is new and the owner's standing rule
   is that sheets are transcribed, not invented. **Needs a drawn sheet before Part A's form work.**
2. **RailKit's terms allow caching "only for performance" and forbid redistributing their data.**
   The store holds derived facts, never their content, and nothing of theirs is republished — but an
   indefinite observation store exceeds "performance caching" on a plain reading. The owner has
   accepted this knowingly; it is recorded here so the decision is visible.
3. **12951 refuses seats and fare entirely.** Other trains answer. Coverage is uneven and the feature
   must be honest about it rather than implying a gap is a sell-out.
4. **One source, no fallback.** With RapidAPI gone, RailKit being down means Pre-booking cannot
   answer at all. The health check being built separately makes that visible; it does not make it
   redundant.
5. ~~**Outcome resolution depends on reading a past date.**~~ **Resolved by measurement, 2026-09-23
   — see §5.3.** The journey date is readable on the journey date and booking has closed by then, so
   the last observation is the outcome and no resolver exists. The risk that replaces it is narrower
   and sharper: **past dates cannot be read at all**, so a crawler gap is permanent. Monitoring the
   crawler is therefore not operational hygiene — it is data integrity.

6. **The four-date window is the provider's, not ours.** Every `/seats` call returns the requested
   date plus three. If that window ever changes size, the crawler's coverage maths changes with it
   silently. Parse the array's length rather than assuming four, and let a changed length be visible.
