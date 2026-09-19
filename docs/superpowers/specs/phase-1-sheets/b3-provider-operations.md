# B3: Provider operations (draw before Phase 3)

Paste the house rules and the console rules. The last sheet, Status, is the public status page and the footers' status line. It follows the house rules only and builds on the B1 drawings.

## Console Sources

File `Console Sources.dc.html` · Phase 3 · module 02 · Owner, Admin, Viewer (read-only)

```text
Sheet: Console Sources & usage (module 02). Save as "Console Sources.dc.html". Owner and Admin; Viewer can read it. There are no actions on this sheet.

PAGE HEADER
- Kicker "02 · Sources & usage". Title "Sources & usage".
- Lead "How each data source is answering, and how much of its quota is spent. Counts only: no PNR is ever stored."
- Meta "Updated 14:32 IST · Sample data".

ONE PLATE PER SOURCE: "RailKit · primary" and "RapidAPI · fallback"
Header meta cells: the plan ("Enterprise · 10,000 a month") and a state tag.
- Breaker, as a lamp and a word:
  - Answering.
  - Down: "Not asked until 14:41 IST · opened 14:36 after 5 failures in 60 s".
  - Probing: "The next request is a probe".
  - "Trips today: 1".
- Today, since 00:00 IST:
  - Requests 158 · Answered 155 (with a record 146, no record 9) · Failed 3.
  - Failed by cause: Timeout 1 · Network 0 · Server 1 · Refused 0 · Quota 0 · Unreadable 1.
- This month: the meter "3,412 of 10,000 · resets 1 Oct", and "Average 180 a day this month".
- Last failure: "Timeout · 14:36 IST".

PLATE "Last 30 days"
- A bar chart of daily requests: one chart per source, stacked vertically, each labelled.
- Days before counting began are dashed outline boxes labelled "No data".
- "Show as table".

PLATE "Cache"
"From cache today: 51 of 212 checks."

PROPS
state: ready; loading; RailKit down while RapidAPI answers; both down; a source not configured ("RapidAPI · Not configured on this environment"); counts unavailable.

CHECKS
- No PNRs anywhere.
- Causes are words.
- The sources are told apart by labels, not colours.
- Requests = answered + failed (158 = 155 + 3), and the causes add up to the failed count.
```

## Console Provider Keys

File `Console Provider Keys.dc.html` · Phase 3 · module 12 · Owner only · Form TC-05

```text
Sheet: Console Provider keys (module 12). Save as "Console Provider Keys.dc.html". Owner only. Form TC-05.

PAGE HEADER
- Kicker "12 · Provider keys". Title "Provider keys".
- Lead "The keys Trakline uses to ask each data source. Stored encrypted, and never shown again after entry."
- Primary "Add a key".

ONE PLATE PER PROVIDER ("RailKit", "RapidAPI"), each a table
- Columns:
  - Order: 1, 2 …
  - Label: "Enterprise main"
  - Key: "•••• 4F2A"
  - Plan: "Enterprise"
  - Quota: "10,000 a month"
  - Used this month, with a small meter
  - Health, as a lamp and a word: Healthy · Refused · Over quota · Down
  - State: Active · Standby · Disabled
  - Last used
- Row actions: Move up · Move down (failover order) · Rotate · Disable or Enable · Remove.
- Also draw a row for a key that still lives in the deployment environment:
  - Label "From environment", Key "•••• 91C0", and the legend "Managed in Vercel until moved here".
  - Its only action is "Move to console".

PLATE "How failover works"
"Active keys are used in order. When a key is refused or over quota, the next active key takes over. Standby keys are used only when every active key fails. Use keys from paid plans: pooling free keys to get round a provider's limits can break its terms."

DIALOG "Add a key" (TC-05)
- Fields: Provider (RailKit or RapidAPI) · Label · Key · Plan · Monthly quota · State (Active or Standby).
- The Key field is password-style and paste-only, with the legend "Stored encrypted. You won't see it again."
- Primary "Test and save". While testing: "Testing… (uses one request)".
- The test ends in either:
  - "Key works", then Confirm it's you
  - "Key refused. Check it and try again."
- Rotate: the new key replaces the old one in the same slot, with the same test, then Confirm it's you.
- Remove and Disable: Confirm it's you.

PROPS
- state:
  - ready
  - no console keys: "No keys here yet. Checks use the key from the environment."
  - no key at all: "PNR checks can't be answered without a key."
  - a key over quota
  - no access (Admin)
- dialog: none, add, testing, test failed, rotate.

AT 390 WIDE
Reading only.

CHECKS
- A full key is never visible, including in the dialog after saving.
- Every change goes through Confirm it's you.
```

## Console Abuse

File `Console Abuse.dc.html` · Phase 3 · module 04 · Owner, Admin · Form TC-06

```text
Sheet: Console Abuse & limits (module 04). Save as "Console Abuse.dc.html". Owner and Admin. Form TC-06.

PAGE HEADER
- Kicker "04 · Abuse & limits". Title "Abuse & limits".
- Lead "Addresses that hit the limit or were blocked. Addresses are stored as hashes; nobody here sees an IP."
- Primary "Block an address".

PLATE "Limits"
- "20 checks per minute per address (IPv6: per /64 network)".
- "Live checks today: 157 of 320".
- "Limited today: 3".
- A link "Change in Switches & settings".

PLATE "Blocked" (table)
- Columns: Address (a hash: a3f9…c2c1, tagged "IPv6 /64" where it applies) · Note ("Scripted checks") · Blocked by · Since · Until ("25 Sep 2026, 14:02 IST", or "Until removed") · Refused since block (a count).
- Row action: Unblock, through Confirm it's you.

PLATE "Most limited today" (table)
Address (a hash) · Times limited · First seen · Last seen · a "Block" action.

DIALOG "Block an address" (TC-06)
- An "IP address" field, with the legend "One IPv4 address, or an IPv6 address; for IPv6 the whole /64 network is blocked. We hash it on entry and never store it."
- Opened from a row instead, the hash is prefilled and the field is hidden.
- Duration: 1 hour · 24 hours · 7 days · Until removed. A note field.
- Then Confirm it's you.

PROPS
- state:
  - ready
  - nothing blocked: "No addresses are blocked."
  - quiet day: "No address hit the limit today."
  - stale blocks: "12 blocks were made before the address key changed, and no longer match. Re-enter them or let them expire."
  - store unavailable: "Limits are per server until the shared store answers."
- dialog: none, block, invalid ("Enter one IPv4 or IPv6 address.").

AT 390 WIDE
"Block an address" works fully (an urgent action); the tables are read-only.

CHECKS
- No raw IP is shown anywhere, including after the block dialog is submitted.
```

## Console Status

File `Console Status.dc.html` · Phase 3 · module 03 · Owner, Admin (edit), Viewer (read) · Form TC-07

```text
Sheet: Console Status & incidents (module 03). Save as "Console Status.dc.html". Owner and Admin can edit; Viewer can read. Form TC-07.

PAGE HEADER
- Kicker "03 · Status & incidents". Title "Status & incidents".
- Lead "What trakline.in/status says, and the incidents you post."
- Primary "Post an incident". Secondary "Open /status".

PLATE "Components", as travellers see them: PNR checks · Accounts and watchlist sync
For each:
- Measured now: a lamp and a word (Operational · Degraded · Paused · Down · Unmeasured), "from the probe at 14:30 IST".
- Shown publicly: the worse of the measurement and any open incident's impact.
Legend: "The public page never shows better than the measurement."

PLATE "Open incident"
- Title and impact: "Degraded · PNR checks".
- The updates as a vertical timeline, newest first: Monitoring 14:10 → Identified 14:05 → Investigating 13:52, each with its author. Viewer sees roles instead of names.
- Actions: "Post update" and "Resolve".

PLATE "Probe"
- "Every 5 minutes · last run 14:30 IST · 175 runs today · 0 missed."
- Legend: "The probe checks our own service and reads how real checks are going. It spends no provider requests. Time it didn't measure shows as not measured."

PLATE "Past incidents" (last 90 days, table)
Date · Title · Impact · Duration · Resolved by.

DIALOGS
- "Post an incident" (TC-07):
  - Title · Components affected (checkboxes) · Impact (Degraded or Down) · First update (status Investigating, and a message).
  - A preview of the public card.
  - A plain confirm.
- "Post update": a status (Investigating · Identified · Monitoring · Resolved) and a message. A plain confirm.

PROPS
- state:
  - ready; loading
  - no open incident: "No open incidents. The status page shows the probe's measurement."
  - incident open
  - probe missed runs: "3 runs missed since 13:40 IST · the components show Unmeasured."
- components: two (Phase 3), with alerts (adds "Alerts" once Phase 5 ships).
- dialog: none, post incident, post update.

AT 390 WIDE
"Post an incident" and "Post update" work fully; they're urgent actions.

CHECKS
- Impact is shown in words and shapes, never colour.
- The rule for the public state is written on the plate.
```

## Console Alerts

File `Console Alerts.dc.html` · Phase 3 · module 05 · Owner, Admin · Form TC-08

```text
Sheet: Console Alerts (module 05). Save as "Console Alerts.dc.html". Owner and Admin. Form TC-08. These alerts are emails to the team.

PAGE HEADER
- Kicker "05 · Alerts". Title "Alerts".
- Lead "Emails the team gets when something needs a person."
- Secondary "Send a test alert".

PLATE "Rules" (table)
Columns: Rule · When · Recipients · Last sent · On or Off.
- "Security", always on: "Team or key changes, exports, and repeated failed key taps." It emails every Owner and has no Off control; the legend reads "Always on".
- Source down: "A source stops being asked after repeated failures."
- Key refused: "A provider refuses a key."
- Quota at 80% and at 95%: per source.
- Live-check budget reached: "Today's budget is used up."
- Status probe failing: "2 runs in a row find a component down, or 3 runs are missed."
- Privacy request due: "7 days before a reply is due, and when overdue."
- Email allowance: "80% of today's 100 emails, or of this month's 3,000, is used."
- Daily digest: "09:00 IST: yesterday's checks, queues and incidents."

PLATE "Recipients"
Team members, each with a checkbox per rule. Owner and Admin are ticked by default.

PLATE "Sent" (the last 20)
Time · Rule · To · Subject.

Legend: "At most one email per rule every 30 minutes, except Security, which is never held back. Alerts never contain a PNR or a traveller's email."

DIALOG "Edit rule" (TC-08)
The threshold where there is one, the recipients, and On or Off. A plain confirm.

PROPS
- state:
  - ready; loading
  - all optional rules off: "Only Security alerts are on. Nobody will be told when a source fails."
  - test sent (a toast)
  - sending failed: "The test didn't send: the email service refused it."
  - no access
- dialog: none, edit rule.

AT 390 WIDE
Read-only.
```

## Status (public)

File `Status.dc.html` · Phase 3 · trakline.in/status and every footer · travellers · house rules only

```text
Sheet: Service status. Save as "Status.dc.html". The public page trakline.in/status, plus the status line in both footers. Follow the house rules only; the status wording list in the house rules is the copy.

THE PAGE: public masthead, one-line footer
- Page header: title "Service status"; lead "Measured from our own servers every 5 minutes."; meta "Updated 14:30 IST".
- Plate "Now": a large lamp and the overall line, from the house rules' status wording.
- Plate "Components": one row each for PNR checks, and Accounts and watchlist sync.
  - The state word now.
  - 90 days of bars, the oldest on the left, one thin bar per day, in the forms from the house rules.
  - Focusing or hovering on a bar shows "18 Sep 2026 · Degraded for 40 min · 1 incident", or "… · Paused for 25 min".
  - Uptime from measured time only: "99.95% over the last 90 days". Before 90 days of history: "over the 23 days measured".
  - Under the bars: "90 days ago" and "Today", and a key to the bar forms, in words.
- Plate "Current incident", only while one is open: title, impact, and the updates newest first, with IST times.
- Section "01 · Past incidents": grouped by date for the last 90 days, each with title, impact, duration and final update. Empty: "No incidents in the last 90 days."
- Plate "What this measures":
  - PNR checks: "You can check a PNR and get the record the reservation service returns."
  - Accounts and watchlist sync: "You can sign in, and your saved PNRs follow you."
  - "Time we didn't measure shows as not measured, never as up."

THE FOOTERS (built on the B1 drawings and Landing Redesign B)
- The landing footer's status line and the one-line footer's new status line (disclaimer · status line · © · clock) both link here.
- They use the same wording as "Now".

PROPS
- state: all operational; some problems (degraded, with an open incident); checks paused; some down; all down; first days (most bars not measured); loading; error ("Status didn't load. Try again.").
- components: two, or with alerts ("Alerts: status alerts reach you." added once Phase 5 ships).
- footer: landing, one-line.

AT 390 WIDE
The bars shrink to the last 30 days, with "Show 90 days".

CHECKS
- It never names a provider.
- Unmeasured time is never drawn as up.
- The page, both footers, landing 04 and accuracy 01 use exactly the house rules' status wording.
```
