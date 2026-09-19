# B6: Emails (draw last, before Phase 5 ships)

One email frame in the Industry grammar, then every Trakline email set in it. Paste the house rules first. Until this sheet is drawn, emails keep the plain layout of today's sign-in email.

## Emails

File `Emails.dc.html` · every inbox

```text
Sheet: Emails. Save as "Emails.dc.html". The props panel picks which email is shown, and whether it's in a light email client or a dark-mode one. Gmail's dark mode inverts colours, so the mark and hairlines must survive it.

THE FRAME, 600px wide
- A hairline plate with corner marks, on the page ground.
- A header row with the mark and TRAKLINE.
- Body text at 15–16px in Barlow, falling back to Arial or Helvetica, because many clients block web fonts.
- One steel button, the only solid object, with the full link written under it for clients that hide buttons.
- A footer: "Not affiliated with IRCTC or Indian Railways.", the sender line, and an unsubscribe or manage link where the email type needs one.
- No images other than the mark, and everything readable with images off.
- Links in emails never act by themselves. They open a page with one button.

THE EMAILS
1. Sign-in link, for travellers. From signin@trakline.in. Subject "Your Trakline sign-in link".
   - Heading "Sign in to Trakline". Button "Sign in".
   - "This link works once and expires in 1 hour. If you didn't ask for it, ignore this email."
2. First sign-in: the same email, plus "This link confirms your email and signs you in."
3. Console sign-in link. From console@trakline.in. Subject "Your Trakline console sign-in link".
   - The same shape as the sign-in link, plus "You'll need one of your security keys next."
4. Subscription confirmation. From updates@trakline.in. Subject "Confirm your Trakline subscription".
   - The list's promise. Button "Confirm".
   - "If you didn't sign up, ignore this. You won't hear from us again."
5. Announcement. From updates@trakline.in. The subject comes from the composer.
   - Body blocks.
   - A footer with "Unsubscribe" and "Why you got this: you subscribed on 12 Sep 2026 at trakline.in."
6. Status alert. From alerts@trakline.in. Subject "12627 · SBC→NDLS · Thu, 24 Sep: WL 12 → CNF".
   - "PNR ending 8909".
   - Old → new status per passenger (Passenger 1, 2 …).
   - "Retrieved 14:05 IST from Trakline".
   - Button "Open watchlist" (the link carries no PNR).
   - Footer: "Stop alerts for this PNR · Manage alerts".
7. Privacy. From privacy@trakline.in. Five emails:
   - (a) "Confirm your privacy request": button "Confirm request", expires in 24 hours.
   - (b) "We received your request": the reference and the reply-by date.
   - (c) "Your data is ready": button "Get your data"; the link works once, in the browser you open it in, for 24 hours.
   - (d) "About your request": the outcome (done, or refused with the reason).
   - (e) "Our reply": the message from the console, with "Reference PR-2026-0142".
   Every privacy email ends: "Questions: Asha Rao, grievance officer, privacy@trakline.in. If you're not satisfied with our answer, you can complain to the Data Protection Board of India."
8. Team invite. From console@trakline.in. Subject "You're invited to the Trakline console".
   - Who invited you, and the role.
   - Button "Accept invite", valid 7 days.
   - "Setting up needs two security keys or passkeys."
9. Console alert. From console@trakline.in. Subject "[Trakline console] RailKit down".
   - What happened, when (IST), and the numbers.
   - Button "Open Sources & usage".
   - Footer: "At most one email per rule every 30 minutes · Manage alerts". Security alerts say "Security alerts are always on."
   - Provider names are allowed here only.

PROPS
email: 1–9 (with 7a–7e); client: light, dark mode.

CHECKS
- No email contains a full PNR, a passenger name or a raw IP.
- Every link also works as plain text.
- Traveller emails never name a provider.
```
