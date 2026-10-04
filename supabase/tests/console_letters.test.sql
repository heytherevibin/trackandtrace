begin;
create extension if not exists pgtap with schema extensions;

-- The console's layer over announcements. The backend's own functions take a member id and trust
-- it; these seven are what a member's own session may call, and each re-checks the Admin floor
-- before it reads or writes anything. Every call uses NAMED notation, for the reason
-- announcements.test.sql gives: PostgREST resolves on argument names.

select plan(39);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in'),
  ('33333333-3333-3333-3333-333333333333', 'support@trakline.in');
insert into console.members (user_id, email, name, role, status) values
  ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in', 'Asha Rao', 'owner', 'active'),
  ('33333333-3333-3333-3333-333333333333', 'support@trakline.in', 'Kiran Das', 'support', 'active');
insert into console.sessions (session_id, member_id, address_hash, device_label, expires_at, key_verified_at) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'hash', 'Chrome on macOS', now() + interval '7 days', now()),
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'hash', 'Chrome on macOS', now() + interval '7 days', now());

create or replace function pg_temp.speak_as(p_user uuid, p_session uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'session_id', p_session)::text, true);
end;
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select pg_temp.speak_as('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
$$;
create or replace function pg_temp.as_support() returns void language sql as $$
  select pg_temp.speak_as('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444');
$$;

-- Two confirmed on news, one withdrawn, one confirmed on availability.
insert into subscriptions.people (id, email, first_source) values
  ('a1111111-1111-4111-8111-111111111111', 'one@example.in', 'footer'),
  ('a2222222-2222-4222-8222-222222222222', 'two@example.in', 'footer'),
  ('a3333333-3333-4333-8333-333333333333', 'gone@example.in', 'footer'),
  ('a4444444-4444-4444-8444-444444444444', 'avail@example.in', 'pre-booking');
insert into subscriptions.consents (person_id, list, notice_version, source, confirmed_at, withdrawn_at) values
  ('a1111111-1111-4111-8111-111111111111', 'news', '1.1', 'footer', now(), null),
  ('a2222222-2222-4222-8222-222222222222', 'news', '1.1', 'footer', now(), null),
  ('a3333333-3333-4333-8333-333333333333', 'news', '1.1', 'footer', now(), now()),
  ('a4444444-4444-4444-8444-444444444444', 'availability', '1.1', 'pre-booking', now(), null);

-- ---------------------------------------------------------------------------
-- Grants: a member's own session, and nothing else.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from unnest(array[
     'public.console_letters()', 'public.console_letter(uuid)', 'public.console_letter_lists()',
     'public.console_save_letter(text, text, text, uuid)', 'public.console_letter_tested(text, uuid)',
     'public.console_queue_letter(text, uuid)', 'public.console_stop_letter(text, uuid)']) f
    where has_function_privilege('authenticated', f, 'execute')
      and not has_function_privilege('anon', f, 'execute')
      and not has_function_privilege('service_role', f, 'execute')),
  7, 'all seven are for authenticated alone: not anon, and not service_role, because each is a person''s act');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'console\_letter%' or p.proname in ('console_save_letter', 'console_queue_letter', 'console_stop_letter'))),
  7, 'exactly seven exist: an overload left behind by a changed signature would make eight');

-- ---------------------------------------------------------------------------
-- The floor. Support is below Admin, and is refused by every one.
-- ---------------------------------------------------------------------------
select pg_temp.as_support();
select throws_ok($$select public.console_letters()$$, '42501', 'no access', 'Support cannot list letters');
select throws_ok($$select public.console_letter(p_letter => gen_random_uuid())$$, '42501', 'no access', 'Support cannot read a letter');
select throws_ok($$select public.console_letter_lists()$$, '42501', 'no access', 'Support cannot read the lists');
select throws_ok($$select public.console_save_letter(p_letter => null, p_list => 'news', p_subject => 's', p_body => 'b')$$, '42501', 'no access', 'Support cannot save a draft');
select throws_ok($$select public.console_letter_tested(p_environment => 'development', p_letter => gen_random_uuid())$$, '42501', 'no access', 'Support cannot record a test');
select throws_ok($$select public.console_queue_letter(p_environment => 'development', p_letter => gen_random_uuid())$$, '42501', 'no access', 'Support cannot queue');
select throws_ok($$select public.console_stop_letter(p_environment => 'development', p_letter => gen_random_uuid())$$, '42501', 'no access', 'Support cannot stop');

-- ---------------------------------------------------------------------------
-- Reads on an empty store.
-- ---------------------------------------------------------------------------
select pg_temp.as_owner();
select is(public.console_letters(), '[]'::jsonb, 'no letters is an empty array, never null');
select is(public.console_letter(p_letter => gen_random_uuid()), null, 'a letter that does not exist is null');
select is(public.console_letter_lists() ->> 'news', '2', 'news counts the confirmed and not withdrawn');
select is(public.console_letter_lists() ->> 'availability', '1', 'availability counts its own');
select is(public.console_letter_lists() ->> 'availabilitySpent', 'false', 'availability is unspent before its one send');

-- ---------------------------------------------------------------------------
-- Saving.
-- ---------------------------------------------------------------------------
select throws_ok($$select public.console_save_letter(p_letter => null, p_list => 'everyone', p_subject => 's', p_body => 'b')$$, '22023', 'unknown list', 'a list nobody signed up to is refused');
select throws_ok($$select public.console_save_letter(p_letter => null, p_list => 'news', p_subject => '   ', p_body => 'b')$$, '22023', 'subject length', 'a blank subject is refused');
select throws_ok(format($$select public.console_save_letter(p_letter => null, p_list => 'news', p_subject => %L, p_body => 'b')$$, repeat('x', 201)), '22023', 'subject length', 'a subject past 200 is refused');
select throws_ok($$select public.console_save_letter(p_letter => null, p_list => 'news', p_subject => 's', p_body => '  ')$$, '22023', 'body length', 'a blank body is refused');

select set_config('t.letter', public.console_save_letter(p_letter => null, p_list => 'news', p_subject => '  What is coming  ', p_body => 'Hello')::text, true);
select is((select subject from announcements.letters where id = current_setting('t.letter')::uuid), 'What is coming', 'the subject is trimmed');
select is((select created_by from announcements.letters where id = current_setting('t.letter')::uuid), '11111111-1111-1111-1111-111111111111'::uuid, 'the draft records who wrote it');
select is(jsonb_array_length(public.console_letters()), 1, 'the draft is listed');
select is(public.console_letter(p_letter => current_setting('t.letter')::uuid) ->> 'state', 'draft', 'and reads back as a draft');

-- ---------------------------------------------------------------------------
-- The test, and what clears it.
-- ---------------------------------------------------------------------------
select throws_ok(format($$select public.console_queue_letter(p_environment => 'development', p_letter => %L)$$, current_setting('t.letter')), 'P0001', 'this letter has not been test sent, so nobody has seen it as a reader will', 'an untested draft cannot be queued');

select public.console_letter_tested(p_environment => 'development', p_letter => current_setting('t.letter')::uuid);
select is(public.console_letter(p_letter => current_setting('t.letter')::uuid) ->> 'testSentTo', 'owner@trakline.in', 'the test is recorded against the member''s own address, which the caller cannot choose');
select is((select count(*)::int from console.audit_log where category = 'messages' and action = 'Sent a test letter' and target = 'What is coming' and result = 'done'), 1, 'and written to the audit log');

select public.console_save_letter(p_letter => current_setting('t.letter')::uuid, p_list => 'news', p_subject => 'What is coming', p_body => 'Hello');
select isnt((select test_sent_at from announcements.letters where id = current_setting('t.letter')::uuid), null, 'saving the same text keeps the test');
select public.console_save_letter(p_letter => current_setting('t.letter')::uuid, p_list => 'news', p_subject => 'What is coming', p_body => 'Hello, changed');
select is((select test_sent_at from announcements.letters where id = current_setting('t.letter')::uuid), null, 'changing the text clears the test: the proof was of other words');

-- ---------------------------------------------------------------------------
-- Queue.
-- ---------------------------------------------------------------------------
select public.console_letter_tested(p_environment => 'development', p_letter => current_setting('t.letter')::uuid);
select is(public.console_queue_letter(p_environment => 'development', p_letter => current_setting('t.letter')::uuid), 2, 'queue answers how many people it fixed');
select is((select queued_by from announcements.letters where id = current_setting('t.letter')::uuid), '11111111-1111-1111-1111-111111111111'::uuid, 'the member is taken from the session, not from an argument');
select is((select after from console.audit_log where action = 'Queued a letter' and target = 'What is coming'), '{"list": "news", "people": 2}'::jsonb, 'the audit row says which list and how many');
select is(public.console_letter(p_letter => current_setting('t.letter')::uuid) ->> 'queuedBy', 'Asha Rao', 'the detail names who queued it');
select is(public.console_letter(p_letter => current_setting('t.letter')::uuid) ->> 'waiting', '2', 'and how many are waiting');
select throws_ok(format($$select public.console_save_letter(p_letter => %L, p_list => 'news', p_subject => 's', p_body => 'b')$$, current_setting('t.letter')), '22023', 'not a draft', 'a queued letter cannot be edited');

-- A list with nobody on it.
update subscriptions.consents set withdrawn_at = now() where list = 'availability';
select set_config('t.empty', public.console_save_letter(p_letter => null, p_list => 'availability', p_subject => 'Open', p_body => 'Hello')::text, true);
select public.console_letter_tested(p_environment => 'development', p_letter => current_setting('t.empty')::uuid);
select throws_ok(format($$select public.console_queue_letter(p_environment => 'development', p_letter => %L)$$, current_setting('t.empty')), '22023', 'nobody to send to', 'a letter to nobody is refused');
select is((select state from announcements.letters where id = current_setting('t.empty')::uuid), 'draft', 'and stays a draft: the refusal undid the queue');

-- ---------------------------------------------------------------------------
-- Stop.
-- ---------------------------------------------------------------------------
select throws_ok(format($$select public.console_stop_letter(p_environment => 'development', p_letter => %L)$$, current_setting('t.empty')), '22023', 'not open', 'a draft cannot be stopped');
update announcements.deliveries set state = 'sent', sent_at = now() where letter_id = current_setting('t.letter')::uuid and person_id = 'a1111111-1111-4111-8111-111111111111';
select is(public.console_letter(p_letter => current_setting('t.letter')::uuid) ->> 'sentToday', '1', 'sentToday counts this letter''s sends since 00:00 UTC');
select public.console_stop_letter(p_environment => 'development', p_letter => current_setting('t.letter')::uuid);
select is(public.console_letter(p_letter => current_setting('t.letter')::uuid) ->> 'stoppedBy', 'Asha Rao', 'the detail names who stopped it');
select is((select after from console.audit_log where action = 'Stopped a letter' and target = 'What is coming'), '{"sent": 1, "skipped": 0, "unknown": 0, "waiting": 1}'::jsonb, 'the audit row says what had gone and what never will');

select * from finish();
rollback;
