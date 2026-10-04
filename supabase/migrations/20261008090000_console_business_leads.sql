-- Module 06, Leads (third part): business leads.
--
-- A BUSINESS LEAD is a lead someone at Trakline is having a conversation with. It is one row here,
-- hung off the lead's own row — the sign-up when there is one, else the account — exactly as tags
-- and notes are (20261006090000), so it holds no address, follows a lead that later signs up, and
-- goes when the lead goes. It has a stage (five of them), an owner (a console member who can open
-- Leads), and three things a member typed: a name, an organisation, and one line about them.
--
-- A LEAD COMES IN TWO WAYS. Marked: any lead already in the list is put in the pipeline from its
-- record. Added by hand: an address nobody has given us is typed in by a member, and becomes a
-- sign-up with the source "added by hand" and NO CONSENT ROW AT ALL. It is on no list, and nothing
-- in this file or any other puts it on one; only the person signing up for themselves does.
--
-- KEPT UNTIL DELETED (decided with the owner, 4 Oct 2026). A sign-up with no confirmed consent is
-- cleaned up after seven days; a lead added by hand has none by design, and a marked one may have
-- none either. So the clean-up leaves alone anyone added by hand and anyone in the pipeline.
-- Taken out of the pipeline, an ordinary unconfirmed sign-up is an unconfirmed sign-up again.
--
-- NOTHING HERE NEEDS A KEY (the brief's table of safeguards: "pipeline stage, assign … add a
-- business lead: None (logged)"). Each act is written to the audit log, by the lead's masked
-- address. What a member typed about the lead is not: the log says an act happened.

-- Who added a lead by hand, as their name stood. On the sign-up, not on the pipeline row, so the
-- record can still say it after the lead leaves the pipeline.
alter table subscriptions.people add column added_by text check (char_length(added_by) <= 120);

create table console.business_leads (
  id           uuid primary key default gen_random_uuid(),
  person_id    uuid references subscriptions.people (id) on delete cascade,
  user_id      uuid references auth.users (id) on delete cascade,
  stage        text not null default 'new' check (stage in ('new', 'contacted', 'qualified', 'won', 'lost')),
  -- When it entered the stage it is in: a card's "5 days in stage".
  stage_since  timestamptz not null default now(),
  -- A member who leaves the console leaves their leads in the pipeline, owned by nobody.
  owner_id     uuid references console.members (user_id) on delete set null,
  -- As typed, scrubbed. Wider than the forms allow because scrubbing can lengthen.
  name         text check (char_length(name) between 1 and 200),
  organisation text check (char_length(organisation) between 1 and 200),
  about        text not null check (char_length(about) between 1 and 400),
  added_by     uuid,
  added_at     timestamptz not null default now(),
  check (num_nonnulls(person_id, user_id) = 1)
);
-- A lead is in the pipeline once.
create unique index business_leads_person on console.business_leads (person_id) where person_id is not null;
create unique index business_leads_user on console.business_leads (user_id) where user_id is not null;
create index business_leads_stage on console.business_leads (stage, stage_since);

alter table console.business_leads enable row level security;
revoke all on table console.business_leads from public, anon, authenticated;

-- The seven-day clean-up, in a function of its own so its rule has one home. Unchanged for an
-- ordinary sign-up; a lead added by hand, and anyone in the pipeline, is left alone.
create or replace function subscriptions.purge_unconfirmed() returns void
language sql security definer set search_path = '' as $$
  delete from subscriptions.people p
   where p.first_seen < now() - interval '7 days'
     and p.first_source <> 'added by hand'
     and not exists (select 1 from subscriptions.consents c where c.person_id = p.id and c.confirmed_at is not null)
     and not exists (select 1 from console.business_leads b where b.person_id = p.id);
$$;
revoke all on function subscriptions.purge_unconfirmed() from public, anon, authenticated;

-- The sign-up function, word for word as 20260930090000 left it, but for the clean-up it now asks
-- for rather than performs. CREATE OR REPLACE keeps its grants.
create or replace function public.subscriptions_sign_up(
  p_email text, p_list text, p_source text, p_campaign jsonb, p_notice_version text, p_token_hash bytea
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_email  text := lower(btrim(p_email));
  v_person uuid;
  v_consent subscriptions.consents;
begin
  -- The seven-day purge (§2): never-confirmed people, first seen over a week ago. Run here rather
  -- than on a schedule, so there is nothing to forget to set up.
  perform subscriptions.purge_unconfirmed();

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

-- A lead's pipeline entry, or null. Read through the sign-up or the account, as tags are.
create or replace function console.business_of(p_person uuid, p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'stage', b.stage, 'stageSince', b.stage_since, 'ownerId', b.owner_id, 'ownerName', m.name,
           'name', b.name, 'organisation', b.organisation, 'about', b.about)
    -- A member who has been removed is no longer anyone's owner: the lead reads as owned by nobody.
    from console.business_leads b left join console.members m on m.user_id = b.owner_id and m.status = 'active'
   where b.person_id = p_person or b.user_id = p_user
   order by b.added_at
   limit 1;
$$;
revoke all on function console.business_of(uuid, uuid) from public, anon, authenticated;

-- One thing a member typed: trimmed, held to its length AS TYPED, then scrubbed as a note is.
-- Empty is null. The length is checked before scrubbing, so the limit a member is told is the one
-- they can count.
create or replace function console.business_text(p_text text, p_max int, p_too_long text) returns text
language plpgsql immutable set search_path = '' as $$
declare v_text text := btrim(coalesce(p_text, ''));
begin
  if v_text = '' then
    return null;
  end if;
  if char_length(v_text) > p_max then
    raise exception '%', p_too_long using errcode = '22023';
  end if;
  return nullif(btrim(console.scrub(v_text)), '');
end $$;
revoke all on function console.business_text(text, int, text) from public, anon, authenticated;

-- The member a lead may be given to: active, and able to open Leads. Raises for anyone else.
create or replace function console.business_owner(p_owner uuid) returns console.members
language plpgsql stable security definer set search_path = '' as $$
declare v_owner console.members;
begin
  select * into v_owner from console.members m
   where m.user_id = p_owner and m.status = 'active' and m.role in ('owner', 'admin', 'support');
  if not found then
    raise exception 'not an owner' using errcode = '22023';
  end if;
  return v_owner;
end $$;
revoke all on function console.business_owner(uuid) from public, anon, authenticated;

-- Who may own a lead, by name: the Owner picker's choices.
create or replace function public.console_business_members() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform console.require_role('support');
  return (select coalesce(jsonb_agg(jsonb_build_object('id', m.user_id, 'name', m.name) order by m.name, m.user_id), '[]'::jsonb)
            from console.members m where m.status = 'active' and m.role in ('owner', 'admin', 'support'));
end $$;

-- Puts a lead in the pipeline at New. Every refusal is raised before anything is written.
create or replace function console.put_in_pipeline(p_member console.members, p_lead console.lead, p_name text, p_organisation text, p_about text, p_owner console.members) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if console.business_of(p_lead.person_id, p_lead.user_id) is not null then
    raise exception 'already in the pipeline' using errcode = '22023';
  end if;
  -- Under the sign-up when there is one, for the reason a tag is: it is what Delete lead removes.
  insert into console.business_leads (person_id, user_id, owner_id, name, organisation, about, added_by)
  values (p_lead.person_id, case when p_lead.person_id is null then p_lead.user_id end, p_owner.user_id, p_name, p_organisation, p_about, p_member.user_id);
end $$;
revoke all on function console.put_in_pipeline(console.members, console.lead, text, text, text, console.members) from public, anon, authenticated;

-- Add a business lead by hand. An address that is already a lead is MARKED instead: the answer
-- names the lead either way, and says which happened. A console member's own address is refused,
-- as it is everywhere a lead is defined.
create or replace function public.console_add_business_lead(p_environment text, p_email text, p_name text, p_organisation text, p_about text, p_owner uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member console.members := console.require_role('support');
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_name   text;
  v_org    text;
  v_about  text;
  v_owner  console.members;
  v_lead   console.lead;
  v_person uuid;
  v_added  boolean := false;
begin
  if char_length(v_email) not between 3 and 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'not an address' using errcode = '22023';
  end if;
  if exists (select 1 from console.members m where m.email = v_email) then
    raise exception 'a console member' using errcode = '22023';
  end if;
  v_name  := console.business_text(p_name, 80, 'name too long');
  v_org   := console.business_text(p_organisation, 80, 'name too long');
  v_about := console.business_text(p_about, 120, 'about too long');
  if v_about is null then
    raise exception 'about is empty' using errcode = '22023';
  end if;
  v_owner := console.business_owner(p_owner);

  select * into v_lead from console.leads() l where l.email = v_email;
  if v_lead.id is null then
    insert into subscriptions.people (email, first_source, added_by) values (v_email, 'added by hand', v_member.name) returning id into v_person;
    select * into v_lead from console.leads() l where l.person_id = v_person;
    v_added := true;
  end if;
  perform console.put_in_pipeline(v_member, v_lead, v_name, v_org, v_about, v_owner);
  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
    'leads', case when v_added then 'Added a business lead' else 'Marked a lead as a business enquiry' end,
    announcements.masked(v_lead.email), null, 'done', null,
    null, jsonb_build_object('owner', v_owner.name));
  return jsonb_build_object('id', v_lead.id, 'added', v_added);
end $$;

-- Mark a lead that is already in the list, from its record. Answers the pipeline entry.
create or replace function public.console_mark_business_lead(p_environment text, p_id text, p_name text, p_organisation text, p_about text, p_owner uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member console.members := console.require_role('support');
  v_name   text := console.business_text(p_name, 80, 'name too long');
  v_org    text := console.business_text(p_organisation, 80, 'name too long');
  v_about  text := console.business_text(p_about, 120, 'about too long');
  v_owner  console.members;
  v_lead   console.lead;
begin
  if v_about is null then
    raise exception 'about is empty' using errcode = '22023';
  end if;
  v_owner := console.business_owner(p_owner);
  v_lead := console.lead_for_writing(p_id);
  perform console.put_in_pipeline(v_member, v_lead, v_name, v_org, v_about, v_owner);
  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
    'leads', 'Marked a lead as a business enquiry', announcements.masked(v_lead.email), null, 'done', null,
    null, jsonb_build_object('owner', v_owner.name));
  return console.business_of(v_lead.person_id, v_lead.user_id);
end $$;

-- Move a lead to another stage. Moving it to where it is changes nothing, its time in the stage
-- included, and writes no row.
create or replace function public.console_move_business_lead(p_environment text, p_id text, p_stage text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member console.members := console.require_role('support');
  v_lead   console.lead;
  v_was    text;
begin
  if p_stage is null or p_stage not in ('new', 'contacted', 'qualified', 'won', 'lost') then
    raise exception 'unknown stage' using errcode = '22023';
  end if;
  v_lead := console.lead_for_writing(p_id);
  select b.stage into v_was from console.business_leads b where b.person_id = v_lead.person_id or b.user_id = v_lead.user_id for update;
  if not found then
    raise exception 'not in the pipeline' using errcode = '22023';
  end if;
  if v_was <> p_stage then
    update console.business_leads b set stage = p_stage, stage_since = now() where b.person_id = v_lead.person_id or b.user_id = v_lead.user_id;
    perform console.write_audit(
      p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
      'leads', 'Moved a business lead', announcements.masked(v_lead.email), null, 'done', null,
      jsonb_build_object('stage', v_was), jsonb_build_object('stage', p_stage));
  end if;
  return console.business_of(v_lead.person_id, v_lead.user_id);
end $$;

-- Give a lead to another owner.
create or replace function public.console_assign_business_lead(p_environment text, p_id text, p_owner uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member console.members := console.require_role('support');
  v_owner  console.members := console.business_owner(p_owner);
  v_lead   console.lead;
  v_was    uuid;
  v_found  boolean;
begin
  v_lead := console.lead_for_writing(p_id);
  select true, b.owner_id into v_found, v_was from console.business_leads b where b.person_id = v_lead.person_id or b.user_id = v_lead.user_id for update;
  if v_found is not true then
    raise exception 'not in the pipeline' using errcode = '22023';
  end if;
  if v_was is distinct from v_owner.user_id then
    update console.business_leads b set owner_id = v_owner.user_id where b.person_id = v_lead.person_id or b.user_id = v_lead.user_id;
    perform console.write_audit(
      p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
      'leads', 'Assigned a business lead', announcements.masked(v_lead.email), null, 'done', null,
      jsonb_build_object('owner', (select m.name from console.members m where m.user_id = v_was)), jsonb_build_object('owner', v_owner.name));
  end if;
  return console.business_of(v_lead.person_id, v_lead.user_id);
end $$;

-- Take a lead out of the pipeline. The lead stays, with its tags and notes; what goes is the
-- stage, the owner and what was typed about it.
create or replace function public.console_unmark_business_lead(p_environment text, p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member console.members := console.require_role('support');
  v_lead   console.lead;
  v_gone   int;
begin
  v_lead := console.lead_for_writing(p_id);
  delete from console.business_leads b where b.person_id = v_lead.person_id or b.user_id = v_lead.user_id;
  get diagnostics v_gone = row_count;
  if v_gone = 0 then
    raise exception 'not in the pipeline' using errcode = '22023';
  end if;
  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
    'leads', 'Removed a lead from the pipeline', announcements.masked(v_lead.email), null, 'done', null,
    null, null);
  return null;
end $$;

-- The record, with the pipeline entry, and — for a lead added by hand — the moment it was added
-- and by whom, as the oldest thing in its timeline. Everything else is 20261005090000's and
-- 20261006090000's, unchanged.
create or replace function public.console_lead(p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_record jsonb;
  v_lead   console.lead;
  v_hand   jsonb;
begin
  perform console.require_role('support');
  v_record := console.lead_record(p_id);
  if v_record is null then
    return null;
  end if;
  v_lead := console.lead_by_id(p_id);
  select jsonb_build_object('at', p.first_seen, 'kind', 'added_by_hand', 'list', null, 'source', null, 'subject', null, 'reason', null, 'by', p.added_by)
    into v_hand
    from subscriptions.people p where p.id = v_lead.person_id and p.first_source = 'added by hand';
  return v_record
    || jsonb_build_object(
         'tags', console.tags_of(v_lead.person_id, v_lead.user_id),
         'notes', console.notes_of(v_lead.person_id, v_lead.user_id),
         'business', console.business_of(v_lead.person_id, v_lead.user_id))
    || case when v_hand is null then '{}'::jsonb else jsonb_build_object('timeline', (v_record -> 'timeline') || jsonb_build_array(v_hand)) end;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.console_business_members()',
    'public.console_add_business_lead(text, text, text, text, text, uuid)',
    'public.console_mark_business_lead(text, text, text, text, text, uuid)',
    'public.console_move_business_lead(text, text, text)',
    'public.console_assign_business_lead(text, text, uuid)',
    'public.console_unmark_business_lead(text, text)',
    'public.console_lead(text)'
  ] loop
    execute format('revoke all on function %s from public, anon, service_role', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
