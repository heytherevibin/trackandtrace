# Subscriptions core (06-A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email sign-ups with double opt-in (News and Availability launch lists): drawn sheets for approval (PR 1), then the tables, flows, confirmation email, daily allowance and privacy notice v1.1 (PR 2).

**Architecture:** A private Postgres schema `subscriptions` holds people, per-list consents and hashed confirm tokens. It is reached only through `public.subscriptions_*` functions granted to `service_role`. A traveller API (`/api/subscribe`, `/api/subscribe/confirm`, `/api/unsubscribe`) orchestrates:
- limiter scope `subscribe`;
- a UTC-day email allowance in Upstash that fails closed;
- the database function;
- one plain-text email through Resend.

Unsubscribe links are HMAC-signed, not stored.

**Tech Stack:** Next.js 16 route handlers, Supabase Postgres (pgTAP), Upstash via the repo's `Kv`, Resend REST, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-28-subscriptions-core-design.md`

**Out of scope here:** PR 3, the traveller forms and the two pages. It has its own plan, written after the PR 1 drawings are approved, because it transcribes them.

## Global Constraints

- TDD: write the failing test, **run it and see it fail**, then implement. Every task.
- Conventional commits. **No `Co-Authored-By` trailer** (project CLAUDE.md).
- `npm run check` is the gate: the whole of it, never a subset. `npm run db:test` for SQL.
- Never `supabase start/stop/db reset`. Apply migrations locally with `npx supabase@2.117.0 migration up --local`.
- Never name a data provider on traveller surfaces (`tests/unit/privacy/no-provider-names.test.ts` scans `src/app`, `src/components`, `src/messages`).
- Traveller code never imports `@/console/*` (`tests/unit/console/boundary.contract.test.ts`).
- Files stay under 500 lines, except the generated `src/types/supabase.ts` (owner's decision, 2026-09-28).
- Copy, verbatim:
  - Invalid: "Enter an email address like name@example.com."
  - Limited: "Too many sign-ups from this connection. Try again later."
  - Allowance spent: "We can't send more confirmation emails today. Try again after 05:30 IST."
  - Error: "That didn't go through. Try again."
  - Sent: "Check your inbox to confirm."
- Numbers:
  - Confirm tokens last **48 h**.
  - Unconfirmed people are purged after **7 days**.
  - Resend guard: **10 min**.
  - Limit: **5 an hour** per address (IPv6 per /64).
  - Allowance ceiling: **60** confirmations while the UTC day's count is below it. Resend's cap is 100, so 40 are kept for console mail.
- Lists: `news`, `availability`.
- Sources: `footer`, `landing`, `pre-booking`, `account`, `added by hand`.
- Withdraw reasons: `too many`, `not relevant`, `did not sign up`, `other`.
- Privacy notice version recorded on each consent: `1.1`.
- Sender: `Trakline <updates@trakline.in>` (env `SUBSCRIBE_EMAIL_FROM`).
- Production traveller origin: `https://trakline.in` (the apex; `www` 308s to it, checked 2026-09-28).
- **Base branch:** `main` if #84–#87 have merged. Otherwise stack on `feat/console-blocks`: it carries `publicStoreForReading` (#84) and `LIMITED_SCOPES` (#86), which Tasks 4 and 7 use.

---

## PR 1: the drawings

### Task 1: Draw Sign-up Capture and Subscription

**Files:**
- Create: `docs/design/sheets/traveller/SignupCapture.dc.html`, `docs/design/sheets/traveller/SignupCapturePhone.dc.html`
- Create: `docs/design/sheets/traveller/Subscription.dc.html`, `docs/design/sheets/traveller/SubscriptionPhone.dc.html`
- Modify: `docs/design/sheets/traveller/README.md` (a "B4: sign-ups" table, like the B2 one)

- [ ] **Step 1: Start from B1's own markup.** Copy `Legal.dc.html` (it has the one-line footer) and `Notices.dc.html` (it has the full landing footer) as bases. They are the app's real markup plus `app.css`, so the drawings render like the site.
- [ ] **Step 2: Draw `SignupCapture.dc.html`**, one board with a `place` prop and a `state` prop:
  - **Places:**
    - landing full footer: a column "Updates by email";
    - one-line footer: a compact row above the line;
    - pre-booking: under the result plate.
    - Pre-booking's copy is "Tell me once when availability checks open. One email, nothing else." with the button "Notify me"; the others use "Subscribe".
  - **In every place:** the label "Email", and the consent line "One email to confirm. Unsubscribe in one click. We never sell your address. Privacy notice" (the last two words are the link).
  - **States:** idle, invalid, sending, sent, too many, daily limit, error, with the exact copy from Global Constraints. The daily-limit copy says 05:30 IST.
- [ ] **Step 3: Draw `Subscription.dc.html`** with `page` (confirm, unsubscribe), `list` (news, availability) and `state` (before, after, already done, expired (confirm only, with the email field and "Send a new link"), invalid link, error). The copy is the spec's §3, verbatim. Each page has the one-line footer and exactly one primary button.
- [ ] **Step 4: Draw both phone boards at 390 px.** The footer field must not push the disclaimer, status line or clock out of view.
- [ ] **Step 5: Render-check each board.** Open each in the in-app browser; confirm no overflow at 390 and no clipped text; take a screenshot per state for the PR.
- [ ] **Step 6: Commit and open the PR** for the owner's approval. No code.

```bash
git add docs/design/sheets/traveller
git commit -m "docs(design): draw Sign-up Capture and Subscription (B4) for approval"
```

**Gate:** PR 3 does not start until the owner approves these boards.

---

## PR 2: the backend

### Task 2: Exempt the generated types file from the 500-line rule

**Files:**
- Modify: `tests/unit/tokens.contract.test.ts:165-179`
- Modify: `src/types/supabase.ts` (regenerate; restores `availability_outcome_label`)

- [ ] **Step 1: Write the failing expectation.** In the 500-line test, add a named exemption:

```ts
    // Generated by `npm run db:types` from the database, not written by hand, so it cannot be "kept"
    // small — every function a migration adds lands here. The owner exempted it on 2026-09-28; it is
    // the only exemption, named, so a second one is a visible decision rather than a quiet drift.
    const GENERATED = new Set([join("src", "types", "supabase.ts")]);
    const long = all
      .filter((p) => !GENERATED.has(relative(ROOT, p)))
      .filter((p) => readFileSync(p, "utf8").split("\n").length > 500)
      .map((p) => relative(ROOT, p));
    expect(long).toEqual([]);
```

- [ ] **Step 2: Regenerate the types:** `npm run db:types`. The file now exceeds 500 lines.
- [ ] **Step 3: Run** `npx vitest run tests/unit/tokens.contract.test.ts`. Expected: PASS. Revert Step 1 locally to see it FAIL, then restore it.
- [ ] **Step 4: Commit.**

```bash
git add tests/unit/tokens.contract.test.ts src/types/supabase.ts
git commit -m "test(contract): exempt the generated database types from the 500-line rule"
```

### Task 3: Move the Resend sender and the test outbox into services

The traveller side cannot import `@/console/*`. The sender and the outbox become shared; the console keeps its names by re-exporting.

**Files:**
- Create: `src/services/email/send.ts`, `src/services/email/outbox.ts`
- Modify: `src/console/email/send.ts`, `src/console/email/outbox.ts` (re-export and delegate)
- Test: `tests/unit/services/email/send.test.ts`

**Interfaces:**
- Produces:
  - `interface Letter { from: string; to: string; subject: string; text: string; headers?: Readonly<Record<string, string>> }`
  - `sendEmail(letter: Letter): Promise<"sent" | "captured" | "failed">`
  - `outbox` with `put`, `take(to?)`, `clear`. The same singleton serves both sides.

- [ ] **Step 1: Write the failing test.**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const current = { E2E: true, RESEND_API_KEY: "re_test_key_that_is_long_enough" as string | undefined };
vi.mock("@/services/env", () => ({ env: () => current }));

import { outbox } from "@/services/email/outbox";
import { sendEmail } from "@/services/email/send";

afterEach(() => {
  outbox.clear();
  vi.unstubAllGlobals();
});

describe("sendEmail", () => {
  it("captures to the outbox under E2E, and never calls Resend", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(sendEmail({ from: "Trakline <updates@trakline.in>", to: "a@b.in", subject: "S", text: "T" })).resolves.toBe("captured");
    expect(outbox.take("a@b.in")).toHaveLength(1);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("posts to Resend with its from, and any headers, outside E2E", async () => {
    current.E2E = false;
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    await sendEmail({ from: "Trakline <updates@trakline.in>", to: "a@b.in", subject: "S", text: "T", headers: { "X-Test": "1" } });
    const body = JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toEqual({ from: "Trakline <updates@trakline.in>", to: ["a@b.in"], subject: "S", text: "T", headers: { "X-Test": "1" } });
    current.E2E = true;
  });

  it("never rejects: a refused or failed send is 'failed'", async () => {
    current.E2E = false;
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429 })));
    await expect(sendEmail({ from: "x <x@y.in>", to: "a@b.in", subject: "S", text: "T" })).resolves.toBe("failed");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("down"))));
    await expect(sendEmail({ from: "x <x@y.in>", to: "a@b.in", subject: "S", text: "T" })).resolves.toBe("failed");
    current.E2E = true;
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/services/email/send.test.ts`. Expected: FAIL, "Cannot find package '@/services/email/send'".
- [ ] **Step 3: Implement.** `src/services/email/outbox.ts` is the body of today's `src/console/email/outbox.ts`, typed over `Letter`. `src/services/email/send.ts`:

```ts
import { env } from "@/services/env";
import { log } from "@/services/log";
import { outbox } from "./outbox";

export interface Letter {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export type SendOutcome = "sent" | "captured" | "failed";

const RESEND_URL = "https://api.resend.com/emails";

/** Plain-text email through Resend. Never rejects; under E2E (never production) it goes to the outbox. */
export async function sendEmail(letter: Letter): Promise<SendOutcome> {
  try {
    const current = env();
    if (current.E2E) {
      outbox.put(letter);
      return "captured";
    }
    if (!current.RESEND_API_KEY) {
      log.warn("[email] no RESEND_API_KEY: email is not configured for this deployment");
      return "failed";
    }
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${current.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: letter.from, to: [letter.to], subject: letter.subject, text: letter.text, ...(letter.headers ? { headers: letter.headers } : {}) }),
    });
    if (response.ok) return "sent";
    log.warn("[email] resend refused a send", { status: response.status });
    return "failed";
  } catch (err) {
    log.warn("[email] could not send", err instanceof Error ? err.name : "");
    return "failed";
  }
}
```

  Then make `src/console/email/send.ts` delegate: `sendConsoleEmail(letter)` returns `sendEmail({ from: env().CONSOLE_EMAIL_FROM, ...letter })`, with `env()` read inside a try so it still never rejects. Make `src/console/email/outbox.ts` re-export: `export { outbox } from "@/services/email/outbox";`.
- [ ] **Step 4: Run** the new test plus `npx vitest run tests/unit/console/email tests/integration/console`. Expected: PASS. The console's letters still land in the same outbox.
- [ ] **Step 5: Commit.**

```bash
git add src/services/email src/console/email tests/unit/services/email
git commit -m "refactor(email): one Resend sender and one outbox, shared by the console and the traveller side"
```

### Task 4: The daily email allowance

**Files:**
- Create: `src/services/email/allowance.ts`
- Modify: `src/services/email/send.ts` (count every real send)
- Test: `tests/unit/services/email/allowance.test.ts`

**Interfaces:**
- Consumes: `Kv` from `@/services/kv`; `publicStoreForReading()` from `@/services/shared-store`.
- Produces:
  - `emailDay(at: Date): string` (UTC `YYYY-MM-DD`)
  - `CONFIRMATION_CEILING = 60`
  - `takeConfirmation(kv: Kv, prefix: string, at: Date): Promise<"ok" | "spent" | "unknown">`
  - `countSent(kv: Kv, prefix: string, at: Date): Promise<void>`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it, vi } from "vitest";
import { CONFIRMATION_CEILING, countSent, emailDay, takeConfirmation } from "@/services/email/allowance";
import { MemoryKv, type Kv } from "@/services/kv";

const AT = new Date("2026-09-28T20:00:00Z"); // 01:30 IST on the 29th, still the 28th in Resend's (UTC) day

describe("the email allowance", () => {
  it("is keyed by Resend's day, UTC — not India's", () => {
    expect(emailDay(AT)).toBe("2026-09-28");
  });

  it("gives confirmations while the day's count is below the ceiling, keeping the rest for console mail", async () => {
    const kv = new MemoryKv();
    for (let i = 0; i < CONFIRMATION_CEILING; i += 1) expect(await takeConfirmation(kv, "tt:test", AT)).toBe("ok");
    expect(await takeConfirmation(kv, "tt:test", AT)).toBe("spent");
    // A refused take gives its count back: the ceiling is not pushed up by people being refused.
    expect(await kv.get("tt:test:email:2026-09-28")).toBe(String(CONFIRMATION_CEILING));
  });

  it("counts console mail against the same day, so a busy console leaves fewer confirmations", async () => {
    const kv = new MemoryKv();
    for (let i = 0; i < CONFIRMATION_CEILING; i += 1) await countSent(kv, "tt:test", AT);
    expect(await takeConfirmation(kv, "tt:test", AT)).toBe("spent");
  });

  it("fails closed: an unreadable counter gives no confirmation", async () => {
    const broken = { incr: vi.fn(async () => Promise.reject(new Error("down"))) } as unknown as Kv;
    expect(await takeConfirmation(broken, "tt:test", AT)).toBe("unknown");
  });

  it("never lets counting break a send", async () => {
    const broken = { incr: vi.fn(async () => Promise.reject(new Error("down"))) } as unknown as Kv;
    await expect(countSent(broken, "tt:test", AT)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run** it. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `src/services/email/allowance.ts`:

```ts
import type { Kv } from "@/services/kv";

// One count per Resend day of every email this deployment sends. Resend's Free plan allows 100 a day and
// resets at 00:00 UTC (05:30 IST) — checked on the account 2026-09-28 — so the day here is UTC's, not
// India's. Sign-up confirmations may take from it only while the count is below 60; the other 40 are
// kept so console sign-in links and security alerts are never the ones Resend refuses.

export const CONFIRMATION_CEILING = 60;
const KEPT_MS = 2 * 24 * 60 * 60 * 1000;

export function emailDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

function key(prefix: string, at: Date): string {
  return `${prefix}:email:${emailDay(at)}`;
}

/** One confirmation's worth, or why not. Fails CLOSED: a count nobody can read gives nothing. */
export async function takeConfirmation(kv: Kv, prefix: string, at: Date): Promise<"ok" | "spent" | "unknown"> {
  try {
    const n = await kv.incr(key(prefix, at), KEPT_MS);
    if (n <= CONFIRMATION_CEILING) return "ok";
    await kv.incrBy(key(prefix, at), KEPT_MS, -1).catch(() => undefined);
    return "spent";
  } catch {
    return "unknown";
  }
}

/** Counts a send that did not go through `takeConfirmation`. Best-effort: never why a send fails. */
export async function countSent(kv: Kv, prefix: string, at: Date): Promise<void> {
  try {
    await kv.incr(key(prefix, at), KEPT_MS);
  } catch {
    // Counting is best-effort.
  }
}
```

- [ ] **Step 4: Count console mail.** In `sendConsoleEmail` (Task 3), after a `"sent"` outcome, call `countSent(publicStoreForReading().kv, publicStoreForReading().prefix, new Date())`. Add a test in `tests/unit/console/email/send.test.ts` asserting that a sent console letter increments `tt:<env>:email:<UTC day>` in a `MemoryKv` injected through a `vi.mock("@/services/shared-store")`.
- [ ] **Step 5: Run** both tests. Expected: PASS.
- [ ] **Step 6: Commit.**

```bash
git add src/services/email/allowance.ts src/console/email/send.ts tests/unit/services/email/allowance.test.ts tests/unit/console/email/send.test.ts
git commit -m "feat(email): a daily allowance on Resend's UTC day, 40 kept for console mail, failing closed"
```

### Task 5: The migration and its pgTAP tests

**Files:**
- Create: `supabase/migrations/20260929090000_subscriptions.sql`
- Create: `supabase/tests/subscriptions.test.sql`
- Modify: `src/types/supabase.ts` (`npm run db:types`)

**Interfaces:**
- Produces (all `security definer`, `set search_path = ''`, EXECUTE granted to `service_role` only):
  - `public.subscriptions_sign_up(p_email text, p_list text, p_source text, p_campaign jsonb, p_notice_version text, p_token_hash bytea) returns text`: `'send'` or `'quiet'`
  - `public.subscriptions_confirm(p_token_hash bytea) returns jsonb`: `{ "state": "confirmed" | "already" | "expired" | "invalid", "list": text | null }`
  - `public.subscriptions_peek(p_token_hash bytea) returns jsonb`: the same shape, changes nothing (for the GET page in PR 3)
  - `public.subscriptions_withdraw(p_person uuid, p_list text, p_reason text) returns text`: `'done'`, `'already'` or `'unknown'`
  - `public.subscriptions_rejoin(p_person uuid, p_list text) returns text`: `'done'`, `'already'` or `'unknown'`
  - `public.subscriptions_person_id(p_email text) returns uuid`: for building an unsubscribe link after sign-up; null if absent

- [ ] **Step 1: Write the failing pgTAP file** `supabase/tests/subscriptions.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Reachable only through the functions, and the functions only by the server.
select is(has_schema_privilege('anon', 'subscriptions', 'usage')::text, 'false', 'anon cannot reach the schema');
select is(has_schema_privilege('authenticated', 'subscriptions', 'usage')::text, 'false', 'authenticated cannot reach the schema');
select is(has_function_privilege('anon', 'public.subscriptions_sign_up(text, text, text, jsonb, text, bytea)', 'execute')::text, 'false', 'anon cannot sign anyone up');
select is(has_function_privilege('authenticated', 'public.subscriptions_sign_up(text, text, text, jsonb, text, bytea)', 'execute')::text, 'false', 'authenticated cannot either');
select is(has_function_privilege('service_role', 'public.subscriptions_sign_up(text, text, text, jsonb, text, bytea)', 'execute')::text, 'true', 'the server can');

-- A first sign-up is due an email, and leaves a pending consent.
select is(public.subscriptions_sign_up('Asha@Example.in ', 'news', 'footer', null, '1.1', decode(repeat('a1', 32), 'hex')), 'send', 'a new address is due one email');
select is((select email from subscriptions.people), 'asha@example.in', 'stored lowercased and trimmed');
select ok((select confirmed_at is null from subscriptions.consents), 'pending until confirmed');

-- The resend guard: inside ten minutes, no second email.
select is(public.subscriptions_sign_up('asha@example.in', 'news', 'footer', null, '1.1', decode(repeat('b2', 32), 'hex')), 'quiet', 'no second email within ten minutes');

-- Peek changes nothing; confirm spends the token.
select is(public.subscriptions_peek(decode(repeat('a1', 32), 'hex')) ->> 'state', 'confirmed', 'peek reports what confirm would do') ;
select ok((select confirmed_at is null from subscriptions.consents), 'peek changed nothing');
select is(public.subscriptions_confirm(decode(repeat('a1', 32), 'hex')), '{"list": "news", "state": "confirmed"}'::jsonb, 'confirm confirms, and says which list');
select is(public.subscriptions_confirm(decode(repeat('a1', 32), 'hex')) ->> 'state', 'already', 'a spent token is already done');
select is(public.subscriptions_confirm(decode(repeat('ff', 32), 'hex')) ->> 'state', 'invalid', 'an unknown token is invalid');

-- A subscribed address signing up again gets the same quiet answer and no email.
select is(public.subscriptions_sign_up('asha@example.in', 'news', 'footer', null, '1.1', decode(repeat('c3', 32), 'hex')), 'quiet', 'already subscribed: no email');

-- Expiry.
insert into subscriptions.people (email, first_source) values ('late@example.in', 'footer');
insert into subscriptions.consents (person_id, list, notice_version, source) select id, 'news', '1.1', 'footer' from subscriptions.people where email = 'late@example.in';
insert into subscriptions.confirm_tokens (token_hash, person_id, list, expires_at) select decode(repeat('d4', 32), 'hex'), id, 'news', now() - interval '1 minute' from subscriptions.people where email = 'late@example.in';
select is(public.subscriptions_confirm(decode(repeat('d4', 32), 'hex')) ->> 'state', 'expired', 'a token past 48 hours is expired');

-- Withdraw and rejoin.
select is(public.subscriptions_withdraw((select id from subscriptions.people where email = 'asha@example.in'), 'news', 'too many'), 'done', 'withdraw');
select is((select withdraw_reason from subscriptions.consents c join subscriptions.people p on p.id = c.person_id where p.email = 'asha@example.in'), 'too many', 'with its reason');
select is(public.subscriptions_rejoin((select id from subscriptions.people where email = 'asha@example.in'), 'news'), 'done', 'rejoin');
select is(public.subscriptions_withdraw(gen_random_uuid(), 'news', null), 'unknown', 'an unknown person is unknown');

-- The purge: never-confirmed people older than seven days go on the next sign-up; confirmed ones stay.
update subscriptions.people set first_seen = now() - interval '8 days';
select is(public.subscriptions_sign_up('new@example.in', 'availability', 'pre-booking', null, '1.1', decode(repeat('e5', 32), 'hex')), 'send', 'another sign-up');
select is((select array_agg(email order by email) from subscriptions.people)::text, '{asha@example.in,new@example.in}', 'the unconfirmed eight-day-old address was purged; the confirmed one stays');

select * from finish();
rollback;
```

- [ ] **Step 2: Run** `npx supabase@2.117.0 test db supabase/tests/subscriptions.test.sql`. Expected: FAIL, the schema does not exist.
- [ ] **Step 3: Write the migration** `supabase/migrations/20260929090000_subscriptions.sql`:

```sql
-- Subscriptions core (06-A). docs/superpowers/specs/2026-09-28-subscriptions-core-design.md §2.
-- A private schema: no grants to anon or authenticated, RLS on with no policies, and every read and
-- write through a security-definer function granted to service_role alone.

create schema if not exists subscriptions;
revoke all on schema subscriptions from public, anon, authenticated;

create table subscriptions.people (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique check (email = lower(btrim(email)) and char_length(email) between 3 and 254),
  first_seen      timestamptz not null default now(),
  first_source    text not null check (first_source in ('footer', 'landing', 'pre-booking', 'account', 'added by hand')),
  campaign_source text check (char_length(campaign_source) <= 100),
  campaign_medium text check (char_length(campaign_medium) <= 100),
  campaign_name   text check (char_length(campaign_name) <= 100),
  first_page      text check (char_length(first_page) <= 200)
);

create table subscriptions.consents (
  person_id       uuid not null references subscriptions.people (id) on delete cascade,
  list            text not null check (list in ('news', 'availability')),
  notice_version  text not null check (char_length(notice_version) between 1 and 10),
  source          text not null check (source in ('footer', 'landing', 'pre-booking', 'account', 'added by hand')),
  consented_at    timestamptz not null default now(),
  confirmed_at    timestamptz,
  withdrawn_at    timestamptz,
  withdraw_reason text check (withdraw_reason in ('too many', 'not relevant', 'did not sign up', 'other')),
  primary key (person_id, list)
);

create table subscriptions.confirm_tokens (
  token_hash bytea primary key check (octet_length(token_hash) = 32),
  person_id  uuid not null references subscriptions.people (id) on delete cascade,
  list       text not null check (list in ('news', 'availability')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);

alter table subscriptions.people enable row level security;
alter table subscriptions.consents enable row level security;
alter table subscriptions.confirm_tokens enable row level security;
revoke all on all tables in schema subscriptions from public, anon, authenticated;

create or replace function public.subscriptions_sign_up(
  p_email text, p_list text, p_source text, p_campaign jsonb, p_notice_version text, p_token_hash bytea
) returns text language plpgsql security definer set search_path = '' as $$
declare
  v_email  text := lower(btrim(p_email));
  v_person uuid;
  v_consent subscriptions.consents;
begin
  -- The seven-day purge (§2): never-confirmed people, first seen over a week ago.
  delete from subscriptions.people p
   where p.first_seen < now() - interval '7 days'
     and not exists (select 1 from subscriptions.consents c where c.person_id = p.id and c.confirmed_at is not null);

  insert into subscriptions.people (email, first_source, campaign_source, campaign_medium, campaign_name, first_page)
  values (v_email, p_source, p_campaign ->> 'source', p_campaign ->> 'medium', p_campaign ->> 'name', p_campaign ->> 'page')
  on conflict (email) do nothing;
  select id into v_person from subscriptions.people where email = v_email;

  select * into v_consent from subscriptions.consents where person_id = v_person and list = p_list;
  if found and v_consent.confirmed_at is not null and v_consent.withdrawn_at is null then
    return 'quiet';
  end if;
  if found and v_consent.withdrawn_at is not null then
    -- Coming back after unsubscribing is a new consent, and it is confirmed again.
    update subscriptions.consents
       set consented_at = now(), confirmed_at = null, withdrawn_at = null, withdraw_reason = null,
           notice_version = p_notice_version, source = p_source
     where person_id = v_person and list = p_list;
  elsif not found then
    insert into subscriptions.consents (person_id, list, notice_version, source)
    values (v_person, p_list, p_notice_version, p_source);
  end if;

  -- The resend guard: an unused, unexpired token younger than ten minutes means no second email.
  if exists (select 1 from subscriptions.confirm_tokens t
              where t.person_id = v_person and t.list = p_list and t.used_at is null
                and t.expires_at > now() and t.created_at > now() - interval '10 minutes') then
    return 'quiet';
  end if;

  insert into subscriptions.confirm_tokens (token_hash, person_id, list, expires_at)
  values (p_token_hash, v_person, p_list, now() + interval '48 hours');
  return 'send';
end;
$$;

-- The one reading both confirm and peek share, so they can never disagree about a token.
create or replace function subscriptions.token_state(p_token_hash bytea) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object('list', t.list, 'state',
       case when c.confirmed_at is not null and c.withdrawn_at is null then 'already'
            when t.used_at is not null then 'already'
            when t.expires_at <= now() then 'expired'
            else 'confirmed' end)
       from subscriptions.confirm_tokens t
       join subscriptions.consents c on c.person_id = t.person_id and c.list = t.list
      where t.token_hash = p_token_hash),
    jsonb_build_object('list', null, 'state', 'invalid'));
$$;

create or replace function public.subscriptions_peek(p_token_hash bytea) returns jsonb
language sql stable security definer set search_path = '' as $$
  select subscriptions.token_state(p_token_hash);
$$;

create or replace function public.subscriptions_confirm(p_token_hash bytea) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_state jsonb := subscriptions.token_state(p_token_hash);
begin
  if v_state ->> 'state' <> 'confirmed' then return v_state; end if;
  update subscriptions.confirm_tokens set used_at = now() where token_hash = p_token_hash;
  update subscriptions.consents c set confirmed_at = now()
    from subscriptions.confirm_tokens t
   where t.token_hash = p_token_hash and c.person_id = t.person_id and c.list = t.list;
  return v_state;
end;
$$;

create or replace function public.subscriptions_withdraw(p_person uuid, p_list text, p_reason text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_consent subscriptions.consents;
begin
  select * into v_consent from subscriptions.consents where person_id = p_person and list = p_list;
  if not found then return 'unknown'; end if;
  if v_consent.withdrawn_at is not null then
    -- Already out: a reason may still be added afterwards ("Tell us why"), and is.
    if p_reason is not null then
      update subscriptions.consents set withdraw_reason = p_reason where person_id = p_person and list = p_list;
    end if;
    return 'already';
  end if;
  update subscriptions.consents set withdrawn_at = now(), withdraw_reason = p_reason where person_id = p_person and list = p_list;
  return 'done';
end;
$$;

create or replace function public.subscriptions_rejoin(p_person uuid, p_list text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_consent subscriptions.consents;
begin
  select * into v_consent from subscriptions.consents where person_id = p_person and list = p_list;
  if not found then return 'unknown'; end if;
  if v_consent.withdrawn_at is null then return 'already'; end if;
  update subscriptions.consents set withdrawn_at = null, withdraw_reason = null where person_id = p_person and list = p_list;
  return 'done';
end;
$$;

create or replace function public.subscriptions_person_id(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from subscriptions.people where email = lower(btrim(p_email));
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.subscriptions_sign_up(text, text, text, jsonb, text, bytea)',
    'public.subscriptions_peek(bytea)',
    'public.subscriptions_confirm(bytea)',
    'public.subscriptions_withdraw(uuid, text, text)',
    'public.subscriptions_rejoin(uuid, text)',
    'public.subscriptions_person_id(text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
revoke all on function subscriptions.token_state(bytea) from public, anon, authenticated;
```

- [ ] **Step 4: Apply and run:** `npx supabase@2.117.0 migration up --local && npx supabase@2.117.0 test db supabase/tests/subscriptions.test.sql`. Expected: PASS (22). Then run `npm run db:test`: all files green.
- [ ] **Step 5: Regenerate the types:** `npm run db:types`. The diff adds the six `subscriptions_*` functions.
- [ ] **Step 6: Commit.**

```bash
git add supabase/migrations/20260929090000_subscriptions.sql supabase/tests/subscriptions.test.sql src/types/supabase.ts
git commit -m "feat(subscriptions): the consent tables and their six functions, reachable only by the server"
```

### Task 6: Signed unsubscribe links and the traveller origin

**Files:**
- Modify: `src/services/data-key.ts` (a fourth subkey, `unsubscribe`)
- Create: `src/services/subscriptions/links.ts`
- Test: `tests/unit/services/subscriptions/links.test.ts`

**Interfaces:**
- Produces:
  - `travellerOrigin(hostHeader: string | null, vercelEnv: string | undefined): string` (`""` when it must not be built)
  - `signUnsubscribe(key: Buffer, person: string, list: string): string`
  - `verifyUnsubscribe(key: Buffer, person: string, list: string, signature: string): boolean`
  - `unsubscribeKey(): Buffer`
  - `confirmUrl(origin, token)`, `unsubscribeUrl(origin, person, list, signature)`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from "vitest";
import { confirmUrl, signUnsubscribe, travellerOrigin, unsubscribeUrl, verifyUnsubscribe } from "@/services/subscriptions/links";

const KEY = Buffer.alloc(32, 9);
const PERSON = "8a1f2c3d-0000-4000-8000-000000000001";

describe("travellerOrigin", () => {
  it("is the apex constant in production, whatever the request says", () => {
    expect(travellerOrigin("evil.example", "production")).toBe("https://trakline.in");
  });
  it("is localhost with its port elsewhere, and nothing else", () => {
    expect(travellerOrigin("localhost:4211", "development")).toBe("http://localhost:4211");
    expect(travellerOrigin("localhost:4211@evil.example", undefined)).toBe("");
    expect(travellerOrigin("preview-x.vercel.app", "preview")).toBe("");
  });
});

describe("unsubscribe signatures", () => {
  it("are stable for a person and a list, and differ between lists", () => {
    expect(signUnsubscribe(KEY, PERSON, "news")).toBe(signUnsubscribe(KEY, PERSON, "news"));
    expect(signUnsubscribe(KEY, PERSON, "news")).not.toBe(signUnsubscribe(KEY, PERSON, "availability"));
  });
  it("verify only their own person and list", () => {
    const s = signUnsubscribe(KEY, PERSON, "news");
    expect(verifyUnsubscribe(KEY, PERSON, "news", s)).toBe(true);
    expect(verifyUnsubscribe(KEY, PERSON, "availability", s)).toBe(false);
    expect(verifyUnsubscribe(KEY, PERSON, "news", `${s.slice(0, -1)}A`)).toBe(false);
    expect(verifyUnsubscribe(KEY, PERSON, "news", "")).toBe(false);
  });
});

describe("the links", () => {
  it("carry the token or the signature, and nothing else about the person", () => {
    expect(confirmUrl("https://trakline.in", "tok")).toBe("https://trakline.in/subscribe/confirm?token=tok");
    expect(unsubscribeUrl("https://trakline.in", PERSON, "news", "sig")).toBe(`https://trakline.in/unsubscribe?p=${PERSON}&l=news&s=sig`);
  });
});
```

- [ ] **Step 2: Run** it. Expected: FAIL, module not found.
- [ ] **Step 3: Implement.** Add `unsubscribe: subkey(ikm, "unsubscribe")` to `DataKeys` and `deriveDataKeys` (with a doc line: "HMAC key that signs unsubscribe links"). Then create `src/services/subscriptions/links.ts`:

```ts
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { deriveDataKeys } from "@/services/data-key";
import { env } from "@/services/env";

const PRODUCTION = "https://trakline.in";

/**
 * Where a link we mail someone points. Production is the constant — a link must never be assembled
 * from client input. Elsewhere only localhost with a numeric port; anything else is "" and no email
 * is sent (the same rule as the console's own consoleOrigin).
 */
export function travellerOrigin(hostHeader: string | null, vercelEnv: string | undefined): string {
  if (vercelEnv === "production") return PRODUCTION;
  const match = /^localhost:(\d{2,5})$/.exec((hostHeader ?? "").trim().toLowerCase());
  return match ? `http://localhost:${match[1]}` : "";
}

export function signUnsubscribe(key: Buffer, person: string, list: string): string {
  return createHmac("sha256", key).update(`unsubscribe:${person}:${list}`).digest("base64url");
}

export function verifyUnsubscribe(key: Buffer, person: string, list: string, signature: string): boolean {
  const expected = Buffer.from(signUnsubscribe(key, person, list));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const LOCAL_KEY = randomBytes(32);

/** DATA_KEY's unsubscribe subkey. Without DATA_KEY (local only — the env check requires it in production) a per-process key. */
export function unsubscribeKey(): Buffer {
  const dataKey = env().DATA_KEY;
  return dataKey ? deriveDataKeys(dataKey).unsubscribe : LOCAL_KEY;
}

export function confirmUrl(origin: string, token: string): string {
  return `${origin}/subscribe/confirm?token=${token}`;
}

export function unsubscribeUrl(origin: string, person: string, list: string, signature: string): string {
  return `${origin}/unsubscribe?p=${person}&l=${list}&s=${signature}`;
}
```

- [ ] **Step 4: Run** the test and `npx vitest run tests/unit/services/data-key.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add src/services/data-key.ts src/services/subscriptions/links.ts tests/unit/services/subscriptions/links.test.ts
git commit -m "feat(subscriptions): signed unsubscribe links, and an origin never built from the request in production"
```

### Task 7: The `subscribe` limiter scope

**Files:**
- Modify: `src/services/limited-log.ts` (`LIMITED_SCOPES` gains `"subscribe"`)
- Create: `src/services/subscriptions/limits.ts` (`SUBSCRIBE_RATE_LIMIT`)

**Interfaces:**
- Produces: `SUBSCRIBE_RATE_LIMIT = { limit: 5, windowMs: 3_600_000 }`.

- [ ] **Step 1: Write the failing test.** Add to `tests/unit/services/limited-log.test.ts`:

```ts
  it("counts a refused sign-up as a traveller address hitting a limit", () => {
    expect(limitedAddress("subscribe:1.2.3.4")).toBe("1.2.3.4");
  });
```

- [ ] **Step 2: Run** it. Expected: FAIL (null).
- [ ] **Step 3: Implement.** Append `"subscribe"` to `LIMITED_SCOPES`. Create `src/services/subscriptions/limits.ts` with `export const SUBSCRIBE_RATE_LIMIT = { limit: 5, windowMs: 3_600_000 };` and a comment citing the spec.
- [ ] **Step 4: Run** `npx vitest run tests/unit/services/limited-log.test.ts`. Expected: PASS, including the tripwire once Task 8's `check(\`subscribe:${addressKey(ip)}\`...)` exists.
- [ ] **Step 5: Commit.**

```bash
git add src/services/limited-log.ts src/services/subscriptions/limits.ts tests/unit/services/limited-log.test.ts
git commit -m "feat(subscriptions): a sign-up limit of 5 an hour per address, counted in module 04"
```

### Task 8: The sign-up service

**Files:**
- Create: `src/services/subscriptions/subscribe.ts`, `src/messages/en-IN/subscribe.ts`
- Modify: `src/messages/index.ts` (register `subscribe`)
- Test: `tests/unit/services/subscriptions/subscribe.test.ts`

**Interfaces:**
- Consumes: `takeConfirmation` (Task 4), `sendEmail` (Task 3), `confirmUrl` / `travellerOrigin` (Task 6), `SUBSCRIBE_RATE_LIMIT` (Task 7), `addressKey` from `@/services/rate-limit`.
- Produces:

```ts
export type SubscribeList = "news" | "availability";
export type SubscribeSource = "footer" | "landing" | "pre-booking" | "account";
export interface SubscribeAsk { readonly email: string; readonly list: SubscribeList; readonly source: SubscribeSource; readonly campaign?: { readonly source?: string; readonly medium?: string; readonly name?: string; readonly page?: string } }
export interface SubscribeDeps {
  readonly limiter: RateLimiter;
  readonly allowance: () => Promise<"ok" | "spent" | "unknown">;
  readonly signUp: (ask: SubscribeAsk, tokenHash: Buffer) => Promise<"send" | "quiet">;
  readonly send: (letter: Letter) => Promise<SendOutcome>;
  readonly origin: string;
  readonly from: string;
  readonly token: () => string; // 32 random bytes, base64url
}
export async function subscribe(ask: SubscribeAsk, ip: string, deps: SubscribeDeps): Promise<void>; // throws AppError with the verbatim copy
export const tokenHash: (token: string) => Buffer; // SHA-256 of the token's bytes
```

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it, vi } from "vitest";
import { subscribe, tokenHash, type SubscribeDeps } from "@/services/subscriptions/subscribe";
import { messages } from "@/messages";

const m = messages.subscribe;
const ASK = { email: "asha@example.in", list: "news" as const, source: "footer" as const };

function deps(over: Partial<SubscribeDeps> = {}): SubscribeDeps & { send: ReturnType<typeof vi.fn> } {
  return {
    limiter: { check: vi.fn(async () => ({ ok: true, remaining: 4, retryAfterSeconds: 0 })) },
    allowance: vi.fn(async () => "ok" as const),
    signUp: vi.fn(async () => "send" as const),
    send: vi.fn(async () => "sent" as const),
    origin: "https://trakline.in",
    from: "Trakline <updates@trakline.in>",
    token: () => "tok_abc",
    ...over,
  } as SubscribeDeps & { send: ReturnType<typeof vi.fn> };
}

describe("subscribe", () => {
  it("sends one confirmation email with the confirm link, from updates@", async () => {
    const d = deps();
    await subscribe(ASK, "203.0.113.9", d);
    expect(d.signUp).toHaveBeenCalledWith(ASK, tokenHash("tok_abc"));
    expect(d.send).toHaveBeenCalledWith(expect.objectContaining({ from: "Trakline <updates@trakline.in>", to: "asha@example.in", subject: m.email.subject }));
    expect(d.send.mock.calls[0]![0].text).toContain("https://trakline.in/subscribe/confirm?token=tok_abc");
  });

  it("answers the same, and sends nothing, when the database says quiet (already subscribed or just sent)", async () => {
    const d = deps({ signUp: vi.fn(async () => "quiet" as const) });
    await expect(subscribe(ASK, "203.0.113.9", d)).resolves.toBeUndefined();
    expect(d.send).not.toHaveBeenCalled();
  });

  it("refuses an address that is not one, before anything else", async () => {
    const d = deps();
    await expect(subscribe({ ...ASK, email: "not-an-email" }, "203.0.113.9", d)).rejects.toThrow(m.errors.invalid);
    expect(d.limiter.check).not.toHaveBeenCalled();
  });

  it("refuses when the connection is over its limit, writing nothing", async () => {
    const d = deps({ limiter: { check: vi.fn(async () => ({ ok: false, remaining: 0, retryAfterSeconds: 600 })) } });
    await expect(subscribe(ASK, "203.0.113.9", d)).rejects.toThrow(m.errors.limited);
    expect(d.signUp).not.toHaveBeenCalled();
    expect(d.limiter.check).toHaveBeenCalledWith("subscribe:203.0.113.9", 5, 3_600_000);
  });

  it("refuses when today's allowance is spent, and fails closed when it cannot be read — writing nothing either way", async () => {
    for (const [state, copy] of [["spent", m.errors.dailyLimit], ["unknown", m.errors.failed]] as const) {
      const d = deps({ allowance: vi.fn(async () => state) });
      await expect(subscribe(ASK, "203.0.113.9", d)).rejects.toThrow(copy);
      expect(d.signUp).not.toHaveBeenCalled();
    }
  });

  it("says it did not go through when the email is refused, or there is no safe origin to link to", async () => {
    await expect(subscribe(ASK, "203.0.113.9", deps({ send: vi.fn(async () => "failed" as const) }))).rejects.toThrow(m.errors.failed);
    const noOrigin = deps({ origin: "" });
    await expect(subscribe(ASK, "203.0.113.9", noOrigin)).rejects.toThrow(m.errors.failed);
    expect(noOrigin.signUp).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run** it. Expected: FAIL, module not found.
- [ ] **Step 3: Implement the copy** in `src/messages/en-IN/subscribe.ts`:

```ts
import type { MessageTree } from "../types";

/** Sign-ups (spec 2026-09-28-subscriptions-core §3–4). Error copy verbatim from the B4 brief, with Resend's 05:30 IST reset. */
export const subscribe = {
  sent: "Check your inbox to confirm.",
  errors: {
    invalid: "Enter an email address like name@example.com.",
    limited: "Too many sign-ups from this connection. Try again later.",
    dailyLimit: "We can't send more confirmation emails today. Try again after 05:30 IST.",
    failed: "That didn't go through. Try again.",
  },
  promise: {
    news: "About once a month: new features and service changes.",
    availability: "One email when availability checks open.",
  },
  email: {
    subject: "Confirm your Trakline updates",
    body: (promise: string, link: string) =>
      `You asked for Trakline updates by email.\n\n${promise}\n\nConfirm here:\n${link}\n\nThe link works for 48 hours. If you didn't ask for this, ignore it — we delete the address in 7 days.\n`,
  },
} as const satisfies MessageTree;
```

  Register it in `src/messages/index.ts`. Then `src/services/subscriptions/subscribe.ts`:

```ts
import { createHash } from "node:crypto";
import { z } from "zod";
import { messages } from "@/messages";
import type { Letter, SendOutcome } from "@/services/email/send";
import { AppError } from "@/services/errors";
import { addressKey, type RateLimiter } from "@/services/rate-limit";
import { SUBSCRIBE_RATE_LIMIT } from "./limits";
import { confirmUrl } from "./links";

const m = messages.subscribe;
const EMAIL = z.email().max(254);

export type SubscribeList = "news" | "availability";
export type SubscribeSource = "footer" | "landing" | "pre-booking" | "account";
export interface SubscribeAsk {
  readonly email: string;
  readonly list: SubscribeList;
  readonly source: SubscribeSource;
  readonly campaign?: { readonly source?: string; readonly medium?: string; readonly name?: string; readonly page?: string };
}
export interface SubscribeDeps {
  readonly limiter: RateLimiter;
  readonly allowance: () => Promise<"ok" | "spent" | "unknown">;
  readonly signUp: (ask: SubscribeAsk, tokenHash: Buffer) => Promise<"send" | "quiet">;
  readonly send: (letter: Letter) => Promise<SendOutcome>;
  readonly origin: string;
  readonly from: string;
  readonly token: () => string;
}

export const tokenHash = (token: string): Buffer => createHash("sha256").update(token).digest();

/**
 * One sign-up, in the spec's order: validate, limit, allowance, database, email. The first three
 * write nothing when they refuse. Success is always the same silence — the route answers
 * "Check your inbox to confirm." whether this sent an email or the database said quiet — so the
 * reply never reveals whether an address is known.
 */
export async function subscribe(ask: SubscribeAsk, ip: string, deps: SubscribeDeps): Promise<void> {
  const email = ask.email.trim().toLowerCase();
  if (!EMAIL.safeParse(email).success) throw new AppError("INVALID_INPUT", m.errors.invalid);
  if (deps.origin === "") throw new AppError("SOURCE_UNAVAILABLE", m.errors.failed);

  const rate = await deps.limiter.check(`subscribe:${addressKey(ip)}`, SUBSCRIBE_RATE_LIMIT.limit, SUBSCRIBE_RATE_LIMIT.windowMs);
  if (!rate.ok) throw new AppError("RATE_LIMITED", m.errors.limited, { status: 429, retryAfter: rate.retryAfterSeconds });

  const allowance = await deps.allowance();
  if (allowance === "spent") throw new AppError("RATE_LIMITED", m.errors.dailyLimit, { status: 429 });
  if (allowance === "unknown") throw new AppError("SOURCE_UNAVAILABLE", m.errors.failed);

  const token = deps.token();
  const due = await deps.signUp({ ...ask, email }, tokenHash(token));
  if (due === "quiet") return;

  const sent = await deps.send({ from: deps.from, to: email, subject: m.email.subject, text: m.email.body(m.promise[ask.list], confirmUrl(deps.origin, token)) });
  if (sent === "failed") throw new AppError("SOURCE_UNAVAILABLE", m.errors.failed);
}
```

- [ ] **Step 4: Run** it. Expected: PASS. Also run `npx vitest run tests/unit/privacy tests/unit/console/boundary.contract.test.ts`: PASS (no provider names, no console imports).
- [ ] **Step 5: Commit.**

```bash
git add src/services/subscriptions/subscribe.ts src/messages/en-IN/subscribe.ts src/messages/index.ts tests/unit/services/subscriptions/subscribe.test.ts
git commit -m "feat(subscriptions): the sign-up service — validate, limit, allowance, record, one email"
```

### Task 9: The three routes

**Files:**
- Create: `src/app/api/subscribe/route.ts`, `src/app/api/subscribe/confirm/route.ts`, `src/app/api/unsubscribe/route.ts`
- Create: `src/services/subscriptions/store.ts` (the `createAdminSupabase` wiring for the five RPCs)
- Test: `tests/integration/api/subscribe.test.ts`

**Interfaces:**
- Consumes: everything above; `createAdminSupabase` from `@/services/supabase/admin`; `createRateLimiter`, `publicStoreForReading` from `@/services/shared-store`; `clientIp` from `@/services/rate-limit`; `readBody`, `jsonOk`, `jsonError`.
- Produces:
  - `POST /api/subscribe {email, list, source, campaign?}` → `{ ok: true, message: "Check your inbox to confirm." }`
  - `POST /api/subscribe/confirm {token}` → `{ ok: true, state, list }`
  - `POST /api/unsubscribe {p, l, s, action: "unsubscribe" | "resubscribe" | "reason", reason?}` → `{ ok: true, state }`
  - In `store.ts`: `signUpRow(ask, hash)`, `confirmRow(hash)`, `peekRow(hash)`, `withdrawRow(person, list, reason)`, `rejoinRow(person, list)`, `personId(email)`, each wrapping one RPC and throwing `AppError("SOURCE_UNAVAILABLE", messages.subscribe.errors.failed)` on a database error.

- [ ] **Step 1: Write the failing integration test** `tests/integration/api/subscribe.test.ts`:

```ts
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { store, sendEmail } = vi.hoisted(() => ({
  store: {
    signUpRow: vi.fn(async () => "send" as "send" | "quiet"),
    confirmRow: vi.fn(async () => ({ state: "confirmed", list: "news" })),
    peekRow: vi.fn(),
    withdrawRow: vi.fn(async () => "done"),
    rejoinRow: vi.fn(async () => "done"),
    personId: vi.fn(),
  },
  sendEmail: vi.fn(async () => "sent" as const),
}));
vi.mock("@/services/subscriptions/store", () => store);
vi.mock("@/services/email/send", () => ({ sendEmail }));
vi.mock("@/services/email/allowance", () => ({ takeConfirmation: async () => "ok" }));

import { POST as confirm } from "@/app/api/subscribe/confirm/route";
import { POST as signUp } from "@/app/api/subscribe/route";
import { POST as unsubscribe } from "@/app/api/unsubscribe/route";
import { messages } from "@/messages";
import { signUnsubscribe, unsubscribeKey } from "@/services/subscriptions/links";

const m = messages.subscribe;
const PERSON = "8a1f2c3d-0000-4000-8000-000000000001";

function post(path: string, body: unknown, ip = "203.0.113.10"): Request {
  return new Request(`http://localhost:4210${path}`, { method: "POST", headers: { "content-type": "application/json", host: "localhost:4210", "x-forwarded-for": ip }, body: JSON.stringify(body) });
}

beforeEach(() => {
  for (const f of Object.values(store)) f.mockClear();
  sendEmail.mockClear();
});

describe("POST /api/subscribe", () => {
  it("answers the same sent copy, with no address in it", async () => {
    const response = await signUp(post("/api/subscribe", { email: "asha@example.in", list: "news", source: "footer" }));
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ ok: true, message: m.sent });
    expect(text).not.toContain("asha@example.in");
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it("answers the same when the address is already subscribed, and sends nothing", async () => {
    store.signUpRow.mockResolvedValueOnce("quiet");
    const response = await signUp(post("/api/subscribe", { email: "asha@example.in", list: "news", source: "footer" }, "203.0.113.11"));
    expect(await response.json()).toEqual({ ok: true, message: m.sent });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("refuses an address that is not one", async () => {
    const response = await signUp(post("/api/subscribe", { email: "nope", list: "news", source: "footer" }, "203.0.113.12"));
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe(m.errors.invalid);
  });

  it("refuses the sixth sign-up in an hour from one connection", async () => {
    for (let i = 0; i < 5; i += 1) await signUp(post("/api/subscribe", { email: `p${i}@example.in`, list: "news", source: "footer" }, "203.0.113.50"));
    const sixth = await signUp(post("/api/subscribe", { email: "p6@example.in", list: "news", source: "footer" }, "203.0.113.50"));
    expect(sixth.status).toBe(429);
    expect((await sixth.json()).message).toBe(m.errors.limited);
  });

  it("refuses anything it did not ask for", async () => {
    const response = await signUp(post("/api/subscribe", { email: "a@b.in", list: "news", source: "footer", environment: "preview" }, "203.0.113.13"));
    expect(response.status).toBe(400);
  });
});

describe("POST /api/subscribe/confirm", () => {
  it("passes the token's hash, never the token, and answers the state and the list", async () => {
    const token = "A".repeat(43);
    const response = await confirm(post("/api/subscribe/confirm", { token }));
    expect(store.confirmRow).toHaveBeenCalledWith(createHash("sha256").update(token).digest());
    expect(await response.json()).toEqual({ ok: true, state: "confirmed", list: "news" });
  });
});

describe("POST /api/unsubscribe", () => {
  const s = () => signUnsubscribe(unsubscribeKey(), PERSON, "news");

  it("refuses a signature that does not verify, and touches nothing", async () => {
    const response = await unsubscribe(post("/api/unsubscribe", { p: PERSON, l: "news", s: "B".repeat(43), action: "unsubscribe" }));
    expect(response.status).toBe(400);
    expect(store.withdrawRow).not.toHaveBeenCalled();
  });

  it("unsubscribes, adds a reason afterwards, and resubscribes, each with a valid signature", async () => {
    await unsubscribe(post("/api/unsubscribe", { p: PERSON, l: "news", s: s(), action: "unsubscribe" }));
    expect(store.withdrawRow).toHaveBeenLastCalledWith(PERSON, "news", null);
    await unsubscribe(post("/api/unsubscribe", { p: PERSON, l: "news", s: s(), action: "reason", reason: "too many" }));
    expect(store.withdrawRow).toHaveBeenLastCalledWith(PERSON, "news", "too many");
    await unsubscribe(post("/api/unsubscribe", { p: PERSON, l: "news", s: s(), action: "resubscribe" }));
    expect(store.rejoinRow).toHaveBeenCalledWith(PERSON, "news");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/integration/api/subscribe.test.ts`. Expected: FAIL, route modules not found.
- [ ] **Step 3: Implement.** Add `SUBSCRIBE_EMAIL_FROM: z.string().min(5).max(120).default("Trakline <updates@trakline.in>")` to `src/services/env.ts` beside `CONSOLE_EMAIL_FROM`. Then `src/services/subscriptions/store.ts`:

```ts
import { messages } from "@/messages";
import { AppError } from "@/services/errors";
import { createAdminSupabase } from "@/services/supabase/admin";
import type { SubscribeAsk } from "./subscribe";

// The six RPCs, one small function each. A database error is the traveller's "didn't go through".
const failed = (): AppError => new AppError("SOURCE_UNAVAILABLE", messages.subscribe.errors.failed);
const hex = (b: Buffer): string => `\\x${b.toString("hex")}`;

export async function signUpRow(ask: SubscribeAsk, tokenHash: Buffer): Promise<"send" | "quiet"> {
  const { data, error } = await createAdminSupabase().rpc("subscriptions_sign_up", {
    p_email: ask.email, p_list: ask.list, p_source: ask.source, p_campaign: ask.campaign ?? null, p_notice_version: "1.1", p_token_hash: hex(tokenHash),
  });
  if (error || (data !== "send" && data !== "quiet")) throw failed();
  return data;
}

export async function confirmRow(tokenHash: Buffer): Promise<{ readonly state: string; readonly list: string | null }> {
  const { data, error } = await createAdminSupabase().rpc("subscriptions_confirm", { p_token_hash: hex(tokenHash) });
  if (error || typeof data !== "object" || data === null) throw failed();
  return data as { state: string; list: string | null };
}

export async function peekRow(tokenHash: Buffer): Promise<{ readonly state: string; readonly list: string | null }> {
  const { data, error } = await createAdminSupabase().rpc("subscriptions_peek", { p_token_hash: hex(tokenHash) });
  if (error || typeof data !== "object" || data === null) throw failed();
  return data as { state: string; list: string | null };
}

export async function withdrawRow(person: string, list: string, reason: string | null): Promise<string> {
  const { data, error } = await createAdminSupabase().rpc("subscriptions_withdraw", { p_person: person, p_list: list, p_reason: reason });
  if (error || typeof data !== "string") throw failed();
  return data;
}

export async function rejoinRow(person: string, list: string): Promise<string> {
  const { data, error } = await createAdminSupabase().rpc("subscriptions_rejoin", { p_person: person, p_list: list });
  if (error || typeof data !== "string") throw failed();
  return data;
}

export async function personId(email: string): Promise<string | null> {
  const { data, error } = await createAdminSupabase().rpc("subscriptions_person_id", { p_email: email });
  if (error) throw failed();
  return typeof data === "string" ? data : null;
}
```

  `bytea` travels through PostgREST as `\\x`-prefixed hex. Check this against the local stack in Step 4 by reading back `encode(token_hash, 'hex')`. `src/app/api/subscribe/route.ts`:

```ts
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { messages } from "@/messages";
import { jsonError, jsonOk } from "@/services/api-response";
import { takeConfirmation } from "@/services/email/allowance";
import { sendEmail } from "@/services/email/send";
import { env } from "@/services/env";
import { clientIp } from "@/services/rate-limit";
import { readBody } from "@/services/request-body";
import { createRateLimiter, publicStoreForReading } from "@/services/shared-store";
import { travellerOrigin } from "@/services/subscriptions/links";
import { signUpRow } from "@/services/subscriptions/store";
import { subscribe } from "@/services/subscriptions/subscribe";

export const dynamic = "force-dynamic";

const body = z
  .object({
    email: z.string().max(320),
    list: z.enum(["news", "availability"]),
    source: z.enum(["footer", "landing", "pre-booking", "account"]),
    campaign: z.object({ source: z.string().max(100), medium: z.string().max(100), name: z.string().max(100), page: z.string().max(200) }).partial().strict().optional(),
  })
  .strict();

/** POST /api/subscribe — one sign-up; the same reply whether or not the address was known. */
export async function POST(req: Request): Promise<Response> {
  try {
    const ask = await readBody(req, body);
    const current = env();
    const { kv, prefix } = publicStoreForReading(current);
    await subscribe(ask, clientIp(null, req.headers.get("x-forwarded-for")), {
      limiter: createRateLimiter(current),
      allowance: () => takeConfirmation(kv, prefix, new Date()),
      signUp: signUpRow,
      send: sendEmail,
      origin: travellerOrigin(req.headers.get("host"), current.VERCEL_ENV),
      from: current.SUBSCRIBE_EMAIL_FROM,
      token: () => randomBytes(32).toString("base64url"),
    });
    return jsonOk({ ok: true, message: messages.subscribe.sent });
  } catch (err) {
    return jsonError(err);
  }
}
```

  `src/app/api/subscribe/confirm/route.ts`:

```ts
import { z } from "zod";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";
import { confirmRow } from "@/services/subscriptions/store";
import { tokenHash } from "@/services/subscriptions/subscribe";

export const dynamic = "force-dynamic";

const body = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();

/** POST /api/subscribe/confirm — the page's Confirm button. Only the token's hash reaches the database. */
export async function POST(req: Request): Promise<Response> {
  try {
    const { token } = await readBody(req, body);
    const { state, list } = await confirmRow(tokenHash(token));
    return jsonOk({ ok: true, state, list });
  } catch (err) {
    return jsonError(err);
  }
}
```

  `src/app/api/unsubscribe/route.ts`:

```ts
import { z } from "zod";
import { messages } from "@/messages";
import { jsonError, jsonOk } from "@/services/api-response";
import { AppError } from "@/services/errors";
import { readBody } from "@/services/request-body";
import { unsubscribeKey, verifyUnsubscribe } from "@/services/subscriptions/links";
import { rejoinRow, withdrawRow } from "@/services/subscriptions/store";

export const dynamic = "force-dynamic";

const body = z
  .object({
    p: z.uuid(),
    l: z.enum(["news", "availability"]),
    s: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    action: z.enum(["unsubscribe", "resubscribe", "reason"]),
    reason: z.enum(["too many", "not relevant", "did not sign up", "other"]).optional(),
  })
  .strict();

/** POST /api/unsubscribe — the page's buttons. No sign-in: the signed link is the permission. */
export async function POST(req: Request): Promise<Response> {
  try {
    const { p, l, s, action, reason } = await readBody(req, body);
    if (!verifyUnsubscribe(unsubscribeKey(), p, l, s)) throw new AppError("INVALID_INPUT", messages.subscribe.errors.failed);
    const state = action === "resubscribe" ? await rejoinRow(p, l) : await withdrawRow(p, l, action === "reason" ? (reason ?? null) : null);
    return jsonOk({ ok: true, state });
  } catch (err) {
    return jsonError(err);
  }
}
```

- [ ] **Step 4: Run** the integration test, then `npx vitest run tests/unit/services/limited-log.test.ts` (the tripwire now sees the `subscribe` scope). Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add src/app/api/subscribe src/app/api/unsubscribe src/services/subscriptions/store.ts src/services/env.ts tests/integration/api/subscribe.test.ts
git commit -m "feat(subscriptions): /api/subscribe, /api/subscribe/confirm and /api/unsubscribe"
```

### Task 10: Privacy notice v1.1

**Files:**
- Modify: `src/messages/en-IN/legal.ts`
- Test: `tests/unit/messages/legal.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from "vitest";
import { messages } from "@/messages";

describe("privacy notice v1.1", () => {
  it("has an Email updates section saying what, why, how long and how to withdraw", () => {
    const section = messages.legal.privacy.sections.find((s) => s.id === "email-updates");
    expect(section?.body).toMatch(/7 days/);
    expect(section?.body).toMatch(/until you unsubscribe/);
    expect(section?.body).toMatch(/every email/i);
  });
  it("shows its version", () => {
    expect(messages.legal.privacy.version).toBe("1.1");
  });
});
```

- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement.** Add `version: "1.1"` to `legal.privacy`. Add, after `account`, the section below, and set `legal.updated` to the merge date:

```ts
      { id: "email-updates", title: "Email updates", body: "If you ask for updates by email, we keep your address, where and when you gave it, and a record of your consent — only to send what you asked for. We send one email to confirm; an address that is never confirmed is deleted after 7 days. A confirmed address is kept until you unsubscribe, which you can do in one click from every email we send. Having an account never subscribes you." },
```

  Show `Version 1.1` beside the "Last updated" line on `/privacy`. Find its render with `grep -rn "updatedLine" src/app` and add the version as a second meta line using the same class.
- [ ] **Step 4: Run** the test and `npx vitest run tests/unit/privacy`. Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add src/messages/en-IN/legal.ts src/app tests/unit/messages/legal.test.ts
git commit -m "docs(privacy): notice v1.1 — email updates, what we keep and for how long"
```

### Task 11: The API-level e2e

**Files:**
- Create: `tests/e2e/console-auth/subscribe.spec.ts` (under the console config, the one with a database; it reaches the traveller host `localhost:4211`)

- [ ] **Step 1: Write the spec** `tests/e2e/console-auth/subscribe.spec.ts`:

```ts
import { messages } from "@/messages";
import { signUnsubscribe, unsubscribeKey } from "@/services/subscriptions/links";
import { consoleSql, expect, test } from "./fixtures";

const BASE = "http://admin.localhost:4211";
const traveller = (base: string) => base.replace("admin.localhost", "localhost");
const HEADERS = { "content-type": "application/json", "x-forwarded-for": "198.51.100.90" };

/**
 * Sign up, confirm once, stay quiet, unsubscribe: the whole backend, through the real routes and the
 * real database. The unsubscribe signature is made here with the key the server derives, which is why
 * this spec and the server share one fixed test DATA_KEY (see Step 1's note).
 */
test("a sign-up is confirmed once, a repeat is quiet, and the signed link unsubscribes", async ({ request, baseURL }) => {
  const base = baseURL ?? BASE;
  const email = `sub-${Date.now()}@example.in`;
  try {
    const first = await request.post(`${traveller(base)}/api/subscribe`, { headers: HEADERS, data: { email, list: "news", source: "footer" } });
    expect(await first.json()).toEqual({ ok: true, message: messages.subscribe.sent });

    const letters = (await (await request.get(`${base}/api/test-outbox?to=${encodeURIComponent(email)}`)).json()).letters as { text: string }[];
    expect(letters).toHaveLength(1);
    const token = /subscribe\/confirm\?token=([A-Za-z0-9_-]{43})/.exec(letters[0]!.text)?.[1];
    expect(token).toBeDefined();

    const confirmed = await request.post(`${traveller(base)}/api/subscribe/confirm`, { headers: HEADERS, data: { token } });
    expect(await confirmed.json()).toEqual({ ok: true, state: "confirmed", list: "news" });
    expect(consoleSql(`select c.confirmed_at is not null from subscriptions.consents c join subscriptions.people p on p.id = c.person_id where p.email = '${email}'`)).toBe("t");

    await request.post(`${traveller(base)}/api/subscribe`, { headers: HEADERS, data: { email, list: "news", source: "footer" } });
    const again = (await (await request.get(`${base}/api/test-outbox?to=${encodeURIComponent(email)}`)).json()).letters;
    expect(again, "already subscribed: no second email").toHaveLength(0);

    const person = consoleSql(`select id from subscriptions.people where email = '${email}'`);
    const out = await request.post(`${traveller(base)}/api/unsubscribe`, { headers: HEADERS, data: { p: person, l: "news", s: signUnsubscribe(unsubscribeKey(), person, "news"), action: "unsubscribe" } });
    expect(await out.json()).toEqual({ ok: true, state: "done" });
  } finally {
    consoleSql(`delete from subscriptions.people where email = '${email}'`);
  }
});
```

  Before running, give the server and this spec the same key.
  - Add `DATA_KEY: Buffer.alloc(32, 7).toString("base64")` to `playwright.console.config.ts`'s webServer `env`. This is the fixed test key `tests/unit/services/shared-store.test.ts` already uses; it is not a secret.
  - Add `process.env.DATA_KEY ??= Buffer.alloc(32, 7).toString("base64");` as the spec's first statement, above the imports' first use.

- [ ] **Step 2: Run** `npm run test:e2e:console` (it needs the local stack up; if it is half-stopped, say so and rely on CI's "Console end-to-end" step). Expected: PASS.
- [ ] **Step 3: Commit.**

```bash
git add tests/e2e/console-auth/subscribe.spec.ts
git commit -m "test(subscriptions): sign up, confirm once, stay quiet, unsubscribe — end to end"
```

### Task 12: Gate and PR

- [ ] **Step 1:** `npm run check`. Expected: exit 0. Then `npm run db:test`. Expected: PASS.
- [ ] **Step 2:** Push and open the PR into `main`. The description leads with "**Needs `npm run db:push` when it merges**" and "Nothing links to these routes yet; PR 3 adds the forms." End with the Claude Code line, and no Co-Authored-By trailer.
- [ ] **Step 3:** Call `mcp__ccd_pr__get_status`; offer Auto-fix; never merge without the owner.
