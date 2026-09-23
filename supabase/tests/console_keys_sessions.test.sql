begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

select has_table('console', 'keys', 'keys exists');
select has_table('console', 'sessions', 'sessions exists');
select has_table('console', 'challenges', 'challenges exists');

select enum_has_labels('console', 'key_type', array['passkey', 'security_key'], 'every key type the plan names');
select enum_has_labels('console', 'challenge_purpose', array['sign_in', 'add_key', 'action', 'add_key_tap'], 'every challenge purpose the plan names');

select has_index('console', 'keys', 'console_keys_member_idx', 'keys has member_idx');
select has_index('console', 'sessions', 'console_sessions_member_idx', 'sessions has member_idx');
select has_index('console', 'sessions', 'console_sessions_live_idx', 'sessions has live_idx');
select has_index('console', 'challenges', 'console_challenges_open_idx', 'challenges has open_idx');

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
  'duplicate key value violates unique constraint "console_keys_credential_key"',
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

select col_not_null('console', 'sessions', 'expires_at', 'sessions.expires_at is not null');
select col_not_null('console', 'challenges', 'expires_at', 'challenges.expires_at is not null');

-- A sign-in challenge carries no digest; only an action tap does.
insert into console.challenges (member_id, session_id, purpose, challenge, expires_at)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'sign_in', 'sign-in-challenge-0001', now() + interval '5 minutes');

select is(
  (select used_at is null from console.challenges where challenge = 'sign-in-challenge-0001'),
  true,
  'a new challenge is unused'
);

-- The same challenge string can never be registered twice.
select throws_ok(
  $$insert into console.challenges (member_id, session_id, purpose, challenge, expires_at)
    values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'sign_in', 'sign-in-challenge-0001', now() + interval '5 minutes')$$,
  '23505'::char(5),
  'duplicate key value violates unique constraint "console_challenges_challenge_key"',
  'the same challenge string cannot be registered twice'
);

-- An action tap is meaningless without the digest of what it approves.
select throws_ok(
  $$insert into console.challenges (member_id, session_id, purpose, challenge, expires_at)
    values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'action', 'action-challenge-0009', now() + interval '5 minutes')$$,
  '23514'::char(5),
  'new row for relation "challenges" violates check constraint "console_challenges_action_digest"',
  'an action challenge without a digest is refused'
);

-- §D fixes a challenge's window at five minutes, the same reasoning Task 3
-- already applied to invites and setup_links: without a CHECK here, a later
-- function could mint one with an unbounded expiry.
select throws_ok(
  $$insert into console.challenges (member_id, session_id, purpose, challenge, expires_at)
    values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'sign_in', 'ten-minute-challenge', now() + interval '10 minutes')$$,
  '23514'::char(5),
  'new row for relation "challenges" violates check constraint "console_challenges_expiry_window"',
  'a challenge more than five minutes out is refused'
);
select lives_ok(
  $$insert into console.challenges (member_id, session_id, purpose, challenge, expires_at)
    values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'sign_in', 'five-minute-challenge', now() + interval '5 minutes')$$,
  'a challenge exactly five minutes out is accepted'
);

-- A member's rows go when the member goes. Counted over this member's own rows
-- and not over the table: `supabase test db` runs against the same database the
-- console e2e suite drove, and a run that leaves one member behind leaves their
-- two keys and their session behind with them -- which a bare count(*) reads as
-- this cascade having failed.
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select is((select count(*) from console.keys where member_id = '11111111-1111-1111-1111-111111111111')::int, 0, 'keys follow the member');
select is((select count(*) from console.sessions where member_id = '11111111-1111-1111-1111-111111111111')::int, 0, 'sessions follow the member');

select * from finish();
rollback;
