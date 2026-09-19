# B0: Calibration (draw first, then stop)

These two sheets set the console's frame, its dense table and the "Confirm it's you" dialog, which every later console sheet reuses. Paste the house rules, then the console rules. When both sheets are drawn, send them to Claude Code and wait for your approval before drawing B1.

## Console Shell

File `Console Shell.dc.html` · Phase 2 · admin.trakline.in · all roles · Form TC-01

```text
Sheet: Console Shell. Save as "Console Shell.dc.html".
This sheet sets the console frame that every later console sheet reuses. Follow the house rules and the console rules exactly.

CANVAS
1. The full frame: the environment strip, console masthead, notice strip, left rail, page header and a content area.
2. A stand-in page in the content area, to judge the frame against:
   - Kicker "01 · Overview", title "Overview", lead "What travellers are getting right now, and what needs you.", meta "Updated 14:32 IST · Sample data".
   - Three plates in a two-column grid:
     - "Service now": PNR checks · Answering; RailKit (primary) · Answering; RapidAPI (fallback) · Standby
     - "Checks today": Checks 212 · From cache 51 · Live 157 · Unavailable 4
     - "Queues": Privacy requests 3 · Wrong-status reports 5
3. The member menu, open: "Asha Rao", asha@example.com, an Owner tag, My keys, Sign out.
4. The Confirm it's you dialog (Form TC-01) over the page, for "Pause PNR checks on production":
   - the before → after line "PNR checks: On → Paused"
   - the "Message to travellers" field, filled in: "Checks are paused for maintenance. Back by 15:00 IST."
   - the Reason field
   - "Tap your key"
5. The toast after the confirm: "PNR checks paused · logged".

PROPS (enums in the props panel, not on the canvas)
- role:
  - Owner: all 14 rail items
  - Admin: no 12 Provider keys, no 13 Team
  - Support: 01, 06, 09 and 10
  - Viewer: 01, 02 and 03; the notice strip reads "by an Owner"
- environment: Production, Preview
- notice: none, checks paused, site notice ("Planned maintenance on 21 Sep, 02:00–03:00 IST. Checks may be slow.")
- dialog: closed, idle, reason missing, waiting for key, failed, not your key, done
- menu: closed, open
- page: ready; loading; no access (Support opening 14 Audit log); error ("This page didn't load. Reference 7f3a2c." with Retry); session ended

AT 390 WIDE
The rail slides in from a hamburger box at the masthead's left, the clock hides, the notice strip wraps to two lines, and the dialog becomes a full-width bottom sheet.

CHECKS
- Production and Preview strips differ by shape and word, never colour.
- The rail reads as a sheet index: aligned two-digit numbers, group legends, the current item marked by a tint and a left rule, and queue counts as figures in boxes.
- The dialog can't be confirmed without a reason, or, when pausing, without the message. It shows the light-steel lamp while waiting.
- No switcher on the canvas.
- No red, amber or green, and no rounded corners.
- Shadows only on the dialog, menu and toast.
```

## Console Audit Log

File `Console Audit Log.dc.html` · Phase 2 · module 14 · Owner, Admin

```text
Sheet: Console Audit Log (module 14). Save as "Console Audit Log.dc.html".
Use the frame exactly as drawn in Console Shell. Roles: Owner and Admin.

PURPOSE
Every console action, sign-in, lookup and key change is recorded here.

PAGE HEADER
- Kicker "14 · Audit log". Title "Audit log".
- Lead "Every action taken in the console: who took it, when and why."
- Meta "Updated 14:32 IST · Sample data".
- Action "Export CSV" (secondary). It opens Confirm it's you for "Export 3,187 audit entries".

FILTER BAR
- Search "Search reasons and targets".
- Member.
- Category: Access · Data · Settings · Providers · Messages · Security · System.
- Result: Done · Refused · Failed.
- A date range.

TABLE (dense), about 14 rows mixing categories
- Time: "19 Sep 2026, 14:02 IST".
- Member: name and role tag, or "System" for scheduled jobs.
- Action: "Paused PNR checks", "Revealed an email", "Looked up an email", "Changed a role", "Added a provider key", "Signed in", "Key tap failed", "Purged unconfirmed sign-ups".
- Target: "PNR checks", "r•••@example.com", "Kiran Das", "RailKit key •••• 4F2A", "12 records".
- Reason: quoted, truncated to one line.
- Result: Done, Refused or Failed, as outline tags.
- Address: a hash (a3f9…c2c1).
Include one System row, one Refused row and one failed key tap.

RECORD DRAWER (a row opened)
Header "Audit entry · #58213". Rows:
- Time.
- Member: name, role, and the key used ("YubiKey 5C").
- Action; target.
- Reason, in full.
- Result; address hash.
- Session: "Chrome on macOS".
- Before → after: "PNR checks: On → Paused"; for a reveal, "Masked → Revealed".
Foot legend: "Entries can't be edited. They're deleted automatically after 2 years."

PROPS
- state: ready; loading; empty ("No actions in this range." with Clear filters); error; export preparing (the sweep bar); export ready ("audit-2026-09-19.csv" with Download and "Works once, in this browser, for 10 minutes."); no access (Support)
- drawer: closed, open

AT 390 WIDE
Rows fold into records with Time and Action on top. The drawer is a full-screen sheet. Export is replaced by "Open on a larger screen to export".

CHECKS
- Times use tabular figures; hashes use the condensed data face.
- No PNR, passenger name or raw IP anywhere; target emails are masked.
- At 1440 the Time column never wraps.
```
