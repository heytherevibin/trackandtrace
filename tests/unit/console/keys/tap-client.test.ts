import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock's factory is hoisted above this file's own top-level consts, so a factory that closes
// over a plain `const startAuthentication = vi.fn()` reads it before it is initialized. vi.hoisted
// gives the mock a binding that is itself hoisted ahead of the mock registration. Same note as
// tests/unit/console/keys/client.test.ts.
const { startAuthentication } = vi.hoisted(() => ({ startAuthentication: vi.fn() }));
vi.mock("@simplewebauthn/browser", () => ({ startAuthentication }));

import { runTap } from "@/console/keys/tap-client";

const tap = { action: "Removed a key", target: "YubiKey 5 NFC", value: "1", reason: "Left at the old office; replaced." };

function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  startAuthentication.mockReset().mockResolvedValue({ id: "Y3JlZA" });
});

afterEach(() => vi.unstubAllGlobals());

describe("runTap", () => {
  it("posts the four fields verbatim to /api/tap/options, then the ceremony response to /api/tap/verify", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(answer({ ok: true, options: { challenge: "c" } }))
      .mockResolvedValueOnce(answer({ ok: true }));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(runTap(tap)).resolves.toEqual({ kind: "done" });

    expect(fetchSpy.mock.calls[0]?.[0]).toBe("/api/tap/options");
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toEqual(tap);
    expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: "c" } });
    expect(fetchSpy.mock.calls[1]?.[0]).toBe("/api/tap/verify");
    expect(JSON.parse(String(fetchSpy.mock.calls[1]?.[1]?.body))).toEqual({ response: { id: "Y3JlZA" } });
  });

  it("reports a dismissed prompt as cancelled, not as a failure worth a line", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ ok: true, options: {} })));
    startAuthentication.mockRejectedValue(Object.assign(new Error("cancelled"), { name: "NotAllowedError" }));
    await expect(runTap(tap)).resolves.toEqual({ kind: "cancelled" });
  });

  it("also treats an AbortError prompt as cancelled", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ ok: true, options: {} })));
    startAuthentication.mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));
    await expect(runTap(tap)).resolves.toEqual({ kind: "cancelled" });
  });

  it("shows the console's own didn't-answer line for any other browser failure, never the browser's own text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ ok: true, options: {} })));
    startAuthentication.mockRejectedValue(Object.assign(new Error("The operation either timed out or was not allowed."), { name: "UnknownError" }));
    await expect(runTap(tap)).resolves.toEqual({ kind: "failed", message: "That key didn't answer. Try again." });
  });

  it("passes the server's own refusal message through unchanged", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ ok: false, code: "INVALID_INPUT", message: "This key isn't one of yours." }, 400)));
    await expect(runTap(tap)).resolves.toEqual({ kind: "failed", message: "This key isn't one of yours." });
    expect(startAuthentication).not.toHaveBeenCalled();
  });

  it("shows the console's own unreachable line when the network itself fails, not the fetch error's own text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(runTap(tap)).resolves.toEqual({ kind: "failed", message: "The console could not be reached. Try again." });
  });

  it("shows the same unreachable line when the server answers with something that isn't JSON, not a parser's own text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>502 Bad Gateway</html>", { status: 502, headers: { "content-type": "text/html" } })));
    await expect(runTap(tap)).resolves.toEqual({ kind: "failed", message: "The console could not be reached. Try again." });
  });

  it("never spends or tracks the tap itself -- it only posts the ceremony response to verify", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(answer({ ok: true, options: { challenge: "c" } }))
      .mockResolvedValueOnce(answer({ ok: true }));
    vi.stubGlobal("fetch", fetchSpy);
    await runTap(tap);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const verifyBody = JSON.parse(String(fetchSpy.mock.calls[1]?.[1]?.body)) as Record<string, unknown>;
    expect(Object.keys(verifyBody)).toEqual(["response"]);
  });
});
