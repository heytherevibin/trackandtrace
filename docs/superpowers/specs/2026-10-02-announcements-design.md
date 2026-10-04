# Announcements (07): design

Date: 2026-10-02 · Status: **approved in conversation, awaiting review of this file** · Owner: Vibin Mathew

Module 07 as briefed in `phase-1-design-brief.md` (role matrix line "07 Announcements | full | full | – | –", sheet 23). It sends to the lists 06-A created and merged on 2026-09-30 (`71077b5`), and adds the suppression that sending to real people requires.

**Scope.** This spec covers announcements and suppression only. Roadmap item 07 — chart-preparation alerts — was raised alongside it and is **deliberately excluded**: a per-PNR watcher firing per traveller on a schedule shares only the sender with a one-to-many announcement. Different trigger, different data, different failure modes. It gets its own spec once this one ships.

| | Sub-project | Depends on |
|---|---|---|
| **07** | **Announcements** — letters, the draining send, suppression, the console surface | 06-A |
| later | Chart-preparation alerts | 07's sender and suppression |

## 1. Decisions

Each was taken in conversation on 2026-10-02, with the standing instruction to prefer the robust option.

1. **A send drains across days; it is never blasted.** Resend's Free plan allows 100 emails a day (`src/services/email/allowance.ts`, checked on the account 2026-09-28). An announcement to any real list does not fit in one day, and the same ceiling logic is needed at any plan tier. Queue writes the recipient set; a scheduled job sends what the day allows and resumes tomorrow.
2. **Announcements are the first thing squeezed.** They may send only while the day's total is **under 40**. Confirmations keep their ≤60 ceiling and operator mail keeps the top 40 untouched. An announcement can wait a day; a confirmation link expires in 48 hours and an operator who cannot sign in is the wrong failure.
3. **A test send is required before Queue unlocks**, and a queued send can be **stopped** at any point. One email from the allowance prevents a mistake measured in hundreds. Stopping halts the remainder; what has gone has gone, and the console says exactly how much.
4. **The availability list is single-use, and the system guarantees it rather than trusting the operator.** The sign-up form promises "Tell me once when availability checks open. One email, nothing else." After its one send that list is marked spent and the console **refuses** to target it again. That email carries a line inviting people to the news list — a fresh opt-in on their terms, never an automatic move.
5. **Suppression is per kind.** A hard bounce (`email.bounced`, which Resend defines as permanently rejected) suppresses **all** mail to that address. A complaint (`email.complained`) suppresses **list** mail and withdraws consent. A soft failure (`email.delivery_delayed`) is recorded and counts toward a threshold rather than suppressing on one bad night.
6. **Announcements are plain text**, like every email this product sends. `Letter` has no `html` field and will not grow one here.
   **A soft failure suppresses nothing on its own.** Three `email.delivery_delayed` events for one address within 30 days suppress `list`; fewer are recorded and left alone. One bad night at a mail host is not a dead address, and treating it as one loses a real subscriber.
7. **The unsubscribe link and `List-Unsubscribe` headers are appended by the sender, never typed by the operator.** PR 2 left the hook: `Letter.headers` carries the comment "For the one-click unsubscribe headers a list email carries (07)". Forgetting them must be impossible, not discouraged.

### Verified, not assumed

Checked against Resend's documentation on 2026-10-02, because the design rests on them:

- **`Idempotency-Key`** is supported on `POST /emails`, maximum 256 characters, and the window is **24 hours**. The success response carries `id`.
- Webhooks are **Svix-signed**: `svix-id`, `svix-timestamp`, `svix-signature`, with timestamp replay protection. During key rotation **multiple space-separated `v1,…` signatures are sent and any one matching is a pass.**
- Event types include `email.bounced`, `email.complained`, `email.delivery_delayed`, `email.delivered`, `email.failed`, and `suppression.added` / `suppression.removed` — Resend maintains its own suppression list and tells us when it changes, so ours mirrors rather than infers.

## 2. Data model

A private `announcements` schema: RLS enabled with no policies, every reach-in through a `security definer` function granted to `service_role` alone. The shape 06-A proved.

**`announcements.letters`** — one per announcement.

- `id uuid primary key`
- `list text not null check (list in ('news','availability'))`
- `subject text not null`, `body text not null`
- `state text not null check (state in ('draft','queued','sending','stopped','done'))`
- `test_sent_at timestamptz` — **Queue refuses while this is null**
- `recipients_total int` — frozen at queue time
- `created_by uuid not null` → the console member (`console.members`), so the audit log and this table agree on who
- `created_at`, `queued_at`, `finished_at`
- `queued_by uuid`, `stopped_by uuid`, `stopped_at timestamptz` — the console members who queued and stopped it, and when. These are columns here, and not a read of the module-14 audit log, because a list view should not have to join another module to say who queued a letter, and the list must not depend on audit retention. (The audit log still records both transitions; the columns are the list's own copy of the facts it shows.)
- `test_sent_to text` — the address the test send went to, so the console can say where it went rather than assume the member's own

**`announcements.deliveries`** — one row per recipient per letter, written at Queue.

- `letter_id`, `person_id` (→ `subscriptions.people`)
- `state text check (state in ('pending','sent','unknown','skipped'))`
- `claimed_at timestamptz` — the lease
- `sent_at timestamptz`, `provider_id text` — Resend's returned `id`
- `skip_reason text`
- **`unique (letter_id, person_id)`** — double-sending is impossible at the database level, not by convention

Freezing the recipient set at Queue is deliberate: someone who subscribes tomorrow does not receive an announcement they were not on the list for, and someone who unsubscribes between Queue and send is re-checked at send time and skipped.

**`announcements.suppressions`** — keyed by **address**, not by person, because operators bounce too and they are not subscribers.

- `email text primary key` — **normalised `lower(btrim(…))` on the way in**, matching `subscriptions_person_id`'s own lookup. A suppression that does not match the address we send to is no suppression at all.
- `scope text check (scope in ('all','list'))`
- `reason text`, `source text`, `at timestamptz`

**`announcements.webhook_events`** — `svix_id text primary key`, `received_at`. A replayed webhook is a no-op by construction.

## 3. The send loop

A daily scheduled workflow, the same shape as `crawl.yml`: paired secrets, a concurrency guard, a runbook, and a read-back check.

1. Read the day's count from **the same counter confirmations use** — `${prefix}:email:${emailDay(now)}` in `src/services/email/allowance.ts`, on Resend's UTC day, not India's. This is load-bearing: a separate key would make the 100-a-day ceiling two ceilings of 100 and the whole budget argument collapses.
2. `budget = max(0, 40 − count)`. Zero is a normal outcome and is reported as one.

   The three ceilings compose without a fourth rule: announcements stop at 40, confirmations at 60, operator mail is counted but never gated. Worst case the day fills 0–40 announcements, 40–60 confirmations, 60–100 operators — the reserve holds. If confirmations arrive first and reach 40, announcements send nothing that day, which is the intended order of sacrifice.
3. Pick the letter (see *One letter at a time*, below), then claim up to `budget` of **its** rows atomically: `update … set state='sending', claimed_at=now() where state='pending' and letter_id = <that letter> … returning`.
4. Per claimed row: re-check suppression and consent, then send with `Idempotency-Key = <letter_id>:<person_id>`, and store the returned `id`.
5. Mark `sent`. Check the letter's state before each batch **and before each send**, so Stop takes effect immediately.

### One letter at a time

8. **One letter drains at a time, in queue order.** Each run takes the letter with the oldest `queued_at` that is not `done` or `stopped`, and works it until it is done before touching the next. Letters are never interleaved: interleaving makes every letter slow and none of them predictable, whereas one at a time lets the console say "this finishes about X, then the next begins", and that sentence stays true.

   `queued` therefore also means "queued behind another letter": the state holds from Queue until the letter's first claim, however long the letters ahead take. A queued letter can be stopped, as any other.

   **The consequence for estimates.** A letter's estimate is *about N days, starting when the one ahead finishes*. With nothing ahead it is simply "about N days at 40 a day". The console's Queue confirm names the letter ahead and gives a finish that includes it.

### The ambiguous failure

`sendEmail` returns `"failed"` for both a refusal and a timeout, and a timeout may have delivered. So:

- A claimed row may be **retried only within 24 hours**, where Resend's idempotency window makes a repeat safe.
- After 24 hours it becomes **`unknown`** and is never retried. We cannot tell whether it went, and guessing either way is worse than saying so.
- `unknown` is its own count in the console, never folded into sent or failed.

### One change to existing code

`sendEmail` must return Resend's `id` rather than discarding it, so a bounce can be tied back to a recipient. Its other contracts — never throws, no database dependency, outbox under E2E — do not change.

## 4. The webhook

`POST /api/webhooks/resend`. Verified before anything else is read.

- HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${raw body}`, compared with `timingSafeEqual`, ±5 minute timestamp tolerance.
- **Multiple `v1,…` signatures are accepted if any one matches** — key rotation depends on it, and omitting it is a silent outage at the worst moment.
- Written here rather than taken as a dependency, the same call this project made for WebAuthn, and tested against known vectors.
- Recording the event and acting on it happen in **one** `security definer` function: a duplicate `svix_id` is a no-op, and a failure part-way leaves nothing half-applied. Svix retries on non-2xx and the retry is safe.

| event | effect |
|---|---|
| `email.bounced` | suppress `all` · reason `hard bounce` |
| `email.complained` | suppress `list` · **withdraw consent on every list** |
| `email.delivery_delayed` | recorded; counts toward a soft threshold |
| `email.delivered` | marks the delivery row delivered |
| `suppression.added` / `removed` | mirror Resend's own list |
| anything else | recorded, ignored |

### Enforcement, and why bypass is not possible

A `sendToAddress` wrapper checks suppression and then calls `sendEmail`. What stops a sixth call site skipping the check is a **contract test**, the device `tests/unit/console/boundary.contract.test.ts` already uses: nothing outside the wrapper may import `sendEmail`. A guard that is a convention decays; a guard that is a failing test does not.

## 5. The console

`/console/announcements` — Owner and Admin, per the role matrix. Support and Viewer have no access.

- A list of letters with state and progress.
- A compose view. Queue is disabled until a test send has happened.
- A detail view showing **sent · skipped · unknown** as separate counts, with Stop.
- A suppressions view, which **names operator addresses explicitly**: a hard-bounced operator address silently stops their sign-in mail, and that must be visible rather than inferred.

Every transition writes to module 14: queued, test sent, stopped, suppression lifted by hand.

**Sheet 23 "Console Announcements" has never been drawn.** It must be drawn and approved before the console half is built — the gate B4 had for the forms.

## 6. Failure behaviour

| failure | behaviour |
|---|---|
| Resend down all day | the batch sends nothing, resumes tomorrow, no state change |
| worker dies mid-batch | rows reclaimed within 24h; `unknown` after |
| webhook replayed | no-op on `svix_id` |
| recipient unsubscribes mid-drain | re-checked at send, skipped, counted |
| confirmations consume the day | announcements send 0, and the console says why |
| availability list already spent | refused at **Queue**, not at send |
| suppression table unreadable | fail closed — no list mail goes out |

## 7. Tests (written first)

- **Pure units:** budget arithmetic, the letter state machine, Svix verification against known vectors (including multi-signature and an expired timestamp), the event→effect mapping.
- **pgTAP:** anon denied on every table; functions granted to `service_role` alone; **a test that proves `unique (letter_id, person_id)` refuses a second delivery**; the availability list cannot be targeted twice.
- **Integration:** the webhook route — valid signature, tampered body, replayed `svix-id`, each event type.
- **E2E:** compose → test send → queue → progress → stop, against the outbox.
- **A read-back check**, `npm run announce:report`, in the same spirit as `source:report`: names anything stuck — rows past their lease, `unknown`s, a letter queued but not advancing. A sender with no read-back is one you learn about from a person.

## 8. Delivery

Three PRs, each green on `npm run check` before the next begins.

| | PR | Contains |
|---|---|---|
| 1 | Sheet 23 | The console board drawn and approved, as B4 was |
| 2 | The backend | Schema, send loop, webhook, suppression, the wrapper and its contract test, the read-back check |
| 3 | The console | Module 07's pages over PR 2's data, transcribed from sheet 23 |

**Owner action:** none required before PR 1. The Resend webhook endpoint and its signing secret must be configured in the Resend dashboard before PR 2 can be verified against anything real; the secret is an env var documented in `.env.example`.
