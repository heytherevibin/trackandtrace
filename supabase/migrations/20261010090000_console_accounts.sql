-- Module 08, Accounts (first part): the list, one account's record, Reveal and the lookup.
--
-- AN ACCOUNT is a traveller's sign-in: a row of `auth.users` with an address, not deleted, not an
-- anonymous visitor, and not a console member. It is the same set of people Leads calls "has an
-- account" (20261005090000), read here as accounts rather than as leads.
--
-- THE CONSOLE NEVER SHOWS A SAVED PNR. Every function below answers how many an account has saved
-- and nothing else about them: `public.watchlist_entries` is read with `count(*)` and no other way.
--
-- A ROW IS NAMED BY THE ACCOUNT'S ID, never by its address. Every address the list and the record
-- carry is masked in SQL (`announcements.masked`, from 20261004150000), and the whole address
-- leaves the database only through `console_reveal_account`, which records that it did.
--
-- NEWS AND ACCOUNT ARE SEPARATE FACTS, as in Leads: `news` is where the same address stands with
-- the News list, 'none' when it never signed up. `leadId` names that person's row in Leads, by the
-- rule `console.leads()` uses: `p:<people.id>` when there is a sign-up, else `a:<auth.users.id>`.
--
-- Four functions for a console member's own session, each with the ADMIN floor first (08 is Owner
-- and Admin, per the role matrix). Keys are camelCase: `src/console/accounts/accounts.ts`
-- destructures them.

-- One row per account. Internal: nobody is granted this, and the four functions below are its only
-- readers. The address is whole here, which is exactly why it is not callable.
--
-- Dropped first with `cascade` so the file can be applied again on a developer's machine:
-- everything that depends on the type is recreated below.
drop type if exists console.account cascade;
create type console.account as (
  id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz, disabled boolean,
  email_link boolean, google boolean, person_id uuid, news text);

create or replace function console.accounts() returns setof console.account
language sql stable security definer set search_path = '' as $$
  select u.id, lower(btrim(u.email)), u.created_at, u.last_sign_in_at,
         (u.banned_until is not null and u.banned_until > now()),
         exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'),
         exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google'),
         p.id,
         case when n.person_id is null then 'none'
              else console.consent_status(n.confirmed_at, n.withdrawn_at, exists (select 1 from announcements.suppressions s where s.email = lower(btrim(u.email)))) end
    from auth.users u
    left join subscriptions.people p on p.email = lower(btrim(u.email))
    left join subscriptions.consents n on n.person_id = p.id and n.list = 'news'
   where u.email is not null and u.deleted_at is null and not coalesce(u.is_anonymous, false)
     and not exists (select 1 from console.members m where m.user_id = u.id);
$$;
revoke all on function console.accounts() from public, anon, authenticated;

-- One account as a list row. Masked: no row carries its address. Passkeys and saved PNRs are
-- counted here, per row drawn, rather than for every account on every read.
create or replace function console.account_row(a console.account) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', a.id, 'email', announcements.masked(a.email),
    'createdAt', a.created_at, 'lastSignInAt', a.last_sign_in_at,
    'emailLink', a.email_link, 'google', a.google, 'passkeys', console.passkey_count(a.id),
    -- A count, and only ever a count.
    'savedPnrs', (select count(*)::int from public.watchlist_entries w where w.user_id = a.id),
    'news', a.news, 'disabled', a.disabled,
    'leadId', case when a.person_id is not null then 'p:' || a.person_id::text else 'a:' || a.id::text end);
$$;
revoke all on function console.account_row(console.account) from public, anon, authenticated;

-- The list: newest sign-in first, one who never signed in last; filtered, one page. A filter is
-- null for "all". The limit is clamped to 200 rather than refused, as `console_leads` clamps its own.
--
-- Every argument has a default, so the generated TypeScript types make each optional: a filter that
-- is off is simply left out of the call.
create or replace function public.console_accounts(p_status text default null, p_method text default null, p_since timestamptz default null, p_limit int default 50, p_offset int default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_limit  int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  perform console.require_role('admin');
  if (p_status is not null and p_status not in ('active', 'disabled'))
     or (p_method is not null and p_method not in ('email', 'google', 'passkey')) then
    raise exception 'unknown filter' using errcode = '22023';
  end if;
  return (
    with matching as (
      select * from console.accounts() a
       where (p_status is null or a.disabled = (p_status = 'disabled'))
         and (p_method is null
              or (p_method = 'email' and a.email_link)
              or (p_method = 'google' and a.google)
              or (p_method = 'passkey' and console.passkey_count(a.id) > 0))
         and (p_since is null or a.created_at >= p_since)
    )
    select jsonb_build_object(
      'total', (select count(*)::int from matching),
      'rows', coalesce((
        select jsonb_agg(console.account_row(page) order by page.last_sign_in_at desc nulls last, page.created_at desc, page.id)
          from (select * from matching m order by m.last_sign_in_at desc nulls last, m.created_at desc, m.id limit v_limit offset v_offset) page), '[]'::jsonb)));
end $$;

create or replace function console.account_by_id(p_id uuid) returns console.account
language sql stable security definer set search_path = '' as $$
  select a from console.accounts() a where a.id = p_id;
$$;
revoke all on function console.account_by_id(uuid) from public, anon, authenticated;

-- One account's record, or null: its list row, and its sessions as a count and a last-seen time.
-- A session that has run out (`not_after`) is not one. `refreshed_at` is the auth service's own
-- column and is kept without a zone, in UTC.
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
       where s.user_id = v_account.id and (s.not_after is null or s.not_after > now())));
end $$;

-- The address, whole, and a row in the audit log saying who asked. The log names the account by
-- its MASKED address, for the reason console_reveal_lead gives.
create or replace function public.console_reveal_account(p_environment text, p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_member  console.members := console.require_role('admin');
  v_account console.account;
begin
  v_account := console.account_by_id(p_id);
  if v_account.id is null then
    raise exception 'no such account' using errcode = '22023';
  end if;
  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
    'accounts', 'Revealed an account''s address', announcements.masked(v_account.email), null, 'done', null,
    null, null);
  return v_account.email;
end $$;

-- Find by the WHOLE address, exactly. The answer is the account's row, still masked, or null — and
-- the lookup is recorded either way, by the masked form of what was typed. There is no partial
-- match anywhere: nobody fishes for addresses a letter at a time.
create or replace function public.console_find_account(p_environment text, p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member  console.members := console.require_role('admin');
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_account console.account;
begin
  if char_length(v_email) not between 3 and 254 or position('@' in v_email) < 2 then
    raise exception 'not an address' using errcode = '22023';
  end if;
  select * into v_account from console.accounts() a where a.email = v_email;
  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
    'accounts', 'Looked up an account by email', announcements.masked(v_email), null, 'done', null,
    null, jsonb_build_object('found', v_account.id is not null));
  if v_account.id is null then
    return null;
  end if;
  return console.account_row(v_account);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.console_accounts(text, text, timestamptz, int, int)',
    'public.console_account(uuid)',
    'public.console_reveal_account(text, uuid)',
    'public.console_find_account(text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, service_role', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
