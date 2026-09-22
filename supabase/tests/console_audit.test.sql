begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

select has_table('console', 'audit_log', 'the audit log exists');

-- The enum must carry exactly these labels.
select enum_has_labels('console', 'audit_result', array['done', 'refused', 'failed'], 'every audit result the plan names');

-- These three are internal-only -- called only from within other
-- security-definer functions or by trigger machinery in this schema -- and
-- must lose the default PUBLIC EXECUTE a fresh function is created with, the
-- same as every other console.* function already does.
select is(has_function_privilege('service_role', 'console.scrub(text)', 'execute')::text, 'false', 'service_role cannot call the scrubber directly');
select is(has_function_privilege('authenticated', 'console.scrub(text)', 'execute')::text, 'false', 'authenticated cannot call the scrubber directly');
select is(has_function_privilege('anon', 'console.scrub(text)', 'execute')::text, 'false', 'anon cannot call the scrubber directly');

select is(has_function_privilege('service_role', 'console.audit_refuse_update()', 'execute')::text, 'false', 'service_role cannot call the update-refusal trigger function directly');
select is(has_function_privilege('authenticated', 'console.audit_refuse_update()', 'execute')::text, 'false', 'authenticated cannot call the update-refusal trigger function directly');
select is(has_function_privilege('anon', 'console.audit_refuse_update()', 'execute')::text, 'false', 'anon cannot call the update-refusal trigger function directly');

select is(has_function_privilege('service_role', 'console.audit_only_purge_old()', 'execute')::text, 'false', 'service_role cannot call the purge-guard trigger function directly');
select is(has_function_privilege('authenticated', 'console.audit_only_purge_old()', 'execute')::text, 'false', 'authenticated cannot call the purge-guard trigger function directly');
select is(has_function_privilege('anon', 'console.audit_only_purge_old()', 'execute')::text, 'false', 'anon cannot call the purge-guard trigger function directly');

-- All three indexes the migration creates.
select has_index('console', 'audit_log', 'console_audit_at_idx', 'the at index exists');
select has_index('console', 'audit_log', 'console_audit_category_idx', 'the category index exists');
select has_index('console', 'audit_log', 'console_audit_actor_idx', 'the actor index exists');

-- An audit row that can't say what happened or how it ended is not an audit row.
select col_not_null('console', 'audit_log', 'environment', 'a row always names its environment');
select col_not_null('console', 'audit_log', 'actor_name', 'a row always names its actor');
select col_not_null('console', 'audit_log', 'category', 'a row always has a category');
select col_not_null('console', 'audit_log', 'action', 'a row always has an action');
select col_not_null('console', 'audit_log', 'result', 'a row always has a result');

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in');
insert into console.members (user_id, email, name, role, status)
values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in', 'Owner', 'owner', 'active');

-- A reason never keeps a PNR, an address or an IP.
select is(
  console.scrub('PNR 2345678901 for asha@example.com from 203.0.113.9'),
  'PNR [removed] for [removed] from [removed]',
  'the scrubber removes PNR-like runs, addresses and IPs'
);
select is(console.scrub(null), '', 'a missing reason scrubs to nothing');
select is(
  console.scrub('reach me at 2001:db8::1 instead'),
  'reach me at [removed] instead',
  'the scrubber removes IPv6 addresses too'
);

-- Email must be taken before digit runs, or a long-digit local part is
-- swallowed first and the domain leaks.
select is(
  console.scrub('contact 2345678901@example.com for help'),
  'contact [removed] for help',
  'an address whose local part is a long digit run goes whole'
);
select is(
  console.scrub('ops@trakline123.in'),
  '[removed]',
  'an address with digits in its domain goes whole'
);
select is(
  console.scrub('booked on 2026-09-20'),
  'booked on 2026-09-20',
  'a date is not a PNR'
);

select console.write_audit(
  'development', '11111111-1111-1111-1111-111111111111', 'Owner', 'owner',
  null, 'Chrome on macOS', 'team', 'Role changed', 'asha@trakline.in',
  'because 2345678901 asked', 'done', 'hash', '{"role":"viewer"}'::jsonb, '{"role":"support"}'::jsonb
) as written;

select is(
  (select count(*) from console.audit_log
     where actor_id = '11111111-1111-1111-1111-111111111111'
       and action = 'Role changed'
       and target = 'asha@trakline.in')::int,
  1,
  'the row landed'
);
select is(
  (select reason from console.audit_log
     where actor_id = '11111111-1111-1111-1111-111111111111'
       and action = 'Role changed'
       and target = 'asha@trakline.in'),
  'because [removed] asked',
  'the stored reason is scrubbed again in SQL'
);
-- Scoped to the row this file wrote, like the two assertions above it. `limit 1` over the whole
-- table reads whichever row Postgres hands back first, which is this test's only while nothing else
-- has ever been written -- and `console.audit_log` is the one table in this schema that deliberately
-- outlives its subjects and is never cleared between runs (tests/e2e/console-auth/fixtures.ts's own
-- note on why resetConsole leaves it alone). The seventh instance of that mistake on this branch.
select is(
  (select result from console.audit_log
     where actor_id = '11111111-1111-1111-1111-111111111111'
       and action = 'Role changed'
       and target = 'asha@trakline.in')::text,
  'done',
  'the result is kept'
);

-- Append-only: nothing may change or remove a row.
select throws_ok(
  $$update console.audit_log set reason = 'edited'$$,
  '42501',
  null,
  'the audit log refuses updates'
);
select throws_ok(
  $$delete from console.audit_log$$,
  '42501',
  null,
  'the audit log refuses deletes'
);

-- Only purge_audit removes rows, and only old ones.
select is(console.purge_audit(), 0, 'nothing is old enough to purge yet');

insert into console.audit_log (at, environment, actor_name, category, action, result)
values (now() - interval '1 week', 'development', 'System', 'system', 'Recent thing', 'done');

insert into console.audit_log (at, environment, actor_name, category, action, result)
values (now() - interval '3 years', 'development', 'System', 'system', 'Old thing', 'done');

select is(console.purge_audit(), 1, 'a three-year-old row is purged');
select is(
  (select count(*) from console.audit_log where action = 'Recent thing')::int,
  1,
  'a row from last week survives the purge'
);

-- The age rule lives in the trigger, not just in purge_audit()'s own WHERE
-- clause: neither the flag nor age is enough alone, only both together.
insert into console.audit_log (at, environment, actor_name, category, action, result)
values (now() - interval '3 years', 'development', 'System', 'system', 'Another old thing', 'done');

select set_config('console.purging', 'on', true);
select throws_ok(
  $$delete from console.audit_log where action = 'Recent thing'$$,
  '42501',
  null,
  'purging alone does not excuse deleting a row that is not old enough'
);
select set_config('console.purging', 'off', true);

select throws_ok(
  $$delete from console.audit_log where action = 'Another old thing'$$,
  '42501',
  null,
  'age alone does not excuse deleting a row without purging set'
);

-- The log outlives the member: no foreign key, so deleting the member never
-- touches the row, and the actor_id it recorded does not change.
select lives_ok(
  $$delete from auth.users where id = '11111111-1111-1111-1111-111111111111'$$,
  'a member with audit history can still be deleted'
);
select is(
  (select actor_id from console.audit_log where action = 'Role changed')::text,
  '11111111-1111-1111-1111-111111111111',
  'the recorded actor_id survives the member it once named'
);

-- A BEFORE DELETE row trigger never fires on TRUNCATE, and TRUNCATE succeeds
-- as postgres -- exactly the role the Supabase SQL editor runs as -- even
-- with every application role already shut out by the missing schema USAGE.
-- Placed last: unlike a row-scoped DELETE, a TRUNCATE that is not refused
-- empties the whole table, and no earlier assertion above may be left to
-- depend on rows still being there.
select throws_ok(
  $$truncate console.audit_log$$,
  '42501',
  null,
  'the audit log refuses truncate too, not only row-level updates and deletes'
);

select * from finish();
rollback;
