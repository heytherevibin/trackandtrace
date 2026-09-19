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

  it("says the same thing for every address once sent, and counts down to Send it again", async () => {
    vi.stubGlobal("fetch", answer(200, { ok: true }));
    render(<SignInForm />);
    submit("asha@example.com");
    expect(await screen.findByRole("heading", { name: "Check your inbox" })).toHaveFocus();
    expect(screen.getByText("If this address belongs to a console member, a sign-in link is on its way.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send again in \d+ s/ })).toBeDisabled();
  });

  it("goes back to the email state with Use a different email", async () => {
    vi.stubGlobal("fetch", answer(200, { ok: true }));
    render(<SignInForm />);
    submit("asha@example.com");
    fireEvent.click(await screen.findByRole("button", { name: "Use a different email" }));
    await waitFor(() => expect(screen.getByLabelText("Console email")).toHaveFocus());
  });

  it("shows too many and disables sending", async () => {
    vi.stubGlobal("fetch", answer(429, { ok: false, code: "RATE_LIMITED", message: "Too many sign-in requests. Try again in 10 minutes.", retryAfter: 540 }));
    render(<SignInForm />);
    submit("asha@example.com");
    expect(await screen.findByText("Too many sign-in requests. Try again in 10 minutes.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeDisabled();
    expect(screen.getByLabelText("Console email")).not.toHaveAttribute("aria-invalid", "true");
  });

  it("shows Sending… while the request is out", async () => {
    let release: (value: Response) => void = () => undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => (release = resolve))));
    render(<SignInForm />);
    submit("asha@example.com");
    expect(await screen.findByRole("button", { name: "Sending…" })).toBeDisabled();
    await act(async () => release(new Response(JSON.stringify({ ok: true }), { status: 200 })));
  });
});
