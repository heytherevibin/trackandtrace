import { afterEach, describe, expect, it, vi } from "vitest";

// The browser half of inviting (task-4), changing a role (task-5), resetting a member's keys or
// removing them (task-6), and resending or revoking an invite (task-7). Stubs global fetch and
// asserts on the spy directly, the same shape tests/unit/console/account/my-keys-client.test.ts
// uses for removeKey: apiRequest has its own tests, so these only cover what the six functions add
// on top of it.
import { changeRole, inviteMember, removeMember, resendInvite, resetKeys, revokeInvite } from "@/console/team/team-client";

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
      boundToAddress: false,
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
      boundToAddress: true,
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
      boundToAddress: false,
    });
  });
});

// Which refusals the same address can never fix, and which it can. The dialog latches its Email
// field -- aria-invalid, an alert beneath it, Continue disabled -- only on the first kind, so
// getting this wrong is what would have a console tell a member to try again while disabling the
// one control that tries.
describe("inviteMember's boundToAddress", () => {
  function refusing(message: string, code = "INVALID_INPUT"): void {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ ok: false, code, message }, 403)));
  }

  const send = () => inviteMember("priya@example.com", "support", "Covering weekend leads.");

  it("is true for the three refusals about the address itself", async () => {
    for (const message of [
      "This address already belongs to a console member.",
      "This address already has an invite open. Resend or revoke that one instead.",
      "This address already has a Trakline account. Invite a dedicated console address.",
    ]) {
      refusing(message);
      await expect(send()).resolves.toMatchObject({ boundToAddress: true });
    }
  });

  it("is false for a stale tap, which the very same address can retry", async () => {
    refusing("That confirmation no longer matches this invite. Try inviting them again.");
    await expect(send()).resolves.toMatchObject({ boundToAddress: false });
  });

  it("is false for a console that could not be reached, which the very same address can retry", async () => {
    refusing("The console could not be reached. Try again.", "SOURCE_UNAVAILABLE");
    await expect(send()).resolves.toMatchObject({ boundToAddress: false });
  });

  // Fails open on purpose: a refusal nobody has classified yet leaves the member able to retry,
  // rather than locking a field over a sentence this file has never seen.
  it("is false for a refusal it does not recognise", async () => {
    refusing("Something nobody has written a rule for yet.");
    await expect(send()).resolves.toMatchObject({ boundToAddress: false });
  });
});

// The PATCH half, shaped on inviteMember above (task-5-addendum.md §4). There is deliberately no
// `boundToAddress` counterpart: nothing a member can edit in the change-role dialog could turn a
// refusal into a success, so there is nothing for an outcome flag to latch.
describe("changeRole", () => {
  const MEMBER = "d1111111-1111-1111-1111-111111111111";
  const REASON = "Covering switches for the weekend on-call.";

  it("sends the member's id, the new role and the reason to PATCH /api/team/member", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(answer({ ok: true }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(changeRole(MEMBER, "admin", REASON)).resolves.toEqual({ kind: "done" });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/team/member");
    expect(init).toMatchObject({ method: "PATCH" });
    expect(JSON.parse(String(init.body))).toEqual({ member: MEMBER, role: "admin", reason: REASON });
  });

  // `.strict()` is the point, not decoration: this route answers `{ ok: true }` and nothing more,
  // and a route that started returning anything else would fail to parse here rather than hand a
  // caller a shape nobody has read.
  it("refuses a response carrying anything besides ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ ok: true, role: "admin" })));
    await expect(changeRole(MEMBER, "admin", REASON)).resolves.toEqual({
      kind: "failed",
      message: "The console could not be reached. Try again.",
    });
  });

  it("passes the server's own refusal message through", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(answer({ ok: false, code: "INVALID_INPUT", message: "That confirmation no longer matches this change. Try again." }, 403)),
    );
    await expect(changeRole(MEMBER, "admin", REASON)).resolves.toEqual({
      kind: "failed",
      message: "That confirmation no longer matches this change. Try again.",
    });
  });

  it("replaces an unreachable-source refusal with the console's own line, via the shared mapper", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(changeRole(MEMBER, "admin", REASON)).resolves.toEqual({
      kind: "failed",
      message: "The console could not be reached. Try again.",
    });
  });
});

// Resetting a member's keys (task-6). The one call on this page whose success carries something
// back: console_reset_keys returns how many keys it deleted, and the toast reports it.
describe("resetKeys", () => {
  const MEMBER = "d1111111-1111-1111-1111-111111111111";
  const REASON = "Lost a security key on the train.";

  it("sends the member's id and the reason to DELETE /api/team/keys", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(answer({ ok: true, count: 2 }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(resetKeys(MEMBER, REASON)).resolves.toEqual({ kind: "done", count: 2 });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/team/keys");
    expect(init).toMatchObject({ method: "DELETE" });
    expect(JSON.parse(String(init.body))).toEqual({ member: MEMBER, reason: REASON });
  });

  // The count is the whole point of this response, so a body without one is not a success this
  // caller can report -- it would leave the toast with nothing true to say.
  it("refuses a response with no count", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ ok: true })));
    await expect(resetKeys(MEMBER, REASON)).resolves.toEqual({
      kind: "failed",
      message: "The console could not be reached. Try again.",
    });
  });

  it("refuses a response carrying anything besides ok and count", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ ok: true, count: 2, keys: [] })));
    await expect(resetKeys(MEMBER, REASON)).resolves.toEqual({
      kind: "failed",
      message: "The console could not be reached. Try again.",
    });
  });

  it("passes the server's own refusal message through", async () => {
    const message = "That confirmation no longer matches this member's keys. Their keys changed since this page loaded; reload it and try again.";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ ok: false, code: "INVALID_INPUT", message }, 403)));
    await expect(resetKeys(MEMBER, REASON)).resolves.toEqual({ kind: "failed", message });
  });

  it("replaces an unreachable-source refusal with the console's own line, via the shared mapper", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(resetKeys(MEMBER, REASON)).resolves.toEqual({
      kind: "failed",
      message: "The console could not be reached. Try again.",
    });
  });
});

// Removing a member (task-6). Shaped on changeRole above: nothing comes back that the refreshed
// roster will not show, so `.strict()` on `{ ok: true }` is what keeps it that way.
describe("removeMember", () => {
  const MEMBER = "d1111111-1111-1111-1111-111111111111";
  const REASON = "Left the support rota at the end of September.";

  it("sends the member's id and the reason to DELETE /api/team/member", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(answer({ ok: true }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(removeMember(MEMBER, REASON)).resolves.toEqual({ kind: "done" });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/team/member");
    expect(init).toMatchObject({ method: "DELETE" });
    expect(JSON.parse(String(init.body))).toEqual({ member: MEMBER, reason: REASON });
  });

  it("refuses a response carrying anything besides ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ ok: true, status: "removed" })));
    await expect(removeMember(MEMBER, REASON)).resolves.toEqual({
      kind: "failed",
      message: "The console could not be reached. Try again.",
    });
  });

  it("passes the server's own refusal message through", async () => {
    const message = "The team has changed since this page loaded. Reload it and try again.";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ ok: false, code: "INVALID_INPUT", message }, 403)));
    await expect(removeMember(MEMBER, REASON)).resolves.toEqual({ kind: "failed", message });
  });

  it("replaces an unreachable-source refusal with the console's own line, via the shared mapper", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(removeMember(MEMBER, REASON)).resolves.toEqual({
      kind: "failed",
      message: "The console could not be reached. Try again.",
    });
  });
});

// Resending an invite (task-7). No reason and no tap: resending re-sends a letter to an address an
// Owner already approved and changes no access, so `console_resend_invite` takes neither.
describe("resendInvite", () => {
  const INVITE = "bbbbbbbb-0000-0000-0000-000000000001";

  it("sends the invite's id to POST /api/team/invite, and nothing else", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(answer({ ok: true }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(resendInvite(INVITE)).resolves.toEqual({ kind: "done" });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/team/invite");
    expect(init).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(init.body))).toEqual({ invite: INVITE });
  });

  // `console_resend_invite` mints a FRESH raw token and hands it back. It is the same
  // console-access credential the first invite's was (task-4-addendum.md §3, finding I3), consumed
  // server-side for the letter -- so this schema refuses a response that carries one rather than
  // hand it to a caller that might log it.
  it("refuses a response that carries a token, rather than accept it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ ok: true, token: "a".repeat(64) })));
    await expect(resendInvite(INVITE)).resolves.toEqual({
      kind: "failed",
      message: "The console could not be reached. Try again.",
    });
  });

  it("passes the server's own refusal message through", async () => {
    const message = "The team has changed since this page loaded. Reload it and try again.";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ ok: false, code: "INVALID_INPUT", message }, 403)));
    await expect(resendInvite(INVITE)).resolves.toEqual({ kind: "failed", message });
  });

  it("replaces an unreachable-source refusal with the console's own line, via the shared mapper", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(resendInvite(INVITE)).resolves.toEqual({
      kind: "failed",
      message: "The console could not be reached. Try again.",
    });
  });
});

// Revoking an invite (task-7). Takes a reason and follows a tap, unlike the resend above: revoking
// withdraws access that was granted, and `console_revoke_invite` calls console.use_tap itself.
describe("revokeInvite", () => {
  const INVITE = "bbbbbbbb-0000-0000-0000-000000000001";
  const REASON = "Sent it to the wrong address entirely.";

  it("sends the invite's id and the reason to DELETE /api/team/invite", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(answer({ ok: true }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(revokeInvite(INVITE, REASON)).resolves.toEqual({ kind: "done" });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/team/invite");
    expect(init).toMatchObject({ method: "DELETE" });
    expect(JSON.parse(String(init.body))).toEqual({ invite: INVITE, reason: REASON });
  });

  it("refuses a response carrying anything besides ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ ok: true, revokedAt: "2026-09-22T00:00:00Z" })));
    await expect(revokeInvite(INVITE, REASON)).resolves.toEqual({
      kind: "failed",
      message: "The console could not be reached. Try again.",
    });
  });

  it("passes the server's own refusal message through", async () => {
    const message = "That confirmation no longer matches this invite. Try again.";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ ok: false, code: "INVALID_INPUT", message }, 403)));
    await expect(revokeInvite(INVITE, REASON)).resolves.toEqual({ kind: "failed", message });
  });

  it("replaces an unreachable-source refusal with the console's own line, via the shared mapper", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(revokeInvite(INVITE, REASON)).resolves.toEqual({
      kind: "failed",
      message: "The console could not be reached. Try again.",
    });
  });
});
