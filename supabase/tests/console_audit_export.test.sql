begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

-- public.console_audit_export: the one console function that reads the audit
-- log in bulk. It is not a second reader -- it is the export, which is an
-- *action*: it spends a per-action tap and writes its own audit row, both
-- inside this one transaction, which is the whole reason it lives in the
-- database rather than in the route (task-4-addendum.md §2).
--
-- Scoping. console.audit_log survives every reset by design and this file both
-- reads and writes it, so nothing below counts rows without a window. Three
-- windows, each a day no real console row can occupy (the console's first row
-- was written in September 2026):
--
--   17 March 2019 -- the eleven hand-written entries every filter assertion
--                    reads.
--   18 March 2019 -- 250 rows, more than console_audit's p_limit clamp of 200,
--                    so "the CSV carries the filtered set and not a page" is
--                    proven rather than asserted.
--   19 March 2019 -- AUDIT_EXPORT_MAX + 1 rows, for the cap.
--
-- The export's *own* audit rows land at now(), so they fall in no window at
-- all: those assertions scope themselves by a reason no other row in this
-- database carries ('audit-export-probe').
--
-- Every refusal names its message. Every console refusal raises 42501 --
-- console.require_role's 'no access', console.use_tap's 'no tap for this
-- action' and this function's own three -- so a bare throws_ok(…, '42501',
-- null, …) would pass whichever of them fired, which is the trap
-- console_team.test.sql records eighteen times over.

-- Grants: authenticated yes, anon and service_role no. Supabase's default
-- privileges auto-grant EXECUTE on a new public-schema function to all three,
-- so all three are checked and not only the one the revoke names.
select is(has_function_privilege('authenticated', 'public.console_audit_export(text, text, text, text)', 'execute')::text, 'true', 'a member can export the audit log');
select is(has_function_privilege('anon', 'public.console_audit_export(text, text, text, text)', 'execute')::text, 'false', 'anon cannot');
select is(has_function_privilege('service_role', 'public.console_audit_export(text, text, text, text)', 'execute')::text, 'false', 'nor the service role');

select is(
  (select count(*)::integer from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'console_audit_export'),
  1,
  'one console_audit_export, not an overload a positional call could pick between'
);
select is(
  (select p.prosecdef from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'console_audit_export'),
  true,
  'it runs as definer -- authenticated has no usage on schema console'
);
select is(
  (select p.proconfig from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'console_audit_export'),
  array['search_path=""'],
  'and with an empty search_path'
);
-- Never an enum-typed parameter on a public.console_* function: PostgREST casts
-- one in the CALLING role's context, before security definer applies, and
-- authenticated has no usage on schema console -- so the call would die with
-- "permission denied for schema console" before the body ran. A whole migration
-- (20260921000000) exists to undo five of these.
select is(
  (select array_agg(format_type(t.oid, null) order by o.n)
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     cross join lateral unnest(p.proargtypes) with ordinality as o(oid, n)
     join pg_catalog.pg_type t on t.oid = o.oid
    where n.nspname = 'public' and p.proname = 'console_audit_export'),
  array['text', 'text', 'text', 'text'],
  'every parameter is text -- never an enum'
);

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
  ('a0000000-0000-4000-8000-00000000aaa2', 'a0000000-0000-4000-8000-000000000001', 'Chrome on Windows', 'hash', now() + interval '7 days', now()),
  ('b0000000-0000-4000-8000-00000000bbb2', 'b0000000-0000-4000-8000-000000000002', 'Safari on iPhone', 'hash', now() + interval '7 days', now()),
  ('c0000000-0000-4000-8000-00000000ccc3', 'c0000000-0000-4000-8000-000000000003', 'Firefox on Windows', 'hash', now() + interval '7 days', now()),
  ('d0000000-0000-4000-8000-00000000ddd4', 'd0000000-0000-4000-8000-000000000004', 'Edge on Windows', 'hash', now() + interval '7 days', now());

-- Eleven entries on 17 March 2019, shaped like AuditLog.dc.html's own sample
-- table: a System row with no actor at all, two rows a preview deployment
-- wrote, a refusal, a failure, and reasons and targets the search filter can
-- bite on. The last two share a timestamp to the microsecond, which is what one
-- console action writing two rows in one transaction produces -- the export's
-- order has the same tie-break to prove as the list's.
--
-- Two of them carry the four things a CSV has to survive -- a comma, a double
-- quote, a newline, and a leading '=' that a spreadsheet reads as a formula --
-- and they are carried by the *database* rather than invented in a TypeScript
-- fixture, so the serialiser is tested against text the writer really stores.
insert into console.audit_log
  (id, at, environment, actor_id, actor_name, actor_role, key_id, session_label, category, action, target, reason, result, address_hash, before, after)
values
  ('c7000000-0000-4000-8000-000000000001', '2019-03-17 02:00:00+00', 'production', null, 'System', null, null, null,
   'system', 'Purged unconfirmed sign-ups', '12 records', 'Retention rule: 7 days.', 'done', null, null, null),
  ('c7000000-0000-4000-8000-000000000002', '2019-03-17 06:00:00+00', 'preview', 'b0000000-0000-4000-8000-000000000002', 'Rohan Iyer', 'admin', null, 'Safari on iPhone',
   'configure', 'Changed a switch', 'Live budget', 'Raised the daily cap to 100% of plan.', 'done', '51cd…07aa', null, null),
  ('c7000000-0000-4000-8000-000000000003', '2019-03-17 07:00:00+00', 'preview', 'b0000000-0000-4000-8000-000000000002', 'Rohan Iyer', 'admin', null, 'Safari on iPhone',
   'messages', 'Posted an incident', 'Slow PNR checks', null, 'done', '51cd…07aa', null, null),
  ('c7000000-0000-4000-8000-000000000004', '2019-03-17 08:30:00+00', 'production', 'a0000000-0000-4000-8000-000000000001', 'Asha Rao', 'owner', null, 'Chrome on macOS',
   'configure', 'Blocked an address', '9c41…d2e7', 'Scripted checks from one network.', 'done', 'a3f9…c2c1', null, null),
  ('c7000000-0000-4000-8000-000000000005', '2019-03-17 09:40:00+00', 'production', 'd0000000-0000-4000-8000-000000000004', 'Meera Nair', 'viewer', null, 'Edge on Windows',
   'record', 'Opened the audit log', 'Audit log', null, 'refused', 'e18a…3b56', null, null),
  ('c7000000-0000-4000-8000-000000000006', '2019-03-17 10:05:00+00', 'production', 'a0000000-0000-4000-8000-000000000001', 'Asha Rao', 'owner', null, 'Chrome on macOS',
   'provider_keys', 'Added a provider key', 'RailKit key •••• 4F2A', 'Rotated after the plan renewal.', 'done', 'a3f9…c2c1', null, null),
  ('c7000000-0000-4000-8000-000000000007', '2019-03-17 11:50:00+00', 'production', 'b0000000-0000-4000-8000-000000000002', 'Rohan Iyer', 'admin',
   'f0000000-0000-4000-8000-00000000000f', 'Safari on iPhone',
   'session', 'Key tap failed', 'Confirm it''s you', null, 'failed', '51cd…07aa', null, null),
  ('c7000000-0000-4000-8000-000000000008', '2019-03-17 12:15:00+00', 'production', 'b0000000-0000-4000-8000-000000000002', 'Rohan Iyer', 'admin', null, 'Safari on iPhone',
   'configure', 'Changed a switch', 'Site notice', 'Announce the 21 Sep window, "quietly", and
say so twice.', 'done', '51cd…07aa', null, null),
  ('c7000000-0000-4000-8000-000000000009', '2019-03-17 13:40:00+00', 'production', 'c0000000-0000-4000-8000-000000000003', 'Kiran Das', 'support', null, 'Firefox on Windows',
   'leads', 'Looked up an email', '=HYPERLINK("http://x","click")', null, 'done', '7b20…9e04', null, null),
  ('c7000000-0000-4000-8000-00000000000a', '2019-03-17 14:02:31.256374+00', 'production', 'a0000000-0000-4000-8000-000000000001', 'Asha Rao', 'owner', null, 'Chrome on macOS',
   'configure', 'Paused PNR checks', 'PNR checks', 'Provider maintenance window, 14:00–15:00 IST.', 'done', 'a3f9…c2c1',
   '{"pnr_checks": "on"}'::jsonb, '{"pnr_checks": "paused"}'::jsonb),
  ('c7000000-0000-4000-8000-00000000000b', '2019-03-17 14:02:31.256374+00', 'production', 'a0000000-0000-4000-8000-000000000001', 'Asha Rao', 'owner', null, 'Chrome on macOS',
   'configure', 'Paused PNR checks', 'Traveller notice', 'Provider maintenance window, 14:00–15:00 IST.', 'done', 'a3f9…c2c1', null, null),
  -- Outside every window above, and the only reason it exists: the open-ended range below has to
  -- reach past 17 March to find it, so "a range with only a start is exported as asked" is a
  -- statement about the missing upper bound rather than about the rows that happen to precede it.
  ('c7000000-0000-4000-8000-00000000000c', '2019-03-20 06:00:00+00', 'production', 'd0000000-0000-4000-8000-000000000004', 'Meera Nair', 'viewer', null, 'Edge on Windows',
   'record', 'Opened the audit log', 'Audit log', null, 'refused', 'e18a…3b56', null, null);

-- 250 rows on 18 March: more than console_audit's p_limit clamp of 200, so an
-- export that quietly went through the list function would come back short.
insert into console.audit_log (at, environment, actor_id, actor_name, actor_role, category, action, target, reason, result)
select '2019-03-18 04:00:00+00'::timestamptz + (n * interval '1 minute'),
       'production', 'a0000000-0000-4000-8000-000000000001', 'Asha Rao', 'owner',
       'record', 'Opened the audit log', 'Audit log', null, 'done'
  from generate_series(1, 250) as n;

-- AUDIT_EXPORT_MAX + 1 rows on 19 March. The cap is 10000 in the function and
-- AUDIT_EXPORT_MAX in src/console/audit/filters.ts; each names the other.
insert into console.audit_log (at, environment, actor_id, actor_name, actor_role, category, action, target, reason, result)
select '2019-03-19 04:00:00+00'::timestamptz + (n * interval '1 second'),
       'production', 'a0000000-0000-4000-8000-000000000001', 'Asha Rao', 'owner',
       'record', 'Opened the audit log', 'Audit log', null, 'done'
  from generate_series(1, 10001) as n;

-- Speaks as a member through the claim alone -- console_* functions read
-- request.jwt.claims, not current_user.
create or replace function pg_temp.speak_as(p_user uuid, p_session uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'session_id', p_session)::text, true);
end;
$$;

-- The reason every export below is taken for, unless it says otherwise. It
-- carries a marker no other row in this database has, because the export's own
-- audit rows land at now() and so fall outside every window this file uses.
create or replace function pg_temp.why() returns text language sql immutable as $$
  select 'Monthly access review, audit-export-probe.';
$$;

-- The 17 March window and "no filter at all", as src/console/audit/filters.ts
-- canonicalises them. The keys are in that file's own order, because the digest
-- is taken over the string and not over the object.
create or replace function pg_temp.day17() returns text language sql immutable as $$
  select '2019-03-17T00:00:00.000Z/2019-03-18T00:00:00.000Z';
$$;
create or replace function pg_temp.no_filters() returns text language sql immutable as $$
  select '{"category":null,"deployment":"development","environment":null,"member":null,"result":null,"search":null}';
$$;

-- console.challenges.challenge is checked at 16..512 characters (the real one
-- is a base64url WebAuthn challenge), so every label below is padded to a
-- plausible length rather than shortened to fit an assertion.
create or replace function pg_temp.ch(p_label text) returns text language sql immutable as $$
  select 'audit-export-test-challenge-' || p_label;
$$;

-- Mints an action challenge over the export's own four digest fields. The
-- action string is a literal here and a literal in the function; they are the
-- one pair that must agree by hand, exactly as 'Invited a member' already does
-- across console_invite_member and the dialog that requests its tap.
create or replace function pg_temp.mint(p_label text, p_range text, p_filters text, p_reason text default null, p_session uuid default 'a0000000-0000-4000-8000-00000000aaa1')
returns void language plpgsql as $$
begin
  perform public.console_auth_new_challenge('a0000000-0000-4000-8000-000000000001', p_session, 'action', pg_temp.ch(p_label),
    console.action_digest('Exported the audit log', p_range, p_filters, coalesce(p_reason, pg_temp.why())));
end;
$$;

-- Mint, then mark answered -- exactly the two writes the server makes once
-- @simplewebauthn has verified a real assertion against a real key.
create or replace function pg_temp.tap(p_label text, p_range text, p_filters text, p_reason text default null, p_session uuid default 'a0000000-0000-4000-8000-00000000aaa1')
returns void language plpgsql as $$
begin
  perform pg_temp.mint(p_label, p_range, p_filters, p_reason, p_session);
  perform public.console_auth_verify_challenge(pg_temp.ch(p_label), 'a0000000-0000-4000-8000-000000000001', p_session);
end;
$$;

create or replace function pg_temp.exp(p_range text, p_filters text, p_reason text default null)
returns jsonb language sql as $$
  select public.console_audit_export(p_range, p_filters, coalesce(p_reason, pg_temp.why()), 'development');
$$;

create or replace function pg_temp.targets(p_out jsonb) returns text[]
language sql as $$
  select array_agg(r ->> 'target' order by n)
    from jsonb_array_elements(p_out -> 'rows') with ordinality as t(r, n);
$$;

-- The role floor is a floor, not an equality: console.require_role('admin')
-- ranks, so Owner and Admin pass and Support and Viewer are refused. Both
-- refusals name console.require_role's own message, or they would pass on
-- use_tap's refusal instead and stop being about the role at all.
select pg_temp.speak_as('c0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-00000000ccc3');
select throws_ok($$ select pg_temp.exp(pg_temp.day17(), pg_temp.no_filters()) $$, '42501', 'no access', 'a Support member cannot export the audit log');
select pg_temp.speak_as('d0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-00000000ddd4');
select throws_ok($$ select pg_temp.exp(pg_temp.day17(), pg_temp.no_filters()) $$, '42501', 'no access', 'nor a Viewer');

-- The tap. This block is the reason the export lives in the database at all.
select pg_temp.speak_as('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000aaa1');

select throws_ok($$ select pg_temp.exp(pg_temp.day17(), pg_temp.no_filters()) $$, '42501', 'no tap for this action', 'an Owner with no ceremony at all exports nothing');

-- Two plain fetches: POST /api/tap/options mints a challenge, then POST the
-- export. No key is ever touched, so console_auth_verify_challenge never runs
-- and verified_at stays null -- which is the single condition
-- 20260921100200_console_tap_verified.sql added to use_tap, and the whole
-- reason it exists. Before it, exactly this pair removed a security key and the
-- audit row read 'done'.
select pg_temp.mint('unverified-1', pg_temp.day17(), pg_temp.no_filters());
select throws_ok($$ select pg_temp.exp(pg_temp.day17(), pg_temp.no_filters()) $$, '42501', 'no tap for this action', 'nor one whose challenge was minted but never answered by a key');
select is((select verified_at from console.challenges where challenge = pg_temp.ch('unverified-1')), null, 'and that challenge is still unanswered');
select is((select used_at from console.challenges where challenge = pg_temp.ch('unverified-1')), null, 'and still unspent -- a refused export spends nothing');

-- A tap is bound to one export. The four digest fields are the action, the
-- half-open range, the other five filters and the reason: change any of the
-- three that vary and the tap in hand is not this export's tap.
select pg_temp.tap('wrong-range', '2019-03-01T00:00:00.000Z/2019-03-18T00:00:00.000Z', pg_temp.no_filters());
select throws_ok($$ select pg_temp.exp(pg_temp.day17(), pg_temp.no_filters()) $$, '42501', 'no tap for this action', 'a tap taken for a wider range cannot be spent on a narrower one');

select pg_temp.tap('wrong-filters', pg_temp.day17(), '{"category":null,"deployment":"development","environment":null,"member":null,"result":"refused","search":null}');
select throws_ok($$ select pg_temp.exp(pg_temp.day17(), pg_temp.no_filters()) $$, '42501', 'no tap for this action', 'nor a tap taken for "refused only" spent on everything');

select pg_temp.tap('wrong-reason', pg_temp.day17(), pg_temp.no_filters(), 'A different reason entirely.');
select throws_ok($$ select pg_temp.exp(pg_temp.day17(), pg_temp.no_filters()) $$, '42501', 'no tap for this action', 'nor one taken over a different reason');

-- Another session of the same member. console.use_tap matches on session_id as
-- well as member_id, so a prepared export cannot be carried to a second browser
-- even by the person who prepared it.
select pg_temp.tap('other-session', pg_temp.day17(), pg_temp.no_filters(), null, 'a0000000-0000-4000-8000-00000000aaa2');
select throws_ok($$ select pg_temp.exp(pg_temp.day17(), pg_temp.no_filters()) $$, '42501', 'no tap for this action', 'nor a tap another session of the same member holds');

-- The export itself.
select pg_temp.tap('good-1', pg_temp.day17(), pg_temp.no_filters());
select is((pg_temp.exp(pg_temp.day17(), pg_temp.no_filters()) ->> 'count')::integer, 11, 'the export carries every row in the range');
select is((select used_at is not null from console.challenges where challenge = pg_temp.ch('good-1')), true, 'and it spent the tap it was taken for');
select throws_ok($$ select pg_temp.exp(pg_temp.day17(), pg_temp.no_filters()) $$, '42501', 'no tap for this action', 'a spent tap cannot be spent again -- one ceremony, one export');

-- Order, and the tie-break. The last two fixture rows share `at` to the
-- microsecond, so `at desc` alone is not a total order and the CSV would be
-- free to shuffle them between two exports of the same range.
select pg_temp.tap('good-2', pg_temp.day17(), pg_temp.no_filters());
select pg_temp.tap('good-2b', pg_temp.day17(), pg_temp.no_filters());
select is(
  pg_temp.targets(pg_temp.exp(pg_temp.day17(), pg_temp.no_filters())),
  array['Traveller notice', 'PNR checks', '=HYPERLINK("http://x","click")', 'Site notice', 'Confirm it''s you',
        'RailKit key •••• 4F2A', 'Audit log', '9c41…d2e7', 'Slow PNR checks', 'Live budget', '12 records'],
  'newest first, and equal timestamps broken on id desc'
);
-- The same eleven, in the same order, out of the list. `at` is not a total order
-- -- the last two fixture rows share it to the microsecond -- and no assertion
-- can pin a tie-break against a planner that is free to return equal rows in
-- any order it likes: dropping `id desc` from BOTH functions leaves the array
-- above green, because nothing then forces a different answer. What this does
-- catch is the realistic edit, to one of the two order clauses and not the
-- other, which would make the CSV and the table disagree about the same rows.
--
-- It also matters less here than it does for the list: an export returns the
-- whole set, so a shuffle within a tie cannot drop a row or repeat one the way
-- a page boundary can (console_audit_read.test.sql pins that).
select is(
  pg_temp.targets(pg_temp.exp(pg_temp.day17(), pg_temp.no_filters())),
  (select array_agg(r ->> 'target' order by n)
     from jsonb_array_elements(public.console_audit('2019-03-17T00:00:00.000Z', '2019-03-18T00:00:00.000Z', null, null, null, null, null, 200, 0) -> 'rows')
          with ordinality as t(r, n)),
  'and in the same order the table put them in'
);

-- The sixteen keys, from console.audit_row -- the same shape the list returns,
-- so the CSV and the table can never describe a row differently.
select pg_temp.tap('good-3', pg_temp.day17(), pg_temp.no_filters());
select is(
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.exp(pg_temp.day17(), pg_temp.no_filters()) -> 'rows' -> 0) k),
  array['action', 'actor_id', 'actor_name', 'actor_role', 'address_hash', 'after', 'at', 'before',
        'category', 'environment', 'id', 'key_id', 'reason', 'result', 'session_label', 'target'],
  'each row carries console.audit_row''s own sixteen keys, environment among them'
);

-- Each filter means exactly what it means in console_audit, or the CSV is not
-- the table the member was looking at.
select pg_temp.tap('f-result', pg_temp.day17(), '{"category":null,"deployment":"development","environment":null,"member":null,"result":"refused","search":null}');
select is(
  pg_temp.targets(pg_temp.exp(pg_temp.day17(), '{"category":null,"deployment":"development","environment":null,"member":null,"result":"refused","search":null}')),
  array['Audit log'],
  'result narrows the export, compared as text and never cast to the enum'
);

select pg_temp.tap('f-env', pg_temp.day17(), '{"category":null,"deployment":"development","environment":"preview","member":null,"result":null,"search":null}');
select is(
  pg_temp.targets(pg_temp.exp(pg_temp.day17(), '{"category":null,"deployment":"development","environment":"preview","member":null,"result":null,"search":null}')),
  array['Slow PNR checks', 'Live budget'],
  'environment narrows it to the deployment that wrote the rows'
);

select pg_temp.tap('f-member', pg_temp.day17(), '{"category":null,"deployment":"development","environment":null,"member":"b0000000-0000-4000-8000-000000000002","result":null,"search":null}');
select is(
  pg_temp.targets(pg_temp.exp(pg_temp.day17(), '{"category":null,"deployment":"development","environment":null,"member":"b0000000-0000-4000-8000-000000000002","result":null,"search":null}')),
  array['Site notice', 'Confirm it''s you', 'Slow PNR checks', 'Live budget'],
  'member narrows it to one actor'
);

select pg_temp.tap('f-category', pg_temp.day17(), '{"category":"provider_keys","deployment":"development","environment":null,"member":null,"result":null,"search":null}');
select is(
  pg_temp.targets(pg_temp.exp(pg_temp.day17(), '{"category":"provider_keys","deployment":"development","environment":null,"member":null,"result":null,"search":null}')),
  array['RailKit key •••• 4F2A'],
  'category narrows it, as free text and not as an enum'
);

-- Search is the one filter with a shape of its own: reason and target only,
-- never actor_name, with % and _ escaped. Asha is the actor on five of these
-- rows and the target of none.
select pg_temp.tap('f-search', pg_temp.day17(), '{"category":null,"deployment":"development","environment":null,"member":null,"result":null,"search":"maintenance"}');
select is(
  pg_temp.targets(pg_temp.exp(pg_temp.day17(), '{"category":null,"deployment":"development","environment":null,"member":null,"result":null,"search":"maintenance"}')),
  array['Traveller notice', 'PNR checks'],
  'search matches reasons as well as targets'
);
select pg_temp.tap('f-actor', pg_temp.day17(), '{"category":null,"deployment":"development","environment":null,"member":null,"result":null,"search":"Asha"}');
select is(
  (pg_temp.exp(pg_temp.day17(), '{"category":null,"deployment":"development","environment":null,"member":null,"result":null,"search":"Asha"}') ->> 'count')::integer,
  0,
  'and never the actor''s name, though Asha wrote five of these rows'
);
select pg_temp.tap('f-wild', pg_temp.day17(), '{"category":null,"deployment":"development","environment":null,"member":null,"result":null,"search":"100%"}');
select is(
  pg_temp.targets(pg_temp.exp(pg_temp.day17(), '{"category":null,"deployment":"development","environment":null,"member":null,"result":null,"search":"100%"}')),
  array['Live budget'],
  'and a member searching for "100%" gets what they typed, not a wildcard'
);

-- The export and the list must describe the same set, or the CSV is not the
-- table the member was looking at. The predicate is written out twice -- once
-- in console_audit, once in console.audit_matching -- so the two are compared
-- directly, on real rows, rather than by reading them side by side.
select pg_temp.tap('parity-1', pg_temp.day17(), '{"category":null,"deployment":"development","environment":null,"member":null,"result":null,"search":"maintenance"}');
select is(
  (pg_temp.exp(pg_temp.day17(), '{"category":null,"deployment":"development","environment":null,"member":null,"result":null,"search":"maintenance"}') ->> 'count')::integer,
  (public.console_audit('2019-03-17T00:00:00.000Z', '2019-03-18T00:00:00.000Z', null, null, null, 'maintenance', null, 200, 0) ->> 'total')::integer,
  'the export and the list agree on the size of a searched set'
);
select pg_temp.tap('parity-2', pg_temp.day17(), '{"category":"configure","deployment":"development","environment":"preview","member":"b0000000-0000-4000-8000-000000000002","result":"done","search":null}');
select is(
  (pg_temp.exp(pg_temp.day17(), '{"category":"configure","deployment":"development","environment":"preview","member":"b0000000-0000-4000-8000-000000000002","result":"done","search":null}') ->> 'count')::integer,
  (public.console_audit('2019-03-17T00:00:00.000Z', '2019-03-18T00:00:00.000Z', 'b0000000-0000-4000-8000-000000000002', 'configure', 'done', null, 'preview', 200, 0) ->> 'total')::integer,
  'and on one narrowed by every other filter at once'
);

-- The range is half-open, the start inclusive and the end exclusive, so two
-- adjacent ranges partition a day instead of both claiming the row on the seam.
select pg_temp.tap('seam-1', '2019-03-17T14:02:31.256374Z/2019-03-18T00:00:00.000Z', pg_temp.no_filters());
select is((pg_temp.exp('2019-03-17T14:02:31.256374Z/2019-03-18T00:00:00.000Z', pg_temp.no_filters()) ->> 'count')::integer, 2, 'the start of the range is inclusive');
select pg_temp.tap('seam-2', '2019-03-17T00:00:00.000Z/2019-03-17T14:02:31.256374Z', pg_temp.no_filters());
select is((pg_temp.exp('2019-03-17T00:00:00.000Z/2019-03-17T14:02:31.256374Z', pg_temp.no_filters()) ->> 'count')::integer, 9, 'and its end is exclusive');

-- An open side is a real choice the Custom range can produce -- one day picked
-- and not the other -- so it is asked for and not refused.
--
-- SCOPED BY ACTOR, and it has to be. An unbounded right side reaches now(), so
-- this is the one assertion in this file that can see rows no window excludes:
-- the first cut asked for every refusal since 17 March 2019 and expected 1, and
-- an e2e run that had left a single Refused row in console.audit_log turned it
-- into 'have: 2, want: 1'. It passed only because db:reset runs before db:test.
-- Meera's uuid is this file's own and is inserted inside this transaction, so
-- p_member names exactly the two rows the fixture above wrote and nothing any
-- other run ever wrote. The fifth instance of this class on this branch.
select pg_temp.tap('open-end', '2019-03-17T00:00:00.000Z/', '{"category":null,"deployment":"development","environment":null,"member":"d0000000-0000-4000-8000-000000000004","result":"refused","search":null}');
select is(
  (pg_temp.exp('2019-03-17T00:00:00.000Z/', '{"category":null,"deployment":"development","environment":null,"member":"d0000000-0000-4000-8000-000000000004","result":"refused","search":null}') ->> 'count')::integer,
  2,
  'a range with only a start reaches past the window it starts in'
);

-- Both sides open is not a range at all: it is a count(*) and a CSV over two
-- years of history. parseAuditFilters cannot produce it; a hand-made request
-- can, so the floor is here as well as there.
select pg_temp.tap('no-range', '/', pg_temp.no_filters());
select throws_ok($$ select pg_temp.exp('/', pg_temp.no_filters()) $$, '42501', 'an export needs a date range', 'an export with no range at all is refused');
select is((select used_at from console.challenges where challenge = pg_temp.ch('no-range')), null, 'and that one spends no tap either');

-- Garbage in either text field is a hand-made request, and it must not come
-- back as Postgres's own words about invalid input syntax.
select pg_temp.tap('garbage', 'not-a-range', 'not-json');
select throws_ok($$ select pg_temp.exp('not-a-range', 'not-json') $$, '42501', 'the export range or filters could not be read', 'a malformed range or filter object is refused in the console''s own error class');

-- More than a page. console_audit clamps p_limit to 200, so an export that
-- quietly went through the list function would hand back 200 of these 250.
select pg_temp.tap('big-1', '2019-03-18T00:00:00.000Z/2019-03-19T00:00:00.000Z', pg_temp.no_filters());
select is((pg_temp.exp('2019-03-18T00:00:00.000Z/2019-03-19T00:00:00.000Z', pg_temp.no_filters()) ->> 'count')::integer, 250, 'the export carries the whole filtered set, not console_audit''s page of 200');
select pg_temp.tap('big-2', '2019-03-18T00:00:00.000Z/2019-03-19T00:00:00.000Z', pg_temp.no_filters());
select is(jsonb_array_length(pg_temp.exp('2019-03-18T00:00:00.000Z/2019-03-19T00:00:00.000Z', pg_temp.no_filters()) -> 'rows'), 250, 'and count and rows describe the same set');

-- The cap. An export the route could not hold in memory would still write an
-- audit row claiming it happened, in a table nothing can correct -- so it is
-- refused, and refused before use_tap takes a lock it will not need.
--
-- The second assertion pins TRANSACTION ATOMICITY, not that ordering: moving
-- the check after use_tap leaves it green, because the raise aborts the call
-- and undoes the spend either way. What it would catch is an exception handler
-- that swallowed the raise and returned -- which would leave the tap spent and
-- the row written for an export nobody received.
select pg_temp.tap('cap', '2019-03-19T00:00:00.000Z/2019-03-20T00:00:00.000Z', pg_temp.no_filters());
select throws_ok($$ select pg_temp.exp('2019-03-19T00:00:00.000Z/2019-03-20T00:00:00.000Z', pg_temp.no_filters()) $$, '42501', 'too many entries to export', 'an export larger than the cap is refused');
select is((select used_at from console.challenges where challenge = pg_temp.ch('cap')), null, 'and it spends no tap -- the refusal aborts the call, so nothing it had already done stands');


-- THE FORGED DEPLOYMENT (branch review, Critical 1).
--
-- Until 20260923090000, console.use_tap digested four fields and p_environment
-- was none of them, and console.audit_log.environment was checked for length
-- alone. So an Admin holding a tap the console's own dialog had minted for them
-- could call this function with p_environment => 'Production' -- capital P --
-- take every production row, and file the record of it under a value no
-- Environment picker will ever match. Measured before the fix: five of five
-- rows left, the row read `environment=Production`, and every picker value
-- showed nothing.
--
-- Four ways in, all closed, each named separately because they fail for
-- different reasons and a single assertion would pass on whichever fired.
select pg_temp.tap('forge-absent', pg_temp.day17(), '{"category":null,"environment":null,"member":null,"result":null,"search":null}');
select throws_ok(
  format($$ select public.console_audit_export(%L, %L, %L, 'development') $$,
         pg_temp.day17(), '{"category":null,"environment":null,"member":null,"result":null,"search":null}', pg_temp.why()),
  '42501', 'the export names a deployment this console is not',
  'a filter object with no deployment at all is refused -- the shape that shipped before the fix'
);
select pg_temp.tap('forge-case', pg_temp.day17(), '{"category":null,"deployment":"Production","environment":null,"member":null,"result":null,"search":null}');
select throws_ok(
  format($$ select public.console_audit_export(%L, %L, %L, 'Production') $$,
         pg_temp.day17(), '{"category":null,"deployment":"Production","environment":null,"member":null,"result":null,"search":null}', pg_temp.why()),
  '42501', 'the export names a deployment this console is not',
  'nor a capital P, though the caller digested it and passed it consistently'
);
select pg_temp.tap('forge-mismatch', pg_temp.day17(), '{"category":null,"deployment":"development","environment":null,"member":null,"result":null,"search":null}');
select throws_ok(
  format($$ select public.console_audit_export(%L, %L, %L, 'Production') $$,
         pg_temp.day17(), '{"category":null,"deployment":"development","environment":null,"member":null,"result":null,"search":null}', pg_temp.why()),
  '42501', 'the export names a deployment this console is not',
  'nor an argument that disagrees with the one the ceremony covered'
);
-- The redirect: a tap minted honestly, for this deployment, spent to file the
-- record against another. This is the one the digest closes on its own -- the
-- closed set would let it through, because 'preview' is in the set.
select pg_temp.tap('forge-redirect', pg_temp.day17(), '{"category":null,"deployment":"development","environment":null,"member":null,"result":null,"search":null}');
select throws_ok(
  format($$ select public.console_audit_export(%L, %L, %L, 'preview') $$,
         pg_temp.day17(), '{"category":null,"deployment":"development","environment":null,"member":null,"result":null,"search":null}', pg_temp.why()),
  '42501', 'the export names a deployment this console is not',
  'nor a tap taken for this deployment spent to file the record under another'
);
-- And the other half, on its own: the column refuses a value outside the set
-- however it is reached, so a writer that never went through this function
-- cannot put a row where the Environment picker cannot look. console.write_audit
-- is revoked from authenticated, so this is belt to the function's braces.
select throws_ok(
  $$ insert into console.audit_log (environment, actor_name, category, action, result)
     values ('Production', 'Forged', 'record', 'Exported the audit log', 'done') $$,
  '23514', null,
  'and the column itself refuses an environment the picker cannot reach'
);
select is(
  (select count(*)::integer from pg_catalog.pg_constraint
    where conname = 'console_audit_log_environment_known' and convalidated),
  1,
  'the constraint is validated, not merely recorded -- every row already in the table satisfies it'
);

-- The audit row. Scoped by this file's own reason marker, never by a bare count
-- over an action name: console.audit_log survives every reset by design, and a
-- shipped console writes 'Exported the audit log' rows of its own.
select is(
  (select count(*)::integer from console.audit_log where action = 'Exported the audit log' and reason = pg_temp.why()),
  18,
  'one audit row per export that went through, and none for any that did not'
);
select is(
  (select count(*)::integer from console.audit_log
    where reason = pg_temp.why() and category = 'record' and target = 'Audit log' and result = 'done'
      and actor_name = 'Asha Rao' and actor_role = 'owner' and environment = 'development'),
  18,
  'each in the Record category, against the log itself, as the member who exported and the deployment they used'
);

-- One export with a reason of its own, so the record it leaves can be read back
-- without picking arbitrarily among fifteen rows that share a timestamp.
select pg_temp.tap('record-probe', pg_temp.day17(), '{"category":null,"deployment":"development","environment":"preview","member":null,"result":null,"search":null}', 'Range record check, audit-export-probe-one.');
select pg_temp.exp(pg_temp.day17(), '{"category":null,"deployment":"development","environment":"preview","member":null,"result":null,"search":null}', 'Range record check, audit-export-probe-one.');
select is(
  (select after from console.audit_log where reason = 'Range record check, audit-export-probe-one.'),
  jsonb_build_object('count', 2, 'range', pg_temp.day17(), 'filters', '{"category":null,"deployment":"development","environment":"preview","member":null,"result":null,"search":null}'::jsonb),
  'the row records how many entries left the console, over what range, under which filters -- the export is reconstructable from its own record'
);

-- The reason is scrubbed on the way in, by console.write_audit, exactly as
-- every other console action's is. The export never scrubs it itself and must
-- not: the digest is taken over what the member actually typed.
select pg_temp.tap('scrub', pg_temp.day17(), pg_temp.no_filters(), 'Access review, ref 2345678901, audit-export-probe-scrub.');
select pg_temp.exp(pg_temp.day17(), pg_temp.no_filters(), 'Access review, ref 2345678901, audit-export-probe-scrub.');
select is(
  (select reason from console.audit_log where reason like '%audit-export-probe-scrub%'),
  'Access review, ref [removed], audit-export-probe-scrub.',
  'the export''s own reason is scrubbed by console.write_audit like any other'
);

-- Nothing the export does may reach the rows it read. The append-only trigger
-- would catch an update or a delete; it would not catch an insert into the
-- window, which is what a reader that quietly logged per row would look like.
select is(
  (select count(*)::integer from console.audit_log where at >= '2019-03-17 00:00:00+00' and at < '2019-03-18 00:00:00+00'),
  11,
  'exporting the log twenty times added nothing to the range it exported'
);

select * from finish();
rollback;
