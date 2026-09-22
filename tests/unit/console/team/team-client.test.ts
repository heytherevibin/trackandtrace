import { afterEach, describe, expect, it, vi } from "vitest";

// The browser half of inviting (task-4). Stubs global fetch and asserts on the spy directly, the
// same shape tests/unit/console/account/my-keys-client.test.ts uses for removeKey: apiRequest has
// its own tests, so these only cover what inviteMember adds on top of it.
import { inviteMember } from "@/console/team/team-client";

function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("inviteMember", () => {
  it("sends the address, the role and the reason to POST /api/team", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(answer({ ok: true }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(inviteMember("priya@example.com", "support", "Covering weekend leads.")).resolves.toEqual({ kind: "done" });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/team");
    expect(init).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(init.body))).toEqual({ email: "priya@example.com", role: "support", reason: "Covering weekend leads." });
  });

  // The invite token never leaves the server (task-4-addendum.md §3, carried from the Task 2
  // review's finding I3). This schema is the second line of that defence: a route that started
  // echoing one would fail to parse here rather than hand a console-access credential to a caller
  // that might log it.
  it("refuses a response that carries a token, rather than accept it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ ok: true, token: "deadbeef" })));
    await expect(inviteMember("priya@example.com", "support", "Covering weekend leads.")).resolves.toEqual({
      kind: "failed",
      message: "The console could not be reached. Try again.",
    });
  });

  it("passes the server's own refusal message through", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        answer({ ok: false, code: "INVALID_INPUT", message: "This address already has a Trakline account. Invite a dedicated console address." }, 403),
      ),
    );
    await expect(inviteMember("priya.shah@example.com", "support", "Covering weekend leads.")).resolves.toEqual({
      kind: "failed",
      message: "This address already has a Trakline account. Invite a dedicated console address.",
    });
  });

  it("replaces an unreachable-source refusal with the console's own line, via the shared mapper", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(inviteMember("priya@example.com", "support", "Covering weekend leads.")).resolves.toEqual({
      kind: "failed",
      message: "The console could not be reached. Try again.",
    });
  });
});
