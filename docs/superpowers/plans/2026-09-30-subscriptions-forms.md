# Subscriptions forms and pages (06-A PR 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the approved B4 boards on the site — the capture form in three places, and the two pages `/subscribe/confirm` and `/unsubscribe` — over the routes PR 2 already shipped. **This is the launch:** when it merges, a traveller can sign up.

**Architecture:** One client component, `SignupCapture`, holds the whole form: the field, the button, the seven states and the consent line. It takes a `place` prop, because the sheet draws one form in three surroundings, not three forms. It posts to `/api/subscribe` through `apiRequest`. The two pages are server components that decide their state before anything is pressed — `/subscribe/confirm` by reading the token's state through `peekRow`, `/unsubscribe` by verifying the signature — and hand a small client component the one button that acts.

**Tech Stack:** Next.js 16 server and client components, Zod, `apiRequest` from `@/services/api-client`, Vitest with Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-28-subscriptions-core-design.md` (§5 is this PR; §3 is the behaviour it draws)

**Boards, approved 2026-09-30 and transcribed 1:1:** `docs/design/sheets/traveller/SignupCapture.dc.html`, `SignupCapturePhone.dc.html`, `Subscription.dc.html`, `SubscriptionPhone.dc.html`. Read them before Task 1; their `renderVals()` is the state machine this plan builds.

## Global Constraints

- TDD: write the failing test, **run it and see it fail**, then implement. Every task.
- Conventional commits. **No `Co-Authored-By` trailer** (project CLAUDE.md).
- `npm run check` is the gate: the whole of it, never a subset.
- Never name a data provider on traveller surfaces (`tests/unit/privacy/no-provider-names.test.ts`).
- Traveller code never imports `@/console/*` (`tests/unit/console/boundary.contract.test.ts`).
- Files stay under 500 lines.
- Every UI string lives in `src/messages/`; no literals in JSX.
- **Copy, verbatim from the approved boards:**
  - Label: "Email" · placeholder: "you@example.com"
  - Consent: "One email to confirm. Unsubscribe in one click. We never sell your address. Privacy notice" (the last two words link to `/privacy`)
  - Buttons: "Subscribe" everywhere except pre-booking, which is "Notify me"; while sending, "Sending…"
  - Landing footer column head: "Updates by email"
  - Pre-booking: "Tell me once when availability checks open. One email, nothing else."
  - Sent: "Check your inbox to confirm."
  - Invalid: "Enter an email address like name@example.com."
  - Limited: "Too many sign-ups from this connection. Try again later."
  - Allowance spent: "We can't send more confirmation emails today. Try again after 05:30 IST."
  - Error: "That didn't go through. Try again."
  - Confirm page — headline "Confirm your subscription"; lead (Before only) "Opening this link changed nothing. Press Confirm and the list is yours."; button "Confirm"; after "You're subscribed. Every email has a one-click unsubscribe."; already "You're already subscribed."; expired "This link has expired." with "Send a new link" and "A new link goes through the same checks as the first one."
  - Unsubscribe page — headline "Unsubscribe"; lead (Before only) "Opening this link changed nothing. Press Unsubscribe and it stops."; button "Unsubscribe"; after "You're unsubscribed. Sign-in emails and the alerts you set up aren't affected."; already "You're already unsubscribed."; **"Changed your mind?"** above a "Resubscribe" button (the owner's change at the B4 review, 2026-09-30 — the spec's old "Subscribed by mistake?" asked about the wrong press)
  - Invalid link: "That link isn't valid." with "Links break when an email client rewrites them. Open the one in your inbox again, or ask for a new one from the form you signed up on."
  - Both pages close with: "Checking a PNR never needs an account, and never needs an email address."
  - Promises — news, confirming: "News about Trakline: what has shipped, and what is being built."; availability, confirming: "One email, when availability checks open. Nothing else."; news, leaving: "You are unsubscribing from news about Trakline."; availability, leaving: "You are unsubscribing from the availability list."
  - "Tell us why (optional)" with four labels — "Too many emails", "Not relevant", "I didn't sign up", "Other" — which map to the API's values `too many`, `not relevant`, `did not sign up`, `other`. **The labels and the values differ; the map is Task 6's.**
- **Already built by PR 2, do not rebuild:** `POST /api/subscribe`, `POST /api/subscribe/confirm`, `POST /api/unsubscribe`; `peekRow`/`confirmRow`/`withdrawRow`/`rejoinRow` in `src/services/subscriptions/store.ts`; `tokenHash` in `src/services/subscriptions/subscribe.ts`; `verifyUnsubscribe`/`unsubscribeKey` in `src/services/subscriptions/links.ts`; `messages.subscribe.sent`, `.errors.*`, `.promise.*`, `.email.*`.

## File structure

| File | Responsibility |
|---|---|
| `src/messages/en-IN/subscribe.ts` (modify) | Every string this PR draws. PR 2 put the API's copy here; this adds the UI's. |
| `src/components/subscribe/signup-capture.tsx` (create) | The form: field, button, seven states, consent line. One component, three places, `place` prop. |
| `src/components/subscribe/use-signup.ts` (create) | The post and the state it returns. Split out so the form's test never touches `fetch` and this one never touches the DOM. |
| `src/components/shell/footer.tsx` (modify) | The "Updates by email" column in the full footer; the compact row above the line. |
| `src/app/(site)/pre-booking/pre-booking-form.tsx` (modify) | The capture under the result, after a search. |
| `src/app/(site)/subscribe/confirm/page.tsx` (create) | Server: reads the token, peeks, decides the state. |
| `src/app/(site)/subscribe/confirm/confirm-client.tsx` (create) | Client: the one button, and what it says afterwards. |
| `src/app/(site)/unsubscribe/page.tsx` (create) | Server: verifies the signature, decides the state. |
| `src/app/(site)/unsubscribe/unsubscribe-client.tsx` (create) | Client: Unsubscribe, then Resubscribe and the optional reason. |
| `src/components/subscribe/subscription-page.tsx` (create) | The shell both pages share: mark, headline, lead, plate, closing line. |

---

## Task 1: The UI copy

**Files:**
- Modify: `src/messages/en-IN/subscribe.ts`
- Test: `tests/unit/messages/subscribe.test.ts` (create)

**Interfaces:**
- Produces: `messages.subscribe.form`, `.places`, `.page`, on top of PR 2's `.sent`, `.errors`, `.promise`, `.email`.

- [ ] **Step 1: Write the failing test** at `tests/unit/messages/subscribe.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { messages } from "@/messages";

// The boards are the authority. These are the strings a reader sees, checked here so a typo in a
// component cannot quietly change what was approved.
const m = messages.subscribe;

describe("the sign-up copy", () => {
  it("says what the consent line says, and links the last two words", () => {
    expect(m.form.consent.text).toBe("One email to confirm. Unsubscribe in one click. We never sell your address. ");
    expect(m.form.consent.link).toBe("Privacy notice");
  });

  it("names the button per place, and while sending", () => {
    expect(m.form.subscribe).toBe("Subscribe");
    expect(m.form.notify).toBe("Notify me");
    expect(m.form.sending).toBe("Sending…");
  });

  it("carries each place's own words", () => {
    expect(m.places.footerColumn).toBe("Updates by email");
    expect(m.places.preBooking).toBe("Tell me once when availability checks open. One email, nothing else.");
  });

  it("asks about the right press after someone unsubscribes", () => {
    // The spec said "Subscribed by mistake?", which asks about the wrong one: whoever reads this
    // has just left. The owner changed it at the B4 review, 2026-09-30.
    expect(m.page.unsubscribe.changedMind).toBe("Changed your mind?");
  });

  it("maps every offered reason to a value the API accepts", () => {
    // The labels read as sentences; the database takes four fixed values. A map that drifted would
    // send a reason the route's enum refuses, and the traveller would see "didn't go through" for
    // a button that is meant to be optional.
    expect(m.page.unsubscribe.reasons.map((r) => r.value)).toEqual(["too many", "not relevant", "did not sign up", "other"]);
    expect(m.page.unsubscribe.reasons.map((r) => r.label)).toEqual(["Too many emails", "Not relevant", "I didn't sign up", "Other"]);
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/unit/messages/subscribe.test.ts`. Expected: FAIL, `Cannot read properties of undefined (reading 'consent')`.

- [ ] **Step 3: Implement.** Add to `src/messages/en-IN/subscribe.ts`, inside the existing `subscribe` object, after `email`:

```ts
  form: {
    label: "Email",
    placeholder: "you@example.com",
    subscribe: "Subscribe",
    notify: "Notify me",
    sending: "Sending…",
    /** Split so the last two words can be a link without a component assembling a sentence. */
    consent: { text: "One email to confirm. Unsubscribe in one click. We never sell your address. ", link: "Privacy notice" },
  },
  places: {
    footerColumn: "Updates by email",
    /** The plate's own heading under the pre-booking result — NOT `booking.availability.title`, which is the chart's "Availability". */
    preBookingTitle: "Availability checks",
    preBooking: "Tell me once when availability checks open. One email, nothing else.",
  },
  page: {
    closing: "Checking a PNR never needs an account, and never needs an email address.",
    confirm: {
      headline: "Confirm your subscription",
      lead: "Opening this link changed nothing. Press Confirm and the list is yours.",
      button: "Confirm",
      after: "You're subscribed. Every email has a one-click unsubscribe.",
      already: "You're already subscribed.",
      expired: "This link has expired.",
      sendAgain: "Send a new link",
      sendAgainNote: "A new link goes through the same checks as the first one.",
    },
    unsubscribe: {
      headline: "Unsubscribe",
      lead: "Opening this link changed nothing. Press Unsubscribe and it stops.",
      button: "Unsubscribe",
      after: "You're unsubscribed. Sign-in emails and the alerts you set up aren't affected.",
      already: "You're already unsubscribed.",
      changedMind: "Changed your mind?",
      resubscribe: "Resubscribe",
      whyLegend: "Tell us why (optional)",
      /** Label and value differ: the label reads as a sentence, the value is what the route's enum takes. */
      reasons: [
        { label: "Too many emails", value: "too many" },
        { label: "Not relevant", value: "not relevant" },
        { label: "I didn't sign up", value: "did not sign up" },
        { label: "Other", value: "other" },
      ],
    },
    invalid: {
      title: "That link isn't valid.",
      note: "Links break when an email client rewrites them. Open the one in your inbox again, or ask for a new one from the form you signed up on.",
    },
    /** The board draws the unsubscribe promises in the second person, because the reader is leaving. */
    leaving: { news: "You are unsubscribing from news about Trakline.", availability: "You are unsubscribing from the availability list." },
  },
```

- [ ] **Step 4: Run it.** `npx vitest run tests/unit/messages/subscribe.test.ts`. Expected: PASS.
- [ ] **Step 5: Run the whole gate.** `npm run check`. Expected: exit 0. The message tree is typed, so a shape mistake fails the typecheck rather than a test.
- [ ] **Step 6: Commit.**

```bash
git add src/messages/en-IN/subscribe.ts tests/unit/messages/subscribe.test.ts
git commit -m "feat(subscribe): the copy the B4 boards draw, with the reason labels mapped to the API's values"
```

---

## Task 2: The post, on its own

**Files:**
- Create: `src/components/subscribe/use-signup.ts`
- Test: `tests/unit/components/subscribe/use-signup.test.ts`

**Interfaces:**
- Consumes: `apiRequest` from `@/services/api-client`; `messages.subscribe`.
- Produces:
  - `type SignupState = "idle" | "sending" | "sent" | "invalid" | "limited" | "dailyLimit" | "error"`
  - `signUp(ask: { email: string; list: "news" | "availability"; source: "footer" | "landing" | "pre-booking" | "account" }, fetchImpl?: typeof fetch): Promise<SignupState>`

- [ ] **Step 1: Write the failing test** at `tests/unit/components/subscribe/use-signup.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { signUp } from "@/components/subscribe/use-signup";
import { messages } from "@/messages";

const m = messages.subscribe;
const ASK = { email: "asha@example.in", list: "news" as const, source: "footer" as const };

function respond(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
}

describe("signUp", () => {
  it("is sent when the route accepts it", async () => {
    expect(await signUp(ASK, respond(200, { ok: true, message: m.sent }))).toBe("sent");
  });

  it("tells the four refusals apart by their copy, not by their status", async () => {
    // `apiRequest` does not hand back the HTTP status, and 429 covers both the connection limit and
    // the day's allowance. The message is the only thing that distinguishes them, and it is a
    // shared constant rather than a string typed twice.
    expect(await signUp(ASK, respond(400, { ok: false, error: { message: m.errors.invalid } }))).toBe("invalid");
    expect(await signUp(ASK, respond(429, { ok: false, error: { message: m.errors.limited } }))).toBe("limited");
    expect(await signUp(ASK, respond(429, { ok: false, error: { message: m.errors.dailyLimit } }))).toBe("dailyLimit");
    expect(await signUp(ASK, respond(503, { ok: false, error: { message: m.errors.failed } }))).toBe("error");
  });

  it("is an error when the service cannot be reached at all", async () => {
    const dead = vi.fn(async () => Promise.reject(new Error("down"))) as unknown as typeof fetch;
    expect(await signUp(ASK, dead)).toBe("error");
  });

  it("sends the address trimmed and lowercased, so the route is never asked to guess", async () => {
    const fetcher = respond(200, { ok: true, message: m.sent });
    await signUp({ ...ASK, email: "  Asha@Example.IN " }, fetcher);
    const body = JSON.parse(String((vi.mocked(fetcher).mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.email).toBe("asha@example.in");
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/unit/components/subscribe/use-signup.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `src/components/subscribe/use-signup.ts`:

```ts
import { z } from "zod";
import { messages } from "@/messages";
import { apiRequest } from "@/services/api-client";

const m = messages.subscribe;

export type SignupState = "idle" | "sending" | "sent" | "invalid" | "limited" | "dailyLimit" | "error";

export interface SignupAsk {
  readonly email: string;
  readonly list: "news" | "availability";
  readonly source: "footer" | "landing" | "pre-booking" | "account";
}

const reply = z.object({ ok: z.literal(true), message: z.string() });

/**
 * One sign-up.
 *
 * The four refusals are told apart by their copy. `apiRequest` does not carry the HTTP status, and
 * 429 covers both the connection limit and the day's allowance — so the message is the only thing
 * that separates them. It is compared against the same constant the route throws, never a string
 * written out twice.
 */
export async function signUp(ask: SignupAsk, fetchImpl?: typeof fetch): Promise<SignupState> {
  const email = ask.email.trim().toLowerCase();
  const result = await apiRequest(
    "/api/subscribe",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...ask, email }) },
    reply,
    fetchImpl ? { fetchImpl } : {},
  );
  if (result.ok) return "sent";
  const said = result.error.message;
  if (said === m.errors.invalid) return "invalid";
  if (said === m.errors.limited) return "limited";
  if (said === m.errors.dailyLimit) return "dailyLimit";
  return "error";
}
```

- [ ] **Step 4: Run it.** `npx vitest run tests/unit/components/subscribe/use-signup.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add src/components/subscribe/use-signup.ts tests/unit/components/subscribe/use-signup.test.ts
git commit -m "feat(subscribe): the sign-up post, and the four refusals told apart by their copy"
```

---

## Task 3: The capture form

**Files:**
- Create: `src/components/subscribe/signup-capture.tsx`
- Test: `tests/unit/components/subscribe/signup-capture.test.tsx`

**Interfaces:**
- Consumes: `signUp`, `SignupState` from Task 2; `messages.subscribe`.
- Produces: `<SignupCapture place="footer-column" | "footer-row" | "pre-booking" list="news" | "availability" source={...} signUp?={...} />`. `signUp` is injected only by tests; it defaults to Task 2's.

- [ ] **Step 1: Write the failing test** at `tests/unit/components/subscribe/signup-capture.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SignupCapture } from "@/components/subscribe/signup-capture";
import { messages } from "@/messages";

const m = messages.subscribe;

function draw(over: Partial<React.ComponentProps<typeof SignupCapture>> = {}) {
  const signUp = vi.fn(async () => "sent" as const);
  render(<SignupCapture place="footer-column" list="news" source="footer" signUp={signUp} {...over} />);
  return signUp;
}

describe("the sign-up capture", () => {
  it("asks for an email and offers to subscribe", () => {
    draw();
    expect(screen.getByLabelText(m.form.label)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: m.form.subscribe })).toBeInTheDocument();
  });

  it("says Notify me under the pre-booking result, where the ask is different", () => {
    draw({ place: "pre-booking", list: "availability", source: "pre-booking" });
    expect(screen.getByRole("button", { name: m.form.notify })).toBeInTheDocument();
    expect(screen.getByText(m.places.preBooking)).toBeInTheDocument();
  });

  it("carries the consent line, with the privacy notice as a link", () => {
    draw();
    expect(screen.getByText(/We never sell your address/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: m.form.consent.link })).toHaveAttribute("href", "/privacy");
  });

  it("refuses an address that is not one without asking the server", async () => {
    const signUp = draw();
    await userEvent.type(screen.getByLabelText(m.form.label), "nope");
    await userEvent.click(screen.getByRole("button", { name: m.form.subscribe }));
    expect(await screen.findByText(m.errors.invalid)).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("replaces the form with the same sentence whatever the server knew", async () => {
    const signUp = draw();
    await userEvent.type(screen.getByLabelText(m.form.label), "asha@example.in");
    await userEvent.click(screen.getByRole("button", { name: m.form.subscribe }));
    expect(signUp).toHaveBeenCalledWith({ email: "asha@example.in", list: "news", source: "footer" });
    expect(await screen.findByText(m.sent)).toBeInTheDocument();
    expect(screen.queryByLabelText(m.form.label)).not.toBeInTheDocument();
  });

  it.each([
    ["limited", m.errors.limited],
    ["dailyLimit", m.errors.dailyLimit],
    ["error", m.errors.failed],
  ] as const)("keeps the form standing and says why when the answer is %s", async (state, copy) => {
    const signUp = draw({ signUp: vi.fn(async () => state) });
    await userEvent.type(screen.getByLabelText(m.form.label), "asha@example.in");
    await userEvent.click(screen.getByRole("button", { name: m.form.subscribe }));
    expect(await screen.findByText(copy)).toBeInTheDocument();
    expect(screen.getByLabelText(m.form.label)).toBeInTheDocument();
    expect(signUp).toHaveBeenCalledOnce();
  });

  it("marks the field only when the address is the traveller's own mistake", async () => {
    // The board's rule: too many, daily limit and error are the site's trouble, and flagging an
    // address somebody typed correctly would say otherwise. All four still describe the field.
    draw({ signUp: vi.fn(async () => "limited" as const) });
    await userEvent.type(screen.getByLabelText(m.form.label), "asha@example.in");
    await userEvent.click(screen.getByRole("button", { name: m.form.subscribe }));
    await screen.findByText(m.errors.limited);
    expect(screen.getByLabelText(m.form.label)).toHaveAttribute("aria-invalid", "false");
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/unit/components/subscribe/signup-capture.test.tsx`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `src/components/subscribe/signup-capture.tsx`. Transcribe the classes from `SignupCapture.dc.html` — the field is `well h-11 min-h-9 w-full px-2.5 py-1.5 placeholder:text-ink-3`, the message is `mt-0.5 text-label leading-normal text-accent-soft-ink`, and the primary button's long class string is in the board. Three `place` values lay the same parts out differently: `footer-column` stacks them, `footer-row` and `pre-booking` put the field and button on one row with the message below it. Mark the file `"use client"`.

```tsx
"use client";

import { useId, useState } from "react";
import { z } from "zod";
import { messages } from "@/messages";
import { signUp as postSignUp, type SignupAsk, type SignupState } from "./use-signup";

const m = messages.subscribe;
const EMAIL = z.email().max(254);

export type CapturePlace = "footer-column" | "footer-row" | "pre-booking";

/** Which refusals put a message under the field and leave the form standing. */
const MESSAGE: Partial<Record<SignupState, string>> = {
  invalid: m.errors.invalid,
  limited: m.errors.limited,
  dailyLimit: m.errors.dailyLimit,
  error: m.errors.failed,
};

export function SignupCapture({
  place,
  list,
  source,
  signUp = postSignUp,
}: {
  readonly place: CapturePlace;
  readonly list: SignupAsk["list"];
  readonly source: SignupAsk["source"];
  readonly signUp?: (ask: SignupAsk) => Promise<SignupState>;
}) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<SignupState>("idle");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (state === "sending") return;
    const trimmed = email.trim().toLowerCase();
    // Checked here as well as on the route: an address that is not one should not cost a request,
    // and the route's own check is what actually protects the database.
    if (!EMAIL.safeParse(trimmed).success) {
      setState("invalid");
      return;
    }
    setState("sending");
    setState(await signUp({ email: trimmed, list, source }));
  }

  const message = MESSAGE[state];
  // Only `invalid` is the address's own fault; the rest are the site's.
  const mine = state === "invalid";
  const label = state === "sending" ? m.form.sending : place === "pre-booking" ? m.form.notify : m.form.subscribe;

  return (
    /* … the board's markup, with `place` choosing the wrapper classes … */
  );
}
```

  Two rules the board settles, and the tests above hold:
  - **The message is a sibling of the field's row, not of the field.** Inside the row it stretched the field's column and left the button beside a three-line sentence at 390px.
  - **`sent` replaces the form** with `<p role="status">{m.sent}</p>`; the consent line stays.

- [ ] **Step 4: Run it.** `npx vitest run tests/unit/components/subscribe/signup-capture.test.tsx`. Expected: PASS.
- [ ] **Step 5: Run the privacy and boundary contracts.** `npx vitest run tests/unit/privacy tests/unit/console/boundary.contract.test.ts`. Expected: PASS.
- [ ] **Step 6: Commit.**

```bash
git add src/components/subscribe/signup-capture.tsx tests/unit/components/subscribe/signup-capture.test.tsx
git commit -m "feat(subscribe): the capture form, one component for the three places the sheet draws"
```

---

## Task 4: The two footers

**Files:**
- Modify: `src/components/shell/footer.tsx`
- Test: `tests/unit/components/shell/footer.test.tsx` (create if absent)

**Interfaces:**
- Consumes: `<SignupCapture>` from Task 3.

- [ ] **Step 1: Write the failing test** at `tests/unit/components/shell/footer.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { messages } from "@/messages";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { Footer } from "@/components/shell/footer";

const m = messages.subscribe;

describe("the footer's sign-up", () => {
  it("gives the landing an Updates by email column", () => {
    render(<Footer />);
    expect(screen.getByText(m.places.footerColumn)).toBeInTheDocument();
    expect(screen.getByLabelText(m.form.label)).toBeInTheDocument();
  });

  it("keeps the disclaimer, the status line and the clock, which the row must never push out", () => {
    render(<Footer />);
    expect(screen.getByText(/Not affiliated with IRCTC/)).toBeInTheDocument();
    expect(screen.getByText(messages.service.overall.operational)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /IST/ })).toBeInTheDocument();
  });
});
```

  Then the same file with `usePathname: () => "/pnr"`, for the compact footer — a second `vi.mock` is not possible in one file, so put the compact case in `tests/unit/components/shell/footer-compact.test.tsx` with its own mock, asserting the field is there and the disclaimer and clock survive it.

- [ ] **Step 2: Run it.** `npx vitest run tests/unit/components/shell/footer.test.tsx`. Expected: FAIL, "Unable to find an element with the text: Updates by email".

- [ ] **Step 3: Implement.** In `FullFooter`, after the Company column, add a fifth column sized like the brand column — `max-w-[30rem] flex-[1.4_1_240px]`, because a 130px link column cannot hold a field and a button, and both widths are ones the footer already uses:

```tsx
        <div className="max-w-[30rem] flex-[1.4_1_240px]">
          <p className={COLUMN_HEAD}>{messages.subscribe.places.footerColumn}</p>
          <SignupCapture place="footer-column" list="news" source="landing" />
        </div>
```

  In `CompactFooter`, put the capture in a row **above** the existing line, with the disclaimer and clock in a row beneath a hairline. Both the form and the consent line carry `min-w-[240px]`: `flex-1` alone sets a basis of zero, and at 390px the form collapsed to 3px beside the consent sentence instead of dropping below it.

  **The two sources differ, and the difference is the record.** The full footer is the landing, so `source="landing"`; the compact footer is every other page, so `source="footer"`. `subscriptions.people.first_source` stores it, and 06-B's Leads list is what reads it — a column that said "footer" for the landing would be answering the wrong question.

- [ ] **Step 4: Run it.** `npx vitest run tests/unit/components/shell/footer.test.tsx`. Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add src/components/shell/footer.tsx tests/unit/components/shell/footer.test.tsx
git commit -m "feat(subscribe): the landing footer's column and the app pages' compact row"
```

---

## Task 5: Under the pre-booking result

**Files:**
- Modify: `src/app/(site)/pre-booking/pre-booking-form.tsx`
- Test: `tests/unit/components/pre-booking/pre-booking-form.test.tsx` (extend the existing file)

**Interfaces:**
- Consumes: `<SignupCapture>` from Task 3.

- [ ] **Step 1: Write the failing test.** Add to the existing pre-booking form test:

```tsx
  it("offers the availability list under the result, and only after a search", async () => {
    // Before a search there is nothing to be notified about, and a form with no context reads as a
    // newsletter box on a page nobody asked for one on.
    const { rerender } = render(<PreBookingForm />);
    expect(screen.queryByText(messages.subscribe.places.preBooking)).not.toBeInTheDocument();
    await search(rerender);
    expect(screen.getByText(messages.subscribe.places.preBooking)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.subscribe.form.notify })).toBeInTheDocument();
  });
```

  Use whatever helper that file already has for driving a search; if it has none, drive the form the way its neighbouring tests do.

- [ ] **Step 2: Run it.** `npx vitest run tests/unit/components/pre-booking/pre-booking-form.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.** Render the capture in its own plate below the result, only when a search has answered:

```tsx
{answered ? (
  <section className="blueprint mt-[28px]">
    <Corners />
    <div className="flex flex-wrap items-stretch border-b border-line">
      <h2 className="font-display text-label font-semibold uppercase leading-6 tracking-caps text-pretty min-w-[14ch] flex-1 px-5 py-2.5 max-sm:basis-full">
        {messages.subscribe.places.preBookingTitle}
      </h2>
    </div>
    <div className="p-5">
      <p className="m-0 max-w-[60ch] text-sm text-ink-1/78">{messages.subscribe.places.preBooking}</p>
      <SignupCapture place="pre-booking" list="availability" source="pre-booking" />
    </div>
  </section>
) : null}
```

- [ ] **Step 4: Run it.** `npx vitest run tests/unit/components/pre-booking`. Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add "src/app/(site)/pre-booking/pre-booking-form.tsx" tests/unit/components/pre-booking/pre-booking-form.test.tsx
git commit -m "feat(subscribe): the availability list, offered under a pre-booking result"
```

---

## Task 6: The shared page shell

**Files:**
- Create: `src/components/subscribe/subscription-page.tsx`
- Test: `tests/unit/components/subscribe/subscription-page.test.tsx`

**Interfaces:**
- Produces: `<SubscriptionPage headline lead? children />` — the mark, the 520px column, the plate, the closing line. A server component; no `"use client"`.

- [ ] **Step 1: Write the failing test:**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SubscriptionPage } from "@/components/subscribe/subscription-page";
import { messages } from "@/messages";

describe("the subscription page shell", () => {
  it("draws the headline, the lead and the closing line", () => {
    render(
      <SubscriptionPage headline="Confirm your subscription" lead="Opening this link changed nothing.">
        <p>body</p>
      </SubscriptionPage>,
    );
    expect(screen.getByRole("heading", { name: "Confirm your subscription" })).toBeInTheDocument();
    expect(screen.getByText("Opening this link changed nothing.")).toBeInTheDocument();
    expect(screen.getByText(messages.subscribe.page.closing)).toBeInTheDocument();
  });

  it("draws no lead when there is none, so a finished page does not still give instructions", () => {
    // The board's rule: the lead belongs to the state before the press. Left standing it told a
    // reader who had just unsubscribed to press Unsubscribe.
    render(
      <SubscriptionPage headline="Unsubscribe">
        <p>body</p>
      </SubscriptionPage>,
    );
    expect(screen.queryByText(/Opening this link/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it.** Expected: FAIL, module not found.
- [ ] **Step 3: Implement**, transcribing the board's shell: the 40px mark, `<h1 className="optical-hang mt-6 text-signin tracking-display">`, the optional lead at `mt-3 text-base text-ink-1/78`, a `blueprint mt-8` plate with `<Corners />` and `p-6`, then the closing line at `mt-6 text-sm text-ink-1/74`, all inside `<section className="mx-auto w-full max-w-[520px] px-6 pb-20 pt-[clamp(40px,7vw,80px)]">`.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add src/components/subscribe/subscription-page.tsx tests/unit/components/subscribe/subscription-page.test.tsx
git commit -m "feat(subscribe): the shell both subscription pages draw"
```

---

## Task 7: `/subscribe/confirm`

**Files:**
- Create: `src/app/(site)/subscribe/confirm/page.tsx`, `src/app/(site)/subscribe/confirm/confirm-client.tsx`
- Test: `tests/integration/pages/subscribe-confirm.test.tsx`

**Interfaces:**
- Consumes: `peekRow` from `@/services/subscriptions/store`; `tokenHash` from `@/services/subscriptions/subscribe`; `<SubscriptionPage>` from Task 6.
- Produces: a page that renders one of `before | already | expired | invalid`, and a client button that POSTs to `/api/subscribe/confirm`.

- [ ] **Step 1: Write the failing test** at `tests/integration/pages/subscribe-confirm.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { peekRow } = vi.hoisted(() => ({ peekRow: vi.fn(async () => ({ state: "confirmed", list: "news" })) }));
vi.mock("@/services/subscriptions/store", () => ({ peekRow }));

import ConfirmPage from "@/app/(site)/subscribe/confirm/page";
import { messages } from "@/messages";

const m = messages.subscribe.page;

beforeEach(() => peekRow.mockClear());

async function draw(token?: string) {
  render(await ConfirmPage({ searchParams: Promise.resolve(token === undefined ? {} : { token }) }));
}

describe("/subscribe/confirm", () => {
  it("shows the list's promise and a Confirm button, and changes nothing", async () => {
    await draw("A".repeat(43));
    expect(screen.getByRole("heading", { name: m.confirm.headline })).toBeInTheDocument();
    expect(screen.getByText(messages.subscribe.promise.news)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: m.confirm.button })).toBeInTheDocument();
    // Opening the link must not confirm: mail clients and scanners follow links.
    expect(peekRow).toHaveBeenCalledOnce();
  });

  it("says so when the link has already been used", async () => {
    peekRow.mockResolvedValueOnce({ state: "already", list: "news" });
    await draw("A".repeat(43));
    expect(screen.getByText(m.confirm.already)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: m.confirm.button })).not.toBeInTheDocument();
  });

  it("offers a new link when the old one has expired", async () => {
    peekRow.mockResolvedValueOnce({ state: "expired", list: "news" });
    await draw("A".repeat(43));
    expect(screen.getByText(m.confirm.expired)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: m.confirm.sendAgain })).toBeInTheDocument();
  });

  it("calls the database not at all for a token that is not one", async () => {
    await draw("nope");
    expect(screen.getByText(m.invalid.title)).toBeInTheDocument();
    expect(peekRow).not.toHaveBeenCalled();
  });

  it("is an invalid link with no token at all", async () => {
    await draw();
    expect(screen.getByText(m.invalid.title)).toBeInTheDocument();
    expect(peekRow).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/integration/pages/subscribe-confirm.test.tsx`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `page.tsx` as a server component:

```tsx
import type { Metadata } from "next";
import { z } from "zod";
import { SubscriptionPage } from "@/components/subscribe/subscription-page";
import { messages } from "@/messages";
import { peekRow } from "@/services/subscriptions/store";
import { tokenHash } from "@/services/subscriptions/subscribe";
import { ConfirmClient } from "./confirm-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: messages.subscribe.page.confirm.headline, robots: { index: false } };

const TOKEN = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).token;
  const token = TOKEN.safeParse(typeof raw === "string" ? raw : "");
  // A token that is not one never reaches the database: the shape is checked here, and an unknown
  // hash is the database's "invalid" anyway.
  const state = token.success ? await peekRow(tokenHash(token.data)) : { state: "invalid" as const, list: null };
  /* … draw the state the board draws, and pass `token.data` to <ConfirmClient> for the Before case … */
}
```

  `confirm-client.tsx` is `"use client"`: one button that POSTs `{ token }` to `/api/subscribe/confirm` through `apiRequest`, then shows `m.confirm.after` on `state: "confirmed"`, `m.confirm.already` on `"already"`, and `messages.subscribe.errors.failed` otherwise. The expired state's "Send a new link" posts to `/api/subscribe` through Task 2's `signUp`, so it goes through the same limits.

  **`robots: { index: false }`** on both pages: a confirm link is one person's, and a search engine has no business holding it.

- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add "src/app/(site)/subscribe" tests/integration/pages/subscribe-confirm.test.tsx
git commit -m "feat(subscribe): /subscribe/confirm, which changes nothing until the button is pressed"
```

---

## Task 8: `/unsubscribe`

**Files:**
- Create: `src/app/(site)/unsubscribe/page.tsx`, `src/app/(site)/unsubscribe/unsubscribe-client.tsx`
- Test: `tests/integration/pages/unsubscribe.test.tsx`

**Interfaces:**
- Consumes: `verifyUnsubscribe`, `unsubscribeKey` from `@/services/subscriptions/links`; `<SubscriptionPage>` from Task 6; `messages.subscribe.page.unsubscribe`.

- [ ] **Step 1: Write the failing test** at `tests/integration/pages/unsubscribe.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import UnsubscribePage from "@/app/(site)/unsubscribe/page";
import { messages } from "@/messages";
import { signUnsubscribe, unsubscribeKey } from "@/services/subscriptions/links";

const m = messages.subscribe.page;
const PERSON = "8a1f2c3d-0000-4000-8000-000000000001";
const sig = () => signUnsubscribe(unsubscribeKey(), PERSON, "news");

async function draw(params: Record<string, string>) {
  render(await UnsubscribePage({ searchParams: Promise.resolve(params) }));
}

describe("/unsubscribe", () => {
  it("shows what is being left and an Unsubscribe button", async () => {
    await draw({ p: PERSON, l: "news", s: sig() });
    expect(screen.getByRole("heading", { name: m.unsubscribe.headline })).toBeInTheDocument();
    expect(screen.getByText(m.leaving.news)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: m.unsubscribe.button })).toBeInTheDocument();
  });

  it("refuses a signature that does not verify, and offers no button", async () => {
    await draw({ p: PERSON, l: "news", s: "B".repeat(43) });
    expect(screen.getByText(m.invalid.title)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: m.unsubscribe.button })).not.toBeInTheDocument();
  });

  it("refuses a signature made for the other list", async () => {
    // The list is inside the signature, so a link for one list cannot be edited into the other.
    await draw({ p: PERSON, l: "availability", s: sig() });
    expect(screen.getByText(m.invalid.title)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it.** Expected: FAIL, module not found.

- [ ] **Step 3: Implement.** The page verifies `p`, `l`, `s` and draws either the Before state or the invalid link. `unsubscribe-client.tsx` (`"use client"`) holds the three actions, all POSTing to `/api/unsubscribe`:
  - `action: "unsubscribe"` → on `done` or `already`, show `m.unsubscribe.after` or `m.unsubscribe.already`, then `m.unsubscribe.changedMind` above a `Resubscribe` button, then the optional `Tell us why` fieldset.
  - `action: "resubscribe"` → on `done`, `messages.subscribe.sent` is wrong here; show `m.confirm.after`.
  - `action: "reason"` with `reason: <value>` from the map in Task 1 — **the value, never the label**.

  The reasons are offered **after** the primary button and are never required: nothing here may look like a condition of leaving.

  Any action whose reply is not `ok` shows `messages.subscribe.errors.failed` and leaves the button standing, which is the board's Error state. The same on `/subscribe/confirm`.

  **Neither page renders a footer of its own.** Both live under `(site)`, and `FooterSwitch` gives every path but `/` the compact one — which is what the board draws.

- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add "src/app/(site)/unsubscribe" tests/integration/pages/unsubscribe.test.tsx
git commit -m "feat(subscribe): /unsubscribe, where the signed link is the permission"
```

---

## Task 9: The two pages join the sweeps

**Files:**
- Modify: `tests/e2e/responsive.spec.ts` (the `ROUTES` list), `tests/e2e/pages.spec.ts`, `tests/e2e/axe.spec.ts` if it carries its own list

- [ ] **Step 1: Add the routes.** Both pages need a signature or token to render their Before state, so add them with one:

```ts
const SUB = "?p=8a1f2c3d-0000-4000-8000-000000000001&l=news&s=";
const ROUTES = [..., "/subscribe/confirm", `/unsubscribe${SUB}`] as const;
```

  `/subscribe/confirm` with no token draws the invalid-link state, which is a real page worth measuring; `/unsubscribe` with an unverifiable signature draws the same. **Neither needs a valid one to be laid out**, and a spec that minted one would need the server's key.

- [ ] **Step 2: Run** `E2E_PORT=4260 npx playwright test tests/e2e/responsive.spec.ts tests/e2e/axe.spec.ts tests/e2e/pages.spec.ts`. Expected: PASS at 320, 360, 390 and 768.
- [ ] **Step 3:** If a width fails, fix the page, not the test. The footer row is the likely one: at 320px the field, the button and the consent line all want the same space.
- [ ] **Step 4: Commit.**

```bash
git add tests/e2e
git commit -m "test(subscribe): the two pages join the phone, axe and route sweeps"
```

---

## Task 10: A traveller signs up, end to end

**Files:**
- Create: `tests/e2e/subscribe.spec.ts`

- [ ] **Step 1: Write the spec.** The traveller config uses the fixture source and blanks Supabase, so the route's database call fails and the form shows the error copy — which is itself worth pinning, but not the launch test. Route the API instead, so this measures the FORM:

```ts
import { expect, test } from "./fixtures";
import { gotoReady } from "./helpers";

test("the footer takes an address and says to check the inbox", async ({ page }) => {
  await page.route("**/api/subscribe", (route) => route.fulfill({ status: 200, json: { ok: true, message: "Check your inbox to confirm." } }));
  await gotoReady(page, "/");
  const form = page.getByRole("contentinfo");
  await form.getByLabel("Email").fill("asha@example.in");
  await form.getByRole("button", { name: "Subscribe" }).click();
  await expect(form.getByText("Check your inbox to confirm.")).toBeVisible();
});

test("a refused sign-up leaves the form standing and says why", async ({ page }) => {
  await page.route("**/api/subscribe", (route) =>
    route.fulfill({ status: 429, json: { ok: false, error: { code: "RATE_LIMITED", message: "Too many sign-ups from this connection. Try again later." } } }),
  );
  await gotoReady(page, "/");
  const form = page.getByRole("contentinfo");
  await form.getByLabel("Email").fill("asha@example.in");
  await form.getByRole("button", { name: "Subscribe" }).click();
  await expect(form.getByText("Too many sign-ups from this connection. Try again later.")).toBeVisible();
  await expect(form.getByLabel("Email")).toBeVisible();
});
```

- [ ] **Step 2: Run** `E2E_PORT=4260 npx playwright test tests/e2e/subscribe.spec.ts`. Expected: PASS on both projects.
- [ ] **Step 3: Commit.**

```bash
git add tests/e2e/subscribe.spec.ts
git commit -m "test(subscribe): the footer form, sent and refused"
```

---

## Task 11: Gate and PR

- [ ] **Step 1:** `npm run check`. Expected: exit 0.
- [ ] **Step 2:** `npm run db:test`. Expected: PASS. Nothing here touches SQL, but the suite is cheap and the rule is the whole gate.
- [ ] **Step 3:** Rebase onto `origin/main` and run `npm run check` again on the rebased tree.
- [ ] **Step 4:** Push and open the PR into `main`. The description leads with **"This is the launch: when this merges, a traveller can sign up."** and names the owner's one action from the spec's §8 — **confirm production's sign-in mailer**: if production's Supabase sign-in mail goes through Resend rather than Supabase's own, it takes from the same 100-a-day allowance, and §4 says it must then be counted. End with the Claude Code line, and no `Co-Authored-By` trailer.
- [ ] **Step 5:** Call `mcp__ccd_pr__get_status`. Offer Auto-fix. **Never merge without the owner.**

---

## Already done, do not redo

**Privacy notice v1.1** is spec §5's last bullet and shipped in PR 2 (`83c7492`): the "Email updates" section is on `/privacy`, and the page draws `Version 1.1` beside the date. Nothing in this plan touches it.

## What this plan does not do

- **The landing's closing "News about Trakline" plate.** Deferred by spec decision 6 to the journey track, which owns that page.
- **Module 06 Leads** — the console's view of these subscribers (sub-projects B, C, D).
- **07 Announcements**, which sends to these lists and adds suppression from bounces.
- **A second locale.** The message tree is shaped for one; nothing here assumes only one.
