import { describe, expect, it } from "vitest";
import { base64ToBase64url, base64urlToBase64, base64urlToByteaLiteral } from "@/console/keys/encoding";

describe("the encodings either side of the database", () => {
  it("turns the standard base64 the database returns into the base64url WebAuthn speaks", () => {
    // +, / and padding are exactly what a credential id trips over.
    expect(base64ToBase64url("a+b/c9==")).toBe("a-b_c9");
    expect(base64ToBase64url("AAAA")).toBe("AAAA");
  });

  it("turns it back, padding restored", () => {
    expect(base64urlToBase64("a-b_c9")).toBe("a+b/c9==");
    expect(base64urlToBase64("AAAA")).toBe("AAAA");
  });

  // Verified against the database rather than assumed:
  //   select encode(decode(repeat('ab',60),'hex'),'base64');
  // answers 76 characters, a newline, then the rest. Every fixture below wraps the way that does.
  const wrap = (base64: string): string => (base64.match(/.{1,76}/g) ?? []).join("\n");

  it("strips the newlines encode() wraps its output with", () => {
    // A security key's credential id is long enough to wrap; a platform passkey's is not, which is
    // why this shipped and was only found on the first production sign-in that offered a YubiKey.
    const id = Buffer.from(Array.from({ length: 64 }, (_, i) => i * 3)).toString("base64");
    expect(id.length).toBeGreaterThan(76);
    const wrapped = wrap(id);
    expect(wrapped).toContain("\n");
    expect(base64ToBase64url(wrapped)).toBe(base64ToBase64url(id));
    expect(base64ToBase64url(wrapped)).not.toMatch(/\s/);
  });

  it("round-trips every byte value, wrapped as the database wraps it", () => {
    const all = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
    // The old fixture was `all.toString("base64")`, which Node does not wrap -- a format the
    // source of this data never produces. That is precisely why the suite stayed green while
    // production could not build an allowCredentials entry.
    expect(base64urlToBase64(base64ToBase64url(wrap(all.toString("base64"))))).toBe(all.toString("base64"));
  });

  it("writes a bytea literal PostgREST will take", () => {
    expect(base64urlToByteaLiteral(Buffer.from([0x00, 0x1f, 0xff]).toString("base64url"))).toBe("\\x001fff");
  });
});
