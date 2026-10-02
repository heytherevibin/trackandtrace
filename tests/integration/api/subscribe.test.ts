import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The three routes end to end, with the database and Resend replaced. What is asserted is the
// seam: the same reply whatever the database said, the hash never the token, and a signature that
// must verify before anything is written.

const { store, sendEmail } = vi.hoisted(() => ({
  store: {
    signUpRow: vi.fn(async () => "send" as "send" | "quiet"),
    confirmRow: vi.fn(async () => ({ state: "confirmed", list: "news" })),
    peekRow: vi.fn(),
    withdrawRow: vi.fn(async () => "done"),
    rejoinRow: vi.fn(async () => "done"),
    personId: vi.fn(),
  },
  sendEmail: vi.fn(async () => ({ outcome: "sent", id: "msg_1" }) as const),
}));
vi.mock("@/services/subscriptions/store", () => store);
vi.mock("@/services/announcements/store", () => ({ suppressionFor: async () => null }));
vi.mock("@/services/email/send", () => ({ sendEmail }));
vi.mock("@/services/email/allowance", () => ({ takeConfirmation: async () => "ok" }));

import { POST as confirm } from "@/app/api/subscribe/confirm/route";
import { POST as signUp } from "@/app/api/subscribe/route";
import { POST as unsubscribe } from "@/app/api/unsubscribe/route";
import { messages } from "@/messages";
import { signUnsubscribe, unsubscribeKey } from "@/services/subscriptions/links";

const m = messages.subscribe;
const PERSON = "8a1f2c3d-0000-4000-8000-000000000001";

function post(path: string, body: unknown, ip = "203.0.113.10"): Request {
  return new Request(`http://localhost:4210${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost:4210", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  for (const f of Object.values(store)) f.mockClear();
  sendEmail.mockClear();
});

describe("POST /api/subscribe", () => {
  it("answers the same sent copy, with no address in it", async () => {
    const response = await signUp(post("/api/subscribe", { email: "asha@example.in", list: "news", source: "footer" }));
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ ok: true, message: m.sent });
    expect(text).not.toContain("asha@example.in");
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it("answers the same when the address is already subscribed, and sends nothing", async () => {
    store.signUpRow.mockResolvedValueOnce("quiet");
    const response = await signUp(post("/api/subscribe", { email: "asha@example.in", list: "news", source: "footer" }, "203.0.113.11"));
    expect(await response.json()).toEqual({ ok: true, message: m.sent });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("refuses an address that is not one", async () => {
    const response = await signUp(post("/api/subscribe", { email: "nope", list: "news", source: "footer" }, "203.0.113.12"));
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe(m.errors.invalid);
  });

  it("refuses the sixth sign-up in an hour from one connection", async () => {
    for (let i = 0; i < 5; i += 1) await signUp(post("/api/subscribe", { email: `p${i}@example.in`, list: "news", source: "footer" }, "203.0.113.50"));
    const sixth = await signUp(post("/api/subscribe", { email: "p6@example.in", list: "news", source: "footer" }, "203.0.113.50"));
    expect(sixth.status).toBe(429);
    expect((await sixth.json()).message).toBe(m.errors.limited);
  });

  it("refuses anything it did not ask for", async () => {
    const response = await signUp(post("/api/subscribe", { email: "a@b.in", list: "news", source: "footer", environment: "preview" }, "203.0.113.13"));
    expect(response.status).toBe(400);
  });
});

describe("POST /api/subscribe/confirm", () => {
  it("passes the token's hash, never the token, and answers the state and the list", async () => {
    const token = "A".repeat(43);
    const response = await confirm(post("/api/subscribe/confirm", { token }));
    expect(store.confirmRow).toHaveBeenCalledWith(createHash("sha256").update(token).digest());
    expect(await response.json()).toEqual({ ok: true, state: "confirmed", list: "news" });
  });
});

describe("POST /api/unsubscribe", () => {
  const s = () => signUnsubscribe(unsubscribeKey(), PERSON, "news");

  it("refuses a signature that does not verify, and touches nothing", async () => {
    const response = await unsubscribe(post("/api/unsubscribe", { p: PERSON, l: "news", s: "B".repeat(43), action: "unsubscribe" }));
    expect(response.status).toBe(400);
    expect(store.withdrawRow).not.toHaveBeenCalled();
  });

  it("unsubscribes, adds a reason afterwards, and resubscribes, each with a valid signature", async () => {
    await unsubscribe(post("/api/unsubscribe", { p: PERSON, l: "news", s: s(), action: "unsubscribe" }));
    expect(store.withdrawRow).toHaveBeenLastCalledWith(PERSON, "news", null);
    await unsubscribe(post("/api/unsubscribe", { p: PERSON, l: "news", s: s(), action: "reason", reason: "too many" }));
    expect(store.withdrawRow).toHaveBeenLastCalledWith(PERSON, "news", "too many");
    await unsubscribe(post("/api/unsubscribe", { p: PERSON, l: "news", s: s(), action: "resubscribe" }));
    expect(store.rejoinRow).toHaveBeenCalledWith(PERSON, "news");
  });
});
