begin;
create extension if not exists pgtap with schema extensions;

-- Module 08, Accounts (first part). Four functions for a console member's own session: the list,
-- one account's record, an audited reveal and an audited exact-match lookup. An account is a
-- traveller's sign-in — never a console member's, an anonymous visitor's or a deleted one.
-- Named notation throughout: PostgREST resolves on argument names.

select plan(49);

-- Emptied first: the local database is shared, and this file counts accounts. Inside this
-- transaction, which rolls back.
delete from announcements.suppressions;
delete from announcements.letters;
delete from subscriptions.people;
delete from public.watchlist_entries;
delete from auth.users u where not exists (select 1 from console.members m where m.user_id = u.id);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in'),
  ('77777777-7777-7777-7777-777777777777', 'admin@trakline.in'),
  ('33333333-3333-3333-3333-333333333333', 'support@trakline.in');
insert into console.members (user_id, email, name, role, status) values
  ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in', 'Asha Rao', 'owner', 'active'),
  ('77777777-7777-7777-7777-777777777777', 'admin@trakline.in', 'Rohan Iyer', 'admin', 'active'),
  ('33333333-3333-3333-3333-333333333333', 'support@trakline.in', 'Kiran Das', 'support', 'active');
insert into console.sessions (session_id, member_id, address_hash, device_label, expires_at, key_verified_at) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'hash', 'Chrome on macOS', now() + interval '7 days', now()),
  ('88888888-8888-8888-8888-888888888888', '77777777-7777-7777-7777-777777777777', 'hash', 'Chrome on macOS', now() + interval '7 days', now()),
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'hash', 'Chrome on macOS', now() + interval '7 days', now());

create or replace function pg_temp.speak_as(p_user uuid, p_session uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'session_id', p_session)::text, true);
end;
$$;

-- Traveller accounts. `asha` signs in three ways, has saved PNRs and signed up for News; `dev` has
-- only an account; `banned` is disabled; `fresh` has never signed in. Then three that are not
-- accounts at all: one deleted, one anonymous, and the Owner (a console member, above).
insert into auth.users (id, email, created_at, last_sign_in_at, banned_until, deleted_at, is_anonymous) values
  ('c1111111-1111-4111-8111-111111111111', 'Asha@Acc.test',   now() - interval '14 days', now() - interval '1 day',   null, null, false),
  ('c2222222-2222-4222-8222-222222222222', 'dev@acc.test',    now() - interval '40 days', now() - interval '2 hours', null, null, false),
  ('c3333333-3333-4333-8333-333333333333', 'banned@acc.test', now() - interval '50 days', now() - interval '30 days', now() + interval '10 years', null, false),
  ('c4444444-4444-4444-8444-444444444444', 'fresh@acc.test',  now() - interval '2 days',  null, null, null, false),
  ('c5555555-5555-4555-8555-555555555555', 'gone@acc.test',   now() - interval '60 days', now() - interval '59 days', null, now() - interval '1 day', false),
  ('c6666666-6666-4666-8666-666666666666', null,              now() - interval '1 day',   now() - interval '1 day',   null, null, true);
insert into auth.identities (id, user_id, provider, provider_id, identity_data) values
  (gen_random_uuid(), 'c1111111-1111-4111-8111-111111111111', 'email',  'c1111111-1111-4111-8111-111111111111', '{}'::jsonb),
  (gen_random_uuid(), 'c1111111-1111-4111-8111-111111111111', 'google', 'g-asha', '{}'::jsonb),
  (gen_random_uuid(), 'c2222222-2222-4222-8222-222222222222', 'google', 'g-dev', '{}'::jsonb),
  (gen_random_uuid(), 'c3333333-3333-4333-8333-333333333333', 'email',  'c3333333-3333-4333-8333-333333333333', '{}'::jsonb),
  (gen_random_uuid(), 'c4444444-4444-4444-8444-444444444444', 'email',  'c4444444-4444-4444-8444-444444444444', '{}'::jsonb);
insert into auth.webauthn_credentials (user_id, credential_id, public_key) values
  ('c1111111-1111-4111-8111-111111111111', '\x01'::bytea, '\x0a'::bytea),
  ('c1111111-1111-4111-8111-111111111111', '\x02'::bytea, '\x0b'::bytea),
  ('c3333333-3333-4333-8333-333333333333', '\x03'::bytea, '\x0c'::bytea);
insert into public.watchlist_entries (user_id, pnr, label) values
  ('c1111111-1111-4111-8111-111111111111', '1234567890', 'One'),
  ('c1111111-1111-4111-8111-111111111111', '1234567891', 'Two'),
  ('c1111111-1111-4111-8111-111111111111', '1234567892', 'Three');
-- asha: two live sessions and one that has run out. dev: one live session.
insert into auth.sessions (id, user_id, created_at, updated_at, refreshed_at, not_after) values
  ('d1111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', now() - interval '5 days', now() - interval '3 hours', (now() - interval '3 hours') at time zone 'utc', null),
  ('d2222222-2222-4222-8222-222222222222', 'c1111111-1111-4111-8111-111111111111', now() - interval '1 day',  now() - interval '1 day',   null, now() + interval '1 day'),
  ('d3333333-3333-4333-8333-333333333333', 'c1111111-1111-4111-8111-111111111111', now() - interval '9 days', now() - interval '1 minute', null, now() - interval '1 hour'),
  ('d4444444-4444-4444-8444-444444444444', 'c2222222-2222-4222-8222-222222222222', now() - interval '2 hours', now() - interval '2 hours', null, null);

-- asha signed up and confirmed (stored lower-case, as sign-up stores it); left unsubscribed and has
-- no account, so is no row here.
insert into subscriptions.people (id, email, first_seen, first_source) values
  ('a1111111-1111-4111-8111-111111111111', 'asha@acc.test', now() - interval '17 days', 'footer'),
  ('a3333333-3333-4333-8333-333333333333', 'left@acc.test', now() - interval '30 days', 'footer');
insert into subscriptions.consents (person_id, list, notice_version, source, consented_at, confirmed_at, withdrawn_at) values
  ('a1111111-1111-4111-8111-111111111111', 'news', '1.1', 'footer', now() - interval '17 days', now() - interval '17 days', null),
  ('a3333333-3333-4333-8333-333333333333', 'news', '1.1', 'footer', now() - interval '30 days', now() - interval '30 days', now() - interval '4 days');

-- ---------------------------------------------------------------------------
-- Grants and the floor: Owner and Admin. Support is refused by all four.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from unnest(array[
     'public.console_accounts(text, text, timestamptz, integer, integer)', 'public.console_account(uuid)',
     'public.console_reveal_account(text, uuid)', 'public.console_find_account(text, text)']) f
    where has_function_privilege('authenticated', f, 'execute')
      and not has_function_privilege('anon', f, 'execute')
      and not has_function_privilege('service_role', f, 'execute')),
  4, 'all four are for authenticated alone');
select ok(not has_function_privilege('authenticated', 'console.accounts()', 'execute'), 'the list every one of them reads is nobody''s to call directly');

select pg_temp.speak_as('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444');
select throws_ok($$select public.console_accounts()$$, '42501', 'no access', 'Support cannot read the list');
select throws_ok($$select public.console_account(p_id => 'c1111111-1111-4111-8111-111111111111')$$, '42501', 'no access', 'nor a record');
select throws_ok($$select public.console_reveal_account(p_environment => 'development', p_id => 'c1111111-1111-4111-8111-111111111111')$$, '42501', 'no access', 'nor reveal');
select throws_ok($$select public.console_find_account(p_environment => 'development', p_email => 'asha@acc.test')$$, '42501', 'no access', 'nor look one up');
select is((select count(*)::int from console.audit_log where category = 'accounts'), 0, 'and a refusal writes nothing');

select pg_temp.speak_as('77777777-7777-7777-7777-777777777777', '88888888-8888-8888-8888-888888888888');
select lives_ok($$select public.console_accounts()$$, 'an Admin may: Accounts is Owner and Admin');

-- ---------------------------------------------------------------------------
-- The list: newest sign-in first, masked, no address anywhere in the answer.
-- ---------------------------------------------------------------------------
select set_config('t.all', public.console_accounts()::text, true);
select is((current_setting('t.all')::jsonb ->> 'total')::int, 4, 'four accounts: the deleted one, the anonymous one and the console members are not accounts');
select is(
  (select string_agg(r ->> 'id', ',' order by n) from jsonb_array_elements(current_setting('t.all')::jsonb -> 'rows') with ordinality as x(r, n)),
  'c2222222-2222-4222-8222-222222222222,c1111111-1111-4111-8111-111111111111,c3333333-3333-4333-8333-333333333333,c4444444-4444-4444-8444-444444444444',
  'newest sign-in first, and one who never signed in last');
select ok(current_setting('t.all') !~* '(asha|dev|banned|fresh|gone)@acc\.test', 'no row carries its address');
select ok(current_setting('t.all') !~ '123456789', 'nor a saved PNR');

select set_config('t.asha', (current_setting('t.all')::jsonb -> 'rows' -> 1)::text, true);
select is(current_setting('t.asha')::jsonb ->> 'email', 'a•••@acc.test', 'the address is masked, and lowered first');
select is(
  (current_setting('t.asha')::jsonb - 'createdAt' - 'lastSignInAt' - 'email' - 'id'),
  '{"emailLink": true, "google": true, "passkeys": 2, "savedPnrs": 3, "news": "subscribed", "disabled": false, "leadId": "p:a1111111-1111-4111-8111-111111111111"}'::jsonb,
  'how they sign in, how many PNRs they saved (a count), News, and the lead that is the same person');
select is(
  (current_setting('t.all')::jsonb -> 'rows' -> 0) - 'createdAt' - 'lastSignInAt' - 'email' - 'id',
  '{"emailLink": false, "google": true, "passkeys": 0, "savedPnrs": 0, "news": "none", "disabled": false, "leadId": "a:c2222222-2222-4222-8222-222222222222"}'::jsonb,
  'an account with no sign-up is not subscribed, and its lead is named by the account');
select is(current_setting('t.all')::jsonb -> 'rows' -> 2 ->> 'disabled', 'true', 'a banned account is disabled');
select is(current_setting('t.all')::jsonb -> 'rows' -> 3 -> 'lastSignInAt', 'null'::jsonb, 'never signed in is null, not a date');

-- Filters and paging.
select is((public.console_accounts(p_status => 'disabled') ->> 'total')::int, 1, 'filter by Status: disabled');
select is((public.console_accounts(p_status => 'active') ->> 'total')::int, 3, 'and active');
select is((public.console_accounts(p_method => 'email') ->> 'total')::int, 3, 'filter by Sign-in: email link');
select is((public.console_accounts(p_method => 'google') ->> 'total')::int, 2, 'Google');
select is((public.console_accounts(p_method => 'passkey') ->> 'total')::int, 2, 'and a passkey');
select is((public.console_accounts(p_status => 'active', p_method => 'passkey') ->> 'total')::int, 1, 'filters narrow together');
select is((public.console_accounts(p_since => now() - interval '20 days') ->> 'total')::int, 2, 'filter by Created');
select is(jsonb_array_length(public.console_accounts(p_limit => 3, p_offset => 3) -> 'rows'), 1, 'paging gives the last page what is left');
select is(jsonb_array_length(public.console_accounts(p_limit => 5000) -> 'rows'), 4, 'a limit past 200 is clamped, not refused');
select throws_ok($$select public.console_accounts(p_status => 'deleted')$$, '22023', 'unknown filter', 'a status nobody offers is refused');
select throws_ok($$select public.console_accounts(p_method => 'password')$$, '22023', 'unknown filter', 'and a sign-in method nobody offers');

-- ---------------------------------------------------------------------------
-- One account's record: the row, and its sessions as a count and a last-seen time.
-- ---------------------------------------------------------------------------
select set_config('t.one', public.console_account(p_id => 'c1111111-1111-4111-8111-111111111111')::text, true);
select is(current_setting('t.one')::jsonb ->> 'email', 'a•••@acc.test', 'the record is masked too');
select is((current_setting('t.one')::jsonb -> 'sessions' ->> 'count')::int, 2, 'two sessions are live: one that has run out is not counted');
select is(
  (current_setting('t.one')::jsonb -> 'sessions' ->> 'lastSeenAt')::timestamptz,
  (select updated_at from auth.sessions where id = 'd1111111-1111-4111-8111-111111111111'),
  'last seen is the latest a live session was used');
select is(current_setting('t.one')::jsonb ->> 'savedPnrs', '3', 'saved PNRs are a count here too');
select ok(current_setting('t.one') !~* 'asha@acc\.test|123456789', 'and neither the address nor a PNR is in it');
select is(
  public.console_account(p_id => 'c3333333-3333-4333-8333-333333333333') -> 'sessions',
  '{"count": 0, "lastSeenAt": null}'::jsonb,
  'nobody signed in is a zero and no time');
select is(public.console_account(p_id => 'c9999999-9999-4999-8999-999999999999'), null, 'no such account is null, not an error');
select is(public.console_account(p_id => '11111111-1111-1111-1111-111111111111'), null, 'a console member is not an account');
select is(public.console_account(p_id => 'c5555555-5555-4555-8555-555555555555'), null, 'nor is a deleted one');

-- ---------------------------------------------------------------------------
-- Reveal: the whole address, and a row saying who asked.
-- ---------------------------------------------------------------------------
select is(public.console_reveal_account(p_environment => 'development', p_id => 'c1111111-1111-4111-8111-111111111111'), 'asha@acc.test', 'Reveal answers the address');
select is(
  (select actor_name || '|' || category || '|' || target from console.audit_log where action = 'Revealed an account''s address' and environment = 'development'),
  'Rohan Iyer|accounts|a•••@acc.test',
  'and is recorded, by the masked address');
select throws_ok($$select public.console_reveal_account(p_environment => 'development', p_id => 'c9999999-9999-4999-8999-999999999999')$$, '22023', 'no such account', 'no such account is refused');
select throws_ok($$select public.console_reveal_account(p_environment => 'development', p_id => '11111111-1111-1111-1111-111111111111')$$, '22023', 'no such account', 'and a console member''s address is not revealed here');
select is((select count(*)::int from console.audit_log where action = 'Revealed an account''s address'), 1, 'a refused reveal is not recorded as one');

-- ---------------------------------------------------------------------------
-- Find by the whole address: the masked row or null, recorded either way.
-- ---------------------------------------------------------------------------
select is(public.console_find_account(p_environment => 'development', p_email => '  ASHA@acc.test ') ->> 'id', 'c1111111-1111-4111-8111-111111111111', 'the whole address finds its account, whatever its case and spacing');
select ok(public.console_find_account(p_environment => 'development', p_email => 'asha@acc.test')::text !~* 'asha@acc\.test', 'and the answer is still masked');
select is(public.console_find_account(p_environment => 'development', p_email => 'left@acc.test'), null, 'a sign-up with no account is nobody here');
select is(public.console_find_account(p_environment => 'development', p_email => 'owner@trakline.in'), null, 'and so is a console member');
select is(
  (select string_agg(target || ':' || (after ->> 'found'), ',' order by at, target) from console.audit_log where action = 'Looked up an account by email' and environment = 'development'),
  'a•••@acc.test:true,a•••@acc.test:true,l•••@acc.test:false,o•••@trakline.in:false',
  'every lookup is recorded by the masked form of what was typed, found or not');
select throws_ok($$select public.console_find_account(p_environment => 'development', p_email => 'asha')$$, '22023', 'not an address', 'part of an address is refused');
select is((select count(*)::int from console.audit_log where action = 'Looked up an account by email'), 4, 'and a refused lookup is not recorded');

select * from finish();
rollback;
