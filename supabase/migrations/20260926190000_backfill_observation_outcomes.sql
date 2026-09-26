-- ---------------------------------------------------------------------------
-- Label the rows the trigger never reached, and stop the rule living in two
-- places while doing it.
--
-- **What happened.** `20260926090000` added a trigger that writes `outcome` on
-- the `days_out = 0` row. It was merged, the app deployed, and the hosted store
-- went on collecting for days with the column still empty — because a migration
-- reaches a database only when it is PUSHED, and deploying the app does not push
-- one. Twenty `days_out = 0` rows had accumulated by the time anyone read the
-- column. A trigger fires on write, so nothing it does later reaches a row that
-- was already sitting there.
--
-- This is repairable, and that is worth saying plainly because most gaps in this
-- store are not. A missed observation is gone — a past journey date answers 400,
-- so what that run would have seen cannot be asked for again. A missing LABEL is
-- different: `outcome` is derived from `status` on a row that is already stored,
-- so the rows are all still here and the derivation still holds. Nothing was
-- lost; something simply was not written down.
--
-- **One rule, one place.** The trigger and this backfill ask the identical
-- question — is this the row observed on its journey date, and is it still
-- unlabelled — and the store's own migration says where two copies of that end
-- up: "a value two callers compute is a value that will disagree". So the rule
-- becomes a function. The trigger calls it for one row, the backfill calls it
-- for every row, and there is no second copy to keep in step. The function is
-- also what makes the rule testable on its own, which a trigger body is not:
-- a test can reproduce the unlabelled state and then call the thing that fixes
-- it, instead of asserting against a trigger that has already fired.
--
-- **It still cannot overwrite a label.** `outcome is null` stays in the where
-- clause, which is what keeps a same-day re-read from moving a label that is
-- already set, and what stops the recursion: the update fires the trigger again,
-- the second pass matches no rows, and it ends there.
-- ---------------------------------------------------------------------------

-- `p_id` null means every row: the trigger passes one id, the backfill passes
-- nothing. Returns the number of rows it labelled, so a caller can say what it
-- repaired rather than hoping.
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
    where days_out = 0
      and outcome is null
      and (p_id is null or id = p_id);
  get diagnostics labelled = row_count;
  return labelled;
end;
$$;

comment on function public.availability_observation_label(uuid) is
  'Sets availability_observations.outcome from status on days_out = 0 rows that have none, and returns how many it set. One row when given an id, every row when not. Never overwrites a label already there.';

-- Grants, for the same reason the table's own migration gives: a function in
-- `public` is auto-granted EXECUTE to everyone and PostgREST publishes it as an
-- RPC endpoint, so leaving the default would put "relabel the whole store" on
-- the open API. It is SECURITY INVOKER, so an anon caller would be stopped by
-- the table's grants and its empty RLS policy set anyway — but a reachable
-- endpoint that only fails because something else refuses is a defence resting
-- on a second file. `service_role` keeps it: the trigger runs as the writer, and
-- a future repair should not need a migration to call this.
revoke all on function public.availability_observation_label(uuid) from public, anon, authenticated;
grant execute on function public.availability_observation_label(uuid) to service_role;

-- The trigger keeps its name and its timing — AFTER, because `days_out` is a
-- generated column and a BEFORE trigger reads it as null — and now carries no
-- copy of the rule.
create or replace function public.availability_observation_outcome()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.availability_observation_label(new.id);
  return null;
end;
$$;

-- The repair itself: the function's first call, over the rows that predate it.
-- The notice is how the push log says what it found.
do $$
declare
  labelled integer;
begin
  labelled := public.availability_observation_label();
  raise notice 'availability_observations: labelled % row(s) that the trigger never reached', labelled;
end;
$$;
