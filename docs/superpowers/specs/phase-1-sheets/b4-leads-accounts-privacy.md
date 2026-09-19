# B4: Leads, accounts and privacy (draw before Phase 4)

Paste the house rules and the console rules for the five console sheets. The five traveller sheets that follow use the house rules only and build on the B1 drawings; a fresh chat for them is fine.

## Console Leads

File `Console Leads.dc.html` · Phase 4 · module 06 · Owner, Admin, Support · Form TC-09

```text
Sheet: Console Leads (module 06). Save as "Console Leads.dc.html". Owner, Admin and Support (Support can't export). Form TC-09.

PAGE HEADER
- Kicker "06 · Leads". Title "Leads".
- Lead "Everyone who gave us an email: sign-ups and accounts. Console members are left out."
- Actions: "Export CSV" (Owner and Admin, through Confirm it's you) and "Add a business lead".
- Tabs: "Lifecycle" and "Business pipeline".

LIFECYCLE TAB
- A summary strip of figures (not a funnel graphic): Pending confirmation 37 · Subscribed 406 · Unsubscribed 58 · Suppressed 6 · With an account 1,204 · Availability list 72.
- Filter bar:
  - search "Find by full email" (exact matches; results stay masked; each lookup is logged)
  - News (Pending confirmation · Subscribed · Unsubscribed · Suppressed · Not subscribed)
  - Account (No account · Has account · Disabled)
  - Source (Footer · Landing · Pre-booking · Account · Added by hand)
  - Tag, Campaign and a date range
- Table columns:
  - Email: masked, with Reveal
  - News: the subscription tag
  - Lists: "Availability launch" when on it
  - Account: No account · "Has account · last sign-in 18 Sep" · Disabled
  - Source
  - Campaign: "google / cpc / diwali-2026"
  - Tags · First seen · Last activity
- Bulk actions: Add tag · Remove tag · Mark as business enquiry.

LEAD DRAWER
- The masked email, with Reveal.
- Consent records, one per list, e.g.: "News: consented 12 Sep 2026, 14:02 IST via the footer form · notice v2 · confirmed 12 Sep, 14:05 IST".
- Account: created, last sign-in, sign-in methods, and "3 saved PNRs" as a count only.
- Campaign: source, medium, campaign and first page.
- Timeline, each entry with its time: Signed up via footer · Confirmed · Created an account · Received "September update" · Unsubscribed.
- Tags.
- Notes: author and time, then "Add a note". The field legend: "Don't include PNRs, emails or IP addresses; they're removed."
- A "Business enquiry" switch. Turning it on shows the pipeline stage and owner.
- "Delete lead", only for leads without an account, through Confirm it's you.

BUSINESS PIPELINE TAB
- A board with columns New · Contacted · Qualified · Won · Lost (Won and Lost narrower).
- Cards: the masked email, a one-line note ("Travel desk, about 40 bookings a month"), the owner's initials, and days in stage.
- Cards move by dragging, or with a Stage select on each card (for keyboard and phone).
- An empty column shows a dashed outline box, "No leads here".

DIALOG "Add a business lead" (TC-09)
- Fields: Email · Name (optional) · Organisation (optional) · Note · Owner.
- Legend: "Added by hand for a business conversation. Never added to any email list unless they sign up themselves."

PROPS
- tab: lifecycle, pipeline.
- state: ready; loading; error; no leads ("No leads yet. Sign-ups from the footer, the landing page and pre-booking land here."); empty pipeline; export (Confirm it's you → preparing → ready, "Works once, in this browser, for 10 minutes.").
- drawer: closed, open.
- dialog: none, add a business lead.

AT 390 WIDE
Read-only lists. The board becomes stacked columns, with a Stage select on each card.

CHECKS
- News subscription and Account are separate columns. An account never makes anyone subscribed.
- Every email is masked until revealed.
```

## Console Announcements

File `Console Announcements.dc.html` · Phase 4 · module 07 · Owner, Admin · Form TC-10

```text
Sheet: Console Announcements (module 07). Save as "Console Announcements.dc.html". Owner and Admin. Form TC-10.

PAGE HEADER
- Kicker "07 · Announcements". Title "Announcements".
- Lead "Emails to people who confirmed they want them."
- Primary "New announcement".

PLATE "Sending allowance"
- Meters: "Today: 37 of 100 emails · resets 00:00 IST" and "This month: 1,212 of 3,000 · resets 1 Oct".
- Legends:
  - "40 a day are kept for sign-in and console links. Privacy emails go before announcements."
  - "An announcement bigger than what's left today is sent over several days."

PLATE "Announcements" (table)
- Columns: Subject · Audience ("News · 406", or "Availability launch · 72") · Status (Draft · Scheduled 25 Sep 2026, 09:00 IST · Sending over 7 days, 120 of 406 sent · Sent 19 Sep) · Delivered · Bounced · Unsubscribed · Sent by.
- A sending row shows the next batch: "Next 60 at 00:05 IST".
- Legend: "We don't track opens or clicks."

COMPOSER (a full page inside the frame, TC-10)
- Subject (up to 70 characters) and a preview line (up to 90).
- Body: paragraphs, links and one button, with a small toolbar.
- Audience:
  - News subscribers, optionally narrowed by a tag. A live count: "406 people · unsubscribed and suppressed people are left out · sends over about 7 days at up to 60 a day".
  - Or the Availability launch list: "72 people · one email only · the list closes after it's sent".
- A preview of the email as it will look, on desktop and on a phone.
- "Send a test to me".
- "Schedule" (a date and an IST time) or "Send now". Both go through Confirm it's you, e.g. "Send to 406 people".
- Under Audience: "Only people who confirmed. Every email has a one-click unsubscribe. Sent from updates@trakline.in."

PROPS
- view: list, composer.
- state: ready; nothing sent ("Nothing sent yet."); draft; scheduled (with Cancel); sending over several days (with Pause); today's allowance used ("Paused until 00:00 IST: today's allowance is used."); sent; error; no access.

AT 390 WIDE
Read-only.

CHECKS
- The audience count leaves out unsubscribed and suppressed people, and says so.
- No open or click figures anywhere.
```

## Console Accounts

File `Console Accounts.dc.html` · Phase 4 · module 08 · Owner, Admin

```text
Sheet: Console Accounts (module 08). Save as "Console Accounts.dc.html". Owner and Admin.

PAGE HEADER
- Kicker "08 · Accounts". Title "Accounts".
- Lead "Traveller accounts. Emails are masked, and saved PNRs are never shown."

FILTER BAR
Search "Find by full email" (logged) · Status (Active · Disabled · Deletion pending) · Sign-in method (Email link · Passkey) · Created (a date range).

TABLE
Email (masked, with Reveal) · Created · Last sign-in · Sign-in methods ("Email link · 2 passkeys") · Saved PNRs (a count) · News (a tag that opens the lead) · Status.

DRAWER
- The same facts, plus Sessions (a count, and last seen).
- Actions, each through Confirm it's you: "Sign out everywhere" · "Disable" or "Enable" · "Start deletion", which opens an erasure request in 09.
- Legend: "Saved PNRs stay private: the console shows only how many."

PROPS
- state: ready; loading; error; no accounts; no access.
- drawer: closed, open, disabled account ("Can't sign in since 18 Sep 2026"), deletion pending (linked to its request).

AT 390 WIDE
Read-only.

CHECKS
- No PNR, passenger name or watchlist entry appears.
- Console members aren't listed.
```

## Console Privacy

File `Console Privacy.dc.html` · Phase 4 · module 09 · Owner, Admin, Support · Forms TC-11, TC-12

```text
Sheet: Console Privacy requests (module 09). Save as "Console Privacy.dc.html". Owner, Admin and Support. Forms TC-11 (reply) and TC-12 (erase).

PAGE HEADER
- Kicker "09 · Privacy requests". Title "Privacy requests".
- Lead "Requests from people about their data, with the date each reply is due."

FILTER BAR
Type · Status · Due (Overdue · This week) · Assignee.

TABLE
- Reference: "PR-2026-0142"
- Type: Access · Correction · Erasure · Withdraw consent · Grievance · Nomination
- Requester: masked, with "Verified" or "Not verified yet"
- Received
- Due: "24 Sep 2026 · in 5 days", or "Overdue by 2 days"
- Status: New · Verifying · In progress · Done · Refused
- Assignee

DRAWER
- The request text (PNR-like numbers, emails and IPs already removed).
- The requester, masked, with Reveal.
- Verification: "Email link confirmed 14:02 IST", or "Signed-in account".
- Linked records: "Account: yes · 3 saved PNRs · News: Subscribed".
- A timeline.
- Actions. Until the request is verified, only Reply works; the rest are disabled, with "Waiting for the requester to confirm by email."
  - Access: "Prepare export" builds the file in the background. The console never opens it: it holds the person's saved PNRs.
    - Then "Send to requester", through Confirm it's you.
    - The requester gets a link that works once, expires in 24 hours, and opens only in the browser they use from that email.
  - Correction:
    - "Send a change-of-email link" (Owner and Admin, through Confirm it's you). It goes to the new address given in the request and tells the old address.
    - Nothing changes until the new address confirms.
    - Members never type a new sign-in address.
  - Erasure: "Erase" (TC-12). It lists:
    - What's deleted here: account, sessions, saved PNRs, alert settings, lead record, notes.
    - Copies held by our services: the email-delivery contact, sign-in log entries, push subscriptions.
    - What's kept: "A one-way code of the address, so we never email it again, and the consent record, for 1 year. The audit log keeps a masked reference."
    - Then Confirm it's you.
  - Withdraw consent: "Unsubscribe from all lists". A plain confirm.
  - Nomination: records the nominee's name and email.
  - Grievance: reply only.
  - Every type:
    - "Reply" (TC-11): a message sent from privacy@trakline.in without showing the member the address.
    - "Refuse": a reason is sent to the requester.

PLATE "Retention" (Owner edits; others read), each rule with its next run
- "Unconfirmed sign-ups: deleted after 7 days · next run 02:00 IST"
- "Unsubscribed leads: deleted after 30 days; a one-way code and the consent record stay 1 year"
- "Wrong-status reports: deleted after 180 days"
- "Audit log: kept 2 years, with emails masked"
Edits go through Confirm it's you.

PROPS
- state: ready; loading; error; nothing open ("No open requests."); no access.
- drawer: closed, not verified, access ready, correction, erasure, erased ("Erased 14:02 IST · logged").

AT 390 WIDE
Read-only.

CHECKS
- Replies go out without showing the member the requester's address.
- Nothing but Reply works before verification.
- The console never shows the access file's contents.
```

## Console Reports

File `Console Reports.dc.html` · Phase 4 · module 10 · Owner, Admin, Support · Form TC-13

```text
Sheet: Console Wrong-status reports (module 10). Save as "Console Reports.dc.html". Owner, Admin and Support. Form TC-13.

PAGE HEADER
- Kicker "10 · Wrong-status reports". Title "Wrong-status reports".
- Lead "Travellers telling us a result looked wrong. We keep what was shown and what they saw, never the PNR."

PLATE "This week"
Reports 14 · by source: RailKit 12 · RapidAPI 2 · of those, answered from cache 3 · by field: Status 11 · Coach and berth 2 · Chart 1.

TABLE
- Received.
- Field: Status · Coach and berth · Chart.
- Passenger: "Passenger 2", or "All".
- Trakline showed: "WL 12".
- Traveller saw: "CNF".
- Seen on: IRCTC app or site · SMS · Station chart · Other.
- Answered by: "RailKit · 14:05 IST", with a "from cache" tag when it came from the cache.
- Status: New · Reviewed.
- Outcome: Source behind · Source wrong · Our display · Unclear.

DRAWER AND REVIEW (TC-13)
The report's facts, the traveller's note (PNR-like numbers removed), an Outcome select, a Note, and "Mark reviewed" (no reason, no key).

PROPS
- state: ready; loading; error; none ("No reports yet. They arrive from the result page."); no access.
- drawer: closed, open.

AT 390 WIDE
Read-only.

CHECKS
- No PNR, train, date or passenger detail that could identify a booking.
```

## Sign-up Capture (traveller)

File `Sign-up Capture.dc.html` · Phase 4 · the footers, the landing close, pre-booking · Form TL-03

```text
Sheet: Sign-up capture. Save as "Sign-up Capture.dc.html". Form TL-03. Follow the house rules only.
Build on the B1 drawings and Landing Redesign B, changing only what's named.

THREE PLACES
1. The footer, on every page that has one (not /offline, not the error pages):
   - In the landing's full footer: a column "Updates by email", with the field and "Subscribe".
   - In the one-line footer: a compact row above the line.
   - The list is News: "New features and service changes, about once a month."
2. The landing's closing section, under the closing check plate:
   - A plate "News about Trakline", with the News sentence, the field and the button.
   - The check plate's meta cell "No sign-up" becomes "No account needed".
3. Pre-booking, under the result plate after a submit:
   - "Tell me once when availability checks open. One email, nothing else."
   - The field and the button "Notify me". This is the Availability launch list, not News.

IN EVERY PLACE
- Label "Email".
- The consent line: "One email to confirm. Unsubscribe in one click. We never sell your address. Privacy notice" (the last words link to it).

PROPS
- place: landing footer, one-line footer, landing close, pre-booking.
- state:
  - idle
  - invalid: "Enter an email address like name@example.com."
  - sending
  - sent: "Check your inbox to confirm." The same reply whether or not the address was already on the list.
  - too many: "Too many sign-ups from this connection. Try again later."
  - daily limit: "We can't send more confirmation emails today. Try again after 00:00 IST."
  - error: "That didn't go through. Try again."

CHECKS
- On phones, the field never pushes the footer's disclaimer, status line or clock out of view.
- The reply never reveals whether an address is known.
- The pre-booking promise is one email, and says so.
```

## Subscription (traveller)

File `Subscription.dc.html` · Phase 4 · /subscribe/confirm, /unsubscribe

```text
Sheet: Subscription pages. Save as "Subscription.dc.html". Follow the house rules only. Two small pages, each with the one-line footer. Opening a link from an email never changes anything on its own: each page has one button that does it.

/subscribe/confirm
- Before: title "Confirm your subscription", the list's promise (News: "About once a month: new features and service changes."; Availability launch: "One email when availability checks open."), and the button "Confirm".
- After: "You're subscribed. Every email has a one-click unsubscribe.", then "Check a PNR".

/unsubscribe (the email footer's link)
- Before: title "Unsubscribe from Trakline news?", and the button "Unsubscribe".
- After: "You're unsubscribed. Sign-in emails and the alerts you set up aren't affected."
- "Subscribed by mistake? Resubscribe" (one button).
- An optional "Tell us why" (Too many emails · Not relevant · I didn't sign up · Other), with "Send". It's never required.

PROPS
- page: confirm, unsubscribe.
- list: news, availability launch.
- state: before; after; already done ("You're already subscribed." or "You're already unsubscribed."); expired (confirm only: "This link has expired.", with an email field and "Send a new link"); invalid link; error.

CHECKS
- Nothing changes until the button is pressed.
- Unsubscribing needs no sign-in, and the reason is optional.
```

## Report Wrong Status (traveller)

File `Report Wrong Status.dc.html` · Phase 4 · /pnr · Form TL-04

```text
Sheet: Report a wrong status. Save as "Report Wrong Status.dc.html". Form TL-04. Follow the house rules only. Build on "PNR Result.dc.html".

ENTRY
A ghost button "Report a wrong status" at the foot of the "How this result was assembled" plate, on a ready result.

THE FORM: a dialog on desktop, a bottom sheet on phones. Header "Report a wrong status · Form TL-04".
1. "What looks wrong?": Status · Coach and berth · Chart.
2. "Which passenger?": Passenger 1, 2, 3, or All. Skipped for Chart.
3. "What do you see elsewhere?":
   - For Status: CNF · RAC · WL · Cancelled · Other (a short text field).
   - For Coach and berth: a short text field.
   - For Chart: Prepared · Not prepared.
4. "Where did you see it?": IRCTC app or site · SMS · Station chart · Other.
5. "Anything else? (optional)": up to 200 characters. Legend "Don't include your PNR, email or phone number; we remove them."
Notice: "We keep what Trakline showed, what you saw and when. Not your PNR."
Primary "Send report".

PROPS
state: form; answer missing; sending; sent ("Thanks. We'll check the source.", with Close); too many ("You've sent several reports. Try again later."); error.

CHECKS
- Nothing in the form shows or asks for the PNR.
- On desktop, the result stays visible underneath.
```

## Privacy Request (traveller)

File `Privacy Request.dc.html` · Phase 4 · /privacy/request, /privacy/export, and the entry links · Form TL-05

```text
Sheet: Privacy request. Save as "Privacy Request.dc.html". Form TL-05. Follow the house rules only. Build on "Legal.dc.html" and "Account.dc.html" for the entry links.

ENTRY LINKS
- /privacy: a closing plate, "Make a privacy request →".
- /account: in "Your data", a "Make a privacy request →" link.

/privacy/request
- Page header: back link "← Privacy notice", title "Make a privacy request", lead "Ask for a copy of your data, a correction or deletion, or raise a concern. We reply by email."
- For signed-in people, a plate first: "Signed in? You can export your data or delete your account right away from Account."
- Plate "Form TL-05":
  1. "What do you need?", as radio options, each with a one-line explanation:
     - Get a copy of my data
     - Correct my data
     - Delete my data
     - Withdraw my consent (leave every email list, and stop anything that relies on consent)
     - Raise a grievance
     - Nominate someone (to act for you if you can't): this shows the nominee's name and email fields
  2. Email: prefilled and locked when signed in.
  3. Details: optional, up to 1,000 characters. Legend "Don't include your PNR; we remove it."
  Primary "Send request".

CONFIRMING (from the email link: a page with one button; opening the link changes nothing)
- "Confirm your privacy request", with the request type, and the button "Confirm request".
- After: "Request confirmed · Reference PR-2026-0142 · We'll reply by 19 Oct 2026."

/privacy/export (from the "Your data is ready" email: one button)
- "Your data is ready": what's in it, including the list of services we share data with.
- "Download your data" works once, in this browser, until 20 Oct 2026, 14:02 IST.
- After: "Downloaded. The link no longer works; make a new request if you need it again."

PROPS
- page: request, confirm, export.
- state:
  - request: form, sending, sent signed out ("Check your inbox to confirm the request. The link expires in 24 hours."), sent signed in ("Request received · Reference PR-2026-0142 · We'll reply by 19 Oct 2026."), invalid email, too many, error
  - confirm: before, after, expired
  - export: ready, downloaded, expired ("This link has expired. Make a new request."), opened in another browser ("Open this link in the browser where you opened the email.")

CHECKS
- Before confirmation, the wording is the same for known and unknown addresses.
- Nothing changes when a page is merely opened.
```

## Privacy Notice (traveller)

File `Privacy Notice.dc.html` · Phase 4 · /privacy · the versioned notice

```text
Sheet: Privacy notice. Save as "Privacy Notice.dc.html". Build on "Legal.dc.html" (the /privacy page); same grammar, new content. Follow the house rules only.

PAGE HEADER
Title "Privacy notice", lead "What Trakline collects, why, who handles it, how long we keep it, and your rights.", and the meta "Version 2 · in effect from 1 Oct 2026 · Earlier versions".

SECTIONS (number-only kickers, as in Legal)
01. What we collect and why. One row per purpose:
    - PNR checks (the PNR, used only to fetch the record; never kept in our logs)
    - Accounts and saved PNRs
    - News emails (with consent)
    - The availability launch email (with consent)
    - Wrong-status reports
    - Privacy requests
02. Who handles it for us, by kind: a railway data service, hosting, email delivery, error tracking, a shared cache. The names are in the file you get when you ask for a copy of your data.
03. How long we keep it. The retention rules, in plain words.
04. Your rights: a copy, correction, deletion, withdrawing consent, a grievance, and naming someone to act for you. How to use them: "Make a privacy request →".
05. Who to contact: "Grievance officer: Asha Rao · privacy@trakline.in". We reply within the period the law sets.
06. If you're not satisfied: you can complain to the Data Protection Board of India, after using our grievance process.
07. Changes to this notice: a list of versions and dates.

PROPS
state: current version; the "Earlier versions" list open.

CHECKS
- Every sentence is plain and specific.
- It names no provider.
- The version and its date are visible at the top.
```
