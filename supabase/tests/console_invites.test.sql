begin;
create extension if not exists pgtap with schema extensions;

-- A refusal that comes from a constraint, asserted by the constraint's own name instead of the
-- sentence Postgres wraps it in. `get stacked diagnostics ... CONSTRAINT_NAME` reads the error's
-- structured field, which the constraint machinery fills in whatever words the server is built
-- to print, so these assertions survive a rewording that throws_ok's exact-message form would
-- not. Detection is unchanged: a renamed or dropped constraint still fails, and so does a
-- statement that raises nothing. Only errors that carry a constraint belong here -- a not-null
-- violation and an application `raise` both leave CONSTRAINT_NAME empty, which this reports as
-- '<no constraint>' rather than passing. Defined per file, like pg_temp.speak_as: every test
-- file here is self-contained.
create or replace function pg_temp.throws_constraint(
  p_sql text, p_errcode text, p_constraint text, p_description text
) returns text language plpgsql as $tc$
declare
  v_code       text;
  v_constraint text;
begin
  execute p_sql;
  return extensions.is('nothing raised', p_errcode || ' on ' || p_constraint, p_description);
exception when others then
  get stacked diagnostics v_code = RETURNED_SQLSTATE, v_constraint = CONSTRAINT_NAME;
  return extensions.is(
    v_code || ' on ' || coalesce(nullif(v_constraint, ''), '<no constraint>'),
    p_errcode || ' on ' || p_constraint,
    p_description
  );
end $tc$;

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
select pg_temp.throws_constraint(
  $$insert into console.invites (email, role, invited_by, token_hash, expires_at)
    values ('new@trakline.in', 'viewer', '11111111-1111-1111-1111-111111111111', '\xbb'::bytea, now() + interval '7 days')$$,
  '23505', 'console_invites_live_email_idx',
  'an address cannot hold two live invites'
);

-- Token uniqueness constraint
select pg_temp.throws_constraint(
  $$insert into console.invites (email, role, invited_by, token_hash, expires_at)
    values ('other@trakline.in', 'viewer', '11111111-1111-1111-1111-111111111111', '\xaa'::bytea, now() + interval '7 days')$$,
  '23505', 'console_invites_token_key',
  'invites cannot share a token hash'
);

-- Email constraint: must be lowercase
select pg_temp.throws_constraint(
  $$insert into console.invites (email, role, invited_by, token_hash, expires_at)
    values ('Mixed@trakline.in', 'viewer', '11111111-1111-1111-1111-111111111111', '\xcc'::bytea, now() + interval '7 days')$$,
  '23514', 'invites_email_check',
  'invites must have lowercase email'
);

-- FK constraint: invited_by must exist
select pg_temp.throws_constraint(
  $$insert into console.invites (email, role, invited_by, token_hash, expires_at)
    values ('another@trakline.in', 'viewer', '99999999-9999-9999-9999-999999999999', '\xdd'::bytea, now() + interval '7 days')$$,
  '23503', 'invites_invited_by_fkey',
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
select pg_temp.throws_constraint(
  $$insert into console.setup_links (email, token_hash, expires_at)
    values ('other@trakline.in', '\xff'::bytea, now() + interval '24 hours')$$,
  '23505', 'console_setup_links_token_key',
  'setup_links cannot share a token hash'
);

-- Setup links email constraint
select pg_temp.throws_constraint(
  $$insert into console.setup_links (email, token_hash, expires_at)
    values ('Mixed@trakline.in', '\x99'::bytea, now() + interval '24 hours')$$,
  '23514', 'setup_links_email_check',
  'setup_links must have lowercase email'
);

-- Expiry window constraints: invites must fall within 7 days. These two name the same words:
-- console_invites_expiry_window is one constraint holding both ends of the window
-- (`expires_at > created_at and expires_at <= created_at + 7 days`), and Postgres reports the
-- constraint, not the conjunct. The message pins the constraint; the fixtures pin the ends --
-- re-added with only `expires_at > created_at` the too-long one fails, with only the 7-day
-- bound the already-expired one does.
select pg_temp.throws_constraint(
  $$insert into console.invites (email, role, invited_by, token_hash, expires_at)
    values ('toolong@trakline.in', 'viewer', '11111111-1111-1111-1111-111111111111', '\x11'::bytea, now() + interval '30 days')$$,
  '23514', 'console_invites_expiry_window',
  'an invite cannot outlast a week'
);

select pg_temp.throws_constraint(
  $$insert into console.invites (email, role, invited_by, token_hash, expires_at)
    values ('tooearly@trakline.in', 'viewer', '11111111-1111-1111-1111-111111111111', '\x22'::bytea, now() - interval '1 hour')$$,
  '23514', 'console_invites_expiry_window',
  'an invite cannot arrive expired'
);

-- Expiry window constraints: setup links must fall within 24 hours
select pg_temp.throws_constraint(
  $$insert into console.setup_links (email, token_hash, expires_at)
    values ('toolong@trakline.in', '\x33'::bytea, now() + interval '48 hours')$$,
  '23514', 'console_setup_links_expiry_window',
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
