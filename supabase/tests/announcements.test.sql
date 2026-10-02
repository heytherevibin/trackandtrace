begin;
create extension if not exists pgtap with schema extensions;
select plan(96);

-- Announcements (06-B). The schema is private: nothing reaches it except through the
-- security-definer functions, and only service_role may call those.
--
-- Written against `src/services/announcements/store.ts` and `drain-store.ts`, which are the
-- contract: the TypeScript wrappers destructure the camelCase keys asserted below, and a snake_case
-- key reads to them as a missing field.
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
insert into announcements.letters (id, list, subject, body, created_by)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'news', 'Subject', 'Body', gen_random_uuid());
select is(public.announce_queue('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 3,
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
select throws_ok(
  $$select public.announce_queue('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$,
  'P0001', null, 'a letter that is already queued cannot be queued again, so nobody is given a second delivery');

-- ---------------------------------------------------------------------------
-- announce_claim: the letter's transition, the two clocks, and both edges of the window.
-- ---------------------------------------------------------------------------
delete from announcements.deliveries
 where letter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and person_id = '66666666-6666-4666-8666-666666666666';
select is(
  (select jsonb_agg(j order by j ->> 'personId') from public.announce_claim('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 1) j),
  '[{"email": "asha@example.in", "personId": "11111111-1111-4111-8111-111111111111"}]'::jsonb,
  'a claim answers the person and the address, under the keys the sender destructures');
select is((select state from announcements.letters where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'sending',
  'claiming the first batch moves the letter from queued to sending: nothing else knows work has started');
select ok(
  (select claimed_at is not null and claimed_at = first_attempted_at from announcements.deliveries
    where letter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and person_id = '11111111-1111-4111-8111-111111111111'),
  'the first claim stamps both clocks');
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
  (select count(*)::int from public.announce_claim('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 10)),
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
  (select count(*)::int from public.announce_claim('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 10)),
  0, 'nothing is re-claimed inside the 15-minute floor, so a run cannot take a row it is still sending');

-- The ceiling is STRICT: the runner calls a row first attempted exactly 24 hours ago stale, so the
-- claim must refuse it. Inclusive on both sides would make the same row retryable and stale at once,
-- and a strictly daily job lands exactly on that boundary.
update announcements.deliveries
   set claimed_at = now() - interval '1 hour', first_attempted_at = now() - interval '24 hours'
 where letter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and person_id = '11111111-1111-4111-8111-111111111111';
select is(
  (select count(*)::int from public.announce_claim('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 10)),
  0, 'a row first attempted exactly 24 hours ago is not re-claimed');
update announcements.deliveries
   set first_attempted_at = now() - interval '24 hours' + interval '1 second'
 where letter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and person_id = '11111111-1111-4111-8111-111111111111';
select is(
  (select jsonb_agg(j ->> 'personId') from public.announce_claim('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 10) j),
  '["11111111-1111-4111-8111-111111111111"]'::jsonb,
  'one second inside the window still is, so the boundary sits where the runner believes it does');

-- A sending row with no first attempt cannot be shown to be inside the window; the runner calls it
-- stale, so the claim must not retry it either.
update announcements.deliveries
   set claimed_at = now() - interval '1 hour', first_attempted_at = null
 where letter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and person_id = '11111111-1111-4111-8111-111111111111';
select is(
  (select count(*)::int from public.announce_claim('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 10)),
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
  (select count(*)::int from public.announce_claim('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 10)),
  0, 'sent, skipped and unknown rows are never claimed again');
-- Two runs taking the same row would send one person the letter twice, and no single-session test
-- can observe a lock. The only trace of it available here is the claim's own text.
select matches(
  (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'announce_claim'),
  'skip locked', 'the claim takes its rows with `for update skip locked`, which is what makes two concurrent runs safe');

-- ---------------------------------------------------------------------------
-- announce_open_claims: unsettled means sending OR unknown, and each row says which it is. Without
-- the unknown ones the report's unknown rule is tested upstream and fed nothing in production.
-- ---------------------------------------------------------------------------
update announcements.deliveries
   set state = 'sending', claimed_at = now(), first_attempted_at = now() - interval '30 minutes'
 where letter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and person_id = '11111111-1111-4111-8111-111111111111';
select is(
  (select jsonb_agg(jsonb_build_array(j ->> 'personId', j ->> 'state') order by j ->> 'personId')
     from public.announce_open_claims('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') j),
  '[["11111111-1111-4111-8111-111111111111", "sending"], ["66666666-6666-4666-8666-666666666666", "unknown"]]'::jsonb,
  'both unsettled rows come back, each carrying its own state, and the sent and skipped ones do not');
select is(
  (select array_agg(k order by k) from public.announce_open_claims('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') j,
        jsonb_object_keys(j) k where j ->> 'personId' = '11111111-1111-4111-8111-111111111111')::text,
  '{claimedAt,firstAttemptedAt,personId,state}', 'exactly the four camelCase keys the wrapper reads');
select ok(
  (select (j ->> 'claimedAt')::timestamptz > (j ->> 'firstAttemptedAt')::timestamptz
     from public.announce_open_claims('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') j
    where j ->> 'personId' = '11111111-1111-4111-8111-111111111111'),
  'the first attempt reads back EARLIER than the latest claim, so a function returning one column under two names fails here');
select ok(
  (select (j ->> 'firstAttemptedAt') is not null
     from public.announce_open_claims('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') j
    where j ->> 'personId' = '66666666-6666-4666-8666-666666666666'),
  'the unknown row carries its own first attempt too');

-- ---------------------------------------------------------------------------
-- announce_remaining: two counts, and the last time anything actually went out.
-- ---------------------------------------------------------------------------
insert into announcements.letters (id, list, subject, body, state, created_by, queued_at)
  values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'news', 's', 'b', 'sending', gen_random_uuid(), now());
insert into announcements.deliveries (letter_id, person_id, state) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111', 'pending'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '22222222-2222-4222-8222-222222222222', 'pending'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '33333333-3333-4333-8333-333333333333', 'sending');
select is(public.announce_remaining('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') - 'lastSentAt',
  '{"pending": 2, "sending": 1}'::jsonb, 'what is left, counted');
select is(jsonb_typeof(public.announce_remaining('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') -> 'pending'), 'number',
  'pending is a JSON number: as a string the runner''s arithmetic goes quietly wrong rather than loudly broken');
select is(jsonb_typeof(public.announce_remaining('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') -> 'sending'), 'number',
  'and so is sending');
select is(jsonb_typeof(public.announce_remaining('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') -> 'lastSentAt'), 'null',
  'a letter that has never sent answers null, which the report reads as "never sent" and never as the epoch');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.announce_remaining('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')) k)::text,
  '{lastSentAt,pending,sending}', 'exactly the three keys the wrapper copies through');
-- Seeded out of chronological order on purpose: a function answering min, or the first row, fails here.
insert into announcements.deliveries (letter_id, person_id, state, sent_at) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '44444444-4444-4444-8444-444444444444', 'sent', now() - interval '2 hours'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '55555555-5555-4555-8555-555555555555', 'sent', now() - interval '1 hour'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '66666666-6666-4666-8666-666666666666', 'sent', now() - interval '3 hours');
select is((public.announce_remaining('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') ->> 'lastSentAt')::timestamptz,
  now() - interval '1 hour', 'the LATEST send, not the earliest and not the first row');
select is(jsonb_typeof(public.announce_remaining('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') -> 'pending'), 'number',
  'and the counts are still numbers beside it');

-- ---------------------------------------------------------------------------
-- announce_mark: a skip says why, and a send does not invent a reason.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select public.announce_mark('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111', 'skipped', null)$$,
  'a skip is recorded');
select is(
  (select skip_reason from announcements.deliveries
    where letter_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' and person_id = '11111111-1111-4111-8111-111111111111'),
  'suppressed', 'and says WHY it was skipped, which is the only skip this runner makes');
select lives_ok(
  $$select public.announce_mark('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '22222222-2222-4222-8222-222222222222', 'sent', 'resend-1')$$,
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
  $$select public.announce_mark('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '33333333-3333-4333-8333-333333333333', 'delivered', null)$$,
  '23514', null, 'an outcome the table does not know is refused rather than stored');

-- ---------------------------------------------------------------------------
-- The open set, one letter's state, stopping, and finishing.
-- ---------------------------------------------------------------------------
insert into announcements.letters (id, list, subject, body, state, created_by, queued_at) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'news', 's', 'b', 'draft',   gen_random_uuid(), null),
  ('d0ddddd0-dddd-4ddd-8ddd-dddddddddd01', 'news', 's', 'b', 'stopped', gen_random_uuid(), now()),
  ('d0ddddd0-dddd-4ddd-8ddd-dddddddddd02', 'news', 's', 'b', 'done',    gen_random_uuid(), now());
select is(
  (select array_agg(j ->> 'id' order by j ->> 'id') from public.announce_open_letters() j)::text,
  '{aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa,bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb,eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee}',
  'only the queued and the sending letters are open: not the draft, the stopped one or the done one');
select is(
  (select array_agg(k order by k) from public.announce_open_letters() j, jsonb_object_keys(j) k
    where j ->> 'id' = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')::text,
  '{body,id,list,queuedAt,state,subject}', 'exactly the six camelCase keys the wrapper destructures');
select ok(
  (select (j ->> 'queuedAt')::timestamptz is not null and j ->> 'state' = 'sending'
     from public.announce_open_letters() j where j ->> 'id' = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  'queuedAt reads back as a time and state as text, which is what the runner orders and gates on');
select is(public.announce_letter_state('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'sending',
  'one letter''s state, read before every send so a Stop is immediate');
select is(public.announce_letter_state('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f'), null::text,
  'and null when there is no such letter');
select lives_ok($$select public.announce_stop('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$, 'a sending letter can be stopped');
select is(public.announce_letter_state('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'stopped', 'and is');
-- The `where` clause is the whole point: a blind update would quietly resurrect a stopped letter.
select lives_ok($$select public.announce_finish('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$,
  'finishing a stopped letter is not an error');
select is(public.announce_letter_state('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'stopped',
  'but it leaves it STOPPED: a Stop that landed mid-run stays a Stop');
select ok((select finished_at is null from announcements.letters where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  'and records no finish');
select lives_ok($$select public.announce_finish('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')$$, 'a sending letter does finish');
select is(public.announce_letter_state('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'), 'done', 'and is done');
select ok((select finished_at is not null from announcements.letters where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  'with the time it finished');
select lives_ok($$select public.announce_stop('d0ddddd0-dddd-4ddd-8ddd-dddddddddd02')$$, 'stopping a done letter is not an error');
select is(public.announce_letter_state('d0ddddd0-dddd-4ddd-8ddd-dddddddddd02'), 'done', 'and leaves it done');

-- ---------------------------------------------------------------------------
-- The availability list is spent by a SEND, not by a letter. A Stop must cost nothing but the mail
-- already sent, so an operator who queues it, spots a typo in the first line and stops it keeps
-- their one use of the list.
-- ---------------------------------------------------------------------------
insert into announcements.letters (id, list, subject, body, created_by)
  values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'availability', 'One email', 'Body', gen_random_uuid());
select is(public.announce_queue('cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 1, 'the availability letter is queued to its one subscriber');
select lives_ok($$select public.announce_stop('cccccccc-cccc-4ccc-8ccc-cccccccccccc')$$, 'and stopped before anything went out');
select lives_ok(
  $$insert into announcements.letters (id, list, subject, body, created_by)
    values ('c0cccccc-cccc-4ccc-8ccc-cccccccccc02', 'availability', 'Second try', 'Body', gen_random_uuid())$$,
  'a second availability letter is still allowed, because the promise of one email was never kept');
delete from announcements.letters where id = 'c0cccccc-cccc-4ccc-8ccc-cccccccccc02';
select lives_ok(
  $$select public.announce_mark('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '55555555-5555-4555-8555-555555555555', 'sent', 'resend-2')$$,
  'now one delivery actually goes out');
-- Straight at the table, as the owner, bypassing every grant: the console's own check is easy to
-- bypass and a trigger that only agrees with it is decoration.
select throws_ok(
  $$insert into announcements.letters (id, list, subject, body, created_by)
    values ('c0cccccc-cccc-4ccc-8ccc-cccccccccc03', 'availability', 'Third', 'Body', gen_random_uuid())$$,
  'P0001', null, 'once one person has been mailed, the availability list is spent, and the DATABASE says so');

-- ---------------------------------------------------------------------------
-- announce_suppressed and announce_webhook: one place decides what a bounce means.
-- ---------------------------------------------------------------------------
select is(public.announce_webhook('msg_1', 'email.bounced', ' Bo@Example.IN ', now()), 'recorded', 'a bounce is recorded');
select is(public.announce_suppressed('BO@example.in'), 'all', 'and suppresses the address everywhere, however either is written');
select is(public.announce_webhook('msg_1', 'email.bounced', 'bo@example.in', now()), 'duplicate', 'a replayed svix id changes nothing');
select is(public.announce_webhook('msg_2', 'email.complained', 'bo@example.in', now()), 'recorded', 'a complaint from the same address is recorded');
select is(public.announce_suppressed('bo@example.in'), 'all',
  'and must never widen the existing suppression down to list: a hard-bounced address that later complains stays fully suppressed');
select is(public.announce_webhook('msg_3', 'email.complained', 'asha@example.in', now()), 'recorded', 'a complaint from a subscriber');
select is((select scope from announcements.suppressions where email = 'asha@example.in'), 'list', 'suppresses their list mail');
select is(
  (select withdraw_reason from subscriptions.consents c join subscriptions.people p on p.id = c.person_id
    where p.email = 'asha@example.in' and c.list = 'news'),
  'did not sign up', 'and withdraws them from every list they were on: someone who marked us spam is not a subscriber');
select is(public.announce_suppressed('nobody@example.in'), null::text, 'an address nobody reported is not suppressed');
-- Soft failures: two are recorded and left alone; the third suppresses list mail.
select is(public.announce_webhook('msg_4', 'email.delivery_delayed', 'cy@example.in', now()), 'recorded', 'one delay');
select is(public.announce_webhook('msg_5', 'email.delivery_delayed', 'cy@example.in', now()), 'recorded', 'two delays');
select is(public.announce_suppressed('cy@example.in'), null::text, 'two delays suppress nobody');
select is(public.announce_webhook('msg_6', 'email.delivery_delayed', 'di@example.in', now()), 'recorded', 'a delay for somebody else');
select is(public.announce_suppressed('cy@example.in'), null::text, 'which does not count against the first address');
select is(public.announce_webhook('msg_7', 'email.delivery_delayed', 'cy@example.in', now()), 'recorded', 'the third delay for the same address');
select is(public.announce_suppressed('cy@example.in'), 'list', 'suppresses list mail');
-- Resend lifting its own suppression must never undo one an operator set by hand.
insert into announcements.suppressions (email, scope, reason, source) values ('fay@example.in', 'list', 'asked us to', 'operator');
select is(public.announce_webhook('msg_8', 'suppression.removed', 'fay@example.in', now()), 'recorded', 'Resend lifts a suppression');
select is(public.announce_suppressed('fay@example.in'), 'list', 'but an operator''s own suppression survives it');
select is(public.announce_webhook('msg_9', 'suppression.added', 'el@example.in', now()), 'recorded', 'a suppression Resend added');
select is(public.announce_suppressed('el@example.in'), 'list', 'is recorded as list scope');
select is(public.announce_webhook('msg_10', 'suppression.removed', 'el@example.in', now()), 'recorded', 'and Resend may lift the one it added');
select is(public.announce_suppressed('el@example.in'), null::text, 'which leaves nothing behind');
select is(public.announce_webhook('msg_11', 'email.sent', 'asha@example.in', now()), 'recorded',
  'an event that changes nobody''s standing is still recorded once, so a replay of it is still a duplicate');
select is(
  (select count(*)::int from announcements.webhook_events where email = 'cy@example.in' and kind = 'email.delivery_delayed'),
  3, 'every event is kept once, which is what the 30-day soft count is counted over');

-- ---------------------------------------------------------------------------
-- Last: a reader with no business here is REFUSED, not answered with an empty set. An empty set is
-- what a working deny and a broken grant look like alike.
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok($$select * from public.announce_open_letters()$$, '42501', null,
  'anon calling announce_open_letters is refused, not handed an empty answer');
select throws_ok($$select public.announce_remaining('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')$$, '42501', null,
  'and so is anon asking what is left');
set local role authenticated;
select throws_ok($$select * from public.announce_open_letters()$$, '42501', null,
  'a signed-in traveller is refused too');
reset role;

select * from finish();
rollback;
