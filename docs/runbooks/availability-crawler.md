# Runbook: the availability crawler

The crawler fills `availability_observations` — what seat availability said, recorded so a Trakline
confirmation model can later be fitted to it. Nobody schedules it yet: a human runs it, reads what
it says, and is the thing standing between a mistake and a spent monthly plan. This runbook is what
that human needs.

Two commands, and they are not the same job:

```bash
npm run source:crawl     # ask the provider, write today's rows, then print the store's coverage
npm run source:report    # read the store only; say where it is holed. Exit 1 below the threshold
```

Both take the environment the way every script beside them does — `node --env-file=.env.local`,
already wired into the npm script. The key is never read from anywhere else and never printed.
`source:report` asks the provider for nothing, so it costs nothing and can be run as often as you
like; `source:crawl` spends the plan, and the ceilings below are why.

## The one thing to understand first: a hole is permanent

Measured against the provider on 2026-09-23 (design §5.3): a **past** journey date answers
`400 Failed to fetch availability`. Not an empty answer — a refusal. There is no way to ask what
availability looked like yesterday.

So a day nobody ran the crawler is not a delay. It is a hole in the dataset that nothing will ever
fill: the observations those runs would have made do not exist and cannot be made later. That is why
there is a coverage report at all, and why its threshold is not decorative.

The same fact is why nothing may delete a row — the migration revokes `delete` from every role,
including `service_role`.

## What counts as a gap

The crawler samples **sparsely**: two asks per combo per run — a four-day window that rolls
forward each run over a sixty-day horizon, wrapping at the end, plus one pinned at today for the
`days_out = 0` outcome row (`scripts/crawl-window.mjs`). Most journey dates are therefore
unobserved on most days **by design** — that is the sampling strategy, not a fault. "Every journey
date should have a row" would be an alarm that never stops ringing.

**Two asks, except for a quota that only opens near departure, which gets the pinned ask alone.**
Tatkal is on sale about a day before the train leaves, so a TQ combo has nothing to say at the 3 to
57 days out the rolling window asks from: measured on 2026-09-23 and 2026-09-24, 12301 HWH-NDLS
2A/TQ answered 2 rows to the pinned ask on both days and refused the rolling ask at 4 and at 7 days
out, while 3A/GN on the same train answered 4 rows at every one of those distances. Making that
rolling ask anyway spends a call a run to be refused, so the crawler does not make it. Which quotas
this covers — and, for each, whether this project **measured** it or **inferred** it — is
`QUOTAS_OPENING_NEAR_DEPARTURE` in `scripts/crawl-routes.mjs`: TQ is measured, PT (Premium Tatkal)
is inferred and says what would settle it. The run prints which combos made one ask and why, both
in its opening banner and beside the ask itself.

What the sampler promises is narrower, and it is what the report measures:

> **Every combo is asked, every run.** So a combo is *covered* on an IST day when at least one row
> landed for it that day, and a gap is a `(combo, day)` with nothing — a run that did not happen,
> or a combo the run never reached. Coverage is covered days over the days elapsed since that
> combo's first observation, up to yesterday.

The report counts combo-**days**, not asks, so whether a run makes one ask per combo or two makes
no difference to it — a pinned-only combo writes rows on the same days as any other, and is scored
the same way.

Three things that look like gaps and are not:

- **A journey date missing from inside an answered window.** The provider returns the next four days
  the train *runs*. 12301 asked for 2026-10-15 answered 15, 16, 17 and **19**; the 18th is not a
  hole. A weekly train answers one date in four, legitimately.
- **A short window, or a short pinned answer.** A quota that is not open for the whole band answers
  fewer dates — a TQ combo's pinned ask answered two rows where a GN one answered four. Fewer rows
  on a day is still a covered day.
- **Today.** Today is still open — the run may not have happened yet — so today is never counted
  missing either way. The cost is that a crawler which stopped this morning shows up tomorrow.

What the report **cannot** see, so that nobody trusts it further than it goes:

- a skipped *band* of journey dates — a reset cursor, a `--start` override, or a refused ask (the
  cursor advances anyway, by design) all leave a band nobody asked for, on a day that still has
  rows. The run's own output names the refusal; the coverage report cannot.
- whether a journey date got its looks before departure. In hindsight only, and indistinguishable
  from a train that does not run that day.
- a combo listed but never once observed. It is named in the output, but it has no first observation
  and therefore no denominator, so it cannot move the fraction. (If **every** listed combo is
  unobserved the check fails anyway — see below.)
- dilution: the fraction is over the whole store, so one dead combo in sixteen fails a 95%
  threshold, but one in forty would not. Read the per-combo lines.
- **a stretch a combo was deliberately not crawled.** `routes.json` carries no history, so a combo
  you took off the list because it kept refusing — which is exactly what this runbook tells you to
  do — and later put back is counted as holed for every day it was off. A combo removed on the 11th
  and restored on the 20th reads as 59%, fails the check, and stays under the threshold for roughly
  180 further days of perfectly clean running. The denominator is **not** reset when a combo comes
  back, because that would hide a genuine nine-day outage, which is the one thing this report exists
  to catch. Narrow the window by hand instead: `--since <yyyy-mm-dd>`. It only ever narrows, a combo
  first seen after that date still measures from its own first day, a combo whose every row predates
  it is still scored at zero, and the output prints the date it was given so a narrowed window can
  never be mistaken for a healthier store.
- **jitter around IST midnight.** The bucket is the IST calendar day, and the cadence is yours: two
  runs 24 h 10 m apart that straddle midnight leave a day with no rows and are reported as a missed
  run although you ran it once a day, and two runs 20 minutes apart across midnight cover two days
  on one sweep-step. A run that straddles midnight *internally* has the same effect on its own
  post-run print: `today` is read once at the start, so combos crawled after 00:00 IST land on the
  next day and are marked "nothing today". Run at a stable hour, well away from IST midnight.

**The departure time does not matter, and this was worth measuring.** The pinned ask is the only
thing that produces the `days_out = 0` outcome row, and it produces one only if *today* comes back
inside the answer. Since the provider returns "the next days the train runs, at or after the date
asked for" and a **past** date is a hard 400, it was entirely plausible that a train which had
already left today would answer from tomorrow — and that combo would then never get an outcome row,
silently: the ask succeeds, four rows land, and nothing in the run's output compares the dates
returned against the date asked for.

Measured on 2026-09-23, run at **22:00 IST**: 12051 DR–MAO departs about **05:25**, seventeen hours
earlier, and still returned a `days_out = 0` row (`WAITLIST can_book=false`). All six combos got
one, at departure times spanning 05:25 to 22:00. So the hour you choose is about IST midnight only,
not about the trains on your list. That is one day's evidence across six trains — if you ever add a
combo and it shows no outcome row for a day it certainly ran, this is the assumption to re-test.

## Reading `npm run source:report`

```
  12051 DR-MAO 2S/GN     17 of 20 days · 85% · first seen 2026-09-03 · below the threshold
      no run on 2026-09-09 … 2026-09-11 (3 days)
  12137 CSMT-NDLS 3A/GN  20 of 20 days · 100% · first seen 2026-09-03

coverage         37 of 40 combo-days since each combo's first observation, up to 2026-09-22 (92%)
threshold        95% — one missed run in a 20-run sweep of the horizon
```

**95% is one missed run in twenty**, and twenty is the length of a sweep of the horizon
(`cycleRuns(60, 4)`). The default tolerates losing one run per sweep and fails on two. Raise or
lower it for a run with `--min-coverage <percent>`; the number the report judged by is printed, so
a lowered threshold cannot be mistaken for a healthier store.

Exit codes follow the scripts beside it: `0` at or above the threshold, `1` below it, `2` asked
wrongly or the store could not be read whole. A check can be wired to it exactly as one can to
`npm run source:health`.

**`1` also means a store nothing has ever been written to.** If not one combo on the route list has
ever landed a row, there is no coverage to compute and the report says so instead of printing a
percentage — that is the wrong project, the wrong table, or a crawler that has never once succeeded,
and a gate that stays green on it is a gate that is failing. One young combo among several is still
excused; all of them is not youth.

Other flags: `--today <yyyy-mm-dd>` to measure as of a given IST day, `--since <yyyy-mm-dd>` to stop
counting days before one you name (above), `--routes <file>` for a different list, `--no-routes` to
measure only what the store already holds, `--max-rows <n>` if the store has outgrown the read.

**It refuses rather than reporting a store it could only half read**, because a truncated read
invents holes that are not there — and since the rows come back oldest-first, a truncated read drops
the most recent days, which are the days you are checking. The paging walks by what each page
actually returned, so a PostgREST row cap (Supabase: Settings → API → *Max rows*) below the page
size cannot cut the read short, whatever it is set to.

**When it fails.** A missing day cannot be recovered — do not go looking for a backfill. Find out
why the run did not happen, make it happen today, and if the hole was a combo rather than a day,
read the crawl's own output for the refusal that caused it. Only if the hole is a stretch you took a
combo off the list for on purpose, pass `--since` — and record the date you passed, because it is
not stored anywhere.

## The two facts an operator gets wrong

**1. There are now two ceilings, and the day's is the one that will surprise you.** `crawl-plan.mjs`
gates each run at the provider's daily allowance less the reserve held back for live PNR checks —
that is the per-RUN ceiling, and it used to be the only one, so two runs in one day spent twice it.
A second, per-DAY ceiling now sits over the top: every provider call the crawler makes is written as
a row in `crawler_provider_calls`, bucketed by IST day by the same expression the observations'
`observed_on` uses, and a run may spend only the smaller of its own ceiling and what is left of the
day. The cap is not a new number — it is the same headroom the per-run ceiling is built from.

**So after one full run, a second run the same day refuses.** That is correct for a crawler meant to
run once a day. It also blocks a legitimate retry after a run a gate cut short, so the refusal names
the `--only n` that does still fit and what it costs. Read `--only` literally when you use it: it
takes the FIRST n entries of `routes.json`, in file order, so it retries the head of the list and
**not** the combos the interrupted run missed. `--reserve` is the other way past, and it widens the
gate by leaving live PNR checks unprotected — say how many, out loud, when you use it.

**If the counter cannot be read, the run does not start.** An unmeasurable run is the thing the
counter exists to prevent, so "the ledger was down" refuses rather than assuming a clean day. Each
call is charged *before* it leaves, so a process killed mid-run still costs the day what it sent;
the cost of that choice is that a call which never actually goes out is charged anyway, which makes
this run spend less and never more. Nothing may update or delete a row in that ledger — not even the
service role — because a spend record that can be rewritten proves nothing.

**This removes the reason scheduling was unsafe. It does not schedule anything**, and deciding to is
a separate decision.

**2. `scripts/crawl-cursor.json` is this machine's memory of the sweep.** It holds where each
combo's rolling window got to, and how many runs in a row that combo has refused. It is written
after every run and gitignored: it is a record of what this machine has asked, not source.

Losing it is not a disaster — every combo restarts its sweep at today — but it is a lost sweep, and
the band the cursor was pointing at gets re-read while another band waits a full cycle longer. Do
not delete it casually, do not copy one machine's cursor onto another, and if it is unreadable the
crawler refuses to start rather than guessing where it was.

## Running the crawler

```bash
npm run source:crawl                 # the whole list
npm run source:crawl -- --dry-run    # print the plan and the ceiling; ask nothing
npm run source:crawl -- --only 2     # ask for the first two combos of the list only
```

Before anything is spent it prints the list, the window, the cursor file, the worst case in calls,
the run's ceiling, **what today has already cost and what is left of it**, the burst floor and the
store it will write to — and it refuses to start if the worst case is over the effective ceiling. A
malformed route fails that preflight rather than the budget — the guard counts a request before the
adapter sees it, so a bad entry would otherwise spend quota on a call that never leaves the process.

`--dry-run` asks nothing and charges nothing, and those two day numbers are the reason to reach for
it: it is how you find out whether today has room before you commit to a run. It does need the
database, because the counter lives there.

After the run it prints what happened, and then the whole store's coverage, because a run can be
perfectly whole while the dataset is holed by days nobody ran it. That coverage print is always over
the **whole** route list, even under `--only`: the flag limits what this run asks for, not what the
store owes, so a two-combo run still shows you the four combos it did not touch.

**The crawl's exit code is about the run only:** `0` the run was whole, `1` a refusal or a gate
stopped it, `2` it was asked wrongly and nothing was spent. A store below the coverage threshold
does **not** change it — that is `npm run source:report`'s job, and keeping the two separate is what
keeps either legible.

A combo that refuses three runs in a row is reported as a bad list entry. Delete it from
`scripts/routes.json` rather than retrying it daily: 12951 answered `Unable to process your request`
for every class and date tried, and a permanent refusal wearing a transient's clothes costs a call
every day forever.

**What "refuses" means there is narrower than it sounds, and the narrowing is the point.** Only a
*rolling* ask can put a combo on that list; only when **nothing** the combo was asked that run
answered; and only when the run itself learnt something. If its pinned ask came back, the provider demonstrably knows the route, so the rolling
refusal is not evidence of a bad entry: the run says so in its own section — *"took NO staleness
strike, because the same combo's pinned ask answered this run"* — and the count goes back to zero.
Without that rule, both Tatkal combos on the shipped list were one run away from being named bad
entries for being Tatkal, and deleting them would have destroyed the GN/TQ contrast the list exists
for. A combo where *everything* refuses is unaffected and still goes stale on the third run.

**And a run in which NOTHING answered strikes nobody at all.** RailKit proxies IRCTC, and while
IRCTC is down every ask comes back `400 {"error":"Oops! Seems like IRCTC services are down at the
moment."}` — which the adapter maps to precisely the refusal a route the provider has never heard of
produces, with a call spent either way. Nothing *inside* the refusal separates a dead route from a
dead provider, and nothing can: the only signal that does is whether something **else** answered. If
some combos answered and this one did not, that is about the route; if none did, that is about the
provider, and the run reaches no verdict. Measured on 2026-09-24 — twelve consecutive refusals for
12137 CSMT-NDLS 3A/GN, a combo that had answered normally on the 23rd and the 24th — and four days
of that outage driven through the real run put **every GN combo on the shipped list** on the stale
list. The run now says so in its own section, *"took NO staleness strike, because NOTHING IN THIS
RUN ANSWERED"*, and each count is **held** where the last run that learnt anything left it: held and
not cleared, so an outage cannot wipe a real strike sequence it merely interrupted either. The
cursors still move on, because the provider did refuse the dates it was asked for.

The rule is keyed on the **date**, not on what the ask is labelled: a refusal *at today* never counts
towards staleness, whichever kind of ask it was. On the one run in twenty where a combo's sweep wraps
there is a single merged ask at today doing both jobs, and it is labelled `rolling` — but a refusal
of it may mean only that the train does not run today, which is exactly why a pinned refusal has
never counted. It is still reported as a failure and still makes the run un-whole.

Three more cases never reach the list, stated so nobody trusts it further than it goes. A combo that
makes the **pinned ask only** cannot, because a pinned refusal has never counted towards staleness
(the train may simply not run today) and such a combo has no rolling ask to refuse. And a rolling
refusal the run had **no standing to settle** does not count either: if a gate stopped the run
before the same combo's other ask, the run never learned whether the provider knows that route, so
it holds the refusal — no strike, no clearing, the count left exactly where the last complete run
put it — and says so under *"HELD rather than settled"*. The cursor still moves on, because the
provider did refuse the date it was asked for. Without that, three days of provider trouble tripping
the fuse at the same point in the plan would condemn a perfectly good route. And a rolling refusal
in a run **nothing answered in** does not count, for the reason above.

**A route list of ONE has no stale signal at all**, as a consequence of that last rule: with a
single combo, "nothing in this run answered" and "my only route is dead" are the same observation,
so a genuinely bad sole entry can never be named. That is the safe direction — a bad route kept too
long costs a call a run, a good route deleted costs the dataset for ever — and it is why the list
below is what to read instead. Keep more than one combo on the list where you can.

**`--only 1` builds a one-combo list, and that is how you will actually meet this.** The flag is
recommended all over this runbook for a cheap supervised run, so the blind spot is one keystroke
away rather than a property of `routes.json` you would have to go out of your way to create. A
narrowed run is for watching what one combo does, not for judging whether it deserves its place;
read the `produced NO ROWS` section, or run the full list, before concluding anything about a route.

**An all-pinned-only list cannot report a blind run either.** If every combo on the list is in a
quota that makes the pinned ask alone — two `TQ` entries and nothing else, say — then there are no
rolling refusals to hold, so `blind` stays empty, the run reports itself whole and exits 0 even
though the provider answered nothing. Nothing is lost that was not already lost (a pinned refusal
has never counted towards staleness), but the run's own output will not say the provider was down.
The coverage report will, the next day.

**What catches a combo that has quietly stopped producing data is the run's own
`produced NO ROWS for 7 runs or more` section.** Each run, per combo, the crawler counts the
consecutive runs in which none of that combo's asks produced a single row, carries the count in
`scripts/crawl-cursor.json` beside `refusals`, and clears it the moment a row lands. It is
sampler-agnostic on purpose — a pinned-only entry, a rolling-only one, a combo the provider answers
while the store writes nothing, and any future shape all read the same from it — because it measures
the only thing that always matters: *this entry is contributing nothing*. Seven is a week, and a
train that runs one day a week still has that day inside any seven runs, so a combo that reaches the
threshold has missed even its own running day. Two rules about it:

- **It is not the stale list and it never says delete.** It says go and look. Confirm against the
  pinned-failure and refusal sections, then fix or remove the entry deliberately.
- **It does not change the exit code**, which stays a statement about whether *this run* was whole.
- **It is not held during a provider outage, unlike the staleness count.** A strike is a verdict
  about the *route*, and an outage is no evidence about a route; this count is a verdict about the
  *dataset* — no rows landed — which is true whoever caused it. So it is the instrument that keeps
  speaking while the provider is down, and the only one left on a one-combo list.

**What `npm run source:report` does and does not do, corrected.** Its *per-combo lines* are prompt: a
combo that produced nothing today is marked the same day (*"nothing today, though the run reached
others"*) and reads *"below the threshold"* within a couple of days on a 30-day history. Its *exit
code* is not: `enough` is the aggregate over every listed combo, so one dead combo out of six is
diluted by the five healthy ones and takes about **13 days to take the check non-zero on a 30-day
history and about 39 on a 90-day one** — a lag that grows as the dataset ages, which is the wrong
direction. And a combo that has **never** produced a row has no first observation at all, so it is
excluded from the denominator entirely, lands in `neverObserved`, and reads 100% and exit 0 **for
ever**. So a newly added entry — a pinned-only TQ one above all, since a pinned failure does not make
a run un-whole either — must be confirmed by its own first rows, by hand, on the day it is added.
Nothing automated will distinguish it from a combo added this morning until seven runs have passed
and the crawler's own count names it.

So the three instruments divide the work: the `Refused N runs in a row` list finds a route the
provider has never heard of, the crawler's `produced NO ROWS` count finds an entry that has stopped
contributing under any sampler, and the coverage report is the check on the whole store over time.

**"NEVER REACHED THE PROVIDER" is not a refusal, and nothing on that list is a bad entry.** After
five failures inside a minute the guard opens the availability fuse, and every ask after that is
answered locally without a request being sent. Those asks tell you nothing about the combos they
name: their cursors hold where they were, they take no refusal strike, and the run stops there
rather than walking the rest of the list for nothing. Run again once the provider has recovered and
each combo resumes exactly where it stopped — the band is intact; what you have lost is that day's
observation of it. The one exception the section calls out by name is an entry the adapter refuses
to build a URL for at all: that is a bad entry, it got past the preflight, and it will do the same
thing every run until you fix it.

**Do not delete a combo from `routes.json` on the strength of that section.** Only the
`Refused N runs in a row` list means what this runbook says it means.

## Related

- `scripts/observations-coverage.mjs` — the gap rule itself, and what it cannot see. Read its header
  before changing what the report counts; `scripts/observations-report.mjs` is only the wiring.
- `scripts/crawl-window.mjs` — the sampling strategy, and what it does and does not guarantee.
- `scripts/crawl-plan.mjs` — the preflight and the three quota gates. Read its header before changing
  anything about what a run may spend.
- `src/services/crawler-budget.ts` — the day's budget: what today has already cost, and the
  arithmetic that turns it into this run's ceiling. `supabase/migrations/20260924120000_crawler_provider_calls.sql`
  is the ledger it counts, and says why it is in Postgres rather than Upstash.
- `scripts/crawl-availability.mjs` — the asks a run makes per combo, and why the pinned one exists.
- `scripts/crawl-routes.mjs` — the route list, the preflight, and `QUOTAS_OPENING_NEAR_DEPARTURE`:
  which quotas skip the rolling ask, and which of those entries were measured rather than inferred.
- `docs/superpowers/specs/2026-09-23-pre-booking-availability-design.md` §5.3 — the measured horizon.
