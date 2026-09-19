# B5: Traveller features (draw before Phase 5)

Each sheet builds on its B1 drawing and changes only what the prompt names. Paste the house rules first.

- **Running status, route, seat availability and fare** were chosen on 18 Sep 2026 as RailKit follow-ups. They're drawn to appear only when the source returns them and the data checks out, like running status.
- **The sample train** is 12627 Karnataka Express, leaving SBC at 20:00 IST on Thu, 24 Sep. Under the current Railway Board rule, its first chart is due about 10:00 IST that morning.

## PNR Result Features

File `PNR Result Features.dc.html` · /pnr · Forms TL-06, TL-07

```text
Sheet: PNR result, new features. Save as "PNR Result Features.dc.html". Built on "PNR Result.dc.html"; change nothing else on that page.

1. STATUS ALERTS (Form TL-06). A new action, "Alert me", beside Save.
   - Signed out: "Sign in to get alerts. Alerts follow the PNRs saved to your account.", with Sign in.
   - Signed in, not saved yet: "Alert me" saves the PNR to the account, then opens the dialog.
   - At the limit: "You can have alerts on 10 PNRs at a time. Turn one off in your watchlist."
   - Dialog "Status alerts · Form TL-06":
     - What triggers one: "When the status, coach or berth changes, and when a chart is prepared."
     - "Push to this device", a switch with four states: not asked; allowed; blocked by the browser (with how to unblock it); not supported ("On iPhone, add Trakline to your Home Screen first").
     - "Email to you@example.com", a switch.
     - Schedule: "We re-check a few times a day, just after the first chart is due, and after the final chart. Then alerts stop."
     - Primary "Turn on alerts".
   - Once on, the header meta adds "Alerts on · next check 17:00 IST", and the action becomes "Alerts on", which reopens the dialog.
   - The push notification, drawn as a phone lock-screen card:
     - title "12627 · SBC→NDLS · Thu, 24 Sep: WL 12 → CNF"
     - body "PNR ending 8909 · Retrieved 14:05 IST from Trakline"
2. CHART TIMING. In the status plate, this line replaces the chart countdown:
   - "First chart due about 10:00 IST, Thu 24 Sep (railway schedule)".
   - Once prepared: "Chart prepared 10:04 IST".
3. ADD TO CALENDAR (Form TL-07). The action "Add to calendar" opens a sheet showing the event:
   - the train; from → to; departure date and time in IST; arrival, if returned
   - "Remind me when the first chart is due", on by default
   - "Include the PNR in the event", off by default, with "Calendars are often synced to other services."
   - "Download .ics"
4. RUNNING STATUS: "Running status | Sheet 03". Shown only when the service returns it:
   - the last reported station and time
   - the delay ("Running 25 min late")
   - the next station, if returned
   - "Retrieved 14:05 IST from Trakline"
5. ROUTE: "Route | Sheet 04", on the twin-rail route line (the rail motif with sleepers).
   - Each stop: code, name, arrival, departure, day.
   - The traveller's boarding and destination stops are filled; the others are hollow.
   - Long routes show the boarding-to-destination part, with "Show all 24 stops".

PROPS
- signed: out, in.
- alerts: off, dialog open, on, at limit, push blocked, push not supported.
- running: not started ("Starts from SBC at 20:00 IST"), running, arrived, not returned ("Running status wasn't returned for this train.").
- route: returned, not returned.
- sheet: none, calendar, lock-screen notification.

CHECKS
- No delay, prediction or estimate that the service didn't return.
- The chart time says "due", never "confirmed".
- No alert text shows a full PNR.
```

## Watchlist Alerts

File `Watchlist Alerts.dc.html` · /watchlist

```text
Sheet: Watchlist with alerts. Save as "Watchlist Alerts.dc.html". Built on "Watchlist Signed In.dc.html".

- Each row gains an alert indicator in its actions cell: a lit lamp with "Alerts on", or a hollow lamp with "Alerts off". The row menu adds "Turn on alerts" or "Stop alerts".
- A header line: "Alerts on for 2 of 3 PNRs · 8 left".
- The page reached from an alert email's "Stop alerts for this PNR" link. It has one button, and opening the link changes nothing:
  - Before: "Stop alerts for 12627 · SBC→NDLS · Thu, 24 Sep (PNR ending 8909)?", with "Stop alerts".
  - After: "Alerts stopped.", with "Undo" and "Open watchlist".

PROPS
alerts (on and off mix, at limit); page (watchlist, stop before, stop after).

CHECKS
- The stop page never shows the full PNR.
- The indicator folds into each record at 390.
```

## Account Alerts

File `Account Alerts.dc.html` · /account

```text
Sheet: Account with alerts. Save as "Account Alerts.dc.html". Built on "Account.dc.html".

A new plate, "Alerts", after Watchlist:
- "Email alerts to you@example.com": on or off.
- "Devices with push": each device ("Chrome on Android · added 12 Sep"), with Remove.
- "Pause all alerts": a switch.
- "Alerts on for 2 PNRs · Open watchlist".

PROPS
state: alerts on, paused, no push devices.
```

## Pre-booking Availability

File `Pre-booking Availability.dc.html` · /pre-booking · Form TL-08

```text
Sheet: Pre-booking with availability. Save as "Pre-booking Availability.dc.html". A redraw of Pre-booking B for when an availability source is connected. Form TL-08 replaces TL-02.

FORM "Availability request · Form TL-08"
- Train: a search field that takes a number or name, e.g. "12627 · Karnataka Express".
- Class · Quota · Journey date, as today.
- Primary "Check availability".

RESULT PLATE "Availability | Sheet 01"
- A table: Date · Class · Availability · Fare.
- Availability uses the same mono tag forms as statuses: AVAILABLE 42 · RAC 12 · WL 30 · REGRET · NOT AVAILABLE.
- Fare: "₹1,245", or "Not returned".
- "Retrieved 14:05 IST from Trakline".
- Dates read like "Fri, 25 Sep 2026", never "2026-09-25".

BELOW THE RESULT
- The Availability launch field from Sign-up Capture, shown only while availability isn't connected.
- The lifecycle plate, as today.

PROPS
state: idle; loading; ready; partly returned (some fares "Not returned"); no such train; unavailable (today's "No availability returned" plate, with the launch field); past date.

CHECKS
- No predicted availability, and no "chance" wording.
- A missing fare is "Not returned", never ₹0.
```

## Hindi

File `Hindi.dc.html` · every page

```text
Sheet: Hindi. Save as "Hindi.dc.html". The language control, a Devanagari type study, and two pages in Hindi. The type study is a study, not a page, so it may carry notes. The pages may not.

1. LANGUAGE CONTROL
   - A 36px masthead box with a globe icon and the current language ("EN" or "हि"), beside the theme button.
   - Its menu lists English and हिन्दी, with room for more languages.
   - In the phone drawer, a "Language" row.
2. TYPE STUDY (a plate)
   - These roles, in Barlow and in Hindi, at the app's sizes: hero line, page title, section heading, legend, body, button, tag.
   - The Hindi is set twice, in Anek Devanagari (width 75–85) and Noto Sans Devanagari (width 62.5–75).
   - Pick one family per role, and give the reasons in the chat.
   - Devanagari needs more line height than Latin, for its headline stroke and vowel marks.
   - No letter-spacing on Devanagari.
3. PAGES IN HINDI
   - The landing hero with the check plate.
   - The PNR result in a WL state.
   - Railway codes (CNF, RAC, WL, 3A, SL), PNR digits, times, and coach and berth stay as they are.

PROPS
language: English, Hindi; menu: closed, open; view: study, landing, result.

CHECKS
- No vowel marks are clipped at any size.
- Latin figures sit on the Devanagari baseline.
```
