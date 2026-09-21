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

  // A request with no session at all is `anon` to PostgREST, and console_me is granted to
  // `authenticated` alone -- so the database refuses it by permission rather than by saying the
  // session ended. Reading that as an internal fault would answer a signed-out visitor with an
  // error page instead of the sign-in link they actually need.
  it("reads a function-level permission refusal as having no session, not as a fault", async () => {
    await expect(
      requireConsoleMember(undefined, dbAnswering({ error: { message: "permission denied for function console_me" } })),
    ).rejects.toMatchObject({ status: 401, message: "Your session ended. Sign in again." });
  });

  // But a permission refusal on the schema is the console's own misconfiguration -- the shape the
  // enum-argument bug took in the previous phase -- and must stay a fault rather than quietly
  // logging members out.
  it("still treats a schema-level permission refusal as a fault", async () => {
    await expect(
      requireConsoleMember(undefined, dbAnswering({ error: { message: "permission denied for schema console" } })),
    ).rejects.toMatchObject({ status: 500 });
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
