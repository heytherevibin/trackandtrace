-- Module 08, Accounts (second part): Sign out everywhere, Disable and Enable.
--
-- ALL THREE ARE BEHIND A REASON AND A KEY. Each spends a tap (`console.use_tap`) minted over exactly
-- the arguments it is called with, and each carries the deployment INSIDE what the tap digests, so
-- a tap minted for one deployment approves nothing under another (20260923090000's rule). Owner
-- and Admin, as the rest of the module.
--
-- EVERY REFUSAL COMES BEFORE THE TAP IS SPENT, and the whole call is one transaction: a member is
-- never asked for their key a second time because of something that could have been known first.
--
-- THEY TAKE EFFECT AT ONCE. A traveller's token is good for up to an hour after the session behind
-- it has been ended, because a token is checked by its signature and not against the database. So
-- ending a session, or banning its account, would otherwise wait out that hour. `session_live()`
-- is the check against the database, and the watchlist's rows are answered only while it holds:
-- the token still verifies, and reads and writes nothing.
--
-- NOTHING OF THE TRAVELLER'S IS REMOVED. Sign out everywhere ends sessions. Disable ends sessions
-- and has the auth service refuse every sign-in; saved PNRs, sign-ups and consents are untouched,
-- and news still reaches a disabled account that is subscribed. Deleting an account is an erasure
-- request's job (module 09), not this module's.

-- Whether the session a request is made under is still there, and its account not disabled.
-- Read from the request's own token: `session_id` names the session, `sub` the account.
--
-- Compared as text: a token that names no session, or nonsense, is simply not live, where a cast
-- to uuid would fail the whole query it was asked inside.
create or replace function public.session_live() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from auth.sessions s
      join auth.users u on u.id = s.user_id
     where s.id::text = (select auth.jwt() ->> 'session_id')
       and s.user_id = (select auth.uid())
       and (s.not_after is null or s.not_after > now())
       and (u.banned_until is null or u.banned_until <= now()));
$$;
revoke all on function public.session_live() from public, anon;
grant execute on function public.session_live() to authenticated, service_role;

-- RESTRICTIVE: and-ed with the four policies that give a traveller their own rows
-- (20260917120000), so each of those now also needs a live session. The `select` wrapper has it
-- evaluated once for a statement rather than once for a row, as those policies wrap `auth.uid()`.
drop policy if exists watchlist_live_session on public.watchlist_entries;
create policy watchlist_live_session on public.watchlist_entries as restrictive for all to authenticated
  using ((select public.session_live()))
  with check ((select public.session_live()));

-- Since when an account has been disabled from the console, and by whom. The ban itself is the
-- auth service's (`auth.users.banned_until`); this is what the record says about it. `by_name` is
-- the member's name as it stood, so a member who has left is still named on what they did.
create table if not exists console.account_disables (
  user_id uuid primary key references auth.users (id) on delete cascade,
  at      timestamptz not null default now(),
  by_id   uuid references console.members (user_id) on delete set null,
  by_name text not null check (char_length(by_name) between 1 and 120)
);
alter table console.account_disables enable row level security;
revoke all on table console.account_disables from public, anon, authenticated;

-- The value a tap for one of these acts digested: an object naming the deployment. Read, never
-- rebuilt: the digest was taken over the string the browser sent.
create or replace function console.check_act_value(p_environment text, p_value text) returns void
language plpgsql immutable set search_path = '' as $$
declare v_value jsonb;
begin
  begin
    v_value := p_value::jsonb;
  exception when invalid_text_representation then
    v_value := null;
  end;
  if v_value is null or jsonb_typeof(v_value) <> 'object' or v_value ->> 'environment' is distinct from p_environment then
    raise exception 'environment mismatch' using errcode = '22023';
  end if;
end $$;
revoke all on function console.check_act_value(text, text) from public, anon, authenticated;

-- An account, for an act on it: refused when there is none.
create or replace function console.account_for_act(p_id uuid) returns console.account
language plpgsql stable security definer set search_path = '' as $$
declare v_account console.account;
begin
  v_account := console.account_by_id(p_id);
  if v_account.id is null then
    raise exception 'no such account' using errcode = '22023';
  end if;
  return v_account;
end $$;
revoke all on function console.account_for_act(uuid) from public, anon, authenticated;

-- Ends every session an account has, and answers how many. The auth service's refresh tokens go
-- with their sessions, by its own cascade.
create or replace function console.end_sessions(p_user uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare v_ended int;
begin
  delete from auth.sessions s where s.user_id = p_user;
  get diagnostics v_ended = row_count;
  return v_ended;
end $$;
revoke all on function console.end_sessions(uuid) from public, anon, authenticated;

-- Sign out everywhere. They can sign in again straight away.
create or replace function public.console_sign_out_account(p_environment text, p_id uuid, p_value text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_member  console.members := console.require_role('admin');
  v_account console.account;
  v_ended   int;
begin
  perform console.check_act_value(p_environment, p_value);
  v_account := console.account_for_act(p_id);
  -- Refused before the tap, so the refusal costs no ceremony.
  if not exists (select 1 from auth.sessions s where s.user_id = v_account.id) then
    raise exception 'nobody is signed in' using errcode = '22023';
  end if;

  perform console.use_tap('Signed an account out everywhere', p_id::text, p_value, p_reason);

  v_ended := console.end_sessions(v_account.id);
  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
    'accounts', 'Signed an account out everywhere', announcements.masked(v_account.email), p_reason, 'done', null,
    null, jsonb_build_object('sessions', v_ended));
end $$;

-- Disable: signed out now, and no sign-in until Enable. A hundred years is the auth service's own
-- idiom for "until lifted"; it reads the column as a moment, and `infinity` is not one it parses.
create or replace function public.console_disable_account(p_environment text, p_id uuid, p_value text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_member  console.members := console.require_role('admin');
  v_account console.account;
  v_ended   int;
begin
  perform console.check_act_value(p_environment, p_value);
  v_account := console.account_for_act(p_id);
  if v_account.disabled then
    raise exception 'already disabled' using errcode = '22023';
  end if;

  perform console.use_tap('Disabled an account', p_id::text, p_value, p_reason);

  update auth.users u set banned_until = now() + interval '100 years' where u.id = v_account.id;
  v_ended := console.end_sessions(v_account.id);
  insert into console.account_disables (user_id, by_id, by_name) values (v_account.id, v_member.user_id, v_member.name)
    on conflict (user_id) do update set at = now(), by_id = excluded.by_id, by_name = excluded.by_name;
  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
    'accounts', 'Disabled an account', announcements.masked(v_account.email), p_reason, 'done', null,
    null, jsonb_build_object('sessions', v_ended));
end $$;

-- Enable: the auth service takes their sign-ins again. Nothing else changes.
create or replace function public.console_enable_account(p_environment text, p_id uuid, p_value text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_member  console.members := console.require_role('admin');
  v_account console.account;
begin
  perform console.check_act_value(p_environment, p_value);
  v_account := console.account_for_act(p_id);
  if not v_account.disabled then
    raise exception 'not disabled' using errcode = '22023';
  end if;

  perform console.use_tap('Enabled an account', p_id::text, p_value, p_reason);

  update auth.users u set banned_until = null where u.id = v_account.id;
  delete from console.account_disables d where d.user_id = v_account.id;
  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
    'accounts', 'Enabled an account', announcements.masked(v_account.email), p_reason, 'done', null,
    null, null);
end $$;

-- One account's record, as 20261010090000 left it, now saying since when it has been disabled and
-- by whom. Both are null for an account that is not disabled, and for one disabled from outside
-- the console, which nothing here recorded. CREATE OR REPLACE keeps its grants.
create or replace function public.console_account(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_account console.account;
begin
  perform console.require_role('admin');
  v_account := console.account_by_id(p_id);
  if v_account.id is null then
    return null;
  end if;
  return console.account_row(v_account) || jsonb_build_object(
    'sessions', (
      select jsonb_build_object(
               'count', count(*)::int,
               'lastSeenAt', max(greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'utc')))
        from auth.sessions s
       where s.user_id = v_account.id and (s.not_after is null or s.not_after > now())),
    'disabledAt', (select d.at from console.account_disables d where d.user_id = v_account.id and v_account.disabled),
    'disabledBy', (select d.by_name from console.account_disables d where d.user_id = v_account.id and v_account.disabled));
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.console_sign_out_account(text, uuid, text, text)',
    'public.console_disable_account(text, uuid, text, text)',
    'public.console_enable_account(text, uuid, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, service_role', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
