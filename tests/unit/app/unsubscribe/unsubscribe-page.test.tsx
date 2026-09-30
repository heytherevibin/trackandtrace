import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import UnsubscribePage, { dynamic, metadata } from "@/app/(site)/unsubscribe/page";
import { messages } from "@/messages";
import { signUnsubscribe, unsubscribeKey } from "@/services/subscriptions/links";

const m = messages.subscribe.page;
const PERSON = "8a1f2c3d-0000-4000-8000-000000000001";
const sig = (list = "news") => signUnsubscribe(unsubscribeKey(), PERSON, list);

async function draw(params: Record<string, string | string[]>) {
  render(await UnsubscribePage({ searchParams: Promise.resolve(params) }));
}

describe("/unsubscribe", () => {
  it("shows what is being left and an Unsubscribe button, and changes nothing", async () => {
    await draw({ p: PERSON, l: "news", s: sig() });
    expect(screen.getByRole("heading", { name: m.unsubscribe.headline })).toBeInTheDocument();
    expect(screen.getByText(m.unsubscribe.lead)).toBeInTheDocument();
    expect(screen.getByText(m.leaving.news)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: m.unsubscribe.button })).toBeInTheDocument();
    expect(screen.queryByText(m.unsubscribe.after)).not.toBeInTheDocument();
  });

  it("draws the availability list's own wording", async () => {
    await draw({ p: PERSON, l: "availability", s: sig("availability") });
    expect(screen.getByText(m.leaving.availability)).toBeInTheDocument();
    expect(screen.queryByText(m.leaving.news)).not.toBeInTheDocument();
  });

  it("is never indexed and never cached: an unsubscribe link belongs to one person", () => {
    expect(metadata.robots).toEqual({ index: false });
    expect(metadata.title).toBe(m.unsubscribe.headline);
    expect(dynamic).toBe("force-dynamic");
  });

  it("refuses a signature that does not verify, and offers no button", async () => {
    await draw({ p: PERSON, l: "news", s: "B".repeat(43) });
    expect(screen.getByText(m.invalid.title)).toBeInTheDocument();
    expect(screen.getByText(m.invalid.note)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: m.unsubscribe.button })).not.toBeInTheDocument();
    expect(screen.queryByText(m.unsubscribe.lead)).not.toBeInTheDocument();
  });

  it("refuses a signature made for the other list", async () => {
    // The list is inside the signature, so a link for one list cannot be edited into the other.
    await draw({ p: PERSON, l: "availability", s: sig() });
    expect(screen.getByText(m.invalid.title)).toBeInTheDocument();
  });

  it.each([
    ["a list that is not one", { p: PERSON, l: "other", s: "A".repeat(43) }],
    ["a person that is not a uuid", { p: "nope", l: "news", s: "A".repeat(43) }],
    ["no parameters at all", {}],
    ["two of a parameter", { p: PERSON, l: ["news", "availability"], s: sig() }],
    // These are validly signed, so only the shape check refuses them: a bad signature would fail verification anyway.
    ["a validly signed link for a person that is not a uuid", { p: "nope", l: "news", s: signUnsubscribe(unsubscribeKey(), "nope", "news") }],
    ["a validly signed link for a list that is not one", { p: PERSON, l: "other", s: signUnsubscribe(unsubscribeKey(), PERSON, "other") }],
    // A one-element array stringifies to the list's name inside the signature, so it would verify without the shape check.
    ["a validly signed list given as an array", { p: PERSON, l: ["news"], s: sig() }],
  ])("is an invalid link for %s", async (_why, params) => {
    await draw(params);
    expect(screen.getByText(m.invalid.title)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
