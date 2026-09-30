# Subscriptions core (06-A): design

Date: 2026-09-28 · Status: **approved in conversation, awaiting review of this file** · Owner: Vibin Mathew

Module 06 (Leads) as briefed in `phase-1-sheets/b4-leads-accounts-privacy.md` is four sub-projects. This spec is the first, the only one that creates data:

| | Sub-project | Depends on |
|---|---|---|
| **A** | **Subscriptions core** — tables, sign-up forms, confirm and unsubscribe pages, the confirmation email | this spec |
| B | Leads · Lifecycle tab — masked list, figures, filters, drawer, audited Reveal | A |
| C | Leads actions — export (tap), tags, notes, delete lead | B |
| D | Business pipeline — board, "Add a business lead" | B |

07 Announcements sends to the lists A creates, so it follows A (and adds suppression from bounces).

## 1. Decisions

Taken with the owner on 2026-09-28:

1. **Draw first.** Sign-up Capture and Subscription were briefed, never drawn. They are drawn as `.dc.html` sheets and approved before any traveller UI is built, then transcribed 1:1.
2. **Resend Free plan: 100 emails a day, 3,000 a month** (checked on the account). Resend's day resets at **00:00 UTC = 05:30 IST**, not 00:00 IST as the brief's copy says; the copy follows Resend.
3. **Unconfirmed addresses are deleted after 7 days.** The confirm link lasts 48 hours.
4. **Privacy notice v1.1**: a sign-ups section is added to today's `/privacy` now. The full Version 2 notice (B4) arrives with 09 Privacy requests.
5. **Our own Postgres tables**, not Resend Contacts (no consent records, a 1,000-contact cap, and the console would page Resend's API) and not Supabase Auth users (the brief: "An account never makes anyone subscribed").
6. **The landing's closing "News about Trakline" plate is deferred** until the journey track (another session) finishes 6/6; it is that track's page.
7. **No on/off switch.** The forms go live when the UI PR merges; limits and the daily cap contain abuse.

## 2. Data model

One migration, schema `subscriptions`, no grants to `anon` or `authenticated`. Only `security definer` functions granted to `service_role` touch it.

**`subscriptions.people`**
- `id uuid pk`
- `email text unique` — lowercased and trimmed, checked `char_length ≤ 254`
- `first_seen timestamptz`, `first_source text` (`footer` · `landing` · `pre-booking` · `account` · `added by hand`)
- `campaign_source`, `campaign_medium`, `campaign_name`, `first_page` — `text`, nullable, each bounded
- No name and no IP.

**`subscriptions.consents`** — one row per person per list
- `person_id` → people (cascade), `list text check (list in ('news', 'availability'))`, unique `(person_id, list)`
- `notice_version text` (`1.1`), `source text`
- `consented_at`, `confirmed_at`, `withdrawn_at` (timestamptz, the last two nullable), `withdraw_reason text` (one of the four offered, nullable)

**`subscriptions.confirm_tokens`**
- `token_hash bytea pk` (SHA-256 of a 32-byte random token), `person_id`, `list`, `expires_at` (now + 48 h), `used_at`
- Only the hash is stored: a database leak cannot confirm anyone.

**Status is derived, never stored:** pending (`confirmed_at is null`), subscribed (confirmed, not withdrawn), unsubscribed (withdrawn).

**Unsubscribe links are signed, not stored:** `base64url(HMAC-SHA256(DATA_KEY-derived key, "unsubscribe:" ‖ person_id ‖ ":" ‖ list))`. Nothing to expire. They work for as long as the person exists, as the law and one-click unsubscribe expect.

**The 7-day purge** runs inside the sign-up function: people with no confirmed consent and `first_seen` older than 7 days are deleted (cascading their consents and tokens). No scheduler is needed.

**Deferred:** a `suppressed` flag (07, with a sending webhook); tags, notes and the pipeline (C, D).

## 3. Flows

### Sign up — `POST /api/subscribe`

Body: `email`, `list`, `source`, and optional `campaign` (source, medium, name, first page).

1. Validate the email (format, ≤ 254). Invalid → 400 "Enter an email address like name@example.com."
2. Rate limit per connection, as a new traveller limiter scope `subscribe`: **5 an hour per address, IPv6 per /64**. It is added to `LIMITED_SCOPES` so refusals show in 04. Refused → "Too many sign-ups from this connection. Try again later."
3. Take one from today's email allowance (§4). None left → "We can't send more confirmation emails today. Try again after 05:30 IST." Counter unreadable → "That didn't go through. Try again."
4. `subscriptions.sign_up(...)`: purge (§2), upsert the person, upsert the consent (pending, unless already confirmed and not withdrawn), mint a confirm token. It returns whether an email is due.
5. Send **one** confirmation email when due.
6. **Always the same reply**, "Check your inbox to confirm.", for a new, pending or subscribed address. An already-subscribed address gets **no** email. The reply never reveals whether an address is known.

Step 3 runs before step 4 so a refused request writes nothing. A send that fails after step 4 leaves a pending row the purge will remove, and the reply is the error.

### Confirm — `/subscribe/confirm?token=…`

- Opening the link **changes nothing**. It shows the list's promise and **Confirm**.
- Pressing Confirm (`POST`) calls `subscriptions.confirm(token)`: it sets `confirmed_at` and spends the token → "You're subscribed. Every email has a one-click unsubscribe."
- States:
  - Already confirmed → "You're already subscribed."
  - Expired → "This link has expired." with an email field and "Send a new link", which goes back through the sign-up flow and its limits.
  - Unknown or malformed → invalid link.

### Unsubscribe — `/unsubscribe?p=…&l=…&s=…` (the signed link)

- Opening changes nothing. **Unsubscribe** (`POST`) verifies the signature and sets `withdrawn_at`.
- After that: "You're unsubscribed. Sign-in emails and the alerts you set up aren't affected."
- "Subscribed by mistake? Resubscribe" clears `withdrawn_at`. It is one button, valid only with the same signed link.
- The optional "Tell us why" (Too many emails · Not relevant · I didn't sign up · Other) sets `withdraw_reason`. It is never required.
- One-click `List-Unsubscribe` / `List-Unsubscribe-Post` headers belong on **list** emails (07), not on the confirmation email.

### Availability list

The same flow; its promise is one email. The list closes after 07 sends it (07's concern).

## 4. Email

- **Sender:** `Trakline <updates@trakline.in>`, on the already-verified domain; env `SUBSCRIBE_EMAIL_FROM` defaults to it. Plain text until B6's email designs exist.
- **Confirmation email:** subject "Confirm your Trakline updates".
  - Body: the list's promise, the Confirm link, and "If you didn't ask for this, ignore it — we delete the address in 7 days."
  - Links are built from the configured site origin, **never from the request**.
- **The daily allowance:** one Upstash counter per **UTC day**, `tt:{env}:email:{YYYY-MM-DD}`.
  - Every Resend send increments it, console mail included.
  - Sign-up confirmations are taken **only while the count is below 60**, so 40 stay for console links and security alerts. Console mail is counted, never gated.
  - An unreadable counter **fails closed** for confirmations.
- **Traveller sign-in mail:** the local config uses Supabase's own mailer, not Resend. Production's setting is confirmed before the UI PR; if it is Resend, it joins the counter.
- **Tests:** under `E2E=1`, mail goes to the existing in-memory outbox.

## 5. What travellers see

Drawn first (decision 1), in `docs/design/sheets/traveller/`: `SignupCapture.dc.html` and `SignupCapturePhone.dc.html`, and `Subscription.dc.html` and `SubscriptionPhone.dc.html`. They are built from the app's own markup and `app.css`, as B1 and B2 were.

- **The one-line footer:** a compact row above the line. On phones it never pushes the disclaimer, status line or clock out of view.
- **The full footer:** an "Updates by email" column.
- **Pre-booking:** under the result, after a submit: "Tell me once when availability checks open. One email, nothing else." with "Notify me". This is the availability list.
- **Every form:**
  - Label "Email".
  - Consent line: "One email to confirm. Unsubscribe in one click. We never sell your address. Privacy notice" (the last two words link to it).
  - States: idle, invalid, sending, sent, too many, daily limit, error.
- **The two pages:** `/subscribe/confirm` and `/unsubscribe`, each with the one-line footer, the states in §3, and one button that does the thing.
- **Privacy notice v1.1:** a new section "Email updates" on `/privacy`. It says what is kept (the address, where and when it was given, the consent record), why (to send what was asked for), for how long (unconfirmed: 7 days; confirmed: until unsubscribed) and how to withdraw (the link in every email). It names no provider. The page shows "Version 1.1 · <date>", where the date is the day PR 2 merges.

## 6. Failure behaviour

| Condition | Behaviour |
|---|---|
| Upstash down | Rate limit falls back per server (existing); the allowance counter is unreadable → confirmations refused with the error copy |
| Postgres down | Sign-up → "That didn't go through."; confirm/unsubscribe pages show their error state |
| Resend refuses (quota, outage) | The error copy; the pending row is left for the purge |
| Token expired / reused | "This link has expired." with a new-link field / "You're already subscribed." |
| Signature altered | Invalid link; nothing changes |
| Same address signed up repeatedly | Same reply each time; at most one email per pending sign-up per **10 minutes** (the function will not mint a new token while an unexpired one is younger than that) |

## 7. Tests (written first)

- **pgTAP:**
  - nothing in `subscriptions` is reachable by `anon` or `authenticated`;
  - derived status;
  - token hash, 48 h expiry, a spent token refused;
  - the purge removes only never-confirmed people older than 7 days;
  - withdraw and resubscribe;
  - the 10-minute resend guard.
- **Unit and integration:**
  - the same reply for new, pending and subscribed addresses, with no email to the subscribed;
  - the `subscribe` scope limited, and the 04 tripwire passing with it listed;
  - the allowance: fails closed, keeps 40, counts console mail;
  - signed links: stable, an altered one refused;
  - the pages change nothing until the button is pressed.
- **e2e (traveller suite with a database):** footer sign-up → outbox → open the link (nothing changes) → Confirm → subscribed → unsubscribe from the link → unsubscribed. Also axe and a 390 px layout scan on both pages.

## 8. Delivery

| PR | Content | Owner action |
|---|---|---|
| 1 | The two drawn sheets (four boards). No code. | **Approve the drawings** |
| 2 | Migration, functions, `/api/subscribe`, confirm/unsubscribe actions, email, allowance, limits, privacy v1.1 copy. Nothing links to it yet. | `npm run db:push` after merge |
| 3 | The forms (footers, pre-booking) and the two pages, transcribed from the approved sheets. **The launch.** | Confirm production's sign-in mailer |

The landing close plate follows journey 6/6.
