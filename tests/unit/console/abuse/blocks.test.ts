import { describe, expect, it, vi } from "vitest";
import { blockTapValue, unblockTapValue } from "@/console/abuse/abuse";
import { blockAddress, unblockAddress } from "@/console/abuse/blocks";
import { memoryBlocklist } from "@/services/blocklist";
import { AppError } from "@/services/errors";

// ---------------------------------------------------------------------------
// Blocking, server side. The database approves and records (it spends the tap and
// writes the Done row, or raises and does neither); only then is Upstash written.
// If Upstash then fails, the block is NOT in force — so a Failed row follows the
// Done one, and the member is told nothing changed.
// ---------------------------------------------------------------------------

const T0 = Date.parse("2026-09-28T04:30:00Z");
const MEMBER = `4.${"a".repeat(43)}`;
const ACTOR = { userId: "11111111-1111-1111-1111-111111111111", name: "Asha Rao", role: "owner" as const };

function db(error: { message: string } | null = null) {
  return { rpc: vi.fn(async () => ({ data: null, error })) };
}

describe("blockTapValue", () => {
  it("is one canonical string, environment first, so the dialog and the route digest the same thing", () => {
    expect(blockTapValue("production", "24h", "Scripted checks")).toBe('{"environment":"production","duration":"24h","note":"Scripted checks"}');
    expect(unblockTapValue("production")).toBe('{"environment":"production"}');
  });
});

describe("blockAddress", () => {
  it("asks the database to approve and record, then writes the block", async () => {
    const database = db();
    const list = memoryBlocklist();
    const audit = vi.fn();
    await blockAddress({ member: MEMBER, duration: "1h", note: "Scripted checks", reason: "Scripted checks from one address", environment: "production", actor: ACTOR, keyId: "k1", now: T0 }, { db: database, list, audit, invalidate: vi.fn() });

    expect(database.rpc).toHaveBeenCalledWith("console_block_address", {
      p_environment: "production",
      p_target: MEMBER,
      p_value: blockTapValue("production", "1h", "Scripted checks"),
      p_reason: "Scripted checks from one address",
    });
    expect(await list.list(T0)).toMatchObject([{ member: MEMBER, by: "Asha Rao", since: T0, until: T0 + 3_600_000, note: "Scripted checks", keyId: "k1" }]);
    expect(audit).not.toHaveBeenCalled();
  });

  it("writes no block when the database refuses — no tap, no block", async () => {
    const list = memoryBlocklist();
    await expect(
      blockAddress({ member: MEMBER, duration: "1h", note: "", reason: "Scripted checks from one address", environment: "production", actor: ACTOR, keyId: "k1", now: T0 }, { db: db({ message: "no tap for this action" }), list, audit: vi.fn(), invalidate: vi.fn() }),
    ).rejects.toBeInstanceOf(AppError);
    expect(await list.list(T0)).toEqual([]);
  });

  it("records a Failed row, and says nothing changed, when the store fails after approval", async () => {
    const list = { ...memoryBlocklist(), block: vi.fn(async () => Promise.reject(new Error("store down"))) };
    const audit = vi.fn(async () => {});
    await expect(
      blockAddress({ member: MEMBER, duration: "removed", note: "", reason: "Scripted checks from one address", environment: "production", actor: ACTOR, keyId: "k1", now: T0 }, { db: db(), list, audit, invalidate: vi.fn() }),
    ).rejects.toThrow(/Not blocked/);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "Blocked an address", target: MEMBER, result: "failed", category: "configure" }));
  });

  it("applies the block on this instance at once", async () => {
    const invalidate = vi.fn();
    await blockAddress({ member: MEMBER, duration: "1h", note: "", reason: "Scripted checks from one address", environment: "production", actor: ACTOR, keyId: "k1", now: T0 }, { db: db(), list: memoryBlocklist(), audit: vi.fn(), invalidate });
    expect(invalidate).toHaveBeenCalledOnce();
  });
});

describe("unblockAddress", () => {
  it("asks the database to approve and record, then lifts the block", async () => {
    const database = db();
    const list = memoryBlocklist();
    await list.block(MEMBER, { note: "", by: "Asha Rao", since: T0, until: null, keyId: "k1" });
    await unblockAddress({ member: MEMBER, reason: "Blocked by mistake, lifting it", environment: "production", actor: ACTOR }, { db: database, list, audit: vi.fn(), invalidate: vi.fn() });
    expect(database.rpc).toHaveBeenCalledWith("console_unblock_address", { p_environment: "production", p_target: MEMBER, p_value: unblockTapValue("production"), p_reason: "Blocked by mistake, lifting it" });
    expect(await list.list(T0)).toEqual([]);
  });

  it("records a Failed row when the store fails after approval", async () => {
    const list = { ...memoryBlocklist(), unblock: vi.fn(async () => Promise.reject(new Error("store down"))) };
    const audit = vi.fn(async () => {});
    await expect(unblockAddress({ member: MEMBER, reason: "Blocked by mistake, lifting it", environment: "production", actor: ACTOR }, { db: db(), list, audit, invalidate: vi.fn() })).rejects.toThrow(/Not unblocked/);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "Unblocked an address", result: "failed" }));
  });
});
