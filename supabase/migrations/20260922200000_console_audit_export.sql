-- Exporting the audit log (module 14, AuditLog.dc.html:90 and :232-251).
--
-- This is the read side's one *action*. Every other function in 2d-2b only
-- reads; this one reads in bulk, spends a per-action tap and writes its own
-- audit row -- and all three happen inside this single transaction, which is
-- the whole reason it is here rather than in the route. console.use_tap
-- re-digests the four fields from its own arguments (spec §D step 5), so a
-- route that spent a tap and then separately assembled a CSV would have spent
-- it on something nobody approved.
--
-- WHY IT CANNOT GO THROUGH public.console_audit. That function clamps p_limit
-- to 200 (20260922140100_console_audit_environment.sql), so paging an export
-- through it would hand a member 200 rows under a caption promising the
-- filtered set -- and every page would need a tap of its own.
--
-- THE FOUR DIGEST FIELDS, and why they identify one export and no other:
--
--   action  'Exported the audit log' -- a constant, so a tap taken for a role
--           change or a key removal can never be spent here.
--   target  p_range  -- the half-open interval, '<from>/<to>' in ISO 8601 UTC,
--           either side possibly empty. It decides how much personal data
--           leaves the console, so it is the field the member is really
--           approving when the dialog says "Export 14 audit entries from
--           today".
--   value   p_filters -- the other five filters as one canonical JSON object.
--   reason  p_reason -- the words the member typed, trimmed by the one
--           `tapReason` schema (src/console/keys/tap-schema.ts).
--
-- Together they cover every input that changes which rows leave: a tap minted
-- for "today, refused only" digests a different target and a different value
-- than "two years, everything", so console.use_tap finds no challenge for it.
--
-- AND WHY THEY ARE TEXT AND PARSED HERE, rather than seven typed parameters.
-- The digest is taken over strings, at mint time, by console.action_digest --
-- and use_tap re-takes it over whatever this function passes. If this function
-- received `p_from timestamptz` and had to *render* it back into the string the
-- browser had digested, that rendering would be a second implementation of the
-- canonical form, and the day the two drifted every export would fail with "no
-- tap for this action" and nothing would say why (src/console/keys/tap.ts's own
-- note on exactly this hazard). So the two canonical strings arrive verbatim,
-- are handed to use_tap verbatim, and are only ever *parsed* here. Parsing has
-- no second implementation to drift from.
--
-- Both are `text`, like every other parameter here. Never an enum: PostgREST
-- casts an enum argument in the CALLING role's context, before security
-- definer applies, and authenticated has no usage on schema console -- a whole
-- migration (20260921000000) exists to undo five of those.

-- AUDIT_EXPORT_MAX. Mirrored as AUDIT_EXPORT_MAX in
-- src/console/audit/filters.ts, where it stops the dialog offering a ceremony
-- the database will refuse; this is the boundary, that one is a courtesy.
--
-- It is not a performance guard. An export the route cannot hold in memory
-- would still have spent its tap and still have written an audit row saying it
-- happened -- in a table with no update and no delete, so the log would carry a
-- permanent record of an export nobody ever received. 10 000 rows is past any
-- range this console will produce in two years of retention and keeps the CSV
-- near 4 MB.
create or replace function console.audit_export_max()
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  select 10000;
$$;

revoke all on function console.audit_export_max() from public, anon, authenticated, service_role;

-- The filtered set, as one relation.
--
-- Every predicate below is public.console_audit's own, clause for clause and
-- comment for comment, because "the CSV carries the set the member was looking
-- at" is only true if the two agree exactly. It lives in its own function so
-- the export can count the set before spending a tap and then read it after,
-- without two copies of the predicate drifting apart between the two. A stable
-- SQL function returning setof is inlined by the planner, so the indexes on
-- console.audit_log are used exactly as they are by the list.
--
-- console_audit itself is deliberately NOT rewritten to call this: it is live
-- in production as of today, and a shared predicate bought by changing the
-- shipped reader is a worse trade than a copy the test suite pins. The pgTAP
-- file asserts the two return the same size for the same filters, on real rows,
-- which is the property that actually matters.
create or replace function console.audit_matching(
  p_from        timestamptz,
  p_to          timestamptz,
  p_member      uuid,
  p_category    text,
  p_result      text,
  p_search      text,
  p_environment text
)
returns setof console.audit_log
language sql
stable
security invoker
set search_path = ''
as $$
  select a.*
    from console.audit_log a
   -- Half-open: p_from inclusive, p_to exclusive, so two adjacent ranges
   -- partition a day instead of both claiming the row on the seam.
   where (p_from is null        or a.at >= p_from)
     and (p_to is null          or a.at <  p_to)
     and (p_member is null      or a.actor_id = p_member)
     and (p_category is null    or a.category = p_category)
     -- Plain equality, so an empty string matches nothing rather than meaning
     -- "no filter". It fails closed; callers send null.
     and (p_environment is null or a.environment = p_environment)
     -- result::text = p_result, never p_result::console.audit_result: a
     -- hand-made request naming a result that is not a label would raise a raw
     -- 22P02 "invalid input value for enum", and that developer string would
     -- reach a member unchanged. An unknown result simply matches nothing.
     and (p_result is null      or a.result::text = p_result)
     -- reason and target only, never actor_name: a search that matched the
     -- actor would let someone filtering for a word see who did unrelated
     -- things containing it, and the Member filter is the supported way to ask
     -- that question. coalesce, because `null ilike x` is null and `null or
     -- false` is null -- a row with one of the two set would otherwise fall out
     -- when the other is null.
     --
     -- % and _ are escaped so a member searching for "100%" or "e_ample" gets
     -- what they typed rather than a wildcard. The backslash goes first, or the
     -- escapes added after it would themselves be escaped.
     -- standard_conforming_strings is on, so '\' is one backslash; it is also
     -- LIKE's own default escape character, so no ESCAPE clause is needed.
     and (nullif(btrim(coalesce(p_search, '')), '') is null
          or coalesce(a.target, '') ilike '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
          or coalesce(a.reason, '') ilike '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%');
$$;

revoke all on function console.audit_matching(timestamptz, timestamptz, uuid, text, text, text, text)
from public, anon, authenticated, service_role;

create or replace function public.console_audit_export(
  p_range       text,
  p_filters     text,
  p_reason      text,
  p_environment text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- A floor, not an equality: console.require_role ranks, so Owner and Admin
  -- both pass and Support and Viewer are refused -- which is module 14's own
  -- access, Main.dc.html:293-298.
  v_member  console.members := console.require_role('admin');
  v_filters jsonb;
  v_from    timestamptz;
  v_to      timestamptz;
  v_total   integer;
  v_rows    jsonb;
begin
  -- The two canonical strings, read and never rewritten. A malformed one is a
  -- hand-made request -- src/console/audit/filters.ts cannot produce one -- and
  -- it must come back in the console's own error class rather than as
  -- Postgres's own words about invalid input syntax, which are a developer
  -- string no refusal would translate. The three codes named are exactly what
  -- the two casts below can raise; `when others` would also swallow a
  -- statement timeout and report it as bad input.
  begin
    v_from    := nullif(split_part(p_range, '/', 1), '')::timestamptz;
    v_to      := nullif(split_part(p_range, '/', 2), '')::timestamptz;
    v_filters := p_filters::jsonb;
  exception
    when invalid_datetime_format or invalid_text_representation or datetime_field_overflow then
      raise exception 'the export range or filters could not be read' using errcode = '42501';
  end;

  if v_filters is null or jsonb_typeof(v_filters) <> 'object' then
    raise exception 'the export range or filters could not be read' using errcode = '42501';
  end if;

  -- Both sides open is not a range: it is a count(*) and a CSV over two years
  -- of history. parseAuditFilters normalises that away already; this is the
  -- same rule at the boundary, where a request that never went through it
  -- arrives. One side open is a real choice the Custom range produces -- a
  -- member picking a start and no end -- and is honoured as asked.
  if v_from is null and v_to is null then
    raise exception 'an export needs a date range' using errcode = '42501';
  end if;

  -- Counted BEFORE the tap is spent, the same ordering console_invite_member
  -- uses for its own pre-checks: a call that was always going to be refused
  -- takes neither use_tap's row lock nor its write.
  --
  -- It is NOT what keeps a refused export from costing a member their ceremony.
  -- That is the transaction: every raise below aborts the whole call, so the
  -- update use_tap makes and the row write_audit inserts are undone with it,
  -- whatever order they ran in. Measured, not assumed -- moving this check
  -- after use_tap leaves the pgTAP file entirely green (task-4-report.md).
  --
  -- Which is worth knowing, because it says where the real hazard is: an
  -- exception handler around any of this that swallowed the raise and returned
  -- instead would spend the tap and write the row for an export that never
  -- happened. The `when invalid_datetime_format …` block above is deliberately
  -- the only handler in this function, and it sits before either of them.
  select count(*) into v_total
    from console.audit_matching(
      v_from, v_to,
      (v_filters ->> 'member')::uuid,
      v_filters ->> 'category',
      v_filters ->> 'result',
      v_filters ->> 'search',
      v_filters ->> 'environment');

  if v_total > console.audit_export_max() then
    raise exception 'too many entries to export' using errcode = '42501';
  end if;

  -- The tap, spent here and not in the route: the digest is re-taken from these
  -- very arguments, so the ceremony and the rows that leave are bound to each
  -- other by construction. p_environment is not among them -- it is the
  -- server's own, never a member's choice, exactly as on every other writer.
  perform console.use_tap('Exported the audit log', p_range, p_filters, p_reason);

  -- Same order as the list, tie-break included: `at` is not a total order --
  -- rows written in one transaction share it to the microsecond -- so without
  -- `id desc` two exports of the same range could put the same rows in
  -- different orders. coalesce, because an aggregate over no rows is null and
  -- an export that matched nothing is still an empty array.
  select coalesce(jsonb_agg(console.audit_row(a) order by a.at desc, a.id desc), '[]'::jsonb)
    into v_rows
    from console.audit_matching(
      v_from, v_to,
      (v_filters ->> 'member')::uuid,
      v_filters ->> 'category',
      v_filters ->> 'result',
      v_filters ->> 'search',
      v_filters ->> 'environment') a;

  -- The export's own row, through console.write_audit like every other console
  -- action -- the one write this phase's append-only constraint allows. `after`
  -- carries what was taken and under what: a later reader can tell a one-day
  -- review from a two-year sweep without any other record existing.
  -- `p_reason` goes in raw and console.write_audit scrubs it, as it does for
  -- every writer; scrubbing it here instead would mean digesting one string and
  -- recording another.
  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role,
    null, null, 'record', 'Exported the audit log', 'Audit log', p_reason, 'done', null,
    null, jsonb_build_object('count', v_total, 'range', p_range, 'filters', v_filters)
  );

  return jsonb_build_object('rows', v_rows, 'count', v_total);
end;
$$;

-- Supabase's default privileges auto-grant EXECUTE on a new public-schema
-- function to anon, authenticated and service_role alike, so all three are
-- revoked before authenticated is granted back. service_role in particular must
-- not hold it: this function reads console.current_member() out of the request
-- claims, and a service-role caller has none.
revoke all on function public.console_audit_export(text, text, text, text)
from public, anon, authenticated, service_role;

grant execute on function public.console_audit_export(text, text, text, text)
to authenticated;
