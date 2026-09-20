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
