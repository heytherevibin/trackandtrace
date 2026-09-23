begin;
create extension if not exists pgtap with schema extensions;
select plan(58);

-- ---------------------------------------------------------------------------
-- The observation store: facts about berths, never about people.
--
-- Three things this file exists to hold still, because each one fails silently
-- if it drifts:
--   * the grants (a public table is auto-granted to anon and authenticated, so
--     the revoke is the only thing standing between the store and the
--     publishable key);
--   * `days_out` and `observed_on`, which are generated — a value two callers
--     compute is a value that will disagree, and this one is the model's main
--     feature;
--   * idempotency, so a crawler retried after a partial failure corrects its
--     row instead of double-counting it.
-- ---------------------------------------------------------------------------

select has_table('public', 'availability_observations', 'the observation store exists');

-- The whole column set, pinned. This is the no-personal-data rule made
-- executable: adding `pnr`, `user_id` or any passenger column fails here before
-- it reaches a review.
select columns_are(
  'public',
  'availability_observations',
  array[
    'id', 'observed_at', 'observed_on', 'train_no', 'from_code', 'to_code',
    'travel_class', 'quota', 'journey_date', 'days_out', 'status', 'raw_status',
    'seats', 'wl_booking', 'wl_current', 'source_prediction',
    'source_prediction_pct', 'outcome', 'outcome_at'
  ],
  'exactly these columns and nothing that identifies a person'
);

select col_is_pk('public', 'availability_observations', 'id', 'an observation is keyed by its own id');

select col_not_null('public', 'availability_observations', 'observed_at', 'an observation always says when it was made');
select col_not_null('public', 'availability_observations', 'observed_on', 'the IST day is always derivable');
select col_not_null('public', 'availability_observations', 'train_no', 'an observation names its train');
select col_not_null('public', 'availability_observations', 'from_code', 'an observation names where the journey starts');
select col_not_null('public', 'availability_observations', 'to_code', 'an observation names where it ends');
select col_not_null('public', 'availability_observations', 'travel_class', 'an observation names its class');
select col_not_null('public', 'availability_observations', 'quota', 'an observation names its quota');
select col_not_null('public', 'availability_observations', 'journey_date', 'an observation is about one dated journey');
select col_not_null('public', 'availability_observations', 'days_out', 'every observation carries its distance from departure');
select col_not_null('public', 'availability_observations', 'status', 'an observation carries the status it read');
select col_not_null('public', 'availability_observations', 'raw_status', 'the source text is the evidence and is always kept');

-- Null here is a normal reading, not a missing one: `AVAILABLE 0042`, `RAC 12`,
-- `REGRET` and `NOT AVAILABLE` carry no waitlist pair. A not-null column would
-- reject exactly the rows that say a berth is free.
select col_is_null('public', 'availability_observations', 'wl_booking', 'a row with no waitlist pair is still an observation');
select col_is_null('public', 'availability_observations', 'wl_current', 'the current waitlist is absent whenever the pair is');
select col_is_null('public', 'availability_observations', 'seats', 'a seat count is not always readable');
select col_is_null('public', 'availability_observations', 'source_prediction', 'the source need not offer a guess');
select col_is_null('public', 'availability_observations', 'source_prediction_pct', 'nor a percentage');
select col_is_null('public', 'availability_observations', 'outcome', 'an outcome is derived later, or never');
select col_is_null('public', 'availability_observations', 'outcome_at', 'and so is its timestamp');

select col_type_is('public', 'availability_observations', 'wl_booking', 'integer', 'the booking-position waitlist is a whole number');
select col_type_is('public', 'availability_observations', 'wl_current', 'integer', 'so is the current waitlist');
select col_type_is('public', 'availability_observations', 'days_out', 'integer', 'days out is a whole number of days');
select col_type_is('public', 'availability_observations', 'observed_on', 'date', 'the observation day is a calendar date');
select col_type_is('public', 'availability_observations', 'source_prediction_pct', 'numeric(5,2)', 'the baseline percentage keeps two decimals');

-- ---------------------------------------------------------------------------
-- Grants. Supabase auto-grants a new public table to the Data API roles, so
-- every one of these asserts a revoke that had to be written by hand.
-- ---------------------------------------------------------------------------
select is(has_table_privilege('anon', 'public.availability_observations', 'select')::text, 'false', 'anon cannot read observations');
select is(has_table_privilege('anon', 'public.availability_observations', 'insert')::text, 'false', 'anon cannot write observations');
select is(has_table_privilege('anon', 'public.availability_observations', 'update')::text, 'false', 'anon cannot change observations');
select is(has_table_privilege('anon', 'public.availability_observations', 'delete')::text, 'false', 'anon cannot remove observations');
select is(has_table_privilege('authenticated', 'public.availability_observations', 'select')::text, 'false', 'a signed-in traveller cannot read observations');
select is(has_table_privilege('authenticated', 'public.availability_observations', 'insert')::text, 'false', 'a signed-in traveller cannot write observations');
select is(has_table_privilege('authenticated', 'public.availability_observations', 'update')::text, 'false', 'a signed-in traveller cannot change observations');
select is(has_table_privilege('authenticated', 'public.availability_observations', 'delete')::text, 'false', 'a signed-in traveller cannot remove observations');
select is(has_table_privilege('service_role', 'public.availability_observations', 'select')::text, 'true', 'the server reads observations');
select is(has_table_privilege('service_role', 'public.availability_observations', 'insert')::text, 'true', 'the server writes observations');
select is(has_table_privilege('service_role', 'public.availability_observations', 'update')::text, 'true', 'the server needs update for the upsert that makes a retry idempotent');
select is(has_table_privilege('service_role', 'public.availability_observations', 'delete')::text, 'false', 'nothing deletes an observation');

-- The second lock on the same door: even a future grant leaks nothing while
-- row level security is on and no policy opens it.
select is(
  (select relrowsecurity from pg_class where oid = 'public.availability_observations'::regclass)::text,
  'true',
  'row level security is enabled'
);
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'availability_observations'),
  0::bigint,
  'no policy opens the store to a Data API role'
);

-- ---------------------------------------------------------------------------
-- Indexes: the two spec §5.1 names, plus the one that carries idempotency.
-- ---------------------------------------------------------------------------
select has_index('public', 'availability_observations', 'availability_observations_journey_idx', 'the outcome-join index exists');
select has_index('public', 'availability_observations', 'availability_observations_open_outcome_idx', 'the unresolved-journey index exists');
select has_index('public', 'availability_observations', 'availability_observations_once_a_day_idx', 'the one-observation-a-day index exists');
select is(
  (select indisunique from pg_index where indexrelid = 'public.availability_observations_once_a_day_idx'::regclass)::text,
  'true',
  'and it is unique, so the database itself cannot hold a double count'
);

-- ---------------------------------------------------------------------------
-- `days_out` and `observed_on` are generated, and a caller cannot write either.
-- A generated column that turns out to be writable is a silent correctness hole
-- in every training row.
--
-- These three use train 19999, which nothing below asks about. A `throws_ok`
-- whose statement stops throwing *succeeds* instead, leaving a row behind, and a
-- row left behind in the middle of a test file breaks whatever counts it later —
-- turning one precise failure into an abort that hides the rest.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.availability_observations (train_no, from_code, to_code, travel_class, quota, journey_date, status, raw_status, days_out)
    values ('19999', 'MAS', 'NDLS', 'SL', 'GN', '2026-10-01', 'WAITLIST', 'GNWL65/WL26', 3)$$,
  '428C9'::char(5),
  'cannot insert a non-DEFAULT value into column "days_out"',
  'a caller cannot write days_out'
);
select throws_ok(
  $$update public.availability_observations set days_out = 99 where train_no = '19999'$$,
  '428C9'::char(5),
  'column "days_out" can only be updated to DEFAULT',
  'nor update it afterwards'
);
select throws_ok(
  $$insert into public.availability_observations (train_no, from_code, to_code, travel_class, quota, journey_date, status, raw_status, observed_on)
    values ('19999', 'MAS', 'NDLS', 'SL', 'GN', '2026-10-01', 'WAITLIST', 'GNWL65/WL26', '2026-09-24')$$,
  '428C9'::char(5),
  'cannot insert a non-DEFAULT value into column "observed_on"',
  'nor write the observation day it is measured from'
);

-- ---------------------------------------------------------------------------
-- Both are measured in IST, not UTC. 18:30Z is already the next IST day; a
-- server that forgot the offset would answer 2026-09-23 and 8 here.
-- ---------------------------------------------------------------------------
insert into public.availability_observations
  (observed_at, train_no, from_code, to_code, travel_class, quota, journey_date, status, raw_status, wl_booking, wl_current, source_prediction, source_prediction_pct)
values
  ('2026-09-23T18:30:00Z', '12621', 'MAS', 'NDLS', 'SL', 'GN', '2026-10-01', 'WAITLIST', 'GNWL65/WL26', 65, 26, 'Confirm Chances', 70.50);

select is(
  (select days_out from public.availability_observations where train_no = '12621' and travel_class = 'SL'),
  7,
  'days_out counts from the IST calendar day, not the UTC one'
);
select is(
  (select observed_on from public.availability_observations where train_no = '12621' and travel_class = 'SL'),
  '2026-09-24'::date,
  'and so does the observation day'
);

-- A row that announces a free berth carries no waitlist pair. It is an ordinary
-- observation, and must insert.
select lives_ok(
  $$insert into public.availability_observations (observed_at, train_no, from_code, to_code, travel_class, quota, journey_date, status, raw_status)
    values ('2026-09-23T18:30:00Z', '12621', 'MAS', 'NDLS', '3A', 'GN', '2026-10-01', 'AVAILABLE', 'AVAILABLE 0042')$$,
  'a row with no waitlist numbers is a normal observation'
);

-- ---------------------------------------------------------------------------
-- Idempotency. The uniqueness is per observation day, not per journey date: the
-- same journey is observed many times, each at a different days_out, and that
-- sequence is the training signal.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.availability_observations (observed_at, train_no, from_code, to_code, travel_class, quota, journey_date, status, raw_status)
    values ('2026-09-23T20:00:00Z', '12621', 'MAS', 'NDLS', 'SL', 'GN', '2026-10-01', 'WAITLIST', 'GNWL60/WL21')$$,
  '23505'::char(5),
  'duplicate key value violates unique constraint "availability_observations_once_a_day_idx"',
  'a second write of the same observation day is refused outright'
);

insert into public.availability_observations
  (observed_at, train_no, from_code, to_code, travel_class, quota, journey_date, status, raw_status, wl_booking, wl_current)
values
  ('2026-09-23T20:00:00Z', '12621', 'MAS', 'NDLS', 'SL', 'GN', '2026-10-01', 'WAITLIST', 'GNWL60/WL21', 60, 21)
on conflict (train_no, travel_class, quota, from_code, to_code, journey_date, observed_on) do update
  set observed_at = excluded.observed_at, status = excluded.status, raw_status = excluded.raw_status,
      wl_booking = excluded.wl_booking, wl_current = excluded.wl_current;

select is(
  (select count(*)::int from public.availability_observations where train_no = '12621' and travel_class = 'SL'),
  1,
  'the retried write leaves one row, not two'
);
-- `order by … limit 1` so that a missing unique index fails on the count above
-- rather than aborting this subquery and taking the rest of the file with it.
select is(
  (select wl_current from public.availability_observations where train_no = '12621' and travel_class = 'SL' order by observed_at desc limit 1),
  21,
  'and it carries the later reading, not the stale one'
);

-- The same journey date, observed on the next IST day, is a different fact.
insert into public.availability_observations
  (observed_at, train_no, from_code, to_code, travel_class, quota, journey_date, status, raw_status, wl_booking, wl_current)
values
  ('2026-09-24T20:00:00Z', '12621', 'MAS', 'NDLS', 'SL', 'GN', '2026-10-01', 'WAITLIST', 'GNWL60/WL18', 60, 18);

select is(
  (select count(*)::int from public.availability_observations where train_no = '12621' and travel_class = 'SL'),
  2,
  'the same journey observed on another day is a second row'
);
select is(
  (select array_agg(days_out order by days_out) from public.availability_observations where train_no = '12621' and travel_class = 'SL'),
  array[6, 7],
  'and the pair is the decreasing days_out the model is fitted to'
);

-- Everything in the key is really in the key: one differing part is a different
-- observation, not a conflict.
select lives_ok(
  $$insert into public.availability_observations (observed_at, train_no, from_code, to_code, travel_class, quota, journey_date, status, raw_status)
    values ('2026-09-23T18:30:00Z', '12621', 'MAS', 'NDLS', 'SL', 'TQ', '2026-10-01', 'WAITLIST', 'TQWL12/WL9')$$,
  'a different quota is a different observation'
);
select lives_ok(
  $$insert into public.availability_observations (observed_at, train_no, from_code, to_code, travel_class, quota, journey_date, status, raw_status)
    values ('2026-09-23T18:30:00Z', '12621', 'MAS', 'BPL', 'SL', 'GN', '2026-10-01', 'WAITLIST', 'GNWL65/WL26')$$,
  'a different leg is a different observation'
);
select lives_ok(
  $$insert into public.availability_observations (observed_at, train_no, from_code, to_code, travel_class, quota, journey_date, status, raw_status)
    values ('2026-09-23T18:30:00Z', '12621', 'MAS', 'NDLS', 'SL', 'GN', '2026-10-02', 'WAITLIST', 'GNWL65/WL26')$$,
  'a different journey date is a different observation'
);

select * from finish();
rollback;
