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

Drawn on 2 Oct 2026, **for approval**. Nothing is built from these until the owner approves them; the console's pages (announcements PR 3) are then transcribed 1:1. Same frame, same `industry.css`, no new classes. The sample world is the other console sheets': Saturday 19 Sep 2026, 14:32 IST.

| File | Sheet | States (props) |
|---|---|---|
| `ConsoleAnnouncements.dc.html` | 23 Announcements at 1440, Form TC-10 | role (Owner, Admin) · state: List, Compose, Queue confirm, Sending, Stop confirm, Stopped, Done, Suppressions, Lift confirm, No access |
| `ConsoleAnnouncementsPhone.dc.html` | 23 Announcements at 390 | role (Owner, Admin) · state: List, Compose (read-only), Sending, Stop confirm, Stopped, Done, Suppressions, No access |

- **Letters** are a table at 1440 and cards at 390. A letter is Draft, Sending, Stopped or Done; its progress reads `Sent 120 · Skipped 3 · Unknown 0 of 418`.
- **Compose** keeps Queue disabled, with its reason beside it, until a test send has been made. The Availability list is single-use: once its one send has finished it can't be chosen again. **Queue confirm** is Compose after a test send, with a dialog naming the list, subject, recipient count and "About 11 days at 40 a day"; its button reads Queue.
- **Sending** shows Sent, Skipped and Unknown as separate figures and an estimate at 40 a day, with Stop. **Stop confirm** says how many already have the letter (262, which can't be recalled), how many won't get it, and that a stopped letter can't be resumed; its button reads Stop sending. **Stopped** states what went and what never will, with no actions. **Done** has final counts and no actions.
- **Suppressions** lists address, scope (All or List mail), reason, when and source. Addresses are masked until revealed, except an operator's (a console member's), which is marked. Each row has Lift; **Lift confirm** names the address and scope and says mail resumes.
- **On a phone** the console is for reading plus urgent actions: Compose is a read-only view of the draft ("Open on a larger screen to edit this draft, send a test or queue it"), Suppressions has no Lift, and Stop with its confirm is fully available, as a bottom sheet. Queue confirm and Lift confirm are desktop only.
- **No access** is drawn as Support opening the module; Viewer sees the same with its own role name.
