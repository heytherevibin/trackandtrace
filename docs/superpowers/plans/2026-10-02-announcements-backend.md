# Announcements (07) — sheet 23 and the backend: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw sheet 23 for approval, and build everything behind module 07 that is not a page: the schema, the send that drains across days, the Svix-verified webhook, suppression, and the read-back check.

**Architecture:** A private `announcements` schema reached only through `security definer` functions, exactly as 06-A's. Queueing a letter freezes its recipient set into one row per person with a `unique (letter_id, person_id)` constraint, so double-sending is impossible in the database rather than by convention. A daily GitHub Actions job claims what the day's allowance permits, sends each with an `Idempotency-Key`, and records Resend's returned id. A Svix-signed webhook mirrors bounces, complaints and Resend's own suppression list into a table keyed by address.

**Tech Stack:** PostgreSQL (Supabase, pgTAP), Next.js 16 route handlers, Node scripts run by GitHub Actions, Vitest, `node:crypto`.

**Spec:** `docs/superpowers/specs/2026-10-02-announcements-design.md` — read it before Task 2; §2 is the model and §3 is the loop.

## Global Constraints

- TDD: write the failing test, **run it and see it fail**, then implement. Every task.
- Conventional commits. **No `Co-Authored-By` trailer** (project CLAUDE.md).
- `npm run check` is the gate: the whole of it, never a subset.
- TypeScript strict; never `any`. Files stay under 500 lines.
- Every UI string lives in `src/messages/`; no literals in JSX.
- **Never print, paste or commit a real secret.** Test keys are obviously fake.
- Traveller code never imports `@/console/*`.
- **Announcements are plain text.** `Letter` has no `html` field and does not grow one.
- **Exact values from the spec:**
  - Announcement ceiling: **40**. `budget = max(0, 40 − count)`.
  - The counter is the one confirmations use: `${prefix}:email:${emailDay(now)}` in `src/services/email/allowance.ts`, on **Resend's UTC day**.
  - Idempotency key: `` `${letterId}:${personId}` ``, header `Idempotency-Key`, Resend's window is **24 hours**.
  - A claimed row may be retried **only within 24 hours**; after that it is `unknown` and never retried.
  - Soft failures: **three `email.delivery_delayed` for one address within 30 days** suppress `list`.
  - Svix headers: `svix-id`, `svix-timestamp`, `svix-signature`; tolerance **±5 minutes**; **multiple space-separated `v1,…` signatures, any one matching is a pass**.
  - Suppression addresses are stored `lower(btrim(…))`.
  - Lists: `news` · `availability`. Letter states: `draft · queued · sending · stopped · done`. Delivery states: `pending · sent · unknown · skipped`.

## File structure

| File | Responsibility |
|---|---|
| `docs/design/sheets/console/ConsoleAnnouncements.dc.html` (create) | Sheet 23 at 1440 |
| `docs/design/sheets/console/ConsoleAnnouncementsPhone.dc.html` (create) | Sheet 23 at 390 |
| `docs/design/sheets/console/README.md` (modify) | The sheet table gains B4's row |
| `supabase/migrations/20261002090000_announcements.sql` (create) | Schema, constraints, the security-definer functions, grants |
| `supabase/tests/announcements.test.sql` (create) | pgTAP: RLS, grants, the unique constraint, the spent list |
| `src/services/email/send.ts` (modify) | Returns Resend's id; takes an idempotency key |
| `src/services/email/suppression.ts` (create) | `sendToAddress` — the one door list mail goes through |
| `src/services/announcements/budget.ts` (create) | Pure: what the day allows |
| `src/services/announcements/letter.ts` (create) | Pure: body assembly and the unsubscribe headers |
| `src/services/announcements/store.ts` (create) | The RPC wrappers |
| `src/services/webhooks/svix.ts` (create) | Pure: signature verification |
| `src/app/api/webhooks/resend/route.ts` (create) | The webhook |
| `src/app/api/unsubscribe/one-click/route.ts` (create) | RFC 8058's POST target |
| `scripts/announce-send.mjs` (create) | The runner |
| `scripts/announce-report.mjs` (create) | The read-back check |
| `.github/workflows/announce.yml` (create) | The daily job |
| `docs/runbooks/announcements.md` (create) | Operating it |

**Task 1 is PR 1 and is docs-only. Tasks 2–13 are PR 2 and do not depend on it** — the backend has no page. They can proceed while sheet 23 waits for approval. PR 3, the console, needs the approved sheet and gets its own plan.

---

## Task 1: Sheet 23, drawn for approval

**Files:**
- Create: `docs/design/sheets/console/ConsoleAnnouncements.dc.html`, `docs/design/sheets/console/ConsoleAnnouncementsPhone.dc.html`
- Modify: `docs/design/sheets/console/README.md`

**Interfaces:**
- Produces: the board PR 3 transcribes. Nothing in this plan consumes it.

- [ ] **Step 1: Read the conventions.** `docs/design/sheets/console/README.md` — every console sheet is a desktop/phone pair linking `industry.css`, with its states as props in `data-props`. Read `ConsoleTeam.dc.html` as the nearest sibling: a list with row actions and dialogs is the same shape as a list of letters.

- [ ] **Step 2: Draw the desktop sheet at 1440.** `data-props` carries:

```json
{"state":{"editor":"enum","options":["List","Compose","Sending","Stopped","Done","Suppressions","No access"],"default":"List","section":"State"},
 "role":{"editor":"enum","options":["Owner","Admin"],"default":"Owner","section":"State"},
 "defaultTheme":{"editor":"enum","options":["system","light","dark"],"default":"system","section":"Appearance"}}
```

  Each state draws, inside the console frame from `Main.dc.html`, with the page header kicker "07 · Announcements":
  - **List** — letters with subject, list, state and progress. Progress reads `Sent 120 · Skipped 3 · Unknown 0 of 418`.
  - **Compose** — subject, body (plain text), the list chosen, and a **Queue button that is disabled** with the reason beside it: a test send has not been made. The test-send control sits above it.
  - **Sending** — the detail view: the three counts as separate figures, an estimated finish ("about 4 days at 40 a day"), and Stop.
  - **Stopped** — the same, with what went already stated plainly and Stop replaced by nothing. A stopped letter is not resumable.
  - **Done** — final counts, no actions.
  - **Suppressions** — address, scope (All / List mail), reason, when, and where it came from. **Operator addresses are marked**, because a hard-bounced operator address stops their sign-in mail.
  - **No access** — what Support and Viewer see.

- [ ] **Step 3: Draw the phone sheet at 390.** Same states. The letters list becomes cards rather than a narrowed table, as `AuditLogPhone.dc.html` does for the audit log.

- [ ] **Step 4: Render-check both.** Open each at its own width in an iframe of that width — **not a 390px box inside a 1024px viewport**, which resolves every `max-sm:` rule desktop-side. Check both themes.

- [ ] **Step 5: Add the README row.** A new `## B4` section (or a row if one exists) naming both files, the sheet number (23), and the states.

- [ ] **Step 6: Commit.**

```bash
git add docs/design/sheets/console/ConsoleAnnouncements.dc.html docs/design/sheets/console/ConsoleAnnouncementsPhone.dc.html docs/design/sheets/console/README.md
git commit -m "docs(design): draw Console Announcements (sheet 23) for approval"
```

**This task ends at a review gate.** The sheet goes to the owner. PR 3 cannot start until it is approved; tasks 2–13 do not wait.

---

## Task 2: The schema

**Files:**
- Create: `supabase/migrations/20261002090000_announcements.sql`, `supabase/tests/announcements.test.sql`

**Interfaces:**
- Produces: tables `announcements.letters`, `.deliveries`, `.suppressions`, `.webhook_events`; functions `public.announce_queue(uuid)`, `public.announce_claim(uuid, int)`, `public.announce_mark(uuid, uuid, text, text)`, `public.announce_stop(uuid)`, `public.announce_webhook(text, text, text, text)`, `public.announce_suppressed(text)`.

- [ ] **Step 1: Write the failing pgTAP test** at `supabase/tests/announcements.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- The schema is private: nothing reaches it without a security-definer function.
select ok(not has_schema_privilege('anon', 'announcements', 'usage'), 'anon cannot use the schema');
select ok(not has_schema_privilege('authenticated', 'announcements', 'usage'), 'authenticated cannot use the schema');
select is(
  (select count(*)::int from pg_policies where schemaname = 'announcements'),
  0, 'RLS is on with no policies, so no row is reachable by policy');

-- The constraint that makes double-sending impossible.
insert into announcements.letters (id, list, subject, body, state, created_by)
  values ('11111111-1111-4111-8111-111111111111', 'news', 's', 'b', 'queued', gen_random_uuid());
insert into subscriptions.people (id, email, first_source)
  values ('22222222-2222-4222-8222-222222222222', 'a@example.in', 'footer');
insert into announcements.deliveries (letter_id, person_id, state)
  values ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'pending');
select throws_ok(
  $$insert into announcements.deliveries (letter_id, person_id, state)
    values ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'pending')$$,
  '23505', null, 'one delivery per person per letter, enforced by the database');

-- Suppression addresses are normalised on the way in.
select throws_ok(
  $$insert into announcements.suppressions (email, scope, reason, source)
    values ('A@Example.IN', 'all', 'hard bounce', 'resend')$$,
  '23514', null, 'an unnormalised address is refused, not silently stored');

-- The availability list is spent after one letter reaches a terminal state.
insert into announcements.letters (id, list, subject, body, state, created_by)
  values ('33333333-3333-4333-8333-333333333333', 'availability', 's', 'b', 'done', gen_random_uuid());
select throws_ok(
  $$insert into announcements.letters (id, list, subject, body, state, created_by)
    values (gen_random_uuid(), 'availability', 's2', 'b2', 'draft', gen_random_uuid())$$,
  'P0001', null, 'the availability list cannot be targeted twice');

-- Grants: service_role alone.
select ok(has_function_privilege('service_role', 'public.announce_claim(uuid, int)', 'execute'), 'service_role may claim');
select ok(not has_function_privilege('anon', 'public.announce_claim(uuid, int)', 'execute'), 'anon may not claim');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it.** `npm run db:test`. Expected: FAIL — the schema does not exist.

- [ ] **Step 3: Write the migration.** Follow `supabase/migrations/20260930090000_subscriptions.sql` exactly for shape: private schema, revokes, RLS on with no policies, `security definer set search_path = ''` on every function, and a `do $$ … $$` block granting each to `service_role` alone.

  The pieces that are not boilerplate:

```sql
create table announcements.letters (
  id              uuid primary key default gen_random_uuid(),
  list            text not null check (list in ('news', 'availability')),
  subject         text not null check (char_length(subject) between 1 and 200),
  body            text not null check (char_length(body) between 1 and 20000),
  state           text not null default 'draft' check (state in ('draft','queued','sending','stopped','done')),
  test_sent_at    timestamptz,
  recipients_total int,
  created_by      uuid not null,
  created_at      timestamptz not null default now(),
  queued_at       timestamptz,
  queued_by       uuid,
  stopped_by      uuid,
  stopped_at      timestamptz,
  test_sent_to    text,
  finished_at     timestamptz
);

-- The availability list promised exactly one email ("One email, nothing else", on the sign-up form).
-- A trigger, not a convention: the console refusing is a second line of defence, not the only one.
create or replace function announcements.one_availability_letter() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.list = 'availability' and exists (
    select 1 from announcements.letters
     where list = 'availability' and id <> new.id and state in ('queued','sending','stopped','done')
  ) then
    raise exception 'the availability list is spent: it promised exactly one email';
  end if;
  return new;
end $$;
create trigger letters_one_availability before insert or update on announcements.letters
  for each row execute function announcements.one_availability_letter();

create table announcements.deliveries (
  letter_id   uuid not null references announcements.letters (id) on delete cascade,
  person_id   uuid not null references subscriptions.people (id) on delete cascade,
  state       text not null default 'pending' check (state in ('pending','sent','unknown','skipped')),
  claimed_at  timestamptz,
  sent_at     timestamptz,
  provider_id text,
  skip_reason text,
  unique (letter_id, person_id)
);
create index deliveries_pending on announcements.deliveries (letter_id) where state = 'pending';

create table announcements.suppressions (
  email  text primary key check (email = lower(btrim(email))),
  scope  text not null check (scope in ('all','list')),
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
  received_at timestamptz not null default now()
);
create index webhook_events_soft on announcements.webhook_events (email, received_at) where kind = 'email.delivery_delayed';
```

  `announce_claim(p_letter uuid, p_limit int)` is the one with teeth — it must claim atomically so two runs cannot take the same row:

```sql
create or replace function public.announce_claim(p_letter uuid, p_limit int) returns setof jsonb
language sql security definer set search_path = '' as $$
  with taken as (
    update announcements.deliveries d set state = 'sending', claimed_at = now()
     where (d.letter_id, d.person_id) in (
       select letter_id, person_id from announcements.deliveries
        where letter_id = p_letter
          and (state = 'pending'
               or (state = 'sending' and claimed_at > now() - interval '24 hours'
                   and claimed_at < now() - interval '15 minutes'))
        order by person_id
        limit p_limit
        for update skip locked)
    returning d.person_id)
  select jsonb_build_object('personId', t.person_id, 'email', p.email)
    from taken t join subscriptions.people p on p.id = t.person_id;
$$;
```

  The `for update skip locked` is what makes two concurrent runs safe. The 15-minute floor stops a run reclaiming rows it is itself mid-way through; the 24-hour ceiling is Resend's idempotency window, past which a repeat is no longer safe.

  `announce_webhook` carries the event→effect mapping, so one place decides what a bounce means:

```sql
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
    -- Soft: three for THIS address inside 30 days suppress list mail; fewer are recorded and left.
    -- The row above is already inserted, so this count includes the event being handled.
    if (select count(*) from announcements.webhook_events e
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
```

  Two things in that function are deliberate and easy to get backwards. A complaint uses `on conflict do nothing` so it can never **widen** an existing `all` suppression down to `list` — a hard-bounced address that later complains must stay fully suppressed. And `suppression.removed` deletes only rows whose `source` is `resend`, so Resend lifting its own suppression never undoes one an operator set by hand.

- [ ] **Step 4: Run it.** `npm run db:test`. Expected: PASS, 8 assertions.
- [ ] **Step 5: Run the whole gate.** `npm run check`. Expected: exit 0.
- [ ] **Step 6: Commit.**

```bash
git add supabase/migrations/20261002090000_announcements.sql supabase/tests/announcements.test.sql
git commit -m "feat(announce): the schema, with double-sending refused by the database"
```

---

## Task 3: The sender returns Resend's id

**Files:**
- Modify: `src/services/email/send.ts`
- Test: `tests/unit/services/email/send.test.ts` (extend if present, else create)

**Interfaces:**
- Consumes: nothing new.
- Produces: `sendEmail(letter: Letter, idempotencyKey?: string): Promise<SendResult>` where `type SendResult = { outcome: "sent"; id: string } | { outcome: "captured" } | { outcome: "failed" }`.

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, expect, it, vi } from "vitest";
import { sendEmail } from "@/services/email/send";

const LETTER = { from: "a@trakline.in", to: "b@example.in", subject: "s", text: "t" };

describe("sendEmail", () => {
  it("gives back the id Resend returned, so a bounce can be tied to a recipient", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "49a3999c-0ce1" }), { status: 200 })));
    expect(await sendEmail(LETTER)).toEqual({ outcome: "sent", id: "49a3999c-0ce1" });
  });

  it("sends the idempotency key as a header when one is given", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: "x" }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    await sendEmail(LETTER, "letter:person");
    const init = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("letter:person");
  });

  it("is failed, with no id, when Resend refuses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    expect(await sendEmail(LETTER)).toEqual({ outcome: "failed" });
  });

  it("is failed when the body comes back without an id, because a send we cannot name is not a send we can track", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    expect(await sendEmail(LETTER)).toEqual({ outcome: "failed" });
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/unit/services/email/send.test.ts`. Expected: FAIL — `sendEmail` returns a bare string.

- [ ] **Step 3: Implement.** Change the return type and parse the body. Keep every existing contract: it still never throws, still has no database dependency, still goes to the outbox under E2E (now returning `{ outcome: "captured" }`).

- [ ] **Step 4: Update the three existing call sites** so the gate stays green — they read `.outcome` instead of the bare string. Find them with `grep -rn "sendEmail(" src/`.

- [ ] **Step 5: Run it.** `npx vitest run tests/unit/services/email` then `npx tsc --noEmit`. Expected: PASS and clean.
- [ ] **Step 6: Commit.**

```bash
git add src/services/email/send.ts tests/unit/services/email/send.test.ts src/services/subscriptions/subscribe.ts
git commit -m "feat(email): the sender gives back Resend's id and takes an idempotency key"
```

---

## Task 4: Svix signature verification

**Files:**
- Create: `src/services/webhooks/svix.ts`, `tests/unit/services/webhooks/svix.test.ts`

**Interfaces:**
- Produces: `verifySvix(secret: string, head: SvixHead, body: string, now: Date): boolean` and `interface SvixHead { readonly id: string; readonly timestamp: string; readonly signature: string }`.

- [ ] **Step 1: Write the failing test.** The vectors are computed in the test itself, so it tests the rule rather than a value someone copied:

```ts
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySvix } from "@/services/webhooks/svix";

const SECRET = `whsec_${Buffer.alloc(32, 7).toString("base64")}`;
const NOW = new Date("2026-10-02T12:00:00.000Z");
const BODY = '{"type":"email.bounced"}';
const ID = "msg_123";

function sign(id: string, ts: string, body: string, secret = SECRET): string {
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64")}`;
}
const stamp = (at: Date) => String(Math.floor(at.getTime() / 1000));

describe("verifySvix", () => {
  it("accepts a signature over id, timestamp and the raw body", () => {
    const ts = stamp(NOW);
    expect(verifySvix(SECRET, { id: ID, timestamp: ts, signature: sign(ID, ts, BODY) }, BODY, NOW)).toBe(true);
  });

  it("accepts when ANY of several signatures matches, because that is how key rotation works", () => {
    // Svix sends every active key's signature, space separated. Taking only the first would make a
    // rotation a silent outage: every webhook refused until the old key is retired.
    const ts = stamp(NOW);
    const other = `whsec_${Buffer.alloc(32, 9).toString("base64")}`;
    const both = `${sign(ID, ts, BODY, other)} ${sign(ID, ts, BODY)}`;
    expect(verifySvix(SECRET, { id: ID, timestamp: ts, signature: both }, BODY, NOW)).toBe(true);
  });

  it("refuses a body that changed by one character", () => {
    const ts = stamp(NOW);
    const sig = sign(ID, ts, BODY);
    expect(verifySvix(SECRET, { id: ID, timestamp: ts, signature: sig }, `${BODY} `, NOW)).toBe(false);
  });

  it("refuses a signature made for a different message id", () => {
    const ts = stamp(NOW);
    expect(verifySvix(SECRET, { id: "msg_other", timestamp: ts, signature: sign(ID, ts, BODY) }, BODY, NOW)).toBe(false);
  });

  it("refuses a timestamp outside five minutes, in either direction", () => {
    const old = new Date(NOW.getTime() - 6 * 60_000);
    const ahead = new Date(NOW.getTime() + 6 * 60_000);
    for (const at of [old, ahead]) {
      const ts = stamp(at);
      expect(verifySvix(SECRET, { id: ID, timestamp: ts, signature: sign(ID, ts, BODY) }, BODY, NOW)).toBe(false);
    }
  });

  it("refuses rubbish without throwing", () => {
    expect(verifySvix(SECRET, { id: ID, timestamp: "not-a-number", signature: "v1,zzz" }, BODY, NOW)).toBe(false);
    expect(verifySvix(SECRET, { id: ID, timestamp: stamp(NOW), signature: "" }, BODY, NOW)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/unit/services/webhooks/svix.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement:**

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export interface SvixHead {
  readonly id: string;
  readonly timestamp: string;
  readonly signature: string;
}

const PREFIX = "whsec_";
const TOLERANCE_MS = 5 * 60_000;

/**
 * Svix's scheme, as Resend sends it: HMAC-SHA256 over `${id}.${timestamp}.${raw body}`.
 *
 * Two details decide whether this is right or merely plausible. The signature header carries
 * EVERY active key's signature, space separated and each tagged `v1,` — during a key rotation both
 * old and new arrive, and accepting only the first makes the rotation a silent outage. And the
 * comparison is `timingSafeEqual`, which needs equal lengths, so a wrong-length candidate is
 * rejected before it reaches the comparison rather than throwing inside it.
 */
export function verifySvix(secret: string, head: SvixHead, body: string, now: Date): boolean {
  try {
    if (!secret.startsWith(PREFIX)) return false;
    const seconds = Number(head.timestamp);
    if (!Number.isFinite(seconds)) return false;
    if (Math.abs(now.getTime() - seconds * 1000) > TOLERANCE_MS) return false;

    const key = Buffer.from(secret.slice(PREFIX.length), "base64");
    const expected = Buffer.from(createHmac("sha256", key).update(`${head.id}.${head.timestamp}.${body}`).digest("base64"));

    return head.signature
      .split(" ")
      .filter((part) => part.startsWith("v1,"))
      .some((part) => {
        const given = Buffer.from(part.slice(3));
        return given.length === expected.length && timingSafeEqual(given, expected);
      });
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run it.** Expected: PASS, 6 tests.
- [ ] **Step 5: Mutation-test the rotation case.** Change `.some(` to read only the first signature, confirm the rotation test goes red, restore. Put that output in your report — that branch is the one nobody exercises until the day it matters.
- [ ] **Step 6: Commit.**

```bash
git add src/services/webhooks/svix.ts tests/unit/services/webhooks/svix.test.ts
git commit -m "feat(webhooks): Svix signature verification, including the rotation case"
```

---

## Task 5: The budget

**Files:**
- Create: `src/services/announcements/budget.ts`, `tests/unit/services/announcements/budget.test.ts`

**Interfaces:**
- Consumes: `emailDay` from `@/services/email/allowance`, `Kv` from `@/services/kv`.
- Produces: `ANNOUNCEMENT_CEILING = 40`; `announcementBudget(countToday: number): number`; `takeAnnouncements(kv: Kv, prefix: string, at: Date, want: number): Promise<number>`.

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, expect, it, vi } from "vitest";
import { ANNOUNCEMENT_CEILING, announcementBudget, takeAnnouncements } from "@/services/announcements/budget";

describe("the announcement budget", () => {
  it("is what is left under the ceiling", () => {
    expect(ANNOUNCEMENT_CEILING).toBe(40);
    expect(announcementBudget(0)).toBe(40);
    expect(announcementBudget(31)).toBe(9);
  });

  it("is zero, never negative, once the day is past the ceiling", () => {
    // Confirmations may take the day to 60. Announcements are squeezed first and send nothing,
    // which is a normal outcome rather than an error.
    expect(announcementBudget(40)).toBe(0);
    expect(announcementBudget(95)).toBe(0);
  });

  it("takes no more than the day leaves, and reports what it actually got", async () => {
    const kv = { incrBy: vi.fn(async () => 38), get: vi.fn(), set: vi.fn(), del: vi.fn(), incr: vi.fn(), ttl: vi.fn() };
    // 38 after the add means 30 were already spent and 8 of the 10 asked for fit.
    expect(await takeAnnouncements(kv as never, "t", new Date("2026-10-02T00:00:00Z"), 10)).toBe(8);
  });

  it("takes nothing when the counter cannot be read, because sending blind spends the operators' reserve", async () => {
    const kv = { incrBy: vi.fn(async () => { throw new Error("down"); }), get: vi.fn(), set: vi.fn(), del: vi.fn(), incr: vi.fn(), ttl: vi.fn() };
    expect(await takeAnnouncements(kv as never, "t", new Date(), 10)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it.** Expected: FAIL, module not found.

- [ ] **Step 3: Implement.** `takeAnnouncements` reserves optimistically with one `incrBy(+want)`, works out how many actually fit under the ceiling, and gives the rest back with a negative `incrBy` — the pattern `takeConfirmation` already uses in `allowance.ts`. It fails closed: any error returns 0.

- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add src/services/announcements/budget.ts tests/unit/services/announcements/budget.test.ts
git commit -m "feat(announce): the day's budget, squeezed first and failing closed"
```

---

## Task 6: The letter's text and its headers

**Files:**
- Create: `src/services/announcements/letter.ts`, `tests/unit/services/announcements/letter.test.ts`
- Modify: `src/messages/en-IN/subscribe.ts`

**Interfaces:**
- Consumes: `unsubscribeUrl`, `signUnsubscribe`, `unsubscribeKey` from `@/services/subscriptions/links`.
- Produces: `letterText(body: string, humanUrl: string): string`; `listHeaders(oneClickUrl: string): Record<string, string>`.

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, expect, it } from "vitest";
import { letterText, listHeaders } from "@/services/announcements/letter";
import { messages } from "@/messages";

describe("a list email", () => {
  it("ends with the unsubscribe line, whatever the operator wrote", () => {
    // The operator cannot forget it, because they never type it.
    const out = letterText("Hello.\n", "https://trakline.in/unsubscribe?p=1&l=news&s=abc");
    expect(out.startsWith("Hello.\n")).toBe(true);
    expect(out).toContain(messages.subscribe.email.unsubscribeLine);
    expect(out).toContain("https://trakline.in/unsubscribe?p=1&l=news&s=abc");
  });

  it("carries the one-click headers RFC 8058 defines", () => {
    const h = listHeaders("https://trakline.in/api/unsubscribe/one-click?p=1&l=news&s=abc");
    expect(h["List-Unsubscribe"]).toBe("<https://trakline.in/api/unsubscribe/one-click?p=1&l=news&s=abc>");
    expect(h["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});
```

- [ ] **Step 2: Run it.** Expected: FAIL, module not found.

- [ ] **Step 3: Implement**, and add to `messages.subscribe.email`:

```ts
    unsubscribeLine: "You are getting this because you asked for news about Trakline. Stop at any time:",
```

  `listHeaders` returns the two headers only. The angle brackets are required by RFC 2369 and a header without them is ignored by some clients.

- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add src/services/announcements/letter.ts tests/unit/services/announcements/letter.test.ts src/messages/en-IN/subscribe.ts
git commit -m "feat(announce): the unsubscribe line and headers the sender appends, never the operator"
```

---

## Task 7: One-click unsubscribe, the POST the headers promise

**Files:**
- Create: `src/app/api/unsubscribe/one-click/route.ts`, `tests/integration/api/one-click.test.ts`

**Interfaces:**
- Consumes: `verifyUnsubscribe`, `unsubscribeKey` from `@/services/subscriptions/links`; `withdrawRow` from `@/services/subscriptions/store`.
- Produces: `POST /api/unsubscribe/one-click?p=…&l=…&s=…`.

**Why this exists.** `List-Unsubscribe-Post: List-Unsubscribe=One-Click` tells a mail client to **POST** to the `List-Unsubscribe` URL (RFC 8058). `/unsubscribe` is a GET page and would answer 405. Advertising one-click without a POST target is worse than not advertising it: Gmail and Outlook show the button and it fails.

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, expect, it, vi } from "vitest";

const { withdrawRow } = vi.hoisted(() => ({ withdrawRow: vi.fn(async () => "done") }));
vi.mock("@/services/subscriptions/store", () => ({ withdrawRow }));

import { POST } from "@/app/api/unsubscribe/one-click/route";
import { signUnsubscribe, unsubscribeKey } from "@/services/subscriptions/links";

const PERSON = "8a1f2c3d-0000-4000-8000-000000000001";
const url = (s: string, l = "news") => `https://trakline.in/api/unsubscribe/one-click?p=${PERSON}&l=${l}&s=${s}`;
const good = () => signUnsubscribe(unsubscribeKey(), PERSON, "news");

describe("POST /api/unsubscribe/one-click", () => {
  it("withdraws on a signed link and answers 200, because a mail client shows the button's failure to the reader", async () => {
    const res = await POST(new Request(url(good()), { method: "POST", body: "List-Unsubscribe=One-Click" }));
    expect(res.status).toBe(200);
    expect(withdrawRow).toHaveBeenCalledWith(PERSON, "news", null);
  });

  it("refuses a signature that does not verify, and withdraws nothing", async () => {
    withdrawRow.mockClear();
    const res = await POST(new Request(url("B".repeat(43)), { method: "POST", body: "" }));
    expect(res.status).toBe(400);
    expect(withdrawRow).not.toHaveBeenCalled();
  });

  it("refuses a signature minted for the other list", async () => {
    withdrawRow.mockClear();
    const res = await POST(new Request(url(good(), "availability"), { method: "POST", body: "" }));
    expect(res.status).toBe(400);
    expect(withdrawRow).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/integration/api/one-click.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement.** Parse `p`, `l`, `s` from the query with the same shapes `/api/unsubscribe` uses, verify the signature before anything is written, call `withdrawRow(p, l, null)`, answer 200 on `done` or `already`. `export const dynamic = "force-dynamic"`.

- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Run the gate.** `npm run check`. Expected: exit 0.
- [ ] **Step 6: Commit.**

```bash
git add "src/app/api/unsubscribe/one-click" tests/integration/api/one-click.test.ts
git commit -m "feat(subscribe): the POST target one-click unsubscribe headers promise"
```

---

## Task 8: Suppression, and the one door

**Files:**
- Create: `src/services/email/suppression.ts`, `tests/unit/services/email/suppression.test.ts`, `tests/unit/services/email/one-door.contract.test.ts`

**Interfaces:**
- Consumes: `sendEmail`, `Letter`, `SendResult` from `@/services/email/send`; `announce_suppressed` through a store wrapper.
- Produces: `sendToAddress(letter: Letter, kind: "list" | "transactional", idempotencyKey?: string): Promise<SendResult>`.

- [ ] **Step 1: Write the failing tests.** Two files. First the behaviour:

```ts
import { describe, expect, it, vi } from "vitest";

const { suppressionFor } = vi.hoisted(() => ({ suppressionFor: vi.fn(async () => null as null | string) }));
vi.mock("@/services/announcements/store", () => ({ suppressionFor }));
const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => ({ outcome: "sent", id: "x" })) }));
vi.mock("@/services/email/send", () => ({ sendEmail }));

import { sendToAddress } from "@/services/email/suppression";

const LETTER = { from: "a@trakline.in", to: "B@Example.IN", subject: "s", text: "t" };

describe("sendToAddress", () => {
  it("sends when nothing is suppressed", async () => {
    suppressionFor.mockResolvedValueOnce(null);
    expect(await sendToAddress(LETTER, "list")).toEqual({ outcome: "sent", id: "x" });
  });

  it("refuses list mail to a complaint, and transactional mail still goes", async () => {
    suppressionFor.mockResolvedValue("list");
    expect(await sendToAddress(LETTER, "list")).toEqual({ outcome: "failed" });
    expect(await sendToAddress(LETTER, "transactional")).toEqual({ outcome: "sent", id: "x" });
  });

  it("refuses everything to a hard bounce, transactional included", async () => {
    suppressionFor.mockResolvedValue("all");
    expect(await sendToAddress(LETTER, "transactional")).toEqual({ outcome: "failed" });
  });

  it("looks the address up normalised, or a suppression never matches what we send to", async () => {
    suppressionFor.mockResolvedValue(null);
    await sendToAddress(LETTER, "list");
    expect(suppressionFor).toHaveBeenCalledWith("b@example.in");
  });

  it("refuses when the suppression table cannot be read — failing closed, never open", async () => {
    suppressionFor.mockRejectedValueOnce(new Error("down"));
    expect(await sendToAddress(LETTER, "list")).toEqual({ outcome: "failed" });
  });
});
```

  Then the contract, which is what keeps the door shut as the codebase grows:

```ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Every file under src/, except the two allowed to know `sendEmail` exists. */
function sources(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, found);
    else if (/\.tsx?$/.test(name)) found.push(path);
  }
  return found;
}

describe("the one door", () => {
  it("is the only way mail leaves this application", () => {
    // sendEmail does not know about suppression and must not: it has no database. The guard is that
    // nothing may call it except the wrapper that does check. A convention decays; this does not.
    const allowed = new Set(["src/services/email/send.ts", "src/services/email/suppression.ts"]);
    const offenders = sources("src")
      .filter((p) => !allowed.has(p.replace(/\\/g, "/")))
      .filter((p) => /from "@\/services\/email\/send"/.test(readFileSync(p, "utf8")));
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them.** Expected: FAIL — the module does not exist, and the contract test lists the existing callers.

- [ ] **Step 3: Implement `sendToAddress`**, and move every existing `sendEmail` caller behind it as `"transactional"`. The contract test tells you exactly which files.

- [ ] **Step 4: Run them.** Expected: PASS, and the contract test's list is empty.
- [ ] **Step 5: Mutation-test the door.** Add a direct `import { sendEmail } from "@/services/email/send"` to any other file, confirm the contract test names it, remove it. Put the output in your report.
- [ ] **Step 6: Commit.**

```bash
git add src/services/email/suppression.ts tests/unit/services/email src/services/subscriptions/subscribe.ts
git commit -m "feat(email): one door for outgoing mail, with a contract test that keeps it shut"
```

---

## Task 9: The store

**Files:**
- Create: `src/services/announcements/store.ts`, `tests/unit/services/announcements/store.test.ts`

**Interfaces:**
- Consumes: `createAdminSupabase` from `@/services/supabase/admin`.
- Produces: `queueLetter(id: string): Promise<number>`; `claimDeliveries(letterId: string, limit: number): Promise<readonly { personId: string; email: string }[]>`; `markDelivery(letterId: string, personId: string, state: "sent" | "unknown" | "skipped", providerId: string | null): Promise<void>`; `stopLetter(id: string): Promise<void>`; `suppressionFor(email: string): Promise<"all" | "list" | null>`; `recordWebhook(svixId: string, kind: string, email: string, at: string): Promise<"recorded" | "duplicate">`.

- [ ] **Step 1: Write the failing test.** Mock `createAdminSupabase` and assert each wrapper calls the right RPC with the right argument names — these are the names the migration declares, and a mismatch is a runtime error nothing else catches:

```ts
import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn(async () => ({ data: null, error: null }));
vi.mock("@/services/supabase/admin", () => ({ createAdminSupabase: () => ({ rpc }) }));

import { claimDeliveries, markDelivery, suppressionFor } from "@/services/announcements/store";

describe("the announcements store", () => {
  it("claims through announce_claim with the limit it was given", async () => {
    rpc.mockResolvedValueOnce({ data: [{ personId: "p1", email: "a@example.in" }], error: null });
    expect(await claimDeliveries("L", 7)).toEqual([{ personId: "p1", email: "a@example.in" }]);
    expect(rpc).toHaveBeenCalledWith("announce_claim", { p_letter: "L", p_limit: 7 });
  });

  it("marks one delivery with the provider's id", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await markDelivery("L", "p1", "sent", "resend-id");
    expect(rpc).toHaveBeenCalledWith("announce_mark", { p_letter: "L", p_person: "p1", p_state: "sent", p_provider_id: "resend-id" });
  });

  it("reads a suppression, and treats an unknown answer as no suppression rather than guessing", async () => {
    rpc.mockResolvedValueOnce({ data: "list", error: null });
    expect(await suppressionFor("a@example.in")).toBe("list");
    rpc.mockResolvedValueOnce({ data: "nonsense", error: null });
    expect(await suppressionFor("a@example.in")).toBe(null);
  });

  it("throws when the database errors, so a caller cannot mistake a failure for an empty result", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(claimDeliveries("L", 1)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it.** Expected: FAIL, module not found.
- [ ] **Step 3: Implement**, following `src/services/subscriptions/store.ts` for shape: one small function per RPC, nothing reads a table.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add src/services/announcements/store.ts tests/unit/services/announcements/store.test.ts
git commit -m "feat(announce): the RPC wrappers, one per function"
```

---

## Task 10: The webhook

**Files:**
- Create: `src/app/api/webhooks/resend/route.ts`, `tests/integration/api/resend-webhook.test.ts`
- Modify: `src/services/env.ts` (add `RESEND_WEBHOOK_SECRET`), `.env.example`

**Interfaces:**
- Consumes: `verifySvix` (Task 4), `recordWebhook` (Task 9).
- Produces: `POST /api/webhooks/resend`.

- [ ] **Step 1: Write the failing test** covering a valid event, a tampered body, a replay, and the event mapping. Use the same locally computed signature helper as Task 4 — never a pasted constant.

```ts
it("records a bounce once and answers 200 to the replay without acting twice", async () => {
  recordWebhook.mockResolvedValueOnce("recorded").mockResolvedValueOnce("duplicate");
  const body = JSON.stringify({ type: "email.bounced", data: { to: ["a@example.in"] } });
  const head = signed(body);
  expect((await POST(req(body, head))).status).toBe(200);
  expect((await POST(req(body, head))).status).toBe(200);
  expect(recordWebhook).toHaveBeenCalledTimes(2);
});

it("answers 400 and records nothing when the signature does not verify", async () => {
  recordWebhook.mockClear();
  const body = JSON.stringify({ type: "email.bounced", data: { to: ["a@example.in"] } });
  expect((await POST(req(body, { ...signed(body), signature: "v1,zzz" }))).status).toBe(400);
  expect(recordWebhook).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run it.** Expected: FAIL, module not found.

- [ ] **Step 3: Implement.** Read the body as **raw text before parsing** — the signature covers the exact bytes, and `await req.json()` then re-stringifying changes them. Verify, then `recordWebhook`, then 200. On a verification failure answer 400 and record nothing. On a store failure answer 500 so Svix retries, which is safe because the retry is deduplicated by `svix_id`.

- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add "src/app/api/webhooks" tests/integration/api/resend-webhook.test.ts src/services/env.ts .env.example
git commit -m "feat(announce): the Resend webhook, verified before it is read"
```

---

## Task 11: The runner

**Files:**
- Create: `scripts/announce-send.mjs`, `scripts/announce-plan.mjs`, `tests/unit/scripts/announce-plan.test.ts`

**Interfaces:**
- Produces: `announce-plan.mjs` exports `nextBatch({ budget, claimed })` — pure; `announce-send.mjs` is the only file that touches the world, as `crawl-availability.mjs` stands to `crawl-plan.mjs`.

- [ ] **Step 1: Write the failing test** at `tests/unit/scripts/announce-plan.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextBatch, staleClaims } from "../../../scripts/announce-plan.mjs";

const AT = new Date("2026-10-02T09:00:00.000Z");
const hoursAgo = (n: number) => new Date(AT.getTime() - n * 3_600_000).toISOString();

describe("nextBatch", () => {
  it("claims what the budget allows and no more", () => {
    expect(nextBatch({ budget: 7, pending: 40 })).toBe(7);
    expect(nextBatch({ budget: 40, pending: 3 })).toBe(3);
  });

  it("claims nothing when the day is spent, which is a normal outcome", () => {
    expect(nextBatch({ budget: 0, pending: 100 })).toBe(0);
  });
});

describe("staleClaims", () => {
  it("names rows claimed more than 24 hours ago, which can never be retried safely", () => {
    // Resend's idempotency window is 24 hours. Past it a repeat might duplicate, so the row is
    // marked unknown and left alone. Nothing else in the system will ever move it.
    const rows = [
      { personId: "p1", claimedAt: hoursAgo(25) },
      { personId: "p2", claimedAt: hoursAgo(2) },
    ];
    expect(staleClaims(rows, AT)).toEqual(["p1"]);
  });

  it("leaves a row claimed inside the window alone, because the next run may still retry it", () => {
    expect(staleClaims([{ personId: "p1", claimedAt: hoursAgo(23) }], AT)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/unit/scripts/announce-plan.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement both.** The runner, in this order:
  1. Find the letter in `queued`/`sending`.
  2. **Mark stale claims `unknown` first.** `staleClaims` names rows claimed more than 24 hours ago; each gets `markDelivery(letterId, personId, "unknown", null)`. Nothing else in the system moves them, and a row left `sending` forever would make the letter look permanently in flight. This is the only writer of `unknown`.
  3. Take the budget, claim that many.
  4. Per recipient: build the signed unsubscribe URLs, assemble the text and headers, `sendToAddress(letter, "list", `${letterId}:${personId}`)`, then `markDelivery(..., "sent", id)` on success. A `failed` outcome leaves the row `sending` for the next run to retry inside the window.
  5. When no `pending` rows remain, mark the letter `done`.

  **Check the letter's state before each batch and before each send** so Stop takes effect at once.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add scripts/announce-send.mjs scripts/announce-plan.mjs tests/unit/scripts/announce-plan.test.ts
git commit -m "feat(announce): the runner, and every decision in a file a test can drive"
```

---

## Task 12: The read-back check

**Files:**
- Create: `scripts/announce-coverage.mjs`, `scripts/announce-report.mjs`, `tests/unit/scripts/announce-coverage.test.ts`
- Modify: `package.json` (add `announce:send` and `announce:report`)

**Interfaces:**
- Produces: `npm run announce:report` — exit 0 when nothing is stuck, 1 when something is.

- [ ] **Step 1: Write the failing test** at `tests/unit/scripts/announce-coverage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { stuck } from "../../../scripts/announce-coverage.mjs";

const AT = new Date("2026-10-02T09:00:00.000Z");
const hoursAgo = (n: number) => new Date(AT.getTime() - n * 3_600_000).toISOString();

const letter = (over = {}) => ({ id: "L", state: "sending", pending: 10, lastSentAt: hoursAgo(1), ...over });

describe("what counts as stuck", () => {
  it("is nothing when a letter is advancing", () => {
    expect(stuck([letter()], [], AT)).toEqual([]);
  });

  it("names a letter whose pending count has not fallen in 48 hours", () => {
    // The job runs daily. Two runs with no progress means the job is not running, or every send
    // is failing — either way a person should look.
    expect(stuck([letter({ lastSentAt: hoursAgo(49) })], [], AT))
      .toEqual([{ letterId: "L", why: "no delivery in 48 hours, 10 still pending" }]);
  });

  it("names a delivery still claimed past the idempotency window", () => {
    const rows = [{ letterId: "L", personId: "p1", state: "sending", claimedAt: hoursAgo(25) }];
    expect(stuck([letter()], rows, AT))
      .toEqual([{ letterId: "L", why: "1 delivery claimed over 24 hours ago and never marked" }]);
  });

  it("names any unknown at all, because it is never normal", () => {
    const rows = [{ letterId: "L", personId: "p1", state: "unknown", claimedAt: hoursAgo(30) }];
    expect(stuck([letter()], rows, AT)).toEqual([{ letterId: "L", why: "1 unknown: we cannot say whether it was sent" }]);
  });

  it("says nothing about a done letter, whatever its history", () => {
    expect(stuck([letter({ state: "done", pending: 0, lastSentAt: hoursAgo(300) })], [], AT)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/unit/scripts/announce-coverage.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement**, splitting pure from runner exactly as `observations-coverage.mjs` stands to `observations-report.mjs`. Write the same kind of header: what counts as stuck, and **what this reading cannot see**.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add scripts/announce-coverage.mjs scripts/announce-report.mjs tests/unit/scripts/announce-coverage.test.ts package.json
git commit -m "feat(announce): a check that reads the store back and says what is stuck"
```

---

## Task 13: The workflow, the runbook, and the gate

**Files:**
- Create: `.github/workflows/announce.yml`, `docs/runbooks/announcements.md`
- Modify: `docs/architecture.md`

- [ ] **Step 1: Write the workflow**, modelled on `.github/workflows/crawl.yml`: a daily `schedule`, `workflow_dispatch`, `concurrency` with `cancel-in-progress: false` (a half-finished send has spent allowance), paired Supabase secrets, `RESEND_API_KEY`, and a Coverage step running `npm run announce:report` with `continue-on-error: true`.

  **Pick a cron away from the crawler's.** The crawler runs `0 0 * * *` and GitHub delays scheduled runs under load; two jobs that both want the Resend allowance should not start together. Use `0 4 * * *` and say why in a comment.

- [ ] **Step 2: Write the runbook.** What an operator does: compose, test send, queue, watch, stop. What each stuck state means. What `unknown` means and why it is never retried. How to lift a suppression by hand and when that is right.

- [ ] **Step 3: Update `docs/architecture.md`** with the module, in the same voice as the crawler's paragraph.

- [ ] **Step 4: Run the whole gate.** `npm run check`. Expected: exit 0.
- [ ] **Step 5: Run the database tests.** `npm run db:test`. Expected: PASS.
- [ ] **Step 6: Rebase onto `origin/main`** and run `npm run check` again on the rebased tree.
- [ ] **Step 7: Push and open the PR into `main`.** The description leads with what this is — the backend of module 07, with no page yet — and names the owner's one action: **the Resend webhook endpoint and its signing secret must be configured in the Resend dashboard**, and `RESEND_WEBHOOK_SECRET` set in the deployment, before the webhook can be verified against anything real. End with the Claude Code line, and no `Co-Authored-By` trailer.
- [ ] **Step 8:** Call `mcp__ccd_pr__get_status`. **Never merge without the owner.**

---

## Already decided, do not revisit

- **Announcements are plain text.** `Letter` has no `html` field.
- **The availability list is single-use.** Enforced by a database trigger as well as by the console.
- **`unknown` is never retried** past 24 hours. It is its own count, never folded into sent or failed.
- **Suppression is per kind**: hard bounce → `all`, complaint → `list` plus consent withdrawn, soft → a threshold of three in 30 days.

## What this plan does not do

- **The console pages.** PR 3, after sheet 23 is approved. It gets its own plan.
- **Chart-preparation alerts.** A different trigger and a different shape; its own spec when this ships.
- **Resending a stopped letter.** A stopped letter is final. Compose a new one.
- **Scheduling a send for a future date.** Queue starts the drain at the next run.
