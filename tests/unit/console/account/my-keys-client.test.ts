import { afterEach, describe, expect, it, vi } from "vitest";

// Browser-side fetch wrappers: stub global fetch and assert on the spy directly, the same way
// tests/unit/console/keys/client.test.ts exercises addKey/tapToSignIn -- apiRequest itself already
// has its own tests, so these only cover what fetchMyKeys/renameKey add on top of it.
import { fetchMyKeys, removeKey, renameKey } from "@/console/account/my-keys-client";

function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const RESPONSE_BODY = {
  ok: true,
  keys: [{ id: "aaaaaaaa-0000-0000-0000-000000000001", name: "YubiKey 5C", type: "security_key", createdAt: "2026-09-02T10:00:00Z", lastUsedAt: null }],
  member: { name: "Asha Rao", email: "asha@trakline.in", role: "owner", createdAt: "2026-09-02T09:00:00Z" },
};

afterEach(() => vi.unstubAllGlobals());

describe("fetchMyKeys", () => {
  it("returns the keys and profile the route reports", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(answer(RESPONSE_BODY));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(fetchMyKeys()).resolves.toEqual({ keys: RESPONSE_BODY.keys, member: RESPONSE_BODY.member });
    expect(fetchSpy).toHaveBeenCalledWith("/api/keys/mine", expect.objectContaining({ method: "GET" }));
  });

  it("returns null rather than throw when the route refuses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ ok: false, code: "UNAUTHENTICATED", message: "Your session ended. Sign in again." }, 401)));
    await expect(fetchMyKeys()).resolves.toBeNull();
  });

  it("returns null when the network itself fails, rather than throw", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(fetchMyKeys()).resolves.toBeNull();
  });
});

describe("renameKey", () => {
  it("sends the key id and the trimmed name to PATCH /api/keys/mine", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(answer({ ok: true }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(renameKey("aaaaaaaa-0000-0000-0000-000000000001", "MacBook Air")).resolves.toEqual({ kind: "done" });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/keys/mine");
    expect(init).toMatchObject({ method: "PATCH" });
    expect(JSON.parse(String(init.body))).toEqual({ keyId: "aaaaaaaa-0000-0000-0000-000000000001", name: "MacBook Air" });
  });

  it("passes the server's own refusal message through", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ ok: false, code: "INVALID_INPUT", message: "You don't have access to this." }, 403)));
    await expect(renameKey("aaaaaaaa-0000-0000-0000-000000000001", "Not mine")).resolves.toEqual({ kind: "failed", message: "You don't have access to this." });
  });

  it("replaces an unreachable-source refusal with the console's own line, via the shared mapper", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(renameKey("aaaaaaaa-0000-0000-0000-000000000001", "MacBook Air")).resolves.toEqual({
      kind: "failed",
      message: "The console could not be reached. Try again.",
    });
  });
});

describe("removeKey", () => {
  it("sends the key id and the reason, exactly as typed, to DELETE /api/keys/mine", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(answer({ ok: true }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(removeKey("aaaaaaaa-0000-0000-0000-000000000001", "Left at the old office; replaced.")).resolves.toEqual({ kind: "done" });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/keys/mine");
    expect(init).toMatchObject({ method: "DELETE" });
    expect(JSON.parse(String(init.body))).toEqual({ keyId: "aaaaaaaa-0000-0000-0000-000000000001", reason: "Left at the old office; replaced." });
  });

  it("passes the server's own refusal message through, such as the two-key floor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(answer({ ok: false, code: "INVALID_INPUT", message: "You need at least two keys. Add another before removing one." }, 403)),
    );
    await expect(removeKey("aaaaaaaa-0000-0000-0000-000000000001", "Trying anyway.")).resolves.toEqual({
      kind: "failed",
      message: "You need at least two keys. Add another before removing one.",
    });
  });

  it("replaces an unreachable-source refusal with the console's own line, via the shared mapper", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(removeKey("aaaaaaaa-0000-0000-0000-000000000001", "Left at the old office; replaced.")).resolves.toEqual({
      kind: "failed",
      message: "The console could not be reached. Try again.",
    });
  });
});
