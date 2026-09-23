-- availability_observations: what seat availability said, recorded so a Trakline
-- confirmation model can later be fitted to it. Forward-only. Applied locally by
-- `supabase db reset` and remotely by `supabase db push`.
--
-- ===========================================================================
-- NO PERSONAL DATA. THIS IS THE DESIGN, NOT AN OVERSIGHT.
-- ===========================================================================
-- No PNR. No user id. No passenger name, age, berth, coach or contact. Nothing
-- that identifies a person or a booking.
--
-- A row says one thing: *on this train, in this class, at this quota, between
-- these two stations, N days before departure, the waitlist stood here.* That is
-- a fact about berths. It is what keeps this table outside every privacy surface
-- the console already has, and it is the answer to the terms question in
-- design §9.2 — we hold derived facts, never the provider's content.
--
-- **Do not add a column that would change that.** If a later feature seems to
-- need one, it needs a different table, not this one. The pgTAP pins the whole
-- column list (`columns_are`) precisely so a helpful addition fails a test
-- rather than a privacy review.
-- ===========================================================================
--
-- Two derived columns are `generated always … stored` rather than written by a
-- caller: a value two callers compute is a value that will disagree, and
-- `days_out` is the model's main feature. Both count in IST, because a journey
-- date is an Indian calendar date and a UTC-derived day is off by one for every
-- observation made after 18:30Z.

create extension if not exists pgcrypto;

create table public.availability_observations (
  id                    uuid primary key default gen_random_uuid(),
  observed_at           timestamptz not null default now(),
  -- The IST calendar day of the observation. Generated, and the last part of the
  -- uniqueness key below: the same journey is observed on many days, and each of
  -- those is a different fact.
  observed_on           date not null generated always as ((observed_at at time zone 'Asia/Kolkata')::date) stored,
  train_no              text not null,
  from_code             text not null,
  to_code               text not null,
  travel_class          text not null,
  quota                 text not null,
  -- The date this row is *about*, which is not necessarily the date that was
  -- asked for: one call returns a four-date window, and each date gets its own row.
  journey_date          date not null,
  days_out              integer not null generated always as (journey_date - (observed_at at time zone 'Asia/Kolkata')::date) stored,
  status                text not null,
  -- Verbatim source text. The split below is a convenience; this is the evidence.
  raw_status            text not null,
  seats                 integer,
  -- The two halves of `raw_status`: `GNWL65/WL26` is booking-position waitlist 65
  -- and current waitlist 26 — where the queue started and where it now stands.
  -- **Both nullable, and null is normal, not missing.** `AVAILABLE 0042`,
  -- `RAC 12`, `REGRET`, `NOT AVAILABLE` and `CURR_AVBL` carry no pair; a not-null
  -- here would reject exactly the rows announcing a free berth.
  wl_booking            integer,
  wl_current            integer,
  -- The source's own guess, recorded privately as the baseline a Trakline model
  -- has to beat (design D4/§6). **Never rendered**: the live site promises
  -- confirmation odds are never shown, and showing someone else's as ours would
  -- be untrue twice over.
  source_prediction     text,
  source_prediction_pct numeric(5,2),
  -- Derived later from the row whose `days_out` is 0, per design §5.3. Nothing
  -- writes these yet, and the recorder deliberately leaves them out of its
  -- payload so a same-day re-observation can never wipe a resolved outcome.
  outcome               text,
  outcome_at            timestamptz
);

-- Design §5.1's two indexes.
create index availability_observations_journey_idx
  on public.availability_observations (train_no, travel_class, quota, journey_date);

create index availability_observations_open_outcome_idx
  on public.availability_observations (journey_date) where outcome is null;

-- Idempotency, decided here and recorded: **a unique index, with the write as an
-- upsert**, rather than leaving the crawler to remember what it already wrote.
-- A crawler retried after a partial failure must not double-count, and the
-- crawler is the thing that crashed — a database that cannot hold a duplicate is
-- worth more than a script that promises not to write one.
--
-- The key is the combination that identifies one observation, plus the IST day
-- it was made on. Uniqueness is per observation day, never per journey date: a
-- journey observed on sixty consecutive days is sixty rows at decreasing
-- `days_out`, and that sequence is the whole training signal.
--
-- The write resolves a conflict with `do update`, not `do nothing`: the later
-- read of the same day is the more current fact about those berths, and a retry
-- after a partial failure is exactly the case where the newer answer is the one
-- worth keeping.
create unique index availability_observations_once_a_day_idx
  on public.availability_observations (train_no, travel_class, quota, from_code, to_code, journey_date, observed_on);

-- ---------------------------------------------------------------------------
-- Grants. A new table in `public` is auto-granted to **all three** Data API roles
-- through Supabase's default privileges (`[api] auto_expose_new_tables`, which
-- defaults to true and matches the cloud). The revoke is therefore not optional:
-- without it this whole store is readable by anyone holding the publishable key.
--
-- `service_role` is revoked too and granted back only what it needs. Its
-- auto-grant is `all`, which includes `delete` — and nothing may delete an
-- observation, because a hole in this dataset is permanent: past journey dates
-- cannot be re-read (design §5.3), so a deleted row is a row that can never be
-- recovered. `update` is granted only because the idempotent upsert needs it.
-- ---------------------------------------------------------------------------
revoke all on public.availability_observations from anon, authenticated, service_role;
grant select, insert, update on public.availability_observations to service_role;

-- The second lock on the same door. The service role bypasses RLS, so with no
-- policy at all this denies every Data API caller even if a future migration
-- re-grants the table by accident.
alter table public.availability_observations enable row level security;
