# Console sheets: B0, B2, B4, sheet 22 and sheet 24

The console's sheets, drawn on the Design canvas. B0 (the frame and its audit log) and B2 (admin core) were approved on 19 Sep 2026. Phase 2 builds from these files. Where they differ from the prompts in `docs/superpowers/specs/phase-1-sheets/b0-calibration.md` and `b2-admin-core.md`, these files win.

## B0

| File | Sheet |
|---|---|
| `Main.dc.html` | Console Shell at 1440 |
| `ShellPhone.dc.html` | Console Shell at 390 |
| `AuditLog.dc.html` | Console Audit Log at 1440 |
| `AuditLogPhone.dc.html` | Console Audit Log at 390 |
| `ShellConfirm.dc.html`, `ShellNight.dc.html`, `AuditRecord.dc.html` | State boards: a sheet above with its props set |
| `canvas.json` | The canvas layout |
| `industry.css` | The console's classes |

Each sheet's states are the props in its `data-props`: role, environment, notice, dialog, menu, page or state, and `defaultTheme` (system, light, dark), as in the B sheets. The theme button works like the app's: System → Day → Night, with System following the device. `industry.css` copies its tokens from `src/styles/theme.css` (same names and values), and its classes follow the components in `src/components/ui`. Each class names the component it mirrors.

### Decided at the B0 review (19 Sep 2026)

- In the console, steel text uses the readable steel, `--accent-text`: outline tags and ghost buttons are #416180 by day and #b5d9fd by night. The locked steel (#5980a6) stays for fills, rules, lamps and the focus ring. The primary button keeps the locked pairing.
- The frame's own tags (the environment, CONSOLE and the member's role) are condensed capitals. Data tags stay in sentence case.
- Result tags: Done is an outline tag; Refused and Failed are grey tags.
- The record drawer floats 12px in from the window edges, so all four corner marks show. On phones it's a full-screen sheet.

## B2

Admin core, drawn in B0's frame, with the same `industry.css`. B2 only adds classes: the meter, the roles matrix's squares, the invite form's choice rows, and a disabled segmented option. The canvas layout is `canvas-b2.json`.

| File | Sheet | States (props) |
|---|---|---|
| `ConsoleSignIn.dc.html`, `ConsoleSignInPhone.dc.html` | Console Sign In, Form TC-02 | state: email → done, including too many, link expired, key waiting, failed and not registered, setup incomplete, no access, session ended, authenticator fallback |
| `ConsoleSetup.dc.html`, `ConsoleSetupPhone.dc.html` | Console Setup, Form TC-03 | entry: invite, first Owner, keys reset, one key only · state: arrival, link sent, steps 1–3, invite expired or withdrawn, same key twice, key add failed, browser can't use keys |
| `ConsoleOverview.dc.html`, `ConsoleOverviewPhone.dc.html` | 01 Overview | role · service: normal, RailKit down, checks paused, budget reached · state: ready, loading, plate unavailable, first run · incident |
| `ConsoleTeam.dc.html`, `ConsoleTeamPhone.dc.html` | 13 Team, Form TC-04 | state: ready, loading, error, only you, no access · dialog (desktop): row menu, invite, invite refused, change role, reset keys, remove, last Owner, resend, revoke |
| `ConsoleMyKeys.dc.html`, `ConsoleMyKeysPhone.dc.html` | My keys | role · state: ready, error, adding, remove blocked, removing, removed, sign out others, others signed out |
| `ConsoleSwitches.dc.html`, `ConsoleSwitchesPhone.dc.html` | 11 Switches & settings | role (Owner, Admin) · state: ready, confirm pause, saving, saved, failed, checks paused, source not configured, confirm primary source (desktop), no access |

The traveller side of B2, Notices, is in `../traveller/`.

### Decided at the B2 review (19 Sep 2026)

Approved as drawn. These choices made in the drawing are now the spec:
- Pausing checks uses B0's Confirm it's you, with the message to travellers above the reason. On phones, PNR checks is the only switch that can be changed.
- The site notice is Off in the sample, so Switches agrees with Overview, which shows no notice strip. Its text and a preview of the strip stay visible, so the next notice can be written in advance.
- Choosing RapidAPI as primary shows the low-quota warning in the confirm dialog, before the key tap.
- Each limit has its own Save (disabled until the value changes). A paused PNR checks row shows its message with Edit message.
- The sample figures agree with Overview: checks answering since 09:12 IST, paused at 14:02 by Asha Rao, RapidAPI 3 of 10 used this month, the live-check budget at 157 of 300.

## B4

Drawn on 2 Oct 2026 and **approved on 4 Oct 2026**, as drawn. The console's pages (announcements PR 3) are transcribed from these files 1:1. Same frame, same `industry.css`, no new classes. The sample world is the other console sheets': Saturday 19 Sep 2026, 14:32 IST.

| File | Sheet | States (props) |
|---|---|---|
| `ConsoleAnnouncements.dc.html` | 23 Announcements at 1440, Form TC-10 | role (Owner, Admin) · state: List, Compose, Queue confirm, Sending, Stop confirm, Stopped, Done, Suppressions, Lift confirm, Lift confirm (mail service list), No access |
| `ConsoleAnnouncementsPhone.dc.html` | 23 Announcements at 390 | role (Owner, Admin) · state: List, Compose (read-only), Sending, Stop confirm, Stopped, Done, Suppressions, No access |

- **Letters** are a table at 1440 and cards at 390. A letter is Draft, Sending, Stopped or Done; its progress reads `Sent 120 · Skipped 3 · Unknown 0 of 418`.
- **Compose** keeps Queue disabled, with its reason beside it, until a test send has been made. The Availability list is single-use: once its one send has finished it can't be chosen again. **Queue confirm** is Compose after a test send, with a dialog naming the list, subject and recipient count, the letter ahead ("Behind"), and a figure that includes it: "About 11 days at 40 a day, starting when that one finishes", finishing around 4 Oct. One letter drains at a time, in queue order (spec §3), so an estimate is never "N days" while another letter is draining. Its button reads Queue.
- **Sending** shows Sent, Skipped and Unknown as separate figures and an estimate at 40 a day, with Stop. **Stop confirm** says how many already have the letter (262, which can't be recalled), how many are still waiting and won't get it, and that a stopped letter can't be resumed; its button reads Stop sending. **Stopped** states what went and what never will, with no actions. **Done** has final counts and no actions.
- **Suppressions** lists address, scope (All or List mail), reason, when and source. Addresses are masked until revealed, except an operator's (a console member's), which is marked. Lift needs the address revealed first (masked rows show Lift disabled; Reveal is already audited), so nobody lifts a suppression for an address they cannot see. **Lift confirm** names the address and scope and says mail resumes. For a row from the mail service's own list, **Lift confirm (mail service list)** says lifting ours does not lift theirs and that it must be cleared there too.
- **Letter states.** A letter is `draft`, `queued`, `sending`, `stopped` or `done`. The board draws four; `queued` is not drawn. It is the state from Queue until the letter's first claim, and, because one letter drains at a time, also the state of a letter waiting behind another. PR 3 labels it **Queued** with the light lamp (the Draft lamp is hollow, Sending half, Stopped ringed, Done lit), shows its progress as `Sent 0 · Skipped 0 · Unknown 0 of N` and, on its detail, "Starts when the letter ahead finishes" with the estimate; Stop is offered, as for Sending.
- **On a phone** the console is for reading plus urgent actions: Compose is a read-only view of the draft ("Open on a larger screen to edit this draft, send a test or queue it"), Suppressions has no Lift, and Stop with its confirm is fully available, as a bottom sheet. Queue confirm and Lift confirm are desktop only.
- **No access** is drawn as Support opening the module; Viewer sees the same with its own role name.

### Decided at the B4 review (4 Oct 2026)

Approved as drawn, from all 46 rendered states (both boards, Day and Night, Owner and Admin). These choices made in the drawing are now the spec:
- **Stop works on a phone.** The September brief made the phone view read-only. Writing, test sends, Queue and Lift stay on a larger screen; Stop and its confirm are available at 390, because stopping is the urgent action.
- **Lift needs Reveal first.** A masked row shows Lift disabled until the address is revealed.
- **Queued is built from the note above, not from a board**: the label "Queued" with the light lamp, `Sent 0 · Skipped 0 · Unknown 0 of N`, "Starts when the letter ahead finishes", and Stop.
- The Compose board's sample body ("We write about once a month.") is sample text and stays. It is not product copy: the news sign-up promises no frequency, and nothing in the console may state one.

**Added after the review (4 Oct 2026), not on the boards:** a draft's row in the Letters table ends in **Delete**, under an Actions column whose header is for screen readers only. It opens a plain confirm ("Delete this draft?", the subject, "It has gone to nobody. This can't be undone.", Cancel and Delete draft). The owner asked for it once the first test draft could not be removed, and chose the row over the draft's own page. Drafts only: anything that has been queued is the record of who received what. Not on a phone, where the cards are a single link and the console reads and stops.

**Built:** Letters in PR #120, Delete in #121, Suppressions after them. Three things the build settled that the boards leave open:
- **The tab row is two links, not a tablist.** Each tab is its own address (`/announcements`, `/announcements/suppressions`) with its own server read; it is drawn exactly as the board's tabs and marked with `aria-current`.
- **What is revealed is not kept.** A revealed address lives in the open page only; a reload masks it again, and looking again is a second audit row.
- **The store's reasons are shown in the board's words**: hard bounce is "Hard bounce" from a "Delivery report"; a complaint is "Spam complaint" from a "Complaint report"; repeated delays are "Delayed three times in 30 days" from "Delivery reports". A row mirrored from the mail service's own list reads "Suppressed by the mail service", where the board's sample row says "Hard bounce": the store does not record a cause for those. The provider is never named.

## Sheet 22: Leads (first part)

Drawn on 4 Oct 2026 and **approved the same day**, after two changes the owner asked for (below). Module 06's pages are transcribed from these files 1:1. Same frame, same `industry.css`, no new classes. The sample world is the other console sheets'; its figures agree with sheet 23 (431 subscribed to News, 217 on the Availability list).

| File | Sheet | States (props) |
|---|---|---|
| `ConsoleLeads.dc.html` | 22 Leads at 1440 | role (Owner, Admin, Support) · state: List, Search: one match, Search: no match, Drawer, Drawer revealed, Empty, Unavailable, No access |
| `ConsoleLeadsPhone.dc.html` | 22 Leads at 390 | role · state: List, Drawer, Drawer revealed, Empty, No access |

**This is the first of the brief's four parts** (`phase-1-sheets/b4-leads-accounts-privacy.md`): the figures, the list, filters, search, the lead's record and Reveal. Export, tags, notes, deleting a lead and the business pipeline are drawn when they are built, so these boards carry no tabs, no Export and no "Add a business lead".

- **Figures**: Pending confirmation, Subscribed, Unsubscribed, Suppressed, With an account, Availability list. News and Account are separate facts; the plate says so.
- **Search** takes the whole address, exactly. The match stays masked and the lookup is written to the audit log. A searched address is never put in the page's address.
- **The list**: Email (masked, opens the record), News, Lists, Account, Source, Campaign, First seen, Last activity, and Reveal. The board draws 8 of a page's 50 rows.
- **The record** (a drawer at 1440, a full screen at 390): the address with Reveal, each list's consent in full, the account (saved PNRs as a count only), the campaign, and a timeline.
- **Reveal** shows the address for the visit and writes an audit row. A reload masks it again.
- **On a phone** the page reads and reveals; it changes nothing.
- **No access** is drawn as a Viewer opening the module.

### Decided at the review (4 Oct 2026)

- **The Account column says Has account, No account or Disabled, and nothing else.** The first drawing put the last sign-in under it; the owner removed it, since Last activity is its own column. The last sign-in stays on the record.
- **Five News statuses, five tag forms, one box.** Every tag carries a 1px edge, clear unless the form is an outline, so no status is taller or set wider than another: Subscribed is the tint fill, Pending confirmation the steel outline, Unsubscribed the grey fill, Not subscribed a neutral outline, and Suppressed the solid alert ink, because it is the one that means mail cannot reach them. The first drawing had an outline 2px taller than the fills, "Not subscribed" as plain text, and Suppressed looking like Unsubscribed.
- **People who only have an account are listed**, as "Not subscribed": the brief's lead is "sign-ups and accounts".

### Part two: tags, notes, delete and export (approved 4 Oct 2026)

The same two boards, redrawn with the brief's second part on them and approved the same day. The props gain five desktop states (Record: no account, Delete: confirm, Export: confirm, Export: preparing, Export: ready) and one phone state (Record: no account). The business pipeline is the part after this one and is not drawn.

Decided with the owner before drawing:

- **Tags are free-form**: letters, numbers and hyphens, up to 24 characters, up to 10 on a lead. A tag exists from the first time it is used. They are added and removed on the record, one lead at a time; the list has no selection and no bulk actions.
- **The export holds whole addresses**, for the filters in force, with each lead's status, source, campaign and tags. Notes are not in it. Owner and Admin, a reason and a key; it works once, in that browser, for 10 minutes.
- **Delete lead is a plain delete**, only for a lead with no account, with a reason and a key: the person, their consents, tags and notes. A suppression on the address stays, and they can sign up again. "Never email again" is an erasure request's job (module 09).

What the redrawing changes on the first part's boards:

- **The Campaign column shows the campaign's name.** Beside a Tags column there is no room at 1440 for source, medium and name, and the cell was cut. Source and medium are on the record.
- **The filters take two rows**: the search box with its hint beside it, then News, Account, Source, Tag and First seen.
- **A Tags column**, the first tag and "+1" for the rest; on a phone, a card's tags in full.
- **The record ends with Tags, Notes and Delete.** A note is scrubbed as a reason is (the drawn "[removed]"), holds up to 500 characters, and cannot be changed or removed afterwards. A lead with an account says it cannot be deleted here.
- **Export CSV** in the page header, for Owner and Admin; Support's page has none.
- **On a phone** tags and notes are read, and nothing is added, deleted or exported: the page says to open it on a larger screen.

Tags and notes need no key and are each written to the audit log, as the brief's table of safeguards sets out. They are built first; export and delete follow in their own change.

### Part three: the business pipeline (approved 4 Oct 2026)

The same two boards again, with the brief's last part on them. The props gain six desktop states (Pipeline, Pipeline: empty, Add a business lead, Mark as a business enquiry, Record: business, Remove: confirm) and three phone states (Pipeline, Pipeline: empty, Record: business).

Decided with the owner before drawing:

- **A lead moves with a Stage picker**, on its card and on its record. There is no dragging.
- **A phone reads the pipeline and changes nothing.** The board stacks into one column.
- **A business lead added by hand is kept until it is deleted.** It has given no consent, so the seven-day clean-up of unconfirmed sign-ups leaves it alone; its record says so in place of the seven-day line.

What the boards draw:

- **Two tabs**, Lifecycle and Business pipeline, under the page header. "Add a business lead" is in the header on both; Export CSV on Lifecycle only.
- **The board**: New, Contacted, Qualified, Won, Lost, the last two narrower. A card is the masked address, one line about the lead, the owner's initials and how long it has been in the stage, with its Stage picker. An empty column is a dashed box, "No leads here".
- **Form TC-09, "Add a business lead"**: Email, Name and Organisation (both optional), About, Owner. The brief calls About "Note"; the record already has Notes, and this is one line, 120 characters, shown on the card, scrubbed as a note is. An address that is already a lead is marked rather than added twice.
- **"Mark as a business enquiry"** on any lead's record, a button where the brief has a switch: turning it on takes the same form (with the lead named in place of an email), and turning it off takes a confirm, and a switch would hide both.
- **"Remove from pipeline"** keeps the lead, with its tags and notes; its stage, owner, name, organisation and the line about it go.
- **The phone's closing line on a record** is now "Open on a larger screen to make changes to this lead."

Adding, marking, moving, assigning and removing need no key and are each written to the audit log, as the brief's table of safeguards sets out. Owner, Admin and Support. A lead added by hand is never put on an email list.

### As built (4 Oct 2026)

The page is `src/app/console/leads/page.tsx`; its parts are in `src/console/leads/`. It matches the boards at 1440 and at 390. Where it departs, it is for one of these reasons, each found by rendering the page rather than reading the sheet:

- **Dates read "02 Sept 2026"**, the app's own format, where the boards write "2 Sep 2026".
- **The pickers carry their label beside a native select** (above it on a phone), as the audit log's do, where the boards draw the label inside the well.
- **Below 1360px the table's columns take what their words need**, on 10px gutters for the drawn 14px, and **the Campaign column is not drawn**: ten columns do not fit a 1280 window beside the rail, and the campaign is whole on the record. From 1360px the widths and gutters are the board's.
- **Tags is the column that gives.** It takes what is left and cuts its tag with an ellipsis; the whole tag is a hover away and on the record. A revealed address is never cut: its column widens and Tags gives the room.
- **The filters are on two rows at every width from `sm`**, as part two draws them: the search box with its hint beside it, then the five pickers, First seen against the right edge.
- **Part three is built in two changes**: adding, marking, moving, assigning and removing a business lead from the record first; the tabs and the board second.
- **The tabs are two links in a `<nav>`**, not the drawn tablist, for the reason the Announcements tabs give: each is its own address with its own read. The board is at `/leads/pipeline`, and a card opens the record over it (`?lead=`), the same record the list opens.
- **A card's Stage picker is a native select on its own**, where the board draws the word "Stage" inside the well; its accessible name is "Stage of" and the lead's masked address.
- **Five columns from 1280px, as drawn; two across below that; one on a phone.** Five do not fit beside the rail below 1280.
- **A lead nobody owns** is drawn with a dash where the initials go; the boards draw every lead owned.
- **A board that could not be read** says "Pipeline unavailable", which no board draws.
- **TC-09 is the console's own dialog**, as the Team's invite form is, where the board draws a plate with a title block; a refusal is said at the foot of the form, since it may be about the address, the line or the owner.
- **A lead whose owner has left the console** reads "Nobody" in the Owner picker; the boards draw every lead owned.
- **Part two is built in full**: tags and notes first, then Delete lead and Export CSV in their own change.
- **The confirm for Delete and Export is the console's own TC-01 dialog**, as every other reason-and-key act uses, where the board draws a plate with a title block. Its sentence under the bold line is the board's.
- **The export's status rows are the audit log's**, as drawn. A refusal (more than 10,000 leads, or a list that could not be read) is said in the same place, before any key is asked for; the boards draw neither.
- **Deleting a lead that had been sent a letter** takes its delivery rows with it, by the tables' own cascade, so that letter's "sent" count drops by one.
- **A tag in the list is its first, with "+2" for the rest**; the board draws one or two and never more.
- **The phone's figures are 24px**, the type scale's nearest step to the drawn 26px.
- **Previous and Next are links**, so a page of the list has an address; where there is nowhere to go they are the drawn disabled buttons.
- **Undrawn states**, in the module's own words: filters that match nobody, figures or a record that could not be read, a record that is no longer there, and part of an address typed into the search (refused in the form, before any lookup is made or recorded).

## Sheet 24: Accounts

Drawn on 8 Oct 2026 and **approved the same day**. Module 08's pages are transcribed from these files 1:1. Same frame, same `industry.css`, no new classes. The sample world is the other console sheets': 1,204 accounts, the figure sheet 22 gives as "With an account", and `a•••@example.com` is the same person there.

| File | Sheet | States (props) |
|---|---|---|
| `ConsoleAccounts.dc.html` | 24 Accounts at 1440 | role (Owner, Admin) · state: List, Search: one match, Search: no match, Record, Record revealed, Record: disabled, Sign out: confirm, Disable: confirm, Enable: confirm, Empty, Unavailable, No access |
| `ConsoleAccountsPhone.dc.html` | 24 Accounts at 390 | role · state: List, Record, Record revealed, Record: disabled, Empty, No access |

Decided with the owner before drawing:

- **"Start deletion" and the "Deletion pending" status are left out** until Privacy requests (module 09) is built. The brief routes an account's deletion through an erasure request there, and there is nowhere to open one yet.
- **Sign out everywhere and Disable take effect at once.** A traveller who is signed in is refused on their next request, not when their token runs out up to an hour later.
- **A disabled traveller who tries to sign in reads** "This account has been switched off, so it can't sign in.", where the sign-in page says a link did not work today. No address: the site publishes none.

What the boards draw:

- **The list**: Email (masked, opens the record), Created, Last sign-in, Sign-in ("Email link · 2 passkeys"), Saved PNRs (a count), News (a tag that opens the same person in Leads), Status, and Reveal. Newest sign-in first. The board draws 8 of a page's 50 rows.
- **Search** takes the whole address, exactly, as in Leads. The match stays masked and the lookup is written to the audit log.
- **Three pickers**: Status (Active, Disabled), Sign-in (Email link, Google, Passkey) and Created. The brief lists two ways to sign in; Google is drawn because the site offers it.
- **The record** (a drawer at 1440, a full screen at 390): the address with Reveal; Status; the account's facts; Sessions, as how many are signed in and when one was last seen; News, with a link to the lead; then Sign out everywhere, and Disable or Enable. It closes with "Saved PNRs stay private: the console shows only how many."
- **A disabled account** says since when and by whom, has nobody signed in, and offers Enable.
- **Sign out everywhere, Disable and Enable** each go through Confirm it's you (TC-01): a reason and a key. The confirm for Disable says what is kept: saved PNRs and subscriptions, and that news still reaches them if they are subscribed.
- **On a phone** the page reads and reveals; it changes nothing, and a record says to open it on a larger screen.
- **No access** is drawn as Support opening the module. No loading state is drawn: the page is read on the server and arrives whole.
- **No PNR, passenger name or watchlist entry appears on any board.** Console members are not listed.

### As built (8 Oct 2026)

The page is `src/app/console/accounts/page.tsx`; its parts are in `src/console/accounts/`. It is built in two changes: the list, search, the three filters, the record and Reveal first; then Sign out everywhere, Disable and Enable, the check that makes them take effect at once, and the traveller's sign-in line.

- **"At once" is a rule in the database, not a promise in the page.** A traveller's token is good for up to an hour after its session is gone, so the watchlist's rows are answered only while `session_live()` holds: the session row is still there and the account is not banned. The site asks the same question once per request, so a signed-out traveller's pages say so. If that question cannot be answered the traveller stays signed in on the page, and their saved PNRs stay guarded by the rule itself.
- **Disable is the auth service's own ban**, set a hundred years out, plus every session ended. Nothing of the traveller's is removed.
- **A disabled account says since when and by whom only when the console disabled it.** One disabled from outside the console reads "Can't sign in.", which no board draws.
- **The three confirms are the console's own TC-01 dialog**, as every other reason-and-key act uses, where the boards draw a plate with a title block. Each one's sentence under the bold line is the board's; Sign out everywhere counts the sessions it will end.
- **The traveller's line** is shown for all three ways in: an email link, Google and a passkey.
- **Sign-in is the column that gives**, as Tags is in Leads: it takes what is left and cuts its words with an ellipsis, the whole of them a hover away and on the record. Below 1360px every other column takes what its words need, on 10px gutters. A revealed address is never cut.
- **An account nobody has signed in to yet** reads "Never" under Last sign-in, and "Never signed in" on a phone's card; the boards draw every account signed in.
- **Dates, pickers, the pager and the undrawn states** follow the Leads page (above): "02 Sept 2026", a label beside a native select, Previous and Next as links, and the module's own words for filters that match nobody, a record that could not be read or is no longer there, and part of an address typed into the search.
- **The filter bar, the record's shell and the pager's steps are shared with Leads** (`src/console/components/`): lifted out of that module unchanged when this one needed the same pieces.
- **Everything is Owner and Admin, in the database as on the page.** Finding by email, Reveal and the three acts each write an audit row under the category `accounts`, by the masked address; an act's row carries its reason, and how many sessions it ended.

