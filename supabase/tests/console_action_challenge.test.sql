begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

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

select * from finish();
rollback;
