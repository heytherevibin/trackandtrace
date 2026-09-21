begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

-- Grants: every one of these is the member's own call, so `authenticated` alone.
select is(has_function_privilege('authenticated', 'public.console_my_keys()', 'execute')::text, 'true', 'a member can list their own keys');
select is(has_function_privilege('anon', 'public.console_my_keys()', 'execute')::text, 'false', 'anon cannot');
select is(has_function_privilege('service_role', 'public.console_my_keys()', 'execute')::text, 'false', 'the service role has no business listing a member''s keys');
select is(has_function_privilege('authenticated', 'public.console_rename_key(uuid, text, text)', 'execute')::text, 'true', 'a member can rename their own key');
select is(has_function_privilege('service_role', 'public.console_rename_key(uuid, text, text)', 'execute')::text, 'false', 'the service role cannot rename a key');
select is(has_function_privilege('authenticated', 'public.console_remove_key(uuid, text, text)', 'execute')::text, 'true', 'a member can remove their own key');
select is(has_function_privilege('service_role', 'public.console_remove_key(uuid, text, text)', 'execute')::text, 'false', 'the service role cannot remove a key');
select is(has_function_privilege('authenticated', 'public.console_my_sessions()', 'execute')::text, 'true', 'a member can list their own sessions');
select is(has_function_privilege('authenticated', 'public.console_sign_out_others(text)', 'execute')::text, 'true', 'a member can sign their other sessions out');
select is(has_function_privilege('anon', 'public.console_sign_out_others(text)', 'execute')::text, 'false', 'anon cannot');

-- A member with a key-verified session and three keys.
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'asha@trakline.in');
insert into console.members (user_id, email, name, role, status)
values ('11111111-1111-1111-1111-111111111111', 'asha@trakline.in', 'Asha Rao', 'owner', 'active');
insert into console.keys (id, member_id, credential_id, public_key, counter, name, type)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '\x01'::bytea, '\x0a'::bytea, 0, 'YubiKey 5C', 'security_key'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '\x02'::bytea, '\x0b'::bytea, 0, 'YubiKey 5 NFC', 'security_key'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '\x03'::bytea, '\x0c'::bytea, 0, 'MacBook Pro', 'passkey');
insert into console.sessions (session_id, member_id, key_id, key_verified_at, device_label, address_hash, expires_at)
values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', now(), 'Chrome on macOS', 'hash', now() + interval '7 days'),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', now(), 'Safari on iPhone', 'hash', now() + interval '7 days');

-- A second member, so "not yours" can be tested against a key that really
-- exists and really belongs to someone else.
insert into auth.users (id, email) values ('44444444-4444-4444-4444-444444444444', 'devi@trakline.in');
insert into console.members (user_id, email, name, role, status)
values ('44444444-4444-4444-4444-444444444444', 'devi@trakline.in', 'Devi Menon', 'support', 'active');
insert into console.keys (id, member_id, credential_id, public_key, counter, name, type)
values ('bbbbbbbb-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', '\x04'::bytea, '\x0d'::bytea, 0, 'Devi''s YubiKey', 'security_key');

-- Act as that member, in that session -- through the claim alone, the same
-- idiom console_guard.test.sql and console_settings.test.sql use. The
-- console_* functions are security definer and read request.jwt.claims, not
-- current_user, so this is enough to exercise them as that member while this
-- session keeps the access it needs for the direct table reads below --
-- `authenticated` itself has no USAGE on schema console (console_schema.sql),
-- so actually switching role here would block those reads, not the functions.
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","session_id":"22222222-2222-2222-2222-222222222222"}';

select is(jsonb_array_length(public.console_my_keys() -> 'keys'), 3, 'all three keys come back');
select is(public.console_my_keys() -> 'keys' -> 0 ->> 'name', 'YubiKey 5C', 'oldest first');
select is(public.console_my_keys() -> 'member' ->> 'name', 'Asha Rao', 'the profile comes with them');
select is(public.console_my_keys() -> 'keys' -> 0 ->> 'type', 'security_key', 'the type is reported');
select ok(public.console_my_keys() -> 'keys' -> 0 ? 'created_at', 'and when it was added');
select ok(not (public.console_my_keys() -> 'keys' -> 0 ? 'credential_id'), 'but never the credential itself');
select ok(not (public.console_my_keys() -> 'keys' -> 0 ? 'public_key'), 'and never the public key');

select is(jsonb_array_length(public.console_my_sessions()), 2, 'both sessions come back');
select is(
  (select count(*)::int from jsonb_array_elements(public.console_my_sessions()) s where (s ->> 'is_current')::boolean),
  1,
  'exactly one is marked as this device'
);
select is(
  (select s ->> 'device_label' from jsonb_array_elements(public.console_my_sessions()) s where (s ->> 'is_current')::boolean),
  'Chrome on macOS',
  'and it is the session the claims name'
);

-- Renaming needs no tap, but it does need the key to be yours.
select public.console_rename_key('aaaaaaaa-0000-0000-0000-000000000003', 'MacBook Air', 'development');
select is(
  (select name from console.keys where id = 'aaaaaaaa-0000-0000-0000-000000000003'),
  'MacBook Air',
  'a rename lands'
);
-- Scoped to this file's own member. console.audit_log is append-only and deliberately survives
-- resetConsole() (it holds no foreign keys, which is what 2b built it for), so a bare count on
-- `action` alone sees every row any real run has written since the last `db:reset` -- an end-to-end
-- run of My keys renames a key too, and this then reads 2 where it wants 1.
select is(
  (select count(*)::int from console.audit_log where action = 'Renamed a key' and actor_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'and is written to the audit log'
);
select throws_ok(
  $$ select public.console_rename_key('99999999-9999-9999-9999-999999999999', 'Not mine', 'development') $$,
  '42501',
  null,
  'a key that is not yours cannot be renamed'
);
select throws_ok(
  $$ select public.console_rename_key('bbbbbbbb-0000-0000-0000-000000000001', 'Mine now', 'development') $$,
  '42501',
  null,
  'nor can another member''s key, which does exist'
);
select throws_ok(
  $$ select public.console_remove_key('bbbbbbbb-0000-0000-0000-000000000001', 'Not mine to remove.', 'development') $$,
  '42501',
  null,
  'and another member''s key cannot be removed either'
);

-- Removal without a tap is refused, whatever else is true.
select throws_ok(
  $$ select public.console_remove_key('aaaaaaaa-0000-0000-0000-000000000003', 'Left at the old office; replaced.', 'development') $$,
  '42501',
  null,
  'removing a key with no tap is refused'
);
select is((select count(*)::int from console.keys where member_id = '11111111-1111-1111-1111-111111111111'), 3, 'and removes nothing');

-- A tap bound to this exact removal.
select public.console_auth_new_challenge(
  '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
  'action', 'remove-key-challenge-value',
  console.action_digest('Removed a key', 'MacBook Air', '2', 'Left at the old office; replaced.')
);
select public.console_remove_key('aaaaaaaa-0000-0000-0000-000000000003', 'Left at the old office; replaced.', 'development');
select is((select count(*)::int from console.keys where member_id = '11111111-1111-1111-1111-111111111111'), 2, 'the key is gone');
select is(
  (select count(*)::int from console.audit_log where action = 'Removed a key' and target = 'MacBook Air'),
  1,
  'and the removal is in the audit log'
);
select is(
  (select used_at is not null from console.challenges where challenge = 'remove-key-challenge-value'),
  true,
  'the tap is spent'
);

-- The two-key rule bites even with a valid tap.
select public.console_auth_new_challenge(
  '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
  'action', 'remove-second-key-challenge',
  console.action_digest('Removed a key', 'YubiKey 5 NFC', '1', 'Down to two, trying anyway.')
);
select throws_ok(
  $$ select public.console_remove_key('aaaaaaaa-0000-0000-0000-000000000002', 'Down to two, trying anyway.', 'development') $$,
  '42501',
  null,
  'removing a key that would leave fewer than two is refused'
);
select is((select count(*)::int from console.keys where member_id = '11111111-1111-1111-1111-111111111111'), 2, 'and both remain');

-- Signing the others out leaves this one alone.
select is(public.console_sign_out_others('development'), 1, 'one other session was signed out');
select is(
  (select revoked_at is null from console.sessions where session_id = '22222222-2222-2222-2222-222222222222'),
  true,
  'this device stays signed in'
);
select is(
  (select revoked_at is not null from console.sessions where session_id = '33333333-3333-3333-3333-333333333333'),
  true,
  'the other one does not'
);
-- Scoped to this file's own member, for the same reason as the rename count above.
select is(
  (select count(*)::int from console.audit_log where action = 'Signed out other sessions' and actor_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'and it is in the audit log'
);
select is(public.console_sign_out_others('development'), 0, 'a second call finds nothing left to revoke');

-- Every one of these refuses outright without a live key-verified session.
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select throws_ok($$ select public.console_my_keys() $$, '28000', null, 'no session id, no keys');
select throws_ok($$ select public.console_my_sessions() $$, '28000', null, 'no session id, no sessions');

select * from finish();
rollback;
