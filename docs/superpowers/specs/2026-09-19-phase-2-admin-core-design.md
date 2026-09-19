# Phase 2 — Admin core: design

Date: 2026-09-19 · Status: **draft for review** · Owner: Vibin Mathew

Phase 2 is step three of the roadmap: foundations → design brief → **admin core** → provider operations → leads, users and privacy → traveller features → design pass → launch checks. It builds the console at admin.trakline.in from the approved drawings (B0 and B2 in `docs/design/sheets/console/`), and what travellers see when the console changes something (Notices in `docs/design/sheets/traveller/`).

## 1. Scope

**In:**
- The console frame: environment strip, masthead, notice strip, rail, page header (B0).
- Console sign-in, setup and security keys; console sessions.
- Modules:
  - 01 Overview: Service now, Urgent actions (Pause PNR checks), Checks today, Quota this month, Recent actions.
  - 11 Switches & settings.
  - 13 Team.
  - 14 Audit log (B0), with CSV export.
  - My keys.
- Runtime settings that take effect without a deploy: PNR checks, primary source, fallback, new accounts, traveller passkeys, site notice, checks per address, live checks per day.
- The traveller side (Notices): the site notice strip, paused check plates, the paused and busy result plates, the status lines, and closed sign-ups. Public sign-in moves to a server route.
- /pnr and /login transcribed from B1: dates read "Sep".
- New counters for Overview, and Security emails to every Owner.

**Out:** the other modules (02–10, 12) and Overview's Queues, People and Open incident plates arrive with their phases, and their rail items stay hidden until then. Also out: a console on previews or a staging project, an authenticator-app fallback, and localising the console.

## 2. Decisions taken

From the roadmap (2026-09-18) and the approved brief (2026-09-19):
- The console is `admin.<domain>` on the same app and deploy, with its own session and dedicated member addresses. Four roles, as in the brief's §6. Every request re-checks the role.
- Sign-in is an email link, then a key tap. Every member enrols two keys.
- Risky actions need a reason and a fresh tap, and each tap approves exactly one action (brief §7). Everything is written to the audit log, which is append-only at the database level.
- Security approach A: Postgres enforces roles, the server guards every request, and the secret key is used only for auth-level work.

Decided on 2026-09-19 for this spec:
1. **Keys are checked on our server** with `@simplewebauthn/server`. Supabase's WebAuthn MFA isn't used, for three reasons: verifying a factor logs out every other session, a tap can't be bound to one action, and TOTP is already on in production, so `aal2` doesn't prove a key tap. No authenticator-app fallback.
2. **The console runs only in production**, plus local development against a local database. Previews use the production Supabase project, so they get no console.
3. **A local Supabase in Docker** serves development (colima on the Mac) and CI.

## 3. Design

### A. One app, two hosts

Next 16 replaces middleware with `src/proxy.ts`, which runs on Node only (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`).

**Route tree.** There are two root layouts. Both trees want `/` and `/login`, so the console lives in a real folder that the host maps onto.
- `src/app/(site)/` holds today's root layout and every traveller page, moved as they are.
- `src/app/console/` has its own root layout (its own `<html>`, fonts, providers, no AppShell) and every console page, plus its route handlers under `src/app/console/api/`.
- Traveller route handlers (`api/`, `auth/`, `check/`) stay where they are. `global-error`, `manifest`, `robots` and the icons stay at the app root.
- Each tree has a catch-all (`[...missing]`) that calls `notFound()`, so an unmatched URL shows that tree's own not-found page, with no experimental flag.

**The proxy.** The host is read from the `Host` header: lower-cased, without the port. `request.nextUrl` reads `localhost` under `next dev`, so it can't be used.
- **On a console host:**
  - `/x` is rewritten to `/console/x`, and direct `/console/…` requests answer 404.
  - `robots.txt` answers `Disallow: /`; `sw.js` and the manifest answer 404.
  - The Supabase session is refreshed under the console cookie name.
  - A fresh nonce CSP is set on the request and the response.
- **On any other host,** `/console/*` answers 404, and everything else is as today.
- **Console hosts** are `admin.trakline.in` in production and `admin.localhost` locally (`CONSOLE_HOST`). Matcher host values are escaped and anchored.
- **Prefetches are rewritten too;** skipping them, as the CSP guide's example does, would break the console.

**Headers.** `next.config.ts` splits its rules by host.
- **Traveller hosts** (`missing` the console host) keep today's CSP and headers.
- **The console host** gets:
  - `X-Robots-Tag: noindex, nofollow, noarchive`
  - `Referrer-Policy: no-referrer`
  - `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy: same-origin`
  - frame denial
  - a `Permissions-Policy` that allows `publickey-credentials-get` and `-create` for itself
- **The console CSP** (set in the proxy only, so a host never gets two policies):
  - `script-src 'self' 'nonce-…' 'strict-dynamic'`, plus a hash of the shared `global-error` theme script
  - `style-src 'self' 'unsafe-inline'`: nonces can't cover `style=""` attributes, and Sonner injects styles without a nonce
  - `connect-src 'self'` plus Supabase
  - `frame-ancestors 'none'`, `base-uri 'none'`, `object-src 'none'`, `form-action 'self'`
  - the production `report-uri` to Sentry, as today
- **Console pages render dynamically,** which nonces require. The console never enables Partial Prerendering or `cacheComponents`.

**Requests.** The console has no Server Actions (their IDs are global across both trees). Every console route handler:
- accepts only same-origin requests (`Sec-Fetch-Site: same-origin`, or a matching `Origin`)
- takes JSON
- answers through `jsonOk` / `jsonError`

Console links go through a small `consoleHref()` helper, because `typedRoutes` knows them only as `/console/…`.

**Where the console refuses to run.**
- A non-production deployment shows "The console runs only in production".
- A local server pointed at the hosted Supabase project shows "Point the app at a local Supabase to use the console".
- So localhost can't act on real data.

### B. Where console code lives

- **Console-only code** lives in `src/console/`: components, messages (`src/console/messages/en-IN/*`, a `MessageTree` like the site's) and server services.
- **Pages** in `src/app/console/` import from `@/console/*`.
- **Provider names** (RailKit, RapidAPI) may appear only under `src/console/`. The traveller privacy test already scans `src/app`, so console page files never contain them.
- **A new contract test** fails if anything outside `src/console` and `src/app/console` imports `@/console/*`.
- **Shared primitives** in `src/components/ui` are reused, with the new variants the drawings need:
  - Badge: readable-steel outline and caps
  - Led: half and ringed forms
  - dense table, meter, segmented control, record drawer, bottom sheet with footer, and the Confirm it's you dialog
- `industry.css` maps each drawn class to the component it mirrors.

### C. Identity, sign-in and sessions

**Identity.** A member is a Supabase Auth user with a dedicated address, plus a row in `console.members`.
- An address that already has a traveller account can't be invited.
- A member's address can't sign in on trakline.in: it gets the same "check your inbox" reply, and no link is sent.

**Console sign-in (TC-02).**
1. `POST /api/sign-in` gives one answer for every address. For a member only, it:
   - makes a link with `auth.admin.generateLink({ type: "magiclink" })`
   - sends it from `console@trakline.in` through Resend
   - limits sends to 5 an hour per address and 20 an hour per connection, answering "Too many sign-in requests. Try again in 10 minutes." past the limit
2. `GET /auth/confirm` calls `verifyOtp` and starts a console session, not yet key-verified. It opens the key step, or Setup for a member with fewer than two keys.
3. The key step signs a server challenge. When it verifies, the session is marked key-verified and Overview opens.

**Sessions.**
- The Supabase session uses its own cookie name (`sb-console-auth-token`), host-only as always. `@supabase/ssr` forces a 400-day cookie, so lifetime is enforced by our own row.
- `console.sessions` is keyed by the JWT's `session_id`. It records:
  - the key tap and the key used
  - a device label ("Chrome on macOS")
  - an address hash
  - the last time the session was used
  - when it expires
  - whether it was revoked
- A session ends after 24 hours unused, or 7 days after its key tap.
- Sign out revokes it. My keys' "Sign out other sessions" revokes the member's others.
- A role change, keys reset or removal revokes all of that member's sessions at once. The next request shows "Your session ended. Sign in again."

**The guard.** Every console request and route handler runs `requireConsoleMember()` in this order:
1. The claims verify.
2. The session is key-verified, current and not revoked.
3. The member is active.
4. The role allows the module.

A failure answers "session ended" (401) or the no-access plate (403). Viewers get roles instead of names ("by an Owner").

### D. Security keys, checked on our server

- **Libraries:** `@simplewebauthn/server` and `@simplewebauthn/browser`, version 14. Attestation `none`. Resident keys are discouraged, because the email link has already said who is signing in and a security key's slots are few. User verification is preferred (a touch is enough).
- **Scope:** the RP ID is the console host (`admin.trakline.in`; `admin.localhost` locally), and the origin is checked exactly. So a console key can't be used from trakline.in, and a trakline.in passkey never counts.
- **`console.keys`** stores, per key: the credential ID, public key, counter, transports, name, type and dates.
  - The type is "Passkey" for a synced or platform credential, and "Security key" otherwise.
- **Challenges:** made on the server, single-use, expiring after 5 minutes. Each is bound to its member, session and purpose (sign in, add a key, or one action).
- **Enrolment:**
  - Setup's first key needs only the signed-in link session.
  - Every later key starts with a tap of an existing key.
  - The same key twice is refused.
  - A key can't be removed if that would leave fewer than two.
- **Per-action taps (Confirm it's you, TC-01), in order:**
  1. The browser asks for options, sending the action, its target, the new value and the reason.
  2. The server stores a digest of exactly those four with the challenge.
  3. The member taps.
  4. The server verifies the tap and records it.
  5. The action runs, in the database. The database recomputes the digest from its own arguments, and uses the tap once. A tap can't approve a different action, or the same action twice.
- **Failed taps** are logged ("Key tap failed"). Three in 10 minutes send a Security email.
- **If you lose your keys:** another Owner resets them. The last Owner's keys are reset from the Supabase dashboard; `docs/runbooks/console-keys.md` gives the one SQL statement.

### E. Data

A new private schema, `console`, isn't exposed through the Data API. Its tables are:

| Table | Holds |
|---|---|
| `members` | user ID, email, name, role (owner, admin, support, viewer), status (setup, active, removed), who invited them, keys-reset time and by whom |
| `invites` | email, role, invited by, token hash, sent, expires (7 days), accepted, revoked |
| `setup_links` | the first Owner's one-time link: token hash, email, expiry, used |
| `keys` | as in D |
| `sessions` | as in C |
| `challenges` | as in D |
| `settings` | one row per environment, nullable columns per switch (null means the deployment's default), a version, when it changed and who changed it |
| `audit_log` | time, environment, actor (or System), actor's name and role, key used, session label, category, action, target, reason, result (Done, Refused or Failed), address hash, before, after |

**Access goes through functions**, not tables. Each is `security definer` with `search_path = ''`.
- **Member functions** (`public.console_*`, callable by `authenticated`):
  - check the caller's key-verified session and role themselves, from `auth.uid()` and the JWT's `session_id`
  - then read or change data and write the audit row in the same transaction
  - require an unused tap whose digest matches their own arguments, for every risky action
- **Auth-level functions**, callable by the service role only:
  - issue and verify challenges, record keys and sessions
  - accept invites
  - read settings for the traveller path
  - list Owner addresses for Security email

  The server calls these after verifying a tap.

**The audit log is append-only.**
- `update` and `delete` are revoked from every role, and a trigger refuses them.
- Only `console.purge_audit()` removes rows, and only rows older than 2 years. It's written now and scheduled when cron arrives (Phase 3).
- Reasons have PNR-like numbers, emails and IP addresses removed before they're stored, both in the server (`scrubText`) and again in SQL.

**The first Owner** is created with `select console.create_first_owner_link('…')`, which you run in the Supabase SQL editor.
- It works only while the console has no Owner.
- It returns a one-time link that expires in 24 hours.

### F. Runtime settings

**Storage.** `console.settings` holds the values; the audit log holds the history.
- A change runs through one function. That function checks the version (so two saves can't clash), applies the change, and writes one audit row per changed field, in one transaction.
- So a failed save changes nothing, as the Switches sheet promises.

**Reading.** The traveller path reads through `src/services/runtime-settings.ts`, server-only:
1. an in-process copy, fresh for 5 seconds
2. then one same-region Postgres read (800 ms timeout)
3. then the last good value
4. then the deployment's defaults

Each field is validated on its own, and a bad field falls back to its default. A switch reaches every server within about 5 seconds, and a paused or blocked store never stops checks.

| Switch | Default | Where it applies |
|---|---|---|
| PNR checks, message | On | `queryPnr`, right after the PNR is validated. Paused answers 503 `SOURCE_UNAVAILABLE` with `reason: "paused"` and the message, before any limit, cache or provider is touched. It's a field, not a new error code, so browsers already loaded keep working |
| Primary source | `PNR_SOURCE` | The source registry. Only RailKit or RapidAPI, only if its key exists. The Env object stays stable, so shared-store handles are kept |
| Fallback | `PNR_FALLBACK` | Always the other provider, if its key exists |
| New accounts | Open | The new public sign-in route (G) |
| Traveller passkey sign-in | `AUTH_PASSKEY_ENABLED` | /login and /account hide passkey sign-in and the passkeys plate |
| Site notice, text | Off | The strip under the masthead (G), with a version for "closed on this device" |
| Checks per address | 20 a minute (5–60) | The limiter; the 60 s window stays |
| Live checks per day | `LIVE_REQUESTS_PER_DAY` | The daily budget |

### G. What travellers see (Notices and B1)

- **Site notice:**
  - A strip between the masthead and `<main>`: a lamp, the text, and a 44px close button on the steel wash. It wraps on phones.
  - A closed notice stays closed on that device for that notice's version (`tt.notice.v1`).
- **Checks paused:**
  - Both check plates on the landing keep their digits editable, disable Run, read Paused and show the console's message.
  - The result page shows its unavailable plate with the message, Response "Paused" · Provenance "Trakline" · Fallback "None".
  - The footer line and the Reliability band both read "PNR checks are paused". Service status gains a paused state.
- **Budget reached:** a check with a cached record is answered from it, as today. Otherwise it says "Trakline is busy. Try again after 00:00 IST." (new copy).
- **Sign in** posts to a new server route, `POST /auth/sign-in`, which gives one answer for every address.
  - Open: `signInWithOtp({ shouldCreateUser: true })`, as today.
  - Closed: `shouldCreateUser: false`, Supabase's refusal is swallowed, and the page says "If this address has an account, a sign-in link is on its way." with "New accounts are closed for now."
  - Console addresses get the same answer, and no link.
  - Limits: 5 an hour per address, 20 an hour per connection.
- **Dates read "Sep"** in the shared date formatting, which transcribes /pnr and /login from B1.

### H. Overview's figures

- **One counter per check outcome and IST day:** `tt:{env}:checks:{day}:{outcome}`, one increment per check, kept 40 days. The outcomes are:
  - `cache`
  - `live:railkit` and `live:rapidapi`, plus a `:norecord` variant of each
  - `unavailable`
  - `limited`
  - `paused`

  Checks = cache + live + unavailable. Unavailable includes "busy" (the budget is used and no recent record exists). "Limited" and "paused" are refused before checking.
- **Monthly usage per provider:** the usage script also increments `usage:{source}:{IST month}` in the same call, so it costs no extra requests. Quotas come from `RAILKIT_MONTHLY_QUOTA` (10,000) and `RAPIDAPI_MONTHLY_QUOTA` (10), resetting on the 1st.
- **Service now** in Phase 2 has five rows. Times appear only where they're known (a switch change, or a breaker's reopening time).
  - **PNR checks:** the switch and the budget state.
  - **RailKit (primary) and RapidAPI (fallback):** Answering, Standby, or Down with "Breaker open until …", from the breakers.
  - **Shared store** and **Accounts:** a ping.

  The Email and Status probe rows come in Phases 4 and 3.
- **Recent actions** are the last five audit rows.
- The page refreshes every minute. A plate whose store doesn't answer shows "Counts unavailable: the shared store didn't answer. Last good value …".

### I. Email

- Console email goes through Resend's API from `console@trakline.in`, as plain text in today's sign-in email style (until B6).
- The kinds: sign-in links, invites, keys-reset notices, and Security alerts.
- **Security alerts** go to every Owner, never held back. They cover:
  - an invite sent, accepted or revoked
  - a role change, keys reset or removal
  - a key added or removed
  - an audit export
  - three failed taps in 10 minutes
  - the first Owner's setup
- Alerts never contain a PNR or a traveller's email.
- **Tests:** under `E2E=1` (outside production) emails go to an in-memory outbox that the e2e tests read. The environment check refuses `E2E=1` in production.

## 4. Configuration

| Name | Where | Secret | Notes |
|---|---|---|---|
| `CONSOLE_HOST` | Production (and `.env.development.local`) | no | `admin.trakline.in`; `admin.localhost` locally |
| `RESEND_API_KEY` | Production | **yes** | sending access, domain trakline.in; entered by you through a hidden prompt |
| `CONSOLE_EMAIL_FROM` | not set | no | defaults to `Trakline Console <console@trakline.in>` |
| `RAILKIT_MONTHLY_QUOTA`, `RAPIDAPI_MONTHLY_QUOTA` | not set | no | defaults 10,000 and 10 |

**Supabase:**
- The redirect lists gain `https://admin.trakline.in/**` and `http://admin.localhost:4210/**`, pushed with config push.
- Migrations add the `console` schema and its functions.
- **Vercel:** the project gains the domain `admin.trakline.in`, with its DNS record at GoDaddy.

## 5. Failure behaviour

| Condition | Behaviour |
|---|---|
| Settings unreadable | Last good value, then the deployment's defaults; checks keep answering |
| Upstash down | Counters skipped; Overview's plates say "Counts unavailable …" with the last good time |
| Resend down | Sign-in answers the same, and the failed send is logged. A Security alert that can't be sent is written to the audit log as Failed |
| Supabase down | Console pages show their error plate with Retry; traveller sign-in is unavailable, as today |
| Key doesn't answer, or isn't registered | "That key didn't answer. Try again." / "This key isn't one of yours."; logged; three in 10 minutes → Security email |
| Session expired or revoked | "Your session ended. Sign in again." |
| Stale version on save | "Not saved: the change didn't reach the store. Nothing changed." |
| A tap reused, or used for another action | Refused in the database; logged as Refused |

## 6. Tests (written first)

- **Unit:**
  - host detection, rewrites and 404s in the proxy; the matcher with host cases
  - the console CSP (a fresh nonce, `strict-dynamic`, no `'unsafe-inline'` in scripts)
  - the settings resolver (cache, last good, defaults, bad fields, source rules)
  - digests; the WebAuthn service, at the library boundary
  - guards; email text; counters
  - the new contract tests: console imports, and provider names only under `src/console`
- **Database:** SQL tests against the local Supabase (`supabase test db`) cover:
  - roles and key-verified sessions
  - taps: single use, and bound to their digest
  - the audit log refusing update and delete
  - settings versions
  - invites: 7 days, and refusing traveller addresses
  - the last-Owner and two-key rules
- **Integration:** route handlers with fakes. Sign-in gives one answer; confirm; the key endpoints; a paused check (503 with `reason`, no provider or store call).
- **End to end:** a `console` Playwright project against the local Supabase, using Chromium's virtual authenticator.
  - first-Owner setup with two keys
  - sign in with the outbox link and a tap
  - pause checks, see the landing and result paused, then resume
  - invite and change a role
  - the audit rows
  - axe, CSP and 390px scans on console pages
- **CI:**
  - The traveller e2e runs as today.
  - The e2e job then starts a local Supabase (`npx supabase@2.117.0 start`, without the unused services) and runs the database tests and the console project in sequence. Next 16 allows one dev server per project at a time, and the traveller suite needs Supabase off.

## 7. Order of work (one PR each)

1. **Docs:** this spec and the approved B1/B2 sheets.
2. **Hosts and frame shell:** the route move, the proxy, per-host headers and CSP, and the console root layout with Sign In's first state. Nothing works without a session yet, and admin.trakline.in isn't attached.
3. **Database:** the migrations, functions and SQL tests, with CI starting the local Supabase.
4. **Sign-in, setup and keys:** sessions, the guard, Resend, the first-Owner link and the e2e harness.
5. **The signed-in frame, My keys, Team and Audit log.**
6. **Runtime settings:** Switches, the traveller side (Notices), public sign-in, and "Sep".
7. **Overview,** its counters, and Security emails.
8. **Launch:** the domain, `RESEND_API_KEY`, redirect URLs, the migrations in production, the first Owner, and a production check.

Each PR is written test-first, with every check green locally and in CI. Each is merged only with your go-ahead, then checked on the live site.

## 8. What only you can do

- Add `admin.trakline.in` to the Vercel project, with its DNS record at GoDaddy. I can add the domain through the CLI once you say so; the DNS record is yours.
- Create a Resend API key (sending only, domain trakline.in) and enter it as `RESEND_API_KEY` for Production through a hidden prompt.
- Pick the dedicated address for the first Owner, and run the one-line setup-link query in the Supabase SQL editor.
- Enrol two keys, for example a security key and a phone passkey, kept in different places.
- Approve pushing the migrations and the redirect URLs to production.

## 9. Risks and open questions

- **"Traveller passkey sign-in: Off" hides the buttons.** Supabase's passkey endpoints stay on while the project setting is on.
- **"New accounts: Closed" is enforced by our sign-in route.** A direct call to Supabase's API with the public key could still create an account until a `before_user_created` hook enforces it in the database. PR 6 adds that hook if config push can manage it, or asks you to switch it on in the dashboard.
- **Changing the per-address limit restarts its window,** because the limiter's key includes the limit.
- **The console CSP keeps `style-src 'unsafe-inline'`** (for style attributes and Sonner). Scripts are strict.
- **Email on Resend's free plan:** console links and Security alerts share the 100 a day. Console volume is small; Phase 4 sets the reserve.
- **The audit purge** is written now and scheduled in Phase 3. No row will be 2 years old before then.
- **Moving the traveller pages into `(site)`** touches many test imports. It's mechanical, and done in PR 2 alone.
- **WebAuthn on phones:** iPhone Safari needs a passkey or an NFC or USB-C key for admin.trakline.in. Setup explains "a passkey on this device".

## 10. Acceptance

- admin.trakline.in serves only the console, with the strict nonce CSP and noindex, and trakline.in serves nothing of it.
- The first Owner is set up with two keys, and signs in with a link and a tap. An invited member does the same.
- **Pausing checks** (reason and tap) stops checks on trakline.in within about 5 seconds:
  - the landing's plates show the message
  - the result page shows Paused
  - the status lines read "PNR checks are paused"

  Resuming restores them, and each change is in the audit log with before → after.
- A role change signs that member out at once.
- Every risky action needs its own tap, and a tap can't be reused (tested in the database).
- The audit log can't be edited (tested in the database).
- Overview's figures add up: checks = from cache + live + unavailable.
- Every CI check is green, including the console end-to-end run with a virtual key.
