/**
 * The database stores credential ids and public keys as `bytea` and hands them back with
 * `encode(..., 'base64')` -- standard base64, with `+`, `/`, padding **and a newline every 76
 * characters**. WebAuthn and @simplewebauthn speak base64url. This module is the only place the
 * two meet.
 */

export function base64ToBase64url(value: string): string {
  // The wrapping is the whole reason this strips whitespace. Postgres's encode() follows MIME and
  // breaks its output every 76 characters; this file's own comment used to describe the format
  // without that, and the code matched the comment rather than the database.
  //
  // It stayed invisible because the two paths out of here disagree about whitespace. A public key
  // goes through base64urlToBytes -> Buffer.from(value, "base64"), and Node silently ignores
  // characters that are not base64, newlines included -- so every wrapped key decoded correctly. A
  // credential id is handed to @simplewebauthn as a *string*, and generateAuthenticationOptions
  // validates it with isoBase64URL.isBase64URL(), which does not forgive a newline: it throws, the
  // route answers INTERNAL, and the member reads "The console could not be reached."
  //
  // So the bug needed a credential id longer than 76 base64 characters to appear at all. A platform
  // passkey's is short and never wrapped; a security key's is long and always does. It shipped, and
  // was found on the console's first production sign-in offering a YubiKey -- the first time any
  // member held a key whose id crossed that line.
  return value.replace(/\s+/g, "").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
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
