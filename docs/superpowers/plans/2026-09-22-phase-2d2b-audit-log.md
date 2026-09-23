# Audit Log Implementation Plan (Phase 2d-2b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** an Owner or Admin can read every action taken in the console — who took it, when, why, and what changed — filter it, open one entry in full, and export a filtered range as CSV.

**Architecture:** the audit log is already written on every path (2b shipped `console.audit_log`, its append-only trigger and `console.purge_audit()`); this phase is the **read** side and nothing else. One member function returns a page plus its total, filters applied in SQL, and the page is a server component inside `ConsoleFrame`. Reading never writes — except the export, which is itself an audited action.

**Tech Stack:** Next.js 16.3.4 (App Router), Supabase/Postgres with pgTAP, zod 4, Base UI, Tailwind 4, Playwright, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-19-phase-2-admin-core-design.md` — §E (the table's columns, append-only, the purge, reason scrubbing), §A/§B (the frame and where console code lives), §C (the guard).

**Sheets:** `docs/design/sheets/console/AuditLog.dc.html`, `AuditLogPhone.dc.html`, and `AuditRecord.dc.html` — which is **not a third screen**: it is `<dc-import name="AuditLog" drawer="Open">`, i.e. the desktop sheet with its drawer open. Read it to confirm that before designing anything around it.

## Global Constraints

Every task's requirements implicitly include all of these. Each is a bug this project has already shipped, or nearly did.

- **The audit log is append-only and this phase only reads it.** `update` and `delete` are revoked from every role and a trigger refuses them. No function added here may write to `console.audit_log` — except the export's own audit row, written through `console.write_audit` like any other action.
- **An assertion counting rows in `console.audit_log` must be scoped to the row the test wrote.** It survives `resetConsole()` by design, so a bare `count(*) where action = '…'` sees every row any run has ever written. This has now appeared **four** times across three phases.
- **Never an enum-typed parameter on a `public.console_*` function.** PostgREST casts it in the *caller's* context, before `security definer` applies, and the call dies with "permission denied for schema console". `category`, `result` and `role` cross as `text`. A whole migration exists to undo five of these.
- **A test fixture must use the format its source actually produces.** Two production bugs so far: a watchlist crash because every fixture wrote `"…Z"` while Postgres emits `"…+00:00"`, and a console lockout because a base64 fixture used Node's unwrapped `toString("base64")` while `encode(bytea,'base64')` wraps every 76 characters. When a value comes from the database, **get its shape from the database**.
- **Build the phone sheet.** `AuditLogPhone.dc.html` is a separate drawn variant, and it forbids export outright — it draws `Open on a larger screen to export.` The Team page shipped its whole management surface at phone width because only the desktop sheet was read; the final review caught it. Do not repeat that.
- **Parse, never cast.** `data as T` is the defect; `schema.parse(data)` is the fix.
- **A database refusal is a developer string and must never reach a member.** Translate every one; assert every translation.
- **`consoleApiMessage` (`@/console/api-message`) is the only thing that decides what a failed request says.** Do not write a seventh copy.
- **A `DataTable` column `header` must be a `string`.** It is printed into `data-label` for the stacked phone layout, where a ReactNode stringifies to `[object Object]`.
- **Reasons are scrubbed at write time**, in the server (`scrubText`) and again in SQL. The read path must not scrub again, and must not assume a reason is safe to treat as anything but text.
- TypeScript strict, never `any`. Files under 500 lines.
- Conventional commits, and **no `Co-Authored-By` trailer** — this project's CLAUDE.md forbids it.
- Never name a data provider on a traveller-facing surface; never put a PNR in a URL or a log.
- Transcribe the sheet 1:1. Copy that is **not** drawn there must be flagged in the code with the `Not drawn` convention already used in `src/console/messages/en-IN/team.ts`. If the sheet and accessibility genuinely conflict, make the accessible choice and record the departure.

## What is already shipped, and must not be rebuilt

| Already exists | Where |
|---|---|
| `console.audit_log` and its indexes (`at desc`, `category+at`, `actor_id+at`) | `supabase/migrations/20260920090300_console_audit.sql` |
| the append-only trigger, and `console.purge_audit()` | same file |
| `console.write_audit(...)`, called by every writing function | same file |
| `ConsoleFrame`, `NoAccessState`, the rail, `DataTable`, `Plate`, `Badge`, `Led`, `ErrorState` | `src/console/components/`, `src/components/ui/` |
| module 14 in the rail, `roles: OWNER_ADMIN`, `built: false` | `src/console/nav.ts` |

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260922140000_console_audit_read.sql` | `public.console_audit(...)` and `public.console_audit_entry(...)`, and their grants |
| `supabase/tests/console_audit_read.test.sql` | pgTAP for both, every filter, and the role floor |
| `src/console/audit/audit.ts` | the server read: zod shapes, `getAuditPage`, `getAuditEntry` |
| `src/console/audit/filters.ts` | the filter model, parsed from and written to the query string |
| `src/console/audit/audit-client.ts` | the browser half: re-read a page, request an export |
| `src/console/audit/filter-bar.tsx` | search, Member, Category, Result, the date range |
| `src/console/audit/entries-plate.tsx` | the desktop table and its pagination |
| `src/console/audit/entry-drawer.tsx` | one entry, nine fields |
| `src/console/audit/entries-cards.tsx` | the phone layout |
| `src/console/audit/export-dialog.tsx` | confirm → preparing → ready |
| `src/app/console/audit-log/page.tsx` | the page inside `ConsoleFrame` |
| `src/app/console/api/audit/route.ts` | `GET` a page |
| `src/app/console/api/audit/export/route.ts` | `POST` to prepare, `GET` to download |
| `src/console/messages/en-IN/audit.ts` | the copy |

---

### Task 1: The read functions

**Files:** Create `supabase/migrations/20260922140000_console_audit_read.sql`, `supabase/tests/console_audit_read.test.sql`.

**Interfaces — Produces:**
- `public.console_audit(p_from timestamptz, p_to timestamptz, p_member uuid, p_category text, p_result text, p_search text, p_limit integer, p_offset integer) returns jsonb` — `{rows: [...], total: <integer>}`. Every filter is nullable and null means "no filter". `console.require_role('admin')` first: Owner and Admin both read it, Support and Viewer do not.
- `public.console_audit_entry(p_id uuid) returns jsonb` — one row, or null.

Rows carry `id, at, actor_id, actor_name, actor_role, key_id, session_label, category, action, target, reason, result, address_hash, before, after`.

- [ ] **Step 1: Write the failing pgTAP** — every filter narrows; two filters compose; `total` counts the *filtered* set and not the page; a Support member is refused with the message named; an Admin is not. Scope every count to rows this test wrote.
- [ ] **Step 2: Run them failing** — `npm run db:reset && npm run db:test`.
- [ ] **Step 3: Write the migration.** `security definer`, `set search_path = ''`, every param `text`/`uuid`/`timestamptz`/`integer`. `p_search` matches `reason` and `target` only — never `actor_name`, which would let a search leak who did what to someone filtering for something else.
- [ ] **Step 4: Run them passing**, then **break one assertion deliberately** and confirm it fails.
- [ ] **Step 5: Commit** — `feat(console): reading the audit log`

---

### Task 2: The page, the table and the filters

**Files:** Create `src/console/audit/audit.ts`, `filters.ts`, `filter-bar.tsx`, `entries-plate.tsx`, `src/app/console/audit-log/page.tsx`, `src/app/console/api/audit/route.ts`, `src/console/messages/en-IN/audit.ts`; modify `src/console/messages/index.ts`.

**Copy from `AuditLog.dc.html`**, word for word: kicker `14 · Audit log`, title `Audit log`, lead `Every action taken in the console: who took it, when and why.`; the search field's placeholder `Search reasons and targets` and its label; the pickers `Member` / `All`, `Category`, `Result`; the ranges `Today`, `7 days`, `30 days`, `Custom`; `Filters`, `Clear filters`; the plate `Entries`; columns `Time ↓`, `Action`, `Target`, `Reason`, `Address`, `Open`; the empty state `No actions in this range` / `Nothing was done in the console with these filters.`; the error state `The audit log didn't load` / `The console couldn't reach its database.` / `Retry`; and the no-access state `This module isn't part of the Support role.` / `Ask an Owner if you need it.` / `Back to Overview`.

The table's visually-hidden caption is `Audit entries for today, newest first`.

- [ ] **Step 1: Write the failing tests** — `audit.ts` parses and refuses a malformed row; filters round-trip through the query string; the table draws every column; the empty, error and no-access states each render.
- [ ] **Step 2: Run them failing.**
- [ ] **Step 3: Write `audit.ts`, `filters.ts` and the `GET` route.** `assertConsoleAvailable()`, then `requireConsoleMember("admin")`. The page catches only `UNAUTHENTICATED` and rethrows the rest, as `/keys` and `/team` do; a Support or Viewer member gets `NoAccessState`, not a redirect.
- [ ] **Step 4: Write the filter bar and the plate.** Filters live in the URL so a filtered view can be linked and reloaded.
- [ ] **Step 5: Run everything**, then commit — `feat(console): the Audit log page and its filters`

---

### Task 3: One entry, in full

**Files:** Create `src/console/audit/entry-drawer.tsx`; modify `entries-plate.tsx`, `audit.ts`, `src/app/console/api/audit/route.ts`; tests alongside.

The drawer is headed `Audit entry` with the entry's id beside it, and draws **nine** `dt`/`dd` pairs in this order: `Time`, `Member`, `Action`, `Target`, `Reason`, `Result`, `Address`, `Session`, `Before → after`. `Member` composes name, role and the key used (`Asha Rao · Owner · key "YubiKey 5C"`); `Before → after` renders the two `jsonb` columns as a sentence.

Each row's `Open` control carries the sheet's own accessible name: `Open the entry: <action> at <time> IST`.

- [ ] **Step 1: Write the failing tests** — all nine fields render; a null `key_id`, `session_label`, `target`, `reason` or `address_hash` each render without `undefined` reaching the screen; `before`/`after` render when one, both or neither is present.
- [ ] **Step 2: Run them failing.** **Step 3:** the read. **Step 4:** the drawer.
- [ ] **Step 5: Run everything**, then commit — `feat(console): one audit entry, in full`

---

### Task 4: Export

**Files:** Create `src/app/console/api/audit/export/route.ts`, `src/console/audit/export-dialog.tsx`, `src/console/audit/audit-client.ts`; tests alongside.

Three drawn states: **confirm** (`Export 14 audit entries from today`), **preparing** (`Preparing export… 14 entries from today.`), and **ready** — which draws the file name `audit-2026-09-19.csv`, the line `Works once, in this browser, for 10 minutes`, and `Download`.

That line is the specification: the prepared export is single-use, bound to the requesting session, and expires in **10 minutes**. Decide where that state lives and say why in your report — it must not be a link anyone else can replay.

**An export is an audited action.** It reads personal data in bulk, so it writes its own `console.write_audit` row. Whether it also takes a tap is **your ruling to make and record**: the spec lists the export under §E without naming a tap, and the sheet draws a confirm step rather than TC-01.

- [ ] **Step 1: Write the failing tests** — the CSV carries the filtered set and not the page; a second download of the same export is refused; an expired one is refused; another session's is refused; the audit row is written.
- [ ] **Step 2: Run them failing.** **Step 3:** the route. **Step 4:** the dialog.
- [ ] **Step 5: Run everything**, then commit — `feat(console): exporting the audit log`

---

### Task 5: The phone

**Files:** Create `src/console/audit/entries-cards.tsx`; modify `filter-bar.tsx`, `entries-plate.tsx`, `src/app/console/audit-log/page.tsx`; tests alongside.

**Read `AuditLogPhone.dc.html` first.** It is a different layout, not a narrower table:

- Each entry is a **card**: time, result and action on top, then labelled `Member`, `Target`, `Reason`, `Address`.
- The filter bar is **only** the date chips (`Today`, `7 days`, `30 days`, `Custom`) plus the applied-filter chip and `Clear filters`. No Member, Category or Result pickers.
- **There is no export.** The sheet draws `Open on a larger screen to export.` in its place — transcribe that line and make sure no export control renders at phone width.
- Pagination (`1–14 of 14`, `Previous`, `Next`) and the empty state stay.

- [ ] **Step 1: Write the failing tests** — a card draws all six values; no export control exists at 390px; the desktop pickers are absent; `Open on a larger screen to export.` is present.
- [ ] **Step 2: Run them failing.** **Step 3:** the cards. **Step 4:** the gates.
- [ ] **Step 5: Run everything**, then commit — `feat(console): the Audit log on a phone`

---

### Task 6: The Member filter's roster

**Files:** Create `supabase/migrations/20260922150000_console_audit_actors.sql`; modify `supabase/tests/console_audit_read.test.sql`, `src/console/audit/audit.ts`, `src/console/audit/filter-bar.tsx`, `src/app/console/api/audit/route.ts`; tests alongside.

**Added after Task 2, on the reviewer's advice.** The Member picker currently accumulates its options from the actors visible in the rows it fetched, because `console_team` is Owner-only while this module is Owner **and** Admin — so there is no roster an Admin may read. The consequence: **a member who has done nothing in the chosen range cannot be selected**, which is exactly when you most want to ask "has this person done anything?". No row is hidden and the log stays honest; the filter simply cannot reach a silent member, and free-text search over `reason`/`target` is not a substitute for filtering by actor.

**Interfaces — Produces:** `public.console_audit_actors(p_from timestamptz, p_to timestamptz, p_environment text) returns jsonb` — the distinct actors with rows in that window: `[{actor_id, actor_name, actor_role}]`, ordered by name. Its own `console.require_role('admin')` floor, `security definer`, `set search_path = ''`, every parameter `text`/`timestamptz`/`uuid`, grants revoked from `public, anon, authenticated, service_role` then granted to `authenticated`.

Decide and record whether the roster spans the chosen range or the whole log. The range keeps the list short and matches what the rows can show; the whole log is what answers "has this person ever done anything?". They are different questions and the picker can only serve one.

- [ ] **Step 1: Write the failing pgTAP** — the actor list is distinct, ordered, scoped to the window, and excludes the System actor (`actor_id is null`); a Support member is refused with the message **named**, not a bare `42501`.
- [ ] **Step 2: Run them failing.** **Step 3:** the migration. **Step 4:** wire the picker.
- [ ] **Step 5: Run everything**, then commit — `feat(console): the Audit log's Member filter knows the whole roster`

---

### Task 7: The rail, end to end, and the docs

**Files:** Modify `src/console/nav.ts`, `tests/unit/console/nav.test.ts`, `tests/e2e/console-auth/scans.spec.ts`; create `tests/e2e/console-auth/audit-log.spec.ts`, `docs/runbooks/console-audit-log.md`; modify `docs/architecture.md`.

Module 14 flips to `built: true`. **It is Owner *and* Admin** — verify that against `Main.dc.html:293-298`'s own access map rather than trusting this sentence; that table has been wrong before and was caught twice.

Through the real browser against the real database: an Owner opens the Audit log and sees the rows their own earlier actions wrote; filters by category and by member and the count changes; opens one entry and reads its nine fields; exports and downloads once, and a second download is refused. Plus an Admin seeing the page, and a Support member getting the no-access state.

- [ ] **Step 1: Write the specs** and run them failing for the right reason.
- [ ] **Step 2: Make them pass.** Add no waits to make something green; report anything that will not settle.
- [ ] **Step 3: Run every suite** — `npm run check`, `npm run db:test` on a clean database **and** on one an e2e run has dirtied, the console e2e suite **on your own port**, and `npm run test:e2e`.
- [ ] **Step 4: Capture screenshots** at 1280×800 and 390px into the session scratchpad: the table with filters applied, the entry drawer, the export's ready state, and the phone cards.
- [ ] **Step 5: Update the docs**, then commit — `feat(console): Audit log appears in the rail, end to end`

---

## Known hazards in this workspace

- `playwright.console.config.ts` has `reuseExistingServer: !CI` on hard-coded port **4211**. Another worktree's dev server may hold it, pointed at a **different** Supabase stack; reusing it grades the wrong code against the wrong database and reports confident nonsense. This cost one task an hour. **Use your own port.** A separate branch is fixing the config itself.
- This machine has no `psql` on `PATH`, and `resetConsole()` needs one. A shim lives in the session scratchpad.
- `resetConsole()` cleans only what each spec *starts* with, so `npm run db:test` fails on a database an e2e run has dirtied. Each console spec needs its own `test.afterAll(() => resetConsole())` until a `globalTeardown` exists. `resetConsole()` also never clears `auth.users`.
- There are **18** `throws_ok(…, '42501', null, …)` assertions in `console_team.test.sql` that pass whichever refusal fired. Do not add a nineteenth; do not sweep them inside a task here either.
