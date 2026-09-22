begin;
create extension if not exists pgtap with schema extensions;
select plan(72);

-- The READ side of the audit log (module 14). The write side, the append-only
-- triggers and console.purge_audit are console_audit.test.sql's business and
-- are not repeated here.
--
-- Scoping. console.audit_log holds no foreign keys and survives every reset by
-- design, so a bare count sees every row any run on this machine ever wrote.
-- Every count below is therefore taken through a fixed window on 14 March
-- 2019 -- a day no real console row can occupy, because the console's first row
-- was written in September 2026 -- and pg_temp.audit() pins that window on
-- every call. The three assertions that deliberately leave the window off
-- (the console.write_audit probe at the end) scope themselves by a target
-- string unique to this file instead.

-- Grants: authenticated yes, anon and service_role no, for both. Supabase's
-- default privileges auto-grant EXECUTE on a new public-schema function to all
-- three, so all three are checked, not only the one the revoke names.
select is(has_function_privilege('authenticated', 'public.console_audit(timestamptz, timestamptz, uuid, text, text, text, integer, integer)', 'execute')::text, 'true', 'a member can read the audit log');
select is(has_function_privilege('anon', 'public.console_audit(timestamptz, timestamptz, uuid, text, text, text, integer, integer)', 'execute')::text, 'false', 'anon cannot');
select is(has_function_privilege('service_role', 'public.console_audit(timestamptz, timestamptz, uuid, text, text, text, integer, integer)', 'execute')::text, 'false', 'nor the service role');
select is(has_function_privilege('authenticated', 'public.console_audit_entry(uuid)', 'execute')::text, 'true', 'a member can open one entry');
select is(has_function_privilege('anon', 'public.console_audit_entry(uuid)', 'execute')::text, 'false', 'anon cannot');
select is(has_function_privilege('service_role', 'public.console_audit_entry(uuid)', 'execute')::text, 'false', 'nor the service role');

select is(
  (select p.prosecdef from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'console_audit'),
  true,
  'the list runs as definer -- authenticated has no usage on schema console'
);
select is(
  (select p.prosecdef from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'console_audit_entry'),
  true,
  'and so does the entry'
);
select is(
  (select p.proconfig from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'console_audit'),
  array['search_path=""'],
  'the list runs with an empty search_path'
);
select is(
  (select p.proconfig from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'console_audit_entry'),
  array['search_path=""'],
  'and so does the entry'
);

-- Four members, one per role. Meera is 'active', not 'setup': a member in setup
-- is refused by console.current_member with 28000 'session ended' before
-- console.require_role's rank check is ever reached, and the assertions below
-- are about the rank check.
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'asha@trakline.in'),
  ('b0000000-0000-4000-8000-000000000002', 'rohan@trakline.in'),
  ('c0000000-0000-4000-8000-000000000003', 'kiran@trakline.in'),
  ('d0000000-0000-4000-8000-000000000004', 'meera@trakline.in');

insert into console.members (user_id, email, name, role, status) values
  ('a0000000-0000-4000-8000-000000000001', 'asha@trakline.in', 'Asha Rao', 'owner', 'active'),
  ('b0000000-0000-4000-8000-000000000002', 'rohan@trakline.in', 'Rohan Iyer', 'admin', 'active'),
  ('c0000000-0000-4000-8000-000000000003', 'kiran@trakline.in', 'Kiran Das', 'support', 'active'),
  ('d0000000-0000-4000-8000-000000000004', 'meera@trakline.in', 'Meera Nair', 'viewer', 'active');

insert into console.sessions (session_id, member_id, device_label, address_hash, expires_at, key_verified_at) values
  ('a0000000-0000-4000-8000-00000000aaa1', 'a0000000-0000-4000-8000-000000000001', 'Chrome on macOS', 'hash', now() + interval '7 days', now()),
  ('b0000000-0000-4000-8000-00000000bbb2', 'b0000000-0000-4000-8000-000000000002', 'Safari on iPhone', 'hash', now() + interval '7 days', now()),
  ('c0000000-0000-4000-8000-00000000ccc3', 'c0000000-0000-4000-8000-000000000003', 'Firefox on Windows', 'hash', now() + interval '7 days', now()),
  ('d0000000-0000-4000-8000-00000000ddd4', 'd0000000-0000-4000-8000-000000000004', 'Edge on Windows', 'hash', now() + interval '7 days', now());

-- Seventeen entries on one day, drawn from AuditLog.dc.html's own sample table
-- so the fixture carries the categories, actions, targets and results the
-- module really draws -- including the System row, whose actor_id, actor_role,
-- key_id, session_label and address_hash are all null, and whose category
-- ('system') is outside the six ConsoleAuditRow names in src/console/auth/audit.ts.
-- Reasons are stored here exactly as console.write_audit would have left them
-- (already scrubbed, never raw); the probe at the end of this file proves that
-- claim against the real writer rather than assuming it.
--
-- The three 11:00:00 rows share a timestamp to the microsecond, which is what a
-- console action writing more than one row in one transaction produces. They
-- are the paging tie-break's fixture, and they carry fixed ids because the
-- tie-break is decided on id.
insert into console.audit_log
  (id, at, environment, actor_id, actor_name, actor_role, key_id, session_label, category, action, target, reason, result, address_hash, before, after)
values
  ('5a000000-0000-4000-8000-000000000001', '2019-03-14 02:00:00+00', 'production', null, 'System', null, null, null,
   'system', 'Purged unconfirmed sign-ups', '12 records', 'Retention rule: 7 days.', 'done', null, null, null),
  (gen_random_uuid(), '2019-03-14 06:00:00+00', 'production', 'b0000000-0000-4000-8000-000000000002', 'Rohan Iyer', 'admin', null, 'Safari on iPhone',
   'configure', 'Changed a switch', 'Live budget', 'Raised the daily cap to 100% of plan.', 'done', '51cd…07aa', null, null),
  (gen_random_uuid(), '2019-03-14 07:55:00+00', 'production', 'b0000000-0000-4000-8000-000000000002', 'Rohan Iyer', 'admin', null, 'Safari on iPhone',
   'messages', 'Posted an incident', 'Slow PNR checks', null, 'done', '51cd…07aa', null, null),
  (gen_random_uuid(), '2019-03-14 08:30:00+00', 'production', 'a0000000-0000-4000-8000-000000000001', 'Asha Rao', 'owner', null, 'Chrome on macOS',
   'configure', 'Blocked an address', '9c41…d2e7', 'Scripted checks from one network.', 'done', 'a3f9…c2c1', null, null),
  (gen_random_uuid(), '2019-03-14 09:12:00+00', 'production', 'b0000000-0000-4000-8000-000000000002', 'Rohan Iyer', 'admin', null, 'Safari on iPhone',
   'configure', 'Resumed PNR checks', 'PNR checks', 'Provider back after the night outage.', 'done', '51cd…07aa', null, null),
  (gen_random_uuid(), '2019-03-14 09:40:00+00', 'production', 'd0000000-0000-4000-8000-000000000004', 'Meera Nair', 'viewer', null, 'Edge on Windows',
   'session', 'Opened the audit log', 'Audit log', null, 'refused', 'e18a…3b56', null, null),
  (gen_random_uuid(), '2019-03-14 10:05:00+00', 'production', 'a0000000-0000-4000-8000-000000000001', 'Asha Rao', 'owner', null, 'Chrome on macOS',
   'provider_keys', 'Added a provider key', 'RailKit key •••• 4F2A', 'Rotated after the plan renewal.', 'done', 'a3f9…c2c1', null, null),
  (gen_random_uuid(), '2019-03-14 10:32:00+00', 'production', 'a0000000-0000-4000-8000-000000000001', 'Asha Rao', 'owner', null, 'Chrome on macOS',
   'team', 'Changed a role', 'Kiran Das', 'Moved to Support for the privacy queue.', 'done', 'a3f9…c2c1',
   '{"role": "viewer"}'::jsonb, '{"role": "support"}'::jsonb),
  ('7a000000-0000-4000-8000-000000000001', '2019-03-14 11:00:00+00', 'production', 'a0000000-0000-4000-8000-000000000001', 'Asha Rao', 'owner', null, 'Chrome on macOS',
   'team', 'Invited a member', 'tie-a@trakline.in', 'Read-only access for the weekly numbers.', 'done', 'a3f9…c2c1', null, '{"role": "viewer"}'::jsonb),
  ('7a000000-0000-4000-8000-000000000002', '2019-03-14 11:00:00+00', 'production', 'a0000000-0000-4000-8000-000000000001', 'Asha Rao', 'owner', null, 'Chrome on macOS',
   'team', 'Invited a member', 'tie-b@trakline.in', 'Read-only access for the weekly numbers.', 'done', 'a3f9…c2c1', null, '{"role": "viewer"}'::jsonb),
  ('7a000000-0000-4000-8000-000000000003', '2019-03-14 11:00:00+00', 'production', 'a0000000-0000-4000-8000-000000000001', 'Asha Rao', 'owner', null, 'Chrome on macOS',
   'team', 'Invited a member', 'tie-c@trakline.in', 'Read-only access for the weekly numbers.', 'done', 'a3f9…c2c1', null, '{"role": "viewer"}'::jsonb),
  (gen_random_uuid(), '2019-03-14 11:50:00+00', 'production', 'b0000000-0000-4000-8000-000000000002', 'Rohan Iyer', 'admin',
   'f0000000-0000-4000-8000-00000000000f', 'Safari on iPhone',
   'session', 'Key tap failed', 'Confirm it''s you', null, 'failed', '51cd…07aa', null, null),
  (gen_random_uuid(), '2019-03-14 12:15:00+00', 'production', 'b0000000-0000-4000-8000-000000000002', 'Rohan Iyer', 'admin', null, 'Safari on iPhone',
   'configure', 'Changed a switch', 'Site notice', 'Announce the 21 Sep maintenance window.', 'done', '51cd…07aa', null, null),
  (gen_random_uuid(), '2019-03-14 13:40:00+00', 'production', 'c0000000-0000-4000-8000-000000000003', 'Kiran Das', 'support', null, 'Firefox on Windows',
   'leads', 'Looked up an email', 'r•••@example.com', null, 'done', '7b20…9e04', null, null),
  (gen_random_uuid(), '2019-03-14 13:41:00+00', 'production', 'c0000000-0000-4000-8000-000000000003', 'Kiran Das', 'support', null, 'Firefox on Windows',
   'leads', 'Revealed an email', 'r•••@example.com', 'Replying to privacy request PR-2026-0142.', 'done', '7b20…9e04', null, null),
  (gen_random_uuid(), '2019-03-14 13:58:00+00', 'production', 'a0000000-0000-4000-8000-000000000001', 'Asha Rao', 'owner', null, 'Chrome on macOS',
   'session', 'Signed in', 'Console', null, 'done', 'a3f9…c2c1', null, null),
  ('5a000000-0000-4000-8000-000000000013', '2019-03-14 14:02:31.256374+00', 'production', 'a0000000-0000-4000-8000-000000000001', 'Asha Rao', 'owner', null, 'Chrome on macOS',
   'configure', 'Paused PNR checks', 'PNR checks', 'Provider maintenance window, 14:00–15:00 IST.', 'done', 'a3f9…c2c1',
   '{"pnr_checks": "on"}'::jsonb, '{"pnr_checks": "paused"}'::jsonb);

-- Speaks as a member through the claim alone -- console_* functions read
-- request.jwt.claims, not current_user.
create or replace function pg_temp.speak_as(p_user uuid, p_session uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'session_id', p_session)::text, true);
end;
$$;

-- Every call goes through here, so no assertion in this file can be satisfied
-- by a row another run left behind.
create or replace function pg_temp.audit(
  p_member uuid default null, p_category text default null, p_result text default null,
  p_search text default null, p_limit integer default null, p_offset integer default null
) returns jsonb
language sql as $$
  select public.console_audit(
    '2019-03-14 00:00:00+00', '2019-03-15 00:00:00+00',
    p_member, p_category, p_result, p_search, p_limit, p_offset);
$$;

create or replace function pg_temp.targets(p_page jsonb) returns text[]
language sql as $$
  select array_agg(r ->> 'target' order by n)
    from jsonb_array_elements(p_page -> 'rows') with ordinality as t(r, n);
$$;

-- The floor is a floor, not an equality: console.require_role('admin') compares
-- console.role_rank, so Owner and Admin both pass and Support and Viewer do not.
-- Each refusal names console.require_role's own message. Every console refusal
-- raises 42501 -- 'session ended' does not, but a missing member row, a stale
-- session and a wrong role would all be indistinguishable behind a bare
-- `'42501', null`, and the assertion would stop being about the rank check.
select pg_temp.speak_as('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000aaa1');
select is((pg_temp.audit() ->> 'total')::integer, 17, 'an Owner reads the log');
select pg_temp.speak_as('b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-00000000bbb2');
select is((pg_temp.audit() ->> 'total')::integer, 17, 'and so does an Admin -- the floor admits both');
select pg_temp.speak_as('c0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-00000000ccc3');
select throws_ok($$ select pg_temp.audit() $$, '42501', 'no access', 'a Support member cannot read the log');
select throws_ok($$ select public.console_audit_entry('5a000000-0000-4000-8000-000000000001') $$, '42501', 'no access', 'nor open one entry');
select pg_temp.speak_as('d0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-00000000ddd4');
select throws_ok($$ select pg_temp.audit() $$, '42501', 'no access', 'nor can a Viewer read the log');
select throws_ok($$ select public.console_audit_entry('5a000000-0000-4000-8000-000000000001') $$, '42501', 'no access', 'nor open one entry');

select pg_temp.speak_as('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000aaa1');

-- The shape Task 2's schema is written from.
select is(jsonb_typeof(pg_temp.audit() -> 'rows'), 'array', 'rows is an array');
select is(jsonb_typeof(pg_temp.audit() -> 'total'), 'number', 'total is a number, not a string');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.audit() -> 'rows' -> 0) as t(k)),
  array['action', 'actor_id', 'actor_name', 'actor_role', 'address_hash', 'after', 'at', 'before',
        'category', 'id', 'key_id', 'reason', 'result', 'session_label', 'target'],
  'a row carries exactly the fifteen columns the brief names -- and never environment'
);
select is(pg_temp.audit() -> 'rows' -> 0 ->> 'action', 'Paused PNR checks', 'newest first: the 14:02 entry leads the page');

-- The serialised form of a timestamp, pinned exactly. to_jsonb(timestamptz)
-- renders through the session's TimeZone, which is UTC on this stack and
-- unset for every Supabase role, so the offset is +00:00 -- an OFFSET, never a
-- Z. A schema that accepts only Z shipped a production crash last week.
select is(current_setting('TimeZone'), 'UTC', 'the session renders timestamps in UTC -- the two assertions below assume it');
select is(
  public.console_audit_entry('5a000000-0000-4000-8000-000000000001') ->> 'at',
  '2019-03-14T02:00:00+00:00',
  'a whole-second timestamp serialises with a +00:00 offset and no fractional part'
);
select is(
  public.console_audit_entry('5a000000-0000-4000-8000-000000000013') ->> 'at',
  '2019-03-14T14:02:31.256374+00:00',
  'and one with microseconds keeps all six digits, still with the offset'
);
select doesnt_match(
  public.console_audit_entry('5a000000-0000-4000-8000-000000000013') ->> 'at',
  'Z$',
  'no timestamp this module returns ends in Z'
);

-- Null columns. The System row carries five of them, and they must arrive as
-- JSON null rather than the key being dropped -- jsonb_build_object keeps the
-- key, jsonb_strip_nulls would not.
select is(public.console_audit_entry('5a000000-0000-4000-8000-000000000001') -> 'actor_id', 'null'::jsonb, 'a null actor_id is JSON null, not a missing key');
select is(public.console_audit_entry('5a000000-0000-4000-8000-000000000001') -> 'actor_role', 'null'::jsonb, 'and so is a null actor_role');
select is(public.console_audit_entry('5a000000-0000-4000-8000-000000000001') -> 'address_hash', 'null'::jsonb, 'and a null address_hash');
select is(public.console_audit_entry('5a000000-0000-4000-8000-000000000001') -> 'before', 'null'::jsonb, 'and a null before');
select is(
  public.console_audit_entry('5a000000-0000-4000-8000-000000000001') ->> 'category',
  'system',
  'category comes back as free text -- the System row is not one of the six names in ConsoleAuditRow'
);
select is(
  public.console_audit_entry('5a000000-0000-4000-8000-000000000013') -> 'after',
  '{"pnr_checks": "paused"}'::jsonb,
  'before and after come back as objects, not as strings'
);
select is(
  public.console_audit_entry('5a000000-0000-4000-8000-000000000013') ->> 'result',
  'done',
  'an enum column comes back as a plain string'
);

-- Every filter narrows.
select is((pg_temp.audit(p_member => 'a0000000-0000-4000-8000-000000000001') ->> 'total')::integer, 8, 'the member filter narrows to that member''s entries');
select is((pg_temp.audit(p_category => 'configure') ->> 'total')::integer, 5, 'the category filter narrows');
select is((pg_temp.audit(p_result => 'refused') ->> 'total')::integer, 1, 'the result filter narrows to the refused entry');
select is((pg_temp.audit(p_result => 'failed') ->> 'total')::integer, 1, 'and to the failed one');
select is(
  (public.console_audit('2019-03-14 12:00:00+00', '2019-03-15 00:00:00+00') ->> 'total')::integer,
  5,
  'the date range narrows to the afternoon'
);

-- The range is half-open: p_from inclusive, p_to exclusive, so two adjacent
-- ranges partition the day instead of both claiming the row on the seam.
select is((public.console_audit('2019-03-14 02:00:00+00', '2019-03-15 00:00:00+00') ->> 'total')::integer, 17, 'p_from is inclusive -- a row at exactly p_from is in');
select is((public.console_audit('2019-03-14 02:00:00.000001+00', '2019-03-15 00:00:00+00') ->> 'total')::integer, 16, 'and one microsecond later it is out');
select is((public.console_audit('2019-03-14 00:00:00+00', '2019-03-14 14:02:31.256374+00') ->> 'total')::integer, 16, 'p_to is exclusive -- a row at exactly p_to is out');
select is((public.console_audit('2019-03-14 00:00:00+00', '2019-03-14 14:02:31.256375+00') ->> 'total')::integer, 17, 'and one microsecond later it is in');

-- An unknown result is not a member-visible error. Comparing result::text to
-- the argument rather than casting the argument to console.audit_result keeps a
-- hand-made request from raising a raw 22P02 "invalid input value for enum" --
-- a developer string that would reach a member unchanged.
select lives_ok($$ select pg_temp.audit(p_result => 'nonsense') $$, 'an unknown result filter does not raise');
select is((pg_temp.audit(p_result => 'nonsense') ->> 'total')::integer, 0, 'it simply matches nothing');

-- Search matches reason and target, and nothing else. Never actor_name: a
-- search that matched the actor would let someone filtering for a word see who
-- did unrelated things containing it, and the Member filter is the supported
-- way to ask that question.
select is((pg_temp.audit(p_search => 'maintenance') ->> 'total')::integer, 2, 'search matches a reason');
-- Three, not two: 'Slow PNR checks' contains the phrase as well. A substring
-- match is what the sheet's "Search reasons and targets" box promises.
select is((pg_temp.audit(p_search => 'PNR checks') ->> 'total')::integer, 3, 'search matches a target, anywhere inside it');
select is((pg_temp.audit(p_search => 'rohan') ->> 'total')::integer, 0, 'search never matches actor_name -- Rohan acted five times and none come back');
select is((pg_temp.audit(p_search => 'Kiran') ->> 'total')::integer, 1, 'a name that is also a target matches only where it is the target');
select is(
  pg_temp.audit(p_search => 'Kiran') -> 'rows' -> 0 ->> 'action',
  'Changed a role',
  'and the one match is the row Kiran was the target of, not the two rows Kiran wrote'
);
select is((pg_temp.audit(p_search => 'pnr checks') ->> 'total')::integer, 3, 'search ignores case -- the same three come back in lower case');

-- The pattern is escaped, so a member searching for text that happens to
-- contain % or _ gets what they typed rather than a wildcard.
select is((pg_temp.audit(p_search => 'e_ample') ->> 'total')::integer, 0, 'an underscore is a literal underscore, not a single-character wildcard');
select is((pg_temp.audit(p_search => 'example') ->> 'total')::integer, 2, 'while the same search without it still matches both');
select is((pg_temp.audit(p_search => 'cap%plan') ->> 'total')::integer, 0, 'a per-cent sign is a literal per-cent sign, not a wildcard');
select is((pg_temp.audit(p_search => 'cap to 100%') ->> 'total')::integer, 1, 'and it is escaped, not stripped -- the reason that really contains it still matches');

-- Two filters compose, to fewer than either alone.
select is((pg_temp.audit(p_member => 'b0000000-0000-4000-8000-000000000002') ->> 'total')::integer, 5, 'Rohan alone has five entries');
select is(
  (pg_temp.audit(p_member => 'b0000000-0000-4000-8000-000000000002', p_category => 'configure') ->> 'total')::integer,
  3,
  'member and category together narrow further than either on its own'
);

-- total counts the filtered set, not the page and not the whole table.
select is(jsonb_array_length(pg_temp.audit(p_limit => 3) -> 'rows'), 3, 'a page honours p_limit');
select is((pg_temp.audit(p_limit => 3) ->> 'total')::integer, 17, 'and total still counts every filtered row behind it');
select is(jsonb_array_length(pg_temp.audit(p_category => 'configure', p_limit => 2) -> 'rows'), 2, 'a filtered page honours p_limit too');
select is((pg_temp.audit(p_category => 'configure', p_limit => 2) ->> 'total')::integer, 5, 'and total counts the filtered set, not the page');
select is(jsonb_array_length(pg_temp.audit(p_limit => 3, p_offset => 15) -> 'rows'), 2, 'the last page is short');
select is((pg_temp.audit(p_limit => 3, p_offset => 15) ->> 'total')::integer, 17, 'and total does not change with the page');
select is(jsonb_array_length(pg_temp.audit(p_limit => 0) -> 'rows'), 1, 'a p_limit of zero is clamped up to one rather than returning an empty page');
select is(
  pg_temp.audit(p_offset => -5) -> 'rows' -> 0 ->> 'action',
  'Paused PNR checks',
  'a negative p_offset is clamped to zero rather than raising'
);

-- Paging over rows that share a timestamp. `at` alone is not a total order --
-- three of these rows were written in one transaction and share it to the
-- microsecond -- so the sort breaks the tie on id. Without a tie-break these
-- two pages could drop a row or repeat one.
select is(
  pg_temp.targets(pg_temp.audit(p_category => 'team', p_limit => 2, p_offset => 0)),
  array['tie-c@trakline.in', 'tie-b@trakline.in'],
  'the first page of a tied run is ordered by id, descending'
);
select is(
  pg_temp.targets(pg_temp.audit(p_category => 'team', p_limit => 2, p_offset => 2)),
  array['tie-a@trakline.in', 'Kiran Das'],
  'and the second picks up exactly where it left off -- nothing dropped, nothing repeated'
);

-- One entry.
select is(public.console_audit_entry('7a000000-0000-4000-8000-000000000001') ->> 'target', 'tie-a@trakline.in', 'the entry comes back by id');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.console_audit_entry('7a000000-0000-4000-8000-000000000001')) as t(k)),
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.audit() -> 'rows' -> 0) as t(k)),
  'and carries exactly the keys a list row carries'
);
select ok(public.console_audit_entry('00000000-0000-4000-8000-00000000dead') is null, 'an id that is not there comes back as null, not an error');

-- The fixture above is hand-written, so the format it claims is proven here
-- against the writer that really produces these rows. No window: the probe
-- scopes itself by a target no other row in this database carries.
select console.write_audit(
  'development', 'a0000000-0000-4000-8000-000000000001', 'Asha Rao', 'owner',
  null, 'Chrome on macOS', 'team', 'Changed a role', 'audit-read-probe',
  'because 2345678901 asked', 'done', 'a3f9…c2c1',
  '{"role": "viewer"}'::jsonb, '{"role": "support"}'::jsonb
);
select is(
  (public.console_audit(p_search => 'audit-read-probe') ->> 'total')::integer,
  1,
  'a row the real writer wrote is readable through the list'
);
select is(
  public.console_audit(p_search => 'audit-read-probe') -> 'rows' -> 0 ->> 'reason',
  'because [removed] asked',
  'and its reason arrives exactly as console.write_audit stored it -- scrubbed'
);
select is(
  public.console_audit(p_search => 'audit-read-probe') -> 'rows' -> 0 -> 'after',
  '{"role": "support"}'::jsonb,
  'and its after block arrives as an object'
);
select matches(
  public.console_audit(p_search => 'audit-read-probe') -> 'rows' -> 0 ->> 'at',
  '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?[+-][0-9]{2}:[0-9]{2}$',
  'and its timestamp has the same offset shape as the fixture''s'
);

-- Reading is reading. Nothing in this module may add to an append-only table,
-- and the update and delete triggers would not catch an INSERT.
select is(
  (select count(*)::integer from console.audit_log where at >= '2019-03-14 00:00:00+00' and at < '2019-03-15 00:00:00+00'),
  17,
  'reading the audit log, filtered and paged every way above, wrote nothing to it'
);

select * from finish();
rollback;
