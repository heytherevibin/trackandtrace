begin;
create extension if not exists pgtap with schema extensions;

-- Module 06, Leads (third part): the board's one read. Every lead in the pipeline as a card: its
-- id, its masked address, its stage and when it entered it, its owner by name, and the line about
-- it. No address, and nothing a member typed beyond that line.
-- Named notation throughout: PostgREST resolves on argument names.

select plan(12);

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
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'hash', 'Chrome on macOS', now() + interval '7 days', now()),
  ('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', 'hash', 'Chrome on macOS', now() + interval '7 days', now());

create or replace function pg_temp.speak_as(p_user uuid, p_session uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'session_id', p_session)::text, true);
end;
$$;

-- Four leads: three in the pipeline (two New, one Lost), one not. `dev` only has an account.
insert into auth.users (id, email, created_at) values ('c2222222-2222-4222-8222-222222222222', 'dev@leads.test', now() - interval '40 days');
insert into subscriptions.people (id, email, first_seen, first_source, added_by) values
  ('a1111111-1111-4111-8111-111111111111', 'hand@leads.test',  now() - interval '9 days', 'added by hand', 'Kiran Das'),
  ('a2222222-2222-4222-8222-222222222222', 'older@leads.test', now() - interval '9 days', 'footer', null),
  ('a3333333-3333-4333-8333-333333333333', 'plain@leads.test', now() - interval '2 days', 'footer', null);
insert into console.business_leads (person_id, user_id, stage, stage_since, owner_id, name, organisation, about) values
  ('a1111111-1111-4111-8111-111111111111', null, 'new',  now() - interval '2 days', '33333333-3333-3333-3333-333333333333', 'Meera Pillai', 'Acme Travel', 'Travel desk, about 40 bookings a month'),
  ('a2222222-2222-4222-8222-222222222222', null, 'new',  now() - interval '5 days', null, null, null, 'Bulk checks for a tour group'),
  (null, 'c2222222-2222-4222-8222-222222222222', 'lost', now() - interval '21 days', '11111111-1111-1111-1111-111111111111', null, null, 'Wanted a data feed; not offered');

select ok(has_function_privilege('authenticated', 'public.console_business_pipeline()', 'execute')
      and not has_function_privilege('anon', 'public.console_business_pipeline()', 'execute')
      and not has_function_privilege('service_role', 'public.console_business_pipeline()', 'execute'), 'the board''s read is for authenticated alone');

select pg_temp.speak_as('55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666');
select throws_ok($$select public.console_business_pipeline()$$, '42501', 'no access', 'a Viewer cannot read the board');

select pg_temp.speak_as('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444');
select set_config('t.board', public.console_business_pipeline()::text, true);
select is(jsonb_array_length(current_setting('t.board')::jsonb), 3, 'a card for each lead in the pipeline, and none for a lead that is not');
select is(
  (select string_agg(c ->> 'email', ',') from jsonb_array_elements(current_setting('t.board')::jsonb) c),
  'o•••@leads.test,h•••@leads.test,d•••@leads.test', 'in the board''s order: by stage, and within a stage the lead that has waited longest first');
select is(
  (current_setting('t.board')::jsonb -> 1) - 'stageSince',
  '{"id": "p:a1111111-1111-4111-8111-111111111111", "email": "h•••@leads.test", "stage": "new", "ownerName": "Kiran Das", "about": "Travel desk, about 40 bookings a month"}'::jsonb,
  'a card is the lead''s id, its masked address, its stage, its owner by name and the line about it');
select ok((current_setting('t.board')::jsonb -> 1 ->> 'stageSince') is not null, 'and when it entered the stage');
select is(current_setting('t.board')::jsonb -> 0 -> 'ownerName', 'null'::jsonb, 'a lead nobody owns says so');
select is(current_setting('t.board')::jsonb -> 2 ->> 'id', 'a:c2222222-2222-4222-8222-222222222222', 'an account-only lead is a card too, named by its account');
select ok(current_setting('t.board') !~ '(hand|older|dev|plain)@leads\.test', 'no card carries its address');
select ok(current_setting('t.board') !~ 'Meera Pillai|Acme Travel', 'nor the name or the organisation: those are on the record');

update console.members set status = 'removed' where user_id = '11111111-1111-1111-1111-111111111111';
select is(public.console_business_pipeline() -> 2 -> 'ownerName', 'null'::jsonb, 'a lead whose owner has left the console is owned by nobody');

delete from console.business_leads;
select is(public.console_business_pipeline(), '[]'::jsonb, 'an empty pipeline is an empty board, not an error');

select * from finish();
rollback;
