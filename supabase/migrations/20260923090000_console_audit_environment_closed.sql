-- The export's own record, made findable and made approved.
--
-- THE HOLE. `console.audit_log.environment` was checked for length alone
-- (20260920090300_console_audit.sql:18) and `console.use_tap` digests four
-- fields, none of which was `p_environment`
-- (20260922200000_console_audit_export.sql). Every public.console_* function is
-- granted to `authenticated` and re-checks the role itself, precisely because
-- members reach PostgREST directly -- so an Admin could take a tap the console's
-- own dialog minted for them and spend it with `p_environment => 'Production'`.
-- Capital P. Measured on the local stack: all five production rows left, and the
-- row recording it was written under a value that NO value the Environment
-- picker offers will ever match (src/console/audit/filter-bar.tsx). Only
-- clearing the filter to "All" showed it.
--
-- No data boundary was crossed -- the actor was entitled to every row they took.
-- What was defeated is the record of the taking, by the person who did it, for
-- the most concentrated personal data in this product.
--
-- TWO HALVES. BOTH ARE NECESSARY -- BUT NOT, AS AN EARLIER DRAFT OF THIS
-- COMMENT CLAIMED, BOTH ON THIS PATH.
--
--   The digest, further down, is what closes the export. It stops the
--   deployment being chosen after the ceremony, and it is load-bearing on its
--   own: remove it and a tap minted honestly for this deployment can be spent
--   to file the record under another. Measured.
--
--   The closed set, below, does NOT close the export. Drop it and leave the
--   digest, and every forgery still bounces off console_audit_export's own
--   `not in` clause -- which a reviewer demonstrated after the first version of
--   this comment asserted otherwise. Stating it wrongly here was worse than not
--   stating it: the next person inherits a comment as fact.
--
--   What the closed set is for is EVERY OTHER WRITER. Ten member-callable
--   public.console_* functions take a p_environment that nothing digests and
--   write an audit row under it: console_change_role, console_invite_member,
--   console_remove_key, console_remove_member, console_rename_key,
--   console_resend_invite, console_reset_keys, console_revoke_invite,
--   console_save_settings and console_sign_out_others. Every one of them is the
--   same evasion with a different verb -- change a role, file the record under
--   'Production' -- and this constraint is the only thing standing in front of
--   all ten. It is the broader fix, not the narrower one.
--
-- A third change, in the reader, closes the last of it: the Environment filter
-- is now drawn as a chip even at its default, so "no export rows" can never be
-- silently "no export rows in production" (src/console/audit/filter-bar.tsx).

-- Legible before it is enforced. A bare ADD CONSTRAINT on a live table reports
-- "violates check constraint" and names no row; this names the values, so the
-- person running the migration learns what is in their table rather than that
-- something is.
do $$
declare
  v_bad text;
begin
  select string_agg(distinct format('%L (%s rows)', environment, n), ', ')
    into v_bad
    from (select environment, count(*) as n from console.audit_log
           where environment not in ('production', 'preview', 'development')
           group by environment) t;
  if v_bad is not null then
    raise exception 'console.audit_log holds environments outside the closed set: %', v_bad
      using hint = 'The audit log is append-only, so these rows cannot be corrected. Widen the constraint to include them, or establish how they were written.';
  end if;
end;
$$;

-- NOT VALID here, and VALIDATE in the migration that follows this one --
-- 20260923090100. The split is the whole point and it is not tidiness: the
-- runner wraps each migration FILE in one transaction, so the two statements
-- together held ACCESS EXCLUSIVE across the scan and a concurrent console write
-- blocked on it. Measured both ways, twice:
--
--   one file   txid 1454 for both statements; a concurrent insert died with
--              "canceling statement due to lock timeout"
--   two files  txid 1456 and 1457; the same insert returned normally
--
-- So: this statement takes ACCESS EXCLUSIVE just long enough to record the
-- constraint, and binds every new row from that instant. The scan next door
-- takes only SHARE UPDATE EXCLUSIVE, and the console keeps writing history
-- while it runs.
--
-- On a table one day old the difference is nothing. The reason to get it right
-- is that this is a shape someone will copy onto a table where it is
-- everything -- and they will copy the comment with it.
--
-- 'test' is deliberately NOT in the set. NODE_ENV is 'test' under vitest, and
-- nothing under vitest reaches a real database -- every integration test mocks
-- the client. Admitting it would admit a value the Environment picker does not
-- offer, which is the whole defect this constraint exists to close.
alter table console.audit_log
  add constraint console_audit_log_environment_known
  check (environment in ('production', 'preview', 'development')) not valid;


-- The export, with the deployment inside the digest.
--
-- The signature does not change: `p_environment` stays where every other console
-- writer has it, and the route still sends `consoleEnvironment()`. What changes
-- is that the canonical filter object now carries a `deployment` key
-- (src/console/audit/filters.ts's `auditExportFilters`), so `console.use_tap`'s
-- re-digest of `p_filters` covers it -- and this function refuses unless the two
-- agree.
--
-- Why the value travels inside `p_filters` rather than as a fifth digested
-- field: `console.action_digest` takes exactly four and all four are spoken for.
-- And why it is only ever PARSED here, never rebuilt: the digest is taken over
-- the string the browser sent, so any rendering of it on this side would be a
-- second implementation of the canonical form, and the day the two drifted every
-- export would fail with "no tap for this action" and nothing would say why
-- (src/console/keys/tap.ts's own note).
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
  v_member     console.members := console.require_role('admin');
  v_filters    jsonb;
  v_deployment text;
  v_from       timestamptz;
  v_to         timestamptz;
  -- The set as it was when the cap was checked, and the set that actually left.
  -- They are two snapshots; see where v_total is assigned for why only one of
  -- them may be recorded.
  v_estimate   integer;
  v_total      integer;
  v_rows       jsonb;
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

  -- The deployment this export will be recorded against, taken from the digested
  -- object and checked twice: that it is a deployment this console can be, and
  -- that it is the one the caller also passed. The second check is what makes
  -- `p_environment` honest -- it is the argument the audit row is written from,
  -- and nothing digests it, so it may only be the value the ceremony already
  -- covered. The column's own constraint refuses anything else regardless, but
  -- a constraint violation is a developer string; this is the refusal a member
  -- could be shown.
  v_deployment := v_filters ->> 'deployment';
  if v_deployment is null or v_deployment <> p_environment
     or v_deployment not in ('production', 'preview', 'development') then
    raise exception 'the export names a deployment this console is not' using errcode = '42501';
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
  select count(*) into v_estimate
    from console.audit_matching(
      v_from, v_to,
      (v_filters ->> 'member')::uuid,
      v_filters ->> 'category',
      v_filters ->> 'result',
      v_filters ->> 'search',
      v_filters ->> 'environment');

  if v_estimate > console.audit_export_max() then
    raise exception 'too many entries to export' using errcode = '42501';
  end if;

  -- The tap, spent here and not in the route: the digest is re-taken from these
  -- very arguments, so the ceremony and the rows that leave -- and now the
  -- deployment the record is filed under -- are bound to each other by
  -- construction.
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

  -- The count comes from the rows that actually left, never from the count above
  -- it. READ COMMITTED gives each statement its own snapshot, so a row another
  -- transaction commits between the two is in one and not the other -- and this
  -- number is what the audit row records and what the member is told. A record
  -- of an export must describe the export, not a set that was true a moment
  -- before it.
  --
  -- The cap keeps the earlier count, deliberately: it is a guard, not a fact,
  -- and its whole job is to refuse before the bulk read happens. A concurrent
  -- insert can carry the real total a few rows past it; on a console where
  -- every writer is a person pressing a button, a few rows past 10 000 is not
  -- a number worth a second scan to be exact about.
  v_total := jsonb_array_length(v_rows);

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

-- CREATE OR REPLACE keeps the grants the function already had; they are restated
-- so this file says what the function's access is rather than leaving it to be
-- read three migrations back.
revoke all on function public.console_audit_export(text, text, text, text)
from public, anon, authenticated, service_role;

grant execute on function public.console_audit_export(text, text, text, text)
to authenticated;
