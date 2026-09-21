# Phase 2d-1 — The signed-in frame, the tap dialog, and My keys: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in member sees the drawn console frame, opens My keys, and can add, rename and remove a security key — where removing one takes a tap of another key, bound to that exact action.

**Architecture:** The frame is a server component that runs `requireConsoleMember()` once and hands the member down; the rail filters by role *and* by which modules exist, so no link leads nowhere. The per-action tap (Form TC-01) is the mechanism every risky action in this console will use: the browser asks for options naming the action, its target, the new value and the reason; the server stores a digest of exactly those four with the challenge and verifies the tap **without spending it**; the member's own database function then recomputes the digest from its own arguments and spends the tap in the same transaction as the change and its audit row. My keys is that mechanism's first real caller.

**Tech Stack:** Next.js 16.3.4 (App Router), TypeScript strict, Supabase (`@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.116.0), `@simplewebauthn/server` 14.0.2 and `@simplewebauthn/browser` 14.0.0, zod 4, Vitest, Playwright 1.62 with Chromium's virtual authenticator, pgTAP via `supabase test db`.

**Spec:** `docs/superpowers/specs/2026-09-19-phase-2-admin-core-design.md` — §A the frame and its route tree, §B where console code lives, §C sessions and the guard, §D keys and per-action taps, §E the member-function contract and the audit log.

**Design sheets (binding):** `docs/design/sheets/console/Main.dc.html` (the frame and Form TC-01), `ConsoleMyKeys.dc.html`, `ShellPhone.dc.html`. Transcribe 1:1.

**What came before:** `docs/superpowers/plans/2026-09-20-phase-2c-sign-in-and-keys.md` shipped as PR #24 (`ea72fba`). A member can already sign in with a link and a key tap; `/` currently shows a deliberate placeholder that this plan replaces.

## Global Constraints

- **TDD.** The failing test lands first and is **run to see it fail** before any implementation.
- TypeScript strict. Never `any` — `unknown` plus narrowing, or a real type.
- Path aliases (`@/console/...`, `@/services/...`, `@/components/...`), never deep relative imports.
- Every file stays under 500 lines.
- Conventional commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`) with **no `Co-Authored-By` trailer** — the project's CLAUDE.md overrides the Bash tool's default template. Verify with `git log -1 --format=%B`.
- Never read `.env*` other than `.env.example`. Never `git stash`. Never touch the main checkout from a worktree.
- **Console code may name providers; traveller code never imports `@/console/*`** — enforced by `tests/unit/console/boundary.contract.test.ts`.
- Migrations are forward-only. Every function is `security definer` with `set search_path = ''`, every identifier inside is schema-qualified, and grants `revoke all … from public, anon, authenticated, service_role` then grant to exactly one role.
- **Enum-typed parameters on `public.console_*` functions must be declared `text`.** PostgREST casts an enum argument in the *caller's* context, before `security definer` privilege applies, so an enum parameter fails with "permission denied for schema console". See `supabase/migrations/20260921000000_console_enum_args_as_text.sql`.
- pgTAP tests hold **constraints, not names**. Always the four-argument `throws_ok`.
- **Member functions check the caller themselves** (spec §E): `console.current_member()` or `console.require_role()` first, then the change and its audit row in one transaction, and `console.use_tap()` for anything risky.
- **Screens are transcribed 1:1** from the sheets — no rewording, no rearranging, no invention.
- Reasons are 10–200 characters and are scrubbed of PNR-like digit runs, emails and IP addresses — in the server and again in SQL.
- Never put a PNR in a URL or a log; never name a data provider on a traveller surface.

## What this plan does not build

- **Team, and the Audit log** — those are 2d-2, which reuses this plan's tap dialog unchanged.
- **The paused and site-notice strips** drawn across the top of every frame sheet. They are read *and written* from runtime settings, and their "Resume" button is a settings write that belongs with Switches in 2e. Rendering them read-only here would ship a drawn button that does nothing. An unpaused console with no notice draws neither strip, which is exactly what this frame shows.
- **Overview's content** (module 01) — 2f. The frame's main region renders the page it wraps; `/` redirects to `/keys` until Overview exists (Task 5).
- **The eleven modules that do not exist yet.** The rail is drawn with all fourteen; it renders only those built, filtered by role. See Ruling in Task 4.

## Three test traps this codebase has already hit

Every task's tests are subject to these, whether or not its own code block shows the workaround.

1. **Stubbing `VERCEL_ENV=production` alone silently gives you a *non*-production environment.** `env()`'s `superRefine` refuses a deployed environment without the shared store, and outside `NODE_ENV=production` a failed parse falls back to defaults — dropping `VERCEL_ENV`. Stub the store too, as `tests/unit/proxy.test.ts:58-66` does.
2. **A `vi.mock` factory is hoisted above the `const`s it closes over.** Declare such mocks with `vi.hoisted(() => …)` — `tests/unit/console/auth/sign-in-link.test.ts` shows the form.
3. **A mock whose call arguments a test reads must be typed.** A bare `vi.fn(() => …)` infers a zero-argument signature, so `.mock.calls[0]?.[1]` is an index into a zero-length tuple: vitest runs it, `tsc --noEmit` refuses it (TS2493). Use `vi.fn<Signature>()`, as `tests/unit/console/auth/db.test.ts:5` does.

And one rule that produced six findings in the last plan: **a mock missing a method the code calls will throw, an outer `catch` will swallow it, and the test will pass anyway.** Give every mock each method its code path calls, and ask of each assertion: *would this fail if the behaviour it names were deleted?*

## Two notes on how to build these screens

**Reuse the primitives; do not build new ones.** `src/components/ui/` already has `data-table`, `stacked-table`, `dialog`, `confirm-dialog`, `menu`, `sheet`, `badge`, `led`, `plate`, `field`, `button`, `icon-button`, `key-value-list`, `error-state`, `empty-state`, `sweep-bar`, `toast`. Spec §B says these are reused with the variants the drawings need. If a drawing needs a variant that does not exist, add the variant to the primitive — do not fork it into `src/console/`.

**Follow the console components that already work.** `src/app/console/keys/key-step.tsx` and `src/app/console/setup/setup-flow.tsx` are this console's established shape for a client component that runs a ceremony: a discriminated `Stage` union, `useState`, no `let`, `useSyncExternalStore` for WebAuthn availability, a `SweepBar` immediately before `PlateHeader` while busy, and focus returned on a genuine busy→idle transition.

## File structure

**Database** (`supabase/`)

| File | Responsibility |
|---|---|
| `migrations/20260921100000_console_my_keys.sql` | `console_my_keys`, `console_rename_key`, `console_remove_key`, `console_my_sessions`, `console_sign_out_others` |
| `tests/console_my_keys.test.sql` | pgTAP for all five, including the two-key rule and the tap binding |

**Console services** (`src/console/`)

| File | Responsibility |
|---|---|
| `nav.ts` | The drawn rail: fourteen modules, their groups, which roles see each, and which are built |
| `keys/tap.ts` | The per-action tap: request options, verify without spending |
| `keys/tap-client.ts` | The browser half of a tap, and its outcome type |
| `account/my-keys.ts` | Reading and changing this member's own keys and sessions |
| `messages/en-IN/frame-signed-in.ts` | The frame's copy, from `Main.dc.html` |
| `messages/en-IN/tap.ts` | Form TC-01's copy |
| `messages/en-IN/my-keys.ts` | My keys' copy, from `ConsoleMyKeys.dc.html` |
| `components/console-frame.tsx` | The signed-in frame: masthead, member menu, rail, main |
| `components/console-rail.tsx` | The rail itself, role- and build-filtered |
| `components/member-menu.tsx` | Initials, role, My keys, Sign out |
| `components/confirm-its-you.tsx` | Form TC-01 as a reusable dialog |

**Console routes and pages** (`src/app/console/`)

| File | Responsibility |
|---|---|
| `api/tap/options/route.ts` | Mint an `action` challenge bound to a digest |
| `api/tap/verify/route.ts` | Verify a tap without spending it |
| `api/keys/mine/route.ts` | List, rename and remove this member's keys |
| `api/sessions/route.ts` | List this member's sessions; sign the others out |
| `keys/page.tsx` *(replace)* | My keys, inside the frame |
| `page.tsx` *(replace)* | Redirects to `/keys` until Overview exists |
| `error.tsx` | The frame's "This page didn't load" state |
| `[...missing]/page.tsx` *(modify)* | A signed-in member gets the not-found state, not a redirect |

---

### Task 1: The member's own keys and sessions, in the database

**Files:**
- Create: `supabase/migrations/20260921100000_console_my_keys.sql`
- Test: `supabase/tests/console_my_keys.test.sql`
- Modify: `src/types/supabase.ts` (regenerated by `npm run db:types`, never hand-edited)

**Interfaces:**
- Consumes: `console.current_member()`, `console.use_tap()`, `console.write_audit()`, `console.keys`, `console.sessions` — all shipped.
- Produces, all granted to `authenticated` alone:
  - `public.console_my_keys() → jsonb` — `{keys: [{id, name, type, created_at, last_used_at}], member: {name, email, role, created_at}}`, this member's only, oldest key first.
  - `public.console_rename_key(p_key uuid, p_name text, p_environment text) → void` — renames one of this member's own keys. No tap: a name is not a security boundary. Writes an audit row.
  - `public.console_remove_key(p_key uuid, p_reason text, p_environment text) → integer` — spends a tap, refuses to leave fewer than two keys, returns the remaining count, writes one audit row.
  - `public.console_my_sessions() → jsonb` — `[{session_id, device_label, last_seen_at, created_at, is_current}]` for this member, newest first.
  - `public.console_sign_out_others(p_environment text) → integer` — revokes this member's other sessions, returns how many, writes an audit row. No tap: it only ever reduces this member's own access.

**Why the three writers take `p_environment`.** The audit log is per environment and a member function has no caller inside the database to tell it which one it is in. `console.settings` cannot answer: it seeds one row per environment (`production`, `preview`, `development`), so there is nothing to read. Every function that writes an audit row already takes the environment from its caller — `console_auth_write_audit` does, and so does `console_save_settings`, which is itself a member function with a tap. Follow that. The server passes `consoleEnvironment()` (`src/console/auth/session.ts`), which is `VERCEL_ENV ?? NODE_ENV`.

**Why `console_remove_key` takes a tap and the others do not.** Spec §D: a key can't be removed if that would leave fewer than two, and every risky action needs its own tap bound to that action. Removing a key weakens the account, so it is risky; renaming one and signing your own other sessions out do not, and adding a tap where the spec does not ask for one would be inventing a requirement.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/console_my_keys.test.sql`. Model it on `supabase/tests/console_guard.test.sql`, which is this suite's example of a test that sets `request.jwt.claims` to act as a member. Read that file first — the claims-setting idiom is the part that is easy to get wrong.

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- Grants: every one of these is the member's own call, so `authenticated` alone.
select is(has_function_privilege('authenticated', 'public.console_my_keys()', 'execute')::text, 'true', 'a member can list their own keys');
select is(has_function_privilege('anon', 'public.console_my_keys()', 'execute')::text, 'false', 'anon cannot');
select is(has_function_privilege('service_role', 'public.console_my_keys()', 'execute')::text, 'false', 'the service role has no business listing a member''s keys');
select is(has_function_privilege('authenticated', 'public.console_rename_key(uuid, text, text)', 'execute')::text, 'true', 'a member can rename their own key');
select is(has_function_privilege('service_role', 'public.console_rename_key(uuid, text, text)', 'execute')::text, 'false', 'the service role cannot rename a key');
select is(has_function_privilege('authenticated', 'public.console_remove_key(uuid, text, text)', 'execute')::text, 'true', 'a member can remove their own key');
select is(has_function_privilege('service_role', 'public.console_remove_key(uuid, text, text)', 'execute')::text, 'false', 'the service role cannot remove a key');
select is(has_function_privilege('authenticated', 'public.console_my_sessions()', 'execute')::text, 'true', 'a member can list their own sessions');
select is(has_function_privilege('authenticated', 'public.console_sign_out_others(text)', 'execute')::text, 'true', 'a member can sign their other sessions out');
select is(has_function_privilege('anon', 'public.console_sign_out_others(text)', 'execute')::text, 'false', 'anon cannot');

-- A member with a key-verified session and three keys.
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'asha@trakline.in');
insert into console.members (user_id, email, name, role, status)
values ('11111111-1111-1111-1111-111111111111', 'asha@trakline.in', 'Asha Rao', 'owner', 'active');
insert into console.keys (id, member_id, credential_id, public_key, counter, name, type)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '\x01'::bytea, '\x0a'::bytea, 0, 'YubiKey 5C', 'security_key'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '\x02'::bytea, '\x0b'::bytea, 0, 'YubiKey 5 NFC', 'security_key'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '\x03'::bytea, '\x0c'::bytea, 0, 'MacBook Pro', 'passkey');
insert into console.sessions (session_id, member_id, key_id, key_verified_at, device_label, address_hash, expires_at)
values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', now(), 'Chrome on macOS', 'hash', now() + interval '7 days'),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', now(), 'Safari on iPhone', 'hash', now() + interval '7 days');

-- Act as that member, in that session.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","session_id":"22222222-2222-2222-2222-222222222222"}';

select is(jsonb_array_length(public.console_my_keys() -> 'keys'), 3, 'all three keys come back');
select is(public.console_my_keys() -> 'keys' -> 0 ->> 'name', 'YubiKey 5C', 'oldest first');
select is(public.console_my_keys() -> 'member' ->> 'name', 'Asha Rao', 'the profile comes with them');
select is(public.console_my_keys() -> 'keys' -> 0 ->> 'type', 'security_key', 'the type is reported');
select ok(public.console_my_keys() -> 'keys' -> 0 ? 'created_at', 'and when it was added');
select ok(not (public.console_my_keys() -> 'keys' -> 0 ? 'credential_id'), 'but never the credential itself');
select ok(not (public.console_my_keys() -> 'keys' -> 0 ? 'public_key'), 'and never the public key');

select is(jsonb_array_length(public.console_my_sessions()), 2, 'both sessions come back');
select is(
  (select count(*)::int from jsonb_array_elements(public.console_my_sessions()) s where (s ->> 'is_current')::boolean),
  1,
  'exactly one is marked as this device'
);
select is(
  (select s ->> 'device_label' from jsonb_array_elements(public.console_my_sessions()) s where (s ->> 'is_current')::boolean),
  'Chrome on macOS',
  'and it is the session the claims name'
);

-- Renaming needs no tap, but it does need the key to be yours.
select public.console_rename_key('aaaaaaaa-0000-0000-0000-000000000003', 'MacBook Air', 'development');
select is(
  (select name from console.keys where id = 'aaaaaaaa-0000-0000-0000-000000000003'),
  'MacBook Air',
  'a rename lands'
);
select is(
  (select count(*)::int from console.audit_log where action = 'Renamed a key'),
  1,
  'and is written to the audit log'
);
select throws_ok(
  $$ select public.console_rename_key('99999999-9999-9999-9999-999999999999', 'Not mine', 'development') $$,
  '42501',
  null,
  'a key that is not yours cannot be renamed'
);

-- Removal without a tap is refused, whatever else is true.
select throws_ok(
  $$ select public.console_remove_key('aaaaaaaa-0000-0000-0000-000000000003', 'Left at the old office; replaced.', 'development') $$,
  '42501',
  null,
  'removing a key with no tap is refused'
);
select is((select count(*)::int from console.keys where member_id = '11111111-1111-1111-1111-111111111111'), 3, 'and removes nothing');

-- A tap bound to this exact removal.
select public.console_auth_new_challenge(
  '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
  'action', 'remove-key-challenge-value',
  console.action_digest('Removed a key', 'MacBook Air', '2', 'Left at the old office; replaced.')
);
select public.console_remove_key('aaaaaaaa-0000-0000-0000-000000000003', 'Left at the old office; replaced.', 'development');
select is((select count(*)::int from console.keys where member_id = '11111111-1111-1111-1111-111111111111'), 2, 'the key is gone');
select is(
  (select count(*)::int from console.audit_log where action = 'Removed a key' and target = 'MacBook Air'),
  1,
  'and the removal is in the audit log'
);
select is(
  (select used_at is not null from console.challenges where challenge = 'remove-key-challenge-value'),
  true,
  'the tap is spent'
);

-- The two-key rule bites even with a valid tap.
select public.console_auth_new_challenge(
  '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
  'action', 'remove-second-key-challenge',
  console.action_digest('Removed a key', 'YubiKey 5 NFC', '1', 'Down to two, trying anyway.')
);
select throws_ok(
  $$ select public.console_remove_key('aaaaaaaa-0000-0000-0000-000000000002', 'Down to two, trying anyway.', 'development') $$,
  '42501',
  null,
  'removing a key that would leave fewer than two is refused'
);
select is((select count(*)::int from console.keys where member_id = '11111111-1111-1111-1111-111111111111'), 2, 'and both remain');

-- Signing the others out leaves this one alone.
select is(public.console_sign_out_others('development'), 1, 'one other session was signed out');
select is(
  (select revoked_at is null from console.sessions where session_id = '22222222-2222-2222-2222-222222222222'),
  true,
  'this device stays signed in'
);
select is(
  (select revoked_at is not null from console.sessions where session_id = '33333333-3333-3333-3333-333333333333'),
  true,
  'the other one does not'
);
select is(
  (select count(*)::int from console.audit_log where action = 'Signed out other sessions'),
  1,
  'and it is in the audit log'
);
select is(public.console_sign_out_others('development'), 0, 'a second call finds nothing left to revoke');

-- Every one of these refuses outright without a live key-verified session.
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select throws_ok($$ select public.console_my_keys() $$, '28000', null, 'no session id, no keys');
select throws_ok($$ select public.console_my_sessions() $$, '28000', null, 'no session id, no sessions');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run db:test`
Expected: FAIL — `function public.console_my_keys() does not exist`.

Report the **total** assertion count from the runner's own output, not a hand count.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260921100000_console_my_keys.sql`:

```sql
-- What a member may do to their own keys and sessions. Every one of these
-- checks the caller itself through console.current_member() (spec §E), so
-- none of them takes a member id: the only account any of them can touch is
-- the caller's own.

create or replace function public.console_my_keys()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member console.members := console.current_member();
begin
  return jsonb_build_object(
    -- The credential id and public key are deliberately absent: the screen
    -- shows a name, a type and two dates, and a credential is not ours to
    -- hand back to a browser that did not just produce it.
    'keys', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id,
        'name', k.name,
        'type', k.type,
        'created_at', k.created_at,
        'last_used_at', k.last_used_at
      ) order by k.created_at)
      from console.keys k where k.member_id = v_member.user_id
    ), '[]'::jsonb),
    'member', jsonb_build_object(
      'name', v_member.name,
      'email', v_member.email,
      'role', v_member.role,
      'created_at', v_member.created_at
    )
  );
end;
$$;

-- A name is a label, not a security boundary, so this takes no tap -- but it
-- still only ever reaches a key the caller owns, and it is still logged.
create or replace function public.console_rename_key(p_key uuid, p_name text, p_environment text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member console.members := console.current_member();
  v_old    text;
begin
  select k.name into v_old
    from console.keys k
   where k.id = p_key and k.member_id = v_member.user_id;

  if not found then
    raise exception 'no access' using errcode = '42501';
  end if;

  update console.keys set name = p_name where id = p_key;

  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role,
    null, null, 'session', 'Renamed a key', p_name, null, 'done', null,
    jsonb_build_object('name', v_old), jsonb_build_object('name', p_name)
  );
end;
$$;

-- Spec §D: "A key can't be removed if that would leave fewer than two." The
-- count is read here rather than trusted from the caller, and the tap is spent
-- in the same transaction as the delete and its audit row -- so a refused
-- removal leaves the tap unspent and the key in place.
create or replace function public.console_remove_key(p_key uuid, p_reason text, p_environment text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member    console.members := console.current_member();
  v_name      text;
  v_remaining integer;
begin
  select k.name into v_name
    from console.keys k
   where k.id = p_key and k.member_id = v_member.user_id;

  if not found then
    raise exception 'no access' using errcode = '42501';
  end if;

  select count(*) - 1 into v_remaining
    from console.keys k where k.member_id = v_member.user_id;

  if v_remaining < 2 then
    raise exception 'a member must keep at least two keys' using errcode = '42501';
  end if;

  -- The digest binds the tap to this key, this remaining count and this
  -- reason. A tap taken for a different key, or before the count changed,
  -- recomputes to a different digest and is not found.
  perform console.use_tap('Removed a key', v_name, v_remaining::text, p_reason);

  delete from console.keys where id = p_key;

  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role,
    null, null, 'session', 'Removed a key', v_name, p_reason, 'done', null,
    jsonb_build_object('keys', v_remaining + 1), jsonb_build_object('keys', v_remaining)
  );

  return v_remaining;
end;
$$;

create or replace function public.console_my_sessions()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member  console.members := console.current_member();
  v_current uuid := console.claim_uuid('session_id');
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'session_id', s.session_id,
      'device_label', s.device_label,
      'last_seen_at', s.last_seen_at,
      'created_at', s.created_at,
      'is_current', s.session_id = v_current
    ) order by s.created_at desc)
    from console.sessions s
    where s.member_id = v_member.user_id
      and s.revoked_at is null
      and s.expires_at > now()
  ), '[]'::jsonb);
end;
$$;

-- No tap: this only ever reduces the caller's own access, and the drawn
-- screen confirms it with a dialog rather than a key.
create or replace function public.console_sign_out_others(p_environment text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member  console.members := console.current_member();
  v_current uuid := console.claim_uuid('session_id');
  v_count   integer;
begin
  update console.sessions
     set revoked_at = now()
   where member_id = v_member.user_id
     and session_id <> v_current
     and revoked_at is null;
  get diagnostics v_count = row_count;

  if v_count > 0 then
    perform console.write_audit(
      p_environment, v_member.user_id, v_member.name, v_member.role,
      null, null, 'session', 'Signed out other sessions', 'Console', null, 'done', null,
      null, jsonb_build_object('sessions', v_count)
    );
  end if;

  return v_count;
end;
$$;

revoke all on function
  public.console_my_keys(),
  public.console_rename_key(uuid, text, text),
  public.console_remove_key(uuid, text, text),
  public.console_my_sessions(),
  public.console_sign_out_others(text)
from public, anon, authenticated, service_role;

grant execute on function
  public.console_my_keys(),
  public.console_rename_key(uuid, text, text),
  public.console_remove_key(uuid, text, text),
  public.console_my_sessions(),
  public.console_sign_out_others(text)
to authenticated;
```

> **On `p_environment`, which every audit-writing function here takes.** An earlier draft of this plan proposed a `console.environment_name()` helper that read the environment out of `console.settings`. That is wrong and was removed before execution: `20260920090500_console_settings.sql:22` seeds **three** rows — one each for `production`, `preview` and `development` — so there is no single row to read and any such helper would return whichever the `order by` happened to pick. The established pattern is the caller passing it, which is what `console_auth_write_audit` and `console_save_settings` both do. Do not reintroduce a helper.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run db:reset && npm run db:test`
Expected: PASS. Report the runner's own total.

- [ ] **Step 5: Regenerate the database types**

Run: `npm run db:types`, then `npm run typecheck`.

Expected: `src/types/supabase.ts` gains `console_my_keys`, `console_rename_key`, `console_remove_key`, `console_my_sessions` and `console_sign_out_others`. Confirm by grepping for those five. Never hand-edit this file.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations supabase/tests/console_my_keys.test.sql src/types/supabase.ts
git commit -m "feat(console): what a member may do to their own keys and sessions"
```

---

### Task 2: The per-action tap, on the server

**Files:**
- Create: `supabase/migrations/20260921100100_console_action_challenge.sql`
- Create: `src/console/keys/tap.ts`
- Create: `src/app/console/api/tap/options/route.ts`
- Create: `src/app/console/api/tap/verify/route.ts`
- Test: `supabase/tests/console_action_challenge.test.sql`, `tests/unit/console/keys/tap.test.ts`, `tests/integration/console/tap.test.ts`
- Modify: `src/types/supabase.ts` (regenerated)

**Interfaces:**
- Consumes: `requireConsoleMember` (`@/console/auth/guard`), `createConsoleDb` / `createConsoleServiceDb` (`@/console/auth/db`), `relyingParty`, `authenticationOptionsFor`, `verifyAuthentication`, `StoredKey` (`@/console/keys/webauthn`), `base64ToBase64url` (`@/console/keys/encoding`), `console_auth_read_challenge`, `console_auth_keys_for_member`, `console_auth_touch_key`, `console.action_digest`.
- Produces:
  - `public.console_auth_new_action_challenge(p_member uuid, p_session uuid, p_challenge text, p_action text, p_target text, p_value text, p_reason text) → uuid`, granted to `service_role`.
  - `interface TapRequest { readonly action: string; readonly target: string; readonly value: string; readonly reason: string }`
  - `beginTap(args: { req: Request; tap: TapRequest }): Promise<{ options: unknown }>`
  - `verifyTap(args: { req: Request; response: AuthenticationResponseJSON }): Promise<void>` — verifies and touches the key, and **leaves the challenge unspent**.
  - `POST /api/tap/options` → `{ ok: true, options }`; `POST /api/tap/verify` → `{ ok: true }`.

**Two rulings this task rests on. Read them before writing code.**

**1. TypeScript never computes the digest.** `console.action_digest` hashes each of the four fields separately and then hashes the concatenation. Reimplementing that in TypeScript would mean two implementations that must agree forever, and a silent drift would make every tap fail with "no tap for this action". So the new migration takes the four fields and computes the digest **inside the database**, using the same function `console.use_tap` will use to recompute it. The server passes text; it never passes a digest.

**2. The server does not scrub the reason; SQL does.** Spec §E says reasons are scrubbed "in the server (`scrubText`) and again in SQL". Scrubbing in both places creates exactly the drift risk ruling 1 removes: the digest would be taken over one string and `use_tap` would recompute over another, and every tap would fail. `console.write_audit` already scrubs unconditionally at the moment of storage, so the raw reason never reaches a table. The digest, `use_tap` and the audit row therefore all see the same string, and only the stored copy is scrubbed. **Do not add a TypeScript scrubber.**

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/console_action_challenge.test.sql`, modelled on `supabase/tests/console_auth_sessions.test.sql`'s grant-assertion shape. Assert, with `plan(9)`:

- `service_role` can execute `public.console_auth_new_action_challenge(uuid, uuid, text, text, text, text, text)`; `authenticated` and `anon` cannot.
- After minting a challenge for action `'Removed a key'`, target `'YubiKey 5 NFC'`, value `'2'`, reason `'Left at the old office.'`, the stored row's `digest` equals `console.action_digest('Removed a key', 'YubiKey 5 NFC', '2', 'Left at the old office.')` — this is the assertion that pins ruling 1.
- The row's `purpose` is `'action'`, its `expires_at` is within five minutes of `created_at`, and its `used_at` is null.
- A digest taken over a *different* reason does **not** equal the stored one, so the binding is real rather than incidental.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run db:test` — FAIL, the function does not exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260921100100_console_action_challenge.sql`:

```sql
-- Minting the challenge a per-action tap is bound to (spec §D, step 2).
--
-- The four fields go in as text and the digest is computed here, by the very
-- function console.use_tap() will use to recompute it. That is the point: a
-- digest computed in the server would be a second implementation of
-- console.action_digest's per-field hashing, and the day the two drifted,
-- every tap in the console would fail with "no tap for this action" and
-- nothing would say why.
create or replace function public.console_auth_new_action_challenge(
  p_member    uuid,
  p_session   uuid,
  p_challenge text,
  p_action    text,
  p_target    text,
  p_value     text,
  p_reason    text
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into console.challenges (member_id, session_id, purpose, challenge, digest, expires_at)
  values (
    p_member, p_session, 'action', p_challenge,
    console.action_digest(p_action, p_target, p_value, p_reason),
    now() + interval '5 minutes'
  )
  returning id;
$$;

-- Supabase's default privileges auto-grant EXECUTE on a new public-schema
-- function to anon, authenticated and service_role alike, so service_role is
-- named in the revoke too, even though it is the role granted back below.
revoke all on function public.console_auth_new_action_challenge(uuid, uuid, text, text, text, text, text)
from public, anon, authenticated, service_role;

grant execute on function public.console_auth_new_action_challenge(uuid, uuid, text, text, text, text, text)
to service_role;
```

- [ ] **Step 4: Run the test, then regenerate the types**

Run: `npm run db:reset && npm run db:test` — PASS. Then `npm run db:types` and `npm run typecheck`.

- [ ] **Step 5: Write the failing TypeScript tests**

Create `tests/unit/console/keys/tap.test.ts`. Model its mocks on `tests/unit/console/keys/ceremony.test.ts`, which is this codebase's example of testing a module that talks to both Supabase clients and the WebAuthn boundary — including the `vi.hoisted` partial mock of `@/console/keys/webauthn` it uses so one ceremony can succeed. Cover:

- `beginTap` mints through `console_auth_new_action_challenge` with all four fields passed through **verbatim** (assert the exact arguments), and returns the options the WebAuthn boundary produced.
- `beginTap` offers only this member's own keys, converted from the database's base64 to base64url.
- `verifyTap` reads the challenge with `console_auth_read_challenge` and **never** calls `console_auth_take_challenge` — assert the absence. This is the assertion that keeps the tap spendable by the database.
- `verifyTap` refuses a challenge the read does not find (expired, spent, wrong purpose) with a 400 carrying `consoleMessages.keys.didNotAnswer`.
- `verifyTap` refuses a credential this member does not hold with `consoleMessages.keys.notYours`.
- `verifyTap` touches the key with the **verified** new counter, not one the caller supplied.

Create `tests/integration/console/tap.test.ts` for the two routes, modelled on `tests/integration/console/keys.test.ts`: both refuse a cross-site post; `/options` refuses a reason shorter than 10 or longer than 200 characters; `/verify` answers `{ok:true}` on success.

- [ ] **Step 6: Run them to verify they fail**

Run: `npx vitest run tests/unit/console/keys/tap.test.ts tests/integration/console/tap.test.ts` — FAIL, `Cannot find module '@/console/keys/tap'`.

- [ ] **Step 7: Write `src/console/keys/tap.ts`**

It mirrors `src/console/keys/ceremony.ts`'s shape — that file is the reference for how a ceremony reaches the database here. The differences that matter:

- It gates on `requireConsoleMember()`, not `requireLinkSession()`: a tap is only ever asked for by a member who is already fully signed in.
- `beginTap` calls `console_auth_new_action_challenge` with the four fields, never a digest.
- `verifyTap` calls `console_auth_read_challenge`, checks the returned row's `session_id` against this session (`take_challenge`'s sibling does not match on session, and neither does the read), verifies the assertion against the stored key, calls `console_auth_touch_key`, and **returns without spending anything**.
- A failure writes a `Key tap failed` audit row through `writeConsoleAudit`, exactly as `completeSignIn` does — spec §5 lists "or isn't registered" as logged too, so an unrecognised credential logs as well as a failed signature.

- [ ] **Step 8: Write the two routes**

Both follow `src/app/console/api/keys/options/route.ts`'s shape: `assertConsoleAvailable()`, `assertSameOrigin(req)`, `readBody` with a zod schema, then the call, answered through `jsonOk` / `jsonError`.

`/api/tap/options` body:

```ts
const body = z
  .object({
    action: z.string().min(1).max(80),
    target: z.string().min(1).max(200),
    value: z.string().max(200),
    // Spec §E: 10-200 characters. The sheet's own line is
    // "Add a reason of at least 10 characters."
    reason: z.string().trim().min(10, consoleMessages.tap.reasonShort).max(200),
  })
  .strict();
```

`/api/tap/verify` takes `{ response }`, validated the same way `keys/verify` validates a ceremony response.

- [ ] **Step 9: Run everything, then commit**

Run: `npm run test:unit`, `npm run db:test`, `npm run typecheck`, `npm run lint`.

```bash
git add supabase/migrations supabase/tests/console_action_challenge.test.sql src/types/supabase.ts src/console/keys/tap.ts src/app/console/api/tap tests
git commit -m "feat(console): the per-action tap, bound to its action by the database"
```

---

### Task 3: Form TC-01, the "Confirm it's you" dialog

**Files:**
- Create: `src/console/keys/tap-client.ts`
- Create: `src/console/components/confirm-its-you.tsx`
- Create: `src/console/messages/en-IN/tap.ts`
- Modify: `src/console/messages/index.ts` (add `tap`; do not rewrite what is there)
- Test: `tests/unit/console/keys/tap-client.test.ts`, `tests/unit/console/components/confirm-its-you.test.tsx`

**Interfaces:**
- Consumes: `apiRequest` (`@/services/api-client`), `startAuthentication` (`@simplewebauthn/browser`), `keysUsable` and the dismissal handling already in `src/console/keys/client.ts`.
- Produces:
  - `runTap(tap: TapRequest): Promise<TapOutcome>` where `TapOutcome` is `{kind:"done"} | {kind:"cancelled"} | {kind:"failed"; message: string}`.
  - `<ConfirmItsYou open action target value reason onReasonChange onCancel onConfirmed />` — the drawn dialog, which runs the tap and calls `onConfirmed()` only once `/api/tap/verify` has answered.

**Copy, word for word from `Main.dc.html`** (do not reword):

| Key | Text |
|---|---|
| `title` | `Confirm it's you` |
| `form` | `Form TC-01` |
| `changeLabel` | `Change` |
| `reasonLabel` | `Reason` |
| `reasonHint` | `Don't include PNRs, emails or IP addresses; they're removed. 10–200 characters.` |
| `reasonShort` | `Add a reason of at least 10 characters.` |
| `cancel` | `Cancel` |
| `tap` | `Tap your key` |
| `waiting` | `Waiting for your key…` |
| `status` | `Touch your security key or approve on your device` |
| `didNotAnswer` | `That key didn't answer. Try again.` |
| `notYours` | `This key isn't one of yours.` |

The last two already exist in `consoleMessages.keys` — reference them rather than re-declaring, and say so in a comment. The sheet's own `statusText` map confirms all three states.

- [ ] **Step 1: Write the failing tests**

`tap-client.test.ts` mirrors `tests/unit/console/keys/client.test.ts` — the same `vi.hoisted` mock of `@simplewebauthn/browser`, the same `apiRequest` handling. Cover: a successful tap posts the four fields to `/api/tap/options` and the ceremony response to `/api/tap/verify`; a dismissed prompt returns `cancelled` and shows nothing; a server refusal passes its own message through; a `SOURCE_UNAVAILABLE` or `INTERNAL` result shows `consoleMessages.session.unavailable`, not raw text. That last pair is the rule established in the previous plan and it applies here unchanged.

`confirm-its-you.test.tsx` (jsdom) mirrors `tests/unit/console/setup/setup-flow.test.tsx`. Cover the sheet's drawn states: the dialog shows the action summary and the before→after line; typing fewer than 10 characters and confirming shows `reasonShort` and does **not** start a ceremony; a successful tap calls `onConfirmed` exactly once; a failed tap shows `didNotAnswer` and leaves the dialog open; Cancel calls `onCancel` and starts nothing.

- [ ] **Step 2: Run them to verify they fail**, then write the module and the component, then run them again.

`ConfirmItsYou` wraps `src/components/ui/dialog.tsx` — read it first and use its props rather than building a dialog. The busy affordance and focus handling follow `key-step.tsx`, as the notes at the top of this plan say.

- [ ] **Step 3: Commit**

```bash
git add src/console/keys/tap-client.ts src/console/components/confirm-its-you.tsx src/console/messages tests
git commit -m "feat(console): Confirm it's you, the dialog every risky action opens"
```

---

### Task 4: The frame — masthead, member menu, and the rail

**Files:**
- Create: `src/console/nav.ts`
- Create: `src/console/components/console-frame.tsx`
- Create: `src/console/components/console-rail.tsx`
- Create: `src/console/components/member-menu.tsx`
- Create: `src/console/messages/en-IN/frame-signed-in.ts`
- Modify: `src/console/messages/index.ts`
- Test: `tests/unit/console/nav.test.ts`, `tests/unit/console/components/console-rail.test.tsx`, `tests/unit/console/components/member-menu.test.tsx`

**Interfaces:**
- Consumes: `requireConsoleMember` and `ConsoleMember` (`@/console/auth/guard`, `@/console/auth/member`), `ConsoleMasthead` and `EnvStrip` (already in `src/console/components/`), `consoleHref`.
- Produces:
  - `CONSOLE_MODULES: readonly ConsoleModule[]` — `{num, label, group, roles, href, built}`.
  - `railFor(role: ConsoleRole): readonly ConsoleNavGroup[]` — the groups a role sees, each with only built modules, empty groups dropped.
  - `<ConsoleFrame member>{children}</ConsoleFrame>` — the drawn signed-in frame.

**The rail's fourteen modules, exactly as `Main.dc.html` draws them:**

| # | Label | Group | Owner | Admin | Support | Viewer | Built in 2d-1 |
|---|---|---|---|---|---|---|---|
| 01 | Overview | Operate | ✓ | ✓ | ✓ | ✓ | no (2f) |
| 02 | Sources & usage | Operate | ✓ | ✓ | | ✓ | no |
| 03 | Status & incidents | Operate | ✓ | ✓ | | ✓ | no |
| 04 | Abuse & limits | Operate | ✓ | ✓ | | | no |
| 05 | Alerts | Operate | ✓ | ✓ | | | no |
| 06 | Leads | People | ✓ | ✓ | ✓ | | no |
| 07 | Announcements | People | ✓ | ✓ | | | no |
| 08 | Accounts | People | ✓ | ✓ | | | no |
| 09 | Privacy requests | Queues | ✓ | ✓ | ✓ | | no |
| 10 | Wrong-status reports | Queues | ✓ | ✓ | ✓ | | no |
| 11 | Switches & settings | Configure | ✓ | ✓ | | | no (2e) |
| 12 | Provider keys | Configure | ✓ | | | | no |
| 13 | Team | Configure | ✓ | ✓ | | | no (2d-2) |
| 14 | Audit log | Record | ✓ | ✓ | | | no (2d-2) |

Those role columns are `access` in the sheet's `renderVals()`; check them against it rather than trusting this table alone.

**Ruling — the rail renders only what exists.** Every module above is drawn, and none is built in this plan. A rail of fourteen links that all lead nowhere is worse than a short one, and the alternative — rendering them inert — would invent a disabled state no sheet draws. So `railFor` filters by role **and** by `built`, and a module flips to `built: true` in the same PR that adds its page. In 2d-1 that leaves My keys, which the sheet places in the member menu rather than the rail, so **the rail renders empty and `ConsoleFrame` omits it entirely** until 2d-2 adds Team and the Audit log. Record this in the file's own comment so the next PR knows to flip two flags rather than rebuild anything.

**Copy from `Main.dc.html`:** `Trakline` / `Console` in the masthead (already in `consoleMessages.frame`), the group legends `Operate`, `People`, `Queues`, `Configure`, `Record`, the member menu's `My keys` and `Sign out`, and the footer's build line. The role tag reuses `consoleMessages.frame.roleLabel`, which already exists.

- [ ] **Step 1: Write the failing tests.** `nav.test.ts` asserts each role's visible set against the table above, that a group with no visible modules is dropped, and that an unbuilt module never appears. The rail and menu component tests (jsdom) assert the drawn structure and that the menu's two items are a link to `/keys` and a Sign out button.

- [ ] **Step 2–4: Run them failing, write the three components and `nav.ts`, run them passing.**

`ConsoleFrame` is a **server** component: it takes the member as a prop rather than calling the guard itself, so a page can call `requireConsoleMember()` once and pass the result down. `MemberMenu` is a client component wrapping `src/components/ui/menu.tsx`; its Sign out button reuses the handler already written in `src/app/console/signed-in.tsx` — copy that logic into `member-menu.tsx`, including its `SOURCE_UNAVAILABLE`/`INTERNAL` message mapping and its tests' shape. **Leave `signed-in.tsx` in place**; Task 5 deletes it once nothing renders it, so the two tasks cannot leave the tree unbuildable between them.

- [ ] **Step 5: Commit**

```bash
git add src/console/nav.ts src/console/components src/console/messages tests
git commit -m "feat(console): the signed-in frame, its rail and its member menu"
```

---

### Task 5: The frame's own states, and where `/` goes

**Files:**
- Create: `src/app/console/error.tsx`
- Modify: `src/app/console/page.tsx` (replace the placeholder), `src/app/console/[...missing]/page.tsx`
- Delete: `src/app/console/signed-in.tsx` and `tests/unit/console/signed-in.test.tsx` (replaced by Task 4's member menu)
- Test: `tests/unit/console/components/frame-states.test.tsx`, `tests/integration/console/home.test.ts`

**The three states `Main.dc.html` draws, word for word:**

| State | Heading | Body | Action |
|---|---|---|---|
| No access | `This module isn't part of the Support role.` | `Ask an Owner if you need it.` | `Back to Overview` |
| Error | `This page didn't load` | `The console couldn't reach its data.` + `Reference 7f3a2c` | `Retry` |
| Session ended | `Your session ended` | `Sign in again to keep working.` | `Sign in` |

The no-access heading names the member's own role — the sheet draws it for Support. Build the string from `consoleMessages.frame.roleLabel[member.role]` rather than hardcoding "Support".

**Ruling — `Back to Overview` goes to `/` while Overview does not exist, and `/` redirects to `/keys`.** The drawn button's label is Overview's, and renaming it would break transcription; sending it to `/` keeps one destination that is correct now and stays correct when 2f makes `/` Overview. Note it in a comment so 2f knows the redirect is the thing to remove.

**The reference code** in the error state is drawn as `7f3a2c`. Generate a short random hex per render and show that — a fixed literal would be a lie the first time someone quotes it. Next's `error.tsx` receives an `error` with an optional `digest`; prefer that when present, since it is what the server logs, and fall back to a generated one.

- [ ] **Step 1–4:** tests first (the three states render their drawn copy; `/` redirects to `/keys`; the catch-all renders not-found for a signed-in member and still redirects a signed-out one to `/login`), then implement, then green.

- [ ] **Step 5: Commit**

```bash
git add src/app/console tests
git commit -m "feat(console): the frame's no-access, error and session-ended states"
```

---

### Task 6: My keys — the keys table and the profile

**Files:**
- Create: `src/console/account/my-keys.ts`, `src/app/console/api/keys/mine/route.ts`, `src/console/messages/en-IN/my-keys.ts`
- Modify: `src/app/console/keys/page.tsx` (this is currently the sign-in key step — see the ruling below), `src/console/messages/index.ts`
- Test: `tests/unit/console/account/my-keys.test.ts`, `tests/integration/console/my-keys.test.ts`, `tests/unit/console/account/keys-plate.test.tsx`

**Ruling — the sign-in key step moves out of `/keys`.** `/keys` is drawn as My keys, and `src/app/console/keys/page.tsx` currently holds the sign-in tap step from the previous plan. Move that page to `src/app/console/sign-in-key/page.tsx` (with its `key-step.tsx`), and update the one place that sends members there: `nextAfterConfirm` in `src/console/auth/session.ts` returns `"/keys"` today and must return `"/sign-in-key"`. Its unit test pins that string — update both. The console end-to-end specs also navigate there; grep `tests/e2e/console-auth/` for `/keys` and update. Getting this wrong strands every member mid-sign-in, so run the console e2e before committing.

**Copy from `ConsoleMyKeys.dc.html`:** the page kicker `Your account`, title `My keys`, lead `The keys you sign in with, and where you're signed in.`; the Keys plate's column headings `Name`, `Type`, `Added`, `Last used`, `Actions`; the two legends `Only keys added here or during setup work for the console.` and `Adding a key starts with a tap of a key you already have.`; the two-key line `You need at least two keys. Add another before removing one.`; the Profile plate's `Name` / `Email` / `Role` / `Member since`; and the `If you lose your keys` note in full. The type column reads `Security key` or `Passkey` — reuse `consoleMessages` rather than mapping in the component.

- [ ] **Step 1–4:** tests first, then `my-keys.ts` (a thin typed wrapper over `console_my_keys`, **parsed with zod, never cast** — the previous plan had three reviews flag exactly that), the `GET` route, and the page rendering inside `ConsoleFrame`. The table uses `src/components/ui/data-table.tsx` on desktop and `stacked-table` on phones, both of which exist.

- [ ] **Step 5: Commit**

---

### Task 7: My keys — adding and renaming a key

**Files:** modify `src/app/console/keys/page.tsx` and its client, `src/app/console/api/keys/mine/route.ts` (add `PATCH`); tests alongside.

**Interfaces:** consumes `addKey` from `@/console/keys/client` — **already built and tested** in the previous plan, including the tap-then-register two-step. This task wires the drawn "Add a key" dialog to it and adds rename.

**Copy from the sheet:** the dialog's `Add a key`, `Name this key`, and its two progress lines `1 · Tap one of your keys: waiting…` and `2 · Then touch the new key`; `Cancel`; `Waiting for your key…`. Rename reuses `Name this key`.

Rename posts to `PATCH /api/keys/mine` with `{keyId, name}` and calls `console_rename_key`. No tap — see Task 1's reasoning.

- [ ] **Step 1: Write the failing tests** — the Add dialog's two progress lines appear in order during a ceremony; a successful add refreshes the table; a cancelled one shows nothing; rename sends `{keyId, name}` and the new name renders. Model the component test on `tests/unit/console/setup/setup-flow.test.tsx` and the route test on `tests/integration/console/keys.test.ts`.
- [ ] **Step 2: Run them to verify they fail.**
- [ ] **Step 3: Wire the Add dialog to `addKey`** — it already does tap-then-register; this task adds no ceremony logic of its own.
- [ ] **Step 4: Add `PATCH /api/keys/mine`** and the rename control, validating the name as `console.keys` does (1–60 characters).
- [ ] **Step 5: Run the tests, `npm run typecheck`, `npm run lint`, `npm run build`.**
- [ ] **Step 6: Commit** — `feat(console): adding and renaming a key from My keys`

---

### Task 8: My keys — removing a key, the tap's first real caller

**Files:** modify the My keys client and `src/app/console/api/keys/mine/route.ts` (add `DELETE`); tests alongside.

This is the task the whole tap mechanism exists for, and the one to be most careful in. The order is fixed by spec §D:

1. The member presses Remove. The client opens `<ConfirmItsYou>` with `action: "Removed a key"`, `target: <the key's name>`, `value: <the remaining count>`, and the reason the member types.
2. `runTap` mints the challenge and verifies the tap — **the challenge stays unspent**.
3. Only then does the client call `DELETE /api/keys/mine`, which calls `console_remove_key`, which recomputes the digest from its own arguments and spends the tap in the same transaction as the delete and the audit row.

**The four fields must match on both sides exactly.** `value` is the remaining count as a decimal string — `console_remove_key` computes it as `(count - 1)::text`. If the client and the database disagree by one, the digest differs and the tap is refused with "no tap for this action", which reads to a member as a broken key. Assert this agreement in an integration test rather than trusting it.

**The drawn copy** for the dialog's summary is `Remove YubiKey 5 NFC` with a change line `Keys: 3 → 2`, and the two-key refusal is the sheet's `You need at least two keys. Add another before removing one.`

- [ ] **Step 1: Write the failing integration test first, and make it the one that pins the digest agreement** — that the `value` the client sends to `/api/tap/options` is the same decimal string `console_remove_key` computes as the remaining count. Drive it through both endpoints against fakes so a one-off disagreement fails here rather than as "no tap for this action" in a browser.
- [ ] **Step 2: Write the failing component tests** — Remove opens `ConfirmItsYou` with the key's name as the target; a reason under 10 characters is refused without starting a ceremony; a completed tap calls `DELETE`; a refusal leaves the key in the table.
- [ ] **Step 3: Run them to verify they fail.**
- [ ] **Step 4: Add `DELETE /api/keys/mine`**, calling `console_remove_key` with the reason exactly as received — not scrubbed, per Task 2's ruling 2.
- [ ] **Step 5: Wire the Remove control** to `ConfirmItsYou` and then the delete, in that order.
- [ ] **Step 6: Run the tests, plus `npm run db:test`** — the pgTAP two-key and tap-binding assertions from Task 1 must still pass.
- [ ] **Step 7: Commit** — `feat(console): removing a key takes a tap bound to that removal`

---

### Task 9: My keys — sessions, and signing the others out

**Files:** `src/app/console/api/sessions/route.ts`, the Sessions plate in the My keys client, tests alongside.

**Copy from the sheet:** the plate legend `Sessions`; each row as `<device label> · signed in <time>` with `This device` on the current one; the button `Sign out other sessions`; and the confirm dialog's `Sign out other sessions?` / `Safari on iPhone is signed out at once. This device stays signed in.` / `Cancel` / `Sign out others`. The dialog's body names the other session; build it from the list rather than hardcoding Safari.

Use `src/components/ui/confirm-dialog.tsx` — this one takes **no tap** (Task 1's reasoning), so `ConfirmItsYou` is the wrong component here.

- [ ] **Step 1: Write the failing tests** — the current session is marked `This device` and the others are not; the confirm dialog names an actual other session rather than a hardcoded one; confirming calls the route and refreshes the list; cancelling calls nothing.
- [ ] **Step 2: Run them to verify they fail.**
- [ ] **Step 3: Add `GET` and `DELETE /api/sessions`**, calling `console_my_sessions` and `console_sign_out_others`, parsing both payloads with zod rather than casting.
- [ ] **Step 4: Render the Sessions plate** and wire the confirm dialog.
- [ ] **Step 5: Run the tests, `npm run typecheck`, `npm run lint`.**
- [ ] **Step 6: Commit** — `feat(console): the sessions plate, and signing the others out`

---

### Task 10: The frame on a phone

**Files:** the responsive half of `console-frame.tsx` and `console-rail.tsx`, driven by `docs/design/sheets/console/ShellPhone.dc.html`; tests at 390px.

The phone frame replaces the rail with a bottom sheet (`src/components/ui/sheet.tsx`). Transcribe the sheet's own structure. The existing console e2e already scans at 390px (`tests/e2e/console/scans.spec.ts`) — extend it to the signed-in frame rather than writing a new scan.

- [ ] **Step 1: Write the failing tests** — at 390px the rail is not rendered and the bottom-sheet trigger is; opening it lists the same modules `railFor` gives; the frame has no horizontal overflow at 390px.
- [ ] **Step 2: Run them to verify they fail.**
- [ ] **Step 3: Implement the responsive frame**, reusing `railFor` so the two layouts can never disagree about what a role sees.
- [ ] **Step 4: Extend the existing 390px scan** in `tests/e2e/console/scans.spec.ts` to the signed-in frame, and run `npm run test:e2e`.
- [ ] **Step 5: Commit** — `feat(console): the frame on a phone`

---

### Task 11: End to end, and the docs

**Files:** `tests/e2e/console-auth/my-keys.spec.ts`, `.github/workflows/ci.yml` if a step is needed, `docs/architecture.md`, `docs/runbooks/console-keys.md`.

Extend the existing console end-to-end project — do not add a third Playwright config. `tests/e2e/console-auth/fixtures.ts` already sets up a first Owner with two virtual keys and knows how to reset the console between specs; build on it.

Cover, through the real browser against the real database:

- A member opens My keys and sees both keys, their types and the profile.
- Adding a third key through the drawn dialog, with the tap-then-register two-step.
- Renaming a key, and the new name surviving a reload.
- Removing the third key: the dialog appears, a reason under 10 characters is refused in place, a valid one plus a tap removes it, and the audit row is there.
- Removing down to one key is refused with the sheet's own line.
- Signing out other sessions from a second context, leaving this one signed in.

**A note on the second context**, because the previous plan's end-to-end work lost hours to exactly this: Chromium's virtual authenticator is attached per page target over CDP, and a swap between two ceremonies must happen at the **JavaScript call boundary**, not on a network round trip. `fixtures.ts` already has `swapAuthenticatorAfterTap`; reuse it rather than re-deriving it.

Update `docs/architecture.md` with the frame's shape and where the tap lives, and add a line to `docs/runbooks/console-keys.md` about what a member sees when they are down to two keys.

- [ ] **Step 1: Write the specs** and run them to see them fail against the real app — for end-to-end work "fail" means failing for the right reason, so show that in the report.
- [ ] **Step 2: Make them pass.** If something will not settle, report it rather than adding waits until it goes green — a flaky spec that passes is worse than one that honestly fails.
- [ ] **Step 3: Run both suites** — `npm run test:e2e:console` and `npm run test:e2e` — and put both outputs in the report.
- [ ] **Step 4: Capture four screenshots** at 1280×800 into the session scratchpad (not the repo): the frame with the rail, My keys with three keys, `ConfirmItsYou` mid-removal, and the phone frame with its sheet open. The controller sends these to the owner — these screens have been asserted against but never seen.
- [ ] **Step 5: Update the docs.**
- [ ] **Step 6: Commit** — `test(console): My keys end to end, with a real tap`

---

## Self-review notes

Run before the final whole-branch review:

1. `npm run check` — typecheck, lint, unit and integration, build.
2. `npm run db:test` — green on both a clean database and one an end-to-end run has used.
3. `npm run test:e2e` and `npm run test:e2e:console` — both green.
4. `grep -rn "@/console/" src --include=*.ts --include=*.tsx | grep -v "^src/console/\|^src/app/console/\|^src/proxy.ts\|^src/app/global-not-found.tsx"` — empty.
5. `git log --format=%b main..HEAD | grep -ci "co-authored-by"` — zero.
6. Every new file under 500 lines.
7. Every string on a drawn screen traced back to its sheet.
