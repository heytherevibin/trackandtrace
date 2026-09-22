begin;
create extension if not exists pgtap with schema extensions;
select plan(129);

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
select is(has_function_privilege('authenticated', 'public.console_audit(timestamptz, timestamptz, uuid, text, text, text, text, integer, integer)', 'execute')::text, 'true', 'a member can read the audit log');
select is(has_function_privilege('anon', 'public.console_audit(timestamptz, timestamptz, uuid, text, text, text, text, integer, integer)', 'execute')::text, 'false', 'anon cannot');
select is(has_function_privilege('service_role', 'public.console_audit(timestamptz, timestamptz, uuid, text, text, text, text, integer, integer)', 'execute')::text, 'false', 'nor the service role');
select is(has_function_privilege('authenticated', 'public.console_audit_entry(uuid)', 'execute')::text, 'true', 'a member can open one entry');
select is(has_function_privilege('anon', 'public.console_audit_entry(uuid)', 'execute')::text, 'false', 'anon cannot');
select is(has_function_privilege('service_role', 'public.console_audit_entry(uuid)', 'execute')::text, 'false', 'nor the service role');

-- One console_audit, not two. p_environment could not be added by CREATE OR
-- REPLACE -- a different argument list is a different function -- so
-- 20260922140100 drops the eight-argument version. Left standing it would keep
-- the old fifteen-key row shape alive behind a positional call.
select is(
  (select count(*)::integer from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'console_audit'),
  1,
  'the eight-argument console_audit is gone, not left standing as an overload'
);

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
  -- These two are not 'production'. A preview deployment pointed at the
  -- production database writes rows exactly like the first, and the module has
  -- to be able to say so -- which is the whole of the environment ruling.
  (gen_random_uuid(), '2019-03-14 06:00:00+00', 'preview', 'b0000000-0000-4000-8000-000000000002', 'Rohan Iyer', 'admin', null, 'Safari on iPhone',
   'configure', 'Changed a switch', 'Live budget', 'Raised the daily cap to 100% of plan.', 'done', '51cd…07aa', null, null),
  (gen_random_uuid(), '2019-03-14 07:55:00+00', 'development', 'b0000000-0000-4000-8000-000000000002', 'Rohan Iyer', 'admin', null, 'Safari on iPhone',
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
  p_search text default null, p_environment text default null,
  p_limit integer default null, p_offset integer default null
) returns jsonb
language sql as $$
  select public.console_audit(
    '2019-03-14 00:00:00+00', '2019-03-15 00:00:00+00',
    p_member, p_category, p_result, p_search, p_environment, p_limit, p_offset);
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
        'category', 'environment', 'id', 'key_id', 'reason', 'result', 'session_label', 'target'],
  'a row carries the brief''s fifteen columns and environment -- sixteen'
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

-- environment, the sixteenth key. The first cut of these two functions left it
-- off and still returned every row whatever its value, so a preview
-- deployment's rows were shown as if they were production's own. The entry
-- carries it too -- both read their shape from console.audit_row.
select is(
  public.console_audit_entry('5a000000-0000-4000-8000-000000000001') ->> 'environment',
  'production',
  'an entry names the environment its row was written in'
);
select is(
  pg_temp.audit(p_search => 'Live budget') -> 'rows' -> 0 ->> 'environment',
  'preview',
  'and a row a preview deployment wrote says so, instead of passing for production'
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

-- environment is a filter, never a boundary. Unfiltered, a production Owner
-- sees the preview and development rows too: "did a preview deployment write to
-- production?" is answerable only from preview rows, so hard-scoping the read
-- to the caller's own environment would have deleted the evidence of the one
-- incident the rule was meant to catch. A member picks this argument and a
-- member can forge it; what keeps one console out of another's history is the
-- database it is pointed at.
select is((pg_temp.audit() ->> 'total')::integer, 17, 'unfiltered, every environment comes back -- the log never drops a row silently');
select is((pg_temp.audit(p_environment => 'production') ->> 'total')::integer, 15, 'the environment filter narrows to production');
select is((pg_temp.audit(p_environment => 'preview') ->> 'total')::integer, 1, 'and to preview');
select is((pg_temp.audit(p_environment => 'development') ->> 'total')::integer, 1, 'and to development');

-- An unknown result is not a member-visible error. Comparing result::text to
-- the argument rather than casting the argument to console.audit_result keeps a
-- hand-made request from raising a raw 22P02 "invalid input value for enum" --
-- a developer string that would reach a member unchanged.
select lives_ok($$ select pg_temp.audit(p_result => 'nonsense') $$, 'an unknown result filter does not raise');
select is((pg_temp.audit(p_result => 'nonsense') ->> 'total')::integer, 0, 'it simply matches nothing');

-- An empty string does not mean the same thing to every filter, and that is
-- worth pinning rather than smoothing over. p_search normalises '' (and a run
-- of spaces) away to "no filter"; p_category, p_result and p_environment are
-- plain equalities, so '' matches nothing. Both fail closed -- neither widens a
-- filter the caller did not ask to widen -- so this is a contract to state, not
-- a defect: Task 2 sends null for "no filter" and never ''.
select is((pg_temp.audit(p_search => '') ->> 'total')::integer, 17, 'an empty p_search means no filter');
select is((pg_temp.audit(p_search => '   ') ->> 'total')::integer, 17, 'and so does a p_search of nothing but spaces');
select is((pg_temp.audit(p_category => '') ->> 'total')::integer, 0, 'while an empty p_category matches nothing at all');
select is((pg_temp.audit(p_result => '') ->> 'total')::integer, 0, 'and so does an empty p_result');
select is((pg_temp.audit(p_environment => '') ->> 'total')::integer, 0, 'and an empty p_environment');

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

-- A page that matched nothing. jsonb_agg over no rows is null, so this needs
-- the coalesce in console_audit and an assertion of its own: every other
-- rows-is-an-array assertion above runs on a page that has rows in it, and
-- would stay green with the coalesce deleted. Searching for something that is
-- not there is an ordinary thing for a member to do, and Task 2 parses rows
-- with z.array().
select is(
  jsonb_typeof(pg_temp.audit(p_search => 'nothing in this log says this') -> 'rows'),
  'array',
  'a page that matched nothing is an empty array, never JSON null'
);
select is(jsonb_array_length(pg_temp.audit(p_search => 'nothing in this log says this') -> 'rows'), 0, 'and it is empty');
select is((pg_temp.audit(p_search => 'nothing in this log says this') ->> 'total')::integer, 0, 'with a total of zero');
select is(
  jsonb_typeof(pg_temp.audit(p_offset => 999) -> 'rows'),
  'array',
  'and so is a page asked for past the end of the set'
);

-- 250 more entries, on the next day. The default page size and the upper clamp
-- cannot be reached through a seventeen-row day, and the upper clamp is what
-- stops a caller being handed two years of log in one response. A separate
-- window deliberately: every count above is taken through 14 March and must not
-- move. Half-open, and the first of these lands at 00:00:01, so the two windows
-- cannot overlap from either side.
insert into console.audit_log (at, environment, actor_id, actor_name, actor_role, category, action, target, result)
-- The anchor is cast explicitly: an untyped literal beside an interval
-- resolves to interval + interval, and the insert dies on "invalid input
-- syntax for type interval".
select '2019-03-15 00:00:00+00'::timestamptz + (n || ' seconds')::interval, 'production',
       'a0000000-0000-4000-8000-000000000001', 'Asha Rao', 'owner',
       'system', 'Purged unconfirmed sign-ups', n || ' records', 'done'
  from generate_series(1, 250) as g(n);

select is(
  (public.console_audit('2019-03-15 00:00:00+00', '2019-03-16 00:00:00+00') ->> 'total')::integer,
  250,
  'the second day holds 250 entries'
);
select is(
  jsonb_array_length(public.console_audit('2019-03-15 00:00:00+00', '2019-03-16 00:00:00+00') -> 'rows'),
  50,
  'a caller that names no p_limit gets a page of fifty, not the whole log'
);
select is(
  jsonb_array_length(public.console_audit('2019-03-15 00:00:00+00', '2019-03-16 00:00:00+00', p_limit => 1000) -> 'rows'),
  200,
  'and one that asks for a thousand is clamped down to two hundred'
);
select is(
  (public.console_audit('2019-03-15 00:00:00+00', '2019-03-16 00:00:00+00', p_limit => 1000) ->> 'total')::integer,
  250,
  'the clamp caps the page, never the total'
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
  (select array_agg(k order by k) from (
     select k from jsonb_object_keys(pg_temp.audit() -> 'rows' -> 0) as t(k)
     union all select 'key_name'
   ) as u(k)),
  'and carries a list row''s sixteen keys plus key_name -- seventeen'
);
select ok(public.console_audit_entry('00000000-0000-4000-8000-00000000dead') is null, 'an id that is not there comes back as null, not an error');

-- key_name, the drawer's Member line (task-3-addendum.md §2). console.audit_log
-- holds key_id and no key name on purpose -- the record outlives the key and
-- must never be rewritten when one is removed -- so the entry resolves the name
-- through a LEFT join on console.keys, and the join lives here and nowhere
-- else: nothing in the table draws a key, and a join per row on every page
-- would be a cost with no reader.
insert into console.keys (id, member_id, credential_id, public_key, name, type) values
  ('f0000000-0000-4000-8000-00000000000f', 'b0000000-0000-4000-8000-000000000002',
   '\x01'::bytea, '\x02'::bytea, 'YubiKey 5C', 'security_key');

-- A third day, outside both windows above, so no count taken through 14 or
-- 15 March moves. Three rows, one per state a key_id can be in.
insert into console.audit_log
  (id, at, environment, actor_id, actor_name, actor_role, key_id, session_label, category, action, target, reason, result, address_hash, before, after)
values
  ('9a000000-0000-4000-8000-00000000000a', '2019-03-16 09:00:00+00', 'production', 'b0000000-0000-4000-8000-000000000002', 'Rohan Iyer', 'admin',
   'f0000000-0000-4000-8000-00000000000f', 'Safari on iPhone', 'session', 'Signed in', 'Console', null, 'done', '51cd…07aa', null, null),
  -- A key that has since been removed or reset away. This is the normal,
  -- intended state of an old entry, not an edge case.
  ('9a000000-0000-4000-8000-00000000000b', '2019-03-16 09:01:00+00', 'production', 'b0000000-0000-4000-8000-000000000002', 'Rohan Iyer', 'admin',
   'e0000000-0000-4000-8000-00000000dead', 'Safari on iPhone', 'session', 'Key tap failed', 'Confirm it''s you', null, 'failed', '51cd…07aa', null, null),
  ('9a000000-0000-4000-8000-00000000000c', '2019-03-16 09:02:00+00', 'production', null, 'System', null,
   null, null, 'system', 'Purged unconfirmed sign-ups', '3 records', null, 'done', null, null, null);

select is(
  public.console_audit_entry('9a000000-0000-4000-8000-00000000000a') ->> 'key_name',
  'YubiKey 5C',
  'a key id that still resolves gives the drawer the key''s name'
);
select is(
  public.console_audit_entry('9a000000-0000-4000-8000-00000000000b') -> 'key_name',
  'null'::jsonb,
  'a key id that no longer resolves gives JSON null, not a missing key'
);
select is(
  public.console_audit_entry('9a000000-0000-4000-8000-00000000000b') ->> 'action',
  'Key tap failed',
  'and the entry itself still comes back -- a LEFT join, never an inner one'
);
select is(
  public.console_audit_entry('9a000000-0000-4000-8000-00000000000c') -> 'key_name',
  'null'::jsonb,
  'and a row with no key_id at all has a null key_name rather than no key'
);
select ok(
  not (pg_temp.audit() -> 'rows' -> 0 ? 'key_name'),
  'the list rows carry no key_name -- the join is the entry''s alone'
);
select is(
  (select count(*)::integer from console.audit_log where at >= '2019-03-16 00:00:00+00' and at < '2019-03-17 00:00:00+00'),
  3,
  'and resolving a key name wrote nothing to the log either'
);

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

-- ===========================================================================
-- console_audit_actors -- the Member filter's roster (Task 6).
--
-- The picker used to accumulate its options from the actors named by the rows
-- it had fetched, because console_team is Owner-only while this module is
-- Owner AND Admin. A member who had done nothing in the chosen range could
-- therefore not be selected -- which is exactly when a reader wants to ask
-- whether they have. This function is the roster an Admin may read.
--
-- It is read from console.audit_log and never from console.members, and that
-- is the point rather than a convenience: a removed member's history does not
-- go anywhere, so the one roster that can reach every row of this log is the
-- log itself. Neither of the two actors added below has a console.members row
-- at all.
-- ===========================================================================

select is(has_function_privilege('authenticated', 'public.console_audit_actors(timestamptz, timestamptz, text)', 'execute')::text, 'true', 'a member can read the roster');
select is(has_function_privilege('anon', 'public.console_audit_actors(timestamptz, timestamptz, text)', 'execute')::text, 'false', 'anon cannot');
select is(has_function_privilege('service_role', 'public.console_audit_actors(timestamptz, timestamptz, text)', 'execute')::text, 'false', 'nor the service role');

select is(
  (select p.prosecdef from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'console_audit_actors'),
  true,
  'the roster runs as definer -- authenticated has no usage on schema console'
);
select is(
  (select p.proconfig from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'console_audit_actors'),
  array['search_path=""'],
  'and with an empty search_path'
);

-- Never an enum parameter. PostgREST casts an enum argument in the CALLING
-- role's context, before security definer applies, and authenticated has no
-- usage on schema console -- so such a call dies with "permission denied for
-- schema console" before the body runs. An enum here would be invisible until
-- the first request from a browser.
select is(
  (select array_agg(format_type(t.oid, null) order by t.ord)
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     cross join lateral unnest(p.proargtypes) with ordinality as t(oid, ord)
    where n.nspname = 'public' and p.proname = 'console_audit_actors'),
  array['timestamp with time zone', 'timestamp with time zone', 'text'],
  'every parameter is timestamptz or text, never an enum'
);

-- Two actors nobody has ever made a member of this console, on two days no
-- window above touches. Devi acts once, in preview, on 10 March; Nikhil acts
-- twice, in production, under two different names -- which is what the log
-- really holds after someone is renamed, because each row names the actor as
-- they were at the time.
insert into console.audit_log
  (id, at, environment, actor_id, actor_name, actor_role, key_id, session_label, category, action, target, reason, result, address_hash, before, after)
values
  ('c1000000-0000-4000-8000-00000000d001', '2019-03-10 08:00:00+00', 'preview', 'e0000000-0000-4000-8000-000000000005', 'Devi Menon', 'admin', null, 'Chrome on Android',
   'configure', 'Changed a switch', 'Site notice', 'Announced the March window.', 'done', 'd4e1…5f70', null, null),
  ('c1000000-0000-4000-8000-00000000d002', '2019-03-10 09:00:00+00', 'production', 'f1000000-0000-4000-8000-000000000006', 'Nikhil B.', 'support', null, 'Firefox on Windows',
   'leads', 'Looked up an email', 'n•••@example.com', null, 'done', '6c88…11ab', null, null),
  ('c1000000-0000-4000-8000-00000000d003', '2019-03-11 09:00:00+00', 'production', 'f1000000-0000-4000-8000-000000000006', 'Nikhil Bose', 'admin', null, 'Firefox on Windows',
   'configure', 'Resumed PNR checks', 'PNR checks', 'Provider back after the night outage.', 'done', '6c88…11ab', null, null);

-- Every windowed call goes through here, so no exact-list assertion below can
-- be satisfied by a row another run left behind -- console.audit_log survives
-- every reset by design. The two unbounded calls further down assert only
-- properties that hold whatever else is in the table, or existence of an
-- actor_id this file wrote.
create or replace function pg_temp.actors(
  p_from timestamptz, p_to timestamptz, p_environment text default null
) returns jsonb
language sql as $$
  select public.console_audit_actors(p_from, p_to, p_environment);
$$;

create or replace function pg_temp.names(p_roster jsonb) returns text[]
language sql as $$
  select array_agg(a ->> 'actor_name' order by n)
    from jsonb_array_elements(p_roster) with ordinality as t(a, n);
$$;

-- The floor is a floor, exactly as it is on the list beside it: Owner and
-- Admin both pass, Support and Viewer are refused. Module 14 is Owner+Admin,
-- so anything narrower would lock out a role the sheet's own access map
-- admits -- and a roster an Admin cannot read is the whole reason this
-- function exists rather than console_team.
--
-- Each refusal NAMES console.require_role's own message. Every console refusal
-- raises 42501, so a bare `'42501', null` would pass for a refusal from any
-- other check -- including one a later change adds -- and the assertion would
-- stop being about the role floor.
select pg_temp.speak_as('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000aaa1');
select is(
  pg_temp.names(pg_temp.actors('2019-03-14 00:00:00+00', '2019-03-15 00:00:00+00')),
  array['Asha Rao', 'Kiran Das', 'Meera Nair', 'Rohan Iyer'],
  'an Owner reads the roster: every actor of that day, once each, by name'
);
select pg_temp.speak_as('b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-00000000bbb2');
select is(
  pg_temp.names(pg_temp.actors('2019-03-14 00:00:00+00', '2019-03-15 00:00:00+00')),
  array['Asha Rao', 'Kiran Das', 'Meera Nair', 'Rohan Iyer'],
  'and so does an Admin -- the floor admits both, which is why this is not console_team'
);
select pg_temp.speak_as('c0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-00000000ccc3');
select throws_ok(
  $$ select public.console_audit_actors('2019-03-14 00:00:00+00', '2019-03-15 00:00:00+00') $$,
  '42501', 'no access', 'a Support member cannot read the roster'
);
select pg_temp.speak_as('d0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-00000000ddd4');
select throws_ok(
  $$ select public.console_audit_actors('2019-03-14 00:00:00+00', '2019-03-15 00:00:00+00') $$,
  '42501', 'no access', 'nor can a Viewer'
);

select pg_temp.speak_as('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000aaa1');

-- The shape the picker is written from.
select is(jsonb_typeof(pg_temp.actors('2019-03-14 00:00:00+00', '2019-03-15 00:00:00+00')), 'array', 'the roster is an array');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.actors('2019-03-14 00:00:00+00', '2019-03-15 00:00:00+00') -> 0) as t(k)),
  array['actor_id', 'actor_name', 'actor_role'],
  'and an actor carries three keys: id, name and role'
);
select is(
  pg_temp.actors('2019-03-14 00:00:00+00', '2019-03-15 00:00:00+00') -> 0 ->> 'actor_id',
  'a0000000-0000-4000-8000-000000000001',
  'the id is the one the Member filter sends back as p_member'
);
-- jsonb_agg over no rows is null, and a window nobody acted in must still be
-- an empty array: Task 6 parses this with z.array(), which would throw on a
-- console whose log is younger than the range on screen.
select is(pg_temp.actors('2018-01-01 00:00:00+00', '2018-01-02 00:00:00+00'), '[]'::jsonb, 'a window nobody acted in is an empty array, never JSON null');

-- The System actor is not a member and cannot be filtered to. 14 March holds
-- one System row (actor_id null, actor_name 'System'); the four names above
-- are the four members, and 'System' is not among them.
select ok(
  not (pg_temp.names(pg_temp.actors('2019-03-14 00:00:00+00', '2019-03-15 00:00:00+00')) @> array['System']),
  'the System actor is left out -- it is not a member and p_member cannot reach it'
);
select ok(
  not exists (
    select 1 from jsonb_array_elements(public.console_audit_actors()) as t(a)
     where a -> 'actor_id' = 'null'::jsonb
  ),
  'and no entry anywhere in the roster carries a null actor_id'
);

-- One entry per actor, however many rows and however many names they have.
-- A second entry for one id would put two options with the same value in the
-- picker, and picking either would send the same p_member.
select is(
  pg_temp.names(pg_temp.actors('2019-03-10 00:00:00+00', '2019-03-12 00:00:00+00')),
  array['Devi Menon', 'Nikhil Bose'],
  'an actor with two rows under two names appears once, under the later one'
);
select is(
  pg_temp.actors('2019-03-10 00:00:00+00', '2019-03-12 00:00:00+00') -> 1 ->> 'actor_role',
  'admin',
  'and the role comes from that same later row, not from an older one'
);
select is(
  pg_temp.names(pg_temp.actors('2019-03-10 00:00:00+00', '2019-03-11 00:00:00+00')),
  array['Devi Menon', 'Nikhil B.'],
  'a window that ends before the rename still names them as that window has them'
);
select is(
  pg_temp.actors('2019-03-10 00:00:00+00', '2019-03-11 00:00:00+00') -> 1 ->> 'actor_role',
  'support',
  'with the role that row carried'
);
select ok(
  (select count(*) = count(distinct a ->> 'actor_id')
     from jsonb_array_elements(public.console_audit_actors()) as t(a)),
  'no actor_id appears twice in the whole-log roster either'
);

-- THE WHOLE POINT. The console calls this with no window, so the picker can
-- reach a member who has done nothing in the range on screen -- which is
-- exactly the member a reader opens this module to ask about. Scoped to the
-- range, the roster would answer a different question and leave that member
-- unselectable, which is the behaviour Task 6 exists to remove.
select ok(
  not (pg_temp.names(pg_temp.actors('2019-03-14 00:00:00+00', '2019-03-15 00:00:00+00')) @> array['Devi Menon']),
  'Devi did nothing on 14 March, so a roster scoped to that day cannot offer her'
);
select ok(
  exists (
    select 1 from jsonb_array_elements(public.console_audit_actors()) as t(a)
     where a ->> 'actor_id' = 'e0000000-0000-4000-8000-000000000005'
  ),
  'but the whole-log roster offers her, which is what the picker asks for'
);
select is(
  (select a ->> 'actor_name' from jsonb_array_elements(public.console_audit_actors()) as t(a)
    where a ->> 'actor_id' = 'f1000000-0000-4000-8000-000000000006'),
  'Nikhil Bose',
  'and names a renamed actor by their latest row in the log, not their first'
);
select ok(
  not exists (select 1 from console.members where user_id in (
    'e0000000-0000-4000-8000-000000000005', 'f1000000-0000-4000-8000-000000000006')),
  'neither of them is a member of this console -- the roster is the log''s, not console_team''s'
);

-- p_environment narrows it, exactly as it narrows the list. A convenience and
-- never a boundary: a member picks it and a member can forge it.
select is(pg_temp.names(pg_temp.actors('2019-03-10 00:00:00+00', '2019-03-11 00:00:00+00', 'production')), array['Nikhil B.'], 'the environment filter narrows the roster to production');
select is(pg_temp.names(pg_temp.actors('2019-03-10 00:00:00+00', '2019-03-11 00:00:00+00', 'preview')), array['Devi Menon'], 'and to preview');
select is(pg_temp.actors('2019-03-10 00:00:00+00', '2019-03-11 00:00:00+00', 'development'), '[]'::jsonb, 'and to a development nobody acted in');

-- The range is half-open here too, so the roster agrees with the rows it is
-- offered beside: a member whose only row sits exactly on p_to is out of both.
select is(pg_temp.names(pg_temp.actors('2019-03-10 08:00:00+00', '2019-03-10 09:00:00+00')), array['Devi Menon'], 'p_from is inclusive and p_to is exclusive -- the 09:00 row is out');
select is(pg_temp.names(pg_temp.actors('2019-03-10 08:00:00+00', '2019-03-10 09:00:00.000001+00')), array['Devi Menon', 'Nikhil B.'], 'and one microsecond later it is in');

-- Reading a roster is reading. Scoped to this section's own two days, because
-- console.audit_log survives every reset and a bare count would see every row
-- any run on this machine ever wrote.
select is(
  (select count(*)::integer from console.audit_log where at >= '2019-03-10 00:00:00+00' and at < '2019-03-12 00:00:00+00'),
  3,
  'reading the roster, windowed and unbounded, wrote nothing to the log'
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
