begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

-- Every function here is service_role's alone: these are the steps that
-- happen before a key-verified session exists, so nothing that already holds
-- a session (or holds nothing at all) may reach them. Supabase's default
-- privileges auto-grant EXECUTE on a new public-schema function to anon,
-- authenticated and service_role alike, so each side must be checked, not
-- just the side a revoke happens to name -- the same shape Task 6's test uses.
select is(has_function_privilege('service_role', 'public.console_auth_member_by_email(text)', 'execute')::text, 'true', 'service_role can look up a member by email');
select is(has_function_privilege('authenticated', 'public.console_auth_member_by_email(text)', 'execute')::text, 'false', 'authenticated cannot look up a member by email');
select is(has_function_privilege('anon', 'public.console_auth_member_by_email(text)', 'execute')::text, 'false', 'anon cannot look up a member by email');

select is(has_function_privilege('service_role', 'public.console_auth_start_session(uuid, uuid, text, text)', 'execute')::text, 'true', 'service_role can start a session');
select is(has_function_privilege('authenticated', 'public.console_auth_start_session(uuid, uuid, text, text)', 'execute')::text, 'false', 'authenticated cannot start a session directly');
select is(has_function_privilege('anon', 'public.console_auth_start_session(uuid, uuid, text, text)', 'execute')::text, 'false', 'anon cannot start a session directly');

select is(has_function_privilege('service_role', 'public.console_auth_verify_session(uuid, uuid)', 'execute')::text, 'true', 'service_role can verify a session');
select is(has_function_privilege('authenticated', 'public.console_auth_verify_session(uuid, uuid)', 'execute')::text, 'false', 'authenticated cannot verify a session directly');
select is(has_function_privilege('anon', 'public.console_auth_verify_session(uuid, uuid)', 'execute')::text, 'false', 'anon cannot verify a session directly');

select is(has_function_privilege('service_role', 'public.console_auth_revoke_session(uuid)', 'execute')::text, 'true', 'service_role can revoke a session');
select is(has_function_privilege('authenticated', 'public.console_auth_revoke_session(uuid)', 'execute')::text, 'false', 'authenticated cannot revoke a session directly');
select is(has_function_privilege('anon', 'public.console_auth_revoke_session(uuid)', 'execute')::text, 'false', 'anon cannot revoke a session directly');

select is(has_function_privilege('service_role', 'public.console_auth_revoke_member_sessions(uuid, uuid)', 'execute')::text, 'true', 'service_role can revoke a member''s sessions');
select is(has_function_privilege('authenticated', 'public.console_auth_revoke_member_sessions(uuid, uuid)', 'execute')::text, 'false', 'authenticated cannot revoke a member''s sessions directly');
select is(has_function_privilege('anon', 'public.console_auth_revoke_member_sessions(uuid, uuid)', 'execute')::text, 'false', 'anon cannot revoke a member''s sessions directly');

select is(has_function_privilege('service_role', 'public.console_auth_new_challenge(uuid, uuid, text, text, bytea)', 'execute')::text, 'true', 'service_role can mint a challenge');
select is(has_function_privilege('authenticated', 'public.console_auth_new_challenge(uuid, uuid, text, text, bytea)', 'execute')::text, 'false', 'authenticated cannot mint a challenge directly');
select is(has_function_privilege('anon', 'public.console_auth_new_challenge(uuid, uuid, text, text, bytea)', 'execute')::text, 'false', 'anon cannot mint a challenge directly');

select is(has_function_privilege('service_role', 'public.console_auth_take_challenge(text, uuid, text)', 'execute')::text, 'true', 'service_role can take a challenge');
select is(has_function_privilege('authenticated', 'public.console_auth_take_challenge(text, uuid, text)', 'execute')::text, 'false', 'authenticated cannot take a challenge directly');
select is(has_function_privilege('anon', 'public.console_auth_take_challenge(text, uuid, text)', 'execute')::text, 'false', 'anon cannot take a challenge directly');

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in');
insert into console.members (user_id, email, name, role, status)
values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in', 'Owner', 'owner', 'active');

select is(public.console_auth_member_by_email('nobody@trakline.in'), null, 'a stranger is not a member');
select is(
  public.console_auth_member_by_email('OWNER@trakline.in') ->> 'role',
  'owner',
  'the lookup is case-insensitive'
);
select is(
  (public.console_auth_member_by_email('owner@trakline.in') ->> 'key_count')::int,
  0,
  'a member with no keys yet reports none'
);

select public.console_auth_start_session(
  '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Chrome on macOS', 'hash'
);
select is(
  (select key_verified_at is null and expires_at < now() + interval '25 hours'
     from console.sessions where session_id = '22222222-2222-2222-2222-222222222222'),
  true,
  'a fresh session is unverified and lasts a day'
);

insert into console.keys (id, member_id, credential_id, public_key, counter, name, type)
values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '\x01'::bytea, '\x02'::bytea, 0, 'Blue key', 'security_key');

select public.console_auth_verify_session('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
select is(
  (select key_verified_at is not null and expires_at > now() + interval '6 days'
     from console.sessions where session_id = '22222222-2222-2222-2222-222222222222'),
  true,
  'a tapped session is verified and lasts a week'
);
select is(
  (select last_used_at is not null from console.keys where id = '33333333-3333-3333-3333-333333333333'),
  true,
  'the key records that it was used'
);

-- Challenges are single-use and expire.
select public.console_auth_new_challenge(
  '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'sign_in', 'sign-in-challenge-0001', null
);
select is(
  public.console_auth_take_challenge('sign-in-challenge-0001', '11111111-1111-1111-1111-111111111111', 'sign_in') ->> 'challenge',
  'sign-in-challenge-0001',
  'a fresh challenge is handed back once'
);
select is(
  public.console_auth_take_challenge('sign-in-challenge-0001', '11111111-1111-1111-1111-111111111111', 'sign_in'),
  null,
  'the same challenge cannot be taken twice'
);

-- Revoking one session leaves the rest, and revoking a member's clears them all.
select public.console_auth_start_session(
  '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'Safari on iPhone', 'hash2'
);
select public.console_auth_revoke_session('44444444-4444-4444-4444-444444444444');
-- This member's own live sessions, not the table's: a console e2e run leaves a
-- signed-in member behind on the same database `supabase test db` then runs
-- against, and their session is live too.
select is(
  (select count(*)::int from console.sessions where revoked_at is null and member_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'one revoked session leaves the other alone'
);
select is(
  public.console_auth_revoke_member_sessions('11111111-1111-1111-1111-111111111111', null),
  1,
  'revoking a member clears the sessions that were still live'
);

-- Additions beyond the brief's ten: each closes a gap between what the code
-- above already claims and what has actually been proven.

-- member_by_email filters on status <> 'removed', but nothing tried a removed
-- member's own address -- it must not get their row back just because the row
-- still exists.
insert into auth.users (id, email) values ('55555555-5555-5555-5555-555555555555', 'gone@trakline.in');
insert into console.members (user_id, email, name, role, status)
values ('55555555-5555-5555-5555-555555555555', 'gone@trakline.in', 'Gone', 'viewer', 'removed');
select is(public.console_auth_member_by_email('gone@trakline.in'), null, 'a removed member is not a member');

-- start_session relies on "on conflict (session_id) do nothing": a second
-- call for the same id must neither add a row nor overwrite the first one's
-- fields with whatever the replay happened to carry.
select public.console_auth_start_session(
  '99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111', 'First label', 'hash-first'
);
select public.console_auth_start_session(
  '99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111', 'Second label', 'hash-second'
);
select is(
  (select device_label = 'First label' and address_hash = 'hash-first'
     from console.sessions where session_id = '99999999-9999-9999-9999-999999999999'),
  true,
  'starting the same session id again is a no-op: it neither duplicates the row nor overwrites its fields'
);

-- verify_session's update excludes revoked_at is null, so a revoked session
-- always misses; it must raise 'session ended' there, not return as if it had
-- quietly succeeded.
select public.console_auth_start_session(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Soon revoked', 'hash-revoked'
);
select public.console_auth_revoke_session('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select throws_ok(
  $$select public.console_auth_verify_session('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333')$$,
  '28000',
  null,
  'verifying a revoked session raises instead of silently doing nothing'
);

-- take_challenge's update matches on member_id and purpose along with the
-- challenge string -- one challenge, tried as the wrong member and then under
-- the wrong purpose, must fail both times and stay unspent either way.
insert into auth.users (id, email) values ('66666666-6666-6666-6666-666666666666', 'second@trakline.in');
insert into console.members (user_id, email, name, role, status)
values ('66666666-6666-6666-6666-666666666666', 'second@trakline.in', 'Second', 'admin', 'active');

select public.console_auth_new_challenge(
  '11111111-1111-1111-1111-111111111111', null, 'sign_in', 'sign-in-challenge-0002', null
);
select is(
  public.console_auth_take_challenge('sign-in-challenge-0002', '66666666-6666-6666-6666-666666666666', 'sign_in'),
  null,
  'a challenge minted for one member cannot be taken by another'
);
select is(
  public.console_auth_take_challenge('sign-in-challenge-0002', '11111111-1111-1111-1111-111111111111', 'add_key'),
  null,
  'a sign_in challenge cannot be taken under a different purpose'
);

-- revoke_member_sessions' p_except is meant to spare the session a member is
-- currently completing sign-in on while every other session of theirs is
-- cleared -- proven here on a member with no prior session history, so the
-- count cannot be thrown off by sessions opened earlier in this file.
select public.console_auth_start_session(
  '77777777-7777-7777-7777-777777777777', '66666666-6666-6666-6666-666666666666', 'Kept session', 'hash-kept'
);
select public.console_auth_start_session(
  '88888888-8888-8888-8888-888888888888', '66666666-6666-6666-6666-666666666666', 'Other session', 'hash-other'
);
select is(
  public.console_auth_revoke_member_sessions('66666666-6666-6666-6666-666666666666', '77777777-7777-7777-7777-777777777777'),
  1,
  'revoking a member''s sessions with an exception revokes only the rest'
);
select is(
  (select revoked_at is null from console.sessions where session_id = '77777777-7777-7777-7777-777777777777'),
  true,
  'the excepted session is left alone'
);

-- Fix round 1: verify_session must scope its key check to the session's own
-- member. A nullable FK never checks a null, so p_key_id = null alone used to
-- satisfy the update; and a key that merely exists somewhere in console.keys
-- proved nothing about whose key it was. Both must miss exactly as a revoked
-- or missing session does, and the raise alone doesn't prove the row was left
-- untouched, so each case is checked both ways.

select public.console_auth_start_session(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Null key attempt', 'hash-nullkey'
);
select throws_ok(
  $$select public.console_auth_verify_session('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', null)$$,
  '28000',
  null,
  'verifying with a null key raises instead of verifying with no credential'
);
select is(
  (select key_verified_at is null from console.sessions where session_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  true,
  'the session is still not key-verified after the null-key attempt'
);

-- A key that exists, just not this member's, must miss the same way.
insert into console.keys (id, member_id, credential_id, public_key, counter, name, type)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', '66666666-6666-6666-6666-666666666666', '\x03'::bytea, '\x04'::bytea, 0, 'Someone else''s key', 'security_key');

select public.console_auth_start_session(
  'dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111111', 'Wrong member key attempt', 'hash-wrongkey'
);
select throws_ok(
  $$select public.console_auth_verify_session('dddddddd-dddd-dddd-dddd-dddddddddddd', 'cccccccc-cccc-cccc-cccc-cccccccccccc')$$,
  '28000',
  null,
  'verifying with another member''s key raises instead of verifying'
);
select is(
  (select key_verified_at is null from console.sessions where session_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  true,
  'the session is still not key-verified after the wrong-member-key attempt'
);

-- The ownership check must not turn into an accidental "same key every time"
-- check: a member's second key verifies their session just as well as the
-- first one did, re-verifying and rolling the expiry forward again.
insert into console.keys (id, member_id, credential_id, public_key, counter, name, type)
values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '11111111-1111-1111-1111-111111111111', '\x05'::bytea, '\x06'::bytea, 0, 'Second key', 'security_key');

select public.console_auth_start_session(
  'ffffffff-ffff-ffff-ffff-ffffffffffff', '11111111-1111-1111-1111-111111111111', 'Rolling verification', 'hash-rolling'
);
select public.console_auth_verify_session('ffffffff-ffff-ffff-ffff-ffffffffffff', '33333333-3333-3333-3333-333333333333');
select public.console_auth_verify_session('ffffffff-ffff-ffff-ffff-ffffffffffff', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
select is(
  (select key_verified_at is not null and key_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' and expires_at > now() + interval '6 days'
     from console.sessions where session_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'),
  true,
  'a member''s own second key still verifies their session, extending it again'
);

-- Fix round 2: verify_session's own WHERE clause must mirror
-- current_member()'s expiry and idle checks, not just revoked_at -- otherwise
-- a key tap on a long-expired or long-idle session revives it indefinitely,
-- and revocation becomes the only way a session ever ends. Each condition is
-- proven on its own, the way console_guard.test.sql already proves them for
-- current_member().

select public.console_auth_start_session(
  '12121212-1212-1212-1212-121212121212', '11111111-1111-1111-1111-111111111111', 'Long expired', 'hash-expired'
);
update console.sessions set expires_at = now() - interval '29 days'
 where session_id = '12121212-1212-1212-1212-121212121212';
select throws_ok(
  $$select public.console_auth_verify_session('12121212-1212-1212-1212-121212121212', '33333333-3333-3333-3333-333333333333')$$,
  '28000',
  null,
  'verifying an expired session raises instead of reviving it'
);
select is(
  (select key_verified_at is null and key_id is null and expires_at < now()
     from console.sessions where session_id = '12121212-1212-1212-1212-121212121212'),
  true,
  'the expired session is left unverified and its expiry is not pushed forward'
);

select public.console_auth_start_session(
  '13131313-1313-1313-1313-131313131313', '11111111-1111-1111-1111-111111111111', 'Long idle', 'hash-idle'
);
update console.sessions set expires_at = now() + interval '7 days',
                             last_seen_at = now() - interval '25 hours'
 where session_id = '13131313-1313-1313-1313-131313131313';
select throws_ok(
  $$select public.console_auth_verify_session('13131313-1313-1313-1313-131313131313', '33333333-3333-3333-3333-333333333333')$$,
  '28000',
  null,
  'verifying a session idle beyond 24 hours raises instead of reviving it'
);
select is(
  (select key_verified_at is null and key_id is null and last_seen_at < now() - interval '24 hours'
     from console.sessions where session_id = '13131313-1313-1313-1313-131313131313'),
  true,
  'the idle session is left unverified and its last_seen_at is not refreshed'
);

select * from finish();
rollback;
