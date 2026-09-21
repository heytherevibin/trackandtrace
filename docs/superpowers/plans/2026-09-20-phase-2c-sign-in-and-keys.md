# Phase 2c — Sign-in, setup and security keys: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A console member signs in with an email link and a security-key tap, and a first Owner sets themselves up with two keys — end to end, proved by a Playwright run against a local Supabase with a virtual authenticator.

**Architecture:** The console keeps its own Supabase cookie (`sb-console-auth-token`) on its own host, so a traveller session never becomes a console one. `POST /api/sign-in` answers identically for every address and, for a member only, mints a link through `auth.admin.generateLink` and sends it through Resend inside `after()`, so the answer's *timing* gives nothing away either. `GET /auth/confirm` verifies the token server-side, reads the JWT's `session_id` claim, and opens a console session row keyed by it — the same id `console.current_member()` reads back out of the claims. Nothing is usable until a security key signs a server-made challenge: WebAuthn lives behind one module that wraps `@simplewebauthn/server`, and every challenge is minted, stored and spent in the database.

**Tech Stack:** Next.js 16.3.4 (App Router, `src/proxy.ts`), TypeScript strict, Supabase (`@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.116.0), `@simplewebauthn/server` 14.0.2 and `@simplewebauthn/browser` 14.0.0, Resend's HTTP API over `fetch`, zod 4, Vitest, Playwright 1.62 with Chromium's CDP virtual authenticator, pgTAP via `supabase test db`.

**Spec:** `docs/superpowers/specs/2026-09-19-phase-2-admin-core-design.md` — §C identity, sign-in and sessions; §D security keys; §I email; §4 configuration; §5 failure behaviour; §6 tests.

**Plan 2b (merged, `89cc122`)** built the database this plan calls: `docs/superpowers/plans/2026-09-20-phase-2b-database.md`. Read the migrations under `supabase/migrations/2026092009*.sql` for the exact function bodies — this plan quotes their signatures but the migrations are the authority.

## Global Constraints

- **TDD.** The failing test lands first and is **run to see it fail** before any implementation.
- TypeScript strict. Never `any` — `unknown` plus narrowing, or a real type.
- Path aliases (`@/console/...`, `@/services/...`), never deep relative imports.
- Every file stays under 500 lines.
- Conventional commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`) with **no `Co-Authored-By` trailer** — the project's CLAUDE.md overrides the Bash tool's default template. Verify with `git log -1 --format=%B`.
- Never read `.env*` other than `.env.example`. Never `git stash` (the stash stack is shared across worktrees). Never touch the main checkout.
- **Console code may name providers; traveller code never imports `@/console/*`** — enforced by `tests/unit/console/boundary.contract.test.ts`.
- Migrations are forward-only. Every function is `security definer` with `set search_path = ''`, and every identifier inside is schema-qualified.
- Grants: `revoke all … from public, anon, authenticated, service_role`, then exactly one `grant execute`. `service_role` must be in the revoke list even when it is the grantee — Supabase's default privileges grant it EXECUTE on every new public-schema function.
- pgTAP tests hold **constraints, not names**. Always the four-argument `throws_ok` — the three-argument form matches the error message text exactly and is brittle.
- **Libraries:** `@simplewebauthn/server` and `@simplewebauthn/browser`, version 14. Attestation `none`. Resident keys are discouraged. User verification is preferred (a touch is enough).
- **Scope:** the RP ID is the console host (`admin.trakline.in`; `admin.localhost` locally), and the origin is checked exactly.
- **Challenges:** made on the server, single-use, expiring after 5 minutes. Each is bound to its member, session and purpose.
- **Sends** are limited to 5 per 10 minutes per address and 20 per 10 minutes per connection, answering `Too many sign-in requests. Try again in 10 minutes.` past the limit.
- `POST /api/sign-in` **gives one answer for every address**, equal in content *and in time*.
- Console email goes through Resend's API from `console@trakline.in`, as plain text.
- Under `E2E=1` (outside production) emails go to an in-memory outbox that the e2e tests read. **The environment check refuses `E2E=1` in production.**
- A session ends after 24 hours unused, or 7 days after its key tap.
- Email never contains a PNR or a traveller's email address.
- Never name a data provider on traveller surfaces; never put a PNR in a URL or a log.

## What this plan does not build

Named here so no task invents them, and so the reviewer does not ask for them:

- **Invite acceptance.** `public.console_auth_accept_invite` exists (2b) but nothing can create an invite until Team lands in 2d, so `/setup` handles the **first-Owner link only**. The Setup sheet's Invite states stay undrawn in code.
- **Per-action taps (Form TC-01).** The dialog belongs to the signed-in shell (2d) and its first real caller is Switches (2e). This plan adds only the non-consuming challenge reader the flow needs (`public.console_auth_read_challenge`, Task 1), so 2e cannot be built on the consuming one by mistake.
- **Security alert emails.** Spec §7 puts them in PR 7 with Overview. This plan sends the sign-in link only, and writes `Key tap failed` to the audit log without counting toward an email.
- **Blocking a member's address on trakline.in.** Traveller sign-in calls Supabase directly from the browser (`src/services/auth-client.ts`), so refusing a member there needs a `before_user_created` auth hook — which spec §9 already schedules for PR 6. A member who signs in on trakline.in gets an ordinary traveller session and no console access, because the console cookie, host and session row are all separate.
- **The signed-in frame, My keys, Team, Audit log, Overview.** 2d and 2f. Task 11 leaves a deliberately plain signed-in seat that 2d replaces whole.

## Decisions this plan settles (read before Task 1)

1. **The console session id is the JWT's `session_id` claim**, not a server-minted uuid. `console.current_member()` reads `request.jwt.claims ->> 'session_id'`, so any other id would never match. 2b's note about minting ids from a CSPRNG was mistaken and is corrected here: `console_auth_start_session`'s `on conflict (session_id) do nothing` is *right*, because a collision means the same Supabase session confirming twice, and the first row (with its key verification) must win.
2. **We build the link ourselves from `hashed_token`.** `generateLink` also returns `action_link`, which points at Supabase's `/auth/v1/verify` and comes back with tokens in the URL *fragment* — unreadable by a server route. So the sign-in route sends `https://<console host>/auth/confirm?token_hash=<hashed_token>&type=magiclink`, and the confirm route calls `verifyOtp({ type: "magiclink", token_hash })`, the same shape the traveller callback already uses.
3. **`requireUserVerification: false` on both verify calls.** Both `verifyRegistrationResponse` and `verifyAuthenticationResponse` default it to `true`; the spec asks for `userVerification: "preferred"`, so leaving the default would reject a plain touch on a key with no PIN.
4. **base64url at every WebAuthn boundary.** `console_auth_keys_for_member` returns standard base64 (`encode(..., 'base64')`); `@simplewebauthn` speaks base64url. One module converts, and nothing else touches the encodings.
5. **A fourth challenge purpose, `add_key_tap`.** Spec §D: "Every later key starts with a tap of an existing key." Without a separate purpose, a client could take the *assertion* challenge issued for that tap and spend it on `navigator.credentials.create()`, registering a key with no tap at all. The tap's challenge and the registration's challenge must therefore be distinguishable in the database.
6. **Every console RPC is a POST.** `console.current_member()` writes (it moves `last_seen_at`), so no console function may be reached with `{ get: true }`. `supabase.rpc()` POSTs by default; nothing should change that.
7. **The guard reads the error's message, not its HTTP status.** PostgREST maps both `28000` and `42501` to 403, so `session ended` and `no access` are told apart by the text our own functions raise.

## Two notes for every task

**Screens are transcribed, not designed.** Tasks 9, 10 and 11 build pages whose copy and structure come from `docs/design/sheets/console/ConsoleSetup.dc.html` and `Main.dc.html`. Those sheets are the authority: open them, transcribe the wording and the element order exactly, and follow `src/app/console/login/sign-in-form.tsx` for the component shape (a discriminated `Stage` union, `useState`, no `let`, the same focus handling). Where a task gives a table of copy rather than the whole component, the table is the contract and the sheet is the source — do not invent, reword or rearrange.

**Reuse the test helpers that exist.** `tests/helpers/fake-supabase.ts` already stands in for the supabase-js builder and its `auth` methods; `tests/unit/app/auth/callback.test.ts` shows the house pattern for testing a route that redirects (a real `NextRequest`, `NextResponse` used as-is). Vitest routes `*.test.ts` to node and `*.test.tsx` to jsdom (`vitest.config.mts`), so a component test must be `.tsx`.

**Three test traps this codebase has already hit. Every task's tests are subject to them, whether or not its own code block shows the workaround:**

1. **Stubbing `VERCEL_ENV=production` alone does not give you a production environment.** `env()`'s `superRefine` refuses a deployed environment without the shared store, and outside `NODE_ENV=production` a failed parse falls back to defaults — silently dropping `VERCEL_ENV`. A test written that way passes while exercising the *non*-production branch. Stub the store too, as `tests/unit/proxy.test.ts:58-66` already does:

   ```ts
   vi.stubEnv("VERCEL_ENV", "production");
   vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
   vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
   vi.stubEnv("DATA_KEY", `${"A".repeat(43)}=`);
   resetEnvCache();
   ```

2. **A `vi.mock` factory is hoisted above the `const`s it closes over.** Declare such mocks with `vi.hoisted(() => …)` — `tests/unit/console/auth/sign-in-link.test.ts` shows the form — or the file throws a ReferenceError before a single test runs.

3. **A mock a test reads arguments from must be typed.** A bare `vi.fn(() => …)` infers a zero-argument signature, so `.mock.calls[0]?.[1]` is an index into a zero-length tuple: vitest runs it, `tsc --noEmit` refuses it (TS2493). Use `vi.fn<Signature>()`, as `tests/unit/console/auth/db.test.ts:5` does.

## File structure

**Database** (`supabase/`)

| File | Responsibility |
|---|---|
| `migrations/20260920091000_console_challenge_add_key_tap.sql` | The fourth challenge purpose, alone in its own transaction |
| `migrations/20260920091100_console_member_api.sql` | `public.console_me`, `console_auth_activate_member`, `console_auth_read_challenge`, `console_auth_session`, `console_auth_setup_link` |
| `tests/console_member_api.test.sql` | pgTAP for the five functions and the new purpose |
| `config.toml` | `http://admin.localhost:4210/**` locally, `https://admin.trakline.in/**` remotely |

**Console services** (`src/console/`)

| File | Responsibility |
|---|---|
| `auth/db.ts` | The console's two Supabase clients and its cookie name |
| `auth/member.ts` | The member record's shape, parsed from the RPC's `Json` |
| `auth/guard.ts` | `requireConsoleMember()` — the one gate every console surface runs |
| `auth/session.ts` | Device label, address hash, starting and ending a console session |
| `auth/sign-in-link.ts` | Minting and sending one sign-in link |
| `email/send.ts` | Resend over `fetch`, or the outbox under `E2E=1` |
| `email/outbox.ts` | The in-memory outbox the e2e run reads |
| `keys/rp.ts` | RP ID and expected origin, from the request's host |
| `keys/encoding.ts` | base64 ↔ base64url, and bytea literals for PostgREST |
| `keys/webauthn.ts` | The `@simplewebauthn/server` boundary — the only file importing it |
| `keys/ceremony.ts` | What each purpose means: who may ask, what gets recorded |
| `keys/client.ts` | The browser half: `@simplewebauthn/browser` plus our error text |
| `messages/en-IN/session.ts` | Session and access copy |
| `messages/en-IN/keys.ts` | The key step and Setup copy, from the sheets |
| `messages/en-IN/email.ts` | The sign-in email, plain text |

**Console routes and pages** (`src/app/console/`)

| File | Responsibility |
|---|---|
| `api/sign-in/route.ts` *(modify)* | Now actually sends, inside `after()` |
| `api/keys/options/route.ts` | Mint a challenge, return WebAuthn options |
| `api/keys/verify/route.ts` | Verify a ceremony, record what it proves |
| `api/setup/route.ts` | Redeem a first-Owner token |
| `api/sign-out/route.ts` | Revoke the console session, clear the cookie |
| `api/test-outbox/route.ts` | E2E only: read and clear the outbox |
| `auth/confirm/route.ts` | Verify the link, open the session, choose the next page |
| `keys/page.tsx`, `keys/key-step.tsx` | The sign-in key step |
| `setup/page.tsx`, `setup/setup-flow.tsx` | The first Owner's three steps |
| `page.tsx` *(modify)* | The signed-in seat 2d replaces |

**Tests**

| File | Responsibility |
|---|---|
| `tests/unit/console/auth/*.test.ts` | Clients, member parsing, guard, session, sign-in link |
| `tests/unit/console/email/*.test.ts` | Transport and outbox |
| `tests/unit/console/keys/*.test.ts` | RP, encoding, the WebAuthn boundary, ceremonies |
| `tests/integration/console/*.test.ts` | Every route handler, against fakes |
| `tests/e2e/console-auth/*.spec.ts` | The real journeys, against a local Supabase |
| `playwright.console.config.ts` | The second Playwright project: Supabase on, virtual key |

---

### Task 1: The database's last five functions, and the redirect allow-list

**Files:**
- Create: `supabase/migrations/20260920091000_console_challenge_add_key_tap.sql`
- Create: `supabase/migrations/20260920091100_console_member_api.sql`
- Test: `supabase/tests/console_member_api.test.sql`
- Modify: `supabase/config.toml`
- Modify: `src/types/supabase.ts` (regenerated, never hand-edited)

**Interfaces:**
- Consumes: `console.current_member()`, `console.members`, `console.keys`, `console.challenges`, `console.challenge_purpose` — all from 2b.
- Produces:
  - `public.console_me() → jsonb` — granted to `authenticated`. Returns `{user_id, email, name, role, status}`. Raises `session ended` (SQLSTATE 28000) or `no access` (42501) exactly as `console.current_member()` does.
  - `public.console_auth_activate_member(p_member uuid) → boolean` — granted to `service_role`. Moves `setup` → `active` once the member holds two keys; returns whether the member is active now.
  - `public.console_auth_read_challenge(p_challenge text, p_member uuid, p_purpose console.challenge_purpose) → jsonb` — granted to `service_role`. The same predicate as `console_auth_take_challenge`, without spending the row.
  - `public.console_auth_session(p_session_id uuid) → jsonb` — granted to `service_role`. The live session joined to its member: `{session_id, member_id, email, name, role, status, key_verified, key_count}`, or null. This is the pre-guard for the key step, which by definition runs *before* a session is key-verified and so cannot use `console.current_member()`.
  - `public.console_auth_setup_link(p_token_hash bytea) → jsonb` — granted to `service_role`. `{email}` for a live first-Owner link, or null. Redemption needs an `auth.users` id, and the only way to get one is to know the address the link was made for — which is inside the row.
  - `console.challenge_purpose` gains the value `add_key_tap`.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/console_member_api.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

-- Grants first: the member's own call belongs to `authenticated` alone, and the
-- two service-role helpers to service_role alone. Supabase's default privileges
-- auto-grant EXECUTE on a new public-schema function to all three roles, so each
-- side is checked, not just the side a revoke happens to name.
select is(has_function_privilege('authenticated', 'public.console_me()', 'execute')::text, 'true', 'a signed-in member can ask who they are');
select is(has_function_privilege('anon', 'public.console_me()', 'execute')::text, 'false', 'anon cannot');
select is(has_function_privilege('service_role', 'public.console_me()', 'execute')::text, 'false', 'the service role has no business asking');

select is(has_function_privilege('service_role', 'public.console_auth_activate_member(uuid)', 'execute')::text, 'true', 'service_role can activate a member');
select is(has_function_privilege('authenticated', 'public.console_auth_activate_member(uuid)', 'execute')::text, 'false', 'a member cannot activate themselves');
select is(has_function_privilege('anon', 'public.console_auth_activate_member(uuid)', 'execute')::text, 'false', 'anon cannot activate a member');

select is(has_function_privilege('service_role', 'public.console_auth_read_challenge(text, uuid, console.challenge_purpose)', 'execute')::text, 'true', 'service_role can read a challenge');
select is(has_function_privilege('authenticated', 'public.console_auth_read_challenge(text, uuid, console.challenge_purpose)', 'execute')::text, 'false', 'a member cannot read a challenge directly');
select is(has_function_privilege('anon', 'public.console_auth_read_challenge(text, uuid, console.challenge_purpose)', 'execute')::text, 'false', 'anon cannot read a challenge');

select is(has_function_privilege('service_role', 'public.console_auth_session(uuid)', 'execute')::text, 'true', 'service_role can read a live session');
select is(has_function_privilege('authenticated', 'public.console_auth_session(uuid)', 'execute')::text, 'false', 'a member cannot read a session row directly');
select is(has_function_privilege('anon', 'public.console_auth_session(uuid)', 'execute')::text, 'false', 'anon cannot read a session row');

select is(has_function_privilege('service_role', 'public.console_auth_setup_link(bytea)', 'execute')::text, 'true', 'service_role can read a live setup link');
select is(has_function_privilege('authenticated', 'public.console_auth_setup_link(bytea)', 'execute')::text, 'false', 'a member cannot read a setup link');
select is(has_function_privilege('anon', 'public.console_auth_setup_link(bytea)', 'execute')::text, 'false', 'anon cannot read a setup link');

-- The fourth purpose exists, so a tap that unlocks adding a key can never be
-- spent as the registration challenge itself.
select is(
  (select count(*)::int from pg_enum e
     join pg_type t on t.oid = e.enumtypid
     join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'console' and t.typname = 'challenge_purpose'),
  4,
  'challenge_purpose has four values'
);
select is('add_key_tap'::console.challenge_purpose::text, 'add_key_tap', 'add_key_tap is one of them');

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in');
insert into console.members (user_id, email, name, role, status)
values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in', 'Asha Rao', 'owner', 'setup');

-- Activation is a rule, not a request: two keys or nothing.
select is(public.console_auth_activate_member('11111111-1111-1111-1111-111111111111'), false, 'a member with no keys is not activated');
select is(
  (select status::text from console.members where user_id = '11111111-1111-1111-1111-111111111111'),
  'setup',
  'and is left in setup'
);

insert into console.keys (member_id, credential_id, public_key, counter, name, type)
values ('11111111-1111-1111-1111-111111111111', '\x01'::bytea, '\x0a'::bytea, 0, 'Blue key', 'security_key');
select is(public.console_auth_activate_member('11111111-1111-1111-1111-111111111111'), false, 'one key is still not enough');

insert into console.keys (member_id, credential_id, public_key, counter, name, type)
values ('11111111-1111-1111-1111-111111111111', '\x02'::bytea, '\x0b'::bytea, 0, 'iPhone', 'passkey');
select is(public.console_auth_activate_member('11111111-1111-1111-1111-111111111111'), true, 'two keys activate the member');
select is(
  (select status::text from console.members where user_id = '11111111-1111-1111-1111-111111111111'),
  'active',
  'and the row says so'
);
select is(public.console_auth_activate_member('11111111-1111-1111-1111-111111111111'), true, 'activating an active member is a no-op that still reports active');

-- A removed member is not quietly reinstated by adding keys.
update console.members set status = 'removed' where user_id = '11111111-1111-1111-1111-111111111111';
select is(public.console_auth_activate_member('11111111-1111-1111-1111-111111111111'), false, 'a removed member is not activated by their keys');
update console.members set status = 'active' where user_id = '11111111-1111-1111-1111-111111111111';

-- The non-consuming read: same predicate as take_challenge, but the row survives.
insert into console.sessions (session_id, member_id, device_label, address_hash, expires_at, key_verified_at)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Chrome on macOS', 'hash', now() + interval '7 days', now());

select public.console_auth_new_challenge(
  '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
  'action', 'challenge-value-long-enough', console.action_digest('Pause checks', 'checks', 'off', 'Provider maintenance window.')
);

select is(
  public.console_auth_read_challenge('challenge-value-long-enough', '11111111-1111-1111-1111-111111111111', 'action') ->> 'purpose',
  'action',
  'the challenge reads back'
);
select is(
  (select used_at is null from console.challenges where challenge = 'challenge-value-long-enough'),
  true,
  'reading it does not spend it'
);
select is(
  public.console_auth_read_challenge('challenge-value-long-enough', '11111111-1111-1111-1111-111111111111', 'add_key') ,
  null,
  'another purpose does not match'
);
select is(
  public.console_auth_read_challenge('challenge-value-long-enough', '22222222-2222-2222-2222-222222222222', 'action'),
  null,
  'another member does not match'
);

update console.challenges set used_at = now() where challenge = 'challenge-value-long-enough';
select is(
  public.console_auth_read_challenge('challenge-value-long-enough', '11111111-1111-1111-1111-111111111111', 'action'),
  null,
  'a spent challenge is gone from the read'
);

-- console_challenges_expiry_window forbids expires_at <= created_at, so an expired row is made by
-- moving both: five minutes apart, and both in the past.
update console.challenges
   set used_at = null, created_at = now() - interval '6 minutes', expires_at = now() - interval '1 minute'
 where challenge = 'challenge-value-long-enough';
select is(
  public.console_auth_read_challenge('challenge-value-long-enough', '11111111-1111-1111-1111-111111111111', 'action'),
  null,
  'an expired challenge is gone from the read'
);

-- The key step's own pre-guard. It must see a session that is not key-verified yet -- that is what
-- the key step exists to change -- and must not see one that is revoked, expired, idle past a day,
-- or belongs to a removed member.
select is(
  public.console_auth_session('22222222-2222-2222-2222-222222222222') ->> 'member_id',
  '11111111-1111-1111-1111-111111111111',
  'a live session reads back with its member'
);
select is(
  (public.console_auth_session('22222222-2222-2222-2222-222222222222') ->> 'key_count')::int,
  2,
  'and reports how many keys that member holds'
);
select is(
  public.console_auth_session('99999999-9999-9999-9999-999999999999'),
  null,
  'a session id nobody opened reads as nothing'
);

update console.sessions set revoked_at = now() where session_id = '22222222-2222-2222-2222-222222222222';
select is(public.console_auth_session('22222222-2222-2222-2222-222222222222'), null, 'a revoked session is gone from the read');

update console.sessions set revoked_at = null, expires_at = now() - interval '1 second' where session_id = '22222222-2222-2222-2222-222222222222';
select is(public.console_auth_session('22222222-2222-2222-2222-222222222222'), null, 'an expired session is gone from the read');

update console.sessions set expires_at = now() + interval '7 days', last_seen_at = now() - interval '25 hours' where session_id = '22222222-2222-2222-2222-222222222222';
select is(public.console_auth_session('22222222-2222-2222-2222-222222222222'), null, 'a session idle beyond a day is gone from the read');

update console.sessions set last_seen_at = now() where session_id = '22222222-2222-2222-2222-222222222222';
update console.members set status = 'removed' where user_id = '11111111-1111-1111-1111-111111111111';
select is(public.console_auth_session('22222222-2222-2222-2222-222222222222'), null, 'a removed member has no session to read');
update console.members set status = 'active' where user_id = '11111111-1111-1111-1111-111111111111';

-- The first-Owner link, readable while live so the server can learn which address to sign in.
-- Reading it never spends it: console_auth_redeem_setup_link is the only thing that may.
insert into console.setup_links (email, token_hash, expires_at)
values ('first@trakline.in', extensions.digest('a-token', 'sha256'), now() + interval '24 hours');

select is(
  public.console_auth_setup_link(extensions.digest('a-token', 'sha256')) ->> 'email',
  'first@trakline.in',
  'a live setup link gives up the address it was made for'
);
select is(
  (select used_at is null from console.setup_links where email = 'first@trakline.in'),
  true,
  'reading a setup link does not spend it'
);
select is(public.console_auth_setup_link(extensions.digest('another-token', 'sha256')), null, 'a token nobody issued reads as nothing');

update console.setup_links set used_at = now() where email = 'first@trakline.in';
select is(public.console_auth_setup_link(extensions.digest('a-token', 'sha256')), null, 'a spent link is gone from the read');

-- console_setup_links_expiry_window keeps expires_at inside (created_at, created_at + 24h], so an
-- expired row needs both timestamps moved, exactly 24 hours apart.
update console.setup_links
   set used_at = null, created_at = now() - interval '25 hours', expires_at = now() - interval '1 hour'
 where email = 'first@trakline.in';
select is(public.console_auth_setup_link(extensions.digest('a-token', 'sha256')), null, 'an expired link is gone from the read');

-- console_me runs the guard, so with no claims at all it must refuse, not return null.
select throws_ok(
  $$ select public.console_me() $$,
  '28000',
  null,
  'without a session, asking who you are ends the session'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run db:test`
Expected: FAIL — `function public.console_me() does not exist`, and the enum has three values, not four.

- [ ] **Step 3: Add the fourth challenge purpose, alone**

Create `supabase/migrations/20260920091000_console_challenge_add_key_tap.sql`:

```sql
-- Spec §D: "Every later key starts with a tap of an existing key." That tap is
-- an assertion, and the registration that follows it is a separate ceremony
-- with its own challenge. They must be distinguishable in the database:
-- sharing one purpose would let a caller take the challenge minted for the tap
-- and spend it on navigator.credentials.create() instead, registering a key
-- with no tap at all.
--
-- This lives alone in its own migration because a new enum value may not be
-- used in the same transaction that adds it. Nothing else belongs in this file.
alter type console.challenge_purpose add value if not exists 'add_key_tap';
```

- [ ] **Step 4: Add the three functions**

Create `supabase/migrations/20260920091100_console_member_api.sql`:

```sql
-- The one call a signed-in member makes about themselves, and the two the
-- server makes on their behalf while they are still signing in.

-- Every console surface runs this first. It returns nothing a member does not
-- already know, and it is the only public function granted to `authenticated`
-- besides console_save_settings -- because console.current_member() is what
-- actually checks the session: key-verified, unrevoked, inside its week, used
-- within the last 24 hours, and belonging to an active member. It also moves
-- last_seen_at, so it writes: every caller must reach it with POST.
create or replace function public.console_me()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member console.members := console.current_member();
begin
  return jsonb_build_object(
    'user_id', v_member.user_id,
    'email',   v_member.email,
    'name',    v_member.name,
    'role',    v_member.role,
    'status',  v_member.status
  );
end;
$$;

-- Setup ends when the member holds two keys, never before: spec §D's enrolment
-- rule and the removal rule ("a key can't be removed if that would leave fewer
-- than two") are the same rule seen from both ends. The count is read here
-- rather than trusted from the caller, and `status = 'setup'` in the update
-- means a removed member is never quietly reinstated by adding keys.
create or replace function public.console_auth_activate_member(p_member uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from console.keys k where k.member_id = p_member) < 2 then
    return false;
  end if;

  update console.members
     set status = 'active', updated_at = now()
   where user_id = p_member and status = 'setup';

  -- Reports the state, not whether this call is what produced it: a second
  -- request for an already-active member is a no-op that still answers "active".
  return exists (select 1 from console.members m where m.user_id = p_member and m.status = 'active');
end;
$$;

-- take_challenge spends what it returns, and console.use_tap() requires an
-- unspent row -- so the per-action flow in §D (verify the tap, then let the
-- database spend it while the action runs) has no way to check a challenge
-- first. This is that check: the same predicate, without the update. Added
-- now, with no caller, so 2e cannot be built on the consuming read by mistake.
create or replace function public.console_auth_read_challenge(
  p_challenge text,
  p_member    uuid,
  p_purpose   console.challenge_purpose
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(c)
    from console.challenges c
   where c.challenge = p_challenge
     and c.member_id = p_member
     and c.purpose = p_purpose
     and c.used_at is null
     and c.expires_at > now();
$$;

-- The key step runs before a session is key-verified, which is precisely what
-- console.current_member() refuses -- so the pre-guard cannot go through it.
-- This is the same set of conditions, read rather than enforced, and without
-- moving last_seen_at: a member is working when they call a member function,
-- not when the server checks whether they may.
create or replace function public.console_auth_session(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'session_id',   s.session_id,
    'member_id',    m.user_id,
    'email',        m.email,
    'name',         m.name,
    'role',         m.role,
    'status',       m.status,
    'key_verified', s.key_verified_at is not null,
    'key_count',    (select count(*) from console.keys k where k.member_id = m.user_id)
  )
  from console.sessions s
  join console.members m on m.user_id = s.member_id
  where s.session_id = p_session_id
    and s.revoked_at is null
    and s.expires_at > now()
    and s.last_seen_at > now() - interval '24 hours'
    and m.status <> 'removed';
$$;

-- Redeeming a first-Owner link needs an auth.users id, and the server can only
-- get one by knowing which address the link was made for -- which is inside the
-- row. So the address is readable while the link is live, and invisible the
-- moment it is spent or expires. console_auth_redeem_setup_link stays the only
-- thing that may spend one.
create or replace function public.console_auth_setup_link(p_token_hash bytea)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('email', l.email)
    from console.setup_links l
   where l.token_hash = p_token_hash
     and l.used_at is null
     and l.expires_at > now();
$$;

-- Supabase's default privileges auto-grant EXECUTE on a new public-schema
-- function to anon, authenticated and service_role alike, so each of the three
-- is named in the revoke even where it is the role about to be granted back.
revoke all on function public.console_me() from public, anon, authenticated, service_role;
grant execute on function public.console_me() to authenticated;

revoke all on function
  public.console_auth_activate_member(uuid),
  public.console_auth_read_challenge(text, uuid, console.challenge_purpose),
  public.console_auth_session(uuid),
  public.console_auth_setup_link(bytea)
from public, anon, authenticated, service_role;

grant execute on function
  public.console_auth_activate_member(uuid),
  public.console_auth_read_challenge(text, uuid, console.challenge_purpose),
  public.console_auth_session(uuid),
  public.console_auth_setup_link(bytea)
to service_role;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run db:reset && npm run db:test`
Expected: PASS — the new file's 43 assertions, plus the nine existing files. One of those nine does change: `supabase/tests/console_keys_sessions.test.sql` asserts `challenge_purpose`'s **complete** label set through `enum_has_labels`, so Step 3's new value forces that array from three labels to four. Widen it in this task's commit; do not weaken the assertion to a subset.

Report the **total** assertion count from the runner's own output. Do not count by hand or by eye: two implementer reports in 2b miscounted.

- [ ] **Step 6: Allow the console's redirect addresses**

In `supabase/config.toml`, add to the local `[auth]` block's `additional_redirect_urls` (it currently ends with the `http://127.0.0.1:4210/**` entry):

```toml
  "http://admin.localhost:4210/**",
```

Find the remote block further down the file (the one whose `site_url` is `https://trakline.in`) and add to its `additional_redirect_urls`:

```toml
  "https://admin.trakline.in/**",
```

The remote list only takes effect when the owner runs `npm run db:config` at launch (2g); the local one takes effect on the next `npm run db:start`. Do not run `db:config` — it writes to the production project.

- [ ] **Step 7: Regenerate the database types**

Run: `npm run db:types`
Then `npm run typecheck`.

Expected: `src/types/supabase.ts` gains `console_me`, `console_auth_activate_member`, `console_auth_read_challenge`, `console_auth_session` and `console_auth_setup_link`, and every `console.challenge_purpose` union in the file gains `"add_key_tap"`. Confirm by grepping for those six strings. Never hand-edit this file.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations supabase/tests/console_member_api.test.sql supabase/config.toml src/types/supabase.ts
git commit -m "feat(console): the member's own guard call, activation, and the reads sign-in needs"
```

---

### Task 2: The console's two Supabase clients

**Files:**
- Create: `src/console/auth/db.ts`
- Test: `tests/unit/console/auth/db.test.ts`

**Interfaces:**
- Consumes: `supabasePublicEnv`, `isSupabaseConfigured` from `@/services/supabase/public-env`; `env()` from `@/services/env`; `AppError` from `@/services/errors`; `Database` from `@/types/supabase`.
- Produces:
  - `CONSOLE_COOKIE_NAME = "sb-console-auth-token"`
  - `createConsoleDb(): Promise<ConsoleDb>` — the cookie-bound client, as the member. Throws `AppError("CONSOLE_UNAVAILABLE", …)` when Supabase is unconfigured.
  - `createConsoleServiceDb(): ConsoleDb` — the service-role client. Throws the same when the secret key is missing. Never usable in the browser.
  - `type ConsoleDb = SupabaseClient<Database>`

The console keeps its own cookie name so a traveller session on `trakline.in` and a console session on `admin.trakline.in` never read each other's tokens, even though both are the same Supabase project. Cookies stay host-only, as `@supabase/ssr` sets them by default.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/console/auth/db.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

// Typed, not inferred: a bare `vi.fn(() => …)` infers a zero-argument signature, so
// `.mock.calls[0]?.[2]` below is an index into a zero-length tuple and `tsc --noEmit` refuses it
// (TS2493) even though vitest runs it happily. `vi.fn<Signature>()` is this repo's own convention
// wherever a test reads the arguments a mock was called with.
const createServerClient = vi.fn<(...args: unknown[]) => { tag: string }>(() => ({ tag: "server" }));
const createClient = vi.fn<(...args: unknown[]) => { tag: string }>(() => ({ tag: "service" }));
const cookieStore = { getAll: () => [], set: vi.fn() };

vi.mock("@supabase/ssr", () => ({ createServerClient }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve(cookieStore) }));

async function load() {
  vi.resetModules();
  return import("@/console/auth/db");
}

const CONFIGURED = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_aaaaaaaaaaaaaaaaaaaaaa",
  SUPABASE_SECRET_KEY: "sb_secret_aaaaaaaaaaaaaaaaaaaaaaaa",
};

afterEach(() => {
  vi.unstubAllEnvs();
  createServerClient.mockClear();
  createClient.mockClear();
});

describe("the console's Supabase clients", () => {
  it("names the console's own cookie, so a traveller token is never read as a console one", async () => {
    for (const [name, value] of Object.entries(CONFIGURED)) vi.stubEnv(name, value);
    const { createConsoleDb, CONSOLE_COOKIE_NAME } = await load();
    await createConsoleDb();
    expect(CONSOLE_COOKIE_NAME).toBe("sb-console-auth-token");
    expect(createServerClient.mock.calls[0]?.[2]).toMatchObject({ cookieOptions: { name: "sb-console-auth-token" } });
  });

  it("refuses to build a member client when Supabase is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const { createConsoleDb } = await load();
    await expect(createConsoleDb()).rejects.toMatchObject({ code: "CONSOLE_UNAVAILABLE", status: 503 });
  });

  it("refuses to build a service client without the secret key", async () => {
    for (const [name, value] of Object.entries(CONFIGURED)) vi.stubEnv(name, value);
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    const { createConsoleServiceDb } = await load();
    expect(() => createConsoleServiceDb()).toThrow(expect.objectContaining({ code: "CONSOLE_UNAVAILABLE" }));
  });

  it("keeps the service client out of the browser", async () => {
    for (const [name, value] of Object.entries(CONFIGURED)) vi.stubEnv(name, value);
    vi.stubGlobal("window", {});
    const { createConsoleServiceDb } = await load();
    expect(() => createConsoleServiceDb()).toThrow(/never run in the browser/);
    vi.unstubAllGlobals();
  });

  it("gives the service client no session of its own", async () => {
    for (const [name, value] of Object.entries(CONFIGURED)) vi.stubEnv(name, value);
    const { createConsoleServiceDb } = await load();
    createConsoleServiceDb();
    expect(createClient.mock.calls[0]?.[2]).toMatchObject({ auth: { persistSession: false, autoRefreshToken: false } });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/console/auth/db.test.ts`
Expected: FAIL — `Cannot find module '@/console/auth/db'`.

- [ ] **Step 3: Write the clients**

Create `src/console/auth/db.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { consoleMessages } from "@/console/messages";
import { env } from "@/services/env";
import { AppError } from "@/services/errors";
import { isSupabaseConfigured, supabasePublicEnv } from "@/services/supabase/public-env";
import type { Database } from "@/types/supabase";

export type ConsoleDb = SupabaseClient<Database>;

/**
 * The console's own cookie. Same Supabase project as the traveller site, different name and
 * different host: cookies are host-only, so `trakline.in` never sends this one to
 * `admin.trakline.in`, and a traveller session can never be mistaken for a console session.
 */
export const CONSOLE_COOKIE_NAME = "sb-console-auth-token";

function unavailable(): AppError {
  return new AppError("CONSOLE_UNAVAILABLE", consoleMessages.availability.localDatabase, { status: 503 });
}

/** The member's own client: whatever the console cookie holds, with the member's own privileges. */
export async function createConsoleDb(): Promise<ConsoleDb> {
  if (!isSupabaseConfigured()) throw unavailable();
  const store = await cookies();
  return createServerClient<Database>(supabasePublicEnv.url, supabasePublicEnv.publishableKey, {
    cookieOptions: { name: CONSOLE_COOKIE_NAME },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // A Server Component render: cookies are read-only there. Route handlers do the writing.
        }
      },
    },
  });
}

/**
 * The service-role client, for the steps that happen before a key-verified session exists:
 * looking a member up, opening a session, minting and spending challenges, recording a key.
 * Every one of those is a `console_auth_*` function; this client can reach nothing else in the
 * console schema, which has no `usage` for any role.
 */
export function createConsoleServiceDb(): ConsoleDb {
  if (typeof window !== "undefined") throw new Error("The console service client must never run in the browser.");
  const key = env().SUPABASE_SECRET_KEY;
  if (!key || !isSupabaseConfigured()) throw unavailable();
  return createClient<Database>(supabasePublicEnv.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/console/auth/db.test.ts`
Expected: PASS (5 tests).

Then confirm `cookieOptions.name` is really the option `@supabase/ssr` 0.12.7 reads — the mock proves we pass it, not that it works:

```bash
grep -rn "cookieOptions" node_modules/@supabase/ssr/dist/module/createServerClient.js
```

Expected: the module reads `cookieOptions?.name` when building its storage key. If it does not, stop and report — every later task depends on the cookie being separate.

- [ ] **Step 5: Commit**

```bash
git add src/console/auth/db.ts tests/unit/console/auth/db.test.ts
git commit -m "feat(console): the console's own Supabase cookie and its two clients"
```

---

### Task 3: The guard — `requireConsoleMember()`

**Files:**
- Create: `src/console/auth/member.ts`
- Create: `src/console/auth/guard.ts`
- Create: `src/console/messages/en-IN/session.ts`
- Modify: `src/console/messages/index.ts`
- Test: `tests/unit/console/auth/member.test.ts`, `tests/unit/console/auth/guard.test.ts`, `tests/unit/console/messages.test.ts`

**Interfaces:**
- Consumes: `createConsoleDb`, `ConsoleDb` (Task 2); `public.console_me()` (Task 1).
- Produces:
  - `type ConsoleRole = "owner" | "admin" | "support" | "viewer"`
  - `type ConsoleMemberStatus = "setup" | "active" | "removed"`
  - `interface ConsoleMember { readonly userId: string; readonly email: string; readonly name: string; readonly role: ConsoleRole; readonly status: ConsoleMemberStatus }`
  - `parseConsoleMember(value: unknown): ConsoleMember` — throws `AppError("UNAUTHENTICATED", …)` on anything else.
  - `ROLE_RANK: Readonly<Record<ConsoleRole, number>>` — owner 4, admin 3, support 2, viewer 1. Mirrors `console.role_rank`.
  - `requireConsoleMember(least?: ConsoleRole, db?: ConsoleDb): Promise<ConsoleMember>` — the gate. Throws `UNAUTHENTICATED` (401, "Your session ended. Sign in again.") or `INVALID_INPUT` with status 403 ("You don't have access to this.") .
  - `sessionIdFromClaims(claims: unknown): string | null`
  - `consoleMessages.session` — `{ ended, noAccess, unavailable }`.

The role check lives in the database too (`console.require_role`). This one exists so a page can render the no-access plate without a round trip per module, and so route handlers fail the same way. The database stays the authority.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/console/auth/member.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseConsoleMember, ROLE_RANK, sessionIdFromClaims } from "@/console/auth/member";

const VALID = {
  user_id: "11111111-1111-1111-1111-111111111111",
  email: "asha@trakline.in",
  name: "Asha Rao",
  role: "owner",
  status: "active",
};

describe("parseConsoleMember", () => {
  it("reads the shape console_me returns", () => {
    expect(parseConsoleMember(VALID)).toEqual({
      userId: "11111111-1111-1111-1111-111111111111",
      email: "asha@trakline.in",
      name: "Asha Rao",
      role: "owner",
      status: "active",
    });
  });

  it("refuses an unknown role rather than ranking it as nothing", () => {
    expect(() => parseConsoleMember({ ...VALID, role: "root" })).toThrow(expect.objectContaining({ code: "UNAUTHENTICATED" }));
  });

  it("refuses null, which is what a missing row looks like over PostgREST", () => {
    expect(() => parseConsoleMember(null)).toThrow(expect.objectContaining({ code: "UNAUTHENTICATED" }));
  });
});

describe("ROLE_RANK", () => {
  it("ranks the four roles as console.role_rank does", () => {
    expect(ROLE_RANK).toEqual({ owner: 4, admin: 3, support: 2, viewer: 1 });
  });
});

describe("sessionIdFromClaims", () => {
  it("reads the session_id claim Supabase puts in the access token", () => {
    expect(sessionIdFromClaims({ sub: "u", session_id: "22222222-2222-2222-2222-222222222222" })).toBe("22222222-2222-2222-2222-222222222222");
  });

  it("is null when the claim is missing, empty or not a string", () => {
    expect(sessionIdFromClaims({ sub: "u" })).toBeNull();
    expect(sessionIdFromClaims({ session_id: "" })).toBeNull();
    expect(sessionIdFromClaims({ session_id: 7 })).toBeNull();
    expect(sessionIdFromClaims(null)).toBeNull();
  });
});
```

Create `tests/unit/console/auth/guard.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { requireConsoleMember } from "@/console/auth/guard";
import type { ConsoleDb } from "@/console/auth/db";

const MEMBER = {
  user_id: "11111111-1111-1111-1111-111111111111",
  email: "asha@trakline.in",
  name: "Asha Rao",
  role: "support",
  status: "active",
};

function dbAnswering(result: { data?: unknown; error?: { message: string } }): ConsoleDb {
  return { rpc: vi.fn(() => Promise.resolve({ data: result.data ?? null, error: result.error ?? null })) } as unknown as ConsoleDb;
}

describe("requireConsoleMember", () => {
  it("returns the member console_me reports", async () => {
    await expect(requireConsoleMember(undefined, dbAnswering({ data: MEMBER }))).resolves.toMatchObject({ role: "support", name: "Asha Rao" });
  });

  it("calls console_me and nothing else", async () => {
    const db = dbAnswering({ data: MEMBER });
    await requireConsoleMember(undefined, db);
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("console_me");
  });

  it("turns the database's 'session ended' into a 401 a member can read", async () => {
    await expect(requireConsoleMember(undefined, dbAnswering({ error: { message: "session ended" } }))).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      status: 401,
      message: "Your session ended. Sign in again.",
    });
  });

  it("turns 'no access' into a 403, not a session ending", async () => {
    await expect(requireConsoleMember(undefined, dbAnswering({ error: { message: "no access" } }))).rejects.toMatchObject({ status: 403 });
  });

  it("refuses a role below the one the module needs", async () => {
    await expect(requireConsoleMember("admin", dbAnswering({ data: MEMBER }))).rejects.toMatchObject({ status: 403 });
  });

  it("allows a role above the one the module needs", async () => {
    await expect(requireConsoleMember("viewer", dbAnswering({ data: MEMBER }))).resolves.toMatchObject({ role: "support" });
  });

  it("does not let an unexpected database error read as a plain sign-out", async () => {
    await expect(requireConsoleMember(undefined, dbAnswering({ error: { message: "connection refused" } }))).rejects.toMatchObject({ code: "INTERNAL" });
  });
});
```

Add to `tests/unit/console/messages.test.ts` (inside its existing top-level `describe`):

```ts
  it("says the same thing about an ended session everywhere", () => {
    expect(consoleMessages.session.ended).toBe("Your session ended. Sign in again.");
    expect(consoleMessages.session.noAccess).toBe("You don't have access to this.");
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/console/auth tests/unit/console/messages.test.ts`
Expected: FAIL — `Cannot find module '@/console/auth/member'`, and `consoleMessages.session` is undefined.

- [ ] **Step 3: Write the messages**

Create `src/console/messages/en-IN/session.ts`:

```ts
import type { MessageTree } from "@/messages/types";

// Spec §5: one line for a session that ended, one for a module a role can't open.
export const session = {
  ended: "Your session ended. Sign in again.",
  noAccess: "You don't have access to this.",
  unavailable: "The console could not be reached. Try again.",
} as const satisfies MessageTree;
```

Modify `src/console/messages/index.ts` to import and include it:

```ts
import { availability } from "./en-IN/availability";
import { frame } from "./en-IN/frame";
import { session } from "./en-IN/session";
import { signIn } from "./en-IN/sign-in";

/** Console copy. It may name providers; traveller code never imports it (tests/unit/console/boundary.contract.test.ts). */
export const consoleMessages = { frame, signIn, availability, session } as const;
```

- [ ] **Step 4: Write the member record**

Create `src/console/auth/member.ts`:

```ts
import { z } from "zod";
import { AppError } from "@/services/errors";
import { consoleMessages } from "@/console/messages";

export type ConsoleRole = "owner" | "admin" | "support" | "viewer";
export type ConsoleMemberStatus = "setup" | "active" | "removed";

export interface ConsoleMember {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly role: ConsoleRole;
  readonly status: ConsoleMemberStatus;
}

/** The same order `console.role_rank` gives. A role this map does not name is not a role. */
export const ROLE_RANK: Readonly<Record<ConsoleRole, number>> = { owner: 4, admin: 3, support: 2, viewer: 1 } as const;

const shape = z.object({
  // `guid`, not `uuid`: this parses a Postgres `uuid` column, and that type accepts any 32 hex
  // digits, while zod's `uuid()` also demands RFC 4122's version and variant nibbles. The stricter
  // check would be stricter than the column it reads, and a member whose id failed it would be
  // told their session had ended.
  user_id: z.guid(),
  email: z.string().min(3).max(254),
  name: z.string().min(1).max(120),
  role: z.enum(["owner", "admin", "support", "viewer"]),
  status: z.enum(["setup", "active", "removed"]),
});

/** `console_me` returns `Json`. Anything that is not a whole member reads as no session at all. */
export function parseConsoleMember(value: unknown): ConsoleMember {
  const parsed = shape.safeParse(value);
  if (!parsed.success) throw new AppError("UNAUTHENTICATED", consoleMessages.session.ended, { status: 401 });
  const { user_id, email, name, role, status } = parsed.data;
  return { userId: user_id, email, name, role, status };
}

/**
 * The console session is keyed by the JWT's own `session_id` claim, because that is what
 * `console.current_member()` reads back out of `request.jwt.claims`. No other id would ever match.
 */
export function sessionIdFromClaims(claims: unknown): string | null {
  if (typeof claims !== "object" || claims === null) return null;
  const value = (claims as Record<string, unknown>).session_id;
  return typeof value === "string" && value.length > 0 ? value : null;
}
```

- [ ] **Step 5: Write the guard**

Create `src/console/auth/guard.ts`:

```ts
import { createConsoleDb, type ConsoleDb } from "@/console/auth/db";
import { parseConsoleMember, ROLE_RANK, type ConsoleMember, type ConsoleRole } from "@/console/auth/member";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

const m = consoleMessages.session;

/**
 * PostgREST maps both 28000 (invalid authorization) and 42501 (insufficient privilege) to 403, so
 * the two are told apart by the text our own functions raise, not by the status that reaches us.
 * Anything else is a fault, and must not read to the member as an ordinary sign-out.
 */
function fromDatabase(message: string): AppError {
  if (message.includes("session ended")) return new AppError("UNAUTHENTICATED", m.ended, { status: 401 });
  if (message.includes("no access")) return new AppError("INVALID_INPUT", m.noAccess, { status: 403 });
  return new AppError("INTERNAL", m.unavailable);
}

/**
 * The one gate every console page and route handler runs first (spec §C). `console_me` does the
 * real work in the database: the claims verify, the session is key-verified, current and not
 * revoked, and the member is active. `least` adds the module's role floor on top; the database
 * checks it again inside every function that changes anything.
 */
export async function requireConsoleMember(least?: ConsoleRole, db?: ConsoleDb): Promise<ConsoleMember> {
  const client = db ?? (await createConsoleDb());
  const { data, error } = await client.rpc("console_me");
  if (error) throw fromDatabase(error.message);
  const member = parseConsoleMember(data);
  if (least && ROLE_RANK[member.role] < ROLE_RANK[least]) {
    throw new AppError("INVALID_INPUT", m.noAccess, { status: 403 });
  }
  return member;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/console && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/console/auth src/console/messages tests/unit/console
git commit -m "feat(console): the session guard every console surface runs first"
```

---

### Task 4: Console email — Resend, the outbox, and the sign-in letter

**Files:**
- Create: `src/console/email/outbox.ts`
- Create: `src/console/email/send.ts`
- Create: `src/console/messages/en-IN/email.ts`
- Create: `src/app/console/api/test-outbox/route.ts`
- Modify: `src/console/messages/index.ts`
- Modify: `src/services/env.ts`
- Modify: `.env.example`
- Test: `tests/unit/console/email/send.test.ts`, `tests/unit/console/email/outbox.test.ts`, `tests/unit/services/env.test.ts`

**Interfaces:**
- Consumes: `env()`, `AppError`, `log`.
- Produces:
  - `interface ConsoleLetter { readonly to: string; readonly subject: string; readonly text: string }`
  - `sendConsoleEmail(letter: ConsoleLetter): Promise<"sent" | "captured" | "failed">` — never throws. A failure is logged and reported, because spec §5 says sign-in answers the same whether Resend is up or down.
  - `outbox.take(): readonly ConsoleLetter[]`, `outbox.put(letter)`, `outbox.clear()`
  - `consoleMessages.email.signIn({ name, link })` → `{ subject, text }`
  - `env().RESEND_API_KEY`, `env().CONSOLE_EMAIL_FROM` (default `Trakline Console <console@trakline.in>`)
  - `E2E=1` is refused when `NODE_ENV=production` **or** `VERCEL_ENV=production`.

> **Amended during execution, after this task's review.** The code blocks below are the first draft; five defects in them were found and fixed in the same task, and the landed code is the authority:
> 1. `const current = env();` moves **inside** `sendConsoleEmail`'s `try`. `env()` throws in production on a cold instance when any unrelated variable is invalid, which would have broken the one contract this function has.
> 2. A test stubs `fetch` to **reject**, asserting `"failed"` — spec §5's literal "Resend down" case, which nothing covered.
> 3. A second test stubs `env` itself to throw, so defect 1 cannot silently return.
> 4. `outbox.take(to?)` takes an optional recipient, returning only that address's letters and **putting the rest back in order**; the route reads `to` from its query string. Without it, two specs signing in at once can each drain the other's letter.
> 5. The `E2E=1` rule also fires on `VERCEL_ENV=production`, matching the `deployed` convention in the same file, and the "not configured" test stubs `RESEND_API_KEY` to `""` rather than relying on it being ambiently unset.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/console/email/outbox.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { outbox } from "@/console/email/outbox";

const letter = (to: string) => ({ to, subject: "Sign in", text: "link" });

beforeEach(() => outbox.clear());

describe("the e2e outbox", () => {
  it("hands letters back oldest first and empties itself", () => {
    outbox.put(letter("a@trakline.in"));
    outbox.put(letter("b@trakline.in"));
    expect(outbox.take().map((l) => l.to)).toEqual(["a@trakline.in", "b@trakline.in"]);
    expect(outbox.take()).toEqual([]);
  });

  it("keeps only the most recent letters, so a long run cannot grow without bound", () => {
    for (let i = 0; i < 60; i++) outbox.put(letter(`${i}@trakline.in`));
    const held = outbox.take();
    expect(held).toHaveLength(50);
    expect(held[0]?.to).toBe("10@trakline.in");
  });
});
```

Create `tests/unit/console/email/send.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { outbox } from "@/console/email/outbox";
import { sendConsoleEmail } from "@/console/email/send";
import { resetEnvCache } from "@/services/env";

const letter = { to: "asha@trakline.in", subject: "Your Trakline console sign-in link", text: "Open this once: https://admin.trakline.in/auth/confirm?token_hash=x&type=magiclink" };

beforeEach(() => {
  outbox.clear();
  resetEnvCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetEnvCache();
});

describe("sendConsoleEmail", () => {
  it("captures instead of sending under E2E, and never calls Resend", async () => {
    vi.stubEnv("E2E", "1");
    vi.stubEnv("RESEND_API_KEY", "re_aaaaaaaaaaaaaaaaaaaaaaaa");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    resetEnvCache();

    await expect(sendConsoleEmail(letter)).resolves.toBe("captured");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(outbox.take()).toEqual([letter]);
  });

  it("posts to Resend with the configured sender", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_aaaaaaaaaaaaaaaaaaaaaaaa");
    // Typed, not inferred: a bare `vi.fn(() => …)` infers a zero-argument signature, so reading
    // `.mock.calls[0]` below is an index into a zero-length tuple and `tsc --noEmit` refuses it
    // (TS2493) even though vitest runs it happily. This is the repo's convention wherever a test
    // reads the arguments a mock was called with.
    const fetchSpy = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() => Promise.resolve(new Response('{"id":"1"}', { status: 200 })));
    vi.stubGlobal("fetch", fetchSpy);
    resetEnvCache();

    await expect(sendConsoleEmail(letter)).resolves.toBe("sent");
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(String(init.body))).toEqual({
      from: "Trakline Console <console@trakline.in>",
      to: [letter.to],
      subject: letter.subject,
      text: letter.text,
    });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_aaaaaaaaaaaaaaaaaaaaaaaa");
  });

  it("reports a failure rather than throwing, so sign-in answers the same either way", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_aaaaaaaaaaaaaaaaaaaaaaaa");
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("nope", { status: 500 }))));
    resetEnvCache();
    await expect(sendConsoleEmail(letter)).resolves.toBe("failed");
  });

  it("reports a failure when a send is not configured at all", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(sendConsoleEmail(letter)).resolves.toBe("failed");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
```

Add to `tests/unit/services/env.test.ts` (inside its existing top-level `describe`):

```ts
  it("refuses the e2e outbox in production", () => {
    const parsed = parseEnv({ NODE_ENV: "production", E2E: "1" });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.issues.join(" ")).toMatch(/E2E=1 is refused in production/);
  });

  it("defaults the console's sender without needing a variable", () => {
    const parsed = parseEnv({});
    expect(parsed.ok && parsed.env.CONSOLE_EMAIL_FROM).toBe("Trakline Console <console@trakline.in>");
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/console/email tests/unit/services/env.test.ts`
Expected: FAIL — the modules do not exist, and `E2E=1` in production currently parses fine.

- [ ] **Step 3: Extend the environment**

In `src/services/env.ts`, add inside `envSchema`'s object, next to the other server-only keys:

```ts
    /** Server only. Resend sending key for console email; entered by the owner through a hidden prompt. */
    RESEND_API_KEY: z.string().min(20).optional(),
    /** Who console email comes from. One default, so no deployment has to set it. */
    CONSOLE_EMAIL_FROM: z.string().min(5).max(120).default("Trakline Console <console@trakline.in>"),
```

And add to the `superRefine` body, beside the `PNR_SOURCE=fixture` rule:

```ts
    if (v.NODE_ENV === "production" && v.E2E) {
      ctx.addIssue({ code: "custom", path: ["E2E"], message: "E2E=1 is refused in production." });
    }
```

Add to `.env.example`, under the server-only section:

```
# Console email (Resend). Sending access only, domain trakline.in. Production only.
RESEND_API_KEY=
# Optional. Defaults to "Trakline Console <console@trakline.in>".
CONSOLE_EMAIL_FROM=
```

- [ ] **Step 4: Write the outbox**

Create `src/console/email/outbox.ts`:

```ts
import type { ConsoleLetter } from "./send";

// Spec §I: under E2E=1 (never in production -- the environment check refuses it) console email goes
// to an in-memory outbox the end-to-end run reads instead of to Resend. One dev server, one module
// instance, so a plain array is the whole store. It is bounded because a long run would otherwise
// hold every letter it ever sent.
const LIMIT = 50;
let held: ConsoleLetter[] = [];

export const outbox = {
  put(letter: ConsoleLetter): void {
    held = [...held, letter].slice(-LIMIT);
  },
  /** Everything captured since the last read, oldest first. Reading empties it. */
  take(): readonly ConsoleLetter[] {
    const taken = held;
    held = [];
    return taken;
  },
  clear(): void {
    held = [];
  },
} as const;
```

- [ ] **Step 5: Write the transport**

Create `src/console/email/send.ts`:

```ts
import { env } from "@/services/env";
import { log } from "@/services/log";
import { outbox } from "./outbox";

export interface ConsoleLetter {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export type SendOutcome = "sent" | "captured" | "failed";

const RESEND_URL = "https://api.resend.com/emails";

/**
 * Console email, plain text, through Resend's API (spec §I). It never throws: spec §5 says a
 * sign-in answers the same whether Resend is up or down, and a Security alert that cannot be sent
 * is written to the audit log as Failed rather than breaking the action that caused it. The caller
 * decides what to do with the outcome.
 */
export async function sendConsoleEmail(letter: ConsoleLetter): Promise<SendOutcome> {
  const current = env();
  if (current.E2E) {
    outbox.put(letter);
    return "captured";
  }
  if (!current.RESEND_API_KEY) {
    log.warn("[console] no RESEND_API_KEY: console email is not configured for this deployment");
    return "failed";
  }
  try {
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${current.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: current.CONSOLE_EMAIL_FROM, to: [letter.to], subject: letter.subject, text: letter.text }),
    });
    if (response.ok) return "sent";
    log.warn("[console] resend refused a send", { status: response.status });
    return "failed";
  } catch (err) {
    log.warn("[console] resend could not be reached", err);
    return "failed";
  }
}
```

- [ ] **Step 6: Write the letter**

Create `src/console/messages/en-IN/email.ts`:

```ts
// Console email, plain text in today's sign-in style (spec §I). No PNR, no traveller address,
// ever. The link is the only thing in it that is not fixed text.
export const email = {
  signIn: ({ name, link }: { readonly name: string; readonly link: string }) => ({
    subject: "Your Trakline console sign-in link",
    text: [
      `Hello ${name},`,
      "",
      "Open this link to sign in to the Trakline console. It works once and expires in 1 hour.",
      "",
      link,
      "",
      "You will still need your security key.",
      "",
      "If you did not ask for this, you can ignore it — nobody can sign in without your key.",
      "",
      "— Trakline Console",
    ].join("\n"),
  }),
} as const;
```

Add it to `src/console/messages/index.ts` the same way `session` was added in Task 3, so the export becomes `{ frame, signIn, availability, session, email }`.

> `email` holds a function returning an object rather than plain strings, so it must **not** be typed `satisfies MessageTree` — check `src/messages/types.ts` and, if `MessageTree` does not admit that shape, leave this module untyped by it, as the sheet-driven message modules do for their own function entries.

- [ ] **Step 7: Write the test-only outbox route**

Create `src/app/console/api/test-outbox/route.ts`:

```ts
import { consoleMessages } from "@/console/messages";
import { outbox } from "@/console/email/outbox";
import { jsonError, jsonOk } from "@/services/api-response";
import { env } from "@/services/env";
import { AppError } from "@/services/errors";

export const dynamic = "force-dynamic";

/**
 * The end-to-end run's letterbox. It exists only under E2E=1, which the environment check refuses
 * in production (src/services/env.ts), so this is a 404 on every real deployment -- twice over,
 * since a production build never has E2E set either.
 */
export async function GET(): Promise<Response> {
  try {
    if (!env().E2E) throw new AppError("NOT_FOUND", consoleMessages.session.noAccess, { status: 404 });
    return jsonOk({ ok: true, letters: outbox.take() });
  } catch (err) {
    return jsonError(err);
  }
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/console tests/unit/services/env.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/console/email src/console/messages src/app/console/api/test-outbox src/services/env.ts .env.example tests/unit
git commit -m "feat(console): console email through Resend, with an outbox for end-to-end runs"
```

---

### Task 5: Sign-in actually sends the link

**Files:**
- Create: `src/console/auth/sign-in-link.ts`
- Modify: `src/app/console/api/sign-in/route.ts`
- Test: `tests/unit/console/auth/sign-in-link.test.ts`, `tests/integration/console/sign-in.test.ts`

**Interfaces:**
- Consumes: `createConsoleServiceDb` (Task 2), `sendConsoleEmail` (Task 4), `consoleMessages.email` (Task 4), `assertConsoleAvailable`, `assertSameOrigin`, `assertSignInAllowed`, `consoleHostFor`.
- Produces:
  - `confirmUrl(host: string, tokenHash: string): string`
  - `sendSignInLink(email: string, host: string, db?: ConsoleDb): Promise<void>` — resolves whatever happens. Looks the member up, mints the link, sends it. A non-member is a silent no-op.

`generateLink` returns both `action_link` and `hashed_token`. We use `hashed_token` and build our own address, because `action_link` goes to Supabase's `/auth/v1/verify`, which answers with the tokens in the URL **fragment** — which no server route can read.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/console/auth/sign-in-link.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleDb } from "@/console/auth/db";
import { confirmUrl, sendSignInLink } from "@/console/auth/sign-in-link";
import { outbox } from "@/console/email/outbox";
import { resetEnvCache } from "@/services/env";

const MEMBER = { user_id: "11111111-1111-1111-1111-111111111111", email: "asha@trakline.in", name: "Asha Rao", role: "owner", status: "active", key_count: 2 };

function fakeDb(opts: { member?: unknown; hashedToken?: string; linkError?: boolean } = {}) {
  const generateLink = vi.fn(() =>
    Promise.resolve(
      opts.linkError
        ? { data: null, error: { message: "over_email_send_rate_limit" } }
        : { data: { properties: { hashed_token: opts.hashedToken ?? "hashed-token-value", action_link: "https://supabase.example/auth/v1/verify?x=1" } }, error: null },
    ),
  );
  const rpc = vi.fn(() => Promise.resolve({ data: opts.member ?? null, error: null }));
  return { db: { rpc, auth: { admin: { generateLink } } } as unknown as ConsoleDb, rpc, generateLink };
}

beforeEach(() => {
  outbox.clear();
  vi.stubEnv("E2E", "1");
  resetEnvCache();
});

describe("confirmUrl", () => {
  it("points at the console's own confirm address, on the host that asked", () => {
    expect(confirmUrl("admin.localhost:4210", "abc")).toBe("http://admin.localhost:4210/auth/confirm?token_hash=abc&type=magiclink");
    expect(confirmUrl("admin.trakline.in", "abc")).toBe("https://admin.trakline.in/auth/confirm?token_hash=abc&type=magiclink");
  });

  it("escapes a token rather than pasting it in raw", () => {
    expect(confirmUrl("admin.trakline.in", "a b&c")).toContain("token_hash=a%20b%26c");
  });
});

describe("sendSignInLink", () => {
  it("sends nothing at all for an address that is not a member", async () => {
    const { db, generateLink } = fakeDb({ member: null });
    await sendSignInLink("stranger@example.com", "admin.trakline.in", db);
    expect(generateLink).not.toHaveBeenCalled();
    expect(outbox.take()).toEqual([]);
  });

  it("sends nothing for a member who is still removed", async () => {
    const { db, generateLink } = fakeDb({ member: { ...MEMBER, status: "removed" } });
    await sendSignInLink("asha@trakline.in", "admin.trakline.in", db);
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("mints a magic link for a member and mails our own confirm address", async () => {
    const { db, generateLink } = fakeDb({ member: MEMBER });
    await sendSignInLink("asha@trakline.in", "admin.trakline.in", db);
    expect(generateLink).toHaveBeenCalledWith(expect.objectContaining({ type: "magiclink", email: "asha@trakline.in" }));
    const [letter] = outbox.take();
    expect(letter?.to).toBe("asha@trakline.in");
    expect(letter?.subject).toBe("Your Trakline console sign-in link");
    expect(letter?.text).toContain("https://admin.trakline.in/auth/confirm?token_hash=hashed-token-value&type=magiclink");
  });

  it("never puts Supabase's own action_link in the letter", async () => {
    const { db } = fakeDb({ member: MEMBER });
    await sendSignInLink("asha@trakline.in", "admin.trakline.in", db);
    expect(outbox.take()[0]?.text).not.toContain("/auth/v1/verify");
  });

  it("swallows a refused mint rather than letting it reach the caller", async () => {
    const { db } = fakeDb({ member: MEMBER, linkError: true });
    await expect(sendSignInLink("asha@trakline.in", "admin.trakline.in", db)).resolves.toBeUndefined();
    expect(outbox.take()).toEqual([]);
  });
});
```

**Add to** `tests/integration/console/sign-in.test.ts` — the file already exists and covers the route as it stands today (availability, the rate limits, and the same-origin fallbacks). **Merge these cases into it; do not overwrite it**, or that coverage disappears silently. The mocks at the top go alongside whatever is already there.

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendSignInLink = vi.fn(() => Promise.resolve());
vi.mock("@/console/auth/sign-in-link", () => ({ sendSignInLink, confirmUrl: () => "" }));
// `after` runs its callback inline here, so the test can assert what the route scheduled.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

import { POST } from "@/app/console/api/sign-in/route";
import { resetEnvCache } from "@/services/env";

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://admin.localhost:4210/console/api/sign-in", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", host: "admin.localhost:4210", ...headers },
  });
}

beforeEach(() => {
  sendSignInLink.mockClear();
  resetEnvCache();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe("POST /api/sign-in", () => {
  it("answers the same for a member and a stranger", async () => {
    const one = await POST(request({ email: "asha@trakline.in" }));
    const two = await POST(request({ email: "stranger@example.com" }));
    expect(one.status).toBe(200);
    expect(two.status).toBe(200);
    expect(await one.json()).toEqual(await two.json());
  });

  it("lower-cases the address before it reaches the lookup", async () => {
    await POST(request({ email: "Asha@Trakline.IN" }));
    expect(sendSignInLink).toHaveBeenCalledWith("asha@trakline.in", "admin.localhost:4210");
  });

  it("schedules the send after the answer, so the answer's timing says nothing", async () => {
    const response = await POST(request({ email: "asha@trakline.in" }));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(sendSignInLink).toHaveBeenCalledOnce();
  });

  it("refuses a cross-site post before looking anything up", async () => {
    const response = await POST(request({ email: "asha@trakline.in" }, { "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(sendSignInLink).not.toHaveBeenCalled();
  });

  it("refuses a malformed address in place", async () => {
    const response = await POST(request({ email: "asha@example" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: "Enter an email address like name@example.com." });
    expect(sendSignInLink).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/console/auth/sign-in-link.test.ts tests/integration/console/sign-in.test.ts`
Expected: FAIL — `Cannot find module '@/console/auth/sign-in-link'`.

- [ ] **Step 3: Write the link**

Create `src/console/auth/sign-in-link.ts`:

```ts
import { createConsoleServiceDb, type ConsoleDb } from "@/console/auth/db";
import { sendConsoleEmail } from "@/console/email/send";
import { consoleMessages } from "@/console/messages";
import { log } from "@/services/log";

/**
 * Where the link goes. `generateLink` also hands back an `action_link`, but that one points at
 * Supabase's own /auth/v1/verify, which finishes by putting the tokens in the URL *fragment* --
 * which a server route never sees. We send `hashed_token` to our own confirm route instead, the
 * same shape the traveller callback already handles.
 */
export function confirmUrl(host: string, tokenHash: string): string {
  const scheme = host.startsWith("admin.localhost") ? "http" : "https";
  return `${scheme}://${host}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink`;
}

/**
 * One sign-in link, for a member only. Everything here happens after the route has already
 * answered (spec §C: one answer for every address, and §3A: equal in time), so nothing it does
 * -- including doing nothing at all -- can be measured from outside. It never throws.
 */
export async function sendSignInLink(email: string, host: string, db?: ConsoleDb): Promise<void> {
  try {
    const client = db ?? createConsoleServiceDb();
    const { data, error } = await client.rpc("console_auth_member_by_email", { p_email: email });
    if (error) {
      log.warn("[console] member lookup failed while sending a sign-in link", error.message);
      return;
    }
    const member = data as { name?: unknown; status?: unknown } | null;
    if (!member || typeof member.name !== "string" || member.status === "removed") return;

    const link = await client.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: confirmUrl(host, "") },
    });
    const tokenHash = link.data?.properties?.hashed_token;
    if (link.error || !tokenHash) {
      log.warn("[console] could not mint a sign-in link", link.error?.message ?? "no token");
      return;
    }

    const letter = consoleMessages.email.signIn({ name: member.name, link: confirmUrl(host, tokenHash) });
    const outcome = await sendConsoleEmail({ to: email, ...letter });
    if (outcome === "failed") log.warn("[console] a sign-in link could not be sent");
  } catch (err) {
    // Spec §5: Resend down, Supabase down -- sign-in answers the same, and the failure is logged.
    log.warn("[console] sending a sign-in link failed", err);
  }
}
```

- [ ] **Step 4: Rewrite the route**

Replace `src/app/console/api/sign-in/route.ts` with:

```ts
import { after } from "next/server";
import { z } from "zod";
import { assertConsoleAvailable } from "@/console/availability";
import { sendSignInLink } from "@/console/auth/sign-in-link";
import { consoleMessages } from "@/console/messages";
import { assertSameOrigin } from "@/console/same-origin";
import { assertSignInAllowed } from "@/console/sign-in-limits";
import { jsonError, jsonOk } from "@/services/api-response";
import { clientIp } from "@/services/rate-limit";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

const body = z.object({ email: z.email({ message: consoleMessages.signIn.invalid }).max(254) }).strict();

/**
 * Console sign-in (Form TC-02). One answer for every address, in content and in time: the lookup,
 * the mint and the send all run in `after()`, once this response is already on its way, so nothing
 * a caller can measure tells them whether the address belongs to a member.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    const { email } = await readBody(req, body);
    const address = email.toLowerCase();
    await assertSignInAllowed(address, clientIp(null, req.headers.get("x-forwarded-for")));
    const host = req.headers.get("host") ?? new URL(req.url).host;
    after(() => sendSignInLink(address, host));
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/console tests/integration/console && npm run typecheck && npm run lint`
Expected: PASS.

Then confirm the real `after` is exported where this imports it from:

```bash
grep -rn "export declare function after" node_modules/next/dist/server/after/index.d.ts node_modules/next/types/index.d.ts 2>/dev/null | head
grep -rn "\"after\"" node_modules/next/dist/server/web/exports/index.js 2>/dev/null | head
```

If `after` is not exported from `next/server` in 16.3.4, find where it is (check `node_modules/next/dist/docs/` for the guide on after) and use that path in both the route and the test's mock.

- [ ] **Step 6: Commit**

```bash
git add src/console/auth/sign-in-link.ts src/app/console/api/sign-in/route.ts tests
git commit -m "feat(console): sign-in mints and sends the link behind one unchanging answer"
```

---

### Task 6: `/auth/confirm` opens the console session

**Files:**
- Create: `src/console/auth/session.ts`
- Create: `src/app/console/auth/confirm/route.ts`
- Test: `tests/unit/console/auth/session.test.ts`, `tests/integration/console/confirm.test.ts`

**Interfaces:**
- Consumes: `createConsoleDb`, `createConsoleServiceDb` (Task 2); `sessionIdFromClaims` (Task 3); `public.console_auth_start_session`, `public.console_auth_member_by_email`, `public.console_auth_revoke_session` (2b).
- Produces:
  - `deviceLabel(userAgent: string | null): string` — "Chrome on macOS", capped at 120 characters, never empty.
  - `consoleAddressHash(ip: string): string` — keyed, one-way, ≤128 characters.
  - `startConsoleSession(args: { sessionId: string; member: string; userAgent: string | null; ip: string; db?: ConsoleDb }): Promise<void>`
  - `endConsoleSession(sessionId: string, db?: ConsoleDb): Promise<void>`
  - `nextAfterConfirm(keyCount: number): "/setup" | "/keys"` — Setup for a member holding fewer than two keys, the key step otherwise.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/console/auth/session.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConsoleDb } from "@/console/auth/db";
import { consoleAddressHash, deviceLabel, nextAfterConfirm, startConsoleSession } from "@/console/auth/session";
import { resetEnvCache } from "@/services/env";

const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const FIREFOX_WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0";

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe("deviceLabel", () => {
  it("names the browser and the system, as the audit log shows it", () => {
    expect(deviceLabel(CHROME_MAC)).toBe("Chrome on macOS");
    expect(deviceLabel(SAFARI_IPHONE)).toBe("Safari on iOS");
    expect(deviceLabel(FIREFOX_WINDOWS)).toBe("Firefox on Windows");
  });

  it("always answers something the column will take", () => {
    expect(deviceLabel(null)).toBe("Unknown device");
    expect(deviceLabel("")).toBe("Unknown device");
    expect(deviceLabel("x".repeat(500)).length).toBeLessThanOrEqual(120);
  });
});

describe("consoleAddressHash", () => {
  it("is one-way, stable and short enough for the column", () => {
    vi.stubEnv("DATA_KEY", Buffer.alloc(32, 7).toString("base64")); // 32 bytes, as env.ts's own regex demands
    resetEnvCache();
    const hash = consoleAddressHash("203.0.113.9");
    expect(hash).toBe(consoleAddressHash("203.0.113.9"));
    expect(hash).not.toContain("203.0.113");
    expect(hash.length).toBeLessThanOrEqual(128);
    expect(hash.length).toBeGreaterThan(0);
  });

  it("tells two addresses apart", () => {
    vi.stubEnv("DATA_KEY", Buffer.alloc(32, 7).toString("base64")); // 32 bytes, as env.ts's own regex demands
    resetEnvCache();
    expect(consoleAddressHash("203.0.113.9")).not.toBe(consoleAddressHash("203.0.113.10"));
  });

  it("still answers without DATA_KEY, which only a local run lacks", () => {
    expect(consoleAddressHash("203.0.113.9")).toBe("local");
  });
});

describe("nextAfterConfirm", () => {
  it("sends a member with fewer than two keys to Setup", () => {
    expect(nextAfterConfirm(0)).toBe("/setup");
    expect(nextAfterConfirm(1)).toBe("/setup");
  });

  it("sends a member with two keys to the key step", () => {
    expect(nextAfterConfirm(2)).toBe("/keys");
  });
});

describe("startConsoleSession", () => {
  it("opens the row under the JWT's own session id", async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const db = { rpc } as unknown as ConsoleDb;
    await startConsoleSession({
      sessionId: "22222222-2222-2222-2222-222222222222",
      member: "11111111-1111-1111-1111-111111111111",
      userAgent: CHROME_MAC,
      ip: "203.0.113.9",
      db,
    });
    expect(rpc).toHaveBeenCalledWith("console_auth_start_session", {
      p_session_id: "22222222-2222-2222-2222-222222222222",
      p_member: "11111111-1111-1111-1111-111111111111",
      p_device_label: "Chrome on macOS",
      p_address_hash: "local",
    });
  });
});
```

Create `tests/integration/console/confirm.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.fn();
const getClaims = vi.fn();
const memberDb = { auth: { verifyOtp, getClaims } };
const serviceRpc = vi.fn();

vi.mock("@/console/auth/db", () => ({
  createConsoleDb: () => Promise.resolve(memberDb),
  createConsoleServiceDb: () => ({ rpc: serviceRpc }),
  CONSOLE_COOKIE_NAME: "sb-console-auth-token",
}));

import { GET } from "@/app/console/auth/confirm/route";

const MEMBER = { user_id: "11111111-1111-1111-1111-111111111111", email: "asha@trakline.in", name: "Asha Rao", role: "owner", status: "setup", key_count: 0 };

function request(query: string): Request {
  return new Request(`http://admin.localhost:4210/console/auth/confirm${query}`, { headers: { host: "admin.localhost:4210" } });
}

beforeEach(() => {
  verifyOtp.mockReset().mockResolvedValue({ data: { user: { email: "asha@trakline.in" } }, error: null });
  getClaims.mockReset().mockResolvedValue({
    data: { claims: { sub: "11111111-1111-1111-1111-111111111111", session_id: "22222222-2222-2222-2222-222222222222" } },
    error: null,
  });
  serviceRpc.mockReset().mockImplementation((name: string) => Promise.resolve({ data: name === "console_auth_member_by_email" ? MEMBER : null, error: null }));
});

describe("GET /auth/confirm", () => {
  it("verifies the token and opens a session keyed by the JWT's session id", async () => {
    const response = await GET(request("?token_hash=abc&type=magiclink"));
    expect(verifyOtp).toHaveBeenCalledWith({ type: "magiclink", token_hash: "abc" });
    expect(serviceRpc).toHaveBeenCalledWith("console_auth_start_session", expect.objectContaining({ p_session_id: "22222222-2222-2222-2222-222222222222" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("/setup");
  });

  it("sends a member who already holds two keys to the key step", async () => {
    serviceRpc.mockImplementation((name: string) =>
      Promise.resolve({ data: name === "console_auth_member_by_email" ? { ...MEMBER, status: "active", key_count: 2 } : null, error: null }),
    );
    const response = await GET(request("?token_hash=abc&type=magiclink"));
    expect(response.headers.get("location")).toContain("/keys");
  });

  it("sends a bad link back to sign-in without opening anything", async () => {
    verifyOtp.mockResolvedValue({ data: null, error: { message: "Token has expired" } });
    const response = await GET(request("?token_hash=abc&type=magiclink"));
    expect(response.headers.get("location")).toContain("/login?error=link");
    expect(serviceRpc).not.toHaveBeenCalledWith("console_auth_start_session", expect.anything());
  });

  it("refuses a verified link whose address is not a member's, and ends the Supabase session", async () => {
    serviceRpc.mockImplementation((name: string) => Promise.resolve({ data: name === "console_auth_member_by_email" ? null : null, error: null }));
    const response = await GET(request("?token_hash=abc&type=magiclink"));
    expect(response.headers.get("location")).toContain("/login?error=link");
    expect(serviceRpc).not.toHaveBeenCalledWith("console_auth_start_session", expect.anything());
  });

  it("refuses a claims set with no session id", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "11111111-1111-1111-1111-111111111111" } }, error: null });
    const response = await GET(request("?token_hash=abc&type=magiclink"));
    expect(response.headers.get("location")).toContain("/login?error=link");
  });

  it("refuses anything but a magic link", async () => {
    const response = await GET(request("?token_hash=abc&type=recovery"));
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("/login?error=link");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/console/auth/session.test.ts tests/integration/console/confirm.test.ts`
Expected: FAIL — neither module exists.

- [ ] **Step 3: Write the session helpers**

Create `src/console/auth/session.ts`:

```ts
import { createConsoleServiceDb, type ConsoleDb } from "@/console/auth/db";
import { deriveDataKeys, keyedHash } from "@/services/data-key";
import { env } from "@/services/env";
import { addressKey } from "@/services/rate-limit";

const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/\bEdg\//, "Edge"],
  [/\bOPR\//, "Opera"],
  [/\bFirefox\//, "Firefox"],
  [/\bChrome\//, "Chrome"],
  [/\bSafari\//, "Safari"],
];

const SYSTEMS: readonly (readonly [RegExp, string])[] = [
  [/\biPhone\b|\biPad\b/, "iOS"],
  [/\bAndroid\b/, "Android"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bWindows\b/, "Windows"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bLinux\b/, "Linux"],
];

function first(pairs: readonly (readonly [RegExp, string])[], text: string): string | null {
  for (const [pattern, name] of pairs) if (pattern.test(text)) return name;
  return null;
}

/**
 * What the audit log and My keys call this session: "Chrome on macOS". Never empty and never
 * longer than the column's 120 characters, because console.sessions checks both.
 */
export function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  // Edge and Opera both claim Chrome, and every one of them claims Safari, so order decides.
  const browser = first(BROWSERS, userAgent);
  const system = first(SYSTEMS, userAgent);
  if (!browser && !system) return "Unknown device";
  const label = browser && system ? `${browser} on ${system}` : (browser ?? system ?? "Unknown device");
  return label.slice(0, 120);
}

/**
 * The address, one-way. Keyed with DATA_KEY so a stored hash cannot be walked back through the
 * whole IPv4 space; a deployment always has DATA_KEY (the environment check requires it), and a
 * local run without one has nothing worth protecting, so it stores a constant instead.
 */
export function consoleAddressHash(ip: string): string {
  const dataKey = env().DATA_KEY;
  if (!dataKey) return "local";
  return keyedHash(deriveDataKeys(dataKey).clientId, addressKey(ip)).slice(0, 128);
}

/** Setup until two keys exist (spec §C step 2), the key step afterwards. */
export function nextAfterConfirm(keyCount: number): "/setup" | "/keys" {
  return keyCount < 2 ? "/setup" : "/keys";
}

export async function startConsoleSession(args: {
  readonly sessionId: string;
  readonly member: string;
  readonly userAgent: string | null;
  readonly ip: string;
  readonly db?: ConsoleDb;
}): Promise<void> {
  const db = args.db ?? createConsoleServiceDb();
  const { error } = await db.rpc("console_auth_start_session", {
    p_session_id: args.sessionId,
    p_member: args.member,
    p_device_label: deviceLabel(args.userAgent),
    p_address_hash: consoleAddressHash(args.ip),
  });
  if (error) throw new Error(`console_auth_start_session: ${error.message}`);
}

export async function endConsoleSession(sessionId: string, db?: ConsoleDb): Promise<void> {
  const client = db ?? createConsoleServiceDb();
  await client.rpc("console_auth_revoke_session", { p_session_id: sessionId });
}
```

- [ ] **Step 4: Write the confirm route**

Create `src/app/console/auth/confirm/route.ts`:

```ts
import { NextResponse } from "next/server";
import { assertConsoleAvailable } from "@/console/availability";
import { createConsoleDb, createConsoleServiceDb } from "@/console/auth/db";
import { sessionIdFromClaims } from "@/console/auth/member";
import { nextAfterConfirm, startConsoleSession } from "@/console/auth/session";
import { consoleHref } from "@/console/href";
import { log } from "@/services/log";
import { clientIp } from "@/services/rate-limit";

export const dynamic = "force-dynamic";

function to(req: Request, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, new URL(req.url).origin), 303);
}

/**
 * Step 2 of spec §C: the link is verified here, on the server, and a console session row is opened
 * under the access token's own `session_id` claim -- the very id `console.current_member()` reads
 * back out of `request.jwt.claims`. The session is not key-verified yet, so it opens nothing but
 * the next step: Setup while the member holds fewer than two keys, the key step otherwise.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const signIn = consoleHref("/login?error=link");
  try {
    assertConsoleAvailable();
    const params = new URL(req.url).searchParams;
    const tokenHash = params.get("token_hash");
    if (!tokenHash || params.get("type") !== "magiclink") return to(req, signIn);

    const db = await createConsoleDb();
    const verified = await db.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
    if (verified.error) return to(req, signIn);

    const claims = await db.auth.getClaims();
    const sessionId = sessionIdFromClaims(claims.data?.claims);
    const userId = (claims.data?.claims as { sub?: unknown } | undefined)?.sub;
    const address = verified.data?.user?.email;
    if (!sessionId || typeof userId !== "string" || !address) return to(req, signIn);

    // A link can only have been minted for a member, but the address is re-checked here because
    // this is the last point before a console session exists: an account that stopped being a
    // member between the mint and the click must not get one.
    const service = createConsoleServiceDb();
    const { data } = await service.rpc("console_auth_member_by_email", { p_email: address.toLowerCase() });
    const member = data as { user_id?: unknown; status?: unknown; key_count?: unknown } | null;
    if (!member || member.user_id !== userId || member.status === "removed") {
      await db.auth.signOut();
      return to(req, signIn);
    }

    await startConsoleSession({
      sessionId,
      member: userId,
      userAgent: req.headers.get("user-agent"),
      ip: clientIp(null, req.headers.get("x-forwarded-for")),
      db: service,
    });

    const keyCount = typeof member.key_count === "number" ? member.key_count : 0;
    return to(req, consoleHref(nextAfterConfirm(keyCount)));
  } catch (err) {
    log.warn("[console] a sign-in link could not be confirmed", err);
    return to(req, signIn);
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/console tests/integration/console && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Prove the `session_id` claim is really there**

This is the one assumption the whole plan rests on. With the local stack running, mint and verify a link against it, then print the claims:

```bash
node --input-type=module -e '
import { createClient } from "@supabase/supabase-js";
const url = "http://127.0.0.1:54321";
const service = process.env.LOCAL_SERVICE_KEY;
const db = createClient(url, service, { auth: { persistSession: false } });
const email = `claims-${Date.now()}@trakline.in`;
await db.auth.admin.createUser({ email, email_confirm: true });
const link = await db.auth.admin.generateLink({ type: "magiclink", email });
const anon = createClient(url, process.env.LOCAL_ANON_KEY, { auth: { persistSession: false } });
const out = await anon.auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties.hashed_token });
console.log(JSON.parse(Buffer.from(out.data.session.access_token.split(".")[1], "base64url").toString()));
'
```

Get `LOCAL_SERVICE_KEY` and `LOCAL_ANON_KEY` from `npx supabase@2.117.0 status -o env` — these are the local stack's well-known development keys, not secrets, and they must not be written into any file.

Expected: the printed claims include a `session_id` uuid. If they do not, **stop and report**: the console session table's key would then need to come from somewhere else, and Tasks 6 through 11 all change.

- [ ] **Step 7: Commit**

```bash
git add src/console/auth/session.ts src/app/console/auth/confirm tests
git commit -m "feat(console): the sign-in link opens a console session keyed by the token's session id"
```

---

### Task 7: WebAuthn at the library boundary

**Files:**
- Create: `src/console/keys/rp.ts`
- Create: `src/console/keys/encoding.ts`
- Create: `src/console/keys/webauthn.ts`
- Modify: `package.json` (dependencies)
- Test: `tests/unit/console/keys/rp.test.ts`, `tests/unit/console/keys/encoding.test.ts`, `tests/unit/console/keys/webauthn.test.ts`

**Interfaces:**
- Consumes: `consoleHostFor` from `@/console/hosts`; `env()`.
- Produces:
  - `relyingParty(host: string | null): { readonly id: string; readonly origin: string; readonly name: string }` — throws `AppError("INVALID_INPUT", …)` for a host that is not the console's.
  - `base64ToBase64url(value: string): string`, `base64urlToBase64(value: string): string`, `base64urlToByteaLiteral(value: string): string` (`\x…` hex, which is how PostgREST takes a `bytea` argument)
  - `registrationOptionsFor(args): Promise<PublicKeyCredentialCreationOptionsJSON>`
  - `verifyRegistration(args): Promise<{ credentialId: string; publicKey: string; counter: number; transports: readonly string[]; keyType: "passkey" | "security_key" }>` — throws `AppError` when it does not verify.
  - `authenticationOptionsFor(args): Promise<PublicKeyCredentialRequestOptionsJSON>`
  - `verifyAuthentication(args): Promise<{ credentialId: string; newCounter: number }>` — throws `AppError` when it does not verify.
  - `type StoredKey = { readonly id: string; readonly credentialId: string; readonly publicKey: string; readonly counter: number; readonly transports: readonly string[] }` (all base64url)

This is the **only** file in the repo that imports `@simplewebauthn/server`. Every other module speaks in our own types.

- [ ] **Step 1: Add the dependencies**

```bash
npm install --save-exact @simplewebauthn/server@14.0.2 @simplewebauthn/browser@14.0.0
```

Confirm `package.json` pins both without a caret, and that `package-lock.json` changed.

- [ ] **Step 2: Write the failing tests**

Create `tests/unit/console/keys/encoding.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { base64ToBase64url, base64urlToBase64, base64urlToByteaLiteral } from "@/console/keys/encoding";

describe("the encodings either side of the database", () => {
  it("turns the standard base64 the database returns into the base64url WebAuthn speaks", () => {
    // +, / and padding are exactly what a credential id trips over.
    expect(base64ToBase64url("a+b/c9==")).toBe("a-b_c9");
    expect(base64ToBase64url("AAAA")).toBe("AAAA");
  });

  it("turns it back, padding restored", () => {
    expect(base64urlToBase64("a-b_c9")).toBe("a+b/c9==");
    expect(base64urlToBase64("AAAA")).toBe("AAAA");
  });

  it("round-trips every byte value", () => {
    const all = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
    expect(base64urlToBase64(base64ToBase64url(all.toString("base64")))).toBe(all.toString("base64"));
  });

  it("writes a bytea literal PostgREST will take", () => {
    expect(base64urlToByteaLiteral(Buffer.from([0x00, 0x1f, 0xff]).toString("base64url"))).toBe("\\x001fff");
  });
});
```

Create `tests/unit/console/keys/rp.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { relyingParty } from "@/console/keys/rp";
import { resetEnvCache } from "@/services/env";

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe("relyingParty", () => {
  it("scopes a key to the console host, over https, in production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    resetEnvCache();
    expect(relyingParty("admin.trakline.in")).toMatchObject({ id: "admin.trakline.in", origin: "https://admin.trakline.in" });
  });

  it("scopes it to admin.localhost, over http and with the port, locally", () => {
    expect(relyingParty("admin.localhost:4210")).toMatchObject({ id: "admin.localhost", origin: "http://admin.localhost:4210" });
  });

  it("refuses the traveller host, so a trakline.in page can never ask for a console key", () => {
    expect(() => relyingParty("trakline.in")).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    expect(() => relyingParty(null)).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
  });

  it("refuses the production host outside production, and the local host inside it", () => {
    expect(() => relyingParty("admin.trakline.in")).toThrow();
    vi.stubEnv("VERCEL_ENV", "production");
    resetEnvCache();
    expect(() => relyingParty("admin.localhost:4210")).toThrow();
  });
});
```

Create `tests/unit/console/keys/webauthn.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// Typed, not inferred: a bare `vi.fn(() => …)` infers a zero-argument signature, so
// `generateRegistrationOptions.mock.calls[0]?.[0]` further down is an index into a zero-length
// tuple and `tsc --noEmit` refuses it (TS2493) even though vitest runs it happily.
// `vi.fn<Signature>()` is this repo's convention wherever a test reads a mock's arguments.
const generateRegistrationOptions = vi.fn<(options: Record<string, unknown>) => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ challenge: "reg-challenge", rp: { id: "admin.localhost" } }),
);
const generateAuthenticationOptions = vi.fn<(options: Record<string, unknown>) => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ challenge: "auth-challenge", rpId: "admin.localhost" }),
);
const verifyRegistrationResponse = vi.fn();
const verifyAuthenticationResponse = vi.fn();

vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions,
  generateAuthenticationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
}));

import { authenticationOptionsFor, registrationOptionsFor, verifyAuthentication, verifyRegistration } from "@/console/keys/webauthn";

const RP = { id: "admin.localhost", origin: "http://admin.localhost:4210", name: "Trakline Console" };
const STORED = { id: "key-row-id", credentialId: "Y3JlZA", publicKey: "cHVia2V5", counter: 7, transports: ["usb"] };

beforeEach(() => {
  generateRegistrationOptions.mockClear();
  generateAuthenticationOptions.mockClear();
  verifyRegistrationResponse.mockReset();
  verifyAuthenticationResponse.mockReset();
});

describe("registrationOptionsFor", () => {
  it("asks for no attestation, discourages resident keys and only prefers verification", async () => {
    await registrationOptionsFor({ rp: RP, member: { email: "asha@trakline.in", name: "Asha Rao", userId: "11111111-1111-1111-1111-111111111111" }, existing: [] });
    expect(generateRegistrationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        rpID: "admin.localhost",
        attestationType: "none",
        authenticatorSelection: { residentKey: "discouraged", userVerification: "preferred" },
      }),
    );
  });

  it("excludes the keys the member already has, so the same key is refused by the browser", async () => {
    await registrationOptionsFor({ rp: RP, member: { email: "a@b.in", name: "A", userId: "11111111-1111-1111-1111-111111111111" }, existing: [STORED] });
    expect(generateRegistrationOptions.mock.calls[0]?.[0]).toMatchObject({ excludeCredentials: [{ id: "Y3JlZA", transports: ["usb"] }] });
  });
});

describe("verifyRegistration", () => {
  it("returns what the row needs, with a synced credential recorded as a passkey", async () => {
    verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: { id: "Y3JlZA", publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ["internal", "hybrid"] },
        credentialDeviceType: "multiDevice",
        credentialBackedUp: true,
      },
    });
    await expect(
      verifyRegistration({ rp: RP, response: { id: "Y3JlZA" } as never, expectedChallenge: "reg-challenge" }),
    ).resolves.toMatchObject({ credentialId: "Y3JlZA", counter: 0, keyType: "passkey", transports: ["internal", "hybrid"] });
  });

  it("records a single-device credential as a security key", async () => {
    verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: { credential: { id: "Y3JlZA", publicKey: new Uint8Array([1]), counter: 0 }, credentialDeviceType: "singleDevice", credentialBackedUp: false },
    });
    await expect(verifyRegistration({ rp: RP, response: { id: "Y3JlZA" } as never, expectedChallenge: "c" })).resolves.toMatchObject({ keyType: "security_key", transports: [] });
  });

  it("checks the origin and the RP id exactly, and does not demand user verification", async () => {
    verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: { credential: { id: "Y3JlZA", publicKey: new Uint8Array([1]), counter: 0 }, credentialDeviceType: "singleDevice", credentialBackedUp: false },
    });
    await verifyRegistration({ rp: RP, response: { id: "Y3JlZA" } as never, expectedChallenge: "c" });
    expect(verifyRegistrationResponse).toHaveBeenCalledWith(
      expect.objectContaining({ expectedOrigin: "http://admin.localhost:4210", expectedRPID: "admin.localhost", requireUserVerification: false }),
    );
  });

  it("throws when it does not verify", async () => {
    verifyRegistrationResponse.mockResolvedValue({ verified: false });
    await expect(verifyRegistration({ rp: RP, response: { id: "x" } as never, expectedChallenge: "c" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("throws rather than leaking the library's own message", async () => {
    verifyRegistrationResponse.mockRejectedValue(new Error("Unexpected registration response origin"));
    await expect(verifyRegistration({ rp: RP, response: { id: "x" } as never, expectedChallenge: "c" })).rejects.toMatchObject({
      message: "That key didn't answer. Try again.",
    });
  });
});

describe("verifyAuthentication", () => {
  it("hands the library the stored key as it holds it, in base64url", async () => {
    verifyAuthenticationResponse.mockResolvedValue({ verified: true, authenticationInfo: { credentialID: "Y3JlZA", newCounter: 8 } });
    await expect(verifyAuthentication({ rp: RP, response: { id: "Y3JlZA" } as never, expectedChallenge: "auth-challenge", key: STORED })).resolves.toEqual({
      credentialId: "Y3JlZA",
      newCounter: 8,
    });
    expect(verifyAuthenticationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        credential: { id: "Y3JlZA", publicKey: expect.any(Uint8Array), counter: 7, transports: ["usb"] },
        requireUserVerification: false,
      }),
    );
  });

  it("throws when it does not verify", async () => {
    verifyAuthenticationResponse.mockResolvedValue({ verified: false, authenticationInfo: { credentialID: "Y3JlZA", newCounter: 8 } });
    await expect(verifyAuthentication({ rp: RP, response: { id: "Y3JlZA" } as never, expectedChallenge: "c", key: STORED })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/unit/console/keys`
Expected: FAIL — none of the three modules exist.

- [ ] **Step 4: Write the encodings**

Create `src/console/keys/encoding.ts`:

```ts
/**
 * The database stores credential ids and public keys as `bytea` and hands them back with
 * `encode(..., 'base64')` -- standard base64, with `+`, `/` and padding. WebAuthn and
 * @simplewebauthn speak base64url. This module is the only place the two meet.
 */

export function base64ToBase64url(value: string): string {
  return value.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function base64urlToBase64(value: string): string {
  const standard = value.replaceAll("-", "+").replaceAll("_", "/");
  return standard.padEnd(standard.length + ((4 - (standard.length % 4)) % 4), "=");
}

/** PostgREST takes a `bytea` argument as a hex literal: `\x00ff`. */
export function base64urlToByteaLiteral(value: string): string {
  return `\\x${Buffer.from(base64urlToBase64(value), "base64").toString("hex")}`;
}

export function base64urlToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64urlToBase64(value), "base64"));
}

export function bytesToBase64url(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}
```

- [ ] **Step 5: Write the relying party**

Create `src/console/keys/rp.ts`:

```ts
import { consoleHostFor, requestHost } from "@/console/hosts";
import { env } from "@/services/env";
import { AppError } from "@/services/errors";

export interface RelyingParty {
  readonly id: string;
  readonly origin: string;
  readonly name: string;
}

/**
 * Spec §D: the RP ID is the console host, and the origin is checked exactly. So a key registered
 * for the console cannot be used from trakline.in, and a trakline.in passkey never counts. A host
 * that is not this environment's console host gets no relying party at all.
 */
export function relyingParty(hostHeader: string | null): RelyingParty {
  const expected = consoleHostFor(env().VERCEL_ENV);
  const host = requestHost(hostHeader);
  if (!host || host !== expected) {
    throw new AppError("INVALID_INPUT", "Security keys are scoped to the console's own address.", { status: 403 });
  }
  // The origin keeps the port; the RP ID never has one.
  const authority = (hostHeader ?? "").trim().toLowerCase();
  const scheme = host === "admin.localhost" ? "http" : "https";
  return { id: host, origin: `${scheme}://${authority}`, name: "Trakline Console" };
}
```

- [ ] **Step 6: Write the boundary**

Create `src/console/keys/webauthn.ts`:

```ts
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";
import { base64urlToBytes, bytesToBase64url } from "./encoding";
import type { RelyingParty } from "./rp";

export type ConsoleKeyType = "passkey" | "security_key";

/** A key as this codebase holds it: every binary field base64url, never base64, never bytes. */
export interface StoredKey {
  readonly id: string;
  readonly credentialId: string;
  readonly publicKey: string;
  readonly counter: number;
  readonly transports: readonly string[];
}

function didNotAnswer(): AppError {
  // One message for every way a ceremony can fail, so nothing about the failure is legible from
  // outside: a wrong origin, a stale challenge and a bad signature all read the same.
  return new AppError("INVALID_INPUT", consoleMessages.keys.didNotAnswer, { status: 400 });
}

export function registrationOptionsFor(args: {
  readonly rp: RelyingParty;
  readonly member: { readonly userId: string; readonly email: string; readonly name: string };
  readonly existing: readonly StoredKey[];
}): Promise<PublicKeyCredentialCreationOptionsJSON> {
  return generateRegistrationOptions({
    rpName: args.rp.name,
    rpID: args.rp.id,
    userName: args.member.email,
    userDisplayName: args.member.name,
    userID: new TextEncoder().encode(args.member.userId),
    attestationType: "none",
    // Spec §D: resident keys are discouraged (the email link has already said who is signing in,
    // and a security key's slots are few); user verification is preferred, so a touch is enough.
    authenticatorSelection: { residentKey: "discouraged", userVerification: "preferred" },
    excludeCredentials: args.existing.map((key) => ({ id: key.credentialId, transports: [...key.transports] })),
  });
}

export async function verifyRegistration(args: {
  readonly rp: RelyingParty;
  readonly response: RegistrationResponseJSON;
  readonly expectedChallenge: string;
}): Promise<{
  readonly credentialId: string;
  readonly publicKey: string;
  readonly counter: number;
  readonly transports: readonly string[];
  readonly keyType: ConsoleKeyType;
}> {
  let result;
  try {
    result = await verifyRegistrationResponse({
      response: args.response,
      expectedChallenge: args.expectedChallenge,
      expectedOrigin: args.rp.origin,
      expectedRPID: args.rp.id,
      // The options asked for 'preferred', so demanding verification here would refuse a key that
      // did exactly what it was asked to do. The library defaults this to true.
      requireUserVerification: false,
    });
  } catch {
    throw didNotAnswer();
  }
  if (!result.verified) throw didNotAnswer();
  const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;
  return {
    credentialId: credential.id,
    publicKey: bytesToBase64url(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? [],
    // Spec §D: "Passkey" for a synced or platform credential, "Security key" otherwise.
    keyType: credentialDeviceType === "multiDevice" || credentialBackedUp ? "passkey" : "security_key",
  };
}

export function authenticationOptionsFor(args: {
  readonly rp: RelyingParty;
  readonly allow: readonly StoredKey[];
}): Promise<PublicKeyCredentialRequestOptionsJSON> {
  return generateAuthenticationOptions({
    rpID: args.rp.id,
    allowCredentials: args.allow.map((key) => ({ id: key.credentialId, transports: [...key.transports] })),
    userVerification: "preferred",
  });
}

export async function verifyAuthentication(args: {
  readonly rp: RelyingParty;
  readonly response: AuthenticationResponseJSON;
  readonly expectedChallenge: string;
  readonly key: StoredKey;
}): Promise<{ readonly credentialId: string; readonly newCounter: number }> {
  let result;
  try {
    result = await verifyAuthenticationResponse({
      response: args.response,
      expectedChallenge: args.expectedChallenge,
      expectedOrigin: args.rp.origin,
      expectedRPID: args.rp.id,
      credential: {
        id: args.key.credentialId,
        publicKey: base64urlToBytes(args.key.publicKey),
        counter: args.key.counter,
        transports: [...args.key.transports],
      },
      requireUserVerification: false,
    });
  } catch {
    throw didNotAnswer();
  }
  if (!result.verified) throw didNotAnswer();
  return { credentialId: result.authenticationInfo.credentialID, newCounter: result.authenticationInfo.newCounter };
}
```

> `consoleMessages.keys` does not exist yet. Create `src/console/messages/en-IN/keys.ts` in this task with just what this file needs, and let Task 9 fill in the rest of the screen copy:
>
> ```ts
> import type { MessageTree } from "@/messages/types";
>
> // Word for word from docs/design/sheets/console/ConsoleSetup.dc.html and Main.dc.html.
> export const keys = {
>   didNotAnswer: "That key didn't answer. Try again.",
>   notYours: "This key isn't one of yours.",
>   alreadyAdded: "That key is already added. Use a different one.",
>   unsupported: "This browser can't use security keys. Try a current Chrome, Safari, Edge or Firefox.",
> } as const satisfies MessageTree;
> ```
>
> and add `keys` to `src/console/messages/index.ts` as Task 3 added `session`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/console && npm run typecheck && npm run lint`
Expected: PASS.

Then confirm the boundary is the only importer:

```bash
grep -rln "@simplewebauthn/server" src | sort
```

Expected: exactly `src/console/keys/webauthn.ts`.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/console/keys src/console/messages tests/unit/console/keys
git commit -m "feat(console): the WebAuthn boundary, scoped to the console host"
```

---

### Task 8: The key endpoints — options, verify, and what each ceremony proves

**Files:**
- Create: `src/console/keys/ceremony.ts`
- Create: `src/console/auth/audit.ts`
- Create: `src/app/console/api/keys/options/route.ts`
- Create: `src/app/console/api/keys/verify/route.ts`
- Test: `tests/unit/console/keys/ceremony.test.ts`, `tests/integration/console/keys.test.ts`

**Interfaces:**
- Consumes: `relyingParty`, `registrationOptionsFor`, `verifyRegistration`, `authenticationOptionsFor`, `verifyAuthentication`, `StoredKey` (Task 7); `createConsoleDb`, `createConsoleServiceDb` (Task 2); `sessionIdFromClaims` (Task 3); `deviceLabel`, `consoleAddressHash` (Task 6); `public.console_auth_session`, `console_auth_keys_for_member`, `console_auth_new_challenge`, `console_auth_take_challenge`, `console_auth_record_key`, `console_auth_touch_key`, `console_auth_verify_session`, `console_auth_activate_member`, `console_auth_write_audit`.
- Also adds `consoleEnvironment()` to `src/console/auth/session.ts` (Step 3) — Task 6 created that file but had no caller for it.
- Produces:
  - `interface LinkSession { sessionId, memberId, email, name, role, status, keyVerified, keyCount }`
  - `requireLinkSession(deps?): Promise<LinkSession>` — the pre-guard for the key step: a console session row that is live, unrevoked and not idle, whose member is not removed. It does **not** require a key-verified session, because that is exactly what these endpoints are for.
  - `beginCeremony(args): Promise<{ step: "tap" | "register"; options: unknown }>`
  - `completeSignIn(args): Promise<void>`
  - `completeTap(args): Promise<{ options: unknown }>`
  - `completeRegistration(args): Promise<{ keyCount: number; activated: boolean }>`
  - `writeConsoleAudit(service, row): Promise<void>` — the 14-argument passthrough, with our own defaults.

**The three ceremonies and why they are three**

| Intent | Member holds | Challenge purpose | Ceremony | What it proves |
|---|---|---|---|---|
| `sign_in` | ≥ 1 key | `sign_in` | assertion | This session may be key-verified |
| `add_key` (first) | 0 keys | `add_key` | attestation | Setup's first key needs only the link session (§D) |
| `add_key` (later) step `tap` | ≥ 1 key | `add_key_tap` | assertion | The member holds a key already — §D's "every later key starts with a tap" |
| `add_key` (later) step `register` | ≥ 1 key | `add_key` | attestation | The new key exists and was touched |

A member holding a key can only get an `add_key` (registration) challenge by completing the `add_key_tap` assertion first. That is why the two purposes are distinct: with one shared purpose, a caller could take the challenge minted for the tap and spend it on `navigator.credentials.create()` instead, and register a key having tapped nothing.

- [ ] **Step 1: Write the failing unit test**

Create `tests/unit/console/keys/ceremony.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleDb } from "@/console/auth/db";
import { beginCeremony, completeRegistration, completeSignIn, requireLinkSession } from "@/console/keys/ceremony";

const RP = { id: "admin.localhost", origin: "http://admin.localhost:4210", name: "Trakline Console" };
const SESSION = {
  session_id: "22222222-2222-2222-2222-222222222222",
  member_id: "11111111-1111-1111-1111-111111111111",
  email: "asha@trakline.in",
  name: "Asha Rao",
  role: "owner",
  status: "setup",
  key_verified: false,
  key_count: 0,
};
const KEY_ROW = { id: "33333333-3333-3333-3333-333333333333", credential_id: "Y3JlZA==", public_key: "cHVia2V5", counter: 3, transports: ["usb"] };

function fakes(overrides: Record<string, unknown> = {}) {
  const answers: Record<string, unknown> = {
    console_auth_session: SESSION,
    console_auth_keys_for_member: [],
    console_auth_new_challenge: "44444444-4444-4444-4444-444444444444",
    console_auth_take_challenge: null,
    console_auth_record_key: "55555555-5555-5555-5555-555555555555",
    console_auth_activate_member: false,
    console_auth_touch_key: null,
    console_auth_verify_session: null,
    console_auth_write_audit: "66666666-6666-6666-6666-666666666666",
    ...overrides,
  };
  const rpc = vi.fn((name: string) => Promise.resolve({ data: answers[name] ?? null, error: null }));
  const service = { rpc } as unknown as ConsoleDb;
  const member = {
    auth: { getClaims: () => Promise.resolve({ data: { claims: { sub: SESSION.member_id, session_id: SESSION.session_id } }, error: null }) },
  } as unknown as ConsoleDb;
  return { service, member, rpc };
}

const REQUEST = new Request("http://admin.localhost:4210/console/api/keys/options", { headers: { host: "admin.localhost:4210" } });

beforeEach(() => vi.clearAllMocks());

describe("requireLinkSession", () => {
  it("reads the session the link opened, key-verified or not", async () => {
    const { service, member } = fakes();
    await expect(requireLinkSession({ db: member, service })).resolves.toMatchObject({ memberId: SESSION.member_id, keyVerified: false, keyCount: 0 });
  });

  it("refuses when the database has no live session for this token", async () => {
    const { service, member } = fakes({ console_auth_session: null });
    await expect(requireLinkSession({ db: member, service })).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
  });
});

describe("beginCeremony", () => {
  it("gives a member with no keys a registration challenge straight away", async () => {
    const { service, member, rpc } = fakes();
    const begun = await beginCeremony({ intent: "add_key", req: REQUEST, db: member, service });
    expect(begun.step).toBe("register");
    expect(rpc).toHaveBeenCalledWith("console_auth_new_challenge", expect.objectContaining({ p_purpose: "add_key" }));
  });

  it("makes a member who already holds a key tap it first", async () => {
    const { service, member, rpc } = fakes({ console_auth_session: { ...SESSION, key_count: 1 }, console_auth_keys_for_member: [KEY_ROW] });
    const begun = await beginCeremony({ intent: "add_key", req: REQUEST, db: member, service });
    expect(begun.step).toBe("tap");
    expect(rpc).toHaveBeenCalledWith("console_auth_new_challenge", expect.objectContaining({ p_purpose: "add_key_tap" }));
  });

  it("refuses to start a sign-in ceremony for a member with no keys at all", async () => {
    const { service, member } = fakes();
    await expect(beginCeremony({ intent: "sign_in", req: REQUEST, db: member, service })).rejects.toMatchObject({ status: 400 });
  });

  it("offers only this member's own keys", async () => {
    const { service, member, rpc } = fakes({ console_auth_session: { ...SESSION, key_count: 1, status: "active" }, console_auth_keys_for_member: [KEY_ROW] });
    await beginCeremony({ intent: "sign_in", req: REQUEST, db: member, service });
    expect(rpc).toHaveBeenCalledWith("console_auth_keys_for_member", { p_member: SESSION.member_id });
  });

  it("converts the database's base64 credential id to the base64url the browser is given", async () => {
    const { service, member } = fakes({ console_auth_session: { ...SESSION, key_count: 1, status: "active" }, console_auth_keys_for_member: [{ ...KEY_ROW, credential_id: "a+b/c9==" }] });
    const begun = await beginCeremony({ intent: "sign_in", req: REQUEST, db: member, service });
    expect(JSON.stringify(begun.options)).toContain("a-b_c9");
    expect(JSON.stringify(begun.options)).not.toContain("a+b/c9");
  });
});

describe("completeSignIn", () => {
  it("refuses a challenge minted for a different session of the same member", async () => {
    const { service, member } = fakes({
      console_auth_session: { ...SESSION, key_count: 1, status: "active" },
      console_auth_keys_for_member: [KEY_ROW],
      console_auth_take_challenge: { challenge: "c", session_id: "99999999-9999-9999-9999-999999999999", purpose: "sign_in" },
    });
    await expect(
      completeSignIn({ req: REQUEST, response: { id: "Y3JlZA" } as never, db: member, service }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("refuses a credential the member does not hold", async () => {
    const { service, member } = fakes({
      console_auth_session: { ...SESSION, key_count: 1, status: "active" },
      console_auth_keys_for_member: [KEY_ROW],
      console_auth_take_challenge: { challenge: "c", session_id: SESSION.session_id, purpose: "sign_in" },
    });
    await expect(completeSignIn({ req: REQUEST, response: { id: "other" } as never, db: member, service })).rejects.toMatchObject({
      message: "This key isn't one of yours.",
    });
  });

  it("logs a failed tap, and does not verify the session", async () => {
    const { service, member, rpc } = fakes({
      console_auth_session: { ...SESSION, key_count: 1, status: "active" },
      console_auth_keys_for_member: [KEY_ROW],
      console_auth_take_challenge: null,
    });
    await expect(completeSignIn({ req: REQUEST, response: { id: "Y3JlZA" } as never, db: member, service })).rejects.toThrow();
    expect(rpc).toHaveBeenCalledWith("console_auth_write_audit", expect.objectContaining({ p_action: "Key tap failed", p_result: "failed" }));
    expect(rpc).not.toHaveBeenCalledWith("console_auth_verify_session", expect.anything());
  });
});

describe("completeRegistration", () => {
  it("activates the member at two keys and key-verifies the session with the new key", async () => {
    const { service, rpc, member } = fakes({
      console_auth_session: { ...SESSION, key_count: 1 },
      console_auth_keys_for_member: [KEY_ROW],
      console_auth_take_challenge: { challenge: "c", session_id: SESSION.session_id, purpose: "add_key" },
      console_auth_activate_member: true,
    });
    vi.doMock("@/console/keys/webauthn", () => ({}));
    const out = await completeRegistration({
      req: REQUEST,
      response: { id: "bmV3" } as never,
      name: "iPhone",
      db: member,
      service,
      verified: { credentialId: "bmV3", publicKey: "cHVia2V5", counter: 0, transports: ["internal"], keyType: "passkey" },
    });
    expect(out).toEqual({ keyCount: 2, activated: true });
    expect(rpc).toHaveBeenCalledWith("console_auth_record_key", expect.objectContaining({ p_name: "iPhone", p_type: "passkey" }));
    expect(rpc).toHaveBeenCalledWith("console_auth_verify_session", expect.objectContaining({ p_session_id: SESSION.session_id }));
    expect(rpc).toHaveBeenCalledWith("console_auth_write_audit", expect.objectContaining({ p_action: "Added a key", p_target: "iPhone" }));
  });

  it("leaves a member with one key in setup, and does not verify the session", async () => {
    const { service, rpc, member } = fakes({
      console_auth_take_challenge: { challenge: "c", session_id: SESSION.session_id, purpose: "add_key" },
      console_auth_activate_member: false,
    });
    const out = await completeRegistration({
      req: REQUEST,
      response: { id: "bmV3" } as never,
      name: "Blue key",
      db: member,
      service,
      verified: { credentialId: "bmV3", publicKey: "cHVia2V5", counter: 0, transports: [], keyType: "security_key" },
    });
    expect(out).toEqual({ keyCount: 1, activated: false });
    expect(rpc).not.toHaveBeenCalledWith("console_auth_verify_session", expect.anything());
  });

  it("turns the database's unique-credential refusal into the sheet's own line", async () => {
    const rpc = vi.fn((name: string) =>
      name === "console_auth_record_key"
        ? Promise.resolve({ data: null, error: { message: 'duplicate key value violates unique constraint "console_keys_credential_key"', code: "23505" } })
        : Promise.resolve({ data: name === "console_auth_take_challenge" ? { challenge: "c", session_id: SESSION.session_id, purpose: "add_key" } : name === "console_auth_session" ? SESSION : null, error: null }),
    );
    const service = { rpc } as unknown as ConsoleDb;
    const member = { auth: { getClaims: () => Promise.resolve({ data: { claims: { sub: SESSION.member_id, session_id: SESSION.session_id } }, error: null }) } } as unknown as ConsoleDb;
    await expect(
      completeRegistration({
        req: REQUEST,
        response: { id: "bmV3" } as never,
        name: "Blue key",
        db: member,
        service,
        verified: { credentialId: "bmV3", publicKey: "cHVia2V5", counter: 0, transports: [], keyType: "security_key" },
      }),
    ).rejects.toMatchObject({ message: "That key is already added. Use a different one." });
  });
});
```

Create `tests/integration/console/keys.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const beginCeremony = vi.fn(() => Promise.resolve({ step: "register", options: { challenge: "c" } }));
const completeSignIn = vi.fn(() => Promise.resolve());
const completeTap = vi.fn(() => Promise.resolve({ options: { challenge: "r" } }));
const completeRegistration = vi.fn(() => Promise.resolve({ keyCount: 2, activated: true }));

vi.mock("@/console/keys/ceremony", () => ({ beginCeremony, completeSignIn, completeTap, completeRegistration, requireLinkSession: vi.fn() }));

import { POST as options } from "@/app/console/api/keys/options/route";
import { POST as verify } from "@/app/console/api/keys/verify/route";

function post(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", host: "admin.localhost:4210", ...headers },
  });
}

const OPTIONS_URL = "http://admin.localhost:4210/console/api/keys/options";
const VERIFY_URL = "http://admin.localhost:4210/console/api/keys/verify";

beforeEach(() => vi.clearAllMocks());

describe("POST /api/keys/options", () => {
  it("hands back the step and the options", async () => {
    const response = await options(post(OPTIONS_URL, { intent: "add_key" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, step: "register", options: { challenge: "c" } });
  });

  it("refuses a cross-site post", async () => {
    const response = await options(post(OPTIONS_URL, { intent: "add_key" }, { "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(beginCeremony).not.toHaveBeenCalled();
  });

  it("refuses an intent it does not know", async () => {
    const response = await options(post(OPTIONS_URL, { intent: "action" }));
    expect(response.status).toBe(400);
    expect(beginCeremony).not.toHaveBeenCalled();
  });
});

describe("POST /api/keys/verify", () => {
  it("finishes a sign-in and says where to go", async () => {
    const response = await verify(post(VERIFY_URL, { intent: "sign_in", response: { id: "Y3JlZA" } }));
    expect(await response.json()).toEqual({ ok: true, next: "/" });
    expect(completeSignIn).toHaveBeenCalledOnce();
  });

  it("answers a tap with the registration options it unlocked", async () => {
    const response = await verify(post(VERIFY_URL, { intent: "add_key", step: "tap", response: { id: "Y3JlZA" } }));
    expect(await response.json()).toEqual({ ok: true, step: "register", options: { challenge: "r" } });
  });

  it("records a key and reports what changed", async () => {
    const response = await verify(post(VERIFY_URL, { intent: "add_key", step: "register", name: "iPhone", response: { id: "bmV3" } }));
    expect(await response.json()).toEqual({ ok: true, keyCount: 2, activated: true, next: "/" });
  });

  it("refuses a registration with no name for the key", async () => {
    const response = await verify(post(VERIFY_URL, { intent: "add_key", step: "register", response: { id: "bmV3" } }));
    expect(response.status).toBe(400);
    expect(completeRegistration).not.toHaveBeenCalled();
  });

  it("refuses a key name longer than the column takes", async () => {
    const response = await verify(post(VERIFY_URL, { intent: "add_key", step: "register", name: "x".repeat(61), response: { id: "bmV3" } }));
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/console/keys/ceremony.test.ts tests/integration/console/keys.test.ts`
Expected: FAIL — `Cannot find module '@/console/keys/ceremony'`.

- [ ] **Step 3: Write the audit passthrough**

Create `src/console/auth/audit.ts`:

```ts
import type { ConsoleDb } from "@/console/auth/db";
import type { ConsoleRole } from "@/console/auth/member";
import { consoleEnvironment } from "@/console/auth/session";
import { log } from "@/services/log";

export interface ConsoleAuditRow {
  readonly actor: string | null;
  readonly actorName: string | null;
  readonly actorRole: ConsoleRole | null;
  readonly keyId?: string | null;
  readonly sessionLabel?: string | null;
  readonly category: "session" | "team" | "configure" | "messages" | "provider_keys" | "leads";
  readonly action: string;
  readonly target: string | null;
  readonly reason?: string | null;
  readonly result: "done" | "refused" | "failed";
  readonly addressHash?: string | null;
  readonly before?: unknown;
  readonly after?: unknown;
}

/**
 * The service-role passthrough (`public.console_auth_write_audit`) for the things that happen
 * before a member function could log them itself: signing in, adding a key, a tap that failed.
 * Writing history must never be what breaks the action it describes, so a failure is logged here
 * and nothing more.
 */
export async function writeConsoleAudit(service: ConsoleDb, row: ConsoleAuditRow): Promise<void> {
  const { error } = await service.rpc("console_auth_write_audit", {
    p_environment: consoleEnvironment(),
    p_actor: row.actor,
    p_actor_name: row.actorName,
    p_actor_role: row.actorRole,
    p_key_id: row.keyId ?? null,
    p_session_label: row.sessionLabel ?? null,
    p_category: row.category,
    p_action: row.action,
    p_target: row.target,
    p_reason: row.reason ?? null,
    p_result: row.result,
    p_address_hash: row.addressHash ?? null,
    p_before: (row.before ?? null) as never,
    p_after: (row.after ?? null) as never,
  });
  if (error) log.warn("[console] an audit row could not be written", { action: row.action, message: error.message });
}
```

Add `consoleEnvironment()` to `src/console/auth/session.ts`:

```ts
/** Which deployment a row belongs to. Settings and the audit log are per environment (spec §F). */
export function consoleEnvironment(): string {
  return env().VERCEL_ENV ?? env().NODE_ENV;
}
```

and a unit test for it in `tests/unit/console/auth/session.test.ts`:

```ts
describe("consoleEnvironment", () => {
  it("names the deployment, falling back to the run mode", () => {
    expect(consoleEnvironment()).toBe("test");
    vi.stubEnv("VERCEL_ENV", "production");
    resetEnvCache();
    expect(consoleEnvironment()).toBe("production");
  });
});
```

- [ ] **Step 4: Write the ceremonies**

Create `src/console/keys/ceremony.ts`:

```ts
import { createConsoleDb, createConsoleServiceDb, type ConsoleDb } from "@/console/auth/db";
import { writeConsoleAudit } from "@/console/auth/audit";
import { sessionIdFromClaims, type ConsoleMemberStatus, type ConsoleRole } from "@/console/auth/member";
import { consoleAddressHash, deviceLabel } from "@/console/auth/session";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";
import { clientIp } from "@/services/rate-limit";
import { base64ToBase64url, base64urlToByteaLiteral } from "./encoding";
import { relyingParty } from "./rp";
import {
  authenticationOptionsFor,
  registrationOptionsFor,
  verifyAuthentication,
  verifyRegistration,
  type ConsoleKeyType,
  type StoredKey,
} from "./webauthn";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";

const m = consoleMessages.keys;
const s = consoleMessages.session;

export interface LinkSession {
  readonly sessionId: string;
  readonly memberId: string;
  readonly email: string;
  readonly name: string;
  readonly role: ConsoleRole;
  readonly status: ConsoleMemberStatus;
  readonly keyVerified: boolean;
  readonly keyCount: number;
}

interface Deps {
  readonly db?: ConsoleDb;
  readonly service?: ConsoleDb;
}

function ended(): AppError {
  return new AppError("UNAUTHENTICATED", s.ended, { status: 401 });
}

/**
 * The gate for the key step itself. `requireConsoleMember()` cannot be used here: it demands a
 * key-verified session, which is precisely what these endpoints exist to produce. This asks the
 * database for the session the link opened -- live, unrevoked, not idle past a day, and belonging
 * to a member who has not been removed -- and nothing more.
 */
export async function requireLinkSession(deps: Deps = {}): Promise<LinkSession> {
  const db = deps.db ?? (await createConsoleDb());
  const service = deps.service ?? createConsoleServiceDb();
  const claims = await db.auth.getClaims();
  const sessionId = sessionIdFromClaims(claims.data?.claims);
  if (!sessionId) throw ended();

  const { data, error } = await service.rpc("console_auth_session", { p_session_id: sessionId });
  if (error) throw ended();
  const row = data as Record<string, unknown> | null;
  if (!row || typeof row.member_id !== "string") throw ended();

  return {
    sessionId,
    memberId: row.member_id,
    email: String(row.email ?? ""),
    name: String(row.name ?? ""),
    role: row.role as ConsoleRole,
    status: row.status as ConsoleMemberStatus,
    keyVerified: row.key_verified === true,
    keyCount: typeof row.key_count === "number" ? row.key_count : 0,
  };
}

/** The member's keys, every binary field turned from the database's base64 into base64url. */
async function keysFor(service: ConsoleDb, memberId: string): Promise<readonly StoredKey[]> {
  const { data, error } = await service.rpc("console_auth_keys_for_member", { p_member: memberId });
  if (error) throw ended();
  const rows = Array.isArray(data) ? (data as readonly Record<string, unknown>[]) : [];
  return rows.map((row) => ({
    id: String(row.id),
    credentialId: base64ToBase64url(String(row.credential_id)),
    publicKey: base64ToBase64url(String(row.public_key)),
    counter: typeof row.counter === "number" ? row.counter : 0,
    transports: Array.isArray(row.transports) ? row.transports.map(String) : [],
  }));
}

type Purpose = "sign_in" | "add_key" | "add_key_tap";

async function mint(service: ConsoleDb, session: LinkSession, purpose: Purpose, challenge: string): Promise<void> {
  const { error } = await service.rpc("console_auth_new_challenge", {
    p_member: session.memberId,
    p_session: session.sessionId,
    p_purpose: purpose,
    p_challenge: challenge,
    p_digest: null as never,
  });
  if (error) throw ended();
}

/**
 * Spends the challenge and checks it was this session's. `console_auth_take_challenge` matches on
 * member and purpose but not on session, so a member's second browser tab could otherwise finish a
 * ceremony the first one started.
 */
async function spend(service: ConsoleDb, session: LinkSession, purpose: Purpose, challenge: string): Promise<void> {
  const { data, error } = await service.rpc("console_auth_take_challenge", {
    p_challenge: challenge,
    p_member: session.memberId,
    p_purpose: purpose,
  });
  const row = data as Record<string, unknown> | null;
  if (error || !row || row.session_id !== session.sessionId) throw ended();
}

/** The challenge the browser signed, as it appears in the response's own clientDataJSON. */
function challengeFrom(response: { readonly response?: { readonly clientDataJSON?: string } }): string {
  const raw = response.response?.clientDataJSON;
  if (!raw) throw new AppError("INVALID_INPUT", m.didNotAnswer, { status: 400 });
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    const value = (parsed as { challenge?: unknown }).challenge;
    if (typeof value !== "string" || value.length === 0) throw new Error("no challenge");
    return value;
  } catch {
    throw new AppError("INVALID_INPUT", m.didNotAnswer, { status: 400 });
  }
}

export async function beginCeremony(args: { readonly intent: "sign_in" | "add_key"; readonly req: Request } & Deps): Promise<{
  readonly step: "tap" | "register";
  readonly options: unknown;
}> {
  const service = args.service ?? createConsoleServiceDb();
  const session = await requireLinkSession({ db: args.db, service });
  const rp = relyingParty(args.req.headers.get("host"));
  const keys = await keysFor(service, session.memberId);

  if (args.intent === "sign_in") {
    if (keys.length === 0) throw new AppError("INVALID_INPUT", m.noKeysYet, { status: 400 });
    const options = await authenticationOptionsFor({ rp, allow: keys });
    await mint(service, session, "sign_in", options.challenge);
    return { step: "tap", options };
  }

  // Spec §D: setup's first key needs only the link session; every later key starts with a tap.
  if (keys.length > 0) {
    const options = await authenticationOptionsFor({ rp, allow: keys });
    await mint(service, session, "add_key_tap", options.challenge);
    return { step: "tap", options };
  }
  const options = await registrationOptionsFor({
    rp,
    member: { userId: session.memberId, email: session.email, name: session.name },
    existing: keys,
  });
  await mint(service, session, "add_key", options.challenge);
  return { step: "register", options };
}

async function logFailedTap(service: ConsoleDb, session: LinkSession, req: Request): Promise<void> {
  await writeConsoleAudit(service, {
    actor: session.memberId,
    actorName: session.name,
    actorRole: session.role,
    sessionLabel: deviceLabel(req.headers.get("user-agent")),
    category: "session",
    action: "Key tap failed",
    target: "Console",
    result: "failed",
    addressHash: consoleAddressHash(clientIp(null, req.headers.get("x-forwarded-for"))),
  });
}

/** Finds the stored key the browser says it used, or refuses in the sheet's own words. */
function keyFor(keys: readonly StoredKey[], credentialId: string): StoredKey {
  const key = keys.find((candidate) => candidate.credentialId === credentialId);
  if (!key) throw new AppError("INVALID_INPUT", m.notYours, { status: 400 });
  return key;
}

export async function completeSignIn(args: { readonly req: Request; readonly response: AuthenticationResponseJSON } & Deps): Promise<void> {
  const service = args.service ?? createConsoleServiceDb();
  const session = await requireLinkSession({ db: args.db, service });
  const rp = relyingParty(args.req.headers.get("host"));
  const keys = await keysFor(service, session.memberId);

  try {
    await spend(service, session, "sign_in", challengeFrom(args.response));
  } catch (err) {
    await logFailedTap(service, session, args.req);
    throw err;
  }

  const key = keyFor(keys, args.response.id);
  let verified;
  try {
    verified = await verifyAuthentication({ rp, response: args.response, expectedChallenge: challengeFrom(args.response), key });
  } catch (err) {
    await logFailedTap(service, session, args.req);
    throw err;
  }

  await service.rpc("console_auth_touch_key", { p_key: key.id, p_counter: verified.newCounter });
  const { error } = await service.rpc("console_auth_verify_session", { p_session_id: session.sessionId, p_key_id: key.id });
  if (error) throw ended();

  await writeConsoleAudit(service, {
    actor: session.memberId,
    actorName: session.name,
    actorRole: session.role,
    keyId: key.id,
    sessionLabel: deviceLabel(args.req.headers.get("user-agent")),
    category: "session",
    action: "Signed in",
    target: "Console",
    result: "done",
    addressHash: consoleAddressHash(clientIp(null, args.req.headers.get("x-forwarded-for"))),
  });
}

/** The tap that unlocks adding another key: it spends an `add_key_tap` and mints an `add_key`. */
export async function completeTap(args: { readonly req: Request; readonly response: AuthenticationResponseJSON } & Deps): Promise<{ readonly options: unknown }> {
  const service = args.service ?? createConsoleServiceDb();
  const session = await requireLinkSession({ db: args.db, service });
  const rp = relyingParty(args.req.headers.get("host"));
  const keys = await keysFor(service, session.memberId);
  const challenge = challengeFrom(args.response);

  try {
    await spend(service, session, "add_key_tap", challenge);
    const key = keyFor(keys, args.response.id);
    const verified = await verifyAuthentication({ rp, response: args.response, expectedChallenge: challenge, key });
    await service.rpc("console_auth_touch_key", { p_key: key.id, p_counter: verified.newCounter });
  } catch (err) {
    await logFailedTap(service, session, args.req);
    throw err;
  }

  const options = await registrationOptionsFor({
    rp,
    member: { userId: session.memberId, email: session.email, name: session.name },
    existing: keys,
  });
  await mint(service, session, "add_key", options.challenge);
  return { options };
}

export async function completeRegistration(
  args: {
    readonly req: Request;
    readonly response: RegistrationResponseJSON;
    readonly name: string;
    /** Test seam: the already-verified attestation. Production callers leave it out. */
    readonly verified?: {
      readonly credentialId: string;
      readonly publicKey: string;
      readonly counter: number;
      readonly transports: readonly string[];
      readonly keyType: ConsoleKeyType;
    };
  } & Deps,
): Promise<{ readonly keyCount: number; readonly activated: boolean }> {
  const service = args.service ?? createConsoleServiceDb();
  const session = await requireLinkSession({ db: args.db, service });
  const rp = relyingParty(args.req.headers.get("host"));
  const challenge = challengeFrom(args.response);

  await spend(service, session, "add_key", challenge);
  const verified = args.verified ?? (await verifyRegistration({ rp, response: args.response, expectedChallenge: challenge }));

  const recorded = await service.rpc("console_auth_record_key", {
    p_member: session.memberId,
    p_credential_id: base64urlToByteaLiteral(verified.credentialId) as never,
    p_public_key: base64urlToByteaLiteral(verified.publicKey) as never,
    p_counter: verified.counter,
    p_transports: [...verified.transports],
    p_name: args.name,
    p_type: verified.keyType,
  });
  if (recorded.error) {
    // The unique index on credential_id is the real enforcement of "the same key twice is refused";
    // excludeCredentials only asks the browser nicely.
    if (recorded.error.message.includes("console_keys_credential_key")) {
      throw new AppError("INVALID_INPUT", m.alreadyAdded, { status: 409 });
    }
    throw ended();
  }
  const keyId = String(recorded.data);
  const keyCount = session.keyCount + 1;

  const activation = await service.rpc("console_auth_activate_member", { p_member: session.memberId });
  const activated = activation.data === true;

  // Registration requires a touch, so the new key has just been used: key-verifying the session
  // here is what lets "You're set up" lead straight to the console, with no extra tap.
  if (activated && !session.keyVerified) {
    await service.rpc("console_auth_verify_session", { p_session_id: session.sessionId, p_key_id: keyId });
  }

  await writeConsoleAudit(service, {
    actor: session.memberId,
    actorName: session.name,
    actorRole: session.role,
    keyId,
    sessionLabel: deviceLabel(args.req.headers.get("user-agent")),
    category: "session",
    action: "Added a key",
    target: args.name,
    result: "done",
    addressHash: consoleAddressHash(clientIp(null, args.req.headers.get("x-forwarded-for"))),
    after: { type: verified.keyType },
  });

  return { keyCount, activated };
}
```

Add to `src/console/messages/en-IN/keys.ts`:

```ts
  noKeysYet: "Add a security key before signing in with one.",
```

- [ ] **Step 5: Write the two routes**

Create `src/app/console/api/keys/options/route.ts`:

```ts
import { z } from "zod";
import { assertConsoleAvailable } from "@/console/availability";
import { beginCeremony } from "@/console/keys/ceremony";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

const body = z.object({ intent: z.enum(["sign_in", "add_key"]) }).strict();

/** Mints a challenge in the database and hands the browser the options that go with it (spec §D). */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    const { intent } = await readBody(req, body);
    const { step, options } = await beginCeremony({ intent, req });
    return jsonOk({ ok: true, step, options });
  } catch (err) {
    return jsonError(err);
  }
}
```

Create `src/app/console/api/keys/verify/route.ts`:

```ts
import { z } from "zod";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { assertConsoleAvailable } from "@/console/availability";
import { completeRegistration, completeSignIn, completeTap } from "@/console/keys/ceremony";
import { consoleMessages } from "@/console/messages";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

// The ceremony response is the library's own JSON shape: checked here only far enough to be
// routed, then verified for real inside the WebAuthn boundary.
const ceremonyResponse = z.custom<Record<string, unknown> & { id: string }>(
  (value) => typeof value === "object" && value !== null && typeof (value as { id?: unknown }).id === "string",
  { message: consoleMessages.keys.didNotAnswer },
);

const body = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("sign_in"), response: ceremonyResponse }).strict(),
  z.object({ intent: z.literal("add_key"), step: z.literal("tap"), response: ceremonyResponse }).strict(),
  z
    .object({
      intent: z.literal("add_key"),
      step: z.literal("register"),
      // console.keys checks 1..60 characters; refusing here keeps the database's own refusal for
      // the cases only it can see.
      name: z.string().trim().min(1).max(60),
      response: ceremonyResponse,
    })
    .strict(),
]);

export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    const parsed = await readBody(req, body);

    if (parsed.intent === "sign_in") {
      await completeSignIn({ req, response: parsed.response as unknown as AuthenticationResponseJSON });
      return jsonOk({ ok: true, next: "/" });
    }
    if (parsed.step === "tap") {
      const { options } = await completeTap({ req, response: parsed.response as unknown as AuthenticationResponseJSON });
      return jsonOk({ ok: true, step: "register", options });
    }
    const { keyCount, activated } = await completeRegistration({
      req,
      response: parsed.response as unknown as RegistrationResponseJSON,
      name: parsed.name,
    });
    return jsonOk({ ok: true, keyCount, activated, next: activated ? "/" : null });
  } catch (err) {
    return jsonError(err);
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/console tests/integration/console && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/console/keys src/console/auth/audit.ts src/console/auth/session.ts src/console/messages src/app/console/api/keys tests
git commit -m "feat(console): the key endpoints, and what each ceremony is allowed to prove"
```

---

### Task 9: The key step — signing in with a tap

**Files:**
- Create: `src/console/keys/client.ts`
- Create: `src/app/console/keys/page.tsx`
- Create: `src/app/console/keys/key-step.tsx`
- Modify: `src/console/messages/en-IN/keys.ts`
- Test: `tests/unit/console/keys/client.test.ts`, `tests/unit/console/keys/key-step.test.tsx`

**Interfaces:**
- Consumes: `POST /api/keys/options`, `POST /api/keys/verify` (Task 8); `apiRequest` from `@/services/api-client`; `SignedOutFrame`, `Plate`/`PlateHeader`, `Button`, `Field`, `Input`, `SweepBar` from the existing UI.
- Produces:
  - `keysUsable(): boolean` — whether this browser can do WebAuthn at all.
  - `tapToSignIn(): Promise<void>` — options, ceremony, verify. Throws `Error` with the line to show; a dismissed prompt throws nothing new (resolves to a cancelled marker).
  - `addKey(name: string): Promise<{ keyCount: number; activated: boolean }>` — walks tap-then-register when the server asks for a tap first.
  - `type CeremonyOutcome = { kind: "done" } | { kind: "cancelled" } | { kind: "failed"; message: string }`
  - `consoleMessages.keys` gains the key-step and Setup copy, transcribed from `docs/design/sheets/console/ConsoleSetup.dc.html` and `Main.dc.html`.

**Copy, word for word from the sheets** (do not reword):

| Key | Text | Sheet |
|---|---|---|
| `waiting` | `Waiting for your key…` | Main.dc.html (`tapLabel`) |
| `tap` | `Tap your key` | Main.dc.html (`tapLabel`) |
| `touching` | `Touch your key…` | ConsoleSetup.dc.html |
| `status` | `Touch your security key or approve on your device` | Main.dc.html (`statusText`) |
| `didNotAnswer` | `That key didn't answer. Try again.` | both |
| `notYours` | `This key isn't one of yours.` | Main.dc.html |
| `alreadyAdded` | `That key is already added. Use a different one.` | ConsoleSetup.dc.html |
| `unsupported` | `This browser can't use security keys. Try a current Chrome, Safari, Edge or Firefox.` | ConsoleSetup.dc.html |
| `nameLabel` | `Name this key` | ConsoleSetup.dc.html |
| `addKey` | `Add key` | ConsoleSetup.dc.html |
| `form` | `Form TC-03` | ConsoleSetup.dc.html |

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/console/keys/client.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startAuthentication = vi.fn();
const startRegistration = vi.fn();
vi.mock("@simplewebauthn/browser", () => ({ startAuthentication, startRegistration, browserSupportsWebAuthn: () => true }));

import { addKey, tapToSignIn } from "@/console/keys/client";

function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  startAuthentication.mockReset().mockResolvedValue({ id: "Y3JlZA" });
  startRegistration.mockReset().mockResolvedValue({ id: "bmV3" });
});

afterEach(() => vi.unstubAllGlobals());

describe("tapToSignIn", () => {
  it("asks for options, runs the ceremony and posts the result", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(answer({ ok: true, step: "tap", options: { challenge: "c" } }))
      .mockResolvedValueOnce(answer({ ok: true, next: "/" }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(tapToSignIn()).resolves.toEqual({ kind: "done" });
    expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: "c" } });
    expect(JSON.parse(String(fetchSpy.mock.calls[1]?.[1]?.body))).toEqual({ intent: "sign_in", response: { id: "Y3JlZA" } });
  });

  it("reports a dismissed prompt as cancelled, not as a failure worth a line", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ ok: true, step: "tap", options: {} })));
    startAuthentication.mockRejectedValue(Object.assign(new Error("cancelled"), { name: "NotAllowedError" }));
    await expect(tapToSignIn()).resolves.toEqual({ kind: "cancelled" });
  });

  it("passes the server's own message through", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ ok: false, code: "INVALID_INPUT", message: "This key isn't one of yours." }, 400)));
    await expect(tapToSignIn()).resolves.toEqual({ kind: "failed", message: "This key isn't one of yours." });
  });
});

describe("addKey", () => {
  it("registers straight away when the server asks for no tap", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(answer({ ok: true, step: "register", options: { challenge: "r" } }))
      .mockResolvedValueOnce(answer({ ok: true, keyCount: 1, activated: false, next: null }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(addKey("Blue key")).resolves.toEqual({ kind: "done", keyCount: 1, activated: false });
    expect(startRegistration).toHaveBeenCalledOnce();
    expect(startAuthentication).not.toHaveBeenCalled();
  });

  it("taps first when the server asks for one, and registers with what that returns", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(answer({ ok: true, step: "tap", options: { challenge: "t" } }))
      .mockResolvedValueOnce(answer({ ok: true, step: "register", options: { challenge: "r" } }))
      .mockResolvedValueOnce(answer({ ok: true, keyCount: 2, activated: true, next: "/" }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(addKey("iPhone")).resolves.toEqual({ kind: "done", keyCount: 2, activated: true });
    expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: "t" } });
    expect(startRegistration).toHaveBeenCalledWith({ optionsJSON: { challenge: "r" } });
  });

  it("surfaces the same-key refusal as the sheet words it", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(answer({ ok: true, step: "register", options: {} }))
      .mockResolvedValueOnce(answer({ ok: false, code: "INVALID_INPUT", message: "That key is already added. Use a different one." }, 409));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(addKey("Blue key")).resolves.toEqual({ kind: "failed", message: "That key is already added. Use a different one." });
  });
});
```

Create `tests/unit/console/keys/key-step.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tapToSignIn = vi.fn();
const keysUsable = vi.fn(() => true);
vi.mock("@/console/keys/client", () => ({ tapToSignIn, keysUsable, addKey: vi.fn() }));

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));

import { KeyStep } from "@/app/console/keys/key-step";

beforeEach(() => {
  tapToSignIn.mockReset().mockResolvedValue({ kind: "done" });
  replace.mockReset();
  keysUsable.mockReturnValue(true);
});

describe("the key step", () => {
  it("asks for the tap in the sheet's words", () => {
    render(<KeyStep />);
    expect(screen.getByRole("button", { name: "Tap your key" })).toBeEnabled();
    expect(screen.getByText("Touch your security key or approve on your device")).toBeVisible();
  });

  it("moves to the console once the tap verifies", async () => {
    render(<KeyStep />);
    await userEvent.click(screen.getByRole("button", { name: "Tap your key" }));
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("shows the failure and lets the member try again", async () => {
    tapToSignIn.mockResolvedValue({ kind: "failed", message: "That key didn't answer. Try again." });
    render(<KeyStep />);
    await userEvent.click(screen.getByRole("button", { name: "Tap your key" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That key didn't answer. Try again.");
    expect(screen.getByRole("button", { name: "Tap your key" })).toBeEnabled();
  });

  it("says nothing new when the member dismisses the prompt themselves", async () => {
    tapToSignIn.mockResolvedValue({ kind: "cancelled" });
    render(<KeyStep />);
    await userEvent.click(screen.getByRole("button", { name: "Tap your key" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says so when the browser cannot use keys at all", () => {
    keysUsable.mockReturnValue(false);
    render(<KeyStep />);
    expect(screen.getByRole("alert")).toHaveTextContent("This browser can't use security keys. Try a current Chrome, Safari, Edge or Firefox.");
    expect(screen.getByRole("button", { name: "Tap your key" })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/console/keys`
Expected: FAIL — neither module exists.

- [ ] **Step 3: Fill in the copy**

Replace `src/console/messages/en-IN/keys.ts` with the full table above, in the same `as const satisfies MessageTree` shape Task 7 started, keeping the keys it already has.

- [ ] **Step 4: Write the browser half**

Create `src/console/keys/client.ts`:

```ts
"use client";

import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { consoleMessages } from "@/console/messages";

const m = consoleMessages.keys;

export type CeremonyOutcome =
  | { readonly kind: "done" }
  | { readonly kind: "cancelled" }
  | { readonly kind: "failed"; readonly message: string };

export type AddKeyOutcome =
  | { readonly kind: "done"; readonly keyCount: number; readonly activated: boolean }
  | { readonly kind: "cancelled" }
  | { readonly kind: "failed"; readonly message: string };

/** Whether this browser can run a ceremony at all (the sheet's "can't use security keys" state). */
export function keysUsable(): boolean {
  return typeof window !== "undefined" && browserSupportsWebAuthn();
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok || payload.ok !== true) {
    throw new Error(typeof payload.message === "string" ? payload.message : m.didNotAnswer);
  }
  return payload;
}

/** A prompt the member dismissed is not a failure: it gets no line of its own. */
function isDismissal(err: unknown): boolean {
  return err instanceof Error && (err.name === "NotAllowedError" || err.name === "AbortError");
}

function failure(err: unknown): CeremonyOutcome {
  if (isDismissal(err)) return { kind: "cancelled" };
  return { kind: "failed", message: err instanceof Error && err.message ? err.message : m.didNotAnswer };
}

export async function tapToSignIn(): Promise<CeremonyOutcome> {
  try {
    const begun = await post("/api/keys/options", { intent: "sign_in" });
    const response = await startAuthentication({ optionsJSON: begun.options as never });
    await post("/api/keys/verify", { intent: "sign_in", response });
    return { kind: "done" };
  } catch (err) {
    return failure(err);
  }
}

export async function addKey(name: string): Promise<AddKeyOutcome> {
  try {
    const begun = await post("/api/keys/options", { intent: "add_key" });
    let registrationOptions = begun.options;

    // The server decides whether a tap comes first: it knows how many keys this member holds.
    if (begun.step === "tap") {
      const tap = await startAuthentication({ optionsJSON: begun.options as never });
      const unlocked = await post("/api/keys/verify", { intent: "add_key", step: "tap", response: tap });
      registrationOptions = unlocked.options;
    }

    const response = await startRegistration({ optionsJSON: registrationOptions as never });
    const done = await post("/api/keys/verify", { intent: "add_key", step: "register", name, response });
    return { kind: "done", keyCount: Number(done.keyCount ?? 0), activated: done.activated === true };
  } catch (err) {
    const outcome = failure(err);
    return outcome.kind === "cancelled" ? { kind: "cancelled" } : { kind: "failed", message: outcome.message };
  }
}
```

- [ ] **Step 5: Write the page and its client**

Create `src/app/console/keys/key-step.tsx` (a client component) rendering, inside the existing `Plate`/`PlateHeader`:

- the plate title `Your key` with `Form TC-03` in the header's second cell;
- the status line `Touch your security key or approve on your device` (the sheet's `statusText`);
- one `Button` labelled `Tap your key`, becoming `Waiting for your key…` and disabled while the ceremony runs;
- a `role="alert"` line for a failure, empty when there is none;
- on `{ kind: "done" }`, `router.replace("/")`;
- when `keysUsable()` is false, the unsupported line in the alert and the button disabled.

Follow `src/app/console/login/sign-in-form.tsx` for the shape: a discriminated `Stage` union, `useState`, no `let`, and the same focus handling. Keep it under 150 lines.

Create `src/app/console/keys/page.tsx`:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Mark } from "@/components/brand/mark";
import { requireLinkSession } from "@/console/keys/ceremony";
import { SignedOutFrame } from "@/console/components/signed-out-frame";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";
import { KeyStep } from "./key-step";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your key" };

/**
 * Step 3 of spec §C. Reaching this page means the link was opened and a console session exists;
 * it is not key-verified yet, so nothing else in the console is reachable from here.
 */
export default async function ConsoleKeysPage() {
  const session = await requireLinkSession().catch(() => null);
  if (!session) redirect(consoleHref("/login"));
  if (session.keyCount < 2) redirect(consoleHref("/setup"));
  if (session.keyVerified) redirect(consoleHref("/"));

  return (
    <SignedOutFrame>
      <span className="inline-flex">
        <Mark size={40} />
      </span>
      <h1 className="optical-hang mt-6 text-5xl tracking-display">{consoleMessages.keys.title}</h1>
      <p className="mt-3.5 text-base text-ink-2">{consoleMessages.keys.lead}</p>
      <div className="mt-8">
        <KeyStep />
      </div>
    </SignedOutFrame>
  );
}
```

Add `title` and `lead` to `src/console/messages/en-IN/keys.ts`, taken from the Setup sheet's "One key only" entry, which is the same moment: `title: "Console setup"` is wrong here — use `title: "Your key"` and `lead: "Tap your key to finish signing in."`. Note in a comment that this pairing is **not** on a drawn sheet, so 2d may replace it when the signed-in frame lands.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/console && npm run typecheck && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/console/keys src/console/messages src/app/console/keys tests/unit/console/keys
git commit -m "feat(console): the key step, and the browser half of every ceremony"
```

---

### Task 10: Setup — the first Owner's two keys

**Files:**
- Create: `src/console/setup/redeem.ts`
- Create: `src/app/console/api/setup/route.ts`
- Create: `src/app/console/setup/page.tsx`
- Create: `src/app/console/setup/setup-flow.tsx`
- Create: `src/app/console/setup/redeem-token.tsx`
- Test: `tests/unit/console/setup/redeem.test.ts`, `tests/integration/console/setup.test.ts`, `tests/unit/console/setup/setup-flow.test.tsx`

**Interfaces:**
- Consumes: `public.console_auth_setup_link`, `public.console_auth_redeem_setup_link` (Task 1 and 2b); `createConsoleDb`, `createConsoleServiceDb`; `startConsoleSession`; `addKey` (Task 9).
- Produces:
  - `setupTokenHash(token: string): string` — `\x…` sha256 hex, the shape `console.create_first_owner_link` stored.
  - `nameFromAddress(email: string): string` — `asha.rao@trakline.in` → `Asha Rao`.
  - `redeemSetupToken(args: { token, req }): Promise<{ ok: true } | { ok: false; reason: "expired" }>`
  - `POST /api/setup` `{ token }` → `{ ok: true }` or a 400 with the sheet's expired line.

**How the first Owner gets a session.** The one-time link comes out of the SQL editor (`console.create_first_owner_link`), which no role may call — it is the database owner's statement alone. Opening it proves possession, and that is the whole credential: the server reads the address off the live link row, mints and immediately verifies a magic link for it **server to server** (no email is sent), and only then redeems. That is why the drawn Setup sheet sends the First Owner straight to Step 1 with no inbox state, while the Invite entry has one.

**The name.** `create_first_owner_link` takes only an address, and no drawn field asks for a name, so the first Owner's name is derived from the address's local part: separators become spaces and each word is capitalised. Team (2d) can rename them.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/console/setup/redeem.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nameFromAddress, setupTokenHash } from "@/console/setup/redeem";

describe("setupTokenHash", () => {
  it("hashes the token the way create_first_owner_link stored it", () => {
    // console.create_first_owner_link stores digest(token, 'sha256'); PostgREST takes bytea as \x hex.
    expect(setupTokenHash("abc")).toBe("\\xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("is stable and case-sensitive, because the token is hex from the database", () => {
    expect(setupTokenHash("ABC")).not.toBe(setupTokenHash("abc"));
  });
});

describe("nameFromAddress", () => {
  it("makes a readable name out of the local part", () => {
    expect(nameFromAddress("asha.rao@trakline.in")).toBe("Asha Rao");
    expect(nameFromAddress("kiran_das@trakline.in")).toBe("Kiran Das");
    expect(nameFromAddress("rohan-iyer@trakline.in")).toBe("Rohan Iyer");
    expect(nameFromAddress("console@trakline.in")).toBe("Console");
  });

  it("always answers something the column will take", () => {
    expect(nameFromAddress("@trakline.in")).toBe("Owner");
    expect(nameFromAddress("x".repeat(200) + "@trakline.in").length).toBeLessThanOrEqual(120);
  });
});
```

Create `tests/integration/console/setup.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.fn();
const getClaims = vi.fn();
const createUser = vi.fn();
const generateLink = vi.fn();
const serviceRpc = vi.fn();

vi.mock("@/console/auth/db", () => ({
  createConsoleDb: () => Promise.resolve({ auth: { verifyOtp, getClaims } }),
  createConsoleServiceDb: () => ({ rpc: serviceRpc, auth: { admin: { createUser, generateLink } } }),
  CONSOLE_COOKIE_NAME: "sb-console-auth-token",
}));

const startConsoleSession = vi.fn(() => Promise.resolve());
vi.mock("@/console/auth/session", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  startConsoleSession,
}));

import { POST } from "@/app/console/api/setup/route";

const OWNER = "11111111-1111-1111-1111-111111111111";

function post(body: unknown): Request {
  return new Request("http://admin.localhost:4210/console/api/setup", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", host: "admin.localhost:4210" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  serviceRpc.mockImplementation((name: string) =>
    Promise.resolve({
      data:
        name === "console_auth_setup_link"
          ? { email: "asha.rao@trakline.in" }
          : name === "console_auth_redeem_setup_link"
            ? { user_id: OWNER, role: "owner", status: "setup" }
            : null,
      error: null,
    }),
  );
  createUser.mockResolvedValue({ data: { user: { id: OWNER } }, error: null });
  generateLink.mockResolvedValue({ data: { properties: { hashed_token: "hashed" } }, error: null });
  verifyOtp.mockResolvedValue({ data: { user: { id: OWNER, email: "asha.rao@trakline.in" } }, error: null });
  getClaims.mockResolvedValue({ data: { claims: { sub: OWNER, session_id: "22222222-2222-2222-2222-222222222222" } }, error: null });
});

describe("POST /api/setup", () => {
  it("signs the first Owner in and redeems the link in one go", async () => {
    const response = await POST(post({ token: "deadbeef" }));
    expect(response.status).toBe(200);
    expect(generateLink).toHaveBeenCalledWith(expect.objectContaining({ type: "magiclink", email: "asha.rao@trakline.in" }));
    expect(verifyOtp).toHaveBeenCalledWith({ type: "magiclink", token_hash: "hashed" });
    expect(serviceRpc).toHaveBeenCalledWith("console_auth_redeem_setup_link", expect.objectContaining({ p_user: OWNER, p_name: "Asha Rao" }));
    expect(startConsoleSession).toHaveBeenCalledOnce();
  });

  it("sends no email at all — the link out of the SQL editor is the whole credential", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await POST(post({ token: "deadbeef" }));
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("refuses a token with no live link, without signing anyone in", async () => {
    serviceRpc.mockImplementation(() => Promise.resolve({ data: null, error: null }));
    const response = await POST(post({ token: "deadbeef" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: "This invite has expired. Ask an Owner to send a new one." });
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("refuses when redemption returns nothing, because an Owner already exists", async () => {
    serviceRpc.mockImplementation((name: string) =>
      Promise.resolve({ data: name === "console_auth_setup_link" ? { email: "asha.rao@trakline.in" } : null, error: null }),
    );
    const response = await POST(post({ token: "deadbeef" }));
    expect(response.status).toBe(400);
    expect(startConsoleSession).not.toHaveBeenCalled();
  });

  it("refuses a token that is not hex, before touching the database", async () => {
    const response = await POST(post({ token: "not a token" }));
    expect(response.status).toBe(400);
    expect(serviceRpc).not.toHaveBeenCalled();
  });
});
```

Create `tests/unit/console/setup/setup-flow.test.tsx` covering the three drawn steps:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const addKey = vi.fn();
vi.mock("@/console/keys/client", () => ({ addKey, keysUsable: () => true, tapToSignIn: vi.fn() }));
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));

import { SetupFlow } from "@/app/console/setup/setup-flow";

beforeEach(() => {
  vi.clearAllMocks();
  addKey.mockResolvedValue({ kind: "done", keyCount: 1, activated: false });
});

describe("Setup", () => {
  it("opens on step 1 with the sheet's own words", () => {
    render(<SetupFlow keyCount={0} />);
    expect(screen.getByText("Step 1 of 3")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Add your first key" })).toBeVisible();
    expect(screen.getByText("A security key, or a passkey on this device. You'll add a second next, so losing one never locks you out.")).toBeVisible();
    expect(screen.getByLabelText("Name this key")).toBeVisible();
  });

  it("moves to step 2 once the first key is added", async () => {
    render(<SetupFlow keyCount={0} />);
    await userEvent.type(screen.getByLabelText("Name this key"), "YubiKey 5C");
    await userEvent.click(screen.getByRole("button", { name: "Add key" }));
    expect(await screen.findByRole("heading", { name: "Add a second key" })).toBeVisible();
    expect(screen.getByText("Step 2 of 3")).toBeVisible();
    expect(screen.getByText("Use a different key, or a passkey on another device.")).toBeVisible();
  });

  it("opens on step 2 for a member who already has one key", () => {
    render(<SetupFlow keyCount={1} />);
    expect(screen.getByRole("heading", { name: "Add a second key" })).toBeVisible();
  });

  it("reaches step 3 and offers the console", async () => {
    addKey.mockResolvedValue({ kind: "done", keyCount: 2, activated: true });
    render(<SetupFlow keyCount={1} />);
    await userEvent.type(screen.getByLabelText("Name this key"), "iPhone");
    await userEvent.click(screen.getByRole("button", { name: "Add key" }));
    expect(await screen.findByRole("heading", { name: "You're set up" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Open the console" })).toBeEnabled();
  });

  it("refuses to add a key with no name", async () => {
    render(<SetupFlow keyCount={0} />);
    await userEvent.click(screen.getByRole("button", { name: "Add key" }));
    expect(addKey).not.toHaveBeenCalled();
  });

  it("shows the same-key refusal where the sheet shows it", async () => {
    addKey.mockResolvedValue({ kind: "failed", message: "That key is already added. Use a different one." });
    render(<SetupFlow keyCount={1} />);
    await userEvent.type(screen.getByLabelText("Name this key"), "YubiKey 5C");
    await userEvent.click(screen.getByRole("button", { name: "Add key" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That key is already added. Use a different one.");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/console/setup tests/integration/console/setup.test.ts`
Expected: FAIL — none of the modules exist.

- [ ] **Step 3: Write the redemption helpers**

Create `src/console/setup/redeem.ts`:

```ts
import { createHash } from "node:crypto";

/**
 * `console.create_first_owner_link` stores `digest(token, 'sha256')`, and PostgREST takes a bytea
 * argument as a `\x…` hex literal. This is that shape.
 */
export function setupTokenHash(token: string): string {
  return `\\x${createHash("sha256").update(token).digest("hex")}`;
}

/**
 * The first Owner's name. `create_first_owner_link` takes only an address and no drawn field asks
 * for a name, so it is derived: the local part, separators to spaces, each word capitalised. Team
 * (2d) can rename them afterwards.
 */
export function nameFromAddress(email: string): string {
  const local = email.split("@")[0] ?? "";
  const words = local
    .split(/[._-]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return (words.length > 0 ? words.join(" ") : "Owner").slice(0, 120);
}
```

- [ ] **Step 4: Write the setup route**

Create `src/app/console/api/setup/route.ts`. The order matters and is the same read-check-then-spend the database uses:

1. `assertConsoleAvailable()`, `assertSameOrigin(req)`, parse `{ token: z.string().regex(/^[0-9a-f]{64}$/) }` — the token is 32 random bytes as hex.
2. `console_auth_setup_link(setupTokenHash(token))` → `{ email }`, or refuse with `consoleMessages.setup.expired`.
3. `auth.admin.createUser({ email, email_confirm: true })`, ignoring an "already registered" error.
4. `auth.admin.generateLink({ type: "magiclink", email })` → `hashed_token`.
5. On the **cookie-bound** client: `verifyOtp({ type: "magiclink", token_hash })`. This is what sets the console cookie.
6. Read the claims; require a `session_id` and a `sub`.
7. `console_auth_redeem_setup_link(hash, sub, email, nameFromAddress(email), consoleEnvironment())`. A `null` answer means the console already has an Owner, or the link was spent between steps 2 and 7: sign the Supabase session out again and refuse.
8. `startConsoleSession({ sessionId, member: sub, userAgent, ip, db: service })`.
9. `jsonOk({ ok: true })`.

Wrap every step in the route's `try` and answer through `jsonError`. Nothing here may say whether an address exists: this endpoint is reachable only with a 64-hex token that the database is holding.

- [ ] **Step 5: Write the pages**

`src/app/console/setup/page.tsx` (server component):

- `searchParams` carries `token`. When it is present, render `<RedeemToken token={token} />` inside `SignedOutFrame` — a client component that POSTs once to `/api/setup` and then calls `router.replace("/setup")`. While it works, show the plate with `Form TC-03` and the arrival copy; on failure show `This invite has expired. Ask an Owner to send a new one.`
- With no token, call `requireLinkSession()`. No session → `redirect(consoleHref("/login"))`. A session with two keys already → `redirect(consoleHref("/"))`. Otherwise render the head copy for the First Owner entry (`Set up the Trakline console` / `You'll be its first Owner. The link works once.`) and `<SetupFlow keyCount={session.keyCount} />`.

`src/app/console/setup/setup-flow.tsx` (client component), transcribing ConsoleSetup.dc.html's three steps:

| Step | Heading | Lead | Control |
|---|---|---|---|
| 1 (0 keys) | `Add your first key` | `A security key, or a passkey on this device. You'll add a second next, so losing one never locks you out.` | `Name this key` + `Add key` |
| 2 (1 key) | `Add a second key` | `Use a different key, or a passkey on another device.` | `Name this key` + `Add key`, with the legend `You'll tap <first key> first, then the new key.` |
| 3 (2 keys) | `You're set up` | — | `Open the console` → `router.replace("/")` |

Each step shows `Step N of 3` as its kicker and `Form TC-03` in the plate header. While a ceremony runs, the button reads `Touch your key…` and is disabled. A failure goes in a `role="alert"` under the field. Keep the file under 220 lines; if it grows past that, split the added-key list into its own component.

Add `src/console/messages/en-IN/setup.ts` with every string in the table plus `expired: "This invite has expired. Ask an Owner to send a new one."`, `withdrawn: "This invite was withdrawn."`, `added: "Added"`, `open: "Open the console"`, and register it in `src/console/messages/index.ts`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/console tests/integration/console && npm run typecheck && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/console/setup src/console/messages src/app/console/setup src/app/console/api/setup tests
git commit -m "feat(console): the first Owner's setup, with two keys and no email"
```

---

### Task 11: Sign out, and the seat 2d replaces

**Files:**
- Create: `src/app/console/api/sign-out/route.ts`
- Create: `src/app/console/signed-in.tsx`
- Modify: `src/app/console/page.tsx`
- Test: `tests/integration/console/sign-out.test.ts`, `tests/unit/console/signed-in.test.tsx`

**Interfaces:**
- Consumes: `requireConsoleMember` (Task 3), `endConsoleSession` (Task 6), `createConsoleDb`.
- Produces: `POST /api/sign-out` → `{ ok: true }`, having revoked the console session row **and** signed the Supabase session out so the cookie goes.

The page this task adds is a placeholder by design: the drawn frame (B2's `Main.dc.html`) is 2d's work, and inventing half of it now would be thrown away. It shows the masthead, who is signed in, and Sign out — enough for the end-to-end run to prove the journey ends somewhere real.

- [ ] **Step 1: Write the failing tests**

Create `tests/integration/console/sign-out.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn(() => Promise.resolve({ error: null }));
const getClaims = vi.fn();
const serviceRpc = vi.fn(() => Promise.resolve({ data: null, error: null }));

vi.mock("@/console/auth/db", () => ({
  createConsoleDb: () => Promise.resolve({ auth: { signOut, getClaims } }),
  createConsoleServiceDb: () => ({ rpc: serviceRpc }),
  CONSOLE_COOKIE_NAME: "sb-console-auth-token",
}));

import { POST } from "@/app/console/api/sign-out/route";

function post(headers: Record<string, string> = {}): Request {
  return new Request("http://admin.localhost:4210/console/api/sign-out", {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin", host: "admin.localhost:4210", ...headers },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getClaims.mockResolvedValue({ data: { claims: { sub: "u", session_id: "22222222-2222-2222-2222-222222222222" } }, error: null });
});

describe("POST /api/sign-out", () => {
  it("revokes the console session row and ends the Supabase session", async () => {
    const response = await POST(post());
    expect(response.status).toBe(200);
    expect(serviceRpc).toHaveBeenCalledWith("console_auth_revoke_session", { p_session_id: "22222222-2222-2222-2222-222222222222" });
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("still clears the cookie when there is no session row to revoke", async () => {
    getClaims.mockResolvedValue({ data: { claims: {} }, error: null });
    const response = await POST(post());
    expect(response.status).toBe(200);
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("refuses a cross-site post", async () => {
    const response = await POST(post({ "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(signOut).not.toHaveBeenCalled();
  });
});
```

Create `tests/unit/console/signed-in.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

import { SignedIn } from "@/app/console/signed-in";

describe("the signed-in seat", () => {
  it("says who is signed in, and offers the way out", () => {
    render(<SignedIn name="Asha Rao" role="owner" />);
    expect(screen.getByText("Asha Rao")).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/integration/console/sign-out.test.ts tests/unit/console/signed-in.test.tsx`
Expected: FAIL — neither module exists.

- [ ] **Step 3: Write the sign-out route**

Create `src/app/console/api/sign-out/route.ts`: `assertConsoleAvailable()`, `assertSameOrigin(req)`, read the claims from the cookie-bound client, call `endConsoleSession(sessionId)` when there is one, then `db.auth.signOut()` — in that order, so the row is revoked even if clearing the cookie fails. Answer `jsonOk({ ok: true })`.

- [ ] **Step 4: Write the seat**

Create `src/app/console/signed-in.tsx` — a client component with the member's name, their role as a tag, and a Sign out button that POSTs to `/api/sign-out` and then `router.replace("/login")`. Head the file with a comment naming it as the placeholder 2d replaces with `Main.dc.html`'s frame.

Modify `src/app/console/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { requireConsoleMember } from "@/console/auth/guard";
import { SignedOutFrame } from "@/console/components/signed-out-frame";
import { consoleHref } from "@/console/href";
import { SignedIn } from "./signed-in";

export const dynamic = "force-dynamic";

/**
 * The console's home. Plan 2d replaces this with the drawn frame and Overview; for now it is the
 * proof that the sign-in journey ends somewhere a member can see.
 */
export default async function ConsoleHome() {
  const member = await requireConsoleMember().catch(() => null);
  if (!member) redirect(consoleHref("/login"));
  return (
    <SignedOutFrame>
      <SignedIn name={member.name} role={member.role} />
    </SignedOutFrame>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:unit && npm run typecheck && npm run lint && npm run build`
Expected: PASS. Report the suite's own totals.

- [ ] **Step 6: Commit**

```bash
git add src/app/console tests
git commit -m "feat(console): signing out, and a signed-in seat the frame will replace"
```

---

### Task 12: The end-to-end run, with a virtual key

**Files:**
- Create: `playwright.console.config.ts`
- Create: `scripts/console-e2e.mjs`
- Create: `tests/e2e/console-auth/fixtures.ts`
- Create: `tests/e2e/console-auth/setup.spec.ts`
- Create: `tests/e2e/console-auth/sign-in.spec.ts`
- Create: `docs/runbooks/console-keys.md`
- Modify: `package.json`, `.github/workflows/ci.yml`, `docs/architecture.md`, `docs/onboarding.md`

**Interfaces:**
- Consumes: everything above, plus the local Supabase stack and `psql` on port 54322.
- Produces: `npm run test:e2e:console`, and a CI step that runs it after `supabase test db`.

**Why a second config.** The existing `playwright.config.ts` deliberately blanks `NEXT_PUBLIC_SUPABASE_URL` so the traveller run never reaches a real project, and Next allows one dev server per project at a time. The console-auth run needs the opposite: a real local Supabase, a service key, and `E2E=1`. So it gets its own config on its own port, run after the first.

- [ ] **Step 1: Write the failing specs**

Create `tests/e2e/console-auth/fixtures.ts`:

```ts
import { test as base, type Page } from "@playwright/test";

export interface VirtualKey {
  readonly id: string;
  remove(): Promise<void>;
}

/**
 * Chromium's virtual authenticator, over CDP. `automaticPresenceSimulation` makes it answer every
 * prompt, and `isUserVerified` makes it claim the touch our options only prefer.
 */
export async function addVirtualKey(page: Page, transport: "usb" | "internal" = "usb"): Promise<VirtualKey> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport,
      hasResidentKey: false,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return {
    id: authenticatorId,
    remove: () => cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId }).then(() => undefined),
  };
}

/** The letters the console captured since the last read (src/app/console/api/test-outbox). */
export async function readOutbox(page: Page, to?: string): Promise<readonly { to: string; subject: string; text: string }[]> {
  // Always ask for one address when you have one: an unfiltered read drains the whole outbox, so
  // two specs signing in at once would each be able to swallow the other's letter. With `to`, the
  // route hands back only that address's letters and puts the rest back.
  const path = to ? `/api/test-outbox?to=${encodeURIComponent(to)}` : "/api/test-outbox";
  const response = await page.request.get(path);
  const body = (await response.json()) as { letters?: { to: string; subject: string; text: string }[] };
  return body.letters ?? [];
}

const DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function sql(statement: string): string {
  return execFileSync("psql", [DB, "-t", "-A", "-c", statement], { encoding: "utf8" }).trim();
}

/**
 * A console with no Owner. `console.create_first_owner_link` refuses to issue a link once one
 * exists, so every test that sets an Owner up needs the console emptied first. Deleting members
 * cascades to their keys, sessions and challenges; the audit log is untouched, because it holds no
 * foreign keys at all -- which is exactly what 2b built it for.
 */
export function resetConsole(): void {
  sql("delete from console.members; delete from console.setup_links;");
}

/** The one statement spec §8 says only the owner runs, here run by the test instead. */
export function firstOwnerLink(email: string, baseUrl: string): string {
  return sql(`select console.create_first_owner_link('${email}', '${baseUrl}')`);
}

/** The whole first-Owner journey through the UI, for a fresh address. Returns that address. */
export async function setUpFirstOwner(page: Page, baseUrl: string): Promise<string> {
  const email = `owner-${Date.now()}-${Math.floor(Math.random() * 1e6)}@trakline.in`;
  await addVirtualKey(page, "usb");
  await page.goto(firstOwnerLink(email, baseUrl));
  await page.getByLabel("Name this key").fill("YubiKey 5C");
  await page.getByRole("button", { name: "Add key" }).click();
  await page.getByRole("heading", { name: "Add a second key" }).waitFor();
  // A second authenticator, because the same key twice must be refused.
  await addVirtualKey(page, "internal");
  await page.getByLabel("Name this key").fill("iPhone");
  await page.getByRole("button", { name: "Add key" }).click();
  await page.getByRole("button", { name: "Open the console" }).click();
  return email;
}

export const test = base;
export { expect } from "@playwright/test";
```

`fixtures.ts` also needs `import { execFileSync } from "node:child_process";` at the top.

Create `tests/e2e/console-auth/setup.spec.ts`:

```ts
import { addVirtualKey, expect, firstOwnerLink, resetConsole, test } from "./fixtures";

const BASE = "http://admin.localhost:4211";

test.beforeEach(() => resetConsole());

test("the first Owner sets up with two keys and lands in the console", async ({ page, baseURL }) => {
  const email = `owner-${Date.now()}@trakline.in`;
  await addVirtualKey(page, "usb");
  await page.goto(firstOwnerLink(email, baseURL ?? BASE));

  await expect(page.getByText("Step 1 of 3")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add your first key" })).toBeVisible();
  await page.getByLabel("Name this key").fill("YubiKey 5C");
  await page.getByRole("button", { name: "Add key" }).click();

  await expect(page.getByRole("heading", { name: "Add a second key" })).toBeVisible();
  // A second authenticator, because §D says the same key twice must be refused.
  await addVirtualKey(page, "internal");
  await page.getByLabel("Name this key").fill("iPhone");
  await page.getByRole("button", { name: "Add key" }).click();

  await expect(page.getByRole("heading", { name: "You're set up" })).toBeVisible();
  await page.getByRole("button", { name: "Open the console" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("the same key twice is refused", async ({ page, baseURL }) => {
  const email = `owner-same-${Date.now()}@trakline.in`;
  await addVirtualKey(page, "usb");
  await page.goto(firstOwnerLink(email, baseURL ?? BASE));
  await page.getByLabel("Name this key").fill("YubiKey 5C");
  await page.getByRole("button", { name: "Add key" }).click();

  await expect(page.getByRole("heading", { name: "Add a second key" })).toBeVisible();
  // No second authenticator this time: the only key present is the one already added.
  await page.getByLabel("Name this key").fill("YubiKey 5C again");
  await page.getByRole("button", { name: "Add key" }).click();
  await expect(page.getByRole("alert")).toContainText("That key is already added. Use a different one.");
});

test("a setup link works once", async ({ page, baseURL }) => {
  const email = `owner-once-${Date.now()}@trakline.in`;
  const link = firstOwnerLink(email, baseURL ?? BASE);
  await addVirtualKey(page);
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Add your first key" })).toBeVisible();

  const second = await page.context().newPage();
  await second.goto(link);
  await expect(second.getByText("This invite has expired. Ask an Owner to send a new one.")).toBeVisible();
});
```

The middle test is the one that proves the unique index does the work: `excludeCredentials` asks the browser not to offer a key already registered, and Chromium's virtual authenticator honours it — so the ceremony either fails in the browser or the database refuses it. Either way the member sees the sheet's line. If the browser refuses before the request is made, assert the same line from the browser path rather than weakening the assertion.

Create `tests/e2e/console-auth/sign-in.spec.ts`:

```ts
import { expect, readOutbox, resetConsole, setUpFirstOwner, test } from "./fixtures";

const BASE = "http://admin.localhost:4211";

test.beforeEach(() => resetConsole());

/** Follows the one sign-in link sent to `email`, or fails saying what was there instead. */
async function openTheLink(page: Parameters<typeof readOutbox>[0], email: string): Promise<void> {
  await expect.poll(async () => (await readOutbox(page, email)).length, { timeout: 10_000 }).toBeGreaterThan(0);
  const [letter] = await readOutbox(page, email);
  expect(letter?.subject).toBe("Your Trakline console sign-in link");
  const link = /https?:\/\/\S+\/auth\/confirm\S+/.exec(letter?.text ?? "")?.[0];
  expect(link, `no confirm link in: ${letter?.text}`).toBeTruthy();
  await page.goto(String(link));
}

test("a member signs out and back in with the link and a tap", async ({ page, baseURL }) => {
  const email = await setUpFirstOwner(page, baseURL ?? BASE);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Console sign in" })).toBeVisible();

  await readOutbox(page, email); // drain anything setup left behind for this address
  await page.getByLabel("Console email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

  await openTheLink(page, email);
  await page.getByRole("button", { name: "Tap your key" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("the link alone opens nothing: without a tap the console stays shut", async ({ page, baseURL }) => {
  const email = await setUpFirstOwner(page, baseURL ?? BASE);
  await page.getByRole("button", { name: "Sign out" }).click();
  await readOutbox(page, email);
  await page.getByLabel("Console email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await openTheLink(page, email);

  // The link session exists but is not key-verified, so the console's home sends it back.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Console sign in" })).toBeVisible();
});

test("a stranger's address gets the same answer and no letter", async ({ page }) => {
  const stranger = `stranger-${Date.now()}@example.com`;
  await page.goto("/login");
  await page.getByLabel("Console email").fill(stranger);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("If this address belongs to a console member, a sign-in link is on its way.")).toBeVisible();
  // The send runs in after(), so give it longer than it could possibly need before saying nothing came.
  await page.waitForTimeout(2000);
  expect(await readOutbox(page, stranger)).toEqual([]);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test:e2e:console`
Expected: FAIL — the script and the config do not exist yet.

- [ ] **Step 3: Write the config**

Create `playwright.console.config.ts`: `testDir: "tests/e2e/console-auth"`, one project (`console-auth`, Desktop Chrome, 1280×800, `baseURL: http://admin.localhost:4211`), `fullyParallel: false` (the console has one first Owner), `workers: 1`, and a `webServer` on port **4211** — a different port from the traveller run's 4210, so the two never reuse each other's server — with:

```ts
    env: {
      PNR_SOURCE: "fixture",
      NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL ?? "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY ?? "",
      E2E: "1",
      E2E_NOW: process.env.E2E_NOW ?? "2026-09-17T06:30:00.000Z",
    },
```

`reuseExistingServer: !process.env.CI`, `timeout: 120_000`.

Also add `http://admin.localhost:4211/**` to the local `additional_redirect_urls` in `supabase/config.toml` (alongside the 4210 entry Task 1 added), since `generateLink` validates `redirectTo` against that list.

- [ ] **Step 4: Write the runner**

Create `scripts/console-e2e.mjs`: read `npx supabase@2.117.0 status -o env`, parse `API_URL`, `PUBLISHABLE_KEY` and `SECRET_KEY` out of it, put them in the environment as `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`, then spawn `npx playwright test --config playwright.console.config.ts` with `stdio: "inherit"` and exit with its code. Fail with a readable message when the stack is not running.

These are the local stack's well-known development keys. **Never print them, never write them to a file, and never let them reach a commit.**

Add to `package.json`:

```json
    "test:e2e:console": "node scripts/console-e2e.mjs",
```

and extend `test:all` to `npm run test:unit && npm run test:e2e && npm run test:e2e:console`.

- [ ] **Step 5: Wire CI**

In `.github/workflows/ci.yml`'s `e2e` job, after the existing `npx playwright test` step, add:

```yaml
      - name: Console end-to-end
        run: npm run test:e2e:console
```

The stack the job already starts is the one the run needs, and `psql` is present on `ubuntu-24.04`. Confirm it is with `psql --version` in the same step if the run cannot connect.

- [ ] **Step 6: Run the whole thing**

```bash
npm run db:reset
npm run test:e2e:console
```

Expected: PASS. Then run the traveller suite unchanged to prove nothing regressed:

```bash
npm run test:e2e
```

Report both runs' own totals.

- [ ] **Step 7: Write the runbook and the notes**

Create `docs/runbooks/console-keys.md` — the one SQL statement spec §D promises for a last Owner who has lost both keys, plus the first-Owner link statement and what to do when a setup link is lost. No secrets, no addresses.

Update `docs/architecture.md` with the console's auth shape (two cookies, one project; the guard; where WebAuthn lives) and `docs/onboarding.md` with how to run the console locally and the console e2e.

- [ ] **Step 8: Commit**

```bash
git add playwright.console.config.ts scripts/console-e2e.mjs tests/e2e/console-auth supabase/config.toml package.json .github/workflows/ci.yml docs
git commit -m "test(console): the sign-in and setup journeys, end to end with a virtual key"
```

---

## Self-review notes

Run before the final whole-branch review:

1. `npm run check` (typecheck, lint, unit and integration, build) — green.
2. `npm run db:test` — green, and its own reported total is what goes in the PR body.
3. `npm run test:e2e` and `npm run test:e2e:console` — both green.
4. `grep -rln "@simplewebauthn/server" src` — exactly one file.
5. `grep -rn "@/console/" src --include=*.ts --include=*.tsx | grep -v "^src/console/\|^src/app/console/\|^src/proxy.ts\|^src/app/global-not-found.tsx"` — empty.
6. `git log --format=%B main..HEAD | grep -c "Co-Authored-By"` — zero.
7. Every file under 500 lines: `find src -name "*.ts*" -exec wc -l {} + | sort -rn | head`.
