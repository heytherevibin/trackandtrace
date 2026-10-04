begin;
create extension if not exists pgtap with schema extensions;

-- Module 06, Leads (second part): tags and notes. Both are a console member's own words about a
-- lead, so both hang off the lead's own rows — the sign-up or the account — and go when it goes.
-- Neither table holds an address. Neither act needs a key; each is written to the audit log.
-- Named notation throughout: PostgREST resolves on argument names.

select plan(48);

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

-- Three leads. `signup` only signed up; `dev` only has an account; `late` has an account today and
-- signs up further down, which changes its id from `a:` to `p:`.
insert into auth.users (id, email, created_at) values
  ('c2222222-2222-4222-8222-222222222222', 'dev@leads.test',  now() - interval '40 days'),
  ('c4444444-4444-4444-8444-444444444444', 'late@leads.test', now() - interval '30 days');
insert into subscriptions.people (id, email, first_seen, first_source) values
  ('a2222222-2222-4222-8222-222222222222', 'signup@leads.test', now() - interval '2 days', 'landing');
insert into subscriptions.consents (person_id, list, notice_version, source, consented_at, confirmed_at) values
  ('a2222222-2222-4222-8222-222222222222', 'news', '1.1', 'landing', now() - interval '2 days', now() - interval '2 days');

-- ---------------------------------------------------------------------------
-- Grants and the floor.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from unnest(array[
     'public.console_lead_tags()', 'public.console_tag_lead(text, text, text)', 'public.console_untag_lead(text, text, text)',
     'public.console_note_lead(text, text, text)', 'public.console_leads(text, text, text, text, timestamptz, integer, integer)']) f
    where has_function_privilege('authenticated', f, 'execute')
      and not has_function_privilege('anon', f, 'execute')
      and not has_function_privilege('service_role', f, 'execute')),
  5, 'all five are for authenticated alone');
select is(
  (select count(*)::int from information_schema.role_table_grants g
    where g.table_schema = 'console' and g.table_name in ('lead_tags', 'lead_notes') and g.grantee in ('anon', 'authenticated')),
  0, 'and neither table is anyone''s to read');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'console' and c.relname in ('lead_tags', 'lead_notes') and c.relrowsecurity),
  2, 'both have row security on, with no policy');
select is(
  (select count(*)::int from information_schema.columns c
    where c.table_schema = 'console' and c.table_name in ('lead_tags', 'lead_notes') and c.column_name ilike '%email%'),
  0, 'neither holds an address');

select pg_temp.speak_as('55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666');
select throws_ok($$select public.console_lead_tags()$$, '42501', 'no access', 'a Viewer cannot read the tags');
select throws_ok($$select public.console_tag_lead(p_environment => 'development', p_id => 'p:a2222222-2222-4222-8222-222222222222', p_tag => 'press')$$, '42501', 'no access', 'nor add one');
select throws_ok($$select public.console_untag_lead(p_environment => 'development', p_id => 'p:a2222222-2222-4222-8222-222222222222', p_tag => 'press')$$, '42501', 'no access', 'nor remove one');
select throws_ok($$select public.console_note_lead(p_environment => 'development', p_id => 'p:a2222222-2222-4222-8222-222222222222', p_body => 'A note')$$, '42501', 'no access', 'nor write a note');

-- ---------------------------------------------------------------------------
-- Tags. Support may: neither tags nor notes need a key.
-- ---------------------------------------------------------------------------
select pg_temp.speak_as('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444');
select is(public.console_lead_tags(), '[]'::jsonb, 'no tags yet');
select is(public.console_tag_lead(p_environment => 'development', p_id => 'p:a2222222-2222-4222-8222-222222222222', p_tag => '  Press '), '["press"]'::jsonb, 'a tag is added, lowered and trimmed, and the lead''s tags come back');
select is(public.console_tag_lead(p_environment => 'development', p_id => 'p:a2222222-2222-4222-8222-222222222222', p_tag => 'beta'), '["beta", "press"]'::jsonb, 'a second, and they come back in order');
select is(public.console_tag_lead(p_environment => 'development', p_id => 'p:a2222222-2222-4222-8222-222222222222', p_tag => 'press'), '["beta", "press"]'::jsonb, 'adding one it has changes nothing');
select is((select count(*)::int from console.audit_log where action = 'Tagged a lead' and environment = 'development'), 2, 'and writes no second audit row');
select is(
  (select actor_name || '|' || category || '|' || target || '|' || (after ->> 'tag') from console.audit_log where action = 'Tagged a lead' and environment = 'development' and after ->> 'tag' = 'press'),
  'Kiran Das|leads|s•••@leads.test|press', 'the row names the lead by its masked address, and the tag');

select throws_ok($$select public.console_tag_lead(p_environment => 'development', p_id => 'p:a2222222-2222-4222-8222-222222222222', p_tag => 'two words')$$, '22023', 'not a tag', 'a tag is letters, numbers and hyphens');
select throws_ok($$select public.console_tag_lead(p_environment => 'development', p_id => 'p:a2222222-2222-4222-8222-222222222222', p_tag => '-press')$$, '22023', 'not a tag', 'and neither starts nor ends with a hyphen');
select throws_ok($$select public.console_tag_lead(p_environment => 'development', p_id => 'p:a2222222-2222-4222-8222-222222222222', p_tag => 'abcdefghijklmnopqrstuvwxy')$$, '22023', 'not a tag', 'and is 24 characters at most');
select lives_ok($$select public.console_tag_lead(p_environment => 'development', p_id => 'a:c2222222-2222-4222-8222-222222222222', p_tag => 'abcdefghijklmnopqrstuvwx')$$, 'twenty-four is allowed, and an account-only lead can be tagged');
select throws_ok($$select public.console_tag_lead(p_environment => 'development', p_id => 'p:' || gen_random_uuid()::text, p_tag => 'press')$$, '22023', 'no such lead', 'a lead that is not there cannot be tagged');
select throws_ok($$select public.console_tag_lead(p_environment => 'development', p_id => 'x:1', p_tag => 'press')$$, '22023', 'not a lead id', 'nor an id that is not one');

-- Ten at most.
select public.console_tag_lead(p_environment => 'development', p_id => 'a:c4444444-4444-4444-8444-444444444444', p_tag => 't' || n) from generate_series(1, 10) n;
select throws_ok($$select public.console_tag_lead(p_environment => 'development', p_id => 'a:c4444444-4444-4444-8444-444444444444', p_tag => 't11')$$, '22023', 'too many tags', 'an eleventh tag is refused');
select is(jsonb_array_length(public.console_tag_lead(p_environment => 'development', p_id => 'a:c4444444-4444-4444-8444-444444444444', p_tag => 't3')), 10, 'though one it already has is still no error');

-- The list and the record carry them; the list filters by one.
select is(public.console_lead_tags(), (select jsonb_agg(t order by t) from unnest(array['abcdefghijklmnopqrstuvwx', 'beta', 'press'] || (select array_agg('t' || n) from generate_series(1, 10) n)) t), 'every tag in use, once, in order');
select set_config('t.all', public.console_leads()::text, true);
select is((select r -> 'tags' from jsonb_array_elements(current_setting('t.all')::jsonb -> 'rows') r where r ->> 'id' = 'p:a2222222-2222-4222-8222-222222222222'), '["beta", "press"]'::jsonb, 'a row carries its tags');
select is((select r -> 'tags' from jsonb_array_elements(current_setting('t.all')::jsonb -> 'rows') r where r ->> 'id' = 'a:c2222222-2222-4222-8222-222222222222'), '["abcdefghijklmnopqrstuvwx"]'::jsonb, 'an account-only row too');
select is(public.console_leads(p_tag => 'press') ->> 'total', '1', 'the Tag filter narrows the list');
select is(public.console_leads(p_tag => 'press') -> 'rows' -> 0 ->> 'id', 'p:a2222222-2222-4222-8222-222222222222', 'to the leads that carry it');
select is(public.console_leads(p_tag => 'nobody-has-this') ->> 'total', '0', 'a tag nobody carries matches nobody');
select is(public.console_lead(p_id => 'p:a2222222-2222-4222-8222-222222222222') -> 'tags', '["beta", "press"]'::jsonb, 'the record carries them');

select is(public.console_untag_lead(p_environment => 'development', p_id => 'p:a2222222-2222-4222-8222-222222222222', p_tag => 'beta'), '["press"]'::jsonb, 'a tag is removed, and what is left comes back');
select is(public.console_untag_lead(p_environment => 'development', p_id => 'p:a2222222-2222-4222-8222-222222222222', p_tag => 'beta'), '["press"]'::jsonb, 'removing one it does not have changes nothing');
select is(
  (select string_agg(target || ':' || (before ->> 'tag'), ',') from console.audit_log where action = 'Removed a tag from a lead' and environment = 'development'),
  's•••@leads.test:beta', 'and one audit row says which was removed');

-- ---------------------------------------------------------------------------
-- Notes: scrubbed, signed, newest first, and never changed afterwards.
-- ---------------------------------------------------------------------------
select is(public.console_lead(p_id => 'p:a2222222-2222-4222-8222-222222222222') -> 'notes', '[]'::jsonb, 'no notes yet');
select set_config('t.notes', public.console_note_lead(p_environment => 'development', p_id => 'p:a2222222-2222-4222-8222-222222222222',
  p_body => '  Wrote from someone@example.com about PNR 2345678901, from 203.0.113.9.  ')::text, true);
select is(jsonb_array_length(current_setting('t.notes')::jsonb), 1, 'a note is added, and the lead''s notes come back');
select is(current_setting('t.notes')::jsonb -> 0 ->> 'body', 'Wrote from [removed] about PNR [removed], from [removed].', 'with any address, PNR-like number or IP removed, and trimmed');
select is(current_setting('t.notes')::jsonb -> 0 ->> 'author', 'Kiran Das', 'signed by the member who wrote it');
select ok((current_setting('t.notes')::jsonb -> 0 ->> 'at') is not null, 'and dated');
select pg_temp.speak_as('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
select is(public.console_note_lead(p_environment => 'development', p_id => 'p:a2222222-2222-4222-8222-222222222222', p_body => 'Second note.') -> 0 ->> 'author', 'Asha Rao', 'the newest note is first');
select is(
  (select string_agg(actor_name || '|' || target || '|' || coalesce(after::text, 'null') || '|' || coalesce(reason, 'null'), ',' order by actor_name desc) from console.audit_log where action = 'Added a note to a lead' and environment = 'development'),
  'Kiran Das|s•••@leads.test|null|null,Asha Rao|s•••@leads.test|null|null', 'each note is one audit row, which holds none of the note');
select throws_ok($$select public.console_note_lead(p_environment => 'development', p_id => 'p:a2222222-2222-4222-8222-222222222222', p_body => '   ')$$, '22023', 'empty note', 'an empty note is refused');
select throws_ok($$select public.console_note_lead(p_environment => 'development', p_id => 'p:a2222222-2222-4222-8222-222222222222', p_body => repeat('a', 501))$$, '22023', 'note too long', 'and one over 500 characters');
select lives_ok($$select public.console_note_lead(p_environment => 'development', p_id => 'a:c2222222-2222-4222-8222-222222222222', p_body => repeat('a', 500))$$, 'five hundred is allowed, and an account-only lead can be noted');
select throws_ok($$select public.console_note_lead(p_environment => 'development', p_id => 'p:' || gen_random_uuid()::text, p_body => 'A note')$$, '22023', 'no such lead', 'a lead that is not there cannot be noted');

-- ---------------------------------------------------------------------------
-- A lead's tags and notes follow it, and go when it goes.
-- ---------------------------------------------------------------------------
-- `late` signs up: its id changes from a: to p:, and what was written about it is still there.
select public.console_note_lead(p_environment => 'development', p_id => 'a:c4444444-4444-4444-8444-444444444444', p_body => 'Before the sign-up.');
insert into subscriptions.people (id, email, first_source) values ('a4444444-4444-4444-8444-444444444444', 'late@leads.test', 'footer');
select is(jsonb_array_length(public.console_lead(p_id => 'p:a4444444-4444-4444-8444-444444444444') -> 'tags'), 10, 'a lead that signs up after its account keeps its tags');
select is(public.console_lead(p_id => 'p:a4444444-4444-4444-8444-444444444444') -> 'notes' -> 0 ->> 'body', 'Before the sign-up.', 'and its notes');
select is(public.console_untag_lead(p_environment => 'development', p_id => 'p:a4444444-4444-4444-8444-444444444444', p_tag => 't1') ? 't1', false, 'and a tag written under the account can be removed from the sign-up');

delete from subscriptions.people where id = 'a2222222-2222-4222-8222-222222222222';
select is((select count(*)::int from console.lead_tags where person_id = 'a2222222-2222-4222-8222-222222222222') + (select count(*)::int from console.lead_notes where person_id = 'a2222222-2222-4222-8222-222222222222'), 0, 'a sign-up that is deleted takes its tags and notes with it');
delete from auth.users where id = 'c2222222-2222-4222-8222-222222222222';
select is((select count(*)::int from console.lead_tags where user_id = 'c2222222-2222-4222-8222-222222222222') + (select count(*)::int from console.lead_notes where user_id = 'c2222222-2222-4222-8222-222222222222'), 0, 'and so does an account');

select * from finish();
rollback;
