begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in');
insert into console.members (user_id, email, name, role, status)
values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in', 'Owner', 'owner', 'active');
insert into console.sessions (session_id, member_id, address_hash, device_label, expires_at, key_verified_at)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'hash', 'Chrome on macOS', now() + interval '7 days', now());

-- Speak as that member, with that session, the way the JWT does.
create or replace function pg_temp.speak_as(p_user uuid, p_session uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'session_id', p_session)::text, true);
end;
$$;

select pg_temp.speak_as('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
select is((console.current_member()).email, 'owner@trakline.in', 'a key-verified session finds its member');
select is((console.require_role('admin')).role::text, 'owner', 'an Owner passes an admin gate');

-- require_role refuses a caller who ranks below what is asked.
update console.members set role = 'viewer' where user_id = '11111111-1111-1111-1111-111111111111';
select throws_ok(
  $$select console.require_role('admin')$$,
  '42501',
  'no access',
  'a Viewer fails an admin gate'
);
update console.members set role = 'owner' where user_id = '11111111-1111-1111-1111-111111111111';

-- A null rank can never pass: role_rank has no ELSE, so null < null is null,
-- which plpgsql's IF treats as false unless this is checked explicitly.
--
-- What the named message can and cannot prove here, said plainly rather than implied.
-- console.require_role holds two checks and both raise this same 'no access': the explicit
-- `p_least is null` one, and the `v_least_rank is null` arm of the rank comparison below it.
-- role_rank covers all four labels of console.member_role, so a null argument is the only way to
-- reach either arm -- and with one check deleted the other still refuses, identically. Proven, not
-- assumed: with `p_least is null` removed from the function, this whole file still passed. So the
-- assertion pins the behaviour ("a null rank never passes"), never one of the two lines, and no
-- fixture can change that -- unlike the pair in console_team.test.sql, where a real invite id lets
-- the call reach past the guard that was shadowing the one under test.
select throws_ok(
  $$select console.require_role(null)$$,
  '42501',
  'no access',
  'require_role refuses a null rank'
);

-- The seven below all name 'session ended', and that name does NOT say which check refused.
-- It cannot: five raise sites answer 28000 and every one of them says exactly those two words
-- -- console.claim_uuid's invalid_text_representation handler, console.current_member's
-- null-claims check, its sessions-row `not found` and its members-row `not found` (all four in
-- 20260920090400_console_guard.sql), and console_auth_verify_session
-- (20260920090600_console_auth_sessions.sql:70). The sameness is the point, not an oversight:
-- claim_uuid's own comment says it fails closed with "the same 'session ended' this guard
-- promises everywhere else, instead of leaking whatever raw cast error Postgres happens to
-- raise", and a console that answered differently for revoked, expired, idle, removed and
-- malformed would tell an attacker which one they had hit. So the name pins the promise, not
-- the branch, and nothing here should be read as pinning the branch.
--
-- What the branches actually are, measured by swapping each raise site's words one at a time
-- and keeping its errcode: the four sessions-row conditions below (no key tap, revoked, idle a
-- day, expired) all land on the one `not found` after the sessions update -- one site, four
-- assertions, indistinguishable. The removed-member one lands on the members-row `not found`.
-- The last three cover the two claims sites, one of which this file used to miss entirely:
-- two reach claim_uuid's cast handler by its two different routes, and the empty-object one
-- reaches current_member's null-claims check. Naming the message still earns its place: it is
-- the only thing asserting the wording those five sites are required to share.
--
-- A session that has not tapped a key is not a session yet.
update console.sessions set key_verified_at = null where session_id = '22222222-2222-2222-2222-222222222222';
select throws_ok($$select console.current_member()$$, '28000', 'session ended', 'a session without a key tap is refused');
update console.sessions set key_verified_at = now() where session_id = '22222222-2222-2222-2222-222222222222';

update console.sessions set revoked_at = now() where session_id = '22222222-2222-2222-2222-222222222222';
select throws_ok($$select console.current_member()$$, '28000', 'session ended', 'a revoked session is refused');
update console.sessions set revoked_at = null where session_id = '22222222-2222-2222-2222-222222222222';

update console.members set status = 'removed' where user_id = '11111111-1111-1111-1111-111111111111';
select throws_ok($$select console.current_member()$$, '28000', 'session ended', 'a removed member is refused');
update console.members set status = 'active' where user_id = '11111111-1111-1111-1111-111111111111';

-- 24 hours unused ends a session, even though its week is not up.
update console.sessions set last_seen_at = now() - interval '25 hours'
 where session_id = '22222222-2222-2222-2222-222222222222';
select throws_ok($$select console.current_member()$$, '28000', 'session ended', 'a session unused for a day is refused');
update console.sessions set last_seen_at = now()
 where session_id = '22222222-2222-2222-2222-222222222222';

-- A session past its own expiry is refused too, even though it is key-verified and unrevoked.
update console.sessions set expires_at = now() - interval '1 hour'
 where session_id = '22222222-2222-2222-2222-222222222222';
select throws_ok($$select console.current_member()$$, '28000', 'session ended', 'an expired session is refused');
update console.sessions set expires_at = now() + interval '7 days'
 where session_id = '22222222-2222-2222-2222-222222222222';

-- Three ways the claims themselves can fail, and they are three, not two.
--
-- This one used to be one assertion reading "no claims at all is refused", and it did not test
-- that. `set_config(..., '', true)` leaves an empty string, not an absent setting, and
-- ''::jsonb raises before any claim is read -- so it reached claim_uuid's cast handler, the
-- same site as the malformed subject below it, and current_member's null-claims check went
-- untested here. Nor can an absent setting be staged from inside this file: once a session has
-- set request.jwt.claims, neither `set_config(..., NULL, true)` nor `reset` restores NULL --
-- both leave '' -- and pg_temp.speak_as has already set it far above. Measured, not assumed.
--
-- So the empty string keeps its assertion under the name it actually earns, and claims that
-- parse but carry no identity get their own. Both routes into the cast handler are worth
-- holding separately: '' fails at the jsonb cast and 'not-a-uuid' at the uuid cast, and
-- claim_uuid's comment warns that moving that expression into a DECLARE initializer would stop
-- the handler catching it -- the empty string is the one that would notice first.

-- An empty claims string is not parseable JSON, and fails closed at the jsonb cast.
select set_config('request.jwt.claims', '', true);
select throws_ok($$select console.current_member()$$, '28000', 'session ended', 'an empty claims string is refused');

-- Claims that parse but name nobody: no subject, no session. This is the one that reaches
-- current_member's `v_user is null or v_session is null`, and nothing else in this file does.
select set_config('request.jwt.claims', '{}', true);
select throws_ok($$select console.current_member()$$, '28000', 'session ended', 'claims naming no subject and no session are refused');

-- A malformed claim fails closed too: 28000, never the raw cast error underneath.
select set_config('request.jwt.claims', json_build_object('sub', 'not-a-uuid')::text, true);
select throws_ok($$select console.current_member()$$, '28000', 'session ended', 'a malformed claims subject is refused, not a raw cast error');

-- Restore the good claims so every assertion from here on speaks as the member again.
select pg_temp.speak_as('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

-- A separator byte inside a field cannot shift where one field ends and the
-- next begins -- this is the regression the per-field hashing must never let
-- back in.
select is(
  console.action_digest('A', 'B' || chr(31) || 'C', 'D', 'E') = console.action_digest('A', 'B', 'C' || chr(31) || 'D', 'E'),
  false,
  'a separator inside a field cannot shift the boundaries'
);

-- A challenge no key ever answered approves nothing, however well its digest
-- matches. This is the whole of the bypass a branch review found: until
-- verified_at existed, minting a challenge was the entire cost of an action,
-- and two plain fetches removed a key with no WebAuthn ceremony at all. Every
-- other insert in this file carries verified_at for exactly this reason -- the
-- ones that are meant to work now have to say a key answered.
insert into console.challenges (member_id, session_id, purpose, challenge, digest, expires_at)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'action', 'action-challenge-0000',
        console.action_digest('role.change', 'asha@trakline.in', 'support', 'cover'), now() + interval '5 minutes');

select throws_ok(
  $$select console.use_tap('role.change', 'asha@trakline.in', 'support', 'cover')$$,
  '42501',
  'no tap for this action',
  'a challenge no key answered approves nothing, whatever its digest says'
);

update console.challenges set verified_at = now() where challenge = 'action-challenge-0000';

-- A tap approves exactly one action, once.
select lives_ok(
  $$select console.use_tap('role.change', 'asha@trakline.in', 'support', 'cover')$$,
  'the tap approves the action it was made for'
);
select throws_ok(
  $$select console.use_tap('role.change', 'asha@trakline.in', 'support', 'cover')$$,
  '42501',
  'no tap for this action',
  'the same tap cannot be used twice'
);

insert into console.challenges (member_id, session_id, purpose, challenge, digest, expires_at, verified_at)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'action', 'action-challenge-0002',
        console.action_digest('role.change', 'asha@trakline.in', 'support', 'cover'), now() + interval '5 minutes', now());

select throws_ok(
  $$select console.use_tap('role.change', 'asha@trakline.in', 'owner', 'cover')$$,
  '42501',
  'no tap for this action',
  'a tap cannot approve a different value'
);

-- A tap made for one action does not approve another, even with the same target, value and reason.
insert into console.challenges (member_id, session_id, purpose, challenge, digest, expires_at, verified_at)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'action', 'action-challenge-0005',
        console.action_digest('role.change', 'asha@trakline.in', 'support', 'cover'), now() + interval '5 minutes', now());

select throws_ok(
  $$select console.use_tap('member.remove', 'asha@trakline.in', 'support', 'cover')$$,
  '42501',
  'no tap for this action',
  'a tap made for one action does not approve another'
);

-- A tap made in one session cannot approve an action from a different session of the same member.
insert into console.sessions (session_id, member_id, address_hash, device_label, expires_at, key_verified_at)
values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'hash2', 'Safari on iPhone', now() + interval '7 days', now());

insert into console.challenges (member_id, session_id, purpose, challenge, digest, expires_at, verified_at)
values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'action', 'action-challenge-0003',
        console.action_digest('key.reset', 'member@trakline.in', 'reset', 'lost device'), now() + interval '5 minutes', now());

select throws_ok(
  $$select console.use_tap('key.reset', 'member@trakline.in', 'reset', 'lost device')$$,
  '42501',
  'no tap for this action',
  'a tap made in another session does not work here'
);

-- An expired challenge cannot approve anything, even with a matching digest.
-- created_at is backdated along with expires_at, six minutes and one minute
-- back respectively, so the row still opens within its own five-minute
-- window (console_challenges_expiry_window) while still reading as expired
-- against the current instant, which is what use_tap's own check runs on.
insert into console.challenges (member_id, session_id, purpose, challenge, digest, created_at, expires_at, verified_at)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'action', 'action-challenge-0004',
        console.action_digest('key.remove', 'member@trakline.in', 'remove', 'stale'), now() - interval '6 minutes', now() - interval '1 minute', now() - interval '2 minutes');

select throws_ok(
  $$select console.use_tap('key.remove', 'member@trakline.in', 'remove', 'stale')$$,
  '42501',
  'no tap for this action',
  'an expired challenge does not work'
);

select * from finish();
rollback;
