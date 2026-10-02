begin;
create extension if not exists pgtap with schema extensions;
select plan(131);

-- Announcements (06-B). The schema is private: nothing reaches it except through the
-- security-definer functions, and only service_role may call those.
--
-- Written against `src/services/announcements/store.ts` and `drain-store.ts`, which are the
-- contract: the TypeScript wrappers destructure the camelCase keys asserted below, and a snake_case
-- key reads to them as a missing field.
--
-- EVERY CALL HERE USES NAMED NOTATION — `announce_remaining(p_letter => …)` — and that is not
-- style. PostgREST resolves an RPC on its ARGUMENT NAMES and nothing else, so renaming `p_letter`
-- to `p_id` in one function would leave a positional suite entirely green while the first real
-- `rpc("announce_remaining", { p_letter: id })` answered PGRST202 and both daily jobs failed from
-- their first run. Named notation fails to resolve at parse time instead.
--
-- WHY SO MUCH OF THIS FILE IS ABOUT TWO TIMESTAMPS. Every upstream test of `firstAttemptedAt` is fed
-- fixture rows, so not one of them observes what this migration actually writes. If `announce_claim`
-- stamped `first_attempted_at` on every claim, or if `announce_open_claims` aliased it to
-- `claimed_at`, every test on this branch would stay green while a row re-claimed daily never
-- reached 24 hours: `unknown` would be unreachable, the Resend idempotency key would outlive its
-- window, and a real reader would receive the letter twice. The re-claim assertions below are the
-- only thing in the system that can catch that.
--
-- `now()` is the TRANSACTION's clock and does not move inside this file, so "time passed" is staged
-- by BACKDATING a row's timestamps and then acting on it. That is also what makes the re-claim
-- assertion possible: with both columns pushed back together, a correct re-claim moves only one.

-- ---------------------------------------------------------------------------
-- Seeds. P1/P2/P6 are confirmed on `news`; P3 never confirmed; P4 withdrew; P5 is on `availability`.
-- ---------------------------------------------------------------------------
insert into subscriptions.people (id, email, first_source) values
  ('11111111-1111-4111-8111-111111111111', 'asha@example.in', 'footer'),
  ('22222222-2222-4222-8222-222222222222', 'bo@example.in',   'footer'),
  ('33333333-3333-4333-8333-333333333333', 'cy@example.in',   'footer'),
  ('44444444-4444-4444-8444-444444444444', 'di@example.in',   'footer'),
  ('55555555-5555-4555-8555-555555555555', 'el@example.in',   'pre-booking'),
  ('66666666-6666-4666-8666-666666666666', 'fay@example.in',  'footer');
insert into subscriptions.consents (person_id, list, notice_version, source, confirmed_at, withdrawn_at) values
  ('11111111-1111-4111-8111-111111111111', 'news', '1.1', 'footer', now(), null),
  ('22222222-2222-4222-8222-222222222222', 'news', '1.1', 'footer', now(), null),
  ('33333333-3333-4333-8333-333333333333', 'news', '1.1', 'footer', null,  null),
  ('44444444-4444-4444-8444-444444444444', 'news', '1.1', 'footer', now(), now()),
  ('55555555-5555-4555-8555-555555555555', 'availability', '1.1', 'pre-booking', now(), null),
  ('66666666-6666-4666-8666-666666666666', 'news', '1.1', 'footer', now(), null);

-- ---------------------------------------------------------------------------
-- The schema is private, and the functions are the server's alone.
-- ---------------------------------------------------------------------------
select ok(not has_schema_privilege('anon', 'announcements', 'usage'), 'anon cannot use the schema');
select ok(not has_schema_privilege('authenticated', 'announcements', 'usage'), 'authenticated cannot use the schema');
select is(
  (select count(*)::int from pg_policies where schemaname = 'announcements'),
  0, 'RLS is on with no policies, so no row is reachable by policy');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'announcements' and c.relkind = 'r' and c.relrowsecurity),
  4, 'row level security is enabled on all four tables');
select ok(has_function_privilege('service_role', 'public.announce_claim(uuid, int)', 'execute'), 'service_role may claim');
select ok(not has_function_privilege('anon', 'public.announce_claim(uuid, int)', 'execute'), 'anon may not claim');
-- Every one of the eleven, not only the one spelled out above: a grant added by hand to a later
-- function is exactly how one of them ends up reachable.
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'announce\_%' and has_function_privilege('anon', p.oid, 'execute')),
  0, 'no announce_* function is executable by anon');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'announce\_%' and has_function_privilege('authenticated', p.oid, 'execute')),
  0, 'no announce_* function is executable by authenticated');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'announce\_%' and has_function_privilege('service_role', p.oid, 'execute')),
  11, 'all eleven are executable by service_role');

-- ---------------------------------------------------------------------------
-- What the tables refuse on their own.
-- ---------------------------------------------------------------------------
insert into announcements.letters (id, list, subject, body, state, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'news', 's', 'b', 'queued', gen_random_uuid());
insert into announcements.deliveries (letter_id, person_id, state)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'pending');
select throws_ok(
  $$insert into announcements.deliveries (letter_id, person_id, state)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'pending')$$,
  '23505', null, 'one delivery per person per letter, enforced by the database');
-- Every state a delivery is ever written in, one assertion each, BEFORE any function is called.
-- `sending` was missing from this constraint, and because the only thing that writes it is
-- `announce_claim`, the gap showed up as the claim assertion ABORTING the whole file on a check
-- violation rather than as a red line naming the value. These fail cleanly and say which one.
select lives_ok(
  $$insert into announcements.deliveries (letter_id, person_id, state)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'sending')$$,
  'a delivery may be sending, which is what announce_claim moves every row into');
select lives_ok(
  $$insert into announcements.deliveries (letter_id, person_id, state)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'sent')$$,
  'or sent');
select lives_ok(
  $$insert into announcements.deliveries (letter_id, person_id, state)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 'unknown')$$,
  'or unknown');
select lives_ok(
  $$insert into announcements.deliveries (letter_id, person_id, state)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '55555555-5555-4555-8555-555555555555', 'skipped')$$,
  'or skipped');
-- And nothing else. `failed` belongs here only if something stored it: a failed send leaves the row
-- `sending` and unmarked for the next run, so it is a counter label in the runner and never a row.
select throws_ok(
  $$insert into announcements.deliveries (letter_id, person_id, state)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '66666666-6666-4666-8666-666666666666', 'failed')$$,
  '23514', null, 'a delivery is never `failed`, because nothing writes that state');
select throws_ok(
  $$insert into announcements.suppressions (email, scope, reason, source)
    values ('A@Example.IN', 'all', 'hard bounce', 'resend')$$,
  '23514', null, 'an unnormalised suppression address is refused, not silently stored');
select throws_ok(
  $$insert into announcements.webhook_events (svix_id, kind, email)
    values ('msg_junk', 'email.bounced', 'A@Example.IN')$$,
  '23514', null, 'an unnormalised webhook address is refused, so one person''s soft count cannot be split in two');

-- ---------------------------------------------------------------------------
-- announce_queue: one pending delivery per CONFIRMED, un-withdrawn consent on that letter's list.
-- ---------------------------------------------------------------------------
insert into announcements.letters (id, list, subject, body, created_by, test_sent_at, test_sent_to)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'news', 'Subject', 'Body', gen_random_uuid(), now(), 'proof@example.in');
select is(public.announce_queue(p_member => 'c0ffee01-0000-4000-8000-000000000001', p_letter => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 3,
  'queueing makes one delivery per confirmed subscriber and answers how many');
select is(
  (select array_agg(person_id::text order by person_id::text) from announcements.deliveries
    where letter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')::text,
  '{11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222,66666666-6666-4666-8666-666666666666}',
  'and nobody else: not the unconfirmed one, not the withdrawn one, not the other list''s');
select is((select state from announcements.letters where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'queued',
  'the letter is queued');
select is((select recipients_total from announcements.letters where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 3,
  'and carries the count it answered');
select ok((select queued_at is not null from announcements.letters where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  'with the time it was queued, which is what the runner picks the oldest by');
select is((select queued_by from announcements.letters where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  'c0ffee01-0000-4000-8000-000000000001'::uuid, 'and WHO queued it, so the console names a person instead of reconstructing one from the audit log');
select throws_ok(
  $$select public.announce_queue(p_member => 'c0ffee01-0000-4000-8000-000000000001', p_letter => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$,
  'P0001', null, 'a letter that is already queued cannot be queued again, so nobody is given a second delivery');
select throws_ok(
  $$select public.announce_queue(p_member => 'c0ffee01-0000-4000-8000-000000000001', p_letter => '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f')$$,
  'P0001', null, 'a letter that does not exist is an error, never a quiet zero');
-- A test send is the last point at which a mistake costs nothing, so Queue refuses without one.
insert into announcements.letters (id, list, subject, body, created_by)
  values ('b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', 'news', 'Unproofed', 'Body', gen_random_uuid());
select throws_ok(
  $$select public.announce_queue(p_member => 'c0ffee01-0000-4000-8000-000000000001', p_letter => 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2')$$,
  'P0001', null, 'a letter nobody has test sent cannot be queued, whatever the console allows');
update announcements.letters set test_sent_at = now(), test_sent_to = 'proof@example.in'
 where id = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';
select lives_ok(
  $$select public.announce_queue(p_member => 'c0ffee01-0000-4000-8000-000000000001', p_letter => 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2')$$,
  'and can be queued once the proof has gone out');
select lives_ok(
  $$select public.announce_stop(p_member => 'c0ffee02-0000-4000-8000-000000000002', p_letter => 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2')$$,
  'it is stopped again so it does not sit open through the rest of this file');
select is((select stopped_by from announcements.letters where id = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2'),
  'c0ffee02-0000-4000-8000-000000000002'::uuid, 'and the Stop records who pressed it, which is what sheet 23 prints');

-- ---------------------------------------------------------------------------
-- announce_claim: the letter's transition, the two clocks, and both edges of the window.
-- ---------------------------------------------------------------------------
delete from announcements.deliveries
 where letter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and person_id = '66666666-6666-4666-8666-666666666666';
select is(
  (select jsonb_agg(j order by j ->> 'personId')
     from public.announce_claim(p_letter => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', p_limit => 1) j),
  '[{"email": "asha@example.in", "personId": "11111111-1111-4111-8111-111111111111"}]'::jsonb,
  'a claim answers the person and the address, under the keys the sender destructures');
select is((select state from announcements.letters where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'sending',
  'claiming the first batch moves the letter from queued to sending: nothing else knows work has started');
-- Both columns, to the exact instant. This is the assertion that catches a migration which never
-- writes `first_attempted_at` at all — the re-claim trio below cannot, because it stages the column
-- by hand and a function that ignores it would leave the staged value in place and pass.
select is(
  (select array[claimed_at, first_attempted_at] from announcements.deliveries
    where letter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and person_id = '11111111-1111-4111-8111-111111111111'),
  array[now(), now()], 'the first claim stamps BOTH clocks, each to now');
select ok(
  (select claimed_at is null and first_attempted_at is null from announcements.deliveries
    where letter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and person_id = '22222222-2222-4222-8222-222222222222'),
  'a row nobody claimed has neither');

-- THE assertions this file exists for. Both clocks go back half an hour: past the 15-minute floor,
-- far inside the 24-hour window, so the row is re-claimable.
update announcements.deliveries
   set claimed_at = now() - interval '30 minutes', first_attempted_at = now() - interval '30 minutes'
 where letter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and person_id = '11111111-1111-4111-8111-111111111111';
select is(
  (select count(*)::int from public.announce_claim(p_letter => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', p_limit => 10)),
  2, 'a re-claim takes the stale sending row and the pending one together');
select is(
  (select claimed_at from announcements.deliveries
    where letter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and person_id = '11111111-1111-4111-8111-111111111111'),
  now(), 'the re-claim MOVED claimed_at, which is what the 15-minute floor reads');
select is(
  (select first_attempted_at from announcements.deliveries
    where letter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and person_id = '11111111-1111-4111-8111-111111111111'),
  now() - interval '30 minutes',
  'and LEFT first_attempted_at alone: a row re-claimed daily must still reach 24 hours, or unknown is unreachable and the idempotency key outlives Resend');
select ok(
  (select claimed_at <> first_attempted_at from announcements.deliveries
    where letter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and person_id = '11111111-1111-4111-8111-111111111111'),
  'the two columns now hold different values, so one written from the other would fail here');
select is(
  (select count(*)::int from public.announce_claim(p_letter => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', p_limit => 10)),
  0, 'nothing is re-claimed inside the 15-minute floor, so a run cannot take a row it is still sending');

-- The ceiling is STRICT: the runner calls a row first attempted exactly 24 hours ago stale, so the
-- claim must refuse it. Inclusive on both sides would make the same row retryable and stale at once,
-- and a strictly daily job lands exactly on that boundary.
update announcements.deliveries
   set claimed_at = now() - interval '1 hour', first_attempted_at = now() - interval '24 hours'
 where letter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and person_id = '11111111-1111-4111-8111-111111111111';
select is(
  (select count(*)::int from public.announce_claim(p_letter => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', p_limit => 10)),
  0, 'a row first attempted exactly 24 hours ago is not re-claimed');
update announcements.deliveries
   set first_attempted_at = now() - interval '24 hours' + interval '1 second'
 where letter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and person_id = '11111111-1111-4111-8111-111111111111';
select is(
  (select jsonb_agg(j ->> 'personId')
     from public.announce_claim(p_letter => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', p_limit => 10) j),
  '["11111111-1111-4111-8111-111111111111"]'::jsonb,
  'one second inside the window still is, so the boundary sits where the runner believes it does');

-- A sending row with no first attempt cannot be shown to be inside the window; the runner calls it
-- stale, so the claim must not retry it either.
update announcements.deliveries
   set claimed_at = now() - interval '1 hour', first_attempted_at = null
 where letter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and person_id = '11111111-1111-4111-8111-111111111111';
select is(
  (select count(*)::int from public.announce_claim(p_letter => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', p_limit => 10)),
  0, 'a sending row with no first attempt is never retried, because unknown is the side that never sends twice');

-- A settled row is never claimed again, whatever its clocks say.
update announcements.deliveries
   set state = 'sent', claimed_at = now() - interval '5 hours', first_attempted_at = now() - interval '5 hours'
 where letter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and person_id = '11111111-1111-4111-8111-111111111111';
update announcements.deliveries
   set state = 'skipped', claimed_at = now() - interval '5 hours', first_attempted_at = now() - interval '5 hours'
 where letter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and person_id = '22222222-2222-4222-8222-222222222222';
insert into announcements.deliveries (letter_id, person_id, state, claimed_at, first_attempted_at)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '66666666-6666-4666-8666-666666666666', 'unknown',
          now() - interval '4 hours', now() - interval '5 hours');
select is(
  (select count(*)::int from public.announce_claim(p_letter => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', p_limit => 10)),
  0, 'sent, skipped and unknown rows are never claimed again');
-- Two runs taking the same row would send one person the letter twice, and no single-session test
-- can observe a lock. The only trace of it available here is the claim's own text.
select matches(
  (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'announce_claim'),
  'skip locked', 'the claim takes its rows with `for update skip locked`, which is what makes two concurrent runs safe');

-- A Stop landing between the runner's state read and its claim must not move a single row. Rows
-- claimed on a stopped letter are unsettled for ever: `announce_finish` will never move them and the
-- stuck report excludes stopped letters, so nothing we have would ever name them.
insert into announcements.letters (id, list, subject, body, state, created_by, queued_at)
  values ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'news', 's', 'b', 'queued', gen_random_uuid(), now());
insert into announcements.deliveries (letter_id, person_id, state)
  values ('ffffffff-ffff-4fff-8fff-ffffffffffff', '33333333-3333-4333-8333-333333333333', 'pending');
select lives_ok($$select public.announce_stop(p_member => 'c0ffee02-0000-4000-8000-000000000002', p_letter => 'ffffffff-ffff-4fff-8fff-ffffffffffff')$$, 'the letter is stopped');
select is(
  (select count(*)::int from public.announce_claim(p_letter => 'ffffffff-ffff-4fff-8fff-ffffffffffff', p_limit => 10)),
  0, 'and a claim on a stopped letter takes nothing at all');
select is(
  (select state from announcements.deliveries
    where letter_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff' and person_id = '33333333-3333-4333-8333-333333333333'),
  'pending', 'its pending row is untouched, not left sending on a letter nothing will ever finish');
select is(public.announce_letter_state(p_letter => 'ffffffff-ffff-4fff-8fff-ffffffffffff'), 'stopped',
  'and the claim did not quietly put the stopped letter back to sending');

-- ---------------------------------------------------------------------------
-- CONSENT IS RE-CHECKED AT CLAIM, not only at queue. A letter to 430 people drains about eleven
-- days. A reader who clicks Unsubscribe on day 2 must not receive it on day 7 — and their delivery
-- row was made on day 1, when they were a subscriber. Nothing else in the send path can refuse:
-- `sendToAddress` reads the suppression table only, and the claim's own join is to `people`. The
-- only consent read anywhere else is `announce_queue`, at queue time. So this is the one place.
-- ---------------------------------------------------------------------------
insert into subscriptions.people (id, email, first_source) values
  ('77777777-7777-4777-8777-777777777777', 'gita@example.in', 'footer'),
  ('88888888-8888-4888-8888-888888888888', 'hari@example.in', 'footer'),
  ('99999999-9999-4999-8999-999999999999', 'ila@example.in',  'footer');
insert into subscriptions.consents (person_id, list, notice_version, source, confirmed_at, withdrawn_at) values
  ('77777777-7777-4777-8777-777777777777', 'news', '1.1', 'footer', now(), null),
  ('88888888-8888-4888-8888-888888888888', 'news', '1.1', 'footer', now(), now()),
  ('99999999-9999-4999-8999-999999999999', 'news', '1.1', 'footer', now(), null),
  ('99999999-9999-4999-8999-999999999999', 'availability', '1.1', 'footer', now(), now());
insert into announcements.letters (id, list, subject, body, state, created_by, queued_at, test_sent_at)
  values ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'news', 's', 'b', 'queued', gen_random_uuid(), now(), now());
insert into announcements.deliveries (letter_id, person_id, state) values
  ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', '77777777-7777-4777-8777-777777777777', 'pending'),
  ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', '88888888-8888-4888-8888-888888888888', 'pending'),
  ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', '99999999-9999-4999-8999-999999999999', 'pending');
-- The fixture is what it says it is: one withdrawal on THIS letter's list, one on another list.
-- Without this a mistyped list name would leave the over-reach case untested and the assertion
-- below green anyway.
select is(
  (select array_agg(p.email || ' left ' || c.list order by p.email)
     from subscriptions.consents c join subscriptions.people p on p.id = c.person_id
    where c.withdrawn_at is not null and p.email in ('hari@example.in', 'ila@example.in'))::text,
  '{"hari@example.in left news","ila@example.in left availability"}',
  'the fixture withdrew exactly one consent each: hari from this letter''s list, ila from the other');
select is(
  (select jsonb_agg(j ->> 'personId' order by j ->> 'personId')
     from public.announce_claim(p_letter => 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', p_limit => 10) j),
  '["77777777-7777-4777-8777-777777777777", "99999999-9999-4999-8999-999999999999"]'::jsonb,
  'the claim takes EXACTLY the two still subscribed: a withdrawal on this list stops the send, and one on another list does not');
select is(
  (select state from announcements.deliveries
    where letter_id = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1' and person_id = '88888888-8888-4888-8888-888888888888'),
  'pending', 'and the withdrawn reader''s row is left exactly as it was: a claim either takes a row or does not touch it');
-- Said out loud because it is the cost of the rule above, and because a letter that can never finish
-- is a report that is red for ever, which is a report nobody reads. A withdrawn reader's row stays
-- `pending`, so this letter's `pending` count never reaches zero and `drain` never finishes it. Who
-- settles that row is not decided here; see the report.
select is(public.announce_remaining(p_letter => 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1') -> 'pending',
  '1'::jsonb, 'the declined row still counts as pending, so nothing finishes this letter on its own');

-- ---------------------------------------------------------------------------
-- announce_open_claims: unsettled means sending OR unknown, and each row says which it is. Without
-- the unknown ones the report's unknown rule is tested upstream and fed nothing in production.
-- ---------------------------------------------------------------------------
update announcements.deliveries
   set state = 'sending', claimed_at = now(), first_attempted_at = now() - interval '30 minutes'
 where letter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and person_id = '11111111-1111-4111-8111-111111111111';
select is(
  (select jsonb_agg(jsonb_build_array(j ->> 'personId', j ->> 'state') order by j ->> 'personId')
     from public.announce_open_claims(p_letter => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') j),
  '[["11111111-1111-4111-8111-111111111111", "sending"], ["66666666-6666-4666-8666-666666666666", "unknown"]]'::jsonb,
  'both unsettled rows come back, each carrying its own state, and the sent and skipped ones do not');
select is(
  (select array_agg(k order by k) from public.announce_open_claims(p_letter => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') j,
        jsonb_object_keys(j) k where j ->> 'personId' = '11111111-1111-4111-8111-111111111111')::text,
  '{claimedAt,firstAttemptedAt,personId,state}', 'exactly the four camelCase keys the wrapper reads');
select ok(
  (select (j ->> 'claimedAt')::timestamptz > (j ->> 'firstAttemptedAt')::timestamptz
     from public.announce_open_claims(p_letter => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') j
    where j ->> 'personId' = '11111111-1111-4111-8111-111111111111'),
  'the first attempt reads back EARLIER than the latest claim, so a function returning one column under two names fails here');
-- Both of the unknown row's clocks, to the exact instant it was seeded with. Asserting only that its
-- first attempt is non-null would pass a function that returned `claimed_at` under both names.
select is(
  (select array[(j ->> 'claimedAt')::timestamptz, (j ->> 'firstAttemptedAt')::timestamptz]
     from public.announce_open_claims(p_letter => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') j
    where j ->> 'personId' = '66666666-6666-4666-8666-666666666666'),
  array[now() - interval '4 hours', now() - interval '5 hours'],
  'the unknown row reports its own two clocks, an hour apart, exactly as they were stored');
-- The runbook tells an operator to settle a stuck delivery by hand, and a hand-written row may have
-- no claim time at all. It must come back rather than making every read of that letter fail.
insert into announcements.deliveries (letter_id, person_id, state)
  values ('ffffffff-ffff-4fff-8fff-ffffffffffff', '44444444-4444-4444-8444-444444444444', 'unknown');
select is(
  (select jsonb_agg(jsonb_build_array(j ->> 'personId', j -> 'claimedAt'))
     from public.announce_open_claims(p_letter => 'ffffffff-ffff-4fff-8fff-ffffffffffff') j),
  '[["44444444-4444-4444-8444-444444444444", null]]'::jsonb,
  'a hand-written unknown row with no claim time is still returned, with a null claimedAt');

-- ---------------------------------------------------------------------------
-- announce_remaining: two counts, and the last time anything actually went out.
-- ---------------------------------------------------------------------------
insert into announcements.letters (id, list, subject, body, state, created_by, queued_at)
  values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'news', 's', 'b', 'sending', gen_random_uuid(), now());
insert into announcements.deliveries (letter_id, person_id, state) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111', 'pending'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '22222222-2222-4222-8222-222222222222', 'pending'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '33333333-3333-4333-8333-333333333333', 'sending');
select is(public.announce_remaining(p_letter => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') - 'lastSentAt',
  '{"pending": 2, "sending": 1}'::jsonb, 'what is left, counted');
select is(jsonb_typeof(public.announce_remaining(p_letter => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') -> 'pending'), 'number',
  'pending is a JSON number: as a string the runner''s arithmetic goes quietly wrong rather than loudly broken');
select is(jsonb_typeof(public.announce_remaining(p_letter => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') -> 'sending'), 'number',
  'and so is sending');
select is(jsonb_typeof(public.announce_remaining(p_letter => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') -> 'lastSentAt'), 'null',
  'a letter that has never sent answers null, which the report reads as "never sent" and never as the epoch');
select is(
  (select array_agg(k order by k)
     from jsonb_object_keys(public.announce_remaining(p_letter => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')) k)::text,
  '{lastSentAt,pending,sending}', 'exactly the three keys the wrapper copies through');
-- Seeded out of chronological order on purpose: a function answering min, or the first row, fails here.
insert into announcements.deliveries (letter_id, person_id, state, sent_at) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '44444444-4444-4444-8444-444444444444', 'sent', now() - interval '2 hours'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '55555555-5555-4555-8555-555555555555', 'sent', now() - interval '1 hour'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '66666666-6666-4666-8666-666666666666', 'sent', now() - interval '3 hours');
select is((public.announce_remaining(p_letter => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') ->> 'lastSentAt')::timestamptz,
  now() - interval '1 hour', 'the LATEST send, not the earliest and not the first row');

-- ---------------------------------------------------------------------------
-- announce_mark: a skip says why, a send does not invent a reason, and an unknown erases nothing.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select public.announce_mark(p_letter => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      p_person => '11111111-1111-4111-8111-111111111111', p_state => 'skipped', p_provider_id => null)$$,
  'a skip is recorded');
select is(
  (select skip_reason from announcements.deliveries
    where letter_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' and person_id = '11111111-1111-4111-8111-111111111111'),
  'suppressed', 'and says WHY it was skipped, which is the only skip this runner makes');
select ok(
  (select sent_at is null from announcements.deliveries
    where letter_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' and person_id = '11111111-1111-4111-8111-111111111111'),
  'and records no send time, because nothing was sent to them');
select lives_ok(
  $$select public.announce_mark(p_letter => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      p_person => '22222222-2222-4222-8222-222222222222', p_state => 'sent', p_provider_id => 'resend-1')$$,
  'a send is recorded');
select is(
  (select array[state, skip_reason, provider_id]::text from announcements.deliveries
    where letter_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' and person_id = '22222222-2222-4222-8222-222222222222'),
  '{sent,NULL,resend-1}', 'a sent row keeps a null skip reason and carries the provider''s id');
select ok(
  (select sent_at is not null from announcements.deliveries
    where letter_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' and person_id = '22222222-2222-4222-8222-222222222222'),
  'and the time it was sent, which is what lastSentAt reads');
select throws_ok(
  $$select public.announce_mark(p_letter => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      p_person => '33333333-3333-4333-8333-333333333333', p_state => 'delivered', p_provider_id => null)$$,
  '23514', null, 'an outcome the table does not know is refused rather than stored');
-- A send whose mark failed is retried under the SAME key, so the id that came back must survive the
-- row going `unknown`: it is the only thread back from a later bounce to this delivery.
select lives_ok(
  $$select public.announce_mark(p_letter => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      p_person => '22222222-2222-4222-8222-222222222222', p_state => 'unknown', p_provider_id => null)$$,
  'a sent row can go unknown');
select is(
  (select array[state, provider_id]::text from announcements.deliveries
    where letter_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' and person_id = '22222222-2222-4222-8222-222222222222'),
  '{unknown,resend-1}', 'and an unknown mark with no id does not erase the one the send came back with');

-- ---------------------------------------------------------------------------
-- The open set, one letter's state, stopping, and finishing.
-- ---------------------------------------------------------------------------
insert into announcements.letters (id, list, subject, body, state, created_by, queued_at) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'news', 's', 'b', 'draft',   gen_random_uuid(), null),
  ('d0ddddd0-dddd-4ddd-8ddd-dddddddddd01', 'news', 's', 'b', 'stopped', gen_random_uuid(), now()),
  ('d0ddddd0-dddd-4ddd-8ddd-dddddddddd02', 'news', 's', 'b', 'done',    gen_random_uuid(), now());
select is(
  (select array_agg(j ->> 'id' order by j ->> 'id') from public.announce_open_letters() j)::text,
  '{a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1,aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa,bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb,eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee}',
  'only the queued and the sending letters are open: not the draft, the stopped ones or the done one');
select is(
  (select array_agg(k order by k) from public.announce_open_letters() j, jsonb_object_keys(j) k
    where j ->> 'id' = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')::text,
  '{body,id,list,queuedAt,state,subject}', 'exactly the six camelCase keys the wrapper destructures');
select ok(
  (select (j ->> 'queuedAt')::timestamptz is not null and j ->> 'state' = 'sending'
     from public.announce_open_letters() j where j ->> 'id' = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  'queuedAt reads back as a time and state as text, which is what the runner orders and gates on');
select is(public.announce_letter_state(p_letter => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'sending',
  'one letter''s state, read before every send so a Stop is immediate');
select is(public.announce_letter_state(p_letter => '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f'), null::text,
  'and null when there is no such letter');
select lives_ok($$select public.announce_stop(p_member => 'c0ffee02-0000-4000-8000-000000000002', p_letter => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$,
  'a sending letter can be stopped');
select is(public.announce_letter_state(p_letter => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'stopped', 'and is');
-- The `where` clause is the whole point: a blind update would quietly resurrect a stopped letter.
select lives_ok($$select public.announce_finish(p_letter => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$,
  'finishing a stopped letter is not an error');
select is(public.announce_letter_state(p_letter => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'stopped',
  'but it leaves it STOPPED: a Stop that landed mid-run stays a Stop');
select ok((select finished_at is null from announcements.letters where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  'and records no finish');
-- And the other half of that clause. Letter eeee has one `unknown` row, left by the mark above.
-- Without this the row is buried the instant it is written: `announce_remaining` counts an unknown
-- as neither pending nor sending, so the same run reports nothing left and finishes the letter, and
-- the report reads open letters only and never sees it. The rule would name nothing, ever.
select lives_ok($$select public.announce_finish(p_letter => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')$$,
  'finishing a letter with an unknown delivery is not an error either');
select is(public.announce_letter_state(p_letter => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'), 'sending',
  'but it does NOT finish it: unknown means we cannot say whether that person got the letter, so we do not know the letter is done');
select ok((select finished_at is null from announcements.letters where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  'and nothing is recorded as finished');
select lives_ok(
  $$select public.announce_mark(p_letter => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      p_person => '22222222-2222-4222-8222-222222222222', p_state => 'sent', p_provider_id => 'resend-1')$$,
  'a human settles the unknown row');
select lives_ok($$select public.announce_finish(p_letter => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')$$,
  'and then the letter finishes');
select is(public.announce_letter_state(p_letter => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'), 'done', 'and is done');
select ok((select finished_at is not null from announcements.letters where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  'with the time it finished');
select lives_ok($$select public.announce_stop(p_member => 'c0ffee02-0000-4000-8000-000000000002', p_letter => 'd0ddddd0-dddd-4ddd-8ddd-dddddddddd02')$$,
  'stopping a done letter is not an error');
select is(public.announce_letter_state(p_letter => 'd0ddddd0-dddd-4ddd-8ddd-dddddddddd02'), 'done', 'and leaves it done');

-- ---------------------------------------------------------------------------
-- The availability list promised exactly one email. Two things spend it: a letter that has SENT to
-- somebody, and a letter that is LIVE right now. A Stop must cost nothing but the mail already sent,
-- so a letter stopped with nothing sent frees the list again.
-- ---------------------------------------------------------------------------
insert into announcements.letters (id, list, subject, body, created_by, test_sent_at)
  values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'availability', 'One email', 'Body', gen_random_uuid(), now());
-- Two drafts are fine: neither is live and neither has sent, so nothing is spent yet.
select lives_ok(
  $$insert into announcements.letters (id, list, subject, body, created_by, test_sent_at)
    values ('c0cccccc-cccc-4ccc-8ccc-cccccccccc02', 'availability', 'Second draft', 'Body', gen_random_uuid(), now())$$,
  'a second availability DRAFT is allowed, because a draft has neither sent nor started');
select is(public.announce_queue(p_member => 'c0ffee01-0000-4000-8000-000000000001', p_letter => 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 1,
  'the first is queued to its one subscriber');
-- Without the live arm of the trigger both of these would queue, and the refusal would land days
-- later inside the send path: the first sends, the next run picks the second, and its queued ->
-- sending transition raises, so the announce job fails every day until a human stops it.
select throws_ok(
  $$select public.announce_queue(p_member => 'c0ffee01-0000-4000-8000-000000000001', p_letter => 'c0cccccc-cccc-4ccc-8ccc-cccccccccc02')$$,
  'P0001', null, 'the second cannot be queued while the first is live, and the refusal lands HERE, where the console can show it');
select lives_ok($$select public.announce_finish(p_letter => 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')$$,
  'the first letter is finished having sent nothing');
select is(public.announce_letter_state(p_letter => 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 'done', 'and is done');
select is(public.announce_queue(p_member => 'c0ffee01-0000-4000-8000-000000000001', p_letter => 'c0cccccc-cccc-4ccc-8ccc-cccccccccc02'), 1,
  'a DONE letter that sent nothing does not spend the list: the one promised email never went out');
select lives_ok($$select public.announce_stop(p_member => 'c0ffee02-0000-4000-8000-000000000002', p_letter => 'c0cccccc-cccc-4ccc-8ccc-cccccccccc02')$$,
  'the second is stopped, still having sent nothing');
select lives_ok(
  $$insert into announcements.letters (id, list, subject, body, created_by, test_sent_at)
    values ('c0cccccc-cccc-4ccc-8ccc-cccccccccc03', 'availability', 'Third', 'Body', gen_random_uuid(), now())$$,
  'so a third may be written');
select is(public.announce_queue(p_member => 'c0ffee01-0000-4000-8000-000000000001', p_letter => 'c0cccccc-cccc-4ccc-8ccc-cccccccccc03'), 1,
  'and queued: a Stop before anything went out costs the operator nothing');
select lives_ok(
  $$select public.announce_mark(p_letter => 'c0cccccc-cccc-4ccc-8ccc-cccccccccc03',
      p_person => '55555555-5555-4555-8555-555555555555', p_state => 'sent', p_provider_id => 'resend-2')$$,
  'now one person is actually mailed');
select lives_ok($$select public.announce_stop(p_member => 'c0ffee02-0000-4000-8000-000000000002', p_letter => 'c0cccccc-cccc-4ccc-8ccc-cccccccccc03')$$,
  'and that letter is stopped afterwards');
-- Straight at the table, as the owner, bypassing every grant: the console's own check is easy to
-- bypass and a trigger that only agrees with it is decoration.
select throws_ok(
  $$insert into announcements.letters (id, list, subject, body, created_by)
    values ('c0cccccc-cccc-4ccc-8ccc-cccccccccc04', 'availability', 'Fourth', 'Body', gen_random_uuid())$$,
  'P0001', null, 'but once one person has been mailed the list is spent for good, and the DATABASE says so');

-- ---------------------------------------------------------------------------
-- announce_suppressed and announce_webhook: one place decides what a bounce means.
-- ---------------------------------------------------------------------------
select is(public.announce_webhook(p_svix_id => 'msg_1', p_kind => 'email.bounced', p_email => ' Bo@Example.IN ', p_at => now()),
  'recorded', 'a bounce is recorded');
select is(public.announce_suppressed(p_email => 'BO@example.in'), 'all',
  'and suppresses the address everywhere, however either is written');
select is(public.announce_webhook(p_svix_id => 'msg_1', p_kind => 'email.bounced', p_email => 'bo@example.in', p_at => now()),
  'duplicate', 'a replayed svix id changes nothing');
select is(public.announce_webhook(p_svix_id => 'msg_2', p_kind => 'email.complained', p_email => 'bo@example.in', p_at => now()),
  'recorded', 'a complaint from the same address is recorded');
select is(public.announce_suppressed(p_email => 'bo@example.in'), 'all',
  'and must never widen the existing suppression down to list: a hard-bounced address that later complains stays fully suppressed');
select is(public.announce_webhook(p_svix_id => 'msg_3', p_kind => 'email.complained', p_email => 'asha@example.in', p_at => now()),
  'recorded', 'a complaint from a subscriber');
select is((select scope from announcements.suppressions where email = 'asha@example.in'), 'list',
  'suppresses their list mail');
select is(
  (select withdraw_reason from subscriptions.consents c join subscriptions.people p on p.id = c.person_id
    where p.email = 'asha@example.in' and c.list = 'news'),
  'did not sign up', 'and withdraws them from every list they were on: someone who marked us spam is not a subscriber');
select is(public.announce_suppressed(p_email => 'nobody@example.in'), null::text, 'an address nobody reported is not suppressed');
-- Soft failures: two are recorded and left alone; the third suppresses list mail.
select is(public.announce_webhook(p_svix_id => 'msg_4', p_kind => 'email.delivery_delayed', p_email => 'cy@example.in', p_at => now()),
  'recorded', 'one delay');
select is(public.announce_webhook(p_svix_id => 'msg_5', p_kind => 'email.delivery_delayed', p_email => 'cy@example.in', p_at => now()),
  'recorded', 'two delays');
select is(public.announce_suppressed(p_email => 'cy@example.in'), null::text, 'two delays suppress nobody');
select is(public.announce_webhook(p_svix_id => 'msg_6', p_kind => 'email.delivery_delayed', p_email => 'di@example.in', p_at => now()),
  'recorded', 'a delay for somebody else');
select is(public.announce_suppressed(p_email => 'cy@example.in'), null::text, 'which does not count against the first address');
select is(public.announce_webhook(p_svix_id => 'msg_7', p_kind => 'email.delivery_delayed', p_email => 'cy@example.in', p_at => now()),
  'recorded', 'a third delay for the same address, all three within the same day');
-- One slow receiving host retrying ONE message three times in an hour is three events and one bad
-- night. The store keeps no message id, so events cannot be told apart; days can.
select is(public.announce_suppressed(p_email => 'cy@example.in'), null::text,
  'three delays in one night do NOT suppress a live subscriber, because they may all be one message');
update announcements.webhook_events set received_at = now() - interval '2 days' where svix_id = 'msg_4';
update announcements.webhook_events set received_at = now() - interval '1 day'  where svix_id = 'msg_5';
select is(public.announce_webhook(p_svix_id => 'msg_12', p_kind => 'email.delivery_delayed', p_email => 'cy@example.in', p_at => now()),
  'recorded', 'but spread across three different days');
select is(public.announce_suppressed(p_email => 'cy@example.in'), 'list', 'three bad nights do suppress list mail');
-- Resend lifting its own suppression must never undo one an operator set by hand.
insert into announcements.suppressions (email, scope, reason, source) values ('fay@example.in', 'list', 'asked us to', 'operator');
select is(public.announce_webhook(p_svix_id => 'msg_8', p_kind => 'suppression.removed', p_email => 'fay@example.in', p_at => now()),
  'recorded', 'Resend lifts a suppression');
select is(public.announce_suppressed(p_email => 'fay@example.in'), 'list', 'but an operator''s own suppression survives it');
select is(public.announce_webhook(p_svix_id => 'msg_9', p_kind => 'suppression.added', p_email => 'el@example.in', p_at => now()),
  'recorded', 'a suppression Resend added');
select is(public.announce_suppressed(p_email => 'el@example.in'), 'list', 'is recorded as list scope');
select is(public.announce_webhook(p_svix_id => 'msg_10', p_kind => 'suppression.removed', p_email => 'el@example.in', p_at => now()),
  'recorded', 'and Resend may lift the one it added');
select is(public.announce_suppressed(p_email => 'el@example.in'), null::text, 'which leaves nothing behind');
select is(public.announce_webhook(p_svix_id => 'msg_11', p_kind => 'email.sent', p_email => 'asha@example.in', p_at => now()),
  'recorded', 'an event that changes nobody''s standing is still recorded once, so a replay of it is still a duplicate');
select is(
  (select array[count(*)::int, count(distinct date_trunc('day', received_at))::int]
     from announcements.webhook_events where email = 'cy@example.in' and kind = 'email.delivery_delayed'),
  array[4, 3], 'every event is kept once, and it is the DAYS among them that the threshold counts');

-- ---------------------------------------------------------------------------
-- Last: a reader with no business here is REFUSED, not answered with an empty set. An empty set is
-- what a working deny and a broken grant look like alike.
--
-- The role is switched inside a `do` block and the verdict reported afterwards, so NO pgTAP function
-- is ever called under a switched role. `ok()` writes to the temporary sequence `plan()` created as
-- the owner, and a role that could not write it would ABORT this file rather than fail one
-- assertion — taking every other result down with it, which is a broken suite rather than a result.
-- These are also last, so nothing after them depends on this working.
-- ---------------------------------------------------------------------------
create temp table announce_denials (who text, fn text, code text);
do $$
declare v_code text;
begin
  set local role anon;
  begin
    perform * from public.announce_open_letters();
    v_code := 'no error at all';
  exception when others then v_code := sqlstate;
  end;
  reset role;
  insert into announce_denials values ('anon', 'announce_open_letters', v_code);

  set local role anon;
  begin
    perform public.announce_remaining(p_letter => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
    v_code := 'no error at all';
  exception when others then v_code := sqlstate;
  end;
  reset role;
  insert into announce_denials values ('anon', 'announce_remaining', v_code);

  set local role authenticated;
  begin
    perform * from public.announce_open_letters();
    v_code := 'no error at all';
  exception when others then v_code := sqlstate;
  end;
  reset role;
  insert into announce_denials values ('authenticated', 'announce_open_letters', v_code);
end $$;
select is((select code from announce_denials where who = 'anon' and fn = 'announce_open_letters'), '42501',
  'anon calling announce_open_letters is refused, not handed an empty answer');
select is((select code from announce_denials where who = 'anon' and fn = 'announce_remaining'), '42501',
  'and so is anon asking what is left');
select is((select code from announce_denials where who = 'authenticated' and fn = 'announce_open_letters'), '42501',
  'a signed-in traveller is refused too');

select * from finish();
rollback;
