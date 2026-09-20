# Runbook: console keys

Two situations need a human at a SQL editor rather than the console's own UI: starting the console
for the very first time, and recovering an Owner who has lost both security keys. Both statements
below run against the project's database directly (the Supabase dashboard's SQL editor, or `psql`
against the project's connection string) — never through the app, and never with a role weaker than
the database owner. Replace every placeholder before running anything; do not paste a real member's
address into a ticket, a commit, or this file.

## Starting the console: the first Owner's link

`console.create_first_owner_link` is revoked from every role but the database owner, on purpose —
it is the one action nobody in the app can trigger. It works only while the console has no Owner,
and it returns a one-time link that expires in 24 hours:

```sql
select console.create_first_owner_link('owner@example.com', 'https://admin.trakline.in');
```

Send the returned link to that person outside the app (there is no invite and no email for this
step — opening the link is the whole credential). It redeems once, at `/setup`, and takes them
through adding two security keys.

**If the link is lost before it's redeemed:** run the statement again. Issuing a link never spends
one, so losing one before it's opened costs nothing — only redeeming a link (or the console already
having an Owner) stops a later one from working.

## Recovery: the last Owner has lost both keys

Normally one Owner resets another's keys from inside the console. The **last** Owner has nobody to
do that for them, so `console.keys` is cleared directly instead — the one statement spec §D
promises here:

```sql
delete from console.keys
 where member_id = (select user_id from console.members where email = 'owner@example.com');
```

This leaves the member with zero keys but their account otherwise intact (role, status and every
audit row are untouched — the audit log holds no foreign keys, so it survives everything). Their
next sign-in link takes them to Setup again to add two new keys, because Setup runs whenever a
member holds fewer than two keys, not only for a brand-new one. If Setup doesn't hand them straight
back into the console once both are added, have them ask for a fresh sign-in link and tap in
normally — their new keys are already on file by then.

## After deploying: confirm a sign-in link actually arrives

Spec §5 makes the sending path fail *silently by design* — sign-in must answer identically whether
Resend is up or down — so a deploy that touches sign-in, email, or the Supabase redirect allow-list
gets no automatic signal of its own. The first real production sign-in is also the first test of
`generateLink`'s `redirectTo` against that allow-list, of Resend and the `console@trakline.in`
sender, and of `after()` actually running to completion on Vercel. A link that never sends leaves no
counter, alert or audit row behind — only a log line, if that.

So after every deploy that could affect any of those, request a sign-in link for a real Owner
address at the console's own `/login` and confirm the email arrives **before anyone depends on the
console being reachable.** Do not put that address, or anything else from this check, into this
file, a ticket, or a commit — it is a runbook, not a place for real members' addresses or secrets.

If the email does not arrive, check that deployment's logs for these three lines — the only three
`sendConsoleEmail` (`src/console/email/send.ts`) ever writes:

- `[console] no RESEND_API_KEY: console email is not configured for this deployment` — the
  environment variable is missing on this deployment.
- `[console] resend refused a send` — Resend rejected the request (an unverified sender or domain
  is the usual cause).
- `[console] could not send console email` — the request to Resend itself failed or never
  finished (a network error, or `after()` not outliving the request).
