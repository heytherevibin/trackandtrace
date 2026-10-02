import { describe, expect, it, vi } from "vitest";

const { suppressionFor } = vi.hoisted(() => ({ suppressionFor: vi.fn(async () => null as null | string) }));
vi.mock("@/services/announcements/store", () => ({ suppressionFor }));
const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => ({ outcome: "sent", id: "x" })) }));
vi.mock("@/services/email/send", () => ({ sendEmail }));

import { sendToAddress } from "@/services/email/suppression";

const LETTER = { from: "a@trakline.in", to: "B@Example.IN", subject: "s", text: "t" };

describe("sendToAddress", () => {
  it("sends when nothing is suppressed", async () => {
    suppressionFor.mockResolvedValueOnce(null);
    expect(await sendToAddress(LETTER, "list")).toEqual({ outcome: "sent", id: "x" });
  });

  it("refuses list mail to a complaint, and transactional mail still goes", async () => {
    suppressionFor.mockResolvedValue("list");
    expect(await sendToAddress(LETTER, "list")).toEqual({ outcome: "failed" });
    expect(await sendToAddress(LETTER, "transactional")).toEqual({ outcome: "sent", id: "x" });
  });

  it("refuses everything to a hard bounce, transactional included", async () => {
    suppressionFor.mockResolvedValue("all");
    expect(await sendToAddress(LETTER, "transactional")).toEqual({ outcome: "failed" });
  });

  it("looks the address up normalised, or a suppression never matches what we send to", async () => {
    suppressionFor.mockResolvedValue(null);
    await sendToAddress(LETTER, "list");
    expect(suppressionFor).toHaveBeenCalledWith("b@example.in");
  });

  it("refuses when the suppression table cannot be read — failing closed, never open", async () => {
    suppressionFor.mockRejectedValueOnce(new Error("down"));
    expect(await sendToAddress(LETTER, "list")).toEqual({ outcome: "failed" });
  });
});
