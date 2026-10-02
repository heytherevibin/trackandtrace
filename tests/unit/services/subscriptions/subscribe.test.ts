import { describe, expect, it, vi } from "vitest";
import { messages } from "@/messages";
import { subscribe, tokenHash, type SubscribeDeps } from "@/services/subscriptions/subscribe";

// Spec §3's order, and what each step must NOT have done when it refuses. The three checks before
// the database write exist so a refused request leaves nothing behind, and the answer on success is
// always the same sentence — so the reply never says whether an address is already known.

const m = messages.subscribe;
const ASK = { email: "asha@example.in", list: "news" as const, source: "footer" as const };

function deps(over: Partial<SubscribeDeps> = {}): SubscribeDeps & { send: ReturnType<typeof vi.fn> } {
  return {
    limiter: { check: vi.fn(async () => ({ ok: true, remaining: 4, retryAfterSeconds: 0 })) },
    allowance: vi.fn(async () => "ok" as const),
    signUp: vi.fn(async () => "send" as const),
    send: vi.fn(async () => ({ outcome: "sent", id: "msg_1" }) as const),
    origin: "https://trakline.in",
    from: "Trakline <updates@trakline.in>",
    token: () => "tok_abc",
    ...over,
  } as SubscribeDeps & { send: ReturnType<typeof vi.fn> };
}

describe("subscribe", () => {
  it("sends one confirmation email with the confirm link, from updates@", async () => {
    const d = deps();
    await subscribe(ASK, "203.0.113.9", d);
    expect(d.signUp).toHaveBeenCalledWith(ASK, tokenHash("tok_abc"));
    expect(d.send).toHaveBeenCalledWith(
      expect.objectContaining({ from: "Trakline <updates@trakline.in>", to: "asha@example.in", subject: m.email.subject }),
    );
    expect(d.send.mock.calls[0]![0].text).toContain("https://trakline.in/subscribe/confirm?token=tok_abc");
  });

  it("answers the same, and sends nothing, when the database says quiet (already subscribed or just sent)", async () => {
    const d = deps({ signUp: vi.fn(async () => "quiet" as const) });
    await expect(subscribe(ASK, "203.0.113.9", d)).resolves.toBeUndefined();
    expect(d.send).not.toHaveBeenCalled();
  });

  it("refuses an address that is not one, before anything else", async () => {
    const d = deps();
    await expect(subscribe({ ...ASK, email: "not-an-email" }, "203.0.113.9", d)).rejects.toThrow(m.errors.invalid);
    expect(d.limiter.check).not.toHaveBeenCalled();
  });

  it("refuses when the connection is over its limit, writing nothing", async () => {
    const d = deps({ limiter: { check: vi.fn(async () => ({ ok: false, remaining: 0, retryAfterSeconds: 600 })) } });
    await expect(subscribe(ASK, "203.0.113.9", d)).rejects.toThrow(m.errors.limited);
    expect(d.signUp).not.toHaveBeenCalled();
    expect(d.limiter.check).toHaveBeenCalledWith("subscribe:203.0.113.9", 5, 3_600_000);
  });

  it("refuses when today's allowance is spent, and fails closed when it cannot be read — writing nothing either way", async () => {
    for (const [state, copy] of [
      ["spent", m.errors.dailyLimit],
      ["unknown", m.errors.failed],
    ] as const) {
      const d = deps({ allowance: vi.fn(async () => state) });
      await expect(subscribe(ASK, "203.0.113.9", d)).rejects.toThrow(copy);
      expect(d.signUp).not.toHaveBeenCalled();
    }
  });

  it("says it did not go through when the email is refused, or there is no safe origin to link to", async () => {
    await expect(subscribe(ASK, "203.0.113.9", deps({ send: vi.fn(async () => ({ outcome: "failed" }) as const) }))).rejects.toThrow(m.errors.failed);
    const noOrigin = deps({ origin: "" });
    await expect(subscribe(ASK, "203.0.113.9", noOrigin)).rejects.toThrow(m.errors.failed);
    expect(noOrigin.signUp).not.toHaveBeenCalled();
  });
});
