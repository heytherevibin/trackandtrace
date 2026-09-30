import { describe, expect, it, vi } from "vitest";
import { signUp } from "@/components/subscribe/use-signup";
import { messages } from "@/messages";

const m = messages.subscribe;
const ASK = { email: "asha@example.in", list: "news" as const, source: "footer" as const };

function respond(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
}

describe("signUp", () => {
  it("is sent when the route accepts it", async () => {
    expect(await signUp(ASK, respond(200, { ok: true, message: m.sent }))).toBe("sent");
  });

  it("tells the four refusals apart by their copy, not by their status", async () => {
    // `apiRequest` does not hand back the HTTP status, and 429 covers both the connection limit and
    // the day's allowance. The message is the only thing that distinguishes them, and it is a
    // shared constant rather than a string typed twice.
    expect(await signUp(ASK, respond(400, { ok: false, code: "INVALID_INPUT", message: m.errors.invalid }))).toBe("invalid");
    expect(await signUp(ASK, respond(429, { ok: false, code: "RATE_LIMITED", message: m.errors.limited }))).toBe("limited");
    expect(await signUp(ASK, respond(429, { ok: false, code: "RATE_LIMITED", message: m.errors.dailyLimit }))).toBe("dailyLimit");
    expect(await signUp(ASK, respond(503, { ok: false, code: "SOURCE_UNAVAILABLE", message: m.errors.failed }))).toBe("error");
  });

  it("is an error when the service cannot be reached at all", async () => {
    const dead = vi.fn(async () => Promise.reject(new Error("down"))) as unknown as typeof fetch;
    expect(await signUp(ASK, dead)).toBe("error");
  });

  it("sends the address trimmed and lowercased, so the route is never asked to guess", async () => {
    const fetcher = respond(200, { ok: true, message: m.sent });
    await signUp({ ...ASK, email: "  Asha@Example.IN " }, fetcher);
    const body = JSON.parse(String((vi.mocked(fetcher).mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.email).toBe("asha@example.in");
  });
});
