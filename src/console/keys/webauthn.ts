import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";
import { base64urlToBytes, bytesToBase64url } from "./encoding";
import type { RelyingParty } from "./rp";

export type ConsoleKeyType = "passkey" | "security_key";

/** A key as this codebase holds it: every binary field base64url, never base64, never bytes. */
export interface StoredKey {
  readonly id: string;
  readonly credentialId: string;
  readonly publicKey: string;
  readonly counter: number;
  readonly transports: readonly string[];
}

function didNotAnswer(): AppError {
  // One message for every way a ceremony can fail, so nothing about the failure is legible from
  // outside: a wrong origin, a stale challenge and a bad signature all read the same.
  return new AppError("INVALID_INPUT", consoleMessages.keys.didNotAnswer, { status: 400 });
}

export function registrationOptionsFor(args: {
  readonly rp: RelyingParty;
  readonly member: { readonly userId: string; readonly email: string; readonly name: string };
  readonly existing: readonly StoredKey[];
}): Promise<PublicKeyCredentialCreationOptionsJSON> {
  return generateRegistrationOptions({
    rpName: args.rp.name,
    rpID: args.rp.id,
    userName: args.member.email,
    userDisplayName: args.member.name,
    userID: new TextEncoder().encode(args.member.userId),
    attestationType: "none",
    // Spec §D: resident keys are discouraged (the email link has already said who is signing in,
    // and a security key's slots are few); user verification is preferred, so a touch is enough.
    authenticatorSelection: { residentKey: "discouraged", userVerification: "preferred" },
    excludeCredentials: args.existing.map((key) => ({ id: key.credentialId, transports: [...key.transports] })),
  });
}

export async function verifyRegistration(args: {
  readonly rp: RelyingParty;
  readonly response: RegistrationResponseJSON;
  readonly expectedChallenge: string;
}): Promise<{
  readonly credentialId: string;
  readonly publicKey: string;
  readonly counter: number;
  readonly transports: readonly string[];
  readonly keyType: ConsoleKeyType;
}> {
  let result;
  try {
    result = await verifyRegistrationResponse({
      response: args.response,
      expectedChallenge: args.expectedChallenge,
      expectedOrigin: args.rp.origin,
      expectedRPID: args.rp.id,
      // The options asked for 'preferred', so demanding verification here would refuse a key that
      // did exactly what it was asked to do. The library defaults this to true.
      requireUserVerification: false,
    });
  } catch {
    throw didNotAnswer();
  }
  if (!result.verified) throw didNotAnswer();
  const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;
  return {
    credentialId: credential.id,
    publicKey: bytesToBase64url(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? [],
    // Spec §D: "Passkey" for a synced or platform credential, "Security key" otherwise.
    keyType: credentialDeviceType === "multiDevice" || credentialBackedUp ? "passkey" : "security_key",
  };
}

export function authenticationOptionsFor(args: {
  readonly rp: RelyingParty;
  readonly allow: readonly StoredKey[];
}): Promise<PublicKeyCredentialRequestOptionsJSON> {
  return generateAuthenticationOptions({
    rpID: args.rp.id,
    allowCredentials: args.allow.map((key) => ({ id: key.credentialId, transports: [...key.transports] })),
    userVerification: "preferred",
  });
}

export async function verifyAuthentication(args: {
  readonly rp: RelyingParty;
  readonly response: AuthenticationResponseJSON;
  readonly expectedChallenge: string;
  readonly key: StoredKey;
}): Promise<{ readonly credentialId: string; readonly newCounter: number }> {
  let result;
  try {
    result = await verifyAuthenticationResponse({
      response: args.response,
      expectedChallenge: args.expectedChallenge,
      expectedOrigin: args.rp.origin,
      expectedRPID: args.rp.id,
      credential: {
        id: args.key.credentialId,
        publicKey: base64urlToBytes(args.key.publicKey),
        counter: args.key.counter,
        transports: [...args.key.transports],
      },
      requireUserVerification: false,
    });
  } catch {
    throw didNotAnswer();
  }
  if (!result.verified) throw didNotAnswer();
  return { credentialId: result.authenticationInfo.credentialID, newCounter: result.authenticationInfo.newCounter };
}
