begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

-- Minting the per-action tap's challenge (spec §D step 2) happens only through
-- the service role -- the same pre-session-verified boundary
-- console_auth_sessions.test.sql already proves for its own functions.
-- Supabase's default privileges auto-grant EXECUTE on a new public-schema
-- function to anon, authenticated and service_role alike, so all three are
-- checked, not just the side a revoke happens to name.
select is(has_function_privilege('service_role', 'public.console_auth_new_action_challenge(uuid, uuid, text, text, text, text, text)', 'execute')::text, 'true', 'service_role can mint an action challenge');
select is(has_function_privilege('authenticated', 'public.console_auth_new_action_challenge(uuid, uuid, text, text, text, text, text)', 'execute')::text, 'false', 'authenticated cannot mint an action challenge directly');
select is(has_function_privilege('anon', 'public.console_auth_new_action_challenge(uuid, uuid, text, text, text, text, text)', 'execute')::text, 'false', 'anon cannot mint an action challenge directly');

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in');
insert into console.members (user_id, email, name, role, status)
values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in', 'Owner', 'owner', 'active');
select public.console_auth_start_session(
  '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Chrome on macOS', 'hash'
);

select public.console_auth_new_action_challenge(
  '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
  'action-challenge-0001',
  'Removed a key', 'YubiKey 5 NFC', '2', 'Left at the old office.'
);

-- Pins ruling 1: the server hands over four fields, never a digest, and the
-- database computes it here -- with the very function console.use_tap() will
-- later recompute it with, so the two can never quietly drift apart.
select is(
  (select digest from console.challenges where challenge = 'action-challenge-0001'),
  console.action_digest('Removed a key', 'YubiKey 5 NFC', '2', 'Left at the old office.'),
  'the stored digest is exactly what console.action_digest computes over the same four fields'
);

select is(
  (select purpose::text from console.challenges where challenge = 'action-challenge-0001'),
  'action',
  'the minted row is an action challenge'
);
select ok(
  (select expires_at > created_at from console.challenges where challenge = 'action-challenge-0001'),
  'the challenge expires after it was created'
);
select ok(
  (select expires_at <= created_at + interval '5 minutes' from console.challenges where challenge = 'action-challenge-0001'),
  'and within five minutes of it, spec §D''s own window'
);
select is(
  (select used_at from console.challenges where challenge = 'action-challenge-0001'),
  null,
  'a freshly minted challenge is not yet used'
);

-- The binding is real, not incidental: a digest taken over a different reason
-- must not match, or a tap minted for one reason could cover a different one.
select isnt(
  (select digest from console.challenges where challenge = 'action-challenge-0001'),
  console.action_digest('Removed a key', 'YubiKey 5 NFC', '2', 'A different reason entirely.'),
  'a digest taken over a different reason does not equal the stored one'
);

-- ---------------------------------------------------------------------------
-- Recording that a key answered (final-fix.md §1).
--
-- A minted challenge proves only that someone asked for one. Until this
-- function existed, nothing anywhere recorded that a key had ever answered,
-- console.use_tap had no such fact to check, and two plain fetches -- mint,
-- then act -- performed a risky action with no WebAuthn ceremony at all. Only
-- the server may make this mark: it is the party that has just verified the
-- assertion, and a member's own session being able to mark its own challenge
-- would be the bypass all over again.
select is(has_function_privilege('service_role', 'public.console_auth_verify_challenge(text, uuid, uuid)', 'execute')::text, 'true', 'service_role can record that a key answered');
select is(has_function_privilege('authenticated', 'public.console_auth_verify_challenge(text, uuid, uuid)', 'execute')::text, 'false', 'a member cannot mark their own challenge answered');
select is(has_function_privilege('anon', 'public.console_auth_verify_challenge(text, uuid, uuid)', 'execute')::text, 'false', 'anon cannot either');

select is(
  (select verified_at from console.challenges where challenge = 'action-challenge-0001'),
  null,
  'a freshly minted challenge has no key''s answer on it'
);
select is(
  public.console_auth_verify_challenge('action-challenge-0001', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
  true,
  'the server records the answer and says it did'
);
select ok(
  (select verified_at is not null from console.challenges where challenge = 'action-challenge-0001'),
  'and the row carries it'
);

-- The same member, a second session. A tap answered on one device must not
-- mark a challenge minted on another -- console.use_tap already matches on
-- session, and this must not be the softer of the two checks.
select public.console_auth_start_session(
  '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Safari on iPhone', 'hash'
);
select public.console_auth_new_action_challenge(
  '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
  'action-challenge-0002',
  'Removed a key', 'YubiKey 5 NFC', '2', 'Left at the old office.'
);
select is(
  public.console_auth_verify_challenge('action-challenge-0002', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
  false,
  'a challenge minted in another session is not markable from this one'
);
select is(
  public.console_auth_verify_challenge('action-challenge-0002', '44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333'),
  false,
  'nor is it markable for a member it was never minted for'
);

-- Purpose is pinned to 'action' inside the function body, never taken from the
-- caller: a sign-in or add-key challenge has its own ceremony, which spends it
-- at verify, and must never be reachable through this path at all.
select public.console_auth_new_challenge(
  '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
  'add_key', 'add-key-challenge-0001', null::bytea
);
select is(
  public.console_auth_verify_challenge('add-key-challenge-0001', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
  false,
  'an add-key challenge is never markable through the action path'
);
select is(
  (select verified_at from console.challenges where challenge = 'add-key-challenge-0001'),
  null,
  'and it is left untouched'
);

-- A spent tap cannot be re-answered into life, and an expired one cannot be
-- answered at all. created_at is backdated with expires_at so the row still
-- opens inside its own five-minute window (console_challenges_expiry_window)
-- while reading as expired against the current instant -- the same idiom
-- console_guard.test.sql uses.
update console.challenges set used_at = now() where challenge = 'action-challenge-0001';
select is(
  public.console_auth_verify_challenge('action-challenge-0001', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
  false,
  'a spent challenge is not markable'
);

insert into console.challenges (member_id, session_id, purpose, challenge, digest, created_at, expires_at)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'action', 'action-challenge-0003',
        console.action_digest('Removed a key', 'YubiKey 5 NFC', '2', 'Too late.'),
        now() - interval '6 minutes', now() - interval '1 minute');
select is(
  public.console_auth_verify_challenge('action-challenge-0003', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
  false,
  'an expired challenge is not markable'
);

select * from finish();
rollback;
