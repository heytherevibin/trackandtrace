import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Cached values are sealed with AES-256-GCM. The Redis key is the associated data,
// so a value copied under another key fails to open. Anything that fails to open is a miss.

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function seal(key: Buffer, aad: string, plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), body.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}

export function open(key: Buffer, aad: string, sealed: string): string | null {
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  const [, ivText, bodyText, tagText] = parts;
  const iv = Buffer.from(ivText, "base64url");
  const tag = Buffer.from(tagText, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || bodyText.length === 0) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(bodyText, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
