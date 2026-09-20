begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select has_table('console', 'keys', 'keys exists');
select has_table('console', 'sessions', 'sessions exists');
select has_table('console', 'challenges', 'challenges exists');

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in');
insert into console.members (user_id, email, name, role, status)
values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in', 'Owner', 'owner', 'active');

insert into console.keys (member_id, credential_id, public_key, counter, name, type)
values ('11111111-1111-1111-1111-111111111111', '\x01'::bytea, '\x02'::bytea, 0, 'Blue key', 'security_key');

-- The same credential can never be registered twice, by anyone.
select throws_ok(
  $$insert into console.keys (member_id, credential_id, public_key, counter, name, type)
    values ('11111111-1111-1111-1111-111111111111', '\x01'::bytea, '\x03'::bytea, 0, 'Copy', 'security_key')$$,
  '23505',
  null,
  'the same credential cannot be registered twice'
);

insert into console.sessions (session_id, member_id, address_hash, device_label, expires_at)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'hash', 'Chrome on macOS', now() + interval '7 days');

select is(
  (select key_verified_at is null from console.sessions where session_id = '22222222-2222-2222-2222-222222222222'),
  true,
  'a new session is not key-verified'
);
select is(
  (select revoked_at is null from console.sessions where session_id = '22222222-2222-2222-2222-222222222222'),
  true,
  'a new session is not revoked'
);

-- A sign-in challenge carries no digest; only an action tap does.
insert into console.challenges (member_id, session_id, purpose, challenge, expires_at)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'sign_in', 'sign-in-challenge-0001', now() + interval '5 minutes');

select is(
  (select used_at is null from console.challenges where challenge = 'sign-in-challenge-0001'),
  true,
  'a new challenge is unused'
);

-- An action tap is meaningless without the digest of what it approves.
select throws_ok(
  $$insert into console.challenges (member_id, session_id, purpose, challenge, expires_at)
    values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'action', 'action-challenge-0009', now() + interval '5 minutes')$$,
  '23514'::char(5),
  null,
  'an action challenge without a digest is refused'
);

-- A member's rows go when the member goes.
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select is((select count(*) from console.keys)::int, 0, 'keys follow the member');
select is((select count(*) from console.sessions)::int, 0, 'sessions follow the member');

select * from finish();
rollback;
