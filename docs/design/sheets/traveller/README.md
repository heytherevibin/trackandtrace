# Traveller sheets: B1 and B2 Notices

Traveller pages drawn on the Design canvas and approved on 19 Sep 2026. They're drawn in the app's own markup and stylesheet (`app.css`, captured from the running app), so they render like the site.

## B1: traveller pages as built

The pages as they're built today, captured from the running app with sample data: a fixture source, a pinned clock (14:05 IST) and a local stand-in for the account service. They are the base that later traveller sheets change. The canvas layout is `canvas-b1.json`.

| File | Sheet | States (props) |
|---|---|---|
| `PnrResult.dc.html`, `PnrResultPhone.dc.html` | PNR Result (/pnr) | state: CNF, RAC, WL, cancelled, mixed, chart prepared, sample data, loading, not found, rate limited, unavailable, bad address · toast: saved, shared |
| `SignIn.dc.html`, `SignInPhone.dc.html` | Sign In (/login) | state: idle, sending, sent, invalid email, bad link, not configured, passkeys off |
| `Legal.dc.html`, `LegalPhone.dc.html` | Legal (/privacy, /tos) | page |
| `Watchlist.dc.html`, `WatchlistPhone.dc.html` | Watchlist, signed in | state: ready, loading, empty, load error · dialog: merge · toast: removed |
| `Account.dc.html`, `AccountPhone.dc.html` | Account | state: signed in, signed out · passkeys: list, none, unsupported, switched off · dialog: delete |
| `Errors.dc.html`, `ErrorsPhone.dc.html` | Errors | page: not found, error, global error, result error, offline |

One change from the live site is drawn: dates read "Sep" (the site prints "Sept").

## B2: Notices

What travellers see when the console changes something. These boards are built on the B1 pages and on the landing page, and change only what `docs/superpowers/specs/phase-1-sheets/b2-admin-core.md` names. The canvas layout is `canvas-b2-notices.json`.

| File | Page | States (props) |
|---|---|---|
| `Notices.dc.html`, `NoticesPhone.dc.html` | The landing | notice: off, on · checks: answering, paused, budget reached |
| `NoticesResult.dc.html`, `NoticesResultPhone.dc.html` | The PNR result | notice · checks: answering, paused, budget reached (no recent result) |
| `NoticesSignIn.dc.html`, `NoticesSignInPhone.dc.html` | Sign in, after an address is sent | notice · sign-ups: open, closed |

### Decided at the B2 review (19 Sep 2026)

- The site notice strip sits under the masthead: a lamp, the text and a 44px close button, with the steel wash. It never covers the masthead, and it wraps on phones.
- When checks are paused, both check plates on the landing pause: the hero's Form TL-01 and the closing "Got a ticket?" plate (the same component). The digits stay editable, Run is disabled, the lamp reads Paused, and the message sits where the hint was.
- Both status lines read "PNR checks are paused": the footer's, as the brief names, and the Reliability band's, which reads the same status.
- The result page keeps its unavailable plate. Paused shows the console's message with Response "Paused" · Provenance "Trakline" · Fallback "None". Busy shows "Trakline is busy. Try again after 00:00 IST." With a recent result, it's the ordinary result with its "Retrieved …" line.
- With sign-ups closed, sign in says "If this address has an account, a sign-in link is on its way.", with the legend "New accounts are closed for now."

### Found while drawing (not changed in these sheets)

- Outline tags and ghost links use the locked steel for text (about 3.7:1 by day and 3.4:1 by night), below AA. The console uses the readable steel; the app's fix is a separate PR.
- On phones, several live controls are under 44px: the 36px masthead boxes, 32px buttons and text links.
