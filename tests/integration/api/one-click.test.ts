import { describe, expect, it, vi } from "vitest";

const { withdrawRow } = vi.hoisted(() => ({ withdrawRow: vi.fn(async () => "done") }));
vi.mock("@/services/subscriptions/store", () => ({ withdrawRow }));

import { POST } from "@/app/api/unsubscribe/one-click/route";
import { signUnsubscribe, unsubscribeKey } from "@/services/subscriptions/links";

const PERSON = "8a1f2c3d-0000-4000-8000-000000000001";
const url = (s: string, l = "news") => `https://trakline.in/api/unsubscribe/one-click?p=${PERSON}&l=${l}&s=${s}`;
const good = () => signUnsubscribe(unsubscribeKey(), PERSON, "news");

describe("POST /api/unsubscribe/one-click", () => {
  it("withdraws on a signed link and answers 200, because a mail client shows the button's failure to the reader", async () => {
    const res = await POST(new Request(url(good()), { method: "POST", body: "List-Unsubscribe=One-Click" }));
    expect(res.status).toBe(200);
    expect(withdrawRow).toHaveBeenCalledWith(PERSON, "news", null);
  });

  it("refuses a signature that does not verify, and withdraws nothing", async () => {
    withdrawRow.mockClear();
    const res = await POST(new Request(url("B".repeat(43)), { method: "POST", body: "" }));
    expect(res.status).toBe(400);
    expect(withdrawRow).not.toHaveBeenCalled();
  });

  it("refuses a signature minted for the other list", async () => {
    withdrawRow.mockClear();
    const res = await POST(new Request(url(good(), "availability"), { method: "POST", body: "" }));
    expect(res.status).toBe(400);
    expect(withdrawRow).not.toHaveBeenCalled();
  });

  it("answers 200 for a signed link with no consent row behind it, because the reader is not mailed either way", async () => {
    withdrawRow.mockClear();
    withdrawRow.mockResolvedValueOnce("unknown");
    const res = await POST(new Request(url(good()), { method: "POST", body: "List-Unsubscribe=One-Click" }));
    expect(res.status).toBe(200);
    expect(withdrawRow).toHaveBeenCalledWith(PERSON, "news", null);
  });

  it.each([
    ["a person that is not a uuid", `https://trakline.in/api/unsubscribe/one-click?p=not-a-uuid&l=news&s=${"B".repeat(43)}`],
    ["a missing signature", `https://trakline.in/api/unsubscribe/one-click?p=${PERSON}&l=news`],
    ["an unknown list", `https://trakline.in/api/unsubscribe/one-click?p=${PERSON}&l=other&s=${"B".repeat(43)}`],
  ])("refuses %s, and withdraws nothing", async (_name, target) => {
    withdrawRow.mockClear();
    const res = await POST(new Request(target, { method: "POST", body: "" }));
    expect(res.status).toBe(400);
    expect(withdrawRow).not.toHaveBeenCalled();
  });

  it("does not look like a success when the write fails", async () => {
    withdrawRow.mockClear();
    withdrawRow.mockRejectedValueOnce(new Error("database down"));
    const res = await POST(new Request(url(good()), { method: "POST", body: "List-Unsubscribe=One-Click" }));
    expect(res.status).not.toBe(200);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
