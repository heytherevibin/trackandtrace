import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UnsubscribeClient } from "@/app/(site)/unsubscribe/unsubscribe-client";
import { messages } from "@/messages";

const m = messages.subscribe.page;
const PERSON = "8a1f2c3d-0000-4000-8000-000000000001";
const SIGNATURE = "A".repeat(43);

function answer(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => Response.json(body, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The body of the nth call, parsed. */
function posted(fetchMock: ReturnType<typeof answer>, call = 0): unknown {
  const [, init] = fetchMock.mock.calls[call] as unknown as [string, RequestInit];
  return JSON.parse(String(init.body));
}

function draw() {
  render(
    <UnsubscribeClient
      headline={m.unsubscribe.headline}
      lead={m.unsubscribe.lead}
      person={PERSON}
      list="news"
      signature={SIGNATURE}
      promise={m.leaving.news}
    />,
  );
}

const press = () => userEvent.click(screen.getByRole("button", { name: m.unsubscribe.button }));

afterEach(() => vi.unstubAllGlobals());

describe("the unsubscribe page's client", () => {
  it("posts nothing until the button is pressed, and then posts the signed link", async () => {
    const fetchMock = answer(200, { ok: true, state: "done" });
    draw();
    expect(fetchMock).not.toHaveBeenCalled();
    await press();
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe("/api/unsubscribe");
    expect(posted(fetchMock)).toEqual({ p: PERSON, l: "news", s: SIGNATURE, action: "unsubscribe" });
    expect(await screen.findByText(m.unsubscribe.after)).toBeInTheDocument();
  });

  it("draws the lead before the press and takes it away once the press has unsubscribed", async () => {
    answer(200, { ok: true, state: "done" });
    draw();
    expect(screen.getByText(m.unsubscribe.lead)).toBeInTheDocument();
    await press();
    expect(await screen.findByText(m.unsubscribe.after)).toBeInTheDocument();
    // "Press Unsubscribe and it stops" above "You're unsubscribed" would tell them to do it again.
    expect(screen.queryByText(m.unsubscribe.lead)).not.toBeInTheDocument();
    expect(screen.queryByText(m.leaving.news)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: m.unsubscribe.button })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: m.unsubscribe.headline })).toBeInTheDocument();
  });

  it("says already unsubscribed, without the lead, when the press finds the person already out", async () => {
    answer(200, { ok: true, state: "already" });
    draw();
    await press();
    expect(await screen.findByText(m.unsubscribe.already)).toBeInTheDocument();
    expect(screen.queryByText(m.unsubscribe.after)).not.toBeInTheDocument();
    expect(screen.queryByText(m.unsubscribe.lead)).not.toBeInTheDocument();
    // Both leave the person able to change their mind and say why.
    expect(screen.getByText(m.unsubscribe.changedMind)).toBeInTheDocument();
  });

  it("keeps the lead and the button when the press fails, because nothing has changed", async () => {
    answer(500, { ok: false, code: "SOURCE_UNAVAILABLE", message: messages.subscribe.errors.failed });
    draw();
    await press();
    expect(await screen.findByText(messages.subscribe.errors.failed)).toBeInTheDocument();
    expect(screen.getByText(m.unsubscribe.lead)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: m.unsubscribe.button })).toBeInTheDocument();
  });

  it("does not tell someone they are unsubscribed when the route found no subscription", async () => {
    answer(200, { ok: true, state: "unknown" });
    draw();
    await press();
    expect(await screen.findByText(messages.subscribe.errors.failed)).toBeInTheDocument();
    expect(screen.queryByText(m.unsubscribe.after)).not.toBeInTheDocument();
    expect(screen.queryByText(m.unsubscribe.already)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: m.unsubscribe.button })).toBeInTheDocument();
  });

  it("offers the reasons only after the person has left, and never as a condition", async () => {
    answer(200, { ok: true, state: "done" });
    draw();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    await press();
    await screen.findByText(m.unsubscribe.after);
    expect(screen.getByText(m.unsubscribe.whyLegend)).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(m.unsubscribe.reasons.length);
    for (const reason of m.unsubscribe.reasons) expect(screen.getByLabelText(reason.label)).toBeInTheDocument();
  });

  it("posts a reason's value, never its label", async () => {
    const fetchMock = answer(200, { ok: true, state: "done" });
    draw();
    await press();
    await screen.findByText(m.unsubscribe.after);
    // The label is a sentence; the route's enum would refuse it.
    await userEvent.click(screen.getByLabelText("I didn't sign up"));
    expect(posted(fetchMock, 1)).toEqual({ p: PERSON, l: "news", s: SIGNATURE, action: "reason", reason: "did not sign up" });
    expect(screen.getByLabelText("I didn't sign up")).toBeChecked();
  });

  it("says so when a reason does not go through, and leaves the person unsubscribed", async () => {
    answer(200, { ok: true, state: "done" });
    draw();
    await press();
    await screen.findByText(m.unsubscribe.after);
    answer(500, { ok: false, code: "SOURCE_UNAVAILABLE", message: messages.subscribe.errors.failed });
    await userEvent.click(screen.getByLabelText(m.unsubscribe.reasons[0]!.label));
    expect(await screen.findByText(messages.subscribe.errors.failed)).toBeInTheDocument();
    expect(screen.getByText(m.unsubscribe.after)).toBeInTheDocument();
  });

  it("resubscribes with the same signed link and says the person is subscribed, not that an email is coming", async () => {
    const fetchMock = answer(200, { ok: true, state: "done" });
    draw();
    await press();
    await screen.findByText(m.unsubscribe.after);
    await userEvent.click(screen.getByRole("button", { name: m.unsubscribe.resubscribe }));
    expect(posted(fetchMock, 1)).toEqual({ p: PERSON, l: "news", s: SIGNATURE, action: "resubscribe" });
    expect(await screen.findByText(m.confirm.after)).toBeInTheDocument();
    // A rejoin sends no confirmation email, so promising one would be false.
    expect(screen.queryByText(messages.subscribe.sent)).not.toBeInTheDocument();
    expect(screen.queryByText(m.unsubscribe.after)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: m.unsubscribe.resubscribe })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("keeps the Resubscribe button standing when it fails", async () => {
    answer(200, { ok: true, state: "done" });
    draw();
    await press();
    await screen.findByText(m.unsubscribe.after);
    answer(200, { ok: true, state: "unknown" });
    await userEvent.click(screen.getByRole("button", { name: m.unsubscribe.resubscribe }));
    expect(await screen.findByText(messages.subscribe.errors.failed)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: m.unsubscribe.resubscribe })).toBeInTheDocument();
    expect(screen.queryByText(m.confirm.after)).not.toBeInTheDocument();
  });
});
