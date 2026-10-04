# Console sheets: B0, B2 and B4

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
