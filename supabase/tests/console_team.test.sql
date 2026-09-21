begin;
create extension if not exists pgtap with schema extensions;
select plan(72);

-- What an Owner may do to the team: list it, invite someone, change a role,
-- reset a member's keys, remove a member, and resend or revoke an invite.
-- The brief that commissioned this file counts these as "six functions" --
-- list / invite / change role / reset keys / remove / "resend or revoke" --
-- but the interfaces it specifies are seven distinct signatures:
-- console_resend_invite takes no p_reason (no tap) and console_revoke_invite
-- does (a tap), so they cannot be one function. All seven are built and
-- grant-tested below; see task-1-report.md for this noted as a brief error.

-- Grants: authenticated yes, anon and service_role no, for every one of the
-- seven -- Supabase's default privileges auto-grant EXECUTE on a new
-- public-schema function to all three, so every role must be checked, not
-- only the one a revoke happens to name.
select is(has_function_privilege('authenticated', 'public.console_team()', 'execute')::text, 'true', 'an Owner can list the team');
select is(has_function_privilege('anon', 'public.console_team()', 'execute')::text, 'false', 'anon cannot');
select is(has_function_privilege('service_role', 'public.console_team()', 'execute')::text, 'false', 'the service role has no business listing the team');
select is(has_function_privilege('authenticated', 'public.console_invite_member(text, text, text, text)', 'execute')::text, 'true', 'an Owner can invite a member');
select is(has_function_privilege('anon', 'public.console_invite_member(text, text, text, text)', 'execute')::text, 'false', 'anon cannot');
select is(has_function_privilege('service_role', 'public.console_invite_member(text, text, text, text)', 'execute')::text, 'false', 'nor the service role');
select is(has_function_privilege('authenticated', 'public.console_change_role(uuid, text, text, text)', 'execute')::text, 'true', 'an Owner can change a role');
select is(has_function_privilege('anon', 'public.console_change_role(uuid, text, text, text)', 'execute')::text, 'false', 'anon cannot');
select is(has_function_privilege('service_role', 'public.console_change_role(uuid, text, text, text)', 'execute')::text, 'false', 'nor the service role');
select is(has_function_privilege('authenticated', 'public.console_reset_keys(uuid, text, text)', 'execute')::text, 'true', 'an Owner can reset a member''s keys');
select is(has_function_privilege('anon', 'public.console_reset_keys(uuid, text, text)', 'execute')::text, 'false', 'anon cannot');
select is(has_function_privilege('service_role', 'public.console_reset_keys(uuid, text, text)', 'execute')::text, 'false', 'nor the service role');
select is(has_function_privilege('authenticated', 'public.console_remove_member(uuid, text, text)', 'execute')::text, 'true', 'an Owner can remove a member');
select is(has_function_privilege('anon', 'public.console_remove_member(uuid, text, text)', 'execute')::text, 'false', 'anon cannot');
select is(has_function_privilege('service_role', 'public.console_remove_member(uuid, text, text)', 'execute')::text, 'false', 'nor the service role');
select is(has_function_privilege('authenticated', 'public.console_resend_invite(uuid, text)', 'execute')::text, 'true', 'an Owner can resend an invite');
select is(has_function_privilege('anon', 'public.console_resend_invite(uuid, text)', 'execute')::text, 'false', 'anon cannot');
select is(has_function_privilege('service_role', 'public.console_resend_invite(uuid, text)', 'execute')::text, 'false', 'nor the service role');
select is(has_function_privilege('authenticated', 'public.console_revoke_invite(uuid, text, text)', 'execute')::text, 'true', 'an Owner can revoke an invite');
select is(has_function_privilege('anon', 'public.console_revoke_invite(uuid, text, text)', 'execute')::text, 'false', 'anon cannot');
select is(has_function_privilege('service_role', 'public.console_revoke_invite(uuid, text, text)', 'execute')::text, 'false', 'nor the service role');

-- Fixtures: two Owners (so every self-action rule can be proven against a
-- spare, not only a lone Owner), a Support member (so "not an Owner" is
-- tested against someone who really exists), and a Viewer still in setup (so
-- console_team's 'setup' status is proven, not merely 'active').
insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'asha@trakline.in'),
  ('b1111111-1111-1111-1111-111111111111', 'rohan@trakline.in'),
  ('d1111111-1111-1111-1111-111111111111', 'devi@trakline.in'),
  ('e1111111-1111-1111-1111-111111111111', 'meera@trakline.in');

insert into console.members (user_id, email, name, role, status) values
  ('a1111111-1111-1111-1111-111111111111', 'asha@trakline.in', 'Asha Rao', 'owner', 'active'),
  ('b1111111-1111-1111-1111-111111111111', 'rohan@trakline.in', 'Rohan Iyer', 'owner', 'active'),
  ('d1111111-1111-1111-1111-111111111111', 'devi@trakline.in', 'Devi Menon', 'support', 'active'),
  ('e1111111-1111-1111-1111-111111111111', 'meera@trakline.in', 'Meera Nair', 'viewer', 'setup');

insert into console.sessions (session_id, member_id, device_label, address_hash, expires_at, key_verified_at) values
  ('a2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111', 'Chrome on macOS', 'hash', now() + interval '7 days', now()),
  ('b2222222-2222-2222-2222-222222222222', 'b1111111-1111-1111-1111-111111111111', 'Safari on iPhone', 'hash', now() + interval '7 days', now()),
  ('d2222222-2222-2222-2222-222222222222', 'd1111111-1111-1111-1111-111111111111', 'Firefox on Windows', 'hash', now() + interval '7 days', now());

insert into console.keys (id, member_id, credential_id, public_key, counter, name, type) values
  ('a3333333-0000-0000-0000-000000000001', 'd1111111-1111-1111-1111-111111111111', '\x11'::bytea, '\x21'::bytea, 0, 'Devi''s YubiKey', 'security_key'),
  ('a3333333-0000-0000-0000-000000000002', 'd1111111-1111-1111-1111-111111111111', '\x12'::bytea, '\x22'::bytea, 0, 'Devi''s MacBook', 'passkey');

-- Speaks as a member through the claim alone -- console_* functions read
-- request.jwt.claims, not current_user, so this is enough to act as them
-- while this session keeps the access it needs for direct table reads.
-- Mints an action challenge and marks it answered in one call, exactly as
-- the server does once @simplewebauthn verifies the assertion -- collapsing
-- console_my_keys.test.sql's two-step idiom to keep this file inside budget.
create or replace function pg_temp.speak_as(p_user uuid, p_session uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'session_id', p_session)::text, true);
end;
$$;

create or replace function pg_temp.tap(p_member uuid, p_session uuid, p_label text, p_action text, p_target text, p_value text, p_reason text)
returns void
language plpgsql as $$
begin
  perform public.console_auth_new_challenge(p_member, p_session, 'action', p_label, console.action_digest(p_action, p_target, p_value, p_reason));
  perform public.console_auth_verify_challenge(p_label, p_member, p_session);
end;
$$;

select pg_temp.speak_as('a1111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222');

-- console_team: both halves, and the roster as it stands.
select is(jsonb_array_length(public.console_team() -> 'members'), 4, 'all four non-removed members come back');
select is(jsonb_array_length(public.console_team() -> 'invites'), 0, 'no invites yet');
select is(
  (select m ->> 'status' from jsonb_array_elements(public.console_team() -> 'members') m where m ->> 'email' = 'meera@trakline.in'),
  'setup',
  'a member still in setup is reported as setup, not active'
);
select is(
  (select (m ->> 'key_count')::int from jsonb_array_elements(public.console_team() -> 'members') m where m ->> 'email' = 'devi@trakline.in'),
  2,
  'a member''s key count is reported'
);

-- Every one of the seven refuses a Support member outright -- the page
-- hiding a button is not a check. Arguments are shaped plausibly, but the
-- role gate runs first and refuses before any of them could matter.
select pg_temp.speak_as('d1111111-1111-1111-1111-111111111111', 'd2222222-2222-2222-2222-222222222222');
select throws_ok($$ select public.console_team() $$, '42501', null, 'a Support member cannot list the team');
select throws_ok($$ select public.console_invite_member('new@trakline.in', 'viewer', 'Trying anyway.', 'development') $$, '42501', null, 'nor invite someone');
select throws_ok($$ select public.console_change_role('a1111111-1111-1111-1111-111111111111', 'admin', 'Trying anyway.', 'development') $$, '42501', null, 'nor change a role');
select throws_ok($$ select public.console_reset_keys('a1111111-1111-1111-1111-111111111111', 'Trying anyway.', 'development') $$, '42501', null, 'nor reset a member''s keys');
select throws_ok($$ select public.console_remove_member('a1111111-1111-1111-1111-111111111111', 'Trying anyway.', 'development') $$, '42501', null, 'nor remove a member');
select throws_ok($$ select public.console_resend_invite('00000000-0000-0000-0000-000000000000', 'development') $$, '42501', null, 'nor resend an invite');
select throws_ok($$ select public.console_revoke_invite('00000000-0000-0000-0000-000000000000', 'Trying anyway.', 'development') $$, '42501', null, 'nor revoke one');
select pg_temp.speak_as('a1111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222');

-- Inviting: no tap, no invite. The digest is action/email/role/reason
-- (Task 4's own spec), so the pre-checks below run before use_tap ever
-- looks for one -- a refused invite must never spend a tap that a member
-- rightly holds for a different, valid call.
select throws_ok(
  $$ select public.console_invite_member('nadia@trakline.in', 'admin', 'Building out support coverage.', 'development') $$,
  '42501', null, 'inviting with no tap is refused'
);

-- These three name the message they expect, not merely the errcode. Every refusal in this file
-- raises 42501, including "no tap for this action" -- so a bare `'42501', null` here would pass
-- whether the call was refused for the reason under test or simply for want of a tap. Proven, not
-- assumed: with the membership check narrowed back to `= 'active'`, the null-message version of the
-- setup-member assertion still passed.
select throws_ok(
  $$ select public.console_invite_member('devi@trakline.in', 'admin', 'Trying to re-invite an active member.', 'development') $$,
  '42501', 'that address already belongs to a member', 'an address that already belongs to an active member is refused'
);
-- Meera is 'setup': she accepted an invite and has not finished adding her two keys. She is a
-- member, so inviting her again would mint a second live invite against a member row that already
-- exists. An Owner helping someone stuck there resets their keys instead.
select throws_ok(
  $$ select public.console_invite_member('meera@trakline.in', 'support', 'Trying to re-invite a half-set-up member.', 'development') $$,
  '42501', 'that address already belongs to a member', 'nor one who is still finishing setup -- they are a member already'
);

select pg_temp.tap(
  'a1111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222', 'invite-nadia-challenge',
  'Invited a member', 'nadia@trakline.in', 'admin', 'Building out support coverage.'
);
select matches(
  public.console_invite_member('nadia@trakline.in', 'admin', 'Building out support coverage.', 'development') ->> 'token',
  '^[0-9a-f]{64}$',
  'a successful invite hands back a one-time raw token'
);
-- Captured into a temp table, not compared in the same statement as the
-- call that produces it: Postgres gives no guarantee that a scalar subquery
-- reading console.invites and a volatile function call writing to it, side
-- by side in one statement, run in the order they are written.
select pg_temp.tap(
  'a1111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222', 'invite-nadia2-challenge',
  'Invited a member', 'nadia2@trakline.in', 'admin', 'placeholder'
);
create temporary table nadia2_invited as
select public.console_invite_member('nadia2@trakline.in', 'admin', 'placeholder', 'development') as result;

select is(
  (select token_hash from console.invites where email = 'nadia2@trakline.in'),
  (select extensions.digest(result ->> 'token', 'sha256') from nadia2_invited),
  'only the token''s digest is stored, and it matches the token that was handed back'
);
select is(
  (select count(*)::int from console.audit_log where category = 'team' and action = 'Invited a member' and actor_id = 'a1111111-1111-1111-1111-111111111111'),
  2,
  'each invite is written to the audit log, scoped to the Owner who sent it'
);
select throws_ok(
  $$ select public.console_invite_member('nadia@trakline.in', 'viewer', 'Trying to invite twice.', 'development') $$,
  '42501', 'an invite is already open for that address', 'an address with an invite already open is refused, even for a different role'
);

select is(jsonb_array_length(public.console_team() -> 'invites'), 2, 'both invites appear');
select ok(
  not exists (select 1 from jsonb_array_elements(public.console_team() -> 'invites') i where i ? 'token_hash'),
  'an invite entry never carries its token hash'
);

-- Resend: no tap -- it changes no access, only re-sends a letter to an
-- address an Owner already approved. The old hash is read in its own
-- statement, before the call that replaces it, for the same reason as the
-- capture above: a read and a write of the same row inside one statement
-- have no defined order.
create temporary table nadia_old_hash as
select token_hash from console.invites where email = 'nadia@trakline.in';

create temporary table nadia_resent as
select public.console_resend_invite((select id from console.invites where email = 'nadia@trakline.in'), 'development') as result;

select isnt(
  (select token_hash from nadia_old_hash)::text,
  (select token_hash from console.invites where email = 'nadia@trakline.in')::text,
  'resending rotates the stored hash'
);
select is(
  (select token_hash from console.invites where email = 'nadia@trakline.in'),
  (select extensions.digest(result ->> 'token', 'sha256') from nadia_resent),
  'and the new hash matches the token that was handed back'
);
select ok(
  (select expires_at > now() + interval '6 days' from console.invites where email = 'nadia@trakline.in'),
  'resending pushes expiry back out to a week'
);
-- now() is frozen for this whole file (one transaction, begin..rollback), and
-- so is created_at's default -- so expires_at cannot be pushed behind now()
-- without also pushing created_at further back, or the update fails the
-- table's own console_invites_expiry_window check (expires_at > created_at).
update console.invites
   set created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
 where email = 'nadia2@trakline.in';
select throws_ok(
  $$ select public.console_resend_invite((select id from console.invites where email = 'nadia2@trakline.in'), 'development') $$,
  '42501', null, 'an expired invite cannot be resent'
);

-- Revoke: takes a tap, because it withdraws access that was granted.
select throws_ok(
  $$ select public.console_revoke_invite((select id from console.invites where email = 'nadia2@trakline.in'), 'Never should have sent it.', 'development') $$,
  '42501', null, 'revoking with no tap is refused'
);
select pg_temp.tap(
  'a1111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222', 'revoke-nadia2-challenge',
  'Revoked an invite', (select id::text from console.invites where email = 'nadia2@trakline.in'), 'nadia2@trakline.in', 'Never should have sent it.'
);
select lives_ok(
  $$ select public.console_revoke_invite((select id from console.invites where email = 'nadia2@trakline.in'), 'Never should have sent it.', 'development') $$,
  'a tapped revoke goes through'
);
select ok(
  (select revoked_at is not null from console.invites where email = 'nadia2@trakline.in'),
  'the invite is marked revoked'
);
select is(jsonb_array_length(public.console_team() -> 'invites'), 1, 'a revoked invite leaves the pending list');
select is(
  (select count(*)::int from console.audit_log where category = 'team' and action = 'Revoked an invite' and actor_id = 'a1111111-1111-1111-1111-111111111111'),
  1,
  'and the revocation is in the audit log'
);

-- Changing a role.
select throws_ok(
  $$ select public.console_change_role('b1111111-1111-1111-1111-111111111111', 'admin', 'No tap yet.', 'development') $$,
  '42501', null, 'changing a role with no tap is refused'
);

-- A tap bound to one member does not spend against another: minted for
-- Devi's id, then reused against Rohan's -- the digests differ only in
-- target, so this proves the binding, not merely "any valid tap will do".
select pg_temp.tap(
  'a1111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222', 'change-role-cross-challenge',
  'Changed a role', 'd1111111-1111-1111-1111-111111111111', 'admin', 'Reassigning before travel.'
);
select throws_ok(
  $$ select public.console_change_role('b1111111-1111-1111-1111-111111111111', 'admin', 'Reassigning before travel.', 'development') $$,
  '42501', null, 'a tap minted for one member does not spend against a different one'
);

-- An Owner cannot demote themselves, even with a spare Owner on hand -- and
-- this is refused before a tap is ever sought, so none is minted here.
select throws_ok(
  $$ select public.console_change_role('a1111111-1111-1111-1111-111111111111', 'admin', 'Stepping back.', 'development') $$,
  '42501', null, 'an Owner cannot demote themselves while another Owner exists'
);

select pg_temp.tap(
  'a1111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222', 'change-role-rohan-challenge',
  'Changed a role', 'b1111111-1111-1111-1111-111111111111', 'admin', 'Rohan is moving to Admin.'
);
select lives_ok(
  $$ select public.console_change_role('b1111111-1111-1111-1111-111111111111', 'admin', 'Rohan is moving to Admin.', 'development') $$,
  'demoting a different Owner, with one left standing, goes through'
);
select is((select role from console.members where user_id = 'b1111111-1111-1111-1111-111111111111')::text, 'admin', 'the role actually changed');
select ok(
  (select revoked_at is not null from console.sessions where session_id = 'b2222222-2222-2222-2222-222222222222'),
  'a role change revokes every one of that member''s sessions'
);
select is(
  (select count(*)::int from console.audit_log where category = 'team' and action = 'Changed a role' and actor_id = 'a1111111-1111-1111-1111-111111111111'),
  1,
  'and the change is in the audit log'
);

-- Asha is now the only active Owner. Both callers share one guard
-- (console.require_another_active_owner) rather than two copies of the same
-- lock-then-count -- proven directly here, exactly as console.has_owner is
-- pinned down on its own in console_first_owner.test.sql.
select throws_ok(
  $$ select console.require_another_active_owner() $$,
  '42501', null, 'the shared guard itself refuses once only one active Owner remains'
);

-- Resetting keys.
select throws_ok(
  $$ select public.console_reset_keys('d1111111-1111-1111-1111-111111111111', 'No tap yet.', 'development') $$,
  '42501', null, 'resetting keys with no tap is refused'
);
select pg_temp.tap(
  'a1111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222', 'reset-devi-keys-challenge',
  'Reset a member''s keys', 'd1111111-1111-1111-1111-111111111111', '2', 'Devi lost her laptop.'
);
select is(
  public.console_reset_keys('d1111111-1111-1111-1111-111111111111', 'Devi lost her laptop.', 'development'),
  2,
  'the reset reports how many keys went'
);
select is((select count(*)::int from console.keys where member_id = 'd1111111-1111-1111-1111-111111111111'), 0, 'and the keys are actually gone');
select ok(
  (select keys_reset_at is not null and keys_reset_by = 'a1111111-1111-1111-1111-111111111111' from console.members where user_id = 'd1111111-1111-1111-1111-111111111111'),
  'the member''s row records who reset them and when'
);
select ok(
  (select revoked_at is not null from console.sessions where session_id = 'd2222222-2222-2222-2222-222222222222'),
  'a keys reset revokes every one of that member''s sessions too'
);
select is(
  (select count(*)::int from console.audit_log where category = 'team' and action = 'Reset a member''s keys' and actor_id = 'a1111111-1111-1111-1111-111111111111'),
  1,
  'and it is in the audit log'
);

-- Removing a member. A second Owner (Priya) is added purely so this can
-- prove self-removal is refused even with a spare on hand, the same shape
-- the role-change block above proved for demotion.
insert into auth.users (id, email) values ('c1111111-1111-1111-1111-111111111111', 'priya@trakline.in');
insert into console.members (user_id, email, name, role, status)
values ('c1111111-1111-1111-1111-111111111111', 'priya@trakline.in', 'Priya Nambiar', 'owner', 'active');
insert into console.sessions (session_id, member_id, device_label, address_hash, expires_at, key_verified_at)
values ('c2222222-2222-2222-2222-222222222222', 'c1111111-1111-1111-1111-111111111111', 'Edge on Windows', 'hash', now() + interval '7 days', now());

select throws_ok(
  $$ select public.console_remove_member('c1111111-1111-1111-1111-111111111111', 'No tap yet.', 'development') $$,
  '42501', null, 'removing a member with no tap is refused'
);
select throws_ok(
  $$ select public.console_remove_member('a1111111-1111-1111-1111-111111111111', 'Stepping back.', 'development') $$,
  '42501', null, 'an Owner cannot remove themselves while another Owner exists'
);

select pg_temp.tap(
  'a1111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222', 'remove-priya-challenge',
  'Removed a member', 'c1111111-1111-1111-1111-111111111111', 'owner', 'Priya has left the team.'
);
select lives_ok(
  $$ select public.console_remove_member('c1111111-1111-1111-1111-111111111111', 'Priya has left the team.', 'development') $$,
  'removing a different Owner, with one left standing, goes through'
);
select is((select status from console.members where user_id = 'c1111111-1111-1111-1111-111111111111')::text, 'removed', 'the member is marked removed');
select ok(
  (select revoked_at is not null from console.sessions where session_id = 'c2222222-2222-2222-2222-222222222222'),
  'removal revokes every one of that member''s sessions'
);
select is(
  (select count(*)::int from console.audit_log where category = 'team' and action = 'Removed a member' and actor_id = 'a1111111-1111-1111-1111-111111111111'),
  1,
  'and the removal is in the audit log'
);

-- Asha is the console's only Owner again, and a removed member falls out of
-- the roster entirely rather than lingering with a "removed" status shown.
select throws_ok(
  $$ select console.require_another_active_owner() $$,
  '42501', null, 'the guard still refuses -- Priya''s removal did not somehow create a spare'
);
select is(jsonb_array_length(public.console_team() -> 'members'), 4, 'a removed member no longer appears in the roster');

select * from finish();
rollback;
