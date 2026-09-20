begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

select has_schema('console', 'the console schema exists');
select has_table('console', 'members', 'members exists');
select has_enum('console', 'member_role', 'the role enum exists');
select has_enum('console', 'member_status', 'the status enum exists');

select col_is_pk('console', 'members', 'user_id', 'a member is keyed by its auth user');
select col_not_null('console', 'members', 'email', 'a member always has an address');
select col_not_null('console', 'members', 'role', 'a member always has a role');

-- The Data API must never reach these tables.
select is(
  has_table_privilege('authenticated', 'console.members', 'select')::text,
  'false',
  'authenticated cannot read members directly'
);
select is(
  has_table_privilege('anon', 'console.members', 'select')::text,
  'false',
  'anon cannot read members directly'
);

-- Roles rank so a guard can ask for "admin or better".
select is(console.role_rank('owner') > console.role_rank('admin'), true, 'owner outranks admin');
select is(console.role_rank('support') > console.role_rank('viewer'), true, 'support outranks viewer');

-- The enums must carry exactly these labels, in this order, not merely exist.
select enum_has_labels('console', 'member_status', array['setup', 'active', 'removed'], 'every member status the plan names');
select enum_has_labels('console', 'member_role', array['owner', 'admin', 'support', 'viewer'], 'every role the plan names');

select col_not_null('console', 'members', 'name', 'a member always has a name');
select col_not_null('console', 'members', 'status', 'a member always has a status');

select col_is_unique('console', 'members', 'email', 'one member per address');

select has_index('console', 'members', 'console_members_active_idx', 'the active-member index exists');

-- The email CHECK actually bites, both ways.
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in');
insert into console.members (user_id, email, name, role)
  values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in', 'Owner Member', 'owner');

select throws_ok(
  $$insert into console.members (user_id, email, name, role) values (gen_random_uuid(), 'MIXED@trakline.in', 'Mixed Case', 'admin')$$,
  '23514'::char(5),
  NULL,
  'an address must be stored lower-case'
);
select throws_ok(
  $$insert into console.members (user_id, email, name, role) values (gen_random_uuid(), 'x', 'Too Short', 'admin')$$,
  '23514'::char(5),
  NULL,
  'an address that short is refused'
);

-- invited_by must name a real member, not just any uuid.
insert into auth.users (id, email) values ('22222222-2222-2222-2222-222222222222', 'second@trakline.in');
select throws_ok(
  $$insert into console.members (user_id, email, name, role, invited_by) values ('22222222-2222-2222-2222-222222222222', 'second@trakline.in', 'Second Member', 'admin', gen_random_uuid())$$,
  '23503'::char(5),
  NULL,
  'invited_by must name a member'
);

select * from finish();
rollback;
