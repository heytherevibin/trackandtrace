-- Module 06, Leads (second part): tags and notes.
--
-- Both are a console member's own words about a lead. A lead is a sign-up, an account, or both
-- (20261005090000), so each tag and each note hangs off ONE of those rows and is read through
-- either: written under the sign-up when there is one, under the account when there is not, and
-- found again whichever the lead's id names today. An account-only lead that later signs up changes
-- its id from `a:` to `p:` and keeps everything written about it.
--
-- NEITHER TABLE HOLDS AN ADDRESS. They reference the sign-up or the account and cascade with it:
-- the seven-day purge of an unconfirmed sign-up, a deleted lead and a deleted account each take
-- their tags and notes along, with nothing left to sweep and no third copy of the address to keep.
--
-- NEITHER ACT NEEDS A KEY (the brief's table of safeguards: "Notes, tags … None (logged)"). Each
-- is written to the audit log, by the lead's masked address. A note's own words are not: the log
-- says a note was written, and the note is where it says what.
--
-- A NOTE IS SCRUBBED as a reason is (`console.scrub`), and is never changed or removed afterwards.
-- There is no function that could.

create table console.lead_tags (
  id        uuid primary key default gen_random_uuid(),
  person_id uuid references subscriptions.people (id) on delete cascade,
  user_id   uuid references auth.users (id) on delete cascade,
  -- Letters, numbers and hyphens, 24 at most, lower case, a hyphen never first or last.
  tag       text not null check (tag ~ '^[a-z0-9]([a-z0-9-]{0,22}[a-z0-9])?$'),
  added_by  uuid,
  added_at  timestamptz not null default now(),
  check (num_nonnulls(person_id, user_id) = 1)
);
create unique index lead_tags_person on console.lead_tags (person_id, tag) where person_id is not null;
create unique index lead_tags_user on console.lead_tags (user_id, tag) where user_id is not null;
create index lead_tags_tag on console.lead_tags (tag);

create table console.lead_notes (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid references subscriptions.people (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete cascade,
  -- 500 as typed. Wider here because scrubbing can lengthen: "[removed]" is longer than a short IP.
  body        text not null check (char_length(body) between 1 and 1000),
  author_id   uuid,
  author_name text not null,
  -- The clock, not the transaction's start: two notes are two moments, and newest-first is their order.
  at          timestamptz not null default clock_timestamp(),
  check (num_nonnulls(person_id, user_id) = 1)
);
create index lead_notes_person on console.lead_notes (person_id, at desc) where person_id is not null;
create index lead_notes_user on console.lead_notes (user_id, at desc) where user_id is not null;

alter table console.lead_tags enable row level security;
alter table console.lead_notes enable row level security;
revoke all on table console.lead_tags, console.lead_notes from public, anon, authenticated;

-- A lead's tags, in order, each once: one written under the account and again under the sign-up is
-- one tag.
create or replace function console.tags_of(p_person uuid, p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(t.tag order by t.tag), '[]'::jsonb)
    from (select distinct g.tag from console.lead_tags g where g.person_id = p_person or g.user_id = p_user) t;
$$;
revoke all on function console.tags_of(uuid, uuid) from public, anon, authenticated;

-- A lead's notes, newest first.
create or replace function console.notes_of(p_person uuid, p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'author', n.author_name, 'at', n.at, 'body', n.body) order by n.at desc, n.id), '[]'::jsonb)
    from console.lead_notes n where n.person_id = p_person or n.user_id = p_user;
$$;
revoke all on function console.notes_of(uuid, uuid) from public, anon, authenticated;

-- The list row now carries the lead's tags. No longer immutable: it reads a table.
create or replace function console.lead_row(l console.lead) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', l.id, 'email', announcements.masked(l.email), 'news', l.news, 'availability', l.availability,
    'account', l.account, 'source', l.source,
    'campaign', case when l.campaign_source is null and l.campaign_medium is null and l.campaign_name is null then null
                     else jsonb_build_object('source', l.campaign_source, 'medium', l.campaign_medium, 'name', l.campaign_name) end,
    'tags', console.tags_of(l.person_id, l.user_id),
    'firstSeen', l.first_seen, 'lastActivity', l.last_activity);
$$;
revoke all on function console.lead_row(console.lead) from public, anon, authenticated;

-- The list, with a Tag filter. The old six-argument form is dropped in the same transaction: two
-- forms that both accept a call naming four arguments would leave PostgREST unable to choose. A
-- page deployed before this migration names at most those six, and the new form answers it.
drop function if exists public.console_leads(text, text, text, timestamptz, int, int);
create or replace function public.console_leads(p_news text default null, p_account text default null, p_source text default null, p_tag text default null, p_since timestamptz default null, p_limit int default 50, p_offset int default 0) returns jsonb
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
         -- A tag nobody carries matches nobody; it is not an error, since a tag exists only by use.
         and (p_tag is null or exists (select 1 from console.lead_tags g where g.tag = p_tag and (g.person_id = l.person_id or g.user_id = l.user_id)))
    )
    select jsonb_build_object(
      'total', (select count(*)::int from matching),
      'rows', coalesce((
        select jsonb_agg(console.lead_row(page) order by page.last_activity desc, page.id)
          from (select * from matching m order by m.last_activity desc, m.id limit v_limit offset v_offset) page), '[]'::jsonb)));
end $$;

-- The record, with the lead's tags and notes. Everything else is 20261005090000's, unchanged: that
-- function is moved out of the API's reach and asked for its answer, so a record's body has one
-- definition rather than a second copy here.
alter function public.console_lead(text) set schema console;
alter function console.console_lead(text) rename to lead_record;
revoke all on function console.lead_record(text) from public, anon, authenticated, service_role;

create or replace function public.console_lead(p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_record jsonb;
  v_lead   console.lead;
begin
  perform console.require_role('support');
  v_record := console.lead_record(p_id);
  if v_record is null then
    return null;
  end if;
  v_lead := console.lead_by_id(p_id);
  return v_record || jsonb_build_object(
    'tags', console.tags_of(v_lead.person_id, v_lead.user_id),
    'notes', console.notes_of(v_lead.person_id, v_lead.user_id));
end $$;

-- Every tag in use, once, in order: the Tag filter's choices and the record's suggestions. A tag
-- exists by being on a lead and stops existing when the last one loses it; there is nothing to manage.
create or replace function public.console_lead_tags() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform console.require_role('support');
  return (select coalesce(jsonb_agg(t.tag order by t.tag), '[]'::jsonb) from (select distinct g.tag from console.lead_tags g) t);
end $$;

-- The lead an id names, or the error every writer below gives for one that is not there.
create or replace function console.lead_for_writing(p_id text) returns console.lead
language plpgsql stable security definer set search_path = '' as $$
declare v_lead console.lead;
begin
  v_lead := console.lead_by_id(p_id);
  if v_lead.id is null then
    raise exception 'no such lead' using errcode = '22023';
  end if;
  return v_lead;
end $$;
revoke all on function console.lead_for_writing(text) from public, anon, authenticated;

-- Add a tag. Lowered and trimmed, then held to the table's own rule. Ten on a lead at most. Adding
-- one the lead already has is no error and no audit row: nothing happened.
create or replace function public.console_tag_lead(p_environment text, p_id text, p_tag text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member console.members := console.require_role('support');
  v_tag    text := lower(btrim(coalesce(p_tag, '')));
  v_lead   console.lead;
  v_has    jsonb;
begin
  if v_tag !~ '^[a-z0-9]([a-z0-9-]{0,22}[a-z0-9])?$' then
    raise exception 'not a tag' using errcode = '22023';
  end if;
  v_lead := console.lead_for_writing(p_id);
  v_has := console.tags_of(v_lead.person_id, v_lead.user_id);
  if v_has ? v_tag then
    return v_has;
  end if;
  if jsonb_array_length(v_has) >= 10 then
    raise exception 'too many tags' using errcode = '22023';
  end if;
  -- Under the sign-up when there is one, so the tag outlives nothing it should not: a sign-up is
  -- what the purge and Delete lead remove.
  insert into console.lead_tags (person_id, user_id, tag, added_by)
  values (v_lead.person_id, case when v_lead.person_id is null then v_lead.user_id end, v_tag, v_member.user_id);
  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
    'leads', 'Tagged a lead', announcements.masked(v_lead.email), null, 'done', null,
    null, jsonb_build_object('tag', v_tag));
  return console.tags_of(v_lead.person_id, v_lead.user_id);
end $$;

-- Remove a tag, wherever it was written: under the sign-up, the account, or both.
create or replace function public.console_untag_lead(p_environment text, p_id text, p_tag text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member console.members := console.require_role('support');
  v_tag    text := lower(btrim(coalesce(p_tag, '')));
  v_lead   console.lead;
  v_gone   int;
begin
  v_lead := console.lead_for_writing(p_id);
  delete from console.lead_tags g where g.tag = v_tag and (g.person_id = v_lead.person_id or g.user_id = v_lead.user_id);
  get diagnostics v_gone = row_count;
  if v_gone > 0 then
    perform console.write_audit(
      p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
      'leads', 'Removed a tag from a lead', announcements.masked(v_lead.email), null, 'done', null,
      jsonb_build_object('tag', v_tag), null);
  end if;
  return console.tags_of(v_lead.person_id, v_lead.user_id);
end $$;

-- Add a note. 500 characters as typed; scrubbed before it is stored, as a reason is; signed with the
-- member's name as it stands today. The audit row holds none of the note's words.
create or replace function public.console_note_lead(p_environment text, p_id text, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member console.members := console.require_role('support');
  v_typed  text := btrim(coalesce(p_body, ''));
  v_body   text;
  v_lead   console.lead;
begin
  if v_typed = '' then
    raise exception 'empty note' using errcode = '22023';
  end if;
  if char_length(v_typed) > 500 then
    raise exception 'note too long' using errcode = '22023';
  end if;
  v_body := btrim(console.scrub(v_typed));
  v_lead := console.lead_for_writing(p_id);
  insert into console.lead_notes (person_id, user_id, body, author_id, author_name)
  values (v_lead.person_id, case when v_lead.person_id is null then v_lead.user_id end, v_body, v_member.user_id, v_member.name);
  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
    'leads', 'Added a note to a lead', announcements.masked(v_lead.email), null, 'done', null,
    null, null);
  return console.notes_of(v_lead.person_id, v_lead.user_id);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.console_leads(text, text, text, text, timestamptz, int, int)',
    'public.console_lead(text)',
    'public.console_lead_tags()',
    'public.console_tag_lead(text, text, text)',
    'public.console_untag_lead(text, text, text)',
    'public.console_note_lead(text, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, service_role', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
