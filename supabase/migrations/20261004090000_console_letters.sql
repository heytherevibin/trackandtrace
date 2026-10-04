-- The console's layer over announcements (07, PR 3a). `20261002085215_announcements.sql` gave the
-- send job its functions: service_role, with the acting member passed as an argument and trusted.
-- A browser must not be trusted that way, so these seven are what a console member's OWN session
-- calls. Each re-checks the Admin floor first (07 is Owner and Admin, per the role matrix), takes
-- the member from the session rather than from an argument, and writes its audit row in the same
-- transaction as the change — or raises and does neither.
--
-- KEYS ARE camelCase, as in the announcements file: `src/console/announcements/letters.ts`
-- destructures them, and a snake_case key reads there as a missing field.
--
-- CHANGING A SIGNATURE NEEDS `drop function if exists` FOR THE OLD ONE FIRST. The pgTAP file counts
-- these functions for exactly that reason.

-- Every letter, newest first, with its running counts. `waiting` is pending plus sending: on an open
-- letter that is what is still to go, and on a stopped one it is what was never reached.
create or replace function public.console_letters() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform console.require_role('admin');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', l.id, 'list', l.list, 'subject', l.subject, 'state', l.state,
             'total', coalesce(l.recipients_total, 0),
             'sent', c.sent, 'skipped', c.skipped, 'unknown', c.unknown, 'waiting', c.waiting,
             'createdAt', l.created_at, 'queuedAt', l.queued_at,
             'stoppedAt', l.stopped_at, 'finishedAt', l.finished_at)
           order by l.created_at desc)
      from announcements.letters l
     cross join lateral (
       select (count(*) filter (where d.state = 'sent'))::int                   as sent,
              (count(*) filter (where d.state = 'skipped'))::int                as skipped,
              (count(*) filter (where d.state = 'unknown'))::int                as unknown,
              (count(*) filter (where d.state in ('pending', 'sending')))::int  as waiting
         from announcements.deliveries d where d.letter_id = l.id) c
  ), '[]'::jsonb);
end $$;

-- One letter, or null. The names are the members' as they are NOW; a member since removed reads as
-- null and the page says so, rather than this function inventing a name.
-- `sentToday` is measured from 00:00 UTC because that is when the mail allowance's day turns.
create or replace function public.console_letter(p_letter uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform console.require_role('admin');
  return (
    select jsonb_build_object(
             'id', l.id, 'list', l.list, 'subject', l.subject, 'body', l.body, 'state', l.state,
             'total', coalesce(l.recipients_total, 0),
             'sent', c.sent, 'skipped', c.skipped, 'unknown', c.unknown, 'waiting', c.waiting,
             'sentToday', c.sent_today,
             'createdAt', l.created_at, 'queuedAt', l.queued_at,
             'stoppedAt', l.stopped_at, 'finishedAt', l.finished_at,
             'testSentAt', l.test_sent_at, 'testSentTo', l.test_sent_to,
             'queuedBy', (select m.name from console.members m where m.user_id = l.queued_by),
             'stoppedBy', (select m.name from console.members m where m.user_id = l.stopped_by))
      from announcements.letters l
     cross join lateral (
       select (count(*) filter (where d.state = 'sent'))::int                   as sent,
              (count(*) filter (where d.state = 'skipped'))::int                as skipped,
              (count(*) filter (where d.state = 'unknown'))::int                as unknown,
              (count(*) filter (where d.state in ('pending', 'sending')))::int  as waiting,
              (count(*) filter (where d.state = 'sent'
                 and d.sent_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')))::int as sent_today
         from announcements.deliveries d where d.letter_id = l.id) c
     where l.id = p_letter);
end $$;

-- How many people each list would reach right now, and whether Availability has had its one send.
-- The counts use the condition `announce_queue` uses (confirmed, not withdrawn), so the number the
-- composer shows is the number Queue will fix, give or take whoever changes their mind in between.
-- "Spent" is the trigger's own condition, so the composer greys the choice out for exactly the
-- letters the database would refuse.
create or replace function public.console_letter_lists() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform console.require_role('admin');
  return (
    select jsonb_build_object(
      'news', (select count(*)::int from subscriptions.consents c
                where c.list = 'news' and c.confirmed_at is not null and c.withdrawn_at is null),
      'availability', (select count(*)::int from subscriptions.consents c
                where c.list = 'availability' and c.confirmed_at is not null and c.withdrawn_at is null),
      'availabilitySpent', s.spent,
      'availabilitySpentAt', s.finished_at)
      from (
        select count(*) > 0 as spent, max(l.finished_at) as finished_at
          from announcements.letters l
         where l.list = 'availability'
           and (l.state in ('queued', 'sending')
                or exists (select 1 from announcements.deliveries d where d.letter_id = l.id and d.state = 'sent'))) s);
end $$;

-- A new draft, or a change to one. Only a draft may change: what is queued has been fixed for the
-- people on it. A change to the list, subject or body CLEARS the test, because the test was proof of
-- other words; saving the same text again keeps it.
-- `p_letter` is last and defaults to null so the generated TypeScript types make it optional: a new
-- draft omits it, where a required `string` could not be given null without a cast.
create or replace function public.console_save_letter(p_list text, p_subject text, p_body text, p_letter uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_member  console.members := console.require_role('admin');
  v_subject text := btrim(coalesce(p_subject, ''));
  v_old     announcements.letters;
  v_id      uuid;
begin
  if p_list is null or p_list not in ('news', 'availability') then
    raise exception 'unknown list' using errcode = '22023';
  end if;
  if char_length(v_subject) not between 1 and 200 then
    raise exception 'subject length' using errcode = '22023';
  end if;
  if p_body is null or char_length(btrim(p_body)) < 1 or char_length(p_body) > 20000 then
    raise exception 'body length' using errcode = '22023';
  end if;

  if p_letter is null then
    insert into announcements.letters (list, subject, body, created_by)
    values (p_list, v_subject, p_body, v_member.user_id)
    returning id into v_id;
    return v_id;
  end if;

  select * into v_old from announcements.letters l where l.id = p_letter for update;
  if not found then
    raise exception 'no such letter' using errcode = '22023';
  end if;
  if v_old.state <> 'draft' then
    raise exception 'not a draft' using errcode = '22023';
  end if;

  if v_old.list is distinct from p_list or v_old.subject is distinct from v_subject or v_old.body is distinct from p_body then
    update announcements.letters
       set list = p_list, subject = v_subject, body = p_body, test_sent_at = null, test_sent_to = null
     where id = p_letter;
  end if;
  return p_letter;
end $$;

-- Records that the member proofed this draft. The address is the member's OWN, read from their row:
-- the route has already mailed it, and an argument here would let a caller record a test to an
-- address nobody mailed.
create or replace function public.console_letter_tested(p_environment text, p_letter uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_member console.members := console.require_role('admin');
  v_letter announcements.letters;
begin
  select * into v_letter from announcements.letters l where l.id = p_letter for update;
  if not found then
    raise exception 'no such letter' using errcode = '22023';
  end if;
  if v_letter.state <> 'draft' then
    raise exception 'not a draft' using errcode = '22023';
  end if;
  update announcements.letters set test_sent_at = now(), test_sent_to = v_member.email where id = p_letter;
  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
    'messages', 'Sent a test letter', v_letter.subject, null, 'done', null,
    null, jsonb_build_object('list', v_letter.list));
end $$;

-- Queue. `announce_queue` does the work and holds the rules (a draft, and one somebody has proofed;
-- the Availability trigger refuses a second send). This adds the floor, the member, the refusal of
-- an empty list, and the record. A raise anywhere undoes all of it.
create or replace function public.console_queue_letter(p_environment text, p_letter uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_member  console.members := console.require_role('admin');
  v_subject text;
  v_list    text;
  v_made    int;
begin
  select l.subject, l.list into v_subject, v_list from announcements.letters l where l.id = p_letter;
  if not found then
    raise exception 'no such letter' using errcode = '22023';
  end if;
  v_made := public.announce_queue(p_letter => p_letter, p_member => v_member.user_id);
  if v_made = 0 then
    raise exception 'nobody to send to' using errcode = '22023';
  end if;
  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
    'messages', 'Queued a letter', v_subject, null, 'done', null,
    null, jsonb_build_object('list', v_list, 'people', v_made));
  return v_made;
end $$;

-- Stop. Refuses a letter that is not open, where `announce_stop` would quietly do nothing: the
-- console must not say "Stopped" about a letter that had already finished.
create or replace function public.console_stop_letter(p_environment text, p_letter uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_member  console.members := console.require_role('admin');
  v_subject text;
  v_state   text;
  v_counts  jsonb;
begin
  select l.subject, l.state into v_subject, v_state from announcements.letters l where l.id = p_letter for update;
  if not found then
    raise exception 'no such letter' using errcode = '22023';
  end if;
  if v_state not in ('queued', 'sending') then
    raise exception 'not open' using errcode = '22023';
  end if;
  perform public.announce_stop(p_letter => p_letter, p_member => v_member.user_id);
  select jsonb_build_object(
           'sent',    (count(*) filter (where d.state = 'sent'))::int,
           'skipped', (count(*) filter (where d.state = 'skipped'))::int,
           'unknown', (count(*) filter (where d.state = 'unknown'))::int,
           'waiting', (count(*) filter (where d.state in ('pending', 'sending')))::int)
    into v_counts from announcements.deliveries d where d.letter_id = p_letter;
  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
    'messages', 'Stopped a letter', v_subject, null, 'done', null,
    null, v_counts);
end $$;

-- A member's own session and nobody else: not anon, and not service_role, because each of these is
-- a person's act and must carry a person.
do $$
declare f text;
begin
  foreach f in array array[
    'public.console_letters()',
    'public.console_letter(uuid)',
    'public.console_letter_lists()',
    'public.console_save_letter(text, text, text, uuid)',
    'public.console_letter_tested(text, uuid)',
    'public.console_queue_letter(text, uuid)',
    'public.console_stop_letter(text, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, service_role', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
