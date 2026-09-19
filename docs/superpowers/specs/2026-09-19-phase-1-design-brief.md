# Phase 1: the Claude Design brief

Date: 2026-09-19 · Status: **approved by the owner on 2026-09-19** (revision 3, after the gap check) · Owner: Vibin Mathew

Phase 1 is step two of the roadmap: foundations → **design brief** → admin core → provider operations → leads, users and privacy → traveller features → design pass → launch checks.

Every new screen is drawn in the Claude Design project "App landing page redesign" first, then transcribed exactly (DESIGN.md's fidelity rule). This brief says what to draw:

- the house rules and console rules, pasted once per chat
- one ready-to-paste prompt per sheet, in `phase-1-sheets/`

## 1. How to draw from it

1. In Claude Design, open **App landing page redesign**. It holds the Industry design system and the five B sheets.
2. Start one chat per batch. The first message is the **house rules** (§4). For console batches, the second message is the **console rules** (§5).
3. Paste one sheet prompt at a time, and attach what it asks for (B1 needs screenshots). Each prompt ends with **Checks**; read the drawing against them, and ask for fixes in the same chat.
4. Save each sheet under the exact file name given. Claude Design lists the states and roles as props, so you can switch between them in the props panel.
5. At the end of each batch, send the files to Claude Code. They're checked against this brief, stored in the repo under `docs/design/sheets/`, and any mismatch comes back to you as a fix prompt.
6. Draw **B0 and stop** until the console shell is approved. Then draw B1, then the rest, each batch before its phase.

| Batch | File | Sheets | Draw before | Why here |
|---|---|---|---|---|
| B0 Calibration | `b0-calibration.md` | 2 | Phase 2 | Sets the console frame everything else reuses |
| B1 Traveller pages as built | `b1-traveller-as-built.md` | 6 | Phase 2 | Later sheets draw onto these pages, so they come first |
| B2 Admin core | `b2-admin-core.md` | 7 | Phase 2 | |
| B3 Provider operations | `b3-provider-operations.md` | 6 | Phase 3 | |
| B4 Leads, accounts and privacy | `b4-leads-accounts-privacy.md` | 10 | Phase 4 | |
| B5 Traveller features | `b5-traveller-features.md` | 5 | Phase 5 | |
| B6 Emails | `b6-emails.md` | 1 | Phase 5, last | |

**Building on a page.** Every traveller sheet after B1 is built on its B1 drawing and changes only what its prompt names. A traveller page is transcribed from its B1 drawing at the start of the first phase that changes it:

| Page | Transcribed from B1 in |
|---|---|
| /pnr, /login | Phase 2 |
| The footer, pre-booking and /privacy | Phase 4 |
| /account, /watchlist, the error pages and /offline | Phase 5 |

**Emails before B6.** Until B6 is drawn, emails sent in Phases 2–4 use the plain layout of today's sign-in email.

**Fixing a drawing.** Ask in the same chat, for example: "In Console Leads the Subscription column uses colour. Use tag forms (filled, outline, grey) as the house rules say."

## 2. Decisions this brief follows

**2026-09-18, the roadmap interview:**
- **The console:** `admin.<domain>`, on the same app and deploy, with its own session and a dedicated admin email. A security key is the required second factor. Four roles.
- **Console modules:** leads, provider keys, users and accounts, source health and usage, switches and settings, abuse and limits, overview, alerts by email, `/status` with incidents, privacy requests with retention purges, wrong-status reports, and the audit log.
- **Capture fields:** on the pre-booking result, in the landing's closing section, and in the footer.
- **Traveller features:** alerts, Hindi, calendar export with a chart-time reminder, and running status (only if its data checks out).
- **RailKit follow-ups** (`railkit-source` notes): seat availability and fare on pre-booking, and the train route on results.

**2026-09-19, this brief's interview:**
- **Screens:** the console is desktop-first; on phones it offers reading plus three urgent actions.
- **Look:** the same world, denser. An environment strip.
- **Navigation:** a left rail index.
- **Privacy:** emails are masked, and every Reveal is logged. No PNRs, passenger details or raw IPs in the console.
- **Console sign-in:** an email link, then a key tap. Every member enrols two keys.
- **Risky actions:** a reason and a fresh key tap.
- **Leads:** an automatic lifecycle plus a manual business pipeline.
- **Status page:** incidents plus 90-day bars from a real probe.
- **Scope:** every traveller surface, and emails last.
- **Order:** shell first, then batches.
- **Format:** one prompt per sheet, in the repo plus a copy page.

**2026-09-19, after the gap check:**
- **Email plan:** Resend stays on the free plan.
- **Access requests:** the file names the services we share data with, and nothing else does.
- **Console tag contrast:** decided at the B0 review: console steel text uses the readable steel (see the console rules).

**Changes from those decisions, made by this brief (object if any is wrong):**
1. **Leads:** the lifecycle "Pending → Subscribed → Active account → Unsubscribed" becomes two separate facts, subscription and account. Having an account doesn't mean someone agreed to emails, and a ladder would email people who never opted in.
2. **Emails:** they get one Industry frame, and the two sign-in emails are restyled with it, instead of copying today's plain sign-in email.
3. **Landing capture:** it sits in the closing section, under the check plate. That plate's "No sign-up" meta becomes "No account needed", because a sign-up field now sits below it.
4. **Footer:** the one-line footer on app pages gains the service-status line, which links to `/status`.
5. **DPDP exception:** a DPDP access request gets a file that names the services we share data with, because the Act requires it (s.11). This is the one exception to "travellers never see a provider name"; everything else still says "Trakline" (decided 2026-09-19).

## 3. Scope

**In:**
- 37 sheets: 18 for the console, 18 for travellers and 1 of emails (§9).
- A screenshot pack of the built pages, for B1.
- The five B sheets copied into the repo; today they exist only in Claude Design and a temporary folder.

**Out:**
- Implementation: each phase has its own spec and plan.
- Redrawing the landing, signed-out watchlist, pre-booking and accuracy pages beyond what's named.
- Localising the console.
- Global search and in-console notifications.

## 4. House rules (paste first in every batch chat)

```text
You are drawing new sheets for Trakline in this project. Trakline (formerly "Track & Trace") is an Indian Railways PNR-status web app at trakline.in, with an internal console at admin.trakline.in for its small team.

GRAMMAR: MATCH EXACTLY
- The five B sheets in this project (Landing Redesign B, Watchlist B, Pre-booking B, Accuracy B, Sign in B) and the Industry design system are the grammar. Reuse their tokens, type, spacing, plates, tables, fields, buttons, tags, lamps and states. Don't invent a new style.
- Plates are square, drawn in hairlines, with + registration marks at the corners. Headings, legends and figures are Barlow Condensed capitals; body copy is Barlow. There is one steel accent (#5980a6). The primary button is the only solid object in a view.
- Sections carry "NN · Title" kickers. Plates carry a title-block header: a title cell, then meta cells behind hairlines ("Form TL-03", "Sheet 01", "Sample data").
- No rounded corners and no gradients. Shadows only on dialogs, menus and toasts. No red, amber or green: meaning is carried by form (filled, half, outline, hollow, dashed) and by a word, never by colour alone.
- Motion, and only this: the press (a button settles to 96% while held), the theme button's turning icon, the invalid-entry shake, the clock's flip, the digit caret, the 2px sweep bar for running requests, the spinner, the skeleton sheen, popup fades, and the drawer sliding in from the left. Lamps don't move.

HOW A SHEET WORKS (as in the B sheets)
- One screen per file, saved under the exact name the prompt gives.
- The canvas shows only the product. Every alternative the prompt lists (states, roles, environment, dialogs) is an enum prop in the sheet's props panel, the way the B sheets expose defaultTheme. Nothing on the canvas is a switcher.
- Faces: support Day and Night through the defaultTheme prop and the working theme button, as the B sheets do.
- Widths: use real breakpoints and check by resizing to 1440 and 390. Nothing clipped or scrolling sideways from 320.
- Everything on the canvas is final copy, because it's transcribed word for word. Put notes to me in the chat, never on the sheet. (The one exception is the Hindi type study, which is a study, not a page.)

WHAT CHANGED SINCE THE B SHEETS: DRAW THE CURRENT APP
1. The name is TRAKLINE: the mark, then "TRAKLINE" in condensed capitals, 18px, letter-spacing .06em. Never "Track & Trace".
2. The public masthead is sticky, one row, with a hairline bottom. The nav is four separate 36px hairline boxes, each a 20px Fluent UI Filled icon beside a 13px capital label: CHECK A PNR (ticket), WATCHLIST (eye), PRE-BOOKING (calendar clock), ACCURACY (gauge). The current page's box is tinted steel. On the right: one square 36px theme button showing the active mode's icon (a click cycles System → Day → Night), then SIGN IN (capitals, person icon). When signed in, SIGN IN is replaced by an avatar box whose menu holds Account · Watchlist · Sign out.
3. Below 1024px the masthead stays one row: a square hamburger box left of the mark (the name shows from 1024px up), with theme and SIGN IN on the right. The nav slides in from the left edge, holding the same four boxes at 48px. Below 360px, SIGN IN shows only its icon.
4. Footers:
   - The landing page has the full footer: brand and disclaimer, then Sections, Product and Company link columns, then a bottom bar with ©, the service-status line with a lamp, and the live IST clock.
   - Other pages have a one-line footer: disclaimer · © · IST clock. B3's Status sheet adds the status line to it.
   - The disclaimer reads "Not affiliated with IRCTC or Indian Railways."
5. The landing's section 04 is "Reliability" (three promise plates and a PNR-checks status line), and the accuracy page's section 01 is "Service" (a two-row status list). They replaced the old sources board and ledger.
6. Results name one service: "Retrieved 14:05 IST from Trakline · every field as returned, none invented". Travellers never see a data provider's name.
7. Sign in offers "Email me a sign-in link" and "Continue with a passkey". There is no Google button.

SERVICE STATUS WORDING (the footer, /status, landing 04 and accuracy 01 always agree)
- All working: line "All systems operational"; landing 04 "PNR checks operational"; row word "Operational"; bar form solid.
- Some trouble, nothing down: line "Some services are having problems"; landing 04 "PNR checks having problems" (when checks are affected); row word "Degraded"; bar form half-filled.
- PNR checks paused on purpose: line "PNR checks are paused"; landing 04 "PNR checks paused"; row word "Paused"; bar form hollow with a deep-steel ring, and its hover text says "Paused".
- Some parts down: line "Some services are unavailable"; landing 04 "PNR checks unavailable" (when checks are down); row word "Unavailable"; bar form hollow with a deep-steel ring.
- Everything down: line "Services are unavailable"; row word "Unavailable".
- Not measured: bar form a dashed outline. It never counts as up.

SAMPLE DATA
- Every plate that shows figures or records wears a "Sample data" meta cell.
- Times are in IST with the suffix ("14:05 IST"). Dates look like "19 Sep 2026". Use Indian digit grouping (1,00,000).
- People: names like Asha Rao, Rohan Iyer, Kiran Das and Meera Nair, with example.com addresses, masked where the prompt says (r•••@example.com).
- On traveller sheets, PNRs look like 234 567 8909, and watchlist entries are labelled as the app labels them: "12627 · SBC→NDLS · Thu, 24 Sep".
- On console sheets, never draw a PNR, a passenger name or a raw IP address.
- Never draw an invented figure presented as real: no ratings, testimonials, odds, trends, predictions or projections.

ACCESSIBILITY
- AA text contrast on every surface. The one exception is the locked steel pairing (the primary button fill, outline tags and ghost-button text), kept as drawn. Console sheets keep only the primary button fill; their outline tags and ghost buttons use the readable steel (see the console rules).
- A 2px steel focus ring.
- On phones, 44px touch targets and 16px inputs.
- Real tables for tabular data, and a table alternative for every chart.

COPY
- Plain and short. Sentence case in body text and buttons; capitals only where the B sheets use condensed capitals. No exclamation marks and no emoji.

CODES
- Traveller forms continue from Form TL-03 (TL-01 is the PNR check, TL-02 the pre-booking request). Console forms use Form TC-01 and up. Each prompt gives its codes.
```

## 5. Console rules (paste second in console batches B0, B2, B3, B4)

```text
CONSOLE RULES: FOR EVERY CONSOLE SHEET (admin.trakline.in), ON TOP OF THE HOUSE RULES

WHO USES IT
- A small team with four roles: Owner, Admin, Support, Viewer.
- Desktop first. On phones, members can read what their role allows and use three urgent actions: pause PNR checks, post an incident, block an address. Every other editing control is replaced by "Open on a larger screen to edit".

LOOK
- The same Industry world, denser. Table text 13px (the first column 14px), legends 12px capitals, 36px rows, tabular figures for numbers and times.
- Steel text uses the readable steel (#416180 by day, #b5d9fd by night): outline tags, ghost buttons, links, kickers and field labels. The locked steel (#5980a6) stays for fills, rules, lamps and the focus ring.
- Health is a lamp plus a word, never colour. The lamp forms and their words:
  - lit (steel fill): Answering, Operational, Connected, Sending, Healthy
  - light steel: Probing
  - half-filled: Degraded
  - hollow: Standby, Paused, Not configured, Unmeasured
  - hollow with a deep-steel ring: Down, Refused, Over quota

FRAME (drawn once in Console Shell and reused everywhere)
1. An environment strip, 28px, full width, always visible:
   - "PRODUCTION · admin.trakline.in": a hairline strip with a filled tag.
   - "PREVIEW · staging data · <host>": a dashed rule with an outline tag.
   Shape and word differ, never colour.
2. The console masthead, 56px: the mark, TRAKLINE and an outline CONSOLE tag. On the right: the live IST clock, the 36px theme button, and the member box (initials, role tag), whose menu holds the name and email, the role, My keys and Sign out.
3. A notice strip under the masthead, shown only while something affects travellers:
   - "PNR checks are paused · since 14:02 IST · by Asha Rao", with Resume for Owner and Admin.
   - "Site notice is on: <text>".
   Viewer sees roles instead of names ("by an Owner").
4. A left rail, 240px, sticky, drawn as a sheet index.
   - Group legends: OPERATE, PEOPLE, QUEUES, CONFIGURE, RECORD.
   - Items are a two-digit condensed number and a label; queue items carry a count in a box.
   - The current item is tinted steel, with a 2px steel rule on its left.
   - Items a role can't use are hidden, not shown locked, and so are modules not built yet. Numbers never change, so gaps are normal.
   - At the rail's foot: "Build 42c5317 · 19 Sep 2026".
   OPERATE: 01 Overview · 02 Sources & usage · 03 Status & incidents · 04 Abuse & limits · 05 Alerts
   PEOPLE: 06 Leads · 07 Announcements · 08 Accounts
   QUEUES: 09 Privacy requests · 10 Wrong-status reports
   CONFIGURE: 11 Switches & settings · 12 Provider keys · 13 Team
   RECORD: 14 Audit log
5. A page header: the kicker "06 · Leads", a condensed capital title a step smaller than the public page title, a one-line lead, a meta legend ("Updated 14:32 IST · Sample data"), and actions on the right.

PATTERNS
- Tables:
  - Hairline rows, a sticky header, sortable columns marked by an arrow, and a row hover tint.
  - A row opens its record drawer, and has a visible Open control for keyboard users.
  - Pagination reads "1–50 of 1,204 · Previous · Next". No infinite scroll.
  - A checkbox column only where bulk actions exist.
  - Below 1024px, rows fold into labelled records.
- Filter bar: a search field where the prompt gives one, filter boxes, a date range (Today · 7 days · 30 days · Custom), active filters as removable tags, and "Clear filters". A "Find by full email" search matches exact addresses only; results stay masked, and each lookup is logged.
- Record drawer: opens from the right, 480px, on the dialog surface with corner marks. A header with title and code, key–value rows, and actions at the foot. On phones, a full-screen sheet.
- Masked email:
  - The first letter, •••, then @domain (r•••@example.com).
  - A Reveal ghost button, for Owner, Admin and Support only. Reveal opens Confirm it's you.
  - Once revealed, the full address shows with the legend "Revealed 14:40 IST · logged", until the drawer closes.
- Confirm it's you (Form TC-01), used by every risky action:
  - A dialog with the action summary ("Pause PNR checks on production") and a before → after line where something changes.
  - For pausing checks, a required "Message to travellers" field (up to 120 characters) comes first.
  - Then a required Reason field: "Why? This goes in the audit log. Don't include PNRs, emails or IP addresses; they're removed." (10–200 characters.)
  - A primary "Tap your key" button.
  - States:
    - idle
    - reason missing: "Add a reason of at least 10 characters."
    - waiting: "Touch your security key or approve on your device", with the light-steel lamp
    - failed: "That key didn't answer. Try again."
    - not your key: "This key isn't one of yours."
    - done: the dialog closes, and a toast names the action, e.g. "PNR checks paused · logged"
  - Every tap approves exactly one action.
- Plain confirm, used for actions that aren't risky: the action summary and a primary button. No reason, no key.
- Toasts always read "<What happened> · logged".
- Charts:
  - Hairline axes, steel bars, one baseline, no gridlines.
  - Days without data are dashed outline boxes, never zero-height bars.
  - Every chart has "Show as table".
- Meters: a hairline track, a steel fill, the figure and a legend ("3,412 of 10,000 · resets 1 Oct").
- Every console sheet can show these states:
  - Ready.
  - Loading: flat skeletons in the shape of the plates.
  - Empty: the first-run state, with a title, one sentence and the next action.
  - Error: an alert plate with the precise cause and Retry.
  - No access: "This module isn't part of the Support role.", with Back to Overview.
  - Store unavailable, per plate: "Counts unavailable: the shared store didn't answer. Last good value 14:20 IST."
  - Session ended: a full page, "Your session ended. Sign in again."
- Props on every console sheet: role (Owner, Admin, Support, Viewer) and environment (Production, Preview), plus the sheet's own states.
- The console never shows a PNR, a passenger name or a raw IP address. Addresses appear as short hashes (a3f9…c2c1). Provider names (RailKit, RapidAPI) may appear in the console, and only there.
```

## 6. Roles

**Modules by role.** Numbers are fixed; hidden modules leave gaps. The Team sheet draws this matrix with three forms: filled means full access, half means read-only or counts only, hollow means none.

| Module | Owner | Admin | Support | Viewer |
|---|---|---|---|---|
| 01 Overview | full | full | full, but no urgent or recent actions | counts only |
| 02 Sources & usage | full | full | – | read-only |
| 03 Status & incidents | full | full | – | read-only |
| 04 Abuse & limits | full | full | – | – |
| 05 Alerts | full | full | – | – |
| 06 Leads | full | full | full, but no export | – |
| 07 Announcements | full | full | – | – |
| 08 Accounts | full | full | – | – |
| 09 Privacy requests | full | full | full, but no email changes | – |
| 10 Wrong-status reports | full | full | full | – |
| 11 Switches & settings | full | full | – | – |
| 12 Provider keys | full | – | – | – |
| 13 Team | full | – | – | – |
| 14 Audit log | full | full | – | – |
| My keys (member menu) | full | full | full | full |

**Access changes take effect at once.**
- Changing a role, resetting keys or removing a member signs that person out everywhere immediately.
- Every request re-checks the role.
- The console trusts only keys enrolled in Setup or My keys. A passkey made on trakline.in never counts.
- Console addresses can't sign in on trakline.in: they get the same "check your inbox" reply, and no link is sent.

## 7. Actions and their safeguards

Everything below is written to 14 Audit log, as are sign-ins, lookups, failed taps and scheduled jobs (actor "System"). Free text (reasons, notes, report details) has PNR-like numbers (with or without spaces, dashes or dots), emails and IP addresses removed before it's stored.

| Action | Who | Safeguard |
|---|---|---|
| Reveal an email | Owner, Admin, Support | Reason + key |
| Look up by full email | Anyone with the module | Logged |
| Export CSV (leads, audit log) | Owner, Admin | Reason + key. The file is tied to that session and works once, for 10 minutes |
| Invite, change role, reset keys, remove a member | Owner | Reason + key |
| Resend or revoke an invite | Owner | Confirm |
| Add a key (after the first) | Everyone, for their own account | Tap an existing key |
| Remove one of my keys | Everyone, for their own account | Reason + key |
| Provider keys: add, rotate, reorder, disable, remove | Owner | Reason + key |
| Any switch, limit or budget, the site notice, Resume | Owner, Admin | Reason + key |
| Retention periods | Owner | Reason + key |
| Block or unblock an address | Owner, Admin | Reason + key |
| Send or schedule an announcement | Owner, Admin | Reason + key |
| Account: sign out everywhere, disable, start deletion | Owner, Admin | Reason + key |
| Privacy: send a change-of-email link | Owner, Admin | Reason + key, verified requests only |
| Privacy: send an export | Owner, Admin, Support | Reason + key, verified requests only |
| Privacy: erase data; delete a lead | Owner, Admin, Support | Reason + key |
| Post an incident or update, resolve | Owner, Admin | Confirm |
| Edit alert rules, send a test | Owner, Admin | Confirm (the Security rule can't be turned off) |
| Reply to or refuse a privacy request | Owner, Admin, Support | Confirm |
| Notes, tags, pipeline stage, assign, review a report, add a business lead | Owner, Admin, Support | None (logged) |

## 8. Data rules for the drawings

- **Drawing-only cells.** "Sample data" cells mark drawing data. The built console leaves them out; traveller pages keep them only in fixture mode, as today.
- **Draw the full page; build in steps.** Sheets are drawn complete, and each phase builds only the parts whose data and actions exist. For example, Phase 2's Overview has Service now, Pause PNR checks, Checks today and Quota; the other plates arrive with their modules.
- **Figures add up within a sheet and across sheets:**
  - checks today (212) = from cache (51) + live (157) + unavailable (4)
  - live (157) = RailKit (155) + RapidAPI (2)
  - RailKit requests today (158) = answered (155) + failed (3)
  - live-check budget: 157 of 300 today, the production default (300 × 31 = 9,300, under 10,000)
  - RailKit this month: 3,412 of 10,000 (an average of 180 a day)
  - accounts: 1,204
  - subscribed: 406
  - pending confirmation: 37
- **No forecasts.** No projection or trend, anywhere.

## 9. Sheet index (37)

| # | Sheet file | Batch | Phase | Where | Audience |
|---|---|---|---|---|---|
| 1 | Console Shell | B0 | 2 | admin | all roles |
| 2 | Console Audit Log | B0 | 2 | admin · 14 | Owner, Admin |
| 3 | PNR Result | B1 | 2 | /pnr | travellers |
| 4 | Sign In | B1 | 2 | /login | travellers |
| 5 | Legal | B1 | 4 | /privacy, /tos | travellers |
| 6 | Watchlist Signed In | B1 | 5 | /watchlist | travellers |
| 7 | Account | B1 | 5 | /account | travellers |
| 8 | Errors | B1 | 5 | 404, errors, /offline | travellers |
| 9 | Console Sign In | B2 | 2 | admin/login | team |
| 10 | Console Setup | B2 | 2 | admin/setup | new members |
| 11 | Console Overview | B2 | 2 | admin · 01 | all roles |
| 12 | Console Team | B2 | 2 | admin · 13 | Owner |
| 13 | Console My Keys | B2 | 2 | admin · member menu | all roles |
| 14 | Console Switches | B2 | 2 | admin · 11 | Owner, Admin |
| 15 | Notices | B2 | 2 | trakline.in | travellers |
| 16 | Console Sources | B3 | 3 | admin · 02 | Owner, Admin, Viewer |
| 17 | Console Provider Keys | B3 | 3 | admin · 12 | Owner |
| 18 | Console Abuse | B3 | 3 | admin · 04 | Owner, Admin |
| 19 | Console Status | B3 | 3 | admin · 03 | Owner, Admin, Viewer |
| 20 | Console Alerts | B3 | 3 | admin · 05 | Owner, Admin |
| 21 | Status | B3 | 3 | /status + footers | travellers |
| 22 | Console Leads | B4 | 4 | admin · 06 | Owner, Admin, Support |
| 23 | Console Announcements | B4 | 4 | admin · 07 | Owner, Admin |
| 24 | Console Accounts | B4 | 4 | admin · 08 | Owner, Admin |
| 25 | Console Privacy | B4 | 4 | admin · 09 | Owner, Admin, Support |
| 26 | Console Reports | B4 | 4 | admin · 10 | Owner, Admin, Support |
| 27 | Sign-up Capture | B4 | 4 | footer, landing close, pre-booking | travellers |
| 28 | Subscription | B4 | 4 | confirm and unsubscribe pages | travellers |
| 29 | Report Wrong Status | B4 | 4 | /pnr | travellers |
| 30 | Privacy Request | B4 | 4 | /privacy/request, /privacy/export | travellers |
| 31 | Privacy Notice | B4 | 4 | /privacy | travellers |
| 32 | PNR Result Features | B5 | 5 | /pnr | travellers |
| 33 | Watchlist Alerts | B5 | 5 | /watchlist | travellers |
| 34 | Account Alerts | B5 | 5 | /account | travellers |
| 35 | Pre-booking Availability | B5 | 5 | /pre-booking | travellers |
| 36 | Hindi | B5 | 5 | every page | travellers |
| 37 | Emails | B6 | 5 | inboxes | everyone |

**Form codes:**
- **Traveller:** TL-03 sign-up capture · TL-04 report a wrong status · TL-05 privacy request · TL-06 status alerts · TL-07 calendar · TL-08 availability request (redraws TL-02).
- **Console:** TC-01 Confirm it's you · TC-02 console sign-in · TC-03 member setup · TC-04 invite a member · TC-05 add a provider key · TC-06 block an address · TC-07 incident · TC-08 alert rule · TC-09 add a business lead · TC-10 announcement · TC-11 privacy reply · TC-12 erase data · TC-13 report review.

## 10. Assumptions (not asked; say if any is wrong)

1. **Traveller alerts** need an account and a saved PNR, on up to 10 PNRs per account. Re-checks follow a sparse schedule budgeted against provider quota; Phase 5 sets the numbers.
2. **Alerts, push and privacy messages** show the watchlist label and "PNR ending 8909", never a full PNR, and their links carry no PNR. A traveller's own email appears in full on their own pages.
3. **Status** is measured every 5 minutes by our own probe, plus how real checks went. There's no provider probe for now. Time that wasn't measured never counts as up.
4. **Team emails** appear in full on Team. Masking is for travellers and leads.
5. **Sample values.** Retention periods, reply-by dates and budgets in the drawings are samples. Their phases set the real ones.
6. **Hindi text in the drawings only tests fit;** a translator supplies the final strings. PNRs, times, coach and berth, and railway codes stay in Latin script.
7. **Phones in the console:** reading plus the three urgent actions. Setup and My keys work fully on phones.
8. **Key taps:** each risky action needs its own tap, which approves exactly that action. There's no trusted window.
9. **Support** can erase data and delete leads (reason and key) without a second approver, but can't change an account's email.
10. **The team is kept out of traveller lists.** Console members don't appear in Leads or Accounts, and invites refuse addresses that already have a traveller account.
11. **Invites last 7 days;** accepting one sends the normal sign-in link. The first Owner starts from a one-time setup link.
12. **Sign-in links.** Console links are made on the server and sent from console@trakline.in, from an allowance that public sign-ins can't use up. Each email stream has its own sender: signin@, updates@, alerts@, privacy@ and console@.
13. **Business leads** are added by hand in the console. There's no public "for business" form yet.
14. **Chart reminders** use the Railway Board rule in force since December 2025: the first chart at least 10 hours before departure, or at 20:00 the night before for trains leaving 05:00–14:00. The rule is kept as data so it can change.
15. **Links in emails never act on load.** Confirm, verify and stop links open a page with one button, so a mail scanner opening a link changes nothing.
16. **Pre-booking sign-ups** join a separate one-email list ("Tell me when availability checks open"), not the monthly news.
17. **Seat availability, fare, running status and route** are drawn to be shown only when the source returns them and the data checks out.
18. **Email plan:** Resend stays on the free plan (decided 2026-09-19): 100 emails a day and 3,000 a month, shared by every stream. Sign-in and console links keep a daily reserve of 40. Privacy emails come next. Confirmations and announcements use what's left, and a large announcement is sent over several days.

## 11. Questions

**Decided on 2026-09-19:**
- **Email plan:** stay on the free plan. The drawings show daily and monthly allowances, a reserve for sign-in links, and announcements sent over several days.
- **Access file:** name the services only in the DPDP access file, which goes only to the verified person (s.11(1)(b)).

**Decided at the B0 review (19 Sep 2026):**
- **Console tag contrast.** The locked steel (about 3.4–3.7:1) on 11px outline tags is below AA, and the console uses many more tags than the public site. Decision: the readable steel (#416180) for console tags. Ghost buttons follow, so all steel text in the console is readable. Traveller pages keep the locked steel.

## 12. Notes for the phase specs (found while checking this brief)

**Now (production, flagged as a separate task):**
- One address can spend RailKit's monthly quota in about 8 hours:
  - The only limit is 20 checks a minute per full address.
  - IPv6 users rotate within their /64.
  - Refresh skips the cache.
- The fix: a daily budget for live requests, IPv6 keyed by /64, and a minimum age before Refresh spends a request.

**Phase 2**
- **Previews and localhost use the production Supabase project.** A console there would act on real data. Serve the console only on production, or on a deployment tied to a separate staging project, and record the environment on every setting and audit row. Keys are bound to trakline.in anyway.
- **Supabase WebAuthn MFA is experimental.** Spike it first; the authenticator variant is the fallback.
- **Each key tap is single-use,** bound to one action, one target and one reason on the server.
- **Enrolment:** enrolling any key after the first needs a tap of an existing key. "Setup incomplete" first asks for a tap of the first key. Reset keys and the first Owner use one-time setup links.
- **Sign-in routes:** console and public sign-in both post to a server route that gives one answer for every address. `signInWithOtp` in the browser exposes unknown addresses when sign-ups are closed. Console links use `generateLink` and are sent from console@ on a reserved allowance, so public traffic can't exhaust Supabase's email limit for the team.
- **Cookies are host-only,** with no Domain=.trakline.in, so a console session never reaches trakline.in.
- **Switch settings override environment defaults** (`PNR_SOURCE`, `PNR_FALLBACK`, `AUTH_PASSKEY_ENABLED`) and live in Postgres with the audit trail. "New accounts: Closed" doesn't affect console invites.
- **The audit log** is append-only at the database level. Only a purge job removes rows older than 2 years.
- **The admin host's strict nonce CSP** means charts are plain SVG.
- **Security alerts:** until Phase 3's Alerts module exists, the Security rule's events email every Owner directly.

**Phase 3**
- **One measured status.** The footer, landing 04 and accuracy 01 compute status from configuration today (`src/services/service-status.ts`). They must read the same measured status as `/status`, including the new Degraded and Paused states and their sentences.
- **The probe:** Vercel Cron every 5 minutes calls our health endpoint and stores 5-minute windows for 90 days. It spends no provider requests.
- **Provider keys** go in Supabase Vault (installed) or under a separate key, not `DATA_KEY`. Phase 0 promised that rotating `DATA_KEY` touches only the cache and the limits.
- **Blocks survive a `DATA_KEY` rotation.** Keep the address-hash key version with each block, or derive it separately.
- **New counters:** failures by cause, cache hits, rate-limited requests, and the daily live-request budget.

**Phase 4**
- **Email on the free plan** (100 a day, 3,000 a month):
  - Supabase's sign-in emails go through Resend SMTP and count against both allowances. Our own sends must leave a reserve of 40 a day for sign-in and console links.
  - Privacy emails come first (they're a legal duty), then confirmations (capped per day and per connection), then announcements, which are spread over days.
  - Phase 5's alert emails won't fit at any scale. Alerts go push-first, and the plan is reviewed before Phase 5.
- **Wrong-status reports need to know the source.** The browser never knows which source answered, because the wire says "live". The result envelope gains an opaque, encrypted reference (source, retrieval time, cache flag) that the report sends back.
- **Leads carry two states** (subscription and account), plus lists (News, Availability launch) and consent records: time, placement and notice version.
- **One-click unsubscribe** follows RFC 8058 through the `List-Unsubscribe` headers. The footer link opens a one-button page.
- **Erasure also reaches processor copies:** the Resend contact, Supabase's sign-in log entries and push subscriptions. A hashed suppression and consent record stays for a year (DPDP Rules, Rule 8(3)).
- **The privacy notice is versioned,** and consent records point to the version shown. Privacy emails end with the contact person and the Data Protection Board route. Reply periods follow the DPDP Rules; confirm them.
- **The console never opens an access export,** because it holds the person's saved PNRs. The link is single-use, bound to the browser that opens it from the email, and expires in 24 hours.

**Phase 5**
- **Transcription first:** the B1 pages (/account, /watchlist, errors, offline) are transcribed before features are added. "Transcribe the undrawn pages" moves out of Phase 6; the motion pass and the phone and Night polish stay there.
- **Chart timing:** the new line replaces the fixture's four-hour countdown (`CHART_LEAD_MS` in `src/services/sources/fixture.ts`). PRODUCT.md and the live FAQ still say "about four hours" (see PR #16).
- **The alert budget** comes from RailKit's 10,000 a month. Push needs VAPID keys, a service-worker push handler and, on iPhone, a Home Screen install.
- **The calendar file** is built in the browser, so no PNR goes in an address.
- **Devanagari fonts** are self-hosted through next/font, for the CSP.

## 13. Acceptance for Phase 1

- This brief and its seven batch files are merged through a docs PR, and published as a private copy page with a Copy button on each prompt.
- The five B sheets are in the repo under `docs/design/sheets/`.
- The screenshot pack for B1 is made from a sample-data build (every route and state, Day and Night, 1440 and 390).
- B0 is drawn, checked and approved, including the console tag contrast. That unblocks Phase 2's spec. Done 19 Sep 2026; the approved files are in `docs/design/sheets/console/`.
