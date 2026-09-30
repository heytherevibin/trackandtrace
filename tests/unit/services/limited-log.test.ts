import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LIMITED_SCOPES, limitedAddress, memoryLimitedLog, recordingLimiter, redisLimitedLog, type LimitedLog } from "@/services/limited-log";
import type { RateLimiter } from "@/services/rate-limit";
import { createFakeUpstash } from "../../support/fake-upstash";

// ---------------------------------------------------------------------------
// Who hit the limit today — module 04's "Limited today" and "Most limited today".
//
// Nothing recorded a refusal until now: the limiter said no and forgot. This
// records one per refused TRAVELLER check, keyed by a keyed hash of the address,
// never the address itself. Recording is best-effort — it must never be why a
// check fails or slows — and reading it is not: a console page reading a store
// that did not answer must be told so.
// ---------------------------------------------------------------------------

const fake = createFakeUpstash();
const hash = (address: string) => `h(${address})`;
const T0 = Date.parse("2026-09-28T04:30:00Z"); // 10:00 IST

beforeEach(() => fake.reset());

describe("limitedAddress", () => {
  it("takes the address out of a traveller limiter key, IPv6 /64 and all", () => {
    expect(limitedAddress("pnr:1.2.3.4")).toBe("1.2.3.4");
    expect(limitedAddress("routeAvailability:2001:db8:0:1::/64")).toBe("2001:db8:0:1::/64");
  });

  it("counts a refused sign-up as a traveller address hitting a limit", () => {
    // 06-A: signing up for a list is a traveller doing something from an address, so a refusal
    // belongs in module 04's count beside a refused PNR check rather than being forgotten.
    expect(limitedAddress("subscribe:1.2.3.4")).toBe("1.2.3.4");
  });

  it("ignores keys that are not an address a traveller checks from", () => {
    // An account's writes are keyed by its user id, and console sign-in is the console's own
    // business: neither is an address hitting a traveller limit.
    expect(limitedAddress("write:11111111-1111-1111-1111-111111111111")).toBeNull();
    expect(limitedAddress("console-sign-in:ip:1.2.3.4")).toBeNull();
    expect(limitedAddress("console-sign-in:email:a@b.in")).toBeNull();
  });

  it("covers every address-keyed limit a service asks — a new endpoint cannot go uncounted", () => {
    // A tripwire over the source: every `limiter.check(\`scope:${addressKey(ip)}\`...)` in
    // src/services must name a scope this log records.
    const root = join(__dirname, "..", "..", "..", "src", "services");
    const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : [join(dir, n)]));
    const scopes = files(root)
      .filter((f) => f.endsWith(".ts"))
      .flatMap((f) => [...readFileSync(f, "utf8").matchAll(/check\(`([A-Za-z]+):\$\{addressKey\(/g)].map((m) => m[1]));
    // Raised to 8 when 06-A's sign-up added its own address-keyed limit. A floor, not a count: it
    // catches a call site that disappears, which is how a limit stops being counted without anyone
    // editing this file.
    expect(scopes.length).toBeGreaterThanOrEqual(8);
    for (const scope of scopes) expect(LIMITED_SCOPES, scope).toContain(scope);
  });
});

describe.each([
  ["the shared store", () => redisLimitedLog(fake.redis, "tt:test", hash, () => T0)],
  ["this instance's memory", () => memoryLimitedLog(hash)],
] as const)("the limited log, over %s", (_name, make: () => LimitedLog) => {
  it("counts each address's refusals, with when it was first and last refused, busiest first", async () => {
    const log = make();
    await log.record("1.2.3.4", T0);
    await log.record("1.2.3.4", T0 + 60_000);
    await log.record("5.6.7.8", T0 + 30_000);
    await log.record("1.2.3.4", T0 + 120_000);

    const today = await log.today(10, T0 + 180_000);

    expect(today.total).toBe(4);
    expect(today.top).toEqual([
      { hash: "h(1.2.3.4)", network: "ipv4", times: 3, firstSeen: T0, lastSeen: T0 + 120_000 },
      { hash: "h(5.6.7.8)", network: "ipv4", times: 1, firstSeen: T0 + 30_000, lastSeen: T0 + 30_000 },
    ]);
  });

  it("says which kind of address each one was — an IPv6 /64 is a whole network, not one device", async () => {
    // The sheet tags these "IPv6 /64". The hash hides the address, so the kind is written beside it.
    const log = make();
    await log.record("2001:db8:0:1::/64", T0);
    await log.record("unreadable", T0);
    const kinds = (await log.today(10, T0)).top.map((r) => r.network).sort();
    expect(kinds).toEqual(["ipv6", "unknown"]);
  });

  it("gives the busiest n, not all of them", async () => {
    const log = make();
    for (const [address, times] of [["a", 1], ["b", 3], ["c", 2]] as const) for (let i = 0; i < times; i += 1) await log.record(address, T0 + i);
    const today = await log.today(2, T0 + 10);
    expect(today.top.map((r) => r.hash)).toEqual(["h(b)", "h(c)"]);
    expect(today.total).toBe(6);
  });

  it("starts each India day empty: yesterday's refusals are not today's", async () => {
    const log = make();
    await log.record("1.2.3.4", Date.parse("2026-09-27T18:00:00Z")); // 23:30 IST on the 27th
    const today = await log.today(10, Date.parse("2026-09-27T19:00:00Z")); // 00:30 IST on the 28th
    expect(today).toEqual({ total: 0, top: [] });
  });
});

describe("the shared-store log", () => {
  it("never holds an address in the clear", async () => {
    const { createHmac } = await import("node:crypto");
    const log = redisLimitedLog(fake.redis, "tt:test", (a) => createHmac("sha256", "k").update(a).digest("base64url"), () => T0);
    await log.record("203.0.113.9", T0);
    expect(fake.dump()).not.toContain("203.0.113.9");
  });

  it("fails a read when the store does not answer, so the page can say so rather than draw a quiet day", async () => {
    const log = redisLimitedLog(fake.redis, "tt:test", hash, () => T0);
    fake.fail(true);
    await expect(log.today(10, T0)).rejects.toThrow();
  });

  it("swallows a failed write: counting a refusal must never be why a check breaks", async () => {
    const log = redisLimitedLog(fake.redis, "tt:test", hash, () => T0);
    fake.fail(true);
    await expect(log.record("1.2.3.4", T0)).resolves.toBeUndefined();
  });
});

describe("recordingLimiter", () => {
  function limiter(ok: boolean): RateLimiter {
    return { check: vi.fn(async () => ({ ok, remaining: ok ? 5 : 0, retryAfterSeconds: ok ? 0 : 30 })) };
  }
  const spyLog = (): LimitedLog & { readonly record: ReturnType<typeof vi.fn> } => ({ record: vi.fn(async () => {}), today: vi.fn() });

  it("records a refused traveller check, and hands back the limiter's own verdict", async () => {
    const log = spyLog();
    const verdict = await recordingLimiter(limiter(false), log, () => T0).check("pnr:1.2.3.4", 20, 60_000);
    expect(verdict).toEqual({ ok: false, remaining: 0, retryAfterSeconds: 30 });
    expect(log.record).toHaveBeenCalledWith("1.2.3.4", T0);
  });

  it("records nothing for an allowed check, or for a refusal that is not a traveller address", async () => {
    const log = spyLog();
    await recordingLimiter(limiter(true), log, () => T0).check("pnr:1.2.3.4", 20, 60_000);
    await recordingLimiter(limiter(false), log, () => T0).check("write:some-user", 20, 60_000);
    expect(log.record).not.toHaveBeenCalled();
  });

  it("still answers when recording throws", async () => {
    const log: LimitedLog = { record: vi.fn(async () => Promise.reject(new Error("store down"))), today: vi.fn() };
    await expect(recordingLimiter(limiter(false), log, () => T0).check("pnr:1.2.3.4", 20, 60_000)).resolves.toMatchObject({ ok: false });
  });
});
