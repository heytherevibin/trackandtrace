import { describe, expect, it, vi } from "vitest";
import { requireConsoleMember } from "@/console/auth/guard";
import type { ConsoleDb } from "@/console/auth/db";

const MEMBER = {
  user_id: "11111111-1111-1111-1111-111111111111",
  email: "asha@trakline.in",
  name: "Asha Rao",
  role: "support",
  status: "active",
};

function dbAnswering(result: { data?: unknown; error?: { message: string } }): ConsoleDb {
  return { rpc: vi.fn(() => Promise.resolve({ data: result.data ?? null, error: result.error ?? null })) } as unknown as ConsoleDb;
}

describe("requireConsoleMember", () => {
  it("returns the member console_me reports", async () => {
    await expect(requireConsoleMember(undefined, dbAnswering({ data: MEMBER }))).resolves.toMatchObject({ role: "support", name: "Asha Rao" });
  });

  it("calls console_me and nothing else", async () => {
    const db = dbAnswering({ data: MEMBER });
    await requireConsoleMember(undefined, db);
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("console_me");
  });

  it("turns the database's 'session ended' into a 401 a member can read", async () => {
    await expect(requireConsoleMember(undefined, dbAnswering({ error: { message: "session ended" } }))).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      status: 401,
      message: "Your session ended. Sign in again.",
    });
  });

  it("turns 'no access' into a 403, not a session ending", async () => {
    await expect(requireConsoleMember(undefined, dbAnswering({ error: { message: "no access" } }))).rejects.toMatchObject({ status: 403 });
  });

  it("refuses a role below the one the module needs", async () => {
    await expect(requireConsoleMember("admin", dbAnswering({ data: MEMBER }))).rejects.toMatchObject({ status: 403 });
  });

  it("allows a role above the one the module needs", async () => {
    await expect(requireConsoleMember("viewer", dbAnswering({ data: MEMBER }))).resolves.toMatchObject({ role: "support" });
  });

  it("does not let an unexpected database error read as a plain sign-out", async () => {
    await expect(requireConsoleMember(undefined, dbAnswering({ error: { message: "connection refused" } }))).rejects.toMatchObject({ code: "INTERNAL" });
  });
});
