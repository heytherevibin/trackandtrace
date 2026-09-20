import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock's factory is hoisted above this file's own top-level consts, so a factory that closes
// over a plain `const startAuthentication = vi.fn()` reads it before it is initialized. vi.hoisted
// gives the mocks a binding that is itself hoisted ahead of the mock registration. Same note as
// tests/unit/console/keys/ceremony.test.ts and tests/unit/console/keys/webauthn.test.ts.
const { startAuthentication, startRegistration } = vi.hoisted(() => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}));
vi.mock("@simplewebauthn/browser", () => ({ startAuthentication, startRegistration, browserSupportsWebAuthn: () => true }));

import { addKey, tapToSignIn } from "@/console/keys/client";

function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  startAuthentication.mockReset().mockResolvedValue({ id: "Y3JlZA" });
  startRegistration.mockReset().mockResolvedValue({ id: "bmV3" });
});

afterEach(() => vi.unstubAllGlobals());

describe("tapToSignIn", () => {
  it("asks for options, runs the ceremony and posts the result", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(answer({ ok: true, step: "tap", options: { challenge: "c" } }))
      .mockResolvedValueOnce(answer({ ok: true, next: "/" }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(tapToSignIn()).resolves.toEqual({ kind: "done" });
    expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: "c" } });
    expect(JSON.parse(String(fetchSpy.mock.calls[1]?.[1]?.body))).toEqual({ intent: "sign_in", response: { id: "Y3JlZA" } });
  });

  it("reports a dismissed prompt as cancelled, not as a failure worth a line", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ ok: true, step: "tap", options: {} })));
    startAuthentication.mockRejectedValue(Object.assign(new Error("cancelled"), { name: "NotAllowedError" }));
    await expect(tapToSignIn()).resolves.toEqual({ kind: "cancelled" });
  });

  it("passes the server's own message through", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ ok: false, code: "INVALID_INPUT", message: "This key isn't one of yours." }, 400)));
    await expect(tapToSignIn()).resolves.toEqual({ kind: "failed", message: "This key isn't one of yours." });
  });
});

describe("addKey", () => {
  it("registers straight away when the server asks for no tap", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(answer({ ok: true, step: "register", options: { challenge: "r" } }))
      .mockResolvedValueOnce(answer({ ok: true, keyCount: 1, activated: false, next: null }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(addKey("Blue key")).resolves.toEqual({ kind: "done", keyCount: 1, activated: false });
    expect(startRegistration).toHaveBeenCalledOnce();
    expect(startAuthentication).not.toHaveBeenCalled();
  });

  it("taps first when the server asks for one, and registers with what that returns", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(answer({ ok: true, step: "tap", options: { challenge: "t" } }))
      .mockResolvedValueOnce(answer({ ok: true, step: "register", options: { challenge: "r" } }))
      .mockResolvedValueOnce(answer({ ok: true, keyCount: 2, activated: true, next: "/" }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(addKey("iPhone")).resolves.toEqual({ kind: "done", keyCount: 2, activated: true });
    expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: "t" } });
    expect(startRegistration).toHaveBeenCalledWith({ optionsJSON: { challenge: "r" } });
  });

  it("surfaces the same-key refusal as the sheet words it", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(answer({ ok: true, step: "register", options: {} }))
      .mockResolvedValueOnce(answer({ ok: false, code: "INVALID_INPUT", message: "That key is already added. Use a different one." }, 409));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(addKey("Blue key")).resolves.toEqual({ kind: "failed", message: "That key is already added. Use a different one." });
  });
});
