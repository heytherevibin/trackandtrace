import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { peekRow } = vi.hoisted(() => ({ peekRow: vi.fn(async (): Promise<{ state: string; list: string | null }> => ({ state: "confirmed", list: "news" })) }));
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
    // The peek's "confirmed" means confirmable, not confirmed: nothing has been pressed yet.
    expect(screen.queryByText(m.confirm.after)).not.toBeInTheDocument();
    expect(screen.queryByText(m.confirm.already)).not.toBeInTheDocument();
    expect(screen.getByText(m.confirm.lead)).toBeInTheDocument();
    // Opening the link must not confirm: mail clients and scanners follow links.
    expect(peekRow).toHaveBeenCalledOnce();
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
