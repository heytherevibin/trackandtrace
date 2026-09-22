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
import type { ConsoleKeyKind } from "./kind";
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

/**
 * The console's two kinds in the library's own three-value vocabulary. 'securityKey' sets
 * `hints: ['security-key']` *and* `authenticatorSelection.authenticatorAttachment: 'cross-platform'`;
 * 'localDevice' sets `hints: ['client-device']` and `'platform'`
 * (@simplewebauthn/server/esm/registration/generateRegistrationOptions.js). The attachment is the
 * half that matters: `hints` is WebAuthn L3 and a browser may ignore it, while attachment has been
 * honoured for years and is what moves Safari off its iCloud Keychain sheet. The library's third
 * value, 'remoteDevice' (a passkey on another device, over hybrid), is reachable from
 * 'securityKey''s own cross-platform sheet and so is not offered as a kind of its own.
 */
const PREFERRED_AUTHENTICATOR: Readonly<Record<ConsoleKeyKind, "securityKey" | "localDevice">> = {
  securityKey: "securityKey",
  thisDevice: "localDevice",
};

export function registrationOptionsFor(args: {
  readonly rp: RelyingParty;
  readonly member: { readonly userId: string; readonly email: string; readonly name: string };
  readonly existing: readonly StoredKey[];
  /**
   * What the member said they are about to present. It decides which browser sheet opens and
   * nothing else -- in particular it never decides the type the row stores, which verifyRegistration
   * below reads off the credential that actually answered.
   */
  readonly kind: ConsoleKeyKind;
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
    // Built fresh on every call, never hoisted to a shared literal: generateRegistrationOptions
    // writes authenticatorAttachment onto this very object, so a shared one would carry one
    // member's chosen kind into the next member's ceremony.
    authenticatorSelection: { residentKey: "discouraged", userVerification: "preferred" },
    preferredAuthenticatorType: PREFERRED_AUTHENTICATOR[args.kind],
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
