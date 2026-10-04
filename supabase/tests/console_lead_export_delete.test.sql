begin;
create extension if not exists pgtap with schema extensions;

-- Module 06, Leads (second part): Delete lead and Export. Both are behind a reason and a key: each
-- spends a tap minted over exactly its own arguments, the deployment among them. Delete is Owner,
-- Admin and Support, and only for a lead with no account. Export is Owner and Admin, and is the one
-- place besides Reveal where a whole address leaves the database.
-- Named notation throughout: PostgREST resolves on argument names.

select plan(42);

delete from announcements.suppressions;
delete from announcements.letters;
delete from subscriptions.people;
delete from public.watchlist_entries;
delete from auth.users u where not exists (select 1 from console.members m where m.user_id = u.id);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in'),
  ('33333333-3333-3333-3333-333333333333', 'support@trakline.in'),
  ('55555555-5555-5555-5555-555555555555', 'viewer@trakline.in');
insert into console.members (user_id, email, name, role, status) values
  ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in', 'Asha Rao', 'owner', 'active'),
  ('33333333-3333-3333-3333-333333333333', 'support@trakline.in', 'Kiran Das', 'support', 'active'),
  ('55555555-5555-5555-5555-555555555555', 'viewer@trakline.in', 'Meera Nair', 'viewer', 'active');
insert into console.sessions (session_id, member_id, address_hash, device_label, expires_at, key_verified_at) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'hash', 'Chrome on macOS', now() + interval '7 days', now()),
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'hash', 'Chrome on macOS', now() + interval '7 days', now()),
  ('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', 'hash', 'Chrome on macOS', now() + interval '7 days', now());

create or replace function pg_temp.speak_as(p_user uuid, p_session uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'session_id', p_session)::text, true);
end;
$$;

-- A verified tap for exactly these four fields.
create or replace function pg_temp.tap(p_member uuid, p_session uuid, p_label text, p_action text, p_target text, p_value text, p_reason text) returns void
language plpgsql as $$
begin
  insert into console.challenges (member_id, session_id, purpose, challenge, digest, expires_at, verified_at)
  values (p_member, p_session, 'action', p_label, console.action_digest(p_action, p_target, p_value, p_reason), now() + interval '5 minutes', now());
end;
$$;

-- Four leads. `gone` only signed up (subscribed to both lists, tagged, noted, and suppressed);
-- `pending` only signed up; `asha` signed up and has an account; `dev` only has an account.
insert into auth.users (id, email, created_at) values
  ('c1111111-1111-4111-8111-111111111111', 'asha@leads.test', now() - interval '14 days'),
  ('c2222222-2222-4222-8222-222222222222', 'dev@leads.test',  now() - interval '40 days');
insert into subscriptions.people (id, email, first_seen, first_source, campaign_source, campaign_medium, campaign_name) values
  ('a1111111-1111-4111-8111-111111111111', 'asha@leads.test',    now() - interval '17 days', 'footer', null, null, null),
  ('a2222222-2222-4222-8222-222222222222', 'pending@leads.test', now() - interval '1 day',   'landing', null, null, null),
  ('a7777777-7777-4777-8777-777777777777', 'gone@leads.test',    now() - interval '9 days',  'pre-booking', 'newsletter', 'email', 'launch');
insert into subscriptions.consents (person_id, list, notice_version, source, consented_at, confirmed_at) values
  ('a1111111-1111-4111-8111-111111111111', 'news', '1.1', 'footer',  now() - interval '17 days', now() - interval '17 days'),
  ('a2222222-2222-4222-8222-222222222222', 'news', '1.1', 'landing', now() - interval '1 day', null),
  ('a7777777-7777-4777-8777-777777777777', 'news', '1.1', 'footer',  now() - interval '8 days', now() - interval '8 days'),
  ('a7777777-7777-4777-8777-777777777777', 'availability', '1.1', 'pre-booking', now() - interval '9 days', now() - interval '9 days');
insert into console.lead_tags (person_id, tag) values ('a7777777-7777-4777-8777-777777777777', 'press'), ('a7777777-7777-4777-8777-777777777777', 'beta'), ('a1111111-1111-4111-8111-111111111111', 'press');
insert into console.lead_notes (person_id, body, author_name) values ('a7777777-7777-4777-8777-777777777777', 'A note.', 'Kiran Das');

select set_config('t.gone', 'p:a7777777-7777-4777-8777-777777777777', true);
select set_config('t.env', '{"environment":"development"}', true);
select set_config('t.reason', 'Asked by phone to be removed from our lists.', true);

-- ---------------------------------------------------------------------------
-- Delete lead.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from unnest(array['public.console_delete_lead(text, text, text, text)', 'public.console_export_leads(text, text, text)']) f
    where has_function_privilege('authenticated', f, 'execute')
      and not has_function_privilege('anon', f, 'execute')
      and not has_function_privilege('service_role', f, 'execute')),
  2, 'both are for authenticated alone: each is a person''s act and carries that person''s tap');

select pg_temp.speak_as('55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666');
select throws_ok(format($$select public.console_delete_lead(p_environment => 'development', p_id => %L, p_value => %L, p_reason => %L)$$, current_setting('t.gone'), current_setting('t.env'), current_setting('t.reason')),
  '42501', 'no access', 'a Viewer cannot delete a lead');

select pg_temp.speak_as('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444');
select throws_ok(format($$select public.console_delete_lead(p_environment => 'development', p_id => %L, p_value => %L, p_reason => %L)$$, current_setting('t.gone'), current_setting('t.env'), current_setting('t.reason')),
  '42501', 'no tap for this action', 'Support may, but not without a key');
select throws_ok(format($$select public.console_delete_lead(p_environment => 'development', p_id => %L, p_value => '{"environment":"production"}', p_reason => %L)$$, current_setting('t.gone'), current_setting('t.reason')),
  '22023', 'environment mismatch', 'nor under a deployment the tap was not minted for');
select throws_ok(format($$select public.console_delete_lead(p_environment => 'development', p_id => %L, p_value => 'not json', p_reason => %L)$$, current_setting('t.gone'), current_setting('t.reason')),
  '22023', 'environment mismatch', 'a value that is not the expected object is refused the same way');
select throws_ok(format($$select public.console_delete_lead(p_environment => 'development', p_id => 'p:' || gen_random_uuid()::text, p_value => %L, p_reason => %L)$$, current_setting('t.env'), current_setting('t.reason')),
  '22023', 'no such lead', 'a lead that is not there cannot be deleted');

-- A lead with an account is refused, and the refusal costs no ceremony.
select pg_temp.tap('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', 'lead-challenge-0001',
  'Deleted a lead', 'p:a1111111-1111-4111-8111-111111111111', current_setting('t.env'), current_setting('t.reason'));
select throws_ok(format($$select public.console_delete_lead(p_environment => 'development', p_id => 'p:a1111111-1111-4111-8111-111111111111', p_value => %L, p_reason => %L)$$, current_setting('t.env'), current_setting('t.reason')),
  '22023', 'has an account', 'a lead with an account cannot be deleted here, key or no key');
select is((select used_at from console.challenges where challenge = 'lead-challenge-0001'), null, 'and the tap is not spent on the refusal');
select throws_ok(format($$select public.console_delete_lead(p_environment => 'development', p_id => 'a:c2222222-2222-4222-8222-222222222222', p_value => %L, p_reason => %L)$$, current_setting('t.env'), current_setting('t.reason')),
  '22023', 'has an account', 'nor a lead that is only an account');

-- The approved path.
select pg_temp.tap('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', 'lead-challenge-0002',
  'Deleted a lead', current_setting('t.gone'), current_setting('t.env'), current_setting('t.reason'));
insert into announcements.suppressions (email, scope, reason, source) values ('gone@leads.test', 'all', 'hard bounce', 'resend');
select lives_ok(format($$select public.console_delete_lead(p_environment => 'development', p_id => %L, p_value => %L, p_reason => %L)$$, current_setting('t.gone'), current_setting('t.env'), current_setting('t.reason')),
  'a delete with its tap goes through');
select is((select count(*)::int from subscriptions.people where id = 'a7777777-7777-4777-8777-777777777777'), 0, 'the person is gone');
select is((select count(*)::int from subscriptions.consents where person_id = 'a7777777-7777-4777-8777-777777777777'), 0, 'with their consents');
select is((select count(*)::int from console.lead_tags where person_id = 'a7777777-7777-4777-8777-777777777777') + (select count(*)::int from console.lead_notes where person_id = 'a7777777-7777-4777-8777-777777777777'), 0, 'their tags and their notes');
select is((select count(*)::int from announcements.suppressions where email = 'gone@leads.test'), 1, 'a suppression on the address stays: mail still cannot reach it');
select is(public.console_lead(p_id => current_setting('t.gone')), null, 'and the lead is no longer a lead');
select is(
  (select actor_name || '|' || category || '|' || target || '|' || reason || '|' || result from console.audit_log where action = 'Deleted a lead' and environment = 'development'),
  'Kiran Das|leads|g•••@leads.test|Asked by phone to be removed from our lists.|done', 'one audit row, by the masked address, with the reason');
select is(
  (select before from console.audit_log where action = 'Deleted a lead' and environment = 'development'),
  '{"news": "suppressed", "availability": true, "tags": 2, "notes": 1, "source": "pre-booking"}'::jsonb, 'which says what was removed, and holds no address');
select throws_ok(format($$select public.console_delete_lead(p_environment => 'development', p_id => %L, p_value => %L, p_reason => %L)$$, 'p:a2222222-2222-4222-8222-222222222222', current_setting('t.env'), current_setting('t.reason')),
  '42501', 'no tap for this action', 'a tap approves one lead, once: it does not carry to another');

-- ---------------------------------------------------------------------------
-- Export. Three leads are left: asha (subscribed, an account, tagged press), pending, dev.
-- ---------------------------------------------------------------------------
select set_config('t.all', '{"account":null,"environment":"development","news":null,"since":null,"source":null,"tag":null}', true);
select set_config('t.press', '{"account":null,"environment":"development","news":"subscribed","since":null,"source":null,"tag":"press"}', true);
select set_config('t.why', 'Monthly review of sign-ups for September.', true);

select throws_ok(format($$select public.console_export_leads(p_environment => 'development', p_filters => %L, p_reason => %L)$$, current_setting('t.all'), current_setting('t.why')),
  '42501', 'no access', 'Support cannot export: the floor is Admin');

select pg_temp.speak_as('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
select throws_ok(format($$select public.console_export_leads(p_environment => 'development', p_filters => %L, p_reason => %L)$$, current_setting('t.all'), current_setting('t.why')),
  '42501', 'no tap for this action', 'an Owner may, but not without a key');
select throws_ok(format($$select public.console_export_leads(p_environment => 'development', p_filters => 'not json', p_reason => %L)$$, current_setting('t.why')),
  '22023', 'the export filters could not be read', 'filters that are not an object are refused');
select throws_ok(format($$select public.console_export_leads(p_environment => 'development', p_filters => %L, p_reason => %L)$$, replace(current_setting('t.all'), 'development', 'production'), current_setting('t.why')),
  '22023', 'environment mismatch', 'and so are filters minted for another deployment');
select throws_ok(format($$select public.console_export_leads(p_environment => 'development', p_filters => %L, p_reason => %L)$$, replace(current_setting('t.all'), '"news":null', '"news":"everyone"'), current_setting('t.why')),
  '22023', 'unknown filter', 'and a filter the list does not have');

select pg_temp.tap('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'lead-challenge-0003',
  'Exported leads', 'Leads', current_setting('t.all'), current_setting('t.why'));
select set_config('t.out', public.console_export_leads(p_environment => 'development', p_filters => current_setting('t.all'), p_reason => current_setting('t.why'))::text, true);
select is((current_setting('t.out')::jsonb ->> 'count')::int, 3, 'the export answers every lead the filters match');
select is(jsonb_array_length(current_setting('t.out')::jsonb -> 'rows'), 3, 'one row each');
select is(
  (select string_agg(r ->> 'email', ',' order by r ->> 'email') from jsonb_array_elements(current_setting('t.out')::jsonb -> 'rows') r),
  'asha@leads.test,dev@leads.test,pending@leads.test', 'with the WHOLE address: this is what an export is for');
select ok(current_setting('t.out') !~ 'trakline\.in', 'and never a console member');
select is(
  (select r - 'firstSeen' - 'lastActivity' from jsonb_array_elements(current_setting('t.out')::jsonb -> 'rows') r where r ->> 'email' = 'asha@leads.test'),
  '{"email": "asha@leads.test", "news": "subscribed", "availability": false, "account": "has", "source": "footer", "campaignSource": null, "campaignMedium": null, "campaignName": null, "tags": ["press"]}'::jsonb,
  'a row carries the lead''s status, source, campaign and tags, and no note');
select ok((select bool_and(r ? 'firstSeen' and r ? 'lastActivity') from jsonb_array_elements(current_setting('t.out')::jsonb -> 'rows') r), 'and its two dates');
select is(
  (select actor_name || '|' || category || '|' || target || '|' || reason || '|' || (after ->> 'count') from console.audit_log where action = 'Exported leads' and environment = 'development'),
  'Asha Rao|leads|Leads|Monthly review of sign-ups for September.|3', 'one audit row, with the reason and how many left');
select is((select after -> 'filters' from console.audit_log where action = 'Exported leads' and environment = 'development'), current_setting('t.all')::jsonb, 'and the filters they left under');
select ok((select (coalesce(before::text, '') || coalesce(after::text, '') || target) !~ '@' from console.audit_log where action = 'Exported leads' and environment = 'development'), 'which holds no address');
select throws_ok(format($$select public.console_export_leads(p_environment => 'development', p_filters => %L, p_reason => %L)$$, current_setting('t.all'), current_setting('t.why')),
  '42501', 'no tap for this action', 'the tap is spent: a second export needs a second key');

-- The filters are the list's own.
select pg_temp.tap('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'lead-challenge-0004',
  'Exported leads', 'Leads', current_setting('t.press'), current_setting('t.why'));
select set_config('t.out', public.console_export_leads(p_environment => 'development', p_filters => current_setting('t.press'), p_reason => current_setting('t.why'))::text, true);
select is((current_setting('t.out')::jsonb ->> 'count')::int, 1, 'a filtered export is the filtered list');
select is(current_setting('t.out')::jsonb -> 'rows' -> 0 ->> 'email', 'asha@leads.test', 'the one subscribed lead tagged press');

select set_config('t.since', replace(current_setting('t.all'), '"since":null', '"since":"' || to_char((now() - interval '3 days') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || '"'), true);
select pg_temp.tap('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'lead-challenge-0005',
  'Exported leads', 'Leads', current_setting('t.since'), current_setting('t.why'));
select is((public.console_export_leads(p_environment => 'development', p_filters => current_setting('t.since'), p_reason => current_setting('t.why')) ->> 'count')::int, 1, 'First seen narrows it as it narrows the list');

-- The cap is checked before the tap is spent.
create or replace function console.lead_export_max() returns integer language sql immutable set search_path = '' as $$ select 2 $$;
select pg_temp.tap('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'lead-challenge-0006',
  'Exported leads', 'Leads', current_setting('t.all'), current_setting('t.why'));
select throws_ok(format($$select public.console_export_leads(p_environment => 'development', p_filters => %L, p_reason => %L)$$, current_setting('t.all'), current_setting('t.why')),
  '22023', 'too many leads to export', 'more leads than the cap is refused');
select is((select used_at from console.challenges where challenge = 'lead-challenge-0006'), null, 'and the tap is not spent on the refusal');
select is((select count(*)::int from console.audit_log where action = 'Exported leads' and environment = 'development'), 3, 'nor is a refused export recorded as one');

-- A malformed date in the filters is the console's own refusal, never Postgres's words.
select throws_ok(format($$select public.console_export_leads(p_environment => 'development', p_filters => %L, p_reason => %L)$$, replace(current_setting('t.all'), '"since":null', '"since":"not-a-date"'), current_setting('t.why')),
  '22023', 'the export filters could not be read', 'a date that is not one is refused in the console''s words');
select ok(not has_function_privilege('authenticated', 'console.lead_export_max()', 'execute'), 'the cap is nobody''s to call');
select ok(not has_function_privilege('authenticated', 'console.leads_matching(text, text, text, text, timestamptz)', 'execute'), 'nor the matching set, which holds whole addresses');

select * from finish();
rollback;
