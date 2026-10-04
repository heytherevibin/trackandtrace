-- Module 06, Leads (first part): the figures, the list, one lead's record, Reveal and the lookup.
--
-- A LEAD is everyone who gave us an email: a sign-up (`subscriptions.people`), a traveller account
-- (`auth.users`), or both, joined on the address into ONE row. Console members are left out, by
-- their account and by their address, so an operator's own sign-up is never a lead.
--
-- NEWS AND ACCOUNT ARE SEPARATE FACTS. An account never makes anyone subscribed: someone with an
-- account and no sign-up reads `news = 'none'`.
--
-- A ROW IS NAMED BY AN ID, NEVER BY ITS ADDRESS: `p:<people.id>` when there is a sign-up, else
-- `a:<auth.users.id>`. Every address the list and the record carry is masked in SQL
-- (`announcements.masked`, from 20261004150000), and the whole address leaves the database only
-- through `console_reveal_lead`, which records that it did.
--
-- Five functions for a console member's own session, each with the SUPPORT floor first (06 is
-- Owner, Admin and Support, per the role matrix). Keys are camelCase: `src/console/leads/leads.ts`
-- destructures them.

-- Where a consent stands. Suppression wins: whatever was agreed, mail cannot reach the address.
create or replace function console.consent_status(p_confirmed timestamptz, p_withdrawn timestamptz, p_suppressed boolean) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_suppressed then 'suppressed'
    when p_withdrawn is not null then 'unsubscribed'
    when p_confirmed is not null then 'subscribed'
    else 'pending' end;
$$;
revoke all on function console.consent_status(timestamptz, timestamptz, boolean) from public, anon, authenticated;

-- One row per lead. Internal: nobody is granted this, and the five functions below are its only
-- readers. The address is whole here, which is exactly why it is not callable.
--
-- The row has a named type because the functions below pass one around, and neither SQL functions
-- nor `returns` clauses take an anonymous `record`. Dropped first with `cascade` so the file can be
-- applied again on a developer's machine: everything that depends on it is recreated below.
drop type if exists console.lead cascade;
create type console.lead as (
  id text, person_id uuid, user_id uuid, email text,
  news text, availability boolean, account text, source text,
  campaign_source text, campaign_medium text, campaign_name text, first_page text,
  first_seen timestamptz, last_activity timestamptz);

create or replace function console.leads() returns setof console.lead
language sql stable security definer set search_path = '' as $$
  with accounts as (
    select u.id, lower(btrim(u.email)) as email, u.created_at, u.last_sign_in_at,
           (u.banned_until is not null and u.banned_until > now()) as disabled
      from auth.users u
     where u.email is not null and u.deleted_at is null and not coalesce(u.is_anonymous, false)
       and not exists (select 1 from console.members m where m.user_id = u.id)
  ),
  people as (
    select p.* from subscriptions.people p
     where not exists (select 1 from console.members m where m.email = p.email)
  ),
  joined as (
    select p.id as person_id, a.id as user_id, coalesce(p.email, a.email) as email,
           p.first_source, p.campaign_source, p.campaign_medium, p.campaign_name, p.first_page,
           p.first_seen, a.created_at as account_created, a.last_sign_in_at, a.disabled
      from people p full join accounts a on a.email = p.email
  )
  select
    case when j.person_id is not null then 'p:' || j.person_id::text else 'a:' || j.user_id::text end,
    j.person_id, j.user_id, j.email,
    case when n.person_id is null then 'none'
         else console.consent_status(n.confirmed_at, n.withdrawn_at, exists (select 1 from announcements.suppressions s where s.email = j.email)) end,
    coalesce(v.confirmed_at is not null and v.withdrawn_at is null, false),
    case when j.user_id is null then 'none' when j.disabled then 'disabled' else 'has' end,
    coalesce(j.first_source, 'account'),
    j.campaign_source, j.campaign_medium, j.campaign_name, j.first_page,
    least(j.first_seen, j.account_created),
    greatest(j.first_seen, j.account_created, j.last_sign_in_at,
             n.consented_at, n.confirmed_at, n.withdrawn_at, v.consented_at, v.confirmed_at, v.withdrawn_at,
             (select max(d.sent_at) from announcements.deliveries d where d.person_id = j.person_id and d.state = 'sent'))
    from joined j
    left join subscriptions.consents n on n.person_id = j.person_id and n.list = 'news'
    left join subscriptions.consents v on v.person_id = j.person_id and v.list = 'availability';
$$;
revoke all on function console.leads() from public, anon, authenticated;

-- The six figures and the total. Each lead is counted once per fact that is true of it.
create or replace function public.console_lead_figures() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform console.require_role('support');
  return (
    select jsonb_build_object(
      'total', count(*)::int,
      'pending', (count(*) filter (where l.news = 'pending'))::int,
      'subscribed', (count(*) filter (where l.news = 'subscribed'))::int,
      'unsubscribed', (count(*) filter (where l.news = 'unsubscribed'))::int,
      'suppressed', (count(*) filter (where l.news = 'suppressed'))::int,
      'accounts', (count(*) filter (where l.account <> 'none'))::int,
      'availability', (count(*) filter (where l.availability))::int)
      from console.leads() l);
end $$;

-- One lead as a list row. Masked: no row carries its address.
create or replace function console.lead_row(l console.lead) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'id', l.id, 'email', announcements.masked(l.email), 'news', l.news, 'availability', l.availability,
    'account', l.account, 'source', l.source,
    'campaign', case when l.campaign_source is null and l.campaign_medium is null and l.campaign_name is null then null
                     else jsonb_build_object('source', l.campaign_source, 'medium', l.campaign_medium, 'name', l.campaign_name) end,
    'firstSeen', l.first_seen, 'lastActivity', l.last_activity);
$$;
revoke all on function console.lead_row(console.lead) from public, anon, authenticated;

-- The list: newest activity first, filtered, one page. A filter is null for "all". The limit is
-- clamped to 200 rather than refused, as `console_audit` clamps its own.
--
-- Every argument has a default, so the generated TypeScript types make each optional: a filter that
-- is off is simply left out of the call, where a required `string` could not be given null.
create or replace function public.console_leads(p_news text default null, p_account text default null, p_source text default null, p_since timestamptz default null, p_limit int default 50, p_offset int default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_limit  int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  perform console.require_role('support');
  if (p_news is not null and p_news not in ('pending', 'subscribed', 'unsubscribed', 'suppressed', 'none'))
     or (p_account is not null and p_account not in ('none', 'has', 'disabled'))
     or (p_source is not null and p_source not in ('footer', 'landing', 'pre-booking', 'account', 'added by hand')) then
    raise exception 'unknown filter' using errcode = '22023';
  end if;
  return (
    with matching as (
      select * from console.leads() l
       where (p_news is null or l.news = p_news)
         and (p_account is null or l.account = p_account)
         and (p_source is null or l.source = p_source)
         and (p_since is null or l.first_seen >= p_since)
    )
    select jsonb_build_object(
      'total', (select count(*)::int from matching),
      'rows', coalesce((
        select jsonb_agg(console.lead_row(page) order by page.last_activity desc, page.id)
          from (select * from matching m order by m.last_activity desc, m.id limit v_limit offset v_offset) page), '[]'::jsonb)));
end $$;

-- How many passkeys an account has. The table is the auth service's own and newer than some
-- deployments of it, so its absence reads as none rather than breaking every record.
create or replace function console.passkey_count(p_user uuid) returns int
language plpgsql stable security definer set search_path = '' as $$
declare v_count int := 0;
begin
  if to_regclass('auth.webauthn_credentials') is not null then
    execute 'select count(*)::int from auth.webauthn_credentials where user_id = $1' into v_count using p_user;
  end if;
  return v_count;
end $$;
revoke all on function console.passkey_count(uuid) from public, anon, authenticated;

create or replace function console.lead_by_id(p_id text) returns console.lead
language plpgsql stable security definer set search_path = '' as $$
declare v_lead console.lead;
begin
  if p_id is null or p_id !~ '^[pa]:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'not a lead id' using errcode = '22023';
  end if;
  select * into v_lead from console.leads() l where l.id = p_id;
  return v_lead;
end $$;
revoke all on function console.lead_by_id(text) from public, anon, authenticated;

-- One lead's record, or null. Masked. Saved PNRs are a COUNT: the console never shows one.
create or replace function public.console_lead(p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_lead       console.lead;
  v_suppressed boolean;
begin
  perform console.require_role('support');
  v_lead := console.lead_by_id(p_id);
  if v_lead.id is null then
    return null;
  end if;
  v_suppressed := exists (select 1 from announcements.suppressions s where s.email = v_lead.email);
  return jsonb_build_object(
    'id', v_lead.id, 'email', announcements.masked(v_lead.email), 'firstSeen', v_lead.first_seen,
    'consents', coalesce((
      select jsonb_agg(jsonb_build_object(
               'list', c.list, 'status', console.consent_status(c.confirmed_at, c.withdrawn_at, v_suppressed),
               'source', c.source, 'noticeVersion', c.notice_version,
               'consentedAt', c.consented_at, 'confirmedAt', c.confirmed_at,
               'withdrawnAt', c.withdrawn_at, 'withdrawReason', c.withdraw_reason)
             order by c.list desc)
        from subscriptions.consents c where c.person_id = v_lead.person_id), '[]'::jsonb),
    'account', (
      select jsonb_build_object(
               'createdAt', u.created_at, 'lastSignInAt', u.last_sign_in_at,
               'disabled', v_lead.account = 'disabled',
               'emailLink', exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'),
               'google', exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google'),
               'passkeys', console.passkey_count(u.id),
               'savedPnrs', (select count(*)::int from public.watchlist_entries w where w.user_id = u.id))
        from auth.users u where u.id = v_lead.user_id),
    'campaign', case when v_lead.campaign_source is null and v_lead.campaign_medium is null and v_lead.campaign_name is null and v_lead.first_page is null then null
                     else jsonb_build_object('source', v_lead.campaign_source, 'medium', v_lead.campaign_medium, 'name', v_lead.campaign_name, 'firstPage', v_lead.first_page) end,
    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object('at', e.at, 'kind', e.kind, 'list', e.list, 'source', e.source, 'subject', e.subject, 'reason', e.reason) order by e.at desc, e.rank desc)
        from (
          select c.consented_at as at, 'signed_up' as kind, c.list, c.source, null::text as subject, null::text as reason, 1 as rank
            from subscriptions.consents c where c.person_id = v_lead.person_id
          union all
          select c.confirmed_at, 'confirmed', c.list, null, null, null, 2
            from subscriptions.consents c where c.person_id = v_lead.person_id and c.confirmed_at is not null
          union all
          select c.withdrawn_at, 'unsubscribed', c.list, null, null, c.withdraw_reason, 3
            from subscriptions.consents c where c.person_id = v_lead.person_id and c.withdrawn_at is not null
          union all
          select u.created_at, 'account_created', null, null, null, null, 1 from auth.users u where u.id = v_lead.user_id
          union all
          select u.last_sign_in_at, 'signed_in', null, null, null, null, 2 from auth.users u where u.id = v_lead.user_id and u.last_sign_in_at is not null
          union all
          select d.sent_at, 'received', l.list, null, l.subject, null, 1
            from announcements.deliveries d join announcements.letters l on l.id = d.letter_id
           where d.person_id = v_lead.person_id and d.state = 'sent' and d.sent_at is not null
          union all
          select s.at, 'suppressed', null, null, null, s.reason, 4 from announcements.suppressions s where s.email = v_lead.email
        ) e), '[]'::jsonb));
end $$;

-- The address, whole, and a row in the audit log saying who asked. The log names the lead by its
-- MASKED address, for the reason console_reveal_suppression gives: a log that held every revealed
-- address would be a second copy of what the mask guards.
create or replace function public.console_reveal_lead(p_environment text, p_id text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_member console.members := console.require_role('support');
  v_lead   console.lead;
begin
  v_lead := console.lead_by_id(p_id);
  if v_lead.id is null then
    raise exception 'no such lead' using errcode = '22023';
  end if;
  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
    'leads', 'Revealed a lead''s address', announcements.masked(v_lead.email), null, 'done', null,
    null, null);
  return v_lead.email;
end $$;

-- Find by the WHOLE address, exactly. The answer is the lead's row, still masked, or null — and the
-- lookup is recorded either way, by the masked form of what was typed, so the log shows that
-- someone went looking without becoming a list of the addresses they looked for. There is no
-- partial match anywhere: nobody fishes for addresses a letter at a time.
create or replace function public.console_find_lead(p_environment text, p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member console.members := console.require_role('support');
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_lead   console.lead;
begin
  if char_length(v_email) not between 3 and 254 or position('@' in v_email) < 2 then
    raise exception 'not an address' using errcode = '22023';
  end if;
  select * into v_lead from console.leads() l where l.email = v_email;
  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
    'leads', 'Looked up a lead by email', announcements.masked(v_email), null, 'done', null,
    null, jsonb_build_object('found', v_lead.id is not null));
  if v_lead.id is null then
    return null;
  end if;
  return console.lead_row(v_lead);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.console_lead_figures()',
    'public.console_leads(text, text, text, timestamptz, int, int)',
    'public.console_lead(text)',
    'public.console_reveal_lead(text, text)',
    'public.console_find_lead(text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, service_role', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
