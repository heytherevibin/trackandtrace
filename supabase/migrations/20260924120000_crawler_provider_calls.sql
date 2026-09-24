-- crawler_provider_calls: one row per provider call the availability crawler made,
-- so that a DAY has a ceiling and not merely a run. Forward-only. Applied locally
-- by `supabase db reset` and remotely by `supabase db push`.
--
-- ===========================================================================
-- WHY THIS TABLE EXISTS, AND WHY IN POSTGRES RATHER THAN UPSTASH.
-- ===========================================================================
-- `crawlCeiling` in `scripts/crawl-plan.mjs` caps what ONE RUN may spend. It has
-- never capped a day: two runs in one day spend twice the ceiling, because
-- nothing remembered the first. That was a human's decision to make while a
-- human ran the crawler and read what it said. It stops being one the moment
-- anything schedules it, and the counter has to exist BEFORE the first
-- unattended run rather than after the first spent month.
--
-- The stake is not the crawler's own dataset. A spent plan answers 429; a 429 is
-- a fact about the provider, so the shared fuse correctly rests the live PNR path
-- too — and `PNR_FALLBACK=none` makes that rest a traveller's final answer.
--
-- The existing counter (`usage.ts` over `shared-store.ts`) cannot do this job.
-- It prefixes every key with `tt:${VERCEL_ENV ?? NODE_ENV}`, so a crawler run
-- locally increments `tt:development:usage:railkit:<day>` while production
-- increments `tt:production:...`; and with no Upstash credentials
-- `sharedStoreConfig` returns null and the count goes to an in-process `Map`
-- discarded at exit. The crawler's spend reaches no counter anyone would look at.
--
-- Postgres, for three reasons that belong in the source rather than in a review:
--
--   * The crawler ALREADY REQUIRES this database. `crawl-availability.mjs`
--     proves the observation store can take a row before it spends anything and
--     refuses to start otherwise, so the counter cannot be unavailable while the
--     crawler is able to run. One failure domain, not two.
--   * It is shared across machines and needs no credential the crawler does not
--     already hold.
--   * The environment-prefix problem above simply does not arise.
--
-- ===========================================================================
-- A LEDGER, NOT A COUNTER, AND THE GRANTS ARE THE REASON.
-- ===========================================================================
-- A single `calls` integer per day has to be UPDATED to be incremented, and a
-- row that may be updated may be set back to zero. This holds one row per call
-- instead: the day's spend is the row COUNT. `service_role` therefore needs
-- neither `update` nor `delete`, and a recorded call cannot afterwards be
-- lowered, rewritten or removed by the only role that can reach the table at
-- all. A spend record that can be deleted is a spend record that proves nothing.
--
-- It also removes the one thing PostgREST cannot express — an additive upsert —
-- so no function, and no function grant, stands between the crawler and its own
-- tally.
--
-- The cost is bounded by the thing it enforces: the daily cap is
-- `DEFAULT_DAILY_ALLOWANCE` less the live reserve (33 a day today), so the table
-- grows by at most a few dozen rows a day.
--
-- ===========================================================================
-- NO PERSONAL DATA, AND NOT EVEN A JOURNEY.
-- ===========================================================================
-- A row says one thing: *the crawler spent one provider call at this moment*.
-- No PNR, no user, no train, no leg, no date asked for. What was asked is
-- already recorded, as berths, in `availability_observations`; this table is the
-- spend and nothing else. The pgTAP pins the whole column list precisely so a
-- helpful addition fails a test rather than a privacy review.
-- ===========================================================================

create extension if not exists pgcrypto;

create table public.crawler_provider_calls (
  id       uuid primary key default gen_random_uuid(),
  -- The moment the call was about to leave the process. Written by the crawler
  -- rather than left to the default, so that this column and
  -- `availability_observations.observed_at` are read off ONE clock: the run's own
  -- idea of today is what the rolling window, the pinned ask and `days_out` are
  -- all computed from, and a counter bucketed by a different clock could charge a
  -- run's calls to a day the run does not believe it is in.
  spent_at timestamptz not null default now(),
  -- The IST calendar day the call is charged to, by **exactly the expression
  -- `availability_observations.observed_on` uses** — so the two agree when read
  -- side by side, which is the whole point of bucketing it this way. Generated,
  -- never written: a value two callers compute is a value that will disagree.
  spent_on date not null generated always as ((spent_at at time zone 'Asia/Kolkata')::date) stored
);

-- The only read there is: how many calls has today already cost? Without this
-- the count the gate depends on degrades into a sequential scan as the ledger
-- grows, on the one query a run makes before it decides whether to start.
create index crawler_provider_calls_day_idx
  on public.crawler_provider_calls (spent_on);

-- ---------------------------------------------------------------------------
-- Grants. A new table in `public` is auto-granted to **all three** Data API roles
-- through Supabase's default privileges (`[api] auto_expose_new_tables`, which
-- defaults to true and matches the cloud). The revoke is therefore not optional.
--
-- `service_role` is revoked too and granted back only `select, insert`. Its
-- auto-grant is `all`, which includes `delete` and `update` — and a spend that
-- can be deleted or lowered is not evidence of anything. Unlike the observation
-- store, `update` is not granted back at all: nothing here is ever corrected,
-- because a call that left the process cannot be unspent.
--
-- Over-counting is the safe direction and is the one this design accepts: a row
-- is written BEFORE its call leaves, so a call that never actually goes out is
-- still charged. Under-counting is the hazard — it under-reports exactly when
-- something has gone wrong.
-- ---------------------------------------------------------------------------
revoke all on public.crawler_provider_calls from anon, authenticated, service_role;
grant select, insert on public.crawler_provider_calls to service_role;

-- The second lock on the same door. The service role bypasses RLS, so with no
-- policy at all this denies every Data API caller even if a future migration
-- re-grants the table by accident.
alter table public.crawler_provider_calls enable row level security;
