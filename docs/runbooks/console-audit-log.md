# Runbook: console audit log

Every action taken in the console is recorded, and **Audit log** (`/audit-log`, module 14) is where
an Owner or an Admin reads that record. This runbook covers how to find an action, what the page's
answers mean, what the export is and is not, and the two things about the record that are easy to
assume wrongly.

Do not paste a real member's address into a ticket, a commit, or this file. Every example below uses
a placeholder.

## Who can open it

Owner **and** Admin. For an Admin this is the first module their role can reach at all — 13 Team is
Owner-only — so it is also the first page an Admin sees a rail on.

A Support member or a Viewer who opens `/audit-log` directly gets "This module isn't part of the
*role* role." inside the console frame, not a redirect and not a 404. The database re-checks the
role itself (`console_audit` refuses anything below Admin), so the page's own check is honesty
rather than the boundary.

**Their attempt is recorded**, as an `Opened the audit log` row with the result **Refused**. That is
deliberate: someone trying to read the log is exactly the kind of thing the log is for.

## Reading the log is itself recorded

Opening the page writes one row — `Opened the audit log` / `Audit log` — per **server render**.

Nothing else on the page writes anything: changing a filter, turning a page, opening an entry and
exporting are all read paths (the export writes its own separate row; see below). So a long session
spent reading the log leaves one row, not one per keystroke, in a table nothing can delete from.

Links to this page must never set `prefetch`. A prefetched full render is indistinguishable from
somebody opening the page and would record an open that never happened. The rule is enforced by
`tests/unit/console/audit/prefetch-guard.test.tsx`; nothing you do from the console can break it.

## Finding an action

The page opens on **Today**, newest first, 50 rows to a page.

- **Date range** — Today / 7 days / 30 days / Custom. "7 days" means today and the six calendar days
  before it, in **IST** (the console's one clock), not the last 168 hours. A range is *half-open*:
  the start day from 00:00, the end day up to but not including the next 00:00, so two adjacent
  ranges never both claim a row on the seam. Custom takes two IST days and either one alone is a
  real choice.
- **Member** — every actor in the **whole log**, not only the actors in the rows currently on
  screen. So you can ask "has this person done anything this week?" and get "no" as an answer rather
  than not being able to ask. A member who has left is still selectable: the log names people as
  they were and holds no foreign key to the roster.
- **Category** — `session`, `team`, `configure`, `messages`, `provider_keys`, `leads`, `record`,
  `system`. The column is free text in the database, so a row carrying anything else still shows,
  under whatever the writer stored.
- **Result** — Done / Refused / Failed. See below.
- **Environment** — see the warning below.
- **Search** — matches the **reason** and the **target** only, not the action, the member or the
  address. It applies when you press Enter or leave the box, not on every keystroke.

Every filter is in the address, so a filtered view is a link you can paste to somebody else. The
date range, the member and the rest all survive the round trip.

## What the results mean

| Result | What happened |
| --- | --- |
| **Done** | The action went through. For an action that changes something, the change and this row were written in one transaction — if you see the row, the change happened. |
| **Refused** | The console said no: a role that may not do it, a confirmation that no longer matched, a rule like "a console needs at least one Owner". Nothing changed. |
| **Failed** | The action was allowed and did not complete. Unlike Refused, this is worth investigating. |

An action that was refused part-way leaves no half-written row: the transaction takes the whole set
or none of it.

## One entry in full

Opening a row gives you ten fields: Time, Environment, Member, Action, Target, Reason, Result,
Address, Session and Before → after.

- **Member** reads "Name · Role · key "YubiKey 5C"" where all three are known. The key's name is
  resolved **when you open the entry**, not stored on the row — so an entry whose key has since been
  removed or reset away says *key since removed* rather than pretending no key was used. A `System`
  row has no role and no key.
- **Address** is a keyed hash of the address the action came from, never the address itself. Two
  rows with the same hash came from the same place; the hash tells you nothing else, and it reads
  `local` on a deployment with no `DATA_KEY`.
- **Reason** is what the member typed at the confirmation step. PNRs, email addresses and IP
  addresses are stripped out of it twice — once by the server and again in SQL — because a slip into
  this table would be permanent.
- **Before → after** is composed from whatever the writer stored, one clause per changed field, with
  `none` for the side a field is missing from.

## The export

**Export CSV** takes a real tap of your own key and a reason, and that reason goes into the log.
What comes back is a file of the rows **currently filtered**, with all sixteen database columns —
more than the table shows.

What it is not:

- **Not a link, and not stored anywhere.** The prepared file lives in the browser that asked for it
  and nowhere else. There is no download URL, no server copy and nothing for anyone else to find.
- **Not repeatable.** It works **once**, in that browser, for **10 minutes**. Downloading it hands
  the file over and lets it go; the next export is a new tap and a new reason. This is on purpose:
  an export is a copy of the console's history leaving the console, and each one is meant to be
  accounted for.
- **Not unlimited.** More than **10,000** entries is refused — narrow the range or the filters. The
  limit is held in the database, not just in the page.
- **Not available on a phone.** Below `sm` the page says "Open on a larger screen to export." An
  export already prepared on a wide screen survives a rotate, so a tap already spent is never lost.

Every export that goes through writes its own `Exported the audit log` row, in the same transaction
as the tap it spends, recording the reason and how many entries left the console. An export that was
refused writes nothing.

The file is UTF-8 with a byte-order mark, so Excel opens Indian names and curly quotes correctly
rather than as mojibake.

## Two things not to assume

**The environment filter is a convenience, not a boundary.** Every row says which deployment wrote
it, and that display is not negotiable — a preview deployment pointed at the production database
writes rows that would otherwise read as production's own. But the *filter* is a picker: a member
chooses it, and a member can forge it, exactly as they can on the writers. Nothing in the console
treats it as isolation and nothing built on top of it may either. What keeps one console's history
out of another's is the database it is pointed at, not this argument. Scoping the read to the
caller's own environment was considered and rejected: "did a preview deployment write to
production?" is answerable only from preview rows, so scoping would delete the evidence of the exact
incident the rule exists to catch.

**Entries cannot be edited or deleted — by anyone, including you.** `console.audit_log` refuses
`update` and `delete` outright at the table, not by convention. The only thing that removes a row is
`console.purge_audit()`, which drops rows older than **two years** and nothing else; the guard checks
both the purge flag and the row's age, so neither alone is enough. The table holds no foreign keys,
so a row outlives the member, the key and the session it names, and survives every other kind of
cleanup — including the reset the end-to-end suite runs between tests.

> **Not yet scheduled.** `console.purge_audit()` exists and is tested, but nothing calls it on a
> timer yet (cron arrives in Phase 3). Until then the two-year retention is a policy the function
> implements, not one that has run — so if the count matters for a privacy answer, run it by hand
> from the SQL editor and note that you did.

## When the page will not load

"The audit log didn't load" / "The console couldn't reach its database." with a **Retry** button
means the read failed, not that the log is empty. Retry re-reads without re-rendering the page, so
it does not record a second open. An empty result says something different — "No actions in this
range" — and the button there clears the filters.

If the Member picker has gone back to offering only the people visible in the rows on screen, its
own read failed while the table's succeeded; the console logs
`[console] the audit log's member roster could not be read` and carries on rather than taking the
table down with it.

## Reading it without the console

The console is the intended way. For an incident where it is not available, the table is readable
directly from the project's database (the Supabase dashboard's SQL editor, or `psql` against the
project's connection string), with the same care every statement in
[console-keys.md](console-keys.md) asks for:

```sql
select at, environment, actor_name, actor_role, action, target, reason, result
  from console.audit_log
 where at >= now() - interval '7 days'
 order by at desc
 limit 100;
```
