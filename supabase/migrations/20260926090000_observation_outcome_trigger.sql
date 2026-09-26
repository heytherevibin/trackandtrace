-- ---------------------------------------------------------------------------
-- Write the outcome on the row that IS the outcome.
--
-- `outcome` has been null since the store was created. The column's own comment
-- says why it could be: it is "derived from the row whose `days_out` is 0" —
-- the journey date is readable ON the journey date, booking has closed by then,
-- and so the last observation is the outcome. Nothing needed to write it.
--
-- It is written now because a label a model trains against should be a value and
-- not an instruction to go and derive one. A query that has to re-establish
-- "the row where days_out = 0" every time is a query that can get it wrong once.
--
-- **AFTER, not BEFORE, and that is the whole trick.** `days_out` is a GENERATED
-- column, and generated columns are computed after BEFORE triggers run — so a
-- BEFORE trigger reads `new.days_out` as null, matches nothing, and writes no
-- labels at all while looking entirely correct. That version was written first
-- and caught only by running it. The alternative, recomputing the journey-date
-- arithmetic inside the trigger, is the duplication the store's own migration
-- warns against: "a value two callers compute is a value that will disagree".
--
-- **First write wins.** The upsert is keyed per observation DAY and resolves a
-- conflict with `do update`, so a second read of the same day rewrites the row.
-- The berths should change — the later read is the more current fact — and the
-- label must not, which is exactly why the recorder leaves `outcome` out of its
-- payload. `where outcome is null` is that guard, and it is also what stops the
-- trigger recursing: the update it issues sets the column, so the pass it
-- triggers matches no rows and stops.
-- ---------------------------------------------------------------------------

create or replace function public.availability_observation_outcome()
returns trigger
language plpgsql
-- Pinned, because this runs on every write to the store and an empty path is
-- what stops a schema earlier on someone else's path from shadowing a call.
set search_path = ''
as $$
begin
  -- Only the row observed ON its journey date, and only while it has no label.
  if new.days_out = 0 then
    update public.availability_observations
      set outcome = new.status
      where id = new.id and outcome is null;
  end if;
  return null;
end;
$$;

-- Insert AND update, because the upsert reaches the row either way: a combo
-- first seen on its journey date arrives as an insert, and one re-read later the
-- same day arrives as an update.
create trigger availability_observations_set_outcome
  after insert or update on public.availability_observations
  for each row
  execute function public.availability_observation_outcome();

comment on function public.availability_observation_outcome() is
  'Sets availability_observations.outcome from status on the days_out = 0 row, once, and never overwrites one already set.';
