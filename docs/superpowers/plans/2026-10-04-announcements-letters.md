# Announcements (07) — the console's Letters pages: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Owner or Admin can write a letter, send themselves a test, queue it, watch it drain and stop it, from `admin.trakline.in/announcements`, exactly as sheet 23 draws it.

**Architecture:** A thin console layer over the merged backend (PR #115). New `public.console_letter*` functions are granted to `authenticated`, re-check the Admin floor with `console.require_role('admin')`, call the existing `announce_queue` / `announce_stop`, and write the audit row in the same transaction. Pages read through the member's own session (`createConsoleDb()`), routes follow module 04's shape, and every string is in `consoleMessages.announcements`.

**Tech stack:** Next.js 16 app router (read `node_modules/next/dist/docs/` before writing a page or route), Supabase Postgres + pgTAP, Base UI, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-announcements-design.md` (§5). **Sheets:** `docs/design/sheets/console/ConsoleAnnouncements.dc.html` and `ConsoleAnnouncementsPhone.dc.html`, approved 4 Oct 2026; the review decisions are in that folder's `README.md` under B4. Where a sheet and this plan disagree on markup or copy, **the sheet wins**; where they disagree on behaviour, stop and ask.

## Global constraints

- **Transcribe the sheets 1:1.** Structure, copy and spacing come from the board; classes come from the app's own components (`src/components/ui`) and utilities, never from `industry.css`. A deviation for accessibility is written down where it is made, as `role-picker.tsx` does.
- **Scope: Letters only.** Suppressions (its tab, Reveal, Lift) is the next PR with its own plan. Until then the tab row is **not rendered**: a tab that leads nowhere is worse than none.
- TDD: the failing test first, watched failing for the right reason. `npm run check` is the whole gate; a subset is not the gate. `npm run db:test` for SQL.
- Component tests live in `tests/unit/`. `tests/integration/` collects no `.tsx` (see `checks-that-measure-nothing`).
- No provider is named anywhere in the console's copy: it is "the mail service".
- A message the member must read as written is never thrown as `SOURCE_UNAVAILABLE` or `INTERNAL`: `consoleApiMessage` replaces both with one generic sentence.
- Never state a frequency for the news list in product copy.
- Conventional commits, **no `Co-Authored-By` trailer**. Files under 500 lines (`src/types/supabase.ts` is exempt). No `any`. `@/` imports only.
- Migrations reach production only by the owner's `npm run db:push`. **The push must precede the deploy**: the pages call functions that do not exist until it lands, and would draw "Letters unavailable".
- Never `supabase stop` / `start` / `db:reset`. Apply locally with `npx supabase@2.117.0 migration up --local`.
- A function's signature is changed by `drop function if exists` first, never by `create or replace` alone (the header of `20261002085215_announcements.sql` says why).

## Rulings made while planning

1. **Routes.** `/announcements` (list), `/announcements/new` (compose), `/announcements/[id]` (a draft opens in compose; anything else opens its detail). Paths stay readable, as decided on 2026-09-28.
2. **The role floor is in the database.** `announce_*` take a `p_member` and trust the caller; the console must not. Every new function starts with `console.require_role('admin')` and is granted to `authenticated` only.
3. **Audit category `messages`** (already in `AUDIT_CATEGORIES`). Actions: `Sent a test letter`, `Queued a letter`, `Stopped a letter`. The target is the letter's subject. Saving a draft is not audited: nothing has left the building.
4. **The dialogs are plain confirms, not Confirm it's you.** The sheet draws `role="alertdialog"` with two buttons and no reason field, so there is no tap and the audit row's reason is null.
5. **Changing a tested draft clears its test.** If the list, subject or body differs from what was tested, `test_sent_at` and `test_sent_to` go back to null. The test is proof of *this* text.
6. **A dirty form cannot be tested or queued.** Both act on the saved draft, so while the form has unsaved changes both buttons are disabled with the reason "Save your changes first." (undrawn; the sheet shows only a saved draft).
7. **The test send** goes to the member's own address, with the letter's exact subject and `letterText(...)` so it reads as a reader's will. Its unsubscribe link points at `/unsubscribe` with no signature, which answers "invalid link": a test must never carry a link that unsubscribes a real person. It carries no `List-Unsubscribe` headers. It is `transactional` mail, counted with `countSent`, never gated.
8. **Queue refuses an empty list** (`nobody to send to`): a letter queued to nobody would finish at once and spend the Availability list.
9. **Estimates** are `round(waiting / 40)` days, never less than one while anything waits. Rounding, not a ceiling, is what the sheet's own samples do (165 waiting is "about 4 days", 431 is "about 11"), and the copy says "about". "Ahead" is every other open letter's waiting count, summed. The finish date is today in IST plus those days. One day reads "About 1 day at 40 a day".
10. **"Today"** on a sending letter is that letter's deliveries sent since 00:00 UTC, which is the allowance's own day.
11. **The list is drawn twice**, a table from `sm` up and cards below it, each `display: none` at the other width. The card is not the table's stacked form (the state sits top right), so `table-stack` cannot draw it.
12. **A Done letter always shows Unknown 0.** `announce_finish` refuses while any delivery is unknown, so the sheet's Done sample (Unknown 1) cannot occur. The page draws what the database says; the "may or may not have gone" clause appears only when the count is above zero.
13. **Queued** is built from the README note: label "Queued", the busy lamp, `Sent 0 · Skipped 0 · Unknown 0 of N`, "Starts when the letter ahead finishes", and Stop.
14. **Two lamps are new.** `Led` gains `variant="half" | "ringed"` for Sending and Stopped; Draft is the hollow default and Done is `lit`.

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261004090000_console_letters.sql` (create) | The seven console functions and their grants |
| `supabase/tests/console_letters.test.sql` (create) | pgTAP for all seven |
| `src/types/supabase.ts` (regenerate) | `npm run db:types` |
| `src/console/announcements/letters.ts` (create) | Types, zod shapes, the reads and writes, error mapping |
| `src/console/announcements/estimate.ts` (create) | Pure: days, finish date, letters ahead, percentages |
| `src/console/announcements/test-send.ts` (create) | Sends the test, then records it |
| `src/console/announcements/routes.ts` (create) | Request body schemas |
| `src/console/announcements/letters-client.ts` (create) | The four network calls, for the client components |
| `src/console/announcements/letters-plate.tsx` (create) | The list: table and cards |
| `src/console/announcements/compose-form.tsx` (create) | Compose at `sm` and up: form, test send, queue |
| `src/console/announcements/compose-readonly.tsx` (create) | Compose below `sm`: the read-only draft |
| `src/console/announcements/queue-dialog.tsx` (create) | "Queue this letter?" |
| `src/console/announcements/detail-plates.tsx` (create) | Progress and Letter plates |
| `src/console/announcements/stop-button.tsx` (create) | Stop and "Stop sending?" |
| `src/console/messages/en-IN/announcements.ts` (create), `src/console/messages/index.ts` (modify) | Every string |
| `src/app/console/announcements/page.tsx`, `new/page.tsx`, `[id]/page.tsx` (create) | The three pages |
| `src/app/console/api/announcements/{save,test,queue,stop}/route.ts` (create) | The four routes |
| `src/components/ui/led.tsx`, `src/components/ui/confirm-dialog.tsx` (modify) | `variant`; `phoneSheet` |
| `src/console/nav.ts` (modify) | 07 becomes `built: true` |
| `tests/unit/console/announcements/*`, `tests/integration/console/announcements-routes.test.ts`, `tests/e2e/console-auth/announcements.spec.ts` (create) | Tests |

---

## Task 1: The console's database layer

**Files:**
- Create: `supabase/migrations/20261004090000_console_letters.sql`
- Test: `supabase/tests/console_letters.test.sql`

**Interfaces:**
- Consumes: `console.require_role(console.member_role) returns console.members`; `console.write_audit(p_environment, p_actor, p_actor_name, p_actor_role, p_key_id, p_session_label, p_category, p_action, p_target, p_reason, p_result, p_address_hash, p_before, p_after)`; `public.announce_queue(p_letter uuid, p_member uuid) returns int`; `public.announce_stop(p_letter uuid, p_member uuid)`.
- Produces (all `security definer`, `search_path = ''`, granted to `authenticated` only):
  - `public.console_letters() returns jsonb` — an array, newest first, of `{id, list, subject, state, total, sent, skipped, unknown, waiting, createdAt, queuedAt, stoppedAt, finishedAt}`.
  - `public.console_letter(p_letter uuid) returns jsonb` — the same keys plus `{body, testSentAt, testSentTo, queuedBy, stoppedBy, sentToday}`, or null.
  - `public.console_letter_lists() returns jsonb` — `{news, availability, availabilitySpent, availabilitySpentAt}`.
  - `public.console_save_letter(p_list text, p_subject text, p_body text, p_letter uuid default null) returns uuid` — omit `p_letter` for a new draft.
  - `public.console_letter_tested(p_environment text, p_letter uuid) returns void`.
  - `public.console_queue_letter(p_environment text, p_letter uuid) returns int`.
  - `public.console_stop_letter(p_environment text, p_letter uuid) returns void`.

- [ ] **Step 1: Write the failing pgTAP file**

Create `supabase/tests/console_letters.test.sql`:

```sql
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run db:test`
Expected: `console_letters.test.sql` fails at its first assertion with `function public.console_letters() does not exist`. The other 22 files still pass.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261004090000_console_letters.sql`:

```sql
-- The console's layer over announcements (07, PR 3a). `20261002085215_announcements.sql` gave the
-- send job its functions: service_role, with the acting member passed as an argument and trusted.
-- A browser must not be trusted that way, so these seven are what a console member's OWN session
-- calls. Each re-checks the Admin floor first (07 is Owner and Admin, per the role matrix), takes
-- the member from the session rather than from an argument, and writes its audit row in the same
-- transaction as the change — or raises and does neither.
--
-- KEYS ARE camelCase, as in the announcements file: `src/console/announcements/letters.ts`
-- destructures them, and a snake_case key reads there as a missing field.
--
-- CHANGING A SIGNATURE NEEDS `drop function if exists` FOR THE OLD ONE FIRST. The pgTAP file counts
-- these functions for exactly that reason.

-- Every letter, newest first, with its running counts. `waiting` is pending plus sending: on an open
-- letter that is what is still to go, and on a stopped one it is what was never reached.
create or replace function public.console_letters() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform console.require_role('admin');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', l.id, 'list', l.list, 'subject', l.subject, 'state', l.state,
             'total', coalesce(l.recipients_total, 0),
             'sent', c.sent, 'skipped', c.skipped, 'unknown', c.unknown, 'waiting', c.waiting,
             'createdAt', l.created_at, 'queuedAt', l.queued_at,
             'stoppedAt', l.stopped_at, 'finishedAt', l.finished_at)
           order by l.created_at desc)
      from announcements.letters l
     cross join lateral (
       select (count(*) filter (where d.state = 'sent'))::int                   as sent,
              (count(*) filter (where d.state = 'skipped'))::int                as skipped,
              (count(*) filter (where d.state = 'unknown'))::int                as unknown,
              (count(*) filter (where d.state in ('pending', 'sending')))::int  as waiting
         from announcements.deliveries d where d.letter_id = l.id) c
  ), '[]'::jsonb);
end $$;

-- One letter, or null. The names are the members' as they are NOW; a member since removed reads as
-- null and the page says so, rather than this function inventing a name.
-- `sentToday` is measured from 00:00 UTC because that is when the mail allowance's day turns.
create or replace function public.console_letter(p_letter uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform console.require_role('admin');
  return (
    select jsonb_build_object(
             'id', l.id, 'list', l.list, 'subject', l.subject, 'body', l.body, 'state', l.state,
             'total', coalesce(l.recipients_total, 0),
             'sent', c.sent, 'skipped', c.skipped, 'unknown', c.unknown, 'waiting', c.waiting,
             'sentToday', c.sent_today,
             'createdAt', l.created_at, 'queuedAt', l.queued_at,
             'stoppedAt', l.stopped_at, 'finishedAt', l.finished_at,
             'testSentAt', l.test_sent_at, 'testSentTo', l.test_sent_to,
             'queuedBy', (select m.name from console.members m where m.user_id = l.queued_by),
             'stoppedBy', (select m.name from console.members m where m.user_id = l.stopped_by))
      from announcements.letters l
     cross join lateral (
       select (count(*) filter (where d.state = 'sent'))::int                   as sent,
              (count(*) filter (where d.state = 'skipped'))::int                as skipped,
              (count(*) filter (where d.state = 'unknown'))::int                as unknown,
              (count(*) filter (where d.state in ('pending', 'sending')))::int  as waiting,
              (count(*) filter (where d.state = 'sent'
                 and d.sent_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')))::int as sent_today
         from announcements.deliveries d where d.letter_id = l.id) c
     where l.id = p_letter);
end $$;

-- How many people each list would reach right now, and whether Availability has had its one send.
-- The counts use the condition `announce_queue` uses (confirmed, not withdrawn), so the number the
-- composer shows is the number Queue will fix, give or take whoever changes their mind in between.
-- "Spent" is the trigger's own condition, so the composer greys the choice out for exactly the
-- letters the database would refuse.
create or replace function public.console_letter_lists() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform console.require_role('admin');
  return (
    select jsonb_build_object(
      'news', (select count(*)::int from subscriptions.consents c
                where c.list = 'news' and c.confirmed_at is not null and c.withdrawn_at is null),
      'availability', (select count(*)::int from subscriptions.consents c
                where c.list = 'availability' and c.confirmed_at is not null and c.withdrawn_at is null),
      'availabilitySpent', s.spent,
      'availabilitySpentAt', s.finished_at)
      from (
        select count(*) > 0 as spent, max(l.finished_at) as finished_at
          from announcements.letters l
         where l.list = 'availability'
           and (l.state in ('queued', 'sending')
                or exists (select 1 from announcements.deliveries d where d.letter_id = l.id and d.state = 'sent'))) s);
end $$;

-- A new draft, or a change to one. Only a draft may change: what is queued has been fixed for the
-- people on it. A change to the list, subject or body CLEARS the test, because the test was proof of
-- other words; saving the same text again keeps it.
-- `p_letter` is last and defaults to null so the generated TypeScript types make it optional: a new
-- draft omits it, where a required `string` could not be given null without a cast.
create or replace function public.console_save_letter(p_list text, p_subject text, p_body text, p_letter uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_member  console.members := console.require_role('admin');
  v_subject text := btrim(coalesce(p_subject, ''));
  v_old     announcements.letters;
  v_id      uuid;
begin
  if p_list is null or p_list not in ('news', 'availability') then
    raise exception 'unknown list' using errcode = '22023';
  end if;
  if char_length(v_subject) not between 1 and 200 then
    raise exception 'subject length' using errcode = '22023';
  end if;
  if p_body is null or char_length(btrim(p_body)) < 1 or char_length(p_body) > 20000 then
    raise exception 'body length' using errcode = '22023';
  end if;

  if p_letter is null then
    insert into announcements.letters (list, subject, body, created_by)
    values (p_list, v_subject, p_body, v_member.user_id)
    returning id into v_id;
    return v_id;
  end if;

  select * into v_old from announcements.letters l where l.id = p_letter for update;
  if not found then
    raise exception 'no such letter' using errcode = '22023';
  end if;
  if v_old.state <> 'draft' then
    raise exception 'not a draft' using errcode = '22023';
  end if;

  if v_old.list is distinct from p_list or v_old.subject is distinct from v_subject or v_old.body is distinct from p_body then
    update announcements.letters
       set list = p_list, subject = v_subject, body = p_body, test_sent_at = null, test_sent_to = null
     where id = p_letter;
  end if;
  return p_letter;
end $$;

-- Records that the member proofed this draft. The address is the member's OWN, read from their row:
-- the route has already mailed it, and an argument here would let a caller record a test to an
-- address nobody mailed.
create or replace function public.console_letter_tested(p_environment text, p_letter uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_member console.members := console.require_role('admin');
  v_letter announcements.letters;
begin
  select * into v_letter from announcements.letters l where l.id = p_letter for update;
  if not found then
    raise exception 'no such letter' using errcode = '22023';
  end if;
  if v_letter.state <> 'draft' then
    raise exception 'not a draft' using errcode = '22023';
  end if;
  update announcements.letters set test_sent_at = now(), test_sent_to = v_member.email where id = p_letter;
  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
    'messages', 'Sent a test letter', v_letter.subject, null, 'done', null,
    null, jsonb_build_object('list', v_letter.list));
end $$;

-- Queue. `announce_queue` does the work and holds the rules (a draft, and one somebody has proofed;
-- the Availability trigger refuses a second send). This adds the floor, the member, the refusal of
-- an empty list, and the record. A raise anywhere undoes all of it.
create or replace function public.console_queue_letter(p_environment text, p_letter uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_member  console.members := console.require_role('admin');
  v_subject text;
  v_list    text;
  v_made    int;
begin
  select l.subject, l.list into v_subject, v_list from announcements.letters l where l.id = p_letter;
  if not found then
    raise exception 'no such letter' using errcode = '22023';
  end if;
  v_made := public.announce_queue(p_letter => p_letter, p_member => v_member.user_id);
  if v_made = 0 then
    raise exception 'nobody to send to' using errcode = '22023';
  end if;
  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
    'messages', 'Queued a letter', v_subject, null, 'done', null,
    null, jsonb_build_object('list', v_list, 'people', v_made));
  return v_made;
end $$;

-- Stop. Refuses a letter that is not open, where `announce_stop` would quietly do nothing: the
-- console must not say "Stopped" about a letter that had already finished.
create or replace function public.console_stop_letter(p_environment text, p_letter uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_member  console.members := console.require_role('admin');
  v_subject text;
  v_state   text;
  v_counts  jsonb;
begin
  select l.subject, l.state into v_subject, v_state from announcements.letters l where l.id = p_letter for update;
  if not found then
    raise exception 'no such letter' using errcode = '22023';
  end if;
  if v_state not in ('queued', 'sending') then
    raise exception 'not open' using errcode = '22023';
  end if;
  perform public.announce_stop(p_letter => p_letter, p_member => v_member.user_id);
  select jsonb_build_object(
           'sent',    (count(*) filter (where d.state = 'sent'))::int,
           'skipped', (count(*) filter (where d.state = 'skipped'))::int,
           'unknown', (count(*) filter (where d.state = 'unknown'))::int,
           'waiting', (count(*) filter (where d.state in ('pending', 'sending')))::int)
    into v_counts from announcements.deliveries d where d.letter_id = p_letter;
  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
    'messages', 'Stopped a letter', v_subject, null, 'done', null,
    null, v_counts);
end $$;

-- A member's own session and nobody else: not anon, and not service_role, because each of these is
-- a person's act and must carry a person.
do $$
declare f text;
begin
  foreach f in array array[
    'public.console_letters()',
    'public.console_letter(uuid)',
    'public.console_letter_lists()',
    'public.console_save_letter(text, text, text, uuid)',
    'public.console_letter_tested(text, uuid)',
    'public.console_queue_letter(text, uuid)',
    'public.console_stop_letter(text, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, service_role', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
```

- [ ] **Step 4: Apply it and run the tests**

Run: `npx supabase@2.117.0 migration up --local && npm run db:test`
Expected: 23 files, `Result: PASS`, with `console_letters.test.sql` reporting 39 of 39. If the jsonb comparisons on the audit `after` fail only on key order or spacing, compare with `@>` and `<@` both ways rather than changing the function.

- [ ] **Step 5: Regenerate the types and commit**

```bash
npm run db:types
git add supabase/migrations/20261004090000_console_letters.sql supabase/tests/console_letters.test.sql src/types/supabase.ts
git commit -m "feat(announce): the console's own functions over letters, with the Admin floor in the database"
```

---

## Task 2: Messages, and the module in the rail

Every later task imports these strings, so they come first.

**Files:**
- Create: `src/console/messages/en-IN/announcements.ts`
- Modify: `src/console/messages/index.ts`, `src/console/nav.ts:58`
- Test: `tests/unit/console/nav.test.ts` (existing; one expectation changes)

**Interfaces:**
- Produces: `consoleMessages.announcements`, used below as `m`.

- [ ] **Step 1: Write the failing nav expectation**

In `tests/unit/console/nav.test.ts`, find the test that lists which modules are built (search for `built`) and add `"07"` to the expected list, in numeric order. Run `npx vitest run tests/unit/console/nav.test.ts`. Expected: FAIL, the list lacks `07`.

- [ ] **Step 2: Add the messages**

Create `src/console/messages/en-IN/announcements.ts`:

```ts
/**
 * Module 07, Announcements. Transcribed from ConsoleAnnouncements.dc.html and
 * ConsoleAnnouncementsPhone.dc.html (sheet 23, approved 4 Oct 2026). Strings marked "undrawn" have
 * no board and are this file's own; the README's B4 section lists the Queued ones.
 *
 * The provider is never named: it is "the mail service". Nothing here states how often the news
 * list is written to.
 */
const people = (n: string) => (n === "1" ? "1 person" : `${n} people`);
const days = (n: number) => (n === 1 ? "1 day" : `${n} days`);

export const announcements = {
  pageTitle: "Announcements · Trakline console",
  kicker: "07 · Announcements",
  title: "Announcements",
  lead: "Letters to the people who asked for them. A send goes out over several days, so confirmation and sign-in mail always have room.",
  updated: (time: string) => `Updated ${time} IST`,
  newLetter: "New letter",
  allLetters: "All letters",

  lists: { news: "News", availability: "Availability" },
  states: { draft: "Draft", queued: "Queued", sending: "Sending", stopped: "Stopped", done: "Done" },

  letters: {
    title: "Letters",
    count: (n: number) => (n === 1 ? "1 letter" : `${n} letters`),
    caption: "Letters to the subscription lists",
    subject: "Subject",
    list: "List",
    state: "State",
    progress: "Progress",
    when: "When",
    notQueued: "Not queued",
    line: (sent: string, skipped: string, unknown: string, total: string) => `Sent ${sent} · Skipped ${skipped} · Unknown ${unknown} of ${total}`,
    saved: (date: string) => `Saved ${date}`,
    queued: (date: string) => `Queued ${date}`,
    stopped: (date: string) => `Stopped ${date}`,
    finished: (date: string) => `Finished ${date}`,
    open: (subject: string) => `Open ${subject}`,
    footer: "A letter goes out at most 40 a day. We don't track opens or clicks.",
    /** Undrawn: the sheet's sample always has letters. */
    none: "No letters yet. New letter starts one.",
    /** Undrawn. */
    unavailable: "Letters unavailable: the database didn't answer.",
  },

  compose: {
    title: "New letter",
    draft: "Draft",
    form: "Form TC-10",
    subject: "Subject",
    list: "List",
    body: "Body",
    bodyHint: "Plain text. The unsubscribe link is added for you at the end of every email.",
    confirmed: (n: string) => `${people(n)} confirmed. Anyone unsubscribed or suppressed is left out.`,
    spentOn: (date: string) => `Spent. Its one send finished on ${date}, and it can't be chosen again.`,
    /** Undrawn: the one send is still going out. */
    spentGoing: "Spent. Its one send is going out, and it can't be chosen again.",
    test: {
      legend: "Test send",
      detail: (email: string) => `Sends this letter to ${email}, using one email from today's allowance.`,
      notSent: "Not sent yet",
      sentAt: (time: string, email: string) => `Sent at ${time} IST to ${email}`,
      /** Undrawn: a test made on an earlier day. */
      sentOn: (when: string, email: string) => `Sent ${when} IST to ${email}`,
      send: "Send a test to me",
      done: "Test sent.",
    },
    notTested: "A test send has not been made.",
    /** Undrawn (ruling 6). */
    unsaved: "Save your changes first.",
    /** Undrawn (ruling 8). */
    nobody: "Nobody is on this list yet.",
    ready: (n: string, d: number) => `Queue sends to ${people(n)}, about ${days(d)} at 40 a day.`,
    readyBehind: (n: string, d: number) => `Queue sends to ${people(n)}, about ${days(d)} at 40 a day, after the letter ahead.`,
    save: "Save draft",
    saved: "Draft saved.",
    queue: "Queue",
    queued: "Queued.",
    /** Undrawn: field errors. */
    subjectNeeded: "Enter a subject.",
    subjectTooLong: "A subject can be up to 200 characters.",
    bodyNeeded: "Write the letter's body.",
    bodyTooLong: "A body can be up to 20,000 characters.",
  },

  how: {
    title: "How a letter goes out",
    items: [
      "At most 40 a day, so confirmation and sign-in mail keep their room.",
      "Queue fixes who gets it: the people on the list at that moment. Someone who unsubscribes before their turn is skipped.",
      "Stop halts the rest at once. A stopped letter can't be resumed.",
      "We don't track opens or clicks.",
    ],
  },

  queueDialog: {
    title: "Queue this letter?",
    list: "List",
    subject: "Subject",
    people: "People",
    behind: "Behind",
    takes: "Takes",
    finishes: "Finishes",
    behindOne: (subject: string, d: number) => `${subject}, about ${days(d)} left`,
    /** Undrawn: more than one letter ahead. */
    behindMany: (subject: string, more: number, d: number) => `${subject} and ${more} more, about ${days(d)} left`,
    takesNow: (d: number) => `About ${days(d)} at 40 a day`,
    takesBehind: (d: number) => `About ${days(d)} at 40 a day, starting when that one finishes`,
    around: (date: string) => `Around ${date}`,
    detail: "Once queued, the letter goes to real people. You can stop it, but a stopped letter can't be resumed.",
    confirm: "Queue",
  },

  detail: {
    progress: "Progress",
    estimated: "Estimated finish",
    about: (d: number) => `About ${days(d)} at 40 a day`,
    aroundDetail: (date: string) => `Around ${date}. If confirmation mail uses up a day first, nothing from this letter goes that day and the finish moves later.`,
    /** Undrawn, from the README's Queued note. */
    startsAfter: "Starts when the letter ahead finishes",
    /** Undrawn: queued with nothing ahead, before the day's run. */
    startsNext: "Starts at the next daily run",
    stoppedLegend: "Stopped",
    finishedLegend: "Finished",
    sentTo: (n: string) => `Sent to ${people(n)}`,
    stoppedDetail: (skipped: string, never: string, when: string, by: string) => `${skipped} were skipped, and ${never} were never reached and won't be. Stopped on ${when} IST by ${by}.`,
    finishedDetail: (when: string, skipped: string) => `Finished on ${when} IST. ${skipped} were skipped.`,
    finishedUnknown: (n: string) => ` ${n} may or may not have gone.`,
    availabilitySpent: " The availability list is spent: it had its one send and can't be chosen again.",
    meter: "Recipients handled",
    handled: (h: string, t: string) => `${h} of ${t} handled`,
    waiting: (n: string) => `${n} waiting`,
    neverReached: (n: string) => `${n} never reached`,
    sent: "Sent",
    sentHint: "Accepted by the mail service for delivery.",
    skipped: "Skipped",
    skippedHint: "Left out when their turn came: unsubscribed or suppressed since the letter was queued.",
    unknown: "Unknown",
    unknownHint: "May or may not have gone: the send timed out. These are never tried again.",
    stopNote: "Stop halts the rest at once. What has gone has gone, and a stopped letter can't be resumed.",
    stop: "Stop",
    cantResume: "A stopped letter can't be resumed.",
    letter: "Letter",
    listCell: (list: string, n: string) => `${list} · ${people(n)}`,
    subjectRow: "Subject",
    listRow: "List",
    listWhenQueued: (list: string, n: string) => `${list} · ${people(n)} when it was queued`,
    queuedRow: "Queued",
    by: (when: string, name: string) => `${when} IST by ${name}`,
    /** Undrawn: the member has since been removed. */
    byNobody: (when: string) => `${when} IST`,
    formerMember: "a former member",
    testRow: "Test send",
    testTo: (when: string, email: string) => `${when} IST to ${email}`,
    todayRow: "Today",
    today: (n: string) => `${n} sent. The day's count resets at 05:30 IST.`,
    at: (when: string) => `${when} IST`,
    messageRow: "Message",
    messageHint: "The unsubscribe link is added to the end of every email when it is sent.",
  },

  stopDialog: {
    title: "Stop sending?",
    detail: (sent: string, waiting: string) => `${people(sent)} already have this letter, and that can't be recalled. The ${waiting} still waiting won't get it, and a stopped letter can't be resumed.`,
    confirm: "Stop sending",
    done: "Stopped.",
  },

  phone: {
    note: "Open on a larger screen to edit this draft, send a test or queue it.",
    title: "Draft",
    notQueued: "Not queued",
    listLine: (list: string, n: string) => `${list} · ${people(n)} confirmed`,
    message: "Message",
    queueOff: "Queue is off until a test send has been made.",
    /** Undrawn: the draft has been tested. */
    queueElsewhere: "Open on a larger screen to queue it.",
    /** Undrawn: New letter on a phone, where there is no draft to read. */
    newElsewhere: "Open on a larger screen to write a letter.",
  },

  errors: {
    noAccess: "Your role can't do that.",
    invalid: "That letter can't be saved as written. Check the subject and the body.",
    gone: "That letter no longer exists.",
    notDraft: "Only a draft can be changed, and this letter has been queued.",
    notTested: "Send yourself a test first. Queue stays off until one has been made.",
    spent: "The availability list has had its one send, so it can't be used again.",
    nobody: "Nobody is on this list, so there is nobody to send to.",
    notOpen: "This letter isn't sending, so there is nothing to stop.",
    database: "That didn't go through: the database didn't answer. Nothing changed.",
    testFailed: "The test could not be sent, so nothing was recorded. Try again.",
    testSuppressed: "Your own address is suppressed, so a test can't reach you.",
    testUnrecorded: "The test was sent, but it could not be recorded. Send it again.",
  },
} as const;
```

In `src/console/messages/index.ts`, import it beside `abuse` and add `announcements` to the `consoleMessages` object.

- [ ] **Step 3: Mark the module built**

In `src/console/nav.ts`, on the `07` line, change `built: false` to `built: true`.

- [ ] **Step 4: Run and commit**

Run: `npx vitest run tests/unit/console` — the nav test passes. Other nav-dependent tests (rail, overview) may list built modules too: `grep -rn "\"06\"\|Leads" tests/unit/console tests/e2e/console-auth | grep -i built` and fix any that enumerate them. The page does not exist yet, so the link 404s until Task 5; that is why this task does not end in a gate run.

```bash
git add src/console/messages src/console/nav.ts tests/unit/console
git commit -m "feat(announce): module 07's words, and its place in the rail"
```

---

## Task 3: Reading and writing letters from the console

**Files:**
- Create: `src/console/announcements/letters.ts`
- Test: `tests/unit/console/announcements/letters.test.ts`

**Interfaces:**
- Consumes: Task 1's seven functions; `ConsoleDb` from `@/console/auth/db`; `consoleMessages.announcements.errors`.
- Produces:
  - `type LetterList = "news" | "availability"`, `type LetterState = "draft" | "queued" | "sending" | "stopped" | "done"`
  - `interface LetterRow { id; list; subject; state; total; sent; skipped; unknown; waiting; createdAt; queuedAt; stoppedAt; finishedAt }` (counts are numbers; dates are ISO strings or null)
  - `interface LetterDetail extends LetterRow { body; testSentAt; testSentTo; queuedBy; stoppedBy; sentToday }`
  - `interface ListCounts { news: number; availability: number; availabilitySpent: boolean; availabilitySpentAt: string | null }`
  - `readLetters(db): Promise<readonly LetterRow[]>`, `readLetter(db, id): Promise<LetterDetail | null>`, `readLists(db): Promise<ListCounts>`
  - `saveLetter(db, { id?, list, subject, body }): Promise<string>`, `recordTest(db, environment, id): Promise<void>`, `queueLetter(db, environment, id): Promise<number>`, `stopLetter(db, environment, id): Promise<void>`
  - Every failure is an `AppError` whose message is one of `m.errors`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/console/announcements/letters.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { ConsoleDb } from "@/console/auth/db";
import { queueLetter, readLetter, readLetters, readLists, recordTest, saveLetter, stopLetter } from "@/console/announcements/letters";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

// ---------------------------------------------------------------------------
// The console's seven calls. A database error must never read as an empty
// answer: "no letters" and "the database is down" are different pages. And a
// row of the wrong shape fails closed rather than drawing `undefined`.
// ---------------------------------------------------------------------------

const m = consoleMessages.announcements.errors;
const ID = "a0000000-0000-4000-8000-000000000001";
const ROW = {
  id: ID, list: "news", subject: "What is coming", state: "sending", total: 431,
  sent: 262, skipped: 4, unknown: 0, waiting: 165,
  createdAt: "2026-09-10T03:00:00+00:00", queuedAt: "2026-09-11T03:35:00+00:00", stoppedAt: null, finishedAt: null,
};
const DETAIL = { ...ROW, body: "Hello", testSentAt: "2026-09-11T03:28:00+00:00", testSentTo: "asha@example.com", queuedBy: "Asha Rao", stoppedBy: null, sentToday: 31 };

function db(answer: { data?: unknown; error?: { message: string } | null }): { db: ConsoleDb; rpc: ReturnType<typeof vi.fn> } {
  const rpc = vi.fn(async () => ({ data: answer.data ?? null, error: answer.error ?? null }));
  return { db: { rpc } as unknown as ConsoleDb, rpc };
}

async function message(run: Promise<unknown>): Promise<string> {
  const err = await run.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  return (err as AppError).message;
}

describe("reading", () => {
  it("returns the letters as the database lists them", async () => {
    const { db: client, rpc } = db({ data: [ROW] });
    expect(await readLetters(client)).toEqual([ROW]);
    expect(rpc).toHaveBeenCalledWith("console_letters");
  });

  it("throws on a database error rather than answering no letters", async () => {
    expect(await message(readLetters(db({ error: { message: "connection refused" } }).db))).toBe(m.database);
  });

  it("throws on a row of the wrong shape", async () => {
    expect(await message(readLetters(db({ data: [{ ...ROW, state: "paused" }] }).db))).toBe(m.database);
  });

  it("returns one letter, and null when there is none", async () => {
    const one = db({ data: DETAIL });
    expect(await readLetter(one.db, ID)).toEqual(DETAIL);
    expect(one.rpc).toHaveBeenCalledWith("console_letter", { p_letter: ID });
    expect(await readLetter(db({ data: null }).db, ID)).toBeNull();
  });

  it("returns the list counts", async () => {
    const counts = { news: 431, availability: 0, availabilitySpent: true, availabilitySpentAt: "2026-09-06T08:40:00+00:00" };
    expect(await readLists(db({ data: counts }).db)).toEqual(counts);
  });

  it("says no access in the role's own words", async () => {
    expect(await message(readLetters(db({ error: { message: "no access" } }).db))).toBe(m.noAccess);
  });
});

describe("writing", () => {
  it("saves a new draft without naming a letter, and an old one by its id", async () => {
    const created = db({ data: ID });
    expect(await saveLetter(created.db, { list: "news", subject: "S", body: "B" })).toBe(ID);
    expect(created.rpc).toHaveBeenCalledWith("console_save_letter", { p_list: "news", p_subject: "S", p_body: "B" });

    const updated = db({ data: ID });
    await saveLetter(updated.db, { id: ID, list: "news", subject: "S", body: "B" });
    expect(updated.rpc).toHaveBeenCalledWith("console_save_letter", { p_list: "news", p_subject: "S", p_body: "B", p_letter: ID });
  });

  it("queues under the environment the server names, and answers how many", async () => {
    const { db: client, rpc } = db({ data: 431 });
    expect(await queueLetter(client, "production", ID)).toBe(431);
    expect(rpc).toHaveBeenCalledWith("console_queue_letter", { p_environment: "production", p_letter: ID });
  });

  it("records a test and stops a letter by id", async () => {
    const tested = db({});
    await recordTest(tested.db, "production", ID);
    expect(tested.rpc).toHaveBeenCalledWith("console_letter_tested", { p_environment: "production", p_letter: ID });
    const stopped = db({});
    await stopLetter(stopped.db, "production", ID);
    expect(stopped.rpc).toHaveBeenCalledWith("console_stop_letter", { p_environment: "production", p_letter: ID });
  });

  it.each([
    ["this letter has not been test sent, so nobody has seen it as a reader will", m.notTested],
    ["only a draft may be queued, and this letter is sending", m.notDraft],
    ["not a draft", m.notDraft],
    ["the availability list is spent: it promised exactly one email", m.spent],
    ["nobody to send to", m.nobody],
    ["not open", m.notOpen],
    ["no such letter", m.gone],
    ["there is no such letter", m.gone],
    ["subject length", m.invalid],
    ["body length", m.invalid],
    ["unknown list", m.invalid],
    ["something nobody planned for", m.database],
  ])("turns the database's %j into the console's words", async (raised, shown) => {
    expect(await message(queueLetter(db({ error: { message: raised } }).db, "production", ID))).toBe(shown);
  });

  it("refuses a queue that answers with something other than a count", async () => {
    expect(await message(queueLetter(db({ data: "many" }).db, "production", ID))).toBe(m.database);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/console/announcements/letters.test.ts`
Expected: FAIL — `Cannot find module '@/console/announcements/letters'`.

- [ ] **Step 3: Implement**

Create `src/console/announcements/letters.ts`:

```ts
import { z } from "zod";
import type { ConsoleDb } from "@/console/auth/db";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

// The console's seven calls (supabase/migrations/20261004090000_console_letters.sql), each through
// the MEMBER'S OWN session: the database re-checks the Admin floor and takes the member from the
// session, so nothing here passes a member id and nothing here could forge one.
//
// A database error THROWS. "No letters" and "the database is down" are different pages, and a
// caller must never be able to mistake one for the other. So does an answer of the wrong shape.

const m = consoleMessages.announcements.errors;

export const LETTER_LISTS = ["news", "availability"] as const;
export type LetterList = (typeof LETTER_LISTS)[number];
export const LETTER_STATES = ["draft", "queued", "sending", "stopped", "done"] as const;
export type LetterState = (typeof LETTER_STATES)[number];

// Postgres writes a timestamptz with an offset ("+00:00"), not "Z".
const when = z.iso.datetime({ offset: true });
const count = z.number().int().nonnegative();

const rowShape = z.object({
  id: z.guid(),
  list: z.enum(LETTER_LISTS),
  subject: z.string().min(1).max(200),
  state: z.enum(LETTER_STATES),
  total: count,
  sent: count,
  skipped: count,
  unknown: count,
  waiting: count,
  createdAt: when,
  queuedAt: when.nullable(),
  stoppedAt: when.nullable(),
  finishedAt: when.nullable(),
});

const detailShape = rowShape.extend({
  body: z.string().min(1).max(20000),
  testSentAt: when.nullable(),
  testSentTo: z.string().nullable(),
  queuedBy: z.string().nullable(),
  stoppedBy: z.string().nullable(),
  sentToday: count,
});

const listsShape = z.object({
  news: count,
  availability: count,
  availabilitySpent: z.boolean(),
  availabilitySpentAt: when.nullable(),
});

export type LetterRow = z.infer<typeof rowShape>;
export type LetterDetail = z.infer<typeof detailShape>;
export type ListCounts = z.infer<typeof listsShape>;

const unavailable = (): AppError => new AppError("SOURCE_UNAVAILABLE", m.database);

/** The database's own sentences, turned into the console's. Anything unrecognised is a fault. */
function fromError(error: { readonly message: string }): AppError {
  const text = error.message;
  if (text.includes("no access")) return new AppError("INVALID_INPUT", m.noAccess, { status: 403 });
  if (text.includes("not been test sent")) return new AppError("INVALID_INPUT", m.notTested);
  if (text.includes("only a draft may be queued") || text.includes("not a draft")) return new AppError("INVALID_INPUT", m.notDraft);
  if (text.includes("availability list is spent")) return new AppError("INVALID_INPUT", m.spent);
  if (text.includes("nobody to send to")) return new AppError("INVALID_INPUT", m.nobody);
  if (text.includes("not open")) return new AppError("INVALID_INPUT", m.notOpen);
  if (text.includes("no such letter")) return new AppError("NOT_FOUND", m.gone);
  if (/subject length|body length|unknown list/.test(text)) return new AppError("INVALID_INPUT", m.invalid);
  return unavailable();
}

function parsed<T>(shape: z.ZodType<T>, data: unknown): T {
  const result = shape.safeParse(data);
  if (!result.success) throw unavailable();
  return result.data;
}

export async function readLetters(db: ConsoleDb): Promise<readonly LetterRow[]> {
  const { data, error } = await db.rpc("console_letters");
  if (error) throw fromError(error);
  return parsed(z.array(rowShape), data);
}

/** Null is "there is no such letter", which the page draws as not found. */
export async function readLetter(db: ConsoleDb, id: string): Promise<LetterDetail | null> {
  const { data, error } = await db.rpc("console_letter", { p_letter: id });
  if (error) throw fromError(error);
  return data === null ? null : parsed(detailShape, data);
}

export async function readLists(db: ConsoleDb): Promise<ListCounts> {
  const { data, error } = await db.rpc("console_letter_lists");
  if (error) throw fromError(error);
  return parsed(listsShape, data);
}

/** A new draft when `id` is absent. Returns the letter's id either way. */
export async function saveLetter(db: ConsoleDb, letter: { readonly id?: string; readonly list: LetterList; readonly subject: string; readonly body: string }): Promise<string> {
  const args = { p_list: letter.list, p_subject: letter.subject, p_body: letter.body };
  const { data, error } = await db.rpc("console_save_letter", letter.id ? { ...args, p_letter: letter.id } : args);
  if (error) throw fromError(error);
  return parsed(z.guid(), data);
}

export async function recordTest(db: ConsoleDb, environment: string, id: string): Promise<void> {
  const { error } = await db.rpc("console_letter_tested", { p_environment: environment, p_letter: id });
  if (error) throw fromError(error);
}

/** Returns how many people the queue fixed. */
export async function queueLetter(db: ConsoleDb, environment: string, id: string): Promise<number> {
  const { data, error } = await db.rpc("console_queue_letter", { p_environment: environment, p_letter: id });
  if (error) throw fromError(error);
  return parsed(z.number().int().positive(), data);
}

export async function stopLetter(db: ConsoleDb, environment: string, id: string): Promise<void> {
  const { error } = await db.rpc("console_stop_letter", { p_environment: environment, p_letter: id });
  if (error) throw fromError(error);
}
```

- [ ] **Step 4: Run, typecheck, commit**

Run: `npx vitest run tests/unit/console/announcements/letters.test.ts && npm run typecheck`
Expected: PASS, and no type errors. If `db.rpc("console_letters")` is rejected by the generated types, Task 1 Step 5's `npm run db:types` was not run against a database with the migration applied: apply it and regenerate, do not cast.

```bash
git add src/console/announcements/letters.ts tests/unit/console/announcements/letters.test.ts
git commit -m "feat(announce): the console reads and writes letters through the member's own session"
```

---

## Task 4: Estimates

**Files:**
- Create: `src/console/announcements/estimate.ts`
- Test: `tests/unit/console/announcements/estimate.test.ts`

**Interfaces:**
- Consumes: `LetterRow` (Task 3); `ANNOUNCEMENT_CEILING` from `@/services/announcements/budget`.
- Produces:
  - `daysFor(waiting: number): number`
  - `interface Ahead { readonly subject: string; readonly more: number; readonly days: number }`
  - `lettersAhead(letters: readonly LetterRow[], of: { readonly id: string | null; readonly queuedAt: string | null }): Ahead | null`
  - `finishDate(now: Date, days: number): Date`
  - `percent(handled: number, total: number): number` (0–100, whole)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/console/announcements/estimate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { daysFor, finishDate, lettersAhead, percent } from "@/console/announcements/estimate";
import type { LetterRow } from "@/console/announcements/letters";

// The sheet's own arithmetic: 165 waiting at 40 a day is "about 4 days"; 431 behind that letter is
// "about 11 days", finishing around 4 Oct when today is 19 Sep (4 + 11 = 15 days on).

const row = (over: Partial<LetterRow>): LetterRow => ({
  id: "a0000000-0000-4000-8000-000000000001", list: "news", subject: "S", state: "sending", total: 0,
  sent: 0, skipped: 0, unknown: 0, waiting: 0,
  createdAt: "2026-09-10T03:00:00+00:00", queuedAt: "2026-09-11T03:35:00+00:00", stoppedAt: null, finishedAt: null,
  ...over,
});

describe("daysFor", () => {
  it.each([[0, 0], [1, 1], [40, 1], [41, 1], [60, 2], [165, 4], [431, 11]])("%i waiting is %i days", (waiting, days) => {
    expect(daysFor(waiting)).toBe(days);
  });
});

describe("lettersAhead", () => {
  const sending = row({ id: "a0000000-0000-4000-8000-000000000002", subject: "A clearer chart view", waiting: 165 });

  it("is null when nothing else is open", () => {
    expect(lettersAhead([row({ state: "done" }), row({ state: "draft", queuedAt: null })], { id: null, queuedAt: null })).toBeNull();
  });

  it("names the letter a new draft would wait behind, with its days left", () => {
    expect(lettersAhead([sending], { id: null, queuedAt: null })).toEqual({ subject: "A clearer chart view", more: 0, days: 4 });
  });

  it("adds every open letter's wait, and names the one that goes first", () => {
    const second = row({ id: "a0000000-0000-4000-8000-000000000003", subject: "Later", state: "queued", waiting: 80, queuedAt: "2026-09-12T03:00:00+00:00" });
    expect(lettersAhead([second, sending], { id: null, queuedAt: null })).toEqual({ subject: "A clearer chart view", more: 1, days: 6 });
  });

  it("for a queued letter, counts only what was queued before it, and never itself", () => {
    const mine = row({ id: "a0000000-0000-4000-8000-000000000004", state: "queued", waiting: 431, queuedAt: "2026-09-12T03:00:00+00:00" });
    const after = row({ id: "a0000000-0000-4000-8000-000000000005", state: "queued", waiting: 40, queuedAt: "2026-09-13T03:00:00+00:00" });
    expect(lettersAhead([after, mine, sending], { id: mine.id, queuedAt: mine.queuedAt })).toEqual({ subject: "A clearer chart view", more: 0, days: 4 });
  });
});

describe("finishDate", () => {
  it("is that many days on", () => {
    expect(finishDate(new Date("2026-09-19T09:02:00Z"), 15).toISOString().slice(0, 10)).toBe("2026-10-04");
  });
});

describe("percent", () => {
  it.each([[266, 431, 62], [123, 418, 29], [217, 217, 100], [0, 0, 0]])("%i of %i is %i%%", (handled, total, pct) => {
    expect(percent(handled, total)).toBe(pct);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/console/announcements/estimate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/console/announcements/estimate.ts`:

```ts
import type { LetterRow } from "@/console/announcements/letters";
import { ANNOUNCEMENT_CEILING } from "@/services/announcements/budget";

// How long a letter takes, said the way the sheet says it. One letter drains at a time, in queue
// order, at most ANNOUNCEMENT_CEILING a day (spec §3), so a letter's finish is its own wait plus the
// wait of everything queued before it. These are estimates and the copy says "about": a day that
// confirmation mail uses up sends nothing, and the finish moves later.

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole days at the daily ceiling, rounded to the nearest and never less than one while anything
 * waits. The sheet's samples round (165 waiting is "about 4 days"), and every line that shows this
 * number says "about".
 */
export function daysFor(waiting: number): number {
  return waiting <= 0 ? 0 : Math.max(1, Math.round(waiting / ANNOUNCEMENT_CEILING));
}

export interface Ahead {
  /** The letter that goes first. */
  readonly subject: string;
  /** How many other open letters are ahead besides that one. */
  readonly more: number;
  /** Days until all of them have gone. */
  readonly days: number;
}

/**
 * What a letter waits behind. For a draft (`queuedAt` null) that is every open letter; for a queued
 * one, only those queued before it. Null when nothing is ahead.
 */
export function lettersAhead(letters: readonly LetterRow[], of: { readonly id: string | null; readonly queuedAt: string | null }): Ahead | null {
  const open = letters
    .filter((l) => (l.state === "queued" || l.state === "sending") && l.id !== of.id && l.queuedAt !== null)
    .filter((l) => of.queuedAt === null || (l.queuedAt as string) < of.queuedAt)
    .toSorted((a, b) => (a.queuedAt as string).localeCompare(b.queuedAt as string));
  const first = open[0];
  if (!first) return null;
  return { subject: first.subject, more: open.length - 1, days: daysFor(open.reduce((sum, l) => sum + l.waiting, 0)) };
}

export function finishDate(now: Date, days: number): Date {
  return new Date(now.getTime() + days * DAY_MS);
}

/** A whole percentage, 0 when there is nobody: never NaN in a style attribute. */
export function percent(handled: number, total: number): number {
  return total <= 0 ? 0 : Math.round((handled / total) * 100);
}
```

`queuedAt` strings compare correctly as text only when they share an offset; Postgres writes them all as `+00:00`, and `rowShape` has already validated the form. If `toSorted` is unavailable under the project's `lib` setting, use `[...open].sort(...)`.

- [ ] **Step 4: Run and commit**

Run: `npx vitest run tests/unit/console/announcements/estimate.test.ts`
Expected: PASS.

```bash
git add src/console/announcements/estimate.ts tests/unit/console/announcements/estimate.test.ts
git commit -m "feat(announce): how long a letter takes, counted behind the letters ahead of it"
```

---

## Task 5: Two lamps and a sheet

Two small changes to shared components, each needed by a later task.

**Files:**
- Modify: `src/components/ui/led.tsx`, `src/components/ui/confirm-dialog.tsx`
- Test: `tests/unit/components/ui/led.test.tsx` (create), `tests/unit/components/ui/confirm-dialog.test.tsx` (create)

**Interfaces:**
- Produces: `<Lamp variant="half" | "ringed" />`; `<ConfirmDialog phoneSheet />`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/components/ui/led.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Lamp } from "@/components/ui/led";

// industry.css draws five lamps: hollow, lit, light (busy), half and ringed. The first three were
// here already; Sending is half and Stopped is ringed (ConsoleAnnouncements.dc.html, the List board).
describe("Lamp", () => {
  it("draws a half lamp as a hollow ring with its left half filled", () => {
    const { container } = render(<Lamp variant="half" />);
    const lamp = container.firstElementChild as HTMLElement;
    expect(lamp.className).toContain("after:w-1/2");
    expect(lamp.className).toContain("after:bg-accent");
    expect(lamp.className).toContain("bg-transparent");
  });

  it("draws a ringed lamp with the alert ink's heavier ring", () => {
    const { container } = render(<Lamp variant="ringed" />);
    const lamp = container.firstElementChild as HTMLElement;
    expect(lamp.className).toContain("border-2");
    expect(lamp.className).toContain("border-ink-alert");
  });

  it("stays decorative unless it is given a label", () => {
    const { container } = render(<Lamp variant="half" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
```

Create `tests/unit/components/ui/confirm-dialog.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// ConsoleAnnouncementsPhone.dc.html draws "Stop sending?" as a sheet rising from the bottom edge,
// its two buttons stacked full width with the action on top. From `sm` up it is the centred dialog.
describe("ConfirmDialog as a phone sheet", () => {
  const dialog = (phoneSheet: boolean) =>
    render(<ConfirmDialog open onOpenChange={() => {}} title="Stop sending?" description="262 people already have this letter." confirmLabel="Stop sending" tone="primary" phoneSheet={phoneSheet} onConfirm={() => {}} />);

  it("anchors to the bottom edge below sm, and centres from sm up", () => {
    dialog(true);
    const viewport = screen.getByRole("alertdialog").parentElement as HTMLElement;
    expect(viewport.className).toContain("max-sm:items-end");
    expect(viewport.className).toContain("max-sm:p-0");
  });

  it("stacks its buttons with the action first below sm", () => {
    dialog(true);
    const actions = screen.getByRole("button", { name: "Stop sending" }).parentElement as HTMLElement;
    expect(actions.className).toContain("max-sm:flex-col-reverse");
  });

  it("is the centred dialog it always was when not asked to be a sheet", () => {
    dialog(false);
    const viewport = screen.getByRole("alertdialog").parentElement as HTMLElement;
    expect(viewport.className).not.toContain("max-sm:items-end");
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/unit/components/ui/led.test.tsx tests/unit/components/ui/confirm-dialog.test.tsx`
Expected: FAIL — `variant` and `phoneSheet` do nothing yet. (If `phoneSheet` is rejected by the type checker instead, that is the same failure.)

- [ ] **Step 3: Implement**

In `src/components/ui/led.tsx`, add the prop and its classes:

```tsx
/** A lamp, as drawn: a 9px ring on a hairline; steel when lit, light steel while busy, hollow when off. */
export function Led({
  lit = false,
  busy = false,
  variant,
  size = "md",
  label,
  className,
}: {
  readonly lit?: boolean;
  readonly busy?: boolean;
  /**
   * industry.css `.lamp.half` (half filled: under way) and `.lamp.ringed` (a heavier ring in the
   * alert ink: halted). Either wins over `lit` and `busy`.
   */
  readonly variant?: "half" | "ringed";
  /** Kept for call-site compatibility; lamps are mono. */
  readonly tone?: Tone | "key" | "busy";
  readonly size?: "sm" | "md";
  readonly label?: string;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded-full border transition-colors",
        size === "sm" ? "size-2" : "size-[9px]",
        variant === "ringed" ? "border-2 border-ink-alert bg-transparent" : "border-line",
        variant === "half" && "relative overflow-hidden bg-transparent after:absolute after:inset-y-0 after:left-0 after:w-1/2 after:bg-accent after:content-['']",
        variant === undefined && (busy ? "bg-accent-busy" : lit ? "bg-accent" : "bg-transparent"),
        className,
      )}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
```

In `src/components/ui/confirm-dialog.tsx`, add `phoneSheet = false` to the props (`readonly phoneSheet?: boolean;`, documented "Below `sm`, a sheet from the bottom edge with stacked full-width buttons (ConsoleAnnouncementsPhone.dc.html, Stop confirm)"), import `cn` from `@/utils/cn`, and change three class lists:

```tsx
<AlertDialog.Viewport className={cn("fixed inset-0 z-dialog flex items-center justify-center p-4", phoneSheet && "max-sm:items-end max-sm:p-0")}>
  <AlertDialog.Popup
    className={cn(
      "blueprint w-full max-w-narrow bg-surface-3 p-6 shadow-3 outline-none transition-[transform,opacity] duration-(--duration-slow) ease-out data-[starting-style]:scale-98 data-[starting-style]:opacity-0 data-[ending-style]:scale-98 data-[ending-style]:opacity-0",
      phoneSheet && "max-sm:max-w-none max-sm:border-b-0 max-sm:p-5",
    )}
  >
```

```tsx
<div className={cn("mt-6 flex flex-wrap justify-end gap-2", phoneSheet && "max-sm:flex-col-reverse max-sm:flex-nowrap max-sm:[&>button]:h-11 max-sm:[&>button]:w-full")}>
```

The DOM order stays Cancel then confirm; `flex-col-reverse` puts the action on top below `sm`, as the phone board draws it. The phone board draws no corner marks on the sheet: if the `.corner` marks show against the bottom edge, hide them with `phoneSheet && "max-sm:[&>.corner]:hidden"` on the Popup.

- [ ] **Step 4: Run and commit**

Run: `npx vitest run tests/unit/components/ui tests/unit/tokens.contract.test.ts`
Expected: PASS. The tokens contract is in this run on purpose: it rejects a class off the spacing rhythm, and these are new classes.

```bash
git add src/components/ui/led.tsx src/components/ui/confirm-dialog.tsx tests/unit/components/ui/led.test.tsx tests/unit/components/ui/confirm-dialog.test.tsx
git commit -m "feat(ui): the half and ringed lamps, and a confirm that is a sheet on a phone"
```

---

## Task 6: The list

**Files:**
- Create: `src/console/announcements/letters-plate.tsx`, `src/console/announcements/page-header.tsx`, `src/app/console/announcements/page.tsx`
- Test: `tests/unit/console/announcements/letters-plate.test.tsx`

**Interfaces:**
- Consumes: `readLetters`, `LetterRow`, `LetterState` (Task 3); `m` (Task 2); `Lamp` (Task 5).
- Produces:
  - `LetterLamp({ state }: { readonly state: LetterState })`
  - `progressOf(letter: LetterRow): string`, `whenOf(letter: LetterRow): string`
  - `LettersPlate({ letters }: { readonly letters: readonly LetterRow[] | null })` — `null` is "could not be read".
  - `AnnouncementsHeader({ updated, action }: { readonly updated?: string; readonly action?: ReactNode })`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/console/announcements/letters-plate.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LettersPlate, progressOf, whenOf } from "@/console/announcements/letters-plate";
import type { LetterRow } from "@/console/announcements/letters";
import { consoleMessages } from "@/console/messages";

// ConsoleAnnouncements.dc.html, the List board: Subject, List, State, Progress, When. The four
// sample letters are the sheet's own, with its figures.
const m = consoleMessages.announcements;

const row = (over: Partial<LetterRow>): LetterRow => ({
  id: "a0000000-0000-4000-8000-000000000001", list: "news", subject: "S", state: "draft", total: 0,
  sent: 0, skipped: 0, unknown: 0, waiting: 0,
  createdAt: "2026-09-18T04:00:00+00:00", queuedAt: null, stoppedAt: null, finishedAt: null,
  ...over,
});
const DRAFT = row({ subject: "Trakline news: what's coming next" });
const SENDING = row({ id: "a0000000-0000-4000-8000-000000000002", subject: "Trakline news: a clearer chart view", state: "sending", total: 431, sent: 262, skipped: 4, waiting: 165, queuedAt: "2026-09-11T03:35:00+00:00" });
const STOPPED = row({ id: "a0000000-0000-4000-8000-000000000003", subject: "Trakline news: the new look", state: "stopped", total: 418, sent: 120, skipped: 3, waiting: 295, queuedAt: "2026-09-08T03:42:00+00:00", stoppedAt: "2026-09-10T05:10:00+00:00" });
const DONE = row({ id: "a0000000-0000-4000-8000-000000000004", list: "availability", subject: "Availability checks are open", state: "done", total: 217, sent: 213, skipped: 4, queuedAt: "2026-09-01T03:50:00+00:00", finishedAt: "2026-09-06T08:40:00+00:00" });

describe("progressOf and whenOf", () => {
  it("says a draft is not queued, and when it was saved", () => {
    expect(progressOf(DRAFT)).toBe("Not queued");
    expect(whenOf(DRAFT)).toMatch(/^Saved 18 Sep/);
  });

  it("gives sent, skipped and unknown as three counts of the total", () => {
    expect(progressOf(SENDING)).toBe("Sent 262 · Skipped 4 · Unknown 0 of 431");
    expect(whenOf(SENDING)).toMatch(/^Queued 11 Sep/);
  });

  it("dates a stopped letter by its stop and a done one by its finish", () => {
    expect(whenOf(STOPPED)).toMatch(/^Stopped 10 Sep/);
    expect(whenOf(DONE)).toMatch(/^Finished 6 Sep/);
  });
});

describe("LettersPlate", () => {
  it("draws one row per letter, each subject a link to that letter", () => {
    render(<LettersPlate letters={[DRAFT, SENDING, STOPPED, DONE]} />);
    const table = screen.getByRole("table", { name: m.letters.caption });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(4);
    expect(within(rows[1]!).getByRole("link", { name: SENDING.subject })).toHaveAttribute("href", `/announcements/${SENDING.id}`);
    expect(within(rows[1]!).getByText("Sending")).toBeInTheDocument();
    expect(within(rows[3]!).getByText("Availability")).toBeInTheDocument();
    expect(screen.getByText("4 letters")).toBeInTheDocument();
    expect(screen.getByText(m.letters.footer)).toBeInTheDocument();
  });

  it("draws the same letters as cards for a phone, each one a single link", () => {
    render(<LettersPlate letters={[SENDING]} />);
    expect(screen.getByRole("link", { name: m.letters.open(SENDING.subject) })).toHaveAttribute("href", `/announcements/${SENDING.id}`);
  });

  it("says so when there are no letters, and keeps the footer", () => {
    render(<LettersPlate letters={[]} />);
    expect(screen.getByText(m.letters.none)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText(m.letters.footer)).toBeInTheDocument();
  });

  it("says the list could not be read, never that there are none", () => {
    render(<LettersPlate letters={null} />);
    expect(screen.getByRole("status")).toHaveTextContent(m.letters.unavailable);
    expect(screen.queryByText(m.letters.none)).not.toBeInTheDocument();
  });
});
```

`consoleHref` may prefix nothing in tests (it returns the path the admin host serves); if the `href` assertions fail on a prefix, read `src/console/href.ts` and assert against `consoleHref(...)` instead of the literal.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/console/announcements/letters-plate.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the plate and the header**

Create `src/console/announcements/letters-plate.tsx`:

```tsx
import Link from "next/link";
import { Lamp } from "@/components/ui/led";
import { Plate } from "@/components/ui/plate";
import type { LetterRow, LetterState } from "@/console/announcements/letters";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";
import { formatCount, formatDate } from "@/utils/datetime";

const m = consoleMessages.announcements;

/** The sheet's five lamps: Draft hollow, Queued light, Sending half, Stopped ringed, Done lit. */
export function LetterLamp({ state }: { readonly state: LetterState }) {
  if (state === "done") return <Lamp lit />;
  if (state === "queued") return <Lamp busy />;
  if (state === "sending") return <Lamp variant="half" />;
  if (state === "stopped") return <Lamp variant="ringed" />;
  return <Lamp />;
}

export function progressOf(letter: LetterRow): string {
  if (letter.state === "draft") return m.letters.notQueued;
  return m.letters.line(formatCount(letter.sent), formatCount(letter.skipped), formatCount(letter.unknown), formatCount(letter.total));
}

/** A draft has no saved-again date in the store, so "Saved" is the day it was first saved. */
export function whenOf(letter: LetterRow): string {
  if (letter.state === "done" && letter.finishedAt) return m.letters.finished(formatDate(letter.finishedAt));
  if (letter.state === "stopped" && letter.stoppedAt) return m.letters.stopped(formatDate(letter.stoppedAt));
  if (letter.queuedAt) return m.letters.queued(formatDate(letter.queuedAt));
  return m.letters.saved(formatDate(letter.createdAt));
}

const hrefOf = (letter: LetterRow) => consoleHref(`/announcements/${letter.id}`);

function State({ letter }: { readonly letter: LetterRow }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LetterLamp state={letter.state} />
      {m.states[letter.state]}
    </span>
  );
}

/**
 * ConsoleAnnouncements.dc.html's Letters plate, and ConsoleAnnouncementsPhone.dc.html's. Drawn
 * twice — a table from `sm` up, cards below it — because the card is not the table's stacked form:
 * its state sits top right, over the subject. Each is `display: none` at the other width, so a
 * reader meets one list, never both.
 *
 * `null` is a list that could not be read. It is never drawn as "no letters".
 */
export function LettersPlate({ letters }: { readonly letters: readonly LetterRow[] | null }) {
  return (
    <Plate as="section" title={m.letters.title} titleId="an-letters" headingLevel={2} padding="none" meta={letters === null ? [] : [m.letters.count(letters.length)]}>
      {letters === null ? (
        <p role="status" className="px-5 py-4 text-sm">
          {m.letters.unavailable}
        </p>
      ) : letters.length === 0 ? (
        <p className="px-5 py-4 text-sm">{m.letters.none}</p>
      ) : (
        <>
          <div className="overflow-x-auto max-sm:hidden">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{m.letters.caption}</caption>
              <thead>
                <tr className="border-line border-b">
                  {[m.letters.subject, m.letters.list, m.letters.state, m.letters.progress, m.letters.when].map((h) => (
                    <th key={h} scope="col" className="legend whitespace-nowrap px-5 py-2 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {letters.map((letter) => (
                  <tr key={letter.id} className="border-line border-t first:border-t-0">
                    <td className="px-5 py-2.5 font-medium">
                      <Link href={hrefOf(letter)}>{letter.subject}</Link>
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5">{m.lists[letter.list]}</td>
                    <td className="whitespace-nowrap px-5 py-2.5">
                      <State letter={letter} />
                    </td>
                    <td className="tnum whitespace-nowrap px-5 py-2.5">{progressOf(letter)}</td>
                    <td className="tnum whitespace-nowrap px-5 py-2.5">{whenOf(letter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="sm:hidden">
            {letters.map((letter) => (
              <li key={letter.id} className="border-line border-t first:border-t-0">
                <Link href={hrefOf(letter)} aria-label={m.letters.open(letter.subject)} className="text-ink-1 flex flex-col gap-2 px-4 py-3.5 no-underline">
                  <span className="flex items-center gap-2.5">
                    <span className="legend-sm tnum grow">{whenOf(letter)}</span>
                    <span className="text-label">
                      <State letter={letter} />
                    </span>
                  </span>
                  <span className="text-body font-medium">{letter.subject}</span>
                  <span className="grid grid-cols-[72px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1">
                    <span className="legend-sm">{m.letters.list}</span>
                    <span className="text-sm">{m.lists[letter.list]}</span>
                    <span className="legend-sm">{m.letters.progress}</span>
                    <span className="tnum text-sm">{progressOf(letter)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-ink-2 border-line border-t px-5 py-3 text-xs">{m.letters.footer}</p>
    </Plate>
  );
}
```

Check the class list against the two boards line by line (`ConsoleAnnouncements.dc.html:86-104`, `ConsoleAnnouncementsPhone.dc.html`'s `isList` block) and against `abuse-plates.tsx`, which is the house mapping from board pixels to the app's tokens. Where a board value has no token, take the nearest one the other console plates use, never an arbitrary value: `tests/unit/tokens.contract.test.ts` fails on those.

Create `src/console/announcements/page-header.tsx`:

```tsx
import type { ReactNode } from "react";
import { consoleMessages } from "@/console/messages";

const m = consoleMessages.announcements;

/**
 * The page header every Announcements view shares (ConsoleAnnouncements.dc.html:70-82): kicker,
 * title, lead, the "Updated" line and one action. No-access draws it without the line or an action.
 */
export function AnnouncementsHeader({ updated, action }: { readonly updated?: string; readonly action?: ReactNode }) {
  return (
    <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <span className="legend-sm text-accent-text">{m.kicker}</span>
        <h1 className="optical-hang tracking-head mt-2 text-4xl">{m.title}</h1>
        <p className="text-ink-1/70 mt-2 max-w-[56ch]">{m.lead}</p>
        {updated ? <p className="legend mt-3">{m.updated(updated)}</p> : null}
      </div>
      {action ? <div className="max-sm:w-full [&>a]:max-sm:w-full [&>a]:max-sm:justify-center">{action}</div> : null}
    </header>
  );
}
```

- [ ] **Step 4: Write the page**

Create `src/app/console/announcements/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClassName } from "@/components/ui/button";
import { readLetters, type LetterRow } from "@/console/announcements/letters";
import { LettersPlate } from "@/console/announcements/letters-plate";
import { AnnouncementsHeader } from "@/console/announcements/page-header";
import { createConsoleDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { ROLE_RANK } from "@/console/auth/member";
import { ConsoleFrame } from "@/console/components/console-frame";
import { NoAccessState } from "@/console/components/frame-states";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";
import { formatTime } from "@/utils/datetime";

const m = consoleMessages.announcements;

export const metadata: Metadata = { title: m.pageTitle };

/**
 * Module 07, Announcements: the letters. Owner and Admin, per the role matrix.
 *
 * The guard carries no role floor, for the reason /abuse and /team spell out: a role below it must
 * still come back with a `member` to draw inside ConsoleFrame. The database re-checks the floor on
 * every read (console_letters), so this page's check decides what to DRAW, not what is allowed.
 *
 * A read that fails draws "Letters unavailable", never "No letters yet".
 *
 * The Suppressions tab arrives with its own change; a tab that led nowhere would be worse than none.
 */
export default async function AnnouncementsPage() {
  const member = await requireConsoleMember().catch((err: unknown) => {
    if (err instanceof AppError && err.code === "UNAUTHENTICATED") return null;
    throw err;
  });
  if (!member) redirect(consoleHref("/login"));

  if (ROLE_RANK[member.role] < ROLE_RANK.admin) {
    return (
      <ConsoleFrame member={member}>
        <AnnouncementsHeader />
        <div className="mt-6">
          <NoAccessState role={member.role} />
        </div>
      </ConsoleFrame>
    );
  }

  const letters = await readLetters(await createConsoleDb()).catch((): readonly LetterRow[] | null => null);

  return (
    <ConsoleFrame member={member}>
      <AnnouncementsHeader
        updated={formatTime(new Date())}
        action={
          <Link href={consoleHref("/announcements/new")} className={buttonClassName({ variant: "primary" })}>
            {m.newLetter}
          </Link>
        }
      />
      <div className="mt-6 flex flex-col gap-6">
        <LettersPlate letters={letters} />
      </div>
    </ConsoleFrame>
  );
}
```

If the `react-hooks/purity` lint rule rejects `new Date()` in the component body, compute it as `/abuse` does (`new Date().getTime()` into a `const`, then `formatTime(new Date(now))`).

- [ ] **Step 5: Run and commit**

Run: `npx vitest run tests/unit/console/announcements && npm run typecheck && npm run lint`
Expected: PASS, no errors.

```bash
git add src/console/announcements/letters-plate.tsx src/console/announcements/page-header.tsx src/app/console/announcements/page.tsx tests/unit/console/announcements/letters-plate.test.tsx
git commit -m "feat(announce): the letters, as a table and as cards"
```

---

## Task 7: One radiogroup, shared

The composer's List picker is the control `RolePicker` already is: a labelled radiogroup of rows, a name over a description. Its own comment forbids a second one ("Do not author a second radiogroup; if Task 4's is not extractable, extract it"), so it is extracted here, with one addition: a choice can be disabled.

**Files:**
- Create: `src/components/ui/choice-list.tsx`
- Modify: `src/console/team/role-picker.tsx`
- Test: `tests/unit/components/ui/choice-list.test.tsx` (create); `tests/unit/console/team/*` (existing, must stay green untouched)

**Interfaces:**
- Produces: `interface Choice<T extends string> { readonly value: T; readonly label: string; readonly description: string; readonly disabled?: boolean }` and `ChoiceList<T extends string>({ value, choices, labelId, onChange }: { readonly value: T | null; readonly choices: readonly Choice<T>[]; readonly labelId: string; readonly onChange: (value: T) => void })`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/components/ui/choice-list.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChoiceList, type Choice } from "@/components/ui/choice-list";

// The radiogroup RolePicker was, lifted out so the composer's List picker is the same control.
// One addition: a disabled choice (ConsoleAnnouncements.dc.html draws the spent Availability list
// `aria-disabled`, out of the tab order, and it must not be reachable by arrow keys either).
const CHOICES: readonly Choice<"news" | "availability" | "other">[] = [
  { value: "news", label: "News", description: "431 people confirmed." },
  { value: "availability", label: "Availability", description: "Spent.", disabled: true },
  { value: "other", label: "Other", description: "For the arrow keys." },
];

function setup(value: "news" | "availability" | "other" | null = "news") {
  const onChange = vi.fn();
  render(
    <>
      <span id="lbl">List</span>
      <ChoiceList value={value} choices={CHOICES} labelId="lbl" onChange={onChange} />
    </>,
  );
  return onChange;
}

describe("ChoiceList", () => {
  it("is a labelled radiogroup with one checked radio in the tab order", () => {
    setup();
    expect(screen.getByRole("radiogroup", { name: "List" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /News/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /News/ })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: /Other/ })).toHaveAttribute("tabindex", "-1");
  });

  it("marks a disabled choice, keeps it out of the tab order, and ignores a click on it", async () => {
    const onChange = setup();
    const spent = screen.getByRole("radio", { name: /Availability/ });
    expect(spent).toHaveAttribute("aria-disabled", "true");
    expect(spent).toHaveAttribute("tabindex", "-1");
    await userEvent.click(spent);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("moves past a disabled choice with the arrow keys", async () => {
    const onChange = setup();
    screen.getByRole("radio", { name: /News/ }).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(onChange).toHaveBeenCalledWith("other");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/components/ui/choice-list.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Extract**

Create `src/components/ui/choice-list.tsx`:

```tsx
"use client";

import { useRef } from "react";
import { cn } from "@/utils/cn";

export interface Choice<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly description: string;
  /** Drawn at 45%, `aria-disabled`, out of the tab order and skipped by the arrow keys. */
  readonly disabled?: boolean;
}

/**
 * The sheets' `.choice` rows: `role="radiogroup"` labelled by a legend, one `role="radio"` per
 * choice, each a name over a description (ConsoleTeam.dc.html:214-219,
 * ConsoleAnnouncements.dc.html's List picker).
 *
 * The sheets draw each choice as a `<div role="radio">`. A div cannot be operated from the keyboard
 * and is not a button to assistive technology's activation model, so these are
 * `<button type="button" role="radio">` — the accessible choice where the transcription would
 * otherwise conflict. The roving tabindex the sheets draw (0 on the checked choice, -1 on the rest)
 * is kept exactly, and arrow keys move the selection the way the radiogroup pattern requires.
 *
 * `value` may be null: a radiogroup with nothing checked still needs one tabbable choice, so the
 * tab stop sits on the first enabled one, and the first arrow key picks the end it points at.
 *
 * A disabled choice is `aria-disabled` rather than `disabled`, as the sheet draws it, so it stays
 * readable to a screen reader with its reason in the description.
 */
export function ChoiceList<T extends string>({
  value,
  choices,
  labelId,
  onChange,
}: {
  readonly value: T | null;
  readonly choices: readonly Choice<T>[];
  readonly labelId: string;
  readonly onChange: (value: T) => void;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = choices.filter((c) => !c.disabled);
  const checked = value === null ? -1 : enabled.findIndex((c) => c.value === value);
  const tabStop = checked === -1 ? enabled[0]?.value : value;

  function move(delta: number): void {
    const next = checked === -1 ? enabled[delta > 0 ? 0 : enabled.length - 1] : enabled[(checked + delta + enabled.length) % enabled.length];
    if (!next) return;
    onChange(next.value);
    buttons.current[choices.indexOf(next)]?.focus();
  }

  return (
    <div role="radiogroup" aria-labelledby={labelId} className="flex flex-col">
      {choices.map((choice, index) => (
        <button
          key={choice.value}
          ref={(node) => {
            buttons.current[index] = node;
          }}
          type="button"
          role="radio"
          aria-checked={value === choice.value}
          aria-disabled={choice.disabled ? true : undefined}
          tabIndex={!choice.disabled && choice.value === tabStop ? 0 : -1}
          onClick={() => {
            if (!choice.disabled) onChange(choice.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowRight") {
              event.preventDefault();
              move(1);
            } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
              event.preventDefault();
              move(-1);
            }
          }}
          className={cn(
            "press flex items-start gap-2.5 border-b border-line px-1 py-2.5 text-left last:border-b-0",
            choice.disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer hover:bg-ink-1/5",
          )}
        >
          <span aria-hidden="true" className={cn("mt-1 size-3.5 shrink-0 border", value === choice.value ? "border-accent-strong bg-accent-strong" : "border-line-strong bg-surface-1")} />
          <span className="flex min-w-0 flex-col">
            <span className="text-sm font-medium leading-5">{choice.label}</span>
            <span className="text-label leading-5 text-ink-3">{choice.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
```

Then reduce `src/console/team/role-picker.tsx` to a wrapper. Keep its file comment's first paragraph and replace the rest of the body:

```tsx
"use client";

import { ChoiceList } from "@/components/ui/choice-list";
import type { ConsoleRole } from "@/console/auth/member";
import { consoleMessages } from "@/console/messages";

const f = consoleMessages.frame;

/**
 * The sheet's role picker (ConsoleTeam.dc.html:214-219), now the shared ChoiceList with the roles
 * as its choices. Which roles to draw is the caller's: the invite offers all four, the change-role
 * picker every role but the member's own. The descriptions are imported, never restated
 * (consoleMessages.team.roleDescription).
 */
export function RolePicker({
  value,
  roles,
  labelId,
  onChange,
}: {
  readonly value: ConsoleRole | null;
  readonly roles: readonly ConsoleRole[];
  readonly labelId: string;
  readonly onChange: (role: ConsoleRole) => void;
}) {
  const choices = roles.map((role) => ({ value: role, label: f.roleLabel[role], description: consoleMessages.team.roleDescription[role] }));
  return <ChoiceList value={value} choices={choices} labelId={labelId} onChange={onChange} />;
}
```

- [ ] **Step 4: Run and commit**

Run: `npx vitest run tests/unit/components/ui/choice-list.test.tsx tests/unit/console/team`
Expected: PASS, with every existing team test untouched. A team test that fails here is a behaviour the extraction changed: fix the extraction, not the test.

```bash
git add src/components/ui/choice-list.tsx src/console/team/role-picker.tsx tests/unit/components/ui/choice-list.test.tsx
git commit -m "refactor(ui): lift the radiogroup out of the role picker, and let a choice be disabled"
```

---

## Task 8: The test send

**Files:**
- Create: `src/console/announcements/test-send.ts`
- Test: `tests/unit/console/announcements/test-send.test.ts`

**Interfaces:**
- Consumes: `readLetter`, `recordTest` (Task 3); `letterText` from `@/services/announcements/letter`; `Letter` from `@/services/email/send`; `DoorResult`, `MailKind` from `@/services/email/suppression`.
- Produces:
  - `interface TestSendDeps { readonly db: ConsoleDb; readonly send: (letter: Letter, kind: MailKind) => Promise<DoorResult>; readonly counted: () => Promise<void> }`
  - `sendTest(ask: { readonly id: string; readonly to: string; readonly from: string; readonly origin: string; readonly environment: string }, deps: TestSendDeps): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/console/announcements/test-send.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LetterDetail } from "@/console/announcements/letters";
import type { ConsoleDb } from "@/console/auth/db";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

const { readLetter, recordTest } = vi.hoisted(() => ({
  readLetter: vi.fn<(db: unknown, id: string) => Promise<LetterDetail | null>>(),
  recordTest: vi.fn<(db: unknown, environment: string, id: string) => Promise<void>>(async () => {}),
}));
vi.mock("@/console/announcements/letters", () => ({ readLetter, recordTest }));

import { sendTest, type TestSendDeps } from "@/console/announcements/test-send";

// ---------------------------------------------------------------------------
// The test send: one real email to the member's own address, reading as a
// subscriber's will, and recorded only once it has actually gone. The order is
// the point — a test recorded but never sent would unlock Queue for a letter
// nobody has seen.
// ---------------------------------------------------------------------------

const m = consoleMessages.announcements.errors;
const ID = "a0000000-0000-4000-8000-000000000001";
const DRAFT: LetterDetail = {
  id: ID, list: "news", subject: "What is coming", body: "Hello,\n\nTwo things.\n", state: "draft", total: 0,
  sent: 0, skipped: 0, unknown: 0, waiting: 0, sentToday: 0,
  createdAt: "2026-09-18T04:00:00+00:00", queuedAt: null, stoppedAt: null, finishedAt: null,
  testSentAt: null, testSentTo: null, queuedBy: null, stoppedBy: null,
};
const ASK = { id: ID, to: "asha@trakline.in", from: "Trakline <updates@trakline.in>", origin: "https://trakline.in", environment: "production" };

function deps(outcome: "sent" | "captured" | "failed" | "suppressed" = "sent"): TestSendDeps & { send: ReturnType<typeof vi.fn>; counted: ReturnType<typeof vi.fn> } {
  return {
    db: {} as ConsoleDb,
    send: vi.fn(async () => (outcome === "sent" ? { outcome, id: "re_1" } : { outcome })),
    counted: vi.fn(async () => {}),
  } as TestSendDeps & { send: ReturnType<typeof vi.fn>; counted: ReturnType<typeof vi.fn> };
}

async function message(run: Promise<unknown>): Promise<string> {
  const err = await run.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  return (err as AppError).message;
}

beforeEach(() => {
  readLetter.mockReset().mockResolvedValue(DRAFT);
  recordTest.mockReset().mockResolvedValue(undefined);
});

describe("sendTest", () => {
  it("sends the letter as a reader would get it, to the member's own address, as transactional mail", async () => {
    const d = deps();
    await sendTest(ASK, d);
    const [letter, kind] = d.send.mock.calls[0]!;
    expect(kind).toBe("transactional");
    expect(letter).toMatchObject({ to: "asha@trakline.in", from: ASK.from, subject: "What is coming" });
    expect(letter.text.startsWith("Hello,\n\nTwo things.\n\n")).toBe(true);
    expect(letter.text.trimEnd().endsWith("https://trakline.in/unsubscribe")).toBe(true);
  });

  it("carries no one-click headers and no signed link: a test must not be able to unsubscribe a real person", async () => {
    const d = deps();
    await sendTest(ASK, d);
    const [letter] = d.send.mock.calls[0]!;
    expect(letter.headers).toBeUndefined();
    expect(letter.text).not.toMatch(/unsubscribe\?/);
  });

  it("counts the email and records the test, in that order, after the send", async () => {
    const d = deps();
    await sendTest(ASK, d);
    expect(d.counted).toHaveBeenCalledTimes(1);
    expect(recordTest).toHaveBeenCalledWith(d.db, "production", ID);
    expect(d.send.mock.invocationCallOrder[0]!).toBeLessThan(recordTest.mock.invocationCallOrder[0]!);
  });

  it("counts a captured send too: under E2E the outbox stands in for the mail service", async () => {
    const d = deps("captured");
    await sendTest(ASK, d);
    expect(recordTest).toHaveBeenCalled();
  });

  it("records nothing when the send failed", async () => {
    const d = deps("failed");
    expect(await message(sendTest(ASK, d))).toBe(m.testFailed);
    expect(recordTest).not.toHaveBeenCalled();
    expect(d.counted).not.toHaveBeenCalled();
  });

  it("says so when the member's own address is suppressed", async () => {
    expect(await message(sendTest(ASK, deps("suppressed")))).toBe(m.testSuppressed);
    expect(recordTest).not.toHaveBeenCalled();
  });

  it("refuses a letter that is not a draft, or not there, before sending anything", async () => {
    const d = deps();
    readLetter.mockResolvedValueOnce({ ...DRAFT, state: "sending" });
    expect(await message(sendTest(ASK, d))).toBe(m.notDraft);
    readLetter.mockResolvedValueOnce(null);
    expect(await message(sendTest(ASK, d))).toBe(m.gone);
    expect(d.send).not.toHaveBeenCalled();
  });

  it("says the test went but was not recorded, when only the record failed", async () => {
    recordTest.mockRejectedValueOnce(new AppError("SOURCE_UNAVAILABLE", m.database));
    expect(await message(sendTest(ASK, deps()))).toBe(m.testUnrecorded);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/console/announcements/test-send.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/console/announcements/test-send.ts`:

```ts
import { readLetter, recordTest } from "@/console/announcements/letters";
import type { ConsoleDb } from "@/console/auth/db";
import { consoleMessages } from "@/console/messages";
import { letterText } from "@/services/announcements/letter";
import type { Letter } from "@/services/email/send";
import type { DoorResult, MailKind } from "@/services/email/suppression";
import { AppError } from "@/services/errors";

// The test send. One real email to the member's own address, reading exactly as a subscriber's
// will: the same subject, the same body, the same unsubscribe line. It is the only time anyone sees
// the letter as a reader does, and the last point at which a mistake costs nothing — which is why
// the database will not queue a letter until this has been recorded (announce_queue).
//
// SEND, THEN RECORD. A test recorded but never sent would unlock Queue for a letter nobody has seen.
// The cost of this order is the case where the email went and the record failed: the member is told
// so and sends again, which spends one more email and nothing else.
//
// The unsubscribe link is the bare /unsubscribe page, which answers "invalid link". A test must
// never carry a signed link, because a signed link unsubscribes a real person; and it carries no
// List-Unsubscribe headers, because a mail client's own button would POST to them.

const m = consoleMessages.announcements.errors;

export interface TestSendDeps {
  readonly db: ConsoleDb;
  /** The one door all mail goes through (src/services/email/suppression.ts). */
  readonly send: (letter: Letter, kind: MailKind) => Promise<DoorResult>;
  /** Adds one to the day's shared email count. Best-effort, as `countSent` is. */
  readonly counted: () => Promise<void>;
}

export async function sendTest(
  ask: { readonly id: string; readonly to: string; readonly from: string; readonly origin: string; readonly environment: string },
  deps: TestSendDeps,
): Promise<void> {
  const letter = await readLetter(deps.db, ask.id);
  if (!letter) throw new AppError("NOT_FOUND", m.gone);
  if (letter.state !== "draft") throw new AppError("INVALID_INPUT", m.notDraft);

  // `transactional`: the member asked for this email, this minute. A complaint-level suppression
  // must not stop it; a hard bounce still does, and the member is told.
  const result = await deps.send(
    { from: ask.from, to: ask.to, subject: letter.subject, text: letterText(letter.body, `${ask.origin}/unsubscribe`, letter.list) },
    "transactional",
  );
  if (result.outcome === "suppressed") throw new AppError("INVALID_INPUT", m.testSuppressed);
  // INVALID_INPUT with a 502, here and below, and not SOURCE_UNAVAILABLE: `consoleApiMessage`
  // replaces every SOURCE_UNAVAILABLE with one generic sentence, and these two are sentences the
  // member must read as written — one says nothing was recorded, the other says to send again.
  if (result.outcome === "failed") throw new AppError("INVALID_INPUT", m.testFailed, { status: 502 });

  await deps.counted();
  try {
    await recordTest(deps.db, ask.environment, ask.id);
  } catch {
    throw new AppError("INVALID_INPUT", m.testUnrecorded, { status: 502 });
  }
}
```

- [ ] **Step 4: Run and commit**

Run: `npx vitest run tests/unit/console/announcements/test-send.test.ts`
Expected: PASS.

```bash
git add src/console/announcements/test-send.ts tests/unit/console/announcements/test-send.test.ts
git commit -m "feat(announce): a test send that is recorded only once it has gone"
```

---

## Task 9: The four routes, and the client that calls them

**Files:**
- Create: `src/console/announcements/routes.ts`, `src/console/announcements/letters-client.ts`
- Create: `src/app/console/api/announcements/save/route.ts`, `test/route.ts`, `queue/route.ts`, `stop/route.ts`
- Test: `tests/integration/console/announcements-routes.test.ts`

**Interfaces:**
- Consumes: `saveLetter`, `queueLetter`, `stopLetter`, `LETTER_LISTS` (Task 3); `sendTest`, `TestSendDeps` (Task 8).
- Produces:
  - `saveBody`, `letterBody` (zod), `testDeps(): Promise<TestSendDeps>`, `travellerOriginFor(req: Request): string` from `routes.ts`.
  - `POST /api/announcements/save` `{ id?, list, subject, body }` → `{ ok: true, id }`
  - `POST /api/announcements/test` `{ id }` → `{ ok: true }`
  - `POST /api/announcements/queue` `{ id }` → `{ ok: true, people }`
  - `POST /api/announcements/stop` `{ id }` → `{ ok: true }`
  - From `letters-client.ts`: `type Outcome = { readonly kind: "done" } | { readonly kind: "failed"; readonly message: string }`; `requestSave(letter): Promise<{ kind: "done"; id: string } | Failed>`; `requestTest(id): Promise<Outcome>`; `requestQueue(id): Promise<{ kind: "done"; people: number } | Failed>`; `requestStop(id): Promise<Outcome>`.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/console/announcements-routes.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleMember } from "@/console/auth/member";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

const { requireConsoleMember, saveLetter, queueLetter, stopLetter, sendTest, consoleEnvironment } = vi.hoisted(() => ({
  requireConsoleMember: vi.fn<(least?: string) => Promise<ConsoleMember>>(),
  saveLetter: vi.fn<(db: unknown, letter: unknown) => Promise<string>>(),
  queueLetter: vi.fn<(db: unknown, environment: string, id: string) => Promise<number>>(),
  stopLetter: vi.fn<(db: unknown, environment: string, id: string) => Promise<void>>(async () => {}),
  sendTest: vi.fn<(ask: unknown, deps: unknown) => Promise<void>>(async () => {}),
  consoleEnvironment: vi.fn<() => string>(() => "production"),
}));

vi.mock("@/console/auth/guard", () => ({ requireConsoleMember }));
vi.mock("@/console/auth/session", () => ({ consoleEnvironment }));
vi.mock("@/console/availability", () => ({ assertConsoleAvailable: () => {} }));
vi.mock("@/console/auth/db", () => ({ createConsoleDb: async () => ({ rpc: vi.fn() }), createConsoleServiceDb: () => ({ rpc: vi.fn() }) }));
vi.mock("@/console/announcements/letters", async (original) => ({ ...(await original<typeof import("@/console/announcements/letters")>()), saveLetter, queueLetter, stopLetter }));
vi.mock("@/console/announcements/test-send", () => ({ sendTest }));
vi.mock("@/services/email/suppression", () => ({ sendToAddress: vi.fn() }));

import { POST as queue } from "@/app/console/api/announcements/queue/route";
import { POST as save } from "@/app/console/api/announcements/save/route";
import { POST as stop } from "@/app/console/api/announcements/stop/route";
import { POST as test } from "@/app/console/api/announcements/test/route";

// ---------------------------------------------------------------------------
// Module 07's four routes. Each carries the Admin floor itself (a route has no
// frame to draw a no-access state in), the same-origin check every mutating
// console route has, and decides the environment and the recipient itself —
// never the caller.
// ---------------------------------------------------------------------------

const OWNER: ConsoleMember = { userId: "a0000000-0000-4000-8000-000000000001", email: "asha@trakline.in", name: "Asha Rao", role: "owner", status: "active" };
const ID = "b0000000-0000-4000-8000-000000000002";
const m = consoleMessages.announcements;

function post(path: string, body: unknown, origin = "https://admin.trakline.in"): Request {
  return new Request(`https://admin.trakline.in${path}`, { method: "POST", headers: { "content-type": "application/json", host: "admin.trakline.in", origin }, body: JSON.stringify(body) });
}

beforeEach(() => {
  requireConsoleMember.mockReset().mockResolvedValue(OWNER);
  saveLetter.mockReset().mockResolvedValue(ID);
  queueLetter.mockReset().mockResolvedValue(431);
  stopLetter.mockClear();
  sendTest.mockClear();
});

describe("POST /api/announcements/save", () => {
  it("saves a new draft and answers its id", async () => {
    const response = await save(post("/api/announcements/save", { list: "news", subject: "  What is coming ", body: "Hello" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, id: ID });
    expect(saveLetter).toHaveBeenCalledWith(expect.anything(), { list: "news", subject: "What is coming", body: "Hello" });
    expect(requireConsoleMember).toHaveBeenCalledWith("admin");
  });

  it("passes an existing draft's id through", async () => {
    await save(post("/api/announcements/save", { id: ID, list: "news", subject: "S", body: "B" }));
    expect(saveLetter).toHaveBeenCalledWith(expect.anything(), { id: ID, list: "news", subject: "S", body: "B" });
  });

  it.each([
    [{ list: "news", subject: "", body: "B" }, m.compose.subjectNeeded],
    [{ list: "news", subject: "x".repeat(201), body: "B" }, m.compose.subjectTooLong],
    [{ list: "news", subject: "S", body: "   " }, m.compose.bodyNeeded],
    [{ list: "news", subject: "S", body: "x".repeat(20001) }, m.compose.bodyTooLong],
  ])("refuses %j in the form's own words", async (body, shown) => {
    const response = await save(post("/api/announcements/save", body));
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain(shown);
    expect(saveLetter).not.toHaveBeenCalled();
  });

  it("refuses a field nobody asked for: the caller never names a member or an environment", async () => {
    const response = await save(post("/api/announcements/save", { list: "news", subject: "S", body: "B", environment: "preview" }));
    expect(response.status).toBe(400);
  });

  it("refuses another origin", async () => {
    const response = await save(post("/api/announcements/save", { list: "news", subject: "S", body: "B" }, "https://evil.example"));
    expect(response.status).toBe(403);
    expect(saveLetter).not.toHaveBeenCalled();
  });

  it("refuses a role below Admin", async () => {
    requireConsoleMember.mockRejectedValueOnce(new AppError("INVALID_INPUT", "no access", { status: 403 }));
    expect((await save(post("/api/announcements/save", { list: "news", subject: "S", body: "B" }))).status).toBe(403);
  });
});

describe("POST /api/announcements/test", () => {
  it("sends to the signed-in member's own address, from the traveller side's sender, under this environment", async () => {
    const response = await test(post("/api/announcements/test", { id: ID }));
    expect(response.status).toBe(200);
    const [ask] = sendTest.mock.calls[0]!;
    expect(ask).toMatchObject({ id: ID, to: "asha@trakline.in", environment: "production" });
  });

  it("refuses a body that names a recipient", async () => {
    const response = await test(post("/api/announcements/test", { id: ID, to: "someone@example.com" }));
    expect(response.status).toBe(400);
    expect(sendTest).not.toHaveBeenCalled();
  });

  it("answers the test's own failure", async () => {
    sendTest.mockRejectedValueOnce(new AppError("INVALID_INPUT", m.errors.testFailed, { status: 502 }));
    const response = await test(post("/api/announcements/test", { id: ID }));
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(JSON.stringify(await response.json())).toContain(m.errors.testFailed);
  });
});

describe("POST /api/announcements/queue and /stop", () => {
  it("queues under the server's environment and answers how many people", async () => {
    const response = await queue(post("/api/announcements/queue", { id: ID }));
    expect(await response.json()).toEqual({ ok: true, people: 431 });
    expect(queueLetter).toHaveBeenCalledWith(expect.anything(), "production", ID);
  });

  it("answers the database's refusal in the console's words", async () => {
    queueLetter.mockRejectedValueOnce(new AppError("INVALID_INPUT", m.errors.notTested));
    const response = await queue(post("/api/announcements/queue", { id: ID }));
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain(m.errors.notTested);
  });

  it("stops by id", async () => {
    const response = await stop(post("/api/announcements/stop", { id: ID }));
    expect(response.status).toBe(200);
    expect(stopLetter).toHaveBeenCalledWith(expect.anything(), "production", ID);
  });

  it("refuses an id that is not one, on both", async () => {
    expect((await queue(post("/api/announcements/queue", { id: "42" }))).status).toBe(400);
    expect((await stop(post("/api/announcements/stop", { id: "42" }))).status).toBe(400);
  });

  it("refuses another origin, on both", async () => {
    expect((await queue(post("/api/announcements/queue", { id: ID }, "https://evil.example"))).status).toBe(403);
    expect((await stop(post("/api/announcements/stop", { id: ID }, "https://evil.example"))).status).toBe(403);
    expect(queueLetter).not.toHaveBeenCalled();
    expect(stopLetter).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/integration/console/announcements-routes.test.ts`
Expected: FAIL — the route modules do not exist.

- [ ] **Step 3: Implement the shared wiring**

Create `src/console/announcements/routes.ts`:

```ts
import { z } from "zod";
import { LETTER_LISTS } from "@/console/announcements/letters";
import type { TestSendDeps } from "@/console/announcements/test-send";
import { createConsoleDb } from "@/console/auth/db";
import { consoleMessages } from "@/console/messages";
import { countSent } from "@/services/email/allowance";
import { sendToAddress } from "@/services/email/suppression";
import { env } from "@/services/env";
import { publicStore } from "@/services/shared-store";
import { travellerOrigin } from "@/services/subscriptions/links";

// What module 07's routes share: the body shapes and the wiring of the real stores. Kept out of the
// route files so each route reads as its steps.

const c = consoleMessages.announcements.compose;

// `.strict()` on both: the member, the recipient of a test and the environment are the server's to
// decide. A browser that could name any of them could mail a stranger or file a record elsewhere.
export const saveBody = z
  .object({
    id: z.guid().optional(),
    list: z.enum(LETTER_LISTS),
    subject: z.string().trim().min(1, c.subjectNeeded).max(200, c.subjectTooLong),
    body: z
      .string()
      .max(20000, c.bodyTooLong)
      .refine((value) => value.trim().length > 0, c.bodyNeeded),
  })
  .strict();

export const letterBody = z.object({ id: z.guid() }).strict();

/**
 * The traveller site's origin, from the console's own host: the test's unsubscribe line links
 * there. Empty when the host is one this deployment does not serve.
 */
export function travellerOriginFor(req: Request): string {
  return travellerOrigin((req.headers.get("host") ?? "").replace(/^admin\./, ""), env().VERCEL_ENV);
}

export async function testDeps(): Promise<TestSendDeps> {
  const store = publicStore();
  return {
    db: await createConsoleDb(),
    send: (letter, kind) => sendToAddress(letter, kind),
    counted: () => countSent(store.kv, store.prefix, new Date()),
  };
}
```

- [ ] **Step 4: Implement the routes**

Create `src/app/console/api/announcements/save/route.ts`:

```ts
import { saveLetter } from "@/console/announcements/letters";
import { saveBody } from "@/console/announcements/routes";
import { createConsoleDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { assertConsoleAvailable } from "@/console/availability";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

/**
 * POST /api/announcements/save — a new draft, or a change to one. `console_save_letter` re-checks
 * the Admin floor, refuses anything but a draft, and clears the test when the text changed.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember("admin");
    const { id, list, subject, body } = await readBody(req, saveBody);
    const saved = await saveLetter(await createConsoleDb(), id ? { id, list, subject, body } : { list, subject, body });
    return jsonOk({ ok: true, id: saved });
  } catch (err) {
    return jsonError(err);
  }
}
```

Create `src/app/console/api/announcements/test/route.ts`:

```ts
import { letterBody, testDeps, travellerOriginFor } from "@/console/announcements/routes";
import { sendTest } from "@/console/announcements/test-send";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { consoleMessages } from "@/console/messages";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { env } from "@/services/env";
import { AppError } from "@/services/errors";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

/**
 * POST /api/announcements/test — one real email of this draft, to the signed-in member's own
 * address and nobody else's: the body carries the letter's id and nothing more. test-send.ts says
 * why it sends first and records second.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    const member = await requireConsoleMember("admin");
    const { id } = await readBody(req, letterBody);
    const origin = travellerOriginFor(req);
    if (!origin) throw new AppError("INVALID_INPUT", consoleMessages.announcements.errors.testFailed, { status: 502 });
    await sendTest({ id, to: member.email, from: env().SUBSCRIBE_EMAIL_FROM, origin, environment: consoleEnvironment() }, await testDeps());
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
```

Create `src/app/console/api/announcements/queue/route.ts`:

```ts
import { queueLetter } from "@/console/announcements/letters";
import { letterBody } from "@/console/announcements/routes";
import { createConsoleDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

/**
 * POST /api/announcements/queue — fixes who gets the letter and hands it to the daily send.
 * `console_queue_letter` re-checks the Admin floor and every rule (a draft, a test made, a list
 * with someone on it, the Availability list unspent), and writes the audit row in the same
 * transaction.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember("admin");
    const { id } = await readBody(req, letterBody);
    const people = await queueLetter(await createConsoleDb(), consoleEnvironment(), id);
    return jsonOk({ ok: true, people });
  } catch (err) {
    return jsonError(err);
  }
}
```

Create `src/app/console/api/announcements/stop/route.ts`:

```ts
import { stopLetter } from "@/console/announcements/letters";
import { letterBody } from "@/console/announcements/routes";
import { createConsoleDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

/**
 * POST /api/announcements/stop — halts the rest of an open letter. What has gone has gone. The send
 * job reads the letter's state before every recipient, so this takes effect at the next one.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember("admin");
    const { id } = await readBody(req, letterBody);
    await stopLetter(await createConsoleDb(), consoleEnvironment(), id);
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
```

- [ ] **Step 5: Implement the client**

Create `src/console/announcements/letters-client.ts`:

```ts
"use client";

import { z } from "zod";
import { consoleApiMessage } from "@/console/api-message";
import { apiRequest } from "@/services/api-client";

// Module 07's four network calls, kept out of the components so their tests mock functions rather
// than fetch — the same split abuse-client.ts and team-client.ts use.

export type Failed = { readonly kind: "failed"; readonly message: string };
export type Outcome = { readonly kind: "done" } | Failed;

const doneSchema = z.object({ ok: z.literal(true) }).strict();
const savedSchema = z.object({ ok: z.literal(true), id: z.string() }).strict();
const queuedSchema = z.object({ ok: z.literal(true), people: z.number() }).strict();

function post(body: unknown): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export async function requestSave(letter: { readonly id?: string; readonly list: string; readonly subject: string; readonly body: string }): Promise<{ readonly kind: "done"; readonly id: string } | Failed> {
  const result = await apiRequest("/api/announcements/save", post(letter), savedSchema);
  return result.ok ? { kind: "done", id: result.data.id } : { kind: "failed", message: consoleApiMessage(result.error) };
}

export async function requestTest(id: string): Promise<Outcome> {
  const result = await apiRequest("/api/announcements/test", post({ id }), doneSchema);
  return result.ok ? { kind: "done" } : { kind: "failed", message: consoleApiMessage(result.error) };
}

export async function requestQueue(id: string): Promise<{ readonly kind: "done"; readonly people: number } | Failed> {
  const result = await apiRequest("/api/announcements/queue", post({ id }), queuedSchema);
  return result.ok ? { kind: "done", people: result.data.people } : { kind: "failed", message: consoleApiMessage(result.error) };
}

export async function requestStop(id: string): Promise<Outcome> {
  const result = await apiRequest("/api/announcements/stop", post({ id }), doneSchema);
  return result.ok ? { kind: "done" } : { kind: "failed", message: consoleApiMessage(result.error) };
}
```

`consoleApiMessage` passes every code through as written except `SOURCE_UNAVAILABLE` and `INTERNAL`, which it replaces with "The console could not be reached. Try again." So `m.errors.database` is never shown word for word (the generic line stands in for it, which is right for a database fault), and the two test-send sentences are thrown as `INVALID_INPUT` for exactly this reason.

- [ ] **Step 6: Run and commit**

Run: `npx vitest run tests/integration/console/announcements-routes.test.ts && npm run typecheck`
Expected: PASS.

```bash
git add src/console/announcements/routes.ts src/console/announcements/letters-client.ts src/app/console/api/announcements tests/integration/console/announcements-routes.test.ts
git commit -m "feat(announce): the four routes — save, test, queue, stop — each deciding the member and the environment itself"
```

---

## Task 10: Compose

**Files:**
- Modify: `src/components/ui/confirm-dialog.tsx` (a `before` slot)
- Create: `src/console/announcements/queue-dialog.tsx`, `compose-form.tsx`, `compose-readonly.tsx`, `how-plate.tsx`
- Create: `src/app/console/announcements/new/page.tsx`, `src/app/console/announcements/[id]/page.tsx`
- Test: `tests/unit/console/announcements/compose-form.test.tsx`, `tests/unit/console/announcements/compose-readonly.test.tsx`

**Interfaces:**
- Consumes: `requestSave`, `requestTest`, `requestQueue` (Task 9); `daysFor`, `finishDate`, `Ahead`, `lettersAhead` (Task 4); `ChoiceList` (Task 7); `ListCounts`, `LetterList`, `LetterDetail`, `readLetter`, `readLetters`, `readLists` (Task 3).
- Produces:
  - `<ConfirmDialog before={ReactNode} />`: content between the title and the description.
  - `interface ComposeLetter { readonly id: string; readonly list: LetterList; readonly subject: string; readonly body: string; readonly testSentAt: string | null; readonly testSentTo: string | null }`
  - `ComposeForm({ letter, lists, email, ahead, now }: { readonly letter: ComposeLetter | null; readonly lists: ListCounts; readonly email: string; readonly ahead: Ahead | null; readonly now: string })`
  - `ComposeReadonly({ letter, lists }: { readonly letter: ComposeLetter | null; readonly lists: ListCounts })`
  - `HowPlate({ titleId }: { readonly titleId: string })`
  - `QueueDialog({ open, onOpenChange, list, subject, people, ahead, now, onConfirm })`

- [ ] **Step 1: Write the failing form test**

Create `tests/unit/console/announcements/compose-form.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ListCounts } from "@/console/announcements/letters";
import { consoleMessages } from "@/console/messages";

const { replace, refresh, requestSave, requestTest, requestQueue, success, error } = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  requestSave: vi.fn(),
  requestTest: vi.fn(),
  requestQueue: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
vi.mock("@/console/announcements/letters-client", () => ({ requestSave, requestTest, requestQueue }));
vi.mock("@/components/ui/toast", () => ({ notify: { success, error } }));

import { ComposeForm, type ComposeLetter } from "@/console/announcements/compose-form";

// ---------------------------------------------------------------------------
// ConsoleAnnouncements.dc.html, Compose and Queue confirm. The board's rule is
// that Queue stays off, with its reason beside it, until a test send has been
// made. Two more reasons are this form's own: unsaved changes, and an empty list.
// ---------------------------------------------------------------------------

const m = consoleMessages.announcements;
const ID = "a0000000-0000-4000-8000-000000000001";
const LISTS: ListCounts = { news: 431, availability: 0, availabilitySpent: true, availabilitySpentAt: "2026-09-06T08:40:00+00:00" };
const NOW = "2026-09-19T09:02:00+00:00";
const DRAFT: ComposeLetter = { id: ID, list: "news", subject: "Trakline news: what's coming next", body: "Hello,\n\nTwo things.", testSentAt: null, testSentTo: null };
const TESTED: ComposeLetter = { ...DRAFT, testSentAt: "2026-09-19T08:50:00+00:00", testSentTo: "asha@example.com" };

const form = (letter: ComposeLetter | null, over: Partial<{ lists: ListCounts; ahead: { subject: string; more: number; days: number } | null }> = {}) =>
  render(<ComposeForm letter={letter} lists={over.lists ?? LISTS} email="asha@example.com" ahead={over.ahead ?? null} now={NOW} />);
const queue = () => screen.getByRole("button", { name: m.compose.queue });
const testButton = () => screen.getByRole("button", { name: m.compose.test.send });

beforeEach(() => {
  for (const fn of [replace, refresh, requestSave, requestTest, requestQueue, success, error]) fn.mockReset();
});

describe("a new letter", () => {
  it("cannot be tested or queued before it is saved, and says a test has not been made", () => {
    form(null);
    expect(testButton()).toBeDisabled();
    expect(queue()).toBeDisabled();
    expect(queue()).toHaveAccessibleDescription(m.compose.notTested);
    expect(screen.getByText(m.compose.test.notSent)).toBeInTheDocument();
  });

  it("refuses an empty subject in the form's own words, without a request", async () => {
    form(null);
    await userEvent.type(screen.getByLabelText(m.compose.body), "Hello");
    await userEvent.click(screen.getByRole("button", { name: m.compose.save }));
    expect(screen.getByText(m.compose.subjectNeeded)).toBeInTheDocument();
    expect(requestSave).not.toHaveBeenCalled();
  });

  it("saves, says so, and moves to the draft's own address", async () => {
    requestSave.mockResolvedValue({ kind: "done", id: ID });
    form(null);
    await userEvent.type(screen.getByLabelText(m.compose.subject), "  What is coming ");
    await userEvent.type(screen.getByLabelText(m.compose.body), "Hello");
    await userEvent.click(screen.getByRole("button", { name: m.compose.save }));
    expect(requestSave).toHaveBeenCalledWith({ list: "news", subject: "What is coming", body: "Hello" });
    expect(success).toHaveBeenCalledWith(m.compose.saved);
    expect(replace).toHaveBeenCalledWith(`/announcements/${ID}`);
  });

  it("draws the spent Availability list disabled, with the day its one send finished", () => {
    form(null);
    const spent = screen.getByRole("radio", { name: /Availability/ });
    expect(spent).toHaveAttribute("aria-disabled", "true");
    expect(spent).toHaveTextContent(/^Availability\s*Spent\. Its one send finished on 6 Sep/);
    expect(screen.getByRole("radio", { name: /News/ })).toHaveTextContent("431 people confirmed.");
  });
});

describe("a saved draft", () => {
  it("can be tested, and still cannot be queued until it has been", async () => {
    requestTest.mockResolvedValue({ kind: "done" });
    form(DRAFT);
    expect(queue()).toBeDisabled();
    await userEvent.click(testButton());
    expect(requestTest).toHaveBeenCalledWith(ID);
    expect(success).toHaveBeenCalledWith(m.compose.test.done);
    expect(refresh).toHaveBeenCalled();
  });

  it("shows a failed test's reason and changes nothing", async () => {
    requestTest.mockResolvedValue({ kind: "failed", message: m.errors.testFailed });
    form(DRAFT);
    await userEvent.click(testButton());
    expect(error).toHaveBeenCalledWith(m.errors.testFailed);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("a tested draft", () => {
  it("can be queued, and says how many people and how long", () => {
    form(TESTED);
    expect(queue()).toBeEnabled();
    expect(queue()).toHaveAccessibleDescription(m.compose.ready("431", 11));
    expect(screen.getByText(/^Sent at .* IST to asha@example\.com$/)).toBeInTheDocument();
  });

  it("says it goes after the letter ahead when there is one", () => {
    form(TESTED, { ahead: { subject: "A clearer chart view", more: 0, days: 4 } });
    expect(queue()).toHaveAccessibleDescription(m.compose.readyBehind("431", 11));
  });

  it("goes back to needing a save the moment its words change", async () => {
    form(TESTED);
    await userEvent.type(screen.getByLabelText(m.compose.body), " More.");
    expect(queue()).toBeDisabled();
    expect(queue()).toHaveAccessibleDescription(m.compose.unsaved);
    expect(testButton()).toBeDisabled();
  });

  it("cannot be queued to a list with nobody on it", () => {
    form(TESTED, { lists: { ...LISTS, news: 0 } });
    expect(queue()).toBeDisabled();
    expect(queue()).toHaveAccessibleDescription(m.compose.nobody);
  });

  it("asks before queueing, naming the list, the subject, the people, the letter ahead and the finish", async () => {
    requestQueue.mockResolvedValue({ kind: "done", people: 431 });
    form(TESTED, { ahead: { subject: "A clearer chart view", more: 0, days: 4 } });
    await userEvent.click(queue());
    const dialog = screen.getByRole("alertdialog", { name: m.queueDialog.title });
    expect(within(dialog).getByText("431")).toBeInTheDocument();
    expect(within(dialog).getByText(m.queueDialog.behindOne("A clearer chart view", 4))).toBeInTheDocument();
    expect(within(dialog).getByText(m.queueDialog.takesBehind(11))).toBeInTheDocument();
    expect(within(dialog).getByText(/^Around 4 Oct/)).toBeInTheDocument();
    expect(requestQueue).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: m.queueDialog.confirm }));
    expect(requestQueue).toHaveBeenCalledWith(ID);
    expect(success).toHaveBeenCalledWith(m.compose.queued);
    expect(refresh).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/console/announcements/compose-form.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Give ConfirmDialog a slot above its description**

The Queue dialog draws its key-value list *between* the title and the sentence (`ConsoleAnnouncements.dc.html:276-300`), and "Stop sending?" draws the subject there. `ConfirmDialog` puts `children` after the description. Add a prop, documented where the others are:

```tsx
  /** Drawn between the title and the description: a summary the sentence then speaks about. */
  readonly before?: ReactNode;
```

and render it in that position:

```tsx
<AlertDialog.Title className="text-3xl tracking-head">{title}</AlertDialog.Title>
{before ? <div className="mt-3">{before}</div> : null}
<AlertDialog.Description className="mt-2.5 text-body text-ink-2">{description}</AlertDialog.Description>
```

Add one test to `tests/unit/components/ui/confirm-dialog.test.tsx`:

```tsx
  it("draws what it is given before its description, in that order", () => {
    render(<ConfirmDialog open onOpenChange={() => {}} title="Queue this letter?" before={<p>People 431</p>} description="Once queued, the letter goes to real people." confirmLabel="Queue" onConfirm={() => {}} />);
    const text = screen.getByRole("alertdialog").textContent ?? "";
    expect(text.indexOf("People 431")).toBeGreaterThan(-1);
    expect(text.indexOf("People 431")).toBeLessThan(text.indexOf("Once queued"));
  });
```

- [ ] **Step 4: Implement the Queue dialog**

Create `src/console/announcements/queue-dialog.tsx`:

```tsx
"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { KeyValueList, type KeyValueItem } from "@/components/ui/key-value-list";
import { daysFor, finishDate, type Ahead } from "@/console/announcements/estimate";
import type { LetterList } from "@/console/announcements/letters";
import { consoleMessages } from "@/console/messages";
import { formatCount, formatDate } from "@/utils/datetime";

const m = consoleMessages.announcements;
const q = m.queueDialog;

/**
 * "Queue this letter?" (ConsoleAnnouncements.dc.html:276-300). A plain confirm, as drawn: no reason
 * and no key tap. It names what is about to be fixed — the list, the subject, how many people — and
 * how long it takes INCLUDING the letter ahead, because one letter drains at a time and an estimate
 * that ignored the queue would be wrong by exactly that letter.
 *
 * `people` is the list's count as the page was drawn. Queue fixes the real number a moment later,
 * and the toast and the detail page then carry that one.
 */
export function QueueDialog({
  open,
  onOpenChange,
  list,
  subject,
  people,
  ahead,
  now,
  onConfirm,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly list: LetterList;
  readonly subject: string;
  readonly people: number;
  readonly ahead: Ahead | null;
  readonly now: string;
  readonly onConfirm: () => Promise<void>;
}) {
  const own = daysFor(people);
  const finish = formatDate(finishDate(new Date(now), own + (ahead?.days ?? 0)));
  const items: readonly KeyValueItem[] = [
    { label: q.list, value: m.lists[list] },
    { label: q.subject, value: subject },
    { label: q.people, value: formatCount(people), numeric: true },
    ...(ahead ? [{ label: q.behind, value: ahead.more > 0 ? q.behindMany(ahead.subject, ahead.more, ahead.days) : q.behindOne(ahead.subject, ahead.days) }] : []),
    { label: q.takes, value: ahead ? q.takesBehind(own) : q.takesNow(own) },
    { label: q.finishes, value: q.around(finish) },
  ];
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={q.title}
      before={<KeyValueList items={items} />}
      description={q.detail}
      confirmLabel={q.confirm}
      tone="primary"
      onConfirm={onConfirm}
    />
  );
}
```

- [ ] **Step 5: Implement the form**

Create `src/console/announcements/compose-form.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChoiceList, type Choice } from "@/components/ui/choice-list";
import { Lamp } from "@/components/ui/led";
import { Plate } from "@/components/ui/plate";
import { notify } from "@/components/ui/toast";
import { daysFor, type Ahead } from "@/console/announcements/estimate";
import type { LetterList, ListCounts } from "@/console/announcements/letters";
import { requestQueue, requestSave, requestTest } from "@/console/announcements/letters-client";
import { QueueDialog } from "@/console/announcements/queue-dialog";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";
import { formatCount, formatDate, formatDateTime, formatTime } from "@/utils/datetime";

const m = consoleMessages.announcements;
const c = m.compose;

export interface ComposeLetter {
  readonly id: string;
  readonly list: LetterList;
  readonly subject: string;
  readonly body: string;
  readonly testSentAt: string | null;
  readonly testSentTo: string | null;
}

const SUBJECT_MAX = 200;
const BODY_MAX = 20000;

/**
 * ConsoleAnnouncements.dc.html, Compose (:107-160), from `sm` up. Below it the page draws
 * ComposeReadonly instead: the phone board has no form.
 *
 * Three actions, and each acts on the SAVED draft, never on what is typed: Save writes it; Send a
 * test mails the saved text and records the proof; Queue fixes the saved text for everyone on the
 * list. So while the form differs from what is saved, the last two are off and say why — a test of
 * words that are not the ones queued is no proof at all (the database clears the test on a change
 * for the same reason).
 *
 * `letter` is null for a letter never saved. `now` is the server's clock as an ISO string, so the
 * finish date is the same on the server's render and the browser's.
 */
export function ComposeForm({
  letter,
  lists,
  email,
  ahead,
  now,
}: {
  readonly letter: ComposeLetter | null;
  readonly lists: ListCounts;
  readonly email: string;
  readonly ahead: Ahead | null;
  readonly now: string;
}) {
  const router = useRouter();
  const [list, setList] = useState<LetterList>(letter?.list ?? "news");
  const [subject, setSubject] = useState(letter?.subject ?? "");
  const [body, setBody] = useState(letter?.body ?? "");
  const [problems, setProblems] = useState<{ readonly subject?: string; readonly body?: string }>({});
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [asking, setAsking] = useState(false);

  const untouched = letter === null && subject === "" && body === "";
  const dirty = letter === null || list !== letter.list || subject.trim() !== letter.subject || body !== letter.body;
  const tested = letter !== null && letter.testSentAt !== null;
  const people = lists[list];
  const takes = daysFor(people);

  // One reason at a time, the first that applies; when none does, the line says what Queue will do.
  const reason = untouched || (!dirty && !tested) ? c.notTested : dirty ? c.unsaved : people === 0 ? c.nobody : null;
  const line = reason ?? (ahead ? c.readyBehind(formatCount(people), takes) : c.ready(formatCount(people), takes));

  const choices: readonly Choice<LetterList>[] = [
    { value: "news", label: m.lists.news, description: c.confirmed(formatCount(lists.news)) },
    lists.availabilitySpent
      ? { value: "availability", label: m.lists.availability, description: lists.availabilitySpentAt ? c.spentOn(formatDate(lists.availabilitySpentAt)) : c.spentGoing, disabled: true }
      : { value: "availability", label: m.lists.availability, description: c.confirmed(formatCount(lists.availability)) },
  ];

  const sameDay = letter?.testSentAt ? formatDate(letter.testSentAt) === formatDate(now) : false;
  const testLine = !letter?.testSentAt
    ? c.test.notSent
    : sameDay
      ? c.test.sentAt(formatTime(letter.testSentAt), letter.testSentTo ?? email)
      : c.test.sentOn(formatDateTime(letter.testSentAt), letter.testSentTo ?? email);

  async function save(): Promise<void> {
    const trimmed = subject.trim();
    const found = {
      ...(trimmed.length === 0 ? { subject: c.subjectNeeded } : trimmed.length > SUBJECT_MAX ? { subject: c.subjectTooLong } : {}),
      ...(body.trim().length === 0 ? { body: c.bodyNeeded } : body.length > BODY_MAX ? { body: c.bodyTooLong } : {}),
    };
    setProblems(found);
    if (found.subject || found.body) return;
    setBusy("save");
    const outcome = await requestSave(letter ? { id: letter.id, list, subject: trimmed, body } : { list, subject: trimmed, body });
    setBusy(null);
    if (outcome.kind === "failed") {
      notify.error(outcome.message);
      return;
    }
    notify.success(c.saved);
    if (letter) router.refresh();
    else router.replace(consoleHref(`/announcements/${outcome.id}`));
  }

  async function test(): Promise<void> {
    if (!letter) return;
    setBusy("test");
    const outcome = await requestTest(letter.id);
    setBusy(null);
    if (outcome.kind === "failed") {
      notify.error(outcome.message);
      return;
    }
    notify.success(c.test.done);
    router.refresh();
  }

  async function queue(): Promise<void> {
    if (!letter) return;
    const outcome = await requestQueue(letter.id);
    setAsking(false);
    if (outcome.kind === "failed") {
      notify.error(outcome.message);
      return;
    }
    notify.success(c.queued);
    // The same address now draws the letter's detail: it is no longer a draft.
    router.refresh();
  }

  return (
    <Plate as="section" title={c.title} titleId="an-compose" headingLevel={2} padding="none" meta={[c.draft, c.form]}>
      <div className="flex max-w-[760px] flex-col gap-5 p-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="an-subject" className="legend-md text-accent-text">
            {c.subject}
          </label>
          <input
            id="an-subject"
            type="text"
            className="well h-10 w-full px-2.5"
            value={subject}
            maxLength={SUBJECT_MAX}
            aria-invalid={problems.subject ? true : undefined}
            aria-describedby={problems.subject ? "an-subject-problem" : undefined}
            onChange={(event) => setSubject(event.target.value)}
          />
          {problems.subject ? (
            <p id="an-subject-problem" role="alert" className="text-label text-ink-alert font-medium">
              {problems.subject}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <span id="an-list" className="legend-md text-accent-text">
            {c.list}
          </span>
          <ChoiceList value={list} choices={choices} labelId="an-list" onChange={setList} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="an-body" className="legend-md text-accent-text">
            {c.body}
          </label>
          <textarea
            id="an-body"
            rows={10}
            className="well w-full resize-none px-2.5 py-2"
            value={body}
            maxLength={BODY_MAX}
            aria-invalid={problems.body ? true : undefined}
            aria-describedby={problems.body ? "an-body-problem an-body-hint" : "an-body-hint"}
            onChange={(event) => setBody(event.target.value)}
          />
          {problems.body ? (
            <p id="an-body-problem" role="alert" className="text-label text-ink-alert font-medium">
              {problems.body}
            </p>
          ) : null}
          <p id="an-body-hint" className="text-label text-ink-3">
            {c.bodyHint}
          </p>
        </div>
      </div>

      <div className="border-line flex items-center gap-4 border-t px-5 py-4">
        <div className="flex grow flex-col gap-1">
          <span className="legend">{c.test.legend}</span>
          <span className="text-ink-2 text-sm">{c.test.detail(email)}</span>
          <span className="text-ink-2 text-label inline-flex items-center gap-2">
            <Lamp lit={Boolean(letter?.testSentAt)} />
            {testLine}
          </span>
        </div>
        <Button variant="secondary" disabled={letter === null || dirty || busy !== null} loading={busy === "test"} onClick={() => void test()}>
          {c.test.send}
        </Button>
      </div>

      <div className="border-line flex items-center justify-end gap-3 border-t px-5 py-3">
        <span id="an-queue-line" className="text-ink-2 text-label grow">
          {line}
        </span>
        <Button variant="secondary" disabled={busy !== null} loading={busy === "save"} onClick={() => void save()}>
          {c.save}
        </Button>
        <Button variant="primary" disabled={reason !== null || busy !== null} aria-describedby="an-queue-line" onClick={() => setAsking(true)}>
          {c.queue}
        </Button>
      </div>

      <QueueDialog open={asking} onOpenChange={setAsking} list={list} subject={subject.trim()} people={people} ahead={ahead} now={now} onConfirm={queue} />
    </Plate>
  );
}
```

Things to check against the board before moving on: the Subject and Body labels use the board's `.label` (the app's `legend-md text-accent-text`, as `FieldLabel` has it); the wells are `well`; the test strip and the queue strip are the board's two bottom rows (`:137-158`), each over a hairline. If `Button` does not forward `aria-describedby`, it spreads `...rest` onto the element (`button.tsx:60`), so it does; verify with the test.

Create `src/console/announcements/how-plate.tsx`:

```tsx
import { Plate } from "@/components/ui/plate";
import { consoleMessages } from "@/console/messages";

const m = consoleMessages.announcements.how;

/**
 * "How a letter goes out" (ConsoleAnnouncements.dc.html:161-170): the four rules, beside Compose.
 * `titleId` is the caller's because the page draws this twice, once per width, and two elements
 * must not share an id even when one is hidden.
 */
export function HowPlate({ titleId }: { readonly titleId: string }) {
  return (
    <Plate as="section" title={m.title} titleId={titleId} headingLevel={2} padding="none">
      <ul className="text-ink-2 flex list-disc flex-col gap-2 py-4 pl-9 pr-5 text-sm">
        {m.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </Plate>
  );
}
```

- [ ] **Step 6: Run the form test**

Run: `npx vitest run tests/unit/console/announcements/compose-form.test.tsx tests/unit/components/ui/confirm-dialog.test.tsx`
Expected: PASS. The spent-list assertion reads the radio's text; if the two spans' text joins without a space, loosen the pattern to `/Availability.*Spent\. Its one send finished on 6 Sep/`, not the component.

- [ ] **Step 7: Write the failing phone test, then the phone view**

Create `tests/unit/console/announcements/compose-readonly.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ComposeReadonly } from "@/console/announcements/compose-readonly";
import type { ListCounts } from "@/console/announcements/letters";
import { consoleMessages } from "@/console/messages";

// ConsoleAnnouncementsPhone.dc.html, Compose: on a phone the console reads, and does the urgent
// thing. Writing a letter is neither, so the draft is drawn as text with no control on it at all.
const m = consoleMessages.announcements;
const LISTS: ListCounts = { news: 431, availability: 0, availabilitySpent: true, availabilitySpentAt: null };
const DRAFT = { id: "a0000000-0000-4000-8000-000000000001", list: "news" as const, subject: "Trakline news: what's coming next", body: "Hello,\n\nTwo things.", testSentAt: null, testSentTo: null };

describe("ComposeReadonly", () => {
  it("draws the draft as text, with no field and no button", () => {
    render(<ComposeReadonly letter={DRAFT} lists={LISTS} />);
    expect(screen.getByText(m.phone.note)).toBeInTheDocument();
    expect(screen.getByText(DRAFT.subject)).toBeInTheDocument();
    expect(screen.getByText(m.phone.listLine("News", "431"))).toBeInTheDocument();
    expect(screen.getByText(m.compose.test.notSent)).toBeInTheDocument();
    expect(screen.getByText(m.phone.queueOff)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("says where to queue a draft that has been tested", () => {
    render(<ComposeReadonly letter={{ ...DRAFT, testSentAt: "2026-09-19T08:50:00+00:00", testSentTo: "asha@example.com" }} lists={LISTS} />);
    expect(screen.getByText(m.phone.queueElsewhere)).toBeInTheDocument();
  });

  it("says where to write a letter when there is no draft yet", () => {
    render(<ComposeReadonly letter={null} lists={LISTS} />);
    expect(screen.getByText(m.phone.newElsewhere)).toBeInTheDocument();
    expect(screen.queryByText(m.phone.note)).not.toBeInTheDocument();
  });
});
```

Run it: FAIL, module not found. Then create `src/console/announcements/compose-readonly.tsx`:

```tsx
import { Lamp } from "@/components/ui/led";
import { Plate } from "@/components/ui/plate";
import type { ComposeLetter } from "@/console/announcements/compose-form";
import type { ListCounts } from "@/console/announcements/letters";
import { consoleMessages } from "@/console/messages";
import { formatCount, formatDateTime } from "@/utils/datetime";

const m = consoleMessages.announcements;

function Row({ label, first = false, children }: { readonly label: string; readonly first?: boolean; readonly children: React.ReactNode }) {
  return (
    <div className={first ? "flex flex-col gap-0.5 px-4 py-3" : "border-line flex flex-col gap-0.5 border-t px-4 py-3"}>
      <span className="legend-sm">{label}</span>
      {children}
    </div>
  );
}

/**
 * ConsoleAnnouncementsPhone.dc.html, Compose. On a phone the console is for reading plus the urgent
 * action (Stop); writing, testing and queueing are for a larger screen, and this says so once, above
 * the draft. `letter` is null for New letter opened on a phone: there is nothing to read yet.
 */
export function ComposeReadonly({ letter, lists }: { readonly letter: ComposeLetter | null; readonly lists: ListCounts }) {
  if (!letter) return <p className="text-ink-3 text-label">{m.phone.newElsewhere}</p>;
  return (
    <>
      <p className="text-ink-3 text-label">{m.phone.note}</p>
      <Plate as="section" title={m.phone.title} titleId="an-draft" headingLevel={2} padding="none" meta={[m.phone.notQueued, m.compose.form]} stack>
        <Row label={m.compose.subject} first>
          <span className="text-body">{letter.subject}</span>
        </Row>
        <Row label={m.compose.list}>
          <span className="text-body">{m.phone.listLine(m.lists[letter.list], formatCount(lists[letter.list]))}</span>
        </Row>
        <Row label={m.compose.test.legend}>
          <span className="text-body inline-flex items-center gap-2">
            <Lamp lit={letter.testSentAt !== null} />
            {letter.testSentAt ? m.compose.test.sentOn(formatDateTime(letter.testSentAt), letter.testSentTo ?? "") : m.compose.test.notSent}
          </span>
        </Row>
        <Row label={m.phone.message}>
          <div className="well mt-1 whitespace-pre-wrap p-3 text-sm">{letter.body}</div>
          <p className="text-ink-3 text-label mt-1.5">{m.compose.bodyHint}</p>
        </Row>
        <p className="text-ink-2 border-line text-label border-t px-4 py-3">{letter.testSentAt ? m.phone.queueElsewhere : m.phone.queueOff}</p>
      </Plate>
    </>
  );
}
```

`ComposeLetter` is imported as a type from a `"use client"` module, which the client-boundary contract allows (types carry no code). `React.ReactNode` needs `import type { ReactNode } from "react"` under this repo's lint rules: use that form.

Run: `npx vitest run tests/unit/console/announcements/compose-readonly.test.tsx tests/unit/client-boundary.contract.test.ts` — PASS.

- [ ] **Step 8: The two pages**

Create `src/app/console/announcements/new/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClassName } from "@/components/ui/button";
import { ComposeForm } from "@/console/announcements/compose-form";
import { ComposeReadonly } from "@/console/announcements/compose-readonly";
import { lettersAhead } from "@/console/announcements/estimate";
import { HowPlate } from "@/console/announcements/how-plate";
import { readLetters, readLists } from "@/console/announcements/letters";
import { AnnouncementsHeader } from "@/console/announcements/page-header";
import { createConsoleDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { ROLE_RANK } from "@/console/auth/member";
import { ConsoleFrame } from "@/console/components/console-frame";
import { NoAccessState } from "@/console/components/frame-states";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";
import { formatTime } from "@/utils/datetime";

const m = consoleMessages.announcements;

export const metadata: Metadata = { title: m.pageTitle };

/**
 * A new letter. Nothing exists until Save draft, which moves to the draft's own address
 * (/announcements/<id>); so a reload here is always an empty form, never a half-saved one.
 */
export default async function NewLetterPage() {
  const member = await requireConsoleMember().catch((err: unknown) => {
    if (err instanceof AppError && err.code === "UNAUTHENTICATED") return null;
    throw err;
  });
  if (!member) redirect(consoleHref("/login"));

  if (ROLE_RANK[member.role] < ROLE_RANK.admin) {
    return (
      <ConsoleFrame member={member}>
        <AnnouncementsHeader />
        <div className="mt-6">
          <NoAccessState role={member.role} />
        </div>
      </ConsoleFrame>
    );
  }

  const db = await createConsoleDb();
  const now = new Date();
  // Both throw on a database fault, and this page has nothing true to draw without them: the
  // console's error boundary (src/app/console/error.tsx) says so, rather than a form that offers
  // lists it could not count.
  const [lists, letters] = await Promise.all([readLists(db), readLetters(db)]);
  const ahead = lettersAhead(letters, { id: null, queuedAt: null });

  return (
    <ConsoleFrame member={member}>
      <AnnouncementsHeader
        updated={formatTime(now)}
        action={
          <Link href={consoleHref("/announcements")} className={buttonClassName({ variant: "secondary" })}>
            {m.allLetters}
          </Link>
        }
      />
      <div className="mt-6 grid items-start gap-6 max-sm:hidden lg:grid-cols-[minmax(0,1fr)_340px]">
        <ComposeForm letter={null} lists={lists} email={member.email} ahead={ahead} now={now.toISOString()} />
        <HowPlate titleId="an-how" />
      </div>
      <div className="mt-6 flex flex-col gap-6 sm:hidden">
        <ComposeReadonly letter={null} lists={lists} />
        <HowPlate titleId="an-how-phone" />
      </div>
    </ConsoleFrame>
  );
}
```

`HowPlate` is drawn in both containers and each is `display: none` at the other width, which is why it takes its `titleId` from the caller.

Create `src/app/console/announcements/[id]/page.tsx`. In Next 16 `params` is a Promise; confirm the page signature in `node_modules/next/dist/docs/` before writing it.

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { buttonClassName } from "@/components/ui/button";
import { ComposeForm, type ComposeLetter } from "@/console/announcements/compose-form";
import { ComposeReadonly } from "@/console/announcements/compose-readonly";
import { lettersAhead } from "@/console/announcements/estimate";
import { HowPlate } from "@/console/announcements/how-plate";
import { readLetter, readLetters, readLists } from "@/console/announcements/letters";
import { AnnouncementsHeader } from "@/console/announcements/page-header";
import { createConsoleDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { ROLE_RANK } from "@/console/auth/member";
import { ConsoleFrame } from "@/console/components/console-frame";
import { NoAccessState } from "@/console/components/frame-states";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";
import { formatTime } from "@/utils/datetime";

const m = consoleMessages.announcements;

export const metadata: Metadata = { title: m.pageTitle };

/**
 * One letter. A draft opens in Compose; anything else opens its detail (Task 11 adds that branch).
 * An id that is not one, or names no letter, is the console's not-found page: the address is typed
 * or stale, and there is nothing of this module's to draw.
 */
export default async function LetterPage({ params }: { readonly params: Promise<{ readonly id: string }> }) {
  const member = await requireConsoleMember().catch((err: unknown) => {
    if (err instanceof AppError && err.code === "UNAUTHENTICATED") return null;
    throw err;
  });
  if (!member) redirect(consoleHref("/login"));

  if (ROLE_RANK[member.role] < ROLE_RANK.admin) {
    return (
      <ConsoleFrame member={member}>
        <AnnouncementsHeader />
        <div className="mt-6">
          <NoAccessState role={member.role} />
        </div>
      </ConsoleFrame>
    );
  }

  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();

  const db = await createConsoleDb();
  const now = new Date();
  const [letter, letters] = await Promise.all([readLetter(db, id), readLetters(db)]);
  if (!letter) notFound();

  const back = (
    <Link href={consoleHref("/announcements")} className={buttonClassName({ variant: "secondary" })}>
      {m.allLetters}
    </Link>
  );

  if (letter.state === "draft") {
    const lists = await readLists(db);
    const draft: ComposeLetter = { id: letter.id, list: letter.list, subject: letter.subject, body: letter.body, testSentAt: letter.testSentAt, testSentTo: letter.testSentTo };
    const ahead = lettersAhead(letters, { id: null, queuedAt: null });
    return (
      <ConsoleFrame member={member}>
        <AnnouncementsHeader updated={formatTime(now)} action={back} />
        <div className="mt-6 grid items-start gap-6 max-sm:hidden lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Keyed by what is saved: after a save or a test the server's copy is the form's new start. */}
          <ComposeForm key={`${letter.id}:${letter.testSentAt ?? ""}`} letter={draft} lists={lists} email={member.email} ahead={ahead} now={now.toISOString()} />
          <HowPlate titleId="an-how" />
        </div>
        <div className="mt-6 flex flex-col gap-6 sm:hidden">
          <ComposeReadonly letter={draft} lists={lists} />
          <HowPlate titleId="an-how-phone" />
        </div>
      </ConsoleFrame>
    );
  }

  // Task 11 replaces this with the Progress and Letter plates.
  return (
    <ConsoleFrame member={member}>
      <AnnouncementsHeader updated={formatTime(now)} action={back} />
    </ConsoleFrame>
  );
}
```

That last `return` is a real, shippable state for one commit only (a queued letter's address draws its header and nothing else), and Task 11 replaces it. Do not open the PR between the two.

- [ ] **Step 9: Run and commit**

Run: `npx vitest run tests/unit/console/announcements tests/unit/components/ui && npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add src/components/ui/confirm-dialog.tsx src/console/announcements src/app/console/announcements tests/unit/console/announcements tests/unit/components/ui/confirm-dialog.test.tsx
git commit -m "feat(announce): compose — a draft, a test, and a Queue that says why it is off"
```

---

## Task 11: A letter's detail, and Stop

**Files:**
- Create: `src/console/announcements/detail-plates.tsx`, `src/console/announcements/stop-button.tsx`
- Modify: `src/app/console/announcements/[id]/page.tsx` (the non-draft branch)
- Test: `tests/unit/console/announcements/detail-plates.test.tsx`, `tests/unit/console/announcements/stop-button.test.tsx`

**Interfaces:**
- Consumes: `LetterDetail` (Task 3); `daysFor`, `finishDate`, `percent`, `Ahead` (Task 4); `requestStop` (Task 9); `ConfirmDialog` with `phoneSheet` and `before` (Tasks 5, 10).
- Produces:
  - `ProgressPlate({ letter, ahead, now }: { readonly letter: LetterDetail; readonly ahead: Ahead | null; readonly now: string })`
  - `LetterPlate({ letter }: { readonly letter: LetterDetail })`
  - `StopButton({ id, subject, sent, waiting }: { readonly id: string; readonly subject: string; readonly sent: number; readonly waiting: number })`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/console/announcements/detail-plates.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LetterDetail } from "@/console/announcements/letters";
import { consoleMessages } from "@/console/messages";

vi.mock("@/console/announcements/stop-button", () => ({ StopButton: ({ sent, waiting }: { sent: number; waiting: number }) => <button type="button">{`Stop ${sent}/${waiting}`}</button> }));

import { LetterPlate, ProgressPlate } from "@/console/announcements/detail-plates";

// ---------------------------------------------------------------------------
// ConsoleAnnouncements.dc.html: Sending, Stopped and Done, with the sheet's own
// figures. Queued has no board; it is built from the README's B4 note.
// ---------------------------------------------------------------------------

const m = consoleMessages.announcements.detail;
const NOW = "2026-09-19T09:02:00+00:00";
const base: LetterDetail = {
  id: "a0000000-0000-4000-8000-000000000001", list: "news", subject: "Trakline news: a clearer chart view",
  body: "Hello,\n\nThe chart view is clearer now.\n\nThe Trakline team", state: "sending", total: 431,
  sent: 262, skipped: 4, unknown: 0, waiting: 165, sentToday: 31,
  createdAt: "2026-09-10T03:00:00+00:00", queuedAt: "2026-09-11T03:35:00+00:00", stoppedAt: null, finishedAt: null,
  testSentAt: "2026-09-11T03:28:00+00:00", testSentTo: "asha@example.com", queuedBy: "Asha Rao", stoppedBy: null,
};
const STOPPED: LetterDetail = { ...base, subject: "Trakline news: the new look", state: "stopped", total: 418, sent: 120, skipped: 3, waiting: 295, sentToday: 0, stoppedAt: "2026-09-10T05:10:00+00:00", stoppedBy: "Rohan Iyer" };
const DONE: LetterDetail = { ...base, list: "availability", subject: "Availability checks are open", state: "done", total: 217, sent: 213, skipped: 4, waiting: 0, sentToday: 0, finishedAt: "2026-09-06T08:40:00+00:00" };
const QUEUED: LetterDetail = { ...base, state: "queued", sent: 0, skipped: 0, waiting: 431, sentToday: 0 };

describe("ProgressPlate", () => {
  it("draws a sending letter: the estimate, the meter, three separate figures, and Stop", () => {
    render(<ProgressPlate letter={base} ahead={null} now={NOW} />);
    const plate = screen.getByRole("region", { name: m.progress });
    expect(within(plate).getByText(m.estimated)).toBeInTheDocument();
    expect(within(plate).getByText("About 4 days at 40 a day")).toBeInTheDocument();
    expect(within(plate).getByText(/^Around 23 Sep/)).toBeInTheDocument();
    const meter = within(plate).getByRole("progressbar", { name: m.meter });
    expect(meter).toHaveAttribute("aria-valuenow", "266");
    expect(meter).toHaveAttribute("aria-valuemax", "431");
    expect(within(plate).getByText("266 of 431 handled")).toBeInTheDocument();
    expect(within(plate).getByText("165 waiting")).toBeInTheDocument();
    expect(within(plate).getByText("262")).toBeInTheDocument();
    expect(within(plate).getByText(m.unknownHint)).toBeInTheDocument();
    expect(within(plate).getByRole("button", { name: "Stop 262/165" })).toBeInTheDocument();
    expect(within(plate).getByText(m.stopNote)).toBeInTheDocument();
  });

  it("draws a stopped letter: what went, what never will, who stopped it, and no action", () => {
    render(<ProgressPlate letter={STOPPED} ahead={null} now={NOW} />);
    expect(screen.getByText("Sent to 120 people")).toBeInTheDocument();
    expect(screen.getByText(/^3 were skipped, and 295 were never reached and won't be\. Stopped on 10 Sep.* IST by Rohan Iyer\.$/)).toBeInTheDocument();
    expect(screen.getByText("295 never reached")).toBeInTheDocument();
    expect(screen.getByText(m.cantResume)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("draws a done letter, and says the Availability list is spent", () => {
    render(<ProgressPlate letter={DONE} ahead={null} now={NOW} />);
    expect(screen.getByText("Sent to 213 people")).toBeInTheDocument();
    expect(screen.getByText(/^Finished on 6 Sep.* IST\. 4 were skipped\. The availability list is spent/)).toBeInTheDocument();
    expect(screen.getByText("217 of 217 handled")).toBeInTheDocument();
    expect(screen.queryByText(/may or may not have gone\./)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("draws a queued letter waiting behind another, and offers Stop", () => {
    render(<ProgressPlate letter={QUEUED} ahead={{ subject: "The letter ahead", more: 0, days: 4 }} now={NOW} />);
    expect(screen.getByText(m.startsAfter)).toBeInTheDocument();
    expect(screen.getByText(/^Around 4 Oct/)).toBeInTheDocument();
    expect(screen.getByText("0 of 431 handled")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop 0/431" })).toBeInTheDocument();
  });

  it("names a former member when whoever stopped it has since been removed", () => {
    render(<ProgressPlate letter={{ ...STOPPED, stoppedBy: null }} ahead={null} now={NOW} />);
    expect(screen.getByText(/IST by a former member\.$/)).toBeInTheDocument();
  });
});

describe("LetterPlate", () => {
  it("draws the letter as it was queued, with today's count while it is sending", () => {
    render(<LetterPlate letter={base} />);
    const plate = screen.getByRole("region", { name: m.letter });
    expect(within(plate).getByText("News · 431 people when it was queued")).toBeInTheDocument();
    expect(within(plate).getByText(/^11 Sep.* IST by Asha Rao$/)).toBeInTheDocument();
    expect(within(plate).getByText(/^11 Sep.* IST to asha@example\.com$/)).toBeInTheDocument();
    expect(within(plate).getByText(m.today("31"))).toBeInTheDocument();
    expect(within(plate).getByText(/The chart view is clearer now\./)).toBeInTheDocument();
    expect(within(plate).getByText(m.messageHint)).toBeInTheDocument();
  });

  it("drops Today once a letter is no longer sending, and adds when it ended", () => {
    render(<LetterPlate letter={STOPPED} />);
    expect(screen.queryByText(m.todayRow)).not.toBeInTheDocument();
    expect(screen.getByText(/^10 Sep.* IST by Rohan Iyer$/)).toBeInTheDocument();
  });
});
```

Create `tests/unit/console/announcements/stop-button.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { consoleMessages } from "@/console/messages";

const { refresh, requestStop, success, error } = vi.hoisted(() => ({ refresh: vi.fn(), requestStop: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/console/announcements/letters-client", () => ({ requestStop }));
vi.mock("@/components/ui/toast", () => ({ notify: { success, error } }));

import { StopButton } from "@/console/announcements/stop-button";

// "Stop sending?" (both boards). It says how many already have the letter, which cannot be
// recalled, how many will not get it, and that a stopped letter cannot be resumed — before anything
// is stopped.
const m = consoleMessages.announcements;
const ID = "a0000000-0000-4000-8000-000000000001";
const button = () => render(<StopButton id={ID} subject="Trakline news: a clearer chart view" sent={262} waiting={165} />);

beforeEach(() => {
  for (const fn of [refresh, requestStop, success, error]) fn.mockReset();
});

describe("StopButton", () => {
  it("asks first, with the letter's subject and what stopping costs", async () => {
    button();
    await userEvent.click(screen.getByRole("button", { name: m.detail.stop }));
    const dialog = screen.getByRole("alertdialog", { name: m.stopDialog.title });
    expect(within(dialog).getByText("Trakline news: a clearer chart view")).toBeInTheDocument();
    expect(within(dialog).getByText(m.stopDialog.detail("262", "165"))).toBeInTheDocument();
    expect(requestStop).not.toHaveBeenCalled();
  });

  it("stops on confirm, says so, and redraws the page", async () => {
    requestStop.mockResolvedValue({ kind: "done" });
    button();
    await userEvent.click(screen.getByRole("button", { name: m.detail.stop }));
    await userEvent.click(screen.getByRole("button", { name: m.stopDialog.confirm }));
    expect(requestStop).toHaveBeenCalledWith(ID);
    expect(success).toHaveBeenCalledWith(m.stopDialog.done);
    expect(refresh).toHaveBeenCalled();
  });

  it("changes nothing on Cancel", async () => {
    button();
    await userEvent.click(screen.getByRole("button", { name: m.detail.stop }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(requestStop).not.toHaveBeenCalled();
  });

  it("shows why a stop failed, and still redraws: the letter may have finished meanwhile", async () => {
    requestStop.mockResolvedValue({ kind: "failed", message: m.errors.notOpen });
    button();
    await userEvent.click(screen.getByRole("button", { name: m.detail.stop }));
    await userEvent.click(screen.getByRole("button", { name: m.stopDialog.confirm }));
    expect(error).toHaveBeenCalledWith(m.errors.notOpen);
    expect(refresh).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/unit/console/announcements/detail-plates.test.tsx tests/unit/console/announcements/stop-button.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement Stop**

Create `src/console/announcements/stop-button.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { notify } from "@/components/ui/toast";
import { requestStop } from "@/console/announcements/letters-client";
import { consoleMessages } from "@/console/messages";
import { formatCount } from "@/utils/datetime";

const m = consoleMessages.announcements;

/**
 * Stop, and "Stop sending?" (ConsoleAnnouncements.dc.html:303-315; a bottom sheet on a phone, where
 * this is the one action the console offers). A plain confirm, as drawn. The counts are the page's,
 * a moment old: the dialog's point is that what has gone cannot be recalled, not the exact number.
 *
 * The page is redrawn after a failure too. A stop is refused when the letter is no longer open —
 * it finished, or someone else stopped it — and the page should then show that.
 */
export function StopButton({ id, subject, sent, waiting }: { readonly id: string; readonly subject: string; readonly sent: number; readonly waiting: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function stop(): Promise<void> {
    const outcome = await requestStop(id);
    setOpen(false);
    if (outcome.kind === "done") notify.success(m.stopDialog.done);
    else notify.error(outcome.message);
    router.refresh();
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {m.detail.stop}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={m.stopDialog.title}
        before={<p className="text-body font-medium">{subject}</p>}
        description={m.stopDialog.detail(formatCount(sent), formatCount(waiting))}
        confirmLabel={m.stopDialog.confirm}
        tone="primary"
        phoneSheet
        onConfirm={stop}
      />
    </>
  );
}
```

- [ ] **Step 4: Implement the plates**

Create `src/console/announcements/detail-plates.tsx`:

```tsx
import { KeyValueList, type KeyValueItem } from "@/components/ui/key-value-list";
import { Plate } from "@/components/ui/plate";
import { daysFor, finishDate, percent, type Ahead } from "@/console/announcements/estimate";
import type { LetterDetail } from "@/console/announcements/letters";
import { StopButton } from "@/console/announcements/stop-button";
import { consoleMessages } from "@/console/messages";
import { formatCount, formatDate, formatDateTime } from "@/utils/datetime";

const m = consoleMessages.announcements;
const d = m.detail;

interface Head {
  readonly legend: string;
  readonly headline: string;
  readonly detail: string;
}

/** The plate's first three lines, which are the whole difference between the four states. */
function headOf(letter: LetterDetail, ahead: Ahead | null, now: string): Head {
  if (letter.state === "stopped") {
    return {
      legend: d.stoppedLegend,
      headline: d.sentTo(formatCount(letter.sent)),
      detail: d.stoppedDetail(formatCount(letter.skipped), formatCount(letter.waiting), letter.stoppedAt ? formatDateTime(letter.stoppedAt) : "", letter.stoppedBy ?? d.formerMember),
    };
  }
  if (letter.state === "done") {
    return {
      legend: d.finishedLegend,
      headline: d.sentTo(formatCount(letter.sent)),
      detail:
        d.finishedDetail(letter.finishedAt ? formatDateTime(letter.finishedAt) : "", formatCount(letter.skipped)) +
        (letter.unknown > 0 ? d.finishedUnknown(formatCount(letter.unknown)) : "") +
        (letter.list === "availability" ? d.availabilitySpent : ""),
    };
  }
  const own = daysFor(letter.waiting);
  const finish = d.aroundDetail(formatDate(finishDate(new Date(now), own + (ahead?.days ?? 0))));
  if (letter.state === "queued") return { legend: d.estimated, headline: ahead ? d.startsAfter : d.startsNext, detail: finish };
  return { legend: d.estimated, headline: d.about(own), detail: finish };
}

function Figure({ label, value, hint, first = false }: { readonly label: string; readonly value: number; readonly hint: string; readonly first?: boolean }) {
  return (
    <div className={first ? "flex flex-col gap-1 p-5" : "border-line flex flex-col gap-1 border-t p-5 sm:border-l sm:border-t-0"}>
      <span className="legend">{label}</span>
      <span className="font-display tnum text-4xl">{formatCount(value)}</span>
      <span className="text-ink-3 text-label">{hint}</span>
    </div>
  );
}

/**
 * The Progress plate (ConsoleAnnouncements.dc.html:173-212): the headline, the meter, Sent, Skipped
 * and Unknown as three SEPARATE figures — a letter's unknowns are never folded into either of the
 * others, because unknown means we cannot say — and Stop while the letter is open.
 *
 * "Handled" is everything that is no longer waiting: sent, skipped and unknown together.
 */
export function ProgressPlate({ letter, ahead, now }: { readonly letter: LetterDetail; readonly ahead: Ahead | null; readonly now: string }) {
  const head = headOf(letter, ahead, now);
  const handled = letter.sent + letter.skipped + letter.unknown;
  const open = letter.state === "queued" || letter.state === "sending";
  return (
    <Plate as="section" title={d.progress} titleId="an-progress" headingLevel={2} padding="none" meta={[m.states[letter.state]]}>
      <div className="flex flex-col gap-5 p-5">
        <div className="flex flex-col gap-1">
          <span className="legend">{head.legend}</span>
          <p className="font-display text-3xl">{head.headline}</p>
          <p className="text-ink-2 mt-0.5 max-w-[72ch] text-sm">{head.detail}</p>
        </div>
        <div>
          <div role="progressbar" aria-label={d.meter} aria-valuemin={0} aria-valuemax={letter.total} aria-valuenow={handled} className="border-line-strong relative h-2 border">
            <i className="bg-accent absolute inset-y-0 left-0" style={{ width: `${percent(handled, letter.total)}%` }} />
          </div>
          <div className="mt-2 flex justify-between gap-3">
            <span className="legend tnum">{d.handled(formatCount(handled), formatCount(letter.total))}</span>
            <span className="legend tnum">{letter.state === "stopped" ? d.neverReached(formatCount(letter.waiting)) : d.waiting(formatCount(letter.waiting))}</span>
          </div>
        </div>
      </div>
      <div className="border-line grid border-t sm:grid-cols-3">
        <Figure first label={d.sent} value={letter.sent} hint={d.sentHint} />
        <Figure label={d.skipped} value={letter.skipped} hint={d.skippedHint} />
        <Figure label={d.unknown} value={letter.unknown} hint={d.unknownHint} />
      </div>
      {open ? (
        <div className="border-line flex items-center gap-4 border-t px-5 py-3 max-sm:flex-col max-sm:items-stretch">
          <span className="text-ink-2 text-label grow">{d.stopNote}</span>
          <StopButton id={letter.id} subject={letter.subject} sent={letter.sent} waiting={letter.waiting} />
        </div>
      ) : null}
      {letter.state === "stopped" ? <p className="text-ink-2 border-line text-label border-t px-5 py-3">{d.cantResume}</p> : null}
    </Plate>
  );
}

/** The Letter plate (ConsoleAnnouncements.dc.html:213-236): what was queued, by whom, and its words. */
export function LetterPlate({ letter }: { readonly letter: LetterDetail }) {
  const people = formatCount(letter.total);
  const list = m.lists[letter.list];
  const stamped = (at: string | null, name: string | null) => (at === null ? "" : name ? d.by(formatDateTime(at), name) : d.byNobody(formatDateTime(at)));
  const items: readonly KeyValueItem[] = [
    { label: d.subjectRow, value: letter.subject },
    { label: d.listRow, value: d.listWhenQueued(list, people) },
    { label: d.queuedRow, value: stamped(letter.queuedAt, letter.queuedBy) },
    { label: d.testRow, value: letter.testSentAt ? d.testTo(formatDateTime(letter.testSentAt), letter.testSentTo ?? "") : "" },
    ...(letter.state === "sending" ? [{ label: d.todayRow, value: d.today(formatCount(letter.sentToday)) }] : []),
    ...(letter.state === "stopped" ? [{ label: d.stoppedLegend, value: stamped(letter.stoppedAt, letter.stoppedBy ?? d.formerMember) }] : []),
    ...(letter.state === "done" && letter.finishedAt ? [{ label: d.finishedLegend, value: d.at(formatDateTime(letter.finishedAt)) }] : []),
    {
      label: d.messageRow,
      value: (
        <>
          <div className="well max-w-[640px] whitespace-pre-wrap px-3.5 py-3 text-sm">{letter.body}</div>
          <p className="text-ink-3 text-label mt-2">{d.messageHint}</p>
        </>
      ),
    },
  ];
  return (
    <Plate as="section" title={d.letter} titleId="an-letter" headingLevel={2} padding="none" meta={[d.listCell(list, people)]}>
      <KeyValueList items={items} className="px-5 pb-2 pt-1" />
    </Plate>
  );
}
```

Check each block against the board (`:173-236`) and the phone board's Sending state. Two things the board fixes that the code above only approximates and must be matched: the headline is the board's `.fig` at 28/32 and the three figures at 40/44 (use the app's display sizes nearest those, as `overview-plates.tsx` does for its figures), and the key-value list's label column is 180px on the desktop board. `KeyValueList` uses the shared `kv-grid`; if its label column differs, pass a class rather than changing the shared rule.

- [ ] **Step 5: Draw them on the page**

In `src/app/console/announcements/[id]/page.tsx`, replace the final `return` (the one Task 10 marked) with:

```tsx
  const ahead = letter.state === "queued" ? lettersAhead(letters, { id: letter.id, queuedAt: letter.queuedAt }) : null;
  return (
    <ConsoleFrame member={member}>
      <AnnouncementsHeader updated={formatTime(now)} action={back} />
      <div className="mt-6 flex flex-col gap-6">
        <ProgressPlate letter={letter} ahead={ahead} now={now.toISOString()} />
        <LetterPlate letter={letter} />
      </div>
    </ConsoleFrame>
  );
```

and import `LetterPlate` and `ProgressPlate` from `@/console/announcements/detail-plates`. Update the page's doc comment: it no longer needs to mention Task 11.

- [ ] **Step 6: Run and commit**

Run: `npx vitest run tests/unit/console/announcements && npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add src/console/announcements/detail-plates.tsx src/console/announcements/stop-button.tsx "src/app/console/announcements/[id]/page.tsx" tests/unit/console/announcements
git commit -m "feat(announce): a letter's progress — sent, skipped and unknown apart — and Stop"
```

---

## Task 12: End to end, the runbook, the gate, the PR

**Files:**
- Create: `tests/e2e/console-auth/announcements.spec.ts`
- Modify: `docs/runbooks/announcements.md` ("What an operator does" now names the pages), `docs/design/sheets/console/README.md` (B4: built)

- [ ] **Step 1: Write the end-to-end spec**

Create `tests/e2e/console-auth/announcements.spec.ts`:

```ts
import { consoleMessages } from "@/console/messages";
import { consoleSql, expect, readOutbox, resetConsole, setUpFirstOwner, test } from "./fixtures";
import { expectAxeClean, gotoReady } from "../helpers";
import { layoutBreaks } from "../layout";

const BASE = "http://admin.localhost:4211";
const m = consoleMessages.announcements;

// Two confirmed news subscribers, seeded directly: the sign-up flow has its own spec
// (subscribe.spec.ts) and this one is about what the console does with the list.
const PEOPLE = ["e2e0a001-0000-4000-8000-000000000001", "e2e0a001-0000-4000-8000-000000000002"] as const;

function seed(): void {
  consoleSql(`
    delete from announcements.letters;
    delete from subscriptions.people where id in ('${PEOPLE[0]}', '${PEOPLE[1]}');
    insert into subscriptions.people (id, email, first_source) values
      ('${PEOPLE[0]}', 'e2e-letters-one@example.in', 'footer'),
      ('${PEOPLE[1]}', 'e2e-letters-two@example.in', 'footer');
    insert into subscriptions.consents (person_id, list, notice_version, source, confirmed_at) values
      ('${PEOPLE[0]}', 'news', '1.1', 'footer', now()),
      ('${PEOPLE[1]}', 'news', '1.1', 'footer', now());`);
}

test.beforeEach(() => {
  resetConsole();
  seed();
});
test.afterAll(() => {
  // The local stack is shared: leave no letter and no seeded reader behind.
  consoleSql(`delete from announcements.letters; delete from subscriptions.people where id in ('${PEOPLE[0]}', '${PEOPLE[1]}');`);
});

/**
 * 07 Announcements, Letters. The arithmetic and every state are proven in tests/unit/console/
 * announcements and supabase/tests/console_letters.test.sql. This proves the whole path once, in a
 * real browser against the real database: write, save, test, queue, stop — and that each step that
 * the spec says is audited left its row.
 */
test.describe("Announcements", () => {
  test("an Owner writes a letter, tests it, queues it and stops it", async ({ page, baseURL }) => {
    const owner = await setUpFirstOwner(page, baseURL ?? BASE);
    const subject = `Trakline news: e2e ${Date.now() % 100000}`;

    await page.getByRole("navigation", { name: "Console" }).getByRole("link", { name: /Announcements/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: m.title })).toBeVisible();
    await expect(page.getByText(m.letters.none)).toBeVisible();
    await expectAxeClean(page, { allowDesignLockedAccent: true });

    // Write and save. Queue is off, and says why.
    await page.getByRole("link", { name: m.newLetter }).click();
    await page.getByLabel(m.compose.subject).fill(subject);
    await page.getByLabel(m.compose.body).fill("Hello,\n\nOne thing is new.\n\nThe Trakline team");
    const queue = page.getByRole("button", { name: m.compose.queue });
    await expect(queue).toBeDisabled();
    await page.getByRole("button", { name: m.compose.save }).click();
    await expect(page.getByText(m.compose.saved, { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/announcements\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("radio", { name: /News/ })).toContainText("2 people confirmed.");
    await expect(queue).toBeDisabled();
    await expectAxeClean(page, { allowDesignLockedAccent: true });

    // Test: one real email, to the Owner, reading as a subscriber's would.
    await page.getByRole("button", { name: m.compose.test.send }).click();
    await expect(page.getByText(m.compose.test.done, { exact: true })).toBeVisible();
    const letters = await readOutbox(page, owner.email);
    const proof = letters.find((l) => l.subject === subject);
    expect(proof, "the test went to the member's own address").toBeDefined();
    expect(proof?.text).toContain("One thing is new.");
    expect(proof?.text.trimEnd()).toMatch(/\/unsubscribe$/);

    // Queue: the dialog names two people, and the letter becomes Queued.
    await expect(queue).toBeEnabled();
    await queue.click();
    const asking = page.getByRole("alertdialog", { name: m.queueDialog.title });
    await expect(asking.getByText(subject)).toBeVisible();
    await expect(asking.getByText("2", { exact: true })).toBeVisible();
    await asking.getByRole("button", { name: m.queueDialog.confirm }).click();
    await expect(page.getByText(m.compose.queued, { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: m.detail.progress })).toContainText("0 of 2 handled");
    expect(consoleSql(`select state || ':' || recipients_total from announcements.letters where subject = '${subject}'`)).toBe("queued:2");
    await expectAxeClean(page, { allowDesignLockedAccent: true });

    // Stop: asked first, then final.
    await page.getByRole("button", { name: m.detail.stop }).click();
    const stopping = page.getByRole("alertdialog", { name: m.stopDialog.title });
    await expect(stopping.getByText(subject)).toBeVisible();
    await stopping.getByRole("button", { name: m.stopDialog.confirm }).click();
    await expect(page.getByText(m.stopDialog.done, { exact: true })).toBeVisible();
    await expect(page.getByText(m.detail.cantResume)).toBeVisible();
    await expect(page.getByRole("button", { name: m.detail.stop })).toHaveCount(0);

    // The list shows it stopped, and the audit log holds the three acts.
    await page.getByRole("link", { name: m.allLetters }).click();
    await expect(page.getByRole("table", { name: m.letters.caption }).getByRole("row", { name: new RegExp(subject) })).toContainText(m.states.stopped);
    expect(
      consoleSql(`select string_agg(action, ', ' order by at) from console.audit_log where category = 'messages' and target = '${subject}' and result = 'done'`),
    ).toBe("Sent a test letter, Queued a letter, Stopped a letter");
  });

  test("on a phone the list is cards, a draft is read-only, and Stop is a sheet", async ({ page, baseURL }) => {
    await setUpFirstOwner(page, baseURL ?? BASE);
    const draft = "e2e0b002-0000-4000-8000-000000000001";
    const open = "e2e0b002-0000-4000-8000-000000000002";
    consoleSql(`
      insert into announcements.letters (id, list, subject, body, created_by) values ('${draft}', 'news', 'A phone draft', 'Hello', gen_random_uuid());
      insert into announcements.letters (id, list, subject, body, state, created_by, queued_at, recipients_total, test_sent_at, test_sent_to)
        values ('${open}', 'news', 'A phone letter', 'Hello', 'queued', gen_random_uuid(), now(), 2, now(), 'proof@example.in');
      insert into announcements.deliveries (letter_id, person_id) values ('${open}', '${PEOPLE[0]}'), ('${open}', '${PEOPLE[1]}');`);
    await page.setViewportSize({ width: 390, height: 844 });

    await gotoReady(page, "/announcements");
    await expect(page.getByRole("link", { name: m.letters.open("A phone letter") })).toBeVisible();
    await expect(page.getByRole("table")).toBeHidden();
    expect(await layoutBreaks(page)).toEqual([]);
    await expectAxeClean(page, { allowDesignLockedAccent: true });

    await gotoReady(page, `/announcements/${draft}`);
    await expect(page.getByText(m.phone.note)).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
    expect(await layoutBreaks(page)).toEqual([]);

    await gotoReady(page, `/announcements/${open}`);
    await page.getByRole("button", { name: m.detail.stop }).click();
    const sheet = page.getByRole("alertdialog", { name: m.stopDialog.title });
    const box = await sheet.boundingBox();
    expect(Math.round((box?.y ?? 0) + (box?.height ?? 0)), "the sheet sits on the bottom edge").toBe(844);
    expect(Math.round(box?.width ?? 0), "and spans the screen").toBe(390);
    await sheet.getByRole("button", { name: m.stopDialog.confirm }).click();
    await expect(page.getByText(m.detail.cantResume)).toBeVisible();
    expect(await layoutBreaks(page)).toEqual([]);
  });
});
```

Before running it, read three helpers and correct the spec to them rather than the reverse: `expectAxeClean`'s option (the steel primary's exemption is `allowDesignLockedAccent`; pass it only on pages that draw a primary button), `layoutBreaks`' return shape (`tests/e2e/layout.ts`), and the audit log's time column (the `order by at` above assumes `at`; `\d console.audit_log` says). `getByText` on a toast needs `exact: true`, as #87 found. A hidden duplicate (the phone cards at desktop width) is skipped by role queries, which is why the table is queried by role.

- [ ] **Step 2: Run it**

Run: `npx playwright test -c playwright.console.config.ts tests/e2e/console-auth/announcements.spec.ts`
Expected: 2 passed. From a worktree, with `E2E=1`, never against the port-3100 server (see `e2e-beside-a-running-dev-server`). The local database must have Task 1's migration applied.

A failure here is the first time these pages have run in a real Next runtime. Two classes of bug pass every earlier gate and show up only now (`client-boundary-value-imports`): a server file importing a value from a `"use client"` module, and a page whose data was baked in at build time. Debug with the throwaway-dev-server method in that note before changing a test.

- [ ] **Step 3: Update the docs**

In `docs/runbooks/announcements.md`, under "What an operator does", name the page for each step: Compose and Test send are `/announcements/new` and the draft's own address; Queue is the dialog there; Watch and Stop are the letter's detail. Say that Suppressions is not in the console yet and is still done by hand per the section below. In `docs/design/sheets/console/README.md`'s B4 section, add one line: the Letters pages were built from these boards on this branch, Suppressions follows.

- [ ] **Step 4: The whole gate**

```bash
rm -rf .next/types .next/dev/types
npm run check
npm run db:test
```

Expected: `npm run check` exits 0; `npm run db:test` reports 23 files and `Result: PASS`. A subset is not the gate.

- [ ] **Step 5: Commit and open the PR**

```bash
git add tests/e2e/console-auth/announcements.spec.ts docs/runbooks/announcements.md docs/design/sheets/console/README.md
git commit -m "test(announce): write, test, queue and stop a letter in a real browser; the runbook names the pages"
git push -u origin feat/announcements-letters
```

Open the PR into `main` with `gh pr create`. Its description must lead with this, above everything else:

> **Before you deploy: `npm run db:push` first**, from a checkout of this branch. The pages call seven functions that do not exist until the migration lands; deployed first, every Announcements page draws "Letters unavailable" and New letter fails. Nothing else in the product is affected, and sign-in mail is not.

Then: what an operator can now do; what is not here (Suppressions, next PR); the rulings from this plan's "Rulings made while planning" that the owner has not seen (2, 5, 6, 7, 8, 12 and the rounding in 9), each in one line; the gate's numbers. End with the Claude Code line. **Do not merge: ask the owner.**

---

## Self-review

**Spec coverage (§5).** A list with state and progress: Task 6. A compose view with Queue disabled until a test send: Tasks 8–10. A detail view with sent, skipped and unknown as separate counts, with Stop: Task 11. Every transition written to module 14 — queued, test sent, stopped: Task 1, asserted in pgTAP and again end to end. The suppressions view and "suppression lifted by hand" are the next PR, stated in Global constraints.

**Sheet coverage.** Desktop List, Compose, Queue confirm, Sending, Stop confirm, Stopped, Done, No access: Tasks 6, 10, 11. Phone List, Compose, Sending, Stop confirm, Stopped, Done, No access: Tasks 6, 10, 11, with Stop's sheet in Task 5. Suppressions, Lift confirm (both): next PR. Queued: built from the README note (ruling 13).

**Names used across tasks.** `LetterRow`, `LetterDetail`, `ListCounts`, `LetterList`, `LetterState` (Task 3) are what Tasks 4, 6, 8, 10 and 11 import. `Ahead`, `daysFor`, `finishDate`, `lettersAhead`, `percent` (Task 4) are what Tasks 10 and 11 import. `requestSave`, `requestTest`, `requestQueue`, `requestStop` (Task 9) are what Tasks 10 and 11 call. `ComposeLetter` is exported from `compose-form.tsx` and imported, as a type only, by `compose-readonly.tsx` and the page. `HowPlate` takes `titleId` everywhere it is drawn.

**Known differences from the sheet, each deliberate.** No tab row until Suppressions exists. A Done letter never shows an Unknown above zero (ruling 12). "Saved" on a draft is the day it was first saved, because the store keeps no later date. No "Sample data" cell: the app's data is real.
