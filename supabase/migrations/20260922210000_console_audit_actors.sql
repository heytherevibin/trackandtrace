-- The Member filter's roster (module 14, Task 6).
--
-- WHY THIS EXISTS. The Member picker used to accumulate its options from the
-- actors named by the rows it had already fetched, because public.console_team
-- is Owner-only while this module is Owner AND Admin -- there was no roster an
-- Admin could read. Nothing was hidden and the log stayed honest, but the
-- filter could not reach a member who had done nothing in the range on screen,
-- and that member is exactly the one a reader opens this module to ask about.
--
-- WHY IT READS console.audit_log AND NOT console.members. Two reasons, and the
-- first is the role floor above. The second is that they are different sets: a
-- member removed last year keeps every row they ever wrote, and console.members
-- would no longer offer them (console_team drops `status = 'removed'`
-- entirely). The one roster that can reach every row of this log is the log
-- itself. Names and roles are therefore the ones the rows carry -- as the actor
-- was at the time -- and not today's, which is the same rule the table and the
-- drawer already follow.
--
-- Reads and nothing else. The log is append-only (20260920090300_console_audit.sql)
-- and an INSERT would pass its update and delete triggers untouched, so "read
-- only" is a property of this file rather than something the table enforces
-- on it.
--
-- Every parameter is timestamptz or text, never an enum: PostgREST casts an
-- enum argument in the CALLING role's context, before security definer
-- applies, and authenticated has no usage on schema console, so such a call
-- dies with "permission denied for schema console" before the body ever runs
-- (20260921000000_console_enum_args_as_text.sql).

-- THE RANGE, AND WHICH QUESTION THE PICKER SERVES.
--
-- All three parameters are nullable filters, `null` meaning "no filter" -- the
-- same contract public.console_audit keeps across all nine of its own. That is
-- what lets one function answer either question, and it moves the choice to
-- the caller, where it belongs:
--
--   * windowed, it answers "who acted in these dates?" -- a short list that
--     matches what the rows on screen can show;
--   * unbounded, it answers "has this person done anything at all?"
--
-- **The console calls it unbounded.** The second question is the one that made
-- this a task: a member silent in the chosen range is precisely the member the
-- old picker could not offer, so a roster scoped to the range would leave that
-- behaviour in place under a new name. The cost is a list that can name someone
-- with no rows in the range on screen -- and selecting them is then an answer
-- ("nothing, here") rather than a dead end.
--
-- WHAT THE UNBOUNDED CALL ACTUALLY COSTS, measured rather than assumed. The
-- ANSWER is small -- one entry per actor, bounded by how many people have ever
-- held a seat in this console, not by two years of rows. The SCAN is not:
-- PostgreSQL 17.6 has no index skip scan, so console_audit_actor_idx
-- (actor_id, at desc) does not serve this shape and EXPLAIN gives
-- Seq Scan -> Sort -> Unique over the whole table. That is the reason the page
-- reads this ONCE PER OPEN and the GET route beside it does not read it at all:
-- the roster cannot change with the filters, so a per-keystroke call would pay
-- that scan for an answer that could not have moved. If the log ever outgrows
-- one scan per page open, the fix is a covering path for this query (a
-- recursive loose index scan, or a materialised roster), not a narrower window
-- -- narrowing it would trade the cost for the defect this function removes.
--
-- p_environment is a CONVENIENCE, NOT A BOUNDARY -- forgeable, exactly as it is
-- on public.console_audit and on every writer in this schema. What keeps one
-- console out of another's history is the database it is pointed at, not this
-- argument. The console leaves it null too, for the same reason it leaves the
-- dates null: a member who has only ever acted in preview must still be
-- selectable from a production board, so that a reader can ask and be told
-- "nothing here".
--
-- Not STABLE, though it only reads: console.require_role -> current_member
-- moves the session's last_seen_at, and a non-volatile function may not UPDATE.
create or replace function public.console_audit_actors(
  p_from        timestamptz default null,
  p_to          timestamptz default null,
  p_environment text        default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- The same floor as the list and the entry, and a floor rather than an
  -- equality: console.require_role compares console.role_rank, so Owner and
  -- Admin both pass and Support and Viewer are refused with 'no access'.
  -- Passing 'owner' here would recreate the very gap this function closes.
  v_member console.members := console.require_role('admin');
  v_out    jsonb;
begin
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'actor_id',   a.actor_id,
             'actor_name', a.actor_name,
             'actor_role', a.actor_role
           )
           -- By name, as the picker lists them; actor_id breaks the tie, because
           -- two people really can share a display name and an unstable order
           -- would reshuffle the list between reads.
           order by a.actor_name, a.actor_id
         ), '[]'::jsonb)
    into v_out
    from (
      -- DISTINCT ON the actor, never on the whole row. console.audit_log names
      -- the actor as they were, so one person who has been renamed -- or whose
      -- role changed -- carries several (name, role) pairs across their rows,
      -- and a plain DISTINCT would offer the picker two options with the same
      -- value. The latest row in the window wins, so a member is listed as they
      -- are now rather than as they first appeared; id breaks the tie between
      -- rows written in one transaction, exactly as it does for paging.
      select distinct on (l.actor_id) l.actor_id, l.actor_name, l.actor_role
        from console.audit_log l
       -- The System actor is not a member and p_member cannot reach it: the
       -- list's own filter is `actor_id = p_member`, which no null ever
       -- satisfies. Offering 'System' would be a picker entry that always
       -- returns nothing.
       where l.actor_id is not null
         -- Half-open, as everywhere else in this module: p_from inclusive,
         -- p_to exclusive, so the roster and the rows it is offered beside
         -- agree about which side of a seam a row falls on.
         and (p_from is null        or l.at >= p_from)
         and (p_to is null          or l.at <  p_to)
         -- Plain equality, so an empty string matches nothing rather than
         -- meaning "no filter" -- it fails closed, and callers send null.
         and (p_environment is null or l.environment = p_environment)
       order by l.actor_id, l.at desc, l.id desc
    ) a;

  -- coalesce, not jsonb_agg alone: an aggregate over no rows is null, and a
  -- console whose log is younger than the window must still get an empty
  -- array. The picker parses this with z.array(), which would throw otherwise.
  return v_out;
end;
$$;

-- Supabase's default privileges auto-grant EXECUTE on a new public-schema
-- function to anon, authenticated and service_role alike, so all three are
-- named here even though authenticated is the one granted back below. A missing
-- revoke is a silent grant to anon. service_role in particular must not hold
-- it: this function reads console.current_member() out of the request claims,
-- and a service-role caller has none.
revoke all on function public.console_audit_actors(timestamptz, timestamptz, text)
from public, anon, authenticated, service_role;

grant execute on function public.console_audit_actors(timestamptz, timestamptz, text)
to authenticated;
