-- environment, on the way out and as a filter. Supersedes the two functions in
-- 20260922140000_console_audit_read.sql, whose row shape left the column off
-- and whose list had no way to ask for one environment.
--
-- The column was always there (console.audit_log.environment is NOT NULL, set
-- from consoleEnvironment() = VERCEL_ENV ?? NODE_ENV, so 'production',
-- 'preview' or 'development'), and the first cut returned every row regardless
-- of it while telling the reader nothing about which it came from. A preview
-- deployment pointed at the production database writes rows that the console
-- then showed as if they were production's own. A log that quietly mixes them
-- is a log that lies.
--
-- Display is the half that is not negotiable; the filter is a convenience.
-- Hard-scoping the read to the caller's own environment was the other option
-- and is wrong: "did a preview deployment write to production?" is answerable
-- only from preview rows, so scoping would delete the evidence of the exact
-- incident the rule was meant to catch.

-- Sixteen keys now. Both the list and the entry read the shape from here, so
-- adding it in one place is all this takes for the drawer as well.
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
    'environment',   p_row.environment,
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

-- A parameter cannot be added by CREATE OR REPLACE -- a different argument list
-- is a different function -- so the eight-argument version is dropped rather
-- than left standing as an overload that would keep the old row shape alive and
-- make a positional call ambiguous. Same reason and same shape as
-- 20260921000000_console_enum_args_as_text.sql:19.
drop function if exists public.console_audit(timestamptz, timestamptz, uuid, text, text, text, integer, integer);

-- As before, plus p_environment. Nullable like every other filter: a reader's
-- contract here is "null means no filter" across all nine parameters, and a
-- mandatory argument would break both that contract and the all-optional
-- generated Args type. The route defaults it to consoleEnvironment() and lets
-- the member clear it.
--
-- p_environment is a CONVENIENCE, NOT A BOUNDARY. A member picks it and a
-- member can forge it, exactly as on the writers -- nothing here treats it as
-- isolation, and nothing built on top of it may either. What keeps one console
-- out of another's history is the database it is pointed at, not this argument.
create or replace function public.console_audit(
  p_from        timestamptz default null,
  p_to          timestamptz default null,
  p_member      uuid        default null,
  p_category    text        default null,
  p_result      text        default null,
  p_search      text        default null,
  p_environment text        default null,
  p_limit       integer     default null,
  p_offset      integer     default null
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
     where (p_from is null        or a.at >= p_from)
       and (p_to is null          or a.at <  p_to)
       and (p_member is null      or a.actor_id = p_member)
       and (p_category is null    or a.category = p_category)
       -- Plain equality, and an empty string therefore matches nothing rather
       -- than meaning "no filter" -- unlike p_search below, which normalises
       -- '' away. It fails closed, so a caller that sends '' by accident sees
       -- an empty page rather than more than it asked for. Callers send null.
       and (p_environment is null or a.environment = p_environment)
       -- result::text = p_result, never p_result::console.audit_result: a
       -- hand-made request naming a result that is not a label would raise a
       -- raw 22P02 "invalid input value for enum", and that developer string
       -- would reach a member unchanged. An unknown result simply matches
       -- nothing.
       and (p_result is null      or a.result::text = p_result)
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
    -- coalesce, not jsonb_agg alone: an aggregate over no rows is null, and a
    -- page that matched nothing must still be an empty array. Task 2 parses
    -- this with z.array(), which would throw on the first search that matched
    -- nothing -- an ordinary thing for a member to do.
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

-- console_audit_entry is untouched: it reads its shape from console.audit_row,
-- so it gains environment with no change of its own, and it is deliberately NOT
-- scoped by environment. Scoping buys nothing on the happy path -- the drawer
-- opens on a row the list just handed over -- and on a shared link it would
-- answer null, an empty drawer with no refusal for anyone to translate.

-- The dropped function took its grants with it; the new one arrives with
-- Supabase's default EXECUTE for anon, authenticated and service_role, so all
-- three are revoked again before authenticated is granted back.
revoke all on function
  public.console_audit(timestamptz, timestamptz, uuid, text, text, text, text, integer, integer)
from public, anon, authenticated, service_role;

grant execute on function
  public.console_audit(timestamptz, timestamptz, uuid, text, text, text, text, integer, integer)
to authenticated;
