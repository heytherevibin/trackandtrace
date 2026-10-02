-- Operator announcements (06-B). A private schema: no grants to anon or authenticated, RLS on with
-- no policies, and every read and write through a security-definer function granted to service_role
-- alone, exactly as `20260930090000_subscriptions.sql` has it.
--
-- THE CONTRACT for the eleven functions is `src/services/announcements/store.ts` and
-- `src/services/announcements/drain-store.ts`. The TypeScript wrappers destructure camelCase keys,
-- so every returned object is built with `jsonb_build_object('personId', …)` and a snake_case key
-- would read to them as a missing field. Every enum-like value crossing the PostgREST boundary is
-- `text`, never a Postgres enum, because PostgREST cannot pass one.
--
-- TWO CLOCKS ON A DELIVERY, with different jobs, and getting them the same way round is the one
-- thing in this file that a reader would feel:
--   * `claimed_at` is set on EVERY claim, a re-claim included, and only the claim's own 15-minute
--     floor reads it. Its job is to stop a run re-taking a row it is itself mid-way through.
--   * `first_attempted_at` is set ONCE, by the first claim, and never moved. Resend's memory of an
--     Idempotency-Key starts at the first attempt and a re-claim does not give it back, so this is
--     what the 24-hour window is measured from — by this claim, and by the runner that marks a row
--     `unknown` past it.
-- Measured from `claimed_at` instead, a row that keeps timing out is re-claimed daily, never reaches
-- 24 hours, never becomes `unknown`, and is eventually sent again under a key Resend has forgotten:
-- the reader gets the letter twice. `supabase/tests/announcements.test.sql` is the only thing in the
-- system that can observe this, because every test above the database is fed fixture rows.

create schema if not exists announcements;
revoke all on schema announcements from public, anon, authenticated;

create table announcements.letters (
  id               uuid primary key default gen_random_uuid(),
  list             text not null check (list in ('news', 'availability')),
  subject          text not null check (char_length(subject) between 1 and 200),
  body             text not null check (char_length(body) between 1 and 20000),
  state            text not null default 'draft' check (state in ('draft', 'queued', 'sending', 'stopped', 'done')),
  test_sent_at     timestamptz,
  test_sent_to     text,
  recipients_total int,
  created_by       uuid not null,
  created_at       timestamptz not null default now(),
  queued_at        timestamptz,
  queued_by        uuid,
  stopped_at       timestamptz,
  stopped_by       uuid,
  finished_at      timestamptz
);

create table announcements.deliveries (
  letter_id          uuid not null references announcements.letters (id) on delete cascade,
  person_id          uuid not null references subscriptions.people (id) on delete cascade,
  -- Five states, and `sending` is one of them: it is what `announce_claim` moves a row into and the
  -- only state a row is in while its letter is being sent. Leaving it out made the first real claim
  -- fail on a check violation, which is the whole feature dead on arrival, and contradicted the
  -- partial index below that selects on it. `failed` is deliberately NOT here: a failed send leaves
  -- the row `sending` and unmarked for the next run to retry, so `failed` is only a counter label
  -- in the runner and no row ever carries it.
  state              text not null default 'pending' check (state in ('pending', 'sending', 'sent', 'unknown', 'skipped')),
  claimed_at         timestamptz,
  -- Set once, by the first claim. See the header: this, and not `claimed_at`, is the 24-hour clock.
  first_attempted_at timestamptz,
  sent_at            timestamptz,
  provider_id        text,
  skip_reason        text,
  unique (letter_id, person_id)
);
create index deliveries_pending on announcements.deliveries (letter_id) where state = 'pending';
-- `sending` and `unknown` together are "not settled", which is what the claim retries and what the
-- stuck report reads.
create index deliveries_unsettled on announcements.deliveries (letter_id) where state in ('sending', 'unknown');

create table announcements.suppressions (
  email  text primary key check (email = lower(btrim(email))),
  scope  text not null check (scope in ('all', 'list')),
  reason text not null,
  source text not null,
  at     timestamptz not null default now()
);

create table announcements.webhook_events (
  svix_id     text primary key,
  kind        text not null,
  -- The address the event was about. Without it the soft-failure threshold cannot be counted per
  -- person, and would count every delayed delivery in the system against whoever was next.
  email       text not null check (email = lower(btrim(email))),
  -- When WE recorded it. The provider's own time is passed in and deliberately not stored: the
  -- 30-day soft count must not be movable by a clock we do not own.
  received_at timestamptz not null default now()
);
create index webhook_events_soft on announcements.webhook_events (email, received_at) where kind = 'email.delivery_delayed';

alter table announcements.letters enable row level security;
alter table announcements.deliveries enable row level security;
alter table announcements.suppressions enable row level security;
alter table announcements.webhook_events enable row level security;
revoke all on all tables in schema announcements from public, anon, authenticated;

-- The availability list promised exactly one email ("One email, nothing else", on the sign-up form).
-- A trigger, not a convention: the console refusing is a second line of defence, not the only one.
--
-- It counts a SEND, not merely a letter. If it counted any letter that had been queued, then
-- stopping one would spend the list for good — including a letter stopped before a single delivery
-- went out, so an operator who queues it, spots a typo in the first line and stops it has destroyed
-- their one use of the list. That is the opposite of what a Stop is for: a Stop must cost nothing
-- but the mail already sent. So: stopped with nothing sent leaves the list available; stopped after
-- some went out spends it, because those readers cannot be un-mailed.
--
-- It ALSO counts a letter that is currently LIVE — `queued` or `sending` — and that is not tidiness.
-- Without it two availability letters could both be queued while neither had sent, and then the
-- refusal would land inside the send path: A sends, the next run picks B, and B's `queued` ->
-- `sending` transition raises, so the announce job fails every day until a human stops B. A data
-- condition would have become a crash in the worst place there is. Counting a live letter puts the
-- refusal at QUEUE time, where the console can show it and nothing is mid-flight.
--
-- It only looks when a letter is being CREATED or made live. Moving one to `stopped` or `done` is
-- never refused: a Stop must always be allowed to land.
create or replace function announcements.one_availability_letter() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_going_live boolean := false;
begin
  if new.list <> 'availability' then return new; end if;
  -- `old` is unassigned on an insert, and SQL does not promise to short-circuit an `or`, so this is
  -- branched rather than written as one condition.
  if tg_op = 'INSERT' then
    v_going_live := true;
  elsif new.state is distinct from old.state and new.state in ('queued', 'sending') then
    v_going_live := true;
  end if;
  if v_going_live and exists (
    select 1 from announcements.letters l
     where l.list = 'availability' and l.id <> new.id
       and (l.state in ('queued', 'sending')
            or exists (select 1 from announcements.deliveries d where d.letter_id = l.id and d.state = 'sent'))
  ) then
    raise exception 'the availability list is spent: it promised exactly one email';
  end if;
  return new;
end $$;
create trigger letters_one_availability before insert or update on announcements.letters
  for each row execute function announcements.one_availability_letter();

-- WHO MAY BE SENT TO ON A LIST, in one place, because the answer is needed twice and the two must
-- never drift apart. `announce_queue` asks it when it makes the delivery rows, and `announce_claim`
-- asks it AGAIN for every row it is about to hand to the sender.
--
-- The second ask is the one that matters and the one that was missing. A letter to 430 readers
-- drains about eleven days at the day's allowance. A reader who clicks Unsubscribe on day 2 has
-- their consent withdrawn by `subscriptions_withdraw`, but their delivery row was written on day 1
-- when they were a subscriber — so without this, the row is claimed on day 7 and the letter goes to
-- someone who asked us to stop. Nothing else in the send path can refuse it: the sender reads the
-- suppression table, which withdrawal does not touch, and the claim's own join is to `people`.
--
-- It is the SAME condition `announce_queue` uses, deliberately: confirmed, and not withdrawn. A
-- reader who withdrew and signed up again has `confirmed_at` back to null until they confirm, and
-- mail to an unconfirmed address is exactly what the double opt-in exists to prevent.
create or replace function announcements.may_receive(p_person uuid, p_list text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from subscriptions.consents c
     where c.person_id = p_person and c.list = p_list
       and c.confirmed_at is not null and c.withdrawn_at is null);
$$;

-- ---------------------------------------------------------------------------
-- The six writes: `store.ts`.
-- ---------------------------------------------------------------------------

-- `create or replace function` cannot change a signature: it creates a second OVERLOAD and leaves
-- the first one in place. An earlier revision of this file — never pushed to production, but applied
-- on developer machines while this branch was being written — defined these two with one argument
-- each. Left behind, `announce_queue(uuid)` is a function service_role may still call that skips the
-- test-send guard and records no member, and PostgREST would resolve a one-argument call straight to
-- it. So they are dropped by name, which is a no-op anywhere they were never created.
drop function if exists public.announce_queue(uuid);
drop function if exists public.announce_stop(uuid);

-- One pending delivery per CONFIRMED, un-withdrawn consent on the letter's own list. A letter that
-- is not a draft is refused rather than queued twice: a second pass would be a second delivery row
-- for everyone who has joined since, on a letter already part-way sent.
--
-- AND A LETTER NOBODY HAS PROOFED CANNOT BE QUEUED. A test send is the only time anyone sees the
-- letter as a reader will — the wrapping, the unsubscribe line, the links — and it is the last point
-- at which a mistake costs nothing. In the database rather than only in the console for the same
-- reason the availability trigger is: the console refusing is a second line of defence, not the only
-- one, and this one guards every send rather than one list.
create or replace function public.announce_queue(p_letter uuid, p_member uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_list  text;
  v_state text;
  v_test  timestamptz;
  v_made  int;
begin
  select l.list, l.state, l.test_sent_at into v_list, v_state, v_test
    from announcements.letters l where l.id = p_letter;
  if not found then
    raise exception 'there is no such letter';
  end if;
  if v_state <> 'draft' then
    raise exception 'only a draft may be queued, and this letter is %', v_state;
  end if;
  if v_test is null then
    raise exception 'this letter has not been test sent, so nobody has seen it as a reader will';
  end if;

  insert into announcements.deliveries (letter_id, person_id)
  select p_letter, c.person_id
    from subscriptions.consents c
   where c.list = v_list and announcements.may_receive(c.person_id, v_list)
  on conflict (letter_id, person_id) do nothing;

  select count(*)::int into v_made from announcements.deliveries d where d.letter_id = p_letter;
  update announcements.letters
     set state = 'queued', queued_at = now(), queued_by = p_member, recipients_total = v_made
   where id = p_letter;
  return v_made;
end $$;

-- The one with teeth. `for update skip locked` is what makes two concurrent runs safe: without it
-- both could take the same row and one reader would receive the letter twice.
--
-- A row already `sending` is retried only inside both edges of a window:
--   * past the 15-MINUTE FLOOR on `claimed_at`, so a run cannot take back a row it is itself still
--     sending;
--   * STRICTLY inside the 24-HOUR CEILING on `first_attempted_at`. Strict `<` is deliberate and the
--     runner is pinned to the same boundary: it calls a row first attempted exactly 24 hours ago
--     stale. Were both inclusive, a row sitting precisely there would be retryable and stale at
--     once, and which happened would depend on which query ran first — and a strictly daily cron
--     lands exactly on that boundary, so it is the normal case and not an edge.
-- A `sending` row with no `first_attempted_at` cannot be shown to be inside the window, so it is
-- never retried; the runner marks it `unknown`, which is the side that never sends twice.
--
-- Claiming the first batch is also what moves the letter from `queued` to `sending`. Nothing else
-- knows that work has started, and a letter left `queued` for ever would keep coming back from
-- `announce_open_letters` after its last send.
--
-- Nothing is claimed on a letter that is not open. The runner reads the state before it claims, but
-- a Stop that lands in between would otherwise move forty rows to `sending` with fresh clocks on a
-- STOPPED letter: nothing is mailed, but `announce_finish` will never move them and the stuck report
-- excludes stopped letters, so those rows would sit unsettled for ever, invisible to every check.
create or replace function public.announce_claim(p_letter uuid, p_limit int) returns setof jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_list  text;
  v_state text;
begin
  select l.list, l.state into v_list, v_state from announcements.letters l where l.id = p_letter;
  if not found or v_state not in ('queued', 'sending') then
    return;
  end if;

  update announcements.letters set state = 'sending' where id = p_letter and state = 'queued';

  return query
  with taken as (
    update announcements.deliveries d
       set state = 'sending',
           claimed_at = now(),
           -- Only when it is null: every re-claim leaves the first attempt where it was.
           first_attempted_at = coalesce(d.first_attempted_at, now())
     where (d.letter_id, d.person_id) in (
       select letter_id, person_id from announcements.deliveries
        where letter_id = p_letter
          and (state = 'pending'
               or (state = 'sending'
                   and claimed_at < now() - interval '15 minutes'
                   and first_attempted_at is not null
                   and first_attempted_at > now() - interval '24 hours'))
          -- Consent, again, for every row about to be handed to the sender. See `may_receive`.
          and announcements.may_receive(person_id, v_list)
        order by person_id
        limit greatest(coalesce(p_limit, 0), 0)
        for update skip locked)
    returning d.person_id)
  select jsonb_build_object('personId', t.person_id, 'email', p.email)
    from taken t join subscriptions.people p on p.id = t.person_id;
end $$;

-- One delivery's outcome. `skipped` always carries its reason: `suppressed` is the only skip this
-- runner makes, and a skipped row with no stated reason is a row nobody can account for later. A
-- null provider id leaves whatever was there, so marking a sent row `unknown` does not erase the id
-- the send came back with.
create or replace function public.announce_mark(p_letter uuid, p_person uuid, p_state text, p_provider_id text)
returns void language sql security definer set search_path = '' as $$
  update announcements.deliveries d
     set state = p_state,
         sent_at = case when p_state = 'sent' then now() else d.sent_at end,
         provider_id = coalesce(p_provider_id, d.provider_id),
         skip_reason = case when p_state = 'skipped' then 'suppressed' else d.skip_reason end
   where d.letter_id = p_letter and d.person_id = p_person;
$$;

-- Only an open letter can be stopped. A done letter stays done, and a draft was never sending.
-- Who stopped it is recorded here, where the state changes, rather than being reconstructed from the
-- audit log later: the console's detail view names the person, and a column nobody writes is a
-- column that will be written from the wrong place.
create or replace function public.announce_stop(p_letter uuid, p_member uuid) returns void
language sql security definer set search_path = '' as $$
  update announcements.letters
     set state = 'stopped', stopped_at = now(), stopped_by = p_member
   where id = p_letter and state in ('queued', 'sending');
$$;

-- Whether the address is suppressed, and how widely. Null is "not suppressed"; the caller treats a
-- failure as "could not tell", which is not the same thing.
create or replace function public.announce_suppressed(p_email text) returns text
language sql stable security definer set search_path = '' as $$
  select s.scope from announcements.suppressions s where s.email = lower(btrim(p_email));
$$;

-- The event-to-effect mapping, so one place decides what a bounce means.
--
-- Two things here are deliberate and easy to get backwards. A complaint uses `on conflict do
-- nothing` so it can never WIDEN an existing `all` suppression down to `list` — a hard-bounced
-- address that later complains must stay fully suppressed. And `suppression.removed` deletes only
-- rows whose `source` is `resend`, so Resend lifting its own suppression never undoes one an
-- operator set by hand.
--
-- `p_at` is the provider's own time for the event. It is accepted because the route has it and
-- passes it, and deliberately not stored: `received_at` is when WE recorded the event, and the
-- 30-day soft count must not be movable by a clock we do not own.
create or replace function public.announce_webhook(p_svix_id text, p_kind text, p_email text, p_at timestamptz)
returns text language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(btrim(p_email));
begin
  insert into announcements.webhook_events (svix_id, kind, email) values (p_svix_id, p_kind, v_email)
  on conflict (svix_id) do nothing;
  if not found then return 'duplicate'; end if;   -- a replay changes nothing

  if p_kind = 'email.bounced' then
    insert into announcements.suppressions (email, scope, reason, source)
      values (v_email, 'all', 'hard bounce', 'resend')
      on conflict (email) do update set scope = 'all', reason = 'hard bounce', at = now();

  elsif p_kind = 'email.complained' then
    insert into announcements.suppressions (email, scope, reason, source)
      values (v_email, 'list', 'complaint', 'resend')
      on conflict (email) do nothing;            -- never widen an existing 'all' to 'list'
    -- Someone who marked us spam is not a subscriber. Withdraw every list they are on.
    update subscriptions.consents c set withdrawn_at = now(), withdraw_reason = 'did not sign up'
      from subscriptions.people p
     where p.id = c.person_id and p.email = v_email and c.withdrawn_at is null;

  elsif p_kind = 'email.delivery_delayed' then
    -- Soft: three BAD NIGHTS for this address inside 30 days suppress list mail; fewer are recorded
    -- and left. The row above is already inserted, so this count includes the event being handled.
    --
    -- Distinct DAYS, not events, and that is the whole decision. `webhook_events` keeps no message
    -- id — the route does not carry one — so one slow receiving host retrying a SINGLE message three
    -- times within an hour is indistinguishable from three separate failures, and counting events
    -- would suppress a live subscriber for one bad hour. Three different days is the thing the rule
    -- was written to describe. Whether Resend emits one event per message or one per attempt is not
    -- something we can see from here, which is exactly why this must not depend on it.
    if (select count(distinct date_trunc('day', e.received_at)) from announcements.webhook_events e
         where e.email = v_email and e.kind = 'email.delivery_delayed'
           and e.received_at > now() - interval '30 days') >= 3 then
      insert into announcements.suppressions (email, scope, reason, source)
        values (v_email, 'list', 'repeatedly delayed', 'resend') on conflict (email) do nothing;
    end if;

  elsif p_kind = 'suppression.added' then
    insert into announcements.suppressions (email, scope, reason, source)
      values (v_email, 'list', 'suppressed by Resend', 'resend') on conflict (email) do nothing;
  elsif p_kind = 'suppression.removed' then
    delete from announcements.suppressions where email = v_email and source = 'resend';
  end if;
  return 'recorded';
end $$;

-- ---------------------------------------------------------------------------
-- The five reads and the one transition the runner owns: `drain-store.ts`.
-- ---------------------------------------------------------------------------

-- Every letter that is queued or sending, in no promised order: choosing among them is the runner's
-- decision. `queued` is included because a letter that has never been claimed has not started yet.
create or replace function public.announce_open_letters() returns setof jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'id', l.id, 'list', l.list, 'subject', l.subject, 'body', l.body,
           'state', l.state, 'queuedAt', l.queued_at)
    from announcements.letters l
   where l.state in ('queued', 'sending');
$$;

-- One letter's state, or null when there is no such letter. Read before every batch and every send,
-- so a Stop takes effect at the next recipient rather than at the end of a batch of forty.
create or replace function public.announce_letter_state(p_letter uuid) returns text
language sql stable security definer set search_path = '' as $$
  select l.state from announcements.letters l where l.id = p_letter;
$$;

-- Every delivery of this letter that is NOT SETTLED, which is `sending` or `unknown`, each carrying
-- its own state so the caller can tell them apart. `unknown` belongs here: the stuck report has a
-- rule for "any unknown at all, because it is never normal", and with only `sending` rows that rule
-- would pass its own tests and read nothing in production.
create or replace function public.announce_open_claims(p_letter uuid) returns setof jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'personId', d.person_id, 'claimedAt', d.claimed_at,
           'firstAttemptedAt', d.first_attempted_at, 'state', d.state)
    from announcements.deliveries d
   where d.letter_id = p_letter and d.state in ('sending', 'unknown');
$$;

-- What is left, and when this letter last actually sent anything.
--
-- `pending` and `sending` are JSON NUMBERS: a count that arrives as a string makes the runner's
-- arithmetic quietly wrong rather than loudly broken.
--
-- `lastSentAt` is the LATEST `sent_at` among this letter's sent deliveries, or null when it has
-- never sent one. Null is the honest answer and the report reads it as "has never sent", measuring
-- from `queued_at` instead — never as the epoch, which would make every freshly queued letter look
-- 56 years stale and cry wolf on the first run.
create or replace function public.announce_remaining(p_letter uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'pending', (count(*) filter (where d.state = 'pending'))::int,
           'sending', (count(*) filter (where d.state = 'sending'))::int,
           'lastSentAt', max(d.sent_at) filter (where d.state = 'sent'))
    from announcements.deliveries d
   where d.letter_id = p_letter;
$$;

-- Done, and only from `queued` or `sending`, and only while NOTHING IS UNKNOWN. Both halves of that
-- `where` clause are the whole point of this function.
--
-- A Stop that landed mid-run must stay a Stop, and a blind update would quietly resurrect it.
--
-- And a letter with an `unknown` delivery is not finished, because `unknown` means we cannot say
-- whether that person received it — so we do not know that the letter is done. Without this the row
-- is buried the moment it is written: `announce_remaining` counts an `unknown` as neither pending
-- nor sending, so the same run that marks it reports nothing left and finishes the letter, and the
-- stuck report reads open letters only and never sees it again. The rule that exists to surface an
-- unknown would name nothing, ever, for any letter inside one day's allowance.
--
-- So the letter stays open and the report names it every day until a human settles that row — to
-- `sent` or to `skipped` — and the daily run stays red until they do. That is intended: `unknown` is
-- never normal, and a red run is the only state anyone notices.
create or replace function public.announce_finish(p_letter uuid) returns void
language sql security definer set search_path = '' as $$
  update announcements.letters
     set state = 'done', finished_at = now()
   where id = p_letter and state in ('queued', 'sending')
     and not exists (
       select 1 from announcements.deliveries d where d.letter_id = p_letter and d.state = 'unknown');
$$;

-- ---------------------------------------------------------------------------
-- service_role and nobody else.
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.announce_queue(uuid, uuid)',
    'public.announce_claim(uuid, int)',
    'public.announce_mark(uuid, uuid, text, text)',
    'public.announce_stop(uuid, uuid)',
    'public.announce_suppressed(text)',
    'public.announce_webhook(text, text, text, timestamptz)',
    'public.announce_open_letters()',
    'public.announce_letter_state(uuid)',
    'public.announce_open_claims(uuid)',
    'public.announce_remaining(uuid)',
    'public.announce_finish(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
revoke all on function announcements.one_availability_letter() from public, anon, authenticated;
revoke all on function announcements.may_receive(uuid, text) from public, anon, authenticated;
