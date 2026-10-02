import { beforeEach, describe, expect, it, vi } from "vitest";

const { suppressionFor } = vi.hoisted(() => ({ suppressionFor: vi.fn(async (_email: string) => null as null | string) }));
vi.mock("@/services/announcements/store", () => ({ suppressionFor }));
const { sendEmail } = vi.hoisted(() => ({
  sendEmail: vi.fn(async (_letter: unknown, _key?: string) => ({ outcome: "sent", id: "x" })),
}));
vi.mock("@/services/email/send", () => ({ sendEmail }));

import { sendToAddress } from "@/services/email/suppression";

const LETTER = { from: "a@trakline.in", to: "B@Example.IN", subject: "s", text: "t" };

// Reset, not just cleared: `mockResolvedValue` outlives `mockClear`, and one test's suppression must
// never be the next test's starting point.
beforeEach(() => {
  suppressionFor.mockReset();
  suppressionFor.mockResolvedValue(null);
  sendEmail.mockClear();
});

describe("sendToAddress", () => {
  it("sends when nothing is suppressed", async () => {
    expect(await sendToAddress(LETTER, "list")).toEqual({ outcome: "sent", id: "x" });
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it("hands the letter and the idempotency key to the sender untouched", async () => {
    await sendToAddress(LETTER, "list", "key-1");
    expect(sendEmail).toHaveBeenCalledWith(LETTER, "key-1");
  });

  it("refuses list mail to a complaint without calling the sender, and transactional mail still goes", async () => {
    suppressionFor.mockResolvedValue("list");
    expect(await sendToAddress(LETTER, "list")).toEqual({ outcome: "suppressed" });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(await sendToAddress(LETTER, "transactional")).toEqual({ outcome: "sent", id: "x" });
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it("refuses everything to a hard bounce without calling the sender, transactional and list alike", async () => {
    suppressionFor.mockResolvedValue("all");
    expect(await sendToAddress(LETTER, "transactional")).toEqual({ outcome: "suppressed" });
    expect(await sendToAddress(LETTER, "list")).toEqual({ outcome: "suppressed" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("looks the address up normalised, or a suppression never matches what we send to", async () => {
    await sendToAddress(LETTER, "list");
    expect(suppressionFor).toHaveBeenCalledWith("b@example.in");
  });

  it("refuses when the suppression table cannot be read, without calling the sender — failing closed, never open", async () => {
    suppressionFor.mockRejectedValueOnce(new Error("down"));
    // `failed`, not `suppressed`: a lookup that errored says nothing about this address, so it must
    // not read as the address being suppressed.
    expect(await sendToAddress(LETTER, "list")).toEqual({ outcome: "failed" });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
