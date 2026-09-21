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

  it("round-trips every byte value", () => {
    const all = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
    expect(base64urlToBase64(base64ToBase64url(all.toString("base64")))).toBe(all.toString("base64"));
  });

  it("writes a bytea literal PostgREST will take", () => {
    expect(base64urlToByteaLiteral(Buffer.from([0x00, 0x1f, 0xff]).toString("base64url"))).toBe("\\x001fff");
  });
});
