begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- console_auth_accept_invite (2b, console_auth_keys.sql) needs an auth.users id before it can be
-- called at all, and the only thing it returns for "no such live invite" is a bare null -- the same
-- answer whether the token never existed, already expired, was withdrawn, or was already accepted.
-- Task 2b's sheet (ConsoleSetup.dc.html) draws "Invite expired" and "Invite withdrawn" as two
-- different screens, and the browser holding the raw token has no session yet to ask console_team
-- with, so this is the read that makes both possible: the same role console_auth_setup_link plays
-- for a first-Owner link. console_auth_accept_invite stays the only thing that may spend one.
select is(has_function_privilege('service_role', 'public.console_auth_invite(bytea)', 'execute')::text, 'true', 'service_role can read an invite by its token');
select is(has_function_privilege('authenticated', 'public.console_auth_invite(bytea)', 'execute')::text, 'false', 'a member cannot read an invite directly');
select is(has_function_privilege('anon', 'public.console_auth_invite(bytea)', 'execute')::text, 'false', 'anon cannot read an invite');

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in');
insert into console.members (user_id, email, name, role, status)
values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in', 'Asha Rao', 'owner', 'active');

insert into console.invites (email, role, invited_by, token_hash, expires_at)
values ('kiran.das@trakline.in', 'support', '11111111-1111-1111-1111-111111111111', extensions.digest('live-token', 'sha256'), now() + interval '7 days');

select is(
  public.console_auth_invite(extensions.digest('live-token', 'sha256')),
  jsonb_build_object('email', 'kiran.das@trakline.in', 'role', 'support', 'expired', false, 'withdrawn', false),
  'a live invite gives up its address and role, and neither refusal flag'
);

select is(public.console_auth_invite(extensions.digest('no-such-token', 'sha256')), null, 'a token nobody issued reads as nothing');

-- console_invites_expiry_window keeps expires_at inside (created_at, created_at + 7 days], so an
-- expired row needs both timestamps moved, the same shape console_member_api.test.sql uses for a
-- setup link.
insert into console.invites (email, role, invited_by, token_hash, created_at, expires_at)
values ('expired@trakline.in', 'viewer', '11111111-1111-1111-1111-111111111111', extensions.digest('expired-token', 'sha256'), now() - interval '10 days', now() - interval '3 days');
select is(
  (public.console_auth_invite(extensions.digest('expired-token', 'sha256')) ->> 'expired')::boolean,
  true,
  'a past-expiry invite reads as expired'
);

insert into console.invites (email, role, invited_by, token_hash, expires_at)
values ('withdrawn@trakline.in', 'viewer', '11111111-1111-1111-1111-111111111111', extensions.digest('withdrawn-token', 'sha256'), now() + interval '7 days');
update console.invites set revoked_at = now() where token_hash = extensions.digest('withdrawn-token', 'sha256');
select is(
  (public.console_auth_invite(extensions.digest('withdrawn-token', 'sha256')) ->> 'withdrawn')::boolean,
  true,
  'a revoked invite reads as withdrawn'
);

-- Accepting spends it (console_auth_accept_invite sets accepted_at): the read must not go on
-- offering an already-accepted invite as though it were still live.
update console.invites set accepted_at = now() where token_hash = extensions.digest('live-token', 'sha256');
select is(public.console_auth_invite(extensions.digest('live-token', 'sha256')), null, 'an already-accepted invite is gone from the read');

-- console_team's own rule ("Never token_hash"), checked here too: a read reachable before any
-- session exists must never be the thing that hands the digest back out.
select is(
  public.console_auth_invite(extensions.digest('expired-token', 'sha256')) ? 'token_hash',
  false,
  'the read never carries the token hash back out'
);

select * from finish();
rollback;
