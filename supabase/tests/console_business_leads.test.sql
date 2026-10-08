begin;
create extension if not exists pgtap with schema extensions;

-- Module 06, Leads (third part): business leads. A lead is added by hand or marked from its record,
-- moves between five stages, has an owner, and can be taken out of the pipeline again. None of it
-- needs a key; each act is written to the audit log. A lead added by hand has given no consent, is
-- never put on a list, and is kept until someone deletes it.
-- Named notation throughout: PostgREST resolves on argument names.

select plan(63);

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

-- Two leads to start with: `signup` signed up and never confirmed; `dev` only has an account.
insert into auth.users (id, email, created_at) values ('c2222222-2222-4222-8222-222222222222', 'dev@leads.test', now() - interval '40 days');
insert into subscriptions.people (id, email, first_seen, first_source) values ('a2222222-2222-4222-8222-222222222222', 'signup@leads.test', now() - interval '2 days', 'landing');
insert into subscriptions.consents (person_id, list, notice_version, source, consented_at) values ('a2222222-2222-4222-8222-222222222222', 'news', '1.1', 'landing', now() - interval '2 days');

select set_config('t.kiran', '33333333-3333-3333-3333-333333333333', true);
select set_config('t.asha', '11111111-1111-1111-1111-111111111111', true);

-- ---------------------------------------------------------------------------
-- Grants and the floor.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from unnest(array[
     'public.console_business_members()', 'public.console_add_business_lead(text, text, text, text, text, uuid)',
     'public.console_mark_business_lead(text, text, text, text, text, uuid)', 'public.console_move_business_lead(text, text, text)',
     'public.console_assign_business_lead(text, text, uuid)', 'public.console_unmark_business_lead(text, text)']) f
    where has_function_privilege('authenticated', f, 'execute')
      and not has_function_privilege('anon', f, 'execute')
      and not has_function_privilege('service_role', f, 'execute')),
  6, 'all six are for authenticated alone');
select is((select count(*)::int from information_schema.role_table_grants g where g.table_schema = 'console' and g.table_name = 'business_leads' and g.grantee in ('anon', 'authenticated')), 0, 'the table is nobody''s to read');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'console' and c.relname = 'business_leads'), 'it has row security on, with no policy');
select is((select count(*)::int from information_schema.columns c where c.table_schema = 'console' and c.table_name = 'business_leads' and c.column_name ilike '%email%'), 0, 'and holds no address');

select pg_temp.speak_as('55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666');
select throws_ok($$select public.console_business_members()$$, '42501', 'no access', 'a Viewer cannot read who may own a lead');
select throws_ok($$select public.console_add_business_lead(p_environment => 'development', p_email => 'x@example.com', p_name => null, p_organisation => null, p_about => 'A lead', p_owner => '33333333-3333-3333-3333-333333333333')$$, '42501', 'no access', 'nor add a business lead');
select throws_ok($$select public.console_move_business_lead(p_environment => 'development', p_id => 'p:a2222222-2222-4222-8222-222222222222', p_stage => 'won')$$, '42501', 'no access', 'nor move one');

-- ---------------------------------------------------------------------------
-- Who may own a lead: the members who can open Leads.
-- ---------------------------------------------------------------------------
select pg_temp.speak_as('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444');
select is(public.console_business_members(),
  '[{"id": "11111111-1111-1111-1111-111111111111", "name": "Asha Rao"}, {"id": "33333333-3333-3333-3333-333333333333", "name": "Kiran Das"}]'::jsonb,
  'Owner, Admin and Support by name; a Viewer cannot open Leads and cannot own one');

-- ---------------------------------------------------------------------------
-- Add a business lead by hand.
-- ---------------------------------------------------------------------------
select set_config('t.added', public.console_add_business_lead(p_environment => 'development', p_email => '  Meera.Pillai@Acme-Travel.example ',
  p_name => 'Meera Pillai', p_organisation => 'Acme Travel', p_about => '  Travel desk, about 40 bookings a month. Wrote from meera@acme-travel.example  ', p_owner => current_setting('t.kiran')::uuid)::text, true);
select is(current_setting('t.added')::jsonb ->> 'added', 'true', 'an address nobody has is added');
select set_config('t.meera', current_setting('t.added')::jsonb ->> 'id', true);
select ok(current_setting('t.meera') ~ '^p:[0-9a-f-]{36}$', 'and the answer names the new lead');
select is((select first_source || '|' || added_by from subscriptions.people where email = 'meera.pillai@acme-travel.example'), 'added by hand|Kiran Das', 'as a sign-up added by hand, lowered and trimmed, with who added it');
select is((select count(*)::int from subscriptions.consents c join subscriptions.people p on p.id = c.person_id where p.email = 'meera.pillai@acme-travel.example'), 0, 'on no list at all: a business lead has given no consent');
select set_config('t.rec', public.console_lead(p_id => current_setting('t.meera'))::text, true);
select is((current_setting('t.rec')::jsonb -> 'business') - 'stageSince',
  '{"stage": "new", "ownerId": "33333333-3333-3333-3333-333333333333", "ownerName": "Kiran Das", "name": "Meera Pillai", "organisation": "Acme Travel", "about": "Travel desk, about 40 bookings a month. Wrote from [removed]"}'::jsonb,
  'its record carries the pipeline entry: New, owned, named, and the line about it scrubbed and trimmed');
select ok((current_setting('t.rec')::jsonb -> 'business' ->> 'stageSince') is not null, 'and when it entered the stage');
select is((current_setting('t.rec')::jsonb -> 'timeline' -> -1) - 'at', '{"kind": "added_by_hand", "list": null, "source": null, "subject": null, "reason": null, "by": "Kiran Das"}'::jsonb, 'and its timeline begins with who added it by hand');
select is(current_setting('t.rec')::jsonb ->> 'email', 'm•••@acme-travel.example', 'masked, like any lead');
select is(
  (select actor_name || '|' || category || '|' || target || '|' || coalesce(before::text, 'null') || '|' || after::text from console.audit_log where action = 'Added a business lead' and environment = 'development'),
  'Kiran Das|leads|m•••@acme-travel.example|null|{"owner": "Kiran Das"}', 'one audit row, by the masked address, holding no name, organisation or line about them');
select is((select news || '|' || source || '|' || account from console.leads() where email = 'meera.pillai@acme-travel.example'), 'none|added by hand|none', 'in the Lifecycle list it is not subscribed, and its source says how it came');

select throws_ok($$select public.console_add_business_lead(p_environment => 'development', p_email => 'meera', p_name => null, p_organisation => null, p_about => 'A lead', p_owner => '33333333-3333-3333-3333-333333333333')$$, '22023', 'not an address', 'part of an address is refused');
select throws_ok($$select public.console_add_business_lead(p_environment => 'development', p_email => 'x@example.com', p_name => null, p_organisation => null, p_about => '   ', p_owner => '33333333-3333-3333-3333-333333333333')$$, '22023', 'about is empty', 'the line about the lead is required');
select throws_ok($$select public.console_add_business_lead(p_environment => 'development', p_email => 'x@example.com', p_name => null, p_organisation => null, p_about => repeat('a', 121), p_owner => '33333333-3333-3333-3333-333333333333')$$, '22023', 'about too long', 'and is 120 characters at most');
select throws_ok($$select public.console_add_business_lead(p_environment => 'development', p_email => 'x@example.com', p_name => repeat('a', 81), p_organisation => null, p_about => 'A lead', p_owner => '33333333-3333-3333-3333-333333333333')$$, '22023', 'name too long', 'a name is 80 at most');
select throws_ok($$select public.console_add_business_lead(p_environment => 'development', p_email => 'x@example.com', p_name => null, p_organisation => repeat('a', 81), p_about => 'A lead', p_owner => '33333333-3333-3333-3333-333333333333')$$, '22023', 'name too long', 'and so is an organisation');
select throws_ok($$select public.console_add_business_lead(p_environment => 'development', p_email => 'x@example.com', p_name => null, p_organisation => null, p_about => 'A lead', p_owner => '55555555-5555-5555-5555-555555555555')$$, '22023', 'not an owner', 'a Viewer cannot own a lead');
select throws_ok($$select public.console_add_business_lead(p_environment => 'development', p_email => 'x@example.com', p_name => null, p_organisation => null, p_about => 'A lead', p_owner => gen_random_uuid())$$, '22023', 'not an owner', 'nor someone who is not a member');
select throws_ok($$select public.console_add_business_lead(p_environment => 'development', p_email => 'Owner@Trakline.in', p_name => null, p_organisation => null, p_about => 'A lead', p_owner => '33333333-3333-3333-3333-333333333333')$$, '22023', 'a console member', 'a console member''s own address is not a lead');
select is((select count(*)::int from subscriptions.people where email in ('x@example.com', 'owner@trakline.in')), 0, 'and a refused add leaves nothing behind');

-- An address that is already a lead is marked, not added twice.
select set_config('t.again', public.console_add_business_lead(p_environment => 'development', p_email => 'SignUp@leads.test', p_name => '', p_organisation => null, p_about => 'Asked about group bookings', p_owner => current_setting('t.asha')::uuid)::text, true);
select is(current_setting('t.again')::jsonb, '{"id": "p:a2222222-2222-4222-8222-222222222222", "added": false}'::jsonb, 'an address that is already a lead answers that lead, not a second one');
select is((select count(*)::int from subscriptions.people where email = 'signup@leads.test'), 1, 'there is still one of them');
select is((select first_source from subscriptions.people where email = 'signup@leads.test'), 'landing', 'whose source is still how it first came');
select is(public.console_lead(p_id => 'p:a2222222-2222-4222-8222-222222222222') -> 'business' ->> 'name', null, 'an empty name is no name');
select is((select count(*)::int from console.audit_log where action = 'Marked a lead as a business enquiry' and target = 's•••@leads.test' and environment = 'development'), 1, 'and it is recorded as a mark, not an add');
select throws_ok($$select public.console_add_business_lead(p_environment => 'development', p_email => 'signup@leads.test', p_name => null, p_organisation => null, p_about => 'Again', p_owner => '33333333-3333-3333-3333-333333333333')$$, '22023', 'already in the pipeline', 'a lead is in the pipeline once');

-- ---------------------------------------------------------------------------
-- Mark a lead from its record: an account-only lead can be one too.
-- ---------------------------------------------------------------------------
select is(public.console_mark_business_lead(p_environment => 'development', p_id => 'a:c2222222-2222-4222-8222-222222222222', p_name => 'Dev Shah', p_organisation => null, p_about => 'Corporate travel team of 12', p_owner => current_setting('t.kiran')::uuid) - 'stageSince',
  '{"stage": "new", "ownerId": "33333333-3333-3333-3333-333333333333", "ownerName": "Kiran Das", "name": "Dev Shah", "organisation": null, "about": "Corporate travel team of 12"}'::jsonb,
  'marking answers the pipeline entry');
select is((select count(*)::int from console.business_leads where user_id = 'c2222222-2222-4222-8222-222222222222'), 1, 'hung off the account, since there is no sign-up');
select throws_ok($$select public.console_mark_business_lead(p_environment => 'development', p_id => 'a:c2222222-2222-4222-8222-222222222222', p_name => null, p_organisation => null, p_about => 'Again', p_owner => '33333333-3333-3333-3333-333333333333')$$, '22023', 'already in the pipeline', 'marking twice is refused');
select throws_ok($$select public.console_mark_business_lead(p_environment => 'development', p_id => 'p:' || gen_random_uuid()::text, p_name => null, p_organisation => null, p_about => 'A lead', p_owner => '33333333-3333-3333-3333-333333333333')$$, '22023', 'no such lead', 'and so is a lead that is not there');

-- ---------------------------------------------------------------------------
-- Move and assign.
-- ---------------------------------------------------------------------------
update console.business_leads set stage_since = now() - interval '5 days';
select is(public.console_move_business_lead(p_environment => 'development', p_id => current_setting('t.meera'), p_stage => 'contacted') ->> 'stage', 'contacted', 'a lead moves to another stage');
select ok((select stage_since > now() - interval '1 minute' from console.business_leads b join subscriptions.people p on p.id = b.person_id where p.email = 'meera.pillai@acme-travel.example'), 'and its time in the stage starts again');
select is(
  (select target || '|' || before::text || '|' || after::text from console.audit_log where action = 'Moved a business lead' and environment = 'development'),
  'm•••@acme-travel.example|{"stage": "new"}|{"stage": "contacted"}', 'the move is recorded, from and to');
update console.business_leads set stage_since = now() - interval '5 days';
select lives_ok($$select public.console_move_business_lead(p_environment => 'development', p_id => current_setting('t.meera'), p_stage => 'contacted')$$, 'moving it to where it is changes nothing');
select ok((select stage_since < now() - interval '4 days' from console.business_leads b join subscriptions.people p on p.id = b.person_id where p.email = 'meera.pillai@acme-travel.example'), 'not even its time in the stage');
select is((select count(*)::int from console.audit_log where action = 'Moved a business lead' and environment = 'development'), 1, 'and writes no second row');
select throws_ok($$select public.console_move_business_lead(p_environment => 'development', p_id => current_setting('t.meera'), p_stage => 'maybe')$$, '22023', 'unknown stage', 'a stage that is not one of the five is refused');

select is(public.console_assign_business_lead(p_environment => 'development', p_id => current_setting('t.meera'), p_owner => current_setting('t.asha')::uuid) ->> 'ownerName', 'Asha Rao', 'a lead is given to another owner');
select is((select target || '|' || before::text || '|' || after::text from console.audit_log where action = 'Assigned a business lead' and environment = 'development'),
  'm•••@acme-travel.example|{"owner": "Kiran Das"}|{"owner": "Asha Rao"}', 'which is recorded, from and to');
select throws_ok($$select public.console_assign_business_lead(p_environment => 'development', p_id => current_setting('t.meera'), p_owner => '55555555-5555-5555-5555-555555555555')$$, '22023', 'not an owner', 'a Viewer cannot be given one');
-- Two statements: a count in the same statement as the call would be taken from that statement's
-- own snapshot, and could not see a row the call had just written.
select public.console_assign_business_lead(p_environment => 'development', p_id => current_setting('t.meera'), p_owner => current_setting('t.asha')::uuid);
select is((select count(*)::int from console.audit_log where action = 'Assigned a business lead' and environment = 'development'), 1, 'giving it to its owner writes nothing');

-- An owner who leaves the console leaves their leads owned by nobody, not gone. Removal keeps the
-- member's row and marks it (console_team), so this is a status, not a missing row.
select pg_temp.speak_as('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
update console.members set status = 'removed' where user_id = '33333333-3333-3333-3333-333333333333';
select is(jsonb_array_length(public.console_business_members()), 1, 'a removed member is no longer offered as an owner');
select is(public.console_lead(p_id => 'a:c2222222-2222-4222-8222-222222222222') -> 'business' -> 'ownerName', 'null'::jsonb, 'a lead whose owner has left the console is owned by nobody');
select is(public.console_lead(p_id => 'a:c2222222-2222-4222-8222-222222222222') -> 'business' ->> 'stage', 'new', 'and is still in the pipeline');

-- ---------------------------------------------------------------------------
-- Remove from the pipeline: the lead stays.
-- ---------------------------------------------------------------------------
select throws_ok($$select public.console_move_business_lead(p_environment => 'development', p_id => 'p:' || gen_random_uuid()::text, p_stage => 'won')$$, '22023', 'no such lead', 'a lead that is not there cannot be moved');
select is(public.console_unmark_business_lead(p_environment => 'development', p_id => current_setting('t.meera')), null, 'removing answers nothing');
select is(public.console_lead(p_id => current_setting('t.meera')) -> 'business', 'null'::jsonb, 'the lead is no longer in the pipeline');
select is(public.console_lead(p_id => current_setting('t.meera')) ->> 'email', 'm•••@acme-travel.example', 'and is still a lead');
select is(public.console_lead(p_id => current_setting('t.meera')) -> 'timeline' -> -1 ->> 'by', 'Kiran Das', 'whose record still says who added it');
select is((select count(*)::int from console.audit_log where action = 'Removed a lead from the pipeline' and target = 'm•••@acme-travel.example' and environment = 'development'), 1, 'the removal is recorded');
select throws_ok($$select public.console_unmark_business_lead(p_environment => 'development', p_id => current_setting('t.meera'))$$, '22023', 'not in the pipeline', 'a lead that is not in the pipeline cannot be removed from it');
select throws_ok($$select public.console_move_business_lead(p_environment => 'development', p_id => current_setting('t.meera'), p_stage => 'won')$$, '22023', 'not in the pipeline', 'nor moved');

-- ---------------------------------------------------------------------------
-- Kept until deleted: the seven-day clean-up of unconfirmed sign-ups leaves business leads alone.
-- ---------------------------------------------------------------------------
update subscriptions.people set first_seen = now() - interval '8 days';
insert into subscriptions.people (id, email, first_seen, first_source) values ('a9999999-9999-4999-8999-999999999999', 'stale@leads.test', now() - interval '8 days', 'footer');
select public.subscriptions_sign_up(p_email => 'fresh@leads.test', p_list => 'news', p_source => 'footer', p_campaign => '{}'::jsonb, p_notice_version => '1.1', p_token_hash => extensions.digest('t', 'sha256'));
select is((select count(*)::int from subscriptions.people where email = 'stale@leads.test'), 0, 'an ordinary unconfirmed sign-up older than seven days is still cleaned up');
select is((select count(*)::int from subscriptions.people where email = 'meera.pillai@acme-travel.example'), 1, 'a lead added by hand is kept, in the pipeline or out of it');
select is((select count(*)::int from subscriptions.people where email = 'signup@leads.test'), 1, 'and so is an unconfirmed sign-up while it is in the pipeline');
select public.console_unmark_business_lead(p_environment => 'development', p_id => 'p:a2222222-2222-4222-8222-222222222222');
select public.subscriptions_sign_up(p_email => 'fresher@leads.test', p_list => 'news', p_source => 'footer', p_campaign => '{}'::jsonb, p_notice_version => '1.1', p_token_hash => extensions.digest('u', 'sha256'));
select is((select count(*)::int from subscriptions.people where email = 'signup@leads.test'), 0, 'taken out of the pipeline, it is an unconfirmed sign-up again and goes with the rest');

select * from finish();
rollback;
