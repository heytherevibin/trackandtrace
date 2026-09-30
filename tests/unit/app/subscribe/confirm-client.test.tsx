import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmClient } from "@/app/(site)/subscribe/confirm/confirm-client";
import { messages } from "@/messages";

const m = messages.subscribe.page.confirm;
const TOKEN = "A".repeat(43);

function answer(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => Response.json(body, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("the confirm page's client", () => {
  it("posts the token only when the button is pressed, and then says the person is subscribed", async () => {
    const fetchMock = answer(200, { ok: true, state: "confirmed", list: "news" });
    render(<ConfirmClient view="before" headline={m.headline} lead={m.lead} token={TOKEN} promise={messages.subscribe.promise.news} />);
    expect(fetchMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: m.button }));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/subscribe/confirm");
    expect(JSON.parse(String(init.body))).toEqual({ token: TOKEN });
    expect(await screen.findByText(m.after)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: m.button })).not.toBeInTheDocument();
  });

  it("draws the lead before the press and takes it away once the press has confirmed", async () => {
    answer(200, { ok: true, state: "confirmed", list: "news" });
    render(<ConfirmClient view="before" headline={m.headline} lead={m.lead} token={TOKEN} promise={messages.subscribe.promise.news} />);
    expect(screen.getByText(m.lead)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: m.button }));
    expect(await screen.findByText(m.after)).toBeInTheDocument();
    // "Press Confirm and the list is yours" above "You're subscribed" would contradict itself.
    expect(screen.queryByText(m.lead)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: m.headline })).toBeInTheDocument();
  });

  it("takes the lead away after an already, too", async () => {
    answer(200, { ok: true, state: "already", list: "news" });
    render(<ConfirmClient view="before" headline={m.headline} lead={m.lead} token={TOKEN} promise={messages.subscribe.promise.news} />);
    await userEvent.click(screen.getByRole("button", { name: m.button }));
    expect(await screen.findByText(m.already)).toBeInTheDocument();
    expect(screen.queryByText(m.lead)).not.toBeInTheDocument();
  });

  it("keeps the lead when the press fails, because nothing has changed", async () => {
    answer(500, { ok: false, code: "SOURCE_UNAVAILABLE", message: messages.subscribe.errors.failed });
    render(<ConfirmClient view="before" headline={m.headline} lead={m.lead} token={TOKEN} promise={messages.subscribe.promise.news} />);
    await userEvent.click(screen.getByRole("button", { name: m.button }));
    expect(await screen.findByText(messages.subscribe.errors.failed)).toBeInTheDocument();
    expect(screen.getByText(m.lead)).toBeInTheDocument();
  });

  it("says already subscribed when the press finds the link used", async () => {
    answer(200, { ok: true, state: "already", list: "news" });
    render(<ConfirmClient view="before" headline={m.headline} lead={m.lead} token={TOKEN} promise={messages.subscribe.promise.news} />);
    await userEvent.click(screen.getByRole("button", { name: m.button }));
    expect(await screen.findByText(m.already)).toBeInTheDocument();
    expect(screen.queryByText(m.after)).not.toBeInTheDocument();
  });

  it("says it didn't go through, and keeps the button, when the route fails", async () => {
    answer(500, { ok: false, code: "SOURCE_UNAVAILABLE", message: messages.subscribe.errors.failed });
    render(<ConfirmClient view="before" headline={m.headline} lead={m.lead} token={TOKEN} promise={messages.subscribe.promise.news} />);
    await userEvent.click(screen.getByRole("button", { name: m.button }));
    expect(await screen.findByText(messages.subscribe.errors.failed)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: m.button })).toBeInTheDocument();
  });

  it("does not treat an unexpected state as a confirmation", async () => {
    answer(200, { ok: true, state: "expired", list: "news" });
    render(<ConfirmClient view="before" headline={m.headline} lead={m.lead} token={TOKEN} promise={messages.subscribe.promise.news} />);
    await userEvent.click(screen.getByRole("button", { name: m.button }));
    expect(await screen.findByText(messages.subscribe.errors.failed)).toBeInTheDocument();
    expect(screen.queryByText(m.after)).not.toBeInTheDocument();
  });

  it("sends a new link for the same list through the sign-up route", async () => {
    const fetchMock = answer(200, { ok: true, message: "ok" });
    render(<ConfirmClient view="expired" headline={m.headline} list="availability" />);
    await userEvent.type(screen.getByLabelText(messages.subscribe.form.label), "Ada@Example.com");
    await userEvent.click(screen.getByRole("button", { name: m.sendAgain }));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/subscribe");
    expect(JSON.parse(String(init.body))).toEqual({ email: "ada@example.com", list: "availability", source: "footer" });
    expect(await screen.findByText(messages.subscribe.sent)).toBeInTheDocument();
  });

  it("does not post an address that is not one", async () => {
    const fetchMock = answer(200, { ok: true, message: "ok" });
    render(<ConfirmClient view="expired" headline={m.headline} list="news" />);
    await userEvent.type(screen.getByLabelText(messages.subscribe.form.label), "nope");
    await userEvent.click(screen.getByRole("button", { name: m.sendAgain }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await screen.findByText(messages.subscribe.errors.invalid)).toBeInTheDocument();
  });
});
