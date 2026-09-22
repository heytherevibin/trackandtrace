-- Reading the audit log: the list behind module 14's table, and the one entry
-- behind its drawer. Reads and nothing else. The log is append-only
-- (20260920090300_console_audit.sql), and no function in this file inserts,
-- updates or deletes a row in it -- an INSERT would pass the update and delete
-- triggers untouched, so "read only" is a property of this file, not something
-- the table can enforce on it.
--
-- Every parameter is timestamptz, uuid, text or integer, never an enum:
-- PostgREST casts an enum argument in the CALLING role's context, before
-- security definer applies, and authenticated has no usage on schema console,
-- so such a call dies with "permission denied for schema console" before the
-- body ever runs (20260921000000_console_enum_args_as_text.sql). category and
-- result cross as text and are compared as text inside.

-- The shape of a row, in one place, so the table and the drawer can never
-- disagree about what an entry is. Takes the whole row as console.audit_log --
-- a composite type, not an enum, and never crossing PostgREST, so the rule
-- above does not apply to it.
--
-- STABLE, not IMMUTABLE: to_jsonb(timestamptz) renders through the session's
-- TimeZone, so the same row can serialise differently in two sessions. (On
-- this stack that setting is UTC and no Supabase role overrides it, so `at`
-- arrives as 2019-03-14T02:00:00+00:00 -- an offset, never a Z, and with the
-- fractional part present only when the row has one.)
--
-- environment is deliberately not among the fifteen: the brief's row list
-- omits it, and the console reads one database per environment.
create or replace function console.audit_row(p_row console.audit_log)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id',            p_row.id,
    'at',            p_row.at,
    'actor_id',      p_row.actor_id,
    'actor_name',    p_row.actor_name,
    'actor_role',    p_row.actor_role,
    'key_id',        p_row.key_id,
    'session_label', p_row.session_label,
    'category',      p_row.category,
    'action',        p_row.action,
    'target',        p_row.target,
    'reason',        p_row.reason,
    'result',        p_row.result,
    'address_hash',  p_row.address_hash,
    'before',        p_row.before,
    'after',         p_row.after
  );
$$;

revoke all on function console.audit_row(console.audit_log) from public, anon, authenticated, service_role;

-- A page of the log, and the size of the set it was cut from.
--
-- console.require_role('admin') is a floor, not an equality: it compares
-- console.role_rank, so Owner and Admin both pass and Support and Viewer are
-- refused with 'no access' -- which is what the sheet's own access map gives
-- module 14. Passing 'owner' would lock Admins out of a module they have.
--
-- Not STABLE, though it only reads: console.require_role -> current_member
-- moves the session's last_seen_at, and a non-volatile function may not UPDATE.
--
-- Defaults on every parameter so a caller that does not filter may simply omit
-- the argument; null means "no filter" either way.
create or replace function public.console_audit(
  p_from     timestamptz default null,
  p_to       timestamptz default null,
  p_member   uuid        default null,
  p_category text        default null,
  p_result   text        default null,
  p_search   text        default null,
  p_limit    integer     default null,
  p_offset   integer     default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member  console.members := console.require_role('admin');
  -- A page, never the whole log: the table holds two years of history, and a
  -- caller that omits p_limit must not be handed all of it. Clamped rather
  -- than refused -- a page size is not something to raise a developer string
  -- about, and 0 or a negative offset has an obvious meaning.
  v_limit   integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset  integer := greatest(coalesce(p_offset, 0), 0);
  v_search  text    := nullif(btrim(coalesce(p_search, '')), '');
  v_pattern text;
  v_out     jsonb;
begin
  -- % and _ are escaped, so a member searching for "100%" or "e_ample" gets
  -- what they typed rather than a wildcard. The backslash goes first, or the
  -- escapes added after it would themselves be escaped. standard_conforming_
  -- strings is on, so '\' is one backslash and '\\' is two, which is exactly
  -- what this needs; '\' is also LIKE's own default escape character, so no
  -- ESCAPE clause is required below.
  v_pattern := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with filtered as (
    select a.id, a.at
      from console.audit_log a
     -- Half-open: p_from inclusive, p_to exclusive, so two adjacent ranges
     -- partition a day instead of both claiming the row on the seam.
     where (p_from is null     or a.at >= p_from)
       and (p_to is null       or a.at <  p_to)
       and (p_member is null   or a.actor_id = p_member)
       and (p_category is null or a.category = p_category)
       -- result::text = p_result, never p_result::console.audit_result: a
       -- hand-made request naming a result that is not a label would raise a
       -- raw 22P02 "invalid input value for enum", and that developer string
       -- would reach a member unchanged. An unknown result simply matches
       -- nothing.
       and (p_result is null   or a.result::text = p_result)
       -- reason and target only, never actor_name: a search that matched the
       -- actor would let someone filtering for a word see who did unrelated
       -- things containing it, and the Member filter is the supported way to
       -- ask that question. coalesce, because `null ilike x` is null and
       -- `null or false` is null -- a row with one of the two set would
       -- otherwise fall out when the other is null.
       and (v_search is null
            or coalesce(a.target, '') ilike v_pattern
            or coalesce(a.reason, '') ilike v_pattern)
  ),
  -- The sheet draws Time desc and its caption says "newest first", but `at` is
  -- not a total order: rows written in one transaction share it to the
  -- microsecond, and Postgres may return equal rows in any order it likes --
  -- so a page boundary that fell inside such a run could drop a row or repeat
  -- one. id is the tie-break: arbitrary (the column is a random uuid) but
  -- stable, which is what paging needs, and the primary key, so it is never
  -- null and never duplicated.
  page as (
    select id, at
      from filtered
     order by at desc, id desc
     limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(console.audit_row(a) order by a.at desc, a.id desc)
        from page p
        join console.audit_log a on a.id = p.id
    ), '[]'::jsonb),
    -- The filtered set, not the page: a filter that narrows 200 rows to 3
    -- returns 3, whatever p_limit was. Counted from the same CTE the page was
    -- cut from, so the two can never describe different sets.
    'total', (select count(*)::integer from filtered)
  ) into v_out;

  return v_out;
end;
$$;

-- One entry, or null when there is no such row. Same floor as the list: the
-- drawer opens on a row the list handed over, and a member who may not read
-- the list may not read one of its rows by guessing an id either.
create or replace function public.console_audit_entry(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member console.members := console.require_role('admin');
  v_out    jsonb;
begin
  select console.audit_row(a) into v_out
    from console.audit_log a
   where a.id = p_id;

  -- SELECT INTO leaves v_out null when nothing matched, which is the answer:
  -- an entry that is not there is not an error, and a member who followed a
  -- stale link gets an empty drawer rather than a refusal to translate.
  return v_out;
end;
$$;

-- Supabase's default privileges auto-grant EXECUTE on a new public-schema
-- function to anon, authenticated and service_role alike, so all three are
-- named here even though authenticated is the one granted back below.
revoke all on function
  public.console_audit(timestamptz, timestamptz, uuid, text, text, text, integer, integer),
  public.console_audit_entry(uuid)
from public, anon, authenticated, service_role;

grant execute on function
  public.console_audit(timestamptz, timestamptz, uuid, text, text, text, integer, integer),
  public.console_audit_entry(uuid)
to authenticated;
