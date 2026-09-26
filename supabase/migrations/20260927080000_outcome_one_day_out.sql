-- ---------------------------------------------------------------------------
-- The outcome is the reading taken ONE DAY before the journey, not the one taken
-- on the journey date.
--
-- **The first rule was measured wrong, and the store said so within the hour.**
-- `20260926090000` labelled the `days_out = 0` row, on the reasoning that "the
-- journey date is readable ON the journey date and booking has closed by then,
-- so the last observation IS the outcome". Booking having closed is precisely
-- why that reading cannot say how the queue ended. The first twenty labels,
-- read back off the hosted store:
--
--     10 × TRAIN DEPARTED
--      7 × NOT AVAILABLE
--      1 × GNWL161/WL82
--      1 × GNWL75/WL34
--      1 × TQWL59/WL39
--     can_book on the journey date:  3 open / 17 closed
--
-- The crawl runs at 05:30 IST, so by the time it asks about today half these
-- trains have left and the counter is shut on most of the rest. `status` is
-- `WAITLIST` for `NOT AVAILABLE` and `TRAIN DEPARTED` alike, so all twenty came
-- out `WAITLIST` whatever had happened. **A constant is not a label.** A model
-- trained on it learns to answer `WAITLIST`, and a forecast scored against it is
-- wrong every time for a reason that has nothing to do with the forecast.
--
-- One day out, the same store on the same day:
--
--     15 × waitlist pair          20 of 27 readings still bookable
--      6 × NOT AVAILABLE
--      3 × AVAILABLE
--      2 × CURR_AVBL              berths released
--      1 × CHARTING DONE          the chart being prepared
--
-- Six of twenty-seven carry the resolution itself, and `CHARTING DONE` is the
-- moment a waitlist actually resolves. This is the last reading the crawler can
-- take while the question is still answerable, which is what an outcome has to
-- be.
--
-- **Nothing in the crawler changes.** The pinned ask is made at today and one
-- seats ask returns a four-date window, so `days_out` 0..3 are already written
-- every run — a `days_out = 1` row for each combo arrives on the day before its
-- journey, from the run that asked about today. Only which of those rows carries
-- the label is different, and that is this file.
--
-- **Why one fixed day rather than "the last bookable reading".** That was the
-- other candidate and the store refuses it: the last reading with `can_book` is
-- a median of SEVEN days before departure, because the rolling sweep rarely
-- comes back to a journey as it approaches. A label meaning "what it looked like
-- a week out" is not an outcome either. `days_out = 1` is also decidable from
-- one row, which is what lets a trigger write it; the other needs a window over
-- the journey and changes as later rows land.
-- ---------------------------------------------------------------------------

create or replace function public.availability_observation_label(p_id uuid default null)
returns integer
language plpgsql
-- Pinned, because this runs on every write to the store and an empty path is
-- what stops a schema earlier on someone else's path from shadowing a call.
set search_path = ''
as $$
declare
  labelled integer;
begin
  update public.availability_observations
    set outcome = status
    where days_out = 1
      and outcome is null
      and (p_id is null or id = p_id);
  get diagnostics labelled = row_count;
  return labelled;
end;
$$;

comment on function public.availability_observation_label(uuid) is
  'Sets availability_observations.outcome from status on days_out = 1 rows that have none, and returns how many it set. One row when given an id, every row when not. Never overwrites a label already there.';

-- Clear the labels the old rule wrote. They are not merely uninformative: a
-- journey would otherwise carry two labelled rows saying different things, and
-- the day-0 one would be the wrong answer stated with the same confidence as the
-- right one. Nothing is destroyed — `status` and `raw_status` are untouched, so
-- the reading itself is still there to be read; only the claim that it was an
-- outcome goes away.
do $$
declare
  cleared integer;
begin
  update public.availability_observations
    set outcome = null
    where days_out = 0 and outcome is not null;
  get diagnostics cleared = row_count;
  raise notice 'availability_observations: cleared % journey-date label(s) the old rule wrote', cleared;
end;
$$;

-- And label the rows that were the outcome all along. These are already stored:
-- the repair needs no provider call and no waiting.
do $$
declare
  labelled integer;
begin
  labelled := public.availability_observation_label();
  raise notice 'availability_observations: labelled % row(s) taken one day before the journey', labelled;
end;
$$;
