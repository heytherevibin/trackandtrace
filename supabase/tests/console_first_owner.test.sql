begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- Only service_role may redeem a setup link. Supabase's default privileges
-- auto-grant EXECUTE on a new public-schema function to anon, authenticated
-- and service_role alike, so service_role must be named in the migration's
-- own revoke too, even though it is the very role granted back afterward --
-- the same shape Task 7 and Task 8's tests use.
select is(has_function_privilege('service_role', 'public.console_auth_redeem_setup_link(bytea, uuid, text, text, text)', 'execute')::text, 'true', 'service_role can redeem a setup link');
select is(has_function_privilege('authenticated', 'public.console_auth_redeem_setup_link(bytea, uuid, text, text, text)', 'execute')::text, 'false', 'authenticated cannot redeem a setup link directly');
select is(has_function_privilege('anon', 'public.console_auth_redeem_setup_link(bytea, uuid, text, text, text)', 'execute')::text, 'false', 'anon cannot redeem a setup link directly');

-- ---------------------------------------------------------------------------
-- Additions beyond the brief's seven. Each block runs against a clean slate
-- (no Owner, no setup_links row) and cleans up again afterward, so the
-- brief's own flow at the bottom -- unchanged -- still sees exactly the
-- single link and single Owner it was written against.
-- ---------------------------------------------------------------------------

-- This task's own version of Task 8's fix: possessing the token only proves
-- someone holds the link, never that they are the person it names. A
-- mismatched attempt must return null and leave the link live -- not spend
-- it -- so the right person can still redeem it afterward.
insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'rightful@trakline.in'),
  ('a2222222-2222-2222-2222-222222222222', 'impersonator@trakline.in');

select console.create_first_owner_link('rightful@trakline.in') as wrong_address_link;

select is(
  public.console_auth_redeem_setup_link(
    (select token_hash from console.setup_links where email = 'rightful@trakline.in'),
    'a2222222-2222-2222-2222-222222222222', 'rightful@trakline.in', 'Impersonator', 'development'
  ),
  null,
  'redeeming with an account whose address is not the link''s returns null'
);
select is(
  (select used_at is null from console.setup_links where email = 'rightful@trakline.in'),
  true,
  'a mismatched attempt leaves the link unused -- it is not consumed by a failed identity check'
);
select is(
  public.console_auth_redeem_setup_link(
    (select token_hash from console.setup_links where email = 'rightful@trakline.in'),
    'a1111111-1111-1111-1111-111111111111', 'rightful@trakline.in', 'Rightful Owner', 'development'
  ) ->> 'role',
  'owner',
  'the right account can still redeem it'
);

delete from console.setup_links;
delete from auth.users;

-- The guard asymmetry the controller corrected: guarding on status = 'active'
-- alone would let a second link redeem while the first Owner is still in
-- setup, and the console would end up with two Owners. Both links must be
-- made while no Owner exists yet -- create_first_owner_link itself refuses a
-- second one once an Owner exists -- so this is the only order that produces
-- two live links to test with. The same Owner-in-setup state also re-proves
-- create_first_owner_link's own guard, once with that Owner in setup and
-- once active.
insert into auth.users (id, email) values
  ('b1111111-1111-1111-1111-111111111111', 'owner-a@trakline.in'),
  ('b2222222-2222-2222-2222-222222222222', 'owner-b@trakline.in');

select console.create_first_owner_link('owner-a@trakline.in') as link_a;
select console.create_first_owner_link('owner-b@trakline.in') as link_b;

select public.console_auth_redeem_setup_link(
  (select token_hash from console.setup_links where email = 'owner-a@trakline.in'),
  'b1111111-1111-1111-1111-111111111111', 'owner-a@trakline.in', 'Owner A', 'development'
) as redeemed_a;

select is(
  public.console_auth_redeem_setup_link(
    (select token_hash from console.setup_links where email = 'owner-b@trakline.in'),
    'b2222222-2222-2222-2222-222222222222', 'owner-b@trakline.in', 'Owner B', 'development'
  ),
  null,
  'a second link made before any Owner existed cannot be redeemed once the first has been, though the first Owner is only in setup'
);
select throws_ok(
  $$select console.create_first_owner_link('setup-guard@trakline.in')$$,
  'P0001',
  null,
  'no first-Owner link while an Owner exists in setup'
);

update console.members set status = 'active' where email = 'owner-a@trakline.in';

select throws_ok(
  $$select console.create_first_owner_link('active-guard@trakline.in')$$,
  'P0001',
  null,
  'no first-Owner link while an Owner exists and active'
);

delete from console.setup_links;
delete from auth.users;

-- An expired link is otherwise valid -- unused, right address -- and still
-- must not redeem.
insert into auth.users (id, email) values ('c1111111-1111-1111-1111-111111111111', 'late@trakline.in');
insert into console.setup_links (email, token_hash, created_at, expires_at)
values ('late@trakline.in', '\xfa'::bytea, now() - interval '2 days', now() - interval '1 day');

select is(
  public.console_auth_redeem_setup_link(
    '\xfa'::bytea, 'c1111111-1111-1111-1111-111111111111', 'late@trakline.in', 'Late', 'development'
  ),
  null,
  'an expired setup link cannot be redeemed'
);

delete from console.setup_links;
delete from auth.users;

-- ---------------------------------------------------------------------------
-- The brief's own seven, unchanged.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'first@trakline.in');

select matches(
  console.create_first_owner_link('first@trakline.in'),
  '^https://admin\.trakline\.in/setup\?token=[0-9a-f]{64}$',
  'the statement hands back a one-time link'
);
select is((select count(*)::int from console.setup_links), 1, 'the link is stored');
select is(
  (select token_hash is not null and expires_at > now() + interval '23 hours' from console.setup_links limit 1),
  true,
  'only the hash is kept, and it lasts a day'
);

-- Redeem it: the first Owner appears, in setup until two keys exist.
select is(
  public.console_auth_redeem_setup_link(
    (select token_hash from console.setup_links limit 1),
    '11111111-1111-1111-1111-111111111111', 'first@trakline.in', 'First Owner', 'development'
  ) ->> 'role',
  'owner',
  'redeeming the link makes the first Owner'
);
select is(
  (select status from console.members where user_id = '11111111-1111-1111-1111-111111111111')::text,
  'setup',
  'the first Owner starts in setup'
);

-- It is one-time, and once an Owner exists no further link can be made.
select is(
  public.console_auth_redeem_setup_link(
    (select token_hash from console.setup_links limit 1),
    '11111111-1111-1111-1111-111111111111', 'first@trakline.in', 'First Owner', 'development'
  ),
  null,
  'the link cannot be redeemed twice'
);
select throws_ok(
  $$select console.create_first_owner_link('second@trakline.in')$$,
  'P0001',
  null,
  'no second first-Owner link once the console has an Owner'
);

select * from finish();
rollback;
