begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

-- Every function here is service_role's alone: keys, invites and the Owner
-- list are steps the Next.js server takes for a member, or logs for
-- something that happened outside a member function. Supabase's default
-- privileges auto-grant EXECUTE on a new public-schema function to anon,
-- authenticated and service_role alike, so each side must be checked, not
-- just the side a revoke happens to name -- the same shape Task 7's test
-- uses.
select is(has_function_privilege('service_role', 'public.console_auth_keys_for_member(uuid)', 'execute')::text, 'true', 'service_role can list a member''s keys');
select is(has_function_privilege('authenticated', 'public.console_auth_keys_for_member(uuid)', 'execute')::text, 'false', 'authenticated cannot list a member''s keys directly');
select is(has_function_privilege('anon', 'public.console_auth_keys_for_member(uuid)', 'execute')::text, 'false', 'anon cannot list a member''s keys directly');

select is(has_function_privilege('service_role', 'public.console_auth_record_key(uuid, bytea, bytea, bigint, text[], text, console.key_type)', 'execute')::text, 'true', 'service_role can record a key');
select is(has_function_privilege('authenticated', 'public.console_auth_record_key(uuid, bytea, bytea, bigint, text[], text, console.key_type)', 'execute')::text, 'false', 'authenticated cannot record a key directly');
select is(has_function_privilege('anon', 'public.console_auth_record_key(uuid, bytea, bytea, bigint, text[], text, console.key_type)', 'execute')::text, 'false', 'anon cannot record a key directly');

select is(has_function_privilege('service_role', 'public.console_auth_touch_key(uuid, bigint)', 'execute')::text, 'true', 'service_role can touch a key');
select is(has_function_privilege('authenticated', 'public.console_auth_touch_key(uuid, bigint)', 'execute')::text, 'false', 'authenticated cannot touch a key directly');
select is(has_function_privilege('anon', 'public.console_auth_touch_key(uuid, bigint)', 'execute')::text, 'false', 'anon cannot touch a key directly');

select is(has_function_privilege('service_role', 'public.console_auth_accept_invite(bytea, uuid, text, text)', 'execute')::text, 'true', 'service_role can accept an invite');
select is(has_function_privilege('authenticated', 'public.console_auth_accept_invite(bytea, uuid, text, text)', 'execute')::text, 'false', 'authenticated cannot accept an invite directly');
select is(has_function_privilege('anon', 'public.console_auth_accept_invite(bytea, uuid, text, text)', 'execute')::text, 'false', 'anon cannot accept an invite directly');

select is(has_function_privilege('service_role', 'public.console_auth_owner_addresses()', 'execute')::text, 'true', 'service_role can list Owner addresses');
select is(has_function_privilege('authenticated', 'public.console_auth_owner_addresses()', 'execute')::text, 'false', 'authenticated cannot list Owner addresses directly');
select is(has_function_privilege('anon', 'public.console_auth_owner_addresses()', 'execute')::text, 'false', 'anon cannot list Owner addresses directly');

select is(has_function_privilege('service_role', 'public.console_auth_write_audit(text, uuid, text, console.member_role, uuid, text, text, text, text, text, console.audit_result, text, jsonb, jsonb)', 'execute')::text, 'true', 'service_role can write an audit row directly');
select is(has_function_privilege('authenticated', 'public.console_auth_write_audit(text, uuid, text, console.member_role, uuid, text, text, text, text, text, console.audit_result, text, jsonb, jsonb)', 'execute')::text, 'false', 'authenticated cannot write an audit row directly');
select is(has_function_privilege('anon', 'public.console_auth_write_audit(text, uuid, text, console.member_role, uuid, text, text, text, text, text, console.audit_result, text, jsonb, jsonb)', 'execute')::text, 'false', 'anon cannot write an audit row directly');

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in'),
  ('99999999-9999-9999-9999-999999999999', 'new@trakline.in');
insert into console.members (user_id, email, name, role, status)
values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in', 'Owner', 'owner', 'active');

select is(public.console_auth_keys_for_member('11111111-1111-1111-1111-111111111111'), '[]'::jsonb, 'a member starts with no keys');

select public.console_auth_record_key(
  '11111111-1111-1111-1111-111111111111', '\x01'::bytea, '\x02'::bytea, 0, array['usb'], 'Blue key', 'security_key'
) as first_key;

select is(
  jsonb_array_length(public.console_auth_keys_for_member('11111111-1111-1111-1111-111111111111')),
  1,
  'the key is handed to the ceremony'
);
select throws_ok(
  $$select public.console_auth_record_key('11111111-1111-1111-1111-111111111111', '\x01'::bytea, '\x03'::bytea, 0, array['usb'], 'Same key', 'security_key')$$,
  '23505',
  null,
  'the same key cannot be added twice'
);

-- Additions beyond the brief's nine: each closes a gap between what the code
-- above already claims and what has actually been proven.

-- record_key relies on console.keys' own FK to console.members; a member
-- that does not exist must raise, not silently create an orphan key.
select throws_ok(
  $$select public.console_auth_record_key('00000000-0000-0000-0000-000000000000', '\x0a'::bytea, '\x0b'::bytea, 0, array['usb'], 'Ghost key', 'security_key')$$,
  '23503',
  null,
  'a key cannot be registered for a member that does not exist'
);

select public.console_auth_touch_key(
  (select id from console.keys limit 1), 7
);
select is((select counter from console.keys limit 1)::int, 7, 'the counter moves forward');
select public.console_auth_touch_key((select id from console.keys limit 1), 3);
select is((select counter from console.keys limit 1)::int, 7, 'the counter never moves back');

-- keys_for_member filters on member_id; a second member's key must not leak
-- into another member's ceremony payload. Added only now, after the counter
-- assertions above, so their own `limit 1` still resolves to the one row
-- that exists at that point.
insert into auth.users (id, email) values ('22222222-2222-2222-2222-222222222222', 'second@trakline.in');
insert into console.members (user_id, email, name, role, status)
values ('22222222-2222-2222-2222-222222222222', 'second@trakline.in', 'Second', 'admin', 'active');

select public.console_auth_record_key(
  '22222222-2222-2222-2222-222222222222', '\x09'::bytea, '\x10'::bytea, 0, array['usb'], 'Second member key', 'security_key'
) as second_member_key;

select is(
  exists (
    select 1 from jsonb_array_elements(public.console_auth_keys_for_member('11111111-1111-1111-1111-111111111111')) e
    where e ->> 'credential_id' = encode('\x09'::bytea, 'base64')
  ),
  false,
  'a second member''s key does not appear in another member''s list'
);

-- Invites become members only once, and only while they are live.
insert into console.invites (email, role, invited_by, token_hash, expires_at)
values ('new@trakline.in', 'support', '11111111-1111-1111-1111-111111111111', '\xaa'::bytea, now() + interval '7 days');

select is(
  public.console_auth_accept_invite('\xaa'::bytea, '99999999-9999-9999-9999-999999999999', 'Asha', 'development') ->> 'role',
  'support',
  'accepting an invite makes the member with the invited role'
);
select is(
  (select status from console.members where user_id = '99999999-9999-9999-9999-999999999999')::text,
  'setup',
  'a new member starts in setup, before two keys'
);
select is(
  public.console_auth_accept_invite('\xaa'::bytea, '99999999-9999-9999-9999-999999999999', 'Asha', 'development'),
  null,
  'an invite cannot be accepted twice'
);

-- An invite whose window has closed must not be accepted, even though it was
-- never used or revoked. The accepter row is real (not a dangling uuid) so
-- that a latent bug reaching the insert would fail the assertion below
-- instead of aborting the transaction on a foreign key error.
insert into auth.users (id, email) values ('55555555-5555-5555-5555-555555555555', 'expired-accepter@trakline.in');
insert into console.invites (email, role, invited_by, token_hash, created_at, expires_at)
values ('expired@trakline.in', 'viewer', '11111111-1111-1111-1111-111111111111', '\xbb'::bytea, now() - interval '10 days', now() - interval '3 days');

select is(
  public.console_auth_accept_invite('\xbb'::bytea, '55555555-5555-5555-5555-555555555555', 'Late', 'development'),
  null,
  'an expired invite cannot be accepted'
);

-- A revoked invite must not be accepted either, even while still unexpired.
insert into auth.users (id, email) values ('66666666-6666-6666-6666-666666666666', 'revoked-accepter@trakline.in');
insert into console.invites (email, role, invited_by, token_hash, expires_at)
values ('revoked@trakline.in', 'viewer', '11111111-1111-1111-1111-111111111111', '\xcc'::bytea, now() + interval '7 days');
update console.invites set revoked_at = now() where token_hash = '\xcc'::bytea;

select is(
  public.console_auth_accept_invite('\xcc'::bytea, '66666666-6666-6666-6666-666666666666', 'Late', 'development'),
  null,
  'a revoked invite cannot be accepted'
);

select is(
  public.console_auth_owner_addresses(),
  array['owner@trakline.in'],
  'Security email goes to the Owners'
);

-- owner_addresses filters on role and status together; an Owner who is not
-- active must not receive Security email, whichever way they are not active.
insert into auth.users (id, email) values ('77777777-7777-7777-7777-777777777777', 'removed-owner@trakline.in');
insert into console.members (user_id, email, name, role, status)
values ('77777777-7777-7777-7777-777777777777', 'removed-owner@trakline.in', 'Removed Owner', 'owner', 'removed');

select is(
  public.console_auth_owner_addresses(),
  array['owner@trakline.in'],
  'a removed Owner does not receive Security email'
);

insert into auth.users (id, email) values ('88888888-8888-8888-8888-888888888888', 'setup-owner@trakline.in');
insert into console.members (user_id, email, name, role, status)
values ('88888888-8888-8888-8888-888888888888', 'setup-owner@trakline.in', 'Setup Owner', 'owner', 'setup');

select is(
  public.console_auth_owner_addresses(),
  array['owner@trakline.in'],
  'an Owner still in setup does not receive Security email'
);

-- The passthrough must reach console.write_audit itself, not a second,
-- unscrubbed insert: a reason carrying both an address and a ten-digit run
-- must come back scrubbed exactly as the member-facing writer scrubs it.
select public.console_auth_write_audit(
  'development', '11111111-1111-1111-1111-111111111111', 'Owner', 'owner', null, null,
  'security', 'Key tap failed (passthrough test)', null,
  'contact secret@trakline.in re case 1234567890', 'failed', null, null, null
) as passthrough_audit_id;

select is(
  (select reason from console.audit_log where action = 'Key tap failed (passthrough test)'),
  'contact [removed] re case [removed]',
  'the passthrough scrubs an address and a ten-digit run just as the member-facing writer does'
);

-- Fix round 1: possessing the token only proves someone holds the invite,
-- never that they are the person it names. Without also checking that the
-- accepting account's own address matches the invite, any live invite could
-- be redeemed against any existing member row, resetting that row's role.
-- The order matters too: the invite must only be marked accepted once the
-- identity check has passed, or a mismatched attempt would silently burn a
-- live invite even while being refused.

insert into console.invites (email, role, invited_by, token_hash, expires_at)
values ('mismatch@trakline.in', 'viewer', '11111111-1111-1111-1111-111111111111', '\xdd'::bytea, now() + interval '7 days');

insert into auth.users (id, email) values ('44444444-4444-4444-4444-444444444444', 'unrelated@trakline.in');

select is(
  public.console_auth_accept_invite('\xdd'::bytea, '44444444-4444-4444-4444-444444444444', 'Someone Else', 'development'),
  null,
  'accepting with an account whose address does not match the invite returns null'
);
select is(
  (select accepted_at is null from console.invites where token_hash = '\xdd'::bytea),
  true,
  'a mismatched attempt leaves the invite live -- it is not consumed by a failed identity check'
);

insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333', 'mismatch@trakline.in');
select is(
  public.console_auth_accept_invite('\xdd'::bytea, '33333333-3333-3333-3333-333333333333', 'Right Person', 'development') ->> 'role',
  'viewer',
  'the same invite can still be accepted by the address it was actually sent to'
);

-- Reinstatement is still meant to work -- just now only for the account the
-- invite actually names. The removed Owner from the owner_addresses checks
-- above is re-invited at their own address, under a new role, and comes back
-- in setup, the same as any other freshly accepted invite.
insert into console.invites (email, role, invited_by, token_hash, expires_at)
values ('removed-owner@trakline.in', 'admin', '11111111-1111-1111-1111-111111111111', '\xee'::bytea, now() + interval '7 days');

select is(
  public.console_auth_accept_invite('\xee'::bytea, '77777777-7777-7777-7777-777777777777', 'Removed Owner', 'development') ->> 'role',
  'admin',
  'a removed member re-invited at their own address is reinstated with the invited role'
);
select is(
  (select status from console.members where user_id = '77777777-7777-7777-7777-777777777777')::text,
  'setup',
  'reinstatement puts them back in setup, same as any other freshly accepted invite'
);

-- Strengthens the second-member leak check above: a regression that emptied
-- every member's key list, rather than merely leaking another member's key
-- into it, must fail here too.
select is(
  exists (
    select 1 from jsonb_array_elements(public.console_auth_keys_for_member('11111111-1111-1111-1111-111111111111')) e
    where e ->> 'credential_id' = encode('\x01'::bytea, 'base64')
  ),
  true,
  'the first member''s own key is still in their list after a second member registers one'
);

select * from finish();
rollback;
