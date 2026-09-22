import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock's factory is hoisted above this file's own top-level consts, so a factory that closes
// over a plain `const startAuthentication = vi.fn()` reads it before it is initialized. vi.hoisted
// gives the mocks a binding that is itself hoisted ahead of the mock registration. Same note as
// tests/unit/console/keys/ceremony.test.ts and tests/unit/console/keys/webauthn.test.ts.
const { startAuthentication, startRegistration, browserSupportsWebAuthn } = vi.hoisted(() => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
  browserSupportsWebAuthn: vi.fn(() => true),
}));
vi.mock("@simplewebauthn/browser", () => ({ startAuthentication, startRegistration, browserSupportsWebAuthn }));

import { addKey, keysUsable, tapToSignIn } from "@/console/keys/client";

function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  startAuthentication.mockReset().mockResolvedValue({ id: "Y3JlZA" });
  startRegistration.mockReset().mockResolvedValue({ id: "bmV3" });
  browserSupportsWebAuthn.mockReset().mockReturnValue(true);
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

  it("shows the console's own didn't-answer line for any other browser failure, never the browser's own text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ ok: true, step: "tap", options: {} })));
    startAuthentication.mockRejectedValue(Object.assign(new Error("The operation either timed out or was not allowed."), { name: "UnknownError" }));
    await expect(tapToSignIn()).resolves.toEqual({ kind: "failed", message: "That key didn't answer. Try again." });
  });

  it("passes the server's own message through", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ ok: false, code: "INVALID_INPUT", message: "This key isn't one of yours." }, 400)));
    await expect(tapToSignIn()).resolves.toEqual({ kind: "failed", message: "This key isn't one of yours." });
  });

  it("shows the console's own unreachable line when the network itself fails, not the fetch error's own text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(tapToSignIn()).resolves.toEqual({ kind: "failed", message: "The console could not be reached. Try again." });
  });

  it("shows the same unreachable line when the server answers with something that isn't JSON, not a parser's own text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>502 Bad Gateway</html>", { status: 502, headers: { "content-type": "text/html" } })));
    await expect(tapToSignIn()).resolves.toEqual({ kind: "failed", message: "The console could not be reached. Try again." });
  });
});

describe("keysUsable", () => {
  it("says the browser can run a ceremony once WebAuthn is supported", () => {
    vi.stubGlobal("window", {});
    browserSupportsWebAuthn.mockReturnValue(true);
    expect(keysUsable()).toBe(true);
  });

  it("says it cannot when the browser has no WebAuthn support", () => {
    vi.stubGlobal("window", {});
    browserSupportsWebAuthn.mockReturnValue(false);
    expect(keysUsable()).toBe(false);
  });
});

describe("addKey", () => {
  it("registers straight away when the server asks for no tap", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(answer({ ok: true, step: "register", options: { challenge: "r" } }))
      .mockResolvedValueOnce(answer({ ok: true, keyCount: 1, activated: false, next: null }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(addKey("Blue key", "securityKey")).resolves.toEqual({ kind: "done", keyCount: 1, activated: false });
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
    await expect(addKey("iPhone", "securityKey")).resolves.toEqual({ kind: "done", keyCount: 2, activated: true });
    expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: "t" } });
    expect(startRegistration).toHaveBeenCalledWith({ optionsJSON: { challenge: "r" } });
  });

  it("tells the options route which kind the member chose", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(answer({ ok: true, step: "register", options: { challenge: "r" } }))
      .mockResolvedValueOnce(answer({ ok: true, keyCount: 1, activated: false, next: null }));
    vi.stubGlobal("fetch", fetchSpy);
    await addKey("MacBook Pro", "thisDevice");
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toEqual({ intent: "add_key", kind: "thisDevice" });
  });

  // Every key after the first is registered with the options the *tap* route mints, not the
  // options route's -- so a kind sent only to the first of the two would be dropped on exactly the
  // path the defect was reported on (an owner who already holds one key).
  it("tells the tap route too, which is what mints the options for every key after the first", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(answer({ ok: true, step: "tap", options: { challenge: "t" } }))
      .mockResolvedValueOnce(answer({ ok: true, step: "register", options: { challenge: "r" } }))
      .mockResolvedValueOnce(answer({ ok: true, keyCount: 2, activated: true, next: "/" }));
    vi.stubGlobal("fetch", fetchSpy);
    await addKey("YubiKey 5 NFC", "securityKey");
    expect(JSON.parse(String(fetchSpy.mock.calls[1]?.[1]?.body))).toEqual({
      intent: "add_key",
      step: "tap",
      kind: "securityKey",
      response: { id: "Y3JlZA" },
    });
  });

  // The register step names the key and hands over the attestation; the type the row stores is
  // read off that attestation on the server. Sending the kind here as well would offer the server
  // a second, client-chosen answer to a question only the credential can answer.
  it("does not send the kind again when the new key is recorded", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(answer({ ok: true, step: "register", options: { challenge: "r" } }))
      .mockResolvedValueOnce(answer({ ok: true, keyCount: 1, activated: false, next: null }));
    vi.stubGlobal("fetch", fetchSpy);
    await addKey("Blue key", "securityKey");
    expect(JSON.parse(String(fetchSpy.mock.calls[1]?.[1]?.body))).toEqual({
      intent: "add_key",
      step: "register",
      name: "Blue key",
      response: { id: "bmV3" },
    });
  });

  it("surfaces the same-key refusal as the sheet words it", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(answer({ ok: true, step: "register", options: {} }))
      .mockResolvedValueOnce(answer({ ok: false, code: "INVALID_INPUT", message: "That key is already added. Use a different one." }, 409));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(addKey("Blue key", "securityKey")).resolves.toEqual({ kind: "failed", message: "That key is already added. Use a different one." });
  });

  // excludeCredentials makes the browser itself refuse a duplicate credential before any request
  // reaches the server, so this is the one browser failure that gets the sheet's own line rather
  // than "didn't answer" -- @simplewebauthn/browser wraps the DOMException, keeping its name
  // ("InvalidStateError") and adding a code ("ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED"); either
  // one surfacing must map the same way.
  it("maps the browser's own duplicate-credential refusal to the sheet's already-added line, not its own text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ ok: true, step: "register", options: {} })));
    startRegistration.mockRejectedValue(Object.assign(new Error("The authenticator was previously registered"), { name: "InvalidStateError", code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" }));
    await expect(addKey("YubiKey 5C again", "securityKey")).resolves.toEqual({ kind: "failed", message: "That key is already added. Use a different one." });
  });

  it("still recognises a bare InvalidStateError with no wrapper code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ ok: true, step: "register", options: {} })));
    startRegistration.mockRejectedValue(Object.assign(new Error("previously registered"), { name: "InvalidStateError" }));
    await expect(addKey("YubiKey 5C again", "securityKey")).resolves.toEqual({ kind: "failed", message: "That key is already added. Use a different one." });
  });

  it("still recognises the wrapper's own code even if its name were ever something else", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ ok: true, step: "register", options: {} })));
    startRegistration.mockRejectedValue(Object.assign(new Error("The authenticator was previously registered"), { name: "SomeOtherName", code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" }));
    await expect(addKey("YubiKey 5C again", "securityKey")).resolves.toEqual({ kind: "failed", message: "That key is already added. Use a different one." });
  });

  it("falls back to the console's own didn't-answer line for any other browser failure during registration", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ ok: true, step: "register", options: {} })));
    startRegistration.mockRejectedValue(Object.assign(new Error("The authenticator was unable to process the specified options."), { name: "UnknownError" }));
    await expect(addKey("YubiKey 5C", "securityKey")).resolves.toEqual({ kind: "failed", message: "That key didn't answer. Try again." });
  });
});
