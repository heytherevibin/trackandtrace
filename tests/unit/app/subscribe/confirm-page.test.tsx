import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { peekRow } = vi.hoisted(() => ({ peekRow: vi.fn(async (): Promise<{ state: string; list: string | null }> => ({ state: "confirmed", list: "news" })) }));
vi.mock("@/services/subscriptions/store", () => ({ peekRow }));

import ConfirmPage, { dynamic, metadata } from "@/app/(site)/subscribe/confirm/page";
import { messages } from "@/messages";

const m = messages.subscribe.page;

beforeEach(() => peekRow.mockClear());
afterEach(() => vi.unstubAllGlobals());

async function draw(token?: string) {
  render(await ConfirmPage({ searchParams: Promise.resolve(token === undefined ? {} : { token }) }));
}

describe("/subscribe/confirm", () => {
  it("shows the list's promise and a Confirm button, and changes nothing", async () => {
    await draw("A".repeat(43));
    expect(screen.getByRole("heading", { name: m.confirm.headline })).toBeInTheDocument();
    expect(screen.getByText(messages.subscribe.promise.news)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: m.confirm.button })).toBeInTheDocument();
    // The peek's "confirmed" means confirmable, not confirmed: nothing has been pressed yet.
    expect(screen.queryByText(m.confirm.after)).not.toBeInTheDocument();
    expect(screen.queryByText(m.confirm.already)).not.toBeInTheDocument();
    expect(screen.getByText(m.confirm.lead)).toBeInTheDocument();
    // Opening the link must not confirm: mail clients and scanners follow links.
    expect(peekRow).toHaveBeenCalledOnce();
  });

  it("is never indexed and never cached: a confirm link belongs to one person", () => {
    expect(metadata.robots).toEqual({ index: false });
    expect(metadata.title).toBe(m.confirm.headline);
    expect(dynamic).toBe("force-dynamic");
  });

  it("draws the availability list's own promise", async () => {
    peekRow.mockResolvedValueOnce({ state: "confirmed", list: "availability" });
    await draw("A".repeat(43));
    expect(screen.getByText(messages.subscribe.promise.availability)).toBeInTheDocument();
    expect(screen.queryByText(messages.subscribe.promise.news)).not.toBeInTheDocument();
  });

  it("says so when the link has already been used", async () => {
    peekRow.mockResolvedValueOnce({ state: "already", list: "news" });
    await draw("A".repeat(43));
    expect(screen.getByText(m.confirm.already)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: m.confirm.button })).not.toBeInTheDocument();
    expect(screen.queryByText(m.confirm.lead)).not.toBeInTheDocument();
  });

  it("offers a new link when the old one has expired", async () => {
    peekRow.mockResolvedValueOnce({ state: "expired", list: "news" });
    await draw("A".repeat(43));
    expect(screen.getByText(m.confirm.expired)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: m.confirm.sendAgain })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: m.confirm.button })).not.toBeInTheDocument();
  });

  it("is an invalid link when the database has never heard of the token", async () => {
    peekRow.mockResolvedValueOnce({ state: "invalid", list: null });
    await draw("A".repeat(43));
    expect(screen.getByText(m.invalid.title)).toBeInTheDocument();
    expect(screen.getByText(m.invalid.note)).toBeInTheDocument();
  });

  it("asks the new link for the list the old one was for", async () => {
    peekRow.mockResolvedValueOnce({ state: "expired", list: "availability" });
    const fetchMock = vi.fn(async () => Response.json({ ok: true, message: "ok" }));
    vi.stubGlobal("fetch", fetchMock);
    await draw("A".repeat(43));
    await userEvent.type(screen.getByLabelText(messages.subscribe.form.label), "ada@example.com");
    await userEvent.click(screen.getByRole("button", { name: m.confirm.sendAgain }));
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ list: "availability" });
  });

  it.each([
    ["one that is not one", "nope"],
    ["one character too long", "A".repeat(44)],
    ["one character too short", "A".repeat(42)],
    ["one with a character outside the alphabet", `${"A".repeat(42)}+`],
    ["two of them", ["A".repeat(43), "B".repeat(43)]],
  ])("calls the database not at all for a token that is %s", async (_why, token) => {
    render(await ConfirmPage({ searchParams: Promise.resolve({ token }) }));
    expect(screen.getByText(m.invalid.title)).toBeInTheDocument();
    expect(peekRow).not.toHaveBeenCalled();
  });

  it("is an invalid link with no token at all", async () => {
    await draw();
    expect(screen.getByText(m.invalid.title)).toBeInTheDocument();
    expect(peekRow).not.toHaveBeenCalled();
  });
});
