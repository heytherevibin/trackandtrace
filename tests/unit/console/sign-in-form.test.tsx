import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { SignInForm } = await import("@/app/console/login/sign-in-form");

function answer(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

function submit(email: string) {
  fireEvent.change(screen.getByLabelText("Console email"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
}

beforeEach(() => vi.useRealTimers());
afterEach(() => vi.unstubAllGlobals());

describe("Console Sign In", () => {
  it("opens on the email state, as drawn", () => {
    render(<SignInForm />);
    expect(screen.getByLabelText("Console email")).toHaveAttribute("placeholder", "name@example.com");
    expect(screen.getByText("The link works once and expires in 1 hour.")).toBeInTheDocument();
    expect(screen.getByText("Form TC-02")).toBeInTheDocument();
    // The phone sheet draws a plain .tb: the title stays on one row with "Form TC-02", never stacking.
    expect(screen.getByText("Email link")).not.toHaveClass("max-sm:basis-full");
  });

  it("refuses a malformed address before asking the server", async () => {
    const fetch = answer(200, { ok: true });
    vi.stubGlobal("fetch", fetch);
    render(<SignInForm />);
    submit("asha@example");
    expect(await screen.findByText("Enter an email address like name@example.com.")).toBeInTheDocument();
    expect(screen.getByLabelText("Console email")).toHaveAttribute("aria-invalid", "true");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("says the same thing for every address once sent, and counts down to Send it again from elapsed time, not renders", async () => {
    // Date faked alongside the timers: the countdown must read Date.now(), so a backgrounded tab
    // (a five-second jump, not five one-second ticks) still lands on the right number.
    // shouldAdvanceTime lets findByRole's own polling progress in real time; the manual
    // advanceTimersByTimeAsync jumps below simulate the backgrounded tab on top of that.
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.stubGlobal("fetch", answer(200, { ok: true }));
    try {
      render(<SignInForm />);
      submit("asha@example.com");
      expect(await screen.findByRole("heading", { name: "Check your inbox" })).toHaveFocus();
      expect(screen.getByText("If this address belongs to a console member, a sign-in link is on its way.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Send again in 60 s" })).toBeDisabled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(screen.getByRole("button", { name: "Send again in 55 s" })).toBeDisabled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(55_000);
      });
      expect(screen.getByRole("button", { name: "Send it again" })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("goes back to the email state with Use a different email", async () => {
    vi.stubGlobal("fetch", answer(200, { ok: true }));
    render(<SignInForm />);
    submit("asha@example.com");
    fireEvent.click(await screen.findByRole("button", { name: "Use a different email" }));
    await waitFor(() => expect(screen.getByLabelText("Console email")).toHaveFocus());
  });

  it("shows the console's own message for a network failure, and never marks the address invalid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    render(<SignInForm />);
    submit("asha@example.com");
    expect(await screen.findByText("The console could not be reached. Try again.")).toBeInTheDocument();
    expect(screen.getByLabelText("Console email")).not.toHaveAttribute("aria-invalid", "true");
  });

  it("still shows the drawn validation message when the server itself refuses the address", async () => {
    vi.stubGlobal("fetch", answer(400, { ok: false, code: "INVALID_INPUT", message: "Enter an email address like name@example.com." }));
    render(<SignInForm />);
    submit("asha@example.com");
    expect(await screen.findByText("Enter an email address like name@example.com.")).toBeInTheDocument();
    expect(screen.getByLabelText("Console email")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows too many and disables sending", async () => {
    vi.stubGlobal("fetch", answer(429, { ok: false, code: "RATE_LIMITED", message: "Too many sign-in requests. Try again in 10 minutes.", retryAfter: 540 }));
    render(<SignInForm />);
    submit("asha@example.com");
    expect(await screen.findByText("Too many sign-in requests. Try again in 10 minutes.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeDisabled();
    expect(screen.getByLabelText("Console email")).not.toHaveAttribute("aria-invalid", "true");
  });

  it("clears Too many once the address is edited, re-enabling the button", async () => {
    vi.stubGlobal("fetch", answer(429, { ok: false, code: "RATE_LIMITED", message: "Too many sign-in requests. Try again in 10 minutes.", retryAfter: 540 }));
    render(<SignInForm />);
    submit("asha@example.com");
    await screen.findByText("Too many sign-in requests. Try again in 10 minutes.");
    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Console email"), { target: { value: "asha2@example.com" } });

    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeEnabled();
    expect(screen.queryByText("Too many sign-in requests. Try again in 10 minutes.")).not.toBeInTheDocument();
  });

  it("focuses the email field when a failure returns the form to the email stage, but not on first render", async () => {
    vi.stubGlobal("fetch", answer(429, { ok: false, code: "RATE_LIMITED", message: "Too many sign-in requests. Try again in 10 minutes.", retryAfter: 540 }));
    render(<SignInForm />);
    expect(screen.getByLabelText("Console email")).not.toHaveFocus();

    submit("asha@example.com");

    await screen.findByText("Too many sign-in requests. Try again in 10 minutes.");
    expect(screen.getByLabelText("Console email")).toHaveFocus();
  });

  it("recovers once a hung request times out, with the console's own unreachable message", async () => {
    const originalAny = AbortSignal.any;
    // Force the manual fallback deterministically (see api-client.test.ts): this keeps the 8 s
    // deadline fake-timer-controllable regardless of which combination api-client picks natively.
    // @ts-expect-error -- test-only: simulate an environment without AbortSignal.any
    AbortSignal.any = undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
          }),
      ),
    );
    // Fake timers must be live before the submit schedules api-client's fallback timer, or that
    // timer is real and advancing the fake clock afterwards never touches it.
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    try {
      render(<SignInForm />);
      submit("asha@example.com");
      expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(8_000);
      });

      expect(screen.getByText("The console could not be reached. Try again.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeEnabled();
      expect(screen.getByLabelText("Console email")).not.toBeDisabled();
    } finally {
      vi.useRealTimers();
      AbortSignal.any = originalAny;
    }
  });

  it("shows Sending… while the request is out", async () => {
    let release: (value: Response) => void = () => undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => (release = resolve))));
    render(<SignInForm />);
    submit("asha@example.com");
    expect(await screen.findByRole("button", { name: "Sending…" })).toBeDisabled();
    // Every console drawing keeps the disabled well at full contrast; only .btn dims when disabled.
    const field = screen.getByLabelText("Console email");
    expect(field).toBeDisabled();
    expect(field).toHaveClass("disabled:opacity-100");
    expect(field).not.toHaveClass("disabled:opacity-45");
    await act(async () => release(new Response(JSON.stringify({ ok: true }), { status: 200 })));
  });
});
