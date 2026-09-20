-- The console's own schema. Never exposed through the Data API: every caller goes
-- through a security-definer function in public. Forward-only.

create schema if not exists console;

revoke all on schema console from public;
revoke usage on schema console from anon, authenticated;

create type console.member_role as enum ('owner', 'admin', 'support', 'viewer');
create type console.member_status as enum ('setup', 'active', 'removed');

create table console.members (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  email          text not null check (email = lower(email) and char_length(email) between 3 and 254),
  name           text not null check (char_length(name) between 1 and 120),
  role           console.member_role not null,
  status         console.member_status not null default 'setup',
  invited_by     uuid references console.members (user_id) on delete set null,
  keys_reset_at  timestamptz,
  keys_reset_by  uuid references console.members (user_id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint console_members_email_key unique (email)
);

create index console_members_active_idx
  on console.members (role) where status = 'active';

create or replace function console.role_rank(p_role console.member_role)
returns int
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p_role
    when 'owner' then 4
    when 'admin' then 3
    when 'support' then 2
    when 'viewer' then 1
  end;
$$;

revoke all on function console.role_rank(console.member_role) from public, anon, authenticated;
