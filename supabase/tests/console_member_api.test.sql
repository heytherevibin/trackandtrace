begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

-- Grants first: the member's own call belongs to `authenticated` alone, and the
-- two service-role helpers to service_role alone. Supabase's default privileges
-- auto-grant EXECUTE on a new public-schema function to all three roles, so each
-- side is checked, not just the side a revoke happens to name.
select is(has_function_privilege('authenticated', 'public.console_me()', 'execute')::text, 'true', 'a signed-in member can ask who they are');
select is(has_function_privilege('anon', 'public.console_me()', 'execute')::text, 'false', 'anon cannot');
select is(has_function_privilege('service_role', 'public.console_me()', 'execute')::text, 'false', 'the service role has no business asking');

select is(has_function_privilege('service_role', 'public.console_auth_activate_member(uuid)', 'execute')::text, 'true', 'service_role can activate a member');
select is(has_function_privilege('authenticated', 'public.console_auth_activate_member(uuid)', 'execute')::text, 'false', 'a member cannot activate themselves');
select is(has_function_privilege('anon', 'public.console_auth_activate_member(uuid)', 'execute')::text, 'false', 'anon cannot activate a member');

select is(has_function_privilege('service_role', 'public.console_auth_read_challenge(text, uuid, text)', 'execute')::text, 'true', 'service_role can read a challenge');
select is(has_function_privilege('authenticated', 'public.console_auth_read_challenge(text, uuid, text)', 'execute')::text, 'false', 'a member cannot read a challenge directly');
select is(has_function_privilege('anon', 'public.console_auth_read_challenge(text, uuid, text)', 'execute')::text, 'false', 'anon cannot read a challenge');

select is(has_function_privilege('service_role', 'public.console_auth_session(uuid)', 'execute')::text, 'true', 'service_role can read a live session');
select is(has_function_privilege('authenticated', 'public.console_auth_session(uuid)', 'execute')::text, 'false', 'a member cannot read a session row directly');
select is(has_function_privilege('anon', 'public.console_auth_session(uuid)', 'execute')::text, 'false', 'anon cannot read a session row');

select is(has_function_privilege('service_role', 'public.console_auth_setup_link(bytea)', 'execute')::text, 'true', 'service_role can read a live setup link');
select is(has_function_privilege('authenticated', 'public.console_auth_setup_link(bytea)', 'execute')::text, 'false', 'a member cannot read a setup link');
select is(has_function_privilege('anon', 'public.console_auth_setup_link(bytea)', 'execute')::text, 'false', 'anon cannot read a setup link');

-- The fourth purpose exists, so a tap that unlocks adding a key can never be
-- spent as the registration challenge itself.
select is(
  (select count(*)::int from pg_enum e
     join pg_type t on t.oid = e.enumtypid
     join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'console' and t.typname = 'challenge_purpose'),
  4,
  'challenge_purpose has four values'
);
select is('add_key_tap'::console.challenge_purpose::text, 'add_key_tap', 'add_key_tap is one of them');

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in');
insert into console.members (user_id, email, name, role, status)
values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in', 'Asha Rao', 'owner', 'setup');

-- Activation is a rule, not a request: two keys or nothing.
select is(public.console_auth_activate_member('11111111-1111-1111-1111-111111111111'), false, 'a member with no keys is not activated');
select is(
  (select status::text from console.members where user_id = '11111111-1111-1111-1111-111111111111'),
  'setup',
  'and is left in setup'
);

insert into console.keys (member_id, credential_id, public_key, counter, name, type)
values ('11111111-1111-1111-1111-111111111111', '\x01'::bytea, '\x0a'::bytea, 0, 'Blue key', 'security_key');
select is(public.console_auth_activate_member('11111111-1111-1111-1111-111111111111'), false, 'one key is still not enough');

insert into console.keys (member_id, credential_id, public_key, counter, name, type)
values ('11111111-1111-1111-1111-111111111111', '\x02'::bytea, '\x0b'::bytea, 0, 'iPhone', 'passkey');
select is(public.console_auth_activate_member('11111111-1111-1111-1111-111111111111'), true, 'two keys activate the member');
select is(
  (select status::text from console.members where user_id = '11111111-1111-1111-1111-111111111111'),
  'active',
  'and the row says so'
);
select is(public.console_auth_activate_member('11111111-1111-1111-1111-111111111111'), true, 'activating an active member is a no-op that still reports active');

-- A removed member is not quietly reinstated by adding keys.
update console.members set status = 'removed' where user_id = '11111111-1111-1111-1111-111111111111';
select is(public.console_auth_activate_member('11111111-1111-1111-1111-111111111111'), false, 'a removed member is not activated by their keys');
update console.members set status = 'active' where user_id = '11111111-1111-1111-1111-111111111111';

-- The non-consuming read: same predicate as take_challenge, but the row survives.
insert into console.sessions (session_id, member_id, device_label, address_hash, expires_at, key_verified_at)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Chrome on macOS', 'hash', now() + interval '7 days', now());

select public.console_auth_new_challenge(
  '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
  'action', 'challenge-value-long-enough', console.action_digest('Pause checks', 'checks', 'off', 'Provider maintenance window.')
);

select is(
  public.console_auth_read_challenge('challenge-value-long-enough', '11111111-1111-1111-1111-111111111111', 'action') ->> 'purpose',
  'action',
  'the challenge reads back'
);
select is(
  (select used_at is null from console.challenges where challenge = 'challenge-value-long-enough'),
  true,
  'reading it does not spend it'
);
select is(
  public.console_auth_read_challenge('challenge-value-long-enough', '11111111-1111-1111-1111-111111111111', 'add_key') ,
  null,
  'another purpose does not match'
);
select is(
  public.console_auth_read_challenge('challenge-value-long-enough', '22222222-2222-2222-2222-222222222222', 'action'),
  null,
  'another member does not match'
);

update console.challenges set used_at = now() where challenge = 'challenge-value-long-enough';
select is(
  public.console_auth_read_challenge('challenge-value-long-enough', '11111111-1111-1111-1111-111111111111', 'action'),
  null,
  'a spent challenge is gone from the read'
);

-- console_challenges_expiry_window forbids expires_at <= created_at, so an expired row is made by
-- moving both: five minutes apart, and both in the past.
update console.challenges
   set used_at = null, created_at = now() - interval '6 minutes', expires_at = now() - interval '1 minute'
 where challenge = 'challenge-value-long-enough';
select is(
  public.console_auth_read_challenge('challenge-value-long-enough', '11111111-1111-1111-1111-111111111111', 'action'),
  null,
  'an expired challenge is gone from the read'
);

-- The key step's own pre-guard. It must see a session that is not key-verified yet -- that is what
-- the key step exists to change -- and must not see one that is revoked, expired, idle past a day,
-- or belongs to a removed member.
select is(
  public.console_auth_session('22222222-2222-2222-2222-222222222222') ->> 'member_id',
  '11111111-1111-1111-1111-111111111111',
  'a live session reads back with its member'
);
select is(
  (public.console_auth_session('22222222-2222-2222-2222-222222222222') ->> 'key_count')::int,
  2,
  'and reports how many keys that member holds'
);
select is(
  public.console_auth_session('99999999-9999-9999-9999-999999999999'),
  null,
  'a session id nobody opened reads as nothing'
);

update console.sessions set revoked_at = now() where session_id = '22222222-2222-2222-2222-222222222222';
select is(public.console_auth_session('22222222-2222-2222-2222-222222222222'), null, 'a revoked session is gone from the read');

update console.sessions set revoked_at = null, expires_at = now() - interval '1 second' where session_id = '22222222-2222-2222-2222-222222222222';
select is(public.console_auth_session('22222222-2222-2222-2222-222222222222'), null, 'an expired session is gone from the read');

update console.sessions set expires_at = now() + interval '7 days', last_seen_at = now() - interval '25 hours' where session_id = '22222222-2222-2222-2222-222222222222';
select is(public.console_auth_session('22222222-2222-2222-2222-222222222222'), null, 'a session idle beyond a day is gone from the read');

update console.sessions set last_seen_at = now() where session_id = '22222222-2222-2222-2222-222222222222';
update console.members set status = 'removed' where user_id = '11111111-1111-1111-1111-111111111111';
select is(public.console_auth_session('22222222-2222-2222-2222-222222222222'), null, 'a removed member has no session to read');
update console.members set status = 'active' where user_id = '11111111-1111-1111-1111-111111111111';

-- The first-Owner link, readable while live so the server can learn which address to sign in.
-- Reading it never spends it: console_auth_redeem_setup_link is the only thing that may.
insert into console.setup_links (email, token_hash, expires_at)
values ('first@trakline.in', extensions.digest('a-token', 'sha256'), now() + interval '24 hours');

select is(
  public.console_auth_setup_link(extensions.digest('a-token', 'sha256')) ->> 'email',
  'first@trakline.in',
  'a live setup link gives up the address it was made for'
);
select is(
  (select used_at is null from console.setup_links where email = 'first@trakline.in'),
  true,
  'reading a setup link does not spend it'
);
select is(public.console_auth_setup_link(extensions.digest('another-token', 'sha256')), null, 'a token nobody issued reads as nothing');

update console.setup_links set used_at = now() where email = 'first@trakline.in';
select is(public.console_auth_setup_link(extensions.digest('a-token', 'sha256')), null, 'a spent link is gone from the read');

-- console_setup_links_expiry_window keeps expires_at inside (created_at, created_at + 24h], so an
-- expired row needs both timestamps moved, exactly 24 hours apart.
update console.setup_links
   set used_at = null, created_at = now() - interval '25 hours', expires_at = now() - interval '1 hour'
 where email = 'first@trakline.in';
select is(public.console_auth_setup_link(extensions.digest('a-token', 'sha256')), null, 'an expired link is gone from the read');

-- console_me runs the guard, so with no claims at all it must refuse, not return null.
-- 'session ended' is the wording all five 28000 sites share, so it names the promise rather
-- than the branch -- see the note above the 28000 block in console_guard.test.sql. The branch
-- reached here is console.current_member's null-claims check: swapping that one's words fails
-- this assertion, and swapping any of the other four leaves it green.
select throws_ok(
  $$ select public.console_me() $$,
  '28000',
  'session ended',
  'without a session, asking who you are ends the session'
);

select * from finish();
rollback;
