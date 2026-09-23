# Runbook: console team

Who can open the console, and with which role, is managed from **Team** (`/team`, module 13) by an
Owner. This runbook covers what that page does, the refusals that are deliberate, and the two
situations Team cannot answer on its own.

Do not paste a real member's address into a ticket, a commit, or this file. Every example below
uses a placeholder.

## Who can see Team at all

Team is Owner-only. An Admin, Support or Viewer has no Team link in the rail and, if they open
`/team` directly, gets "This module isn't part of the *role* role." — not a redirect and not a
404, so nobody is left guessing whether the page exists. `console_team()` re-checks the role in
the database regardless, so the page's own check is honesty rather than the boundary.

## Inviting

**Invite a member** takes an address and a role, then a tap (your own key) and a reason. The reason
goes in the audit log; PNRs, emails and IP addresses are stripped from it on the way in.

The letter is a one-time link that lasts **7 days**. The invited person opens it, presses *Accept and
email me a sign-in link*, and a sign-in link follows to the same address — deliberately two steps,
because the device that accepts an invite and the device that sets up the keys are allowed to differ.
Setup then asks them for two security keys, exactly as a first Owner's does.

Three refusals are by design:

- **"This address already belongs to a console member."** They are already in the table, possibly
  with a different role. Change their role instead of inviting them again.
- **"This address already has an invite open. Resend or revoke that one instead."** One live invite
  per address, enforced by a unique index. See *Resending* below — this is the usual case for an
  invite that has expired.
- **"This address already has a Trakline account. Invite a dedicated console address."** The address
  has a traveller account. Console access and traveller accounts are deliberately separate; use an
  address that has neither.

A member who was **removed** can be invited again: removal is a soft delete, and only a member row
that is not `removed` blocks a fresh invite. They come back the same way anyone does — the letter,
then Setup, then two fresh keys — because removal deleted the keys they used to hold. The keys they
had before are gone for good; a physical key they kept is enrolled again as a new one.

## Resending, and an invite that has expired

**Resend** takes no tap and no reason: it re-sends a letter to an address an Owner already approved
and changes nobody's access. It mints a **fresh token** and pushes expiry out another 7 days, and the
old link stops working at once.

An expired invite is still listed, and Resend is the way to recover it — not a second invite. The
address stays held by the live-invite index whether or not the invite has expired, so re-inviting it
would refuse while the old row is still there. Resend, or Revoke and then invite again.

**Revoke** does take a tap and a reason: it withdraws access that was granted. The link stops working
immediately, and the row leaves the pending list. No second letter is sent — there is nothing to
tell the recipient that a link they may never have opened has stopped working, so say so yourself if
it matters.

## Changing a role

A role change **signs the member out everywhere at once**; they sign in again with the new role. That
is the whole point — a role taken away must not keep working in a tab that is already open — but it
does mean a change made mid-shift interrupts whatever they were doing.

The picker never offers the role they already hold. Two changes are refused outright, with "A console
needs at least one Owner":

- **Your own row.** Always, whatever the new role and however many other Owners there are. To step
  down, have another Owner change your role.
- **The last active Owner.** An Owner still in setup does not count towards the floor, so a console
  whose second Owner has not finished adding their keys still has exactly one active Owner.

Make someone else an Owner first, then the change you wanted goes through.

## Resetting a member's keys

**Reset keys** deletes every key that member holds, signs them out everywhere and stamps their row.
Their next sign-in link takes them back to Setup to add two new keys. Use it when a member's keys are
lost or the device is gone.

You **cannot reset your own keys**, and the console says so rather than offering the dialog. A
self-reset would delete every key you hold while leaving your account active: no key to sign in with,
no re-invite (your row is not `removed`), and — if you are the console's only Owner — no fresh
first-Owner link either. If you want fresh keys for yourself, add the new one under **My keys** and
remove the old one; that path never passes through zero keys.

If the console's **last Owner** has lost both keys, nobody inside the console can reset them. That is
the one statement in [console-keys.md](console-keys.md#recovery-the-last-owner-has-lost-both-keys).

The confirmation is bound to the number of keys the page was showing when you opened it. If someone
adds or removes one of that member's keys in between, the reset is refused with "That confirmation no
longer matches this member's keys." Reload Team and try again — retrying from the stale page would
fail the same way.

## Removing a member

**Remove** signs them out everywhere, **deletes every security key they hold**, and takes their
access away. It is a soft delete of the *member*, not of their credentials: the row stays with
`status = 'removed'`, so every audit row naming them still resolves, and they can be invited again
later — but the keys do not come back with them, and the audit row records how many went. The same
two refusals as a role change apply — your own row, and the last active Owner.

The keys go on purpose. Without that, a re-invited member's old keys stayed on the row their
acceptance reactivates, which sent their sign-in to the key step instead of Setup and left them
unable ever to reach the step that finishes it — signed out of every page with "Your session ended",
while their roster row read an ordinary "Setup incomplete · 2 keys".

## What is written down

Every action above writes one audit row inside the same transaction as the change itself: the actor,
the target, your reason, and the before/after where there is one. Nothing is written for an action
that was refused part-way — the transaction takes the whole set or none of it.

Read the trail in **Audit log** (`/audit-log`, module 14) — filter Category to *Team*, or Member to
one person. [console-audit-log.md](console-audit-log.md) covers what each result means and what the
export is. Rows are kept for two years, the table refuses every update and delete, and it holds no
foreign keys, so a row outlives the member it names and survives every other kind of cleanup.

## When Team refuses and you cannot tell why

"The team has changed since this page loaded. Reload it and try again." is the console's one sentence
for every refusal that means the roster moved underneath the page — a member removed in another tab,
an Owner demoted, an invite already accepted. It is not an outage. Reload `/team` and look at what is
actually there before trying again.

"That confirmation no longer matches…" is different: the tap you took was bound to facts that have
since changed. Where the message asks for a reload, reload — a retry from the same stale page mints
the same stale confirmation.
