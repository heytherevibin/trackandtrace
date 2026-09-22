begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- public.console_audit_actors: the Member filter's roster (module 14, Task 6).
--
-- WHAT IT IS FOR. The picker used to accumulate its options from the actors
-- named by the rows it had already fetched, because console_team is Owner-only
-- while this module is Owner AND Admin -- there was no roster an Admin could
-- read. Nothing was hidden and the log stayed honest, but the filter could not
-- reach a member who had done nothing in the range on screen, and that member
-- is exactly the one a reader opens this module to ask about.
--
-- It reads console.audit_log and never console.members, and that is the point
-- rather than a convenience: a removed member keeps every row they ever wrote
-- while console_team drops `status = 'removed'` entirely, so the one roster
-- that can reach every row of this log is the log itself. Neither of the two
-- actors on 21-22 March below has a console.members row at all.
--
-- A FILE OF ITS OWN, not a section of console_audit_read.test.sql. The roster's
-- exact-list assertion needs a day whose actor set is known exactly, and the
-- read file's seventeen-row day is shaped for the *list's* filters -- so a row
-- added there for one purpose silently broke the other. The four-member fixture
-- below is duplicated from that file and from console_audit_export.test.sql,
-- which is the house pattern here: five test files define these same four
-- members under these same uuids, each owning the days it asserts on.
--
-- SCOPING. console.audit_log survives every reset by design, so a bare count
-- sees every row any run on this machine ever wrote. Three windows, on days no
-- real console row can occupy (the console's first row was written in September
-- 2026) and that no other test file uses:
--
--   20 March 2019 -- five rows, four actors and one System row. The day the
--                    exact-list and ordering assertions are taken through.
--   21 March 2019 -- two actors nobody has ever made a member, one in preview
--                    and one in production, an hour apart.
--   22 March 2019 -- one of those two again, renamed and re-ranked.
--
-- FOUR CALLS ARE DELIBERATELY UNBOUNDED, and they are these, each safe whatever
-- else is in the table:
--
--   :1  no entry anywhere carries a null actor_id      -- a property, any data
--   :2  no actor_id appears twice                      -- a property, any data
--   :3  Devi is offered                                -- an id this file wrote
--   :4  a renamed actor is named by their latest row   -- an id this file wrote
--
-- Every other assertion goes through pg_temp.actors, which pins a window on
-- every call. This was checked the hard way: 97 rows and 24 distinct actors
-- left behind by a full console e2e run, then db:test with no reset -- green.

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

-- Four members, one per role. Meera is 'active', not 'setup': a member in setup
-- is refused by console.current_member with 28000 'session ended' before
-- console.require_role's rank check is ever reached, and the refusals below are
-- about the rank check.
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

-- 20 MARCH. Five rows, and the four members act twice over between them -- so
-- "one entry per actor" is a real claim about this day and not an artefact of
-- five rows happening to have five actors. The System row is here because the
-- roster has to leave it out: it is not a member, and p_member is an equality
-- that no null ever satisfies.
insert into console.audit_log
  (id, at, environment, actor_id, actor_name, actor_role, key_id, session_label, category, action, target, reason, result, address_hash, before, after)
values
  ('b2000000-0000-4000-8000-00000000a001', '2019-03-20 02:00:00+00', 'production', null, 'System', null, null, null,
   'system', 'Purged unconfirmed sign-ups', '12 records', 'Retention rule: 7 days.', 'done', null, null, null),
  ('b2000000-0000-4000-8000-00000000a002', '2019-03-20 08:30:00+00', 'production', 'a0000000-0000-4000-8000-000000000001', 'Asha Rao', 'owner', null, 'Chrome on macOS',
   'configure', 'Blocked an address', '9c41…d2e7', 'Scripted checks from one network.', 'done', 'a3f9…c2c1', null, null),
  ('b2000000-0000-4000-8000-00000000a003', '2019-03-20 09:12:00+00', 'production', 'b0000000-0000-4000-8000-000000000002', 'Rohan Iyer', 'admin', null, 'Safari on iPhone',
   'configure', 'Resumed PNR checks', 'PNR checks', 'Provider back after the night outage.', 'done', '51cd…07aa', null, null),
  ('b2000000-0000-4000-8000-00000000a004', '2019-03-20 09:40:00+00', 'production', 'd0000000-0000-4000-8000-000000000004', 'Meera Nair', 'viewer', null, 'Edge on Windows',
   'session', 'Opened the audit log', 'Audit log', null, 'refused', 'e18a…3b56', null, null),
  ('b2000000-0000-4000-8000-00000000a005', '2019-03-20 13:40:00+00', 'production', 'c0000000-0000-4000-8000-000000000003', 'Kiran Das', 'support', null, 'Firefox on Windows',
   'leads', 'Looked up an email', 'r•••@example.com', null, 'done', '7b20…9e04', null, null),
  -- Asha again, later the same day, so the day has five actor rows and four
  -- actors. Without this the dedupe assertions below would pass on a fixture
  -- that never exercised them.
  ('b2000000-0000-4000-8000-00000000a006', '2019-03-20 18:05:00+00', 'production', 'a0000000-0000-4000-8000-000000000001', 'Asha Rao', 'owner', null, 'Chrome on macOS',
   'provider_keys', 'Added a provider key', 'RailKit key •••• 4F2A', 'Rotated after the plan renewal.', 'done', 'a3f9…c2c1', null, null);

-- 21 AND 22 MARCH. Two actors nobody has ever made a member of this console.
-- Devi acts once, in preview; Nikhil acts on both days, in production, under
-- two different names and two different roles -- which is what the log really
-- holds after someone is renamed or re-ranked, because each row names the actor
-- as they were at the time.
insert into console.audit_log
  (id, at, environment, actor_id, actor_name, actor_role, key_id, session_label, category, action, target, reason, result, address_hash, before, after)
values
  ('c1000000-0000-4000-8000-00000000d001', '2019-03-21 08:00:00+00', 'preview', 'e0000000-0000-4000-8000-000000000005', 'Devi Menon', 'admin', null, 'Chrome on Android',
   'configure', 'Changed a switch', 'Site notice', 'Announced the March window.', 'done', 'd4e1…5f70', null, null),
  ('c1000000-0000-4000-8000-00000000d002', '2019-03-21 09:00:00+00', 'production', 'f1000000-0000-4000-8000-000000000006', 'Nikhil B.', 'support', null, 'Firefox on Windows',
   'leads', 'Looked up an email', 'n•••@example.com', null, 'done', '6c88…11ab', null, null),
  ('c1000000-0000-4000-8000-00000000d003', '2019-03-22 09:00:00+00', 'production', 'f1000000-0000-4000-8000-000000000006', 'Nikhil Bose', 'admin', null, 'Firefox on Windows',
   'configure', 'Resumed PNR checks', 'PNR checks', 'Provider back after the night outage.', 'done', '6c88…11ab', null, null);

-- Speaks as a member through the claim alone -- console_* functions read
-- request.jwt.claims, not current_user.
create or replace function pg_temp.speak_as(p_user uuid, p_session uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'session_id', p_session)::text, true);
end;
$$;

-- Every windowed call goes through here, so no exact-list assertion below can
-- be satisfied by a row another run left behind.
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

-- The floor is a floor, exactly as it is on the list and the entry: Owner and
-- Admin both pass, Support and Viewer are refused. Module 14 is Owner+Admin, so
-- anything narrower would lock out a role the sheet's own access map admits --
-- and a roster an Admin cannot read is the whole reason this function exists
-- rather than console_team.
--
-- Each refusal NAMES console.require_role's own message. Every console refusal
-- raises 42501, so a bare `'42501', null` would pass for a refusal from any
-- other check -- including one a later change adds -- and the assertion would
-- stop being about the role floor.
select pg_temp.speak_as('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000aaa1');
select is(
  pg_temp.names(pg_temp.actors('2019-03-20 00:00:00+00', '2019-03-21 00:00:00+00')),
  array['Asha Rao', 'Kiran Das', 'Meera Nair', 'Rohan Iyer'],
  'an Owner reads the roster: every actor of that day, once each, by name'
);
select pg_temp.speak_as('b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-00000000bbb2');
select is(
  pg_temp.names(pg_temp.actors('2019-03-20 00:00:00+00', '2019-03-21 00:00:00+00')),
  array['Asha Rao', 'Kiran Das', 'Meera Nair', 'Rohan Iyer'],
  'and so does an Admin -- the floor admits both, which is why this is not console_team'
);
select pg_temp.speak_as('c0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-00000000ccc3');
select throws_ok(
  $$ select public.console_audit_actors('2019-03-20 00:00:00+00', '2019-03-21 00:00:00+00') $$,
  '42501', 'no access', 'a Support member cannot read the roster'
);
select pg_temp.speak_as('d0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-00000000ddd4');
select throws_ok(
  $$ select public.console_audit_actors('2019-03-20 00:00:00+00', '2019-03-21 00:00:00+00') $$,
  '42501', 'no access', 'nor can a Viewer'
);

select pg_temp.speak_as('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000aaa1');

-- The shape the picker is written from.
select is(jsonb_typeof(pg_temp.actors('2019-03-20 00:00:00+00', '2019-03-21 00:00:00+00')), 'array', 'the roster is an array');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.actors('2019-03-20 00:00:00+00', '2019-03-21 00:00:00+00') -> 0) as t(k)),
  array['actor_id', 'actor_name', 'actor_role'],
  'and an actor carries three keys: id, name and role'
);
select is(
  pg_temp.actors('2019-03-20 00:00:00+00', '2019-03-21 00:00:00+00') -> 0 ->> 'actor_id',
  'a0000000-0000-4000-8000-000000000001',
  'the id is the one the Member filter sends back as p_member'
);
-- jsonb_agg over no rows is null, and a window nobody acted in must still be an
-- empty array: Task 6 parses this with z.array(), which would throw on a
-- console whose log is younger than the range on screen.
select is(pg_temp.actors('2018-01-01 00:00:00+00', '2018-01-02 00:00:00+00'), '[]'::jsonb, 'a window nobody acted in is an empty array, never JSON null');

-- The System actor is not a member and cannot be filtered to. 20 March holds
-- one System row; the four names above are the four members, and 'System' is
-- not among them.
select ok(
  not (pg_temp.names(pg_temp.actors('2019-03-20 00:00:00+00', '2019-03-21 00:00:00+00')) @> array['System']),
  'the System actor is left out -- it is not a member and p_member cannot reach it'
);
select ok(
  not exists (
    select 1 from jsonb_array_elements(public.console_audit_actors()) as t(a)
     where a -> 'actor_id' = 'null'::jsonb
  ),
  'and no entry anywhere in the roster carries a null actor_id'
);

-- One entry per actor, however many rows and however many names they have. A
-- second entry for one id would put two options with the same value in the
-- picker, and picking either would send the same p_member.
select is(
  pg_temp.names(pg_temp.actors('2019-03-21 00:00:00+00', '2019-03-23 00:00:00+00')),
  array['Devi Menon', 'Nikhil Bose'],
  'an actor with two rows under two names appears once, under the later one'
);
select is(
  pg_temp.actors('2019-03-21 00:00:00+00', '2019-03-23 00:00:00+00') -> 1 ->> 'actor_role',
  'admin',
  'and the role comes from that same later row, not from an older one'
);
select is(
  pg_temp.names(pg_temp.actors('2019-03-21 00:00:00+00', '2019-03-22 00:00:00+00')),
  array['Devi Menon', 'Nikhil B.'],
  'a window that ends before the rename still names them as that window has them'
);
select is(
  pg_temp.actors('2019-03-21 00:00:00+00', '2019-03-22 00:00:00+00') -> 1 ->> 'actor_role',
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
  not (pg_temp.names(pg_temp.actors('2019-03-20 00:00:00+00', '2019-03-21 00:00:00+00')) @> array['Devi Menon']),
  'Devi did nothing on 20 March, so a roster scoped to that day cannot offer her'
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
select is(pg_temp.names(pg_temp.actors('2019-03-21 00:00:00+00', '2019-03-22 00:00:00+00', 'production')), array['Nikhil B.'], 'the environment filter narrows the roster to production');
select is(pg_temp.names(pg_temp.actors('2019-03-21 00:00:00+00', '2019-03-22 00:00:00+00', 'preview')), array['Devi Menon'], 'and to preview');
select is(pg_temp.actors('2019-03-21 00:00:00+00', '2019-03-22 00:00:00+00', 'development'), '[]'::jsonb, 'and to a development nobody acted in');

-- The range is half-open here too, so the roster agrees with the rows it is
-- offered beside: a member whose only row sits exactly on p_to is out of both.
select is(pg_temp.names(pg_temp.actors('2019-03-21 08:00:00+00', '2019-03-21 09:00:00+00')), array['Devi Menon'], 'p_from is inclusive and p_to is exclusive -- the 09:00 row is out');
select is(pg_temp.names(pg_temp.actors('2019-03-21 08:00:00+00', '2019-03-21 09:00:00.000001+00')), array['Devi Menon', 'Nikhil B.'], 'and one microsecond later it is in');

-- Reading a roster is reading. Nothing in this module may add to an append-only
-- table, and the update and delete triggers would not catch an INSERT. Scoped
-- to this file's own three days, because console.audit_log survives every reset
-- and a bare count would see every row any run on this machine ever wrote.
select is(
  (select count(*)::integer from console.audit_log where at >= '2019-03-20 00:00:00+00' and at < '2019-03-23 00:00:00+00'),
  9,
  'reading the roster, windowed and unbounded, wrote nothing to the log'
);

select * from finish();
rollback;
