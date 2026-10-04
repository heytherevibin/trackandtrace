begin;
create extension if not exists pgtap with schema extensions;

-- The console's Suppressions view (07). Three functions over `announcements.suppressions`: list
-- (masked), reveal (audited), lift (audited, and only by someone who has seen the address).
-- Named notation throughout: PostgREST resolves on argument names.

select plan(27);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in'),
  ('33333333-3333-3333-3333-333333333333', 'support@trakline.in'),
  ('55555555-5555-5555-5555-555555555555', 'kiran@trakline.in'),
  ('77777777-7777-7777-7777-777777777777', 'gone@trakline.in');
insert into console.members (user_id, email, name, role, status) values
  ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in', 'Asha Rao', 'owner', 'active'),
  ('33333333-3333-3333-3333-333333333333', 'support@trakline.in', 'Kiran Das', 'support', 'active'),
  ('55555555-5555-5555-5555-555555555555', 'kiran@trakline.in', 'Kiran Rao', 'admin', 'active'),
  ('77777777-7777-7777-7777-777777777777', 'gone@trakline.in', 'Gone', 'admin', 'removed');
insert into console.sessions (session_id, member_id, address_hash, device_label, expires_at, key_verified_at) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'hash', 'Chrome on macOS', now() + interval '7 days', now()),
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'hash', 'Chrome on macOS', now() + interval '7 days', now());

create or replace function pg_temp.speak_as(p_user uuid, p_session uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'session_id', p_session)::text, true);
end;
$$;

-- Emptied first: the local database is shared, and this file counts rows.
delete from announcements.suppressions;
insert into announcements.suppressions (email, scope, reason, source, at) values
  ('kiran@trakline.in',  'all',  'hard bounce',          'resend', now() - interval '1 day'),
  ('reader@example.in',  'all',  'hard bounce',          'resend', now() - interval '2 days'),
  ('s@example.in',       'list', 'complaint',            'resend', now() - interval '3 days'),
  ('gone@trakline.in',   'list', 'repeatedly delayed',   'resend', now() - interval '4 days'),
  ('p.mehta@example.in', 'list', 'suppressed by Resend', 'resend', now() - interval '5 days');

-- Every row has an id of its own: the console names a row by it, never by the address.
select is((select count(distinct id)::int from announcements.suppressions), 5, 'each suppression has its own id');

-- Grants.
select is(
  (select count(*)::int from unnest(array[
     'public.console_suppressions()', 'public.console_reveal_suppression(text, uuid)', 'public.console_lift_suppression(text, uuid, text)']) f
    where has_function_privilege('authenticated', f, 'execute')
      and not has_function_privilege('anon', f, 'execute')
      and not has_function_privilege('service_role', f, 'execute')),
  3, 'all three are for authenticated alone');

-- The floor.
select pg_temp.speak_as('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444');
select throws_ok($$select public.console_suppressions()$$, '42501', 'no access', 'Support cannot list suppressions');
select throws_ok($$select public.console_reveal_suppression(p_environment => 'development', p_id => gen_random_uuid())$$, '42501', 'no access', 'Support cannot reveal');
select throws_ok($$select public.console_lift_suppression(p_environment => 'development', p_id => gen_random_uuid(), p_address => 'x@example.in')$$, '42501', 'no access', 'Support cannot lift');

select pg_temp.speak_as('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

-- The list: newest first, masked, except an operator's.
select is(jsonb_array_length(public.console_suppressions()), 5, 'every suppression is listed');
select is(public.console_suppressions() -> 0 ->> 'address', 'kiran@trakline.in', 'newest first, and an active member''s address is shown whole');
select is(public.console_suppressions() -> 0 ->> 'operator', 'true', 'and marked as an operator''s');
select is(public.console_suppressions() -> 0 ->> 'masked', 'false', 'and not masked');
select is(public.console_suppressions() -> 1 ->> 'address', 'r•••@example.in', 'anyone else''s is masked to its first letter and its domain');
select is(public.console_suppressions() -> 1 ->> 'masked', 'true', 'and says it is masked');
select is(public.console_suppressions() -> 2 ->> 'address', 's•••@example.in', 'a one-letter name masks the same way, so its length says nothing');
select is(public.console_suppressions() -> 3 ->> 'operator', 'false', 'a removed member is not an operator');
select is(public.console_suppressions() -> 3 ->> 'address', 'g•••@trakline.in', 'and their address is masked like any other');
select is(public.console_suppressions() -> 1 ->> 'scope', 'all', 'the scope is given');
select is(public.console_suppressions() -> 2 ->> 'reason', 'complaint', 'and the reason as stored');
select ok(not (public.console_suppressions()::text like '%reader@example.in%'), 'no masked row carries its address anywhere in the answer');

-- Reveal.
select set_config('t.reader', (select id::text from announcements.suppressions where email = 'reader@example.in'), true);
select throws_ok($$select public.console_reveal_suppression(p_environment => 'development', p_id => gen_random_uuid())$$, '22023', 'no such suppression', 'a row that does not exist cannot be revealed');
select is(public.console_reveal_suppression(p_environment => 'development', p_id => current_setting('t.reader')::uuid), 'reader@example.in', 'reveal answers the address');
select is(
  (select actor_name || '|' || category || '|' || target || '|' || (after ->> 'scope') from console.audit_log where action = 'Revealed a suppressed address' and environment = 'development'),
  'Asha Rao|messages|r•••@example.in|all', 'and is written to the audit log, naming the row by its MASKED address: the log is not a second copy of what it guards');

-- Lift: only by someone who has the address.
select throws_ok(format($$select public.console_lift_suppression(p_environment => 'development', p_id => %L, p_address => 'guess@example.in')$$, current_setting('t.reader')), '22023', 'address mismatch', 'a lift that does not name the address is refused: nobody lifts what they have not seen');
select is((select count(*)::int from announcements.suppressions where email = 'reader@example.in'), 1, 'and the suppression stands');
select throws_ok($$select public.console_lift_suppression(p_environment => 'development', p_id => gen_random_uuid(), p_address => 'reader@example.in')$$, '22023', 'no such suppression', 'a row that does not exist cannot be lifted');
select lives_ok(format($$select public.console_lift_suppression(p_environment => 'development', p_id => %L, p_address => '  Reader@Example.in ')$$, current_setting('t.reader')), 'the address is compared as it is stored: trimmed and lower case');
select is((select count(*)::int from announcements.suppressions where email = 'reader@example.in'), 0, 'the suppression is gone');
select is(public.announce_suppressed(p_email => 'reader@example.in'), null, 'so mail to the address is no longer held back');
select is(
  (select target || '|' || result::text || '|' || (after ->> 'scope') || '|' || (after ->> 'reason') from console.audit_log where action = 'Lifted a suppression' and environment = 'development'),
  'r•••@example.in|done|all|hard bounce', 'the audit log says which suppression was lifted, of what scope and for what reason');

select * from finish();
rollback;
