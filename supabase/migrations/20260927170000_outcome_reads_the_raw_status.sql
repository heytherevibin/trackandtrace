-- ---------------------------------------------------------------------------
-- The label says what ENDED, not which status word the source used.
--
-- `outcome = status` collapsed four different endings into two words. Measured
-- on the live store, 453 rows, every form it has ever returned:
--
--   312 × a waitlist pair, bookable          still queuing, counter open
--    43 × AVAILABLE-n / AVAILABLE-n#         berths free
--    30 × NOT AVAILABLE, not bookable        counter shut while queuing
--    27 × REGRET, not bookable               likewise
--    21 × RAC pairs and GNWLn/RACn           a shared seat, which is not a waitlist
--    11 × TRAIN DEPARTED                     shut, and gone
--     4 × CLASS NOT EXIST                    not an observation of a queue at all
--     2 × CURR_AVBL-n                        berths released
--     2 × PQWL/AVAILABLE                     the queue cleared into availability
--     1 × CHARTING DONE *                    the chart was made
--
-- `status` is `WAITLIST` for the pairs, for `NOT AVAILABLE`, for `REGRET`, for
-- RAC and for `CHARTING DONE` alike. A model trained on it cannot tell a shared
-- seat from a shut counter, and "still queuing when booking closed" from "still
-- queuing with a day to go" — which are the two endings a traveller most wants
-- told apart.
--
-- **Four labels, and no more.** AVAILABLE, RAC, WAITLIST, CLOSED. Each separates
-- something that differs; `CHARTING DONE` does not get its own because one row is
-- not a category a model can learn, and nothing is lost — `raw_status` is kept
-- verbatim and its own column comment calls it the evidence. A finer reading is
-- always available to whoever needs one.
--
-- **`can_book` outranks the words**, the rule `statusTone` already keeps on the
-- page: a day the source will not sell is closed however it is labelled. So
-- `AVAILABLE` with `can_book = false` is CLOSED here too, and the two readings of
-- the same fact cannot drift apart.
--
-- **These are quota states, not anybody's ticket.** The label says what the
-- counter showed one day before the journey. Whether a particular waitlisted
-- ticket cleared at the chart is a PNR question, and this store holds no PNRs.
-- ---------------------------------------------------------------------------

create or replace function public.availability_outcome_label(p_raw_status text, p_can_book boolean)
returns text
language plpgsql
immutable
-- Pinned, because this runs inside a trigger on every write to the store.
set search_path = ''
as $$
declare
  raw text := btrim(coalesce(p_raw_status, ''));
begin
  if raw = '' then return null; end if;

  -- First, because it is not a reading of a queue at all and it arrives with
  -- can_book false, which would otherwise file it as a shut counter.
  if raw ~* '^CLASS NOT EXIST' then return null; end if;

  -- `can_book` outranks the words. Checked before the forms so no branch below
  -- has to remember to re-check it.
  if p_can_book is not true then return 'CLOSED'; end if;

  -- Anchored, because `NOT AVAILABLE` contains the word — the same trap the
  -- parser's `AVAILABLE_COUNT` is anchored against, and it reaches this line only
  -- when the counter is open anyway.
  if raw ~* '^AVAILABLE\M' or raw ~* '^CURR_AVBL' or raw ~* '/\s*AVAILABLE$' then return 'AVAILABLE'; end if;

  -- RAC either side of the slash: `RAC 58/RAC 51` opened there, `GNWL5/RAC48`
  -- arrived there. Where a position now STANDS is what an outcome is about, and
  -- both of those now stand at RAC.
  --
  -- The figure is required rather than a word boundary. `\M` after RAC matches
  -- `RAC 51`, where a space follows, and NOT `RAC48`, where a digit does — so the
  -- form that moved out of a waitlist, the one this branch exists for, was the one
  -- it missed. Every RAC form the store holds carries a number; one without would
  -- fall through and say nothing, which is the safe direction.
  if raw ~* '(^|/)\s*RAC\s*\d' then return 'RAC'; end if;

  -- A waitlist of any quota, with the counter still open.
  if raw ~* 'WL\s*\d' then return 'WAITLIST'; end if;

  -- Anything else is a form this store has not seen. Saying nothing is the only
  -- safe answer: a wrong label is worse than an absent one, because nothing later
  -- says it was wrong.
  return null;
end;
$$;

comment on function public.availability_outcome_label(text, boolean) is
  'Reads a raw status into one of AVAILABLE, RAC, WAITLIST, CLOSED, or null when the form says nothing about a queue. can_book outranks the words.';

revoke all on function public.availability_outcome_label(text, boolean) from public, anon, authenticated;
grant execute on function public.availability_outcome_label(text, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- The writer, with the one guard this change makes necessary.
--
-- **A null label must not be written.** The trigger's condition is `outcome is
-- null`, so an update that sets null leaves the row still matching: it fires the
-- trigger again, matches again, and recurses until the stack gives out. Every
-- insert of a `CLASS NOT EXIST` row on its journey-minus-one day would have
-- failed, and nothing in the old version could have hit it because `status` is
-- never null. Hence `is not null` in the where clause rather than a null check
-- around the assignment.
-- ---------------------------------------------------------------------------

create or replace function public.availability_observation_label(p_id uuid default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  labelled integer;
begin
  update public.availability_observations
    set outcome = public.availability_outcome_label(raw_status, can_book)
    where days_out = 1
      and outcome is null
      and public.availability_outcome_label(raw_status, can_book) is not null
      and (p_id is null or id = p_id);
  get diagnostics labelled = row_count;
  return labelled;
end;
$$;

comment on function public.availability_observation_label(uuid) is
  'Sets availability_observations.outcome on days_out = 1 rows that have none, from availability_outcome_label, and returns how many it set. One row when given an id, every row when not. Never overwrites a label already there, and never writes a null.';

-- Re-derive the labels the old rule wrote. This one OVERWRITES, deliberately and
-- once: those rows carry `status`, which is the thing being replaced, so the
-- first-write-wins guard would preserve exactly what is wrong. Nothing is lost —
-- `status` and `raw_status` are untouched and the label is derived from them.
do $$
declare
  relabelled integer;
begin
  update public.availability_observations
    set outcome = public.availability_outcome_label(raw_status, can_book)
    where days_out = 1
      and outcome is distinct from public.availability_outcome_label(raw_status, can_book);
  get diagnostics relabelled = row_count;
  raise notice 'availability_observations: re-read % outcome label(s) from the raw status', relabelled;
end;
$$;
