begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

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

select * from finish();
rollback;
