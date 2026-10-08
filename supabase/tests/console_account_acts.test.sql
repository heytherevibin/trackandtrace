begin;
create extension if not exists pgtap with schema extensions;

-- Module 08, Accounts (second part): Sign out everywhere, Disable and Enable, each behind a reason
-- and a key; and the rule that makes the first two take effect AT ONCE — a traveller's own request
-- is answered only while their session is still there and their account is not disabled.
-- Named notation throughout: PostgREST resolves on argument names.

select plan(64);

delete from announcements.suppressions;
delete from announcements.letters;
delete from subscriptions.people;
delete from public.watchlist_entries;
delete from auth.users u where not exists (select 1 from console.members m where m.user_id = u.id);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in'),
  ('77777777-7777-7777-7777-777777777777', 'admin@trakline.in'),
  ('33333333-3333-3333-3333-333333333333', 'support@trakline.in');
insert into console.members (user_id, email, name, role, status) values
  ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in', 'Asha Rao', 'owner', 'active'),
  ('77777777-7777-7777-7777-777777777777', 'admin@trakline.in', 'Rohan Iyer', 'admin', 'active'),
  ('33333333-3333-3333-3333-333333333333', 'support@trakline.in', 'Kiran Das', 'support', 'active');
insert into console.sessions (session_id, member_id, address_hash, device_label, expires_at, key_verified_at) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'hash', 'Chrome on macOS', now() + interval '7 days', now()),
  ('88888888-8888-8888-8888-888888888888', '77777777-7777-7777-7777-777777777777', 'hash', 'Chrome on macOS', now() + interval '7 days', now()),
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'hash', 'Chrome on macOS', now() + interval '7 days', now());

create or replace function pg_temp.speak_as(p_user uuid, p_session uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'session_id', p_session)::text, true);
end;
$$;

-- A verified, unspent tap for exactly these four fields: what the key ceremony leaves behind once
-- @simplewebauthn has verified the assertion (src/console/keys/tap.ts).
create or replace function pg_temp.tap(p_member uuid, p_session uuid, p_label text, p_action text, p_target text, p_value text, p_reason text) returns void
language plpgsql as $$
begin
  insert into console.challenges (member_id, session_id, purpose, challenge, digest, expires_at, verified_at)
  values (p_member, p_session, 'action', p_label, console.action_digest(p_action, p_target, p_value, p_reason), now() + interval '5 minutes', now());
end;
$$;

-- Travellers. `asha` is signed in on two devices and has saved three PNRs; `dev` on one; `banned`
-- was disabled from outside the console, so nothing records when or by whom.
insert into auth.users (id, email, created_at, last_sign_in_at, banned_until) values
  ('c1111111-1111-4111-8111-111111111111', 'asha@acts.test',   now() - interval '14 days', now() - interval '1 day',   null),
  ('c2222222-2222-4222-8222-222222222222', 'dev@acts.test',    now() - interval '40 days', now() - interval '2 hours', null),
  ('c3333333-3333-4333-8333-333333333333', 'banned@acts.test', now() - interval '50 days', now() - interval '30 days', now() + interval '10 years');
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('d1111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', now() - interval '5 days', now() - interval '3 hours'),
  ('d2222222-2222-4222-8222-222222222222', 'c1111111-1111-4111-8111-111111111111', now() - interval '1 day',  now() - interval '1 day'),
  ('d4444444-4444-4444-8444-444444444444', 'c2222222-2222-4222-8222-222222222222', now() - interval '2 hours', now() - interval '2 hours');
insert into public.watchlist_entries (user_id, pnr, label) values
  ('c1111111-1111-4111-8111-111111111111', '1234567890', 'One'),
  ('c1111111-1111-4111-8111-111111111111', '1234567891', 'Two'),
  ('c1111111-1111-4111-8111-111111111111', '1234567892', 'Three'),
  ('c2222222-2222-4222-8222-222222222222', '2234567890', 'Theirs');

-- What a traveller's own request sees: run as `authenticated`, under their claims, and reported
-- back as text, because pgTAP itself must keep running as the role that owns its tables.
create or replace function pg_temp.as_traveller(p_claims json, p_sql text) returns text
language plpgsql as $$
declare
  v_out    text;
  v_before text := current_setting('request.jwt.claims', true);
begin
  perform set_config('request.jwt.claims', p_claims::text, true);
  set local role authenticated;
  begin
    execute p_sql into v_out;
  exception when others then
    v_out := 'refused: ' || sqlstate;
  end;
  reset role;
  -- Back to whoever was speaking: the console member's claims, for the calls that follow.
  perform set_config('request.jwt.claims', coalesce(v_before, ''), true);
  return v_out;
end;
$$;

select set_config('t.asha', '{"sub": "c1111111-1111-4111-8111-111111111111", "session_id": "d1111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
select set_config('t.dev', '{"sub": "c2222222-2222-4222-8222-222222222222", "session_id": "d4444444-4444-4444-8444-444444444444", "role": "authenticated"}', true);
select set_config('t.env', '{"environment":"development"}', true);
select set_config('t.reason', 'Reported a lost phone and asked us to sign it out.', true);

-- ---------------------------------------------------------------------------
-- Grants.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from unnest(array[
     'public.console_sign_out_account(text, uuid, text, text)', 'public.console_disable_account(text, uuid, text, text)',
     'public.console_enable_account(text, uuid, text, text)', 'public.session_live()']) f
    where has_function_privilege('authenticated', f, 'execute')
      and not has_function_privilege('anon', f, 'execute')),
  4, 'the three acts and the session check are for a signed-in session, never the anonymous role');
select ok(not has_table_privilege('authenticated', 'console.account_disables', 'select'), 'who disabled an account is nobody''s to read directly');

-- ---------------------------------------------------------------------------
-- AT ONCE. A traveller's own request is answered while their session is there, and not after.
-- ---------------------------------------------------------------------------
select is(
  (select permissive || '|' || cmd || '|' || array_to_string(roles, ',') from pg_policies where schemaname = 'public' and tablename = 'watchlist_entries' and policyname = 'watchlist_live_session'),
  'RESTRICTIVE|ALL|authenticated', 'the watchlist has a restrictive policy: every other policy is and-ed with it');
select is(pg_temp.as_traveller(current_setting('t.asha')::json, 'select public.session_live()::text'), 'true', 'a session that is there is live');
select is(pg_temp.as_traveller(current_setting('t.asha')::json, 'select count(*)::text from public.watchlist_entries'), '3', 'and its traveller reads their own saved PNRs, and nobody else''s');
select is(pg_temp.as_traveller(current_setting('t.asha')::json, $$insert into public.watchlist_entries (user_id, pnr, label) values ('c1111111-1111-4111-8111-111111111111', '1234567893', 'Four') returning 'saved'$$), 'saved', 'and saves another');
select is(pg_temp.as_traveller('{"sub": "c1111111-1111-4111-8111-111111111111", "session_id": "d9999999-9999-4999-8999-999999999999"}'::json, 'select public.session_live()::text'), 'false', 'a session that is not there is not live');
select is(pg_temp.as_traveller('{"sub": "c1111111-1111-4111-8111-111111111111", "session_id": "d9999999-9999-4999-8999-999999999999"}'::json, 'select count(*)::text from public.watchlist_entries'), '0', 'and reads nothing, though the token itself would still pass');
select is(pg_temp.as_traveller('{"sub": "c1111111-1111-4111-8111-111111111111"}'::json, 'select public.session_live()::text'), 'false', 'a token that names no session is not live');
select is(pg_temp.as_traveller('{"sub": "c1111111-1111-4111-8111-111111111111", "session_id": "not-a-uuid"}'::json, 'select count(*)::text from public.watchlist_entries'), '0', 'and one that names nonsense reads nothing rather than failing');
select is(pg_temp.as_traveller('{"sub": "c1111111-1111-4111-8111-111111111111", "session_id": "d4444444-4444-4444-8444-444444444444"}'::json, 'select public.session_live()::text'), 'false', 'someone else''s session is not this traveller''s');
select is(pg_temp.as_traveller(current_setting('t.dev')::json, 'select count(*)::text from public.watchlist_entries'), '1', 'the other traveller reads their own one');
update auth.sessions set not_after = now() - interval '1 minute' where id = 'd4444444-4444-4444-8444-444444444444';
select is(pg_temp.as_traveller(current_setting('t.dev')::json, 'select public.session_live()::text'), 'false', 'a session that has run out is not live');
update auth.sessions set not_after = null where id = 'd4444444-4444-4444-8444-444444444444';

-- ---------------------------------------------------------------------------
-- The floor, the key and the deployment, for all three acts.
-- ---------------------------------------------------------------------------
select pg_temp.speak_as('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444');
select throws_ok(format($$select public.console_sign_out_account(p_environment => 'development', p_id => 'c1111111-1111-4111-8111-111111111111', p_value => %L, p_reason => %L)$$, current_setting('t.env'), current_setting('t.reason')), '42501', 'no access', 'Support cannot sign an account out');
select throws_ok(format($$select public.console_disable_account(p_environment => 'development', p_id => 'c1111111-1111-4111-8111-111111111111', p_value => %L, p_reason => %L)$$, current_setting('t.env'), current_setting('t.reason')), '42501', 'no access', 'nor disable one');
select throws_ok(format($$select public.console_enable_account(p_environment => 'development', p_id => 'c3333333-3333-4333-8333-333333333333', p_value => %L, p_reason => %L)$$, current_setting('t.env'), current_setting('t.reason')), '42501', 'no access', 'nor enable one');

select pg_temp.speak_as('77777777-7777-7777-7777-777777777777', '88888888-8888-8888-8888-888888888888');
select throws_ok(format($$select public.console_sign_out_account(p_environment => 'development', p_id => 'c1111111-1111-4111-8111-111111111111', p_value => %L, p_reason => %L)$$, current_setting('t.env'), current_setting('t.reason')), '42501', 'no tap for this action', 'an Admin may, but not without a key');
select throws_ok(format($$select public.console_disable_account(p_environment => 'development', p_id => 'c1111111-1111-4111-8111-111111111111', p_value => %L, p_reason => %L)$$, current_setting('t.env'), current_setting('t.reason')), '42501', 'no tap for this action', 'nor disable without one');
select throws_ok(format($$select public.console_enable_account(p_environment => 'development', p_id => 'c3333333-3333-4333-8333-333333333333', p_value => %L, p_reason => %L)$$, current_setting('t.env'), current_setting('t.reason')), '42501', 'no tap for this action', 'nor enable without one');
select throws_ok(format($$select public.console_sign_out_account(p_environment => 'production', p_id => 'c1111111-1111-4111-8111-111111111111', p_value => %L, p_reason => %L)$$, current_setting('t.env'), current_setting('t.reason')), '22023', 'environment mismatch', 'nor under a deployment the tap was not minted for');
select throws_ok(format($$select public.console_disable_account(p_environment => 'development', p_id => 'c1111111-1111-4111-8111-111111111111', p_value => 'development', p_reason => %L)$$, current_setting('t.reason')), '22023', 'environment mismatch', 'a value that is not the expected object is refused the same way');
select throws_ok(format($$select public.console_sign_out_account(p_environment => 'development', p_id => 'c9999999-9999-4999-8999-999999999999', p_value => %L, p_reason => %L)$$, current_setting('t.env'), current_setting('t.reason')), '22023', 'no such account', 'no such account is refused');
select throws_ok(format($$select public.console_disable_account(p_environment => 'development', p_id => '11111111-1111-1111-1111-111111111111', p_value => %L, p_reason => %L)$$, current_setting('t.env'), current_setting('t.reason')), '22023', 'no such account', 'and a console member is not an account: nobody is disabled from here');
select is((select count(*)::int from auth.sessions), 3, 'none of that ended a session');
select is((select count(*)::int from console.audit_log where category = 'accounts'), 0, 'or was recorded as an act');

-- ---------------------------------------------------------------------------
-- Sign out everywhere.
-- ---------------------------------------------------------------------------
select pg_temp.tap('77777777-7777-7777-7777-777777777777', '88888888-8888-8888-8888-888888888888', 'acts-challenge-0001',
  'Signed an account out everywhere', 'c1111111-1111-4111-8111-111111111111', current_setting('t.env'), current_setting('t.reason'));
select lives_ok(format($$select public.console_sign_out_account(p_environment => 'development', p_id => 'c1111111-1111-4111-8111-111111111111', p_value => %L, p_reason => %L)$$, current_setting('t.env'), current_setting('t.reason')), 'with the tap, the account is signed out');
select is((select count(*)::int from auth.sessions where user_id = 'c1111111-1111-4111-8111-111111111111'), 0, 'every one of its sessions is gone');
select is((select count(*)::int from auth.sessions), 1, 'and nobody else''s');
select is((select banned_until from auth.users where id = 'c1111111-1111-4111-8111-111111111111'), null, 'the account is not disabled: they can sign in again');
select is(pg_temp.as_traveller(current_setting('t.asha')::json, 'select public.session_live()::text'), 'false', 'AT ONCE: the token they still hold is no longer a live session');
select is(pg_temp.as_traveller(current_setting('t.asha')::json, 'select count(*)::text from public.watchlist_entries'), '0', 'their very next read is answered with nothing');
select is(pg_temp.as_traveller(current_setting('t.asha')::json, $$insert into public.watchlist_entries (user_id, pnr, label) values ('c1111111-1111-4111-8111-111111111111', '1234567894', 'Five') returning 'saved'$$), 'refused: 42501', 'and their very next write is refused');
select is((select count(*)::int from public.watchlist_entries where user_id = 'c1111111-1111-4111-8111-111111111111'), 4, 'nothing they saved was touched');
select is(
  (select actor_name || '|' || category || '|' || target || '|' || reason || '|' || result || '|' || (after ->> 'sessions') from console.audit_log where action = 'Signed an account out everywhere' and environment = 'development'),
  'Rohan Iyer|accounts|a•••@acts.test|Reported a lost phone and asked us to sign it out.|done|2',
  'recorded by the masked address, with the reason and how many sessions ended');
select isnt((select used_at from console.challenges where challenge = 'acts-challenge-0001'), null, 'the tap is spent');
select pg_temp.tap('77777777-7777-7777-7777-777777777777', '88888888-8888-8888-8888-888888888888', 'acts-challenge-0002',
  'Signed an account out everywhere', 'c1111111-1111-4111-8111-111111111111', current_setting('t.env'), current_setting('t.reason'));
select throws_ok(format($$select public.console_sign_out_account(p_environment => 'development', p_id => 'c1111111-1111-4111-8111-111111111111', p_value => %L, p_reason => %L)$$, current_setting('t.env'), current_setting('t.reason')), '22023', 'nobody is signed in', 'with nobody signed in there is nothing to end');
select is((select used_at from console.challenges where challenge = 'acts-challenge-0002'), null, 'and the tap is not spent on the refusal');
select throws_ok(format($$select public.console_sign_out_account(p_environment => 'development', p_id => 'c2222222-2222-4222-8222-222222222222', p_value => %L, p_reason => %L)$$, current_setting('t.env'), current_setting('t.reason')), '42501', 'no tap for this action', 'a tap approves one account: it does not carry to another');

-- ---------------------------------------------------------------------------
-- Disable: signed out, and no sign-in until Enable.
-- ---------------------------------------------------------------------------
select pg_temp.tap('77777777-7777-7777-7777-777777777777', '88888888-8888-8888-8888-888888888888', 'acts-challenge-0003',
  'Disabled an account', 'c2222222-2222-4222-8222-222222222222', current_setting('t.env'), 'Automated checks from this account, against the terms.');
select lives_ok(format($$select public.console_disable_account(p_environment => 'development', p_id => 'c2222222-2222-4222-8222-222222222222', p_value => %L, p_reason => 'Automated checks from this account, against the terms.')$$, current_setting('t.env')), 'with the tap, the account is disabled');
select ok((select banned_until > now() + interval '50 years' from auth.users where id = 'c2222222-2222-4222-8222-222222222222'), 'the auth service refuses its sign-ins from now on');
select is((select count(*)::int from auth.sessions where user_id = 'c2222222-2222-4222-8222-222222222222'), 0, 'and it is signed out everywhere');
select is(pg_temp.as_traveller(current_setting('t.dev')::json, 'select count(*)::text from public.watchlist_entries'), '0', 'AT ONCE: the token they still hold reads nothing');
select is((select count(*)::int from public.watchlist_entries where user_id = 'c2222222-2222-4222-8222-222222222222'), 1, 'their saved PNRs are kept');
select is(
  (select actor_name || '|' || target || '|' || reason || '|' || (after ->> 'sessions') from console.audit_log where action = 'Disabled an account' and environment = 'development'),
  'Rohan Iyer|d•••@acts.test|Automated checks from this account, against the terms.|1',
  'recorded, with how many sessions it ended');
select set_config('t.disabled', public.console_account(p_id => 'c2222222-2222-4222-8222-222222222222')::text, true);
select is(current_setting('t.disabled')::jsonb ->> 'disabled', 'true', 'the record says disabled');
select is(current_setting('t.disabled')::jsonb ->> 'disabledBy', 'Rohan Iyer', 'by whom');
select ok((current_setting('t.disabled')::jsonb ->> 'disabledAt')::timestamptz > now() - interval '1 minute', 'and since when');
-- Even with a session row of its own, a disabled account's requests are not answered.
insert into auth.sessions (id, user_id, created_at, updated_at) values ('d5555555-5555-4555-8555-555555555555', 'c2222222-2222-4222-8222-222222222222', now(), now());
select is(pg_temp.as_traveller('{"sub": "c2222222-2222-4222-8222-222222222222", "session_id": "d5555555-5555-4555-8555-555555555555"}'::json, 'select public.session_live()::text'), 'false', 'a disabled account has no live session, whatever sessions it has');
delete from auth.sessions where id = 'd5555555-5555-4555-8555-555555555555';
select pg_temp.tap('77777777-7777-7777-7777-777777777777', '88888888-8888-8888-8888-888888888888', 'acts-challenge-0004',
  'Disabled an account', 'c2222222-2222-4222-8222-222222222222', current_setting('t.env'), current_setting('t.reason'));
select throws_ok(format($$select public.console_disable_account(p_environment => 'development', p_id => 'c2222222-2222-4222-8222-222222222222', p_value => %L, p_reason => %L)$$, current_setting('t.env'), current_setting('t.reason')), '22023', 'already disabled', 'an account is disabled once');
select is((select used_at from console.challenges where challenge = 'acts-challenge-0004'), null, 'and the tap is not spent on the refusal');

-- The member who disabled it leaves the console: the record still says who it was.
update console.members set status = 'removed' where user_id = '77777777-7777-7777-7777-777777777777';
select pg_temp.speak_as('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
select is(public.console_account(p_id => 'c2222222-2222-4222-8222-222222222222') ->> 'disabledBy', 'Rohan Iyer', 'a member who has left is still named on what they did');

-- ---------------------------------------------------------------------------
-- Enable.
-- ---------------------------------------------------------------------------
select pg_temp.tap('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'acts-challenge-0005',
  'Enabled an account', 'c2222222-2222-4222-8222-222222222222', current_setting('t.env'), 'Wrote in and agreed to stop the automated checks.');
select lives_ok(format($$select public.console_enable_account(p_environment => 'development', p_id => 'c2222222-2222-4222-8222-222222222222', p_value => %L, p_reason => 'Wrote in and agreed to stop the automated checks.')$$, current_setting('t.env')), 'with the tap, the account is enabled');
select is((select banned_until from auth.users where id = 'c2222222-2222-4222-8222-222222222222'), null, 'the auth service takes its sign-ins again');
select is((select count(*)::int from console.account_disables), 0, 'and nothing says it is disabled');
select is(
  public.console_account(p_id => 'c2222222-2222-4222-8222-222222222222') - 'createdAt' - 'lastSignInAt' - 'id' - 'email' - 'sessions' - 'emailLink' - 'google' - 'passkeys' - 'savedPnrs' - 'news' - 'leadId',
  '{"disabled": false, "disabledAt": null, "disabledBy": null}'::jsonb,
  'the record says active again');
select is(
  (select actor_name || '|' || target || '|' || reason from console.audit_log where action = 'Enabled an account' and environment = 'development'),
  'Asha Rao|d•••@acts.test|Wrote in and agreed to stop the automated checks.',
  'recorded');
select pg_temp.tap('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'acts-challenge-0006',
  'Enabled an account', 'c2222222-2222-4222-8222-222222222222', current_setting('t.env'), current_setting('t.reason'));
select throws_ok(format($$select public.console_enable_account(p_environment => 'development', p_id => 'c2222222-2222-4222-8222-222222222222', p_value => %L, p_reason => %L)$$, current_setting('t.env'), current_setting('t.reason')), '22023', 'not disabled', 'an account that is not disabled cannot be enabled');
select is((select used_at from console.challenges where challenge = 'acts-challenge-0006'), null, 'and the tap is not spent on the refusal');

-- An account disabled from outside the console: nothing records when or by whom, and Enable still works.
select is(
  public.console_account(p_id => 'c3333333-3333-4333-8333-333333333333') - 'createdAt' - 'lastSignInAt' - 'id' - 'email' - 'sessions' - 'emailLink' - 'google' - 'passkeys' - 'savedPnrs' - 'news' - 'leadId',
  '{"disabled": true, "disabledAt": null, "disabledBy": null}'::jsonb,
  'disabled, with no since and no name to give');
select pg_temp.tap('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'acts-challenge-0007',
  'Enabled an account', 'c3333333-3333-4333-8333-333333333333', current_setting('t.env'), current_setting('t.reason'));
select lives_ok(format($$select public.console_enable_account(p_environment => 'development', p_id => 'c3333333-3333-4333-8333-333333333333', p_value => %L, p_reason => %L)$$, current_setting('t.env'), current_setting('t.reason')), 'and it can be enabled from here');
select is((select banned_until from auth.users where id = 'c3333333-3333-4333-8333-333333333333'), null, 'which lifts the ban');

-- A disabled account that is deleted takes its record of being disabled with it.
select pg_temp.tap('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'acts-challenge-0008',
  'Disabled an account', 'c3333333-3333-4333-8333-333333333333', current_setting('t.env'), current_setting('t.reason'));
select lives_ok(format($$select public.console_disable_account(p_environment => 'development', p_id => 'c3333333-3333-4333-8333-333333333333', p_value => %L, p_reason => %L)$$, current_setting('t.env'), current_setting('t.reason')), 'disabled again, from the console this time, with nobody signed in');
select is((select by_name from console.account_disables where user_id = 'c3333333-3333-4333-8333-333333333333'), 'Asha Rao', 'which records who');
delete from auth.users where id = 'c3333333-3333-4333-8333-333333333333';
select is((select count(*)::int from console.account_disables), 0, 'and the record goes with the account');

select * from finish();
rollback;
