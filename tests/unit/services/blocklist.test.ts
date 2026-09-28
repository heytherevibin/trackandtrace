import { beforeEach, describe, expect, it, vi } from "vitest";
import { blockingLimiter, cachedBlocks, durationUntil, memoryBlocklist, redisBlocklist, type Blocklist } from "@/services/blocklist";
import type { RateLimiter } from "@/services/rate-limit";
import { createFakeUpstash } from "../../support/fake-upstash";

// ---------------------------------------------------------------------------
// Module 04's blocklist. It lives in Upstash beside the limiter (the owner's call),
// and every traveller check consults it — so the check reads a 30-second copy, never
// the store itself, and a copy it cannot refresh FAILS OPEN: no real traveller is
// turned away because the store is down.
//
// A member is what the limited log stores: a kind, a dot, a keyed hash. Never an address.
// ---------------------------------------------------------------------------

const fake = createFakeUpstash();
const T0 = Date.parse("2026-09-28T04:30:00Z");
const A = `4.${"a".repeat(43)}`;
const B = `6.${"b".repeat(43)}`;
const record = (until: number | null) => ({ note: "Scripted checks", by: "Asha Rao", since: T0, until, keyId: "k1" });

beforeEach(() => fake.reset());

describe("durationUntil", () => {
  it("turns the dialog's four choices into an end time, or none for 'until removed'", () => {
    expect(durationUntil("1h", T0)).toBe(T0 + 3_600_000);
    expect(durationUntil("24h", T0)).toBe(T0 + 86_400_000);
    expect(durationUntil("7d", T0)).toBe(T0 + 7 * 86_400_000);
    expect(durationUntil("removed", T0)).toBeNull();
  });
});

describe.each([
  ["the shared store", () => redisBlocklist(fake.redis, "tt:test")],
  ["this instance's memory", () => memoryBlocklist()],
] as const)("the blocklist, over %s", (_name, make: () => Blocklist) => {
  it("lists a block with who made it, why, and until when", async () => {
    const list = make();
    await list.block(A, record(T0 + 3_600_000));
    expect(await list.list(T0)).toEqual([{ member: A, hash: "a".repeat(43), network: "ipv4", note: "Scripted checks", by: "Asha Rao", since: T0, until: T0 + 3_600_000, keyId: "k1", refused: 0 }]);
  });

  it("forgets a block once its time is up, without anyone lifting it", async () => {
    const list = make();
    await list.block(A, record(T0 + 3_600_000));
    await list.block(B, record(null));
    expect((await list.list(T0 + 3_600_001)).map((b) => b.member)).toEqual([B]);
  });

  it("lifts a block, and its refusal count with it", async () => {
    const list = make();
    await list.block(A, record(null));
    await list.countRefused(A);
    await list.unblock(A);
    await list.block(A, record(null));
    expect((await list.list(T0))[0]?.refused).toBe(0);
  });

  it("counts the refusals since the block", async () => {
    const list = make();
    await list.block(B, record(null));
    await list.countRefused(B);
    await list.countRefused(B);
    expect(await list.list(T0)).toMatchObject([{ member: B, network: "ipv6", refused: 2 }]);
  });

  it("lists the newest block first", async () => {
    const list = make();
    await list.block(A, { ...record(null), since: T0 });
    await list.block(B, { ...record(null), since: T0 + 1000 });
    expect((await list.list(T0 + 2000)).map((b) => b.member)).toEqual([B, A]);
  });
});

describe("the shared-store blocklist", () => {
  it("fails a list, a block and an unblock when the store does not answer — a console action must not pretend", async () => {
    const list = redisBlocklist(fake.redis, "tt:test");
    fake.fail(true);
    await expect(list.list(T0)).rejects.toThrow();
    await expect(list.block(A, record(null))).rejects.toThrow();
    await expect(list.unblock(A)).rejects.toThrow();
  });

  it("swallows a failed refusal count: counting must never be why a check breaks", async () => {
    const list = redisBlocklist(fake.redis, "tt:test");
    fake.fail(true);
    await expect(list.countRefused(A)).resolves.toBeUndefined();
  });

  it("holds hashes only", async () => {
    const list = redisBlocklist(fake.redis, "tt:test");
    await list.block(A, record(null));
    expect(fake.dump()).toContain("a".repeat(43));
  });
});

describe("cachedBlocks", () => {
  it("answers from a copy it refreshes at most every 30 seconds", async () => {
    const list = memoryBlocklist();
    const spy = vi.spyOn(list, "list");
    const clock = { now: T0 };
    const blocked = cachedBlocks(list, () => clock.now);

    await list.block(A, record(null));
    expect(await blocked.has(A)).toBe(true);
    await blocked.has(A);
    expect(spy).toHaveBeenCalledTimes(1);

    await list.unblock(A);
    expect(await blocked.has(A)).toBe(true); // still the old copy
    clock.now += 30_001;
    expect(await blocked.has(A)).toBe(false);
  });

  it("sees an expired block as lifted even inside the 30 seconds", async () => {
    const list = memoryBlocklist();
    const clock = { now: T0 };
    const blocked = cachedBlocks(list, () => clock.now);
    await list.block(A, record(T0 + 5_000));
    expect(await blocked.has(A)).toBe(true);
    clock.now += 6_000;
    expect(await blocked.has(A)).toBe(false);
  });

  it("fails open: a copy it could never read blocks nobody", async () => {
    const list = redisBlocklist(fake.redis, "tt:test");
    fake.fail(true);
    const blocked = cachedBlocks(list, () => T0);
    await expect(blocked.has(A)).resolves.toBe(false);
  });

  it("keeps the last good copy through an outage rather than dropping every block at once", async () => {
    const list = redisBlocklist(fake.redis, "tt:test");
    const clock = { now: T0 };
    const blocked = cachedBlocks(list, () => clock.now);
    await list.block(A, record(null));
    expect(await blocked.has(A)).toBe(true);
    fake.fail(true);
    clock.now += 60_000;
    expect(await blocked.has(A)).toBe(true);
  });

  it("can be told to refresh now, so this instance applies its own block at once", async () => {
    const list = memoryBlocklist();
    const blocked = cachedBlocks(list, () => T0);
    expect(await blocked.has(A)).toBe(false);
    await list.block(A, record(null));
    blocked.invalidate();
    expect(await blocked.has(A)).toBe(true);
  });
});

describe("blockingLimiter", () => {
  const hash = (address: string) => (address === "203.0.113.9" ? "a".repeat(43) : "z".repeat(43));
  function inner(): RateLimiter & { readonly check: ReturnType<typeof vi.fn> } {
    return { check: vi.fn(async () => ({ ok: true, remaining: 19, retryAfterSeconds: 0 })) };
  }

  it("refuses a blocked traveller address before the limiter is asked, and counts the refusal", async () => {
    const list = memoryBlocklist();
    await list.block(A, record(null));
    const limiter = inner();
    const guarded = blockingLimiter(limiter, cachedBlocks(list, () => T0), list, hash);

    const verdict = await guarded.check("pnr:203.0.113.9", 20, 60_000);

    // The same answer a rate limit gives: a blocked address is not told it is blocked.
    expect(verdict).toEqual({ ok: false, remaining: 0, retryAfterSeconds: 60 });
    expect(limiter.check).not.toHaveBeenCalled();
    expect((await list.list(T0))[0]?.refused).toBe(1);
  });

  it("lets an address that is not blocked through to the limiter", async () => {
    const list = memoryBlocklist();
    await list.block(A, record(null));
    const limiter = inner();
    const verdict = await blockingLimiter(limiter, cachedBlocks(list, () => T0), list, hash).check("pnr:198.51.100.1", 20, 60_000);
    expect(verdict.ok).toBe(true);
    expect(limiter.check).toHaveBeenCalledOnce();
  });

  it("never blocks a key that is not a traveller address", async () => {
    const list = memoryBlocklist();
    const limiter = inner();
    const blocked = { has: vi.fn(async () => true), invalidate: vi.fn() };
    await blockingLimiter(limiter, blocked, list, hash).check("write:some-user", 20, 60_000);
    expect(blocked.has).not.toHaveBeenCalled();
    expect(limiter.check).toHaveBeenCalledOnce();
  });

  it("fails open when the blocklist cannot be read at all", async () => {
    const list = redisBlocklist(fake.redis, "tt:test");
    fake.fail(true);
    const limiter = inner();
    const verdict = await blockingLimiter(limiter, cachedBlocks(list, () => T0), list, hash).check("pnr:203.0.113.9", 20, 60_000);
    expect(verdict.ok).toBe(true);
  });
});
