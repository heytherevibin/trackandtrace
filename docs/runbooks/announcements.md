# Runbook: announcements

Module 07 sends one plain-text letter, written by an operator, to the people who asked for updates on
a list. This is what that operator needs: how a letter goes out, how to tell it has stopped going,
what each kind of stuck means, and the two decisions only a person can make: what to do with a
delivery nobody can vouch for, and whether to lift a suppression.

Two scripts, run by one workflow (`.github/workflows/announce.yml`), and they are not the same job:

```bash
npm run announce:send      # take what today's allowance covers from the letter at the head of the queue, send it
npm run announce:report    # read the store only; name anything stuck. Exit 0, 1 or 2
```

Both take their environment the way every script beside them does (`node --env-file-if-exists`,
already wired into the npm script). `announce:report` sends nothing and asks Resend for nothing, so it
costs no allowance and can be run as often as you like. `announce:send` spends today's allowance.

**What exists today, and what does not.** This runbook is written with the backend (PR 2). The
console pages (PR 3, from sheet 23) are not built, and the database migration for it has not been
applied yet. Where a step below says "in the console", that is the page that will do it; until it
ships, Compose, Test send and Queue have no screen, and Stop and the suppression lift are done in the
SQL editor as the service role (each section says what to run). Nothing in the workflow changes when
the pages arrive.

## Before the first run: the owner's one-time setup

A run with any of these missing fails, loudly and by name, which is the intended failure:

- **Repository secrets**: `RESEND_API_KEY`, `DATA_KEY`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`,
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`.
  `DATA_KEY` must be **the same key the site runs with**: it signs the unsubscribe links, and a link
  signed with any other key verifies nowhere. The runner refuses to start without it, and without the
  Upstash pair, because the day's allowance is one counter in Upstash that the site also spends; an
  in-process counter would start every run at zero and send past the plan.
- **Optional repository variable**: `SUBSCRIBE_EMAIL_FROM`, if the site sends from anything but the
  schema's default, so a letter arrives from the same name as the confirmation before it.
- **The Resend webhook**: an endpoint pointing at `POST /api/webhooks/resend` in the Resend
  dashboard, and its signing secret set as `RESEND_WEBHOOK_SECRET` in the deployment. This is the only
  way a bounce or a complaint ever becomes a suppression. Until it is set, nothing is suppressed and
  the sender will keep mailing an address that has bounced.

## What an operator does

1. **Compose.** Pick a list, write a subject (up to 200 characters) and a body (up to 20,000).
   Plain text only: there is no HTML field, by decision. **Never write an unsubscribe line or link.**
   The sender appends the unsubscribe line and the `List-Unsubscribe` headers itself, worded for the
   list's own promise, so forgetting them is impossible and typing a second one is a mistake.
2. **Test send.** One real email to an address you can read. It spends one email from the day's
   allowance and it is required: Queue stays locked until a test has gone. Read it as a subscriber
   would, in a real inbox: the subject, the line breaks, and that the unsubscribe link at the foot
   is there and is the site's own address.
3. **Queue.** This writes the recipient set and **freezes it**: whoever is on the list at that moment
   is who the letter is for. Someone who subscribes tomorrow does not receive it, and someone who
   unsubscribes after Queue is checked again at send time and skipped. Queue sends nothing. The
   drain starts at the next scheduled run (04:00 UTC, 09:30 India time), or at once if you start the
   workflow by hand (Actions, "Send announcements", "Run workflow"). Letters drain **one at a time,
   oldest queued first**; a letter behind another waits in `queued` until the one ahead is done.
4. **Watch.** Each run's log prints counts and the letter's id: how many sent, how many skipped as
   suppressed, how many failed and are left to retry. It never prints an address. The `report` job,
   below, is the thing that tells you it has stopped advancing; the console's detail view will show
   **sent, skipped and unknown as three separate counts**, plus what is still pending.
5. **Stop.** Takes effect at the next recipient, not at the end of a batch: the letter's state is read
   before every send. Stopping halts the remainder; what has gone has gone. Until the console has the
   button, a Stop is `select public.announce_stop('<letter id>');` as the service role.

**A stopped letter is final.** There is no resume. To send the rest, compose a new letter, which will
go to everyone on the list when *it* is queued, including the people the stopped one already reached.
Say so in its opening line. And one consequence to know before pressing Stop on the **availability**
list: that list promised exactly one email, a database trigger refuses a second letter once one has
been queued, sending, stopped or done, and a stopped letter counts. Stopping the availability letter
spends the list for good.

## The daily allowance

Resend's free plan allows **100 emails a day for the whole deployment**, and every kind of mail
shares that one counter. Announcements may take only while the day's total is **under 40**;
sign-up confirmations are held to under 60; operator mail (console sign-in links, security alerts) is
counted but never gated. So a letter to a list of 400 takes at least ten days at 40 a day, and takes
longer on any day sign-ups have already used the room: **announcements are the first thing squeezed,
on purpose.** A confirmation link expires in 48 hours and an operator who cannot sign in is the
wrong failure; a letter can always wait a day. A run that finds the allowance spent sends nothing and
says so; that is a normal day, not a fault.

**The day rolls over at 00:00 UTC, which is 05:30 India time, not at India's midnight.** Resend
counts a UTC day and the counter follows it. An operator who expects the allowance back at midnight
local will be wrong by five and a half hours, and a spent day looks spent until half past five in the
morning.

The counter is reserved before sending and the unused part is given back, so a run is charged for
what it claimed and not for what it asked for. If the counter cannot be read, the run sends nothing
rather than guess.

## When the report goes red

`announce:report` reads every letter that is `queued` or `sending` and exits with a ladder in which
the highest wins:

| Exit | Meaning |
|---|---|
| `0` | The store was read in full and nothing is stuck. |
| `1` | The store was read in full and something is stuck, and nothing else is wrong. |
| `2` | The report is **incomplete**: it could not start, the store could not be read, a letter could not be read, or the script crashed. |

An incomplete report that also found something still exits 2: **incomplete beats known**, so a letter
the report could not read is never hidden behind a finding on another one. Output still carries every
finding and every skipped letter; only the code names the worst of it. **Both 1 and 2 fail the `report`
job**, and `report` is deliberately not `continue-on-error`, so either turns the whole run red. That is
the point of it being its own job: red is the state someone notices. The `send` job's own result
stays separately readable on the run page; "sending failed today" and "a letter is stuck" are
different things to look at.

Start at the `report` job's log. Each finding is one line with a letter's id and a reason:

- **"no delivery in 48 hours, N still pending"** (or "nothing delivered in the 48 hours since it was
  queued"). A letter has work left and has sent nothing for two days. The job runs daily, so two runs
  without progress means the job is not running or every send is failing. Look at the `send` job: a
  missing secret, a spent allowance every single day (something else is using the room), or a refusal
  on every send. The report cannot say which; the run's own log does.
- **"no work left, but it was never marked done"**. The letter is `queued` or `sending` with nothing
  pending and nothing in flight, 48 hours on. It finished its work and was never closed: the send job
  died between the last send and marking it done, and the next run has not fixed it. Not exotic after
  a spent allowance (a day's run can stop before it re-reads what remains, and the next run finishes
  it), which is why only the 48-hour mark is a finding. Start the workflow by hand and read the log.
- **"N deliveries claimed over 24 hours ago and never marked"**. A delivery is still `sending` past
  the 24-hour window, measured from its **first** attempt, never its latest claim: a re-claim renews
  the claim time and does not renew Resend's memory of the key, so the latest claim would read
  "young" for ever on a row that keeps failing. The send run is the only thing that turns such a row
  `unknown`; one still `sending` means the runner is not reaching it. The same fix as above: run the
  send job and read its log.
- **"N unknown: we cannot say whether it was sent"**. Never normal. See the next section. Be aware
  the report cannot see these today (below), so you will usually learn of them from the send log or
  the console, not from here.

**What the report cannot see, so a green one is not a clean bill.** It does not read `unknown`
deliveries today: the only per-delivery read it has returns rows that are `sending`, so the rule that
names `unknown` is proven in tests and is fed nothing, and the report's own last line says so. It
cannot tell why a letter is stuck. It does not say a letter is going slowly (100 a day against a long
list is slow by design). Until the store supplies each letter's last-delivery time, a letter is
measured from when it was queued. It reads no address, no body and no signature.

If the report job fails and the log says "the environment is not valid", a secret is missing or
mis-pasted: fix the secret, do not silence the job.

## `unknown`: what it is, and why it is never retried

A send that times out is ambiguous: Resend may have accepted the message before the connection
dropped. So a failed send leaves the row `sending`, and the next run tries again **under the same
`Idempotency-Key`** (`<letter id>:<person id>`), which is safe, because Resend answers a repeat
within the window with the first result instead of sending again.

**Resend forgets an `Idempotency-Key` after 24 hours.** Past that the key no longer deduplicates.
Retrying a delivery that may already have been accepted would, from then on, send a real person the
same letter twice. So a delivery first attempted more than 24 hours ago and still unmarked is moved
to **`unknown`** and **never retried**. `unknown` means "we cannot say whether this was sent". It is
not sent and it is not failed; it is its own count and is never folded into either. The send run is
the only thing that writes it, and the run says so: "N claimed over 24 hours ago, so they are now
unknown and will not be retried."

A person decides. For each, in Resend's own logs, find out whether that address's message from that
day was accepted. If it was, it is a send: leave it. If it was not, the options are to leave it (one
subscriber misses one letter) or to send them a note by hand. **Never set an `unknown` row back to
`pending`.** It would be sent under the same key Resend has forgotten, which is the duplicate this
rule exists to prevent. A handful over the life of a letter is a fact of life; a rising number means
sends are timing out, and that is the thing to find.

## Suppression: lifting one by hand

A suppression is keyed by **address** (not by person: operators bounce too, and they are not
subscribers), and the address is stored `lower(btrim(...))`. It has a **scope**, and what causes it
decides the scope:

| Cause | Scope | Effect |
|---|---|---|
| Hard bounce (`email.bounced`: permanently rejected) | `all` | No mail of any kind goes to the address, sign-in links included. |
| Complaint (`email.complained`) | `list` | No list mail, **and consent is withdrawn on every list.** A link someone explicitly asked for still arrives. |
| Soft failure (`email.delivery_delayed`) | `list` | Only after **three in 30 days** for one address. One or two are recorded and nothing happens: one bad night at a mail host is not a dead address. |

The sender checks this before every send and **fails closed**: if the table cannot be read, nothing
goes out. A suppressed address in a letter's recipient set is **skipped** (marked `skipped`), not
retried: retrying it every day would spend allowance on mail that will never go. An operator's own
address can be suppressed too, and a hard-bounced operator address silently stops their sign-in mail,
so the console's suppressions view names operator addresses explicitly.

**When lifting is right.**

- **Hard bounce: only when the address itself has been fixed.** The mailbox did not exist, or the
  domain refused it permanently; if the person has corrected it (a typo found, a mailbox created) it
  is right. If nothing about the address changed, lifting only restores the damage to the sending
  domain that the suppression was preventing.
- **Soft failure: when the cause was temporary and is over** (a full mailbox, an outage at their host).
  The earlier events remain inside the 30-day count, so expect one more delay to suppress it again.
- **Complaint: almost never.** Someone told their mail provider this was not wanted, and consent was
  withdrawn separately; lifting the suppression does not give the consent back and should not. The
  one defensible case is a person who has deliberately signed up again afterwards, confirmed by a
  route that is not the mail they complained about. Do not lift a complaint because someone on the
  team asks nicely or the list is short.

**How.** In the console the suppressions view has a Lift with its own confirm, and it writes a row to
the audit log (module 14). Until that exists, as the service role in the SQL editor:

```sql
delete from announcements.suppressions where email = lower(btrim('<the address>'));
```

That bypasses the console and **writes no audit row**, so say why in the team's own record at the
time. Two things to check. **Resend keeps a suppression list of its own**, which mirrors into ours by
webhook (a `suppression.removed` event deletes only rows our own table marks as Resend's, so Resend
lifting its own never undoes one set by hand), and which our delete does not touch: look the address up
in the Resend dashboard and remove it there too, or the send is refused at their end. We have not
tested what the sender reports in that case. And do not paste the address anywhere that is not the
SQL editor: not a ticket, not a chat, not a commit.

## Related

- `scripts/announce-plan.mjs`: every decision the runner makes, and what each run cannot see. Read
  its header before changing the 24-hour rule, the one-letter-at-a-time rule or what a failed send does.
- `scripts/announce-coverage.mjs`: what counts as stuck, and the report's blind spots. Read its header
  before changing any rule; `scripts/announce-report.mjs` is only the wiring and the exit ladder.
- `scripts/announce-send.mjs`: the runner's wiring, and why it refuses to start without `DATA_KEY` and
  the shared counter.
- `src/services/announcements/budget.ts` and `src/services/email/allowance.ts`: the day's counter and
  the three ceilings that share it.
- `src/services/email/suppression.ts`: the one door all outgoing mail goes through. A contract test
  fails the build if anything else reaches the sender.
- `docs/superpowers/specs/2026-10-02-announcements-design.md`: the decisions this module rests on.
