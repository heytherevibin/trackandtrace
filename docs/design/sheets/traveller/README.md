# Traveller sheets: B1, B2 Notices and B4 sign-ups

Traveller pages drawn on the Design canvas and approved on 19 Sep 2026. They're drawn in the app's own markup and stylesheet (`app.css`, captured from the running app), so they render like the site.

**Two stylesheets.** `app.css` is the 19 Sep capture and is what B1 and B2 link. The B4 boards link `app-2026-09-29.css` instead, built from the app on 29 Sep: the older capture predates the availability chart, so it carries no `bg-open-soft`, `bg-queued-soft` or `tnum`, and a board drawn against it would render those chips unstyled. Nothing about B1 or B2 changes. A sheet drawn from here on should link the newer one.

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

## B4: sign-ups

Email sign-ups with double opt-in, for `docs/superpowers/specs/2026-09-28-subscriptions-core-design.md` §5. Drawn before any of it is built (decision 1 of that spec), to be transcribed 1:1 once approved. These are the only traveller sheets not captured from a running page — the surfaces do not exist yet — so they are assembled from the app's own markup: the footers come verbatim from `Notices.dc.html` and `Legal.dc.html`, and the field, button, message and plate classes from `src/components` and `src/app/(site)`.

| File | Sheet | States (props) |
|---|---|---|
| `SignupCapture.dc.html`, `SignupCapturePhone.dc.html` | The capture form, in each place it appears | place: landing footer, one-line footer, pre-booking · state: idle, invalid, sending, sent, too many, daily limit, error |
| `Subscription.dc.html`, `SubscriptionPhone.dc.html` | Confirm (/subscribe/confirm) and Unsubscribe (/unsubscribe) | page: confirm, unsubscribe · list: news, availability · state: before, after, already done, expired, invalid link, error |

Every state was rendered at the board's own viewport width and measured: board overflow, horizontal scroll, clipped text, field width, and the generated column labels in the stacked chart. 71 renders, and the report is reproducible from the boards alone.

### Decided while drawing

- **The message is a sibling of the field's row, not of the field.** Inside the row it stretched the field's column and left the button hanging beside a three-line sentence at 390px. Below the row, the field and its button keep their pairing at every width, and `aria-describedby` still binds the message to the field.
- **Only `invalid` marks the field `aria-invalid`.** Too many, daily limit and error are the site's trouble, not the address's, and flagging an address the traveller typed correctly would say otherwise. All four still describe the field, so all four are read out with it.
- **The one-line footer's new row carries a real minimum width, and so does the consent line.** `flex-1` alone sets a basis of zero, so at 390px the form collapsed to 3px beside the consent sentence instead of dropping below it. Measured, not guessed.
- **The unsubscribe page has nothing to expire.** Its link is an HMAC over the person and the list, not a stored token, so the board draws `expired` on the confirm page only; asked for it on unsubscribe, it shows the invalid link a bad signature really produces.
- **The lead sentence belongs to the state before the press, and only to it.** Left standing it told a traveller who had just unsubscribed to "press Unsubscribe and it stops".
- **The sign-up column is sized like the brand column** (`max-w-[30rem] flex-[1.4_1_240px]`), not like the link columns: a 130px column cannot hold a field and a button, and both of those widths are ones the footer already uses, so the stylesheet really carries them.

### Open for the review

- **"Subscribed by mistake? Resubscribe"** is the spec's wording, drawn as a sentence and a one-word button. Someone reading it has just *un*subscribed, so the question asks about the wrong press.
- **The news list's promise** is the one piece of copy the spec does not fix. Drawn as "News about Trakline: what has shipped, and what is being built." — it claims nothing about how often, on purpose. The availability promise is the spec's own: one email.

### Found while drawing (not changed in these sheets)

- On `/pre-booking` at phone widths, the availability chart's stacked layout drew **overlapping column labels**: the estimate column's name was painted across the fare column's, and the two read as one run-together word. A cell carries `whitespace-nowrap` for its value, and the name — generated from `data-label` — inherited it. Fixed in `src/components/ui/stacked-table.ts` (#96) before these boards were finished, so they draw the corrected chart: the name wraps to two lines and the value stays under it.
- Where one column's name wraps and its neighbour's does not, the two values no longer sit on the same line. Left as it is: aligning them means giving every stacked label a fixed height in every table in the app.
- The consent line's "Privacy notice" link is 13px tall on a phone, under the 44px floor — the same finding B2 recorded for outline tags and text links.
