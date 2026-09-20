/**
 * The database stores credential ids and public keys as `bytea` and hands them back with
 * `encode(..., 'base64')` -- standard base64, with `+`, `/` and padding. WebAuthn and
 * @simplewebauthn speak base64url. This module is the only place the two meet.
 */

export function base64ToBase64url(value: string): string {
  return value.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function base64urlToBase64(value: string): string {
  const standard = value.replaceAll("-", "+").replaceAll("_", "/");
  return standard.padEnd(standard.length + ((4 - (standard.length % 4)) % 4), "=");
}

/** PostgREST takes a `bytea` argument as a hex literal: `\x00ff`. */
export function base64urlToByteaLiteral(value: string): string {
  return `\\x${Buffer.from(base64urlToBase64(value), "base64").toString("hex")}`;
}

// Uint8Array<ArrayBuffer>, not the bare (and broader) Uint8Array<ArrayBufferLike>: @simplewebauthn's
// WebAuthnCredential.publicKey is typed Uint8Array<ArrayBuffer>, and `new Uint8Array(aBuffer)` widens
// to ArrayBufferLike (it could in principle be backed by a SharedArrayBuffer). `Uint8Array.from` always
// allocates a fresh plain ArrayBuffer, so it is typed Uint8Array<ArrayBuffer> unconditionally.
export function base64urlToBytes(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(Buffer.from(base64urlToBase64(value), "base64"));
}

export function bytesToBase64url(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}
