begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

select has_table('console', 'invites', 'invites exists');
select has_table('console', 'setup_links', 'setup_links exists');

select has_index('console', 'invites', 'console_invites_live_email_idx', 'invites has live_email_idx');

select col_not_null('console', 'invites', 'expires_at', 'invites.expires_at is not null');
select col_not_null('console', 'setup_links', 'expires_at', 'setup_links.expires_at is not null');

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in');
insert into console.members (user_id, email, name, role, status)
values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in', 'Owner', 'owner', 'active');

insert into console.invites (email, role, invited_by, token_hash, expires_at)
values ('new@trakline.in', 'support', '11111111-1111-1111-1111-111111111111', '\xaa'::bytea, now() + interval '7 days');

select is(
  (select expires_at > now() + interval '6 days' from console.invites where email = 'new@trakline.in'),
  true,
  'an invite lasts a week'
);

-- One live invite per address; a revoked or accepted one does not block a fresh one.
select throws_ok(
  $$insert into console.invites (email, role, invited_by, token_hash, expires_at)
    values ('new@trakline.in', 'viewer', '11111111-1111-1111-1111-111111111111', '\xbb'::bytea, now() + interval '7 days')$$,
  '23505'::char(5),
  null,
  'an address cannot hold two live invites'
);

-- Token uniqueness constraint
select throws_ok(
  $$insert into console.invites (email, role, invited_by, token_hash, expires_at)
    values ('other@trakline.in', 'viewer', '11111111-1111-1111-1111-111111111111', '\xaa'::bytea, now() + interval '7 days')$$,
  '23505'::char(5),
  null,
  'invites cannot share a token hash'
);

-- Email constraint: must be lowercase
select throws_ok(
  $$insert into console.invites (email, role, invited_by, token_hash, expires_at)
    values ('Mixed@trakline.in', 'viewer', '11111111-1111-1111-1111-111111111111', '\xcc'::bytea, now() + interval '7 days')$$,
  '23514'::char(5),
  null,
  'invites must have lowercase email'
);

-- FK constraint: invited_by must exist
select throws_ok(
  $$insert into console.invites (email, role, invited_by, token_hash, expires_at)
    values ('another@trakline.in', 'viewer', '99999999-9999-9999-9999-999999999999', '\xdd'::bytea, now() + interval '7 days')$$,
  '23503'::char(5),
  null,
  'invited_by must reference a real member'
);

update console.invites set revoked_at = now() where email = 'new@trakline.in';

select lives_ok(
  $$insert into console.invites (email, role, invited_by, token_hash, expires_at)
    values ('new@trakline.in', 'viewer', '11111111-1111-1111-1111-111111111111', '\xee'::bytea, now() + interval '7 days')$$,
  'a revoked invite frees the address'
);

insert into console.setup_links (email, token_hash, expires_at)
values ('owner@trakline.in', '\xff'::bytea, now() + interval '24 hours');

select is(
  (select used_at is null from console.setup_links where email = 'owner@trakline.in'),
  true,
  'a new setup link is unused'
);

-- Setup links token uniqueness
select throws_ok(
  $$insert into console.setup_links (email, token_hash, expires_at)
    values ('other@trakline.in', '\xff'::bytea, now() + interval '24 hours')$$,
  '23505'::char(5),
  null,
  'setup_links cannot share a token hash'
);

-- Setup links email constraint
select throws_ok(
  $$insert into console.setup_links (email, token_hash, expires_at)
    values ('Mixed@trakline.in', '\x99'::bytea, now() + interval '24 hours')$$,
  '23514'::char(5),
  null,
  'setup_links must have lowercase email'
);

-- Expiry window constraints: invites must fall within 7 days
select throws_ok(
  $$insert into console.invites (email, role, invited_by, token_hash, expires_at)
    values ('toolong@trakline.in', 'viewer', '11111111-1111-1111-1111-111111111111', '\x11'::bytea, now() + interval '30 days')$$,
  '23514'::char(5),
  null,
  'an invite cannot outlast a week'
);

select throws_ok(
  $$insert into console.invites (email, role, invited_by, token_hash, expires_at)
    values ('tooearly@trakline.in', 'viewer', '11111111-1111-1111-1111-111111111111', '\x22'::bytea, now() - interval '1 hour')$$,
  '23514'::char(5),
  null,
  'an invite cannot arrive expired'
);

-- Expiry window constraints: setup links must fall within 24 hours
select throws_ok(
  $$insert into console.setup_links (email, token_hash, expires_at)
    values ('toolong@trakline.in', '\x33'::bytea, now() + interval '48 hours')$$,
  '23514'::char(5),
  null,
  'the first-Owner link cannot outlast a day'
);

-- Boundary test: exactly 7 days should be accepted
select lives_ok(
  $$insert into console.invites (email, role, invited_by, token_hash, expires_at)
    values ('boundary@trakline.in', 'viewer', '11111111-1111-1111-1111-111111111111', '\x44'::bytea, now() + interval '7 days')$$,
  'a week to the second is still a week'
);

select * from finish();
rollback;
