# B2: Admin core (draw before Phase 2)

**Approved 19 Sep 2026.** The approved drawings are in `docs/design/sheets/console/` (the six console sheets) and `docs/design/sheets/traveller/` (Notices). Where they differ from the prompts below, the drawings win. Each folder's README lists the choices made in the drawings.

Paste the house rules and the console rules, then these prompts in order. Console sheets use the frame exactly as approved in Console Shell. The last sheet, Notices, is for travellers: it follows the house rules only and builds on the B1 drawings.

## Console Sign In

File `Console Sign In.dc.html` · Phase 2 · admin.trakline.in/login · Form TC-02

```text
Sheet: Console Sign In. Save as "Console Sign In.dc.html". Form TC-02.
No rail and no member box. The masthead shows only the mark, TRAKLINE, the CONSOLE tag and the theme button. The environment strip stays.

ONE PLATE, centred, 440px wide, in Sign in B's grammar
1. Email.
   - Title "Console sign in".
   - Lead "For the Trakline team. Use your console email, not your everyday account."
   - Field "Console email". Primary "Email me a sign-in link".
   - Legend "The link works once and expires in 1 hour."
2. Sent.
   - Title "Check your inbox".
   - "If this address belongs to a console member, a sign-in link is on its way." The wording is the same whether or not it's a member.
   - Actions: "Send it again" (disabled with the countdown "Send again in 42 s") and "Use a different email".
3. Key, after the link is opened.
   - Title "Tap your security key".
   - "Touch your key or approve on your device. Either of your keys works."
   - The light-steel lamp while waiting. Secondary "Try again".
4. Done: the lamp lit, "Signed in", just before Overview opens.

PROPS
state:
- email; email invalid ("Enter an email address like name@example.com."); sending (sweep bar); sent
- too many ("Too many sign-in requests. Try again in 10 minutes.")
- link expired or used ("This link has expired or was already used.", with "Email me a new link")
- key waiting; key failed ("That key didn't answer. Try again."); key not registered ("This key isn't registered to your console account.")
- setup incomplete ("Tap your first key, then add a second to continue.", which leads to Console Setup)
- no access ("This account has no console access.", with Sign out)
- session ended ("Your session ended. Sign in again.")
- authenticator fallback: title "Enter your code", field "Code from your authenticator app" (6 digits), "Verify". It's used only if the security-key trial fails.
- done

CHECKS
- The sent state never reveals whether the address belongs to a member.
- No password field and no "remember me".
- One primary button per state.
```

## Console Setup

File `Console Setup.dc.html` · Phase 2 · admin.trakline.in/setup · Form TC-03

```text
Sheet: Console Setup. Save as "Console Setup.dc.html". Form TC-03.
The same masthead as Console Sign In (no rail). A step legend reads "Step 1 of 3", and so on.

HOW YOU ARRIVE (one prop, "entry")
- Invite: from an invite email.
  - Title "You're invited to the Trakline console".
  - "Asha Rao (Owner) invited kiran@example.com as Support."
  - A line saying what Support can open: Overview, Leads, Privacy requests, Wrong-status reports.
  - Primary "Accept and email me a sign-in link". Then: "Check your inbox. Open the link on the device you'll set up."
- First Owner: from a one-time setup link.
  - Title "Set up the Trakline console".
  - "You'll be its first Owner. The link works once."
  - Then straight to step 1.
- Keys reset: after an Owner resets your keys. "Your keys were reset by Asha Rao on 19 Sep 2026. Add two new keys." Then step 1.
- One key only: a member who stopped after one key. "Tap your first key, then add a second." The key tap comes first, then step 2.

STEPS
1. "Add your first key".
   - "A security key, or a passkey on this device. You'll add a second next, so losing one never locks you out."
   - Field "Name this key" (e.g. "YubiKey 5C"). Primary "Add key".
   - While adding: "Touch your key…" with the light-steel lamp. When done: the row "YubiKey 5C · added 14:02 IST".
2. "Add a second key".
   - "Use a different key, or a passkey on another device."
   - The first key is listed as done.
3. "You're set up". Both keys listed. Primary "Open the console".

PROPS
- entry: invite, first Owner, keys reset, one key only.
- state:
  - step 1, step 2, step 3
  - invite expired: "This invite has expired. Ask an Owner to send a new one."
  - invite withdrawn: "This invite was withdrawn."
  - same key twice: "That key is already added. Use a different one."
  - key add failed
  - browser can't use keys: "This browser can't use security keys. Try a current Chrome, Safari, Edge or Firefox."

CHECKS
- Step 3 can't be reached with one key.
- Once a member has a key, adding another always starts with a tap of an existing key.
- Progress reads in words, not colour.
- It works fully at 390.
```

## Console Overview

File `Console Overview.dc.html` · Phase 2 · module 01 · all roles

```text
Sheet: Console Overview (module 01). Save as "Console Overview.dc.html". All roles; the plates shown depend on the role.

PAGE HEADER
- Kicker "01 · Overview". Title "Overview".
- Lead "What travellers are getting right now, and what needs you."
- Meta "Updated 14:32 IST · refreshes every minute · Sample data".

PLATES (two columns at 1440, one on phones)
1. "Service now" (all roles). A lamp, word and since-time on each row:
   - PNR checks · Answering · since 09:12 IST
   - RailKit (primary) · Answering
   - RapidAPI (fallback) · Standby
   - Shared store · Connected
   - Accounts · Connected
   - Email · Sending · 37 of 100 today
   - Status probe · Operational · last run 14:30 IST
   Variants:
   - RailKit Down with "Breaker open until 14:41 IST" while RapidAPI answers
   - PNR checks Paused
   - Live-check budget reached: PNR checks Degraded, "Today's live-check budget is used; answering from recent results"
2. "Urgent actions" (Owner, Admin; first on phones). Three secondary buttons:
   - "Pause PNR checks": Confirm it's you, with the Message to travellers
   - "Post an incident"
   - "Block an address"
3. "Checks today" (all roles).
   - Checks 212 · From cache 51 · Live 157 (RailKit 155, RapidAPI 2) · Unavailable 4.
   - Of the live answers: no record 9.
   - Legends: "Limited 3, refused before checking" and "Since 00:00 IST".
   - A meter: "Live-check budget: 157 of 300 today".
4. "Quota this month" (all roles). Meters:
   - RailKit 3,412 of 10,000 · resets 1 Oct
   - RapidAPI 3 of 10 · resets 1 Oct
5. "Queues" (Owner, Admin, Support). Each row opens its module:
   - Privacy requests: 3 open · next due 24 Sep
   - Wrong-status reports: 5 new
   - Invites: 1 pending (Owner only)
6. "People" (all roles; counts only). Accounts 1,204 (18 new today) · Subscribers 406 · Pending confirmation 37 · Unsubscribed this week 4.
7. "Open incident" (all roles; Post update for Owner and Admin).
   - Title "Slow PNR checks", status Monitoring, last update 14:10 IST, "Post update". Viewer sees "by an Admin".
   - Empty: "No open incidents."
8. "Recent actions" (Owner, Admin). The last five audit entries (time, member, action), then "Open audit log".

PROPS
- service: normal, RailKit down, checks paused, budget reached
- state:
  - ready; loading
  - plate unavailable: "Counts unavailable: the shared store didn't answer. Last good value 14:20 IST."
  - first run: "Counts start with the first check."

CHECKS
- Every figure is a count, a quota or a time. No trends, forecasts or invented percentages.
- The figures add up (see the brief's data rules).
- Viewer sees no names, no emails, no urgent actions and no recent actions.
- One primary object at most. The urgent buttons are secondary.
```

## Console Team

File `Console Team.dc.html` · Phase 2 · module 13 · Owner only · Form TC-04

```text
Sheet: Console Team (module 13). Save as "Console Team.dc.html". Owner only. Form TC-04.

PAGE HEADER
- Kicker "13 · Team". Title "Team".
- Lead "Who can use the console, and with which role."
- Primary "Invite a member".

PLATE "Members" (table)
- Columns: Name · Email (in full; team emails aren't masked) · Role (tag) · Keys ("2 keys", "3 keys", or "1 key · setup incomplete") · Last active ("14:02 IST", "3 days ago") · Status (Active, or Setup incomplete).
- Row menu: Change role · Reset keys · Remove.
- Sample members: Asha Rao (Owner), Rohan Iyer (Admin), Kiran Das (Support), Meera Nair (Viewer, setup incomplete).

PLATE "Pending invites" (table)
Email · Role · Sent · Expires ("26 Sep 2026") · Resend · Revoke.

PLATE "Roles"
- A matrix of the 14 modules against Owner, Admin, Support and Viewer. A filled square means full access, a half-filled square means read-only or counts only, and a hollow square means none.
- Under it:
  - "Only Owners manage the team and provider keys."
  - "Viewers see counts only, never personal data."
  - "Every member signs in with an email link and one of their keys."

DIALOGS
- "Invite a member" (TC-04):
  - Email, and Role (four options, each with a one-line description).
  - Legend "The invite lasts 7 days. It can't go to an address that already has a Trakline account."
  - Then Confirm it's you.
- "Change role": current → new, with the legend "Kiran is signed out everywhere at once and signs in again with the new role." Then Confirm it's you.
- "Reset keys": "Kiran is signed out everywhere and will add two new keys at next sign-in." Then Confirm it's you.
- "Remove member": "Kiran is signed out everywhere at once." Then Confirm it's you.
- Resend and Revoke: a plain confirm.

PROPS
- state: ready; loading; error; only you ("You're the only member.", with Invite); no access (Admin opening Team).
- dialog: none, invite, invite refused ("This address already has a Trakline account. Invite a dedicated console address."), change role, reset keys, remove, last Owner ("A console needs at least one Owner. Make someone else Owner first.").

AT 390 WIDE
Reading only: "Open on a larger screen to manage the team."

CHECKS
- Invite, change role, reset keys and remove all go through Confirm it's you.
- The roles matrix uses three shapes, not colour.
```

## Console My Keys

File `Console My Keys.dc.html` · Phase 2 · member menu · every member

```text
Sheet: Console My Keys. Save as "Console My Keys.dc.html". For every member, opened from the member menu. It has no module number, and no rail item is current.

PAGE HEADER
Kicker "Your account". Title "My keys". Lead "The keys you sign in with, and where you're signed in."

PLATES
1. "Profile": Name · Email · Role · Member since.
2. "Keys" (table):
   - Name · Type (Security key or Passkey) · Added · Last used.
   - Row actions: Rename, Remove.
   - Primary "Add a key". Adding starts with a tap of a key you already have.
   - Legends:
     - "You need at least two keys. Add another before removing one."
     - "Only keys added here or during setup work for the console."
3. "Sessions": this device ("Chrome on macOS · signed in 09:12 IST", tagged This device), then the others ("Safari on iPhone · last seen yesterday, 22:40 IST"). Action "Sign out other sessions" (plain confirm).
4. "If you lose your keys" (Owner only): "Another Owner can reset them. If you're the only Owner, they're reset in the Supabase dashboard, so keep your keys in different places."

PROPS
state:
- ready; error
- adding: tap an existing key, then the new one, with the light-steel lamp
- remove blocked: Remove disabled, with the legend
- removed: Confirm it's you, then "Key removed · logged"
- others signed out: "Other sessions signed out · logged"

CHECKS
- A key can never be removed if that would leave fewer than two.
- It works fully at 390.
```

## Console Switches

File `Console Switches.dc.html` · Phase 2 · module 11 · Owner, Admin

```text
Sheet: Console Switches & settings (module 11). Save as "Console Switches.dc.html". Owner and Admin. Every change goes through Confirm it's you, showing before → after.

PAGE HEADER
- Kicker "11 · Switches & settings". Title "Switches & settings".
- Lead "What travellers get, changed here and recorded in the audit log."

PLATE "Switches"
Each row has a name, the state as a tag, a one-line effect, "Last changed 18 Sep 2026, 21:10 IST by Asha Rao", and a control.
- PNR checks: On or Paused. Pausing asks for the "Message to travellers" (required, 120 characters).
- Primary source: RailKit or RapidAPI, as a two-box segmented control.
  - Beside it, the quota left: "RapidAPI: 7 of 10 left this month".
  - Choosing a source with little quota left shows a warning legend before the confirm.
- Fallback source: On or Off. "When the primary can't answer, ask the other source."
- New traveller accounts: Open or Closed. "Closed: existing accounts still sign in, and new addresses get no link. Console invites aren't affected."
- Traveller passkey sign-in: On or Off. "Console keys aren't affected."
- Site notice: Off or On, with its text (160 characters) and a preview of the strip travellers see.

PLATE "Limits"
- Checks per address: 20 per minute. The field accepts 5–60. Legend: "Every address, shared across servers. IPv6 is limited per /64 network."
- Live checks per day: 300, across all addresses. A meter: "157 used today". Legend: "Past this, checks answer from recent results, or say the service is busy until 00:00 IST."

PLATE "Recent changes"
The last five changes from the audit log, then "Open audit log".

PROPS
state:
- ready
- saving: the sweep bar
- saved: "PNR checks paused · logged"
- failed: "Not saved: the change didn't reach the store. Nothing changed."
- checks paused: the notice strip shows
- a source not configured: its control is disabled, reading "Not configured"
- no access

AT 390 WIDE
Only PNR checks, with its message, can be edited. The rest read "Open on a larger screen to edit".

CHECKS
- Every row shows who changed it last, and when.
- Choosing RapidAPI as primary shows its remaining quota before the confirm.
```

## Notices (traveller)

File `Notices.dc.html` · Phase 2 · trakline.in · travellers · house rules only

```text
Sheet: Traveller notices. Save as "Notices.dc.html". What travellers see when the console changes something.
Build on "Landing Redesign B.dc.html" (the hero and its check plate), "PNR Result.dc.html" and "Sign In.dc.html". Change only what's named here.

1. SITE NOTICE STRIP, under the masthead on every page:
   - A full-width hairline strip with a steel lamp, the notice text ("Planned maintenance on 21 Sep, 02:00–03:00 IST. Checks may be slow.") and a close button.
   - Once closed, it stays closed for that notice on this device.
   - One line on desktop; it wraps on phones.
2. PNR CHECKS PAUSED:
   - The check plate (Form TL-01) replaces Run with a paused state: the title "Checks are paused" and the console's message ("Checks are paused for maintenance. Back by 15:00 IST."). The digits stay editable; Run is disabled.
   - The result page shows its unavailable plate with Response "Paused" · Provenance "Trakline" · Fallback "None".
   - The footer status line reads "PNR checks are paused".
3. LIVE-CHECK BUDGET REACHED:
   - A check answers from a recent result when one exists, with the usual "Retrieved …" line.
   - Otherwise: "Trakline is busy. Try again after 00:00 IST." with the unavailable plate.
4. NEW ACCOUNTS CLOSED:
   - On the sign-in page, after an address is submitted: "If this address has an account, a sign-in link is on its way." It's the same for everyone while sign-ups are closed.
   - Legend "New accounts are closed for now."

PROPS
notice (off, on); checks (answering, paused, budget reached); sign-ups (open, closed); page (landing, result, sign in).

CHECKS
- A paused or busy state never looks like an error, and nothing is substituted for data.
- The notice strip never covers the masthead.
```
