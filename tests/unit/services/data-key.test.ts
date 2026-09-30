import { describe, expect, it } from "vitest";
import { deriveDataKeys, keyedHash } from "@/services/data-key";

const DATA_KEY = Buffer.alloc(32, 7).toString("base64");

// Read off the returned object rather than listed by hand. Listed, these tests said "three
// distinct subkeys" and went on passing when a fourth was added for 06-A's unsubscribe links —
// covering neither its independence nor its rotation. Whatever `deriveDataKeys` returns is what
// gets checked.
const subkeys = (keys: ReturnType<typeof deriveDataKeys>) => Object.values(keys);

describe("deriveDataKeys", () => {
  it("derives distinct 32-byte subkeys, the same every time", () => {
    const keys = deriveDataKeys(DATA_KEY);
    const all = subkeys(keys);
    expect(all.length).toBeGreaterThanOrEqual(4);
    for (const key of all) expect(key.length).toBe(32);
    expect(new Set(all.map((k) => k.toString("hex"))).size).toBe(all.length);
    expect(deriveDataKeys(DATA_KEY).cacheName.equals(keys.cacheName)).toBe(true);
  });

  it("changes every subkey when DATA_KEY rotates", () => {
    const a = subkeys(deriveDataKeys(DATA_KEY));
    const b = subkeys(deriveDataKeys(Buffer.alloc(32, 8).toString("base64")));
    expect(a.some((key, i) => key.equals(b[i] as Buffer))).toBe(false);
  });

  it("refuses a key that is not 32 bytes", () => {
    expect(() => deriveDataKeys(Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
  });
});

describe("keyedHash", () => {
  it("is stable, url-safe, and hides its input", () => {
    const { clientId } = deriveDataKeys(DATA_KEY);
    const hash = keyedHash(clientId, "pnr:203.0.113.10");
    expect(hash).toBe(keyedHash(clientId, "pnr:203.0.113.10"));
    expect(hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).not.toContain("203.0.113.10");
  });

  it("differs per key", () => {
    const { cacheName, clientId } = deriveDataKeys(DATA_KEY);
    expect(keyedHash(cacheName, "2345678901")).not.toBe(keyedHash(clientId, "2345678901"));
  });
});
