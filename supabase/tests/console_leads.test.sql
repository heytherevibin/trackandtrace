begin;
create extension if not exists pgtap with schema extensions;

-- Module 06, Leads (first part). Five functions for a console member's own session: the figures,
-- the list, one lead's record, an audited reveal and an audited exact-match lookup. A lead is
-- everyone who gave us an email — a sign-up, an account, or both — and never a console member.
-- Named notation throughout: PostgREST resolves on argument names.

select plan(50);

-- Emptied first: the local database is shared, and this file counts leads. Every traveller account
-- already there would be one, so they go too — inside this transaction, which rolls back.
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

-- Traveller accounts. `asha` also signed up; `dev` only has an account; `banned` is disabled.
insert into auth.users (id, email, created_at, last_sign_in_at, banned_until) values
  ('c1111111-1111-4111-8111-111111111111', 'asha@leads.test',   now() - interval '14 days', now() - interval '1 day', null),
  ('c2222222-2222-4222-8222-222222222222', 'dev@leads.test',    now() - interval '40 days', now() - interval '2 hours', null),
  ('c3333333-3333-4333-8333-333333333333', 'banned@leads.test', now() - interval '50 days', now() - interval '30 days', now() + interval '10 years');
insert into auth.identities (id, user_id, provider, provider_id, identity_data) values
  (gen_random_uuid(), 'c1111111-1111-4111-8111-111111111111', 'email',  'c1111111-1111-4111-8111-111111111111', '{}'::jsonb),
  (gen_random_uuid(), 'c1111111-1111-4111-8111-111111111111', 'google', 'g-asha', '{}'::jsonb);
insert into public.watchlist_entries (user_id, pnr, label) values
  ('c1111111-1111-4111-8111-111111111111', '1234567890', 'One'),
  ('c1111111-1111-4111-8111-111111111111', '1234567891', 'Two'),
  ('c1111111-1111-4111-8111-111111111111', '1234567892', 'Three');

-- Sign-ups. asha: subscribed, with a campaign. pending: never confirmed. left: unsubscribed.
-- bounced: confirmed, then suppressed. avail: on the Availability list only. The Owner signed up too.
insert into subscriptions.people (id, email, first_seen, first_source, campaign_source, campaign_medium, campaign_name, first_page) values
  ('a1111111-1111-4111-8111-111111111111', 'asha@leads.test',    now() - interval '17 days', 'footer', 'google', 'cpc', 'diwali-2026', '/pre-booking'),
  ('a2222222-2222-4222-8222-222222222222', 'pending@leads.test', now() - interval '1 day',   'landing', null, null, null, null),
  ('a3333333-3333-4333-8333-333333333333', 'left@leads.test',    now() - interval '30 days', 'footer', null, null, null, null),
  ('a4444444-4444-4444-8444-444444444444', 'bounced@leads.test', now() - interval '20 days', 'pre-booking', null, null, null, null),
  ('a5555555-5555-4555-8555-555555555555', 'avail@leads.test',   now() - interval '9 days',  'pre-booking', null, null, null, null),
  ('a6666666-6666-4666-8666-666666666666', 'owner@trakline.in',  now() - interval '3 days',  'footer', null, null, null, null);
insert into subscriptions.consents (person_id, list, notice_version, source, consented_at, confirmed_at, withdrawn_at, withdraw_reason) values
  ('a1111111-1111-4111-8111-111111111111', 'news', '1.1', 'footer',  now() - interval '17 days', now() - interval '17 days' + interval '6 minutes', null, null),
  ('a2222222-2222-4222-8222-222222222222', 'news', '1.1', 'landing', now() - interval '1 day', null, null, null),
  ('a3333333-3333-4333-8333-333333333333', 'news', '1.1', 'footer',  now() - interval '30 days', now() - interval '30 days', now() - interval '4 days', 'too many'),
  ('a4444444-4444-4444-8444-444444444444', 'news', '1.1', 'pre-booking', now() - interval '20 days', now() - interval '20 days', null, null),
  ('a5555555-5555-4555-8555-555555555555', 'availability', '1.1', 'pre-booking', now() - interval '9 days', now() - interval '9 days', null, null),
  ('a6666666-6666-4666-8666-666666666666', 'news', '1.1', 'footer',  now() - interval '3 days', now() - interval '3 days', null, null);
insert into announcements.suppressions (email, scope, reason, source, at) values ('bounced@leads.test', 'all', 'hard bounce', 'resend', now() - interval '5 days');
insert into announcements.letters (id, list, subject, body, state, created_by, queued_at, recipients_total) values
  ('e1111111-1111-4111-8111-111111111111', 'news', 'The new look', 'Hello', 'done', gen_random_uuid(), now() - interval '10 days', 1);
insert into announcements.deliveries (letter_id, person_id, state, sent_at) values
  ('e1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 'sent', now() - interval '10 days');

-- ---------------------------------------------------------------------------
-- Grants and the floor: Owner, Admin and Support. A Viewer is refused by all five.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from unnest(array[
     'public.console_lead_figures()', 'public.console_leads(text, text, text, timestamptz, integer, integer)', 'public.console_lead(text)',
     'public.console_reveal_lead(text, text)', 'public.console_find_lead(text, text)']) f
    where has_function_privilege('authenticated', f, 'execute')
      and not has_function_privilege('anon', f, 'execute')
      and not has_function_privilege('service_role', f, 'execute')),
  5, 'all five are for authenticated alone');
select ok(not has_function_privilege('authenticated', 'console.leads()', 'execute'), 'the list every one of them reads is nobody''s to call directly');

select pg_temp.speak_as('55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666');
select throws_ok($$select public.console_lead_figures()$$, '42501', 'no access', 'a Viewer cannot read the figures');
select throws_ok($$select public.console_leads(p_news => null, p_account => null, p_source => null, p_since => null, p_limit => 50, p_offset => 0)$$, '42501', 'no access', 'nor the list');
select throws_ok($$select public.console_lead(p_id => 'p:a1111111-1111-4111-8111-111111111111')$$, '42501', 'no access', 'nor a record');
select throws_ok($$select public.console_reveal_lead(p_environment => 'development', p_id => 'p:a1111111-1111-4111-8111-111111111111')$$, '42501', 'no access', 'nor reveal');
select throws_ok($$select public.console_find_lead(p_environment => 'development', p_email => 'asha@leads.test')$$, '42501', 'no access', 'nor look one up');

select pg_temp.speak_as('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444');
select lives_ok($$select public.console_lead_figures()$$, 'Support may: Leads is theirs too');

-- ---------------------------------------------------------------------------
-- The figures. Seven leads: five sign-ups (the Owner's is left out) and two account-only people.
-- ---------------------------------------------------------------------------
select is(public.console_lead_figures(),
  '{"total": 7, "pending": 1, "subscribed": 1, "unsubscribed": 1, "suppressed": 1, "accounts": 3, "availability": 1}'::jsonb,
  'each lead is counted once, a console member never, and News and Account are counted apart');

-- ---------------------------------------------------------------------------
-- The list: newest activity first, masked, no address anywhere in the answer.
-- ---------------------------------------------------------------------------
select set_config('t.all', public.console_leads(p_news => null, p_account => null, p_source => null, p_since => null, p_limit => 50, p_offset => 0)::text, true);
select is((current_setting('t.all')::jsonb ->> 'total')::int, 7, 'the list has all seven');
select is(jsonb_array_length(current_setting('t.all')::jsonb -> 'rows'), 7, 'and one row each');
select is(current_setting('t.all')::jsonb -> 'rows' -> 0 ->> 'email', 'd•••@leads.test', 'newest activity first: the account that signed in two hours ago');
select is(current_setting('t.all')::jsonb -> 'rows' -> 0 ->> 'news', 'none', 'an account-only lead is not subscribed: an account never makes anyone subscribed');
select is(current_setting('t.all')::jsonb -> 'rows' -> 0 ->> 'source', 'account', 'and its source is the account');
select is(current_setting('t.all')::jsonb -> 'rows' -> 0 ->> 'id', 'a:c2222222-2222-4222-8222-222222222222', 'named by the account when there is no sign-up');
select ok(current_setting('t.all') !~ '(asha|dev|pending|left|bounced|avail|banned)@leads\.test', 'no row carries its address');
select ok(current_setting('t.all') !~ 'owner@|o•••@trakline', 'and the Owner''s sign-up is not a lead');

-- One row for someone who is both a sign-up and an account.
select set_config('t.asha', (select r::text from jsonb_array_elements(current_setting('t.all')::jsonb -> 'rows') r where r ->> 'id' = 'p:a1111111-1111-4111-8111-111111111111'), true);
select is(current_setting('t.asha')::jsonb ->> 'news', 'subscribed', 'a confirmed sign-up is subscribed');
select is(current_setting('t.asha')::jsonb ->> 'account', 'has', 'and has its account on the same row');
select is(current_setting('t.asha')::jsonb -> 'campaign', '{"name": "diwali-2026", "medium": "cpc", "source": "google"}'::jsonb, 'with the campaign it came through');
select is((select count(*)::int from jsonb_array_elements(current_setting('t.all')::jsonb -> 'rows') r where r ->> 'email' = 'a•••@leads.test'), 2, 'asha and avail mask alike, and are told apart by their rows, not their addresses');

-- The statuses.
select is((select r ->> 'news' from jsonb_array_elements(current_setting('t.all')::jsonb -> 'rows') r where r ->> 'id' = 'p:a2222222-2222-4222-8222-222222222222'), 'pending', 'unconfirmed is pending');
select is((select r ->> 'news' from jsonb_array_elements(current_setting('t.all')::jsonb -> 'rows') r where r ->> 'id' = 'p:a3333333-3333-4333-8333-333333333333'), 'unsubscribed', 'withdrawn is unsubscribed');
select is((select r ->> 'news' from jsonb_array_elements(current_setting('t.all')::jsonb -> 'rows') r where r ->> 'id' = 'p:a4444444-4444-4444-8444-444444444444'), 'suppressed', 'a suppressed address is suppressed, whatever its consent says');
select is((select r ->> 'availability' from jsonb_array_elements(current_setting('t.all')::jsonb -> 'rows') r where r ->> 'id' = 'p:a5555555-5555-4555-8555-555555555555'), 'true', 'the Availability list is its own fact');
select is((select r ->> 'account' from jsonb_array_elements(current_setting('t.all')::jsonb -> 'rows') r where r ->> 'id' = 'a:c3333333-3333-4333-8333-333333333333'), 'disabled', 'a banned account is disabled');

-- Filters and paging.
select is((public.console_leads(p_news => 'subscribed', p_account => null, p_source => null, p_since => null, p_limit => 50, p_offset => 0) ->> 'total')::int, 1, 'filter by News');
select is((public.console_leads(p_news => 'none', p_account => null, p_source => null, p_since => null, p_limit => 50, p_offset => 0) ->> 'total')::int, 3, 'Not subscribed is the accounts and the Availability-only sign-up');
select is((public.console_leads(p_news => null, p_account => 'has', p_source => null, p_since => null, p_limit => 50, p_offset => 0) ->> 'total')::int, 2, 'filter by Account');
select is((public.console_leads(p_news => null, p_account => null, p_source => 'pre-booking', p_since => null, p_limit => 50, p_offset => 0) ->> 'total')::int, 2, 'filter by Source');
select is((public.console_leads(p_news => null, p_account => null, p_source => null, p_since => now() - interval '10 days', p_limit => 50, p_offset => 0) ->> 'total')::int, 2, 'filter by First seen');
select is(jsonb_array_length(public.console_leads(p_news => null, p_account => null, p_source => null, p_since => null, p_limit => 3, p_offset => 6) -> 'rows'), 1, 'paging gives the last page what is left');
select is(jsonb_array_length(public.console_leads(p_news => null, p_account => null, p_source => null, p_since => null, p_limit => 5000, p_offset => 0) -> 'rows'), 7, 'a limit past 200 is clamped, not refused');
select is((public.console_leads() ->> 'total')::int, 7, 'called with no arguments at all, it is the first page of everyone: a filter that is off is simply left out');
select throws_ok($$select public.console_leads(p_news => 'everyone', p_account => null, p_source => null, p_since => null, p_limit => 50, p_offset => 0)$$, '22023', 'unknown filter', 'a status nobody offers is refused');

-- ---------------------------------------------------------------------------
-- One record.
-- ---------------------------------------------------------------------------
select set_config('t.rec', public.console_lead(p_id => 'p:a1111111-1111-4111-8111-111111111111')::text, true);
select is(current_setting('t.rec')::jsonb ->> 'email', 'a•••@leads.test', 'the record is masked too');
select is(current_setting('t.rec')::jsonb -> 'consents' -> 0 ->> 'status', 'subscribed', 'its consent says where it stands');
select is(current_setting('t.rec')::jsonb -> 'consents' -> 0 ->> 'noticeVersion', '1.1', 'and under which notice it was given');
select is(current_setting('t.rec')::jsonb -> 'account' ->> 'savedPnrs', '3', 'saved PNRs are a count');
select ok(current_setting('t.rec') !~ '123456789', 'and never the PNRs themselves');
select is(current_setting('t.rec')::jsonb -> 'account' ->> 'google', 'true', 'the sign-in methods are named');
select is(
  (select string_agg(t ->> 'kind', ',') from jsonb_array_elements(current_setting('t.rec')::jsonb -> 'timeline') t),
  'signed_in,received,account_created,confirmed,signed_up', 'the timeline runs newest first: signed in, received a letter, made an account, confirmed, signed up');
select is(public.console_lead(p_id => 'p:' || gen_random_uuid()::text), null, 'a lead that does not exist is null');
select is(public.console_lead(p_id => 'p:a6666666-6666-4666-8666-666666666666'), null, 'a console member''s sign-up is not a lead, by its id either');
select throws_ok($$select public.console_lead(p_id => 'x:not-an-id')$$, '22023', 'not a lead id', 'an id that is not one is refused');

-- ---------------------------------------------------------------------------
-- Reveal and lookup: each answers, and each leaves a row that names the lead by its masked address.
-- ---------------------------------------------------------------------------
select is(public.console_reveal_lead(p_environment => 'development', p_id => 'p:a1111111-1111-4111-8111-111111111111'), 'asha@leads.test', 'reveal answers the address');
select is(
  (select actor_name || '|' || category || '|' || target from console.audit_log where action = 'Revealed a lead''s address' and environment = 'development'),
  'Kiran Das|leads|a•••@leads.test', 'and is written to the audit log, by its masked form');

select is(public.console_find_lead(p_environment => 'development', p_email => '  Asha@Leads.test ') ->> 'id', 'p:a1111111-1111-4111-8111-111111111111', 'a lookup by the whole address finds the lead, however it was typed');
select is(public.console_find_lead(p_environment => 'development', p_email => 'asha@leads') , null, 'part of an address finds nobody: there is no fishing');
select is(
  (select string_agg(target || ':' || (after ->> 'found'), ',' order by (after ->> 'found') desc) from console.audit_log where action = 'Looked up a lead by email' and environment = 'development'),
  'a•••@leads.test:true,a•••@leads:false', 'both lookups are recorded, found or not, and neither row holds the address searched for');

select * from finish();
rollback;
