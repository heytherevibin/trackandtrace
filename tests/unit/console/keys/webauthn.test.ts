import { beforeEach, describe, expect, it, vi } from "vitest";

// Typed, not inferred: a bare `vi.fn(() => …)` infers a zero-argument signature, so
// `generateRegistrationOptions.mock.calls[0]?.[0]` further down is an index into a zero-length
// tuple and `tsc --noEmit` refuses it (TS2493) even though vitest runs it happily.
// `vi.fn<Signature>()` is this repo's convention wherever a test reads a mock's arguments.
//
// vi.hoisted, not a plain top-level const: vi.mock's factory is itself hoisted above every
// import -- and above any ordinary `const` in this file -- so a factory that closes over a plain
// `const` throws "Cannot access '...' before initialization". Same note in
// tests/unit/console/auth/sign-in-link.test.ts.
const { generateRegistrationOptions, generateAuthenticationOptions, verifyRegistrationResponse, verifyAuthenticationResponse } = vi.hoisted(() => ({
  generateRegistrationOptions: vi.fn<(options: Record<string, unknown>) => Promise<Record<string, unknown>>>(() =>
    Promise.resolve({ challenge: "reg-challenge", rp: { id: "admin.localhost" } }),
  ),
  generateAuthenticationOptions: vi.fn<(options: Record<string, unknown>) => Promise<Record<string, unknown>>>(() =>
    Promise.resolve({ challenge: "auth-challenge", rpId: "admin.localhost" }),
  ),
  verifyRegistrationResponse: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}));

vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions,
  generateAuthenticationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
}));

import { registrationOptionsFor, verifyAuthentication, verifyRegistration } from "@/console/keys/webauthn";

const RP = { id: "admin.localhost", origin: "http://admin.localhost:4210", name: "Trakline Console" };
const STORED = { id: "key-row-id", credentialId: "Y3JlZA", publicKey: "cHVia2V5", counter: 7, transports: ["usb"] };

beforeEach(() => {
  generateRegistrationOptions.mockClear();
  generateAuthenticationOptions.mockClear();
  verifyRegistrationResponse.mockReset();
  verifyAuthenticationResponse.mockReset();
});

describe("registrationOptionsFor", () => {
  it("asks for no attestation, discourages resident keys and only prefers verification", async () => {
    await registrationOptionsFor({ rp: RP, member: { email: "asha@trakline.in", name: "Asha Rao", userId: "11111111-1111-1111-1111-111111111111" }, existing: [] });
    expect(generateRegistrationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        rpID: "admin.localhost",
        attestationType: "none",
        authenticatorSelection: { residentKey: "discouraged", userVerification: "preferred" },
      }),
    );
  });

  it("excludes the keys the member already has, so the same key is refused by the browser", async () => {
    await registrationOptionsFor({ rp: RP, member: { email: "a@b.in", name: "A", userId: "11111111-1111-1111-1111-111111111111" }, existing: [STORED] });
    expect(generateRegistrationOptions.mock.calls[0]?.[0]).toMatchObject({ excludeCredentials: [{ id: "Y3JlZA", transports: ["usb"] }] });
  });
});

describe("verifyRegistration", () => {
  it("returns what the row needs, with a synced credential recorded as a passkey", async () => {
    verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: { id: "Y3JlZA", publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ["internal", "hybrid"] },
        credentialDeviceType: "multiDevice",
        credentialBackedUp: true,
      },
    });
    await expect(
      verifyRegistration({ rp: RP, response: { id: "Y3JlZA" } as never, expectedChallenge: "reg-challenge" }),
    ).resolves.toMatchObject({ credentialId: "Y3JlZA", counter: 0, keyType: "passkey", transports: ["internal", "hybrid"] });
  });

  it("records a single-device credential as a security key", async () => {
    verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: { credential: { id: "Y3JlZA", publicKey: new Uint8Array([1]), counter: 0 }, credentialDeviceType: "singleDevice", credentialBackedUp: false },
    });
    await expect(verifyRegistration({ rp: RP, response: { id: "Y3JlZA" } as never, expectedChallenge: "c" })).resolves.toMatchObject({ keyType: "security_key", transports: [] });
  });

  it("checks the origin and the RP id exactly, and does not demand user verification", async () => {
    verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: { credential: { id: "Y3JlZA", publicKey: new Uint8Array([1]), counter: 0 }, credentialDeviceType: "singleDevice", credentialBackedUp: false },
    });
    await verifyRegistration({ rp: RP, response: { id: "Y3JlZA" } as never, expectedChallenge: "c" });
    expect(verifyRegistrationResponse).toHaveBeenCalledWith(
      expect.objectContaining({ expectedOrigin: "http://admin.localhost:4210", expectedRPID: "admin.localhost", requireUserVerification: false }),
    );
  });

  it("throws when it does not verify", async () => {
    verifyRegistrationResponse.mockResolvedValue({ verified: false });
    await expect(verifyRegistration({ rp: RP, response: { id: "x" } as never, expectedChallenge: "c" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("throws rather than leaking the library's own message", async () => {
    verifyRegistrationResponse.mockRejectedValue(new Error("Unexpected registration response origin"));
    await expect(verifyRegistration({ rp: RP, response: { id: "x" } as never, expectedChallenge: "c" })).rejects.toMatchObject({
      message: "That key didn't answer. Try again.",
    });
  });
});

describe("verifyAuthentication", () => {
  it("hands the library the stored key as it holds it, in base64url", async () => {
    verifyAuthenticationResponse.mockResolvedValue({ verified: true, authenticationInfo: { credentialID: "Y3JlZA", newCounter: 8 } });
    await expect(verifyAuthentication({ rp: RP, response: { id: "Y3JlZA" } as never, expectedChallenge: "auth-challenge", key: STORED })).resolves.toEqual({
      credentialId: "Y3JlZA",
      newCounter: 8,
    });
    expect(verifyAuthenticationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        credential: { id: "Y3JlZA", publicKey: expect.any(Uint8Array), counter: 7, transports: ["usb"] },
        requireUserVerification: false,
      }),
    );
  });

  it("throws when it does not verify", async () => {
    verifyAuthenticationResponse.mockResolvedValue({ verified: false, authenticationInfo: { credentialID: "Y3JlZA", newCounter: 8 } });
    await expect(verifyAuthentication({ rp: RP, response: { id: "Y3JlZA" } as never, expectedChallenge: "c", key: STORED })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});
