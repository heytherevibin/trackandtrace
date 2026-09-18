import { describe, expect, it } from "vitest";
import { open, seal } from "@/services/cache-cipher";

const KEY = Buffer.alloc(32, 1);
const OTHER = Buffer.alloc(32, 2);
const AAD = "tt:test:pnr:v1:abc";
const TEXT = JSON.stringify({ ok: true, pnr: "2345678901" });

describe("seal and open", () => {
  it("round-trips, and the sealed form hides the plaintext", () => {
    const sealed = seal(KEY, AAD, TEXT);
    expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(sealed).not.toContain("2345678901");
    expect(open(KEY, AAD, sealed)).toBe(TEXT);
  });

  it("uses a fresh nonce every time", () => {
    expect(seal(KEY, AAD, TEXT)).not.toBe(seal(KEY, AAD, TEXT));
  });

  it("refuses the wrong key, a value moved to another key, and any tampering", () => {
    const sealed = seal(KEY, AAD, TEXT);
    const [v, iv, body, tag] = sealed.split(".");
    const flipped = `${body.slice(0, -2)}${body.at(-2) === "A" ? "B" : "A"}${body.at(-1)}`;
    expect(open(OTHER, AAD, sealed)).toBeNull();
    expect(open(KEY, "tt:test:pnr:v1:other", sealed)).toBeNull();
    expect(open(KEY, AAD, [v, iv, flipped, tag].join("."))).toBeNull();
    expect(open(KEY, AAD, [v, iv, body, tag.slice(0, 8)].join("."))).toBeNull();
  });

  it("refuses another version or a malformed value", () => {
    const sealed = seal(KEY, AAD, TEXT);
    expect(open(KEY, AAD, sealed.replace(/^v1\./, "v2."))).toBeNull();
    expect(open(KEY, AAD, "v1.only-two")).toBeNull();
    expect(open(KEY, AAD, `${sealed}.extra`)).toBeNull();
    expect(open(KEY, AAD, "")).toBeNull();
  });
});
