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
});
