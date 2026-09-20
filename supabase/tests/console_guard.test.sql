begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

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
  null,
  'a Viewer fails an admin gate'
);
update console.members set role = 'owner' where user_id = '11111111-1111-1111-1111-111111111111';

-- A session that has not tapped a key is not a session yet.
update console.sessions set key_verified_at = null where session_id = '22222222-2222-2222-2222-222222222222';
select throws_ok($$select console.current_member()$$, '28000', null, 'a session without a key tap is refused');
update console.sessions set key_verified_at = now() where session_id = '22222222-2222-2222-2222-222222222222';

update console.sessions set revoked_at = now() where session_id = '22222222-2222-2222-2222-222222222222';
select throws_ok($$select console.current_member()$$, '28000', null, 'a revoked session is refused');
update console.sessions set revoked_at = null where session_id = '22222222-2222-2222-2222-222222222222';

update console.members set status = 'removed' where user_id = '11111111-1111-1111-1111-111111111111';
select throws_ok($$select console.current_member()$$, '28000', null, 'a removed member is refused');
update console.members set status = 'active' where user_id = '11111111-1111-1111-1111-111111111111';

-- 24 hours unused ends a session, even though its week is not up.
update console.sessions set last_seen_at = now() - interval '25 hours'
 where session_id = '22222222-2222-2222-2222-222222222222';
select throws_ok($$select console.current_member()$$, '28000', null, 'a session unused for a day is refused');
update console.sessions set last_seen_at = now()
 where session_id = '22222222-2222-2222-2222-222222222222';

-- A session past its own expiry is refused too, even though it is key-verified and unrevoked.
update console.sessions set expires_at = now() - interval '1 hour'
 where session_id = '22222222-2222-2222-2222-222222222222';
select throws_ok($$select console.current_member()$$, '28000', null, 'an expired session is refused');
update console.sessions set expires_at = now() + interval '7 days'
 where session_id = '22222222-2222-2222-2222-222222222222';

-- A tap approves exactly one action, once.
insert into console.challenges (member_id, session_id, purpose, challenge, digest, expires_at)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'action', 'action-challenge-0001',
        console.action_digest('role.change', 'asha@trakline.in', 'support', 'cover'), now() + interval '5 minutes');

select lives_ok(
  $$select console.use_tap('role.change', 'asha@trakline.in', 'support', 'cover')$$,
  'the tap approves the action it was made for'
);
select throws_ok(
  $$select console.use_tap('role.change', 'asha@trakline.in', 'support', 'cover')$$,
  '42501',
  null,
  'the same tap cannot be used twice'
);

insert into console.challenges (member_id, session_id, purpose, challenge, digest, expires_at)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'action', 'action-challenge-0002',
        console.action_digest('role.change', 'asha@trakline.in', 'support', 'cover'), now() + interval '5 minutes');

select throws_ok(
  $$select console.use_tap('role.change', 'asha@trakline.in', 'owner', 'cover')$$,
  '42501',
  null,
  'a tap cannot approve a different value'
);

-- A tap made in one session cannot approve an action from a different session of the same member.
insert into console.sessions (session_id, member_id, address_hash, device_label, expires_at, key_verified_at)
values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'hash2', 'Safari on iPhone', now() + interval '7 days', now());

insert into console.challenges (member_id, session_id, purpose, challenge, digest, expires_at)
values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'action', 'action-challenge-0003',
        console.action_digest('key.reset', 'member@trakline.in', 'reset', 'lost device'), now() + interval '5 minutes');

select throws_ok(
  $$select console.use_tap('key.reset', 'member@trakline.in', 'reset', 'lost device')$$,
  '42501',
  null,
  'a tap made in another session does not work here'
);

-- An expired challenge cannot approve anything, even with a matching digest.
insert into console.challenges (member_id, session_id, purpose, challenge, digest, expires_at)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'action', 'action-challenge-0004',
        console.action_digest('key.remove', 'member@trakline.in', 'remove', 'stale'), now() - interval '1 minute');

select throws_ok(
  $$select console.use_tap('key.remove', 'member@trakline.in', 'remove', 'stale')$$,
  '42501',
  null,
  'an expired challenge does not work'
);

select * from finish();
rollback;
