import { createHmac, hkdfSync } from "node:crypto";

// DATA_KEY → three independent 32-byte subkeys (HKDF-SHA256). Rotating DATA_KEY
// empties the shared cache and resets limit windows; nothing else depends on it.

export interface DataKeys {
  /** HMAC key that turns a PNR into its cache key. */
  readonly cacheName: Buffer;
  /** AES-256-GCM key for cached values. */
  readonly cacheValue: Buffer;
  /** HMAC key that turns a client address or user id into a limiter identifier. */
  readonly clientId: Buffer;
}

const SALT = "trakline/data-key/v1";

function subkey(ikm: Buffer, info: string): Buffer {
  return Buffer.from(hkdfSync("sha256", ikm, SALT, info, 32));
}

export function deriveDataKeys(dataKey: string): DataKeys {
  const ikm = Buffer.from(dataKey, "base64");
  if (ikm.length !== 32) throw new Error("DATA_KEY must decode to 32 bytes.");
  return { cacheName: subkey(ikm, "cache-name"), cacheValue: subkey(ikm, "cache-value"), clientId: subkey(ikm, "client-id") };
}

/** base64url(HMAC-SHA256(key, value)): stable, one-way, and useless without DATA_KEY. */
export function keyedHash(key: Buffer, value: string): string {
  return createHmac("sha256", key).update(value).digest("base64url");
}
