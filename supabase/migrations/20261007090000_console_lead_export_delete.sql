-- Module 06, Leads (second part): Delete lead and Export.
--
-- BOTH ARE BEHIND A REASON AND A KEY. Each spends a tap (`console.use_tap`) minted over exactly the
-- arguments it is called with, so the ceremony and the act are bound to each other by construction;
-- and each carries the deployment INSIDE what the tap digests, so a tap minted for one deployment
-- approves nothing under another (20260923090000's rule, restated for these two).
--
-- EVERY REFUSAL COMES BEFORE THE TAP IS SPENT, and the whole call is one transaction: a member is
-- never asked for their key a second time because of something that could have been known first.
--
-- DELETE is Owner, Admin and Support, and only for a lead with NO ACCOUNT. It removes the sign-up,
-- and with it — by the tables' own cascades — the consents, the confirmation links, the deliveries,
-- the tags and the notes. A suppression on the address stays: mail still cannot reach it, and
-- "never email this address again" is an erasure request's job (module 09), not this one's. The
-- person can sign up again, as a new sign-up.
--
-- EXPORT is Owner and Admin. Besides Reveal it is the one place a whole address leaves the
-- database, which is what an export is for; the audit row holds how many left and under which
-- filters, and no address.

-- The list's own filters, checked. One place, so the list and the export refuse the same things.
create or replace function console.check_lead_filters(p_news text, p_account text, p_source text) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if (p_news is not null and p_news not in ('pending', 'subscribed', 'unsubscribed', 'suppressed', 'none'))
     or (p_account is not null and p_account not in ('none', 'has', 'disabled'))
     or (p_source is not null and p_source not in ('footer', 'landing', 'pre-booking', 'account', 'added by hand')) then
    raise exception 'unknown filter' using errcode = '22023';
  end if;
end $$;
revoke all on function console.check_lead_filters(text, text, text) from public, anon, authenticated;

-- The filtered set, as one relation: what the list pages through and what the export takes whole.
-- "The file carries the set the member was looking at" is only true if both read it from here.
-- Whole addresses, so nobody is granted it.
create or replace function console.leads_matching(p_news text, p_account text, p_source text, p_tag text, p_since timestamptz) returns setof console.lead
language sql stable security definer set search_path = '' as $$
  select l.* from console.leads() l
   where (p_news is null or l.news = p_news)
     and (p_account is null or l.account = p_account)
     and (p_source is null or l.source = p_source)
     and (p_since is null or l.first_seen >= p_since)
     -- A tag nobody carries matches nobody; it is not an error, since a tag exists only by use.
     and (p_tag is null or exists (select 1 from console.lead_tags g where g.tag = p_tag and (g.person_id = l.person_id or g.user_id = l.user_id)));
$$;
revoke all on function console.leads_matching(text, text, text, text, timestamptz) from public, anon, authenticated;

-- The list, unchanged in what it answers, now reading the shared set.
create or replace function public.console_leads(p_news text default null, p_account text default null, p_source text default null, p_tag text default null, p_since timestamptz default null, p_limit int default 50, p_offset int default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_limit  int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  perform console.require_role('support');
  perform console.check_lead_filters(p_news, p_account, p_source);
  return (
    with matching as (select * from console.leads_matching(p_news, p_account, p_source, p_tag, p_since))
    select jsonb_build_object(
      'total', (select count(*)::int from matching),
      'rows', coalesce((
        select jsonb_agg(console.lead_row(page) order by page.last_activity desc, page.id)
          from (select * from matching m order by m.last_activity desc, m.id limit v_limit offset v_offset) page), '[]'::jsonb)));
end $$;
revoke all on function public.console_leads(text, text, text, text, timestamptz, int, int) from public, anon, service_role;
grant execute on function public.console_leads(text, text, text, text, timestamptz, int, int) to authenticated;

-- The most one export may carry. A guard, not a fact: it is checked before the bulk read.
create or replace function console.lead_export_max() returns integer
language sql immutable set search_path = '' as $$ select 10000 $$;
revoke all on function console.lead_export_max() from public, anon, authenticated, service_role;

-- Delete a lead. `p_value` is the object the tap digested, and carries the deployment.
create or replace function public.console_delete_lead(p_environment text, p_id text, p_value text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_member console.members := console.require_role('support');
  v_value  jsonb;
  v_lead   console.lead;
  v_before jsonb;
begin
  -- Read, never rebuilt: the digest was taken over the string the browser sent. Anything that is not
  -- the expected object under this deployment is one refusal, in the console's own class.
  begin
    v_value := p_value::jsonb;
  exception when invalid_text_representation then
    v_value := null;
  end;
  if v_value is null or jsonb_typeof(v_value) <> 'object' or v_value ->> 'environment' is distinct from p_environment then
    raise exception 'environment mismatch' using errcode = '22023';
  end if;

  v_lead := console.lead_for_writing(p_id);
  -- An account is not this module's to delete, and a sign-up that has one is that account's record
  -- too. Refused before the tap, so the refusal costs no ceremony.
  if v_lead.user_id is not null or v_lead.person_id is null then
    raise exception 'has an account' using errcode = '22023';
  end if;

  perform console.use_tap('Deleted a lead', p_id, p_value, p_reason);

  -- What is about to go, for the record: enough to say what was removed, and no address.
  v_before := jsonb_build_object(
    'news', v_lead.news, 'availability', v_lead.availability, 'source', v_lead.source,
    'tags', (select count(*)::int from console.lead_tags g where g.person_id = v_lead.person_id),
    'notes', (select count(*)::int from console.lead_notes n where n.person_id = v_lead.person_id));

  delete from subscriptions.people p where p.id = v_lead.person_id;

  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
    'leads', 'Deleted a lead', announcements.masked(v_lead.email), p_reason, 'done', null,
    v_before, null);
end $$;

-- Export the filtered list, whole addresses and all. `p_filters` is the canonical object the tap
-- digested: the list's five filters and the deployment, exactly as the browser built it
-- (src/console/leads/export.ts), parsed here and never rebuilt.
create or replace function public.console_export_leads(p_environment text, p_filters text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member  console.members := console.require_role('admin');
  v_filters jsonb;
  v_since   timestamptz;
  v_rows    jsonb;
  v_total   int;
begin
  -- The two casts that can fail on a hand-made request, named, so a refusal is the console's own
  -- words and never Postgres's about invalid input syntax.
  begin
    v_filters := p_filters::jsonb;
    v_since := nullif(v_filters ->> 'since', '')::timestamptz;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    v_filters := null;
  end;
  if v_filters is null or jsonb_typeof(v_filters) <> 'object' then
    raise exception 'the export filters could not be read' using errcode = '22023';
  end if;
  if v_filters ->> 'environment' is distinct from p_environment then
    raise exception 'environment mismatch' using errcode = '22023';
  end if;
  perform console.check_lead_filters(v_filters ->> 'news', v_filters ->> 'account', v_filters ->> 'source');

  -- Counted before the tap is spent: a file that was always going to be refused takes no ceremony.
  if (select count(*) from console.leads_matching(v_filters ->> 'news', v_filters ->> 'account', v_filters ->> 'source', v_filters ->> 'tag', v_since)) > console.lead_export_max() then
    raise exception 'too many leads to export' using errcode = '22023';
  end if;

  perform console.use_tap('Exported leads', 'Leads', p_filters, p_reason);

  -- The list's own order, tie-break included, so two exports of one set agree row for row.
  select coalesce(jsonb_agg(jsonb_build_object(
           'email', l.email, 'news', l.news, 'availability', l.availability, 'account', l.account, 'source', l.source,
           'campaignSource', l.campaign_source, 'campaignMedium', l.campaign_medium, 'campaignName', l.campaign_name,
           'tags', console.tags_of(l.person_id, l.user_id),
           'firstSeen', l.first_seen, 'lastActivity', l.last_activity)
         order by l.last_activity desc, l.id), '[]'::jsonb)
    into v_rows
    from console.leads_matching(v_filters ->> 'news', v_filters ->> 'account', v_filters ->> 'source', v_filters ->> 'tag', v_since) l;

  -- From the rows that left, never from the count above: the record describes the export.
  v_total := jsonb_array_length(v_rows);

  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
    'leads', 'Exported leads', 'Leads', p_reason, 'done', null,
    null, jsonb_build_object('count', v_total, 'filters', v_filters));

  return jsonb_build_object('rows', v_rows, 'count', v_total);
end $$;

revoke all on function public.console_delete_lead(text, text, text, text) from public, anon, service_role;
grant execute on function public.console_delete_lead(text, text, text, text) to authenticated;
revoke all on function public.console_export_leads(text, text, text) from public, anon, service_role;
grant execute on function public.console_export_leads(text, text, text) to authenticated;
