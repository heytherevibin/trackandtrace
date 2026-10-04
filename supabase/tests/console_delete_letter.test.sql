begin;
create extension if not exists pgtap with schema extensions;

-- Deleting a draft (07). A draft has gone to nobody, so removing it loses nothing; anything that
-- has been queued is the record of what was sent and to whom, and is never deleted from here.
-- Named notation throughout, as console_letters.test.sql: PostgREST resolves on argument names.

select plan(13);

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

insert into subscriptions.people (id, email, first_source) values ('a1111111-1111-4111-8111-111111111111', 'one@example.in', 'footer');
insert into subscriptions.consents (person_id, list, notice_version, source, confirmed_at) values ('a1111111-1111-4111-8111-111111111111', 'news', '1.1', 'footer', now());

insert into announcements.letters (id, list, subject, body, created_by) values
  ('d0000000-0000-4000-8000-000000000001', 'news', 'A draft to delete', 'Hello', '11111111-1111-1111-1111-111111111111'),
  ('d0000000-0000-4000-8000-000000000002', 'news', 'A draft that stays', 'Hello', '11111111-1111-1111-1111-111111111111');
insert into announcements.letters (id, list, subject, body, state, created_by, queued_at, recipients_total, test_sent_at, test_sent_to) values
  ('d0000000-0000-4000-8000-000000000003', 'news', 'A queued letter', 'Hello', 'queued', '11111111-1111-1111-1111-111111111111', now(), 1, now(), 'owner@trakline.in'),
  ('d0000000-0000-4000-8000-000000000004', 'news', 'A stopped letter', 'Hello', 'stopped', '11111111-1111-1111-1111-111111111111', now(), 1, now(), 'owner@trakline.in');
insert into announcements.deliveries (letter_id, person_id, state, sent_at) values
  ('d0000000-0000-4000-8000-000000000004', 'a1111111-1111-4111-8111-111111111111', 'sent', now());

-- Grants: a member's own session and nothing else.
select is(has_function_privilege('authenticated', 'public.console_delete_letter(text, uuid)', 'execute')::text, 'true', 'authenticated can delete a draft');
select is(has_function_privilege('anon', 'public.console_delete_letter(text, uuid)', 'execute')::text, 'false', 'anon cannot');
select is(has_function_privilege('service_role', 'public.console_delete_letter(text, uuid)', 'execute')::text, 'false', 'service_role cannot: a delete is a person''s act');

-- The floor.
select pg_temp.speak_as('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444');
select throws_ok($$select public.console_delete_letter(p_environment => 'development', p_letter => 'd0000000-0000-4000-8000-000000000001')$$, '42501', 'no access', 'Support cannot delete a draft');
select is((select count(*)::int from announcements.letters where id = 'd0000000-0000-4000-8000-000000000001'), 1, 'and the draft is still there');

select pg_temp.speak_as('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

-- Only a draft.
select throws_ok($$select public.console_delete_letter(p_environment => 'development', p_letter => gen_random_uuid())$$, '22023', 'no such letter', 'a letter that does not exist is refused');
select throws_ok($$select public.console_delete_letter(p_environment => 'development', p_letter => 'd0000000-0000-4000-8000-000000000003')$$, '22023', 'not a draft', 'a queued letter is never deleted: people are about to receive it');
select throws_ok($$select public.console_delete_letter(p_environment => 'development', p_letter => 'd0000000-0000-4000-8000-000000000004')$$, '22023', 'not a draft', 'a stopped letter is never deleted: it is the record of who received it');
select is((select count(*)::int from announcements.deliveries where letter_id = 'd0000000-0000-4000-8000-000000000004'), 1, 'and its delivery record is untouched');

-- The delete, and its record.
select lives_ok($$select public.console_delete_letter(p_environment => 'development', p_letter => 'd0000000-0000-4000-8000-000000000001')$$, 'a draft is deleted');
select is((select count(*)::int from announcements.letters where id = 'd0000000-0000-4000-8000-000000000001'), 0, 'it is gone');
select is((select count(*)::int from announcements.letters where id = 'd0000000-0000-4000-8000-000000000002'), 1, 'and no other draft went with it');
select is(
  (select actor_name || '|' || category || '|' || result::text || '|' || (after ->> 'list')
     from console.audit_log where action = 'Deleted a draft' and target = 'A draft to delete' and environment = 'development'),
  'Asha Rao|messages|done|news', 'the audit log says who deleted which draft, of which list');

select * from finish();
rollback;
