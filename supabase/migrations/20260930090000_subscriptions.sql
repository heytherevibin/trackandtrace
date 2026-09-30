-- Subscriptions core (06-A). docs/superpowers/specs/2026-09-28-subscriptions-core-design.md §2.
-- A private schema: no grants to anon or authenticated, RLS on with no policies, and every read and
-- write through a security-definer function granted to service_role alone.

create schema if not exists subscriptions;
revoke all on schema subscriptions from public, anon, authenticated;

create table subscriptions.people (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique check (email = lower(btrim(email)) and char_length(email) between 3 and 254),
  first_seen      timestamptz not null default now(),
  first_source    text not null check (first_source in ('footer', 'landing', 'pre-booking', 'account', 'added by hand')),
  campaign_source text check (char_length(campaign_source) <= 100),
  campaign_medium text check (char_length(campaign_medium) <= 100),
  campaign_name   text check (char_length(campaign_name) <= 100),
  first_page      text check (char_length(first_page) <= 200)
);

create table subscriptions.consents (
  person_id       uuid not null references subscriptions.people (id) on delete cascade,
  list            text not null check (list in ('news', 'availability')),
  notice_version  text not null check (char_length(notice_version) between 1 and 10),
  source          text not null check (source in ('footer', 'landing', 'pre-booking', 'account', 'added by hand')),
  consented_at    timestamptz not null default now(),
  confirmed_at    timestamptz,
  withdrawn_at    timestamptz,
  withdraw_reason text check (withdraw_reason in ('too many', 'not relevant', 'did not sign up', 'other')),
  primary key (person_id, list)
);

-- Only the hash is stored: a database leak cannot confirm anyone.
create table subscriptions.confirm_tokens (
  token_hash bytea primary key check (octet_length(token_hash) = 32),
  person_id  uuid not null references subscriptions.people (id) on delete cascade,
  list       text not null check (list in ('news', 'availability')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);

alter table subscriptions.people enable row level security;
alter table subscriptions.consents enable row level security;
alter table subscriptions.confirm_tokens enable row level security;
revoke all on all tables in schema subscriptions from public, anon, authenticated;

create or replace function public.subscriptions_sign_up(
  p_email text, p_list text, p_source text, p_campaign jsonb, p_notice_version text, p_token_hash bytea
) returns text language plpgsql security definer set search_path = '' as $$
declare
  v_email  text := lower(btrim(p_email));
  v_person uuid;
  v_consent subscriptions.consents;
begin
  -- The seven-day purge (§2): never-confirmed people, first seen over a week ago. Run here rather
  -- than on a schedule, so there is nothing to forget to set up.
  delete from subscriptions.people p
   where p.first_seen < now() - interval '7 days'
     and not exists (select 1 from subscriptions.consents c where c.person_id = p.id and c.confirmed_at is not null);

  insert into subscriptions.people (email, first_source, campaign_source, campaign_medium, campaign_name, first_page)
  values (v_email, p_source, p_campaign ->> 'source', p_campaign ->> 'medium', p_campaign ->> 'name', p_campaign ->> 'page')
  on conflict (email) do nothing;
  select id into v_person from subscriptions.people where email = v_email;

  select * into v_consent from subscriptions.consents where person_id = v_person and list = p_list;
  if found and v_consent.confirmed_at is not null and v_consent.withdrawn_at is null then
    return 'quiet';
  end if;
  if found and v_consent.withdrawn_at is not null then
    -- Coming back after unsubscribing is a new consent, and it is confirmed again.
    update subscriptions.consents
       set consented_at = now(), confirmed_at = null, withdrawn_at = null, withdraw_reason = null,
           notice_version = p_notice_version, source = p_source
     where person_id = v_person and list = p_list;
  elsif not found then
    insert into subscriptions.consents (person_id, list, notice_version, source)
    values (v_person, p_list, p_notice_version, p_source);
  end if;

  -- The resend guard: an unused, unexpired token younger than ten minutes means no second email.
  if exists (select 1 from subscriptions.confirm_tokens t
              where t.person_id = v_person and t.list = p_list and t.used_at is null
                and t.expires_at > now() and t.created_at > now() - interval '10 minutes') then
    return 'quiet';
  end if;

  insert into subscriptions.confirm_tokens (token_hash, person_id, list, expires_at)
  values (p_token_hash, v_person, p_list, now() + interval '48 hours');
  return 'send';
end;
$$;

-- The one reading both confirm and peek share, so they can never disagree about a token.
create or replace function subscriptions.token_state(p_token_hash bytea) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object('list', t.list, 'state',
       case when c.confirmed_at is not null and c.withdrawn_at is null then 'already'
            when t.used_at is not null then 'already'
            when t.expires_at <= now() then 'expired'
            else 'confirmed' end)
       from subscriptions.confirm_tokens t
       join subscriptions.consents c on c.person_id = t.person_id and c.list = t.list
      where t.token_hash = p_token_hash),
    jsonb_build_object('list', null, 'state', 'invalid'));
$$;

create or replace function public.subscriptions_peek(p_token_hash bytea) returns jsonb
language sql stable security definer set search_path = '' as $$
  select subscriptions.token_state(p_token_hash);
$$;

create or replace function public.subscriptions_confirm(p_token_hash bytea) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_state jsonb := subscriptions.token_state(p_token_hash);
begin
  if v_state ->> 'state' <> 'confirmed' then return v_state; end if;
  update subscriptions.confirm_tokens set used_at = now() where token_hash = p_token_hash;
  update subscriptions.consents c set confirmed_at = now()
    from subscriptions.confirm_tokens t
   where t.token_hash = p_token_hash and c.person_id = t.person_id and c.list = t.list;
  return v_state;
end;
$$;

create or replace function public.subscriptions_withdraw(p_person uuid, p_list text, p_reason text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_consent subscriptions.consents;
begin
  select * into v_consent from subscriptions.consents where person_id = p_person and list = p_list;
  if not found then return 'unknown'; end if;
  if v_consent.withdrawn_at is not null then
    -- Already out: a reason may still be added afterwards ("Tell us why"), and is.
    if p_reason is not null then
      update subscriptions.consents set withdraw_reason = p_reason where person_id = p_person and list = p_list;
    end if;
    return 'already';
  end if;
  update subscriptions.consents set withdrawn_at = now(), withdraw_reason = p_reason where person_id = p_person and list = p_list;
  return 'done';
end;
$$;

create or replace function public.subscriptions_rejoin(p_person uuid, p_list text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_consent subscriptions.consents;
begin
  select * into v_consent from subscriptions.consents where person_id = p_person and list = p_list;
  if not found then return 'unknown'; end if;
  if v_consent.withdrawn_at is null then return 'already'; end if;
  update subscriptions.consents set withdrawn_at = null, withdraw_reason = null where person_id = p_person and list = p_list;
  return 'done';
end;
$$;

create or replace function public.subscriptions_person_id(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from subscriptions.people where email = lower(btrim(p_email));
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.subscriptions_sign_up(text, text, text, jsonb, text, bytea)',
    'public.subscriptions_peek(bytea)',
    'public.subscriptions_confirm(bytea)',
    'public.subscriptions_withdraw(uuid, text, text)',
    'public.subscriptions_rejoin(uuid, text)',
    'public.subscriptions_person_id(text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
revoke all on function subscriptions.token_state(bytea) from public, anon, authenticated;
