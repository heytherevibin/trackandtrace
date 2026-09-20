# Phase 2b — The console database Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the console its own private database — a `console` schema with every table the spec names, the append-only audit log, runtime settings, the session-and-tap guard, and the service-role functions sign-in will call — with pgTAP tests that CI runs against a local Supabase.

**Architecture:** One private schema, `console`, that the Data API never exposes. Nothing reads or writes its tables directly: every caller goes through a `security definer` function in `public` whose name starts with `console_`. Member-facing functions are granted to `authenticated` and check the caller's key-verified session and role from `auth.uid()` and the JWT's `session_id` themselves; service-role functions (`console_auth_*`) are granted only to `service_role` and are what the Next.js server calls after it has verified a key tap. Every change writes its audit row in the same transaction as the change.

**Tech Stack:** Postgres 17 (Supabase), pgTAP through `supabase test db`, `supabase` CLI 2.117.0, Docker through colima on the Mac, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-19-phase-2-admin-core-design.md` (§C identity and sessions, §D keys and taps, §E data, §F runtime settings, §5 failure behaviour, §6 tests, §7 order of work item 3)

## Global Constraints

- **Migrations are forward-only.** Applied locally by `supabase db reset` and remotely by `supabase db push`. Never edit a migration that has been pushed; add another.
- **Every function is `security definer` with `set search_path = ''`**, and every identifier inside it is schema-qualified. This is the existing convention in `supabase/migrations/20260917120000_watchlist.sql`.
- **The `console` schema is never exposed through the Data API.** `config.toml`'s `[api] schemas` stays `["public", "graphql_public"]`. Callable functions live in `public`; `console` holds tables and internal helpers only.
- **Grants are explicit.** Every function: `revoke all on function … from public, anon, authenticated, service_role;` then a single `grant execute` to the one role that may call it. `service_role` belongs in the revoke list even when it is the grantee: Supabase's default privileges grant EXECUTE on public-schema functions to it, so a revoke that names only `public, anon` leaves that default in place. Every table: no grants to `anon` or `authenticated` at all.
- **Member functions check the caller themselves** — the key-verified session from `auth.uid()` and the JWT's `session_id`, then the role — because RLS is not the gate here.
- **Risky actions consume a tap.** The database recomputes the digest from its own arguments and marks the challenge used, so a tap can't approve a different action or the same action twice.
- **The audit log is append-only.** `update` and `delete` are revoked from every role and refused by a trigger. Only `console.purge_audit()` deletes, and only rows older than two years.
- **Reasons are scrubbed in SQL as well as in the server**: PNR-like ten-digit runs, email addresses and IP addresses never reach storage.
- **TDD:** the pgTAP test lands first and is run to see it fail. Conventional commits, with **no Co-Authored-By trailer**.
- **Tests hold the constraints, not the names.** `has_table` and `has_enum` prove nothing about shape, so every task's test also asserts what it creates: `enum_has_labels` for each enum, `has_index` for each index, `col_not_null` and `col_is_unique` for the columns that carry a rule, and a `throws_ok` on the SQLSTATE for each CHECK and foreign key that matters (`23514`, `23503`, `23505`). Use the four-argument `throws_ok` — the three-argument form matches the error message text exactly, which is brittle.
- **Before each commit:** `npm run db:test` (and `npm run db:reset` when a migration changed). **Before the PR:** also `npm run typecheck && npm run lint && npm run test:unit && npm run build`.
- **PR:** into `main`, with `verify` and `e2e` green, a body ending "🤖 Generated with [Claude Code](https://claude.com/claude-code)", and merged only with the owner's go-ahead.

## What this plan does not build

The spec's §E says access goes through functions. This plan builds every function the spec names in §C–§F: the guard, the tap check, the audit writer and purge, the settings reader and writer, the first-Owner link, and the service-role functions for challenges, keys, sessions and invites. The module-shaped member functions (Team's list, invite, role change, removal and keys reset; My keys' list and remove, with the rule that a member always keeps at least two keys; Audit log's filtered read and CSV) land with their modules in plan 2d, where the sheets pin the exact columns each one returns. Building them now would mean guessing those shapes twice.

## Starting the local database

Every task runs against the local stack. Docker on this Mac is colima, which is installed but does not run by default:

```bash
colima start                      # once per machine session, ~30 s
npm run db:start                  # supabase start
npm run db:reset                  # migrations + seed
```

`npm run db:stop` and `colima stop` when the branch is done. If `colima start` fails, stop and report it — do not install anything.

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260920090000_console_schema.sql` | the schema, enums, `members`, and the role helper |
| `supabase/migrations/20260920090100_console_keys_sessions.sql` | `keys`, `sessions`, `challenges` |
| `supabase/migrations/20260920090200_console_invites.sql` | `invites`, `setup_links` |
| `supabase/migrations/20260920090300_console_audit.sql` | `audit_log`, `scrub`, the append-only trigger, `write_audit`, `purge_audit` |
| `supabase/migrations/20260920090400_console_guard.sql` | `current_member`, `require_role`, `use_tap` |
| `supabase/migrations/20260920090500_console_settings.sql` | `settings`, its reader and its versioned writer |
| `supabase/migrations/20260920090600_console_auth_sessions.sql` | the `public.console_auth_*` surface the server calls |
| `supabase/migrations/20260920090700_console_auth_keys.sql` | the keys, invites and Owner-address functions |
| `supabase/migrations/20260920090800_console_first_owner.sql` | `console.create_first_owner_link` and its redemption |
| `supabase/tests/*.test.sql` | one pgTAP file per migration above |
| `package.json` | `db:test` script |
| `.github/workflows/ci.yml` | the e2e job starts the local stack and runs the database tests |
| `src/types/supabase.ts` | regenerated so the server sees the new function signatures |
| `docs/architecture.md` | a console-database line in the layers block |

---

### Task 1: The schema, the members table, and the pgTAP harness

**Files:**
- Create: `supabase/migrations/20260920090000_console_schema.sql`
- Create: `supabase/tests/console_schema.test.sql`
- Modify: `package.json` (scripts)
- Modify: `.github/workflows/ci.yml` (the e2e job)

**Interfaces:**
- Produces: schema `console`; enums `console.member_role` (`owner`, `admin`, `support`, `viewer`), `console.member_status` (`setup`, `active`, `removed`); table `console.members`; `console.role_rank(console.member_role) returns int`.
- Consumes: nothing.

- [ ] **Step 1: Start the database**

```bash
colima start && npm run db:start && npm run db:reset
```

Expected: `supabase start` prints the local API URL and keys.

- [ ] **Step 2: Add the test script**

In `package.json`, next to the other `db:` scripts:

```json
"db:test": "npx supabase@2.117.0 test db",
```

- [ ] **Step 3: Write the failing test**

`supabase/tests/console_schema.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select has_schema('console', 'the console schema exists');
select has_table('console', 'members', 'members exists');
select has_enum('console', 'member_role', 'the role enum exists');
select has_enum('console', 'member_status', 'the status enum exists');

select col_is_pk('console', 'members', 'user_id', 'a member is keyed by its auth user');
select col_not_null('console', 'members', 'email', 'a member always has an address');
select col_not_null('console', 'members', 'role', 'a member always has a role');

-- The Data API must never reach these tables.
select is(
  has_table_privilege('authenticated', 'console.members', 'select')::text,
  'false',
  'authenticated cannot read members directly'
);
select is(
  has_table_privilege('anon', 'console.members', 'select')::text,
  'false',
  'anon cannot read members directly'
);

-- Roles rank so a guard can ask for "admin or better".
select is(console.role_rank('owner') > console.role_rank('admin'), true, 'owner outranks admin');
select is(console.role_rank('support') > console.role_rank('viewer'), true, 'support outranks viewer');

select * from finish();
rollback;
```

- [ ] **Step 4: Run it to see it fail**

Run: `npm run db:test`
Expected: FAIL — `schema "console" does not exist`. If instead pgTAP itself is missing (`extension "pgtap" is not available`), stop and report it: the fallback is to create the extension once against the local database (`psql "$(npx supabase@2.117.0 status -o json | jq -r .DB_URL)" -c 'create extension if not exists pgtap with schema extensions'`) and drop the in-file `create extension` line.

- [ ] **Step 5: Write the migration**

`supabase/migrations/20260920090000_console_schema.sql`:

```sql
-- The console's own schema. Never exposed through the Data API: every caller goes
-- through a security-definer function in public. Forward-only.

create schema if not exists console;

revoke all on schema console from public;
revoke usage on schema console from anon, authenticated;

create type console.member_role as enum ('owner', 'admin', 'support', 'viewer');
create type console.member_status as enum ('setup', 'active', 'removed');

create table console.members (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  email          text not null check (email = lower(email) and char_length(email) between 3 and 254),
  name           text not null check (char_length(name) between 1 and 120),
  role           console.member_role not null,
  status         console.member_status not null default 'setup',
  invited_by     uuid references console.members (user_id) on delete set null,
  keys_reset_at  timestamptz,
  keys_reset_by  uuid references console.members (user_id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint console_members_email_key unique (email)
);

create index console_members_active_idx
  on console.members (role) where status = 'active';

create or replace function console.role_rank(p_role console.member_role)
returns int
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p_role
    when 'owner' then 4
    when 'admin' then 3
    when 'support' then 2
    when 'viewer' then 1
  end;
$$;

revoke all on function console.role_rank(console.member_role) from public, anon, authenticated;
```

- [ ] **Step 6: Apply it and run the test**

```bash
npm run db:reset && npm run db:test
```

Expected: PASS, 11 of 11.

- [ ] **Step 7: Teach CI to run it**

In `.github/workflows/ci.yml`, in the **e2e** job, directly after `- run: npm ci` and before the Playwright steps:

```yaml
      - name: Start the local Supabase stack
        run: npx supabase@2.117.0 start -x realtime,storage-api,imgproxy,studio,edge-runtime,logflare,vector,supavisor,mailpit
      - name: Database tests
        run: npx supabase@2.117.0 test db
```

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations supabase/tests package.json .github/workflows/ci.yml
git commit -m "feat(console): the console schema, its members table and the pgTAP harness"
```

---

### Task 2: Keys, sessions and challenges

**Files:**
- Create: `supabase/migrations/20260920090100_console_keys_sessions.sql`
- Create: `supabase/tests/console_keys_sessions.test.sql`

**Interfaces:**
- Consumes: `console.members (user_id)`.
- Produces: `console.keys`, `console.sessions`, `console.challenges`; enums `console.key_type` (`passkey`, `security_key`), `console.challenge_purpose` (`sign_in`, `add_key`, `action`).

- [ ] **Step 1: Write the failing test**

`supabase/tests/console_keys_sessions.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select has_table('console', 'keys', 'keys exists');
select has_table('console', 'sessions', 'sessions exists');
select has_table('console', 'challenges', 'challenges exists');

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in');
insert into console.members (user_id, email, name, role, status)
values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in', 'Owner', 'owner', 'active');

insert into console.keys (member_id, credential_id, public_key, counter, name, type)
values ('11111111-1111-1111-1111-111111111111', '\x01'::bytea, '\x02'::bytea, 0, 'Blue key', 'security_key');

-- The same credential can never be registered twice, by anyone.
select throws_ok(
  $$insert into console.keys (member_id, credential_id, public_key, counter, name, type)
    values ('11111111-1111-1111-1111-111111111111', '\x01'::bytea, '\x03'::bytea, 0, 'Copy', 'security_key')$$,
  '23505',
  null,
  'the same credential cannot be registered twice'
);

insert into console.sessions (session_id, member_id, address_hash, device_label, expires_at)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'hash', 'Chrome on macOS', now() + interval '7 days');

select is(
  (select key_verified_at is null from console.sessions where session_id = '22222222-2222-2222-2222-222222222222'),
  true,
  'a new session is not key-verified'
);
select is(
  (select revoked_at is null from console.sessions where session_id = '22222222-2222-2222-2222-222222222222'),
  true,
  'a new session is not revoked'
);

-- A sign-in challenge carries no digest; only an action tap does.
insert into console.challenges (member_id, session_id, purpose, challenge, expires_at)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'sign_in', 'sign-in-challenge-0001', now() + interval '5 minutes');

select is(
  (select used_at is null from console.challenges where challenge = 'sign-in-challenge-0001'),
  true,
  'a new challenge is unused'
);

-- An action tap is meaningless without the digest of what it approves.
select throws_ok(
  $$insert into console.challenges (member_id, session_id, purpose, challenge, expires_at)
    values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'action', 'action-challenge-0009', now() + interval '5 minutes')$$,
  '23514'::char(5),
  null,
  'an action challenge without a digest is refused'
);

-- A member's rows go when the member goes.
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select is((select count(*) from console.keys)::int, 0, 'keys follow the member');
select is((select count(*) from console.sessions)::int, 0, 'sessions follow the member');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run db:test`
Expected: FAIL — `relation "console.keys" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260920090100_console_keys_sessions.sql`:

```sql
-- Security keys, the sessions they verify, and the single-use challenges both rely on.

create type console.key_type as enum ('passkey', 'security_key');
create type console.challenge_purpose as enum ('sign_in', 'add_key', 'action');

create table console.keys (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references console.members (user_id) on delete cascade,
  credential_id  bytea not null,
  public_key     bytea not null,
  counter        bigint not null default 0 check (counter >= 0),
  transports     text[] not null default '{}',
  name           text not null check (char_length(name) between 1 and 60),
  type           console.key_type not null,
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz,
  constraint console_keys_credential_key unique (credential_id)
);

create index console_keys_member_idx on console.keys (member_id, created_at);

create table console.sessions (
  session_id       uuid primary key,
  member_id        uuid not null references console.members (user_id) on delete cascade,
  key_id           uuid references console.keys (id) on delete set null,
  key_verified_at  timestamptz,
  device_label     text not null check (char_length(device_label) between 1 and 120),
  address_hash     text not null check (char_length(address_hash) between 1 and 128),
  last_seen_at     timestamptz not null default now(),
  expires_at       timestamptz not null,
  revoked_at       timestamptz,
  created_at       timestamptz not null default now()
);

create index console_sessions_member_idx on console.sessions (member_id, created_at desc);
create index console_sessions_live_idx on console.sessions (expires_at) where revoked_at is null;

create table console.challenges (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references console.members (user_id) on delete cascade,
  session_id  uuid references console.sessions (session_id) on delete cascade,
  purpose     console.challenge_purpose not null,
  challenge   text not null check (char_length(challenge) between 16 and 512),
  digest      bytea,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  constraint console_challenges_challenge_key unique (challenge),
  -- An action tap is always bound to a digest of what it approves.
  constraint console_challenges_action_digest check (purpose <> 'action' or digest is not null)
);

create index console_challenges_open_idx
  on console.challenges (member_id, purpose, expires_at) where used_at is null;

revoke all on console.keys, console.sessions, console.challenges from anon, authenticated;
```

- [ ] **Step 4: Apply it and run the test**

```bash
npm run db:reset && npm run db:test
```

Expected: PASS, both files.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests
git commit -m "feat(console): keys, sessions and single-use challenges"
```

---

### Task 3: Invites and setup links

**Files:**
- Create: `supabase/migrations/20260920090200_console_invites.sql`
- Create: `supabase/tests/console_invites.test.sql`

**Interfaces:**
- Consumes: `console.members`, `console.member_role`.
- Produces: `console.invites`, `console.setup_links`.

- [ ] **Step 1: Write the failing test**

`supabase/tests/console_invites.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select has_table('console', 'invites', 'invites exists');
select has_table('console', 'setup_links', 'setup_links exists');

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in');
insert into console.members (user_id, email, name, role, status)
values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in', 'Owner', 'owner', 'active');

insert into console.invites (email, role, invited_by, token_hash, expires_at)
values ('new@trakline.in', 'support', '11111111-1111-1111-1111-111111111111', '\xaa'::bytea, now() + interval '7 days');

select is(
  (select expires_at > now() + interval '6 days' from console.invites where email = 'new@trakline.in'),
  true,
  'an invite lasts a week'
);

-- One live invite per address; a revoked or accepted one does not block a fresh one.
select throws_ok(
  $$insert into console.invites (email, role, invited_by, token_hash, expires_at)
    values ('new@trakline.in', 'viewer', '11111111-1111-1111-1111-111111111111', '\xbb'::bytea, now() + interval '7 days')$$,
  '23505',
  null,
  'an address cannot hold two live invites'
);

update console.invites set revoked_at = now() where email = 'new@trakline.in';

select lives_ok(
  $$insert into console.invites (email, role, invited_by, token_hash, expires_at)
    values ('new@trakline.in', 'viewer', '11111111-1111-1111-1111-111111111111', '\xcc'::bytea, now() + interval '7 days')$$,
  'a revoked invite frees the address'
);

insert into console.setup_links (email, token_hash, expires_at)
values ('owner@trakline.in', '\xdd'::bytea, now() + interval '24 hours');

select is(
  (select used_at is null from console.setup_links where email = 'owner@trakline.in'),
  true,
  'a new setup link is unused'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run db:test`
Expected: FAIL — `relation "console.invites" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260920090200_console_invites.sql`:

```sql
-- Invites for new members, and the one-time link that makes the first Owner.

create table console.invites (
  id           uuid primary key default gen_random_uuid(),
  email        text not null check (email = lower(email) and char_length(email) between 3 and 254),
  role         console.member_role not null,
  invited_by   uuid not null references console.members (user_id) on delete cascade,
  token_hash   bytea not null,
  sent_at      timestamptz,
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  constraint console_invites_token_key unique (token_hash)
);

-- One live invite per address. Accepted and revoked ones fall out of the index.
create unique index console_invites_live_email_idx
  on console.invites (email) where accepted_at is null and revoked_at is null;

create table console.setup_links (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (email = lower(email) and char_length(email) between 3 and 254),
  token_hash  bytea not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now(),
  constraint console_setup_links_token_key unique (token_hash)
);

revoke all on console.invites, console.setup_links from anon, authenticated;
```

- [ ] **Step 4: Apply it and run the test**

```bash
npm run db:reset && npm run db:test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests
git commit -m "feat(console): invites and the first-Owner setup link"
```

---

### Task 4: The append-only audit log

**Files:**
- Create: `supabase/migrations/20260920090300_console_audit.sql`
- Create: `supabase/tests/console_audit.test.sql`

**Interfaces:**
- Consumes: `console.members`, `console.keys`, `console.member_role`.
- Produces: enum `console.audit_result` (`done`, `refused`, `failed`); table `console.audit_log`; `console.scrub(text) returns text`; `console.write_audit(p_environment text, p_actor uuid, p_actor_name text, p_actor_role console.member_role, p_key_id uuid, p_session_label text, p_category text, p_action text, p_target text, p_reason text, p_result console.audit_result, p_address_hash text, p_before jsonb, p_after jsonb) returns uuid`; `console.purge_audit() returns integer`.

- [ ] **Step 1: Write the failing test**

`supabase/tests/console_audit.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select has_table('console', 'audit_log', 'the audit log exists');

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in');
insert into console.members (user_id, email, name, role, status)
values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in', 'Owner', 'owner', 'active');

-- A reason never keeps a PNR, an address or an IP.
select is(
  console.scrub('PNR 2345678901 for asha@example.com from 203.0.113.9'),
  'PNR [removed] for [removed] from [removed]',
  'the scrubber removes PNR-like runs, addresses and IPs'
);
select is(console.scrub(null), '', 'a missing reason scrubs to nothing');

select console.write_audit(
  'development', '11111111-1111-1111-1111-111111111111', 'Owner', 'owner',
  null, 'Chrome on macOS', 'team', 'Role changed', 'asha@trakline.in',
  'because 2345678901 asked', 'done', 'hash', '{"role":"viewer"}'::jsonb, '{"role":"support"}'::jsonb
) as written;

select is((select count(*) from console.audit_log)::int, 1, 'the row landed');
select is(
  (select reason from console.audit_log limit 1),
  'because [removed] asked',
  'the stored reason is scrubbed again in SQL'
);
select is((select result from console.audit_log limit 1)::text, 'done', 'the result is kept');

-- Append-only: nothing may change or remove a row.
select throws_ok(
  $$update console.audit_log set reason = 'edited'$$,
  '42501',
  null,
  'the audit log refuses updates'
);
select throws_ok(
  $$delete from console.audit_log$$,
  '42501',
  null,
  'the audit log refuses deletes'
);

-- Only purge_audit removes rows, and only old ones.
select is(console.purge_audit(), 0, 'nothing is old enough to purge yet');

insert into console.audit_log (at, environment, actor_name, category, action, result)
values (now() - interval '3 years', 'development', 'System', 'system', 'Old thing', 'done');

select is(console.purge_audit(), 1, 'a three-year-old row is purged');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run db:test`
Expected: FAIL — `relation "console.audit_log" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260920090300_console_audit.sql`:

```sql
-- The audit log. Append-only: updates and deletes are refused, and only
-- console.purge_audit() removes rows, only when they are older than two years.

create type console.audit_result as enum ('done', 'refused', 'failed');

create table console.audit_log (
  id             uuid primary key default gen_random_uuid(),
  at             timestamptz not null default now(),
  environment    text not null check (char_length(environment) between 1 and 20),
  actor_id       uuid references console.members (user_id) on delete set null,
  actor_name     text not null check (char_length(actor_name) between 1 and 120),
  actor_role     console.member_role,
  key_id         uuid references console.keys (id) on delete set null,
  session_label  text,
  category       text not null check (char_length(category) between 1 and 40),
  action         text not null check (char_length(action) between 1 and 120),
  target         text,
  reason         text,
  result         console.audit_result not null,
  address_hash   text,
  before         jsonb,
  after          jsonb
);

create index console_audit_at_idx on console.audit_log (at desc);
create index console_audit_category_idx on console.audit_log (category, at desc);
create index console_audit_actor_idx on console.audit_log (actor_id, at desc);

revoke all on console.audit_log from anon, authenticated;
-- Append-only means append-only for every role, including the one the server holds.
-- `all`, not `update, delete`: truncate is a delete no row trigger would see.
revoke all on console.audit_log from service_role, authenticator;

-- Reasons are free text. The server scrubs them; SQL scrubs them again, because
-- the audit log is the one place a slip would be permanent.
-- Addresses go first: an address whose local part is itself a long digit run
-- ("2345678901@example.com") must be taken whole, or the digit pass eats the
-- local part, the address pattern no longer matches, and the domain survives.
create or replace function console.scrub(p_text text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(coalesce(p_text, ''), '[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}', '[removed]', 'g'),
             '[0-9]{10,}', '[removed]', 'g'),
           '([0-9]{1,3}[.]){3}[0-9]{1,3}|([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}', '[removed]', 'g');
$$;

create or replace function console.audit_is_append_only()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_setting('console.purging', true) = 'on' and tg_op = 'DELETE' then
    return null;
  end if;
  raise exception 'the audit log is append-only' using errcode = '42501';
end;
$$;

create trigger console_audit_append_only
  before update or delete on console.audit_log
  for each statement execute function console.audit_is_append_only();

create or replace function console.write_audit(
  p_environment   text,
  p_actor         uuid,
  p_actor_name    text,
  p_actor_role    console.member_role,
  p_key_id        uuid,
  p_session_label text,
  p_category      text,
  p_action        text,
  p_target        text,
  p_reason        text,
  p_result        console.audit_result,
  p_address_hash  text,
  p_before        jsonb,
  p_after         jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into console.audit_log (
    environment, actor_id, actor_name, actor_role, key_id, session_label,
    category, action, target, reason, result, address_hash, before, after
  ) values (
    p_environment, p_actor, coalesce(p_actor_name, 'System'), p_actor_role, p_key_id, p_session_label,
    p_category, p_action, p_target, nullif(console.scrub(p_reason), ''), p_result, p_address_hash, p_before, p_after
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function console.write_audit(text, uuid, text, console.member_role, uuid, text, text, text, text, text, console.audit_result, text, jsonb, jsonb) from public, anon, authenticated;

-- Written now, scheduled when cron arrives (Phase 3).
create or replace function console.purge_audit()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removed integer;
begin
  perform set_config('console.purging', 'on', true);
  delete from console.audit_log where at < now() - interval '2 years';
  get diagnostics v_removed = row_count;
  perform set_config('console.purging', 'off', true);
  return v_removed;
end;
$$;

revoke all on function console.purge_audit() from public, anon, authenticated;
```

- [ ] **Step 4: Apply it and run the test**

```bash
npm run db:reset && npm run db:test
```

Expected: PASS. If the statement trigger lets the purge through but also lets an ordinary delete through, check that `purge_audit` is the only place setting `console.purging`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests
git commit -m "feat(console): the append-only audit log, its scrubber and its purge"
```

---

### Task 5: The guard and the tap check

**Files:**
- Create: `supabase/migrations/20260920090400_console_guard.sql`
- Create: `supabase/tests/console_guard.test.sql`

**Interfaces:**
- Consumes: `console.members`, `console.sessions`, `console.challenges`, `console.role_rank`.
- Produces:
  - `console.claim_uuid(p_key text) returns uuid` — reads one claim and raises `28000` when it is not a uuid, so a malformed claim reads as "session ended" rather than a Postgres parse error.
  - `console.current_member() returns console.members` — raises `28000` ("session ended") when the claims, the session or the member fail; the session must be key-verified, unexpired, unrevoked, used within the last 24 hours, and the member active. It also refreshes `last_seen_at`.
  - `console.require_role(p_least console.member_role) returns console.members` — raises `42501` ("no access") when the caller's role ranks below `p_least`, and also when the asked-for rank is null, because `role_rank` has no `else` and a null comparison would otherwise pass the gate.
  - `console.action_digest(p_action text, p_target text, p_value text, p_reason text) returns bytea` — sha256 of the four joined by `U&'\001F'`.
  - `console.use_tap(p_action text, p_target text, p_value text, p_reason text) returns uuid` — finds this member and session's unused, unexpired `action` challenge whose digest matches, marks it used, returns its `key_id`-bearing challenge id; raises `42501` when there is none.

- [ ] **Step 1: Write the failing test**

`supabase/tests/console_guard.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in');
insert into console.members (user_id, email, name, role, status)
values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in', 'Owner', 'owner', 'active');
insert into console.sessions (session_id, member_id, address_hash, device_label, expires_at, key_verified_at)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'hash', 'Chrome on macOS', now() + interval '7 days', now());

-- Speak as that member, with that session, the way the JWT does.
create or replace function pg_temp.speak_as(p_user uuid, p_session uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'session_id', p_session)::text, true);
end;
$$;

select pg_temp.speak_as('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
select is((console.current_member()).email, 'owner@trakline.in', 'a key-verified session finds its member');
select is((console.require_role('admin')).role::text, 'owner', 'an Owner passes an admin gate');

-- A session that has not tapped a key is not a session yet.
update console.sessions set key_verified_at = null where session_id = '22222222-2222-2222-2222-222222222222';
select throws_ok($$select console.current_member()$$, '28000', null, 'a session without a key tap is refused');
update console.sessions set key_verified_at = now() where session_id = '22222222-2222-2222-2222-222222222222';

update console.sessions set revoked_at = now() where session_id = '22222222-2222-2222-2222-222222222222';
select throws_ok($$select console.current_member()$$, '28000', null, 'a revoked session is refused');
update console.sessions set revoked_at = null where session_id = '22222222-2222-2222-2222-222222222222';

update console.members set status = 'removed' where user_id = '11111111-1111-1111-1111-111111111111';
select throws_ok($$select console.current_member()$$, '28000', null, 'a removed member is refused');
update console.members set status = 'active' where user_id = '11111111-1111-1111-1111-111111111111';

-- 24 hours unused ends a session, even though its week is not up.
update console.sessions set last_seen_at = now() - interval '25 hours'
 where session_id = '22222222-2222-2222-2222-222222222222';
select throws_ok($$select console.current_member()$$, '28000', null, 'a session unused for a day is refused');
update console.sessions set last_seen_at = now()
 where session_id = '22222222-2222-2222-2222-222222222222';

-- A tap approves exactly one action, once.
insert into console.challenges (member_id, session_id, purpose, challenge, digest, expires_at)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'action', 'action-challenge-0001',
        console.action_digest('role.change', 'asha@trakline.in', 'support', 'cover'), now() + interval '5 minutes');

select lives_ok(
  $$select console.use_tap('role.change', 'asha@trakline.in', 'support', 'cover')$$,
  'the tap approves the action it was made for'
);
select throws_ok(
  $$select console.use_tap('role.change', 'asha@trakline.in', 'support', 'cover')$$,
  '42501',
  null,
  'the same tap cannot be used twice'
);

insert into console.challenges (member_id, session_id, purpose, challenge, digest, expires_at)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'action', 'action-challenge-0002',
        console.action_digest('role.change', 'asha@trakline.in', 'support', 'cover'), now() + interval '5 minutes');

select throws_ok(
  $$select console.use_tap('role.change', 'asha@trakline.in', 'owner', 'cover')$$,
  '42501',
  null,
  'a tap cannot approve a different value'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run db:test`
Expected: FAIL — `function console.current_member() does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260920090400_console_guard.sql`:

```sql
-- The guard every member function runs first, and the tap check every risky
-- action runs before it changes anything.

create or replace function console.current_member()
returns console.members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
  v_session uuid := nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'session_id', '')::uuid;
  v_member  console.members;
begin
  if v_user is null or v_session is null then
    raise exception 'session ended' using errcode = '28000';
  end if;

  -- A session ends after 24 hours unused, or 7 days after its key tap. Both are
  -- checked here, because last_seen_at only moves when the member is working.
  update console.sessions
     set last_seen_at = now()
   where session_id = v_session
     and member_id = v_user
     and key_verified_at is not null
     and revoked_at is null
     and expires_at > now()
     and last_seen_at > now() - interval '24 hours';

  if not found then
    raise exception 'session ended' using errcode = '28000';
  end if;

  select * into v_member
    from console.members
   where user_id = v_user and status = 'active';

  if not found then
    raise exception 'session ended' using errcode = '28000';
  end if;

  return v_member;
end;
$$;

revoke all on function console.current_member() from public, anon, authenticated;

create or replace function console.require_role(p_least console.member_role)
returns console.members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member console.members := console.current_member();
begin
  if console.role_rank(v_member.role) < console.role_rank(p_least) then
    raise exception 'no access' using errcode = '42501';
  end if;
  return v_member;
end;
$$;

revoke all on function console.require_role(console.member_role) from public, anon, authenticated;

-- The four things a tap approves. Each field is hashed on its own and the
-- fixed-length digests are hashed together: a separator can appear inside a
-- field, and joining with one would let one field's text be read as another's.
-- The server stores this digest with the challenge; the database recomputes it
-- from its own arguments.
create or replace function console.action_digest(p_action text, p_target text, p_value text, p_reason text)
returns bytea
language sql
immutable
security invoker
set search_path = ''
as $$
  select extensions.digest(
    extensions.digest(coalesce(p_action, ''), 'sha256') ||
    extensions.digest(coalesce(p_target, ''), 'sha256') ||
    extensions.digest(coalesce(p_value,  ''), 'sha256') ||
    extensions.digest(coalesce(p_reason, ''), 'sha256'),
    'sha256'
  );
$$;

revoke all on function console.action_digest(text, text, text, text) from public, anon, authenticated;

create or replace function console.use_tap(p_action text, p_target text, p_value text, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session uuid := nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'session_id', '')::uuid;
  v_member  console.members := console.current_member();
  v_id      uuid;
begin
  update console.challenges
     set used_at = now()
   where id = (
     select id from console.challenges
      where member_id = v_member.user_id
        and session_id = v_session
        and purpose = 'action'
        and used_at is null
        and expires_at > now()
        and digest = console.action_digest(p_action, p_target, p_value, p_reason)
      order by created_at
      limit 1
      for update skip locked
   )
   returning id into v_id;

  if v_id is null then
    raise exception 'no tap for this action' using errcode = '42501';
  end if;

  return v_id;
end;
$$;

revoke all on function console.use_tap(text, text, text, text) from public, anon, authenticated;
```

`extensions.digest` comes from pgcrypto, which the watchlist migration already installed; if `db:reset` reports it missing, add `create extension if not exists pgcrypto with schema extensions;` at the top of this migration.

- [ ] **Step 4: Apply it and run the test**

```bash
npm run db:reset && npm run db:test
```

Expected: PASS, 8 of 8.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests
git commit -m "feat(console): the session guard and the per-action tap check"
```

---

### Task 6: Runtime settings, read and saved

**Files:**
- Create: `supabase/migrations/20260920090500_console_settings.sql`
- Create: `supabase/tests/console_settings.test.sql`

**Interfaces:**
- Consumes: the guard (`console.require_role`, `console.use_tap`), `console.write_audit`.
- Produces: table `console.settings` (one row per environment, every switch nullable, `version`, `changed_at`, `changed_by`); `public.console_auth_read_settings(p_environment text) returns jsonb` (service role); `public.console_save_settings(p_environment text, p_version integer, p_changes jsonb, p_reason text) returns integer` (authenticated, admin or better, one tap, returns the new version).
- The eight switches, exactly as the spec's §F table names them: `checks_paused` + `checks_paused_message`, `primary_source`, `fallback_source`, `new_accounts_open`, `traveller_passkey_enabled`, `site_notice_on` + `site_notice_text` + `site_notice_version`, `checks_per_address`, `live_checks_per_day`. Null always means "the deployment's default".

- [ ] **Step 1: Write the failing test**

`supabase/tests/console_settings.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select has_table('console', 'settings', 'settings exists');
select is((select count(*) from console.settings)::int, 3, 'one row per environment, seeded');
select is(
  (select checks_paused is null and live_checks_per_day is null from console.settings where environment = 'production'),
  true,
  'every switch starts null, meaning the deployment default'
);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in');
insert into console.members (user_id, email, name, role, status)
values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in', 'Owner', 'owner', 'active');
insert into console.sessions (session_id, member_id, address_hash, device_label, expires_at, key_verified_at)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'hash', 'Chrome on macOS', now() + interval '7 days', now());

create or replace function pg_temp.speak_as(p_user uuid, p_session uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'session_id', p_session)::text, true);
end;
$$;
select pg_temp.speak_as('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

-- A save needs a tap for exactly these arguments.
select throws_ok(
  $$select public.console_save_settings('development', 1, '{"checks_paused": true}'::jsonb, 'maintenance')$$,
  '42501',
  null,
  'a save without a tap is refused'
);

-- The tap's value is the change set as jsonb renders it, which is what the
-- function hashes (`p_changes::text`). Cast in the test too, so the two agree
-- whatever jsonb does with spacing.
insert into console.challenges (member_id, session_id, purpose, challenge, digest, expires_at)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'action', 'settings-challenge-0001',
        console.action_digest('settings.save', 'development', ('{"checks_paused": true}'::jsonb)::text, 'maintenance'),
        now() + interval '5 minutes');

select is(
  public.console_save_settings('development', 1, '{"checks_paused": true}'::jsonb, 'maintenance'),
  2,
  'a save bumps the version'
);
select is(
  (select checks_paused from console.settings where environment = 'development'),
  true,
  'the switch is applied'
);
select is(
  (select count(*)::int from console.audit_log where category = 'settings' and target = 'checks_paused'),
  1,
  'one audit row per changed field'
);

-- Two saves cannot clash: the second one carries a stale version.
insert into console.challenges (member_id, session_id, purpose, challenge, digest, expires_at)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'action', 'settings-challenge-0002',
        console.action_digest('settings.save', 'development', ('{"checks_paused": false}'::jsonb)::text, 'undo'),
        now() + interval '5 minutes');

select throws_ok(
  $$select public.console_save_settings('development', 1, '{"checks_paused": false}'::jsonb, 'undo')$$,
  '40001',
  null,
  'a stale version is refused'
);

select is(
  public.console_auth_read_settings('development') ->> 'checks_paused',
  'true',
  'the reader hands the traveller path the current value'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run db:test`
Expected: FAIL — `relation "console.settings" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260920090500_console_settings.sql`:

```sql
-- Runtime settings: one row per environment, every switch nullable so null
-- always means "the deployment's default". The audit log holds the history.

create table console.settings (
  environment                text primary key check (environment in ('production', 'preview', 'development')),
  checks_paused              boolean,
  checks_paused_message      text check (checks_paused_message is null or char_length(checks_paused_message) between 1 and 200),
  primary_source             text check (primary_source is null or primary_source in ('railkit', 'rapidapi')),
  fallback_source            text check (fallback_source is null or fallback_source in ('none', 'railkit', 'rapidapi')),
  new_accounts_open          boolean,
  traveller_passkey_enabled  boolean,
  site_notice_on             boolean,
  site_notice_text           text check (site_notice_text is null or char_length(site_notice_text) between 1 and 200),
  site_notice_version        integer check (site_notice_version is null or site_notice_version >= 1),
  checks_per_address         integer check (checks_per_address is null or checks_per_address between 5 and 60),
  live_checks_per_day        integer check (live_checks_per_day is null or live_checks_per_day between 1 and 1000000),
  version                    integer not null default 1,
  changed_at                 timestamptz not null default now(),
  changed_by                 uuid references console.members (user_id) on delete set null
);

insert into console.settings (environment) values ('production'), ('preview'), ('development');

revoke all on console.settings from anon, authenticated;

-- The traveller path reads through the server, which holds the service role.
create or replace function public.console_auth_read_settings(p_environment text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(s) from console.settings s where s.environment = p_environment;
$$;

revoke all on function public.console_auth_read_settings(text) from public, anon, authenticated;
grant execute on function public.console_auth_read_settings(text) to service_role;

-- One function applies a change: it takes a tap, checks the version, applies
-- every field and writes one audit row per changed field, all in one
-- transaction. A failed save changes nothing, as the Switches sheet promises.
create or replace function public.console_save_settings(
  p_environment text,
  p_version     integer,
  p_changes     jsonb,
  p_reason      text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member  console.members := console.require_role('admin');
  v_known   text[] := array[
    'checks_paused', 'checks_paused_message', 'primary_source', 'fallback_source',
    'new_accounts_open', 'traveller_passkey_enabled', 'site_notice_on', 'site_notice_text',
    'site_notice_version', 'checks_per_address', 'live_checks_per_day'
  ];
  v_key     text;
  v_current console.settings;
  v_new     console.settings;
  v_before  jsonb;
  v_after   jsonb;
begin
  if jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb then
    raise exception 'nothing to save' using errcode = '22023';
  end if;

  for v_key in select jsonb_object_keys(p_changes) loop
    if not (v_key = any (v_known)) then
      raise exception 'unknown setting %', v_key using errcode = '22023';
    end if;
  end loop;

  perform console.use_tap('settings.save', p_environment, p_changes::text, p_reason);

  select * into v_current from console.settings where environment = p_environment for update;
  if not found then
    raise exception 'unknown environment' using errcode = '22023';
  end if;
  if v_current.version <> p_version then
    raise exception 'stale version' using errcode = '40001';
  end if;

  update console.settings set
    checks_paused             = case when p_changes ? 'checks_paused' then (p_changes ->> 'checks_paused')::boolean else checks_paused end,
    checks_paused_message     = case when p_changes ? 'checks_paused_message' then p_changes ->> 'checks_paused_message' else checks_paused_message end,
    primary_source            = case when p_changes ? 'primary_source' then p_changes ->> 'primary_source' else primary_source end,
    fallback_source           = case when p_changes ? 'fallback_source' then p_changes ->> 'fallback_source' else fallback_source end,
    new_accounts_open         = case when p_changes ? 'new_accounts_open' then (p_changes ->> 'new_accounts_open')::boolean else new_accounts_open end,
    traveller_passkey_enabled = case when p_changes ? 'traveller_passkey_enabled' then (p_changes ->> 'traveller_passkey_enabled')::boolean else traveller_passkey_enabled end,
    site_notice_on            = case when p_changes ? 'site_notice_on' then (p_changes ->> 'site_notice_on')::boolean else site_notice_on end,
    site_notice_text          = case when p_changes ? 'site_notice_text' then p_changes ->> 'site_notice_text' else site_notice_text end,
    site_notice_version       = case when p_changes ? 'site_notice_version' then (p_changes ->> 'site_notice_version')::integer else site_notice_version end,
    checks_per_address        = case when p_changes ? 'checks_per_address' then (p_changes ->> 'checks_per_address')::integer else checks_per_address end,
    live_checks_per_day       = case when p_changes ? 'live_checks_per_day' then (p_changes ->> 'live_checks_per_day')::integer else live_checks_per_day end,
    version                   = version + 1,
    changed_at                = now(),
    changed_by                = v_member.user_id
  where environment = p_environment
  returning * into v_new;

  for v_key in select jsonb_object_keys(p_changes) loop
    v_before := to_jsonb(v_current) -> v_key;
    v_after  := to_jsonb(v_new) -> v_key;
    if v_before is distinct from v_after then
      perform console.write_audit(
        p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
        'settings', 'Setting changed', v_key, p_reason, 'done', null,
        jsonb_build_object(v_key, v_before), jsonb_build_object(v_key, v_after)
      );
    end if;
  end loop;

  return v_new.version;
end;
$$;

revoke all on function public.console_save_settings(text, integer, jsonb, text) from public, anon;
grant execute on function public.console_save_settings(text, integer, jsonb, text) to authenticated;
```

- [ ] **Step 4: Apply it and run the test**

```bash
npm run db:reset && npm run db:test
```

Expected: PASS, 9 of 9.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests
git commit -m "feat(console): runtime settings, read by the server and saved with a tap"
```

---

### Task 7: The service-role surface for sessions and challenges

**Files:**
- Create: `supabase/migrations/20260920090600_console_auth_sessions.sql`
- Create: `supabase/tests/console_auth_sessions.test.sql`

**Interfaces:**
- Consumes: `console.members`, `console.sessions`, `console.challenges`, `console.keys`.
- Produces, all granted to `service_role` only:
  - `public.console_auth_member_by_email(p_email text) returns jsonb` — `null` when the address is not a member; otherwise `{user_id, email, name, role, status, key_count}`.
  - `public.console_auth_start_session(p_session_id uuid, p_member uuid, p_device_label text, p_address_hash text) returns void` — a session that has not tapped a key yet, expiring in 24 hours.
  - `public.console_auth_verify_session(p_session_id uuid, p_key_id uuid) returns void` — marks it key-verified, moves the expiry to 7 days, stamps the key's `last_used_at`.
  - `public.console_auth_revoke_session(p_session_id uuid) returns void`.
  - `public.console_auth_revoke_member_sessions(p_member uuid, p_except uuid) returns integer` — returns how many it revoked.
  - `public.console_auth_new_challenge(p_member uuid, p_session uuid, p_purpose console.challenge_purpose, p_challenge text, p_digest bytea) returns uuid` — expires in five minutes.
  - `public.console_auth_take_challenge(p_challenge text, p_member uuid, p_purpose console.challenge_purpose) returns jsonb` — marks it used and returns it, or `null` when it is missing, used or expired.

- [ ] **Step 1: Write the failing test**

`supabase/tests/console_auth_sessions.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in');
insert into console.members (user_id, email, name, role, status)
values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in', 'Owner', 'owner', 'active');

select is(public.console_auth_member_by_email('nobody@trakline.in'), null, 'a stranger is not a member');
select is(
  public.console_auth_member_by_email('OWNER@trakline.in') ->> 'role',
  'owner',
  'the lookup is case-insensitive'
);
select is(
  (public.console_auth_member_by_email('owner@trakline.in') ->> 'key_count')::int,
  0,
  'a member with no keys yet reports none'
);

select public.console_auth_start_session(
  '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Chrome on macOS', 'hash'
);
select is(
  (select key_verified_at is null and expires_at < now() + interval '25 hours'
     from console.sessions where session_id = '22222222-2222-2222-2222-222222222222'),
  true,
  'a fresh session is unverified and lasts a day'
);

insert into console.keys (id, member_id, credential_id, public_key, counter, name, type)
values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '\x01'::bytea, '\x02'::bytea, 0, 'Blue key', 'security_key');

select public.console_auth_verify_session('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
select is(
  (select key_verified_at is not null and expires_at > now() + interval '6 days'
     from console.sessions where session_id = '22222222-2222-2222-2222-222222222222'),
  true,
  'a tapped session is verified and lasts a week'
);
select is(
  (select last_used_at is not null from console.keys where id = '33333333-3333-3333-3333-333333333333'),
  true,
  'the key records that it was used'
);

-- Challenges are single-use and expire.
select public.console_auth_new_challenge(
  '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'sign_in', 'sign-in-challenge-0001', null
);
select is(
  public.console_auth_take_challenge('sign-in-challenge-0001', '11111111-1111-1111-1111-111111111111', 'sign_in') ->> 'challenge',
  'sign-in-challenge-0001',
  'a fresh challenge is handed back once'
);
select is(
  public.console_auth_take_challenge('sign-in-challenge-0001', '11111111-1111-1111-1111-111111111111', 'sign_in'),
  null,
  'the same challenge cannot be taken twice'
);

-- Revoking one session leaves the rest, and revoking a member's clears them all.
select public.console_auth_start_session(
  '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'Safari on iPhone', 'hash2'
);
select public.console_auth_revoke_session('44444444-4444-4444-4444-444444444444');
select is(
  (select count(*)::int from console.sessions where revoked_at is null),
  1,
  'one revoked session leaves the other alone'
);
select is(
  public.console_auth_revoke_member_sessions('11111111-1111-1111-1111-111111111111', null),
  1,
  'revoking a member clears the sessions that were still live'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run db:test`
Expected: FAIL — `function public.console_auth_member_by_email(text) does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260920090600_console_auth_sessions.sql`:

```sql
-- What the Next.js server calls with the service role while a member signs in.
-- None of these decide anything a member's own session could: they are the
-- steps that happen before a key-verified session exists.

create or replace function public.console_auth_member_by_email(p_email text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', m.user_id,
    'email', m.email,
    'name', m.name,
    'role', m.role,
    'status', m.status,
    'key_count', (select count(*) from console.keys k where k.member_id = m.user_id)
  )
  from console.members m
  where m.email = lower(p_email) and m.status <> 'removed';
$$;

create or replace function public.console_auth_start_session(
  p_session_id   uuid,
  p_member       uuid,
  p_device_label text,
  p_address_hash text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into console.sessions (session_id, member_id, device_label, address_hash, expires_at)
  values (p_session_id, p_member, p_device_label, p_address_hash, now() + interval '24 hours')
  on conflict (session_id) do nothing;
$$;

create or replace function public.console_auth_verify_session(p_session_id uuid, p_key_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update console.sessions
     set key_verified_at = now(),
         key_id = p_key_id,
         expires_at = now() + interval '7 days',
         last_seen_at = now()
   where session_id = p_session_id and revoked_at is null;

  if not found then
    raise exception 'session ended' using errcode = '28000';
  end if;

  update console.keys set last_used_at = now() where id = p_key_id;
end;
$$;

create or replace function public.console_auth_revoke_session(p_session_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update console.sessions set revoked_at = now()
   where session_id = p_session_id and revoked_at is null;
$$;

create or replace function public.console_auth_revoke_member_sessions(p_member uuid, p_except uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update console.sessions set revoked_at = now()
   where member_id = p_member
     and revoked_at is null
     and (p_except is null or session_id <> p_except);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.console_auth_new_challenge(
  p_member    uuid,
  p_session   uuid,
  p_purpose   console.challenge_purpose,
  p_challenge text,
  p_digest    bytea
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into console.challenges (member_id, session_id, purpose, challenge, digest, expires_at)
  values (p_member, p_session, p_purpose, p_challenge, p_digest, now() + interval '5 minutes')
  returning id;
$$;

create or replace function public.console_auth_take_challenge(
  p_challenge text,
  p_member    uuid,
  p_purpose   console.challenge_purpose
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with taken as (
    update console.challenges
       set used_at = now()
     where challenge = p_challenge
       and member_id = p_member
       and purpose = p_purpose
       and used_at is null
       and expires_at > now()
    returning *
  )
  select to_jsonb(t) from taken t;
$$;

revoke all on function
  public.console_auth_member_by_email(text),
  public.console_auth_start_session(uuid, uuid, text, text),
  public.console_auth_verify_session(uuid, uuid),
  public.console_auth_revoke_session(uuid),
  public.console_auth_revoke_member_sessions(uuid, uuid),
  public.console_auth_new_challenge(uuid, uuid, console.challenge_purpose, text, bytea),
  public.console_auth_take_challenge(text, uuid, console.challenge_purpose)
from public, anon, authenticated;

grant execute on function
  public.console_auth_member_by_email(text),
  public.console_auth_start_session(uuid, uuid, text, text),
  public.console_auth_verify_session(uuid, uuid),
  public.console_auth_revoke_session(uuid),
  public.console_auth_revoke_member_sessions(uuid, uuid),
  public.console_auth_new_challenge(uuid, uuid, console.challenge_purpose, text, bytea),
  public.console_auth_take_challenge(text, uuid, console.challenge_purpose)
to service_role;
```

- [ ] **Step 4: Apply it and run the test**

```bash
npm run db:reset && npm run db:test
```

Expected: PASS, 10 of 10.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests
git commit -m "feat(console): the service-role functions for sessions and challenges"
```

---

### Task 8: The service-role surface for keys, invites and Security email

**Files:**
- Create: `supabase/migrations/20260920090700_console_auth_keys.sql`
- Create: `supabase/tests/console_auth_keys.test.sql`

**Interfaces:**
- Consumes: `console.keys`, `console.invites`, `console.members`, `console.write_audit`.
- Produces, all granted to `service_role` only:
  - `public.console_auth_keys_for_member(p_member uuid) returns jsonb` — the array the WebAuthn ceremony needs: `id`, `credential_id`, `public_key`, `counter`, `transports`.
  - `public.console_auth_record_key(p_member uuid, p_credential_id bytea, p_public_key bytea, p_counter bigint, p_transports text[], p_name text, p_type console.key_type) returns uuid` — a credential already registered raises `23505`, so the same key can never be added twice.
  - `public.console_auth_touch_key(p_key uuid, p_counter bigint) returns void` — the counter only ever moves forward.
  - `public.console_auth_accept_invite(p_token_hash bytea, p_user uuid, p_name text, p_environment text) returns jsonb` — makes the member row in `setup`, marks the invite accepted, returns the member; a used, revoked or expired invite returns `null`.
  - `public.console_auth_owner_addresses() returns text[]` — for Security email.
  - `public.console_auth_write_audit(p_environment text, p_actor uuid, p_actor_name text, p_actor_role console.member_role, p_key_id uuid, p_session_label text, p_category text, p_action text, p_target text, p_reason text, p_result console.audit_result, p_address_hash text, p_before jsonb, p_after jsonb) returns uuid` — how the server logs what happens outside a member function (a failed tap, a send that failed).

- [ ] **Step 1: Write the failing test**

`supabase/tests/console_auth_keys.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in'),
  ('99999999-9999-9999-9999-999999999999', 'new@trakline.in');
insert into console.members (user_id, email, name, role, status)
values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in', 'Owner', 'owner', 'active');

select is(public.console_auth_keys_for_member('11111111-1111-1111-1111-111111111111'), '[]'::jsonb, 'a member starts with no keys');

select public.console_auth_record_key(
  '11111111-1111-1111-1111-111111111111', '\x01'::bytea, '\x02'::bytea, 0, array['usb'], 'Blue key', 'security_key'
) as first_key;

select is(
  jsonb_array_length(public.console_auth_keys_for_member('11111111-1111-1111-1111-111111111111')),
  1,
  'the key is handed to the ceremony'
);
select throws_ok(
  $$select public.console_auth_record_key('11111111-1111-1111-1111-111111111111', '\x01'::bytea, '\x03'::bytea, 0, array['usb'], 'Same key', 'security_key')$$,
  '23505',
  null,
  'the same key cannot be added twice'
);

select public.console_auth_touch_key(
  (select id from console.keys limit 1), 7
);
select is((select counter from console.keys limit 1)::int, 7, 'the counter moves forward');
select public.console_auth_touch_key((select id from console.keys limit 1), 3);
select is((select counter from console.keys limit 1)::int, 7, 'the counter never moves back');

-- Invites become members only once, and only while they are live.
insert into console.invites (email, role, invited_by, token_hash, expires_at)
values ('new@trakline.in', 'support', '11111111-1111-1111-1111-111111111111', '\xaa'::bytea, now() + interval '7 days');

select is(
  public.console_auth_accept_invite('\xaa'::bytea, '99999999-9999-9999-9999-999999999999', 'Asha', 'development') ->> 'role',
  'support',
  'accepting an invite makes the member with the invited role'
);
select is(
  (select status from console.members where user_id = '99999999-9999-9999-9999-999999999999')::text,
  'setup',
  'a new member starts in setup, before two keys'
);
select is(
  public.console_auth_accept_invite('\xaa'::bytea, '99999999-9999-9999-9999-999999999999', 'Asha', 'development'),
  null,
  'an invite cannot be accepted twice'
);

select is(
  public.console_auth_owner_addresses(),
  array['owner@trakline.in'],
  'Security email goes to the Owners'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run db:test`
Expected: FAIL — `function public.console_auth_keys_for_member(uuid) does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260920090700_console_auth_keys.sql`:

```sql
-- Keys, invites and the Owner list, for the server to call with the service role.

create or replace function public.console_auth_keys_for_member(p_member uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'id', k.id,
      'credential_id', encode(k.credential_id, 'base64'),
      'public_key', encode(k.public_key, 'base64'),
      'counter', k.counter,
      'transports', k.transports
    ) order by k.created_at),
    '[]'::jsonb
  )
  from console.keys k
  where k.member_id = p_member;
$$;

create or replace function public.console_auth_record_key(
  p_member        uuid,
  p_credential_id bytea,
  p_public_key    bytea,
  p_counter       bigint,
  p_transports    text[],
  p_name          text,
  p_type          console.key_type
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into console.keys (member_id, credential_id, public_key, counter, transports, name, type)
  values (p_member, p_credential_id, p_public_key, p_counter, coalesce(p_transports, '{}'), p_name, p_type)
  returning id;
$$;

-- A key's counter is the authenticator's own clock: it only ever goes up.
create or replace function public.console_auth_touch_key(p_key uuid, p_counter bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update console.keys
     set counter = greatest(counter, p_counter),
         last_used_at = now()
   where id = p_key;
$$;

create or replace function public.console_auth_accept_invite(p_token_hash bytea, p_user uuid, p_name text, p_environment text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite console.invites;
  v_member console.members;
begin
  update console.invites
     set accepted_at = now()
   where token_hash = p_token_hash
     and accepted_at is null
     and revoked_at is null
     and expires_at > now()
  returning * into v_invite;

  if not found then
    return null;
  end if;

  insert into console.members (user_id, email, name, role, status, invited_by)
  values (p_user, v_invite.email, p_name, v_invite.role, 'setup', v_invite.invited_by)
  on conflict (user_id) do update set role = excluded.role, status = 'setup'
  returning * into v_member;

  perform console.write_audit(
    p_environment, p_user, p_name, v_invite.role, null, null,
    'team', 'Invite accepted', v_invite.email, null, 'done', null, null,
    jsonb_build_object('role', v_invite.role)
  );

  return to_jsonb(v_member);
end;
$$;

create or replace function public.console_auth_owner_addresses()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.email order by m.email), '{}')
  from console.members m
  where m.role = 'owner' and m.status = 'active';
$$;

create or replace function public.console_auth_write_audit(
  p_environment   text,
  p_actor         uuid,
  p_actor_name    text,
  p_actor_role    console.member_role,
  p_key_id        uuid,
  p_session_label text,
  p_category      text,
  p_action        text,
  p_target        text,
  p_reason        text,
  p_result        console.audit_result,
  p_address_hash  text,
  p_before        jsonb,
  p_after         jsonb
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select console.write_audit(
    p_environment, p_actor, p_actor_name, p_actor_role, p_key_id, p_session_label,
    p_category, p_action, p_target, p_reason, p_result, p_address_hash, p_before, p_after
  );
$$;

revoke all on function
  public.console_auth_keys_for_member(uuid),
  public.console_auth_record_key(uuid, bytea, bytea, bigint, text[], text, console.key_type),
  public.console_auth_touch_key(uuid, bigint),
  public.console_auth_accept_invite(bytea, uuid, text, text),
  public.console_auth_owner_addresses(),
  public.console_auth_write_audit(text, uuid, text, console.member_role, uuid, text, text, text, text, text, console.audit_result, text, jsonb, jsonb)
from public, anon, authenticated;

grant execute on function
  public.console_auth_keys_for_member(uuid),
  public.console_auth_record_key(uuid, bytea, bytea, bigint, text[], text, console.key_type),
  public.console_auth_touch_key(uuid, bigint),
  public.console_auth_accept_invite(bytea, uuid, text, text),
  public.console_auth_owner_addresses(),
  public.console_auth_write_audit(text, uuid, text, console.member_role, uuid, text, text, text, text, text, console.audit_result, text, jsonb, jsonb)
to service_role;
```

- [ ] **Step 4: Apply it and run the test**

```bash
npm run db:reset && npm run db:test
```

Expected: PASS, 9 of 9.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests
git commit -m "feat(console): the service-role functions for keys, invites and Owner addresses"
```

---

### Task 9: The first Owner's one-time link

**Files:**
- Create: `supabase/migrations/20260920090800_console_first_owner.sql`
- Create: `supabase/tests/console_first_owner.test.sql`

**Interfaces:**
- Consumes: `console.setup_links`, `console.members`, `console.write_audit`.
- Produces:
  - `console.create_first_owner_link(p_email text, p_base_url text default 'https://admin.trakline.in') returns text` — the statement the owner runs in the Supabase SQL editor. It works only while the console has no Owner, stores only the token's hash, and returns the full one-time link, good for 24 hours.
  - `public.console_auth_redeem_setup_link(p_token_hash bytea, p_user uuid, p_email text, p_name text, p_environment text) returns jsonb` — service role; makes the first Owner in `setup`, marks the link used, writes its audit row; returns `null` when the link is missing, used, expired, for another address, or when an Owner already exists.

- [ ] **Step 1: Write the failing test**

`supabase/tests/console_first_owner.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'first@trakline.in');

select matches(
  console.create_first_owner_link('first@trakline.in'),
  '^https://admin\.trakline\.in/setup\?token=[0-9a-f]{64}$',
  'the statement hands back a one-time link'
);
select is((select count(*)::int from console.setup_links), 1, 'the link is stored');
select is(
  (select token_hash is not null and expires_at > now() + interval '23 hours' from console.setup_links limit 1),
  true,
  'only the hash is kept, and it lasts a day'
);

-- Redeem it: the first Owner appears, in setup until two keys exist.
select is(
  public.console_auth_redeem_setup_link(
    (select token_hash from console.setup_links limit 1),
    '11111111-1111-1111-1111-111111111111', 'first@trakline.in', 'First Owner', 'development'
  ) ->> 'role',
  'owner',
  'redeeming the link makes the first Owner'
);
select is(
  (select status from console.members where user_id = '11111111-1111-1111-1111-111111111111')::text,
  'setup',
  'the first Owner starts in setup'
);

-- It is one-time, and once an Owner exists no further link can be made.
select is(
  public.console_auth_redeem_setup_link(
    (select token_hash from console.setup_links limit 1),
    '11111111-1111-1111-1111-111111111111', 'first@trakline.in', 'First Owner', 'development'
  ),
  null,
  'the link cannot be redeemed twice'
);
select throws_ok(
  $$select console.create_first_owner_link('second@trakline.in')$$,
  'P0001',
  null,
  'no second first-Owner link once the console has an Owner'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run db:test`
Expected: FAIL — `function console.create_first_owner_link(unknown) does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260920090800_console_first_owner.sql`:

```sql
-- The one statement the owner runs in the Supabase SQL editor to start the
-- console, and the redemption the server performs when the link is opened.

create or replace function console.create_first_owner_link(
  p_email    text,
  p_base_url text default 'https://admin.trakline.in'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if exists (select 1 from console.members where role = 'owner' and status <> 'removed') then
    raise exception 'the console already has an Owner';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into console.setup_links (email, token_hash, expires_at)
  values (lower(p_email), extensions.digest(v_token, 'sha256'), now() + interval '24 hours');

  return p_base_url || '/setup?token=' || v_token;
end;
$$;

revoke all on function console.create_first_owner_link(text, text) from public, anon, authenticated;

create or replace function public.console_auth_redeem_setup_link(
  p_token_hash  bytea,
  p_user        uuid,
  p_email       text,
  p_name        text,
  p_environment text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link   console.setup_links;
  v_member console.members;
begin
  if exists (select 1 from console.members where role = 'owner' and status = 'active') then
    return null;
  end if;

  update console.setup_links
     set used_at = now()
   where token_hash = p_token_hash
     and used_at is null
     and expires_at > now()
     and email = lower(p_email)
  returning * into v_link;

  if not found then
    return null;
  end if;

  insert into console.members (user_id, email, name, role, status)
  values (p_user, v_link.email, p_name, 'owner', 'setup')
  returning * into v_member;

  perform console.write_audit(
    p_environment, p_user, p_name, 'owner', null, null,
    'team', 'First Owner created', v_link.email, null, 'done', null, null,
    jsonb_build_object('role', 'owner')
  );

  return to_jsonb(v_member);
end;
$$;

revoke all on function public.console_auth_redeem_setup_link(bytea, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.console_auth_redeem_setup_link(bytea, uuid, text, text, text) to service_role;
```

- [ ] **Step 4: Apply it and run the test**

```bash
npm run db:reset && npm run db:test
```

Expected: PASS, 7 of 7, and every earlier file still green.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests
git commit -m "feat(console): the first Owner's one-time setup link"
```

---

### Task 10: Types, docs, then the PR

**Files:**
- Modify: `src/types/supabase.ts` (regenerated)
- Modify: `docs/architecture.md`
- Modify: `docs/onboarding.md`

**Interfaces:**
- Consumes: every migration above.
- Produces: the generated types plan 2c calls these functions through.

- [ ] **Step 1: Regenerate the types**

```bash
npm run db:reset && npm run db:types
```

Check `git diff src/types/supabase.ts`: the `Functions` block should now carry every `console_*` function this plan added. The `console` schema's tables must NOT appear — the generator was pointed at `public` only, which is the point.

- [ ] **Step 2: Add the architecture line**

In `docs/architecture.md`, in the "## Layers" code block, under `Supabase`, directly after the `auth.users + public.watchlist_entries` line:

```
  console schema (supabase/migrations/2026092009*.sql) — the console's own tables, reached only through security-definer public.console_* functions; the audit log is append-only and console.purge_audit() drops rows past two years
```

- [ ] **Step 3: Add the onboarding lines**

In `docs/onboarding.md`, in the "## Console, locally" section, after the existing paragraph:

```markdown
The console's tables live in the private `console` schema. `npm run db:reset` applies its migrations to the local stack, and `npm run db:test` runs the pgTAP tests (CI runs the same). Nothing reads those tables directly: every caller goes through a `public.console_*` function.
```

- [ ] **Step 4: Run the full local checks**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run build && npm run db:test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/types/supabase.ts docs
git commit -m "docs: the console schema in the architecture and onboarding notes"
```

- [ ] **Step 6: The PR**

The controller opens it after the final whole-branch review. Body: what the schema holds, that nothing reaches it except through `public.console_*`, how the audit log stays append-only, what CI now runs, and the test plan. It ends with "🤖 Generated with [Claude Code](https://claude.com/claude-code)". Wait for `verify` and `e2e`, then ask the owner before merging.
