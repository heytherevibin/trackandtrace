# B1: Traveller pages as built (draw after B0, before B2)

**Approved 19 Sep 2026.** The approved drawings are in `docs/design/sheets/traveller/`. They were drawn from the running app itself, so they match the site except where the drawing changes it (dates read "Sep"). Where they differ from the prompts below, the drawings win.

These pages work today but were never drawn. Drawing them lets you judge the look by eye and correct it in the drawing, and every later traveller sheet builds on them.

- **When each page is transcribed:** before the first phase that changes it. /pnr and /login in Phase 2; /privacy in Phase 4; /account, /watchlist, the error pages and /offline in Phase 5.
- **Screenshots come with each prompt:** before this batch, Claude Code makes a screenshot pack from a sample-data build (every route and state, Day and Night, 1440 and 390). Attach the matching screenshots to each prompt. The prompt gives the structure; the screenshots are the truth for details.

Paste the house rules first.

## PNR Result

File `PNR Result.dc.html` · /pnr#<pnr>

```text
Sheet: PNR result. Save as "PNR Result.dc.html". The public /pnr page, drawn as it works today, following the attached screenshots. This is its first drawing.

PAGE HEADER
- Back link "← Check another PNR".
- Title "SBC to NDLS" in condensed capitals.
- Lead "12627 · Karnataka Express · Thu, 24 Sep · 3A".
- Meta "PNR 234 567 8909".
- Actions: Refresh · Share · Save to watchlist, which becomes "Saved".

PLATES
1. "Current reservation status | Sheet 01":
   - the status band: CNF as a filled tag; RAC and WL outlined; CAN grey
   - the facts, including the chart
   - the provenance line "Retrieved 14:05 IST from Trakline · every field as returned, none invented"
2. "Passengers | 3 booked": a table with Passenger (Passenger 1, 2, 3; never names) · Booked · Current · Coach · berth. It folds into labelled records at 390.
3. "Journey", with the fields as returned. A missing field reads "Not returned".
4. "How this result was assembled": the four-step lifecycle (Input received → Request validated → Source answered → Result presented) with IST times, and the note "Only fields returned by the source are shown. Prediction fields are never displayed."

PROPS
- state:
  - loading: skeleton plates, "Requesting railway data"
  - ready CNF; ready RAC; ready WL; ready cancelled; chart prepared
  - sample data: the "Sample data" cell and tag
  - not found: "No record for this PNR"
  - rate limited: "Too many checks", with a "Retry in 42 s" countdown
  - unavailable: "No live result", with Response · Provenance · Fallback, then the "PNR request lifecycle" plate
  - bad address: "That is not a PNR", beside a Form TL-01 plate
- toast: none, saved, shared

CHECKS
- It matches the screenshots. Where you'd improve something, draw the improvement and name it in the chat.
- Nothing names a provider.
- A missing field says "Not returned", never a blank or a dash.
```

## Sign In

File `Sign In.dc.html` · /login (updates Sign in B)

```text
Sheet: Sign in. Save as "Sign In.dc.html". A redraw of Sign in B as it works today, following the screenshots.

- A brand-only masthead with no theme control. Sign in B drew theme cells there; the app has none. Draw it as built, and if you think the control should come back, say so in the chat.
- The mark, "Sign in", and a lead (with or without passkeys).
- One plate:
  - idle: the email field, "Email me a sign-in link", then "Continue with a passkey"
  - sending, then sent: "Check your inbox"
  - invalid email
  - bad sign-in link
  - not configured: "Sign-in is not connected"
- The line "Checking a PNR never needs an account.", with "Continue without an account →".

PROPS
state: idle, sending, sent, invalid email, bad link, not configured, passkeys off (no passkey button).

CHECKS
- No Google button in any state.
- The email link is primary and the passkey is secondary.
```

## Legal

File `Legal.dc.html` · /privacy and /tos

```text
Sheet: Legal pages. Save as "Legal.dc.html". /privacy and /tos, as they work today, following the screenshots.

- Title, lead, and "Last updated: 18 September 2026".
- A sticky "On this page" plate listing the sections.
- Sections with a number-only kicker ("01"), then the heading, then long-form body text at reading width.

PROPS
page: privacy, terms.

AT 390 WIDE
"On this page" becomes a collapsible plate at the top.

CHECKS
- Body text reads comfortably: 15–16px, about 70 characters a line.
```

## Watchlist Signed In

File `Watchlist Signed In.dc.html` · /watchlist

```text
Sheet: Watchlist, signed in. Save as "Watchlist Signed In.dc.html". Watchlist B drew only the signed-out page. Draw the signed-in page and its dialog as they work today, following the screenshots.

- Title block "Watchlist". Lead "Saved to your account." Count "3 saved". A live announcement line below.
- Plate "Saved PNRs — your account", with the same five columns as Watchlist B. Rows are labelled "12627 · SBC→NDLS · Thu, 24 Sep". Below 1024px they fold into records.
- An "Account sync" note.

PROPS
- state:
  - loading
  - ready
  - empty: "Nothing saved yet", with "Run a check"
  - load error: "Your watchlist could not be loaded."
- dialog:
  - none
  - merge: "Move 3 saved PNRs to your account?", with "Move to account", "Not now" and "Do not ask again"
- toast: none, removed (with Undo).

CHECKS
- Watchlist B's grammar exactly, apart from the signed-in wording.
```

## Account

File `Account.dc.html` · /account

```text
Sheet: Account. Save as "Account.dc.html". The public /account page as it works today, following the screenshots.

- Signed out: "Nothing to sync yet", with "Sign in" and "Open the device watchlist".
- Signed in (h1 "Account"), these plates:
  1. "Profile".
  2. "Watchlist | 3 saved".
  3. "Preferences": the theme button.
  4. "Passkeys": rows reading "Added … · Last used …", and "Add a passkey".
  5. "Your data": "Export JSON", and "Delete account", which opens "Delete this account?" with an acknowledgement switch.

PROPS
- state: signed out, signed in.
- passkeys:
  - list
  - none: "No passkeys on this account yet."
  - unsupported: "This browser cannot use passkeys…"
  - switched off: the plate is hidden
- dialog: none, delete.

CHECKS
- It matches the screenshots.
```

## Errors

File `Errors.dc.html` · 404, error, global error, /pnr error, /offline

```text
Sheet: Error pages. Save as "Errors.dc.html". Each page is a value of one prop, drawn as it works today, following the screenshots.

PROPS
page:
1. Not found: "There is nothing at this address." / "Looking for a PNR? Run a check here.", with Home and Watchlist and a Form TL-01 plate.
2. Error: "Something broke on our side", then an alert plate "This page did not load" with "Reference 7f3a2c", Retry and Home.
3. Global error: its own document, with a brand-only header and no footer; the same sheet with Retry only.
4. Result error: the error sheet plus "Check another PNR".
5. Offline: page header "Offline", and an unavailable plate "No connection" with Response · Provenance · Fallback.

CHECKS
- Every error plate has role="alert" semantics and a precise cause.
- Nothing is substituted for data.
```
