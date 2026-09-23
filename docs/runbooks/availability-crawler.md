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

The crawler samples **sparsely**: one ask per combo per run, a four-day window that rolls forward
each run over a sixty-day horizon, wrapping at the end (`scripts/crawl-window.mjs`). Most journey
dates are therefore unobserved on most days **by design** — that is the sampling strategy, not a
fault. "Every journey date should have a row" would be an alarm that never stops ringing.

What the sampler promises is narrower, and it is what the report measures:

> **Each combo is asked once, every run.** So a combo is *covered* on an IST day when at least one
> row landed for it that day, and a gap is a `(combo, day)` with nothing — a run that did not
> happen, or a combo the run never reached. Coverage is covered days over the days elapsed since
> that combo's first observation, up to yesterday.

Three things that look like gaps and are not:

- **A journey date missing from inside an answered window.** The provider returns the next four days
  the train *runs*. 12301 asked for 2026-10-15 answered 15, 16, 17 and **19**; the 18th is not a
  hole. A weekly train answers one date in four, legitimately.
- **A short window.** Tatkal opens a day before departure, so a TQ combo answers fewer dates. Fewer
  rows on a day is still a covered day.
- **Today.** Today is still open — the run may not have happened yet — so today is never counted
  missing either way. The cost is that a crawler which stopped this morning shows up tomorrow.

What the report **cannot** see, so that nobody trusts it further than it goes:

- a skipped *band* of journey dates — a reset cursor, a `--start` override, or a refused ask (the
  cursor advances anyway, by design) all leave a band nobody asked for, on a day that still has
  rows. The run's own output names the refusal; the coverage report cannot.
- whether a journey date got its looks before departure. In hindsight only, and indistinguishable
  from a train that does not run that day.
- a combo listed but never once observed. It is named in the output, but it has no first observation
  and therefore no denominator, so it cannot move the fraction.
- dilution: the fraction is over the whole store, so one dead combo in sixteen fails a 95%
  threshold, but one in forty would not. Read the per-combo lines.

## Reading `npm run source:report`

```
  12051 DR-MAO 2S/GN     17 of 20 days · 85% · first seen 2026-09-03 · below the threshold
      no run on 2026-09-09 … 2026-09-11 (3 days)
  12137 CSMT-NDLS 3A/GN  20 of 20 days · 100% · first seen 2026-09-03

coverage         56 of 60 combo-days since each combo's first observation, up to 2026-09-22 (93%)
threshold        95% — one missed run in a 20-run sweep of the horizon
```

**95% is one missed run in twenty**, and twenty is the length of a sweep of the horizon
(`cycleRuns(60, 4)`). The default tolerates losing one run per sweep and fails on two. Raise or
lower it for a run with `--min-coverage <percent>`; the number the report judged by is printed, so
a lowered threshold cannot be mistaken for a healthier store.

Exit codes follow the scripts beside it: `0` at or above the threshold, `1` below it, `2` asked
wrongly or the store could not be read whole. A check can be wired to it exactly as one can to
`npm run source:health`.

Other flags: `--today <yyyy-mm-dd>` to measure as of a given IST day, `--routes <file>` for a
different list, `--no-routes` to measure only what the store already holds, `--max-rows <n>` if the
store has outgrown the read (it refuses rather than reporting a half-read store, because a truncated
read invents holes that are not there).

**When it fails.** A missing day cannot be recovered — do not go looking for a backfill. Find out
why the run did not happen, make it happen today, and if the hole was a combo rather than a day,
read the crawl's own output for the refusal that caused it.

## The two facts an operator gets wrong

**1. The ceiling is per RUN, not per DAY.** `crawl-plan.mjs` gates each run at the provider's daily
allowance less the reserve held back for live PNR checks. Nothing remembers the previous run, so
**two runs in one day spend twice the ceiling.** Today that is a human's decision, because a human
is the scheduler. The moment anything schedules this, it needs a shared daily counter of its own —
with its own key, because the usage counter cannot say which caller spent what — and that counter
has to exist *before* the first unattended run, not after the first spent month.

**2. `scripts/crawl-cursor.json` is this machine's memory of the sweep.** It holds where each
combo's rolling window got to, and how many runs in a row that combo has refused. It is written
after every run and gitignored: it is a record of what this machine has asked, not source.

Losing it is not a disaster — every combo restarts its sweep at today — but it is a lost sweep, and
the band the cursor was pointing at gets re-read while another band waits a full cycle longer. Do
not delete it casually, do not copy one machine's cursor onto another, and if it is unreadable the
crawler refuses to start rather than guessing where it was.

## Running the crawler

```bash
npm run source:crawl                 # the whole list, one ask each
npm run source:crawl -- --dry-run    # print the plan and the ceiling; ask nothing
npm run source:crawl -- --only 2     # the first two combos of the list
```

Before anything is spent it prints the list, the window, the cursor file, the worst case in calls,
the ceiling and the burst floor, and it refuses to start if the worst case is over the ceiling. A
malformed route fails that preflight rather than the budget — the guard counts a request before the
adapter sees it, so a bad entry would otherwise spend quota on a call that never leaves the process.

After the run it prints what happened, and then the whole store's coverage, because a run can be
perfectly whole while the dataset is holed by days nobody ran it.

**The crawl's exit code is about the run only:** `0` the run was whole, `1` a refusal or a gate
stopped it, `2` it was asked wrongly and nothing was spent. A store below the coverage threshold
does **not** change it — that is `npm run source:report`'s job, and keeping the two separate is what
keeps either legible.

A combo that refuses three runs in a row is reported as a bad list entry. Delete it from
`scripts/routes.json` rather than retrying it daily: 12951 answered `Unable to process your request`
for every class and date tried, and a permanent refusal wearing a transient's clothes costs a call
every day forever.

## Related

- `scripts/observations-coverage.mjs` — the gap rule itself, and what it cannot see. Read its header
  before changing what the report counts; `scripts/observations-report.mjs` is only the wiring.
- `scripts/crawl-window.mjs` — the sampling strategy, and what it does and does not guarantee.
- `scripts/crawl-plan.mjs` — the preflight and the two quota gates. Read its header before changing
  anything about what a run may spend.
- `docs/superpowers/specs/2026-09-23-pre-booking-availability-design.md` §5.3 — the measured horizon.
